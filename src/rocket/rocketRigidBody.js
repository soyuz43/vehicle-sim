// src/rocket/rocketRigidBody.js

import * as THREE from 'three'

// A minimal six-degree-of-freedom rigid body for the rocket prototype.
//
// This is a PARALLEL solver. It does not replace or patch the vehicle
// solver: the vehicle integrates planar motion (x/z/yaw) plus a gated
// heave/pitch/roll seam, and it has no orientation quaternion, no angular
// rate, and no inertia-tensor torque integration. The rocket needs those,
// so this module owns them.
//
// Documented simplification: the Euler rigid-body term
// omega x (I * omega) is NOT integrated. For a body whose principal axis
// is close to its symmetry axis the term is small. A full gyroscopic term
// is left as a future seam rather than approximated silently.
//
// Frame convention for every body created here:
//   local +Y = body symmetry axis (the rocket's "up", the thrust axis)
//   local +X = body right
//   local +Z = body forward
// The stored position is always the CENTER OF MASS, not the visual origin.

const _scratchForce = new THREE.Vector3()
const _scratchLeverArm = new THREE.Vector3()
const _scratchTorque = new THREE.Vector3()
const _scratchBodyTorque = new THREE.Vector3()
const _scratchBodyAngularAcceleration = new THREE.Vector3()
const _scratchWorldAngularAcceleration = new THREE.Vector3()
const _scratchInverseQuaternion = new THREE.Quaternion()
const _scratchOmegaQuaternion = new THREE.Quaternion()
const _scratchDeltaQuaternion = new THREE.Quaternion()

export function createRocketRigidBody(config = {}) {
  const body = {
    positionMeters: new THREE.Vector3(),
    velocityMetersPerSecond: new THREE.Vector3(),
    orientationQuaternion: new THREE.Quaternion(),
    angularVelocityRadiansPerSecond: new THREE.Vector3(),
    massKg: 1,
    // Diagonal inertia tensor in the BODY frame (kg*m^2).
    inertiaTensorKgMeterSquared: new THREE.Vector3(1, 1, 1),
    forceAccumulatorNewtons: new THREE.Vector3(),
    torqueAccumulatorNewtonMeters: new THREE.Vector3(),
    linearAccelerationMetersPerSecondSquared: new THREE.Vector3(),
    angularAccelerationRadiansPerSecondSquared: new THREE.Vector3(),
    isFinite: true,
  }

  resetRocketRigidBody(body, config)

  return body
}

export function resetRocketRigidBody(body, config = {}) {
  if (!body) return body

  const position = config.positionMeters
  body.positionMeters.set(
    Array.isArray(position) ? position[0] : position?.x ?? 0,
    Array.isArray(position) ? position[1] : position?.y ?? 0,
    Array.isArray(position) ? position[2] : position?.z ?? 0
  )
  body.velocityMetersPerSecond.set(0, 0, 0)
  body.orientationQuaternion.set(0, 0, 0, 1)
  body.angularVelocityRadiansPerSecond.set(0, 0, 0)
  body.massKg = sanitizePositiveNumber(config.massKg, 1)
  body.inertiaTensorKgMeterSquared.set(
    sanitizePositiveNumber(config.inertiaAXKgMeterSquared, 1),
    sanitizePositiveNumber(config.inertiaAYKgMeterSquared, 1),
    sanitizePositiveNumber(config.inertiaAZKgMeterSquared, 1)
  )
  body.forceAccumulatorNewtons.set(0, 0, 0)
  body.torqueAccumulatorNewtonMeters.set(0, 0, 0)
  body.linearAccelerationMetersPerSecondSquared.set(0, 0, 0)
  body.angularAccelerationRadiansPerSecondSquared.set(0, 0, 0)
  body.isFinite = true

  return body
}

export function clearRocketForceAccumulator(body) {
  if (!body) return body

  body.forceAccumulatorNewtons.set(0, 0, 0)
  body.torqueAccumulatorNewtonMeters.set(0, 0, 0)

  return body
}

export function addRocketForce(body, forceNewtons) {
  if (!body || !forceNewtons) return body

  body.forceAccumulatorNewtons.add(forceNewtons)

  return body
}

