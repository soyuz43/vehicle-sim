// src/terrain/obstacles/createObstacleField.js

/**
 * Static obstacle field for the offroad playground.
 *
 * Each obstacle is a kinematic (fixed) primitive that contributes a LOCAL
 * height above the nominal ground surface. The surface profile overlays this
 * height onto the terrain heightfield so the EXISTING per-wheel suspension
 * raycast interacts with obstacles through the same code path as terrain
 * bumps. No separate collision solver is introduced, which preserves the
 * deterministic simulation-first architecture.
 *
 * Obstacles carry consistent mass and inertia derived from their geometry and
 * a real material density (granite ~2600 kg/m^3, concrete ~2400 kg/m^3). These
 * properties are computed now so future dynamic interaction (Phase 2/3) can
 * reuse them. Static obstacles are kinematically fixed in this phase; rigid
 * body side-impact response is an explicit future seam, not implemented here,
 * to avoid shipping a broken "realistic" collision system.
 */

import {
  DEFAULT_SURFACE_MATERIAL_CATALOG,
  resolveSurfaceFrictionCoefficient,
  SURFACE_MATERIAL_KINDS,
} from '../createSurfaceMaterialCatalog.js'
import { createSeededRandom } from '../seededTerrainNoise.js'

const DEFAULT_EDGE_RAMP_METERS = 0.25

// Deterministic layout for the extra obstacles that an obstacle density
// above 1 adds beyond the eight legacy descriptors. The obstacles occupy
// eight z-slots across the 78 m .. 162 m band of the 400 m reference course,
// with two x-lanes per band row so no two extra obstacles share a position.
const EXTRA_OBSTACLE_BAND_START_METERS = 78
const EXTRA_OBSTACLE_BAND_END_METERS = 162
const EXTRA_OBSTACLE_BAND_SLOT_COUNT = 8
const EXTRA_OBSTACLE_X_LANES = Object.freeze([-18, 12, -34, 28, -50, 44])
const EXTRA_OBSTACLE_SHAPES = Object.freeze(['dome', 'box', 'cylinder'])

// Real material densities (kg/m^3) used to derive consistent mass and inertia
// from obstacle geometry. No magic numbers: mass follows V * density.
const MATERIAL_DENSITY_KG_PER_METER_CUBED = Object.freeze({
  [SURFACE_MATERIAL_KINDS.ROCK]: 2600,
  [SURFACE_MATERIAL_KINDS.CONCRETE]: 2400,
  [SURFACE_MATERIAL_KINDS.GRAVEL]: 1800,
  [SURFACE_MATERIAL_KINDS.DIRT]: 1500,
})

function densityForSurfaceKind(surfaceKind) {
  if (surfaceKind === SURFACE_MATERIAL_KINDS.CONCRETE) {
    return MATERIAL_DENSITY_KG_PER_METER_CUBED[SURFACE_MATERIAL_KINDS.CONCRETE]
  }
  if (surfaceKind === SURFACE_MATERIAL_KINDS.GRAVEL) {
    return MATERIAL_DENSITY_KG_PER_METER_CUBED[SURFACE_MATERIAL_KINDS.GRAVEL]
  }
  if (surfaceKind === SURFACE_MATERIAL_KINDS.DIRT) {
    return MATERIAL_DENSITY_KG_PER_METER_CUBED[SURFACE_MATERIAL_KINDS.DIRT]
  }
  return MATERIAL_DENSITY_KG_PER_METER_CUBED[SURFACE_MATERIAL_KINDS.ROCK]
}

