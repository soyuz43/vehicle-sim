// src/vehicle/dynamics/loadTransferState.js

import { resolveChassisGeometry } from './resolveChassisGeometry.js'

// The chassis geometry (wheelbase and track widths) is NOT a load-transfer
// fallback: it is resolved by resolveChassisGeometry, which reads the spec
// first so that the load transfer, the chassis mass properties and the
// vertical dynamics all agree on the same geometry.
const DEFAULT_LOAD_TRANSFER_SPEC = Object.freeze({
  centerOfMassHeightMeters: 0.55,
  minimumNormalForceNewtons: 0,
  loadTransferEnabled: true,
})

const AXLES = Object.freeze({
  FRONT: 'front',
  REAR: 'rear',
})

const SIDES = Object.freeze({
  LEFT: 'left',
  RIGHT: 'right',
})

const NORMAL_FORCE_EPSILON_NEWTONS = 0.001

export function createLoadTransferSummary() {
  return {
    totalStaticNormalForceNewtons: 0,
    totalDynamicNormalForceNewtons: 0,
    totalLongitudinalTransferAbsNewtons: 0,
    totalLateralTransferAbsNewtons: 0,
    frontAxleNormalForceNewtons: 0,
    rearAxleNormalForceNewtons: 0,
    leftSideNormalForceNewtons: 0,
    rightSideNormalForceNewtons: 0,
    maxWheelNormalForceNewtons: 0,
    minGroundedWheelNormalForceNewtons: 0,
    unloadedWheelCount: 0,
    totalBaseSupportNormalForceNewtons: 0,
    normalForceConservationErrorNewtons: 0,
  }
}

export function resetLoadTransferSummary(loadTransferSummary) {
  loadTransferSummary.totalStaticNormalForceNewtons = 0
  loadTransferSummary.totalDynamicNormalForceNewtons = 0
  loadTransferSummary.totalLongitudinalTransferAbsNewtons = 0
  loadTransferSummary.totalLateralTransferAbsNewtons = 0
  loadTransferSummary.frontAxleNormalForceNewtons = 0
  loadTransferSummary.rearAxleNormalForceNewtons = 0
  loadTransferSummary.leftSideNormalForceNewtons = 0
  loadTransferSummary.rightSideNormalForceNewtons = 0
  loadTransferSummary.maxWheelNormalForceNewtons = 0
  loadTransferSummary.minGroundedWheelNormalForceNewtons = 0
  loadTransferSummary.unloadedWheelCount = 0
  loadTransferSummary.totalBaseSupportNormalForceNewtons = 0
  loadTransferSummary.normalForceConservationErrorNewtons = 0

  return loadTransferSummary
}

export function resetWheelLoadTransferState(wheelState) {
  wheelState.staticNormalForceNewtons = 0
  wheelState.longitudinalLoadTransferNormalForceDeltaNewtons = 0
  wheelState.lateralLoadTransferNormalForceDeltaNewtons = 0
  wheelState.dynamicNormalForceNewtons = 0
  wheelState.loadTransferNormalForceDeltaNewtons = 0

  return wheelState
}