export function addRocketForceAtPoint(body, forceNewtons, applicationPointWorldMeters) {
  if (!body || !forceNewtons) return body

  body.forceAccumulatorNewtons.add(forceNewtons)

  if (!applicationPointWorldMeters) return body

  // torque = r x F, where r runs from the CENTER OF MASS to the point of
  // application.
  _scratchLeverArm
    .copy(applicationPointWorldMeters)
    .sub(body.positionMeters)
  _scratchTorque.crossVectors(_scratchLeverArm, forceNewtons)
  body.torqueAccumulatorNewtonMeters.add(_scratchTorque)

  return body
}

export function addRocketTorque(body, torqueNewtonMeters) {
  if (!body || !torqueNewtonMeters) return body

  body.torqueAccumulatorNewtonMeters.add(torqueNewtonMeters)

  return body
}

// An impulse changes the velocity immediately, without going through the
// force accumulator. Used by stage separation, where the impulse is a
// discrete event rather than a continuous force.
export function applyRocketImpulse(body, impulseNewtonsSecond, applicationPointWorldMeters) {
  if (!body || !impulseNewtonsSecond) return body

  const inverseMassKg = 1 / body.massKg
  body.velocityMetersPerSecond.addScaledVector(impulseNewtonsSecond, inverseMassKg)

  if (!applicationPointWorldMeters) return body

  _scratchLeverArm.copy(applicationPointWorldMeters).sub(body.positionMeters)
  _scratchTorque.crossVectors(_scratchLeverArm, impulseNewtonsSecond)
  applyRocketAngularImpulseInWorldFrame(body, _scratchTorque)

  return body
}

export function applyRocketAngularImpulseInWorldFrame(body, angularImpulseNewtonMeterSeconds) {
  if (!body || !angularImpulseNewtonMeterSeconds) return body

  // Angular impulse arrives in the world frame; the inverse inertia tensor
  // is diagonal in the BODY frame, so rotate in, scale, rotate out.
  _scratchInverseQuaternion.copy(body.orientationQuaternion).invert()
  _scratchBodyTorque
    .copy(angularImpulseNewtonMeterSeconds)
    .applyQuaternion(_scratchInverseQuaternion)
  _scratchBodyTorque.set(
    _scratchBodyTorque.x / body.inertiaTensorKgMeterSquared.x,
    _scratchBodyTorque.y / body.inertiaTensorKgMeterSquared.y,
    _scratchBodyTorque.z / body.inertiaTensorKgMeterSquared.z
  )
  _scratchWorldAngularAcceleration
    .copy(_scratchBodyTorque)
    .applyQuaternion(body.orientationQuaternion)
  body.angularVelocityRadiansPerSecond.add(_scratchWorldAngularAcceleration)

  return body
}

// Semi-implicit (symplectic) Euler integration of the rigid body.
// The caller supplies a fixed step; the vehicle solver does the same.
export function integrateRocketRigidBody(body, deltaTimeSeconds) {
  if (!body) return body

  const deltaSeconds = sanitizeNonNegativeNumber(deltaTimeSeconds, 0)
  if (deltaSeconds <= 0) {
    body.isFinite = isFiniteBody(body)
    return body
  }

  const inverseMassKg = 1 / body.massKg
  body.linearAccelerationMetersPerSecondSquared
    .copy(body.forceAccumulatorNewtons)
    .multiplyScalar(inverseMassKg)
  body.velocityMetersPerSecond.addScaledVector(
    body.linearAccelerationMetersPerSecondSquared,
    deltaSeconds
  )
  body.positionMeters.addScaledVector(body.velocityMetersPerSecond, deltaSeconds)

  // Torque -> body frame -> divide by the diagonal inertia -> back to world.
  _scratchInverseQuaternion.copy(body.orientationQuaternion).invert()
  _scratchBodyTorque
    .copy(body.torqueAccumulatorNewtonMeters)
    .applyQuaternion(_scratchInverseQuaternion)
  _scratchBodyAngularAcceleration.set(
    _scratchBodyTorque.x / body.inertiaTensorKgMeterSquared.x,
    _scratchBodyTorque.y / body.inertiaTensorKgMeterSquared.y,
    _scratchBodyTorque.z / body.inertiaTensorKgMeterSquared.z
  )
  _scratchWorldAngularAcceleration
    .copy(_scratchBodyAngularAcceleration)
    .applyQuaternion(body.orientationQuaternion)
  body.angularAccelerationRadiansPerSecondSquared.copy(
    _scratchWorldAngularAcceleration
  )
  body.angularVelocityRadiansPerSecond.addScaledVector(
    _scratchWorldAngularAcceleration,
    deltaSeconds
  )

  // Quaternion integration for a WORLD-frame angular rate:
  // q_next = normalize(q + 0.5 * dt * (omega_quat * q))
  _scratchOmegaQuaternion.set(
    body.angularVelocityRadiansPerSecond.x,
    body.angularVelocityRadiansPerSecond.y,
    body.angularVelocityRadiansPerSecond.z,
    0
  )
  _scratchDeltaQuaternion
    .copy(_scratchOmegaQuaternion)
    .multiply(body.orientationQuaternion)
  body.orientationQuaternion.x += 0.5 * deltaSeconds * _scratchDeltaQuaternion.x
  body.orientationQuaternion.y += 0.5 * deltaSeconds * _scratchDeltaQuaternion.y
  body.orientationQuaternion.z += 0.5 * deltaSeconds * _scratchDeltaQuaternion.z
  body.orientationQuaternion.w += 0.5 * deltaSeconds * _scratchDeltaQuaternion.w
  body.orientationQuaternion.normalize()

  body.isFinite = isFiniteBody(body)

  return body
}

