// src/vehicle/dynamics/tirePressureHandlingState.js

const DEFAULT_TIRE_PRESSURE_HANDLING_SPEC = Object.freeze({
  tirePressureHandlingEnabled: true,
  recommendedTirePressureKpa: 220,
  minimumCalculationTirePressureKpa: 20,
  minimumEffectiveTirePressureKpa: 0,
  maximumEffectiveTirePressureKpa: 280,
  baseTireRollingRadiusMeters: 0.48,
  minimumEffectiveTireRollingRadiusMeters: 0.39,
  underInflationRollingRadiusLossFraction: 0.1875,
  overInflationRollingRadiusGainFraction: 0.02,
  minimumPressureLongitudinalStiffnessMultiplier: 0.46,
  maximumPressureLongitudinalStiffnessMultiplier: 1.04,
  minimumPressureLateralStiffnessMultiplier: 0.48,
  maximumPressureLateralStiffnessMultiplier: 1.06,
  longitudinalTireStiffnessNewtonsPerSlipRatio: 1600,
  lateralTireStiffnessNewtonsPerRadian: 6000,
  rollingResistanceCoefficient: 0.015,
  underInflationRollingResistanceCoefficientGain: 0.05,
  overInflationRollingResistanceCoefficientChange: -0.002,
  rollingResistanceDeadSpeedMetersPerSecond: 0.35,
})

const TIRE_PRESSURE_STATES = Object.freeze({
  SEVERELY_UNDERINFLATED: 'severely_underinflated',
  UNDERINFLATED: 'underinflated',
  NOMINAL: 'nominal',
  OVERINFLATED: 'overinflated',
  SEVERELY_OVERINFLATED: 'severely_overinflated',
})

const NOMINAL_PRESSURE_RATIO_LOW = 0.95
const NOMINAL_PRESSURE_RATIO_HIGH = 1.05
const SEVERE_UNDERINFLATION_RATIO = 0.75
const SEVERE_OVERINFLATION_RATIO = 1.2

export function createTirePressureHandlingSummary() {
  return {
    minTirePressureKpa: 0,
    maxTirePressureKpa: 0,
    averageTirePressureKpa: 0,
    minTirePressureRatio: 0,
    maxTirePressureRatio: 0,
    averagePressureLongitudinalStiffnessMultiplier: 0,
    averagePressureLateralStiffnessMultiplier: 0,
    minEffectiveTireRollingRadiusMeters: 0,
    maxEffectiveTireRollingRadiusMeters: 0,
    totalRollingResistanceForceAbsNewtons: 0,
    underInflatedWheelCount: 0,
    overInflatedWheelCount: 0,
    severePressureWheelCount: 0,
    dominantTirePressureState: TIRE_PRESSURE_STATES.NOMINAL,
  }
}

export function resetTirePressureHandlingSummary(tirePressureHandlingSummary) {
  tirePressureHandlingSummary.minTirePressureKpa = 0
  tirePressureHandlingSummary.maxTirePressureKpa = 0
  tirePressureHandlingSummary.averageTirePressureKpa = 0
  tirePressureHandlingSummary.minTirePressureRatio = 0
  tirePressureHandlingSummary.maxTirePressureRatio = 0
  tirePressureHandlingSummary.averagePressureLongitudinalStiffnessMultiplier = 0
  tirePressureHandlingSummary.averagePressureLateralStiffnessMultiplier = 0
  tirePressureHandlingSummary.minEffectiveTireRollingRadiusMeters = 0
  tirePressureHandlingSummary.maxEffectiveTireRollingRadiusMeters = 0
  tirePressureHandlingSummary.totalRollingResistanceForceAbsNewtons = 0
  tirePressureHandlingSummary.underInflatedWheelCount = 0
  tirePressureHandlingSummary.overInflatedWheelCount = 0
  tirePressureHandlingSummary.severePressureWheelCount = 0
  tirePressureHandlingSummary.dominantTirePressureState =
    TIRE_PRESSURE_STATES.NOMINAL

  return tirePressureHandlingSummary
}

