// src/physics/RigidBody.js

import * as THREE from 'three'

// Foundational six-degree-of-freedom rigid-body state and integration.
//
// The Euler rigid-body term omega x (I * omega) is intentionally not
// integrated. Inertia is diagonal in the body frame, and position is stored
// at the center of mass rather than the visual origin.
//
// Frame convention:
//   local +Y = body up
//   local +X = body right
//   local +Z = body forward.

const _scratchForceNewtons = new THREE.Vector3()
const _scratchLeverArmMeters = new THREE.Vector3()
const _scratchTorqueNewtonMeters = new THREE.Vector3()
const _scratchBodyTorqueNewtonMeters = new THREE.Vector3()
const _scratchBodyAngularAccelerationRadiansPerSecondSquared = new THREE.Vector3()
const _scratchWorldAngularAccelerationRadiansPerSecondSquared = new THREE.Vector3()
const _scratchInverseQuaternion = new THREE.Quaternion()
const _scratchOmegaQuaternion = new THREE.Quaternion()
const _scratchDeltaQuaternion = new THREE.Quaternion()

export function createRigidBody(config = {}) {
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

  resetRigidBody(body, config)

  return body
}

export function resetRigidBody(body, config = {}) {
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
    sanitizePositiveNumber(config.inertiaXKgMeterSquared, 1),
    sanitizePositiveNumber(config.inertiaYKgMeterSquared, 1),
    sanitizePositiveNumber(config.inertiaZKgMeterSquared, 1)
  )
  body.forceAccumulatorNewtons.set(0, 0, 0)
  body.torqueAccumulatorNewtonMeters.set(0, 0, 0)
  body.linearAccelerationMetersPerSecondSquared.set(0, 0, 0)
  body.angularAccelerationRadiansPerSecondSquared.set(0, 0, 0)
  body.isFinite = true

  return body
}

export function clearForceAccumulators(body) {
  if (!body) return body

  body.forceAccumulatorNewtons.set(0, 0, 0)
  body.torqueAccumulatorNewtonMeters.set(0, 0, 0)

  return body
}

export function addForce(body, forceNewtons) {
  if (!body || !forceNewtons) return body

  body.forceAccumulatorNewtons.add(forceNewtons)

  return body
}

export function addForceAtPoint(body, forceNewtons, applicationPointWorldMeters) {
  if (!body || !forceNewtons) return body

  body.forceAccumulatorNewtons.add(forceNewtons)

  if (!applicationPointWorldMeters) return body

  // torque = r x F, where r runs from the CENTER OF MASS to the point of
  // application.
  _scratchLeverArmMeters
    .copy(applicationPointWorldMeters)
    .sub(body.positionMeters)
  _scratchTorqueNewtonMeters.crossVectors(_scratchLeverArmMeters, forceNewtons)
  body.torqueAccumulatorNewtonMeters.add(_scratchTorqueNewtonMeters)

  return body
}

export function addTorque(body, torqueNewtonMeters) {
  if (!body || !torqueNewtonMeters) return body

  body.torqueAccumulatorNewtonMeters.add(torqueNewtonMeters)

  return body
}

// An impulse changes the velocity immediately, without going through the
// force accumulator. Used by stage separation, where the impulse is a
// discrete event rather than a continuous force.
export function applyImpulse(body, impulseNewtonsSecond, applicationPointWorldMeters) {
  if (!body || !impulseNewtonsSecond) return body

  const inverseMassKg = 1 / body.massKg
  body.velocityMetersPerSecond.addScaledVector(impulseNewtonsSecond, inverseMassKg)

  if (!applicationPointWorldMeters) return body

  _scratchLeverArmMeters.copy(applicationPointWorldMeters).sub(body.positionMeters)
  _scratchTorqueNewtonMeters.crossVectors(_scratchLeverArmMeters, impulseNewtonsSecond)
  applyAngularImpulseInWorldFrame(body, _scratchTorqueNewtonMeters)

  return body
}