export function createObstacleField(config = {}) {
  const edgeRampMeters = sanitizeNonNegativeNumber(
    config.edgeRampMeters,
    DEFAULT_EDGE_RAMP_METERS
  )
  const obstacleDescriptors = normalizeObstacles(
    config.obstacles ?? defaultObstacles(config)
  )

  // Returns the highest obstacle top LOCAL height (above its base) at (x,z),
  // together with the obstacle surface kind and friction, or null when no
  // obstacle covers the point. The surface profile adds the local terrain
  // height to obtain the world-space top.
  function sampleTopSurfaceAtWorldXZ(worldXMeters, worldZMeters) {
    if (
      !Number.isFinite(worldXMeters) ||
      !Number.isFinite(worldZMeters)
    ) {
      return null
    }
    let best = null
    for (const obstacle of obstacleDescriptors) {
      const localHeightMeters = obstacleLocalHeightMeters(
        obstacle,
        worldXMeters,
        worldZMeters,
        edgeRampMeters
      )
      if (
        localHeightMeters > 0 &&
        (best === null || localHeightMeters > best.localHeightMeters)
      ) {
        best = {
          localHeightMeters,
          surfaceKind: obstacle.surfaceKind,
          frictionCoefficient: obstacle.frictionCoefficient,
          obstacleId: obstacle.id,
          shape: obstacle.shape,
        }
      }
    }
    return best
  }

  function getObstacles() {
    return obstacleDescriptors
  }

  return {
    kind: 'static-obstacle-field-v1',
    edgeRampMeters,
    sampleTopSurfaceAtWorldXZ,
    getObstacles,
  }
}

// Local height of the obstacle top above its base at (x,z). Returns 0 (no
// contribution) outside the footprint. Box and cylinder footprints are given a
// small toe ramp (edgeRampMeters) so wheels can mount them without hitting a
// vertical cliff; the dome (hemisphere) is already tangent to the ground.
function obstacleLocalHeightMeters(
  obstacle,
  worldXMeters,
  worldZMeters,
  edgeRampMeters
) {
  const dx = worldXMeters - obstacle.centerXMeters
  const dz = worldZMeters - obstacle.centerZMeters

  if (obstacle.shape === 'dome') {
    const r = Math.hypot(dx, dz)
    if (r >= obstacle.radiusMeters) return 0
    return Math.sqrt(
      Math.max(0, obstacle.radiusMeters * obstacle.radiusMeters - r * r)
    )
  }

  if (obstacle.shape === 'cylinder') {
    const r = Math.hypot(dx, dz)
    if (r >= obstacle.radiusMeters) return 0
    const distanceInside = obstacle.radiusMeters - r
    return obstacle.heightMeters * rampScale(distanceInside, edgeRampMeters)
  }

  // box
  const ax = Math.abs(dx)
  const az = Math.abs(dz)
  if (
    ax >= obstacle.halfExtentXMeters ||
    az >= obstacle.halfExtentZMeters
  ) {
    return 0
  }
  const distanceInside = Math.min(
    obstacle.halfExtentXMeters - ax,
    obstacle.halfExtentZMeters - az
  )
  return obstacle.heightMeters * rampScale(distanceInside, edgeRampMeters)
}

function rampScale(distanceInsideMeters, edgeRampMeters) {
  if (distanceInsideMeters <= 0) return 0
  if (distanceInsideMeters >= edgeRampMeters) return 1
  return distanceInsideMeters / Math.max(edgeRampMeters, Number.EPSILON)
}

