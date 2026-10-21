import assert from 'node:assert/strict'
import test from 'node:test'

import { createCar } from '../src/car/createCar.js'
import { VehicleController } from '../src/vehicle/VehicleController.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'

test('createVehicleController initializes its controller exactly once', () => {
  const originalInit = VehicleController.prototype.init
  let initializationCount = 0

  VehicleController.prototype.init = function (...args) {
    initializationCount += 1
    return originalInit.apply(this, args)
  }

  try {
    const controller = createVehicleController({ vehicle: createCar() })

    assert.equal(initializationCount, 1)
    assert.equal(controller.initialized, true)
  } finally {
    VehicleController.prototype.init = originalInit
  }
})
