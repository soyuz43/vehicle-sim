// src/vehicle/dynamics/chassisMassPropertiesState.js

const DEFAULT_CHASSIS_MASS_PROPERTIES = Object.freeze({
  massKg: 1400,
  centerOfMassHeightMeters: 0.55,
  wheelbaseMeters: 2.9,
  frontTrackWidthMeters: 2.5,
  rearTrackWidthMeters: 2.5,
})

const AXLES = Object.freeze({
  FRONT: 'front',
  REAR: 'rear',
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
  let frontWheelCount = 0
  let rearWheelCount = 0
  let frontTotalZ = 0
  let rearTotalZ = 0
  let frontMinX = Number.POSITIVE_INFINITY
  let frontMaxX = Number.NEGATIVE_INFINITY
  let rearMinX = Number.POSITIVE_INFINITY
  let rearMaxX = Number.NEGATIVE_INFINITY

  for (const wheelState of wheelStates) {
    const localOffset = wheelState?.contactPatchLocal ?? wheelState?.localPosition
    const wheelOffsetRightMeters = sanitizeNumber(localOffset?.x)
    const wheelOffsetForwardMeters = sanitizeNumber(localOffset?.z)

    if (wheelState?.axle === AXLES.FRONT) {
      frontWheelCount += 1
      frontTotalZ += wheelOffsetForwardMeters
      frontMinX = Math.min(frontMinX, wheelOffsetRightMeters)
      frontMaxX = Math.max(frontMaxX, wheelOffsetRightMeters)
    } else if (wheelState?.axle === AXLES.REAR) {
      rearWheelCount += 1
      rearTotalZ += wheelOffsetForwardMeters
      rearMinX = Math.min(rearMinX, wheelOffsetRightMeters)
      rearMaxX = Math.max(rearMaxX, wheelOffsetRightMeters)
    }
  }

  const hasAxleGeometry = frontWheelCount > 0 && rearWheelCount > 0
  const frontAxleCenterZMeters =
    frontWheelCount > 0 ? frontTotalZ / frontWheelCount : 0
  const rearAxleCenterZMeters =
    rearWheelCount > 0 ? rearTotalZ / rearWheelCount : 0
  const derivedWheelbaseMeters = hasAxleGeometry
    ? Math.abs(frontAxleCenterZMeters - rearAxleCenterZMeters)
    : 0
  const derivedFrontTrackWidthMeters =
    frontWheelCount > 1 ? Math.max(0, frontMaxX - frontMinX) : 0
  const derivedRearTrackWidthMeters =
    rearWheelCount > 1 ? Math.max(0, rearMaxX - rearMinX) : 0

  return {
    frontAxleCenterZMeters,
    rearAxleCenterZMeters,
    hasAxleGeometry,
    wheelbaseMeters: sanitizePositiveNumber(
      derivedWheelbaseMeters,
      sanitizePositiveNumber(
        spec.wheelbaseMeters,
        DEFAULT_CHASSIS_MASS_PROPERTIES.wheelbaseMeters
      )
    ),
    frontTrackWidthMeters: sanitizePositiveNumber(
      derivedFrontTrackWidthMeters,
      sanitizePositiveNumber(
        spec.frontTrackWidthMeters,
        DEFAULT_CHASSIS_MASS_PROPERTIES.frontTrackWidthMeters
      )
    ),
    rearTrackWidthMeters: sanitizePositiveNumber(
      derivedRearTrackWidthMeters,
      sanitizePositiveNumber(
        spec.rearTrackWidthMeters,
        DEFAULT_CHASSIS_MASS_PROPERTIES.rearTrackWidthMeters
      )
    ),
    source:
      derivedWheelbaseMeters > 0 &&
      derivedFrontTrackWidthMeters > 0 &&
      derivedRearTrackWidthMeters > 0
        ? 'wheel-layout'
        : 'spec-fallback',
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