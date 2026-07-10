// src/vehicle/powertrain/createPowertrainSelection.js

// Powertrain profile selection, sanitization, and serializable snapshot helper.
//
// This module is the single seam between static profile data
// (createEngineProfiles.js / createTransmissionProfiles.js) and the vehicle
// controller snapshot. It does NOT add any engine braking, RPM, clutch, shift
// scheduling, torque-converter, or gear-ratio force behavior. Unknown profile
// ids fall back to safe defaults so the simulation state always stays finite.

import {
  DEFAULT_ENGINE_ID,
  ENGINE_PROFILE_BY_ID,
} from './createEngineProfiles.js'
import {
  DEFAULT_TRANSMISSION_ID,
  TRANSMISSION_PROFILE_BY_ID,
} from './createTransmissionProfiles.js'

export { DEFAULT_ENGINE_ID, DEFAULT_TRANSMISSION_ID }

function normalizeProfileId(value) {
  if (typeof value === 'string') return value
  if (value == null) return ''
  return String(value)
}

export function selectEngineProfile(engineId) {
  const candidate = ENGINE_PROFILE_BY_ID[normalizeProfileId(engineId)]

  if (candidate) return candidate

  // Safe fallback: never return undefined for an unknown id.
  return ENGINE_PROFILE_BY_ID[DEFAULT_ENGINE_ID]
}

export function selectTransmissionProfile(transmissionId) {
  const candidate =
    TRANSMISSION_PROFILE_BY_ID[normalizeProfileId(transmissionId)]

  if (candidate) return candidate

  // Safe fallback: never return undefined for an unknown id.
  return TRANSMISSION_PROFILE_BY_ID[DEFAULT_TRANSMISSION_ID]
}

function createEngineSnapshot(engineProfile) {
  return {
    engineId: engineProfile.engineId,
    displayName: engineProfile.displayName,
    layoutKind: engineProfile.layoutKind,
    cylinderCount: engineProfile.cylinderCount,
    displacementLiters: engineProfile.displacementLiters,
    aspirationKind: engineProfile.aspirationKind,
    fuelKind: engineProfile.fuelKind,
    idleRpm: engineProfile.idleRpm,
    redlineRpm: engineProfile.redlineRpm,
    peakTorqueNewtonMeters: engineProfile.peakTorqueNewtonMeters,
    peakTorqueRpm: engineProfile.peakTorqueRpm,
    engineRotationalInertiaKgMeterSquared:
      engineProfile.engineRotationalInertiaKgMeterSquared,
    torqueCurveSampleCount: engineProfile.torqueCurveSamples.length,
  }
}

function createTransmissionSnapshot(transmissionProfile) {
  return {
    transmissionId: transmissionProfile.transmissionId,
    displayName: transmissionProfile.displayName,
    transmissionKind: transmissionProfile.transmissionKind,
    forwardGearCount: transmissionProfile.forwardGearRatios.length,
    reverseGearRatio: transmissionProfile.reverseGearRatio,
    finalDriveRatio: transmissionProfile.finalDriveRatio,
    hasClutchPedal: transmissionProfile.hasClutchPedal,
    hasTorqueConverter: transmissionProfile.hasTorqueConverter,
    supportsAutomaticShifting: transmissionProfile.supportsAutomaticShifting,
    supportsManualSelection: transmissionProfile.supportsManualSelection,
    cvtMinRatio: transmissionProfile.cvtMinRatio,
    cvtMaxRatio: transmissionProfile.cvtMaxRatio,
  }
}

// Build a serializable, finite snapshot of the selected powertrain.
// This is telemetry only; it is never read by physics integration.
export function createPowertrainSnapshot(engineProfile, transmissionProfile) {
  return {
    engineId: engineProfile.engineId,
    transmissionId: transmissionProfile.transmissionId,
    engine: createEngineSnapshot(engineProfile),
    transmission: createTransmissionSnapshot(transmissionProfile),
  }
}