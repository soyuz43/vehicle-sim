// src/terrain/createEnhancedTerrainSurfaceProfile.js

import { createTerrainSurfaceProfile } from './createTerrainSurfaceProfile.js'
import {
  DEFAULT_SURFACE_MATERIAL_CATALOG,
  getSurfaceMaterial,
  resolveSurfaceProperties,
  SURFACE_MATERIAL_KINDS,
} from './createSurfaceMaterialCatalog.js'

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
      material = applySurfaceConditionToMaterial(material, surfaceCondition)
    }

    // Apply region-specific condition if applicable
    if (surfaceRegionConditions) {
      const regionCondition = findRegionConditionAtWorldXZ(
        worldXMeters,
        worldZMeters,
        surfaceRegionConditions
      )
      if (regionCondition) {
        material = applySurfaceConditionToMaterial(material, regionCondition)
      }
    }

    // Populate enhanced properties
    const properties = resolveSurfaceProperties(surfaceMaterialCatalog, material.kind)

    target.surfaceMaterialKind = material.kind
    target.surfaceDisplayName = material.displayName
    target.dampingCoefficient = properties.dampingCoefficient
    target.rollingResistanceCoefficient = properties.rollingResistanceCoefficient
    target.deformabilityCoefficient = properties.deformabilityCoefficient
    target.thermalConductivity = properties.thermalConductivity
    target.roughnessRmsMeters = properties.roughnessRmsMeters
    target.combinedGripMultiplier = properties.combinedGripMultiplier
    target.lateralGripMultiplier = properties.lateralGripMultiplier
    target.longitudinalGripMultiplier = properties.longitudinalGripMultiplier
    target.visualColor = material.visualColor
    target.visualRoughness = material.visualRoughness
    target.visualMetalness = material.visualMetalness

    // The surface material catalog is the authoritative per-kind friction
    // source. The base profile already resolved the active surfaceKind
    // (including any surface region); we override its friction with the
    // catalog value so material physics stays consistent across the surface.
    target.frictionCoefficient = properties.frictionCoefficient

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

  function applySurfaceConditionToMaterial(material, conditionName) {
    const modifiers = {
      DRY: { frictionMultiplier: 1.0, dampingMultiplier: 1.0, rollingResistanceMultiplier: 1.0 },
      WET: { frictionMultiplier: 0.6, dampingMultiplier: 1.2, rollingResistanceMultiplier: 1.1 },
      ICY: { frictionMultiplier: 0.15, dampingMultiplier: 0.5, rollingResistanceMultiplier: 0.8 },
      DUSTY: { frictionMultiplier: 0.7, dampingMultiplier: 1.1, rollingResistanceMultiplier: 1.05 },
      LOOSE: { frictionMultiplier: 0.8, dampingMultiplier: 1.5, rollingResistanceMultiplier: 1.3 },
      PACKED: { frictionMultiplier: 1.1, dampingMultiplier: 0.8, rollingResistanceMultiplier: 0.9 },
    }
    const modifier = modifiers[conditionName?.toUpperCase()]
    if (!modifier) return material
    return {
      ...material,
      frictionCoefficient: material.frictionCoefficient * modifier.frictionMultiplier,
      dampingCoefficient: material.dampingCoefficient * modifier.dampingMultiplier,
      rollingResistanceCoefficient:
        material.rollingResistanceCoefficient * modifier.rollingResistanceMultiplier,
    }
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
  const sizeMeters = config.sizeMeters ?? 400
  const halfSize = sizeMeters * 0.5
  const jumpScale = config.jumpScale ?? 1.0
  const rockGardenScale = config.rockGardenScale ?? 1.0
  const noiseScale = config.noiseScale ?? 0.02
  const noiseAmplitude = config.noiseAmplitude ?? 0.05

  return function offroadPlaygroundHeightEvaluator(worldXMeters, worldZMeters, baseHeightMeters) {
    let heightMeters = baseHeightMeters

    // 1. Starting ramp (gentle incline from spawn)
    const startRampZone = smoothStep(worldZMeters, -halfSize, -halfSize + 30)
    heightMeters += startRampZone * 0.5 * (1 + Math.sin((worldZMeters + halfSize) * 0.1)) * jumpScale

    // 2. Jump ramp 1 - Tabletop jump at Z ≈ -120
    heightMeters += tabletopJump(worldXMeters, worldZMeters, 0, -halfSize + 120, 15, 8, 1.2 * jumpScale)

    // 3. Jump ramp 2 - Step-up jump at Z ≈ -40
    heightMeters += stepUpJump(worldXMeters, worldZMeters, 0, -halfSize + 180, 12, 6, 0.8 * jumpScale)

    // 4. Jump ramp 3 - Gap jump at Z ≈ 60
    heightMeters += gapJump(worldXMeters, worldZMeters, 0, -halfSize + 240, 10, 5, 1.0 * jumpScale)

    // 5. Rock garden bumps (irregular, high-frequency variation)
    const rockGardenZone = smoothStep(worldZMeters, -halfSize + 100, -halfSize + 200) *
                           smoothStep(worldXMeters, -halfSize + 10, 10) // Left side rock garden
    if (rockGardenZone > 0) {
      heightMeters += rockGardenZone * rockGardenBumps(worldXMeters, worldZMeters) * rockGardenScale
    }

    // 6. Mud pit depression (lowered area)
    const mudPitZone = smoothStep(worldZMeters, -halfSize + 100, -halfSize + 160) *
                       smoothStep(worldXMeters, -15, 15)
    heightMeters -= mudPitZone * 0.3

    // 7. Sand trap depression
    const sandTrapZone = smoothStep(worldZMeters, -halfSize + 200, -halfSize + 260) *
                         smoothStep(worldXMeters, -halfSize + 10, halfSize - 10)
    heightMeters -= sandTrapZone * 0.2

    // 8. Natural terrain noise (Perlin-like using multiple sine waves)
    heightMeters += terrainNoise(worldXMeters, worldZMeters, noiseScale, noiseAmplitude)

    // 9. Whoops section (rhythmic bumps)
    const whoopsZone = smoothStep(worldZMeters, -halfSize + 280, -halfSize + 340)
    heightMeters += whoopsZone * whoopsPattern(worldZMeters, 3.0, 0.15)

    // 10. Exit ramp
    const exitRampZone = smoothStep(worldZMeters, halfSize - 40, halfSize)
    heightMeters -= exitRampZone * 0.5

    return heightMeters
  }
}