function normalizeObstacles(rawObstacles) {
  if (!Array.isArray(rawObstacles)) return []
  const descriptors = []
  for (const raw of rawObstacles) {
    if (!raw || typeof raw !== 'object') continue
    const centerXMeters = Number(raw.centerXMeters)
    const centerZMeters = Number(raw.centerZMeters)
    if (!Number.isFinite(centerXMeters) || !Number.isFinite(centerZMeters)) {
      continue
    }
    const shape =
      raw.shape === 'cylinder' || raw.shape === 'box' ? raw.shape : 'dome'
    const surfaceKind = raw.surfaceKind ?? SURFACE_MATERIAL_KINDS.ROCK
    const densityKgPerMeterCubed =
      Number(raw.densityKgPerMeterCubed) > 0
        ? Number(raw.densityKgPerMeterCubed)
        : densityForSurfaceKind(surfaceKind)
    const explicitFriction = Number(raw.frictionCoefficient)
    const frictionCoefficient = Number.isFinite(explicitFriction)
      ? explicitFriction
      : resolveSurfaceFrictionCoefficient(
          DEFAULT_SURFACE_MATERIAL_CATALOG,
          surfaceKind
        )

    const descriptor = {
      id: String(raw.id ?? 'obstacle-' + descriptors.length),
      shape,
      surfaceKind,
      densityKgPerMeterCubed,
      frictionCoefficient,
      visualColor: Number.isFinite(Number(raw.visualColor))
        ? Number(raw.visualColor)
        : undefined,
      centerXMeters,
      centerZMeters,
    }

    if (shape === 'dome') {
      const radiusMeters = sanitizePositiveNumber(raw.radiusMeters, 0.6)
      descriptor.radiusMeters = radiusMeters
      accumulateMassInertiaDome(descriptor)
    } else if (shape === 'cylinder') {
      const radiusMeters = sanitizePositiveNumber(raw.radiusMeters, 0.5)
      const heightMeters = sanitizePositiveNumber(raw.heightMeters, 0.5)
      descriptor.radiusMeters = radiusMeters
      descriptor.heightMeters = heightMeters
      accumulateMassInertiaCylinder(descriptor)
    } else {
      const halfExtentXMeters = sanitizePositiveNumber(raw.halfExtentXMeters, 0.5)
      const halfExtentZMeters = sanitizePositiveNumber(raw.halfExtentZMeters, 0.5)
      const heightMeters = sanitizePositiveNumber(raw.heightMeters, 0.5)
      descriptor.halfExtentXMeters = halfExtentXMeters
      descriptor.halfExtentZMeters = halfExtentZMeters
      descriptor.heightMeters = heightMeters
      accumulateMassInertiaBox(descriptor)
    }

    descriptors.push(descriptor)
  }
  return descriptors
}

// Mass and the vertical-axis (yaw) inertia are derived from geometry and a
// real material density so they are physically consistent, never tuned.
function accumulateMassInertiaDome(descriptor) {
  const r = descriptor.radiusMeters
  const volumeMetersCubed = (2 / 3) * Math.PI * r * r * r
  descriptor.volumeMetersCubed = volumeMetersCubed
  descriptor.massKg = volumeMetersCubed * descriptor.densityKgPerMeterCubed
  descriptor.inertiaKgMeterSquared = (2 / 5) * descriptor.massKg * r * r
}

function accumulateMassInertiaCylinder(descriptor) {
  const r = descriptor.radiusMeters
  const h = descriptor.heightMeters
  const volumeMetersCubed = Math.PI * r * r * h
  descriptor.volumeMetersCubed = volumeMetersCubed
  descriptor.massKg = volumeMetersCubed * descriptor.densityKgPerMeterCubed
  descriptor.inertiaKgMeterSquared = (1 / 2) * descriptor.massKg * r * r
}

function accumulateMassInertiaBox(descriptor) {
  const sx = 2 * descriptor.halfExtentXMeters
  const sz = 2 * descriptor.halfExtentZMeters
  const h = descriptor.heightMeters
  const volumeMetersCubed = sx * sz * h
  descriptor.volumeMetersCubed = volumeMetersCubed
  descriptor.massKg = volumeMetersCubed * descriptor.densityKgPerMeterCubed
  descriptor.inertiaKgMeterSquared =
    (1 / 12) * descriptor.massKg * (sx * sx + sz * sz)
}

