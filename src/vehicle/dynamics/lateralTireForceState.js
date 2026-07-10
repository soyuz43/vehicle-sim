// src/vehicle/dynamics/lateralTireForceState.js

const DEFAULT_LATERAL_TIRE_FORCE_SPEC = Object.freeze({
  lateralTireStiffnessNewtonsPerRadian: 6000,
  lateralTireForceSaturationEpsilonNewtons: 0.001,
  combinedTireForceCapEnabled: true,
})

export function createLateralTireForceSummary() {
  return {
    totalLateralTireForceNewtons: 0,
    totalLateralTireForceAbsNewtons: 0,
    maxAbsLateralTireForceNewtons: 0,
    lateralTireForceSaturatedWheelCount: 0,
    combinedTireForceSaturatedWheelCount: 0,
    maxCombinedTireForceSaturationRatio: 0,
    yawMomentNewtonMeters: 0,
    yawAccelerationRadiansPerSecondSquared: 0,
  }
}

export function resetLateralTireForceSummary(lateralTireForceSummary) {
  lateralTireForceSummary.totalLateralTireForceNewtons = 0
  lateralTireForceSummary.totalLateralTireForceAbsNewtons = 0
  lateralTireForceSummary.maxAbsLateralTireForceNewtons = 0
  lateralTireForceSummary.lateralTireForceSaturatedWheelCount = 0
  lateralTireForceSummary.combinedTireForceSaturatedWheelCount = 0
  lateralTireForceSummary.maxCombinedTireForceSaturationRatio = 0
  lateralTireForceSummary.yawMomentNewtonMeters = 0
  lateralTireForceSummary.yawAccelerationRadiansPerSecondSquared = 0

  return lateralTireForceSummary
}

export function resetWheelLateralTireForceState(wheelState) {
  wheelState.uncappedLateralTireForceNewtons = 0
  wheelState.linearLateralTireForceNewtons = 0
  wheelState.appliedLateralTireForceNewtons = 0
  wheelState.lateralTireForceSaturationRatio = 0
  wheelState.isLateralTireForceSaturated = false
  wheelState.preCombinedAppliedLongitudinalForceNewtons = 0
  wheelState.preCombinedAppliedLateralForceNewtons = 0
  wheelState.combinedTireForceMagnitudeNewtons = 0
  wheelState.combinedTireForceLimitNewtons = 0
  wheelState.combinedTireForceScale01 = 1
  wheelState.combinedTireForceSaturationRatio = 0
  wheelState.isCombinedTireForceSaturated = false

  return wheelState
}

export function updateWheelLateralTireForceState(wheelState, spec = {}) {
  const lateralTireStiffnessNewtonsPerRadian = sanitizePositiveNumber(
    wheelState.pressureAdjustedLateralTireStiffnessNewtonsPerRadian,
    sanitizePositiveNumber(
      spec.lateralTireStiffnessNewtonsPerRadian,
      DEFAULT_LATERAL_TIRE_FORCE_SPEC.lateralTireStiffnessNewtonsPerRadian
    )
  )
  const lateralTireForceSaturationEpsilonNewtons = sanitizeNonNegativeNumber(
    spec.lateralTireForceSaturationEpsilonNewtons,
    DEFAULT_LATERAL_TIRE_FORCE_SPEC.lateralTireForceSaturationEpsilonNewtons
  )
  const tractionLimitNewtons = sanitizeNonNegativeNumber(
    wheelState.tractionLimitNewtons
  )

  wheelState.uncappedLateralTireForceNewtons = 0
  wheelState.linearLateralTireForceNewtons = 0
  wheelState.appliedLateralTireForceNewtons = 0
  wheelState.lateralTireForceSaturationRatio = 0
  wheelState.isLateralTireForceSaturated = false

  if (
    wheelState.isGrounded &&
    tractionLimitNewtons > 0 &&
    wheelState.hasLateralSlipAngleSample
  ) {
    const lateralSlipAngleRadians = sanitizeNumber(
      wheelState.lateralSlipAngleRadians
    )

    // Positive slip means velocity points toward the wheel's local right axis,
    // so positive tire force must push back toward local left to oppose slip.
    wheelState.linearLateralTireForceNewtons =
      -lateralTireStiffnessNewtonsPerRadian * lateralSlipAngleRadians
    wheelState.uncappedLateralTireForceNewtons =
      wheelState.linearLateralTireForceNewtons
    wheelState.appliedLateralTireForceNewtons = clampMagnitude(
      wheelState.linearLateralTireForceNewtons,
      tractionLimitNewtons
    )

    const uncappedLateralTireForceMagnitudeNewtons = Math.abs(
      wheelState.uncappedLateralTireForceNewtons
    )
    wheelState.lateralTireForceSaturationRatio =
      tractionLimitNewtons > 0
        ? Math.min(
            uncappedLateralTireForceMagnitudeNewtons / tractionLimitNewtons,
            1
          )
        : 0
    wheelState.isLateralTireForceSaturated =
      uncappedLateralTireForceMagnitudeNewtons >
      tractionLimitNewtons + lateralTireForceSaturationEpsilonNewtons
  }

  applyCombinedTireForceCap(wheelState, spec)

  return wheelState
}

