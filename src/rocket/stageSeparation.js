// src/rocket/stageSeparation.js

import * as THREE from 'three'
import {
  createRocketDebris,
  applyRocketMassPropertiesToVisuals,
  computeRocketMassProperties,
} from './createRocket.js'
import {
  applyRocketImpulse,
  getRocketForwardVectorWorld,
  getRocketUpVectorWorld,
  setRocketMassAndInertia,
} from './rocketRigidBody.js'

// Stage separation.
//
// What happens, in order:
//   1. The nose cone leaves as an independent body at the nose cone's own
//      centre of mass, inheriting the rocket's velocity, orientation, and
//      angular rate.
//   2. The nose cone receives a separation impulse. The remaining rocket
//      receives the equal and opposite impulse at the separation plane,
//      which is Newton's third law for the separation event.
//   3. The remaining rocket loses the nose cone's mass, its centre of mass
//      drops to the body alone, and its inertia tensor is replaced by the
//      body's own inertia about that new centre of mass.
//
// The centre-of-mass shift is not cosmetic. Moving the centre of mass of a
// rigid body changes the velocity of the new centre of mass, so the COM
// shift is applied as a rigid-body kinematic change (the velocity of the
// material point that ends up at the new COM) BEFORE the reaction impulse
// is applied.

const _upWorld = new THREE.Vector3()
const _forwardWorld = new THREE.Vector3()
const _separationImpulse = new THREE.Vector3()
const _reactionImpulse = new THREE.Vector3()
const _noseCenterOfMassWorld = new THREE.Vector3()
const _separationPointWorld = new THREE.Vector3()
const _newCenterOfMassOffset = new THREE.Vector3()
const _tumbleAxis = new THREE.Vector3()
const _shiftVelocity = new THREE.Vector3()

export function separateRocketStage(rocket, options = {}) {
  if (!rocket?.body || !rocket.spec || rocket.stageSeparated) return null

  const body = rocket.body
  const spec = rocket.spec
  const massProperties = rocket.massProperties

  getRocketUpVectorWorld(body, _upWorld)
  getRocketForwardVectorWorld(body, _forwardWorld)

  // === 1. Debris entity at the nose cone's own centre of mass ===
  const debris = createRocketDebris({ spec, massProperties })
  _noseCenterOfMassWorld
    .copy(body.positionMeters)
    .addScaledVector(
      _upWorld,
      massProperties.noseCenterOfMassStructuralYMeters -
        massProperties.centerOfMassStructuralYMeters
    )
  debris.body.positionMeters.copy(_noseCenterOfMassWorld)
  debris.body.orientationQuaternion.copy(body.orientationQuaternion)
  debris.body.velocityMetersPerSecond.copy(body.velocityMetersPerSecond)
  debris.body.angularVelocityRadiansPerSecond.copy(body.angularVelocityRadiansPerSecond)

  // The debris tumbles as it separates.
  _tumbleAxis.set(1, 0, 0).applyQuaternion(body.orientationQuaternion)
  debris.body.angularVelocityRadiansPerSecond.addScaledVector(
    _tumbleAxis,
    spec.separationTumbleRadiansPerSecond
  )

  // === 2. Centre of mass shift on the remaining rocket ===
  const newCenterOfMassOffsetMeters =
    massProperties.bodyCenterStructuralYMeters -
    massProperties.centerOfMassStructuralYMeters
  _newCenterOfMassOffset
    .copy(_upWorld)
    .multiplyScalar(newCenterOfMassOffsetMeters)
  _separationPointWorld
    .copy(body.positionMeters)
    .addScaledVector(
      _upWorld,
      massProperties.noseBaseStructuralYMeters -
        massProperties.centerOfMassStructuralYMeters
    )

  // The velocity of the material point that becomes the new centre of mass.
  _shiftVelocity
    .copy(body.angularVelocityRadiansPerSecond)
    .cross(_newCenterOfMassOffset)
  body.velocityMetersPerSecond.add(_shiftVelocity)
  body.positionMeters.add(_newCenterOfMassOffset)

  // === 3. Mass and inertia of the remaining body ===
  const remainingMassProperties = computeRocketMassProperties({
    ...spec,
    bodyMassKg: massProperties.bodyMassKg,
    noseMassKg: 0,
  })
  setRocketMassAndInertia(
    body,
    remainingMassProperties.totalMassKg,
    remainingMassProperties.inertiaTensorKgMeterSquared
  )
  rocket.massProperties = remainingMassProperties
  applyRocketMassPropertiesToVisuals(rocket, remainingMassProperties)

  // The fins stay with the lower body, and they are what sets the centre
  // of pressure, so the separation does not move it. The value lives on the
  // rocket, not on the shared spec, so a reset restores it.
  rocket.dragApplicationStructuralYMeters = rocket.spec.dragApplicationStructuralYMeters

  // === 4. Separation impulse pair ===
  const impulseMagnitudeNewtonsSecond = spec.separationImpulseNewtonsSecond
  const lateralShare01 = spec.separationLateralImpulseShare01
  _separationImpulse
    .copy(_upWorld)
    .multiplyScalar(impulseMagnitudeNewtonsSecond * (1 - lateralShare01))
    .addScaledVector(
      _forwardWorld,
      impulseMagnitudeNewtonsSecond * lateralShare01
    )

  applyRocketImpulse(debris.body, _separationImpulse)
  _reactionImpulse.copy(_separationImpulse).negate()
  applyRocketImpulse(body, _reactionImpulse, _separationPointWorld)

  rocket.stageSeparated = true

  return {
    debris,
    separationImpulseNewtonsSecond: impulseMagnitudeNewtonsSecond,
    debrisMassKg: massProperties.noseMassKg,
    remainingMassKg: remainingMassProperties.totalMassKg,
    massBeforeSeparationKg: massProperties.totalMassKg,
    centerOfMassShiftMeters: Math.abs(newCenterOfMassOffsetMeters),
  }
}