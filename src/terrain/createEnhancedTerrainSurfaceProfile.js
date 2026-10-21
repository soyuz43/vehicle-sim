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
const ROCK_GARDEN_CELL_SIZE_METERS = 20
const ROCK_GARDEN_BUMP_COUNT = 8
const ROCK_GARDEN_CHANNEL_COUNT = 5
// Rock garden band: the discrete footprint of the garden, expressed as
// course-scaled offsets. The south and north edges are measured from the
// south course edge and match the z extent of the rock surface region, the
// west edge is measured from the west course edge and starts at the rock
// surface region, and the east edge is measured from the centre line and
// stops where the grass surface region starts. The feather is the width of
// the smooth ramp at each band edge.
export const ROCK_GARDEN_BAND_SOUTH_EDGE_OFFSET_METERS = 100
export const ROCK_GARDEN_BAND_NORTH_EDGE_OFFSET_METERS = 200
export const ROCK_GARDEN_BAND_WEST_EDGE_OFFSET_METERS = 10
export const ROCK_GARDEN_BAND_EAST_EDGE_OFFSET_METERS = 10
export const ROCK_GARDEN_BAND_FEATHER_METERS = 10
// The start ramp is a localized spawn incline at the south course edge. The
// zone is the length of the ramp measured from the south course edge and the
// feather is the width of the smooth fade at each end of the zone.
export const START_RAMP_ZONE_METERS = 30
export const START_RAMP_FEATHER_METERS = 5
// The step-up jump reaches its crest two thirds of the way along its length
// and falls back to the base height over the last sixth of it. On the
// 400 m course that is a 1 m falloff instead of a vertical wall.
const STEP_UP_JUMP_CREST_NZ = 2 / 3
const STEP_UP_JUMP_TRAILING_EDGE_NZ = 5 / 6
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

  const startRampStartMeters = -halfSize
  const startRampEndMeters = -halfSize + START_RAMP_ZONE_METERS * courseScale
  const startRampFeatherMeters = START_RAMP_FEATHER_METERS * courseScale
  const rockGardenBandFeatherMeters = ROCK_GARDEN_BAND_FEATHER_METERS * courseScale
  const rockGardenBandWestEdgeMeters =
    -halfSize +
    ROCK_GARDEN_BAND_WEST_EDGE_OFFSET_METERS * courseScale +
    courseOffsets.xMeters
  const rockGardenBandEastEdgeMeters =
    ROCK_GARDEN_BAND_EAST_EDGE_OFFSET_METERS * courseScale +
    courseOffsets.xMeters
  const rockGardenBandSouthEdgeMeters =
    -halfSize +
    ROCK_GARDEN_BAND_SOUTH_EDGE_OFFSET_METERS * courseScale +
    courseOffsets.zMeters
  const rockGardenBandNorthEdgeMeters =
    -halfSize +
    ROCK_GARDEN_BAND_NORTH_EDGE_OFFSET_METERS * courseScale +
    courseOffsets.zMeters

  return function offroadPlaygroundHeightEvaluator(worldXMeters, worldZMeters, baseHeightMeters) {
    let heightMeters = baseHeightMeters

    // The start ramp is a localized spawn incline. The zone mask fades in
    // at the south course edge and fades back out at the end of the ramp
    // zone, so the sine wave stops at the end of the ramp instead of
    // rippling across the rest of the course.
    const startRampZone =
      smoothStep(
        worldZMeters,
        startRampStartMeters,
        startRampStartMeters + startRampFeatherMeters
      ) *
      (1 -
        smoothStep(
          worldZMeters,
          startRampEndMeters - startRampFeatherMeters,
          startRampEndMeters
        ))
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

    // The garden is a bounded band: the mask ramps up over the feather at
    // the west and south edges, holds its full strength across the band,
    // and ramps back down over the feather at the east and north edges.
    // Without the closing edges the mask stayed at full strength for every
    // position north of the band and east of it, which spread the garden
    // over the sand, dirt, and grass regions of the course.
    const rockGardenZone =
      smoothStep(
        worldZMeters,
        rockGardenBandSouthEdgeMeters,
        rockGardenBandSouthEdgeMeters + rockGardenBandFeatherMeters
      ) *
      (1 -
        smoothStep(
          worldZMeters,
          rockGardenBandNorthEdgeMeters - rockGardenBandFeatherMeters,
          rockGardenBandNorthEdgeMeters
        )) *
      smoothStep(
        worldXMeters,
        rockGardenBandWestEdgeMeters,
        rockGardenBandWestEdgeMeters + rockGardenBandFeatherMeters
      ) *
      (1 -
        smoothStep(
          worldXMeters,
          rockGardenBandEastEdgeMeters - rockGardenBandFeatherMeters,
          rockGardenBandEastEdgeMeters
        ))
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
    // The first matching region wins, so the mud pit is listed before the
    // rock and the grass band to keep the symmetric width it declares.
    // The rock band overlaps it on the left, the grass band on the right.
    {
      kind: SURFACE_MATERIAL_KINDS.MUD,
      minXMeters: -15 * courseScale + courseOffsets.xMeters,
      maxXMeters: 15 * courseScale + courseOffsets.xMeters,
      minZMeters: -halfSize + 100 * courseScale + courseOffsets.zMeters,
      maxZMeters: -halfSize + 160 * courseScale + courseOffsets.zMeters,
      frictionCoefficient: 0.25,
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
    // The regions below describe a route across the course, not a tiling of
    // it, so the ground beside the route (the flanks of the gravel corridor,
    // the verge along the course edge) belongs to no region. It resolves to
    // dirt, the generic off-road ground, instead of the base profile
    // default, which is the proving-ground tarmac.
    surfaceKind: config.surfaceKind ?? SURFACE_MATERIAL_KINDS.DIRT,
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
  // Ramp up in Z direction, flat in X. The trailing edge falls back to the
  // base height over the last sixth of the jump instead of ending on a
  // vertical wall, so the height field stays continuous and the contact
  // query never sees a step it cannot resolve.
  if (nz < -1 || nz > STEP_UP_JUMP_TRAILING_EDGE_NZ) return 0
  if (Math.abs(nx) > 1) return 0
  // 0 to 1 over the rising part of the jump, then the falloff.
  const rampProfile = Math.min(
    1,
    Math.max(0, (nz + 1) / (STEP_UP_JUMP_CREST_NZ + 1))
  )
  const trailingFalloff = 1 - smoothStep(
    nz,
    STEP_UP_JUMP_CREST_NZ,
    STEP_UP_JUMP_TRAILING_EDGE_NZ
  )
  return height * rampProfile * trailingFalloff * (1 - Math.abs(nx) * 0.3)
}

function gapJump(worldX, worldZ, centerX, centerZ, widthX, widthZ, height) {
  const nx = (worldX - centerX) / Math.max(widthX, Number.EPSILON)
  const nz = (worldZ - centerZ) / Math.max(widthZ, Number.EPSILON)
  if (Math.abs(nx) > 1 || nz < -1 || nz > 1) return 0
  // Two ramps with a gap in the middle: a takeoff lip that rises from the
  // base height, a dip back down to the base height, and a landing lip.
  // The lips and the dip are smooth, so the jump has no wall in it.
  const takeoffLip = smoothStep(nz, -1, -0.5) * (1 - smoothStep(nz, -0.5, 0))
  const landingLip = smoothStep(nz, 0, 0.5) * (1 - smoothStep(nz, 0.5, 1))
  // The cross profile fades the lips out at the edge of the jump, so the
  // sides of the jump are a ramp as well.
  const crossProfile =
    (1 - Math.abs(nx) * 0.2) * (1 - smoothStep(Math.abs(nx), 0.7, 1))
  return height * (takeoffLip + landingLip) * crossProfile
}

// Render/physics resolution note:
// The bump field is defined analytically with radii of 1.5 m to 3.5 m, so
// the smallest bump is 3 m across. The terrain render mesh samples the
// heightfield at 1.25 m (DEFAULT_RENDER_SAMPLE_SPACING_METERS in
// createTerrain.js), which covers a bump with two to six render samples,
// so the rendered surface shows faceted chatter where the analytic field
// has a rounded bump. The physics is unaffected: the contact query
// evaluates the same analytic profile that the render mesh samples, so a
// wheel follows the true profile and not the rendered one.
//
// This is the resolution budget of heightmap rendering, not a bug, and the
// two surfaces are not expected to agree. Do not close the gap by raising
// the render resolution alone: the grid is capped at 512 subdivisions and
// the measured mesh generation cost is about 0.28 s at 400 m against
// 0.77 s at that cap, so a finer grid buys startup time on every course
// size instead of a feature that has to read crisply.
//
// The intended architecture is an analytic heightfield for the terrain and
// discrete meshes (createObstacleFieldVisuals.js) for anything that must
// render crisply. A feature below the render sample spacing is felt
// through the physics and may not read as an individual bump.
//
// Rock garden bumps: a field of overlapping cosine bumps anchored to
// world positions. The garden is a lattice of 20 m cells and every cell
// holds eight bumps whose centres, radii, and amplitudes are derived from
// the seed, so the pattern is stable in world space and differs from place
// to place.
//
// The cell size and the bump radii scale with the course, so a resized
// course keeps the same bump layout relative to the course extent. The
// amplitude is scaled by the call site, which keeps the bump slope
// proportional to the course scale as well.
function rockGardenBumps(worldX, worldZ, seed = 12345, courseScale = 1) {
  const cellSizeMeters = ROCK_GARDEN_CELL_SIZE_METERS * courseScale
  const baseCellX = Math.floor(worldX / cellSizeMeters)
  const baseCellZ = Math.floor(worldZ / cellSizeMeters)
  // Deterministic pseudo-random value for a lattice coordinate pair.
  const hash = (a, b) => {
    let h =
      (seed ^
        Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^
        Math.imul(b - 0x9e3779b9, 0xc2b2ae35)) >>>
      0
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0
    h = (h ^ (h >>> 15)) >>> 0
    return h / 4294967296
  }
  let height = 0

  // A bump only reaches points inside its own cell or one of the eight
  // neighbouring cells, so the three by three cell neighbourhood covers
  // every bump that can contribute at this position.
  for (let cellOffsetX = -1; cellOffsetX <= 1; cellOffsetX += 1) {
    for (let cellOffsetZ = -1; cellOffsetZ <= 1; cellOffsetZ += 1) {
      const cellX = baseCellX + cellOffsetX
      const cellZ = baseCellZ + cellOffsetZ
      const cellOriginXMeters = cellX * cellSizeMeters
      const cellOriginZMeters = cellZ * cellSizeMeters

      for (let index = 0; index < ROCK_GARDEN_BUMP_COUNT; index += 1) {
        const hashX = cellX * ROCK_GARDEN_BUMP_COUNT + index
        const hashZ = cellZ * ROCK_GARDEN_CHANNEL_COUNT
        const centerXMeters =
          cellOriginXMeters +
          hash(hashX, hashZ) * ROCK_GARDEN_CELL_SIZE_METERS * courseScale
        const centerZMeters =
          cellOriginZMeters +
          hash(hashX, hashZ + 1) * ROCK_GARDEN_CELL_SIZE_METERS * courseScale
        const radiusXMeters =
          (1.5 + hash(hashX, hashZ + 2) * 2) * courseScale
        const radiusZMeters =
          (1.5 + hash(hashX, hashZ + 3) * 2) * courseScale
        // Design value, not a tuning artefact: a rock garden of 8 cm to
        // 20 cm rocks, the same order as the other course surfaces. The
        // sharpest crest in the band excites about 6.8 g of vertical
        // acceleration at 13 m/s before the suspension filters it, and
        // the whoops section of the course is geometrically harsher, so
        // the amplitude is not to be reduced without a course design
        // decision.
        const amplitudeMeters = 0.08 + hash(hashX, hashZ + 4) * 0.12
        const nx =
          (worldX - centerXMeters) / Math.max(radiusXMeters, Number.EPSILON)
        const nz =
          (worldZ - centerZMeters) / Math.max(radiusZMeters, Number.EPSILON)
        const r = Math.hypot(nx, nz)

        if (r < 1) {
          height += amplitudeMeters * 0.5 * (1 + Math.cos(Math.PI * r))
        }
      }
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

