// src/car/tireDeformationGeometry.js

import * as THREE from 'three'
import { WHEEL_TIRE_VISUAL_DIMENSIONS } from './wheelTireVisualDimensions.js'

const DEFAULT_RADIAL_SEGMENTS = 48
const TUBULAR_SEGMENTS = 18
const MINIMUM_SEGMENTS = 8
const MAXIMUM_SEGMENTS = 96

export function createAnchoredToroidalTireGeometry(options = {}) {
  const data = createAnchoredToroidalTireGeometryData(options)
  const geometry = new THREE.BufferGeometry()
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1))
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(data.baselinePositions), 3)
  )
  geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  geometry.userData.anchoredTireDeformation = data
  return { geometry, metadata: data.metadata }
}

// The purpose-built local-X tire profile has paired bead rings, immutable
// baselines, and typed influence buffers for allocation-free render updates.
export function createAnchoredToroidalTireGeometryData(options = {}) {
  const metadata = resolveTireGeometryMetadata(options)
  const profile = createTireProfile(metadata)
  const radialSegments = metadata.radialSegments
  const tubularSegments = profile.length - 1
  const verticesPerRing = tubularSegments + 1
  const vertexCount = (radialSegments + 1) * verticesPerRing
  const baselinePositions = new Float32Array(vertexCount * 3)
  const baselineAxialPositionsMeters = new Float32Array(vertexCount)
  const baselineRadialDistancesMeters = new Float32Array(vertexCount)
  const uvs = new Float32Array(vertexCount * 2)
  const deformableWeights = new Float32Array(vertexCount)
  const treadWeights = new Float32Array(vertexCount)
  const sidewallWeights = new Float32Array(vertexCount)
  const shoulderWeights = new Float32Array(vertexCount)
  const outerRadialWeights = new Float32Array(vertexCount)
  const beadAnchorWeights = new Float32Array(vertexCount)
  const indices = new Uint16Array(radialSegments * tubularSegments * 6)

  let vertexOffset = 0
  for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
    const theta = radialIndex / radialSegments * Math.PI * 2
    const radialDirectionY = Math.cos(theta)
    const radialDirectionZ = Math.sin(theta)

    for (let profileIndex = 0; profileIndex <= tubularSegments; profileIndex += 1) {
      const point = profile[profileIndex]
      const radialNormalized01 = clamp01(
        (point.radialDistanceMeters - metadata.tireInnerLinerRadiusMeters) /
          Math.max(
            metadata.tireOuterRadiusMeters - metadata.tireInnerLinerRadiusMeters,
            Number.EPSILON
          )
      )
      const deformableWeight = 1 - point.beadAnchorWeight
      const baseIndex = vertexOffset * 3
      const uvIndex = vertexOffset * 2

      baselinePositions[baseIndex] = point.axialPositionMeters
      baselinePositions[baseIndex + 1] = radialDirectionY * point.radialDistanceMeters
      baselinePositions[baseIndex + 2] = radialDirectionZ * point.radialDistanceMeters
      baselineAxialPositionsMeters[vertexOffset] = point.axialPositionMeters
      baselineRadialDistancesMeters[vertexOffset] = point.radialDistanceMeters
      uvs[uvIndex] = radialIndex / radialSegments
      uvs[uvIndex + 1] = profileIndex / tubularSegments
      deformableWeights[vertexOffset] = deformableWeight
      treadWeights[vertexOffset] = point.treadWeight * deformableWeight
      sidewallWeights[vertexOffset] = point.sidewallWeight * deformableWeight
      shoulderWeights[vertexOffset] = point.shoulderWeight * deformableWeight
      outerRadialWeights[vertexOffset] =
        smoothstep(0.52, 0.92, radialNormalized01) * deformableWeight
      beadAnchorWeights[vertexOffset] = point.beadAnchorWeight
      vertexOffset += 1
    }
  }

  let indexOffset = 0
  for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
    for (let profileIndex = 0; profileIndex < tubularSegments; profileIndex += 1) {
      const a = radialIndex * verticesPerRing + profileIndex
      const b = (radialIndex + 1) * verticesPerRing + profileIndex
      const c = b + 1
      const d = a + 1
      indices[indexOffset] = a
      indices[indexOffset + 1] = b
      indices[indexOffset + 2] = d
      indices[indexOffset + 3] = b
      indices[indexOffset + 4] = c
      indices[indexOffset + 5] = d
      indexOffset += 6
    }
  }

  return {
    metadata,
    baselinePositions,
    baselineAxialPositionsMeters,
    baselineRadialDistancesMeters,
    uvs,
    indices,
    deformableWeights,
    treadWeights,
    sidewallWeights,
    shoulderWeights,
    outerRadialWeights,
    beadAnchorWeights,
  }
}

