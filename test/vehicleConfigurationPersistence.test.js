// test/vehicleConfigurationPersistence.test.js

// Vehicle configuration persistence.
//
// The terrain is carried by the session URL. The vehicle setup is carried
// by localStorage, so a reload starts from the setup the driver last
// applied instead of returning to the stock setup.
//
// A stored configuration is validated before it is used. A corrupt value or
// a value with an unknown slot id falls back to the stock setup instead of
// failing the start, and a storage failure never blocks an apply.

import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import { createSimulation } from '../src/createSimulation.js'
import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { applyVehicleConfigurationToSession } from '../src/vehicle/config/applyVehicleConfigurationToSession.js'
import {
  VEHICLE_CONFIGURATION_STORAGE_KEY,
  readStoredVehicleConfiguration,
  resolveInitialVehicleConfiguration,
  writeStoredVehicleConfiguration,
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

test('a successful apply writes the configuration to localStorage', () => {
  const { storage } = installFakeStorage()
  const controller = createController()

  const result = applyVehicleConfigurationToSession({
    vehicleController: controller,
    vehicleConfig: configurationWith({ chassis: 'chassis-suv' }),
  })

  assert.equal(result.applied, true, 'the apply succeeded')

  const stored = JSON.parse(storage.getItem(VEHICLE_CONFIGURATION_STORAGE_KEY))
  assert.equal(stored.slots.chassis, 'chassis-suv')
  assert.equal(stored.slots.suspensionFront, 'susp-stock')
  assert.equal(stored.slots.suspensionRear, 'susp-stock')
})

test('a failed apply leaves the stored configuration alone', () => {
  const { storage } = installFakeStorage()
  const controller = createController()

  applyVehicleConfigurationToSession({
    vehicleController: controller,
    vehicleConfig: configurationWith({ chassis: 'chassis-suv' }),
  })

  const result = applyVehicleConfigurationToSession({
    vehicleController: controller,
    vehicleConfig: configurationWith({ chassis: 'chassis-not-a-component' }),
  })

  assert.equal(result.applied, false, 'the invalid configuration was rejected')

  const stored = JSON.parse(storage.getItem(VEHICLE_CONFIGURATION_STORAGE_KEY))
  assert.equal(
    stored.slots.chassis,
    'chassis-suv',
    'the stored configuration is the last one that was applied'
  )
})

test('Reset Vehicle stores the stock configuration', () => {
  const { storage } = installFakeStorage()
  const controller = createController()

  applyVehicleConfigurationToSession({
    vehicleController: controller,
    vehicleConfig: configurationWith({ chassis: 'chassis-suv' }),
  })

  // Reset Vehicle applies the stock configuration.
  applyVehicleConfigurationToSession({
    vehicleController: controller,
    vehicleConfig: createDefaultVehicleConfiguration(),
  })

  const stored = JSON.parse(storage.getItem(VEHICLE_CONFIGURATION_STORAGE_KEY))
  assert.deepEqual(
    stored.slots,
    createDefaultVehicleConfiguration().slots,
    'the stored configuration is the stock setup'
  )
})

test('a storage write failure does not block the apply', () => {
  const { storage } = installFakeStorage()
  storage.setItem = () => {
    throw new Error('the storage is full')
  }
  const controller = createController()

  const result = applyVehicleConfigurationToSession({
    vehicleController: controller,
    vehicleConfig: configurationWith({ chassis: 'chassis-suv' }),
  })

  assert.equal(result.applied, true, 'the apply still succeeded')
  assert.equal(
    controller.getVehicleConfiguration().slots.chassis,
    'chassis-suv',
    'the vehicle runs the new setup'
  )
})

test('a corrupt stored value falls back to the stock configuration', () => {
  installFakeStorage({ [VEHICLE_CONFIGURATION_STORAGE_KEY]: '{broken' })

  assert.equal(readStoredVehicleConfiguration(), null)
  assert.deepEqual(
    resolveInitialVehicleConfiguration().slots,
    createDefaultVehicleConfiguration().slots,
    'the stock configuration is used instead'
  )
})

test('a stored value with an unknown slot id falls back to the stock configuration', () => {
  installFakeStorage({
    [VEHICLE_CONFIGURATION_STORAGE_KEY]: JSON.stringify(
      configurationWith({ chassis: 'chassis-not-a-component' })
    ),
  })

  assert.equal(readStoredVehicleConfiguration(), null)
  assert.deepEqual(
    resolveInitialVehicleConfiguration().slots,
    createDefaultVehicleConfiguration().slots,
    'the stock configuration is used instead'
  )
})

test('a legacy stored configuration with a single suspension slot migrates to both slots', () => {
  const legacySlots = createDefaultVehicleConfiguration().slots
  const legacy = {
    version: 1,
    slots: {
      chassis: legacySlots.chassis,
      suspension: 'susp-double-wishbone',
      wheels: legacySlots.wheels,
      drivetrain: legacySlots.drivetrain,
      brakes: legacySlots.brakes,
      aero: legacySlots.aero,
    },
  }
  installFakeStorage({
    [VEHICLE_CONFIGURATION_STORAGE_KEY]: JSON.stringify(legacy),
  })

  const migrated = readStoredVehicleConfiguration()

  assert.equal(migrated.slots.suspensionFront, 'susp-double-wishbone')
  assert.equal(migrated.slots.suspensionRear, 'susp-double-wishbone')
  assert.equal(Object.hasOwn(migrated.slots, 'suspension'), false)
  assert.equal(migrated.version, 2)
})

test('a legacy stored configuration with an invalid suspension id falls back to the stock setup', () => {
  const legacySlots = createDefaultVehicleConfiguration().slots
  const legacy = {
    version: 1,
    slots: {
      chassis: legacySlots.chassis,
      suspension: 'not-a-suspension',
      wheels: legacySlots.wheels,
      drivetrain: legacySlots.drivetrain,
      brakes: legacySlots.brakes,
      aero: legacySlots.aero,
    },
  }
  installFakeStorage({
    [VEHICLE_CONFIGURATION_STORAGE_KEY]: JSON.stringify(legacy),
  })

  assert.equal(readStoredVehicleConfiguration(), null)
  assert.deepEqual(
    resolveInitialVehicleConfiguration().slots,
    createDefaultVehicleConfiguration().slots
  )
})

test('a stored value that is not a configuration falls back to the stock configuration', () => {
  installFakeStorage({ [VEHICLE_CONFIGURATION_STORAGE_KEY]: JSON.stringify(['nope']) })

  assert.equal(readStoredVehicleConfiguration(), null)
  assert.deepEqual(
    resolveInitialVehicleConfiguration().slots,
    createDefaultVehicleConfiguration().slots
  )
})

test('the restored configuration is passed to createSimulation at construction', () => {
  installFakeStorage()

  const simulation = createSimulation(
    createSimulationDeps({
      vehicleConfiguration: configurationWith({ chassis: 'chassis-suv' }),
    })
  )

  assert.equal(
    simulation.vehicleController.getVehicleConfiguration().slots.chassis,
    'chassis-suv',
    'the controller is built with the restored configuration'
  )
})

test('a session without a stored configuration starts from the stock setup', () => {
  installFakeStorage()

  const simulation = createSimulation(createSimulationDeps())

  assert.equal(
    simulation.vehicleController.getVehicleConfiguration().slots.chassis,
    'chassis-hatchback'
  )
})

test('a stored configuration is restored into the next session', () => {
  const { storage } = installFakeStorage()
  const controller = createController()

  applyVehicleConfigurationToSession({
    vehicleController: controller,
    vehicleConfig: configurationWith({ chassis: 'chassis-suv' }),
  })

  const restored = resolveInitialVehicleConfiguration()
  assert.equal(restored.slots.chassis, 'chassis-suv')

  const simulation = createSimulation(
    createSimulationDeps({ vehicleConfiguration: restored })
  )
  assert.equal(
    simulation.vehicleController.getVehicleConfiguration().slots.chassis,
    'chassis-suv'
  )
  assert.ok(storage.getItem(VEHICLE_CONFIGURATION_STORAGE_KEY))
})

test('an invalid configuration is not written to storage', () => {
  const { storage } = installFakeStorage()

  const written = writeStoredVehicleConfiguration(
    configurationWith({ chassis: 'chassis-not-a-component' })
  )

  assert.equal(written, false, 'the invalid configuration was refused')
  assert.equal(storage.getItem(VEHICLE_CONFIGURATION_STORAGE_KEY), null)
})
