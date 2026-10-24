// src/terrain/createTerrainSelection.js

import {
  createOffroadTerrainGenerationConfig,
  DEFAULT_OFFROAD_TERRAIN_GENERATION_CONFIG,
  MAX_OFFROAD_ROUGHNESS_METERS,
} from './createOffroadTerrainGenerationConfig.js'
import { createTerrainSurfaceProfile } from './createTerrainSurfaceProfile.js'
import { createOffroadPlaygroundProfile } from './createEnhancedTerrainSurfaceProfile.js'
import { createMovableObstacleField } from './obstacles/createMovableObstacleField.js'
import { createObstacleAwareSurfaceProfile } from './createObstacleAwareSurfaceProfile.js'
import { createWaterSurface } from './water/createWaterSurface.js'
import { createWeatherState } from './createWeatherState.js'

const SUPPORTED_NAMES = Object.freeze(['proving-ground', 'offroad', 'offroad-water'])

export function createTerrainSelection(config = {}) {
  const requestedName = readUrlParam(config.paramName ?? 'terrain')
  const name = requestedName === 'offroad' || requestedName === 'offroad-water'
    ? requestedName
    : 'proving-ground'
  const displayName =
    name === 'offroad'
      ? 'Offroad Playground'
      : name === 'offroad-water'
        ? 'Offroad Playground with Water'
        : 'Proving Ground'

  let surfaceProfile
  let enhancedProfile = null
  let obstacleField = null
  let waterSurface = null
  let weatherState = null
  let generationConfig = null
  let deformationField = config.deformationField ?? null
  const isOffroadTerrain = name === 'offroad' || name === 'offroad-water'
  if (isOffroadTerrain) {
    generationConfig = resolveGenerationConfig(name, config)
  }
  if (!deformationField && typeof config.createDeformationField === 'function') {
    deformationField = config.createDeformationField(generationConfig)
  }

  if (isOffroadTerrain) {
    enhancedProfile = createOffroadPlaygroundProfile({
      ...config.offroadProfileConfig,
      ...generationConfig,
    })
    obstacleField = createMovableObstacleField({
      ...config.obstacleFieldConfig,
      seed: generationConfig.seed,
      sizeMeters: generationConfig.sizeMeters,
      featureScale: generationConfig.featureScale,
      obstacleDensity: generationConfig.obstacleDensity,
    })
    if (generationConfig.waterEnabled) {
      waterSurface = createWaterSurface(config.waterSurfaceConfig ?? {})
    }
    if (name === 'offroad-water') {
      weatherState = createWeatherState(config.weatherStateConfig ?? {})
    }
    surfaceProfile = createObstacleAwareSurfaceProfile({
      baseProfile: enhancedProfile,
      obstacleField,
      deformationField,
      waterSurface,
      weatherState,
    })
  } else {
    surfaceProfile = createTerrainSurfaceProfile(config.baseProfileConfig ?? {})
  }

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
    generationConfig,
  }
}

function resolveGenerationConfig(name, config) {
  const profileOverrides = config.offroadProfileConfig ?? {}
  const generationOverrides = config.offroadGenerationConfig ?? {}
  const boundsMeters = generationOverrides.boundsMeters ?? profileOverrides.boundsMeters
  const configuredSizeMeters = generationOverrides.sizeMeters ?? profileOverrides.sizeMeters
  const sizeMeters = configuredSizeMeters ?? (
    boundsMeters
      ? undefined
      : readNumberParam('terrainSizeMeters', (value) => value > 0) ??
        DEFAULT_OFFROAD_TERRAIN_GENERATION_CONFIG.sizeMeters
  )
  const seed = Object.prototype.hasOwnProperty.call(generationOverrides, 'seed')
    ? generationOverrides.seed
    : Object.prototype.hasOwnProperty.call(profileOverrides, 'seed')
      ? profileOverrides.seed
      : readTerrainSeedParam()
  const waterEnabled = name === 'offroad-water'
    ? true
    : generationOverrides.waterEnabled ??
      profileOverrides.waterEnabled ??
      readBooleanParam('water') ??
      false

  return createOffroadTerrainGenerationConfig({
    ...profileOverrides,
    ...generationOverrides,
    boundsMeters,
    sizeMeters,
    seed,
    featureScale:
      generationOverrides.featureScale ??
      profileOverrides.featureScale ??
      readNumberParam('featureScale', (value) => value > 0) ??
      1,
    roughnessMeters:
      generationOverrides.roughnessMeters ??
      profileOverrides.roughnessMeters ??
      profileOverrides.noiseAmplitude ??
      readNumberParam(
        'roughnessMeters',
        (value) => value >= 0 && value <= MAX_OFFROAD_ROUGHNESS_METERS
      ) ??
      0.05,
    obstacleDensity:
      generationOverrides.obstacleDensity ??
      profileOverrides.obstacleDensity ??
      readNumberParam('obstacleDensity', (value) => value >= 0 && value <= 4) ??
      1,
    waterEnabled,
  })
}

function readTerrainSeedParam() {
  const seed = readUrlParam('seed')
  if (seed === null) return null
  const normalizedSeed = seed.trim()
  return normalizedSeed.length > 0 && normalizedSeed.length <= 128
    ? normalizedSeed
    : null
}

function readNumberParam(paramName, isValid) {
  const rawValue = readUrlParam(paramName)
  if (rawValue === null || rawValue.trim() === '') return null
  const value = Number(rawValue)
  return Number.isFinite(value) && isValid(value) ? value : null
}

function readBooleanParam(paramName) {
  const value = readUrlParam(paramName)?.toLowerCase()
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return null
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
