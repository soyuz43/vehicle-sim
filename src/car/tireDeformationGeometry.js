// src/car/tireDeformationGeometry.js

import * as THREE from 'three'

const DEFAULT_RADIAL_SEGMENTS = 48
const DEFAULT_TUBULAR_SEGMENTS = 16
const DEFAULT_HUB_CLEARANCE_METERS = 0.024
const MINIMUM_TIRE_THICKNESS_METERS = 0.036
const BEAD_BLEND_START01 = 0.22
const BEAD_BLEND_END01 = 0.52

// Build a purpose-shaped toroidal shell with its rolling axis on local X.
// The geometry data also retains immutable baseline positions and influence
// weights so visual updates can be derived without cumulative vertex drift.
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

  return {
    geometry,
    metadata: data.metadata,
  }
}

// This Three.js-free data builder is deliberately exposed for deterministic
// geometry/deformation regression coverage.
export function createAnchoredToroidalTireGeometryData(options = {}) {
  const metadata = resolveTireGeometryMetadata(options)
  const radialSegments = metadata.radialSegments
  const tubularSegments = metadata.tubularSegments
  const verticesPerRing = tubularSegments + 1
  const vertexCount = (radialSegments + 1) * verticesPerRing
  const indexCount = radialSegments * tubularSegments * 6
  const baselinePositions = new Float32Array(vertexCount * 3)
  const uvs = new Float32Array(vertexCount * 2)
  const deformableWeights = new Float32Array(vertexCount)
  const treadWeights = new Float32Array(vertexCount)
  const sidewallWeights = new Float32Array(vertexCount)
  const outerRadialWeights = new Float32Array(vertexCount)
  const beadAnchorWeights = new Float32Array(vertexCount)
  const indices = new Uint16Array(indexCount)

  let vertexOffset = 0
  for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
    const theta = radialIndex / radialSegments * Math.PI * 2
    const radialDirectionY = Math.cos(theta)
    const radialDirectionZ = Math.sin(theta)

    for (let tubularIndex = 0; tubularIndex <= tubularSegments; tubularIndex += 1) {
      const phi = tubularIndex / tubularSegments * Math.PI * 2
      const axialPositionMeters =
        metadata.halfWidthMeters * Math.sin(phi)
      const radialDistanceMeters =
        metadata.majorRadiusMeters +
        metadata.radialThicknessMeters * Math.cos(phi)
      const radialNormalized01 = clamp01(
        (radialDistanceMeters - metadata.innerBeadRadiusMeters) /
          Math.max(
            metadata.outerRadiusMeters - metadata.innerBeadRadiusMeters,
            Number.EPSILON
          )
      )
      const axialNormalized01 = clamp01(
        Math.abs(axialPositionMeters) /
          Math.max(metadata.halfWidthMeters, Number.EPSILON)
      )
      const deformableWeight = smoothstep(
        BEAD_BLEND_START01,
        BEAD_BLEND_END01,
        radialNormalized01
      )
      const outerRadialWeight = smoothstep(0.54, 0.92, radialNormalized01)
      const treadWeight = deformableWeight * outerRadialWeight
      const sidewallWeight =
        deformableWeight *
        smoothstep(0.22, 0.78, axialNormalized01) *
        (1 - smoothstep(0.84, 1, radialNormalized01))
      const baseIndex = vertexOffset * 3
      const uvIndex = vertexOffset * 2

      baselinePositions[baseIndex] = axialPositionMeters
      baselinePositions[baseIndex + 1] = radialDirectionY * radialDistanceMeters
      baselinePositions[baseIndex + 2] = radialDirectionZ * radialDistanceMeters
      uvs[uvIndex] = radialIndex / radialSegments
      uvs[uvIndex + 1] = tubularIndex / tubularSegments
      deformableWeights[vertexOffset] = deformableWeight
      treadWeights[vertexOffset] = treadWeight
      sidewallWeights[vertexOffset] = sidewallWeight
      outerRadialWeights[vertexOffset] = outerRadialWeight
      beadAnchorWeights[vertexOffset] = deformableWeight === 0 ? 1 : 0
      vertexOffset += 1
    }
  }

  let indexOffset = 0
  for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
    for (let tubularIndex = 0; tubularIndex < tubularSegments; tubularIndex += 1) {
      const a = radialIndex * verticesPerRing + tubularIndex
      const b = (radialIndex + 1) * verticesPerRing + tubularIndex
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
    uvs,
    indices,
    deformableWeights,
    treadWeights,
    sidewallWeights,
    outerRadialWeights,
    beadAnchorWeights,
  }
}

