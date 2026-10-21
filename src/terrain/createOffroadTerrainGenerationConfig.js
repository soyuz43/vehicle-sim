// src/terrain/createOffroadTerrainGenerationConfig.js

import { normalizeTerrainSeed } from './seededTerrainNoise.js'

export const DEFAULT_OFFROAD_TERRAIN_GENERATION_CONFIG = Object.freeze({
  seed: null,
  sizeMeters: 400,
  featureScale: 1,
  roughnessMeters: 0.05,
  waterEnabled: false,
  obstacleDensity: 1,
})

export function createOffroadTerrainGenerationConfig(config = {}) {
  const boundsMeters = normalizeBounds(config.boundsMeters, config.sizeMeters)
  const featureScale = normalizePositiveValue(
    config.featureScale,
    DEFAULT_OFFROAD_TERRAIN_GENERATION_CONFIG.featureScale,
    'featureScale'
  )
  const roughnessMeters = normalizeNonNegativeValue(
    config.roughnessMeters,
    DEFAULT_OFFROAD_TERRAIN_GENERATION_CONFIG.roughnessMeters,
    'roughnessMeters'
  )
  const obstacleDensity = normalizeBoundedValue(
    config.obstacleDensity,
    DEFAULT_OFFROAD_TERRAIN_GENERATION_CONFIG.obstacleDensity,
    0,
    4,
    'obstacleDensity'
  )
  const waterEnabled = config.waterEnabled ?? false
  if (typeof waterEnabled !== 'boolean') {
    throw new TypeError('waterEnabled must be a boolean')
  }

  return Object.freeze({
    seed: normalizeTerrainSeed(config.seed),
    sizeMeters: boundsMeters.maxXMeters - boundsMeters.minXMeters,
    boundsMeters,
    featureScale,
    roughnessMeters,
    waterEnabled,
    obstacleDensity,
  })
}

function normalizeBounds(boundsMeters, sizeMeters) {
  if (boundsMeters === undefined) {
    const resolvedSizeMeters = normalizePositiveValue(sizeMeters, 400, 'sizeMeters')
    return createSquareBounds(resolvedSizeMeters)
  }

  if (!boundsMeters || typeof boundsMeters !== 'object') {
    throw new TypeError('boundsMeters must describe a square terrain boundary')
  }

  const { minXMeters, maxXMeters, minZMeters, maxZMeters } = boundsMeters
  if (sizeMeters !== undefined && (!Number.isFinite(sizeMeters) || sizeMeters <= 0)) {
    throw new RangeError('sizeMeters must be a finite positive number')
  }
  if (![minXMeters, maxXMeters, minZMeters, maxZMeters].every(Number.isFinite)) {
    throw new TypeError('boundsMeters coordinates must be finite numbers')
  }
  const widthMeters = maxXMeters - minXMeters
  const depthMeters = maxZMeters - minZMeters
  const toleranceMeters = Math.max(1, widthMeters, depthMeters) * 1e-9
  const isSquare = Math.abs(widthMeters - depthMeters) <= toleranceMeters
  const isCentered =
    Math.abs(minXMeters + maxXMeters) <= toleranceMeters &&
    Math.abs(minZMeters + maxZMeters) <= toleranceMeters
  if (widthMeters <= 0 || depthMeters <= 0 || !isSquare || !isCentered) {
    throw new RangeError('Offroad terrain bounds must be a positive square centered at the origin')
  }
  if (sizeMeters !== undefined && Math.abs(sizeMeters - widthMeters) > toleranceMeters) {
    throw new RangeError('sizeMeters must match boundsMeters dimensions')
  }
  return createSquareBounds(widthMeters)
}

function createSquareBounds(sizeMeters) {
  const halfSizeMeters = sizeMeters * 0.5
  return Object.freeze({
    minXMeters: -halfSizeMeters,
    maxXMeters: halfSizeMeters,
    minZMeters: -halfSizeMeters,
    maxZMeters: halfSizeMeters,
  })
}

function normalizePositiveValue(value, fallback, name) {
  const resolvedValue = value ?? fallback
  if (!Number.isFinite(resolvedValue) || resolvedValue <= 0) {
    throw new RangeError(`${name} must be a finite positive number`)
  }
  return resolvedValue
}

function normalizeNonNegativeValue(value, fallback, name) {
  const resolvedValue = value ?? fallback
  if (!Number.isFinite(resolvedValue) || resolvedValue < 0) {
    throw new RangeError(`${name} must be a finite non-negative number`)
  }
  return resolvedValue
}

function normalizeBoundedValue(value, fallback, minimum, maximum, name) {
  const resolvedValue = value ?? fallback
  if (
    !Number.isFinite(resolvedValue) ||
    resolvedValue < minimum ||
    resolvedValue > maximum
  ) {
    throw new RangeError(`${name} must be between ${minimum} and ${maximum}`)
  }
  return resolvedValue
}