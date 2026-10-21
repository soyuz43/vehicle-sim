import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import { createSimulation } from '../src/createSimulation.js'
import { createOffroadTerrainGenerationConfig } from '../src/terrain/createOffroadTerrainGenerationConfig.js'
import { createTerrainSelection } from '../src/terrain/createTerrainSelection.js'
import { createOffroadPlaygroundProfile } from '../src/terrain/createEnhancedTerrainSurfaceProfile.js'

const SAMPLE_POSITIONS = [
  { xMeters: 0, zMeters: -175 },
  { xMeters: -24, zMeters: -86 },
  { xMeters: 14, zMeters: -48 },
  { xMeters: 42, zMeters: 35 },
  { xMeters: 80, zMeters: 115 },
]

test('same seed reproduces terrain samples, surface kinds, and obstacle placement', () => {
  const first = selectTerrain('?terrain=offroad&seed=granite-run-04')
  const second = selectTerrain('?terrain=offroad&seed=granite-run-04')

  assert.deepEqual(readTerrainSamples(first), readTerrainSamples(second))
  assert.deepEqual(readObstacleSamples(first), readObstacleSamples(second))
  assert.deepEqual(first.generationConfig, second.generationConfig)
})

test('different seeds vary terrain shape and surface-kind placement', () => {
  const first = selectTerrain('?terrain=offroad&seed=granite-run-04')
  const second = selectTerrain('?terrain=offroad&seed=granite-run-05')
  let changedHeightSamples = 0
  let changedSurfaceKinds = 0

  for (let xMeters = -50; xMeters <= 50; xMeters += 5) {
    for (let zMeters = -120; zMeters <= -30; zMeters += 5) {
      const firstSurface = first.surfaceProfile.querySurfaceAtWorldPosition(xMeters, zMeters)
      const secondSurface = second.surfaceProfile.querySurfaceAtWorldPosition(xMeters, zMeters)
      if (firstSurface.surfaceKind !== secondSurface.surfaceKind) {
        changedSurfaceKinds += 1
      }
      if (Math.abs(firstSurface.terrainHeightMeters - secondSurface.terrainHeightMeters) > 1e-6) {
        changedHeightSamples += 1
      }
    }
  }

  assert.ok(changedHeightSamples > 0)
  assert.ok(changedSurfaceKinds > 0)
  let minimumHeightMeters = Infinity
  let maximumHeightMeters = -Infinity
  for (let xMeters = -200; xMeters <= 200; xMeters += 10) {
    for (let zMeters = -200; zMeters <= 200; zMeters += 10) {
      const heightMeters = first.baseProfile.getHeightAtWorldXZ(xMeters, zMeters)
      assert.ok(Number.isFinite(heightMeters))
      minimumHeightMeters = Math.min(minimumHeightMeters, heightMeters)
      maximumHeightMeters = Math.max(maximumHeightMeters, heightMeters)
    }
  }
  assert.ok(minimumHeightMeters > -5)
  assert.ok(maximumHeightMeters < 20)
  for (const sample of readTerrainSamples(first)) {
    assert.ok(Number.isFinite(sample.heightMeters))
    assert.ok(sample.heightMeters > -5 && sample.heightMeters < 20)
    const normalLength = Math.hypot(
      sample.normalWorld.x,
      sample.normalWorld.y,
      sample.normalWorld.z
    )
    assert.ok(Math.abs(normalLength - 1) < 1e-9)
  }
  assert.notDeepEqual(readObstacleSamples(first), readObstacleSamples(second))
})

test('unseeded offroad defaults preserve the established layout', () => {
  const profile = createOffroadPlaygroundProfile()
  const explicitUnseededProfile = createOffroadPlaygroundProfile({ seed: null })
  const defaultSelection = selectTerrain('?terrain=offroad')

  assert.deepEqual(readTerrainSamples({ surfaceProfile: profile }), readTerrainSamples({ surfaceProfile: explicitUnseededProfile }))
  assert.equal(profile.generationConfig.seed, null)
  assert.equal(defaultSelection.generationConfig.seed, null)
  assert.equal(defaultSelection.generationConfig.sizeMeters, 400)
  assert.equal(defaultSelection.obstacleField.getObstacles().length, 8)
})