export function getRocketUpVectorWorld(body, target = new THREE.Vector3()) {
  target.set(0, 1, 0)
  if (!body) return target
  target.applyQuaternion(body.orientationQuaternion)
  return target
}

export function getRocketForwardVectorWorld(body, target = new THREE.Vector3()) {
  target.set(0, 0, 1)
  if (!body) return target
  target.applyQuaternion(body.orientationQuaternion)
  return target
}

export function getRocketRightVectorWorld(body, target = new THREE.Vector3()) {
  target.set(1, 0, 0)
  if (!body) return target
  target.applyQuaternion(body.orientationQuaternion)
  return target
}

// Rotates a body-frame vector into the world frame.
export function getRocketLocalVectorToWorld(body, localVector, target = new THREE.Vector3()) {
  target.copy(localVector)
  if (!body) return target
  target.applyQuaternion(body.orientationQuaternion)
  return target
}

// Rotates a world-frame vector into the body frame.
export function getRocketWorldVectorToLocal(body, worldVector, target = new THREE.Vector3()) {
  target.copy(worldVector)
  if (!body) return target
  target.applyQuaternion(_scratchInverseQuaternion.copy(body.orientationQuaternion).invert())
  return target
}

export function setRocketMassAndInertia(body, massKg, inertiaTensorKgMeterSquared) {
  if (!body) return body

  body.massKg = sanitizePositiveNumber(massKg, body.massKg)
  if (inertiaTensorKgMeterSquared) {
    body.inertiaTensorKgMeterSquared.set(
      sanitizePositiveNumber(inertiaTensorKgMeterSquared.x, body.inertiaTensorKgMeterSquared.x),
      sanitizePositiveNumber(inertiaTensorKgMeterSquared.y, body.inertiaTensorKgMeterSquared.y),
      sanitizePositiveNumber(inertiaTensorKgMeterSquared.z, body.inertiaTensorKgMeterSquared.z)
    )
  }

  return body
}

export function isFiniteBody(body) {
  if (!body) return false

  return (
    isFiniteVector3(body.positionMeters) &&
    isFiniteVector3(body.velocityMetersPerSecond) &&
    isFiniteVector3(body.angularVelocityRadiansPerSecond) &&
    isFiniteVector3(body.forceAccumulatorNewtons) &&
    isFiniteVector3(body.torqueAccumulatorNewtonMeters) &&
    Number.isFinite(body.massKg) &&
    Number.isFinite(body.orientationQuaternion.x) &&
    Number.isFinite(body.orientationQuaternion.y) &&
    Number.isFinite(body.orientationQuaternion.z) &&
    Number.isFinite(body.orientationQuaternion.w)
  )
}

function isFiniteVector3(vector) {
  return (
    !!vector &&
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  )
}

function sanitizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeNonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}