export function updateLoadTransferState(
  wheelStates,
  planarMotion,
  spec = {},
  loadTransferSummary
) {
  resetLoadTransferSummary(loadTransferSummary)

  for (const wheelState of wheelStates) {
    resetWheelLoadTransferState(wheelState)
    if (!wheelState.isGrounded) {
      wheelState.normalForceNewtons = 0
      wheelState.tractionLimitNewtons = 0
    }
  }

  const groundedWheelStates = wheelStates.filter((wheelState) => wheelState.isGrounded)
  if (groundedWheelStates.length === 0) {
    return loadTransferSummary
  }

  const gravityMetersPerSecondSquared = sanitizePositiveNumber(
    spec.gravityMetersPerSecondSquared,
    9.80665
  )
  const massKg = sanitizePositiveNumber(spec.massKg, 1)
  const totalStaticNormalForceNewtons =
    massKg * gravityMetersPerSecondSquared
  const minimumNormalForceNewtons = sanitizeNonNegativeNumber(
    spec.minimumNormalForceNewtons,
    DEFAULT_LOAD_TRANSFER_SPEC.minimumNormalForceNewtons
  )
  const loadTransferEnabled = spec.loadTransferEnabled !== false

  loadTransferSummary.totalStaticNormalForceNewtons =
    totalStaticNormalForceNewtons

  let rawBaseSupportNormalForceNewtons = 0
  for (const wheelState of groundedWheelStates) {
    rawBaseSupportNormalForceNewtons += sanitizeNonNegativeNumber(
      wheelState.baseNormalForceNewtons
    )
  }

  const hasSuspensionBaseSupport =
    rawBaseSupportNormalForceNewtons > NORMAL_FORCE_EPSILON_NEWTONS
  const baseSupportScale = hasSuspensionBaseSupport
    ? totalStaticNormalForceNewtons / rawBaseSupportNormalForceNewtons
    : 0
  const equalBaseSupportNormalForceNewtons =
    totalStaticNormalForceNewtons / groundedWheelStates.length

  for (const wheelState of groundedWheelStates) {
    const staticNormalForceNewtons = hasSuspensionBaseSupport
      ? sanitizeNonNegativeNumber(wheelState.baseNormalForceNewtons) *
        baseSupportScale
      : equalBaseSupportNormalForceNewtons

    wheelState.baseNormalForceNewtons = staticNormalForceNewtons
    wheelState.normalizedBaseNormalForceNewtons = staticNormalForceNewtons
    wheelState.staticNormalForceNewtons = staticNormalForceNewtons
    loadTransferSummary.totalBaseSupportNormalForceNewtons +=
      staticNormalForceNewtons
  }

  if (!loadTransferEnabled) {
    finalizeWheelNormalForces(
      groundedWheelStates,
      minimumNormalForceNewtons,
      loadTransferSummary
    )
    return loadTransferSummary
  }

  const geometry = deriveLoadTransferGeometry(wheelStates, spec)
  const localForwardAccelerationMetersPerSecondSquared = sanitizeNumber(
    planarMotion?.planarAccelerationLocalForwardMetersPerSecondSquared
  )
  const localLateralAccelerationMetersPerSecondSquared = sanitizeNumber(
    planarMotion?.planarAccelerationLocalLateralMetersPerSecondSquared
  )
  const centerOfMassHeightMeters = sanitizePositiveNumber(
    spec.centerOfMassHeightMeters,
    DEFAULT_LOAD_TRANSFER_SPEC.centerOfMassHeightMeters
  )
  const longitudinalTransferTotalNewtons =
    geometry.wheelbaseMeters > 0
      ? massKg *
        localForwardAccelerationMetersPerSecondSquared *
        centerOfMassHeightMeters /
        geometry.wheelbaseMeters
      : 0
  const frontGroundedWheelStates = groundedWheelStates.filter(
    (wheelState) => wheelState.axle === AXLES.FRONT
  )
  const rearGroundedWheelStates = groundedWheelStates.filter(
    (wheelState) => wheelState.axle === AXLES.REAR
  )

  distributeLongitudinalTransfer(
    frontGroundedWheelStates,
    rearGroundedWheelStates,
    longitudinalTransferTotalNewtons
  )

  distributeLateralTransferForAxle(
    groundedWheelStates,
    AXLES.FRONT,
    geometry.frontTrackWidthMeters,
    centerOfMassHeightMeters,
    localLateralAccelerationMetersPerSecondSquared,
    gravityMetersPerSecondSquared
  )
  distributeLateralTransferForAxle(
    groundedWheelStates,
    AXLES.REAR,
    geometry.rearTrackWidthMeters,
    centerOfMassHeightMeters,
    localLateralAccelerationMetersPerSecondSquared,
    gravityMetersPerSecondSquared
  )

  applyLoadTransferScale(
    groundedWheelStates,
    minimumNormalForceNewtons
  )
  finalizeWheelNormalForces(
    groundedWheelStates,
    minimumNormalForceNewtons,
    loadTransferSummary
  )

  return loadTransferSummary
}

