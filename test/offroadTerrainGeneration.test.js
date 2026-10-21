import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import { createSimulation } from '../src/createSimulation.js'
import { createOffroadTerrainGenerationConfig } from '../src/terrain/createOffroadTerrainGenerationConfig.js'
import { createTerrainSelection } from '../src/terrain/createTerrainSelection.js'
import {
  createOffroadPlaygroundProfile,
  ROCK_GARDEN_BAND_EAST_EDGE_OFFSET_METERS,
  ROCK_GARDEN_BAND_FEATHER_METERS,
  ROCK_GARDEN_BAND_NORTH_EDGE_OFFSET_METERS,
  ROCK_GARDEN_BAND_SOUTH_EDGE_OFFSET_METERS,
  ROCK_GARDEN_BAND_WEST_EDGE_OFFSET_METERS,
  START_RAMP_FEATHER_METERS,
  START_RAMP_ZONE_METERS,
} from '../src/terrain/createEnhancedTerrainSurfaceProfile.js'

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

test('the obstacle visuals are added to the scene', () => {
  const simulation = createSimulationForSearch('?terrain=offroad')

  assert.ok(simulation.obstacleVisuals)
  assert.ok(simulation.obstacleVisuals.group)
  assert.ok(
    simulation.scene.children.includes(simulation.obstacleVisuals.group),
    'the obstacle group is missing from the scene'
  )
  assert.equal(simulation.obstacleVisuals.meshes.length, 8)
})

test('the terrain mesh carries the terrain only while the contact query keeps the obstacles', () => {
  const simulation = createSimulationForSearch('?terrain=offroad')
  const positions = simulation.terrain.geometry.getAttribute('position')
  const baseProfile = simulation.terrainSelection.baseProfile
  let maximumMeshDeviationMeters = 0

  for (let index = 0; index < positions.count; index += 1) {
    const xMeters = positions.getX(index)
    const zMeters = positions.getZ(index)
    maximumMeshDeviationMeters = Math.max(
      maximumMeshDeviationMeters,
      Math.abs(
        positions.getY(index) - baseProfile.getHeightAtWorldXZ(xMeters, zMeters)
      )
    )
  }

  // The mesh stores its vertex positions as float32, so the rendered
  // height is the float32 rounding of the profile height. A height of up to
  // 4 m rounds within 2.4e-7 m, so 1e-6 m is the storage noise floor.
  assert.ok(
    maximumMeshDeviationMeters <= 1e-6,
    'the terrain mesh does not match the terrain-only profile: ' +
      maximumMeshDeviationMeters +
      ' m'
  )

  const obstacle = simulation.terrainSelection.obstacleField
    .getObstacles()
    .find((candidate) => candidate.id === 'rock-dome-1')
  const xMeters = obstacle.initialCenterXMeters
  const zMeters = obstacle.initialCenterZMeters
  const contactSample = simulation.terrainContactQuery.queryAtWorldXZ(xMeters, zMeters)
  const groundHeightMeters = baseProfile.getHeightAtWorldXZ(xMeters, zMeters)

  assert.ok(
    contactSample.terrainHeightMeters > groundHeightMeters,
    'the contact query no longer reports the obstacle top'
  )
  assert.equal(contactSample.obstacleId, 'rock-dome-1')
})

