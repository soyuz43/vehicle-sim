// src/vehicle/dynamics/brakeAndStabilityControlState.js

// Phase 3 stability-assist seam: real wheel-lock detection, an advanced
// physically-grounded anti-lock braking controller, traction control, and a
// yaw-stability (ESC) controller.
//
// These are deliberately isolated, pure-ish functions so the legacy default
// behavior (legacy slip-ratio ABS, no traction control, no ESC) is preserved
// when the corresponding feature flags are disabled. Each assist targets a
// physically meaningful signal:
//   - ABS: longitudinal slip ratio near the grip peak + wheel angular-velocity
//     lock proximity (wheel surface speed collapsing toward zero vs ground).
//   - TC:  driven-wheel longitudinal slip ratio (spin) beyond the grip peak.
//   - ESC: yaw-rate error (actual vs commanded) mapped to selective wheel brake
//     torque and/or engine-torque cut.
//
// Honesty policy: ABS/TC/ESC v1 are staged controls, not full state estimators.
// ESC uses a single corrective wheel + engine cut (no per-corner pressure
// modulation or steering intervention yet).

const ESC_STATES = Object.freeze({
  INACTIVE: 'inactive',
  UNDERSTEER_CORRECTION: 'understeer_correction',
  OVERSTEER_CORRECTION: 'oversteer_correction',
})

const WHEEL_LOCK_STATES = Object.freeze({
  ROLLING: 'rolling',
  LOCK_PROXIMITY: 'lock_proximity',
  LOCKED: 'locked',
})

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function sanitizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeNonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

// ---------------------------------------------------------------------------
// Wheel lock detection (physical consequence, enabled in the controller only
// when spec.wheelLockModelEnabled === true so the rotational integrator may
// actually bring omega to zero).
// ---------------------------------------------------------------------------
export function evaluateWheelLockState(wheelState, spec = {}) {
  const lockSpeedThresholdMetersPerSecond = sanitizeNonNegativeNumber(
    spec.wheelLockSpeedThresholdMetersPerSecond,
    0.5
  )
  const lockAngularSpeedEpsilonRadiansPerSecond = sanitizeNonNegativeNumber(
    spec.wheelLockAngularSpeedEpsilonRadiansPerSecond,
    0.5
  )
  const groundSpeedMetersPerSecond = sanitizeNumber(
    wheelState.longitudinalGroundSpeedMetersPerSecond
  )
  const groundSpeedAbs = Math.abs(groundSpeedMetersPerSecond)
  const angularSpeedAbs = Math.abs(
    sanitizeNumber(wheelState.angularVelocityRadiansPerSecond)
  )
  const isBraking =
    sanitizeNonNegativeNumber(wheelState.totalBrakeTorqueNewtonMeters, 0) > 0 ||
    wheelState.isServiceBraking === true ||
    wheelState.isParkingBraking === true

  const isMoving = groundSpeedAbs >= lockSpeedThresholdMetersPerSecond
  const isSlowWheel = angularSpeedAbs <= lockAngularSpeedEpsilonRadiansPerSecond

  let wheelLockState = WHEEL_LOCK_STATES.ROLLING
  let isWheelLocked = false
  let severity01 = 0

  if (wheelState.isGrounded && isMoving && isSlowWheel && isBraking) {
    isWheelLocked = true
    wheelLockState = WHEEL_LOCK_STATES.LOCKED
    severity01 = 1
  } else if (
    wheelState.isGrounded &&
    isMoving &&
    angularSpeedAbs <= lockAngularSpeedEpsilonRadiansPerSecond * 3 &&
    isBraking
  ) {
    wheelLockState = WHEEL_LOCK_STATES.LOCK_PROXIMITY
    severity01 = clamp01(
      1 - angularSpeedAbs / (lockAngularSpeedEpsilonRadiansPerSecond * 3)
    )
  }

  wheelState.wheelLockState = wheelLockState
  wheelState.isWheelLocked = isWheelLocked
  wheelState.wheelLockSeverity01 = severity01

  return wheelState
}

