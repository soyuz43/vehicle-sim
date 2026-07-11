// src/terrain/createTerrain.js

import * as THREE from 'three'
import { createTerrainSurfaceProfile } from './createTerrainSurfaceProfile.js'

const DEFAULT_RENDER_SUBDIVISIONS = 256

export function createTerrain(config = {}) {
  const surfaceProfile =
    config.surfaceProfile ??
    createTerrainSurfaceProfile({
      sizeMeters: config.size,
      frictionCoefficient: config.frictionCoefficient,
      profileName: config.profileName,
      normalSampleDistanceMeters: config.normalSampleDistanceMeters,
    })
  const size = surfaceProfile.sizeMeters
  const subdivisions = sanitizeSubdivisionCount(
    config.subdivisions,
    DEFAULT_RENDER_SUBDIVISIONS
  )

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
    surfaceProfile,
  }

  return mesh
}

function sanitizeSubdivisionCount(value, fallback) {
  const subdivisions = Math.round(
    Number.isFinite(value) ? value : fallback
  )

  return THREE.MathUtils.clamp(subdivisions, 16, 512)
}
