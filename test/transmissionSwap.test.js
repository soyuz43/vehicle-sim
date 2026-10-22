// test/transmissionSwap.test.js
//
// Runtime transmission swapping via setTransmission().
//
// The swap is transmission-only: the engine profile, rear differential,
// chassis, suspension, tires, and terrain are untouched. The manual shift
// state is reset because a forward gear index from the previous gearbox is
// meaningless in the new one.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { createFlatTerrainContactQuery } from '../src/terrain/createFlatTerrainContactQuery.js'

const DT = 1 / 60

function makeController(transmissionId, specOverrides = {}) {
  return createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createFlatTerrainContactQuery({ frictionCoefficient: 1.0 }),
    transmissionId,
    spec: specOverrides,
  })
}

test('setTransmission swaps to the requested transmission profile', () => {
  const controller = makeController('automatic-6')
  assert.equal(controller.getSnapshot().transmissionProfile.transmissionId, 'automatic-6')

  const profile = controller.setTransmission('manual-6')

  assert.equal(profile.transmissionId, 'manual-6')
  assert.equal(controller.getSnapshot().transmissionProfile.transmissionId, 'manual-6')
  assert.equal(
    controller.getSnapshot().powertrain.transmission.transmissionId,
    'manual-6',
    'the powertrain snapshot must reflect the new profile'
  )
})

test('setTransmission resets the selected forward gear', () => {
  const controller = makeController('automatic-6')
  for (let i = 0; i < 160; i += 1) controller.update(DT, { throttle: true })
  assert.ok(controller.getSnapshot().selectedForwardGearIndex > 0)

  controller.setTransmission('manual-6')

  assert.equal(controller.getSnapshot().selectedForwardGearIndex, 0)
})

test('setTransmission resets the manual gear selection and shift mode', () => {
  const controller = makeController('automatic-6', { manualShiftCooldownSeconds: 0 })
  controller.update(DT, { throttle: true })
  controller.requestShiftUp()
  assert.equal(controller.getSnapshot().shiftMode, 'manual')

  controller.setTransmission('automatic-6')

  const snap = controller.getSnapshot()
  assert.equal(snap.shiftMode, 'auto')
  assert.equal(snap.selectedForwardGearIndex, 0)
})

test('setTransmission rejects an unknown transmission id', () => {
  const controller = makeController('automatic-6')

  assert.throws(
    () => controller.setTransmission('not-a-transmission'),
    /Unknown transmission id/,
    'an unknown id must throw rather than silently keep the old gearbox'
  )
  assert.equal(
    controller.getSnapshot().transmissionProfile.transmissionId,
    'automatic-6',
    'a rejected swap must leave the transmission untouched'
  )
})

test('a transmission swap during throttle keeps the simulation stepping', () => {
  const controller = makeController('automatic-6')
  for (let i = 0; i < 120; i += 1) controller.update(DT, { throttle: true })

  controller.setTransmission('manual-6')
  for (let i = 0; i < 60; i += 1) controller.update(DT, { throttle: true })

  const snap = controller.getSnapshot()
  assert.equal(snap.transmissionProfile.transmissionId, 'manual-6')
  assert.equal(
    snap.selectedForwardGearIndex,
    0,
    'the manual gearbox holds its first gear'
  )
  assert.ok(Number.isFinite(snap.speedMetersPerSecond))
  assert.ok(snap.effectiveDriveRatio > 0)
  assert.ok(snap.speedMetersPerSecond > 0, 'the vehicle must still be moving')
})

test('a transmission swap leaves the engine, differential, and chassis alone', () => {
  const controller = makeController('automatic-6')
  for (let i = 0; i < 60; i += 1) controller.update(DT, { throttle: true })
  const before = controller.getSnapshot()

  controller.setTransmission('manual-6')
  const after = controller.getSnapshot()

  assert.equal(after.engineProfile.engineId, before.engineProfile.engineId)
  assert.equal(
    after.rearDifferentialState.rearDifferentialType,
    before.rearDifferentialState.rearDifferentialType
  )
  assert.equal(
    after.chassisMassProperties.massKilograms,
    before.chassisMassProperties.massKilograms
  )
})

test('setTransmission preserves the reverse/neutral/drive selector', () => {
  const controller = makeController('automatic-6')
  controller.setGear('reverse')

  controller.setTransmission('manual-6')

  assert.equal(
    controller.getSnapshot().gear,
    'reverse',
    'the drive selector is the driver\'s choice, not a property of the gearbox'
  )
})

test('shift input works on a transmission selected at runtime', () => {
  const controller = makeController('automatic-6', { manualShiftCooldownSeconds: 0 })
  controller.setTransmission('manual-6')
  controller.update(DT, { throttle: true })

  controller.requestShiftUp()
  controller.update(DT, { throttle: true })

  assert.equal(controller.getSnapshot().selectedForwardGearIndex, 1)
  assert.equal(controller.getSnapshot().forwardGearLabel, '2')
})
