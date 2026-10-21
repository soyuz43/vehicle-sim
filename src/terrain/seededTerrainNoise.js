// src/terrain/seededTerrainNoise.js

export function normalizeTerrainSeed(seed) {
  if (seed === null || seed === undefined) return null
  if (Number.isSafeInteger(seed)) return String(seed)
  if (typeof seed !== 'string') {
    throw new TypeError('Terrain seed must be a string or safe integer')
  }
  const normalizedSeed = seed.trim()
  if (normalizedSeed.length === 0 || normalizedSeed.length > 128) {
    throw new RangeError('Terrain seed must contain 1 to 128 characters')
  }
  return normalizedSeed
}

export function createSeededRandom(seed) {
  const normalizedSeed = normalizeTerrainSeed(seed)
  if (normalizedSeed === null) {
    throw new TypeError('A terrain seed is required for seeded generation')
  }

  let state = hashTerrainSeed(normalizedSeed)
  return function nextRandom() {
    state = (state + 0x6d2b79f5) | 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function createSeededTerrainNoise(seed, frequency) {
  const normalizedSeed = normalizeTerrainSeed(seed)
  if (normalizedSeed === null) {
    throw new TypeError('A terrain seed is required for seeded noise')
  }
  if (!Number.isFinite(frequency) || frequency <= 0) {
    throw new RangeError('Terrain noise frequency must be finite and positive')
  }

  const seedHash = hashTerrainSeed(normalizedSeed)
  return function sampleSeededTerrainNoise(worldXMeters, worldZMeters) {
    let weightedNoise = 0
    let totalWeight = 0
    let octaveFrequency = frequency
    let octaveWeight = 1

    for (let octave = 0; octave < 4; octave += 1) {
      weightedNoise += sampleValueNoise(
        worldXMeters * octaveFrequency,
        worldZMeters * octaveFrequency,
        seedHash ^ Math.imul(octave, 0x9e3779b9)
      ) * octaveWeight
      totalWeight += octaveWeight
      octaveFrequency *= 2
      octaveWeight *= 0.5
    }

    return weightedNoise / totalWeight
  }
}

export function hashTerrainSeed(seed) {
  const normalizedSeed = normalizeTerrainSeed(seed)
  if (normalizedSeed === null) {
    throw new TypeError('A terrain seed is required')
  }
  let hash = 2166136261
  for (let index = 0; index < normalizedSeed.length; index += 1) {
    hash ^= normalizedSeed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function sampleValueNoise(x, z, seedHash) {
  const xCell = Math.floor(x)
  const zCell = Math.floor(z)
  const xFraction = smoothStep(x - xCell)
  const zFraction = smoothStep(z - zCell)
  const south = interpolate(
    latticeValue(seedHash, xCell, zCell),
    latticeValue(seedHash, xCell + 1, zCell),
    xFraction
  )
  const north = interpolate(
    latticeValue(seedHash, xCell, zCell + 1),
    latticeValue(seedHash, xCell + 1, zCell + 1),
    xFraction
  )
  return interpolate(south, north, zFraction)
}

function latticeValue(seedHash, xCell, zCell) {
  let hash = seedHash ^ Math.imul(xCell, 0x8da6b343) ^ Math.imul(zCell, 0xd8163841)
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d)
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b)
  hash ^= hash >>> 16
  return (hash >>> 0) / 2147483647.5 - 1
}

function smoothStep(value) {
  return value * value * (3 - 2 * value)
}

function interpolate(start, end, amount) {
  return start + (end - start) * amount
}