test('proving-ground ignores off-road seed and generation options', () => {
  const first = selectTerrain('?terrain=proving-ground&seed=first&water=true')
  const second = selectTerrain('?terrain=proving-ground&seed=second&terrainSizeMeters=900')

  assert.equal(first.generationConfig, null)
  assert.equal(second.generationConfig, null)
  assert.deepEqual(readTerrainSamples(first), readTerrainSamples(second))
})

test('programmatic square bounds configure off-road terrain without a size alias', () => {
  const selection = selectTerrain('?terrain=offroad', {
    offroadGenerationConfig: {
      seed: 'wide-course',
      boundsMeters: {
        minXMeters: -250,
        maxXMeters: 250,
        minZMeters: -250,
        maxZMeters: 250,
      },
    },
  })

  assert.equal(selection.generationConfig.sizeMeters, 500)
  assert.equal(selection.surfaceProfile.sizeMeters, 500)
})

test('invalid URL generation values fall back to established defaults', () => {
  const selection = selectTerrain(
    '?terrain=offroad&seed=&terrainSizeMeters=-1&featureScale=0&roughnessMeters=-1&obstacleDensity=5'
  )

  assert.equal(selection.generationConfig.seed, null)
  assert.equal(selection.generationConfig.sizeMeters, 400)
  assert.equal(selection.generationConfig.featureScale, 1)
  assert.equal(selection.generationConfig.roughnessMeters, 0.05)
  assert.equal(selection.generationConfig.obstacleDensity, 1)
})
test('feature scale and roughness settings alter the seeded heightfield', () => {
  const baseline = selectTerrain('?terrain=offroad&seed=granite-run-04')
  const configured = selectTerrain(
    '?terrain=offroad&seed=granite-run-04&featureScale=1.2&roughnessMeters=0.12'
  )
  const baselineHeights = SAMPLE_POSITIONS.map(({ xMeters, zMeters }) =>
    baseline.baseProfile.getHeightAtWorldXZ(xMeters, zMeters)
  )
  const configuredHeights = SAMPLE_POSITIONS.map(({ xMeters, zMeters }) =>
    configured.baseProfile.getHeightAtWorldXZ(xMeters, zMeters)
  )

  assert.notDeepEqual(configuredHeights, baselineHeights)
})
test('URL options configure bounds, feature scale, roughness, water, and obstacle density', () => {
  const selection = selectTerrain(
    '?terrain=offroad&seed=swamp-02&terrainSizeMeters=500&featureScale=1.2&roughnessMeters=0.12&obstacleDensity=2&water=true',
    { waterSurfaceConfig: { waterLevelYMeters: 100 } }
  )

  assert.deepEqual(selection.generationConfig.boundsMeters, {
    minXMeters: -250,
    maxXMeters: 250,
    minZMeters: -250,
    maxZMeters: 250,
  })
  assert.equal(selection.generationConfig.featureScale, 1.2)
  assert.equal(selection.generationConfig.roughnessMeters, 0.12)
  assert.equal(selection.generationConfig.waterEnabled, true)
  assert.equal(selection.generationConfig.obstacleDensity, 2)
  assert.equal(selection.obstacleField.getObstacles().length, 16)
  assert.strictEqual(selection.surfaceProfile.waterSurface, selection.waterSurface)
  assert.equal(selection.surfaceProfile.querySurfaceAtWorldPosition(0, 0).surfaceKind, 'water')
})

test('createSimulation uses seeded terrain for rendering and contact queries', () => {
  const simulation = createSimulationForSearch('?terrain=offroad', {
    offroadGenerationConfig: {
      seed: 'live-config-09',
      sizeMeters: 500,
    },
  })
  const contactSample = simulation.terrainContactQuery.queryAtWorldXZ(24, -67)
  const profileSample = simulation.terrainSurfaceProfile.querySurfaceAtWorldPosition(24, -67)

  assert.equal(simulation.terrain.geometry.parameters.width, 500)
  assert.equal(simulation.terrainSurfaceProfile.sizeMeters, 500)
  assert.equal(contactSample.terrainHeightMeters, profileSample.terrainHeightMeters)
  assert.equal(contactSample.surfaceKind, profileSample.surfaceKind)
  assert.equal(contactSample.frictionCoefficient, profileSample.frictionCoefficient)
})
test('generation config validates seed, bounds, and physical configuration inputs', () => {
  assert.throws(() => createOffroadTerrainGenerationConfig({ seed: '  ' }), RangeError)
  assert.throws(() => createOffroadTerrainGenerationConfig({ seed: {} }), TypeError)
  assert.throws(() => createOffroadTerrainGenerationConfig({ featureScale: 0 }), RangeError)
  assert.throws(() => createOffroadTerrainGenerationConfig({ roughnessMeters: -0.1 }), RangeError)
  assert.throws(() => createOffroadTerrainGenerationConfig({ obstacleDensity: 5 }), RangeError)
  assert.throws(() => createOffroadTerrainGenerationConfig({
    sizeMeters: Number.NaN,
    boundsMeters: { minXMeters: -250, maxXMeters: 250, minZMeters: -250, maxZMeters: 250 },
  }), RangeError)
  assert.throws(() => createOffroadTerrainGenerationConfig({ waterEnabled: 'yes' }), TypeError)
  assert.throws(() => createOffroadTerrainGenerationConfig({
    boundsMeters: {
      minXMeters: -200,
      maxXMeters: 200,
      minZMeters: -100,
      maxZMeters: 100,
    },
  }), RangeError)
})

