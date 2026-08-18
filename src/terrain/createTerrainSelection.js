// src/terrain/createTerrainSelection.js

/**
 * Terrain selection for the virtual 4x4 playground (Phase 1).
 *
 * Reads an optional ?terrain=<name> URL parameter and returns the surface
 * profile (and obstacle field, when applicable) to drive both the render mesh
 * and the physics contact query. The DEFAULT selection reproduces the original
 * proving-ground behavior exactly (createTerrainSurfaceProfile with no
 * arguments), so existing driving/braking/reset on the flat + heightfield sim
 * is unaffected. Selecting "offroad" composes the catalog-driven enhanced
 * profile, the procedural playground generator, and the static obstacle field.
 */

import { createTerrainSurfaceProfile } from './createTerrainSurfaceProfile.js'
import { createOffroadPlaygroundProfile } from './createEnhancedTerrainSurfaceProfile.js'
import { createObstacleField } from './obstacles/createObstacleField.js'
import { createObstacleAwareSurfaceProfile } from './createObstacleAwareSurfaceProfile.js'

const SUPPORTED_NAMES = Object.freeze(['proving-ground', 'offroad'])

export function createTerrainSelection(config = {}) {
  const requestedName = readUrlParam(config.paramName ?? 'terrain')
  const name =
    requestedName === 'offroad' ? 'offroad' : 'proving-ground'
  const displayName =
    name === 'offroad' ? 'Offroad Playground' : 'Proving Ground'

  let surfaceProfile
  let enhancedProfile = null
  let obstacleField = null

  if (name === 'offroad') {
    enhancedProfile = createOffroadPlaygroundProfile(
      config.offroadProfileConfig ?? {}
    )
    obstacleField = createObstacleField(config.obstacleFieldConfig ?? {})
    surfaceProfile = createObstacleAwareSurfaceProfile({
      baseProfile: enhancedProfile,
      obstacleField,
    })
  } else {
    surfaceProfile = createTerrainSurfaceProfile(config.baseProfileConfig ?? {})
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
