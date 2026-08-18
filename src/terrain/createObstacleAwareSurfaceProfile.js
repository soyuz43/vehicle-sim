// src/terrain/createObstacleAwareSurfaceProfile.js

/**
 * Obstacle-aware surface profile.
 *
 * Wraps a base surface profile (e.g. the enhanced catalog-driven profile) and
 * overlays the static obstacle field on top of it. The obstacle local height is
 * added to the terrain height, and where an obstacle is the highest surface its
 * surface kind and friction replace the terrain values.
 *
 * Crucially this composes with the EXISTING per-wheel suspension raycast: the
 * contact query only reads terrainHeightMeters, normalWorld, surfaceKind and
 * frictionCoefficient from the profile, all of which this wrapper provides, so
 * no changes to createHeightfieldTerrainContactQuery are required. Static
 * obstacles are kinematically fixed; rigid-body side-impact response remains a
 * future seam (see createObstacleField.js).
 */

export function createObstacleAwareSurfaceProfile(config = {}) {
  const baseProfile = config.baseProfile
  const obstacleField = config.obstacleField
  const normalSampleDistanceMeters = sanitizePositiveNumber(
    config.normalSampleDistanceMeters,
    0.05
  )

  if (!baseProfile || typeof baseProfile.getHeightAtWorldXZ !== 'function') {
    throw new Error(
      'createObstacleAwareSurfaceProfile requires a baseProfile with getHeightAtWorldXZ'
    )
  }
  if (!obstacleField || typeof obstacleField.sampleTopSurfaceAtWorldXZ !== 'function') {
    throw new Error(
      'createObstacleAwareSurfaceProfile requires an obstacleField with sampleTopSurfaceAtWorldXZ'
    )
  }

  // Merged height = terrain height + obstacle local height (0 outside a
  // footprint). The terrain mesh samples this directly, so obstacles render as
  // part of the same heightfield the physics uses.
  function getHeightAtWorldXZ(worldXMeters, worldZMeters) {
    const baseHeightMeters = baseProfile.getHeightAtWorldXZ(
      worldXMeters,
      worldZMeters
    )
    const obstacle = obstacleField.sampleTopSurfaceAtWorldXZ(
      worldXMeters,
      worldZMeters
    )
    const localHeightMeters = obstacle ? obstacle.localHeightMeters : 0
    return Number.isFinite(baseHeightMeters)
      ? baseHeightMeters + (Number.isFinite(localHeightMeters) ? localHeightMeters : 0)
      : baseHeightMeters
  }

  function calculateNormalAtWorldXZ(worldXMeters, worldZMeters, target) {
    const normal = target && target.x !== undefined ? target : { x: 0, y: 1, z: 0 }
    const d = normalSampleDistanceMeters
    const heightWestMeters = getHeightAtWorldXZ(worldXMeters - d, worldZMeters)
    const heightEastMeters = getHeightAtWorldXZ(worldXMeters + d, worldZMeters)
    const heightSouthMeters = getHeightAtWorldXZ(worldXMeters, worldZMeters - d)
    const heightNorthMeters = getHeightAtWorldXZ(worldXMeters, worldZMeters + d)
    const inverseSpan = 1 / (d * 2)
    const slopeXMetersPerMeter = (heightEastMeters - heightWestMeters) * inverseSpan
    const slopeZMetersPerMeter = (heightNorthMeters - heightSouthMeters) * inverseSpan

    const nx = -slopeXMetersPerMeter
    const ny = 1
    const nz = -slopeZMetersPerMeter
    const length = Math.hypot(nx, ny, nz)
    if (!Number.isFinite(length) || length <= Number.EPSILON) {
      normal.x = 0
      normal.y = 1
      normal.z = 0
      return normal
    }
    normal.x = nx / length
    normal.y = ny / length
    normal.z = nz / length
    return normal
  }

  function querySurfaceAtWorldPosition(
    worldXMeters,
    worldZMeters,
    target = {}
  ) {
    const base = baseProfile.querySurfaceAtWorldPosition(
      worldXMeters,
      worldZMeters,
      target
    )
    const baseHeightMeters = base.terrainHeightMeters

    const obstacle = obstacleField.sampleTopSurfaceAtWorldXZ(
      worldXMeters,
      worldZMeters
    )
    const localHeightMeters = obstacle ? obstacle.localHeightMeters : 0

    if (Number.isFinite(localHeightMeters) && localHeightMeters > 0) {
      const obstacleTopYMeters = baseHeightMeters + localHeightMeters
      if (obstacleTopYMeters >= baseHeightMeters) {
        target.terrainHeightMeters = obstacleTopYMeters
        target.groundHeightMeters = obstacleTopYMeters
        target.surfaceKind = obstacle.surfaceKind
        target.frictionCoefficient = obstacle.frictionCoefficient
        const normal = calculateNormalAtWorldXZ(
          worldXMeters,
          worldZMeters,
          target.normalWorld
        )
        target.normalWorld.x = normal.x
        target.normalWorld.y = normal.y
        target.normalWorld.z = normal.z
        target.slopeRadians = Math.acos(clamp(normal.y, -1, 1))
        target.slopeDegrees = target.slopeRadians * (180 / Math.PI)
      }
    }

    return target
  }

  return {
    kind: 'obstacle-aware-surface-profile-v1',
    profileName: baseProfile.profileName,
    surfaceKind: baseProfile.surfaceKind,
    sizeMeters: baseProfile.sizeMeters,
    baseProfile,
    obstacleField,
    getHeightAtWorldXZ,
    querySurfaceAtWorldPosition,
  }
}

function sanitizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, sanitizeNumber(value)))
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}
