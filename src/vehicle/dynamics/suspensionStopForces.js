// src/vehicle/dynamics/suspensionStopForces.js

export function computeProgressiveSuspensionStopForceNewtons(
  travelMeters,
  availableTravelMeters,
  engagementMeters,
  maximumForceNewtons
) {
  const normalizedTravel01 = resolveStopProgress01(
    travelMeters,
    availableTravelMeters,
    engagementMeters
  )
  const forceProgress01 = normalizedTravel01 * normalizedTravel01
  const forceNewtons = sanitizeNonNegativeNumber(maximumForceNewtons) * forceProgress01
  return Number.isFinite(forceNewtons) ? forceNewtons : 0
}

export function computeProgressiveSuspensionStopRateNewtonsPerMeter(
  travelMeters,
  availableTravelMeters,
  engagementMeters,
  maximumForceNewtons
) {
  const safeAvailableTravelMeters = sanitizeNonNegativeNumber(availableTravelMeters)
  const safeEngagementMeters = Math.min(
    sanitizeNonNegativeNumber(engagementMeters),
    safeAvailableTravelMeters
  )
  if (safeAvailableTravelMeters <= 0 || safeEngagementMeters <= 0) return 0

  const normalizedTravel01 = resolveStopProgress01(
    travelMeters,
    safeAvailableTravelMeters,
    safeEngagementMeters
  )
  const rateNewtonsPerMeter =
    (2 * sanitizeNonNegativeNumber(maximumForceNewtons) * normalizedTravel01) /
    safeEngagementMeters
  return Number.isFinite(rateNewtonsPerMeter) ? rateNewtonsPerMeter : 0
}

function resolveStopProgress01(
  travelMeters,
  availableTravelMeters,
  engagementMeters
) {
  const safeAvailableTravelMeters = sanitizeNonNegativeNumber(availableTravelMeters)
  const safeEngagementMeters = Math.min(
    sanitizeNonNegativeNumber(engagementMeters),
    safeAvailableTravelMeters
  )
  if (safeAvailableTravelMeters <= 0 || safeEngagementMeters <= 0) return 0

  const safeTravelMeters = Math.min(
    safeAvailableTravelMeters,
    sanitizeNonNegativeNumber(travelMeters)
  )
  const engagementStartMeters =
    safeAvailableTravelMeters - safeEngagementMeters
  return clamp01(
    (safeTravelMeters - engagementStartMeters) / safeEngagementMeters
  )
}

function sanitizeNonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}
