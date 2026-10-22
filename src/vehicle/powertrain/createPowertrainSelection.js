// src/vehicle/powertrain/createPowertrainSelection.js

// Powertrain profile selection, sanitization, and serializable snapshot helper.
//
// This module is the single seam between static profile data
// (createEngineProfiles.js / createTransmissionProfiles.js) and the vehicle
// controller snapshot. It does NOT add any engine braking, RPM, clutch, shift
// scheduling, torque-converter, or gear-ratio force behavior. Unknown profile
// ids fall back to safe defaults so the simulation state always stays finite.
//
// The exceptions are the read-only capability queries below
// (profileSupportsAutomaticShifting(), profileSupportsManualSelection()) and
// the strict catalog lookup requireTransmissionProfile(). They tell the
// controller whether the selected transmission is allowed to auto-shift, whether
// it accepts a driver gear-selection input, and how to resolve a requested
// transmission id at runtime. They add no drivetrain behavior of their own.

import {
  DEFAULT_ENGINE_ID,
  ENGINE_PROFILE_BY_ID,
} from './createEngineProfiles.js'
import {
  DEFAULT_TRANSMISSION_ID,
  TRANSMISSION_PROFILE_BY_ID,
} from './createTransmissionProfiles.js'

import {
  deriveStockEngineCatalogTelemetry,
  findStockEngineCatalogEntryById,
  findStockEngineCatalogEntryByLinkedProfileId,
} from './createStockEngineCatalog.js'

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

// Strict catalog lookup used by runtime transmission swapping.
//
// Unlike selectTransmissionProfile() above, an unknown id is an error rather
// than a silent fallback to the default profile: a swap request that quietly
// kept the previous gearbox would misrepresent what the driver asked for.
// The catalog map is the single source of truth; no profile is constructed
// here.
export function requireTransmissionProfile(transmissionId) {
  const normalizedId = normalizeProfileId(transmissionId)
  const candidate = TRANSMISSION_PROFILE_BY_ID[normalizedId]

  if (!candidate) {
    throw new Error(
      'Unknown transmission id "' +
        normalizedId +
        '". Known ids: ' +
        Object.keys(TRANSMISSION_PROFILE_BY_ID).join(', ')
    )
  }

  return candidate
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
    stockEngineCatalogTelemetry: createStockEngineCatalogTelemetry(engineProfile),
  }
}

export function createStockEngineCatalogTelemetry(engineProfile) {
  if (!engineProfile) {
    return deriveStockEngineCatalogTelemetry(null)
  }

  const explicitCatalogId =
    typeof engineProfile.stockEngineCatalogId === 'string'
      ? engineProfile.stockEngineCatalogId
      : ''
  const entry =
    findStockEngineCatalogEntryById(explicitCatalogId) ??
    findStockEngineCatalogEntryByLinkedProfileId(engineProfile.engineId)

  return deriveStockEngineCatalogTelemetry(entry)
}

// Whether the selected transmission profile may perform automatic gear
// selection.
//
// The controller's automatic gear selection requires BOTH the global
// spec.automaticTransmissionEnabled flag and this per-profile capability.
// A profile that declares supportsAutomaticShifting: false (a manual
// gearbox) must never auto-shift, even when the global flag is on.
//
// A profile that does not declare the flag at all is treated as capable, so
// an incomplete or hand-made profile cannot silently disable shifting.
export function profileSupportsAutomaticShifting(transmissionProfile) {
  return transmissionProfile?.supportsAutomaticShifting !== false
}

// Whether the selected transmission profile accepts a driver gear-selection
// input.
//
// The controller's manual shift path requires this capability: a profile that
// declares supportsManualSelection: false (the CVT, which has no discrete
// forward gears) ignores shift input entirely.
//
// A profile that does not declare the flag at all is treated as capable, so
// an incomplete or hand-made profile cannot silently disable manual shifting.
export function profileSupportsManualSelection(transmissionProfile) {
  return transmissionProfile?.supportsManualSelection !== false
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