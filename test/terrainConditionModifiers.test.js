import assert from 'node:assert/strict'
import test from 'node:test'
import { createCar } from '../src/car/createCar.js'
import { createEnhancedTerrainSurfaceProfile } from '../src/terrain/createEnhancedTerrainSurfaceProfile.js'
import { createHeightfieldTerrainContactQuery } from '../src/terrain/createHeightfieldTerrainContactQuery.js'
import { createObstacleAwareSurfaceProfile } from '../src/terrain/createObstacleAwareSurfaceProfile.js'
import { createTerrainSelection } from '../src/terrain/createTerrainSelection.js'
import { createObstacleField } from '../src/terrain/obstacles/createObstacleField.js'
import { createWeatherState } from '../src/terrain/createWeatherState.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${message}: expected ${expected}, got ${actual}`)
}

test('enhanced profiles apply wet and icy modifiers to material properties', () => {
  const expectedMultipliers = {
    WET: { friction: 0.6, damping: 1.2, rollingResistance: 1.1 },
    ICY: { friction: 0.15, damping: 0.5, rollingResistance: 0.8 },
  }
  const baseProfile = createEnhancedTerrainSurfaceProfile({ profileName: 'flat' })
  const base = baseProfile.querySurfaceAtWorldPosition(0, 0)

  for (const [condition, multipliers] of Object.entries(expectedMultipliers)) {
    const profile = createEnhancedTerrainSurfaceProfile({
      profileName: 'flat',
      surfaceCondition: condition,
    })
    const surface = profile.querySurfaceAtWorldPosition(0, 0)
    const repeatedSurface = profile.querySurfaceAtWorldPosition(0, 0)

    assertClose(surface.frictionCoefficient, base.frictionCoefficient * multipliers.friction, `${condition} friction`)
    assertClose(surface.dampingCoefficient, base.dampingCoefficient * multipliers.damping, `${condition} damping`)
    assertClose(surface.rollingResistanceCoefficient, base.rollingResistanceCoefficient * multipliers.rollingResistance, `${condition} rolling resistance`)
    assert.equal(repeatedSurface.frictionCoefficient, surface.frictionCoefficient)
    assert.equal(repeatedSurface.dampingCoefficient, surface.dampingCoefficient)
    assert.equal(repeatedSurface.rollingResistanceCoefficient, surface.rollingResistanceCoefficient)
  }

  assert.equal(baseProfile.querySurfaceAtWorldPosition(0, 0).frictionCoefficient, base.frictionCoefficient)
})

test('regional conditions compose with profile conditions without accumulating', () => {
  const profile = createEnhancedTerrainSurfaceProfile({
    profileName: 'flat',
    surfaceCondition: 'WET',
    surfaceRegionConditions: [
      {
        minXMeters: -1,
        maxXMeters: 1,
        minZMeters: -1,
        maxZMeters: 1,
        condition: 'ICY',
      },
    ],
  })
  const inside = profile.querySurfaceAtWorldPosition(0, 0, {})
  const outside = profile.querySurfaceAtWorldPosition(2, 0, {})
  const insideAgain = profile.querySurfaceAtWorldPosition(0, 0, {})

  assertClose(inside.frictionCoefficient, 0.95 * 0.6 * 0.15, 'regional friction')
  assertClose(inside.dampingCoefficient, 0.02 * 1.2 * 0.5, 'regional damping')
  assertClose(inside.rollingResistanceCoefficient, 0.012 * 1.1 * 0.8, 'regional rolling resistance')
  assertClose(outside.frictionCoefficient, 0.95 * 0.6, 'profile-wide friction')
  assert.equal(insideAgain.frictionCoefficient, inside.frictionCoefficient)
})

