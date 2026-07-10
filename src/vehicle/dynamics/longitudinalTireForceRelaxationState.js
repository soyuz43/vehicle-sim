// src/vehicle/dynamics/longitudinalTireForceRelaxationState.js

const DEFAULT_LONGITUDINAL_TIRE_FORCE_RELAXATION_SPEC = Object.freeze({
  longitudinalTireForceRelaxationEnabled: true,
  longitudinalTireForceRelaxationLengthMeters: 0.35,
  minimumLongitudinalTireForceRelaxationSpeedMetersPerSecond: 1,
})

const FORCE_EPSILON_NEWTONS = 0.001

export function resetWheelLongitudinalTireForceRelaxationState(
  wheelState,
  spec = {}
) {
  resetWheelLongitudinalTireForceStepState(wheelState, spec)
  wheelState.relaxedLongitudinalTireForceNewtons = 0

  return wheelState
}

export function resetWheelLongitudinalTireForceStepState(
  wheelState,
  spec = {}
) {
  wheelState.uncappedLongitudinalTireForceNewtons = 0
  wheelState.linearLongitudinalTireForceNewtons = 0
  wheelState.appliedLongitudinalForceNewtons = 0
  wheelState.targetLongitudinalTireForceNewtons = 0
  wheelState.longitudinalTireForceRelaxationAlpha = 0
  wheelState.longitudinalTireForceRelaxationLengthMeters =
    resolveLongitudinalTireForceRelaxationLengthMeters(spec)
  wheelState.longitudinalTireForceSaturationRatio = 0
  wheelState.isLongitudinalTireForceSaturated = false
  wheelState.isLongitudinalTireForceRelaxing = false

  return wheelState
}

export function updateWheelLongitudinalTireForceRelaxationState(
  wheelState,
  spec = {},
  dtSeconds = 0,
  advanceRelaxationState = true
) {
  const relaxationEnabled =
    spec.longitudinalTireForceRelaxationEnabled !== false
  const relaxationLengthMeters =
    resolveLongitudinalTireForceRelaxationLengthMeters(spec)
  const minimumRelaxationSpeedMetersPerSecond =
    resolveMinimumLongitudinalTireForceRelaxationSpeedMetersPerSecond(spec)
  const targetForceNewtons = sanitizeNumber(
    wheelState.targetLongitudinalTireForceNewtons
  )
  const tractionLimitNewtons = sanitizeNonNegativeNumber(
    wheelState.tractionLimitNewtons
  )
  const previousRelaxedForceNewtons = sanitizeNumber(
    wheelState.relaxedLongitudinalTireForceNewtons
  )
  const safeDtSeconds = sanitizeNonNegativeNumber(dtSeconds)
  const alpha = calculateLongitudinalTireForceRelaxationAlpha({
    speedMetersPerSecond: wheelState.longitudinalGroundSpeedMetersPerSecond,
    dtSeconds: safeDtSeconds,
    relaxationLengthMeters,
    minimumRelaxationSpeedMetersPerSecond,
    enabled: relaxationEnabled,
  })
  const clampedTargetForceNewtons = clamp(
    targetForceNewtons,
    -tractionLimitNewtons,
    tractionLimitNewtons
  )

  wheelState.longitudinalTireForceRelaxationLengthMeters =
    relaxationLengthMeters
  wheelState.longitudinalTireForceRelaxationAlpha = alpha

  if (!relaxationEnabled) {
    wheelState.relaxedLongitudinalTireForceNewtons =
      clampedTargetForceNewtons
    wheelState.appliedLongitudinalForceNewtons = clampedTargetForceNewtons
    wheelState.isLongitudinalTireForceRelaxing = false
    return wheelState
  }

  if (!advanceRelaxationState) {
    const clampedRelaxedForceNewtons = clamp(
      previousRelaxedForceNewtons,
      -tractionLimitNewtons,
      tractionLimitNewtons
    )

    wheelState.appliedLongitudinalForceNewtons = clampedRelaxedForceNewtons
    wheelState.isLongitudinalTireForceRelaxing =
      Math.abs(clampedTargetForceNewtons - previousRelaxedForceNewtons) >
      FORCE_EPSILON_NEWTONS
    return wheelState
  }

  if (!Number.isFinite(alpha) || alpha <= 0) {
    const clampedRelaxedForceNewtons = clamp(
      previousRelaxedForceNewtons,
      -tractionLimitNewtons,
      tractionLimitNewtons
    )

    wheelState.relaxedLongitudinalTireForceNewtons =
      clampedRelaxedForceNewtons
    wheelState.appliedLongitudinalForceNewtons = clampedRelaxedForceNewtons
    wheelState.isLongitudinalTireForceRelaxing =
      Math.abs(clampedTargetForceNewtons - clampedRelaxedForceNewtons) >
      FORCE_EPSILON_NEWTONS
    return wheelState
  }

  const relaxedForceNewtons = clamp(
    previousRelaxedForceNewtons +
      (clampedTargetForceNewtons - previousRelaxedForceNewtons) * alpha,
    -tractionLimitNewtons,
    tractionLimitNewtons
  )

  wheelState.relaxedLongitudinalTireForceNewtons = relaxedForceNewtons
  wheelState.appliedLongitudinalForceNewtons = relaxedForceNewtons
  wheelState.isLongitudinalTireForceRelaxing =
    Math.abs(clampedTargetForceNewtons - relaxedForceNewtons) >
    FORCE_EPSILON_NEWTONS

  return wheelState
}

