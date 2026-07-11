// src/terrain/createHeightfieldTerrainContactQuery.js

import * as THREE from 'three'
import { createTerrainSurfaceProfile } from './createTerrainSurfaceProfile.js'

const DEFAULT_MAXIMUM_RAY_DISTANCE_METERS = 1.5
const DEFAULT_MINIMUM_NORMAL_ALIGNMENT_COSINE = 0.2
const INTERSECTION_TOLERANCE_METERS = 0.00001
const MAXIMUM_INTERSECTION_ITERATIONS = 18

export function createHeightfieldTerrainContactQuery(config = {}) {
  const surfaceProfile =
    config.surfaceProfile ??
    config.terrain?.userData?.terrain?.surfaceProfile ??
    createTerrainSurfaceProfile(config)
  const fallbackSurfaceResult = {}
  const profileSurfaceResult = {
    normalWorld: { x: 0, y: 1, z: 0 },
  }
  const fallbackContactResult = createContactResult()
  const rayEndWorld = new THREE.Vector3()
  const raySampleWorld = new THREE.Vector3()

  function queryAtWorldXZ(
    worldXMeters,
    worldZMeters,
    target = fallbackSurfaceResult
  ) {
    const surface = surfaceProfile.querySurfaceAtWorldPosition(
      worldXMeters,
      worldZMeters,
      profileSurfaceResult
    )

    if (!target.normalWorld?.isVector3) {
      target.normalWorld = new THREE.Vector3()
    }

    target.normalWorld.set(
      sanitizeNumber(surface.normalWorld?.x),
      sanitizeNumber(surface.normalWorld?.y, 1),
      sanitizeNumber(surface.normalWorld?.z)
    )
    normalizeVector3WithUpFallback(target.normalWorld)
    target.terrainHeightMeters = sanitizeNumber(surface.terrainHeightMeters)
    target.groundHeightMeters = target.terrainHeightMeters
    target.isInsideTerrainBounds = surface.isWithinBounds === true
    target.isWithinBounds = target.isInsideTerrainBounds
    target.surfaceKind = surface.surfaceKind ?? 'unavailable'
    target.frictionCoefficient = sanitizeNonNegativeNumber(
      surface.frictionCoefficient
    )
    target.profileName = surface.profileName ?? 'unavailable'
    target.slopeRadians = sanitizeNonNegativeNumber(surface.slopeRadians)
    target.slopeDegrees = sanitizeNonNegativeNumber(surface.slopeDegrees)
    target.status = surface.status ?? 'surface-unavailable'

    return target
  }

  function querySuspensionContact(
    input = {},
    target = fallbackContactResult
  ) {
    initializeContactResult(target)

    const rayOriginWorld = input.rayOriginWorld
    const suspensionDownDirectionWorld = input.suspensionDownDirectionWorld
    const maximumRayDistanceMeters = sanitizePositiveNumber(
      input.maximumRayDistanceMeters,
      DEFAULT_MAXIMUM_RAY_DISTANCE_METERS
    )
    const wheelRadiusMeters = sanitizePositiveNumber(input.wheelRadiusMeters, 0)
    const minimumNormalAlignmentCosine = clamp(
      sanitizePositiveNumber(
        input.minimumNormalAlignmentCosine,
        DEFAULT_MINIMUM_NORMAL_ALIGNMENT_COSINE
      ),
      0.01,
      0.99
    )

    if (
      !hasFiniteVector3(rayOriginWorld) ||
      !hasFiniteVector3(suspensionDownDirectionWorld) ||
      maximumRayDistanceMeters <= 0 ||
      wheelRadiusMeters <= 0
    ) {
      target.status = 'invalid-query'
      return target
    }

    target.rayOriginWorld.copy(rayOriginWorld)
    target.suspensionDownDirectionWorld.copy(suspensionDownDirectionWorld)
    normalizeVector3WithUpFallback(
      target.suspensionDownDirectionWorld,
      0,
      -1,
      0
    )
    target.maximumRayDistanceMeters = maximumRayDistanceMeters
    target.wheelRadiusMeters = wheelRadiusMeters
    target.minimumNormalAlignmentCosine = minimumNormalAlignmentCosine

    const startSurface = queryAtWorldXZ(
      target.rayOriginWorld.x,
      target.rayOriginWorld.z,
      fallbackSurfaceResult
    )

    target.isWithinBounds = startSurface.isInsideTerrainBounds === true
    target.isInsideTerrainBounds = target.isWithinBounds
    target.profileName = startSurface.profileName
    target.surfaceKind = startSurface.surfaceKind
    target.frictionCoefficient = startSurface.frictionCoefficient

    if (!target.isWithinBounds) {
      target.status = 'outside-terrain-bounds'
      return target
    }

    const startSignedHeightMeters =
      target.rayOriginWorld.y - startSurface.terrainHeightMeters

    if (!Number.isFinite(startSignedHeightMeters)) {
      target.status = 'invalid-query'
      return target
    }

    if (startSignedHeightMeters < -INTERSECTION_TOLERANCE_METERS) {
      target.status = 'ray-origin-below-surface'
      return target
    }

    rayEndWorld
      .copy(target.suspensionDownDirectionWorld)
      .multiplyScalar(maximumRayDistanceMeters)
      .add(target.rayOriginWorld)
    const endSurface = queryAtWorldXZ(
      rayEndWorld.x,
      rayEndWorld.z,
      fallbackSurfaceResult
    )
    const endSignedHeightMeters =
      rayEndWorld.y - endSurface.terrainHeightMeters

    if (
      endSurface.isInsideTerrainBounds !== true ||
      !Number.isFinite(endSignedHeightMeters)
    ) {
      target.status = 'outside-terrain-bounds'
      return target
    }

    if (endSignedHeightMeters > INTERSECTION_TOLERANCE_METERS) {
      target.status = 'no-intersection'
      return target
    }

    let lowerDistanceMeters = 0
    let upperDistanceMeters = maximumRayDistanceMeters
    let intersectionDistanceMeters = maximumRayDistanceMeters

    for (
      let iteration = 0;
      iteration < MAXIMUM_INTERSECTION_ITERATIONS;
      iteration += 1
    ) {
      const midpointDistanceMeters =
        (lowerDistanceMeters + upperDistanceMeters) * 0.5
      raySampleWorld
        .copy(target.suspensionDownDirectionWorld)
        .multiplyScalar(midpointDistanceMeters)
        .add(target.rayOriginWorld)
      const sampleSurface = queryAtWorldXZ(
        raySampleWorld.x,
        raySampleWorld.z,
        fallbackSurfaceResult
      )
      const signedHeightMeters =
        raySampleWorld.y - sampleSurface.terrainHeightMeters

      if (!Number.isFinite(signedHeightMeters)) {
        target.status = 'invalid-query'
        return target
      }

      intersectionDistanceMeters = midpointDistanceMeters

      if (Math.abs(signedHeightMeters) <= INTERSECTION_TOLERANCE_METERS) {
        break
      }

      if (signedHeightMeters > 0) {
        lowerDistanceMeters = midpointDistanceMeters
      } else {
        upperDistanceMeters = midpointDistanceMeters
      }
    }

    target.contactPointWorld
      .copy(target.suspensionDownDirectionWorld)
      .multiplyScalar(intersectionDistanceMeters)
      .add(target.rayOriginWorld)
    const contactSurface = queryAtWorldXZ(
      target.contactPointWorld.x,
      target.contactPointWorld.z,
      fallbackSurfaceResult
    )

    if (contactSurface.isInsideTerrainBounds !== true) {
      target.status = 'outside-terrain-bounds'
      return target
    }

    target.contactPointWorld.y = contactSurface.terrainHeightMeters
    target.terrainHeightMeters = contactSurface.terrainHeightMeters
    target.contactNormalWorld.copy(contactSurface.normalWorld)
    normalizeVector3WithUpFallback(target.contactNormalWorld)
    target.surfaceKind = contactSurface.surfaceKind
    target.frictionCoefficient = contactSurface.frictionCoefficient
    target.profileName = contactSurface.profileName
    target.slopeRadians = contactSurface.slopeRadians
    target.slopeDegrees = contactSurface.slopeDegrees
    target.rayDistanceMeters = intersectionDistanceMeters
    target.terrainRayDistanceMeters = intersectionDistanceMeters

    const normalAlignmentCosine = -target.suspensionDownDirectionWorld.dot(
      target.contactNormalWorld
    )
    target.normalAlignmentCosine = normalAlignmentCosine

    if (
      !Number.isFinite(normalAlignmentCosine) ||
      normalAlignmentCosine < minimumNormalAlignmentCosine
    ) {
      target.status = 'surface-too-steep'
      return target
    }

    const centerToContactDistanceAlongSuspensionMeters =
      wheelRadiusMeters / normalAlignmentCosine

    if (!Number.isFinite(centerToContactDistanceAlongSuspensionMeters)) {
      target.status = 'invalid-query'
      return target
    }

    target.centerToContactDistanceAlongSuspensionMeters =
      centerToContactDistanceAlongSuspensionMeters
    target.wheelCenterDistanceAlongSuspensionMeters =
      intersectionDistanceMeters - centerToContactDistanceAlongSuspensionMeters
    target.hasTerrainIntersection = true
    target.hasContact = true
    target.status = 'surface-intersection'

    return target
  }

  return {
    kind: 'heightfield-terrain-contact-query-v1',
    surfaceProfile,
    queryAtWorldXZ,
    querySuspensionContact,
  }
}