// Apply a bounded visual-only deformation to a mutable position array. The
// contact plane is supplied in tire-local coordinates, so the flattened region
// remains ground-relative even when the rolling assembly spins.
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
} = {}) {
  const vertexCount = Math.min(
    Math.floor((baselinePositions?.length ?? 0) / 3),
    Math.floor((targetPositions?.length ?? 0) / 3),
    deformationData?.deformableWeights?.length ?? 0
  )

  if (vertexCount === 0) {
    return createEmptyDeformationResult()
  }

  const normal = normalizeVector3(localContactNormal, { x: 0, y: 1, z: 0 })
  const downX = -normal.x
  const downY = -normal.y
  const downZ = -normal.z
  const contactPointX = finiteNumber(localContactPoint?.x)
  const contactPointY = finiteNumber(localContactPoint?.y, -0.48)
  const contactPointZ = finiteNumber(localContactPoint?.z)
  const safePressureRadialOffsetMeters = clamp(
    pressureOnlyRadialOffsetMeters,
    -0.02,
    0.012
  )
  const safePressureSidewallBulgeMeters = clamp(
    pressureOnlySidewallBulgeMeters,
    -0.012,
    0.024
  )
  const safeContactFlatteningMeters = clamp(
    contactFlatteningMeters,
    0,
    0.09
  )
  const safeSidewallBulgeMeters = clamp(sidewallBulgeMeters, 0, 0.05)
  const grounded = isGrounded === true
  const minimumRadialDistanceMeters = Math.max(
    finiteNumber(deformationData?.metadata?.hubExclusionRadiusMeters),
    0
  )

  let maximumBeadAnchorDisplacementMeters = 0
  let maximumVertexDisplacementMeters = 0
  let minimumObservedRadialDistanceMeters = Number.POSITIVE_INFINITY
  let maximumContactDisplacementMeters = 0

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const baseIndex = vertexIndex * 3
    const baseX = baselinePositions[baseIndex]
    const baseY = baselinePositions[baseIndex + 1]
    const baseZ = baselinePositions[baseIndex + 2]
    const deformableWeight = clamp01(
      deformationData.deformableWeights[vertexIndex]
    )
    const outerRadialWeight = clamp01(
      deformationData.outerRadialWeights[vertexIndex]
    )
    const treadWeight = clamp01(deformationData.treadWeights[vertexIndex])
    const sidewallWeight = clamp01(
      deformationData.sidewallWeights[vertexIndex]
    )
    const baseRadialDistanceMeters = Math.hypot(baseY, baseZ)
    const safeBaseRadialDistanceMeters = Math.max(
      baseRadialDistanceMeters,
      Number.EPSILON
    )
    const radialDirectionY = baseY / safeBaseRadialDistanceMeters
    const radialDirectionZ = baseZ / safeBaseRadialDistanceMeters
    const pressureRadialOffsetMeters =
      safePressureRadialOffsetMeters * outerRadialWeight * deformableWeight
    const radialDistanceMeters = Math.max(
      minimumRadialDistanceMeters,
      baseRadialDistanceMeters + pressureRadialOffsetMeters
    )

    let x =
      baseX +
      Math.sign(baseX || 1) *
        safePressureSidewallBulgeMeters *
        sidewallWeight
    let y = radialDirectionY * radialDistanceMeters
    let z = radialDirectionZ * radialDistanceMeters
    let contactDisplacementMeters = 0

    if (grounded && deformableWeight > 0) {
      const vertexLengthMeters = Math.hypot(x, y, z)
      const directionX = x / Math.max(vertexLengthMeters, Number.EPSILON)
      const directionY = y / Math.max(vertexLengthMeters, Number.EPSILON)
      const directionZ = z / Math.max(vertexLengthMeters, Number.EPSILON)
      const lowerRegionWeight = smoothstep(
        0.18,
        0.88,
        directionX * downX + directionY * downY + directionZ * downZ
      )
      const contactWeight = lowerRegionWeight * Math.max(treadWeight, sidewallWeight)
      const distanceAboveContactPlaneMeters = Math.max(
        0,
        (x - contactPointX) * normal.x +
          (y - contactPointY) * normal.y +
          (z - contactPointZ) * normal.z
      )
      contactDisplacementMeters = Math.min(
        distanceAboveContactPlaneMeters,
        safeContactFlatteningMeters * contactWeight
      )

      x -= normal.x * contactDisplacementMeters
      y -= normal.y * contactDisplacementMeters
      z -= normal.z * contactDisplacementMeters
      x +=
        Math.sign(baseX || 1) *
        safeSidewallBulgeMeters *
        sidewallWeight *
        lowerRegionWeight
    }

    const finalRadialDistanceMeters = Math.hypot(y, z)
    if (
      finalRadialDistanceMeters < minimumRadialDistanceMeters &&
      finalRadialDistanceMeters > Number.EPSILON
    ) {
      const radialScale =
        minimumRadialDistanceMeters / finalRadialDistanceMeters
      y *= radialScale
      z *= radialScale
    }

    targetPositions[baseIndex] = finiteNumber(x)
    targetPositions[baseIndex + 1] = finiteNumber(y)
    targetPositions[baseIndex + 2] = finiteNumber(z)

    const displacementMeters = Math.hypot(x - baseX, y - baseY, z - baseZ)
    maximumVertexDisplacementMeters = Math.max(
      maximumVertexDisplacementMeters,
      displacementMeters
    )
    maximumContactDisplacementMeters = Math.max(
      maximumContactDisplacementMeters,
      contactDisplacementMeters
    )
    minimumObservedRadialDistanceMeters = Math.min(
      minimumObservedRadialDistanceMeters,
      Math.hypot(y, z)
    )

    if (deformationData.beadAnchorWeights[vertexIndex] >= 1) {
      maximumBeadAnchorDisplacementMeters = Math.max(
        maximumBeadAnchorDisplacementMeters,
        displacementMeters
      )
    }
  }

  return {
    maximumBeadAnchorDisplacementMeters,
    maximumVertexDisplacementMeters,
    minimumObservedRadialDistanceMeters: Number.isFinite(
      minimumObservedRadialDistanceMeters
    )
      ? minimumObservedRadialDistanceMeters
      : 0,
    maximumContactDisplacementMeters,
  }
}

