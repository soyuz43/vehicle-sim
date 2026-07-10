// src/vehicle/powertrain/createEngineProfiles.js

// Static piston-engine profile data for common car engine families.
//
// This is PROFILE DATA ONLY. These profiles are surfaced through snapshots/HUD
// and documented for future engine RPM, gear-ratio, torque-curve, and engine
// braking work. They do NOT drive vehicle acceleration, braking, RPM, shifting,
// or engine braking in the current simulation. No physics reads these values.
//
// Scope (v1): inline-3, inline-4, inline-5, inline-6, V6, V8, V10, V12.
// Explicitly excluded: W engines, H engines, flat/boxer engines, rotary/Wankel,
// electric motors, hybrid systems, turbine engines, motorcycle oddities, and any
// full combustion simulation.

const ENGINE_PROFILE_IDS = Object.freeze([
  'inline-3',
  'inline-4',
  'inline-5',
  'inline-6',
  'v6',
  'v8',
  'v10',
  'v12',
])

const LAYOUT_KINDS = Object.freeze([
  'inline-3',
  'inline-4',
  'inline-5',
  'inline-6',
  'V6',
  'V8',
  'V10',
  'V12',
])

const ASPIRATION_KINDS = Object.freeze([
  'naturally-aspirated',
  'turbocharged',
  'supercharged',
])

const FUEL_KINDS = Object.freeze(['gasoline', 'diesel'])

function computePeakTorqueSamples(torqueCurveSamples) {
  let peakTorqueNewtonMeters = 0
  let peakTorqueRpm = 0

  for (const sample of torqueCurveSamples) {
    if (sample.torqueNewtonMeters > peakTorqueNewtonMeters) {
      peakTorqueNewtonMeters = sample.torqueNewtonMeters
      peakTorqueRpm = sample.rpm
    }
  }

  return { peakTorqueNewtonMeters, peakTorqueRpm }
}

function freezeTorqueCurveSamples(samples) {
  return Object.freeze(
    samples.map((sample) =>
      Object.freeze({
        rpm: sample.rpm,
        torqueNewtonMeters: sample.torqueNewtonMeters,
      })
    )
  )
}

function defineEngine(raw) {
  if (!ENGINE_PROFILE_IDS.includes(raw.engineId)) {
    throw new Error(`Unknown engine profile id: ${raw.engineId}`)
  }

  const { peakTorqueNewtonMeters, peakTorqueRpm } = computePeakTorqueSamples(
    raw.torqueCurveSamples
  )

  return Object.freeze({
    engineId: raw.engineId,
    displayName: raw.displayName,
    layoutKind: raw.layoutKind,
    cylinderCount: raw.cylinderCount,
    displacementLiters: raw.displacementLiters,
    aspirationKind: raw.aspirationKind,
    fuelKind: raw.fuelKind,
    idleRpm: raw.idleRpm,
    redlineRpm: raw.redlineRpm,
    torqueCurveSamples: freezeTorqueCurveSamples(raw.torqueCurveSamples),
    peakTorqueNewtonMeters,
    peakTorqueRpm,
    engineRotationalInertiaKgMeterSquared:
      raw.engineRotationalInertiaKgMeterSquared,
    // Closed-throttle drag reference data for FUTURE engine-braking work only.
    // This is a static profile field and is NOT consumed by any active physics.
    closedThrottleDragReferenceTorqueNewtonMeters:
      raw.closedThrottleDragReferenceTorqueNewtonMeters,
    closedThrottleDragReferenceRpm: raw.closedThrottleDragReferenceRpm,
    closedThrottleDragExponent: raw.closedThrottleDragExponent,
  })
}

