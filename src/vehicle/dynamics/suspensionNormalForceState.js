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

const SUSPENSION_TRAVEL_EPSILON_METERS = 0.000001

export function resetWheelSuspensionNormalForceState(wheelState) {
  wheelState.suspensionEnabled = false
  wheelState.suspensionCompressionMeters = 0
  wheelState.suspensionCompressionRatio01 = 0
  wheelState.suspensionVelocityMetersPerSecond = 0
  wheelState.springForceNewtons = 0
  wheelState.dampingForceNewtons = 0
  wheelState.normalForceNewtons = 0
  wheelState.tractionLimitNewtons = 0
  wheelState.isSuspensionBottomed = false
  wheelState.isSuspensionToppedOut = true
  wheelState.hasSuspensionCompressionSample = false

  return wheelState
}

export function updateSuspensionNormalForceState(
  wheelStates = [],
  spec = {},
  dtSeconds = 0
) {
  if (!Array.isArray(wheelStates) || wheelStates.length === 0) {
    return wheelStates
  }

  const suspensionConfig = resolveSuspensionConfig(spec, wheelStates.length)
  const safeDtSeconds = sanitizePositiveNumber(dtSeconds, 0)

  for (const wheelState of wheelStates) {
    updateWheelSuspensionNormalForceState(
      wheelState,
      suspensionConfig,
      safeDtSeconds
    )
  }

  return wheelStates
}

function updateWheelSuspensionNormalForceState(
  wheelState,
  suspensionConfig,
  dtSeconds
) {
  const previousCompressionMeters = clamp(
    sanitizeNonNegativeNumber(wheelState.suspensionCompressionMeters),
    0,
    suspensionConfig.travelMeters
  )
  const requestedNormalForceNewtons = wheelState.isGrounded
    ? clamp(
        sanitizeNonNegativeNumber(wheelState.dynamicNormalForceNewtons),
        suspensionConfig.minimumNormalForceNewtons,
        suspensionConfig.maximumNormalForceNewtons
      )
    : 0

  wheelState.suspensionEnabled = suspensionConfig.enabled

  if (!suspensionConfig.enabled) {
    wheelState.suspensionCompressionMeters = 0
    wheelState.suspensionCompressionRatio01 = 0
    wheelState.suspensionVelocityMetersPerSecond = 0
    wheelState.springForceNewtons = 0
    wheelState.dampingForceNewtons = 0
    wheelState.isSuspensionBottomed = false
    wheelState.isSuspensionToppedOut = true
    wheelState.hasSuspensionCompressionSample = false
    wheelState.normalForceNewtons = requestedNormalForceNewtons
    wheelState.tractionLimitNewtons = finiteProduct(
      sanitizeNonNegativeNumber(wheelState.frictionCoefficient),
      wheelState.normalForceNewtons
    )
    return wheelState
  }

  let compressionMeters = 0
  let suspensionVelocityMetersPerSecond = 0

  if (wheelState.isGrounded) {
    compressionMeters = calculateCompressionMeters({
      requestedNormalForceNewtons,
      previousCompressionMeters,
      springRateNewtonsPerMeter: suspensionConfig.springRateNewtonsPerMeter,
      dampingRateNewtonsSecondPerMeter:
        suspensionConfig.dampingRateNewtonsSecondPerMeter,
      travelMeters: suspensionConfig.travelMeters,
      dtSeconds,
      hasPreviousSample: wheelState.hasSuspensionCompressionSample === true,
    })

    if (
      dtSeconds > 0 &&
      wheelState.hasSuspensionCompressionSample === true
    ) {
      suspensionVelocityMetersPerSecond = sanitizeNumber(
        (compressionMeters - previousCompressionMeters) / dtSeconds
      )
    }
  }

  const springForceNewtons = sanitizeNonNegativeNumber(
    suspensionConfig.springRateNewtonsPerMeter * compressionMeters
  )
  const dampingForceNewtons = sanitizeNumber(
    suspensionConfig.dampingRateNewtonsSecondPerMeter *
      suspensionVelocityMetersPerSecond
  )
  const combinedSuspensionForceNewtons = sanitizeNumber(
    springForceNewtons + dampingForceNewtons
  )

  wheelState.suspensionRestLengthMeters = suspensionConfig.restLengthMeters
  wheelState.suspensionTravelMeters = suspensionConfig.travelMeters
  wheelState.suspensionSpringRateNewtonsPerMeter =
    suspensionConfig.springRateNewtonsPerMeter
  wheelState.suspensionDampingRateNewtonsSecondPerMeter =
    suspensionConfig.dampingRateNewtonsSecondPerMeter
  wheelState.suspensionCompressionMeters = compressionMeters
  wheelState.suspensionCompressionRatio01 = clamp01(
    compressionMeters / suspensionConfig.travelMeters
  )
  wheelState.suspensionVelocityMetersPerSecond =
    suspensionVelocityMetersPerSecond
  wheelState.springForceNewtons = springForceNewtons
  wheelState.dampingForceNewtons = dampingForceNewtons
  wheelState.isSuspensionBottomed =
    compressionMeters >=
    suspensionConfig.travelMeters - SUSPENSION_TRAVEL_EPSILON_METERS
  wheelState.isSuspensionToppedOut =
    compressionMeters <= SUSPENSION_TRAVEL_EPSILON_METERS
  wheelState.hasSuspensionCompressionSample = true
  wheelState.normalForceNewtons = wheelState.isGrounded
    ? clamp(
        combinedSuspensionForceNewtons,
        suspensionConfig.minimumNormalForceNewtons,
        suspensionConfig.maximumNormalForceNewtons
      )
    : 0
  wheelState.tractionLimitNewtons = finiteProduct(
    sanitizeNonNegativeNumber(wheelState.frictionCoefficient),
    wheelState.normalForceNewtons
  )

  return wheelState
}

