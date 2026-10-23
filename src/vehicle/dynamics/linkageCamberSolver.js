// src/vehicle/dynamics/linkageCamberSolver.js
//
// 2D front-view closed-form suspension linkage camber solver.
//
// The solver derives the wheel camber from actual suspension linkage pivot
// geometry instead of a linear camber-gain coefficient. It supports the
// double-wishbone and MacPherson-strut archetypes in a 2D front view, where
// every pivot is a (xMeters, yMeters) point: x is the lateral offset from the
// vehicle centerline and y is the height above ground at design ride.
//
// The front view collapses the fore-aft dimension, so the inner arm pivots
// project to one lateral position each. This keeps the schema 2D while
// allowing a later 3D expansion to replace the collapsed pivots with explicit
// front and rear points without changing the camber contract.
//
// Kinematic approach:
//   The suspension travel is applied to the lower control arm's outer joint
//   (the lower ball joint). Prescribing its vertical position closes the lower
//   arm exactly. The remaining links are then solved with circle-circle
//   intersections, so every arm and knuckle length is preserved exactly and
//   the solve is deterministic and closed-form (no iteration).
//
// Camber convention:
//   camberRadians > 0 means the top of the wheel tilts outboard, away from the
//   vehicle centerline. The solver infers the vehicle side from the pivot
//   geometry, so the same left-side definition can be mirrored for the right
//   side without a separate sign flag.
//
// Only the camber angle is consumed by the caller. Any lateral wheel motion
// (scrub) that falls out of the linkage solve is intentionally discarded.

export const MACPHERSON_KIND = 'macpherson-strut'
export const DOUBLE_WISHBONE_KIND = 'double-wishbone'

export function solveLinkageCamber(solverInput = {}) {
  const wheelTravelMeters = solverInput.wheelTravelMeters
  const linkageSpec = solverInput.linkageSpec
  const staticCamberRadians = solverInput.staticCamberRadians ?? 0

  if (!Number.isFinite(wheelTravelMeters) || !linkageSpec) {
    return sanitizeStaticCamberRadians(staticCamberRadians)
  }

  if (linkageSpec.kind === DOUBLE_WISHBONE_KIND) {
    return solveDoubleWishboneCamber(
      wheelTravelMeters,
      linkageSpec,
      staticCamberRadians
    )
  }

  if (linkageSpec.kind === MACPHERSON_KIND) {
    return solveMacPhersonCamber(
      wheelTravelMeters,
      linkageSpec,
      staticCamberRadians
    )
  }

  return sanitizeStaticCamberRadians(staticCamberRadians)
}

function solveDoubleWishboneCamber(
  wheelTravelMeters,
  linkageSpec,
  staticCamberRadians
) {
  const upperArm = linkageSpec.leftSide?.upperArm
  const lowerArm = linkageSpec.leftSide?.lowerArm
  const upperInner = upperArm?.innerPivot
  const upperOuter = upperArm?.outerJoint
  const lowerInner = lowerArm?.innerPivot
  const lowerOuter = lowerArm?.outerJoint

  if (
    !isPoint(upperInner) ||
    !isPoint(upperOuter) ||
    !isPoint(lowerInner) ||
    !isPoint(lowerOuter)
  ) {
    return sanitizeStaticCamberRadians(staticCamberRadians)
  }

  const upperArmLengthMeters = distanceMeters(upperInner, upperOuter)
  const lowerArmLengthMeters = distanceMeters(lowerInner, lowerOuter)
  const knuckleLengthMeters = distanceMeters(upperOuter, lowerOuter)

  const currentLowerJoint = resolveLowerJointFromTravel(
    lowerInner,
    lowerOuter,
    lowerArmLengthMeters,
    wheelTravelMeters
  )
  if (!currentLowerJoint) {
    return sanitizeStaticCamberRadians(staticCamberRadians)
  }

  const currentUpperJoint = intersectCircles(
    upperInner,
    upperArmLengthMeters,
    currentLowerJoint,
    knuckleLengthMeters,
    upperOuter
  )
  if (!currentUpperJoint) {
    return sanitizeStaticCamberRadians(staticCamberRadians)
  }

  return (
    sanitizeStaticCamberRadians(staticCamberRadians) +
    camberChangeRadians(
      upperOuter,
      lowerOuter,
      currentUpperJoint,
      currentLowerJoint
    )
  )
}

function solveMacPhersonCamber(
  wheelTravelMeters,
  linkageSpec,
  staticCamberRadians
) {
  const strut = linkageSpec.leftSide?.strut
  const lowerArm = linkageSpec.leftSide?.lowerArm
  const strutUpperMount = strut?.upperMount
  const lowerInner = lowerArm?.innerPivot
  const lowerOuter = lowerArm?.outerJoint

  if (
    !isPoint(strutUpperMount) ||
    !isPoint(lowerInner) ||
    !isPoint(lowerOuter)
  ) {
    return sanitizeStaticCamberRadians(staticCamberRadians)
  }

  const lowerArmLengthMeters = distanceMeters(lowerInner, lowerOuter)
  const currentLowerJoint = resolveLowerJointFromTravel(
    lowerInner,
    lowerOuter,
    lowerArmLengthMeters,
    wheelTravelMeters
  )
  if (!currentLowerJoint) {
    return sanitizeStaticCamberRadians(staticCamberRadians)
  }

  return (
    sanitizeStaticCamberRadians(staticCamberRadians) +
    camberChangeRadians(
      strutUpperMount,
      lowerOuter,
      strutUpperMount,
      currentLowerJoint
    )
  )
}

