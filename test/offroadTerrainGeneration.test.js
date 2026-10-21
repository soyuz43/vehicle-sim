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

test('the terrain render grid follows the terrain size', () => {
  const provingGround = createSimulationForSearch('?terrain=proving-ground')
  const offroad = createSimulationForSearch('?terrain=offroad')
  const resized = createSimulationForSearch('?terrain=offroad&terrainSizeMeters=500')
  const large = createSimulationForSearch('?terrain=offroad&terrainSizeMeters=1000')

  assert.equal(provingGround.terrain.userData.terrain.renderSubdivisions, 256)
  assert.equal(offroad.terrain.userData.terrain.renderSubdivisions, 320)
  assert.equal(resized.terrain.userData.terrain.renderSubdivisions, 400)
  assert.equal(large.terrain.userData.terrain.renderSubdivisions, 512)
})

test('the terrain render grid reports its sample spacing', () => {
  const simulation = createSimulationForSearch('?terrain=offroad&terrainSizeMeters=500')
  const terrain = simulation.terrain.userData.terrain

  assert.equal(
    terrain.renderSampleSpacingMeters,
    terrain.sizeMeters / terrain.renderSubdivisions
  )
  assert.equal(terrain.renderSampleSpacingMeters, 1.25)
})

test('the 400 m rock garden keeps its established heights', () => {
  const selection = selectTerrain('?terrain=offroad')
  const samples = [
    { xMeters: -120, zMeters: -80, heightMeters: 0.22795991302162763 },
    { xMeters: -50, zMeters: -60, heightMeters: 0.9684624831791371 },
    { xMeters: 0, zMeters: -30, heightMeters: -0.17785176494742969 },
    { xMeters: 5, zMeters: -95, heightMeters: 0.007689162349243821 },
    { xMeters: -30, zMeters: -10, heightMeters: 0.515691946895867 },
  ]

  for (const sample of samples) {
    assert.equal(
      selection.baseProfile.getHeightAtWorldXZ(sample.xMeters, sample.zMeters),
      sample.heightMeters
    )
  }
})

test('the rock garden currently contributes no per-position height variation', () => {
  // Known defect, asserted so that it cannot be forgotten: the rock garden
  // bump function currently returns a position-independent constant, so the
  // garden contributes no bump structure at all. The difference between the
  // garden and the same course with the rock garden scaled out is exactly
  // the rock garden contribution, and it is zero everywhere today.
  //
  // Fixing the bump function fails this test on purpose: whoever fixes it
  // has to update this assertion and the reference heights above.
  const withGarden = createOffroadPlaygroundProfile({ rockGardenScale: 1 })
  const withoutGarden = createOffroadPlaygroundProfile({ rockGardenScale: 0 })
  let maximumContributionMeters = 0

  for (let zMeters = -95; zMeters <= -5; zMeters += 5) {
    for (let xMeters = -180; xMeters <= 0; xMeters += 5) {
      const contributionMeters = Math.abs(
        withGarden.getHeightAtWorldXZ(xMeters, zMeters) -
          withoutGarden.getHeightAtWorldXZ(xMeters, zMeters)
      )
      maximumContributionMeters = Math.max(
        maximumContributionMeters,
        contributionMeters
      )
    }
  }

  assert.equal(maximumContributionMeters, 0)
})

test('obstacle dimensions scale with the course extent', () => {
  const selection = selectTerrain('?terrain=offroad&terrainSizeMeters=800')
  const obstacles = readObstacleGeometrySamples(selection)

  assert.equal(obstacles.length, 8)
  assert.equal(obstacles[0].id, 'rock-dome-1')
  assert.equal(obstacles[0].radiusMeters, 1.8)
  assert.equal(obstacles[0].xMeters, -36)
  assert.equal(obstacles[0].zMeters, 36)
  assert.equal(obstacles[4].id, 'block-1')
  assert.equal(obstacles[4].halfExtentXMeters, 1.2)
  assert.equal(obstacles[4].halfExtentZMeters, 1.2)
  assert.equal(obstacles[4].heightMeters, 1)
  assert.equal(obstacles[4].xMeters, 24)
  assert.equal(obstacles[4].zMeters, 60)
})

