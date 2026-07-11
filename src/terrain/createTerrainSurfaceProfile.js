// src/terrain/createTerrainSurfaceProfile.js

const DEFAULT_TERRAIN_SIZE_METERS = 320
const DEFAULT_FRICTION_COEFFICIENT = 1
const DEFAULT_NORMAL_SAMPLE_DISTANCE_METERS = 0.05

const WORLD_UP_NORMAL = Object.freeze({ x: 0, y: 1, z: 0 })

export function createTerrainSurfaceProfile(config = {}) {
  const sizeMeters = sanitizePositiveNumber(
    config.sizeMeters ?? config.size,
    DEFAULT_TERRAIN_SIZE_METERS
  )
  const halfSizeMeters = sizeMeters * 0.5
  const profileName =
    config.profileName === 'flat'
      ? 'flat-spawn-profile'
      : 'uneven-proving-ground-v1'
  const surfaceKind =
    config.surfaceKind ??
    (profileName === 'flat-spawn-profile'
      ? 'flat-asphalt'
      : 'asphalt-proving-ground')
  const frictionCoefficient = sanitizeNonNegativeNumber(
    config.frictionCoefficient,
    DEFAULT_FRICTION_COEFFICIENT
  )
  const normalSampleDistanceMeters = clamp(
    sanitizePositiveNumber(
      config.normalSampleDistanceMeters,
      DEFAULT_NORMAL_SAMPLE_DISTANCE_METERS
    ),
    0.005,
    1
  )
  const flatGroundHeightMeters = sanitizeNumber(config.groundHeightMeters)
  const fallbackResult = createSurfaceResult()

  function isWithinBounds(worldXMeters, worldZMeters) {
    return (
      Number.isFinite(worldXMeters) &&
      Number.isFinite(worldZMeters) &&
      Math.abs(worldXMeters) <= halfSizeMeters &&
      Math.abs(worldZMeters) <= halfSizeMeters
    )
  }

  function getHeightAtWorldXZ(worldXMeters, worldZMeters) {
    if (!Number.isFinite(worldXMeters) || !Number.isFinite(worldZMeters)) {
      return flatGroundHeightMeters
    }

    if (profileName === 'flat-spawn-profile') {
      return flatGroundHeightMeters
    }

    return (
      flatGroundHeightMeters +
      evaluateUnevenProvingGroundHeightMeters(worldXMeters, worldZMeters)
    )
  }

  function querySurfaceAtWorldPosition(
    worldXMeters,
    worldZMeters,
    target = fallbackResult
  ) {
    const isWithinTerrainBounds = isWithinBounds(worldXMeters, worldZMeters)
    const terrainHeightMeters = getHeightAtWorldXZ(worldXMeters, worldZMeters)

    target.isWithinBounds = isWithinTerrainBounds
    target.isInsideTerrainBounds = isWithinTerrainBounds
    target.profileName = profileName
    target.surfaceKind = surfaceKind
    target.frictionCoefficient = frictionCoefficient
    target.terrainHeightMeters = terrainHeightMeters
    target.groundHeightMeters = terrainHeightMeters
    target.status = isWithinTerrainBounds
      ? 'surface-available'
      : 'outside-terrain-bounds'

    if (!target.normalWorld) {
      target.normalWorld = { ...WORLD_UP_NORMAL }
    }

    if (!isWithinTerrainBounds) {
      target.normalWorld.x = WORLD_UP_NORMAL.x
      target.normalWorld.y = WORLD_UP_NORMAL.y
      target.normalWorld.z = WORLD_UP_NORMAL.z
      target.slopeRadians = 0
      target.slopeDegrees = 0
      return target
    }

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

    return target
  }

  function calculateNormalAtWorldXZ(
    worldXMeters,
    worldZMeters,
    target = null
  ) {
    const normal = target ?? { x: 0, y: 1, z: 0 }

    if (!Number.isFinite(worldXMeters) || !Number.isFinite(worldZMeters)) {
      normal.x = WORLD_UP_NORMAL.x
      normal.y = WORLD_UP_NORMAL.y
      normal.z = WORLD_UP_NORMAL.z
      return normal
    }

    const sampleDistanceMeters = normalSampleDistanceMeters
    const heightWestMeters = getHeightAtWorldXZ(
      worldXMeters - sampleDistanceMeters,
      worldZMeters
    )
    const heightEastMeters = getHeightAtWorldXZ(
      worldXMeters + sampleDistanceMeters,
      worldZMeters
    )
    const heightSouthMeters = getHeightAtWorldXZ(
      worldXMeters,
      worldZMeters - sampleDistanceMeters
    )
    const heightNorthMeters = getHeightAtWorldXZ(
      worldXMeters,
      worldZMeters + sampleDistanceMeters
    )
    const inverseSpan = 1 / (sampleDistanceMeters * 2)
    const slopeXMetersPerMeter =
      (heightEastMeters - heightWestMeters) * inverseSpan
    const slopeZMetersPerMeter =
      (heightNorthMeters - heightSouthMeters) * inverseSpan

    return normalizeVector3Into(
      normal,
      -slopeXMetersPerMeter,
      1,
      -slopeZMetersPerMeter
    )
  }

  return Object.freeze({
    kind: 'heightfield-terrain-surface-profile-v1',
    profileName,
    surfaceKind,
    frictionCoefficient,
    sizeMeters,
    size: sizeMeters,
    halfSizeMeters,
    halfSize: halfSizeMeters,
    normalSampleDistanceMeters,
    provingGroundLayout: Object.freeze({
      spawnFlatStartZMeters: -halfSizeMeters,
      spawnFlatEndZMeters: 16,
      broadRiseStartZMeters: 22,
      broadRiseEndZMeters: 42,
      alternatingBumpStartZMeters: 47,
      alternatingBumpEndZMeters: 64,
      crossSlopeStartZMeters: 67,
      crossSlopeEndZMeters: 84,
      shallowDipStartZMeters: 89,
      shallowDipEndZMeters: 108,
      washboardStartZMeters: 114,
      washboardEndZMeters: 138,
    }),
    isWithinBounds,
    getHeightAtWorldXZ,
    calculateNormalAtWorldXZ,
    querySurfaceAtWorldPosition,
  })
}