// ---------------------------------------------------------------------------
// Advanced anti-lock braking: modulate per-wheel brake torque to keep the
// longitudinal slip ratio near the grip peak and prevent sustained lock.
// Returns the modulated brake torque (N*m) and records telemetry on wheelState.
// ---------------------------------------------------------------------------
export function updateWheelAdvancedAbsState(
  wheelState,
  spec = {},
  preAbsBrakeTorqueNewtonMeters = 0,
  dt = 0
) {
  const absEnabled = spec.advancedAbsEnabled === true
  const preAbs = sanitizeNonNegativeNumber(preAbsBrakeTorqueNewtonMeters)
  const groundSpeedAbs = Math.abs(
    sanitizeNumber(wheelState.longitudinalGroundSpeedMetersPerSecond)
  )
  const minGroundSpeedMetersPerSecond = sanitizeNonNegativeNumber(
    spec.advancedAbsMinGroundSpeedMetersPerSecond,
    2.5
  )
  const targetSlipRatio = sanitizePositiveNumber(
    spec.advancedAbsTargetSlipRatio,
    0.12
  )
  const releaseRatePerSecond = sanitizePositiveNumber(
    spec.advancedAbsReleaseRatePerSecond,
    8
  )
  const reapplyRatePerSecond = sanitizePositiveNumber(
    spec.advancedAbsReapplyRatePerSecond,
    3
  )
  const minimumModulation01 = clamp01(
    sanitizeNumber(spec.advancedAbsMinimumModulation01, 0.2)
  )
  const lockSpeedRatioThreshold = sanitizePositiveNumber(
    spec.advancedAbsLockSpeedRatioThreshold,
    0.4
  )
  const wheelSurfaceSpeedAbs = Math.abs(
    sanitizeNumber(wheelState.wheelSurfaceSpeedMetersPerSecond)
  )

  const canRunAbs =
    absEnabled &&
    preAbs > 0 &&
    wheelState.isGrounded === true &&
    groundSpeedAbs >= minGroundSpeedMetersPerSecond

  if (!canRunAbs) {
    wheelState.advancedAbsActive = false
    wheelState.advancedAbsModulation01 = 1
    wheelState.advancedAbsState = 'inactive'
    wheelState.serviceBrakeTorqueAfterAbsNewtonMeters = preAbs
    return preAbs
  }

  const previousModulation01 = clamp01(
    sanitizeNumber(wheelState.advancedAbsModulation01, 1)
  )
  const slipRatio = sanitizeNumber(wheelState.longitudinalSlipRatio)

  // Incipient lock: the wheel surface speed is collapsing toward zero while the
  // vehicle is still moving. Strong signal to release, independent of slip sign.
  const lockSpeedRatio =
    groundSpeedAbs > 0 ? wheelSurfaceSpeedAbs / groundSpeedAbs : 1
  const incipientLock = lockSpeedRatio <= lockSpeedRatioThreshold

  const overTarget = slipRatio <= -targetSlipRatio || incipientLock
  const underTarget = slipRatio >= -targetSlipRatio * 0.5

  let modulation01 = previousModulation01
  let absState = 'monitoring'

  if (overTarget) {
    modulation01 = Math.max(
      minimumModulation01,
      previousModulation01 - releaseRatePerSecond * Math.max(dt, 0)
    )
    absState = 'releasing'
    wheelState.advancedAbsActive = modulation01 < 1 - 1e-3
  } else if (underTarget) {
    modulation01 = Math.min(
      1,
      previousModulation01 + reapplyRatePerSecond * Math.max(dt, 0)
    )
    wheelState.advancedAbsActive = modulation01 < 1 - 1e-3
    absState = modulation01 < 1 - 1e-3 ? 'reapplying' : 'monitoring'
  } else {
    wheelState.advancedAbsActive = previousModulation01 < 1 - 1e-3
    absState = previousModulation01 < 1 - 1e-3 ? 'holding' : 'monitoring'
  }

  wheelState.advancedAbsModulation01 = modulation01
  wheelState.advancedAbsState = absState
  const modulated = preAbs * modulation01
  wheelState.serviceBrakeTorqueAfterAbsNewtonMeters = modulated

  return modulated
}

// ---------------------------------------------------------------------------
// Traction control: reduce driven-wheel drive torque when the wheel spins
// beyond the grip peak (positive longitudinal slip ratio).
// Returns the modulated drive torque (N*m).
// ---------------------------------------------------------------------------
export function updateWheelTractionControlState(
  wheelState,
  spec = {},
  preTcDriveTorqueNewtonMeters = 0,
  dt = 0
) {
  const tcEnabled = spec.tractionControlEnabled === true
  const preTc = sanitizeNonNegativeNumber(preTcDriveTorqueNewtonMeters)
  const spinTriggerSlipRatio = sanitizePositiveNumber(
    spec.tractionControlSpinSlipRatioTrigger,
    0.12
  )
  const spinRecoverySlipRatio = sanitizePositiveNumber(
    spec.tractionControlSpinSlipRatioRecovery,
    0.05
  )
  const releaseRatePerSecond = sanitizePositiveNumber(
    spec.tractionControlReleaseRatePerSecond,
    6
  )
  const reapplyRatePerSecond = sanitizePositiveNumber(
    spec.tractionControlReapplyRatePerSecond,
    3
  )
  const minimumModulation01 = clamp01(
    sanitizeNumber(spec.tractionControlMinimumModulation01, 0.3)
  )

  const isDriven = wheelState.driven === true
  const canRunTc =
    tcEnabled &&
    isDriven &&
    preTc > 0 &&
    wheelState.isGrounded === true

  if (!canRunTc) {
    wheelState.tractionControlActive = false
    wheelState.tractionControlModulation01 = 1
    wheelState.tractionControlState = 'inactive'
    return preTc
  }

  const previousModulation01 = clamp01(
    sanitizeNumber(wheelState.tractionControlModulation01, 1)
  )
  const slipRatio = sanitizeNumber(wheelState.longitudinalSlipRatio)

  const overSpin = slipRatio >= spinTriggerSlipRatio
  const recovered = slipRatio <= spinRecoverySlipRatio

  let modulation01 = previousModulation01
  let tcState = 'monitoring'

  if (overSpin) {
    modulation01 = Math.max(
      minimumModulation01,
      previousModulation01 - releaseRatePerSecond * Math.max(dt, 0)
    )
    tcState = 'reducing'
    wheelState.tractionControlActive = modulation01 < 1 - 1e-3
  } else if (recovered) {
    modulation01 = Math.min(
      1,
      previousModulation01 + reapplyRatePerSecond * Math.max(dt, 0)
    )
    wheelState.tractionControlActive = modulation01 < 1 - 1e-3
    tcState = modulation01 < 1 - 1e-3 ? 'restoring' : 'monitoring'
  } else {
    wheelState.tractionControlActive = previousModulation01 < 1 - 1e-3
    tcState = previousModulation01 < 1 - 1e-3 ? 'holding' : 'monitoring'
  }

  wheelState.tractionControlModulation01 = modulation01
  wheelState.tractionControlState = tcState
  const modulated = preTc * modulation01
  wheelState.requestedDriveTorqueNewtonMeters = modulated

  return modulated
}