test('the proving ground mesh is unchanged by the obstacle rendering', () => {
  const simulation = createSimulationForSearch('?terrain=proving-ground')
  const positions = simulation.terrain.geometry.getAttribute('position')
  const surfaceProfile = simulation.terrainSurfaceProfile
  let maximumMeshDeviationMeters = 0

  for (let index = 0; index < positions.count; index += 1) {
    const xMeters = positions.getX(index)
    const zMeters = positions.getZ(index)
    maximumMeshDeviationMeters = Math.max(
      maximumMeshDeviationMeters,
      Math.abs(
        positions.getY(index) - surfaceProfile.getHeightAtWorldXZ(xMeters, zMeters)
      )
    )
  }

  assert.ok(
    maximumMeshDeviationMeters <= 1e-6,
    'the proving ground mesh changed: ' + maximumMeshDeviationMeters + ' m'
  )
  assert.equal(simulation.obstacleVisuals, null)
  assert.equal(simulation.terrain.userData.terrain.renderSubdivisions, 256)
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

test('the 400 m rock garden reference heights match the bounded band', () => {
  // The garden is a bounded band now, and the band mask holds its full
  // strength across the band instead of ramping up from the south and
  // west edges of it. The start ramp is bounded to its own 30 m zone at
  // the south course edge, so it no longer adds a sine wave to these
  // samples either: the pinned heights are the base terrain plus the
  // garden contribution only.
  const selection = selectTerrain('?terrain=offroad')
  const samples = [
    { xMeters: -120, zMeters: -80, heightMeters: -0.0037536279781548994 },
    { xMeters: -50, zMeters: -60, heightMeters: 0.1003569995452813 },
    { xMeters: 0, zMeters: -30, heightMeters: -0.19715301900765128 },
    { xMeters: 5, zMeters: -95, heightMeters: -0.05246295766492116 },
    { xMeters: -30, zMeters: -10, heightMeters: 0.051318235723404534 },
  ]

  for (const sample of samples) {
    assert.equal(
      selection.baseProfile.getHeightAtWorldXZ(sample.xMeters, sample.zMeters),
      sample.heightMeters
    )
  }
})

test('the start ramp stays inside its own zone and does not ripple across the course', () => {
  // The start ramp is a spawn incline at the south course edge. The sine
  // wave that shapes it must fade out at the end of the ramp zone; before
  // the fix the zone mask stayed at full strength for every z north of the
  // ramp, so the whole course carried the sine.
  const selection = selectTerrain('?terrain=offroad')
  const { sizeMeters, featureScale } = selection.generationConfig
  const courseScale = featureScale * (sizeMeters / 400)
  const halfSizeMeters = sizeMeters * 0.5
  const rampStartMeters = -halfSizeMeters
  const rampEndMeters = -halfSizeMeters + START_RAMP_ZONE_METERS * courseScale
  const rampFeatherMeters = START_RAMP_FEATHER_METERS * courseScale

  assert.ok(rampFeatherMeters > 0, 'the start ramp has no fade at its edges')
  assert.ok(
    rampFeatherMeters * 2 < START_RAMP_ZONE_METERS * courseScale,
    'the start ramp fades overlap each other'
  )

  // The start ramp and the three jumps are the only features that scale
  // with jumpScale. The sampled x position is clear of the three jump
  // footprints, so the difference between the two profiles is the start
  // ramp contribution alone.
  const withJumps = createOffroadPlaygroundProfile({ jumpScale: 1 })
  const withoutJumps = createOffroadPlaygroundProfile({ jumpScale: 0 })
  const startRampContribution = (zMeters) =>
    withJumps.getHeightAtWorldXZ(25, zMeters) - withoutJumps.getHeightAtWorldXZ(25, zMeters)

  const midRampMeters = startRampContribution(rampStartMeters + 15 * courseScale)
  assert.ok(
    midRampMeters > 0.1,
    'the start ramp does not raise the ground inside its zone, got ' + midRampMeters
  )
  assert.ok(
    Math.abs(startRampContribution(rampStartMeters)) < 0.01,
    'the start ramp does not fade in at the spawn edge, got ' +
      startRampContribution(rampStartMeters)
  )
  assert.equal(
    startRampContribution(0),
    0,
    'the start ramp still reaches past the ramp zone at z = 0'
  )
  assert.equal(
    startRampContribution(100),
    0,
    'the start ramp still reaches the north half of the course at z = 100'
  )

  for (let zMeters = rampEndMeters; zMeters <= 150; zMeters += 1) {
    assert.equal(
      startRampContribution(zMeters),
      0,
      'the start ramp still reaches z = ' + zMeters
    )
  }
})

test('the step-up jump ends on a short steep ramp instead of a vertical wall', () => {
  // The step-up jump used to stop with a hard cut at its trailing edge, so
  // the course carried a 0.8 m vertical wall that the contact query could
  // not resolve. The trailing edge now falls back to the base height over
  // a 1 m span, and the leading edge is still a smooth ramp.
  const selection = selectTerrain('?terrain=offroad')
  const { sizeMeters, featureScale } = selection.generationConfig
  const courseScale = featureScale * (sizeMeters / 400)
  const halfSizeMeters = sizeMeters * 0.5
  // The step-up jump is centred 180 m north of the south course edge and is
  // 12 m long, so it spans z = -26 m to z = -14 m on the 400 m course.
  const jumpCenterZMeters = -halfSizeMeters + 180 * courseScale
  const jumpHalfLengthMeters = 6 * courseScale
  const leadingEdgeZMeters = jumpCenterZMeters - jumpHalfLengthMeters
  const wallZMeters = jumpCenterZMeters + jumpHalfLengthMeters
  const trailingEdgeZMeters = jumpCenterZMeters + jumpHalfLengthMeters * (5 / 6)

  // The step-up jump and the start ramp are the only features that scale
  // with jumpScale, and the start ramp is bounded to its own zone at the
  // south edge, so the difference between the two profiles is the jump
  // contribution.
  const withJumps = createOffroadPlaygroundProfile({ jumpScale: 1 })
  const withoutJumps = createOffroadPlaygroundProfile({ jumpScale: 0 })
  const stepUpHeight = (zMeters) =>
    withJumps.getHeightAtWorldXZ(0, zMeters) - withoutJumps.getHeightAtWorldXZ(0, zMeters)

  const trailingDeltaMeters = Math.abs(
    stepUpHeight(trailingEdgeZMeters) - stepUpHeight(wallZMeters)
  )
  assert.ok(
    trailingDeltaMeters < 0.1,
    'the step-up jump still steps down at its trailing edge, got ' + trailingDeltaMeters
  )

  const wallDeltaMeters = Math.abs(
    stepUpHeight(wallZMeters) - stepUpHeight(wallZMeters + 0.1)
  )
  assert.ok(
    wallDeltaMeters < 0.1,
    'the step-up jump still ends on a wall, got ' + wallDeltaMeters
  )

  const leadingDeltaMeters = Math.abs(
    stepUpHeight(leadingEdgeZMeters) - stepUpHeight(leadingEdgeZMeters + 1)
  )
  assert.ok(
    leadingDeltaMeters < 0.1,
    'the step-up jump no longer ramps in at its leading edge, got ' + leadingDeltaMeters
  )
  assert.ok(
    stepUpHeight(leadingEdgeZMeters + 1) > 0,
    'the step-up jump does not rise out of the ground'
  )

  let maximumHeightMeters = 0
  let maximumStepMeters = 0
  let previousHeightMeters = stepUpHeight(leadingEdgeZMeters - 0.5)
  for (let zMeters = leadingEdgeZMeters - 0.5; zMeters <= wallZMeters + 1; zMeters += 0.01) {
    const heightMeters = stepUpHeight(zMeters)
    maximumHeightMeters = Math.max(maximumHeightMeters, heightMeters)
    maximumStepMeters = Math.max(
      maximumStepMeters,
      Math.abs(heightMeters - previousHeightMeters)
    )
    previousHeightMeters = heightMeters
  }
  assert.ok(
    maximumHeightMeters > 0.79,
    'the step-up jump lost its crest, got ' + maximumHeightMeters
  )
  assert.ok(
    maximumStepMeters < 0.02,
    'the step-up jump is not continuous, the largest step over 1 cm is ' + maximumStepMeters
  )
})

test('the gap jump is two smooth ramps with a gap instead of a walled slot', () => {
  // The gap jump used to be a plateau with a rectangular slot cut into it,
  // which put a 1 m wall at each outer edge and a 0.75 m wall at each side
  // of the slot, and a 0.6 m step at the sides of the jump. It is now the
  // shape its comment describes: a takeoff lip, a dip back down to the
  // base height, and a landing lip, with every edge a ramp.
  const selection = selectTerrain('?terrain=offroad')
  const { sizeMeters, featureScale } = selection.generationConfig
  const courseScale = featureScale * (sizeMeters / 400)
  const halfSizeMeters = sizeMeters * 0.5
  // The gap jump is centred 240 m north of the south course edge, is 10 m
  // long, and is 20 m wide, so it spans z = 35 m to z = 45 m on the
  // 400 m course.
  const jumpCenterZMeters = -halfSizeMeters + 240 * courseScale
  const jumpHalfLengthMeters = 5 * courseScale
  const jumpHalfWidthMeters = 10 * courseScale
  const lipZMeters = jumpCenterZMeters - jumpHalfLengthMeters * 0.5

  // The gap jump and the start ramp are the only features that scale with
  // jumpScale, and the start ramp is bounded to its own zone at the south
  // edge, so the difference between the two profiles is the jump
  // contribution.
  const withJumps = createOffroadPlaygroundProfile({ jumpScale: 1 })
  const withoutJumps = createOffroadPlaygroundProfile({ jumpScale: 0 })
  const gapJumpHeight = (xMeters, zMeters) =>
    withJumps.getHeightAtWorldXZ(xMeters, zMeters) -
    withoutJumps.getHeightAtWorldXZ(xMeters, zMeters)

  // The height field the vehicle drives on stays continuous across the jump.
  const coarseZMeters = [30, 35, 40, 45, 50]
  for (let index = 1; index < coarseZMeters.length; index += 1) {
    const deltaMeters = Math.abs(
      withJumps.getHeightAtWorldXZ(0, coarseZMeters[index]) -
        withJumps.getHeightAtWorldXZ(0, coarseZMeters[index - 1])
    )
    assert.ok(
      deltaMeters <= 0.15,
      'the gap jump steps by ' + deltaMeters + ' m between z = ' +
        coarseZMeters[index - 1] + ' m and z = ' + coarseZMeters[index] + ' m'
    )
  }

  const coarseXMeters = [-10, 0, 10]
  for (let index = 1; index < coarseXMeters.length; index += 1) {
    const deltaMeters = Math.abs(
      withJumps.getHeightAtWorldXZ(coarseXMeters[index], 40) -
        withJumps.getHeightAtWorldXZ(coarseXMeters[index - 1], 40)
    )
    assert.ok(
      deltaMeters <= 0.15,
      'the gap jump steps by ' + deltaMeters + ' m across x at z = 40 m'
    )
  }

  // The jump itself is continuous at a 5 cm resolution, in both the driving
  // direction and across the jump.
  let maximumZStepMeters = 0
  let previousHeightMeters = gapJumpHeight(0, 30)
  for (let zMeters = 30; zMeters <= 50; zMeters += 0.05) {
    const heightMeters = gapJumpHeight(0, zMeters)
    maximumZStepMeters = Math.max(
      maximumZStepMeters,
      Math.abs(heightMeters - previousHeightMeters)
    )
    previousHeightMeters = heightMeters
  }
  assert.ok(
    maximumZStepMeters < 0.05,
    'the gap jump is not continuous along z, the largest step over 5 cm is ' +
      maximumZStepMeters
  )

  let maximumXStepMeters = 0
  previousHeightMeters = gapJumpHeight(-12, lipZMeters)
  for (let xMeters = -12; xMeters <= 12; xMeters += 0.05) {
    const heightMeters = gapJumpHeight(xMeters, lipZMeters)
    maximumXStepMeters = Math.max(
      maximumXStepMeters,
      Math.abs(heightMeters - previousHeightMeters)
    )
    previousHeightMeters = heightMeters
  }
  assert.ok(
    maximumXStepMeters < 0.05,
    'the gap jump is not continuous across x, the largest step over 5 cm is ' +
      maximumXStepMeters
  )

  // The jump is still a visible feature: a 1 m takeoff lip, a gap down to
  // the base height, and a 1 m landing lip.
  assert.ok(
    gapJumpHeight(0, lipZMeters) > 0.9,
    'the gap jump lost its takeoff lip, got ' + gapJumpHeight(0, lipZMeters)
  )
  assert.equal(
    gapJumpHeight(0, jumpCenterZMeters),
    0,
    'the gap between the two lips is not at the base height'
  )
  assert.ok(
    gapJumpHeight(0, jumpCenterZMeters + jumpHalfLengthMeters * 0.5) > 0.9,
    'the gap jump lost its landing lip'
  )
  let maximumHeightMeters = 0
  for (let zMeters = jumpCenterZMeters - jumpHalfLengthMeters; zMeters <= jumpCenterZMeters + jumpHalfLengthMeters; zMeters += 0.05) {
    maximumHeightMeters = Math.max(maximumHeightMeters, gapJumpHeight(0, zMeters))
  }
  assert.ok(
    maximumHeightMeters > 0.3,
    'the gap jump does not raise the ground, got ' + maximumHeightMeters
  )
  assert.ok(
    jumpHalfWidthMeters > 0 && jumpHalfLengthMeters > 0,
    'the gap jump has no extent'
  )
})

test('the rock garden contributes per-position height variation', () => {
  // The difference between the garden and the same course with the rock
  // garden scaled out is exactly the rock garden contribution.
  const withGarden = createOffroadPlaygroundProfile({ rockGardenScale: 1 })
  const withoutGarden = createOffroadPlaygroundProfile({ rockGardenScale: 0 })
  const contributions = []

  for (let zMeters = -95; zMeters <= -5; zMeters += 5) {
    for (let xMeters = -180; xMeters <= 0; xMeters += 5) {
      contributions.push(
        withGarden.getHeightAtWorldXZ(xMeters, zMeters) -
          withoutGarden.getHeightAtWorldXZ(xMeters, zMeters)
      )
    }
  }

  const minimumContributionMeters = Math.min(...contributions)
  const maximumContributionMeters = Math.max(...contributions)

  assert.ok(
    maximumContributionMeters > 0.1,
    'the rock garden does not raise the ground, got ' + maximumContributionMeters
  )
  assert.ok(
    maximumContributionMeters - minimumContributionMeters > 0.1,
    'the rock garden contribution does not vary per position, got ' +
      (maximumContributionMeters - minimumContributionMeters)
  )
  assert.ok(
    minimumContributionMeters >= 0,
    'the rock garden lowers the ground, got ' + minimumContributionMeters
  )
})

test('the rock garden is bounded to a discrete band', () => {
  // The garden mask used to fade in from the south and west and never fade
  // out again, so the garden covered the sand, dirt, and grass regions of
  // the course at full strength. The garden is now a bounded band: full
  // strength inside it and nothing outside it.
  const selection = selectTerrain('?terrain=offroad')
  const band = readRockGardenBand(selection)
  const contribution = createRockGardenContributionReader()

  const bandMaximumMeters = readMaximumRockGardenContribution(
    contribution,
    band.westEdgeMeters + band.featherMeters,
    band.eastEdgeMeters - band.featherMeters,
    band.southEdgeMeters + band.featherMeters,
    band.northEdgeMeters - band.featherMeters
  ).maximumMeters
  assert.ok(
    bandMaximumMeters > 0.15,
    'the bounded band does not raise the ground, got ' + bandMaximumMeters
  )

  // Just outside each of the four band edges the garden contributes nothing.
  const outsideStrips = [
    {
      name: 'south',
      minXMeters: band.westEdgeMeters,
      maxXMeters: band.eastEdgeMeters,
      minZMeters: band.southEdgeMeters - 10,
      maxZMeters: band.southEdgeMeters - 1,
    },
    {
      name: 'north',
      minXMeters: band.westEdgeMeters,
      maxXMeters: band.eastEdgeMeters,
      minZMeters: band.northEdgeMeters + 1,
      maxZMeters: band.northEdgeMeters + 10,
    },
    {
      name: 'west',
      minXMeters: band.westEdgeMeters - 10,
      maxXMeters: band.westEdgeMeters - 1,
      minZMeters: band.southEdgeMeters,
      maxZMeters: band.northEdgeMeters,
    },
    {
      name: 'east',
      minXMeters: band.eastEdgeMeters + 1,
      maxXMeters: band.eastEdgeMeters + 10,
      minZMeters: band.southEdgeMeters,
      maxZMeters: band.northEdgeMeters,
    },
  ]

  for (const strip of outsideStrips) {
    const stripMaximumMeters = readMaximumRockGardenContribution(
      contribution,
      strip.minXMeters,
      strip.maxXMeters,
      strip.minZMeters,
      strip.maxZMeters
    ).maximumMeters
    assert.ok(
      stripMaximumMeters <= 0.05 * bandMaximumMeters,
      'the garden still reaches the ' + strip.name + ' of the band, got ' +
        stripMaximumMeters
    )
  }

  // Far outside the band the garden contributes exactly nothing.
  for (const position of [
    { xMeters: -90, zMeters: 150 },
    { xMeters: 150, zMeters: -50 },
    { xMeters: 150, zMeters: 150 },
  ]) {
    assert.equal(
      contribution(position.xMeters, position.zMeters),
      0,
      'the garden reaches ' + JSON.stringify(position)
    )
  }
})

test('the rock garden holds full strength across the band', () => {
  // The unbounded mask ramped up over the whole band from the south and
  // west edges, so the garden sat at a few percent of its strength in the
  // western and southern parts of the band. The bounded mask holds its
  // full strength across the band and ramps over the feather at the edges
  // only.
  const selection = selectTerrain('?terrain=offroad')
  const band = readRockGardenBand(selection)
  const contribution = createRockGardenContributionReader()
  const bandMaximumMeters = readMaximumRockGardenContribution(
    contribution,
    band.westEdgeMeters + band.featherMeters,
    band.eastEdgeMeters - band.featherMeters,
    band.southEdgeMeters + band.featherMeters,
    band.northEdgeMeters - band.featherMeters
  ).maximumMeters
  const westernStripMaximumMeters = readMaximumRockGardenContribution(
    contribution,
    band.westEdgeMeters + band.featherMeters,
    band.westEdgeMeters + band.featherMeters + 30,
    band.southEdgeMeters + band.featherMeters,
    band.northEdgeMeters - band.featherMeters
  ).maximumMeters
  const southernStripMaximumMeters = readMaximumRockGardenContribution(
    contribution,
    band.westEdgeMeters + band.featherMeters,
    band.eastEdgeMeters - band.featherMeters,
    band.southEdgeMeters + band.featherMeters,
    band.southEdgeMeters + band.featherMeters + 20
  ).maximumMeters
  const centreWindowMaximumMeters = readMaximumRockGardenContribution(
    contribution,
    (band.westEdgeMeters + band.eastEdgeMeters) / 2 - 5,
    (band.westEdgeMeters + band.eastEdgeMeters) / 2 + 5,
    (band.southEdgeMeters + band.northEdgeMeters) / 2 - 5,
    (band.southEdgeMeters + band.northEdgeMeters) / 2 + 5
  ).maximumMeters

  assert.ok(
    westernStripMaximumMeters >= 0.75 * bandMaximumMeters,
    'the garden fades out towards the west of the band, got ' +
      westernStripMaximumMeters
  )
  assert.ok(
    southernStripMaximumMeters >= 0.75 * bandMaximumMeters,
    'the garden fades out towards the south of the band, got ' +
      southernStripMaximumMeters
  )
  assert.ok(
    centreWindowMaximumMeters >= 0.25 * bandMaximumMeters,
    'the band centre does not carry a bump field, got ' +
      centreWindowMaximumMeters
  )

  // The strongest bump of the whole course lies inside the band.
  const courseMaximum = readMaximumRockGardenContribution(
    contribution,
    -200,
    200,
    -200,
    200,
    2
  )
  assert.ok(
    courseMaximum.maximumPosition.xMeters >= band.westEdgeMeters &&
      courseMaximum.maximumPosition.xMeters <= band.eastEdgeMeters &&
      courseMaximum.maximumPosition.zMeters >= band.southEdgeMeters &&
      courseMaximum.maximumPosition.zMeters <= band.northEdgeMeters,
    'the strongest bump is outside the band at ' +
      JSON.stringify(courseMaximum.maximumPosition)
  )
})

test('the rock garden band stays inside a bounded course footprint', () => {
  // The band is the rock band of the course: the z extent of the rock
  // surface region and the western half of the course at that band.
  // These rails keep a later change from widening the garden back into a
  // course wide feature.
  const selection = selectTerrain('?terrain=offroad')
  const band = readRockGardenBand(selection)
  const zExtentMeters = band.northEdgeMeters - band.southEdgeMeters
  const xExtentMeters = band.eastEdgeMeters - band.westEdgeMeters

  assert.ok(
    zExtentMeters <= 150,
    'the rock garden band is longer than 150 m in z, got ' + zExtentMeters
  )
  assert.ok(
    xExtentMeters <= 200,
    'the rock garden band is wider than 200 m in x, got ' + xExtentMeters
  )
  assert.ok(
    zExtentMeters >= 60,
    'the rock garden band is shorter than 60 m in z, got ' + zExtentMeters
  )
  assert.ok(
    xExtentMeters >= 80,
    'the rock garden band is narrower than 80 m in x, got ' + xExtentMeters
  )
})

test('the rock garden band scales with the course', () => {
  // The band is expressed in course-scaled metres, so a resized course has
  // a proportionally larger band instead of the 400 m band with empty
  // space around it.
  const selection = selectTerrain('?terrain=offroad&terrainSizeMeters=800')
  const band = readRockGardenBand(selection)

  assert.equal(band.westEdgeMeters, -380)
  assert.equal(band.eastEdgeMeters, 20)
  assert.equal(band.southEdgeMeters, -200)
  assert.equal(band.northEdgeMeters, 0)
  assert.equal(band.featherMeters, 20)

  // The 800 m course has a garden where the 400 m course has none,
  // because the band grew with the course.
  const contribution = createRockGardenContributionReader({ sizeMeters: 800 })
  const scaledWesternStripMaximumMeters = readMaximumRockGardenContribution(
    contribution,
    -370,
    -350,
    -100,
    -60
  ).maximumMeters
  assert.ok(
    scaledWesternStripMaximumMeters > 0.1,
    'the 800 m course has no rock garden in the scaled band, got ' +
      scaledWesternStripMaximumMeters
  )
  const outsideStripMaximumMeters = readMaximumRockGardenContribution(
    contribution,
    -390,
    -381,
    -100,
    -60
  ).maximumMeters
  assert.equal(outsideStripMaximumMeters, 0)
})

test('the 800 m course scales the rock garden heights proportionally', () => {
  // A resized course is a proportionally larger course, so the height at
  // twice the coordinate of the 400 m course is twice the height. The rock
  // garden contributes an exactly proportional bump field: the cell size and
  // the bump radii scale with the course and the amplitude is scaled at the
  // call site, so the bump heights and their footprint both double.
  //
  // Tolerance justification: the only term of the off-road height field
  // that is deliberately not scaled is the terrain noise, which is a
  // position-based material property rather than a course feature. Its
  // amplitude is bounded by 1.875 * roughnessMeters = 0.09375 m, so it
  // contributes at most 0.28125 m to the difference (0.09375 m for the
  // scaled course plus twice 0.09375 m for the doubled reference). The
  // measured maximum over the 861 rock-garden sample points below is
  // 0.190936 m, and the 0.3 m tolerance sits above both that measurement
  // and the analytic bound.
  const reference = selectTerrain('?terrain=offroad')
  const scaled = selectTerrain('?terrain=offroad&terrainSizeMeters=800')
  let maximumDeviationMeters = 0

  for (let zMeters = -100; zMeters <= 0; zMeters += 5) {
    for (let xMeters = -190; xMeters <= 10; xMeters += 5) {
      const referenceHeightMeters = reference.baseProfile.getHeightAtWorldXZ(
        xMeters,
        zMeters
      )
      const scaledHeightMeters = scaled.baseProfile.getHeightAtWorldXZ(
        2 * xMeters,
        2 * zMeters
      )
      maximumDeviationMeters = Math.max(
        maximumDeviationMeters,
        Math.abs(scaledHeightMeters - 2 * referenceHeightMeters)
      )
    }
  }

  assert.ok(
    maximumDeviationMeters <= 0.3,
    'scaled rock garden deviation ' +
      maximumDeviationMeters +
      ' m exceeds the 0.3 m tolerance'
  )
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

test('the off-road course has no tarmac outside the start strip', () => {
  // The off-road region layout is a route across the course, not a tiling of
  // it, so the ground beside the route belongs to no region. That ground must
  // read as generic off-road ground, not as the proving-ground tarmac that
  // the base profile defaults to.
  const selection = selectTerrain('?terrain=offroad')
  const { sizeMeters, featureScale } = selection.generationConfig
  const courseScale = featureScale * (sizeMeters / 400)
  const halfSizeMeters = sizeMeters * 0.5
  const startStripEndZMeters = -halfSizeMeters + 40 * courseScale
  const tarmacSamples = []

  for (let zMeters = -halfSizeMeters + 1; zMeters <= halfSizeMeters - 1; zMeters += 4) {
    for (let xMeters = -halfSizeMeters + 1; xMeters <= halfSizeMeters - 1; xMeters += 4) {
      if (zMeters <= startStripEndZMeters) continue
      const surface = selection.surfaceProfile.querySurfaceAtWorldPosition(
        xMeters,
        zMeters
      )
      if (surface.surfaceKind === 'asphalt') {
        tarmacSamples.push({ xMeters, zMeters })
      }
    }
  }

  assert.deepEqual(
    tarmacSamples,
    [],
    'tarmac outside the start strip at ' + JSON.stringify(tarmacSamples.slice(0, 5))
  )
  assert.equal(selection.baseProfile.surfaceKind, 'dirt')
})

test('the mud pit keeps the width it declares', () => {
  // The mud pit spans the centre of the course and overlaps the rock band on
  // its left and the grass band on its right. The first matching region
  // wins, so the pit has to be listed before both bands to keep the
  // symmetric width it declares.
  const selection = selectTerrain('?terrain=offroad')

  for (const xMeters of [-14, -12, -10, 0, 10, 12, 14]) {
    const surface = selection.surfaceProfile.querySurfaceAtWorldPosition(
      xMeters,
      -80
    )
    assert.equal(
      surface.surfaceKind,
      'mud',
      'expected mud at x=' + xMeters + ', got ' + surface.surfaceKind
    )
  }

  const rockBand = selection.surfaceProfile.querySurfaceAtWorldPosition(-20, -80)
  assert.equal(rockBand.surfaceKind, 'rock')
  const grassBand = selection.surfaceProfile.querySurfaceAtWorldPosition(20, -80)
  assert.equal(grassBand.surfaceKind, 'grass')
})

function readRockGardenBand(selection) {
  const { sizeMeters, featureScale } = selection.generationConfig
  const courseScale = featureScale * (sizeMeters / 400)
  const halfSizeMeters = sizeMeters * 0.5
  return {
    westEdgeMeters:
      -halfSizeMeters +
      ROCK_GARDEN_BAND_WEST_EDGE_OFFSET_METERS * courseScale,
    eastEdgeMeters:
      ROCK_GARDEN_BAND_EAST_EDGE_OFFSET_METERS * courseScale,
    southEdgeMeters:
      -halfSizeMeters +
      ROCK_GARDEN_BAND_SOUTH_EDGE_OFFSET_METERS * courseScale,
    northEdgeMeters:
      -halfSizeMeters +
      ROCK_GARDEN_BAND_NORTH_EDGE_OFFSET_METERS * courseScale,
    featherMeters: ROCK_GARDEN_BAND_FEATHER_METERS * courseScale,
  }
}

function createRockGardenContributionReader(config = {}) {
  // The difference between the garden and the same course with the rock
  // garden scaled out is exactly the rock garden contribution.
  const withGarden = createOffroadPlaygroundProfile({ ...config, rockGardenScale: 1 })
  const withoutGarden = createOffroadPlaygroundProfile({ ...config, rockGardenScale: 0 })
  return (xMeters, zMeters) =>
    withGarden.getHeightAtWorldXZ(xMeters, zMeters) -
    withoutGarden.getHeightAtWorldXZ(xMeters, zMeters)
}

function readMaximumRockGardenContribution(
  contribution,
  minXMeters,
  maxXMeters,
  minZMeters,
  maxZMeters,
  stepMeters = 1
) {
  let maximumMeters = -Infinity
  let maximumPosition = { xMeters: minXMeters, zMeters: minZMeters }
  for (let zMeters = minZMeters; zMeters <= maxZMeters; zMeters += stepMeters) {
    for (let xMeters = minXMeters; xMeters <= maxXMeters; xMeters += stepMeters) {
      const contributionMeters = contribution(xMeters, zMeters)
      if (contributionMeters > maximumMeters) {
        maximumMeters = contributionMeters
        maximumPosition = { xMeters, zMeters }
      }
    }
  }
  return { maximumMeters, maximumPosition }
}

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