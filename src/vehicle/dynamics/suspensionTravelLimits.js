// src/vehicle/dynamics/suspensionTravelLimits.js

const DEFAULT_REST_LENGTH_METERS = 0.35
const DEFAULT_TRAVEL_METERS = 0.22
const MINIMUM_LENGTH_METERS = 0.000001
const MAXIMUM_LENGTH_METERS = 10

export function resolveSuspensionTravelLimits(spec = {}) {
  const requestedRestLengthMeters = clampPositiveMeters(
    spec.suspensionRestLengthMeters,
    DEFAULT_REST_LENGTH_METERS
  )
  const requestedTravelMeters = clampPositiveMeters(
    spec.suspensionTravelMeters,
    DEFAULT_TRAVEL_METERS
  )
  let maximumLengthMeters = clampPositiveMeters(
    spec.suspensionMaximumLengthMeters,
    requestedRestLengthMeters
  )
  let minimumLengthMeters = clampPositiveMeters(
    spec.suspensionMinimumLengthMeters,
    maximumLengthMeters - requestedTravelMeters
  )

  if (
    Number.isFinite(spec.suspensionMaximumDroopMeters) &&
    spec.suspensionMaximumDroopMeters >= 0
  ) {
    maximumLengthMeters = Math.min(
      requestedRestLengthMeters + spec.suspensionMaximumDroopMeters,
      MAXIMUM_LENGTH_METERS
    )
  }
  if (
    Number.isFinite(spec.suspensionMaximumCompressionMeters) &&
    spec.suspensionMaximumCompressionMeters >= 0
  ) {
    minimumLengthMeters = Math.max(
      requestedRestLengthMeters - spec.suspensionMaximumCompressionMeters,
      MINIMUM_LENGTH_METERS
    )
  }

  maximumLengthMeters = Math.max(
    Math.min(maximumLengthMeters, MAXIMUM_LENGTH_METERS),
    MINIMUM_LENGTH_METERS * 2
  )
  minimumLengthMeters = clamp(
    minimumLengthMeters,
    MINIMUM_LENGTH_METERS,
    maximumLengthMeters - MINIMUM_LENGTH_METERS
  )
  const restLengthMeters = clamp(
    requestedRestLengthMeters,
    minimumLengthMeters,
    maximumLengthMeters
  )
  const travelMeters = maximumLengthMeters - minimumLengthMeters

  return {
    restLengthMeters,
    minimumLengthMeters,
    maximumLengthMeters,
    travelMeters,
    maximumCompressionMeters: restLengthMeters - minimumLengthMeters,
    maximumDroopMeters: maximumLengthMeters - restLengthMeters,
  }
}

function clampPositiveMeters(value, fallbackMeters) {
  if (!Number.isFinite(value) || value <= 0) return fallbackMeters
  return clamp(value, MINIMUM_LENGTH_METERS, MAXIMUM_LENGTH_METERS)
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
}
