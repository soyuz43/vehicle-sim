// src/vehicle/dynamics/suspensionNormalForceState.js

import { EARTH_GRAVITY } from '../../simulation/simulationConstants.js'

const DEFAULT_SUSPENSION_SPEC = Object.freeze({
  suspensionEnabled: true,
  suspensionRestLengthMeters: 0.35,
  suspensionTravelMeters: 0.22,
  suspensionTargetStaticCompressionRatio01: 0.4,
  suspensionDampingRatio: 0.35,
  minimumNormalForceNewtons: 0,
})

const SUSPENSION_LENGTH_EPSILON_METERS = 0.000001
const RAW_SUPPORT_EPSILON_NEWTONS = 0.000001

export function createSuspensionNormalForceSummary() {
  return {
    groundedWheelCount: 0,
    airborneWheelCount: 0,
    totalSpringForceNewtons: 0,
    totalDamperForceNewtons: 0,
    totalRawSuspensionNormalForceNewtons: 0,
    totalBaseNormalForceNewtons: 0,
    vehicleWeightReferenceNewtons: 0,
    normalForceConservationErrorNewtons: 0,
    minimumSuspensionCompressionMeters: 0,
    maximumSuspensionCompressionMeters: 0,
    minimumSuspensionCurrentLengthMeters: 0,
    maximumSuspensionCurrentLengthMeters: 0,
    compressionLimitWheelCount: 0,
    droopLimitWheelCount: 0,
  }
}

export function resetSuspensionNormalForceSummary(summary) {
  summary.groundedWheelCount = 0
  summary.airborneWheelCount = 0
  summary.totalSpringForceNewtons = 0
  summary.totalDamperForceNewtons = 0
  summary.totalRawSuspensionNormalForceNewtons = 0
  summary.totalBaseNormalForceNewtons = 0
  summary.vehicleWeightReferenceNewtons = 0
  summary.normalForceConservationErrorNewtons = 0
  summary.minimumSuspensionCompressionMeters = 0
  summary.maximumSuspensionCompressionMeters = 0
  summary.minimumSuspensionCurrentLengthMeters = 0
  summary.maximumSuspensionCurrentLengthMeters = 0
  summary.compressionLimitWheelCount = 0
  summary.droopLimitWheelCount = 0

  return summary
}

export function resetWheelSuspensionNormalForceState(wheelState) {
  wheelState.suspensionEnabled = false
  wheelState.suspensionRestLengthMeters = 0
  wheelState.suspensionMinimumLengthMeters = 0
  wheelState.suspensionMaximumLengthMeters = 0
  wheelState.suspensionTravelMeters = 0
  wheelState.suspensionCurrentLengthMeters = 0
  wheelState.previousSuspensionLengthMeters = 0
  wheelState.suspensionCompressionMeters = 0
  wheelState.previousSuspensionCompressionMeters = 0
  wheelState.suspensionCompressionRatio01 = 0
  wheelState.suspensionCompressionVelocityMetersPerSecond = 0
  wheelState.suspensionVelocityMetersPerSecond = 0
  wheelState.suspensionSpringRateNewtonsPerMeter = 0
  wheelState.suspensionCompressionDampingNewtonsPerMeterPerSecond = 0
  wheelState.suspensionReboundDampingNewtonsPerMeterPerSecond = 0
  wheelState.springForceNewtons = 0
  wheelState.damperForceNewtons = 0
  wheelState.dampingForceNewtons = 0
  wheelState.rawSuspensionNormalForceNewtons = 0
  wheelState.baseNormalForceNewtons = 0
  wheelState.normalizedBaseNormalForceNewtons = 0
  wheelState.normalForceNewtons = 0
  wheelState.tractionLimitNewtons = 0
  wheelState.isSuspensionAtCompressionLimit = false
  wheelState.isSuspensionAtDroopLimit = true
  wheelState.isSuspensionBottomed = false
  wheelState.isSuspensionToppedOut = true
  wheelState.hasSuspensionCompressionSample = false

  return wheelState
}

