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
const SURFACE_POINT_SCRATCH = new THREE.Vector3()
const CENTER_TO_SURFACE_SCRATCH = new THREE.Vector3()
const NORMAL_SCRATCH = new THREE.Vector3()
const BOX_CONTACT_POINT_SUM_SCRATCH = new THREE.Vector3()
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
    considerRoundSupportPoint(
      terrain,
      transform.positionMeters,
      shape.radiusMeters,
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
      considerRoundSupportPoint(
        terrain,
        SUPPORT_POINT_SCRATCH,
        shape.radiusMeters,
        endpointSign < 0 ? 'capsule:end:-' : 'capsule:end:+',
        target
      )
    }
  } else if (shape.type === 'box') {
    const halfExtentsMeters = shape.halfExtentsMeters
    let featureIndex = 0
    let boxContactPointCount = 0
    BOX_CONTACT_POINT_SUM_SCRATCH.set(0, 0, 0)
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
          boxContactPointCount = considerBoxSupportPoint(
            terrain,
            SUPPORT_POINT_SCRATCH.x,
            SUPPORT_POINT_SCRATCH.y,
            SUPPORT_POINT_SCRATCH.z,
            BOX_CORNER_FEATURE_IDS[featureIndex],
            target,
            boxContactPointCount
          )
          featureIndex += 1
        }
      }
    }
    if (boxContactPointCount > 1) {
      target.point.copy(BOX_CONTACT_POINT_SUM_SCRATCH)
        .multiplyScalar(1 / boxContactPointCount)
    }
  } else {
    throw new TypeError('shape must be a sphere, capsule, or box')
  }

  return target.depth > 0 ? target : null
}

function considerRoundSupportPoint(
  terrain,
  sphereCenterMeters,
  radiusMeters,
  featureId,
  target
) {
  const surfaceProfile = getTerrainSurfaceProfile(terrain)
  const terrainHalfSizeMeters = surfaceProfile?.halfSizeMeters ??
    surfaceProfile?.sizeMeters * 0.5
  let sampleXMeters = sphereCenterMeters.x
  let sampleZMeters = sphereCenterMeters.z
  let sampleWasClamped = false

  if (Number.isFinite(terrainHalfSizeMeters) && terrainHalfSizeMeters >= 0) {
    sampleXMeters = clamp(
      sampleXMeters,
      -terrainHalfSizeMeters,
      terrainHalfSizeMeters
    )
    sampleZMeters = clamp(
      sampleZMeters,
      -terrainHalfSizeMeters,
      terrainHalfSizeMeters
    )
    const outsideXMeters = sphereCenterMeters.x - sampleXMeters
    const outsideZMeters = sphereCenterMeters.z - sampleZMeters
    sampleWasClamped = outsideXMeters !== 0 || outsideZMeters !== 0
    if (
      outsideXMeters * outsideXMeters + outsideZMeters * outsideZMeters >
      radiusMeters * radiusMeters
    ) {
      return
    }
  }

  const surface = queryTerrainSurface(terrain, sampleXMeters, sampleZMeters)
  if (
    surface.isWithinBounds !== true &&
    surface.isInsideTerrainBounds !== true &&
    !sampleWasClamped
  ) {
    return
  }

  const normal = getNormalizedSurfaceNormal(surface)
  if (
    !normal ||
    normal.y <= NORMAL_Y_EPSILON ||
    !Number.isFinite(surface.terrainHeightMeters)
  ) {
    return
  }

  SURFACE_POINT_SCRATCH.set(
    sampleXMeters,
    surface.terrainHeightMeters,
    sampleZMeters
  )
  const signedDistanceMeters = CENTER_TO_SURFACE_SCRATCH
    .subVectors(sphereCenterMeters, SURFACE_POINT_SCRATCH)
    .dot(normal)
  const penetrationDepthMeters = radiusMeters - signedDistanceMeters
  if (
    penetrationDepthMeters <= target.depth ||
    !Number.isFinite(penetrationDepthMeters) ||
    !Number.isFinite(signedDistanceMeters)
  ) {
    return
  }

  target.normal.copy(normal)
  target.depth = penetrationDepthMeters
  if (sampleWasClamped) {
    target.point.copy(SURFACE_POINT_SCRATCH)
  } else {
    target.point
      .copy(sphereCenterMeters)
      .addScaledVector(normal, -signedDistanceMeters)
  }
  target.frictionCoefficient = Number.isFinite(surface.frictionCoefficient)
    ? Math.max(0, surface.frictionCoefficient)
    : 0
  target.featureId = featureId
}

function considerBoxSupportPoint(
  terrain,
  worldXMeters,
  supportHeightMeters,
  worldZMeters,
  featureId,
  target,
  boxContactPointCount
) {
  const surface = queryTerrainSurface(terrain, worldXMeters, worldZMeters)
  if (
    surface.isWithinBounds !== true &&
    surface.isInsideTerrainBounds !== true
  ) {
    return boxContactPointCount
  }

  const normal = getNormalizedSurfaceNormal(surface)
  if (
    !normal ||
    normal.y <= NORMAL_Y_EPSILON ||
    !Number.isFinite(surface.terrainHeightMeters)
  ) {
    return boxContactPointCount
  }

  const penetrationDepthMeters =
    (surface.terrainHeightMeters - supportHeightMeters) * normal.y
  if (!Number.isFinite(penetrationDepthMeters)) {
    return boxContactPointCount
  }

  if (penetrationDepthMeters > target.depth) {
    target.normal.copy(normal)
    target.depth = penetrationDepthMeters
    target.point.set(worldXMeters, surface.terrainHeightMeters, worldZMeters)
    target.frictionCoefficient = Number.isFinite(surface.frictionCoefficient)
      ? Math.max(0, surface.frictionCoefficient)
      : 0
    target.featureId = featureId
    BOX_CONTACT_POINT_SUM_SCRATCH.copy(target.point)
    return 1
  }

  if (
    penetrationDepthMeters > 0 &&
    penetrationDepthMeters === target.depth &&
    normal.dot(target.normal) > 1 - 1e-10
  ) {
    BOX_CONTACT_POINT_SUM_SCRATCH.set(
      BOX_CONTACT_POINT_SUM_SCRATCH.x + worldXMeters,
      BOX_CONTACT_POINT_SUM_SCRATCH.y + surface.terrainHeightMeters,
      BOX_CONTACT_POINT_SUM_SCRATCH.z + worldZMeters
    )
    return boxContactPointCount + 1
  }

  return boxContactPointCount
}

function getNormalizedSurfaceNormal(surface) {
  const normal = surface.normalWorld
  if (
    !normal ||
    !Number.isFinite(normal.x) ||
    !Number.isFinite(normal.y) ||
    !Number.isFinite(normal.z)
  ) {
    return null
  }

  NORMAL_SCRATCH.set(normal.x, normal.y, normal.z)
  if (NORMAL_SCRATCH.lengthSq() <= NORMAL_Y_EPSILON * NORMAL_Y_EPSILON) {
    return null
  }
  return NORMAL_SCRATCH.normalize()
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

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}
