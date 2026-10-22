// test/staleShiftApiRemoval.test.js
//
// The R/N/D cycling shift API (shiftGearUp / shiftGearDown / shiftGearBy)
// was defined but never called from any live path: the main.js key handler
// called shiftUp/shiftDown, which never existed on the controller, so every
// bracket keypress threw a TypeError. The functions also had the wrong
// semantics — they cycled the Reverse / Neutral / Drive selector instead of
// selecting a transmission forward gear.
//
// This guards the removal so the stale API cannot silently return.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { createFlatTerrainContactQuery } from '../src/terrain/createFlatTerrainContactQuery.js'

test('the controller no longer exposes the stale R/N/D cycling shift API', () => {
  const controller = createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createFlatTerrainContactQuery({ frictionCoefficient: 1.0 }),
  })

  assert.equal(controller.shiftGearUp, undefined)
  assert.equal(controller.shiftGearDown, undefined)
  assert.equal(controller.shiftGearBy, undefined)
})
