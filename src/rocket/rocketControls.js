// src/rocket/rocketControls.js

// Pilot input and fin actuation for the rocket.
//
// The rocket has no automatic stabilizer. The aerodynamic control surfaces
// (the fins) are the pilot's only attitude authority, so the control state
// holds three separate things:
//
//   commandedPitch01 / commandedRoll01
//       What the pilot is asking for, in the range -1 .. 1.
//
//   finDeflectionPitchRadians / finDeflectionRollRadians
//       Where the fins actually are. The fins move at a finite rate, so
//       the physical deflection lags the command; it never snaps.
//
//   finsEnabled
//       The arming switch. It is OFF by default: an unarmed rocket keeps
//       its fins centred and produces no control force.
//
// Frame convention (the rocket body frame):
//   body +Y = the long axis, pointing at the nose
//   body +Z = "forward"
//   body +X = "right"
//   pitch (W / S) swings the long axis in the body Z plane. A positive
//     pitch commands the nose toward the body +Z.
//   roll  (A / D) swings the long axis in the body X plane. A positive
//     roll commands the nose toward the body +X.

import * as THREE from 'three'

export const DEFAULT_FIN_ACTUATION_RATE_RADIANS_PER_SECOND = 2
export const DEFAULT_FIN_MAXIMUM_DEFLECTION_RADIANS = 0.35

export function createRocketControlState() {
  return {
    finsEnabled: false,
    commandedPitch01: 0,
    commandedRoll01: 0,
    finDeflectionPitchRadians: 0,
    finDeflectionRollRadians: 0,
    // The moment the fin force produced in the last step, for telemetry.
    appliedFinTorqueNewtonMeters: new THREE.Vector3(),
    // The dynamic pressure the fins are working against, for telemetry.
    dynamicPressurePascals: 0,
  }
}

// A reset returns the control surfaces to neutral and disarms them, the
// same way the motor is returned to its off state.
export function resetRocketControlState(state) {
  if (!state) return state

  state.finsEnabled = false
  state.commandedPitch01 = 0
  state.commandedRoll01 = 0
  state.finDeflectionPitchRadians = 0
  state.finDeflectionRollRadians = 0
  state.appliedFinTorqueNewtonMeters.set(0, 0, 0)
  state.dynamicPressurePascals = 0

  return state
}

export function setRocketFinsEnabled(state, isEnabled) {
  if (!state) return state

  state.finsEnabled = isEnabled === true

  return state
}

export function toggleRocketFins(state) {
  if (!state) return state

  state.finsEnabled = state.finsEnabled !== true

  return state
}

// Advances the fins toward the commanded deflection.
//
// The fins are rate limited: an actuator cannot move a surface faster
// than its servo rate, and the rate limit is what keeps a tapped key from
// producing an impulse the airframe cannot answer.
export function updateRocketControlState(state, spec, input, deltaTimeSeconds) {
  if (!state) return state

  const deltaSeconds =
    Number.isFinite(deltaTimeSeconds) && deltaTimeSeconds > 0 ? deltaTimeSeconds : 0

  // An unarmed rocket ignores the pilot and centres its fins.
  const finsEnabled = state.finsEnabled === true
  const commandedPitch01 = finsEnabled ? resolvePitchCommand01(input) : 0
  const commandedRoll01 = finsEnabled ? resolveRollCommand01(input) : 0

  state.commandedPitch01 = commandedPitch01
  state.commandedRoll01 = commandedRoll01

  const maximumDeflectionRadians =
    spec?.finMaximumDeflectionRadians ?? DEFAULT_FIN_MAXIMUM_DEFLECTION_RADIANS
  const actuationRateRadiansPerSecond =
    spec?.finActuationRateRadiansPerSecond ?? DEFAULT_FIN_ACTUATION_RATE_RADIANS_PER_SECOND

  const maximumStepRadians = actuationRateRadiansPerSecond * deltaSeconds

  state.finDeflectionPitchRadians = moveTowardRadians(
    state.finDeflectionPitchRadians,
    commandedPitch01 * maximumDeflectionRadians,
    maximumStepRadians
  )
  state.finDeflectionRollRadians = moveTowardRadians(
    state.finDeflectionRollRadians,
    commandedRoll01 * maximumDeflectionRadians,
    maximumStepRadians
  )

  return state
}

function resolvePitchCommand01(input) {
  if (!input) return 0

  const forward = input.pitchForward === true ? 1 : 0
  const backward = input.pitchBackward === true ? 1 : 0

  return clampSigned01(forward - backward)
}

function resolveRollCommand01(input) {
  if (!input) return 0

  const right = input.rollRight === true ? 1 : 0
  const left = input.rollLeft === true ? 1 : 0

  return clampSigned01(right - left)
}

function moveTowardRadians(currentRadians, targetRadians, maximumStepRadians) {
  const differenceRadians = targetRadians - currentRadians
  if (Math.abs(differenceRadians) <= maximumStepRadians) return targetRadians

  return currentRadians + Math.sign(differenceRadians) * maximumStepRadians
}

function clampSigned01(value) {
  if (!Number.isFinite(value)) return 0

  return Math.min(1, Math.max(-1, value))
}