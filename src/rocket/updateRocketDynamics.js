// src/rocket/updateRocketDynamics.js

import * as THREE from 'three'
import { EARTH_GRAVITY } from '../simulation/simulationConstants.js'
import {
  addRocketForceAtPoint,
  addRocketTorque,
  clearRocketForceAccumulator,
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
//   control  - the PID attitude torque
//
// Every force is accumulated in the rigid body and integrated once, at the
// fixed step, by the rocket's own integrator.

const _gravityForce = new THREE.Vector3()
const _thrustForce = new THREE.Vector3()
const _thrustApplicationPoint = new THREE.Vector3()
const _dragForce = new THREE.Vector3()
const _dragApplicationPoint = new THREE.Vector3()
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
  // point, and by the attitude controller, so it is resolved once per step.
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

  // Quadratic drag at the centre of pressure.
  const speedMetersPerSecond = body.velocityMetersPerSecond.length()
  if (speedMetersPerSecond > 1e-4) {
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

  // PID attitude stabilization.
  const controlTorque = updateRocketAttitudeControl(
    body,
    rocket.attitudeController,
    spec,
    deltaSeconds
  )
  if (controlTorque) addRocketTorque(body, controlTorque)

  // One integration step for the accumulated force and torque set.
  integrateRocketRigidBody(body, deltaSeconds)

  return rocket
}