// ---------------------------------------------------------------------------
// Electronic stability control: map yaw-rate error to a single corrective
// selective wheel brake torque plus an engine-torque cut. Returns a descriptor
// with per-wheel brake deltas (keyed by wheel index) and an engine cut factor.
// ---------------------------------------------------------------------------
export function computeElectronicStabilityControl({
  wheelStates = [],
  spec = {},
  yawRateRadiansPerSecond = 0,
  targetYawRateRadiansPerSecond = 0,
  dt = 0,
}) {
  const escEnabled = spec.electronicStabilityControlEnabled === true
  const yawDeadzoneRadiansPerSecond = sanitizeNonNegativeNumber(
    spec.escYawRateDeadzoneRadiansPerSecond,
    0.05
  )
  const brakeGainNewtonMetersPerYawRate = sanitizeNonNegativeNumber(
    spec.escBrakeTorqueGainPerYawError,
    1500
  )
  const maxBrakeTorqueNewtonMeters = sanitizeNonNegativeNumber(
    spec.escMaxBrakeTorqueNewtonMeters,
    1200
  )
  const engineCutYawRateRadiansPerSecond = sanitizeNonNegativeNumber(
    spec.escEngineCutYawRateRadiansPerSecond,
    0.4
  )

  const result = {
    active: false,
    escState: ESC_STATES.INACTIVE,
    yawRateErrorRadiansPerSecond:
      sanitizeNumber(yawRateRadiansPerSecond) -
      sanitizeNumber(targetYawRateRadiansPerSecond),
    wheelBrakeTorqueDeltas: {},
    engineTorqueCut01: 0,
  }

  if (!escEnabled) return result

  const yawError = result.yawRateErrorRadiansPerSecond
  if (Math.abs(yawError) <= yawDeadzoneRadiansPerSecond) return result

  const actualAbs = Math.abs(yawRateRadiansPerSecond)
  const targetAbs = Math.abs(targetYawRateRadiansPerSecond)

  // No turn commanded: ESC does not apply selective braking on straights
  if (targetAbs <= yawDeadzoneRadiansPerSecond) return result

  const turnSign = Math.sign(sanitizeNumber(targetYawRateRadiansPerSecond)) || 1

  // Oversteer: actual yaw exceeds commanded yaw (same direction). Brake the
  // outer front wheel to generate a counter yaw moment.
  // Understeer: actual yaw is below commanded. Brake the inner rear wheel to
  // help rotate the chassis into the turn.
  const isOversteer = actualAbs > targetAbs && Math.sign(yawError) === turnSign
  let correctiveAxle
  let correctiveSide

  if (isOversteer) {
    correctiveAxle = 'front'
    correctiveSide = turnSign > 0 ? 'right' : 'left'
    result.escState = ESC_STATES.OVERSTEER_CORRECTION
  } else {
    correctiveAxle = 'rear'
    correctiveSide = turnSign > 0 ? 'left' : 'right'
    result.escState = ESC_STATES.UNDERSTEER_CORRECTION
  }

  const brakeTorqueNewtonMeters = Math.min(
    maxBrakeTorqueNewtonMeters,
    brakeGainNewtonMetersPerYawRate * Math.abs(yawError)
  )

  let correctiveWheelIndex = -1
  wheelStates.forEach((wheelState, index) => {
    if (wheelState.axle === correctiveAxle && wheelState.side === correctiveSide) {
      correctiveWheelIndex = index
    }
  })

  if (correctiveWheelIndex >= 0) {
    result.wheelBrakeTorqueDeltas[correctiveWheelIndex] = brakeTorqueNewtonMeters
    result.active = true
  }

  result.engineTorqueCut01 = clamp01(
    Math.abs(yawError) / Math.max(engineCutYawRateRadiansPerSecond, 1e-6)
  )

  return result
}

export { ESC_STATES, WHEEL_LOCK_STATES }
