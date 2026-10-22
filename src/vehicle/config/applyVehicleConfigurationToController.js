// src/vehicle/config/applyVehicleConfigurationToController.js

/**
 * Applies a vehicle configuration to a running vehicle controller.
 *
 * The controller object never changes: the configuration is swapped in place
 * on the existing controller, so every holder of a controller reference (the
 * camera, the panels, the obstacle interaction, the console hook) keeps
 * working.
 *
 * A failed apply leaves the controller untouched and reports the error
 * through the onError callback, so the caller can surface the failure
 * instead of leaving the driver with a panel that claims the setup was
 * applied.
 */

export function applyConfigurationToController({
    vehicleController,
    vehicleConfig,
    onApplied = null,
    onError = null,
} = {}) {
    if (!vehicleController) {
        throw new Error(
            'applyConfigurationToController requires a vehicleController'
        )
    }

    try {
        const result = vehicleController.setVehicleConfiguration(vehicleConfig)
        onApplied?.(result)

        return { applied: true, result, error: null }
    } catch (error) {
        onError?.(error)

        return { applied: false, result: null, error }
    }
}
