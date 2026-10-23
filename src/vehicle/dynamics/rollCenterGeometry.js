// src/vehicle/dynamics/rollCenterGeometry.js

// Roll-center geometry for the 2D front-view suspension linkage.
//
// The roll center is the point where the line from the tire contact patch to
// the linkage's instant center crosses the vehicle centerline. Its height
// above the ground is the roll-center height, and it splits the lateral load
// transfer into the part the links carry directly (geometric transfer) and
// the part the springs carry (elastic transfer).
//
// The instant center is the intersection of the two linkage axes:
//   - double wishbone: the upper arm axis and the lower arm axis.
//   - MacPherson strut: the lower arm axis and the line through the strut
//     upper mount perpendicular to the strut axis. The strut axis runs from
//     the lower ball joint to the upper mount, so the knuckle's instantaneous
//     center lies on the perpendicular at the upper mount.
//
// The contact patch is not part of the linkage schema, so the ground point
// directly below the lower arm's outer ball joint is used as its proxy. That
// keeps the whole derivation inside the linkage's own coordinate frame, and
// the derived height is invariant under a uniform lateral scaling of that
// frame, so the schematic linkage scale does not leak into the result.
//
// Honest limitations (documented seams, not fake realism):
//   - The linkage schema is a front view only. It carries no per-axle
//     designation, so a declared linkage describes the whole vehicle and
//     both axles resolve to the same roll-center height.
//   - The linkage is schematic: its lateral scale does not match the chassis
//     track width, so the derived height is an archetype marker, not a
//     dimensioned value of a particular car.
//   - A linkage whose two axes do not intersect (parallel arms) has its
//     instant center at infinity; the parallel limit is used instead.

import { DOUBLE_WISHBONE_KIND, MACPHERSON_KIND } from './linkageCamberSolver.js'

const GEOMETRY_EPSILON_METERS = 1e-9

// The derived roll-center height is a pure function of the linkage geometry,
// and the linkage spec object is stable while a vehicle runs. The cache keeps
// the geometry math out of the fixed-step hot loop.
const rollCenterHeightCache = new WeakMap()

// The roll-center height of a linkage, in meters above the ground. Zero when
// the linkage declares no usable geometry.
export function deriveLinkageRollCenterHeightMeters(linkageSpec) {
  if (!linkageSpec || typeof linkageSpec !== 'object') return 0

  const cached = rollCenterHeightCache.get(linkageSpec)
  if (cached !== undefined) return cached

  const heightMeters = computeLinkageRollCenterHeightMeters(linkageSpec)
  rollCenterHeightCache.set(linkageSpec, heightMeters)
  return heightMeters
}

// The roll-center height of each axle, in meters above the ground.
//
// A coupled axle is a rigid beam, so its lateral force path runs through the
// leaf pack and the roll-center height of a solid axle is a property of that
// leaf pack. It is declared on the spec as a solid-axle roll-center height.
// An independent axle uses the linkage geometry when the vehicle declares a
// linkage, and has no roll center at all otherwise.
export function resolveAxleRollCenterHeightsMeters(spec = {}, coupledAxles = {}) {
  // Phase B.1: the roll-center height is consumed per axle. The nested slot
  // specs carry the archetype's own solid-axle height and linkage; legacy
  // specs without the nested objects keep the flat values for both axles.
  const frontSource = { ...spec, ...spec.suspensionFront }
  const rearSource = { ...spec, ...spec.suspensionRear }
  const frontSolidHeight = sanitizeNonNegativeNumber(
    frontSource.solidAxleRollCenterHeightMeters,
    0
  )
  const rearSolidHeight = sanitizeNonNegativeNumber(
    rearSource.solidAxleRollCenterHeightMeters,
    0
  )
  const frontLinkageHeight = deriveLinkageRollCenterHeightMeters(
    frontSource.suspensionLinkage
  )
  const rearLinkageHeight = deriveLinkageRollCenterHeightMeters(
    rearSource.suspensionLinkage
  )

  return {
    front: coupledAxles.front === true
      ? frontSolidHeight
      : frontLinkageHeight,
    rear: coupledAxles.rear === true
      ? rearSolidHeight
      : rearLinkageHeight,
  }
}

// The height of the roll axis at the center-of-mass station.
//
// The roll axis is the line that joins the front roll center and the rear
// roll center. The center of mass sits at the vehicle origin (see
// resolveChassisGeometry), so the height at that station is the linear
// interpolation between the two axle heights.
export function resolveRollAxisHeightMeters(
  frontRollCenterHeightMeters,
  rearRollCenterHeightMeters,
  chassisGeometry = {}
) {
  const frontHeightMeters = sanitizeNonNegativeNumber(
    frontRollCenterHeightMeters,
    0
  )
  const rearHeightMeters = sanitizeNonNegativeNumber(
    rearRollCenterHeightMeters,
    0
  )
  const frontAxleCenterZMeters = sanitizeNumber(
    chassisGeometry.frontAxleCenterZMeters
  )
  const rearAxleCenterZMeters = sanitizeNumber(
    chassisGeometry.rearAxleCenterZMeters
  )
  const axleSpanMeters = frontAxleCenterZMeters - rearAxleCenterZMeters

  if (!(axleSpanMeters > GEOMETRY_EPSILON_METERS)) {
    return (frontHeightMeters + rearHeightMeters) / 2
  }

  const centerOfMassFraction01 =
    frontAxleCenterZMeters / axleSpanMeters
  return (
    frontHeightMeters +
    (rearHeightMeters - frontHeightMeters) * centerOfMassFraction01
  )
}

