// src/terrain/createEnhancedTerrainSurfaceProfile.js

import { createTerrainSurfaceProfile } from './createTerrainSurfaceProfile.js'
import {
  DEFAULT_SURFACE_MATERIAL_CATALOG,
  applySurfaceCondition,
  getSurfaceMaterial,
  resolveSurfaceProperties,
  SURFACE_MATERIAL_KINDS,
} from './createSurfaceMaterialCatalog.js'
import { createOffroadTerrainGenerationConfig } from './createOffroadTerrainGenerationConfig.js'
import {
  createSeededRandom,
  createSeededTerrainNoise,
  hashTerrainSeed,
} from './seededTerrainNoise.js'

const DEFAULT_TERRAIN_SIZE_METERS = 320
const DEFAULT_NORMAL_SAMPLE_DISTANCE_METERS = 0.05

const WORLD_UP_NORMAL = Object.freeze({ x: 0, y: 1, z: 0 })

/**
 * Enhanced terrain surface profile that integrates the surface material catalog.
 * Provides full surface material properties (friction, damping, rolling resistance, etc.)
 * at each world position, in addition to height and normal.
 */
export function createEnhancedTerrainSurfaceProfile(config = {}) {
  // Surface material catalog (can be overridden)
  const surfaceMaterialCatalog =
    config.surfaceMaterialCatalog ?? DEFAULT_SURFACE_MATERIAL_CATALOG

  // Optional condition modifier (e.g., 'WET', 'ICY', 'DUSTY')
  const surfaceCondition = config.surfaceCondition ?? null

  // Optional per-region condition overrides
  const surfaceRegionConditions = config.surfaceRegionConditions ?? null

  // Custom height evaluator (for procedural terrain features). When supplied
  // it defines ALL terrain height variation, so the base surface is treated
  // as flat to avoid double-counting the proving-ground bumps underneath.
  const customHeightEvaluator = config.customHeightEvaluator ?? null
  const useFlatBase = Boolean(customHeightEvaluator)
  const profileNameOverride = config.profileName ?? 'enhanced-surface-profile-v1'

  // Create the base profile for height/normal queries
  const baseProfile = createTerrainSurfaceProfile({
    ...config,
    profileName: useFlatBase ? 'flat' : config.profileName,
  })

  const fallbackResult = createEnhancedSurfaceResult()

  function queryEnhancedSurfaceAtWorldPosition(
    worldXMeters,
    worldZMeters,
    target = fallbackResult
  ) {
    // First get the base surface info (height, normal, surfaceKind, frictionCoefficient)
    baseProfile.querySurfaceAtWorldPosition(worldXMeters, worldZMeters, target)

    // The enhanced profile controls its own display name, independent of the
    // base profile's flat/uneven classification.
    target.profileName = profileNameOverride

    // Apply custom height evaluator if provided
    if (customHeightEvaluator) {
      const baseHeight = target.terrainHeightMeters
      const customHeight = customHeightEvaluator(worldXMeters, worldZMeters, baseHeight)
      if (Number.isFinite(customHeight)) {
        target.terrainHeightMeters = customHeight
        target.groundHeightMeters = customHeight
      }
    }

    // Now enhance with full surface material properties
    const surfaceKind = target.surfaceKind
    let material = getSurfaceMaterial(surfaceMaterialCatalog, surfaceKind)

    // Apply condition modifier if specified
    if (surfaceCondition) {
      material = applySurfaceCondition(material, surfaceCondition)
    }

    // Apply region-specific condition if applicable
    if (surfaceRegionConditions) {
      const regionCondition = findRegionConditionAtWorldXZ(
        worldXMeters,
        worldZMeters,
        surfaceRegionConditions
      )
      if (regionCondition) {
        material = applySurfaceCondition(material, regionCondition)
      }
    }

    // Populate enhanced properties
    const properties = resolveSurfaceProperties(surfaceMaterialCatalog, material.kind)

    target.surfaceMaterialKind = material.kind
    target.surfaceDisplayName = material.displayName
    target.dampingCoefficient = material.dampingCoefficient
    target.rollingResistanceCoefficient = material.rollingResistanceCoefficient
    target.deformabilityCoefficient = properties.deformabilityCoefficient
    target.thermalConductivity = properties.thermalConductivity
    target.roughnessRmsMeters = properties.roughnessRmsMeters
    target.combinedGripMultiplier = properties.combinedGripMultiplier
    target.lateralGripMultiplier = properties.lateralGripMultiplier
    target.longitudinalGripMultiplier = properties.longitudinalGripMultiplier
    target.visualColor = material.visualColor
    target.visualRoughness = material.visualRoughness
    target.visualMetalness = material.visualMetalness

    // The catalog material remains the source of per-kind properties, with
    // configured surface conditions applied before exposing them to contact.
    target.frictionCoefficient = material.frictionCoefficient

    return target
  }

  function findRegionConditionAtWorldXZ(worldXMeters, worldZMeters, regionConditions) {
    if (!Array.isArray(regionConditions)) return null
    for (const region of regionConditions) {
      if (
        worldXMeters >= region.minXMeters &&
        worldXMeters <= region.maxXMeters &&
        worldZMeters >= region.minZMeters &&
        worldZMeters <= region.maxZMeters
      ) {
        return region.condition
      }
    }
    return null
  }

  // Proxy base profile methods
  return {
    ...baseProfile,
    profileName: profileNameOverride,
    surfaceMaterialCatalog,
    surfaceCondition,
    surfaceRegionConditions,
    customHeightEvaluator,
    querySurfaceAtWorldPosition: queryEnhancedSurfaceAtWorldPosition,
    getHeightAtWorldXZ: (x, z) => {
      const baseHeight = baseProfile.getHeightAtWorldXZ(x, z)
      if (customHeightEvaluator) {
        const customHeight = customHeightEvaluator(x, z, baseHeight)
        return Number.isFinite(customHeight) ? customHeight : baseHeight
      }
      return baseHeight
    },
    // Expose base profile for advanced use cases
    _baseProfile: baseProfile,
  }
}

