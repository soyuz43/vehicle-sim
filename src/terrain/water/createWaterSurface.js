// src/terrain/water/createWaterSurface.js

/**
 * Water surface for the offroad playground.
 *
 * Provides a static plane at a configurable world Y position with optional
 * sinusoidal waves. Computes submerged volume for buoyancy calculations.
 * Integrates with the existing surface profile system through the obstacle-aware
 * surface profile.
 */

const WATER_DENSITY_KG_PER_METER_CUBED = 1000 // Standard water density
const GRAVITY_METERS_PER_SECOND_SQUARED = 9.80665 // Standard Earth gravity

export function createWaterSurface(config = {}) {
  const waterLevelYMeters = sanitizeNumber(config.waterLevelYMeters, -0.5)
  const waveAmplitudeMeters = sanitizeNonNegativeNumber(config.waveAmplitudeMeters, 0.0)
  const waveFrequencyHz = sanitizeNonNegativeNumber(config.waveFrequencyHz, 0.5)
  const waveSpeedMetersPerSecond = sanitizeNonNegativeNumber(config.waveSpeedMetersPerSecond, 1.0)

  // Get the water surface height at a given world position and time
  function getHeightAtWorldXZ(worldXMeters, worldZMeters, timeSeconds = 0) {
    if (!Number.isFinite(worldXMeters) || !Number.isFinite(worldZMeters)) {
      return waterLevelYMeters
    }

    // If no waves, return the base water level
    if (waveAmplitudeMeters <= 0 || waveFrequencyHz <= 0) {
      return waterLevelYMeters
    }

    // Calculate wave displacement using sine waves
    const wavePhase = 2 * Math.PI * waveFrequencyHz * timeSeconds
    const waveXMeters = waveAmplitudeMeters * Math.sin(wavePhase + worldXMeters * 0.5)
    const waveZMeters = waveAmplitudeMeters * Math.sin(wavePhase * 1.3 + worldZMeters * 0.3)
    return waterLevelYMeters + (waveXMeters + waveZMeters) * 0.5
  }

  // Calculate the normal vector of the water surface at a given position
  function calculateNormalAtWorldXZ(worldXMeters, worldZMeters, timeSeconds = 0, target = {}) {
    const normal = target && target.x !== undefined ? target : { x: 0, y: 1, z: 0 }

    // If no waves, normal is straight up
    if (waveAmplitudeMeters <= 0 || waveFrequencyHz <= 0) {
      normal.x = 0
      normal.y = 1
      normal.z = 0
      return normal
    }

    const d = 0.01 // Small delta for numerical differentiation
    const wavePhase = 2 * Math.PI * waveFrequencyHz * timeSeconds

    // Calculate height at nearby points for numerical gradient
    const heightCenter = getHeightAtWorldXZ(worldXMeters, worldZMeters, timeSeconds)
    const heightX = getHeightAtWorldXZ(worldXMeters + d, worldZMeters, timeSeconds)
    const heightZ = getHeightAtWorldXZ(worldXMeters, worldZMeters + d, timeSeconds)

    // Calculate gradient (slope) in X and Z directions
    const slopeX = (heightX - heightCenter) / d
    const slopeZ = (heightZ - heightCenter) / d

    // Normal vector is perpendicular to the surface
    const nx = -slopeX
    const ny = 1
    const nz = -slopeZ
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

  // Calculate buoyant force on a submerged object
  function calculateBuoyantForce(submergedVolumeMetersCubed) {
    if (!Number.isFinite(submergedVolumeMetersCubed) || submergedVolumeMetersCubed <= 0) {
      return 0
    }
    
    // Archimedes' principle: F = rho * g * V
    return WATER_DENSITY_KG_PER_METER_CUBED * GRAVITY_METERS_PER_SECOND_SQUARED * submergedVolumeMetersCubed
  }

  return {
    kind: 'water-surface-v1',
    waterLevelYMeters,
    waveAmplitudeMeters,
    waveFrequencyHz,
    waveSpeedMetersPerSecond,
    getHeightAtWorldXZ,
    calculateNormalAtWorldXZ,
    calculateBuoyantForce,
  }
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function sanitizeNonNegativeNumber(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}
