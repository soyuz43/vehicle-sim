// test/sessionCombinedApply.test.js

// The combined terrain and vehicle apply.
//
// A terrain change is applied by reloading the session. The vehicle setup
// is applied and RECORDED before the terrain is committed, so the next
// session restores the recorded setup and the new terrain lands with it.
//
// The order is the whole point: committing the terrain first would reload
// the session before the vehicle setup was recorded, and the vehicle change
// would be lost.

import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import { createSimulation } from '../src/createSimulation.js'
import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { applySessionConfiguration } from '../src/vehicle/config/applySessionConfiguration.js'
import {
  VEHICLE_CONFIGURATION_STORAGE_KEY,
  resolveInitialVehicleConfiguration,
} from '../src/vehicle/config/vehicleConfigurationStorage.js'
import { createDefaultVehicleConfiguration } from '../src/vehicle/config/createVehicleConfiguration.js'

function installFakeStorage(initialEntries = {}) {
  const store = new Map(Object.entries(initialEntries))
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value))
    },
    removeItem: (key) => {
      store.delete(key)
    },
  }
  globalThis.localStorage = storage
  return { storage, store }
}

function createController() {
  const car = createCar()
  return createVehicleController({
    vehicle: car,
    startPosition: new THREE.Vector3(0, 0, 0),
  })
}

function configurationWith(slotOverrides = {}) {
  return {
    version: 1,
    slots: {
      ...createDefaultVehicleConfiguration().slots,
      ...slotOverrides,
    },
  }
}

function createSimulationDeps(overrides = {}) {
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

function withLocationSearch(search, run) {
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    enumerable: locationDescriptor?.enumerable ?? false,
    writable: true,
    value: { search },
  })
  try {
    return run()
  } finally {
    if (locationDescriptor) {
      Object.defineProperty(globalThis, 'location', locationDescriptor)
    } else {
      delete globalThis.location
    }
  }
}

test('a combined terrain and vehicle apply lands both changes after the reload', () => {
  const { storage } = installFakeStorage()
  const controller = createController()

  let committedTerrain = null
  const result = applySessionConfiguration({
    vehicleController: controller,
    vehicleConfig: configurationWith({ chassis: 'chassis-suv' }),
    lastAppliedVehicleConfig: createDefaultVehicleConfiguration(),
    terrain: 'offroad',
    runningTerrain: 'proving-ground',
    commitTerrain: (terrain) => {
      committedTerrain = terrain
    },
  })

  assert.equal(result.applied, true, 'the combined apply succeeded')
  assert.equal(result.terrainCommitted, true)
  assert.equal(committedTerrain, 'offroad', 'the terrain was committed')

  const stored = JSON.parse(storage.getItem(VEHICLE_CONFIGURATION_STORAGE_KEY))
  assert.equal(stored.slots.chassis, 'chassis-suv', 'the vehicle setup was recorded')

  // The next session: the terrain comes from the URL and the vehicle setup
  // from the store.
  const simulation = withLocationSearch('?terrain=offroad', () =>
    createSimulation(
      createSimulationDeps({
        vehicleConfiguration: resolveInitialVehicleConfiguration(),
      })
    )
  )

  assert.equal(
    simulation.terrainSelection.name,
    'offroad',
    'the new terrain is running'
  )
  assert.equal(
    simulation.vehicleController.getVehicleConfiguration().slots.chassis,
    'chassis-suv',
    'the new vehicle setup is running'
  )
})

test('the vehicle setup is recorded before the terrain is committed', () => {
  const { storage } = installFakeStorage()
  const controller = createController()

  let storedAtCommitTime = null
  applySessionConfiguration({
    vehicleController: controller,
    vehicleConfig: configurationWith({ chassis: 'chassis-suv' }),
    lastAppliedVehicleConfig: createDefaultVehicleConfiguration(),
    terrain: 'offroad',
    runningTerrain: 'proving-ground',
    commitTerrain: () => {
      storedAtCommitTime = storage.getItem(VEHICLE_CONFIGURATION_STORAGE_KEY)
    },
  })

  assert.ok(
    storedAtCommitTime,
    'the setup is recorded before the session reloads'
  )
  assert.equal(JSON.parse(storedAtCommitTime).slots.chassis, 'chassis-suv')
})

test('a failed vehicle apply does not commit the terrain', () => {
  installFakeStorage()
  const controller = createController()

  let committed = false
  const result = applySessionConfiguration({
    vehicleController: controller,
    vehicleConfig: configurationWith({ chassis: 'chassis-not-a-component' }),
    lastAppliedVehicleConfig: createDefaultVehicleConfiguration(),
    terrain: 'offroad',
    runningTerrain: 'proving-ground',
    commitTerrain: () => {
      committed = true
    },
  })

  assert.equal(result.applied, false, 'the invalid configuration was rejected')
  assert.equal(
    committed,
    false,
    'the terrain is not committed after a failed apply, so the failure is not thrown away by a reload'
  )
})

test('an unchanged terrain is not committed', () => {
  installFakeStorage()
  const controller = createController()

  let committed = false
  const result = applySessionConfiguration({
    vehicleController: controller,
    vehicleConfig: configurationWith({ chassis: 'chassis-suv' }),
    lastAppliedVehicleConfig: createDefaultVehicleConfiguration(),
    terrain: 'proving-ground',
    runningTerrain: 'proving-ground',
    commitTerrain: () => {
      committed = true
    },
  })

  assert.equal(result.applied, true)
  assert.equal(result.terrainCommitted, false)
  assert.equal(committed, false, 'the session is not reloaded for the terrain it already runs')
})