// Every output is regenerated from baselinePositions. The contact frame is
// already tire-local, so tread flattening does not rotate with wheel spin.
export function deformAnchoredToroidalTirePositions({
  baselinePositions,
  targetPositions,
  deformationData,
  localContactNormal = { x: 0, y: 1, z: 0 },
  localContactPoint = { x: 0, y: -0.48, z: 0 },
  isGrounded = false,
  pressureOnlyRadialOffsetMeters = 0,
  pressureOnlySidewallBulgeMeters = 0,
  contactFlatteningMeters = 0,
  sidewallBulgeMeters = 0,
  lowerSidewallCollapseMeters = 0,
} = {}) {
  const vertexCount = Math.min(
    Math.floor((baselinePositions?.length ?? 0) / 3),
    Math.floor((targetPositions?.length ?? 0) / 3),
    deformationData?.deformableWeights?.length ?? 0
  )
  if (vertexCount === 0) return createEmptyDeformationResult()

  const metadata = deformationData.metadata ?? {}
  const normal = normalizeVector3(localContactNormal, { x: 0, y: 1, z: 0 })
  const downX = -normal.x
  const downY = -normal.y
  const downZ = -normal.z
  const contactPointX = finiteNumber(localContactPoint?.x)
  const contactPointY = finiteNumber(localContactPoint?.y, -0.48)
  const contactPointZ = finiteNumber(localContactPoint?.z)
  const safePressureRadialOffsetMeters = clamp(pressureOnlyRadialOffsetMeters, -0.028, 0.012)
  const safePressureSidewallBulgeMeters = clamp(pressureOnlySidewallBulgeMeters, -0.012, 0.036)
  const safeContactFlatteningMeters = clamp(contactFlatteningMeters, 0, 0.14)
  const safeSidewallBulgeMeters = clamp(sidewallBulgeMeters, 0, 0.065)
  const safeLowerSidewallCollapseMeters = clamp(lowerSidewallCollapseMeters, 0, 0.075)
  const grounded = isGrounded === true

  let maximumBeadAnchorDisplacementMeters = 0
  let maximumVertexDisplacementMeters = 0
  let minimumObservedRadialDistanceMeters = Number.POSITIVE_INFINITY
  let minimumRimClearanceMeters = Number.POSITIVE_INFINITY
  let maximumRadialIntrusionMeters = 0
  let maximumContactDisplacementMeters = 0
  let minimumTerrainFacingRadiusMeters = Number.POSITIVE_INFINITY

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const baseIndex = vertexIndex * 3
    const baseX = baselinePositions[baseIndex]
    const baseY = baselinePositions[baseIndex + 1]
    const baseZ = baselinePositions[baseIndex + 2]
    const baseRadialDistanceMeters = Math.hypot(baseY, baseZ)
    const radialScale = 1 / Math.max(baseRadialDistanceMeters, Number.EPSILON)
    const radialDirectionY = baseY * radialScale
    const radialDirectionZ = baseZ * radialScale
    const deformableWeight = clamp01(deformationData.deformableWeights[vertexIndex])
    const treadWeight = clamp01(deformationData.treadWeights[vertexIndex])
    const sidewallWeight = clamp01(deformationData.sidewallWeights[vertexIndex])
    const shoulderWeight = clamp01(deformationData.shoulderWeights?.[vertexIndex])
    const outerRadialWeight = clamp01(deformationData.outerRadialWeights[vertexIndex])
    const beadAnchorWeight = clamp01(deformationData.beadAnchorWeights[vertexIndex])

    let radialDistanceMeters =
      baseRadialDistanceMeters + safePressureRadialOffsetMeters * outerRadialWeight
    let x =
      baseX +
      Math.sign(baseX || 1) * safePressureSidewallBulgeMeters * sidewallWeight
    let y = radialDirectionY * radialDistanceMeters
    let z = radialDirectionZ * radialDistanceMeters
    let contactDisplacementMeters = 0

    if (grounded && deformableWeight > 0) {
      const inverseLength = 1 / Math.max(Math.hypot(x, y, z), Number.EPSILON)
      const lowerRegionWeight = smoothstep(
        0.14,
        0.82,
        (x * downX + y * downY + z * downZ) * inverseLength
      )
      const contactWeight = lowerRegionWeight * clamp01(
        treadWeight + sidewallWeight * 0.72 + shoulderWeight * 0.36
      )
      const collapseWeight = lowerRegionWeight * clamp01(
        sidewallWeight + shoulderWeight * 0.45
      )

      radialDistanceMeters = Math.max(
        0,
        radialDistanceMeters - safeLowerSidewallCollapseMeters * collapseWeight
      )
      y = radialDirectionY * radialDistanceMeters
      z = radialDirectionZ * radialDistanceMeters
      x +=
        Math.sign(baseX || 1) *
        safeSidewallBulgeMeters *
        sidewallWeight *
        lowerRegionWeight

      let signedDistanceToContactPlaneMeters =
        (x - contactPointX) * normal.x +
        (y - contactPointY) * normal.y +
        (z - contactPointZ) * normal.z
      if (contactWeight > 0 && signedDistanceToContactPlaneMeters < 0) {
        const correctionMeters = -signedDistanceToContactPlaneMeters
        x += normal.x * correctionMeters
        y += normal.y * correctionMeters
        z += normal.z * correctionMeters
        contactDisplacementMeters += correctionMeters
        signedDistanceToContactPlaneMeters = 0
      }

      const flatteningMeters = Math.min(
        Math.max(0, signedDistanceToContactPlaneMeters),
        safeContactFlatteningMeters * contactWeight
      )
      x -= normal.x * flatteningMeters
      y -= normal.y * flatteningMeters
      z -= normal.z * flatteningMeters
      contactDisplacementMeters += flatteningMeters
    }

    const requiredRimClearanceRadiusMeters =
      resolveRequiredRimClearanceRadiusMeters(x, metadata, beadAnchorWeight)
    radialDistanceMeters = Math.hypot(y, z)
    if (
      requiredRimClearanceRadiusMeters > 0 &&
      radialDistanceMeters < requiredRimClearanceRadiusMeters
    ) {
      const clearanceScale =
        requiredRimClearanceRadiusMeters /
        Math.max(radialDistanceMeters, Number.EPSILON)
      y *= clearanceScale
      z *= clearanceScale
      maximumRadialIntrusionMeters = Math.max(
        maximumRadialIntrusionMeters,
        requiredRimClearanceRadiusMeters - radialDistanceMeters
      )
    }

    // Exact bead rings remain at their shared rim-seat baseline. Neighboring
    // stations blend smoothly into the fixed boundary through anchor weights.
    if (beadAnchorWeight > 0) {
      x = lerp(x, baseX, beadAnchorWeight)
      y = lerp(y, baseY, beadAnchorWeight)
      z = lerp(z, baseZ, beadAnchorWeight)
    }

    targetPositions[baseIndex] = finiteNumber(x)
    targetPositions[baseIndex + 1] = finiteNumber(y)
    targetPositions[baseIndex + 2] = finiteNumber(z)

    const finalRadialDistanceMeters = Math.hypot(y, z)
    const displacementMeters = Math.hypot(x - baseX, y - baseY, z - baseZ)
    maximumVertexDisplacementMeters = Math.max(maximumVertexDisplacementMeters, displacementMeters)
    maximumContactDisplacementMeters = Math.max(
      maximumContactDisplacementMeters,
      contactDisplacementMeters
    )
    minimumObservedRadialDistanceMeters = Math.min(
      minimumObservedRadialDistanceMeters,
      finalRadialDistanceMeters
    )

    if (beadAnchorWeight >= 0.999) {
      maximumBeadAnchorDisplacementMeters = Math.max(
        maximumBeadAnchorDisplacementMeters,
        displacementMeters
      )
    } else if (treadWeight + sidewallWeight > 0.05) {
      minimumRimClearanceMeters = Math.min(
        minimumRimClearanceMeters,
        finalRadialDistanceMeters - metadata.rimFlangeRadiusMeters
      )
    }

    if (
      grounded &&
      treadWeight > 0.1 &&
      (x * downX + y * downY + z * downZ) /
        Math.max(Math.hypot(x, y, z), Number.EPSILON) >
        0.72
    ) {
      minimumTerrainFacingRadiusMeters = Math.min(
        minimumTerrainFacingRadiusMeters,
        finalRadialDistanceMeters
      )
    }
  }

  return {
    maximumBeadAnchorDisplacementMeters,
    maximumVertexDisplacementMeters,
    minimumObservedRadialDistanceMeters: finiteOrZero(minimumObservedRadialDistanceMeters),
    minimumRimClearanceMeters: finiteOrZero(minimumRimClearanceMeters),
    maximumRadialIntrusionMeters,
    maximumContactDisplacementMeters,
    minimumTerrainFacingRadiusMeters: finiteOrZero(minimumTerrainFacingRadiusMeters),
  }
}