function deriveLoadTransferGeometry(wheelStates, spec) {
  // The spec owns the wheelbase and the track widths. The rendered mesh is a
  // fixed hatchback shape, so reading the wheelbase from the wheel layout
  // made the load transfer disagree with the chassis mass properties and the
  // vertical dynamics for every non-stock chassis.
  const geometry = resolveChassisGeometry(wheelStates, spec)

  return {
    wheelbaseMeters: geometry.wheelbaseMeters,
    frontTrackWidthMeters: geometry.frontTrackWidthMeters,
    rearTrackWidthMeters: geometry.rearTrackWidthMeters,
  }
}

function distributeLongitudinalTransfer(
  frontGroundedWheelStates,
  rearGroundedWheelStates,
  longitudinalTransferTotalNewtons
) {
  if (
    frontGroundedWheelStates.length === 0 ||
    rearGroundedWheelStates.length === 0
  ) {
    return
  }

  const frontWheelDeltaNewtons =
    -longitudinalTransferTotalNewtons / frontGroundedWheelStates.length
  const rearWheelDeltaNewtons =
    longitudinalTransferTotalNewtons / rearGroundedWheelStates.length

  for (const wheelState of frontGroundedWheelStates) {
    wheelState.longitudinalLoadTransferNormalForceDeltaNewtons =
      frontWheelDeltaNewtons
  }

  for (const wheelState of rearGroundedWheelStates) {
    wheelState.longitudinalLoadTransferNormalForceDeltaNewtons =
      rearWheelDeltaNewtons
  }
}

function distributeLateralTransferForAxle(
  groundedWheelStates,
  axle,
  trackWidthMeters,
  centerOfMassHeightMeters,
  localLateralAccelerationMetersPerSecondSquared,
  gravityMetersPerSecondSquared
) {
  const axleGroundedWheelStates = groundedWheelStates.filter(
    (wheelState) => wheelState.axle === axle
  )
  if (axleGroundedWheelStates.length === 0 || trackWidthMeters <= 0) {
    return
  }

  const leftGroundedWheelStates = axleGroundedWheelStates.filter(
    (wheelState) => wheelState.side === SIDES.LEFT
  )
  const rightGroundedWheelStates = axleGroundedWheelStates.filter(
    (wheelState) => wheelState.side === SIDES.RIGHT
  )

  if (
    leftGroundedWheelStates.length === 0 ||
    rightGroundedWheelStates.length === 0
  ) {
    return
  }

  const axleStaticNormalForceNewtons = axleGroundedWheelStates.reduce(
    (totalNormalForceNewtons, wheelState) =>
      totalNormalForceNewtons + wheelState.staticNormalForceNewtons,
    0
  )
  const axleSupportedMassKg =
    gravityMetersPerSecondSquared > 0
      ? axleStaticNormalForceNewtons / gravityMetersPerSecondSquared
      : 0
  const lateralTransferTotalNewtons =
    axleSupportedMassKg *
    localLateralAccelerationMetersPerSecondSquared *
    centerOfMassHeightMeters /
    trackWidthMeters
  // Positive local lateral acceleration points toward vehicle local left
  // (+X), so the outside side of that turn is local right (-X). Positive
  // lateral transfer therefore adds load to right wheels and removes it from
  // left wheels.
  const leftWheelDeltaNewtons =
    -lateralTransferTotalNewtons / leftGroundedWheelStates.length
  const rightWheelDeltaNewtons =
    lateralTransferTotalNewtons / rightGroundedWheelStates.length
  for (const wheelState of leftGroundedWheelStates) {
    wheelState.lateralLoadTransferNormalForceDeltaNewtons =
      leftWheelDeltaNewtons
  }

  for (const wheelState of rightGroundedWheelStates) {
    wheelState.lateralLoadTransferNormalForceDeltaNewtons =
      rightWheelDeltaNewtons
  }
}