function createContactResult() {
  return {
    isWithinBounds: false,
    isInsideTerrainBounds: false,
    hasContact: false,
    hasTerrainIntersection: false,
    status: 'unavailable',
    profileName: 'unavailable',
    surfaceKind: 'unavailable',
    frictionCoefficient: 0,
    terrainHeightMeters: 0,
    slopeRadians: 0,
    slopeDegrees: 0,
    maximumRayDistanceMeters: 0,
    wheelRadiusMeters: 0,
    minimumNormalAlignmentCosine: 0,
    rayDistanceMeters: 0,
    terrainRayDistanceMeters: 0,
    centerToContactDistanceAlongSuspensionMeters: 0,
    wheelCenterDistanceAlongSuspensionMeters: 0,
    normalAlignmentCosine: 0,
    rayOriginWorld: new THREE.Vector3(),
    suspensionDownDirectionWorld: new THREE.Vector3(0, -1, 0),
    contactPointWorld: new THREE.Vector3(),
    contactNormalWorld: new THREE.Vector3(0, 1, 0),
  }
}

function initializeContactResult(target) {
  if (!target.rayOriginWorld?.isVector3) target.rayOriginWorld = new THREE.Vector3()
  if (!target.suspensionDownDirectionWorld?.isVector3) {
    target.suspensionDownDirectionWorld = new THREE.Vector3(0, -1, 0)
  }
  if (!target.contactPointWorld?.isVector3) {
    target.contactPointWorld = new THREE.Vector3()
  }
  if (!target.contactNormalWorld?.isVector3) {
    target.contactNormalWorld = new THREE.Vector3(0, 1, 0)
  }

  target.isWithinBounds = false
  target.isInsideTerrainBounds = false
  target.hasContact = false
  target.hasTerrainIntersection = false
  target.status = 'unavailable'
  target.profileName = 'unavailable'
  target.surfaceKind = 'unavailable'
  target.frictionCoefficient = 0
  target.terrainHeightMeters = 0
  target.slopeRadians = 0
  target.slopeDegrees = 0
  target.maximumRayDistanceMeters = 0
  target.wheelRadiusMeters = 0
  target.minimumNormalAlignmentCosine = 0
  target.rayOriginWorld.set(0, 0, 0)
  target.suspensionDownDirectionWorld.set(0, -1, 0)
  target.contactPointWorld.set(0, 0, 0)
  target.contactNormalWorld.set(0, 1, 0)
  target.rayDistanceMeters = 0
  target.terrainRayDistanceMeters = 0
  target.centerToContactDistanceAlongSuspensionMeters = 0
  target.wheelCenterDistanceAlongSuspensionMeters = 0
  target.normalAlignmentCosine = 0
}

function normalizeVector3WithUpFallback(
  vector,
  fallbackX = 0,
  fallbackY = 1,
  fallbackZ = 0
) {
  if (!vector?.isVector3) return

  if (
    !Number.isFinite(vector.x) ||
    !Number.isFinite(vector.y) ||
    !Number.isFinite(vector.z) ||
    vector.lengthSq() <= Number.EPSILON
  ) {
    vector.set(fallbackX, fallbackY, fallbackZ)
  }

  vector.normalize()
}

function hasFiniteVector3(value) {
  return (
    value?.isVector3 &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  )
}

function sanitizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeNonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, sanitizeNumber(value)))
}
