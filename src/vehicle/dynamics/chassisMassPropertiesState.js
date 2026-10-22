// src/vehicle/dynamics/chassisMassPropertiesState.js

import { resolveChassisGeometry } from './resolveChassisGeometry.js'

// The chassis geometry (wheelbase and track widths) is NOT a mass-properties
// fallback: it is resolved by resolveChassisGeometry, which reads the spec
// first so that the mass properties, the load transfer and the vertical
// dynamics all agree on the same geometry.
const DEFAULT_CHASSIS_MASS_PROPERTIES = Object.freeze({
  massKg: 1400,
  centerOfMassHeightMeters: 0.55,
})

export function createChassisMassPropertiesState() {
  return {
    available: false,
    massKg: 0,
    massKilograms: 0,
    centerOfMassOffsetMeters: {
      x: 0,
      y: 0,
      z: 0,
    },
    centerOfMassHeightMeters: 0,
    frontStaticWeightBias01: 0,
    rearStaticWeightBias01: 0,
    wheelbaseMeters: 0,
    frontTrackWidthMeters: 0,
    rearTrackWidthMeters: 0,
    yawMomentOfInertiaKgMeterSquared: 0,
    yawMomentOfInertiaSource: 'unavailable',
    geometrySource: 'unavailable',
  }
}

export function calculateChassisMassPropertiesState(spec = {}, wheelStates = []) {
  return updateChassisMassPropertiesState(
    createChassisMassPropertiesState(),
    spec,
    wheelStates
  )
}

export function updateChassisMassPropertiesState(
  state,
  spec = {},
  wheelStates = []
) {
  const massKg = sanitizePositiveNumber(
    spec.massKg,
    DEFAULT_CHASSIS_MASS_PROPERTIES.massKg
  )
  const centerOfMassOffsetMeters = spec.centerOfMassOffsetMeters ?? {}
  const centerOfMassHeightMeters = sanitizePositiveNumber(
    spec.centerOfMassHeightMeters,
    sanitizePositiveNumber(
      centerOfMassOffsetMeters.y,
      DEFAULT_CHASSIS_MASS_PROPERTIES.centerOfMassHeightMeters
    )
  )

  state.available = true
  state.massKg = massKg
  state.massKilograms = massKg
  state.centerOfMassHeightMeters = centerOfMassHeightMeters
  state.centerOfMassOffsetMeters.x = sanitizeNumber(centerOfMassOffsetMeters.x)
  state.centerOfMassOffsetMeters.y = centerOfMassHeightMeters
  state.centerOfMassOffsetMeters.z = sanitizeNumber(centerOfMassOffsetMeters.z)

  const geometry = deriveChassisGeometry(wheelStates, spec)
  state.wheelbaseMeters = geometry.wheelbaseMeters
  state.frontTrackWidthMeters = geometry.frontTrackWidthMeters
  state.rearTrackWidthMeters = geometry.rearTrackWidthMeters
  state.geometrySource = geometry.source

  const staticWeightBias = deriveStaticWeightBias(
    spec,
    geometry,
    state.centerOfMassOffsetMeters.z
  )
  state.frontStaticWeightBias01 = staticWeightBias.frontStaticWeightBias01
  state.rearStaticWeightBias01 = staticWeightBias.rearStaticWeightBias01

  const yawMomentOfInertia = deriveYawMomentOfInertia(
    spec,
    massKg,
    geometry
  )
  state.yawMomentOfInertiaKgMeterSquared =
    yawMomentOfInertia.yawMomentOfInertiaKgMeterSquared
  state.yawMomentOfInertiaSource = yawMomentOfInertia.source

  return state
}

function deriveChassisGeometry(wheelStates, spec) {
  // The spec owns the wheelbase and the track widths. The rendered mesh is a
  // fixed hatchback shape, so reading the geometry from the wheel layout made
  // the mass properties disagree with the load transfer and the vertical
  // dynamics for every non-stock chassis.
  const geometry = resolveChassisGeometry(wheelStates, spec)

  return {
    frontAxleCenterZMeters: geometry.frontAxleCenterZMeters,
    rearAxleCenterZMeters: geometry.rearAxleCenterZMeters,
    hasAxleGeometry: geometry.source !== 'default',
    wheelbaseMeters: geometry.wheelbaseMeters,
    frontTrackWidthMeters: geometry.frontTrackWidthMeters,
    rearTrackWidthMeters: geometry.rearTrackWidthMeters,
    source: geometry.source,
  }
}

function deriveStaticWeightBias(spec, geometry, centerOfMassForwardOffsetMeters) {
  const frontStaticWeightBias01 = sanitizeBias(spec.frontStaticWeightBias01)
  const rearStaticWeightBias01 = sanitizeBias(spec.rearStaticWeightBias01)

  if (frontStaticWeightBias01 !== null || rearStaticWeightBias01 !== null) {
    return normalizeStaticWeightBias(
      frontStaticWeightBias01 ?? 1 - rearStaticWeightBias01,
      rearStaticWeightBias01 ?? 1 - frontStaticWeightBias01
    )
  }

  const wheelbaseMeters = sanitizePositiveNumber(geometry.wheelbaseMeters, 0)
  if (wheelbaseMeters <= 0 || !geometry.hasAxleGeometry) {
    return normalizeStaticWeightBias(0.5, 0.5)
  }

  const frontBias01 = clamp01(
    (centerOfMassForwardOffsetMeters - geometry.rearAxleCenterZMeters) /
      wheelbaseMeters
  )

  return normalizeStaticWeightBias(frontBias01, 1 - frontBias01)
}

function deriveYawMomentOfInertia(spec, massKg, geometry) {
  const configuredYawMomentOfInertiaKgMeterSquared = sanitizePositiveNumber(
    spec.yawMomentOfInertiaKgMeterSquared,
    0
  )
  if (configuredYawMomentOfInertiaKgMeterSquared > 0) {
    return {
      yawMomentOfInertiaKgMeterSquared:
        configuredYawMomentOfInertiaKgMeterSquared,
      source: 'spec',
    }
  }

  const averageTrackWidthMeters =
    (geometry.frontTrackWidthMeters + geometry.rearTrackWidthMeters) * 0.5
  const derivedYawMomentOfInertiaKgMeterSquared =
    massKg *
    (geometry.wheelbaseMeters * geometry.wheelbaseMeters +
      averageTrackWidthMeters * averageTrackWidthMeters) /
    12

  return {
    yawMomentOfInertiaKgMeterSquared: sanitizePositiveNumber(
      derivedYawMomentOfInertiaKgMeterSquared,
      1
    ),
    source: 'derived-footprint',
  }
}

function normalizeStaticWeightBias(frontStaticWeightBias01, rearStaticWeightBias01) {
  const front = sanitizeNonNegativeNumber(frontStaticWeightBias01, 0)
  const rear = sanitizeNonNegativeNumber(rearStaticWeightBias01, 0)
  const total = front + rear

  if (total <= 0) {
    return {
      frontStaticWeightBias01: 0.5,
      rearStaticWeightBias01: 0.5,
    }
  }

  return {
    frontStaticWeightBias01: clamp01(front / total),
    rearStaticWeightBias01: clamp01(rear / total),
  }
}

function sanitizeBias(value) {
  if (!Number.isFinite(value)) return null
  return clamp01(value)
}

function sanitizePositiveNumber(value, fallback = 0) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeNonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function sanitizeNumber(value) {
  return Number.isFinite(value) ? value : 0
}

function clamp01(value) {
  return Math.min(1, Math.max(0, sanitizeNumber(value)))
}