function defaultObstacles(config = {}) {
  const defaultDescriptors = [
    { id: 'rock-dome-1', shape: 'dome', centerXMeters: -18, centerZMeters: 18, radiusMeters: 0.9, surfaceKind: SURFACE_MATERIAL_KINDS.ROCK },
    { id: 'rock-dome-2', shape: 'dome', centerXMeters: -10, centerZMeters: 26, radiusMeters: 0.6, surfaceKind: SURFACE_MATERIAL_KINDS.ROCK },
    { id: 'rock-dome-3', shape: 'dome', centerXMeters: -22, centerZMeters: 34, radiusMeters: 1.1, surfaceKind: SURFACE_MATERIAL_KINDS.ROCK },
    { id: 'rock-dome-4', shape: 'dome', centerXMeters: -6, centerZMeters: 40, radiusMeters: 0.5, surfaceKind: SURFACE_MATERIAL_KINDS.ROCK },
    { id: 'block-1', shape: 'box', centerXMeters: 12, centerZMeters: 30, halfExtentXMeters: 0.6, halfExtentZMeters: 0.6, heightMeters: 0.5, surfaceKind: SURFACE_MATERIAL_KINDS.CONCRETE },
    { id: 'block-2', shape: 'box', centerXMeters: 16, centerZMeters: 48, halfExtentXMeters: 0.8, halfExtentZMeters: 0.5, heightMeters: 0.6, surfaceKind: SURFACE_MATERIAL_KINDS.CONCRETE },
    { id: 'block-3', shape: 'cylinder', centerXMeters: 4, centerZMeters: 60, radiusMeters: 0.5, heightMeters: 0.7, surfaceKind: SURFACE_MATERIAL_KINDS.CONCRETE },
    { id: 'rock-dome-5', shape: 'dome', centerXMeters: -2, centerZMeters: 70, radiusMeters: 0.8, surfaceKind: SURFACE_MATERIAL_KINDS.ROCK },
  ]
  const obstacleDensity = Number.isFinite(config.obstacleDensity)
    ? Math.min(4, Math.max(0, config.obstacleDensity))
    : 1
  const sizeMeters = Number.isFinite(config.sizeMeters) && config.sizeMeters > 0
    ? config.sizeMeters
    : 400
  const featureScale = Number.isFinite(config.featureScale) && config.featureScale > 0
    ? config.featureScale
    : 1
  const count = Math.round(defaultDescriptors.length * obstacleDensity)
  if (count === 0) return []
  const courseScale = featureScale * (sizeMeters / 400)

  // An unseeded course uses no random source at all: the legacy descriptors
  // keep their proportional positions and every extra obstacle is placed by
  // an explicit deterministic rule.
  if (config.seed == null) {
    const unseededDescriptors = []
    for (let index = 0; index < count; index += 1) {
      unseededDescriptors.push(
        index < defaultDescriptors.length
          ? scaleLegacyObstacleDescriptor(
              defaultDescriptors[index],
              courseScale
            )
          : createDeterministicExtraObstacle(index - defaultDescriptors.length, {
              courseScale,
              sizeMeters,
            })
      )
    }
    return unseededDescriptors
  }

  const random = createSeededRandom(config.seed)
  const generatedDescriptors = []

  for (let index = 0; index < count; index += 1) {
    if (index < defaultDescriptors.length) {
      const descriptor = defaultDescriptors[index]
      generatedDescriptors.push({
        ...descriptor,
        centerXMeters:
          descriptor.centerXMeters * courseScale + (random() - 0.5) * 5 * courseScale,
        centerZMeters:
          descriptor.centerZMeters * courseScale + (random() - 0.5) * 4 * courseScale,
        radiusMeters: descriptor.radiusMeters
          ? descriptor.radiusMeters * courseScale
          : undefined,
        heightMeters: descriptor.heightMeters
          ? descriptor.heightMeters * courseScale
          : undefined,
        halfExtentXMeters: descriptor.halfExtentXMeters
          ? descriptor.halfExtentXMeters * courseScale
          : undefined,
        halfExtentZMeters: descriptor.halfExtentZMeters
          ? descriptor.halfExtentZMeters * courseScale
          : undefined,
      })
      continue
    }

    const shapeRoll = random()
    const centerXMeters = (random() * 56 - 28) * courseScale
    const centerZMeters = (18 + random() * 52) * courseScale
    const obstacleId = `procedural-obstacle-${index + 1}`
    if (shapeRoll < 0.65) {
      generatedDescriptors.push({
        id: obstacleId,
        shape: 'dome',
        centerXMeters,
        centerZMeters,
        radiusMeters: (0.4 + random() * 0.8) * courseScale,
        surfaceKind: SURFACE_MATERIAL_KINDS.ROCK,
      })
    } else if (shapeRoll < 0.85) {
      generatedDescriptors.push({
        id: obstacleId,
        shape: 'cylinder',
        centerXMeters,
        centerZMeters,
        radiusMeters: (0.4 + random() * 0.5) * courseScale,
        heightMeters: (0.4 + random() * 0.6) * courseScale,
        surfaceKind: SURFACE_MATERIAL_KINDS.CONCRETE,
      })
    } else {
      generatedDescriptors.push({
        id: obstacleId,
        shape: 'box',
        centerXMeters,
        centerZMeters,
        halfExtentXMeters: (0.4 + random() * 0.4) * courseScale,
        halfExtentZMeters: (0.4 + random() * 0.4) * courseScale,
        heightMeters: (0.4 + random() * 0.6) * courseScale,
        surfaceKind: SURFACE_MATERIAL_KINDS.CONCRETE,
      })
    }
  }

  return generatedDescriptors
}