export function calculateLongitudinalTireForceRelaxationAlpha({
  speedMetersPerSecond,
  dtSeconds,
  relaxationLengthMeters,
  minimumRelaxationSpeedMetersPerSecond,
  enabled = true,
} = {}) {
  if (!enabled) return 1

  const safeDtSeconds = sanitizeNonNegativeNumber(dtSeconds)
  const safeRelaxationLengthMeters = resolveLongitudinalTireForceRelaxationLengthMeters(
    {
      longitudinalTireForceRelaxationLengthMeters: relaxationLengthMeters,
    }
  )

  if (safeDtSeconds <= 0 || safeRelaxationLengthMeters <= 0) return 0

  const safeMinimumRelaxationSpeedMetersPerSecond =
    resolveMinimumLongitudinalTireForceRelaxationSpeedMetersPerSecond({
      minimumLongitudinalTireForceRelaxationSpeedMetersPerSecond:
        minimumRelaxationSpeedMetersPerSecond,
    })
  const safeSpeedMetersPerSecond = Math.max(
    Math.abs(sanitizeNumber(speedMetersPerSecond)),
    safeMinimumRelaxationSpeedMetersPerSecond
  )
  const alpha =
    1 -
    Math.exp(
      (-safeSpeedMetersPerSecond * safeDtSeconds) /
        safeRelaxationLengthMeters
    )

  return clamp01(alpha)
}

function resolveLongitudinalTireForceRelaxationLengthMeters(spec = {}) {
  return sanitizePositiveNumber(
    spec.longitudinalTireForceRelaxationLengthMeters,
    DEFAULT_LONGITUDINAL_TIRE_FORCE_RELAXATION_SPEC.longitudinalTireForceRelaxationLengthMeters
  )
}

function resolveMinimumLongitudinalTireForceRelaxationSpeedMetersPerSecond(
  spec = {}
) {
  return sanitizePositiveNumber(
    spec.minimumLongitudinalTireForceRelaxationSpeedMetersPerSecond,
    DEFAULT_LONGITUDINAL_TIRE_FORCE_RELAXATION_SPEC.minimumLongitudinalTireForceRelaxationSpeedMetersPerSecond
  )
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function clamp01(value) {
  return clamp(value, 0, 1)
}

function sanitizePositiveNumber(value, fallback = 0) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeNonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}