export function resetWheelTirePressureHandlingState(wheelState, spec = {}) {
  const baseRollingRadiusMeters = getBaseRollingRadiusMeters(wheelState, spec)
  const baseLongitudinalTireStiffnessNewtonsPerSlipRatio =
    sanitizePositiveNumber(
      spec.longitudinalTireStiffnessNewtonsPerSlipRatio,
      DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.longitudinalTireStiffnessNewtonsPerSlipRatio
    )
  const baseLateralTireStiffnessNewtonsPerRadian = sanitizePositiveNumber(
    spec.lateralTireStiffnessNewtonsPerRadian,
    DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.lateralTireStiffnessNewtonsPerRadian
  )
  const recommendedTirePressureKpa = getRecommendedTirePressureKpa(spec)
  const currentTirePressureKpa = sanitizePublicTirePressureKpa(
    wheelState.tirePressureKpa,
    recommendedTirePressureKpa
  )

  wheelState.tirePressureRatio =
    recommendedTirePressureKpa > 0
      ? currentTirePressureKpa / recommendedTirePressureKpa
      : 1
  wheelState.calculationTirePressureKpa = resolveCalculationTirePressureKpa(
    currentTirePressureKpa,
    spec
  )
  wheelState.tirePressureState = TIRE_PRESSURE_STATES.NOMINAL
  wheelState.tirePressureStateReason = 'reset baseline pressure state'
  wheelState.effectiveTireRollingRadiusMeters = baseRollingRadiusMeters
  wheelState.tirePressureLongitudinalStiffnessMultiplier = 1
  wheelState.tirePressureLateralStiffnessMultiplier = 1
  wheelState.pressureAdjustedLongitudinalTireStiffnessNewtonsPerSlipRatio =
    baseLongitudinalTireStiffnessNewtonsPerSlipRatio
  wheelState.pressureAdjustedLateralTireStiffnessNewtonsPerRadian =
    baseLateralTireStiffnessNewtonsPerRadian
  wheelState.rollingResistanceCoefficient = sanitizeNonNegativeNumber(
    spec.rollingResistanceCoefficient,
    DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.rollingResistanceCoefficient
  )
  wheelState.rollingResistanceForceNewtons = 0
  wheelState.isUnderInflated = false
  wheelState.isOverInflated = false

  return wheelState
}

export function updateTirePressureHandlingState(
  wheelStates,
  spec,
  tirePressureHandlingSummary
) {
  resetTirePressureHandlingSummary(tirePressureHandlingSummary)

  const pressureStateCounts = {
    [TIRE_PRESSURE_STATES.SEVERELY_UNDERINFLATED]: 0,
    [TIRE_PRESSURE_STATES.UNDERINFLATED]: 0,
    [TIRE_PRESSURE_STATES.NOMINAL]: 0,
    [TIRE_PRESSURE_STATES.OVERINFLATED]: 0,
    [TIRE_PRESSURE_STATES.SEVERELY_OVERINFLATED]: 0,
  }

  let sampledWheelCount = 0

  for (const wheelState of wheelStates) {
    updateWheelTirePressureHandlingState(wheelState, spec)

    const tirePressureKpa = sanitizeNonNegativeNumber(wheelState.tirePressureKpa)
    const tirePressureRatio = sanitizeNonNegativeNumber(
      wheelState.tirePressureRatio,
      1
    )
    const effectiveTireRollingRadiusMeters = sanitizePositiveNumber(
      wheelState.effectiveTireRollingRadiusMeters,
      getBaseRollingRadiusMeters(wheelState, spec)
    )

    if (sampledWheelCount === 0) {
      tirePressureHandlingSummary.minTirePressureKpa = tirePressureKpa
      tirePressureHandlingSummary.maxTirePressureKpa = tirePressureKpa
      tirePressureHandlingSummary.minTirePressureRatio = tirePressureRatio
      tirePressureHandlingSummary.maxTirePressureRatio = tirePressureRatio
      tirePressureHandlingSummary.minEffectiveTireRollingRadiusMeters =
        effectiveTireRollingRadiusMeters
      tirePressureHandlingSummary.maxEffectiveTireRollingRadiusMeters =
        effectiveTireRollingRadiusMeters
    } else {
      tirePressureHandlingSummary.minTirePressureKpa = Math.min(
        tirePressureHandlingSummary.minTirePressureKpa,
        tirePressureKpa
      )
      tirePressureHandlingSummary.maxTirePressureKpa = Math.max(
        tirePressureHandlingSummary.maxTirePressureKpa,
        tirePressureKpa
      )
      tirePressureHandlingSummary.minTirePressureRatio = Math.min(
        tirePressureHandlingSummary.minTirePressureRatio,
        tirePressureRatio
      )
      tirePressureHandlingSummary.maxTirePressureRatio = Math.max(
        tirePressureHandlingSummary.maxTirePressureRatio,
        tirePressureRatio
      )
      tirePressureHandlingSummary.minEffectiveTireRollingRadiusMeters =
        Math.min(
          tirePressureHandlingSummary.minEffectiveTireRollingRadiusMeters,
          effectiveTireRollingRadiusMeters
        )
      tirePressureHandlingSummary.maxEffectiveTireRollingRadiusMeters =
        Math.max(
          tirePressureHandlingSummary.maxEffectiveTireRollingRadiusMeters,
          effectiveTireRollingRadiusMeters
        )
    }

    tirePressureHandlingSummary.averageTirePressureKpa += tirePressureKpa
    tirePressureHandlingSummary.averagePressureLongitudinalStiffnessMultiplier +=
      sanitizePositiveNumber(
        wheelState.tirePressureLongitudinalStiffnessMultiplier,
        1
      )
    tirePressureHandlingSummary.averagePressureLateralStiffnessMultiplier +=
      sanitizePositiveNumber(wheelState.tirePressureLateralStiffnessMultiplier, 1)

    if (wheelState.isUnderInflated) {
      tirePressureHandlingSummary.underInflatedWheelCount += 1
    }

    if (wheelState.isOverInflated) {
      tirePressureHandlingSummary.overInflatedWheelCount += 1
    }

    if (
      wheelState.tirePressureState ===
        TIRE_PRESSURE_STATES.SEVERELY_UNDERINFLATED ||
      wheelState.tirePressureState ===
        TIRE_PRESSURE_STATES.SEVERELY_OVERINFLATED
    ) {
      tirePressureHandlingSummary.severePressureWheelCount += 1
    }

    pressureStateCounts[wheelState.tirePressureState] += 1
    sampledWheelCount += 1
  }

  if (sampledWheelCount > 0) {
    tirePressureHandlingSummary.averageTirePressureKpa /= sampledWheelCount
    tirePressureHandlingSummary.averagePressureLongitudinalStiffnessMultiplier /=
      sampledWheelCount
    tirePressureHandlingSummary.averagePressureLateralStiffnessMultiplier /=
      sampledWheelCount
  }

  tirePressureHandlingSummary.dominantTirePressureState =
    selectDominantTirePressureState(pressureStateCounts)

  return tirePressureHandlingSummary
}

