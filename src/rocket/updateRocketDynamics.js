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

const _gravityForceNewtonsNewtons = new THREE.Vector3()
const _thrustForceNewtons = new THREE.Vector3()
const _thrustApplicationPointMeters = new THREE.Vector3()
const _dragForceNewtonsNewtons = new THREE.Vector3()
const _dragApplicationPointMeters = new THREE.Vector3()
const _finForceLocalNewtons = new THREE.Vector3()
const _finForceWorldNewtons = new THREE.Vector3()
const _finApplicationPointWorldMeters = new THREE.Vector3()
const _finLeverArmWorldMeters = new THREE.Vector3()
const _finTorqueWorldNewtonMeters = new THREE.Vector3()
const _upWorldUnit = new THREE.Vector3()

export function updateRocketDynamics(rocket, deltaTimeSeconds, options = {}) {
  if (!rocket?.body || !rocket.spec) return rocket

  const body = rocket.body
  const spec = rocket.spec
  const deltaSeconds = Number.isFinite(deltaTimeSeconds) && deltaTimeSeconds > 0 ? deltaTimeSeconds : 0

  clearRocketForceAccumulator(body)

  // Gravity at the centre of mass.
  _gravityForceNewtonsNewtons.set(0, -EARTH_GRAVITY.standardMetersPerSecondSquared * body.massKg, 0)
  addRocketForceAtPoint(body, _gravityForceNewtonsNewtons, body.positionMeters)

  // The body up axis is needed by the thrust, by the drag application
  // point, by the fin application point, and by the attitude controller, so
  // it is resolved once per step.
  getRocketUpVectorWorld(body, _upWorldUnit)

  // Thrust along the body up axis, applied at the engine bell.
  const throttle01 = rocket.throttle01 ?? (rocket.motorIgnited ? 1 : 0)
  if (rocket.motorIgnited && spec.thrustNewtons > 0) {
    _thrustForceNewtons.copy(_upWorldUnit).multiplyScalar(spec.thrustNewtons * throttle01)
    _thrustApplicationPointMeters
      .copy(body.positionMeters)
      .addScaledVector(
        _upWorldUnit,
        spec.thrustApplicationStructuralYMeters -
          rocket.massProperties.centerOfMassStructuralYMeters
      )
    addRocketForceAtPoint(body, _thrustForceNewtons, _thrustApplicationPointMeters)
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
    _dragForceNewtonsNewtons
      .copy(body.velocityMetersPerSecond)
      .multiplyScalar(-dragMagnitudeNewtons / speedMetersPerSecond)
    const dragApplicationStructuralYMeters =
      rocket.dragApplicationStructuralYMeters ?? spec.dragApplicationStructuralYMeters
    _dragApplicationPointMeters
      .copy(body.positionMeters)
      .addScaledVector(
        _upWorldUnit,
        dragApplicationStructuralYMeters -
          rocket.massProperties.centerOfMassStructuralYMeters
      )
    addRocketForceAtPoint(body, _dragForceNewtonsNewtons, _dragApplicationPointMeters)
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
  _finForceLocalNewtons
    .set(-Math.sin(rollDeflectionRadians), 0, -Math.sin(pitchDeflectionRadians))
    .multiplyScalar(forceScaleNewtons)
  getRocketLocalVectorToWorld(body, _finForceLocalNewtons, _finForceWorldNewtons)

  const finApplicationStructuralYMeters = spec.finApplicationStructuralYMeters
  _finApplicationPointWorldMeters
    .copy(body.positionMeters)
    .addScaledVector(
      _upWorldUnit,
      finApplicationStructuralYMeters - rocket.massProperties.centerOfMassStructuralYMeters
    )

  // The moment the fin force produces about the centre of mass.
  _finLeverArmWorldMeters.copy(_finApplicationPointWorldMeters).sub(body.positionMeters)
  _finTorqueWorldNewtonMeters.crossVectors(_finLeverArmWorldMeters, _finForceWorldNewtons)
  controls.appliedFinTorqueNewtonMeters.copy(_finTorqueWorldNewtonMeters)

  addRocketForceAtPoint(body, _finForceWorldNewtons, _finApplicationPointWorldMeters)
}