export function restoreAnchoredToroidalTireBaseline(baselinePositions, targetPositions) {
  if (!baselinePositions || !targetPositions) return false
  if (baselinePositions.length !== targetPositions.length) return false
  targetPositions.set(baselinePositions)
  return true
}

function resolveTireGeometryMetadata(options) {
  const dimensions = options.visualDimensions ?? WHEEL_TIRE_VISUAL_DIMENSIONS
  const tireOuterRadiusMeters = sanitizePositiveNumber(
    dimensions.tireOuterRadiusMeters,
    WHEEL_TIRE_VISUAL_DIMENSIONS.tireOuterRadiusMeters
  )
  const tireSectionWidthMeters = sanitizePositiveNumber(
    dimensions.tireSectionWidthMeters,
    WHEEL_TIRE_VISUAL_DIMENSIONS.tireSectionWidthMeters
  )

  return Object.freeze({
    kind: 'bead-seated-toroidal-tire-shell-v1',
    tireOuterRadiusMeters,
    outerRadiusMeters: tireOuterRadiusMeters,
    tireSectionWidthMeters,
    widthMeters: tireSectionWidthMeters,
    tireHalfWidthMeters: tireSectionWidthMeters * 0.5,
    halfWidthMeters: tireSectionWidthMeters * 0.5,
    tireBeadRadiusMeters: sanitizePositiveNumber(dimensions.tireBeadRadiusMeters, WHEEL_TIRE_VISUAL_DIMENSIONS.tireBeadRadiusMeters),
    innerBeadRadiusMeters: sanitizePositiveNumber(dimensions.tireBeadRadiusMeters, WHEEL_TIRE_VISUAL_DIMENSIONS.tireBeadRadiusMeters),
    tireBeadAxialPositionMeters: sanitizeNonNegativeNumber(dimensions.tireBeadAxialPositionMeters, WHEEL_TIRE_VISUAL_DIMENSIONS.tireBeadAxialPositionMeters),
    tireInnerLinerRadiusMeters: sanitizePositiveNumber(dimensions.tireInnerLinerRadiusMeters, WHEEL_TIRE_VISUAL_DIMENSIONS.tireInnerLinerRadiusMeters),
    hubDiscRadiusMeters: sanitizePositiveNumber(dimensions.hubDiscRadiusMeters, WHEEL_TIRE_VISUAL_DIMENSIONS.hubDiscRadiusMeters),
    rimBarrelOuterRadiusMeters: sanitizePositiveNumber(dimensions.rimBarrelOuterRadiusMeters, WHEEL_TIRE_VISUAL_DIMENSIONS.rimBarrelOuterRadiusMeters),
    rimBarrelWidthMeters: sanitizePositiveNumber(dimensions.rimBarrelWidthMeters, WHEEL_TIRE_VISUAL_DIMENSIONS.rimBarrelWidthMeters),
    beadSeatRadiusMeters: sanitizePositiveNumber(dimensions.beadSeatRadiusMeters, WHEEL_TIRE_VISUAL_DIMENSIONS.beadSeatRadiusMeters),
    beadSeatWidthMeters: sanitizePositiveNumber(dimensions.beadSeatWidthMeters, WHEEL_TIRE_VISUAL_DIMENSIONS.beadSeatWidthMeters),
    beadSeatAxialPositionMeters: sanitizeNonNegativeNumber(dimensions.beadSeatAxialPositionMeters, WHEEL_TIRE_VISUAL_DIMENSIONS.beadSeatAxialPositionMeters),
    rimFlangeRadiusMeters: sanitizePositiveNumber(dimensions.rimFlangeRadiusMeters, WHEEL_TIRE_VISUAL_DIMENSIONS.rimFlangeRadiusMeters),
    rimFlangeWidthMeters: sanitizePositiveNumber(dimensions.rimFlangeWidthMeters, WHEEL_TIRE_VISUAL_DIMENSIONS.rimFlangeWidthMeters),
    rimFlangeAxialPositionMeters: sanitizeNonNegativeNumber(dimensions.rimFlangeAxialPositionMeters, WHEEL_TIRE_VISUAL_DIMENSIONS.rimFlangeAxialPositionMeters),
    beadInterfaceGapMeters: 0,
    beadInterfaceOverlapMeters: sanitizeNonNegativeNumber(dimensions.beadInterfaceOverlapMeters, WHEEL_TIRE_VISUAL_DIMENSIONS.beadInterfaceOverlapMeters),
    beadInterfaceToleranceMeters: sanitizeNonNegativeNumber(dimensions.beadInterfaceToleranceMeters, WHEEL_TIRE_VISUAL_DIMENSIONS.beadInterfaceToleranceMeters),
    minimumCarcassSupportThicknessMeters: sanitizeNonNegativeNumber(dimensions.minimumCarcassSupportThicknessMeters, WHEEL_TIRE_VISUAL_DIMENSIONS.minimumCarcassSupportThicknessMeters),
    radialSegments: sanitizeSegmentCount(options.radialSegments, DEFAULT_RADIAL_SEGMENTS),
    tubularSegments: TUBULAR_SEGMENTS,
  })
}