export function applyAngularImpulseInWorldFrame(body, angularImpulseNewtonMeterSeconds) {
  if (!body || !angularImpulseNewtonMeterSeconds) return body

  // Angular impulse arrives in the world frame; the inverse inertia tensor
  // is diagonal in the BODY frame, so rotate in, scale, rotate out.
  _scratchInverseQuaternion.copy(body.orientationQuaternion).invert()
  _scratchBodyTorqueNewtonMeters
    .copy(angularImpulseNewtonMeterSeconds)
    .applyQuaternion(_scratchInverseQuaternion)
  _scratchBodyTorqueNewtonMeters.set(
    _scratchBodyTorqueNewtonMeters.x / body.inertiaTensorKgMeterSquared.x,
    _scratchBodyTorqueNewtonMeters.y / body.inertiaTensorKgMeterSquared.y,
    _scratchBodyTorqueNewtonMeters.z / body.inertiaTensorKgMeterSquared.z
  )
  _scratchWorldAngularAccelerationRadiansPerSecondSquared
    .copy(_scratchBodyTorqueNewtonMeters)
    .applyQuaternion(body.orientationQuaternion)
  body.angularVelocityRadiansPerSecond.add(_scratchWorldAngularAccelerationRadiansPerSecondSquared)

  return body
}

// Semi-implicit (symplectic) Euler integration of the rigid body.
// The caller supplies a fixed step.
export function integrateRigidBody(body, deltaTimeSeconds) {
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
  _scratchBodyTorqueNewtonMeters
    .copy(body.torqueAccumulatorNewtonMeters)
    .applyQuaternion(_scratchInverseQuaternion)
  _scratchBodyAngularAccelerationRadiansPerSecondSquared.set(
    _scratchBodyTorqueNewtonMeters.x / body.inertiaTensorKgMeterSquared.x,
    _scratchBodyTorqueNewtonMeters.y / body.inertiaTensorKgMeterSquared.y,
    _scratchBodyTorqueNewtonMeters.z / body.inertiaTensorKgMeterSquared.z
  )
  _scratchWorldAngularAccelerationRadiansPerSecondSquared
    .copy(_scratchBodyAngularAccelerationRadiansPerSecondSquared)
    .applyQuaternion(body.orientationQuaternion)
  body.angularAccelerationRadiansPerSecondSquared.copy(
    _scratchWorldAngularAccelerationRadiansPerSecondSquared
  )
  body.angularVelocityRadiansPerSecond.addScaledVector(
    _scratchWorldAngularAccelerationRadiansPerSecondSquared,
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

export function getUpVectorWorld(body, target = new THREE.Vector3()) {
  target.set(0, 1, 0)
  if (!body) return target
  target.applyQuaternion(body.orientationQuaternion)
  return target
}

export function getForwardVectorWorld(body, target = new THREE.Vector3()) {
  target.set(0, 0, 1)
  if (!body) return target
  target.applyQuaternion(body.orientationQuaternion)
  return target
}

export function getRightVectorWorld(body, target = new THREE.Vector3()) {
  target.set(1, 0, 0)
  if (!body) return target
  target.applyQuaternion(body.orientationQuaternion)
  return target
}

// Rotates a body-frame vector into the world frame.
export function getLocalVectorToWorld(body, localVector, target = new THREE.Vector3()) {
  target.copy(localVector)
  if (!body) return target
  target.applyQuaternion(body.orientationQuaternion)
  return target
}

// Rotates a world-frame vector into the body frame.
export function getWorldVectorToLocal(body, worldVector, target = new THREE.Vector3()) {
  target.copy(worldVector)
  if (!body) return target
  target.applyQuaternion(_scratchInverseQuaternion.copy(body.orientationQuaternion).invert())
  return target
}

export function setMassAndInertia(body, massKg, inertiaTensorKgMeterSquared) {
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