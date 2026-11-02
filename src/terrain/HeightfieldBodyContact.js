// src/terrain/HeightfieldBodyContact.js

import * as THREE from 'three'

const NORMAL_Y_EPSILON = 1e-8
const CONTACT_SCRATCH = {
  normal: new THREE.Vector3(),
  depth: 0,
  point: new THREE.Vector3(),
  frictionCoefficient: 0,
  featureId: '',
}
const SURFACE_SCRATCH = {
  normalWorld: new THREE.Vector3(),
  terrainHeightMeters: 0,
  isWithinBounds: false,
  isInsideTerrainBounds: false,
  frictionCoefficient: 0,
}
const SUPPORT_POINT_SCRATCH = new THREE.Vector3()
const BOX_CORNER_FEATURE_IDS = Object.freeze([
  'box:corner:---',
  'box:corner:--+',
  'box:corner:-+-',
  'box:corner:-++',
  'box:corner:+--',
  'box:corner:+-+',
  'box:corner:++-',
  'box:corner:+++',
])

export function getTerrainSurfaceProfile(terrain) {
  return terrain?.surfaceProfile ?? terrain?.terrain?.surfaceProfile ?? terrain
}

export function testTerrainCollision(
  terrain,
  shape,
  transform,
  target = CONTACT_SCRATCH
) {
  const surfaceProfile = getTerrainSurfaceProfile(terrain)
  if (
    !surfaceProfile ||
    (typeof surfaceProfile.querySurfaceAtWorldPosition !== 'function' &&
      typeof terrain?.queryAtWorldXZ !== 'function')
  ) {
    throw new TypeError('terrain must expose a heightfield surface query')
  }
  if (!shape || !transform?.positionMeters || !transform?.orientationQuaternion) {
    throw new TypeError('shape and world transform are required')
  }

  target.depth = 0
  target.featureId = ''

  if (shape.type === 'sphere') {
    considerSupportPoint(
      terrain,
      transform.positionMeters.x,
      transform.positionMeters.y - shape.radiusMeters,
      transform.positionMeters.z,
      'sphere:bottom',
      target
    )
  } else if (shape.type === 'capsule') {
    const halfHeightMeters = shape.halfHeightMeters
    for (let endpointIndex = 0; endpointIndex < 2; endpointIndex += 1) {
      const endpointSign = endpointIndex === 0 ? -1 : 1
      SUPPORT_POINT_SCRATCH
        .set(0, endpointSign * halfHeightMeters, 0)
        .applyQuaternion(transform.orientationQuaternion)
        .add(transform.positionMeters)
      considerSupportPoint(
        terrain,
        SUPPORT_POINT_SCRATCH.x,
        SUPPORT_POINT_SCRATCH.y - shape.radiusMeters,
        SUPPORT_POINT_SCRATCH.z,
        endpointSign < 0 ? 'capsule:end:-' : 'capsule:end:+',
        target
      )
    }
  } else if (shape.type === 'box') {
    const halfExtentsMeters = shape.halfExtentsMeters
    let featureIndex = 0
    for (let xSignIndex = 0; xSignIndex < 2; xSignIndex += 1) {
      const xSign = xSignIndex === 0 ? -1 : 1
      for (let ySignIndex = 0; ySignIndex < 2; ySignIndex += 1) {
        const ySign = ySignIndex === 0 ? -1 : 1
        for (let zSignIndex = 0; zSignIndex < 2; zSignIndex += 1) {
          const zSign = zSignIndex === 0 ? -1 : 1
          SUPPORT_POINT_SCRATCH
            .set(
              xSign * halfExtentsMeters.x,
              ySign * halfExtentsMeters.y,
              zSign * halfExtentsMeters.z
            )
            .applyQuaternion(transform.orientationQuaternion)
            .add(transform.positionMeters)
          considerSupportPoint(
            terrain,
            SUPPORT_POINT_SCRATCH.x,
            SUPPORT_POINT_SCRATCH.y,
            SUPPORT_POINT_SCRATCH.z,
            BOX_CORNER_FEATURE_IDS[featureIndex],
            target
          )
          featureIndex += 1
        }
      }
    }
  } else {
    throw new TypeError('shape must be a sphere, capsule, or box')
  }

  return target.depth > 0 ? target : null
}

function considerSupportPoint(
  terrain,
  worldXMeters,
  supportHeightMeters,
  worldZMeters,
  featureId,
  target
) {
  const surface = queryTerrainSurface(terrain, worldXMeters, worldZMeters)
  if (
    surface.isWithinBounds !== true &&
    surface.isInsideTerrainBounds !== true
  ) {
    return
  }

  const normal = surface.normalWorld
  if (
    !normal ||
    !Number.isFinite(normal.x) ||
    !Number.isFinite(normal.y) ||
    !Number.isFinite(normal.z) ||
    normal.y <= NORMAL_Y_EPSILON ||
    !Number.isFinite(surface.terrainHeightMeters)
  ) {
    return
  }

  const penetrationDepthMeters =
    (surface.terrainHeightMeters - supportHeightMeters) / normal.y
  if (
    penetrationDepthMeters <= target.depth ||
    !Number.isFinite(penetrationDepthMeters)
  ) {
    return
  }

  target.normal.set(normal.x, normal.y, normal.z).normalize()
  target.depth = penetrationDepthMeters
  target.point.set(worldXMeters, surface.terrainHeightMeters, worldZMeters)
  target.frictionCoefficient = Number.isFinite(surface.frictionCoefficient)
    ? Math.max(0, surface.frictionCoefficient)
    : 0
  target.featureId = featureId
}

function queryTerrainSurface(terrain, worldXMeters, worldZMeters) {
  if (typeof terrain?.queryAtWorldXZ === 'function') {
    return terrain.queryAtWorldXZ(worldXMeters, worldZMeters, SURFACE_SCRATCH)
  }

  return getTerrainSurfaceProfile(terrain).querySurfaceAtWorldPosition(
    worldXMeters,
    worldZMeters,
    SURFACE_SCRATCH
  )
}
