// src/terrain/createTerrain.js

import * as THREE from 'three'
import { createTerrainSurfaceProfile } from './createTerrainSurfaceProfile.js'

const DEFAULT_RENDER_SAMPLE_SPACING_METERS = 1.25
const MIN_RENDER_SUBDIVISIONS = 256
const MAX_RENDER_SUBDIVISIONS = 512
const MIN_EXPLICIT_RENDER_SUBDIVISIONS = 16

export function createTerrain(config = {}) {
  const surfaceProfile =
    config.surfaceProfile ??
    createTerrainSurfaceProfile({
      sizeMeters: config.size,
      frictionCoefficient: config.frictionCoefficient,
      profileName: config.profileName,
      normalSampleDistanceMeters: config.normalSampleDistanceMeters,
      surfaceFrictionByKind: config.surfaceFrictionByKind,
      surfaceRegions: config.surfaceRegions,
    })
  const size = surfaceProfile.sizeMeters
  const subdivisions = resolveRenderSubdivisions(config.subdivisions, size)

  // This static mesh samples the same pure profile consumed by the physics
  // contact query. It is intentionally not raycast back into simulation.
  const geometry = new THREE.PlaneGeometry(size, size, subdivisions, subdivisions)
  geometry.rotateX(-Math.PI / 2)
  const positionAttribute = geometry.getAttribute('position')

  for (let vertexIndex = 0; vertexIndex < positionAttribute.count; vertexIndex += 1) {
    const xMeters = positionAttribute.getX(vertexIndex)
    const zMeters = positionAttribute.getZ(vertexIndex)
    positionAttribute.setY(
      vertexIndex,
      surfaceProfile.getHeightAtWorldXZ(xMeters, zMeters)
    )
  }

  positionAttribute.needsUpdate = true
  const heightRange = setHeightMappedVertexColors(geometry, surfaceProfile)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  const material = new THREE.MeshStandardMaterial({
    color: config.color ?? 0xffffff,
    metalness: config.metalness ?? 0,
    roughness: config.roughness ?? 0.92,
    vertexColors: true,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true
  const gridLines = createTerrainGridLines(
    surfaceProfile,
    size,
    subdivisions,
    config.gridSpacingMeters
  )
  mesh.add(gridLines)

  mesh.userData.terrain = {
    kind: 'heightfield-proving-ground-render-v1',
    profileName: surfaceProfile.profileName,
    surfaceKind: surfaceProfile.surfaceKind,
    size,
    halfSize: size / 2,
    sizeMeters: size,
    halfSizeMeters: size / 2,
    renderSubdivisions: subdivisions,
    renderSampleSpacingMeters: size / subdivisions,
    heightRange,
    gridSpacingMeters: gridLines.userData.gridSpacingMeters,
    surfaceProfile,
  }

  return mesh
}

function setHeightMappedVertexColors(geometry, surfaceProfile) {
  const positions = geometry.getAttribute('position')
  const colors = new THREE.Float32BufferAttribute(positions.count * 3, 3)
  const baselineHeightMeters = surfaceProfile.getHeightAtWorldXZ(0, 0)
  const dipColor = new THREE.Color(0x403b79)
  const groundColor = new THREE.Color(0x5b8648)
  const soilColor = new THREE.Color(0x806344)
  const rockColor = new THREE.Color(0xa3a39a)
  const vertexColor = new THREE.Color()
  let minimumHeightMeters = Number.POSITIVE_INFINITY
  let maximumHeightMeters = Number.NEGATIVE_INFINITY

  for (let index = 0; index < positions.count; index += 1) {
    const heightMeters = positions.getY(index)
    minimumHeightMeters = Math.min(minimumHeightMeters, heightMeters)
    maximumHeightMeters = Math.max(maximumHeightMeters, heightMeters)
  }

  const hasHeightVariation = maximumHeightMeters - minimumHeightMeters > 1e-6
  const negativeRangeMeters = Math.max(
    baselineHeightMeters - minimumHeightMeters,
    0
  )
  const positiveRangeMeters = Math.max(
    maximumHeightMeters - baselineHeightMeters,
    0
  )

  for (let index = 0; index < positions.count; index += 1) {
    const heightMeters = positions.getY(index)
    if (!hasHeightVariation) {
      vertexColor.copy(groundColor)
    } else if (heightMeters < baselineHeightMeters && negativeRangeMeters > 0) {
      vertexColor.lerpColors(
        dipColor,
        groundColor,
        clamp01((heightMeters - minimumHeightMeters) / negativeRangeMeters)
      )
    } else if (positiveRangeMeters > 0) {
      const heightRatio01 = clamp01(
        (heightMeters - baselineHeightMeters) / positiveRangeMeters
      )
      if (heightRatio01 < 0.55) {
        vertexColor.lerpColors(
          groundColor,
          soilColor,
          heightRatio01 / 0.55
        )
      } else {
        vertexColor.lerpColors(
          soilColor,
          rockColor,
          (heightRatio01 - 0.55) / 0.45
        )
      }
    } else {
      vertexColor.copy(groundColor)
    }
    colors.setXYZ(index, vertexColor.r, vertexColor.g, vertexColor.b)
  }

  colors.needsUpdate = true
  geometry.setAttribute('color', colors)
  return { minimumHeightMeters, maximumHeightMeters, baselineHeightMeters }
}

function createTerrainGridLines(
  surfaceProfile,
  sizeMeters,
  subdivisions,
  requestedGridSpacingMeters
) {
  const halfSizeMeters = sizeMeters * 0.5
  const gridSpacingMeters = Number.isFinite(requestedGridSpacingMeters) &&
      requestedGridSpacingMeters > 0
    ? requestedGridSpacingMeters
    : Math.max(4, sizeMeters / 80)
  const lineSegmentsPerAxis = Math.max(8, Math.ceil(subdivisions / 2))
  const lineCountPerSide = Math.floor(halfSizeMeters / gridSpacingMeters)
  const positions = []
  const liftMeters = 0.025

  for (let lineIndex = -lineCountPerSide; lineIndex <= lineCountPerSide; lineIndex += 1) {
    const fixedXMeters = lineIndex * gridSpacingMeters
    appendTerrainGridLine(
      positions,
      surfaceProfile,
      fixedXMeters,
      -halfSizeMeters,
      sizeMeters,
      lineSegmentsPerAxis,
      liftMeters,
      true
    )
    appendTerrainGridLine(
      positions,
      surfaceProfile,
      fixedXMeters,
      -halfSizeMeters,
      sizeMeters,
      lineSegmentsPerAxis,
      liftMeters,
      false
    )
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  )
  geometry.computeBoundingSphere()
  const material = new THREE.LineBasicMaterial({
    color: 0x20251f,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  })
  const gridLines = new THREE.LineSegments(geometry, material)
  gridLines.name = 'terrain-contour-grid'
  gridLines.userData.gridSpacingMeters = gridSpacingMeters
  return gridLines
}

function appendTerrainGridLine(
  positions,
  surfaceProfile,
  fixedMeters,
  startMeters,
  lengthMeters,
  segmentCount,
  liftMeters,
  variesAlongZ
) {
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const startOffsetMeters = startMeters +
      (lengthMeters * segmentIndex) / segmentCount
    const endOffsetMeters = startMeters +
      (lengthMeters * (segmentIndex + 1)) / segmentCount
    const startXMeters = variesAlongZ ? fixedMeters : startOffsetMeters
    const startZMeters = variesAlongZ ? startOffsetMeters : fixedMeters
    const endXMeters = variesAlongZ ? fixedMeters : endOffsetMeters
    const endZMeters = variesAlongZ ? endOffsetMeters : fixedMeters
    positions.push(
      startXMeters,
      surfaceProfile.getHeightAtWorldXZ(startXMeters, startZMeters) + liftMeters,
      startZMeters,
      endXMeters,
      surfaceProfile.getHeightAtWorldXZ(endXMeters, endZMeters) + liftMeters,
      endZMeters
    )
  }
}

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1)
}

function resolveRenderSubdivisions(explicitSubdivisions, sizeMeters) {
  if (Number.isFinite(explicitSubdivisions)) {
    return THREE.MathUtils.clamp(
      Math.round(explicitSubdivisions),
      MIN_EXPLICIT_RENDER_SUBDIVISIONS,
      MAX_RENDER_SUBDIVISIONS
    )
  }

  // Without an explicit subdivision count the render grid follows the terrain
  // size, so the rendered sample spacing stays roughly constant across course
  // sizes instead of growing with the course.
  return THREE.MathUtils.clamp(
    Math.ceil(sizeMeters / DEFAULT_RENDER_SAMPLE_SPACING_METERS),
    MIN_RENDER_SUBDIVISIONS,
    MAX_RENDER_SUBDIVISIONS
  )
}