function createSurfaceResult() {
  return {
    isWithinBounds: false,
    isInsideTerrainBounds: false,
    profileName: 'unavailable',
    surfaceKind: 'unavailable',
    frictionCoefficient: 0,
    terrainHeightMeters: 0,
    groundHeightMeters: 0,
    normalWorld: { x: 0, y: 1, z: 0 },
    slopeRadians: 0,
    slopeDegrees: 0,
    status: 'unavailable',
  }
}

function evaluateUnevenProvingGroundHeightMeters(worldXMeters, worldZMeters) {
  let heightMeters = 0

  // The initial start and acceleration section remains exactly flat. Each
  // proving feature begins and ends with a zero-slope raised-cosine blend.
  heightMeters += 0.18 * raisedCosineWindow(worldZMeters, 22, 42)

  heightMeters += raisedCosineBumpMeters({
    worldXMeters,
    worldZMeters,
    centerXMeters: -1.25,
    centerZMeters: 52,
    radiusXMeters: 2,
    radiusZMeters: 2.1,
    amplitudeMeters: 0.075,
  })
  heightMeters += raisedCosineBumpMeters({
    worldXMeters,
    worldZMeters,
    centerXMeters: 1.25,
    centerZMeters: 61,
    radiusXMeters: 2,
    radiusZMeters: 2.1,
    amplitudeMeters: 0.075,
  })

  const crossSlopeWindow01 = raisedCosineWindow(worldZMeters, 67, 84)
  heightMeters +=
    crossSlopeWindow01 *
    0.085 *
    Math.sin(
      (Math.PI * 0.5 * clamp(worldXMeters, -9, 9)) / 9
    )

  heightMeters -= 0.12 * raisedCosineWindow(worldZMeters, 89, 108)

  const washboardWindow01 = raisedCosineWindow(worldZMeters, 114, 138)
  heightMeters +=
    washboardWindow01 *
    0.026 *
    Math.sin((Math.PI * 2 * (worldZMeters - 114)) / 5.2)

  return Number.isFinite(heightMeters) ? heightMeters : 0
}

function raisedCosineBumpMeters({
  worldXMeters,
  worldZMeters,
  centerXMeters,
  centerZMeters,
  radiusXMeters,
  radiusZMeters,
  amplitudeMeters,
}) {
  const normalizedXMeters =
    (worldXMeters - centerXMeters) / Math.max(radiusXMeters, Number.EPSILON)
  const normalizedZMeters =
    (worldZMeters - centerZMeters) / Math.max(radiusZMeters, Number.EPSILON)
  const radialDistance01 = Math.hypot(normalizedXMeters, normalizedZMeters)

  if (radialDistance01 >= 1) return 0

  return (
    amplitudeMeters *
    0.5 *
    (1 + Math.cos(Math.PI * clamp(radialDistance01, 0, 1)))
  )
}

function raisedCosineWindow(value, start, end) {
  if (!Number.isFinite(value) || end <= start) return 0
  if (value <= start || value >= end) return 0

  const normalized01 = (value - start) / (end - start)
  // A full cosine cycle starts and ends at zero with zero first derivative,
  // producing a bounded bump/window rather than a one-sided ramp.
  return 0.5 - 0.5 * Math.cos(Math.PI * 2 * normalized01)
}

function normalizeVector3Into(target, x, y, z) {
  const finiteX = sanitizeNumber(x)
  const finiteY = sanitizeNumber(y, 1)
  const finiteZ = sanitizeNumber(z)
  const length = Math.hypot(finiteX, finiteY, finiteZ)

  if (!Number.isFinite(length) || length <= Number.EPSILON) {
    target.x = WORLD_UP_NORMAL.x
    target.y = WORLD_UP_NORMAL.y
    target.z = WORLD_UP_NORMAL.z
    return target
  }

  target.x = finiteX / length
  target.y = finiteY / length
  target.z = finiteZ / length
  return target
}

function sanitizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeNonNegativeNumber(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, sanitizeNumber(value)))
}