export function calculateWheelRollingResistanceForce(
  wheelState,
  localForwardVelocityMetersPerSecond,
  spec = {}
) {
  if (!wheelState.isGrounded) {
    wheelState.rollingResistanceForceNewtons = 0
    return 0
  }

  const rollingResistanceCoefficient = sanitizeNonNegativeNumber(
    wheelState.rollingResistanceCoefficient,
    sanitizeNonNegativeNumber(
      spec.rollingResistanceCoefficient,
      DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.rollingResistanceCoefficient
    )
  )
  const normalForceNewtons = sanitizeNonNegativeNumber(
    wheelState.normalForceNewtons
  )
  const rollingResistanceDeadSpeedMetersPerSecond = sanitizePositiveNumber(
    spec.rollingResistanceDeadSpeedMetersPerSecond,
    DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.rollingResistanceDeadSpeedMetersPerSecond
  )
  const speedMetersPerSecond = sanitizeNumber(localForwardVelocityMetersPerSecond)
  const speedAbsMetersPerSecond = Math.abs(speedMetersPerSecond)

  if (
    normalForceNewtons <= 0 ||
    rollingResistanceCoefficient <= 0 ||
    speedAbsMetersPerSecond <= 0
  ) {
    wheelState.rollingResistanceForceNewtons = 0
    return 0
  }

  const fadeScale01 = clamp01(
    speedAbsMetersPerSecond / rollingResistanceDeadSpeedMetersPerSecond
  )
  const speedDirection = Math.sign(speedMetersPerSecond)
  const rollingResistanceForceNewtons =
    -speedDirection *
    rollingResistanceCoefficient *
    normalForceNewtons *
    fadeScale01

  wheelState.rollingResistanceForceNewtons = rollingResistanceForceNewtons

  return rollingResistanceForceNewtons
}

