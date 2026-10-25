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

const _upWorldUnit = new THREE.Vector3()
const _forwardWorldUnit = new THREE.Vector3()
const _separationImpulseNewtonSeconds = new THREE.Vector3()
const _reactionImpulseNewtonSeconds = new THREE.Vector3()
const _noseCenterOfMassWorldMeters = new THREE.Vector3()
const _noseCenterOfMassOffsetMeters = new THREE.Vector3()
const _separationPointWorldMeters = new THREE.Vector3()
const _newCenterOfMassOffsetMeters = new THREE.Vector3()
const _tumbleAxisUnit = new THREE.Vector3()
const _shiftVelocityMetersPerSecond = new THREE.Vector3()
const _nosePointVelocityMetersPerSecond = new THREE.Vector3()

export function separateRocketStage(rocket, options = {}) {
  if (!rocket?.body || !rocket.spec || rocket.stageSeparated) return null

  const body = rocket.body
  const spec = rocket.spec
  const massProperties = rocket.massProperties

  getRocketUpVectorWorld(body, _upWorldUnit)
  getRocketForwardVectorWorld(body, _forwardWorldUnit)

  // === 1. Debris entity at the nose cone's own centre of mass ===
  const debris = createRocketDebris({ spec, massProperties })
  _noseCenterOfMassOffsetMeters
    .copy(_upWorldUnit)
    .multiplyScalar(
      massProperties.noseCenterOfMassStructuralYMeters -
        massProperties.centerOfMassStructuralYMeters
    )
  _noseCenterOfMassWorldMeters
    .copy(body.positionMeters)
    .add(_noseCenterOfMassOffsetMeters)
  debris.body.positionMeters.copy(_noseCenterOfMassWorldMeters)
  debris.body.orientationQuaternion.copy(body.orientationQuaternion)

  // The nose is a material point of the rocket before separation. Its
  // pre-impulse velocity is therefore the velocity at its own centre of
  // mass, not the velocity at the rocket's former centre of mass.
  _nosePointVelocityMetersPerSecond
    .copy(body.angularVelocityRadiansPerSecond)
    .cross(_noseCenterOfMassOffsetMeters)
    .add(body.velocityMetersPerSecond)
  debris.body.velocityMetersPerSecond.copy(_nosePointVelocityMetersPerSecond)
  debris.body.angularVelocityRadiansPerSecond.copy(body.angularVelocityRadiansPerSecond)

  // The debris tumbles as it separates.
  _tumbleAxisUnit.set(1, 0, 0).applyQuaternion(body.orientationQuaternion)
  debris.body.angularVelocityRadiansPerSecond.addScaledVector(
    _tumbleAxisUnit,
    spec.separationTumbleRadiansPerSecond
  )

  // === 2. Centre of mass shift on the remaining rocket ===
  const newCenterOfMassOffsetMeters =
    massProperties.bodyCenterStructuralYMeters -
    massProperties.centerOfMassStructuralYMeters
  _newCenterOfMassOffsetMeters
    .copy(_upWorldUnit)
    .multiplyScalar(newCenterOfMassOffsetMeters)
  _separationPointWorldMeters
    .copy(body.positionMeters)
    .addScaledVector(
      _upWorldUnit,
      massProperties.noseBaseStructuralYMeters -
        massProperties.centerOfMassStructuralYMeters
    )

  // The velocity of the material point that becomes the new centre of mass.
  _shiftVelocityMetersPerSecond
    .copy(body.angularVelocityRadiansPerSecond)
    .cross(_newCenterOfMassOffsetMeters)
  body.velocityMetersPerSecond.add(_shiftVelocityMetersPerSecond)
  body.positionMeters.add(_newCenterOfMassOffsetMeters)

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
  _separationImpulseNewtonSeconds
    .copy(_upWorldUnit)
    .multiplyScalar(impulseMagnitudeNewtonsSecond * (1 - lateralShare01))
    .addScaledVector(
      _forwardWorldUnit,
      impulseMagnitudeNewtonsSecond * lateralShare01
    )

  // Both halves receive their impulses at the same world-space separation
  // plane. Applying the nose impulse at its own centre of mass would add a
  // spurious impulse couple and make the combined post-separation motion
  // gain angular momentum.
  applyRocketImpulse(debris.body, _separationImpulseNewtonSeconds, _separationPointWorldMeters)
  _reactionImpulseNewtonSeconds.copy(_separationImpulseNewtonSeconds).negate()
  applyRocketImpulse(body, _reactionImpulseNewtonSeconds, _separationPointWorldMeters)

  // The original attached nose is now represented by the debris body. Keep
  // it out of the remaining visual until reset reattaches it.
  rocket.noseMesh.visible = false

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