function computeLinkageRollCenterHeightMeters(linkageSpec) {
  if (linkageSpec.kind === DOUBLE_WISHBONE_KIND) {
    return deriveDoubleWishboneRollCenterHeightMeters(linkageSpec.leftSide)
  }
  if (linkageSpec.kind === MACPHERSON_KIND) {
    return deriveMacPhersonRollCenterHeightMeters(linkageSpec.leftSide)
  }
  return 0
}

function deriveDoubleWishboneRollCenterHeightMeters(leftSide) {
  const upperArm = leftSide?.upperArm
  const lowerArm = leftSide?.lowerArm
  if (
    !isFinitePoint(upperArm?.innerPivot) ||
    !isFinitePoint(upperArm?.outerJoint) ||
    !isFinitePoint(lowerArm?.innerPivot) ||
    !isFinitePoint(lowerArm?.outerJoint)
  ) {
    return 0
  }

  const upperDirection = directionBetween(
    upperArm.innerPivot,
    upperArm.outerJoint
  )
  const lowerDirection = directionBetween(
    lowerArm.innerPivot,
    lowerArm.outerJoint
  )
  const instantCenter = intersectLines(
    upperArm.innerPivot,
    upperDirection,
    lowerArm.innerPivot,
    lowerDirection
  )

  return resolveRollCenterHeightMeters(
    instantCenter,
    lowerDirection,
    lowerArm.outerJoint.xMeters
  )
}

function deriveMacPhersonRollCenterHeightMeters(leftSide) {
  const strut = leftSide?.strut
  const lowerArm = leftSide?.lowerArm
  if (
    !isFinitePoint(strut?.upperMount) ||
    !isFinitePoint(lowerArm?.innerPivot) ||
    !isFinitePoint(lowerArm?.outerJoint)
  ) {
    return 0
  }

  // The strut axis runs from the lower ball joint to the upper mount. The
  // knuckle's instantaneous center lies on the line through the upper mount
  // perpendicular to that axis.
  const strutAxis = directionBetween(lowerArm.outerJoint, strut.upperMount)
  const perpendicular = {
    xMeters: -strutAxis.yMeters,
    yMeters: strutAxis.xMeters,
  }
  const lowerDirection = directionBetween(
    lowerArm.innerPivot,
    lowerArm.outerJoint
  )
  const instantCenter = intersectLines(
    strut.upperMount,
    perpendicular,
    lowerArm.innerPivot,
    lowerDirection
  )

  return resolveRollCenterHeightMeters(
    instantCenter,
    lowerDirection,
    lowerArm.outerJoint.xMeters
  )
}

// The roll-center height: where the line from the contact patch to the
// instant center crosses the vehicle centerline.
//
// The contact patch sits on the ground, so the line starts at
// (contactPatchXMeters, 0). A parallel linkage has no finite instant
// center, and its roll-center height is the parallel limit: the height at
// the centerline of the line through the contact patch that runs along the
// linkage axis.
function resolveRollCenterHeightMeters(
  instantCenter,
  linkageDirection,
  contactPatchXMeters
) {
  if (!instantCenter) {
    return resolveParallelLimitRollCenterHeightMeters(
      linkageDirection,
      contactPatchXMeters
    )
  }

  const spanMeters = contactPatchXMeters - instantCenter.xMeters
  if (Math.abs(spanMeters) < GEOMETRY_EPSILON_METERS) return 0

  const fraction01 = (0 - instantCenter.xMeters) / spanMeters
  const heightMeters =
    instantCenter.yMeters + (0 - instantCenter.yMeters) * fraction01

  return Number.isFinite(heightMeters) ? Math.max(0, heightMeters) : 0
}

function resolveParallelLimitRollCenterHeightMeters(
  linkageDirection,
  contactPatchXMeters
) {
  const slope = linkageDirection.yMeters / linkageDirection.xMeters
  if (!Number.isFinite(slope)) return 0

  const heightMeters = -slope * contactPatchXMeters
  return Number.isFinite(heightMeters) ? Math.max(0, heightMeters) : 0
}

// The intersection of two lines given as origin plus direction. Null when the
// lines are parallel.
function intersectLines(originA, directionA, originB, directionB) {
  const denominator =
    directionA.xMeters * directionB.yMeters -
    directionA.yMeters * directionB.xMeters
  if (Math.abs(denominator) < GEOMETRY_EPSILON_METERS) return null

  const offsetXMeters = originB.xMeters - originA.xMeters
  const offsetYMeters = originB.yMeters - originA.yMeters
  const parameter =
    (offsetXMeters * directionB.yMeters -
      offsetYMeters * directionB.xMeters) /
    denominator

  return {
    xMeters: originA.xMeters + parameter * directionA.xMeters,
    yMeters: originA.yMeters + parameter * directionA.yMeters,
  }
}

function directionBetween(from, to) {
  return {
    xMeters: to.xMeters - from.xMeters,
    yMeters: to.yMeters - from.yMeters,
  }
}

function isFinitePoint(point) {
  return (
    Number.isFinite(point?.xMeters) && Number.isFinite(point?.yMeters)
  )
}

function sanitizeNonNegativeNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback
}

function sanitizeNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}