function createTireProfile(metadata) {
  const outerRadiusMeters = metadata.tireOuterRadiusMeters
  const halfWidthMeters = metadata.tireHalfWidthMeters
  const beadAxialPositionMeters = metadata.tireBeadAxialPositionMeters
  const beadRadiusMeters = metadata.tireBeadRadiusMeters
  const innerLinerRadiusMeters = metadata.tireInnerLinerRadiusMeters
  const sidewallAxialPositionMeters = halfWidthMeters * 0.92
  const shoulderAxialPositionMeters = halfWidthMeters * 0.79
  const treadEdgeAxialPositionMeters = halfWidthMeters * 0.58
  const linerAxialPositionMeters = beadAxialPositionMeters * 0.78

  return [
    profilePoint(0, outerRadiusMeters, 1, 0, 0, 0),
    profilePoint(treadEdgeAxialPositionMeters, outerRadiusMeters, 1, 0, 0, 0),
    profilePoint(shoulderAxialPositionMeters, outerRadiusMeters - 0.013, 0.68, 0.3, 0.7, 0),
    profilePoint(sidewallAxialPositionMeters, outerRadiusMeters - 0.05, 0.18, 0.9, 0.5, 0.04),
    profilePoint(halfWidthMeters, outerRadiusMeters - 0.1, 0, 1, 0.2, 0.16),
    profilePoint(sidewallAxialPositionMeters, outerRadiusMeters - 0.135, 0, 1, 0, 0.48),
    profilePoint(beadAxialPositionMeters * 1.19, beadRadiusMeters + 0.0115, 0, 0.72, 0, 0.72),
    profilePoint(beadAxialPositionMeters, beadRadiusMeters, 0, 0, 0, 1),
    profilePoint(linerAxialPositionMeters, innerLinerRadiusMeters, 0, 0, 0, 0.46),
    profilePoint(0, innerLinerRadiusMeters, 0, 0, 0, 0),
    profilePoint(-linerAxialPositionMeters, innerLinerRadiusMeters, 0, 0, 0, 0.46),
    profilePoint(-beadAxialPositionMeters, beadRadiusMeters, 0, 0, 0, 1),
    profilePoint(-beadAxialPositionMeters * 1.19, beadRadiusMeters + 0.0115, 0, 0.72, 0, 0.72),
    profilePoint(-sidewallAxialPositionMeters, outerRadiusMeters - 0.135, 0, 1, 0, 0.48),
    profilePoint(-halfWidthMeters, outerRadiusMeters - 0.1, 0, 1, 0.2, 0.16),
    profilePoint(-sidewallAxialPositionMeters, outerRadiusMeters - 0.05, 0.18, 0.9, 0.5, 0.04),
    profilePoint(-shoulderAxialPositionMeters, outerRadiusMeters - 0.013, 0.68, 0.3, 0.7, 0),
    profilePoint(-treadEdgeAxialPositionMeters, outerRadiusMeters, 1, 0, 0, 0),
    profilePoint(0, outerRadiusMeters, 1, 0, 0, 0),
  ]
}

