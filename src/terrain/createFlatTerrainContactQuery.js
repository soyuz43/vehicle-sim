// src/terrain/createFlatTerrainContactQuery.js

import * as THREE from 'three'

const DEFAULT_GROUND_HEIGHT_METERS = 0
const DEFAULT_SURFACE_KIND = 'flat-asphalt-placeholder'
const DEFAULT_FRICTION_COEFFICIENT = 1.0
const FLAT_TERRAIN_NORMAL_WORLD = new THREE.Vector3(0, 1, 0)

export function createFlatTerrainContactQuery(config = {}) {
  const terrainInfo =
    config.terrainInfo ??
    config.terrain?.userData?.terrain ??
    null

  const groundHeightMeters =
    config.groundHeightMeters ?? DEFAULT_GROUND_HEIGHT_METERS

  const surfaceKind = config.surfaceKind ?? DEFAULT_SURFACE_KIND
  const frictionCoefficient =
    config.frictionCoefficient ?? DEFAULT_FRICTION_COEFFICIENT
  const fallbackQueryResult = {
    normalWorld: new THREE.Vector3(),
  }

  function queryAtWorldXZ(
    worldXMeters,
    worldZMeters,
    target = fallbackQueryResult
  ) {
    target.groundHeightMeters = groundHeightMeters
    target.terrainHeightMeters = groundHeightMeters
    target.surfaceKind = surfaceKind
    target.frictionCoefficient = frictionCoefficient
    target.isInsideTerrainBounds = isInsideTerrainBounds(
      worldXMeters,
      worldZMeters
    )
    target.isWithinBounds = target.isInsideTerrainBounds
    target.profileName = 'flat-terrain-contact-query'
    target.slopeRadians = 0
    target.slopeDegrees = 0

    if (!target.normalWorld) {
      target.normalWorld = new THREE.Vector3()
    }

    target.normalWorld.copy(FLAT_TERRAIN_NORMAL_WORLD)

    return target
  }

  function isInsideTerrainBounds(worldXMeters, worldZMeters) {
    if (!Number.isFinite(terrainInfo?.halfSize)) return true

    return (
      Math.abs(worldXMeters) <= terrainInfo.halfSize &&
      Math.abs(worldZMeters) <= terrainInfo.halfSize
    )
  }

  return {
    queryAtWorldXZ,
  }
}