function updateWheelTirePressureHandlingState(wheelState, spec = {}) {
  const tirePressureHandlingEnabled = spec.tirePressureHandlingEnabled !== false
  const recommendedTirePressureKpa = getRecommendedTirePressureKpa(spec)
  const minimumEffectiveTirePressureKpa = Math.min(
    sanitizeNonNegativeNumber(
      spec.minimumEffectiveTirePressureKpa,
      DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.minimumEffectiveTirePressureKpa
    ),
    recommendedTirePressureKpa
  )
  const maximumEffectiveTirePressureKpa = Math.max(
    sanitizePositiveNumber(
      spec.maximumEffectiveTirePressureKpa,
      DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.maximumEffectiveTirePressureKpa
    ),
    recommendedTirePressureKpa
  )
  const currentTirePressureKpa = sanitizePublicTirePressureKpa(
    wheelState.tirePressureKpa,
    recommendedTirePressureKpa
  )
  const calculationTirePressureKpa = resolveCalculationTirePressureKpa(
    currentTirePressureKpa,
    spec
  )
  const tirePressureRatio =
    recommendedTirePressureKpa > 0
      ? currentTirePressureKpa / recommendedTirePressureKpa
      : 1
  const effectiveTirePressureKpa = tirePressureHandlingEnabled
    ? clamp(
        currentTirePressureKpa,
        minimumEffectiveTirePressureKpa,
        maximumEffectiveTirePressureKpa
      )
    : recommendedTirePressureKpa
  const underInflationRatio01 = tirePressureHandlingEnabled
    ? calculateNonlinearUnderInflationResponse(
        currentTirePressureKpa,
        recommendedTirePressureKpa
      )
    : 0
  const overInflationRatio01 = tirePressureHandlingEnabled
    ? calculateNonlinearOverInflationResponse(
        currentTirePressureKpa,
        recommendedTirePressureKpa,
        maximumEffectiveTirePressureKpa
      )
    : 0
  const baseRollingRadiusMeters = getBaseRollingRadiusMeters(wheelState, spec)
  const minimumEffectiveTireRollingRadiusMeters = Math.min(
    sanitizePositiveNumber(
      spec.minimumEffectiveTireRollingRadiusMeters,
      DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.minimumEffectiveTireRollingRadiusMeters
    ),
    baseRollingRadiusMeters
  )
  const underInflationRollingRadiusLossFraction = sanitizeNonNegativeNumber(
    spec.underInflationRollingRadiusLossFraction,
    DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.underInflationRollingRadiusLossFraction
  )
  const overInflationRollingRadiusGainFraction = sanitizeNonNegativeNumber(
    spec.overInflationRollingRadiusGainFraction,
    DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.overInflationRollingRadiusGainFraction
  )
  const minimumPressureLongitudinalStiffnessMultiplier = sanitizePositiveNumber(
    spec.minimumPressureLongitudinalStiffnessMultiplier,
    DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.minimumPressureLongitudinalStiffnessMultiplier
  )
  const maximumPressureLongitudinalStiffnessMultiplier = sanitizePositiveNumber(
    spec.maximumPressureLongitudinalStiffnessMultiplier,
    DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.maximumPressureLongitudinalStiffnessMultiplier
  )
  const minimumPressureLateralStiffnessMultiplier = sanitizePositiveNumber(
    spec.minimumPressureLateralStiffnessMultiplier,
    DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.minimumPressureLateralStiffnessMultiplier
  )
  const maximumPressureLateralStiffnessMultiplier = sanitizePositiveNumber(
    spec.maximumPressureLateralStiffnessMultiplier,
    DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.maximumPressureLateralStiffnessMultiplier
  )
  const baseLongitudinalTireStiffnessNewtonsPerSlipRatio =
    sanitizePositiveNumber(
      spec.longitudinalTireStiffnessNewtonsPerSlipRatio,
      DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.longitudinalTireStiffnessNewtonsPerSlipRatio
    )
  const baseLateralTireStiffnessNewtonsPerRadian = sanitizePositiveNumber(
    spec.lateralTireStiffnessNewtonsPerRadian,
    DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.lateralTireStiffnessNewtonsPerRadian
  )
  const baseRollingResistanceCoefficient = sanitizeNonNegativeNumber(
    spec.rollingResistanceCoefficient,
    DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.rollingResistanceCoefficient
  )
  const underInflationRollingResistanceCoefficientGain =
    sanitizeNonNegativeNumber(
      spec.underInflationRollingResistanceCoefficientGain,
      DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.underInflationRollingResistanceCoefficientGain
    )
  const overInflationRollingResistanceCoefficientChange = sanitizeNumber(
    spec.overInflationRollingResistanceCoefficientChange,
    DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.overInflationRollingResistanceCoefficientChange
  )

  wheelState.tirePressureRatio = tirePressureRatio
  wheelState.calculationTirePressureKpa = calculationTirePressureKpa
  wheelState.tirePressureState = classifyTirePressureState({
    currentTirePressureKpa,
    tirePressureRatio,
    minimumEffectiveTirePressureKpa,
    maximumEffectiveTirePressureKpa,
  })
  wheelState.tirePressureStateReason = describeTirePressureStateReason({
    tirePressureState: wheelState.tirePressureState,
    currentTirePressureKpa,
    minimumEffectiveTirePressureKpa,
    maximumEffectiveTirePressureKpa,
  })
  wheelState.effectiveTireRollingRadiusMeters = clamp(
    baseRollingRadiusMeters *
      (1 -
        underInflationRollingRadiusLossFraction * underInflationRatio01 +
        overInflationRollingRadiusGainFraction * overInflationRatio01),
    minimumEffectiveTireRollingRadiusMeters,
    baseRollingRadiusMeters * (1 + overInflationRollingRadiusGainFraction)
  )
  wheelState.tirePressureLongitudinalStiffnessMultiplier =
    underInflationRatio01 > 0
      ? lerp(
          1,
          minimumPressureLongitudinalStiffnessMultiplier,
          underInflationRatio01
        )
      : lerp(
          1,
          maximumPressureLongitudinalStiffnessMultiplier,
          overInflationRatio01
        )
  wheelState.tirePressureLateralStiffnessMultiplier =
    underInflationRatio01 > 0
      ? lerp(
          1,
          minimumPressureLateralStiffnessMultiplier,
          underInflationRatio01
        )
      : lerp(
          1,
          maximumPressureLateralStiffnessMultiplier,
          overInflationRatio01
        )
  wheelState.pressureAdjustedLongitudinalTireStiffnessNewtonsPerSlipRatio =
    baseLongitudinalTireStiffnessNewtonsPerSlipRatio *
    wheelState.tirePressureLongitudinalStiffnessMultiplier
  wheelState.pressureAdjustedLateralTireStiffnessNewtonsPerRadian =
    baseLateralTireStiffnessNewtonsPerRadian *
    wheelState.tirePressureLateralStiffnessMultiplier
  wheelState.rollingResistanceCoefficient = Math.max(
    0,
    baseRollingResistanceCoefficient +
      underInflationRollingResistanceCoefficientGain *
        underInflationRatio01 +
      overInflationRollingResistanceCoefficientChange * overInflationRatio01
  )
  wheelState.isUnderInflated =
    wheelState.tirePressureState ===
      TIRE_PRESSURE_STATES.UNDERINFLATED ||
    wheelState.tirePressureState ===
      TIRE_PRESSURE_STATES.SEVERELY_UNDERINFLATED
  wheelState.isOverInflated =
    wheelState.tirePressureState === TIRE_PRESSURE_STATES.OVERINFLATED ||
    wheelState.tirePressureState ===
      TIRE_PRESSURE_STATES.SEVERELY_OVERINFLATED

  if (!wheelState.isGrounded) {
    wheelState.rollingResistanceForceNewtons = 0
  }

  return wheelState
}

