// src/vehicle/dynamics/aeroAndTireThermalState.js

// Phase 5 seam: aerodynamic downforce/lift (speed-dependent vertical load) and a
// first-order tire temperature / wear model with an optional mild grip change.
//
// All behavior is gated by feature flags in the controller; when disabled, the
// default (no aero load, constant mu, no thermal state) behavior is preserved.
//
// Honesty policy: this is a first-order model. Aero uses a lumped speed-squared
// coefficient (no pressure distribution, pitch sensitivity, or aero-induced
// drag changes). Tire temperature follows slip/scrub work with Newtonian
// cooling; wear is cumulative work. The mu change with temperature/wear is a
// small multiplier, not a full thermal rubber model.

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) return minimum
  return Math.min(maximum, Math.max(minimum, value))
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function sanitizeNonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

// ---------------------------------------------------------------------------
// Aerodynamic vertical load: downforce adds to the contact normal load (positive
// return), lift subtracts from it (negative return). Quadratic in speed.
// ---------------------------------------------------------------------------
export function computeAerodynamicVerticalForceNewtons({
  speedMetersPerSecond = 0,
  downforceCoefficientNewtonsPerMeterSquared = 0,
  liftCoefficientNewtonsPerMeterSquared = 0,
}) {
  const speedMetersPerSecondMagnitude = Math.abs(
    sanitizeNumber(speedMetersPerSecond)
  )
  const downforce = sanitizeNonNegativeNumber(downforceCoefficientNewtonsPerMeterSquared) *
    speedMetersPerSecondMagnitude *
    speedMetersPerSecondMagnitude
  const lift = sanitizeNonNegativeNumber(liftCoefficientNewtonsPerMeterSquared) *
    speedMetersPerSecondMagnitude *
    speedMetersPerSecondMagnitude
  return downforce - lift
}

// ---------------------------------------------------------------------------
// Per-wheel tire thermal/wear state. Temperature rises with slip/scrub power
// (longitudinal slip work + lateral scrub work) and cools toward ambient.
// Wear accumulates with cumulative work. The friction coefficient is multiplied
// by a mild temperature/wear factor (never below a floor).
// ---------------------------------------------------------------------------
export function updateWheelTireThermalState(
  wheelState,
  spec = {},
  deltaTimeSeconds = 0
) {
  const ambientTemperatureCelsius = sanitizeNumber(
    spec.tireAmbientTemperatureCelsius,
    25
  )
  let temperatureCelsius = sanitizeNumber(
    wheelState.tireTemperatureCelsius,
    ambientTemperatureCelsius
  )

  const wheelSurfaceSpeed = sanitizeNumber(wheelState.wheelSurfaceSpeedMetersPerSecond)
  const groundSpeed = sanitizeNumber(wheelState.longitudinalGroundSpeedMetersPerSecond)
  const slipVelocityMetersPerSecond = Math.abs(wheelSurfaceSpeed - groundSpeed)
  const longForceNewtons = Math.abs(
    sanitizeNumber(wheelState.appliedLongitudinalForceNewtons)
  )
  const latForceNewtons = Math.abs(
    sanitizeNumber(wheelState.appliedLateralTireForceNewtons)
  )
  const lateralSlipAngleRadians = sanitizeNumber(wheelState.lateralSlipAngleRadians)
  const scrubVelocityMetersPerSecond =
    Math.abs(lateralSlipAngleRadians) * Math.abs(wheelSurfaceSpeed)

  // Slip/scrub power (watts) drives heating.
  const workPowerWatts =
    longForceNewtons * slipVelocityMetersPerSecond +
    latForceNewtons * scrubVelocityMetersPerSecond

  const temperatureRiseRatePerSecond =
    sanitizeNonNegativeNumber(spec.tireTemperatureRisePerWorkWatt) * workPowerWatts
  const coolingRatePerSecond =
    (temperatureCelsius - ambientTemperatureCelsius) *
    sanitizeNonNegativeNumber(spec.tireCoolingRatePerSecond)

  temperatureCelsius +=
    (temperatureRiseRatePerSecond - coolingRatePerSecond) *
      Math.max(deltaTimeSeconds, 0)
  if (!Number.isFinite(temperatureCelsius)) {
    temperatureCelsius = ambientTemperatureCelsius
  }

  let wearFraction01 = sanitizeNumber(wheelState.tireWearFraction01, 0)
  wearFraction01 += sanitizeNonNegativeNumber(spec.tireWearPerWorkJoule) *
    workPowerWatts *
    Math.max(deltaTimeSeconds, 0)
  wearFraction01 = clamp01(wearFraction01)

  // Mild grip change: falls off above the optimal temperature and with wear.
  const optimalTemperatureCelsius = sanitizeNumber(
    spec.tireOptimalTemperatureCelsius,
    90
  )
  const tempMuFactor = 1 -
    sanitizeNonNegativeNumber(spec.tireMuTempPenaltyPerDegree) *
      Math.max(0, temperatureCelsius - optimalTemperatureCelsius)
  const wearMuFactor =
    1 - sanitizeNonNegativeNumber(spec.tireMuWearPenalty01) * wearFraction01
  const muMultiplier = clamp(
    tempMuFactor * wearMuFactor,
    sanitizeNonNegativeNumber(spec.tireMuMultiplierMin01, 0.5),
    1
  )

  wheelState.tireTemperatureCelsius = temperatureCelsius
  wheelState.tireWearFraction01 = wearFraction01
  wheelState.tireThermalWorkPowerWatts = workPowerWatts
  wheelState.tireMuMultiplier01 = muMultiplier
  wheelState.frictionCoefficient =
    sanitizeNumber(wheelState.frictionCoefficient, 1) * muMultiplier

  return wheelState
}