export function restoreAnchoredToroidalTireBaseline(
  baselinePositions,
  targetPositions
) {
  if (!baselinePositions || !targetPositions) return false
  if (baselinePositions.length !== targetPositions.length) return false

  targetPositions.set(baselinePositions)
  return true
}

function resolveTireGeometryMetadata(options) {
  const outerRadiusMeters = Math.max(
    finiteNumber(options.outerRadiusMeters, 0.48),
    0.08
  )
  const widthMeters = Math.max(finiteNumber(options.widthMeters, 0.38), 0.06)
  const hubRadiusMeters = Math.max(finiteNumber(options.hubRadiusMeters), 0)
  const hubClearanceMeters = clamp(
    finiteNumber(options.hubClearanceMeters, DEFAULT_HUB_CLEARANCE_METERS),
    0.008,
    outerRadiusMeters * 0.24
  )
  const maximumInnerBeadRadiusMeters =
    outerRadiusMeters - MINIMUM_TIRE_THICKNESS_METERS
  const hubExclusionRadiusMeters = clamp(
    hubRadiusMeters + hubClearanceMeters,
    0.02,
    maximumInnerBeadRadiusMeters
  )
  const innerBeadRadiusMeters = hubExclusionRadiusMeters
  const radialThicknessMeters = Math.max(
    (outerRadiusMeters - innerBeadRadiusMeters) * 0.5,
    MINIMUM_TIRE_THICKNESS_METERS * 0.5
  )

  return Object.freeze({
    kind: 'anchored-toroidal-tire-shell-v1',
    outerRadiusMeters,
    widthMeters,
    halfWidthMeters: widthMeters * 0.5,
    hubRadiusMeters,
    hubClearanceMeters,
    hubExclusionRadiusMeters,
    innerBeadRadiusMeters,
    majorRadiusMeters: innerBeadRadiusMeters + radialThicknessMeters,
    radialThicknessMeters,
    radialSegments: sanitizeSegmentCount(
      options.radialSegments,
      DEFAULT_RADIAL_SEGMENTS
    ),
    tubularSegments: sanitizeSegmentCount(
      options.tubularSegments,
      DEFAULT_TUBULAR_SEGMENTS
    ),
  })
}

function createEmptyDeformationResult() {
  return {
    maximumBeadAnchorDisplacementMeters: 0,
    maximumVertexDisplacementMeters: 0,
    minimumObservedRadialDistanceMeters: 0,
    maximumContactDisplacementMeters: 0,
  }
}

function normalizeVector3(vector, fallback) {
  const x = finiteNumber(vector?.x, fallback.x)
  const y = finiteNumber(vector?.y, fallback.y)
  const z = finiteNumber(vector?.z, fallback.z)
  const length = Math.hypot(x, y, z)

  if (length <= Number.EPSILON) return fallback

  return {
    x: x / length,
    y: y / length,
    z: z / length,
  }
}

function sanitizeSegmentCount(value, fallback) {
  const rounded = Math.round(finiteNumber(value, fallback))
  return clamp(rounded, 8, 96)
}

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
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