export function updateSuspensionNormalForceState(
  wheelStates = [],
  spec = {},
  dtSeconds = 0,
  summary = null
) {
  if (!Array.isArray(wheelStates) || wheelStates.length === 0) {
    if (summary) resetSuspensionNormalForceSummary(summary)
    return wheelStates
  }

  const suspensionConfig = resolveSuspensionConfig(spec, wheelStates.length)
  const safeDtSeconds = sanitizeNonNegativeNumber(dtSeconds)
  const activeSummary = summary ?? createSuspensionNormalForceSummary()

  resetSuspensionNormalForceSummary(activeSummary)
  activeSummary.vehicleWeightReferenceNewtons =
    suspensionConfig.vehicleWeightReferenceNewtons

  let groundedWheelCount = 0
  let totalRawSuspensionNormalForceNewtons = 0

  for (const wheelState of wheelStates) {
    updateWheelSuspensionNormalForceState(
      wheelState,
      suspensionConfig,
      safeDtSeconds
    )

    if (!wheelState.isGrounded) {
      activeSummary.airborneWheelCount += 1
      continue
    }

    groundedWheelCount += 1
    activeSummary.groundedWheelCount += 1
    activeSummary.totalSpringForceNewtons += wheelState.springForceNewtons
    activeSummary.totalDamperForceNewtons += wheelState.damperForceNewtons
    activeSummary.totalRawSuspensionNormalForceNewtons +=
      wheelState.rawSuspensionNormalForceNewtons
    totalRawSuspensionNormalForceNewtons +=
      wheelState.rawSuspensionNormalForceNewtons

    if (groundedWheelCount === 1) {
      activeSummary.minimumSuspensionCompressionMeters =
        wheelState.suspensionCompressionMeters
      activeSummary.maximumSuspensionCompressionMeters =
        wheelState.suspensionCompressionMeters
      activeSummary.minimumSuspensionCurrentLengthMeters =
        wheelState.suspensionCurrentLengthMeters
      activeSummary.maximumSuspensionCurrentLengthMeters =
        wheelState.suspensionCurrentLengthMeters
    } else {
      activeSummary.minimumSuspensionCompressionMeters = Math.min(
        activeSummary.minimumSuspensionCompressionMeters,
        wheelState.suspensionCompressionMeters
      )
      activeSummary.maximumSuspensionCompressionMeters = Math.max(
        activeSummary.maximumSuspensionCompressionMeters,
        wheelState.suspensionCompressionMeters
      )
      activeSummary.minimumSuspensionCurrentLengthMeters = Math.min(
        activeSummary.minimumSuspensionCurrentLengthMeters,
        wheelState.suspensionCurrentLengthMeters
      )
      activeSummary.maximumSuspensionCurrentLengthMeters = Math.max(
        activeSummary.maximumSuspensionCurrentLengthMeters,
        wheelState.suspensionCurrentLengthMeters
      )
    }

    if (wheelState.isSuspensionAtCompressionLimit) {
      activeSummary.compressionLimitWheelCount += 1
    }
    if (wheelState.isSuspensionAtDroopLimit) {
      activeSummary.droopLimitWheelCount += 1
    }
  }

  normalizeBaseNormalForces(
    wheelStates,
    groundedWheelCount,
    totalRawSuspensionNormalForceNewtons,
    suspensionConfig.vehicleWeightReferenceNewtons
  )

  for (const wheelState of wheelStates) {
    activeSummary.totalBaseNormalForceNewtons +=
      sanitizeNonNegativeNumber(wheelState.baseNormalForceNewtons)
  }

  activeSummary.normalForceConservationErrorNewtons =
    activeSummary.totalBaseNormalForceNewtons -
    suspensionConfig.vehicleWeightReferenceNewtons

  return wheelStates
}