function applyLoadTransferScale(
  groundedWheelStates,
  minimumNormalForceNewtons
) {
  let loadTransferScale01 = 1

  for (const wheelState of groundedWheelStates) {
    const rawLoadTransferNormalForceDeltaNewtons =
      wheelState.longitudinalLoadTransferNormalForceDeltaNewtons +
      wheelState.lateralLoadTransferNormalForceDeltaNewtons

    if (rawLoadTransferNormalForceDeltaNewtons >= 0) {
      continue
    }

    const availableNormalForceRangeNewtons =
      wheelState.staticNormalForceNewtons - minimumNormalForceNewtons
    if (availableNormalForceRangeNewtons <= 0) {
      loadTransferScale01 = 0
      break
    }

    loadTransferScale01 = Math.min(
      loadTransferScale01,
      availableNormalForceRangeNewtons /
        Math.abs(rawLoadTransferNormalForceDeltaNewtons)
    )
  }

  loadTransferScale01 = clamp01(loadTransferScale01)

  for (const wheelState of groundedWheelStates) {
    wheelState.longitudinalLoadTransferNormalForceDeltaNewtons *=
      loadTransferScale01
    wheelState.lateralLoadTransferNormalForceDeltaNewtons *=
      loadTransferScale01
  }
}

function finalizeWheelNormalForces(
  groundedWheelStates,
  minimumNormalForceNewtons,
  loadTransferSummary
) {
  let minGroundedWheelNormalForceNewtons = Number.POSITIVE_INFINITY

  for (const wheelState of groundedWheelStates) {
    wheelState.loadTransferNormalForceDeltaNewtons =
      wheelState.longitudinalLoadTransferNormalForceDeltaNewtons +
      wheelState.lateralLoadTransferNormalForceDeltaNewtons
    wheelState.dynamicNormalForceNewtons = Math.max(
      minimumNormalForceNewtons,
      wheelState.staticNormalForceNewtons +
        wheelState.loadTransferNormalForceDeltaNewtons
    )
    wheelState.normalForceNewtons = wheelState.dynamicNormalForceNewtons
    loadTransferSummary.totalDynamicNormalForceNewtons +=
      wheelState.dynamicNormalForceNewtons
    loadTransferSummary.totalLongitudinalTransferAbsNewtons += Math.abs(
      wheelState.longitudinalLoadTransferNormalForceDeltaNewtons
    )
    loadTransferSummary.totalLateralTransferAbsNewtons += Math.abs(
      wheelState.lateralLoadTransferNormalForceDeltaNewtons
    )
    loadTransferSummary.maxWheelNormalForceNewtons = Math.max(
      loadTransferSummary.maxWheelNormalForceNewtons,
      wheelState.dynamicNormalForceNewtons
    )
    minGroundedWheelNormalForceNewtons = Math.min(
      minGroundedWheelNormalForceNewtons,
      wheelState.dynamicNormalForceNewtons
    )

    if (wheelState.axle === AXLES.FRONT) {
      loadTransferSummary.frontAxleNormalForceNewtons +=
        wheelState.dynamicNormalForceNewtons
    } else if (wheelState.axle === AXLES.REAR) {
      loadTransferSummary.rearAxleNormalForceNewtons +=
        wheelState.dynamicNormalForceNewtons
    }

    if (wheelState.side === SIDES.LEFT) {
      loadTransferSummary.leftSideNormalForceNewtons +=
        wheelState.dynamicNormalForceNewtons
    } else if (wheelState.side === SIDES.RIGHT) {
      loadTransferSummary.rightSideNormalForceNewtons +=
        wheelState.dynamicNormalForceNewtons
    }

    if (
      wheelState.dynamicNormalForceNewtons <=
      minimumNormalForceNewtons + NORMAL_FORCE_EPSILON_NEWTONS
    ) {
      loadTransferSummary.unloadedWheelCount += 1
    }

  }

  loadTransferSummary.minGroundedWheelNormalForceNewtons =
    groundedWheelStates.length > 0
      ? minGroundedWheelNormalForceNewtons
      : 0
  loadTransferSummary.totalLongitudinalTransferAbsNewtons *= 0.5
  loadTransferSummary.totalLateralTransferAbsNewtons *= 0.5
  loadTransferSummary.normalForceConservationErrorNewtons =
    loadTransferSummary.totalDynamicNormalForceNewtons -
    loadTransferSummary.totalStaticNormalForceNewtons
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
