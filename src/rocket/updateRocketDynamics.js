// src/rocket/updateRocketDynamics.js

import * as THREE from 'three'
import { EARTH_GRAVITY } from '../simulation/simulationConstants.js'
import {
  addRocketForceAtPoint,
  addRocketTorque,
  clearRocketForceAccumulator,
  getRocketLocalVectorToWorld,
  getRocketUpVectorWorld,
  integrateRocketRigidBody,
} from './rocketRigidBody.js'
import { updateRocketAttitudeControl } from './rocketAttitudeController.js'
import { applyRocketGroundContact } from './rocketGroundContact.js'

// Per-step rocket dynamics.
//
// The force set is deliberately small and explicit:
//   gravity  - mass * g, applied at the centre of mass (no moment)
//   thrust   - the motor thrust along the body +Y axis, applied at the
//              engine bell. The engine sits on the body axis, which passes
//              through the centre of mass, so it produces no moment.
//   drag     - quadratic drag opposing the velocity, applied at the centre
//              of pressure in the LOWER body (the fin level), BELOW the
//              centre of mass, so the aerodynamic moment restores the tilt
//              instead of amplifying it
//   contact  - unilateral ground contact
//   fins     - the aerodynamic control surfaces, the pilot's attitude
//              authority (the PID stabilizer is off by default)
//   control  - the PID attitude torque, only when it is explicitly enabled
//
// Every force is accumulated in the rigid body and integrated once, at the
// fixed step, by the rocket's own integrator.

const _gravityForce = new THREE.Vector3()
const _thrustForce = new THREE.Vector3()
const _thrustApplicationPoint = new THREE.Vector3()
const _dragForce = new THREE.Vector3()
const _dragApplicationPoint = new THREE.Vector3()
const _finForceLocal = new THREE.Vector3()
const _finForceWorld = new THREE.Vector3()
const _finApplicationPointWorld = new THREE.Vector3()
const _finLeverArmWorld = new THREE.Vector3()
const _finTorqueWorld = new THREE.Vector3()
const _upWorld = new THREE.Vector3()

export function updateRocketDynamics(rocket, deltaTimeSeconds, options = {}) {
  if (!rocket?.body || !rocket.spec) return rocket

  const body = rocket.body
  const spec = rocket.spec
  const deltaSeconds = Number.isFinite(deltaTimeSeconds) && deltaTimeSeconds > 0 ? deltaTimeSeconds : 0

  clearRocketForceAccumulator(body)

  // Gravity at the centre of mass.
  _gravityForce.set(0, -EARTH_GRAVITY.standardMetersPerSecondSquared * body.massKg, 0)
  addRocketForceAtPoint(body, _gravityForce, body.positionMeters)

  // The body up axis is needed by the thrust, by the drag application
  // point, by the fin application point, and by the attitude controller, so
  // it is resolved once per step.
  getRocketUpVectorWorld(body, _upWorld)

  // Thrust along the body up axis, applied at the engine bell.
  const throttle01 = rocket.throttle01 ?? (rocket.motorIgnited ? 1 : 0)
  if (rocket.motorIgnited && spec.thrustNewtons > 0) {
    _thrustForce.copy(_upWorld).multiplyScalar(spec.thrustNewtons * throttle01)
    _thrustApplicationPoint
      .copy(body.positionMeters)
      .addScaledVector(
        _upWorld,
        spec.thrustApplicationStructuralYMeters -
          rocket.massProperties.centerOfMassStructuralYMeters
      )
    addRocketForceAtPoint(body, _thrustForce, _thrustApplicationPoint)
  }

  // Quadratic drag at the centre of pressure. The drag is the airframe's
  // passive restoring force, so it can be switched off for comparison.
  const speedMetersPerSecond = body.velocityMetersPerSecond.length()
  if (spec.airDragEnabled !== false && speedMetersPerSecond > 1e-4) {
    const dragMagnitudeNewtons =
      0.5 *
      spec.airDensityKgPerCubicMeter *
      spec.dragCoefficient *
      spec.referenceAreaSquareMeters *
      speedMetersPerSecond *
      speedMetersPerSecond
    _dragForce
      .copy(body.velocityMetersPerSecond)
      .multiplyScalar(-dragMagnitudeNewtons / speedMetersPerSecond)
    const dragApplicationStructuralYMeters =
      rocket.dragApplicationStructuralYMeters ?? spec.dragApplicationStructuralYMeters
    _dragApplicationPoint
      .copy(body.positionMeters)
      .addScaledVector(
        _upWorld,
        dragApplicationStructuralYMeters -
          rocket.massProperties.centerOfMassStructuralYMeters
      )
    addRocketForceAtPoint(body, _dragForce, _dragApplicationPoint)
  }

  // Unilateral ground contact.
  applyRocketGroundContact(rocket, options, deltaTimeSeconds)

  // Attitude error measurement for the telemetry readouts. The automatic
  // stabilizer is disabled by default: the fins are the attitude
  // authority, and the pilot commands them.
  const attitudeControlTorque = updateRocketAttitudeControl(
    body,
    rocket.attitudeController,
    spec,
    deltaSeconds
  )
  if (spec.attitudeControlEnabled === true && attitudeControlTorque) {
    addRocketTorque(body, attitudeControlTorque)
  }

  // The aerodynamic control surfaces.
  applyRocketFinControl(rocket, body, spec)

  // One integration step for the accumulated force and torque set.
  integrateRocketRigidBody(body, deltaSeconds)

  return rocket
}