function createEnhancedSurfaceResult() {
  return {
    isWithinBounds: false,
    isInsideTerrainBounds: false,
    profileName: 'unavailable',
    surfaceKind: 'unavailable',
    surfaceMaterialKind: 'unavailable',
    surfaceDisplayName: 'Unavailable',
    frictionCoefficient: 0,
    dampingCoefficient: 0,
    rollingResistanceCoefficient: 0,
    deformabilityCoefficient: 0,
    thermalConductivity: 0,
    roughnessRmsMeters: 0,
    combinedGripMultiplier: 1.0,
    lateralGripMultiplier: 1.0,
    longitudinalGripMultiplier: 1.0,
    visualColor: 0x444444,
    visualRoughness: 0.85,
    visualMetalness: 0.05,
    terrainHeightMeters: 0,
    groundHeightMeters: 0,
    normalWorld: { x: 0, y: 1, z: 0 },
    slopeRadians: 0,
    slopeDegrees: 0,
    status: 'unavailable',
  }
}

/**
 * Procedural height evaluator for the offroad playground.
 * Adds jump ramps, rock garden bumps, and terrain variation.
 */
export function createOffroadPlaygroundHeightEvaluator(config = {}) {
  const generationConfig = config.generationConfig ?? createOffroadTerrainGenerationConfig({
    ...config,
    roughnessMeters: config.roughnessMeters ?? config.noiseAmplitude,
  })
  const { sizeMeters, featureScale, roughnessMeters, seed } = generationConfig
  const halfSize = sizeMeters * 0.5
  const courseScale = featureScale * (sizeMeters / 400)
  const jumpScale = config.jumpScale ?? 1.0
  const rockGardenScale = config.rockGardenScale ?? 1.0
  const noiseScale = config.noiseScale ?? 0.02 / featureScale
  const seededNoise = seed === null
    ? null
    : createSeededTerrainNoise(`${seed}:height`, noiseScale)
  const courseOffsets = createOffroadCourseOffsets(seed, courseScale)
  const rockNoiseSeed = seed === null ? 12345 : hashTerrainSeed(`${seed}:rocks`)

  return function offroadPlaygroundHeightEvaluator(worldXMeters, worldZMeters, baseHeightMeters) {
    let heightMeters = baseHeightMeters

    const startRampZone = smoothStep(
      worldZMeters,
      -halfSize,
      -halfSize + 30 * courseScale
    )
    heightMeters +=
      startRampZone *
      0.5 * courseScale *
      (1 + Math.sin(((worldZMeters + halfSize) * 0.1) / courseScale)) *
      jumpScale

    heightMeters += tabletopJump(
      worldXMeters,
      worldZMeters,
      courseOffsets.xMeters,
      -halfSize + 120 * courseScale + courseOffsets.zMeters,
      15 * courseScale,
      8 * courseScale,
      1.2 * jumpScale * courseScale
    )
    heightMeters += stepUpJump(
      worldXMeters,
      worldZMeters,
      courseOffsets.xMeters,
      -halfSize + 180 * courseScale + courseOffsets.zMeters,
      12 * courseScale,
      6 * courseScale,
      0.8 * jumpScale * courseScale
    )
    heightMeters += gapJump(
      worldXMeters,
      worldZMeters,
      courseOffsets.xMeters,
      -halfSize + 240 * courseScale + courseOffsets.zMeters,
      10 * courseScale,
      5 * courseScale,
      1.0 * jumpScale * courseScale
    )

    const rockGardenZone = smoothStep(
      worldZMeters,
      -halfSize + 100 * courseScale + courseOffsets.zMeters,
      -halfSize + 200 * courseScale + courseOffsets.zMeters
    ) * smoothStep(
      worldXMeters,
      -halfSize + 10 * courseScale + courseOffsets.xMeters,
      10 * courseScale + courseOffsets.xMeters
    )
    if (rockGardenZone > 0) {
      heightMeters +=
        rockGardenZone *
        rockGardenBumps(worldXMeters, worldZMeters, rockNoiseSeed, courseScale) *
        rockGardenScale *
        courseScale
    }

    const mudPitZone = smoothStep(
      worldZMeters,
      -halfSize + 100 * courseScale + courseOffsets.zMeters,
      -halfSize + 160 * courseScale + courseOffsets.zMeters
    ) * smoothStep(
      worldXMeters,
      -15 * courseScale + courseOffsets.xMeters,
      15 * courseScale + courseOffsets.xMeters
    )
    heightMeters -= mudPitZone * 0.3 * courseScale

    const sandTrapZone = smoothStep(
      worldZMeters,
      -halfSize + 200 * courseScale + courseOffsets.zMeters,
      -halfSize + 260 * courseScale + courseOffsets.zMeters
    ) * smoothStep(
      worldXMeters,
      -halfSize + 10 * courseScale + courseOffsets.xMeters,
      halfSize - 10 * courseScale + courseOffsets.xMeters
    )
    heightMeters -= sandTrapZone * 0.2 * courseScale

    const naturalNoise = seededNoise
      ? seededNoise(worldXMeters, worldZMeters) * roughnessMeters
      : terrainNoise(worldXMeters, worldZMeters, noiseScale, roughnessMeters)
    heightMeters += naturalNoise

    const whoopsZone = smoothStep(
      worldZMeters,
      -halfSize + 280 * courseScale + courseOffsets.zMeters,
      -halfSize + 340 * courseScale + courseOffsets.zMeters
    )
    heightMeters +=
      whoopsZone *
      whoopsPattern(
        worldZMeters - courseOffsets.zMeters,
        3.0 * courseScale,
        0.15 * courseScale
      )

    const exitRampZone = smoothStep(
      worldZMeters,
      halfSize - 40 * courseScale,
      halfSize
    )
    heightMeters -= exitRampZone * 0.5 * courseScale

    return heightMeters
  }
}