function updateWheelSuspensionNormalForceState(
  wheelState,
  suspensionConfig,
  dtSeconds
) {
  applySuspensionConfigToWheelState(wheelState, suspensionConfig)

  if (!suspensionConfig.enabled || wheelState.isGrounded !== true) {
    setWheelAirborneSuspensionState(wheelState, suspensionConfig)
    return wheelState
  }

  const rawCurrentLengthMeters = sanitizeNumber(
    wheelState.suspensionCurrentLengthMeters,
    suspensionConfig.maximumLengthMeters
  )
  const currentLengthMeters = clamp(
    rawCurrentLengthMeters,
    suspensionConfig.minimumLengthMeters,
    suspensionConfig.maximumLengthMeters
  )
  const compressionMeters = clamp(
    suspensionConfig.restLengthMeters - currentLengthMeters,
    0,
    suspensionConfig.travelMeters
  )
  const hasPreviousSample =
    wheelState.hasSuspensionCompressionSample === true
  const previousCompressionMeters = clamp(
    sanitizeNonNegativeNumber(wheelState.previousSuspensionCompressionMeters),
    0,
    suspensionConfig.travelMeters
  )
  const compressionVelocityMetersPerSecond =
    dtSeconds > 0 && hasPreviousSample
      ? sanitizeNumber(
          (compressionMeters - previousCompressionMeters) / dtSeconds
        )
      : 0
  const dampingCoefficientNewtonsPerMeterPerSecond =
    compressionVelocityMetersPerSecond >= 0
      ? suspensionConfig.compressionDampingNewtonsPerMeterPerSecond
      : suspensionConfig.reboundDampingNewtonsPerMeterPerSecond
  const springForceNewtons = sanitizeNonNegativeNumber(
    suspensionConfig.springRateNewtonsPerMeter * compressionMeters
  )
  const damperForceNewtons = sanitizeNumber(
    dampingCoefficientNewtonsPerMeterPerSecond *
      compressionVelocityMetersPerSecond
  )
  const rawSuspensionNormalForceNewtons = clamp(
    Math.max(0, springForceNewtons + damperForceNewtons),
    0,
    suspensionConfig.maximumNormalForceNewtons
  )

  wheelState.suspensionCurrentLengthMeters = currentLengthMeters
  wheelState.previousSuspensionLengthMeters = currentLengthMeters
  wheelState.suspensionCompressionMeters = compressionMeters
  wheelState.previousSuspensionCompressionMeters = compressionMeters
  wheelState.suspensionCompressionRatio01 = clamp01(
    compressionMeters / suspensionConfig.travelMeters
  )
  wheelState.suspensionCompressionVelocityMetersPerSecond =
    compressionVelocityMetersPerSecond
  wheelState.suspensionVelocityMetersPerSecond =
    compressionVelocityMetersPerSecond
  wheelState.springForceNewtons = springForceNewtons
  wheelState.damperForceNewtons = damperForceNewtons
  wheelState.dampingForceNewtons = damperForceNewtons
  wheelState.rawSuspensionNormalForceNewtons =
    rawSuspensionNormalForceNewtons
  wheelState.isSuspensionAtCompressionLimit =
    currentLengthMeters <=
    suspensionConfig.minimumLengthMeters + SUSPENSION_LENGTH_EPSILON_METERS
  wheelState.isSuspensionAtDroopLimit =
    currentLengthMeters >=
    suspensionConfig.maximumLengthMeters - SUSPENSION_LENGTH_EPSILON_METERS
  wheelState.isSuspensionBottomed = wheelState.isSuspensionAtCompressionLimit
  wheelState.isSuspensionToppedOut = wheelState.isSuspensionAtDroopLimit
  wheelState.hasSuspensionCompressionSample = true

  return wheelState
}

function setWheelAirborneSuspensionState(wheelState, suspensionConfig) {
  wheelState.suspensionCurrentLengthMeters =
    suspensionConfig.maximumLengthMeters
  wheelState.previousSuspensionLengthMeters =
    suspensionConfig.maximumLengthMeters
  wheelState.suspensionCompressionMeters = 0
  wheelState.previousSuspensionCompressionMeters = 0
  wheelState.suspensionCompressionRatio01 = 0
  wheelState.suspensionCompressionVelocityMetersPerSecond = 0
  wheelState.suspensionVelocityMetersPerSecond = 0
  wheelState.springForceNewtons = 0
  wheelState.damperForceNewtons = 0
  wheelState.dampingForceNewtons = 0
  wheelState.rawSuspensionNormalForceNewtons = 0
  wheelState.baseNormalForceNewtons = 0
  wheelState.normalizedBaseNormalForceNewtons = 0
  wheelState.normalForceNewtons = 0
  wheelState.tractionLimitNewtons = 0
  wheelState.isSuspensionAtCompressionLimit = false
  wheelState.isSuspensionAtDroopLimit = true
  wheelState.isSuspensionBottomed = false
  wheelState.isSuspensionToppedOut = true
  wheelState.hasSuspensionCompressionSample = false
}

