// test/vehicleConfigurationApplication.test.js

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  VEHICLE_COMPONENT_SLOTS,
  VEHICLE_COMPONENT_CATALOG,
  getComponent,
  getDefaultComponentId,
} from '../src/vehicle/config/componentCatalog.js'
import {
  areVehicleConfigurationsEqual,
  cloneVehicleConfiguration,
  createDefaultVehicleConfiguration,
  isDefaultVehicleConfiguration,
  resetVehicleConfigurationToDefault,
  setVehicleConfigurationSlot,
  validateVehicleConfiguration,
} from '../src/vehicle/config/createVehicleConfiguration.js'
import { applyVehicleConfiguration } from '../src/vehicle/config/applyVehicleConfiguration.js'
import { DEFAULT_VEHICLE_SPEC } from '../src/vehicle/defaultVehicleSpec.js'
import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'

test('default configuration selects the catalog default for every slot', () => {
  const configuration = createDefaultVehicleConfiguration()

  for (const slot of VEHICLE_COMPONENT_SLOTS) {
    assert.equal(configuration.slots[slot], getDefaultComponentId(slot))
  }
})

test('default configuration reproduces DEFAULT_VEHICLE_SPEC for every component field', () => {
  const configuration = createDefaultVehicleConfiguration()
  const applied = applyVehicleConfiguration(configuration)
  const controller = createVehicleController({
    vehicle: createCar(),
    spec: applied.spec,
    engineId: applied.engineId,
    transmissionId: applied.transmissionId,
  })
  const snapshot = controller.getSnapshot()

  // The offroad playground starts at the same physical vehicle as the
  // proving-ground path, so the configured spec must equal the baseline.
  assert.equal(snapshot.spec.massKg, DEFAULT_VEHICLE_SPEC.massKg)
  assert.equal(
    snapshot.spec.suspensionRestLengthMeters,
    DEFAULT_VEHICLE_SPEC.suspensionRestLengthMeters
  )
  assert.equal(
    snapshot.spec.baseTireRollingRadiusMeters,
    DEFAULT_VEHICLE_SPEC.baseTireRollingRadiusMeters
  )
  assert.equal(
    snapshot.spec.maxServiceBrakeTorqueNewtonMeters,
    DEFAULT_VEHICLE_SPEC.maxServiceBrakeTorqueNewtonMeters
  )
  assert.equal(snapshot.spec.dragCoefficient, DEFAULT_VEHICLE_SPEC.dragCoefficient)
  assert.equal(snapshot.spec.rearDifferentialType, DEFAULT_VEHICLE_SPEC.rearDifferentialType)
  assert.equal(applied.engineId, 'inline-4')
  assert.equal(applied.transmissionId, 'automatic-6')
})

test('validation accepts a valid configuration and rejects unknown component ids', () => {
  const valid = validateVehicleConfiguration(createDefaultVehicleConfiguration())
  assert.equal(valid.valid, true)
  assert.deepEqual(valid.errors, [])

  const badSlot = cloneVehicleConfiguration(createDefaultVehicleConfiguration())
  badSlot.slots.chassis = 'does-not-exist'
  const invalid = validateVehicleConfiguration(badSlot)
  assert.equal(invalid.valid, false)
  assert.ok(invalid.errors.length > 0)
})

test('setVehicleConfigurationSlot returns a new configuration with one slot changed', () => {
  const base = createDefaultVehicleConfiguration()
  const updated = setVehicleConfigurationSlot(base, 'chassis', 'chassis-heavytruck')

  assert.notEqual(updated, base)
  assert.equal(base.slots.chassis, 'chassis-hatchback')
  assert.equal(updated.slots.chassis, 'chassis-heavytruck')
  assert.equal(updated.slots.suspension, base.slots.suspension)
  assert.ok(getComponent('chassis', 'chassis-heavytruck') != null)
})

test('setVehicleConfigurationSlot throws on unknown slot or component', () => {
  const base = createDefaultVehicleConfiguration()
  assert.throws(() => setVehicleConfigurationSlot(base, 'not-a-slot', 'x'))
  assert.throws(() =>
    setVehicleConfigurationSlot(base, 'chassis', 'not-a-component')
  )
})

test('reset-to-default restores the exact default configuration', () => {
  const customized = setVehicleConfigurationSlot(
    setVehicleConfigurationSlot(createDefaultVehicleConfiguration(), 'chassis', 'chassis-heavytruck'),
    'aero',
    'aero-downforce'
  )
  assert.equal(isDefaultVehicleConfiguration(customized), false)

  const reset = resetVehicleConfigurationToDefault(customized)
  assert.ok(isDefaultVehicleConfiguration(reset))
  assert.ok(areVehicleConfigurationsEqual(reset, createDefaultVehicleConfiguration()))
})

test('every catalog component id resolves to a defined component', () => {
  for (const slot of VEHICLE_COMPONENT_SLOTS) {
    const slotEntry = VEHICLE_COMPONENT_CATALOG[slot]
    for (const componentId of Object.keys(slotEntry.components)) {
      const component = getComponent(slot, componentId)
      assert.ok(component != null, slot + '/' + componentId + ' resolves')
      assert.equal(typeof component.label, 'string')
    }
  }
})