export function applyCombinedTireForceCap(wheelState, spec = {}) {
  const combinedTireForceCapEnabled =
    spec.combinedTireForceCapEnabled !== false
  const tractionLimitNewtons = sanitizeNonNegativeNumber(
    wheelState.tractionLimitNewtons
  )
  const combinedTireForceSaturationEpsilonNewtons = sanitizeNonNegativeNumber(
    spec.lateralTireForceSaturationEpsilonNewtons,
    DEFAULT_LATERAL_TIRE_FORCE_SPEC.lateralTireForceSaturationEpsilonNewtons
  )
  const preCombinedAppliedLongitudinalForceNewtons = sanitizeNumber(
    wheelState.appliedLongitudinalForceNewtons
  )
  const preCombinedAppliedLateralForceNewtons = sanitizeNumber(
    wheelState.appliedLateralTireForceNewtons
  )
  const preCombinedTireForceMagnitudeNewtons = Math.hypot(
    preCombinedAppliedLongitudinalForceNewtons,
    preCombinedAppliedLateralForceNewtons
  )

  wheelState.preCombinedAppliedLongitudinalForceNewtons =
    preCombinedAppliedLongitudinalForceNewtons
  wheelState.preCombinedAppliedLateralForceNewtons =
    preCombinedAppliedLateralForceNewtons
  wheelState.combinedTireForceLimitNewtons = tractionLimitNewtons
  wheelState.combinedTireForceScale01 = 1
  wheelState.combinedTireForceSaturationRatio =
    tractionLimitNewtons > 0
      ? preCombinedTireForceMagnitudeNewtons / tractionLimitNewtons
      : 0
  wheelState.isCombinedTireForceSaturated = false

  if (
    combinedTireForceCapEnabled &&
    tractionLimitNewtons > 0 &&
    preCombinedTireForceMagnitudeNewtons >
      tractionLimitNewtons + combinedTireForceSaturationEpsilonNewtons
  ) {
    const combinedTireForceScale01 =
      tractionLimitNewtons / preCombinedTireForceMagnitudeNewtons

    wheelState.appliedLongitudinalForceNewtons =
      preCombinedAppliedLongitudinalForceNewtons * combinedTireForceScale01
    wheelState.appliedLateralTireForceNewtons =
      preCombinedAppliedLateralForceNewtons * combinedTireForceScale01
    wheelState.combinedTireForceScale01 = combinedTireForceScale01
    wheelState.isCombinedTireForceSaturated = true
  }

  wheelState.combinedTireForceMagnitudeNewtons = Math.hypot(
    sanitizeNumber(wheelState.appliedLongitudinalForceNewtons),
    sanitizeNumber(wheelState.appliedLateralTireForceNewtons)
  )

  return wheelState
}

export function updateLateralTireForceSummary(
  lateralTireForceSummary,
  wheelStates
) {
  resetLateralTireForceSummary(lateralTireForceSummary)

  for (const wheelState of wheelStates) {
    const appliedLateralTireForceNewtons = sanitizeNumber(
      wheelState.appliedLateralTireForceNewtons
    )
    const absAppliedLateralTireForceNewtons = Math.abs(
      appliedLateralTireForceNewtons
    )

    lateralTireForceSummary.totalLateralTireForceNewtons +=
      appliedLateralTireForceNewtons
    lateralTireForceSummary.totalLateralTireForceAbsNewtons +=
      absAppliedLateralTireForceNewtons
    lateralTireForceSummary.maxAbsLateralTireForceNewtons = Math.max(
      lateralTireForceSummary.maxAbsLateralTireForceNewtons,
      absAppliedLateralTireForceNewtons
    )

    if (wheelState.isLateralTireForceSaturated) {
      lateralTireForceSummary.lateralTireForceSaturatedWheelCount += 1
    }

    if (wheelState.isCombinedTireForceSaturated) {
      lateralTireForceSummary.combinedTireForceSaturatedWheelCount += 1
    }

    lateralTireForceSummary.maxCombinedTireForceSaturationRatio = Math.max(
      lateralTireForceSummary.maxCombinedTireForceSaturationRatio,
      Math.max(0, sanitizeNumber(wheelState.combinedTireForceSaturationRatio))
    )
  }

  return lateralTireForceSummary
}

function clampMagnitude(value, limit) {
  if (!Number.isFinite(limit) || limit <= 0) return 0
  return Math.max(-limit, Math.min(value, limit))
}

function sanitizePositiveNumber(
  value,
  fallback = DEFAULT_LATERAL_TIRE_FORCE_SPEC.lateralTireStiffnessNewtonsPerRadian
) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeNonNegativeNumber(
  value,
  fallback = 0
) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function sanitizeNumber(value) {
  return Number.isFinite(value) ? value : 0
}