export function createOffroadPlaygroundProfile(config = {}) {
  const generationConfig = createOffroadTerrainGenerationConfig({
    ...config,
    roughnessMeters: config.roughnessMeters ?? config.noiseAmplitude,
  })
  const { sizeMeters, featureScale, seed } = generationConfig
  const halfSize = sizeMeters * 0.5
  const courseScale = featureScale * (sizeMeters / 400)
  const courseOffsets = createOffroadCourseOffsets(seed, courseScale)

  const surfaceRegions = [
    {
      kind: SURFACE_MATERIAL_KINDS.ASPHALT,
      minXMeters: -halfSize,
      maxXMeters: halfSize,
      minZMeters: -halfSize,
      maxZMeters: -halfSize + 40 * courseScale,
      frictionCoefficient: 0.95,
    },
    {
      kind: SURFACE_MATERIAL_KINDS.GRAVEL,
      minXMeters: -30 * courseScale + courseOffsets.xMeters,
      maxXMeters: 30 * courseScale + courseOffsets.xMeters,
      minZMeters: -halfSize + 40 * courseScale + courseOffsets.zMeters,
      maxZMeters: -halfSize + 100 * courseScale + courseOffsets.zMeters,
      frictionCoefficient: 0.55,
    },
    {
      kind: SURFACE_MATERIAL_KINDS.ROCK,
      minXMeters: -halfSize + 10 * courseScale + courseOffsets.xMeters,
      maxXMeters: -10 * courseScale + courseOffsets.xMeters,
      minZMeters: -halfSize + 100 * courseScale + courseOffsets.zMeters,
      maxZMeters: -halfSize + 200 * courseScale + courseOffsets.zMeters,
      frictionCoefficient: 0.85,
    },
    {
      kind: SURFACE_MATERIAL_KINDS.MUD,
      minXMeters: -15 * courseScale + courseOffsets.xMeters,
      maxXMeters: 15 * courseScale + courseOffsets.xMeters,
      minZMeters: -halfSize + 100 * courseScale + courseOffsets.zMeters,
      maxZMeters: -halfSize + 160 * courseScale + courseOffsets.zMeters,
      frictionCoefficient: 0.25,
    },
    {
      kind: SURFACE_MATERIAL_KINDS.GRASS,
      minXMeters: 10 * courseScale + courseOffsets.xMeters,
      maxXMeters: halfSize - 10 * courseScale + courseOffsets.xMeters,
      minZMeters: -halfSize + 100 * courseScale + courseOffsets.zMeters,
      maxZMeters: -halfSize + 200 * courseScale + courseOffsets.zMeters,
      frictionCoefficient: 0.55,
    },
    {
      kind: SURFACE_MATERIAL_KINDS.SAND,
      minXMeters: -halfSize + 10 * courseScale + courseOffsets.xMeters,
      maxXMeters: halfSize - 10 * courseScale + courseOffsets.xMeters,
      minZMeters: -halfSize + 200 * courseScale + courseOffsets.zMeters,
      maxZMeters: -halfSize + 260 * courseScale + courseOffsets.zMeters,
      frictionCoefficient: 0.4,
    },
    {
      kind: SURFACE_MATERIAL_KINDS.DIRT,
      minXMeters: -halfSize + 10 * courseScale + courseOffsets.xMeters,
      maxXMeters: halfSize - 10 * courseScale + courseOffsets.xMeters,
      minZMeters: -halfSize + 260 * courseScale + courseOffsets.zMeters,
      maxZMeters: halfSize - 10 * courseScale + courseOffsets.zMeters,
      frictionCoefficient: 0.55,
    },
  ]

  const heightEvaluator = createOffroadPlaygroundHeightEvaluator({
    ...config,
    generationConfig,
  })
  const profile = createEnhancedTerrainSurfaceProfile({
    ...config,
    sizeMeters,
    profileName: 'offroad-playground-v1',
    surfaceRegions,
    surfaceMaterialCatalog: config.surfaceMaterialCatalog ?? DEFAULT_SURFACE_MATERIAL_CATALOG,
    customHeightEvaluator: heightEvaluator,
  })
  profile.generationConfig = generationConfig
  return profile
}