function classifyTirePressureState({
  currentTirePressureKpa,
  tirePressureRatio,
  minimumEffectiveTirePressureKpa,
  maximumEffectiveTirePressureKpa,
}) {
  if (
    currentTirePressureKpa <= minimumEffectiveTirePressureKpa ||
    tirePressureRatio <= SEVERE_UNDERINFLATION_RATIO
  ) {
    return TIRE_PRESSURE_STATES.SEVERELY_UNDERINFLATED
  }

  if (tirePressureRatio < NOMINAL_PRESSURE_RATIO_LOW) {
    return TIRE_PRESSURE_STATES.UNDERINFLATED
  }

  if (
    currentTirePressureKpa >= maximumEffectiveTirePressureKpa ||
    tirePressureRatio >= SEVERE_OVERINFLATION_RATIO
  ) {
    return TIRE_PRESSURE_STATES.SEVERELY_OVERINFLATED
  }

  if (tirePressureRatio > NOMINAL_PRESSURE_RATIO_HIGH) {
    return TIRE_PRESSURE_STATES.OVERINFLATED
  }

  return TIRE_PRESSURE_STATES.NOMINAL
}

function describeTirePressureStateReason({
  tirePressureState,
  currentTirePressureKpa,
  minimumEffectiveTirePressureKpa,
  maximumEffectiveTirePressureKpa,
}) {
  switch (tirePressureState) {
    case TIRE_PRESSURE_STATES.SEVERELY_UNDERINFLATED:
      return currentTirePressureKpa <= minimumEffectiveTirePressureKpa
        ? 'clamped to minimum effective pressure behavior'
        : 'pressure ratio far below the nominal handling band'
    case TIRE_PRESSURE_STATES.UNDERINFLATED:
      return 'pressure below the nominal handling band'
    case TIRE_PRESSURE_STATES.SEVERELY_OVERINFLATED:
      return currentTirePressureKpa >= maximumEffectiveTirePressureKpa
        ? 'clamped to maximum effective pressure behavior'
        : 'pressure ratio far above the nominal handling band'
    case TIRE_PRESSURE_STATES.OVERINFLATED:
      return 'pressure above the nominal handling band'
    default:
      return 'pressure within the nominal handling band'
  }
}