function profilePoint(axialPositionMeters, radialDistanceMeters, treadWeight, sidewallWeight, shoulderWeight, beadAnchorWeight) {
  return { axialPositionMeters, radialDistanceMeters, treadWeight, sidewallWeight, shoulderWeight, beadAnchorWeight }
}

function resolveRequiredRimClearanceRadiusMeters(axialPositionMeters, metadata, beadAnchorWeight) {
  if (beadAnchorWeight >= 0.7) return 0
  const absoluteAxialPositionMeters = Math.abs(axialPositionMeters)
  if (Math.abs(absoluteAxialPositionMeters - metadata.rimFlangeAxialPositionMeters) <= metadata.rimFlangeWidthMeters * 0.5) {
    return metadata.rimFlangeRadiusMeters + 0.001
  }
  if (absoluteAxialPositionMeters <= metadata.rimBarrelWidthMeters * 0.5) {
    return metadata.rimBarrelOuterRadiusMeters + 0.001
  }
  return 0
}

function createEmptyDeformationResult() {
  return {
    maximumBeadAnchorDisplacementMeters: 0,
    maximumVertexDisplacementMeters: 0,
    minimumObservedRadialDistanceMeters: 0,
    minimumRimClearanceMeters: 0,
    maximumRadialIntrusionMeters: 0,
    maximumContactDisplacementMeters: 0,
    minimumTerrainFacingRadiusMeters: 0,
  }
}

function normalizeVector3(vector, fallback) {
  const x = finiteNumber(vector?.x, fallback.x)
  const y = finiteNumber(vector?.y, fallback.y)
  const z = finiteNumber(vector?.z, fallback.z)
  const length = Math.hypot(x, y, z)
  if (length <= Number.EPSILON) return fallback
  return { x: x / length, y: y / length, z: z / length }
}

function sanitizeSegmentCount(value, fallback) {
  return clamp(Math.round(finiteNumber(value, fallback)), MINIMUM_SEGMENTS, MAXIMUM_SEGMENTS)
}

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0
}

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function sanitizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeNonNegativeNumber(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function lerp(a, b, t) {
  return a + (b - a) * clamp01(t)
}

function clamp01(value) {
  return clamp(value, 0, 1)
}

function smoothstep(edge0, edge1, value) {
  const span = edge1 - edge0
  if (span <= Number.EPSILON) return value >= edge1 ? 1 : 0
  const t = clamp01((value - edge0) / span)
  return t * t * (3 - 2 * t)
}

function clamp(value, minimum, maximum) {
  const safeValue = Number.isFinite(value) ? value : minimum
  return Math.min(maximum, Math.max(minimum, safeValue))
}