function createOffroadCourseOffsets(seed, courseScale) {
  if (seed === null) return { xMeters: 0, zMeters: 0 }
  const random = createSeededRandom(`${seed}:layout`)
  return {
    xMeters: (random() - 0.5) * 16 * courseScale,
    zMeters: (random() - 0.5) * 12 * courseScale,
  }
}
// Helper functions for procedural terrain generation

function smoothStep(value, edge0, edge1) {
  if (!Number.isFinite(value) || edge1 <= edge0) return 0
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t) // Smoothstep interpolation
}

function tabletopJump(worldX, worldZ, centerX, centerZ, widthX, widthZ, height) {
  const nx = (worldX - centerX) / Math.max(widthX, Number.EPSILON)
  const nz = (worldZ - centerZ) / Math.max(widthZ, Number.EPSILON)
  const r = Math.hypot(nx, nz)
  if (r >= 1) return 0
  // Flat top with curved edges
  const flatTop = 0.6
  if (r <= flatTop) return height
  const edgeT = (r - flatTop) / (1 - flatTop)
  return height * (1 - edgeT * edgeT * (3 - 2 * edgeT))
}

function stepUpJump(worldX, worldZ, centerX, centerZ, widthX, widthZ, height) {
  const nx = (worldX - centerX) / Math.max(widthX, Number.EPSILON)
  const nz = (worldZ - centerZ) / Math.max(widthZ, Number.EPSILON)
  // Ramp up in Z direction, flat in X
  if (nz < -1 || nz > 1) return 0
  if (Math.abs(nx) > 1) return 0
  const rampProfile = Math.max(0, (nz + 1) * 0.5) // 0 to 1 over Z
  return height * rampProfile * (1 - Math.abs(nx) * 0.3)
}

