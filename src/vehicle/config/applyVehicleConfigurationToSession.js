// src/vehicle/config/applyVehicleConfigurationToSession.js

/**
 * Apply a vehicle configuration to the running vehicle and record it as the
 * session's setup.
 *
 * The controller object never changes: the configuration is swapped in place
 * on the existing controller, so every holder of a controller reference (the
 * camera, the panels, the obstacle interaction, the console hook) keeps
 * working.
 *
 * A successful apply records the configuration, so the next start begins
 * from it instead of from the stock setup. A storage failure is logged and
 * does not undo the apply: the vehicle runs the new setup even when the
 * session cannot be recorded.
 *
 * A failed apply leaves the controller untouched and reports the failure
 * through the onError callback, so the caller can surface the failure
 * instead of leaving the driver with a panel that claims the setup was
 * applied.
 */

import { applyConfigurationToController } from './applyVehicleConfigurationToController.js'
import { writeStoredVehicleConfiguration } from './vehicleConfigurationStorage.js'

export function applyVehicleConfigurationToSession({
  vehicleController,
  vehicleConfig,
  onApplied = null,
  onError = null,
} = {}) {
  return applyConfigurationToController({
    vehicleController,
    vehicleConfig,
    onApplied: (result) => {
      writeStoredVehicleConfiguration(result?.configuration ?? vehicleConfig)
      onApplied?.(result)
    },
    onError,
  })
}