function normalizeBaseNormalForces(
  wheelStates,
  groundedWheelCount,
  totalRawSuspensionNormalForceNewtons,
  vehicleWeightReferenceNewtons
) {
  if (groundedWheelCount <= 0 || vehicleWeightReferenceNewtons <= 0) {
    for (const wheelState of wheelStates) {
      wheelState.baseNormalForceNewtons = 0
      wheelState.normalizedBaseNormalForceNewtons = 0
      wheelState.normalForceNewtons = 0
      wheelState.tractionLimitNewtons = 0
    }
    return
  }

  const useRawSupportWeights =
    totalRawSuspensionNormalForceNewtons > RAW_SUPPORT_EPSILON_NEWTONS
  const equalBaseNormalForceNewtons =
    vehicleWeightReferenceNewtons / groundedWheelCount
  const rawSupportScale = useRawSupportWeights
    ? vehicleWeightReferenceNewtons / totalRawSuspensionNormalForceNewtons
    : 0

  for (const wheelState of wheelStates) {
    if (!wheelState.isGrounded) {
      wheelState.baseNormalForceNewtons = 0
      wheelState.normalizedBaseNormalForceNewtons = 0
      wheelState.normalForceNewtons = 0
      wheelState.tractionLimitNewtons = 0
      continue
    }

    const baseNormalForceNewtons = useRawSupportWeights
      ? sanitizeNonNegativeNumber(
          wheelState.rawSuspensionNormalForceNewtons
        ) * rawSupportScale
      : equalBaseNormalForceNewtons
    const finiteBaseNormalForceNewtons = sanitizeNonNegativeNumber(
      baseNormalForceNewtons
    )

    // Load transfer overwrites this provisional final value in the same fixed
    // step. Keeping it finite here gives standalone suspension callers a
    // usable base-load result without creating a second final-load owner.
    wheelState.baseNormalForceNewtons = finiteBaseNormalForceNewtons
    wheelState.normalizedBaseNormalForceNewtons = finiteBaseNormalForceNewtons
    wheelState.normalForceNewtons = finiteBaseNormalForceNewtons
    wheelState.tractionLimitNewtons = finiteProduct(
      sanitizeNonNegativeNumber(wheelState.frictionCoefficient),
      finiteBaseNormalForceNewtons
    )
  }
}

function applySuspensionConfigToWheelState(wheelState, suspensionConfig) {
  wheelState.suspensionEnabled = suspensionConfig.enabled
  wheelState.suspensionRestLengthMeters = suspensionConfig.restLengthMeters
  wheelState.suspensionMinimumLengthMeters =
    suspensionConfig.minimumLengthMeters
  wheelState.suspensionMaximumLengthMeters =
    suspensionConfig.maximumLengthMeters
  wheelState.suspensionTravelMeters = suspensionConfig.travelMeters
  wheelState.suspensionSpringRateNewtonsPerMeter =
    suspensionConfig.springRateNewtonsPerMeter
  wheelState.suspensionCompressionDampingNewtonsPerMeterPerSecond =
    suspensionConfig.compressionDampingNewtonsPerMeterPerSecond
  wheelState.suspensionReboundDampingNewtonsPerMeterPerSecond =
    suspensionConfig.reboundDampingNewtonsPerMeterPerSecond
}