function calculateCompressionMeters({
  requestedNormalForceNewtons,
  previousCompressionMeters,
  springRateNewtonsPerMeter,
  dampingRateNewtonsSecondPerMeter,
  travelMeters,
  dtSeconds,
  hasPreviousSample,
}) {
  if (!hasPreviousSample || dtSeconds <= 0) {
    return clamp(
      requestedNormalForceNewtons / springRateNewtonsPerMeter,
      0,
      travelMeters
    )
  }

  // Backward Euler keeps the spring/damper state finite without introducing a
  // separate vertical chassis degree of freedom in this quasi-static v1 model.
  const dampingRatePerStepNewtonsPerMeter =
    dampingRateNewtonsSecondPerMeter / dtSeconds
  const effectiveRateNewtonsPerMeter =
    springRateNewtonsPerMeter + dampingRatePerStepNewtonsPerMeter
  const compressionMeters =
    (requestedNormalForceNewtons +
      dampingRatePerStepNewtonsPerMeter * previousCompressionMeters) /
    effectiveRateNewtonsPerMeter

  return clamp(sanitizeNumber(compressionMeters), 0, travelMeters)
}

function resolveSuspensionConfig(spec, wheelCount) {
  const massKg = sanitizePositiveNumber(spec.massKg, 1)
  const gravityMetersPerSecondSquared = sanitizePositiveNumber(
    spec.gravityMetersPerSecondSquared,
    EARTH_GRAVITY.standardMetersPerSecondSquared
  )
  const safeWheelCount = Math.max(1, sanitizeInteger(wheelCount, 1))
  const restLengthMeters = sanitizePositiveNumber(
    spec.suspensionRestLengthMeters,
    DEFAULT_SUSPENSION_SPEC.suspensionRestLengthMeters
  )
  const travelMeters = sanitizePositiveNumber(
    spec.suspensionTravelMeters,
    DEFAULT_SUSPENSION_SPEC.suspensionTravelMeters
  )
  const targetStaticCompressionRatio01 = sanitizePositiveRatio01(
    spec.suspensionTargetStaticCompressionRatio01,
    DEFAULT_SUSPENSION_SPEC.suspensionTargetStaticCompressionRatio01
  )
  const staticNormalForcePerWheelNewtons = finiteProduct(
    massKg,
    gravityMetersPerSecondSquared,
    1 / safeWheelCount
  )
  const targetStaticCompressionMeters =
    travelMeters * targetStaticCompressionRatio01
  const derivedSpringRateNewtonsPerMeter =
    staticNormalForcePerWheelNewtons / targetStaticCompressionMeters
  const springRateNewtonsPerMeter = sanitizePositiveNumber(
    spec.suspensionSpringRateNewtonsPerMeter,
    sanitizePositiveNumber(derivedSpringRateNewtonsPerMeter, 1)
  )
  const sprungMassPerWheelKg = massKg / safeWheelCount
  const dampingRatio = sanitizeNonNegativeNumber(
    spec.suspensionDampingRatio,
    DEFAULT_SUSPENSION_SPEC.suspensionDampingRatio
  )
  const derivedDampingRateNewtonsSecondPerMeter = finiteProduct(
    2,
    dampingRatio,
    Math.sqrt(springRateNewtonsPerMeter * sprungMassPerWheelKg)
  )
  const dampingRateNewtonsSecondPerMeter = sanitizeNonNegativeNumber(
    spec.suspensionDampingRateNewtonsSecondPerMeter,
    derivedDampingRateNewtonsSecondPerMeter
  )
  const minimumNormalForceNewtons = sanitizeNonNegativeNumber(
    spec.minimumNormalForceNewtons,
    DEFAULT_SUSPENSION_SPEC.minimumNormalForceNewtons
  )
  const derivedMaximumNormalForceNewtons = finiteProduct(
    massKg,
    gravityMetersPerSecondSquared
  )
  const maximumNormalForceNewtons = Math.max(
    minimumNormalForceNewtons,
    sanitizePositiveNumber(
      spec.maximumSuspensionNormalForceNewtons,
      Math.max(minimumNormalForceNewtons, derivedMaximumNormalForceNewtons)
    )
  )

  return {
    enabled: spec.suspensionEnabled !== false,
    restLengthMeters,
    travelMeters,
    springRateNewtonsPerMeter,
    dampingRateNewtonsSecondPerMeter,
    minimumNormalForceNewtons,
    maximumNormalForceNewtons,
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

function sanitizePositiveRatio01(value, fallback) {
  if (!Number.isFinite(value) || value <= 0) return fallback
  return clamp(value, Number.EPSILON, 1)
}

function sanitizePositiveNumber(value, fallback = 0) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeNonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function sanitizeNumber(value) {
  return Number.isFinite(value) ? value : 0
}

function clamp01(value) {
  return clamp(sanitizeNumber(value), 0, 1)
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, sanitizeNumber(value)))
}