// Legacy obstacle descriptors keep their relative layout and are scaled with
// the course, so a resized course stays proportional to the 400 m reference.
function scaleLegacyObstacleDescriptor(descriptor, courseScale) {
  const scaled = {
    ...descriptor,
    centerXMeters: descriptor.centerXMeters * courseScale,
    centerZMeters: descriptor.centerZMeters * courseScale,
  }
  if (descriptor.radiusMeters) {
    scaled.radiusMeters = descriptor.radiusMeters * courseScale
  }
  if (descriptor.heightMeters) {
    scaled.heightMeters = descriptor.heightMeters * courseScale
  }
  if (descriptor.halfExtentXMeters) {
    scaled.halfExtentXMeters = descriptor.halfExtentXMeters * courseScale
  }
  if (descriptor.halfExtentZMeters) {
    scaled.halfExtentZMeters = descriptor.halfExtentZMeters * courseScale
  }
  return scaled
}

// Extra obstacles sit on a deterministic lattice: eight z-slots across the
// 78 m .. 162 m band of the reference course, with two x-lanes per band row.
// The band is compressed uniformly when the scaled band would run past the
// course limit, so the extras stay spread out instead of stacking up at the
// clamp boundary.
function createDeterministicExtraObstacle(extraIndex, options) {
  const { courseScale, sizeMeters } = options
  const bandSlot = extraIndex % EXTRA_OBSTACLE_BAND_SLOT_COUNT
  const laneIndex =
    Math.floor(extraIndex / EXTRA_OBSTACLE_BAND_SLOT_COUNT) * 2 + (extraIndex % 2)
  const centerXMeters = EXTRA_OBSTACLE_X_LANES[laneIndex] * courseScale
  const centerZMeters = extraObstacleBandPositionMeters(
    bandSlot,
    courseScale,
    sizeMeters
  )
  const obstacleId = `procedural-obstacle-${extraIndex + 1}`
  const shape = EXTRA_OBSTACLE_SHAPES[extraIndex % EXTRA_OBSTACLE_SHAPES.length]

  if (shape === 'dome') {
    return {
      id: obstacleId,
      shape,
      centerXMeters,
      centerZMeters,
      radiusMeters: 0.8 * courseScale,
      surfaceKind: SURFACE_MATERIAL_KINDS.ROCK,
    }
  }
  if (shape === 'box') {
    return {
      id: obstacleId,
      shape,
      centerXMeters,
      centerZMeters,
      halfExtentXMeters: 0.6 * courseScale,
      halfExtentZMeters: 0.6 * courseScale,
      heightMeters: 0.5 * courseScale,
      surfaceKind: SURFACE_MATERIAL_KINDS.CONCRETE,
    }
  }
  return {
    id: obstacleId,
    shape: 'cylinder',
    centerXMeters,
    centerZMeters,
    radiusMeters: 0.5 * courseScale,
    heightMeters: 0.6 * courseScale,
    surfaceKind: SURFACE_MATERIAL_KINDS.CONCRETE,
  }
}

function extraObstacleBandPositionMeters(bandSlot, courseScale, sizeMeters) {
  const bandStartMeters = EXTRA_OBSTACLE_BAND_START_METERS * courseScale
  const bandEndMeters = EXTRA_OBSTACLE_BAND_END_METERS * courseScale
  const maxAbsZMeters = Math.max(0, sizeMeters / 2 - 10 * courseScale)
  const bandScale =
    bandEndMeters > maxAbsZMeters ? maxAbsZMeters / bandEndMeters : 1
  const bandFraction = bandSlot / (EXTRA_OBSTACLE_BAND_SLOT_COUNT - 1)
  return (
    bandStartMeters + (bandEndMeters - bandStartMeters) * bandFraction
  ) * bandScale
}

function sanitizeNonNegativeNumber(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function sanitizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}
