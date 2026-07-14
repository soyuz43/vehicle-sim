// src/vehicle/powertrain/createTransmissionProfiles.js

// Static transmission profile data for common car transmission types.
//
// This is PROFILE DATA. The active powertrain drive-torque source v1 and the
// shared representative-ratio helper read the selected representative forward
// gear ratio, absolute reverse ratio, and final-drive ratio to multiply engine
// torque into axle torque. These profiles do NOT drive shifting, clutch,
// torque-converter, or any other drivetrain behavior in the current simulation.
//
// Scope (v1): manual-4, manual-5, manual-6, manual-6-granny, automatic-6,
// automatic-8, dct-7, dct-8, cvt. All static data profiles only.

const TRANSMISSION_PROFILE_IDS = Object.freeze([
  'manual-4',
  'manual-5',
  'manual-6',
  'manual-6-granny',
  'automatic-6',
  'automatic-8',
  'dct-7',
  'dct-8',
  'cvt',
])

const TRANSMISSION_KINDS = Object.freeze([
  'manual',
  'automatic',
  'dct',
  'cvt',
])

function freezeForwardGearRatios(ratios) {
  return Object.freeze(ratios.slice())
}

function defineTransmission(raw) {
  if (!TRANSMISSION_PROFILE_IDS.includes(raw.transmissionId)) {
    throw new Error(`Unknown transmission profile id: ${raw.transmissionId}`)
  }

  return Object.freeze({
    transmissionId: raw.transmissionId,
    displayName: raw.displayName,
    transmissionKind: raw.transmissionKind,
    forwardGearRatios: freezeForwardGearRatios(raw.forwardGearRatios),
    reverseGearRatio: raw.reverseGearRatio,
    finalDriveRatio: raw.finalDriveRatio,
    hasClutchPedal: raw.hasClutchPedal,
    hasTorqueConverter: raw.hasTorqueConverter,
    supportsAutomaticShifting: raw.supportsAutomaticShifting,
    supportsManualSelection: raw.supportsManualSelection,
    // CVT ratio band. Only meaningful for transmissionKind === 'cvt'.
    cvtMinRatio: raw.cvtMinRatio ?? null,
    cvtMaxRatio: raw.cvtMaxRatio ?? null,
  })
}

const RAW_TRANSMISSION_PROFILES = [
  {
    transmissionId: 'manual-4',
    displayName: '4-Speed Manual',
    transmissionKind: 'manual',
    forwardGearRatios: [3.45, 1.95, 1.3, 0.97],
    reverseGearRatio: -3.17,
    finalDriveRatio: 3.91,
    hasClutchPedal: true,
    hasTorqueConverter: false,
    supportsAutomaticShifting: false,
    supportsManualSelection: true,
  },
  {
    transmissionId: 'manual-5',
    displayName: '5-Speed Manual',
    transmissionKind: 'manual',
    forwardGearRatios: [3.55, 2.05, 1.38, 1.0, 0.82],
    reverseGearRatio: -3.33,
    finalDriveRatio: 3.91,
    hasClutchPedal: true,
    hasTorqueConverter: false,
    supportsAutomaticShifting: false,
    supportsManualSelection: true,
  },
  {
    transmissionId: 'manual-6',
    displayName: '6-Speed Manual',
    transmissionKind: 'manual',
    forwardGearRatios: [3.55, 2.16, 1.48, 1.12, 0.89, 0.73],
    reverseGearRatio: -3.25,
    finalDriveRatio: 3.73,
    hasClutchPedal: true,
    hasTorqueConverter: false,
    supportsAutomaticShifting: false,
    supportsManualSelection: true,
  },
  {
    transmissionId: 'manual-6-granny',
    displayName: '6-Speed Manual (Granny 1st)',
    transmissionKind: 'manual',
    forwardGearRatios: [4.6, 2.62, 1.62, 1.12, 0.89, 0.73],
    reverseGearRatio: -4.2,
    finalDriveRatio: 3.73,
    hasClutchPedal: true,
    hasTorqueConverter: false,
    supportsAutomaticShifting: false,
    supportsManualSelection: true,
  },
  {
    transmissionId: 'automatic-6',
    displayName: '6-Speed Automatic',
    transmissionKind: 'automatic',
    forwardGearRatios: [4.17, 2.34, 1.52, 1.14, 0.87, 0.69],
    reverseGearRatio: -3.4,
    finalDriveRatio: 3.2,
    hasClutchPedal: false,
    hasTorqueConverter: true,
    supportsAutomaticShifting: true,
    supportsManualSelection: true,
  },
  {
    transmissionId: 'automatic-8',
    displayName: '8-Speed Automatic',
    transmissionKind: 'automatic',
    forwardGearRatios: [
      4.6, 2.96, 2.05, 1.54, 1.2, 0.95, 0.78, 0.65,
    ],
    reverseGearRatio: -3.63,
    finalDriveRatio: 3.07,
    hasClutchPedal: false,
    hasTorqueConverter: true,
    supportsAutomaticShifting: true,
    supportsManualSelection: true,
  },
  {
    transmissionId: 'dct-7',
    displayName: '7-Speed Dual-Clutch',
    transmissionKind: 'dct',
    forwardGearRatios: [3.45, 2.24, 1.61, 1.24, 0.98, 0.8, 0.66],
    reverseGearRatio: -3.18,
    finalDriveRatio: 3.94,
    hasClutchPedal: true,
    hasTorqueConverter: false,
    supportsAutomaticShifting: true,
    supportsManualSelection: true,
  },
  {
    transmissionId: 'dct-8',
    displayName: '8-Speed Dual-Clutch',
    transmissionKind: 'dct',
    forwardGearRatios: [
      3.69, 2.4, 1.71, 1.3, 1.0, 0.8, 0.65, 0.55,
    ],
    reverseGearRatio: -3.45,
    finalDriveRatio: 3.46,
    hasClutchPedal: true,
    hasTorqueConverter: false,
    supportsAutomaticShifting: true,
    supportsManualSelection: true,
  },
  {
    transmissionId: 'cvt',
    displayName: 'Continuously Variable (CVT)',
    transmissionKind: 'cvt',
    forwardGearRatios: [],
    reverseGearRatio: -2.5,
    finalDriveRatio: 5.42,
    hasClutchPedal: false,
    hasTorqueConverter: true,
    supportsAutomaticShifting: true,
    supportsManualSelection: false,
    cvtMinRatio: 2.35,
    cvtMaxRatio: 0.39,
  },
]

export const TRANSMISSION_PROFILES = Object.freeze(
  RAW_TRANSMISSION_PROFILES.map((raw) => defineTransmission(raw))
)

export const TRANSMISSION_PROFILE_BY_ID = Object.freeze(
  TRANSMISSION_PROFILES.reduce((accumulator, profile) => {
    accumulator[profile.transmissionId] = profile
    return accumulator
  }, {})
)

// Default selection: a modern-ish 6-speed automatic, which fits the current
// Reverse / Neutral / Drive selector model (no manual shift controls yet).
export const DEFAULT_TRANSMISSION_ID = 'automatic-6'

export const TRANSMISSION_PROFILE_KINDS = TRANSMISSION_KINDS
export const TRANSMISSION_PROFILE_ID_LIST = TRANSMISSION_PROFILE_IDS