test('a feature scale on the 400 m course keeps the legacy dimension scaling', () => {
  const selection = selectTerrain('?terrain=offroad&featureScale=1.2')
  const obstacles = readObstacleGeometrySamples(selection)

  assert.equal(obstacles.length, 8)
  assert.equal(obstacles[0].radiusMeters, 0.9 * 1.2)
  assert.equal(obstacles[4].halfExtentXMeters, 0.6 * 1.2)
  assert.equal(obstacles[4].halfExtentZMeters, 0.6 * 1.2)
  assert.equal(obstacles[4].heightMeters, 0.5 * 1.2)
})

test('unseeded offroad keeps the legacy obstacle layout', () => {
  const selection = selectTerrain('?terrain=offroad')

  assert.deepEqual(
    readObstacleSamples(selection).map((obstacle) => [
      obstacle.xMeters,
      obstacle.zMeters,
    ]),
    [
      [-18, 18],
      [-10, 26],
      [-22, 34],
      [-6, 40],
      [12, 30],
      [16, 48],
      [4, 60],
      [-2, 70],
    ]
  )
})

test('unseeded offroad scales the legacy obstacle layout with the course size', () => {
  const selection = selectTerrain('?terrain=offroad&terrainSizeMeters=500')
  const [firstObstacle] = readObstacleSamples(selection)

  assert.equal(firstObstacle.xMeters, -22.5)
  assert.equal(firstObstacle.zMeters, 22.5)
})

test('unseeded offroad places extra obstacles on a deterministic layout', () => {
  const selection = selectTerrain('?terrain=offroad&obstacleDensity=2')
  const obstacles = readObstacleSamples(selection)

  assert.equal(obstacles.length, 16)
  assert.deepEqual(
    obstacles.slice(0, 8).map((obstacle) => [obstacle.xMeters, obstacle.zMeters]),
    [
      [-18, 18],
      [-10, 26],
      [-22, 34],
      [-6, 40],
      [12, 30],
      [16, 48],
      [4, 60],
      [-2, 70],
    ]
  )
  assert.equal(obstacles[8].xMeters, -18)
  assert.equal(obstacles[8].zMeters, 78)
  const extraPositions = obstacles
    .slice(8)
    .map((obstacle) => obstacle.xMeters + ':' + obstacle.zMeters)
  assert.equal(new Set(extraPositions).size, extraPositions.length)
})

test('repeated unseeded selections produce the same obstacle layout', () => {
  const first = selectTerrain('?terrain=offroad&obstacleDensity=2')
  const second = selectTerrain('?terrain=offroad&obstacleDensity=2')

  assert.deepEqual(readObstacleSamples(first), readObstacleSamples(second))
})

test('a seeded selection jitters the legacy layout and stays deterministic', () => {
  const seeded = selectTerrain('?terrain=offroad&seed=granite-run-04')
  const seededAgain = selectTerrain('?terrain=offroad&seed=granite-run-04')
  const unseeded = selectTerrain('?terrain=offroad')

  assert.deepEqual(readObstacleSamples(seeded), readObstacleSamples(seededAgain))
  assert.notDeepEqual(
    readObstacleSamples(seeded).map((obstacle) => [
      obstacle.xMeters,
      obstacle.zMeters,
    ]),
    readObstacleSamples(unseeded).map((obstacle) => [
      obstacle.xMeters,
      obstacle.zMeters,
    ])
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

function readObstacleGeometrySamples(selection) {
  return selection.obstacleField.getObstacles().map((obstacle) => ({
    id: obstacle.id,
    shape: obstacle.shape,
    xMeters: obstacle.initialCenterXMeters,
    zMeters: obstacle.initialCenterZMeters,
    radiusMeters: obstacle.radiusMeters,
    heightMeters: obstacle.heightMeters,
    halfExtentXMeters: obstacle.halfExtentXMeters,
    halfExtentZMeters: obstacle.halfExtentZMeters,
  }))
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