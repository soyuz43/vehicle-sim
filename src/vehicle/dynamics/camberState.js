// src/vehicle/dynamics/camberState.js
//
// Wheel camber state and camber thrust.
//
// Camber is the wheel-local inclination of the wheel plane relative to the
// road. This module owns two things:
//   1. the per-wheel camber angle, derived from the suspension travel
//   2. the camber thrust the tire produces from that angle
//
// Sign convention (standard automotive):
//   camberRadians > 0 means the TOP of the wheel tilts OUTBOARD, away from
//   the vehicle centerline. Camber thrust acts toward the lean, so a
//   positively cambered wheel pushes toward the outboard side.
//
// Camber model (per wheel):
//   camberRadians = camberStaticRadians
//                 + camberGainRadiansPerMeterCompression * effectiveTravelMeters
//
// effectiveTravelMeters is the suspension travel relative to the design
// (static) ride position, plus the travel the body roll induces at that
// corner:
//   effectiveTravel = (suspensionCompressionMeters - designCompressionMeters)
//                   + rollInducedTravelMeters
//   rollInducedTravelMeters = -wheelLocalX * bodyRollRadians
//
// The design compression reference is the spec-derived design ride position
// (suspensionTravelMeters * suspensionTargetStaticCompressionRatio01), so a
// suspension archetype that gains no camber reports no camber at its design
// position and the static camber field stays the single owner of static
// camber.
//
// Bridge approximation (documented seam): the roll-induced travel is
// reconstructed from the body roll angle with the roll axis at ground level
// and no anti-roll bar, which is this simulation's current state. When a
// roll-center model and an anti-roll bar land, replace this reconstruction
// with the real per-corner suspension travel.
//
// Camber thrust:
//   camberThrustForceNewtons = camberStiffnessNewtonsPerRadianPerNewton
//                             * normalForceNewtons * camberRadians
//
// The coefficient is the camber stiffness per unit load. ~0.35 N/rad per N is
// ~25 N per degree at a 4000 N wheel load, i.e. ~0.6 % of the friction limit
// per degree of camber, which is the measured range for modern passenger
// radial tires (camber stiffness is roughly 1.5-3 % of the cornering
// stiffness per degree).
//
// The thrust is signed in the applied lateral tire force convention: the
// applied lateral tire force is positive toward the wheel's local LEFT
// (see lateralTireForceState.js). A positive camber therefore pushes the
// LEFT wheel outboard (positive) and the RIGHT wheel outboard (negative).

const DEFAULT_CAMBER_SPEC = Object.freeze({
  camberStaticRadians: 0,
  camberGainRadiansPerMeterCompression: 0,
  camberStiffnessNewtonsPerRadianPerNewton: 0,
})

const RADIANS_TO_DEGREES = 180 / Math.PI

export function resetWheelCamberState(wheelState) {
  wheelState.camberRadians = 0
  wheelState.camberRadiansDegrees = 0
  wheelState.camberEffectiveTravelMeters = 0
  wheelState.camberRollInducedTravelMeters = 0
  wheelState.camberThrustForceNewtons = 0

  return wheelState
}

export function updateWheelCamberState(
  wheelStates = [],
  spec = {},
  bodyRollRadians = 0
) {
  if (!Array.isArray(wheelStates)) return wheelStates

  const camberStaticRadians = sanitizeNumber(
    spec.camberStaticRadians,
    DEFAULT_CAMBER_SPEC.camberStaticRadians
  )
  const camberGainRadiansPerMeterCompression = sanitizeNumber(
    spec.camberGainRadiansPerMeterCompression,
    DEFAULT_CAMBER_SPEC.camberGainRadiansPerMeterCompression
  )
  const designCompressionMeters = resolveDesignCompressionMeters(spec)
  const safeBodyRollRadians = sanitizeNumber(bodyRollRadians)

  for (const wheelState of wheelStates) {
    const wheelLocalXMeters = sanitizeNumber(wheelState.localPosition?.x)
    // Positive body roll lifts the +X (left) side, so a wheel on that side
    // extends and its compression drops.
    const rollInducedTravelMeters =
      -wheelLocalXMeters * safeBodyRollRadians
    const effectiveTravelMeters =
      sanitizeNumber(wheelState.suspensionCompressionMeters) -
      designCompressionMeters +
      rollInducedTravelMeters
    const camberRadians =
      camberStaticRadians +
      camberGainRadiansPerMeterCompression * effectiveTravelMeters

    wheelState.camberRadians = camberRadians
    wheelState.camberRadiansDegrees = camberRadians * RADIANS_TO_DEGREES
    wheelState.camberEffectiveTravelMeters = effectiveTravelMeters
    wheelState.camberRollInducedTravelMeters = rollInducedTravelMeters
  }

  return wheelStates
}

// The camber thrust this wheel produces, signed in the applied lateral tire
// force convention. A wheel without a camber angle (or without a load)
// produces no thrust: the contribution is exactly zero, never NaN.
export function computeCamberThrustForceNewtons(wheelState, spec = {}) {
  if (!wheelState) return 0

  const camberStiffnessNewtonsPerRadianPerNewton =
    sanitizeNonNegativeNumber(
      spec.camberStiffnessNewtonsPerRadianPerNewton,
      DEFAULT_CAMBER_SPEC.camberStiffnessNewtonsPerRadianPerNewton
    )
  if (camberStiffnessNewtonsPerRadianPerNewton <= 0) return 0

  const camberRadians = sanitizeNumber(wheelState.camberRadians)
  if (camberRadians === 0) return 0

  const normalForceNewtons = sanitizeNonNegativeNumber(
    wheelState.normalForceNewtons
  )
  if (normalForceNewtons <= 0) return 0

  const outboardLateralForceSign = resolveOutboardLateralForceSign(wheelState)
  if (outboardLateralForceSign === 0) return 0

  return (
    outboardLateralForceSign *
    camberStiffnessNewtonsPerRadianPerNewton *
    normalForceNewtons *
    camberRadians
  )
}

// The applied lateral tire force is positive toward the wheel's local LEFT.
// A positive camber pushes the wheel outboard, so the LEFT wheel (positive
// local X) gets a positive contribution and the RIGHT wheel a negative one.
function resolveOutboardLateralForceSign(wheelState) {
  if (wheelState.side === 'left') return 1
  if (wheelState.side === 'right') return -1

  const wheelLocalXMeters = sanitizeNumber(wheelState.localPosition?.x)
  if (wheelLocalXMeters > 0) return 1
  if (wheelLocalXMeters < 0) return -1

  return 0
}

function resolveDesignCompressionMeters(spec) {
  const travelMeters = sanitizeNonNegativeNumber(spec.suspensionTravelMeters)
  const staticCompressionRatio01 = clamp01(
    sanitizeNumber(spec.suspensionTargetStaticCompressionRatio01)
  )

  return travelMeters * staticCompressionRatio01
}

function sanitizeNonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}