function selectDominantTirePressureState(pressureStateCounts) {
  const orderedStates = [
    TIRE_PRESSURE_STATES.SEVERELY_UNDERINFLATED,
    TIRE_PRESSURE_STATES.UNDERINFLATED,
    TIRE_PRESSURE_STATES.NOMINAL,
    TIRE_PRESSURE_STATES.OVERINFLATED,
    TIRE_PRESSURE_STATES.SEVERELY_OVERINFLATED,
  ]
  let dominantTirePressureState = TIRE_PRESSURE_STATES.NOMINAL
  let dominantCount = -1

  for (const tirePressureState of orderedStates) {
    const count = pressureStateCounts[tirePressureState] ?? 0

    if (count > dominantCount) {
      dominantTirePressureState = tirePressureState
      dominantCount = count
    }
  }

  return dominantTirePressureState
}

function getRecommendedTirePressureKpa(spec = {}) {
  return sanitizePositiveNumber(
    spec.recommendedTirePressureKpa,
    sanitizePositiveNumber(
      spec.defaultTirePressureKpa,
      DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.recommendedTirePressureKpa
    )
  )
}

function getBaseRollingRadiusMeters(wheelState, spec = {}) {
  return sanitizePositiveNumber(
    wheelState.radius,
    sanitizePositiveNumber(
      spec.baseTireRollingRadiusMeters,
      DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.baseTireRollingRadiusMeters
    )
  )
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function clamp01(value) {
  return clamp(value, 0, 1)
}

function lerp(start, end, alpha) {
  return start + (end - start) * clamp01(alpha)
}

function sanitizePublicTirePressureKpa(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function resolveCalculationTirePressureKpa(actualTirePressureKpa, spec = {}) {
  const minimumCalculationTirePressureKpa = sanitizePositiveNumber(
    spec.minimumCalculationTirePressureKpa,
    DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.minimumCalculationTirePressureKpa
  )
  const maximumEffectiveTirePressureKpa = sanitizePositiveNumber(
    spec.maximumEffectiveTirePressureKpa,
    DEFAULT_TIRE_PRESSURE_HANDLING_SPEC.maximumEffectiveTirePressureKpa
  )
  return clamp(
    Math.max(actualTirePressureKpa, minimumCalculationTirePressureKpa),
    minimumCalculationTirePressureKpa,
    maximumEffectiveTirePressureKpa
  )
}

function calculateNonlinearUnderInflationResponse(actualTirePressureKpa, recommendedTirePressureKpa) {
  if (recommendedTirePressureKpa <= 0) return 0
  const pressureRatio = actualTirePressureKpa / recommendedTirePressureKpa
  const severeDeflation01 = 1 - smoothstep(0, 0.55, pressureRatio)
  const moderateDeflation01 = 1 - smoothstep(0.35, 0.85, pressureRatio)
  const nominalUnderinflation01 = 1 - smoothstep(0.82, 0.95, pressureRatio)
  return clamp01(
    nominalUnderinflation01 * 0.06 +
      moderateDeflation01 * 0.37 +
      severeDeflation01 * 0.57
  )
}

function calculateNonlinearOverInflationResponse(actualTirePressureKpa, recommendedTirePressureKpa, maximumEffectiveTirePressureKpa) {
  if (recommendedTirePressureKpa <= 0) return 0
  return smoothstep(
    1,
    Math.max(1.01, maximumEffectiveTirePressureKpa / recommendedTirePressureKpa),
    actualTirePressureKpa / recommendedTirePressureKpa
  )
}

function smoothstep(edge0, edge1, value) {
  const span = edge1 - edge0
  if (span <= Number.EPSILON) return value >= edge1 ? 1 : 0
  const t = clamp01((value - edge0) / span)
  return t * t * (3 - 2 * t)
}

function sanitizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeNonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}