test('roughness is bounded to the supported amplitude range', () => {
  assert.equal(
    selectTerrain('?terrain=offroad&roughnessMeters=12').generationConfig.roughnessMeters,
    0.05
  )
  assert.equal(
    selectTerrain('?terrain=offroad&roughnessMeters=2').generationConfig.roughnessMeters,
    2
  )
  assert.equal(
    selectTerrain('?terrain=offroad&roughnessMeters=0.12').generationConfig.roughnessMeters,
    0.12
  )
  assert.throws(
    () => createOffroadTerrainGenerationConfig({ roughnessMeters: 2.5 }),
    RangeError
  )
  assert.equal(
    createOffroadTerrainGenerationConfig({ roughnessMeters: 2 }).roughnessMeters,
    2
  )
})

test('offroad profile config can enable the water surface programmatically', () => {
  const selection = selectTerrain('?terrain=offroad', {
    offroadProfileConfig: { waterEnabled: true },
  })

  assert.equal(selection.generationConfig.waterEnabled, true)
  assert.notEqual(selection.waterSurface, null)
  assert.equal(selection.surfaceProfile.waterSurface, selection.waterSurface)
})

test('offroad generation config overrides the profile water setting', () => {
  const selection = selectTerrain('?terrain=offroad', {
    offroadProfileConfig: { waterEnabled: true },
    offroadGenerationConfig: { waterEnabled: false },
  })

  assert.equal(selection.generationConfig.waterEnabled, false)
  assert.equal(selection.waterSurface, null)
})

test('offroad-water forces the water surface on over a disabled profile setting', () => {
  const selection = selectTerrain('?terrain=offroad-water', {
    offroadProfileConfig: { waterEnabled: false },
  })

  assert.equal(selection.generationConfig.waterEnabled, true)
  assert.notEqual(selection.waterSurface, null)
  assert.equal(selection.surfaceProfile.waterSurface, selection.waterSurface)
})

test('water stays disabled by default for off-road terrain', () => {
  const selection = selectTerrain('?terrain=offroad')

  assert.equal(selection.generationConfig.waterEnabled, false)
  assert.equal(selection.waterSurface, null)
})

function readTerrainSamples(selection) {
  return SAMPLE_POSITIONS.map(({ xMeters, zMeters }) => {
    const surface = selection.surfaceProfile.querySurfaceAtWorldPosition(xMeters, zMeters)
    return {
      heightMeters: surface.terrainHeightMeters,
      surfaceKind: surface.surfaceKind,
      normalWorld: {
        x: surface.normalWorld.x,
        y: surface.normalWorld.y,
        z: surface.normalWorld.z,
      },
    }
  })
}

function readObstacleSamples(selection) {
  return selection.obstacleField.getObstacles().map((obstacle) => ({
    id: obstacle.id,
    xMeters: obstacle.position.x,
    zMeters: obstacle.position.z,
  }))
}

function createSimulationForSearch(search, terrainSelectionConfig) {
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { search },
  })
  try {
    return createSimulation({
      scene: new THREE.Scene(),
      terrainSelectionConfig,
    })
  } finally {
    if (originalLocation) {
      Object.defineProperty(globalThis, 'location', originalLocation)
    } else {
      delete globalThis.location
    }
  }
}
function selectTerrain(search, config = {}) {
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { search },
  })
  try {
    return createTerrainSelection(config)
  } finally {
    if (originalLocation) {
      Object.defineProperty(globalThis, 'location', originalLocation)
    } else {
      delete globalThis.location
    }
  }
}