test('weather modifies terrain and obstacle grip but not water friction', () => {
  const baseProfile = createEnhancedTerrainSurfaceProfile({ profileName: 'flat' })
  const obstacleField = createObstacleField({
    obstacles: [
      {
        id: 'rock-dome',
        shape: 'dome',
        centerXMeters: 0,
        centerZMeters: 0,
        radiusMeters: 1,
        surfaceKind: 'rock',
      },
    ],
  })
  const waterSurface = {
    getHeightAtWorldXZ(worldXMeters) {
      return worldXMeters >= 19 && worldXMeters <= 21 ? 1 : -Infinity
    },
  }
  const weatherState = createWeatherState({ initialCondition: 'rain' })
  const profile = createObstacleAwareSurfaceProfile({
    baseProfile,
    obstacleField,
    waterSurface,
    weatherState,
  })
  const terrain = profile.querySurfaceAtWorldPosition(5, 5)
  const obstacle = profile.querySurfaceAtWorldPosition(0, 0)
  const water = profile.querySurfaceAtWorldPosition(20, 0)

  assertClose(terrain.frictionCoefficient, 0.95 * 0.6, 'wet terrain friction')
  assertClose(obstacle.frictionCoefficient, 0.85 * 0.6, 'wet obstacle friction')
  assert.equal(water.surfaceKind, 'water')
  assert.equal(water.frictionCoefficient, 0.05)

  weatherState.setCondition('snow')
  assertClose(profile.querySurfaceAtWorldPosition(5, 5).frictionCoefficient, 0.95 * 0.15, 'icy terrain friction')
  assertClose(profile.querySurfaceAtWorldPosition(0, 0).frictionCoefficient, 0.85 * 0.15, 'icy obstacle friction')
  assert.equal(profile.querySurfaceAtWorldPosition(20, 0).frictionCoefficient, 0.05)

  weatherState.setCondition('clear')
  assert.equal(profile.querySurfaceAtWorldPosition(5, 5).frictionCoefficient, 0.95)
  assert.equal(profile.querySurfaceAtWorldPosition(0, 0).frictionCoefficient, 0.85)
})

test('offroad-water selection wires live weather state into contact queries', () => {
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { search: '?terrain=offroad-water' },
  })

  try {
    const selection = createTerrainSelection({
      weatherStateConfig: { initialCondition: 'clear' },
    })
    assert.strictEqual(selection.surfaceProfile.weatherState, selection.weatherState)

    let terrainContact = null
    for (let worldXMeters = -150; worldXMeters <= 150; worldXMeters += 25) {
      for (let worldZMeters = -150; worldZMeters <= 150; worldZMeters += 25) {
        const candidate = selection.surfaceProfile.querySurfaceAtWorldPosition(
          worldXMeters,
          worldZMeters
        )
        if (candidate.surfaceKind !== 'water' && candidate.frictionCoefficient > 0) {
          terrainContact = { worldXMeters, worldZMeters, frictionCoefficient: candidate.frictionCoefficient }
          break
        }
      }
      if (terrainContact) break
    }

    assert.ok(terrainContact, 'selection should expose a non-water contact surface')
    selection.weatherState.setCondition('rain')
    assertClose(
      selection.surfaceProfile.querySurfaceAtWorldPosition(
        terrainContact.worldXMeters,
        terrainContact.worldZMeters
      ).frictionCoefficient,
      terrainContact.frictionCoefficient * 0.6,
      'selection wet friction'
    )
    selection.weatherState.setCondition('snow')
    assertClose(
      selection.surfaceProfile.querySurfaceAtWorldPosition(
        terrainContact.worldXMeters,
        terrainContact.worldZMeters
      ).frictionCoefficient,
      terrainContact.frictionCoefficient * 0.15,
      'selection icy friction'
    )
  } finally {
    if (originalLocation) {
      Object.defineProperty(globalThis, 'location', originalLocation)
    } else {
      delete globalThis.location
    }
  }
})

test('conditioned contact friction reaches per-wheel traction limits', () => {
  const profile = createEnhancedTerrainSurfaceProfile({
    profileName: 'flat',
    surfaceCondition: 'WET',
  })
  const terrainContactQuery = createHeightfieldTerrainContactQuery({
    surfaceProfile: profile,
  })
  const controller = createVehicleController({
    vehicle: createCar(),
    terrainContactQuery,
  })

  controller.reset()
  for (let stepIndex = 0; stepIndex < 3; stepIndex += 1) {
    controller.update(1 / 60, {})
  }

  const groundedWheels = controller
    .getSnapshot()
    .wheelStates.filter((wheelState) => wheelState.isGrounded)
  assert.ok(groundedWheels.length > 0, 'controller should have grounded wheels')

  for (const wheelState of groundedWheels) {
    assertClose(wheelState.frictionCoefficient, 0.95 * 0.6, `${wheelState.id} wet friction`)
    assertClose(
      wheelState.tractionLimitNewtons,
      wheelState.frictionCoefficient * wheelState.normalForceNewtons,
      `${wheelState.id} traction limit`
    )
  }
})