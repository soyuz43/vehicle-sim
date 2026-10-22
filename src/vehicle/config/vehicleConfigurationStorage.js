// src/vehicle/config/vehicleConfigurationStorage.js

/**
 * Persist the vehicle configuration across a reload.
 *
 * The terrain is carried by the session URL. The vehicle setup had no
 * carrier at all, so a reload returned the session to the stock setup. The
 * applied configuration is stored in localStorage under a single key and
 * read back on the next start.
 *
 * A stored configuration is VALIDATED before it is used. A corrupt value, a
 * value that is not a configuration, and a configuration with an unknown
 * slot id all fall back to the stock configuration instead of failing the
 * start.
 *
 * A storage failure never blocks the session. The browser storage helpers
 * log the failure, the write reports false, and the caller carries on.
 */

import {
  readJsonFromStorage,
  writeJsonToStorage,
} from '../../ui/design-system/browserStorage.js'
import {
  createDefaultVehicleConfiguration,
  validateVehicleConfiguration,
} from './createVehicleConfiguration.js'

export const VEHICLE_CONFIGURATION_STORAGE_KEY = 'vehicle-sim-config'

// Read the stored vehicle configuration.
//
// Returns the stored configuration, or null when nothing usable is stored:
// no value, a value that is not JSON, a value that is not a configuration,
// or a configuration with an unknown slot id. The caller falls back to the
// stock configuration in every one of those cases.
export function readStoredVehicleConfiguration(
  storageKey = VEHICLE_CONFIGURATION_STORAGE_KEY
) {
  const stored = readJsonFromStorage(storageKey)

  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return null
  }

  const validation = validateVehicleConfiguration(stored)

  if (!validation.valid) {
    console.warn(
      '[VehicleConfig] The stored vehicle configuration is invalid. The stock setup is used instead.',
      validation.errors
    )
    return null
  }

  return stored
}

// Store the vehicle configuration.
//
// Returns true when the configuration was stored. A storage failure is
// logged by the storage helper and reported as false, so the caller can
// carry on: the session runs the new setup even when it cannot be
// recorded.
export function writeStoredVehicleConfiguration(
  vehicleConfiguration,
  storageKey = VEHICLE_CONFIGURATION_STORAGE_KEY
) {
  const validation = validateVehicleConfiguration(vehicleConfiguration)

  if (!validation.valid) {
    console.warn(
      '[VehicleConfig] Refusing to store an invalid vehicle configuration.',
      validation.errors
    )
    return false
  }

  return writeJsonToStorage(storageKey, vehicleConfiguration)
}

// The configuration the session starts with: the stored one when it is
// valid, the stock one otherwise.
export function resolveInitialVehicleConfiguration(
  storageKey = VEHICLE_CONFIGURATION_STORAGE_KEY
) {
  return (
    readStoredVehicleConfiguration(storageKey) ??
    createDefaultVehicleConfiguration()
  )
}