/**
 * Create a terrain profile with procedurally generated surface regions
 * for a 4x4 playground with rock gardens, jumps, and varied surfaces.
 */
export function createOffroadPlaygroundProfile(config = {}) {
  const sizeMeters = config.sizeMeters ?? 400
  const halfSize = sizeMeters * 0.5

  // Define surface regions for the playground
  const surfaceRegions = [
    // Starting area - asphalt
    {
      kind: SURFACE_MATERIAL_KINDS.ASPHALT,
      minXMeters: -halfSize,
      maxXMeters: halfSize,
      minZMeters: -halfSize,
      maxZMeters: -halfSize + 40,
      frictionCoefficient: 0.95,
    },
    // Gravel section
    {
      kind: SURFACE_MATERIAL_KINDS.GRAVEL,
      minXMeters: -30,
      maxXMeters: 30,
      minZMeters: -halfSize + 40,
      maxZMeters: -halfSize + 100,
      frictionCoefficient: 0.55,
    },
    // Rock garden - left side
    {
      kind: SURFACE_MATERIAL_KINDS.ROCK,
      minXMeters: -halfSize + 10,
      maxXMeters: -10,
      minZMeters: -halfSize + 100,
      maxZMeters: -halfSize + 200,
      frictionCoefficient: 0.85,
    },
    // Mud pit - center
    {
      kind: SURFACE_MATERIAL_KINDS.MUD,
      minXMeters: -15,
      maxXMeters: 15,
      minZMeters: -halfSize + 100,
      maxZMeters: -halfSize + 160,
      frictionCoefficient: 0.25,
    },
    // Grass area - right side
    {
      kind: SURFACE_MATERIAL_KINDS.GRASS,
      minXMeters: 10,
      maxXMeters: halfSize - 10,
      minZMeters: -halfSize + 100,
      maxZMeters: -halfSize + 200,
      frictionCoefficient: 0.55,
    },
    // Sand trap
    {
      kind: SURFACE_MATERIAL_KINDS.SAND,
      minXMeters: -halfSize + 10,
      maxXMeters: halfSize - 10,
      minZMeters: -halfSize + 200,
      maxZMeters: -halfSize + 260,
      frictionCoefficient: 0.4,
    },
    // Dirt trail
    {
      kind: SURFACE_MATERIAL_KINDS.DIRT,
      minXMeters: -halfSize + 10,
      maxXMeters: halfSize - 10,
      minZMeters: -halfSize + 260,
      maxZMeters: halfSize - 10,
      frictionCoefficient: 0.55,
    },
  ]

  const heightEvaluator = createOffroadPlaygroundHeightEvaluator({
    sizeMeters,
    jumpScale: config.jumpScale ?? 1.0,
    rockGardenScale: config.rockGardenScale ?? 1.0,
    noiseScale: config.noiseScale ?? 0.02,
    noiseAmplitude: config.noiseAmplitude ?? 0.05,
  })

  const profileConfig = {
    ...config,
    sizeMeters,
    profileName: 'offroad-playground-v1',
    surfaceRegions,
    surfaceMaterialCatalog: config.surfaceMaterialCatalog ?? DEFAULT_SURFACE_MATERIAL_CATALOG,
    customHeightEvaluator: heightEvaluator,
  }

  return createEnhancedTerrainSurfaceProfile(profileConfig)
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

function rockGardenBumps(worldX, worldZ) {
  // Multiple overlapping cosine bumps for irregular rock garden feel
  let height = 0
  const seed = 12345
  // Use deterministic pseudo-random based on position
  const hash = (x, z) => {
    const h = Math.sin(x * 12.9898 + z * 78.233 + seed) * 43758.5453
    return h - Math.floor(h)
  }
  for (let i = 0; i < 8; i++) {
    const bx = worldX + hash(i, 0) * 20
    const bz = worldZ + hash(0, i) * 20
    const rx = 1.5 + hash(i, 1) * 2
    const rz = 1.5 + hash(1, i) * 2
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

