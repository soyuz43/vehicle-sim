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
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  const material = new THREE.MeshStandardMaterial({
    color: config.color ?? 0x444444,
    metalness: config.metalness ?? 0.15,
    roughness: config.roughness ?? 0.85,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.receiveShadow = true

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
    surfaceProfile,
  }

  return mesh
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
