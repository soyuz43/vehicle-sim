// src/vehicle/dynamics/resolveChassisGeometry.js

/**
 * Resolves the chassis geometry that every dynamics consumer has to agree on.
 *
 * The vehicle SPEC is the authoritative geometry source. A chassis catalog
 * component owns wheelbaseMeters, frontTrackWidthMeters and
 * rearTrackWidthMeters, so selecting a chassis has to change the physics.
 *
 * The rendered car mesh is NOT a geometry source. It is a fixed hatchback
 * shape (2.9 m wheelbase, 2.5 m track), so deriving the geometry from the
 * wheel layout made the load-transfer, chassis-mass-property and
 * vertical-dynamics derivations disagree with each other as soon as a
 * non-stock chassis was selected: the same vehicle was simulated with two
 * different geometries in the same step.
 *
 * The wheel layout is only a fallback for callers that pass no spec
 * geometry. The axle stations are always derived from the resolved
 * wheelbase so that every consumer splits the same wheelbase the same way.
 * They are placed symmetrically about the vehicle origin, which is the
 * layout the rendered mesh uses.
 */

const AXLES = Object.freeze({
  FRONT: 'front',
  REAR: 'rear',
})

const DEFAULT_CHASSIS_GEOMETRY = Object.freeze({
  wheelbaseMeters: 2.9,
  frontTrackWidthMeters: 2.5,
  rearTrackWidthMeters: 2.5,
})

/**
 * Resolves the wheelbase, the track widths and the axle stations.
 *
 * Precedence for every dimension: the spec first, the wheel layout second,
 * the hard default last.
 */
export function resolveChassisGeometry(wheelStates = [], spec = {}) {
  const safeWheelStates = Array.isArray(wheelStates) ? wheelStates : []
  const layout = deriveWheelLayoutGeometry(safeWheelStates)

  const specWheelbaseMeters = sanitizePositiveNumber(spec.wheelbaseMeters)
  const wheelbaseMeters =
    specWheelbaseMeters > 0
      ? specWheelbaseMeters
      : layout.wheelbaseMeters > 0
        ? layout.wheelbaseMeters
        : DEFAULT_CHASSIS_GEOMETRY.wheelbaseMeters

  const frontTrackWidthMeters = resolveTrackWidthMeters(
    spec.frontTrackWidthMeters,
    spec.rearTrackWidthMeters,
    layout.frontTrackWidthMeters,
    DEFAULT_CHASSIS_GEOMETRY.frontTrackWidthMeters
  )
  const rearTrackWidthMeters = resolveTrackWidthMeters(
    spec.rearTrackWidthMeters,
    spec.frontTrackWidthMeters,
    layout.rearTrackWidthMeters,
    DEFAULT_CHASSIS_GEOMETRY.rearTrackWidthMeters
  )

  return {
    wheelbaseMeters,
    frontTrackWidthMeters,
    rearTrackWidthMeters,
    // The axle stations are symmetric about the vehicle origin, so the
    // distance from the center of mass to either axle is half the
    // wheelbase.
    frontAxleCenterZMeters: wheelbaseMeters / 2,
    rearAxleCenterZMeters: -wheelbaseMeters / 2,
    source:
      specWheelbaseMeters > 0
        ? 'spec'
        : layout.wheelbaseMeters > 0
          ? 'wheel-layout'
          : 'default',
  }
}

function resolveTrackWidthMeters(
  specTrackWidthMeters,
  siblingSpecTrackWidthMeters,
  layoutTrackWidthMeters,
  defaultTrackWidthMeters
) {
  const resolvedSpecTrackWidthMeters = sanitizePositiveNumber(
    specTrackWidthMeters
  )
  if (resolvedSpecTrackWidthMeters > 0) {
    return resolvedSpecTrackWidthMeters
  }

  const resolvedSiblingSpecTrackWidthMeters = sanitizePositiveNumber(
    siblingSpecTrackWidthMeters
  )
  if (resolvedSiblingSpecTrackWidthMeters > 0) {
    return resolvedSiblingSpecTrackWidthMeters
  }

  if (layoutTrackWidthMeters > 0) {
    return layoutTrackWidthMeters
  }

  return defaultTrackWidthMeters
}

function deriveWheelLayoutGeometry(wheelStates) {
  let frontWheelCount = 0
  let rearWheelCount = 0
  let frontTotalZ = 0
  let rearTotalZ = 0
  let frontMinX = Number.POSITIVE_INFINITY
  let frontMaxX = Number.NEGATIVE_INFINITY
  let rearMinX = Number.POSITIVE_INFINITY
  let rearMaxX = Number.NEGATIVE_INFINITY

  for (const wheelState of wheelStates) {
    if (!wheelState) continue

    const localOffset =
      wheelState.contactPatchLocal ?? wheelState.localPosition
    const wheelOffsetRightMeters = sanitizeNumber(localOffset?.x)
    const wheelOffsetForwardMeters = sanitizeNumber(localOffset?.z)

    if (wheelState.axle === AXLES.FRONT) {
      frontWheelCount += 1
      frontTotalZ += wheelOffsetForwardMeters
      frontMinX = Math.min(frontMinX, wheelOffsetRightMeters)
      frontMaxX = Math.max(frontMaxX, wheelOffsetRightMeters)
    } else if (wheelState.axle === AXLES.REAR) {
      rearWheelCount += 1
      rearTotalZ += wheelOffsetForwardMeters
      rearMinX = Math.min(rearMinX, wheelOffsetRightMeters)
      rearMaxX = Math.max(rearMaxX, wheelOffsetRightMeters)
    }
  }

  const hasAxleGeometry = frontWheelCount > 0 && rearWheelCount > 0

  return {
    wheelbaseMeters: hasAxleGeometry
      ? Math.abs(frontTotalZ / frontWheelCount - rearTotalZ / rearWheelCount)
      : 0,
    frontTrackWidthMeters:
      frontWheelCount > 1 ? Math.max(0, frontMaxX - frontMinX) : 0,
    rearTrackWidthMeters:
      rearWheelCount > 1 ? Math.max(0, rearMaxX - rearMinX) : 0,
  }
}

function sanitizePositiveNumber(value) {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function sanitizeNumber(value) {
  return Number.isFinite(value) ? value : 0
}