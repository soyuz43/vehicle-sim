// src/vehicle/dynamics/suspensionNormalForceState.js

import { EARTH_GRAVITY } from '../../simulation/simulationConstants.js'
import { resolveSuspensionTravelLimits } from './suspensionTravelLimits.js'
import { computeProgressiveSuspensionStopForceNewtons } from './suspensionStopForces.js'

const DEFAULT_SUSPENSION_SPEC = Object.freeze({
  suspensionEnabled: true,
  suspensionRestLengthMeters: 0.35,
  suspensionTravelMeters: 0.22,
  suspensionTargetStaticCompressionRatio01: 0.4,
  suspensionDampingRatio: 0.35,
  suspensionBumpStopEngagementMeters: 0.05,
  suspensionBumpStopMaximumForceNewtons: 10000,
  suspensionReboundStopEngagementMeters: 0.04,
  suspensionReboundStopMaximumForceNewtons: 5000,
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
    totalBumpStopForceNewtons: 0,
    totalReboundStopForceNewtons: 0,
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
  summary.totalBumpStopForceNewtons = 0
  summary.totalReboundStopForceNewtons = 0
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
  wheelState.suspensionMaximumCompressionMeters = 0
  wheelState.suspensionMaximumDroopMeters = 0
  wheelState.suspensionBumpStopEngagementMeters = 0
  wheelState.suspensionBumpStopMaximumForceNewtons = 0
  wheelState.suspensionReboundStopEngagementMeters = 0
  wheelState.suspensionReboundStopMaximumForceNewtons = 0
  wheelState.suspensionCurrentLengthMeters = 0
  wheelState.previousSuspensionLengthMeters = 0
  wheelState.suspensionCompressionMeters = 0
  wheelState.suspensionDroopMeters = 0
  wheelState.previousSuspensionCompressionMeters = 0
  wheelState.suspensionCompressionRatio01 = 0
  wheelState.suspensionCompressionVelocityMetersPerSecond = 0
  wheelState.suspensionVelocityMetersPerSecond = 0
  wheelState.suspensionSpringRateNewtonsPerMeter = 0
  wheelState.suspensionCompressionDampingNewtonsPerMeterPerSecond = 0
  wheelState.suspensionReboundDampingNewtonsPerMeterPerSecond = 0
  wheelState.springForceNewtons = 0
  wheelState.damperForceNewtons = 0
  wheelState.bumpStopForceNewtons = 0
  wheelState.reboundStopForceNewtons = 0
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

  const suspensionConfigs = resolveSuspensionConfigs(spec, wheelStates.length)
  const safeDtSeconds = sanitizeNonNegativeNumber(dtSeconds)
  const activeSummary = summary ?? createSuspensionNormalForceSummary()

  resetSuspensionNormalForceSummary(activeSummary)
  activeSummary.vehicleWeightReferenceNewtons =
    suspensionConfigs.front.vehicleWeightReferenceNewtons

  let groundedWheelCount = 0
  let totalRawSuspensionNormalForceNewtons = 0

  for (const wheelState of wheelStates) {
    // Phase B.1: each axle consumes its own suspension config. The front
    // axle reads the front slot spec, the rear axle reads the rear slot.
    const axleConfig = wheelState.axle === 'rear'
      ? suspensionConfigs.rear
      : suspensionConfigs.front
    updateWheelSuspensionNormalForceState(
      wheelState,
      axleConfig,
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
    activeSummary.totalBumpStopForceNewtons += wheelState.bumpStopForceNewtons
    activeSummary.totalReboundStopForceNewtons += wheelState.reboundStopForceNewtons
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
    suspensionConfigs.front.vehicleWeightReferenceNewtons
  )

  for (const wheelState of wheelStates) {
    activeSummary.totalBaseNormalForceNewtons +=
      sanitizeNonNegativeNumber(wheelState.baseNormalForceNewtons)
  }

  activeSummary.normalForceConservationErrorNewtons =
    activeSummary.totalBaseNormalForceNewtons -
    suspensionConfigs.front.vehicleWeightReferenceNewtons

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
  const droopMeters = clamp(
    currentLengthMeters - suspensionConfig.restLengthMeters,
    0,
    suspensionConfig.maximumDroopMeters
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
  const bumpStopForceNewtons = computeProgressiveSuspensionStopForceNewtons(
    compressionMeters,
    suspensionConfig.maximumCompressionMeters,
    suspensionConfig.bumpStopEngagementMeters,
    suspensionConfig.bumpStopMaximumForceNewtons
  )
  const reboundStopForceNewtons = computeProgressiveSuspensionStopForceNewtons(
    droopMeters,
    suspensionConfig.maximumDroopMeters,
    suspensionConfig.reboundStopEngagementMeters,
    suspensionConfig.reboundStopMaximumForceNewtons
  )
  const rawSuspensionNormalForceNewtons = clamp(
    Math.max(
      0,
      springForceNewtons +
        bumpStopForceNewtons -
        reboundStopForceNewtons +
        damperForceNewtons
    ),
    0,
    suspensionConfig.maximumNormalForceNewtons
  )

  wheelState.suspensionCurrentLengthMeters = currentLengthMeters
  wheelState.previousSuspensionLengthMeters = currentLengthMeters
  wheelState.suspensionCompressionMeters = compressionMeters
  wheelState.suspensionDroopMeters = droopMeters
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
  wheelState.bumpStopForceNewtons = bumpStopForceNewtons
  wheelState.reboundStopForceNewtons = reboundStopForceNewtons
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
  wheelState.suspensionDroopMeters = 0
  wheelState.previousSuspensionCompressionMeters = 0
  wheelState.suspensionCompressionRatio01 = 0
  wheelState.suspensionCompressionVelocityMetersPerSecond = 0
  wheelState.suspensionVelocityMetersPerSecond = 0
  wheelState.springForceNewtons = 0
  wheelState.bumpStopForceNewtons = 0
  wheelState.reboundStopForceNewtons = 0
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
  wheelState.suspensionMaximumCompressionMeters =
    suspensionConfig.maximumCompressionMeters
  wheelState.suspensionMaximumDroopMeters =
    suspensionConfig.maximumDroopMeters
  wheelState.suspensionBumpStopEngagementMeters =
    suspensionConfig.bumpStopEngagementMeters
  wheelState.suspensionBumpStopMaximumForceNewtons =
    suspensionConfig.bumpStopMaximumForceNewtons
  wheelState.suspensionReboundStopEngagementMeters =
    suspensionConfig.reboundStopEngagementMeters
  wheelState.suspensionReboundStopMaximumForceNewtons =
    suspensionConfig.reboundStopMaximumForceNewtons
  wheelState.suspensionSpringRateNewtonsPerMeter =
    suspensionConfig.springRateNewtonsPerMeter
  wheelState.suspensionCompressionDampingNewtonsPerMeterPerSecond =
    suspensionConfig.compressionDampingNewtonsPerMeterPerSecond
  wheelState.suspensionReboundDampingNewtonsPerMeterPerSecond =
    suspensionConfig.reboundDampingNewtonsPerMeterPerSecond
}

function resolveAxleSuspensionConfig(
  sourceSpec,
  massKg,
  gravityMetersPerSecondSquared,
  wheelCount
) {
  const safeWheelCount = Math.max(1, sanitizeInteger(wheelCount, 1))
  const travelLimits = resolveSuspensionTravelLimits(sourceSpec)
  const {
    restLengthMeters,
    minimumLengthMeters,
    maximumLengthMeters,
    travelMeters,
  } = travelLimits
  const targetStaticCompressionRatio01 = clamp(
    sanitizePositiveNumber(
      sourceSpec.suspensionTargetStaticCompressionRatio01,
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
    sourceSpec.suspensionSpringRateNewtonsPerMeter,
    Math.max(derivedSpringRateNewtonsPerMeter, 1)
  )
  const sprungMassPerWheelKg = massKg / safeWheelCount
  const dampingRatio = sanitizeNonNegativeNumber(
    sourceSpec.suspensionDampingRatio,
    DEFAULT_SUSPENSION_SPEC.suspensionDampingRatio
  )
  const derivedDampingRateNewtonsPerMeterPerSecond = finiteProduct(
    2,
    dampingRatio,
    Math.sqrt(springRateNewtonsPerMeter * sprungMassPerWheelKg)
  )
  const legacyDampingRateNewtonsPerMeterPerSecond =
    sanitizeNonNegativeNumber(
      sourceSpec.suspensionDampingRateNewtonsSecondPerMeter,
      derivedDampingRateNewtonsPerMeterPerSecond
    )
  const compressionDampingNewtonsPerMeterPerSecond =
    sanitizeNonNegativeNumber(
      sourceSpec.suspensionCompressionDampingNewtonsPerMeterPerSecond,
      legacyDampingRateNewtonsPerMeterPerSecond
    )
  const reboundDampingNewtonsPerMeterPerSecond =
    sanitizeNonNegativeNumber(
      sourceSpec.suspensionReboundDampingNewtonsPerMeterPerSecond,
      legacyDampingRateNewtonsPerMeterPerSecond
    )
  const minimumNormalForceNewtons = sanitizeNonNegativeNumber(
    sourceSpec.minimumNormalForceNewtons,
    DEFAULT_SUSPENSION_SPEC.minimumNormalForceNewtons
  )
  const maximumNormalForceNewtons = Math.max(
    minimumNormalForceNewtons,
    sanitizePositiveNumber(
      sourceSpec.maximumSuspensionNormalForceNewtons,
      vehicleWeightReferenceNewtons
    )
  )
  const bumpStopEngagementMeters = sanitizeNonNegativeNumber(
    sourceSpec.suspensionBumpStopEngagementMeters,
    DEFAULT_SUSPENSION_SPEC.suspensionBumpStopEngagementMeters
  )
  const bumpStopMaximumForceNewtons = sanitizeNonNegativeNumber(
    sourceSpec.suspensionBumpStopMaximumForceNewtons,
    DEFAULT_SUSPENSION_SPEC.suspensionBumpStopMaximumForceNewtons
  )
  const reboundStopEngagementMeters = sanitizeNonNegativeNumber(
    sourceSpec.suspensionReboundStopEngagementMeters,
    DEFAULT_SUSPENSION_SPEC.suspensionReboundStopEngagementMeters
  )
  const reboundStopMaximumForceNewtons = sanitizeNonNegativeNumber(
    sourceSpec.suspensionReboundStopMaximumForceNewtons,
    DEFAULT_SUSPENSION_SPEC.suspensionReboundStopMaximumForceNewtons
  )

  return {
    enabled: sourceSpec.suspensionEnabled !== false,
    restLengthMeters,
    minimumLengthMeters,
    maximumLengthMeters,
    travelMeters,
    springRateNewtonsPerMeter,
    compressionDampingNewtonsPerMeterPerSecond,
    reboundDampingNewtonsPerMeterPerSecond,
    minimumNormalForceNewtons,
    maximumNormalForceNewtons,
    bumpStopEngagementMeters,
    bumpStopMaximumForceNewtons,
    reboundStopEngagementMeters,
    reboundStopMaximumForceNewtons,
    maximumCompressionMeters: travelLimits.maximumCompressionMeters,
    maximumDroopMeters: travelLimits.maximumDroopMeters,
    vehicleWeightReferenceNewtons,
  }
}

// Phase B.1: suspension is resolved per axle. Each axle consumes its own
// nested spec (spec.suspensionFront / spec.suspensionRear); callers without
// nested slot specs fall back to the legacy flat suspension fields.
function resolveSuspensionConfigs(spec, wheelCount) {
  const massKg = sanitizePositiveNumber(spec.massKg, 1)
  const gravityMetersPerSecondSquared = sanitizePositiveNumber(
    spec.gravityMetersPerSecondSquared,
    EARTH_GRAVITY.standardMetersPerSecondSquared
  )
  // A nested slot spec may be partial: merge it over the flat legacy
  // fields so an undeclared slot value still inherits the vehicle-level
  // suspension property instead of falling back to the built-in default.
  const frontSource = { ...spec, ...spec.suspensionFront }
  const rearSource = { ...spec, ...spec.suspensionRear }

  return {
    front: resolveAxleSuspensionConfig(
      frontSource,
      massKg,
      gravityMetersPerSecondSquared,
      wheelCount
    ),
    rear: resolveAxleSuspensionConfig(
      rearSource,
      massKg,
      gravityMetersPerSecondSquared,
      wheelCount
    ),
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
