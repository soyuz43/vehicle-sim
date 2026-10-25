// src/rocket/rocketGroundContact.js

import * as THREE from 'three'
import { addRocketForceAtPoint } from './rocketRigidBody.js'

// Unilateral ground contact for the rocket.
//
// The base of the body is sampled at a ring of points. Every sample point
// that sits below the terrain surface contributes a spring-damper normal
// force plus a Coulomb-limited tangential friction force. Sampling a ring
// (instead of a single point) is what lets the rocket tip over instead of
// pivoting around one artificial contact point.

const _sampleLocal = new THREE.Vector3()
const _sampleWorld = new THREE.Vector3()
const _leverArmWorld = new THREE.Vector3()
const _pointVelocity = new THREE.Vector3()
const _normalForce = new THREE.Vector3()
const _tangentVelocity = new THREE.Vector3()
const _frictionForce = new THREE.Vector3()
const _surfaceResult = {
  normalWorld: new THREE.Vector3(0, 1, 0),
  terrainHeightMeters: 0,
  isWithinBounds: true,
}

const DEFAULT_FRICTION_COEFFICIENT = 0.6

export function applyRocketGroundContact(rocket, options = {}, deltaTimeSeconds = 0) {
  const body = rocket?.body
  const spec = rocket?.spec
  const terrainContactQuery = options.terrainContactQuery
  if (!body || !spec || !terrainContactQuery) return rocket

  const safeDeltaTimeSeconds =
    Number.isFinite(deltaTimeSeconds) && deltaTimeSeconds > 0 ? deltaTimeSeconds : 0

  // The vehicle stands on its fin tips, so the contact ring is the fin
  // tip radius.
  const radiusMeters = spec.finTipRadiusMeters ?? spec.bodyRadiusMeters
  const baseStructuralYMeters = 0
  const centerOfMassStructuralYMeters = rocket.massProperties.centerOfMassStructuralYMeters
  const sampleCount = Math.max(1, Math.round(spec.groundContactSampleCount))
  // The authored stiffness and damping are whole-body values. Every
  // sampled point carries an equal share of them, so a multi-point contact
  // does not stiffen the body by the sample count.
  const stiffnessNewtonsPerMeter =
    spec.groundContactStiffnessNewtonsPerMeter / sampleCount
  const dampingNewtonSecondsPerMeter =
    spec.groundContactDampingNewtonSecondsPerMeter / sampleCount

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const angleRadians = (sampleIndex / sampleCount) * Math.PI * 2
    _sampleLocal.set(
      Math.cos(angleRadians) * radiusMeters,
      baseStructuralYMeters - centerOfMassStructuralYMeters,
      Math.sin(angleRadians) * radiusMeters
    )
    _sampleWorld.copy(_sampleLocal).applyQuaternion(body.orientationQuaternion).add(body.positionMeters)

    terrainContactQuery.queryAtWorldXZ(_sampleWorld.x, _sampleWorld.z, _surfaceResult)
    const terrainHeightMeters = _surfaceResult.terrainHeightMeters
    if (!Number.isFinite(terrainHeightMeters)) continue

    const penetrationMeters = terrainHeightMeters - _sampleWorld.y
    if (penetrationMeters <= 0) continue

    const normalWorld = _surfaceResult.normalWorld
    if (!normalWorld || !Number.isFinite(normalWorld.y)) continue

    _leverArmWorld.copy(_sampleWorld).sub(body.positionMeters)
    _pointVelocity
      .copy(body.angularVelocityRadiansPerSecond)
      .cross(_leverArmWorld)
      .add(body.velocityMetersPerSecond)

    const normalSpeedMetersPerSecond = _pointVelocity.dot(normalWorld)
    const normalMagnitudeNewtons = Math.max(
      0,
      stiffnessNewtonsPerMeter * penetrationMeters -
        dampingNewtonSecondsPerMeter * normalSpeedMetersPerSecond
    )
    if (normalMagnitudeNewtons <= 0) continue

    _normalForce.copy(normalWorld).multiplyScalar(normalMagnitudeNewtons)
    addRocketForceAtPoint(body, _normalForce, _sampleWorld)

    // Tangential friction, limited by the normal force.
    _tangentVelocity.copy(_pointVelocity).addScaledVector(normalWorld, -normalSpeedMetersPerSecond)
    const tangentSpeedMetersPerSecond = _tangentVelocity.length()
    if (tangentSpeedMetersPerSecond > 1e-4) {
      const frictionCoefficient = Number.isFinite(_surfaceResult.frictionCoefficient)
        ? Math.max(0, _surfaceResult.frictionCoefficient)
        : DEFAULT_FRICTION_COEFFICIENT
      const maximumFrictionNewtons = frictionCoefficient * normalMagnitudeNewtons
      // The friction impulse applied in one step must not exceed the
      // tangential momentum of the body, or the contact would reverse the
      // slide instead of stopping it.
      const momentumLimitedFrictionNewtons =
        (body.massKg * tangentSpeedMetersPerSecond) /
        Math.max(safeDeltaTimeSeconds, 1e-6)
      const frictionMagnitudeNewtons = Math.min(
        maximumFrictionNewtons,
        momentumLimitedFrictionNewtons
      )
      _frictionForce
        .copy(_tangentVelocity)
        .multiplyScalar(-frictionMagnitudeNewtons / tangentSpeedMetersPerSecond)
      addRocketForceAtPoint(body, _frictionForce, _sampleWorld)
    }
  }

  return rocket
}