// src/vehicle/dynamics/combinedSlipTireForceState.js

// Combined-slip brush (Fiala) tire-force model.
//
// Replaces the independent linear/saturation longitudinal and lateral models plus
// the separately imposed friction-circle cap with a single physically-grounded
// combined-slip model. Longitudinal and lateral forces are computed together from
// the wheel slip ratio and slip angle, so the friction circle (|F| <= mu*Fz) now
// EMERGES from the model instead of being applied as an independent per-axis clamp.
//
// Model (per wheel):
//   fx = Cx * kappa            (longitudinal elastic force, positive = forward)
//   fy = -Cy * tan(alpha)     (lateral elastic force, negative for positive slip angle)
//   f  = hypot(fx, fy)        (combined elastic magnitude)
//   rho = f / (mu * Fz)       (normalized combined slip)
//   if rho <= 1:  forces are purely elastic (adhesion/stick)
//   else:         total force magnitude = mu*Fz*(1 - (1 - 1/rho)^3) (brush falloff),
//                 distributed back along the (fx, fy) direction.
//
// This yields a real mu-vs-slip curve that rises, peaks, then falls off past peak
// (realistic breakaway/slide behavior), instead of the previous hard flat clamp.
//
// Honest limitations (documented seams, not fake realism):
//   - Single constant friction coefficient; no speed/load/temperature dependence yet.
//   - Fiala brush, not a full Pacejka Magic Formula.
//   - High-slip asymptote decays toward zero (classic brush artifact); a kinetic-
//     friction floor can be added later. Lateral slip angle is clamped before tan()
//     to keep the elastic term finite.

const COMBINED_SLIP_EPSILON_NEWTONS = 1e-9
const MAX_SLIP_ANGLE_RADIANS = 1.5

function sanitizePositiveNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function sanitizeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
}

