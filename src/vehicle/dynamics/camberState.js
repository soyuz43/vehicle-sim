// src/vehicle/dynamics/camberState.js
import { solveLinkageCamber, DOUBLE_WISHBONE_KIND, MACPHERSON_KIND } from './linkageCamberSolver.js'
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
// effectiveTravelMeters is the suspension travel relative to the actual
// static ride position, plus the travel the body roll induces at that
// corner:
//   effectiveTravel = (suspensionCompressionMeters - staticCompressionReferenceMeters)
//                   + rollInducedTravelMeters
//   rollInducedTravelMeters = -wheelLocalX * bodyRollRadians
//
// The static compression reference is captured from the wheel's settled
// compression, so changing the target static compression ratio does not move
// the camber zero point. Wheels that have not been captured fall back to the
// spec-derived design ride position; this keeps direct camber-state calls
// behavior-compatible and lets the controller opt into the measured
// reference.
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
  wheelState.camberGainSource = 'coefficient'
  wheelState.camberStaticCompressionReferenceMeters = null
  if (wheelState.wishboneKinematics) {
    wheelState.wishboneKinematics = undefined
  }

  return wheelState
}

// Capture one static ride reference per wheel. A wheel is left pending when
// it is not grounded or the controller is not at static conditions, so a
// mid-drive suspension change re-derives from the settled position rather
// than from a transient compression sample.
export function captureWheelCamberStaticCompressionReference(
  wheelStates = [],
  canCapture = true
) {
  if (!Array.isArray(wheelStates)) return false

  let allReferencesCaptured = true

  for (const wheelState of wheelStates) {
    const existingReferenceMeters =
      wheelState.camberStaticCompressionReferenceMeters
    if (
      Number.isFinite(existingReferenceMeters) &&
      existingReferenceMeters >= 0
    ) {
      continue
    }

    const compressionMeters = sanitizeNonNegativeNumber(
      wheelState.suspensionCompressionMeters
    )
    if (
      !canCapture ||
      wheelState.isGrounded !== true ||
      !Number.isFinite(compressionMeters)
    ) {
      allReferencesCaptured = false
      continue
    }

    // The ray-derived length can differ from the design value by floating
    // point only. Twelve decimal places is nanometre precision and keeps the
    // stock spec's captured reference numerically identical to its design
    // reference.
    wheelState.camberStaticCompressionReferenceMeters = Number(
      compressionMeters.toFixed(12)
    )
  }

  return allReferencesCaptured
}

export function updateWheelCamberState(
  wheelStates = [],
  spec = {},
  bodyRollRadians = 0
) {
  if (!Array.isArray(wheelStates)) return wheelStates

  const safeBodyRollRadians = sanitizeNumber(bodyRollRadians)

  for (const wheelState of wheelStates) {
    // Phase B.1: suspension is consumed per axle. A wheel reads its own
    // slot spec when the runtime spec declares one, and falls back to the
    // flat legacy spec otherwise.
    const axleSpec = resolveAxleCamberSpec(wheelState, spec)
    const camberStaticRadians = sanitizeNumber(
      axleSpec.camberStaticRadians,
      DEFAULT_CAMBER_SPEC.camberStaticRadians
    )
    const camberGainRadiansPerMeterCompression = sanitizeNumber(
      axleSpec.camberGainRadiansPerMeterCompression,
      DEFAULT_CAMBER_SPEC.camberGainRadiansPerMeterCompression
    )
    const designCompressionMeters = resolveDesignCompressionMeters(axleSpec)
    const wheelLocalXMeters = sanitizeNumber(wheelState.localPosition?.x)
    // Positive body roll lifts the +X (left) side, so a wheel on that side
    // extends and its compression drops.
    const rollInducedTravelMeters =
      -wheelLocalXMeters * safeBodyRollRadians
    const staticCompressionReferenceMeters =
      resolveStaticCompressionReferenceMeters(
        wheelState,
        designCompressionMeters
      )
    const effectiveTravelMeters =
      sanitizeNumber(wheelState.suspensionCompressionMeters) -
      staticCompressionReferenceMeters +
      rollInducedTravelMeters
    const linkageSpec = axleSpec.suspensionLinkage
    const wishboneKinematics =
      linkageSpec?.kind === DOUBLE_WISHBONE_KIND
        ? ensureWishboneKinematics(wheelState)
        : null
    if (wishboneKinematics) {
      wishboneKinematics.upperOuterJoint.xMeters = Number.NaN
      wishboneKinematics.upperOuterJoint.yMeters = Number.NaN
      wishboneKinematics.lowerOuterJoint.xMeters = Number.NaN
      wishboneKinematics.lowerOuterJoint.yMeters = Number.NaN
    } else if (wheelState.wishboneKinematics) {
      wheelState.wishboneKinematics = undefined
    }
    let camberRadians
    let camberGainSource

    if (isLinkageCamberEnabled(linkageSpec)) {
      camberRadians = solveLinkageCamber({
        wheelTravelMeters: effectiveTravelMeters,
        linkageSpec,
        staticCamberRadians: camberStaticRadians,
        outJoints: wishboneKinematics,
      })
      camberGainSource = 'linkage'
    } else {
      camberRadians =
        camberStaticRadians +
        camberGainRadiansPerMeterCompression * effectiveTravelMeters
      camberGainSource = 'coefficient'
    }

    wheelState.camberRadians = camberRadians
    wheelState.camberRadiansDegrees = camberRadians * RADIANS_TO_DEGREES
    wheelState.camberEffectiveTravelMeters = effectiveTravelMeters
    wheelState.camberRollInducedTravelMeters = rollInducedTravelMeters
    wheelState.camberGainSource = camberGainSource
  }

  return wheelStates
}

// Phase B.1: the camber solver is per-axle. Front wheels read the front slot,
// rear wheels read the rear slot, and a runtime spec without the Phase B.1
// nested shape still uses the flat legacy fields for both axles.
function resolveAxleCamberSpec(wheelState, spec) {
  const axle = wheelState?.axle
  const nestedSpec = axle === 'front'
    ? spec.suspensionFront
    : axle === 'rear'
      ? spec.suspensionRear
      : undefined

  return nestedSpec ?? spec
}

function ensureWishboneKinematics(wheelState) {
  if (wheelState.wishboneKinematics) return wheelState.wishboneKinematics

  wheelState.wishboneKinematics = {
    upperOuterJoint: { xMeters: Number.NaN, yMeters: Number.NaN },
    lowerOuterJoint: { xMeters: Number.NaN, yMeters: Number.NaN },
  }
  return wheelState.wishboneKinematics
}

function isLinkageCamberEnabled(linkageSpec) {
  if (!linkageSpec || typeof linkageSpec !== 'object') return false

  return (
    linkageSpec.kind === DOUBLE_WISHBONE_KIND ||
    linkageSpec.kind === MACPHERSON_KIND
  )
}

function resolveStaticCompressionReferenceMeters(
  wheelState,
  fallbackDesignCompressionMeters
) {
  const referenceMeters = wheelState.camberStaticCompressionReferenceMeters

  return Number.isFinite(referenceMeters) && referenceMeters >= 0
    ? referenceMeters
    : fallbackDesignCompressionMeters
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