const RAW_ENGINE_PROFILES = [
  {
    engineId: 'inline-3',
    displayName: '1.0L I3 Turbo',
    layoutKind: 'inline-3',
    cylinderCount: 3,
    displacementLiters: 1.0,
    aspirationKind: 'turbocharged',
    fuelKind: 'gasoline',
    idleRpm: 800,
    redlineRpm: 6500,
    torqueCurveSamples: [
      { rpm: 1000, torqueNewtonMeters: 90 },
      { rpm: 1500, torqueNewtonMeters: 140 },
      { rpm: 2000, torqueNewtonMeters: 170 },
      { rpm: 3000, torqueNewtonMeters: 170 },
      { rpm: 4000, torqueNewtonMeters: 150 },
      { rpm: 5000, torqueNewtonMeters: 120 },
      { rpm: 6000, torqueNewtonMeters: 95 },
    ],
    engineRotationalInertiaKgMeterSquared: 0.12,
    closedThrottleDragReferenceTorqueNewtonMeters: 6,
    closedThrottleDragReferenceRpm: 2000,
    closedThrottleDragExponent: 1.8,
  },
  {
    engineId: 'inline-4',
    displayName: '2.0L I4 Turbo',
    layoutKind: 'inline-4',
    cylinderCount: 4,
    displacementLiters: 2.0,
    aspirationKind: 'turbocharged',
    fuelKind: 'gasoline',
    idleRpm: 750,
    redlineRpm: 6800,
    torqueCurveSamples: [
      { rpm: 1000, torqueNewtonMeters: 180 },
      { rpm: 1500, torqueNewtonMeters: 350 },
      { rpm: 2500, torqueNewtonMeters: 350 },
      { rpm: 3500, torqueNewtonMeters: 340 },
      { rpm: 4500, torqueNewtonMeters: 300 },
      { rpm: 5500, torqueNewtonMeters: 240 },
      { rpm: 6500, torqueNewtonMeters: 180 },
    ],
    engineRotationalInertiaKgMeterSquared: 0.2,
    closedThrottleDragReferenceTorqueNewtonMeters: 9,
    closedThrottleDragReferenceRpm: 2500,
    closedThrottleDragExponent: 2.0,
  },
  {
    engineId: 'inline-5',
    displayName: '2.5L I5 Turbo',
    layoutKind: 'inline-5',
    cylinderCount: 5,
    displacementLiters: 2.5,
    aspirationKind: 'turbocharged',
    fuelKind: 'gasoline',
    idleRpm: 800,
    redlineRpm: 7000,
    torqueCurveSamples: [
      { rpm: 1000, torqueNewtonMeters: 200 },
      { rpm: 1800, torqueNewtonMeters: 450 },
      { rpm: 3000, torqueNewtonMeters: 440 },
      { rpm: 4500, torqueNewtonMeters: 380 },
      { rpm: 6000, torqueNewtonMeters: 300 },
      { rpm: 6800, torqueNewtonMeters: 230 },
    ],
    engineRotationalInertiaKgMeterSquared: 0.25,
    closedThrottleDragReferenceTorqueNewtonMeters: 10,
    closedThrottleDragReferenceRpm: 2500,
    closedThrottleDragExponent: 2.0,
  },
  {
    engineId: 'inline-6',
    displayName: '3.0L I6 Turbo',
    layoutKind: 'inline-6',
    cylinderCount: 6,
    displacementLiters: 3.0,
    aspirationKind: 'turbocharged',
    fuelKind: 'gasoline',
    idleRpm: 700,
    redlineRpm: 7000,
    torqueCurveSamples: [
      { rpm: 1000, torqueNewtonMeters: 250 },
      { rpm: 1600, torqueNewtonMeters: 500 },
      { rpm: 3000, torqueNewtonMeters: 500 },
      { rpm: 4500, torqueNewtonMeters: 480 },
      { rpm: 5500, torqueNewtonMeters: 420 },
      { rpm: 6500, torqueNewtonMeters: 320 },
      { rpm: 7000, torqueNewtonMeters: 250 },
    ],
    engineRotationalInertiaKgMeterSquared: 0.3,
    closedThrottleDragReferenceTorqueNewtonMeters: 12,
    closedThrottleDragReferenceRpm: 2500,
    closedThrottleDragExponent: 2.0,
  },
  {
    engineId: 'v6',
    displayName: '3.0L V6 Twin-Turbo',
    layoutKind: 'V6',
    cylinderCount: 6,
    displacementLiters: 3.0,
    aspirationKind: 'turbocharged',
    fuelKind: 'gasoline',
    idleRpm: 700,
    redlineRpm: 7200,
    torqueCurveSamples: [
      { rpm: 1000, torqueNewtonMeters: 250 },
      { rpm: 1800, torqueNewtonMeters: 550 },
      { rpm: 3500, torqueNewtonMeters: 550 },
      { rpm: 5000, torqueNewtonMeters: 520 },
      { rpm: 6000, torqueNewtonMeters: 440 },
      { rpm: 7000, torqueNewtonMeters: 350 },
    ],
    engineRotationalInertiaKgMeterSquared: 0.32,
    closedThrottleDragReferenceTorqueNewtonMeters: 12,
    closedThrottleDragReferenceRpm: 2500,
    closedThrottleDragExponent: 2.0,
  },
  {
    engineId: 'v8',
    displayName: '4.0L V8 Twin-Turbo',
    layoutKind: 'V8',
    cylinderCount: 8,
    displacementLiters: 4.0,
    aspirationKind: 'turbocharged',
    fuelKind: 'gasoline',
    idleRpm: 700,
    redlineRpm: 7200,
    torqueCurveSamples: [
      { rpm: 1000, torqueNewtonMeters: 300 },
      { rpm: 2000, torqueNewtonMeters: 650 },
      { rpm: 3500, torqueNewtonMeters: 650 },
      { rpm: 4500, torqueNewtonMeters: 620 },
      { rpm: 5500, torqueNewtonMeters: 540 },
      { rpm: 6500, torqueNewtonMeters: 420 },
      { rpm: 7200, torqueNewtonMeters: 330 },
    ],
    engineRotationalInertiaKgMeterSquared: 0.4,
    closedThrottleDragReferenceTorqueNewtonMeters: 15,
    closedThrottleDragReferenceRpm: 2500,
    closedThrottleDragExponent: 2.0,
  },
  {
    engineId: 'v10',
    displayName: '5.2L V10 NA',
    layoutKind: 'V10',
    cylinderCount: 10,
    displacementLiters: 5.2,
    aspirationKind: 'naturally-aspirated',
    fuelKind: 'gasoline',
    idleRpm: 800,
    redlineRpm: 8700,
    torqueCurveSamples: [
      { rpm: 1000, torqueNewtonMeters: 250 },
      { rpm: 2000, torqueNewtonMeters: 400 },
      { rpm: 3500, torqueNewtonMeters: 520 },
      { rpm: 5000, torqueNewtonMeters: 580 },
      { rpm: 6500, torqueNewtonMeters: 600 },
      { rpm: 7500, torqueNewtonMeters: 560 },
      { rpm: 8500, torqueNewtonMeters: 480 },
    ],
    engineRotationalInertiaKgMeterSquared: 0.5,
    closedThrottleDragReferenceTorqueNewtonMeters: 16,
    closedThrottleDragReferenceRpm: 3000,
    closedThrottleDragExponent: 2.0,
  },
  {
    engineId: 'v12',
    displayName: '6.0L V12 NA',
    layoutKind: 'V12',
    cylinderCount: 12,
    displacementLiters: 6.0,
    aspirationKind: 'naturally-aspirated',
    fuelKind: 'gasoline',
    idleRpm: 700,
    redlineRpm: 7500,
    torqueCurveSamples: [
      { rpm: 1000, torqueNewtonMeters: 300 },
      { rpm: 1500, torqueNewtonMeters: 650 },
      { rpm: 3000, torqueNewtonMeters: 650 },
      { rpm: 5000, torqueNewtonMeters: 620 },
      { rpm: 6000, torqueNewtonMeters: 540 },
      { rpm: 7000, torqueNewtonMeters: 420 },
      { rpm: 7500, torqueNewtonMeters: 340 },
    ],
    engineRotationalInertiaKgMeterSquared: 0.6,
    closedThrottleDragReferenceTorqueNewtonMeters: 18,
    closedThrottleDragReferenceRpm: 2500,
    closedThrottleDragExponent: 2.0,
  },
]

export const ENGINE_PROFILES = Object.freeze(
  RAW_ENGINE_PROFILES.map((raw) => defineEngine(raw))
)

export const ENGINE_PROFILE_BY_ID = Object.freeze(
  ENGINE_PROFILES.reduce((accumulator, profile) => {
    accumulator[profile.engineId] = profile
    return accumulator
  }, {})
)

// Default selection: a modern-ish inline-4 gasoline turbo.
export const DEFAULT_ENGINE_ID = 'inline-4'

export const ENGINE_PROFILE_KINDS = LAYOUT_KINDS
export const ENGINE_ASPIRATION_KINDS = ASPIRATION_KINDS
export const ENGINE_FUEL_KINDS = FUEL_KINDS
export const ENGINE_PROFILE_ID_LIST = ENGINE_PROFILE_IDS