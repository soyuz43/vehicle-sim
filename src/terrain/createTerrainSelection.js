// src/terrain/createTerrainSelection.js

/**
 * Terrain selection for the virtual 4x4 playground (Phase 2).
 *
 * Reads an optional ?terrain=<name> URL parameter and returns the surface
 * profile (and obstacle field, when applicable) to drive both the render mesh
 * and the physics contact query. The DEFAULT selection reproduces the original
 * proving-ground behavior exactly (createTerrainSurfaceProfile with no
 * arguments), so existing driving/braking/reset on the flat + heightfield sim
 * is unaffected. Selecting "offroad" composes the catalog-driven enhanced
 * profile, the procedural playground generator, and the movable obstacle field.
 * Selecting "offroad-water" adds water features to the offroad playground.
 */

import { createTerrainSurfaceProfile } from './createTerrainSurfaceProfile.js'
import { createOffroadPlaygroundProfile } from './createEnhancedTerrainSurfaceProfile.js'
import { createMovableObstacleField } from './obstacles/createMovableObstacleField.js'
import { createObstacleAwareSurfaceProfile } from './createObstacleAwareSurfaceProfile.js'
import { createWaterSurface } from './water/createWaterSurface.js'
import { createWeatherState } from './createWeatherState.js'

const SUPPORTED_NAMES = Object.freeze(['proving-ground', 'offroad', 'offroad-water'])

export function createTerrainSelection(config = {}) {
  const deformationField = config.deformationField ?? null
  const requestedName = readUrlParam(config.paramName ?? 'terrain')
  let name = 'proving-ground'
  if (requestedName === 'offroad') {
    name = 'offroad'
  } else if (requestedName === 'offroad-water') {
    name = 'offroad-water'
  }
  const displayName =
    name === 'offroad' ? 'Offroad Playground' : 
    name === 'offroad-water' ? 'Offroad Playground with Water' : 
    'Proving Ground'

  let surfaceProfile
  let enhancedProfile = null
  let obstacleField = null
  let waterSurface = null
  let weatherState = null

  if (name === 'offroad') {
    enhancedProfile = createOffroadPlaygroundProfile(
      config.offroadProfileConfig ?? {}
    )
    obstacleField = createMovableObstacleField(config.obstacleFieldConfig ?? {})
    surfaceProfile = createObstacleAwareSurfaceProfile({
      baseProfile: enhancedProfile,
      obstacleField,
      deformationField,
    })
  } else if (name === 'offroad-water') {
    enhancedProfile = createOffroadPlaygroundProfile(
      config.offroadProfileConfig ?? {}
    )
    obstacleField = createMovableObstacleField(config.obstacleFieldConfig ?? {})
    waterSurface = createWaterSurface(config.waterSurfaceConfig ?? {})
    weatherState = createWeatherState(config.weatherStateConfig ?? {})
    surfaceProfile = createObstacleAwareSurfaceProfile({
      baseProfile: enhancedProfile,
      obstacleField,
      deformationField,
    })
  } else {
    surfaceProfile = createTerrainSurfaceProfile(config.baseProfileConfig ?? {})
  }

  // Place each obstacle's base on the terrain-only height so static meshes
  // rest correctly and movable obstacles start grounded before stepping.
  if (obstacleField && enhancedProfile) {
    for (const obstacle of obstacleField.getObstacles()) {
      const groundYMeters = enhancedProfile.getHeightAtWorldXZ(
        obstacle.position.x,
        obstacle.position.z
      )
      if (Number.isFinite(groundYMeters)) {
        obstacle.position.y = groundYMeters
      }
    }
  }

  // baseProfile is the terrain-only surface (no obstacle overlay) so visual
  // meshes can be placed on the ground rather than on top of the obstacle.
  return {
    name,
    displayName,
    supportedNames: SUPPORTED_NAMES,
    surfaceProfile,
    baseProfile: enhancedProfile ?? surfaceProfile,
    obstacleField,
    deformationField,
    waterSurface,
    weatherState,
  }
}

function readUrlParam(paramName) {
  try {
    const search = globalThis.location?.search
    if (typeof search !== 'string') return null
    return new URLSearchParams(search).get(paramName)
  } catch {
    return null
  }
}