function gapJump(worldX, worldZ, centerX, centerZ, widthX, widthZ, height) {
  const nx = (worldX - centerX) / Math.max(widthX, Number.EPSILON)
  const nz = (worldZ - centerZ) / Math.max(widthZ, Number.EPSILON)
  if (Math.abs(nx) > 1 || nz < -1 || nz > 1) return 0
  // Two ramps with a gap in the middle
  const leftRamp = Math.max(0, (-nz + 1) * 0.5) // Left side ramp
  const rightRamp = Math.max(0, (nz + 1) * 0.5) // Right side ramp
  const gap = 1 - Math.abs(nz) * 2 // Gap in middle
  if (gap > 0) return 0 // Gap - no height
  return height * Math.max(leftRamp, rightRamp) * (1 - Math.abs(nx) * 0.2)
}

function rockGardenBumps(worldX, worldZ, seed = 12345, courseScale = 1) {
  // Multiple overlapping cosine bumps for irregular rock garden feel
  let height = 0
  // Use deterministic pseudo-random based on position
  const hash = (x, z) => {
    const h = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453
    return h - Math.floor(h)
  }
  for (let i = 0; i < 8; i++) {
    // The bump radii and the cluster span scale with the course, so a resized
    // course keeps the same bump footprint relative to the course extent and
    // the bump slope is preserved by the amplitude scaling at the call site.
    const bx = worldX + hash(i, 0) * 20 * courseScale
    const bz = worldZ + hash(0, i) * 20 * courseScale
    const rx = (1.5 + hash(i, 1) * 2) * courseScale
    const rz = (1.5 + hash(1, i) * 2) * courseScale
    const amp = 0.08 + hash(i, 2) * 0.12
    const nx = (worldX - bx) / Math.max(rx, Number.EPSILON)
    const nz = (worldZ - bz) / Math.max(rz, Number.EPSILON)
    const r = Math.hypot(nx, nz)
    if (r < 1) {
      height += amp * 0.5 * (1 + Math.cos(Math.PI * r))
    }
  }
  return height
}

function terrainNoise(worldX, worldZ, scale, amplitude) {
  // Multi-octave sine-based noise (cheap Perlin alternative)
  let noise = 0
  noise += Math.sin(worldX * scale * 1.0 + worldZ * scale * 0.7) * 1.0
  noise += Math.sin(worldX * scale * 2.3 + worldZ * scale * 1.9) * 0.5
  noise += Math.sin(worldX * scale * 4.1 + worldZ * scale * 3.7) * 0.25
  noise += Math.sin(worldX * scale * 8.5 + worldZ * scale * 7.3) * 0.125
  return noise * amplitude
}

function whoopsPattern(worldZ, wavelength, amplitude) {
  // Rhythmic whoops (repeating bumps)
  return amplitude * Math.sin((worldZ * Math.PI * 2) / wavelength)
}