export function updateWheelCombinedSlipTireForce(wheelState, spec = {}) {
  if (!wheelState) return wheelState

  const longitudinalSlipRatio = sanitizeNumber(wheelState.longitudinalSlipRatio)
  const lateralSlipAngleRadians = clamp(
    sanitizeNumber(wheelState.lateralSlipAngleRadians),
    -MAX_SLIP_ANGLE_RADIANS,
    MAX_SLIP_ANGLE_RADIANS
  )
  const longitudinalStiffness = sanitizePositiveNumber(
    wheelState.pressureAdjustedLongitudinalTireStiffnessNewtonsPerSlipRatio,
    sanitizePositiveNumber(spec.longitudinalTireStiffnessNewtonsPerSlipRatio, 1)
  )
  const lateralStiffness = sanitizePositiveNumber(
    wheelState.pressureAdjustedLateralTireStiffnessNewtonsPerRadian,
    sanitizePositiveNumber(spec.lateralTireStiffnessNewtonsPerRadian, 1)
  )
  const frictionCoefficient = sanitizePositiveNumber(
    wheelState.frictionCoefficient,
    sanitizePositiveNumber(spec.defaultSurfaceFrictionCoefficient, 1)
  )
  const normalForceNewtons = sanitizePositiveNumber(
    wheelState.normalForceNewtons,
    0
  )
  const tractionLimitNewtons = sanitizePositiveNumber(
    wheelState.tractionLimitNewtons,
    frictionCoefficient * normalForceNewtons
  )

  // Reset/applied telemetry fields so downstream summaries stay consistent.
  wheelState.uncappedLongitudinalTireForceNewtons = 0
  wheelState.uncappedLateralTireForceNewtons = 0
  wheelState.appliedLongitudinalForceNewtons = 0
  wheelState.appliedLateralTireForceNewtons = 0
  wheelState.longitudinalTireForceSaturationRatio = 0
  wheelState.isLongitudinalTireForceSaturated = false
  wheelState.lateralTireForceSaturationRatio = 0
  wheelState.isLateralTireForceSaturated = false
  wheelState.combinedTireForceMagnitudeNewtons = 0
  wheelState.combinedTireForceLimitNewtons = tractionLimitNewtons
  wheelState.combinedTireForceScale01 = 1
  wheelState.combinedTireForceSaturationRatio = 0
  wheelState.isCombinedTireForceSaturated = false
  wheelState.isSlipping = false

  if (!wheelState.isGrounded || tractionLimitNewtons <= 0) {
    return wheelState
  }

  // Elastic (small-slip) force components.
  const elasticLongitudinalForceNewtons =
    longitudinalStiffness * longitudinalSlipRatio
  const elasticLateralForceNewtons =
    -lateralStiffness * Math.tan(lateralSlipAngleRadians)
  const elasticMagnitudeNewtons = Math.hypot(
    elasticLongitudinalForceNewtons,
    elasticLateralForceNewtons
  )
  // Guard against division by zero (should not happen due to check above, but defensive)
  if (tractionLimitNewtons <= 0) {
    return wheelState
  }


  const normalizedCombinedSlip = elasticMagnitudeNewtons / tractionLimitNewtons

  let combinedForceMagnitudeNewtons
  let combinedForceScale01
  if (normalizedCombinedSlip <= 1) {
    // Adhesion region: forces follow the elastic (linear) relationship.
    combinedForceMagnitudeNewtons = elasticMagnitudeNewtons
    combinedForceScale01 = 1
  } else {
    // Sliding region: brush falloff past the grip peak, distributed along slip.
    const inverseSlip = tractionLimitNewtons / elasticMagnitudeNewtons
    const falloff = 1 - Math.pow(1 - inverseSlip, 3)
    combinedForceMagnitudeNewtons = tractionLimitNewtons * falloff
    combinedForceScale01 =
      elasticMagnitudeNewtons > 0
        ? combinedForceMagnitudeNewtons / elasticMagnitudeNewtons
        : 1
  }

  const appliedLongitudinalForceNewtons =
    elasticLongitudinalForceNewtons * combinedForceScale01
  const appliedLateralTireForceNewtons =
    elasticLateralForceNewtons * combinedForceScale01

  wheelState.uncappedLongitudinalTireForceNewtons =
    elasticLongitudinalForceNewtons
  wheelState.uncappedLateralTireForceNewtons = elasticLateralForceNewtons
  wheelState.appliedLongitudinalForceNewtons = appliedLongitudinalForceNewtons
  wheelState.appliedLateralTireForceNewtons = appliedLateralTireForceNewtons

  wheelState.longitudinalTireForceSaturationRatio = clamp(
    Math.abs(appliedLongitudinalForceNewtons) / tractionLimitNewtons,
    0,
    1
  )
  wheelState.isLongitudinalTireForceSaturated =
    Math.abs(appliedLongitudinalForceNewtons) >
    tractionLimitNewtons + COMBINED_SLIP_EPSILON_NEWTONS
  wheelState.lateralTireForceSaturationRatio = clamp(
    Math.abs(appliedLateralTireForceNewtons) / tractionLimitNewtons,
    0,
    1
  )
  wheelState.isLateralTireForceSaturated =
    Math.abs(appliedLateralTireForceNewtons) >
    tractionLimitNewtons + COMBINED_SLIP_EPSILON_NEWTONS
  wheelState.combinedTireForceMagnitudeNewtons = combinedForceMagnitudeNewtons
  wheelState.combinedTireForceLimitNewtons = tractionLimitNewtons
  wheelState.combinedTireForceScale01 = combinedForceScale01
  wheelState.combinedTireForceSaturationRatio = clamp(
    combinedForceMagnitudeNewtons / tractionLimitNewtons,
    0,
    1
  )
  wheelState.isCombinedTireForceSaturated = normalizedCombinedSlip > 1
  wheelState.isSlipping =
    wheelState.isLongitudinalTireForceSaturated ||
    wheelState.isLateralTireForceSaturated ||
    wheelState.isCombinedTireForceSaturated

  return wheelState
}

export function updateCombinedSlipTireForces(wheelStates, spec = {}) {
  if (!Array.isArray(wheelStates)) return wheelStates
  for (const wheelState of wheelStates) {
    updateWheelCombinedSlipTireForce(wheelState, spec)
  }
  return wheelStates
}
