// src/terrain/water/createWaterVisuals.js

/**
 * Water visuals for the offroad playground.
 *
 * Creates a visual mesh for the water surface that matches the physics
 * water surface height. This is purely visual and does not affect physics.
 */

export function createWaterVisuals(config = {}) {
  const waterLevelYMeters = sanitizeNumber(config.waterLevelYMeters, -0.5)
  const sizeMeters = sanitizePositiveNumber(config.sizeMeters, 100)
  const waveAmplitudeMeters = sanitizeNonNegativeNumber(config.waveAmplitudeMeters, 0.0)
  const waveFrequencyHz = sanitizeNonNegativeNumber(config.waveFrequencyHz, 0.5)
  const waveSpeedMetersPerSecond = sanitizeNonNegativeNumber(config.waveSpeedMetersPerSecond, 1.0)
  
  // Create a visual mesh for the water surface
  function createWaterMesh() {
    // This would typically create a Three.js mesh, but we're just returning
    // the configuration data for now since we're not directly creating Three.js objects
    return {
      type: 'water-mesh',
      waterLevelYMeters,
      sizeMeters,
      waveAmplitudeMeters,
      waveFrequencyHz,
      waveSpeedMetersPerSecond,
    }
  }

  return {
    kind: 'water-visuals-v1',
    waterLevelYMeters,
    sizeMeters,
    waveAmplitudeMeters,
    waveFrequencyHz,
    waveSpeedMetersPerSecond,
    createWaterMesh,
  }
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function sanitizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeNonNegativeNumber(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}
