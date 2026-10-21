// src/vehicle/createVehicleController.js

import { VehicleController } from './VehicleController.js'

export function createVehicleController(config = {}) {
  const controller = new VehicleController(config)
  return controller
}
