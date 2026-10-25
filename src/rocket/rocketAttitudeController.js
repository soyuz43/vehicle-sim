// src/rocket/rocketAttitudeController.js

import * as THREE from 'three'
import {
  getRocketUpVectorWorld,
  getRocketWorldVectorToLocal,
} from './rocketRigidBody.js'

// Attitude stabilization for the rocket: a PID controller that drives the
// body +Y axis toward the world +Y axis.
//
// Error representation
// -------------------
// The error axis is (upWorld x worldUp). Its magnitude is sin(tilt) and its
// direction is the axis that rotates the current up vector toward vertical.
// Projecting that axis into the BODY frame yields two independent error
// components (body x and body z), which is the pair the PID integrates.
//
// Sign convention
// ---------------
// For a tilt toward body +X, the error component on body +Z is positive and
// the restoring torque is a positive rotation about body +Z. For a tilt
// toward body +Z, the error component on body +X is negative and the
// restoring torque is a negative rotation about body +X. Both follow from
// torque_local = kp * error_local - kd * angularRate_local, with the
// derivative taken on the measurement (the body rate) rather than on the
// setpoint, so there is no derivative kick.
//
// Limitation (documented, not hidden): the derivative term treats the body
// frame rates as the tilt rates. That is accurate while the rocket is close
// to vertical, which is the regime this prototype flies in.

const _upWorldUnit = new THREE.Vector3()
const _worldUp = new THREE.Vector3(0, 1, 0)
const _errorAxisWorld = new THREE.Vector3()
const _errorLocal = new THREE.Vector3()
const _angularRateLocal = new THREE.Vector3()
const _torqueLocal = new THREE.Vector3()
const _torqueWorld = new THREE.Vector3()

export function createRocketAttitudeControllerState() {
  return {
    integralErrorRadianSeconds: new THREE.Vector2(0, 0),
    attitudeErrorRadians: 0,
    appliedTorqueNewtonMeters: new THREE.Vector3(),
    isSaturated: false,
  }
}

export function resetRocketAttitudeControllerState(state) {
  if (!state) return state

  state.integralErrorRadianSeconds.set(0, 0)
  state.attitudeErrorRadians = 0
  state.appliedTorqueNewtonMeters.set(0, 0, 0)
  state.isSaturated = false

  return state
}

// Computes the stabilizing torque and ADDS it to the body accumulator.
// Returns the applied world-frame torque for telemetry.
export function updateRocketAttitudeControl(body, controllerState, spec, deltaTimeSeconds) {
  if (!body || !controllerState) {
    _torqueWorld.set(0, 0, 0)
    return _torqueWorld
  }

  const deltaSeconds = Number.isFinite(deltaTimeSeconds) && deltaTimeSeconds > 0 ? deltaTimeSeconds : 0

  getRocketUpVectorWorld(body, _upWorldUnit)
  _errorAxisWorld.crossVectors(_upWorldUnit, _worldUp)

  const angleCosine = Math.min(1, Math.max(-1, _upWorldUnit.dot(_worldUp)))
  const attitudeErrorRadians = Math.atan2(_errorAxisWorld.length(), angleCosine)
  controllerState.attitudeErrorRadians = attitudeErrorRadians

  if (spec?.attitudeControlEnabled !== true) {
    controllerState.appliedTorqueNewtonMeters.set(0, 0, 0)
    controllerState.isSaturated = false
    return controllerState.appliedTorqueNewtonMeters
  }

  getRocketWorldVectorToLocal(body, _errorAxisWorld, _errorLocal)
  getRocketWorldVectorToLocal(body, body.angularVelocityRadiansPerSecond, _angularRateLocal)

  // The error axis is perpendicular to the body up axis, so the body y
  // component carries no attitude information.
  const errorX = _errorLocal.x
  const errorZ = _errorLocal.z

  if (deltaSeconds > 0) {
    controllerState.integralErrorRadianSeconds.x += errorX * deltaSeconds
    controllerState.integralErrorRadianSeconds.y += errorZ * deltaSeconds
  }

  const integralLimitRadianSeconds = spec.attitudeIntegralLimitRadianSeconds
  controllerState.integralErrorRadianSeconds.x = clamp(
    controllerState.integralErrorRadianSeconds.x,
    -integralLimitRadianSeconds,
    integralLimitRadianSeconds
  )
  controllerState.integralErrorRadianSeconds.y = clamp(
    controllerState.integralErrorRadianSeconds.y,
    -integralLimitRadianSeconds,
    integralLimitRadianSeconds
  )

  const proportionalGain = spec.attitudeProportionalGainNewtonMetersPerRadian
  const integralGain = spec.attitudeIntegralGainNewtonMetersPerRadianSecond
  const derivativeGain = spec.attitudeDerivativeGainNewtonMetersSecondPerRadian

  _torqueLocal.set(
    proportionalGain * errorX +
      integralGain * controllerState.integralErrorRadianSeconds.x -
      derivativeGain * _angularRateLocal.x,
    0,
    proportionalGain * errorZ +
      integralGain * controllerState.integralErrorRadianSeconds.y -
      derivativeGain * _angularRateLocal.z
  )

  _torqueWorld.copy(_torqueLocal).applyQuaternion(body.orientationQuaternion)

  const maximumTorqueNewtonMeters = spec.attitudeMaximumTorqueNewtonMeters
  const torqueMagnitudeNewtonMeters = _torqueWorld.length()
  if (torqueMagnitudeNewtonMeters > maximumTorqueNewtonMeters) {
    _torqueWorld.multiplyScalar(maximumTorqueNewtonMeters / torqueMagnitudeNewtonMeters)
    controllerState.isSaturated = true
  } else {
    controllerState.isSaturated = false
  }

  controllerState.appliedTorqueNewtonMeters.copy(_torqueWorld)

  return controllerState.appliedTorqueNewtonMeters
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}