function resolveSuspensionConfig(spec, wheelCount) {
  const massKg = sanitizePositiveNumber(spec.massKg, 1)
  const gravityMetersPerSecondSquared = sanitizePositiveNumber(
    spec.gravityMetersPerSecondSquared,
    EARTH_GRAVITY.standardMetersPerSecondSquared
  )
  const safeWheelCount = Math.max(1, sanitizeInteger(wheelCount, 1))
  const requestedRestLengthMeters = sanitizePositiveNumber(
    spec.suspensionRestLengthMeters,
    DEFAULT_SUSPENSION_SPEC.suspensionRestLengthMeters
  )
  const requestedTravelMeters = sanitizePositiveNumber(
    spec.suspensionTravelMeters,
    DEFAULT_SUSPENSION_SPEC.suspensionTravelMeters
  )
  const maximumLengthMeters = sanitizePositiveNumber(
    spec.suspensionMaximumLengthMeters,
    requestedRestLengthMeters
  )
  const minimumLengthMeters = clamp(
    sanitizePositiveNumber(
      spec.suspensionMinimumLengthMeters,
      maximumLengthMeters - requestedTravelMeters
    ),
    SUSPENSION_LENGTH_EPSILON_METERS,
    maximumLengthMeters - SUSPENSION_LENGTH_EPSILON_METERS
  )
  const travelMeters = Math.max(
    maximumLengthMeters - minimumLengthMeters,
    SUSPENSION_LENGTH_EPSILON_METERS
  )
  const restLengthMeters = clamp(
    requestedRestLengthMeters,
    minimumLengthMeters,
    maximumLengthMeters
  )
  const targetStaticCompressionRatio01 = clamp(
    sanitizePositiveNumber(
      spec.suspensionTargetStaticCompressionRatio01,
      DEFAULT_SUSPENSION_SPEC.suspensionTargetStaticCompressionRatio01
    ),
    SUSPENSION_LENGTH_EPSILON_METERS,
    1
  )
  const vehicleWeightReferenceNewtons = finiteProduct(
    massKg,
    gravityMetersPerSecondSquared
  )
  const staticNormalForcePerWheelNewtons =
    vehicleWeightReferenceNewtons / safeWheelCount
  const targetStaticCompressionMeters = Math.max(
    travelMeters * targetStaticCompressionRatio01,
    SUSPENSION_LENGTH_EPSILON_METERS
  )
  const derivedSpringRateNewtonsPerMeter =
    staticNormalForcePerWheelNewtons / targetStaticCompressionMeters
  const springRateNewtonsPerMeter = sanitizePositiveNumber(
    spec.suspensionSpringRateNewtonsPerMeter,
    Math.max(derivedSpringRateNewtonsPerMeter, 1)
  )
  const sprungMassPerWheelKg = massKg / safeWheelCount
  const dampingRatio = sanitizeNonNegativeNumber(
    spec.suspensionDampingRatio,
    DEFAULT_SUSPENSION_SPEC.suspensionDampingRatio
  )
  const derivedDampingRateNewtonsPerMeterPerSecond = finiteProduct(
    2,
    dampingRatio,
    Math.sqrt(springRateNewtonsPerMeter * sprungMassPerWheelKg)
  )
  const legacyDampingRateNewtonsPerMeterPerSecond =
    sanitizeNonNegativeNumber(
      spec.suspensionDampingRateNewtonsSecondPerMeter,
      derivedDampingRateNewtonsPerMeterPerSecond
    )
  const compressionDampingNewtonsPerMeterPerSecond =
    sanitizeNonNegativeNumber(
      spec.suspensionCompressionDampingNewtonsPerMeterPerSecond,
      legacyDampingRateNewtonsPerMeterPerSecond
    )
  const reboundDampingNewtonsPerMeterPerSecond =
    sanitizeNonNegativeNumber(
      spec.suspensionReboundDampingNewtonsPerMeterPerSecond,
      legacyDampingRateNewtonsPerMeterPerSecond
    )
  const minimumNormalForceNewtons = sanitizeNonNegativeNumber(
    spec.minimumNormalForceNewtons,
    DEFAULT_SUSPENSION_SPEC.minimumNormalForceNewtons
  )
  const maximumNormalForceNewtons = Math.max(
    minimumNormalForceNewtons,
    sanitizePositiveNumber(
      spec.maximumSuspensionNormalForceNewtons,
      vehicleWeightReferenceNewtons
    )
  )

  return {
    enabled: spec.suspensionEnabled !== false,
    restLengthMeters,
    minimumLengthMeters,
    maximumLengthMeters,
    travelMeters,
    springRateNewtonsPerMeter,
    compressionDampingNewtonsPerMeterPerSecond,
    reboundDampingNewtonsPerMeterPerSecond,
    minimumNormalForceNewtons,
    maximumNormalForceNewtons,
    vehicleWeightReferenceNewtons,
  }
}

function finiteProduct(...values) {
  let result = 1

  for (const value of values) {
    if (!Number.isFinite(value)) return 0
    result *= value
    if (!Number.isFinite(result)) return 0
  }

  return result
}

function sanitizeInteger(value, fallback = 0) {
  return Number.isInteger(value) && value > 0 ? value : fallback
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

function clamp01(value) {
  return clamp(sanitizeNumber(value), 0, 1)
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, sanitizeNumber(value)))
}
