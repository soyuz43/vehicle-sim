import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { createSimulation } from '../src/createSimulation.js'
import { runSimulationFrame } from '../src/runSimulationFrame.js'
import { createTerrainDeformation } from '../src/terrain/deformation/createTerrainDeformation.js'

function createTestSimulationDeps(overrides = {}) {
  return {
    scene: new THREE.Scene(),
    keyState: {
      forward: false,
      backward: false,
      left: false,
      right: false,
      handbrake: false,
    },
    ...overrides,
  }
}

function createSimulationForTerrain(terrainName, overrides = {}) {
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    enumerable: locationDescriptor?.enumerable ?? false,
    writable: true,
    value: { search: '?terrain=' + terrainName },
  })
  try {
    return createSimulation(createTestSimulationDeps(overrides))
  } finally {
    if (locationDescriptor) {
      Object.defineProperty(globalThis, 'location', locationDescriptor)
    } else {
      delete globalThis.location
    }
  }
}

test('createSimulation assembles without throwing', () => {
  const simulation = createSimulation(createTestSimulationDeps())

  assert.ok(simulation.vehicleController)
  assert.ok(simulation.fixedSimulationRunner)
  assert.ok(simulation.terrainDeformation)
  assert.ok(simulation.car)
})

test('one simulation frame steps without throwing', () => {
  const simulation = createSimulation(createTestSimulationDeps())

  assert.doesNotThrow(() => runSimulationFrame(simulation, 1 / 60))
  assert.ok(Number.isFinite(simulation.vehicleController.getSnapshot().speedMetersPerSecond))
})

test('obstacle interaction is stepped with a populated snapshot', () => {
  const stepCalls = []
  const simulation = createSimulationForTerrain('offroad', {
    createVehicleObstacleInteraction: () => ({
      step: (...args) => stepCalls.push(args),
    }),
  })

  runSimulationFrame(simulation, 1 / 60)

  assert.ok(stepCalls.length > 0)
  const snapshots = stepCalls
    .map(([, snapshot]) => snapshot)
    .filter((snapshot) => Array.isArray(snapshot?.wheelStates) && snapshot.wheelStates.length > 0)
  assert.ok(snapshots.length > 0)
  assert.ok(snapshots.some((snapshot) =>
    snapshot.wheelStates.every((wheelState) => wheelState.contactPointWorldPosition !== undefined)
  ))
})

test('terrain deformation accrues from wheel contacts', () => {
  const updateCalls = []
  const simulation = createSimulationForTerrain('offroad', {
    createTerrainDeformation: () => {
      const deformation = createTerrainDeformation()
      const update = deformation.update
      deformation.update = (...args) => {
        updateCalls.push(args)
        return update(...args)
      }
      return deformation
    },
  })

  runSimulationFrame(simulation, 1 / 60)

  assert.ok(updateCalls.length > 0)
  assert.ok(updateCalls.some(([, wheelStates]) => Array.isArray(wheelStates) && wheelStates.length > 0))
})