// The aerodynamic control surfaces.
//
// The fins sit at the base of the body, BELOW the centre of mass, so the
// side force they generate swings the long axis the OTHER way: a force
// toward the body -Z rotates the nose toward the body +Z.
//
//   q = 0.5 * rho * V^2                       the dynamic pressure
//   F = q * A_fin * C_fin * sin(deflection)   the side force of the fin set
//   M = r x F                                 the moment about the mass
//
// The force is applied at the fin level, so the moment arm is the distance
// from the centre of mass down to the fins.
function applyRocketFinControl(rocket, body, spec) {
  const controls = rocket.controls
  if (!controls) return

  controls.appliedFinTorqueNewtonMeters.set(0, 0, 0)
  controls.dynamicPressurePascals = 0

  // The control surfaces are inert until the pilot arms them.
  if (controls.finsEnabled !== true) return

  const speedMetersPerSecond = body.velocityMetersPerSecond.length()

  const dynamicPressurePascals =
    0.5 * spec.airDensityKgPerCubicMeter * speedMetersPerSecond * speedMetersPerSecond
  controls.dynamicPressurePascals = dynamicPressurePascals

  // Below the minimum airspeed the fins cannot make a useful side force.
  if (speedMetersPerSecond <= spec.finMinimumSpeedMetersPerSecond) return

  const pitchDeflectionRadians = controls.finDeflectionPitchRadians
  const rollDeflectionRadians = controls.finDeflectionRollRadians
  if (pitchDeflectionRadians === 0 && rollDeflectionRadians === 0) return

  const forceScaleNewtons =
    dynamicPressurePascals * spec.finReferenceAreaSquareMeters * spec.finLiftCoefficient

  // The side force points opposite to the commanded nose swing: the fins
  // push the tail one way and the nose the other.
  _finForceLocal
    .set(-Math.sin(rollDeflectionRadians), 0, -Math.sin(pitchDeflectionRadians))
    .multiplyScalar(forceScaleNewtons)
  getRocketLocalVectorToWorld(body, _finForceLocal, _finForceWorld)

  const finApplicationStructuralYMeters = spec.finApplicationStructuralYMeters
  _finApplicationPointWorld
    .copy(body.positionMeters)
    .addScaledVector(
      _upWorld,
      finApplicationStructuralYMeters - rocket.massProperties.centerOfMassStructuralYMeters
    )

  // The moment the fin force produces about the centre of mass.
  _finLeverArmWorld.copy(_finApplicationPointWorld).sub(body.positionMeters)
  _finTorqueWorld.crossVectors(_finLeverArmWorld, _finForceWorld)
  controls.appliedFinTorqueNewtonMeters.copy(_finTorqueWorld)

  addRocketForceAtPoint(body, _finForceWorld, _finApplicationPointWorld)
}