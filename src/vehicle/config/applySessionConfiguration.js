// src/vehicle/config/applySessionConfiguration.js

/**
 * Apply the staged session configuration: the vehicle setup and the
 * terrain.
 *
 * The vehicle setup is applied and RECORDED first, and the terrain is
 * committed second. A terrain change is applied by reloading the session,
 * and the recorded vehicle setup is what the next session restores, so the
 * record has to be in place before the reload. Committing the terrain
 * first would reload the session before the vehicle setup was recorded,
 * and the vehicle change would be lost.
 *
 * A failed vehicle apply does not commit the terrain. The panel reports the
 * failure, and reloading the session would throw that report away.
 *
 * The controller object never changes: the configuration is swapped in
 * place on the existing controller, so every holder of a controller
 * reference (the camera, the panels, the obstacle interaction, the console
 * hook) keeps working.
 */

import {
  areVehicleConfigurationsEqual,
  cloneVehicleConfiguration,
} from './createVehicleConfiguration.js'
import { applyVehicleConfigurationToSession } from './applyVehicleConfigurationToSession.js'
import { describeVehicleApplyWarning } from './describeVehicleApplyWarning.js'
import { writeStoredVehicleConfiguration } from './vehicleConfigurationStorage.js'

export function applySessionConfiguration({
  vehicleController,
  vehicleConfig,
  lastAppliedVehicleConfig = null,
  terrain = null,
  runningTerrain = null,
  commitTerrain = null,
  onApplied = null,
  onError = null,
} = {}) {
  // The panel has no controller reference and no snapshot access, so the
  // speed is read here and the consequence is described here. The apply
  // always proceeds: the warning reports what already happened.
  const warning = describeVehicleApplyWarning({
    pendingVehicleConfig: vehicleConfig,
    appliedVehicleConfig: lastAppliedVehicleConfig,
    speedMetersPerSecond:
      vehicleController?.getSnapshot().worldSpeedMetersPerSecond ?? 0,
  })

  const appliedVehicleConfig = applyVehicleSetup({
    vehicleController,
    vehicleConfig,
    lastAppliedVehicleConfig,
    warning,
    onError,
  })

  if (!appliedVehicleConfig) {
    return { applied: false, terrainCommitted: false, warning }
  }

  onApplied?.({ vehicleConfig: appliedVehicleConfig, warning })

  // The terrain is committed only after the vehicle setup is recorded.
  const terrainChanged =
    typeof terrain === 'string' &&
    typeof runningTerrain === 'string' &&
    terrain !== runningTerrain

  if (terrainChanged && commitTerrain) {
    commitTerrain(terrain)
  }

  return {
    applied: true,
    terrainCommitted: terrainChanged && Boolean(commitTerrain),
    warning,
  }
}

// Apply the vehicle setup and record it as the session's setup.
//
// Returns the configuration the vehicle is running, or null when the apply
// failed. A configuration the vehicle already runs is recorded again
// without a redundant apply, so the stored setup always describes what is
// running.
function applyVehicleSetup({
  vehicleController,
  vehicleConfig,
  lastAppliedVehicleConfig,
  warning,
  onError,
}) {
  if (
    lastAppliedVehicleConfig &&
    areVehicleConfigurationsEqual(vehicleConfig, lastAppliedVehicleConfig)
  ) {
    writeStoredVehicleConfiguration(lastAppliedVehicleConfig)
    return cloneVehicleConfiguration(lastAppliedVehicleConfig)
  }

  const result = applyVehicleConfigurationToSession({
    vehicleController,
    vehicleConfig,
    onError,
  })

  if (!result.applied) return null

  return cloneVehicleConfiguration(vehicleConfig)
}