// Prescribes the vertical position of the lower ball joint from the wheel
// travel, then closes the lower arm exactly on the circle around its inner
// pivot. The lateral sign follows the static geometry so the joint stays on
// the same branch of the circle.
function resolveLowerJointFromTravel(
  lowerInner,
  lowerOuter,
  lowerArmLengthMeters,
  wheelTravelMeters
) {
  const staticLateralOffsetMeters = lowerOuter.xMeters - lowerInner.xMeters
  const outboardSign = Math.sign(staticLateralOffsetMeters) || 1
  const currentVerticalOffsetMeters =
    lowerOuter.yMeters + wheelTravelMeters - lowerInner.yMeters
  const currentLateralOffsetSquaredMeters =
    lowerArmLengthMeters * lowerArmLengthMeters -
    currentVerticalOffsetMeters * currentVerticalOffsetMeters
  if (currentLateralOffsetSquaredMeters <= 0) return null

  const currentLateralOffsetMeters =
    outboardSign * Math.sqrt(currentLateralOffsetSquaredMeters)

  return {
    xMeters: lowerInner.xMeters + currentLateralOffsetMeters,
    yMeters: lowerInner.yMeters + currentVerticalOffsetMeters,
  }
}

// The camber change is the knuckle (or strut) inclination change from its
// static pose. The side sign comes from the static geometry: on the left side
// the upper joint sits inboard of the lower joint, so positive inclination is
// negative camber; on the mirrored right side the signs flip.
function camberChangeRadians(
  staticUpperJoint,
  staticLowerJoint,
  currentUpperJoint,
  currentLowerJoint
) {
  const staticInclinationRadians = Math.atan2(
    staticUpperJoint.xMeters - staticLowerJoint.xMeters,
    staticUpperJoint.yMeters - staticLowerJoint.yMeters
  )
  const currentInclinationRadians = Math.atan2(
    currentUpperJoint.xMeters - currentLowerJoint.xMeters,
    currentUpperJoint.yMeters - currentLowerJoint.yMeters
  )
  const staticLateralOffsetMeters =
    staticUpperJoint.xMeters - staticLowerJoint.xMeters
  const sideSign = -Math.sign(staticLateralOffsetMeters) || -1

  return sideSign * (currentInclinationRadians - staticInclinationRadians)
}

// Closed-form circle-circle intersection. The branch closest to the static
// joint position is selected so the linkage stays continuous as travel
// changes.
function intersectCircles(
  centerA,
  radiusAMeters,
  centerB,
  radiusBMeters,
  preferredPoint
) {
  const centerOffsetXMeters = centerB.xMeters - centerA.xMeters
  const centerOffsetYMeters = centerB.yMeters - centerA.yMeters
  const centerDistanceMeters = Math.hypot(
    centerOffsetXMeters,
    centerOffsetYMeters
  )
  if (centerDistanceMeters <= 0) return null

  const projectionMeters =
    (radiusAMeters * radiusAMeters -
      radiusBMeters * radiusBMeters +
      centerDistanceMeters * centerDistanceMeters) /
    (2 * centerDistanceMeters)
  const halfChordSquaredMeters =
    radiusAMeters * radiusAMeters - projectionMeters * projectionMeters
  if (halfChordSquaredMeters < 0) return null

  const halfChordMeters = Math.sqrt(halfChordSquaredMeters)
  const midpointXMeters =
    centerA.xMeters +
    (projectionMeters * centerOffsetXMeters) / centerDistanceMeters
  const midpointYMeters =
    centerA.yMeters +
    (projectionMeters * centerOffsetYMeters) / centerDistanceMeters
  const perpendicularXMeters =
    (-halfChordMeters * centerOffsetYMeters) / centerDistanceMeters
  const perpendicularYMeters =
    (halfChordMeters * centerOffsetXMeters) / centerDistanceMeters

  const firstIntersection = {
    xMeters: midpointXMeters + perpendicularXMeters,
    yMeters: midpointYMeters + perpendicularYMeters,
  }
  const secondIntersection = {
    xMeters: midpointXMeters - perpendicularXMeters,
    yMeters: midpointYMeters - perpendicularYMeters,
  }

  const firstDistanceMeters = distanceMeters(firstIntersection, preferredPoint)
  const secondDistanceMeters = distanceMeters(secondIntersection, preferredPoint)

  return firstDistanceMeters <= secondDistanceMeters
    ? firstIntersection
    : secondIntersection
}

function distanceMeters(a, b) {
  const lateralOffsetMeters = b.xMeters - a.xMeters
  const verticalOffsetMeters = b.yMeters - a.yMeters

  return Math.hypot(lateralOffsetMeters, verticalOffsetMeters)
}

function isPoint(point) {
  return (
    Number.isFinite(point?.xMeters) &&
    Number.isFinite(point?.yMeters)
  )
}

function sanitizeStaticCamberRadians(value) {
  return Number.isFinite(value) ? value : 0
}
