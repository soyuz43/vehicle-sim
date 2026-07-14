// src/vehicle/dynamics/rearDifferentialState.js


export const REAR_DIFFERENTIAL_TYPES = Object.freeze({
  OPEN: 'open',
  LIMITED_SLIP: 'limited-slip',
  TORSEN: 'torsen',
  LOCKED: 'locked',
  WELDED: 'welded',
})

export const DEFAULT_REAR_DIFFERENTIAL_AVAILABLE_TYPES = Object.freeze([
  REAR_DIFFERENTIAL_TYPES.OPEN,
  REAR_DIFFERENTIAL_TYPES.LIMITED_SLIP,
  REAR_DIFFERENTIAL_TYPES.TORSEN,
  REAR_DIFFERENTIAL_TYPES.LOCKED,
  REAR_DIFFERENTIAL_TYPES.WELDED,
])

const SUPPORT_EPSILON = 0.001
const SHARE_EPSILON_01 = 0.0001
const TORQUE_EPSILON_NEWTON_METERS = 0.001

export function createRearDifferentialState(spec = {}) {
  return resetRearDifferentialState({}, spec)
}

export function resetRearDifferentialState(state = {}, spec = {}) {
  normalizeRearDifferentialConfigState(state, spec)
  resetRearDifferentialStepState(state, spec)

  return state
}

export function resetRearDifferentialStepState(state = {}, spec = {}) {
  normalizeRearDifferentialConfigState(state, spec)

  state.rearDifferentialInputDriveForceNewtons = 0
  state.rearDifferentialLeftOutputDriveForceNewtons = 0
  state.rearDifferentialRightOutputDriveForceNewtons = 0
  state.rearDifferentialInputDriveTorqueNewtonMeters = 0
  state.rearDifferentialLeftOutputDriveTorqueNewtonMeters = 0
  state.rearDifferentialRightOutputDriveTorqueNewtonMeters = 0
  state.rearDifferentialLeftShare01 = 0.5
  state.rearDifferentialRightShare01 = 0.5
  state.rearDifferentialLeftAngularVelocityRadiansPerSecond = 0
  state.rearDifferentialRightAngularVelocityRadiansPerSecond = 0
  state.rearDifferentialWheelSpeedDifferenceRadiansPerSecond = 0
  state.rearDifferentialWheelSpeedDifferenceAbsRadiansPerSecond = 0
  state.rearDifferentialTorqueBiasRatio =
    state.rearDifferentialType === REAR_DIFFERENTIAL_TYPES.TORSEN
      ? resolveTorsenDifferentialTorqueBiasRatio(spec)
      : 0
  state.rearDifferentialCouplingState = 'idle'
  state.rearDifferentialLeftCouplingTorqueNewtonMeters = 0
  state.rearDifferentialRightCouplingTorqueNewtonMeters = 0
  state.rearDifferentialLeftCouplingAngularImpulseNewtonMeterSeconds = 0
  state.rearDifferentialRightCouplingAngularImpulseNewtonMeterSeconds = 0
  state.rearDifferentialCommonAngularVelocityRadiansPerSecond = 0
  state.rearDifferentialLimitedSlipCouplingFraction01 = 0
  state.isRearDifferentialBiasing = false
  state.isRearDifferentialLockedApproximation = false
  state.isRearDifferentialHardSpeedCouplingApplied = false

  // Predictive redline axle-torque cap telemetry (owned by the differential
  // integration; the active powertrain source owns the requested torque).
  state.predictiveMaximumAxleDriveTorqueNewtonMeters = 0
  state.appliedAxleDriveTorqueNewtonMeters = 0
  state.isPredictiveRedlineLimiterActive = false
  state.redlineWheelAngularVelocityRadiansPerSecond = 0
  state.minimumWheelAngularVelocityHeadroomRadiansPerSecond = 0
  state.predictiveLimiterReason = 'none'
  state.requestedLeftOutputDriveTorqueNewtonMeters = 0
  state.requestedRightOutputDriveTorqueNewtonMeters = 0

  return state
}

export function setRearDifferentialType(state = {}, spec = {}, nextType) {
  const rearDifferentialAvailableTypes = resolveRearDifferentialAvailableTypes(
    state.rearDifferentialAvailableTypes ?? spec.rearDifferentialAvailableTypes
  )
  const rearDifferentialType = resolveRearDifferentialType(
    nextType,
    rearDifferentialAvailableTypes
  )

  state.rearDifferentialAvailableTypes = rearDifferentialAvailableTypes
  state.rearDifferentialType = rearDifferentialType
  state.rearDifferentialModeLabel = formatRearDifferentialModeLabel(
    rearDifferentialType
  )

  return state
}

export function resolveRearDifferentialDriveForceShares(
  state,
  leftWheelState,
  rightWheelState,
  inputDriveForceMagnitudeNewtons,
  spec
) {
  const resolvedRearDifferentialType = state.rearDifferentialType
  let leftShare01 = 0.5
  let rightShare01 = 0.5
  const supportScores = {
    left: calculateWheelSupportScore(leftWheelState),
    right: calculateWheelSupportScore(rightWheelState),
  }

  if (resolvedRearDifferentialType === REAR_DIFFERENTIAL_TYPES.LIMITED_SLIP) {
    const biasSide = selectPreferredBiasSide({
      leftWheelState,
      rightWheelState,
      supportScores,
      differentialSlipSpeedEpsilonRadiansPerSecond:
        resolveDifferentialSlipSpeedEpsilonRadiansPerSecond(spec),
    })
    const maxBiasShareDelta01 =
      clamp01(resolveLimitedSlipDifferentialLockFactor01(spec)) * 0.5
    const preloadForceNewtons = calculatePreloadForceNewtons(
      leftWheelState,
      rightWheelState,
      spec
    )
    const biasSignal01 = calculateBiasSignal01({
      leftWheelState,
      rightWheelState,
      supportScores,
      differentialSlipSpeedEpsilonRadiansPerSecond:
        resolveDifferentialSlipSpeedEpsilonRadiansPerSecond(spec),
    })
    const maximumBiasForceNewtons =
      inputDriveForceMagnitudeNewtons * maxBiasShareDelta01
    const biasForceMagnitudeNewtons =
      biasSide === null
        ? 0
        : Math.min(
            maximumBiasForceNewtons,
            maximumBiasForceNewtons * biasSignal01 + preloadForceNewtons
          )
    const biasShareDelta01 =
      inputDriveForceMagnitudeNewtons > 0
        ? Math.min(
            maxBiasShareDelta01,
            biasForceMagnitudeNewtons / inputDriveForceMagnitudeNewtons
          )
        : 0

    if (biasSide === 'left') {
      leftShare01 = 0.5 + biasShareDelta01
      rightShare01 = 0.5 - biasShareDelta01
    } else if (biasSide === 'right') {
      leftShare01 = 0.5 - biasShareDelta01
      rightShare01 = 0.5 + biasShareDelta01
    }
  } else if (resolvedRearDifferentialType === REAR_DIFFERENTIAL_TYPES.TORSEN) {
    const torqueBiasRatio = resolveTorsenDifferentialTorqueBiasRatio(spec)
    const strongSide = selectSupportDominantSide(
      supportScores,
      leftWheelState,
      rightWheelState,
      resolveDifferentialSlipSpeedEpsilonRadiansPerSecond(spec)
    )
    const totalSupportScore = supportScores.left + supportScores.right
    const maximumStrongShare01 = clamp(
      torqueBiasRatio / (1 + torqueBiasRatio),
      0.5,
      1
    )

    state.rearDifferentialTorqueBiasRatio = torqueBiasRatio

    if (strongSide !== null && totalSupportScore > SUPPORT_EPSILON) {
      const desiredStrongShare01 =
        strongSide === 'left'
          ? supportScores.left / totalSupportScore
          : supportScores.right / totalSupportScore
      const boundedStrongShare01 = clamp(
        desiredStrongShare01,
        0.5,
        maximumStrongShare01
      )

      if (strongSide === 'left') {
        leftShare01 = boundedStrongShare01
        rightShare01 = 1 - boundedStrongShare01
      } else {
        rightShare01 = boundedStrongShare01
        leftShare01 = 1 - boundedStrongShare01
      }
    }
  } else if (
    resolvedRearDifferentialType === REAR_DIFFERENTIAL_TYPES.LOCKED ||
    resolvedRearDifferentialType === REAR_DIFFERENTIAL_TYPES.WELDED
  ) {
    const supportWeightedLeftShare01 = calculateSupportWeightedLeftShare01(
      supportScores
    )
    const lockFactor01 = clamp01(resolveLockedDifferentialLockFactor01(spec))

    leftShare01 = lerp(0.5, supportWeightedLeftShare01, lockFactor01)
    rightShare01 = 1 - leftShare01
    state.isRearDifferentialLockedApproximation = true
  }

  leftShare01 = clamp01(leftShare01)
  rightShare01 = clamp01(1 - leftShare01)

  return { leftShare01, rightShare01 }
}

export function resolveRearDifferentialDriveTorqueShares(
  state = {},
  rearWheelStates = [],
  totalAxleDriveTorqueNewtonMeters = 0,
  spec = {}
) {
  const rearWheelPair = resolveRearWheelPair(rearWheelStates)
  const leftWheelState = normalizeRearWheelState(rearWheelPair.leftWheelState)
  const rightWheelState = normalizeRearWheelState(rearWheelPair.rightWheelState)
  const referenceRollingRadiusMeters =
    (leftWheelState.effectiveTireRollingRadiusMeters +
      rightWheelState.effectiveTireRollingRadiusMeters) /
    2
  const equivalentAxleDriveForceMagnitudeNewtons =
    referenceRollingRadiusMeters > 0
      ? Math.abs(sanitizeNumber(totalAxleDriveTorqueNewtonMeters)) /
        referenceRollingRadiusMeters
      : 0

  // The existing share-selection model is force-domain: its limited-slip
  // preload and maximum bias are both Newton values. Active axle torque is
  // converted only for share selection using the arithmetic-mean effective
  // rolling radius of the rear pair. The resulting shares are dimensionless;
  // this equivalent force never enters wheel or chassis force integration.
  return resolveRearDifferentialDriveForceShares(
    state,
    leftWheelState,
    rightWheelState,
    equivalentAxleDriveForceMagnitudeNewtons,
    spec
  )
}

export function updateRearDifferentialDriveForceSplit(
  state = {},
  rearWheelStates = [],
  totalDriveForceNewtons = 0,
  spec = {}
) {
  resetRearDifferentialStepState(state, spec)

  const safeTotalDriveForceNewtons = sanitizeNumber(totalDriveForceNewtons)
  const leftWheelState = normalizeRearWheelState(
    rearWheelStates.find((wheelState) => wheelState?.side === 'left') ??
      rearWheelStates[0]
  )
  const rightWheelState = normalizeRearWheelState(
    rearWheelStates.find((wheelState) => wheelState?.side === 'right') ??
      rearWheelStates.find((wheelState) => wheelState?.side !== 'left')
  )

  state.rearDifferentialInputDriveForceNewtons = safeTotalDriveForceNewtons
  assignRearDifferentialWheelSpeedTelemetry(
    state,
    leftWheelState.angularVelocityRadiansPerSecond,
    rightWheelState.angularVelocityRadiansPerSecond
  )

  const inputDriveForceMagnitudeNewtons = Math.abs(safeTotalDriveForceNewtons)
  const supportScores = {
    left: calculateWheelSupportScore(leftWheelState),
    right: calculateWheelSupportScore(rightWheelState),
  }
  const resolvedRearDifferentialType = state.rearDifferentialType
  let leftShare01 = 0.5
  let rightShare01 = 0.5

  if (resolvedRearDifferentialType === REAR_DIFFERENTIAL_TYPES.LIMITED_SLIP) {
    const biasSide = selectPreferredBiasSide({
      leftWheelState,
      rightWheelState,
      supportScores,
      differentialSlipSpeedEpsilonRadiansPerSecond:
        resolveDifferentialSlipSpeedEpsilonRadiansPerSecond(spec),
    })
    const maxBiasShareDelta01 =
      clamp01(resolveLimitedSlipDifferentialLockFactor01(spec)) * 0.5
    const preloadForceNewtons = calculatePreloadForceNewtons(
      leftWheelState,
      rightWheelState,
      spec
    )
    const biasSignal01 = calculateBiasSignal01({
      leftWheelState,
      rightWheelState,
      supportScores,
      differentialSlipSpeedEpsilonRadiansPerSecond:
        resolveDifferentialSlipSpeedEpsilonRadiansPerSecond(spec),
    })
    const maximumBiasForceNewtons =
      inputDriveForceMagnitudeNewtons * maxBiasShareDelta01
    const biasForceMagnitudeNewtons =
      biasSide === null
        ? 0
        : Math.min(
            maximumBiasForceNewtons,
            maximumBiasForceNewtons * biasSignal01 + preloadForceNewtons
          )
    const biasShareDelta01 =
      inputDriveForceMagnitudeNewtons > 0
        ? Math.min(
            maxBiasShareDelta01,
            biasForceMagnitudeNewtons / inputDriveForceMagnitudeNewtons
          )
        : 0

    if (biasSide === 'left') {
      leftShare01 = 0.5 + biasShareDelta01
      rightShare01 = 0.5 - biasShareDelta01
    } else if (biasSide === 'right') {
      leftShare01 = 0.5 - biasShareDelta01
      rightShare01 = 0.5 + biasShareDelta01
    }
  } else if (resolvedRearDifferentialType === REAR_DIFFERENTIAL_TYPES.TORSEN) {
    const torqueBiasRatio = resolveTorsenDifferentialTorqueBiasRatio(spec)
    const strongSide = selectSupportDominantSide(
      supportScores,
      leftWheelState,
      rightWheelState,
      resolveDifferentialSlipSpeedEpsilonRadiansPerSecond(spec)
    )
    const totalSupportScore = supportScores.left + supportScores.right
    const maximumStrongShare01 = clamp(
      torqueBiasRatio / (1 + torqueBiasRatio),
      0.5,
      1
    )

    state.rearDifferentialTorqueBiasRatio = torqueBiasRatio

    if (strongSide !== null && totalSupportScore > SUPPORT_EPSILON) {
      const desiredStrongShare01 =
        strongSide === 'left'
          ? supportScores.left / totalSupportScore
          : supportScores.right / totalSupportScore
      const boundedStrongShare01 = clamp(
        desiredStrongShare01,
        0.5,
        maximumStrongShare01
      )

      if (strongSide === 'left') {
        leftShare01 = boundedStrongShare01
        rightShare01 = 1 - boundedStrongShare01
      } else {
        rightShare01 = boundedStrongShare01
        leftShare01 = 1 - boundedStrongShare01
      }
    }
  } else if (
    resolvedRearDifferentialType === REAR_DIFFERENTIAL_TYPES.LOCKED ||
    resolvedRearDifferentialType === REAR_DIFFERENTIAL_TYPES.WELDED
  ) {
    const supportWeightedLeftShare01 = calculateSupportWeightedLeftShare01(
      supportScores
    )
    const lockFactor01 = clamp01(resolveLockedDifferentialLockFactor01(spec))

    leftShare01 = lerp(0.5, supportWeightedLeftShare01, lockFactor01)
    rightShare01 = 1 - leftShare01
    state.isRearDifferentialLockedApproximation = true
  }

  leftShare01 = clamp01(leftShare01)
  rightShare01 = clamp01(1 - leftShare01)

  state.rearDifferentialLeftShare01 = leftShare01
  state.rearDifferentialRightShare01 = rightShare01
  state.rearDifferentialLeftOutputDriveForceNewtons =
    safeTotalDriveForceNewtons * leftShare01
  state.rearDifferentialRightOutputDriveForceNewtons =
    safeTotalDriveForceNewtons -
    state.rearDifferentialLeftOutputDriveForceNewtons
  state.isRearDifferentialBiasing =
    Math.abs(state.rearDifferentialLeftShare01 - 0.5) > SHARE_EPSILON_01 ||
    Math.abs(state.rearDifferentialRightShare01 - 0.5) > SHARE_EPSILON_01

  return state
}

export function updateRearDifferentialDriveTorqueSplit(
  state = {},
  rearWheelStates = [],
  totalAxleDriveTorqueNewtonMeters = 0,
  spec = {}
) {
  resetRearDifferentialStepState(state, spec)

  const safeTotalAxleTorqueNewtonMeters = sanitizeNumber(
    totalAxleDriveTorqueNewtonMeters
  )
  const rearWheelPair = resolveRearWheelPair(rearWheelStates)
  const leftWheelState = normalizeRearWheelState(rearWheelPair.leftWheelState)
  const rightWheelState = normalizeRearWheelState(rearWheelPair.rightWheelState)

  state.rearDifferentialInputDriveTorqueNewtonMeters =
    safeTotalAxleTorqueNewtonMeters
  assignRearDifferentialWheelSpeedTelemetry(
    state,
    leftWheelState.angularVelocityRadiansPerSecond,
    rightWheelState.angularVelocityRadiansPerSecond
  )

  const shares = resolveRearDifferentialDriveTorqueShares(
    state,
    rearWheelStates,
    safeTotalAxleTorqueNewtonMeters,
    spec
  )
  const leftShare01 = shares.leftShare01
  const rightShare01 = shares.rightShare01

  state.rearDifferentialLeftShare01 = leftShare01
  state.rearDifferentialRightShare01 = rightShare01
  state.rearDifferentialLeftOutputDriveTorqueNewtonMeters =
    safeTotalAxleTorqueNewtonMeters * leftShare01
  state.rearDifferentialRightOutputDriveTorqueNewtonMeters =
    safeTotalAxleTorqueNewtonMeters -
    state.rearDifferentialLeftOutputDriveTorqueNewtonMeters
  state.isRearDifferentialBiasing =
    Math.abs(state.rearDifferentialLeftShare01 - 0.5) > SHARE_EPSILON_01 ||
    Math.abs(state.rearDifferentialRightShare01 - 0.5) > SHARE_EPSILON_01

  return state
}

export function updateRearDifferentialDriveTorqueSplitWithShares(
  state = {},
  rearWheelStates = [],
  totalAxleDriveTorqueNewtonMeters = 0,
  shares = {},
  spec = {}
) {
  resetRearDifferentialStepState(state, spec)

  const safeTotalAxleTorqueNewtonMeters = sanitizeNumber(
    totalAxleDriveTorqueNewtonMeters
  )
  const rearWheelPair = resolveRearWheelPair(rearWheelStates)
  const leftWheelState = normalizeRearWheelState(rearWheelPair.leftWheelState)
  const rightWheelState = normalizeRearWheelState(rearWheelPair.rightWheelState)

  state.rearDifferentialInputDriveTorqueNewtonMeters =
    safeTotalAxleTorqueNewtonMeters
  assignRearDifferentialWheelSpeedTelemetry(
    state,
    leftWheelState.angularVelocityRadiansPerSecond,
    rightWheelState.angularVelocityRadiansPerSecond
  )

  // Shares are resolved ONCE by the caller (from the requested axle torque)
  // and passed here so the capped axle torque is distributed through the EXACT
  // same resolved shares. This avoids a second, potentially state-dependent
  // share resolution and keeps axle-torque conservation exact.
  const leftShare01 = Number.isFinite(shares?.leftShare01)
    ? shares.leftShare01
    : 0.5
  const rightShare01 = Number.isFinite(shares?.rightShare01)
    ? shares.rightShare01
    : 1 - leftShare01

  state.rearDifferentialLeftShare01 = leftShare01
  state.rearDifferentialRightShare01 = rightShare01
  state.rearDifferentialLeftOutputDriveTorqueNewtonMeters =
    safeTotalAxleTorqueNewtonMeters * leftShare01
  state.rearDifferentialRightOutputDriveTorqueNewtonMeters =
    safeTotalAxleTorqueNewtonMeters -
    state.rearDifferentialLeftOutputDriveTorqueNewtonMeters
  state.isRearDifferentialBiasing =
    Math.abs(state.rearDifferentialLeftShare01 - 0.5) > SHARE_EPSILON_01 ||
    Math.abs(state.rearDifferentialRightShare01 - 0.5) > SHARE_EPSILON_01

  return state
}

export function updateRearDifferentialWheelSpeedCoupling(
  state = {},
  rearWheelStates = [],
  dtSeconds = 0,
  spec = {}
) {
  normalizeRearDifferentialConfigState(state, spec)

  const rearWheelPair = resolveRearWheelPair(rearWheelStates)
  const leftWheelState = rearWheelPair.leftWheelState
  const rightWheelState = rearWheelPair.rightWheelState

  if (!leftWheelState || !rightWheelState) {
    state.rearDifferentialCouplingState = 'unavailable'
    return state
  }

  const leftAngularVelocityRadiansPerSecond = sanitizeNumber(
    leftWheelState.angularVelocityRadiansPerSecond
  )
  const rightAngularVelocityRadiansPerSecond = sanitizeNumber(
    rightWheelState.angularVelocityRadiansPerSecond
  )

  assignRearDifferentialWheelSpeedTelemetry(
    state,
    leftAngularVelocityRadiansPerSecond,
    rightAngularVelocityRadiansPerSecond
  )

  if (state.rearDifferentialType === REAR_DIFFERENTIAL_TYPES.OPEN) {
    state.rearDifferentialCouplingState = 'uncoupled'
    return state
  }

  if (state.rearDifferentialType === REAR_DIFFERENTIAL_TYPES.TORSEN) {
    state.rearDifferentialTorqueBiasRatio =
      resolveTorsenDifferentialTorqueBiasRatio(spec)
    state.rearDifferentialCouplingState = 'torque-bias-only'
    return state
  }

  const leftWheelInertiaKgMeterSquared = sanitizePositiveNumber(
    leftWheelState.wheelInertiaKgMeterSquared
  )
  const rightWheelInertiaKgMeterSquared = sanitizePositiveNumber(
    rightWheelState.wheelInertiaKgMeterSquared
  )
  const safeDtSeconds = sanitizeNonNegativeNumber(dtSeconds)

  if (
    leftWheelInertiaKgMeterSquared <= 0 ||
    rightWheelInertiaKgMeterSquared <= 0
  ) {
    state.rearDifferentialCouplingState = 'invalid-inertia'
    return state
  }

  if (state.rearDifferentialType === REAR_DIFFERENTIAL_TYPES.LIMITED_SLIP) {
    return applyLimitedSlipDifferentialWheelSpeedCoupling({
      state,
      leftWheelState,
      rightWheelState,
      leftWheelInertiaKgMeterSquared,
      rightWheelInertiaKgMeterSquared,
      safeDtSeconds,
      spec,
    })
  }

  if (
    state.rearDifferentialType === REAR_DIFFERENTIAL_TYPES.LOCKED ||
    state.rearDifferentialType === REAR_DIFFERENTIAL_TYPES.WELDED
  ) {
    return applyLockedDifferentialWheelSpeedCoupling({
      state,
      leftWheelState,
      rightWheelState,
      leftWheelInertiaKgMeterSquared,
      rightWheelInertiaKgMeterSquared,
      safeDtSeconds,
      spec,
    })
  }

  state.rearDifferentialCouplingState = 'uncoupled'
  return state
}

export function formatRearDifferentialModeLabel(rearDifferentialType) {
  switch (rearDifferentialType) {
    case REAR_DIFFERENTIAL_TYPES.LIMITED_SLIP:
      return 'Limited-slip'
    case REAR_DIFFERENTIAL_TYPES.TORSEN:
      return 'Torsen'
    case REAR_DIFFERENTIAL_TYPES.LOCKED:
      return 'Locked'
    case REAR_DIFFERENTIAL_TYPES.WELDED:
      return 'Welded'
    case REAR_DIFFERENTIAL_TYPES.OPEN:
    default:
      return 'Open'
  }
}

function normalizeRearDifferentialConfigState(state = {}, spec = {}) {
  const rearDifferentialAvailableTypes = resolveRearDifferentialAvailableTypes(
    state.rearDifferentialAvailableTypes ?? spec.rearDifferentialAvailableTypes
  )
  const rearDifferentialType = resolveRearDifferentialType(
    state.rearDifferentialType ?? spec.rearDifferentialType,
    rearDifferentialAvailableTypes
  )

  state.rearDifferentialAvailableTypes = rearDifferentialAvailableTypes
  state.rearDifferentialType = rearDifferentialType
  state.rearDifferentialModeLabel = formatRearDifferentialModeLabel(
    rearDifferentialType
  )

  return state
}

function resolveRearWheelPair(rearWheelStates = []) {
  return {
    leftWheelState:
      rearWheelStates.find((wheelState) => wheelState?.side === 'left') ??
      rearWheelStates[0] ??
      null,
    rightWheelState:
      rearWheelStates.find((wheelState) => wheelState?.side === 'right') ??
      rearWheelStates.find((wheelState) => wheelState?.side !== 'left') ??
      null,
  }
}

function applyLimitedSlipDifferentialWheelSpeedCoupling({
  state,
  leftWheelState,
  rightWheelState,
  leftWheelInertiaKgMeterSquared,
  rightWheelInertiaKgMeterSquared,
  safeDtSeconds,
  spec,
}) {
  const angularSpeedDifferenceRadiansPerSecond =
    sanitizeNumber(leftWheelState.angularVelocityRadiansPerSecond) -
    sanitizeNumber(rightWheelState.angularVelocityRadiansPerSecond)
  const angularSpeedDifferenceAbsRadiansPerSecond = Math.abs(
    angularSpeedDifferenceRadiansPerSecond
  )
  const differentialSlipSpeedEpsilonRadiansPerSecond =
    resolveDifferentialSlipSpeedEpsilonRadiansPerSecond(spec)
  const limitedSlipLockFactor01 = resolveLimitedSlipDifferentialLockFactor01(
    spec
  )

  if (limitedSlipLockFactor01 <= 0) {
    state.rearDifferentialCouplingState = 'disabled'
    return state
  }

  if (
    angularSpeedDifferenceAbsRadiansPerSecond <=
    differentialSlipSpeedEpsilonRadiansPerSecond
  ) {
    state.rearDifferentialCouplingState = 'within-epsilon'
    return state
  }

  if (safeDtSeconds <= 0) {
    state.rearDifferentialCouplingState = 'dt-zero'
    return state
  }

  const preloadTorqueNewtonMeters =
    resolveLimitedSlipDifferentialPreloadTorqueNewtonMeters(spec) *
    limitedSlipLockFactor01
  const couplingGainNewtonMetersPerRadianPerSecond =
    resolveLimitedSlipDifferentialCouplingGainNewtonMetersPerRadianPerSecond(
      spec
    ) * limitedSlipLockFactor01
  const maximumCouplingTorqueNewtonMeters =
    resolveLimitedSlipDifferentialMaxCouplingTorqueNewtonMeters(spec) *
    limitedSlipLockFactor01
  const angularSpeedDifferenceExcessRadiansPerSecond = Math.max(
    0,
    angularSpeedDifferenceAbsRadiansPerSecond -
      differentialSlipSpeedEpsilonRadiansPerSecond
  )
  const requestedCouplingTorqueNewtonMeters =
    preloadTorqueNewtonMeters +
    couplingGainNewtonMetersPerRadianPerSecond *
      angularSpeedDifferenceExcessRadiansPerSecond
  const boundedCouplingTorqueNewtonMeters = Math.min(
    maximumCouplingTorqueNewtonMeters,
    requestedCouplingTorqueNewtonMeters
  )
  const maximumNoOvershootCouplingTorqueNewtonMeters =
    angularSpeedDifferenceAbsRadiansPerSecond /
    (
      safeDtSeconds *
      (
        1 / leftWheelInertiaKgMeterSquared +
        1 / rightWheelInertiaKgMeterSquared
      )
    )
  const appliedCouplingTorqueNewtonMeters = Math.min(
    boundedCouplingTorqueNewtonMeters,
    maximumNoOvershootCouplingTorqueNewtonMeters
  )

  if (appliedCouplingTorqueNewtonMeters <= TORQUE_EPSILON_NEWTON_METERS) {
    state.rearDifferentialCouplingState = 'within-epsilon'
    return state
  }

  const angularSpeedDifferenceDirection = Math.sign(
    angularSpeedDifferenceRadiansPerSecond
  )
  const leftCouplingTorqueNewtonMeters =
    -angularSpeedDifferenceDirection * appliedCouplingTorqueNewtonMeters
  const rightCouplingTorqueNewtonMeters =
    -leftCouplingTorqueNewtonMeters
  const leftAngularVelocityRadiansPerSecond =
    sanitizeNumber(leftWheelState.angularVelocityRadiansPerSecond) +
    leftCouplingTorqueNewtonMeters /
      leftWheelInertiaKgMeterSquared *
      safeDtSeconds
  const rightAngularVelocityRadiansPerSecond =
    sanitizeNumber(rightWheelState.angularVelocityRadiansPerSecond) +
    rightCouplingTorqueNewtonMeters /
      rightWheelInertiaKgMeterSquared *
      safeDtSeconds

  applyRearDifferentialCouplingResult({
    state,
    leftWheelState,
    rightWheelState,
    leftWheelInertiaKgMeterSquared,
    rightWheelInertiaKgMeterSquared,
    safeDtSeconds,
    leftAngularVelocityRadiansPerSecond,
    rightAngularVelocityRadiansPerSecond,
    couplingState:
      appliedCouplingTorqueNewtonMeters + TORQUE_EPSILON_NEWTON_METERS <
      boundedCouplingTorqueNewtonMeters
        ? 'no-overshoot-clamped'
        : 'coupling',
    limitedSlipCouplingFraction01:
      maximumCouplingTorqueNewtonMeters > 0
        ? appliedCouplingTorqueNewtonMeters /
          maximumCouplingTorqueNewtonMeters
        : 0,
  })

  return state
}

function applyLockedDifferentialWheelSpeedCoupling({
  state,
  leftWheelState,
  rightWheelState,
  leftWheelInertiaKgMeterSquared,
  rightWheelInertiaKgMeterSquared,
  safeDtSeconds,
  spec,
}) {
  state.isRearDifferentialLockedApproximation = true

  const leftAngularVelocityRadiansPerSecond = sanitizeNumber(
    leftWheelState.angularVelocityRadiansPerSecond
  )
  const rightAngularVelocityRadiansPerSecond = sanitizeNumber(
    rightWheelState.angularVelocityRadiansPerSecond
  )
  const totalWheelInertiaKgMeterSquared =
    leftWheelInertiaKgMeterSquared + rightWheelInertiaKgMeterSquared

  if (totalWheelInertiaKgMeterSquared <= 0) {
    state.rearDifferentialCouplingState = 'invalid-inertia'
    return state
  }

  const commonAngularVelocityRadiansPerSecond =
    (
      leftWheelInertiaKgMeterSquared * leftAngularVelocityRadiansPerSecond +
      rightWheelInertiaKgMeterSquared * rightAngularVelocityRadiansPerSecond
    ) / totalWheelInertiaKgMeterSquared
  const hardCouplingMatchEpsilonRadiansPerSecond =
    resolveRearDifferentialHardCouplingEpsilonRadiansPerSecond(spec)

  state.rearDifferentialCommonAngularVelocityRadiansPerSecond =
    commonAngularVelocityRadiansPerSecond

  if (safeDtSeconds <= 0) {
    state.rearDifferentialCouplingState =
      Math.abs(
        leftAngularVelocityRadiansPerSecond -
          rightAngularVelocityRadiansPerSecond
      ) <= hardCouplingMatchEpsilonRadiansPerSecond
        ? 'constrained'
        : 'dt-zero'
    return state
  }

  applyRearDifferentialCouplingResult({
    state,
    leftWheelState,
    rightWheelState,
    leftWheelInertiaKgMeterSquared,
    rightWheelInertiaKgMeterSquared,
    safeDtSeconds,
    leftAngularVelocityRadiansPerSecond:
      commonAngularVelocityRadiansPerSecond,
    rightAngularVelocityRadiansPerSecond:
      commonAngularVelocityRadiansPerSecond,
    couplingState: 'constrained',
    hardSpeedCouplingApplied: true,
    commonAngularVelocityRadiansPerSecond,
  })

  return state
}

function applyRearDifferentialCouplingResult({
  state,
  leftWheelState,
  rightWheelState,
  leftWheelInertiaKgMeterSquared,
  rightWheelInertiaKgMeterSquared,
  safeDtSeconds,
  leftAngularVelocityRadiansPerSecond,
  rightAngularVelocityRadiansPerSecond,
  couplingState,
  hardSpeedCouplingApplied = false,
  commonAngularVelocityRadiansPerSecond = 0,
  limitedSlipCouplingFraction01 = 0,
}) {
  const previousLeftAngularVelocityRadiansPerSecond = sanitizeNumber(
    leftWheelState.angularVelocityRadiansPerSecond
  )
  const previousRightAngularVelocityRadiansPerSecond = sanitizeNumber(
    rightWheelState.angularVelocityRadiansPerSecond
  )
  const nextLeftAngularVelocityRadiansPerSecond = sanitizeNumber(
    leftAngularVelocityRadiansPerSecond
  )
  const nextRightAngularVelocityRadiansPerSecond = sanitizeNumber(
    rightAngularVelocityRadiansPerSecond
  )
  const leftCouplingAngularImpulseNewtonMeterSeconds =
    leftWheelInertiaKgMeterSquared *
    (nextLeftAngularVelocityRadiansPerSecond -
      previousLeftAngularVelocityRadiansPerSecond)
  const rightCouplingAngularImpulseNewtonMeterSeconds =
    rightWheelInertiaKgMeterSquared *
    (nextRightAngularVelocityRadiansPerSecond -
      previousRightAngularVelocityRadiansPerSecond)
  const leftCouplingTorqueNewtonMeters =
    safeDtSeconds > 0
      ? leftCouplingAngularImpulseNewtonMeterSeconds / safeDtSeconds
      : 0
  const rightCouplingTorqueNewtonMeters =
    safeDtSeconds > 0
      ? rightCouplingAngularImpulseNewtonMeterSeconds / safeDtSeconds
      : 0

  applyRearDifferentialWheelSpeedToWheelState(
    leftWheelState,
    previousLeftAngularVelocityRadiansPerSecond,
    nextLeftAngularVelocityRadiansPerSecond,
    leftCouplingTorqueNewtonMeters,
    leftCouplingAngularImpulseNewtonMeterSeconds,
    safeDtSeconds,
    leftWheelInertiaKgMeterSquared
  )
  applyRearDifferentialWheelSpeedToWheelState(
    rightWheelState,
    previousRightAngularVelocityRadiansPerSecond,
    nextRightAngularVelocityRadiansPerSecond,
    rightCouplingTorqueNewtonMeters,
    rightCouplingAngularImpulseNewtonMeterSeconds,
    safeDtSeconds,
    rightWheelInertiaKgMeterSquared
  )

  state.rearDifferentialCouplingState = couplingState
  state.rearDifferentialLeftCouplingTorqueNewtonMeters =
    leftCouplingTorqueNewtonMeters
  state.rearDifferentialRightCouplingTorqueNewtonMeters =
    rightCouplingTorqueNewtonMeters
  state.rearDifferentialLeftCouplingAngularImpulseNewtonMeterSeconds =
    leftCouplingAngularImpulseNewtonMeterSeconds
  state.rearDifferentialRightCouplingAngularImpulseNewtonMeterSeconds =
    rightCouplingAngularImpulseNewtonMeterSeconds
  state.rearDifferentialCommonAngularVelocityRadiansPerSecond =
    hardSpeedCouplingApplied
      ? commonAngularVelocityRadiansPerSecond
      : 0
  state.rearDifferentialLimitedSlipCouplingFraction01 = clamp01(
    limitedSlipCouplingFraction01
  )
  state.isRearDifferentialHardSpeedCouplingApplied =
    hardSpeedCouplingApplied

  assignRearDifferentialWheelSpeedTelemetry(
    state,
    nextLeftAngularVelocityRadiansPerSecond,
    nextRightAngularVelocityRadiansPerSecond
  )

  return state
}

function applyRearDifferentialWheelSpeedToWheelState(
  wheelState,
  previousAngularVelocityRadiansPerSecond,
  nextAngularVelocityRadiansPerSecond,
  couplingTorqueNewtonMeters,
  couplingAngularImpulseNewtonMeterSeconds,
  dtSeconds,
  wheelInertiaKgMeterSquared
) {
  wheelState.angularVelocityRadiansPerSecond =
    nextAngularVelocityRadiansPerSecond
  wheelState.differentialCouplingTorqueNewtonMeters =
    couplingTorqueNewtonMeters
  wheelState.differentialCouplingAngularImpulseNewtonMeterSeconds =
    couplingAngularImpulseNewtonMeterSeconds
  wheelState.netTorqueNewtonMeters =
    sanitizeNumber(wheelState.netTorqueNewtonMeters) +
    couplingTorqueNewtonMeters

  if (wheelInertiaKgMeterSquared > 0) {
    wheelState.angularAccelerationRadiansPerSecondSquared =
      sanitizeNumber(wheelState.angularAccelerationRadiansPerSecondSquared) +
      couplingTorqueNewtonMeters / wheelInertiaKgMeterSquared
  }

  if (dtSeconds > 0) {
    wheelState.spinAngleRadians =
      sanitizeNumber(wheelState.spinAngleRadians) +
      (nextAngularVelocityRadiansPerSecond -
        previousAngularVelocityRadiansPerSecond) *
        dtSeconds
  }

  wheelState.rollingSurfaceSpeedMetersPerSecond =
    nextAngularVelocityRadiansPerSecond *
    resolveWheelRollingRadiusMeters(wheelState)
}

function assignRearDifferentialWheelSpeedTelemetry(
  state,
  leftAngularVelocityRadiansPerSecond,
  rightAngularVelocityRadiansPerSecond
) {
  state.rearDifferentialLeftAngularVelocityRadiansPerSecond = sanitizeNumber(
    leftAngularVelocityRadiansPerSecond
  )
  state.rearDifferentialRightAngularVelocityRadiansPerSecond = sanitizeNumber(
    rightAngularVelocityRadiansPerSecond
  )
  state.rearDifferentialWheelSpeedDifferenceRadiansPerSecond =
    state.rearDifferentialLeftAngularVelocityRadiansPerSecond -
    state.rearDifferentialRightAngularVelocityRadiansPerSecond
  state.rearDifferentialWheelSpeedDifferenceAbsRadiansPerSecond = Math.abs(
    state.rearDifferentialWheelSpeedDifferenceRadiansPerSecond
  )
}

function normalizeRearWheelState(wheelState = {}) {
  return {
    side: wheelState.side === 'right' ? 'right' : 'left',
    isGrounded: wheelState.isGrounded === true,
    tractionLimitNewtons: sanitizeNonNegativeNumber(
      wheelState.tractionLimitNewtons
    ),
    angularVelocityRadiansPerSecond: sanitizeNumber(
      wheelState.angularVelocityRadiansPerSecond
    ),
    angularSpeedRadiansPerSecond: Math.abs(
      sanitizeNumber(wheelState.angularVelocityRadiansPerSecond)
    ),
    longitudinalSlipRatioAbs: Math.abs(
      sanitizeNumber(
        wheelState.longitudinalSlipRatioAbs ?? wheelState.longitudinalSlipRatio
      )
    ),
    effectiveTireRollingRadiusMeters: sanitizePositiveNumber(
      wheelState.effectiveTireRollingRadiusMeters,
      sanitizePositiveNumber(wheelState.radius, 0.48)
    ),
  }
}

function calculateWheelSupportScore(wheelState) {
  if (!wheelState.isGrounded) return 0

  return (
    sanitizeNonNegativeNumber(wheelState.tractionLimitNewtons) /
    (1 + Math.abs(sanitizeNumber(wheelState.longitudinalSlipRatioAbs)))
  )
}

function calculateBiasSignal01({
  leftWheelState,
  rightWheelState,
  supportScores,
  differentialSlipSpeedEpsilonRadiansPerSecond,
}) {
  const totalSupportScore = supportScores.left + supportScores.right
  const supportDifference01 =
    totalSupportScore > SUPPORT_EPSILON
      ? Math.abs(supportScores.left - supportScores.right) / totalSupportScore
      : 0
  const angularSpeedDifference01 = normalizeDifference01(
    leftWheelState.angularSpeedRadiansPerSecond,
    rightWheelState.angularSpeedRadiansPerSecond,
    differentialSlipSpeedEpsilonRadiansPerSecond
  )
  const slipDifference01 = normalizeDifference01(
    leftWheelState.longitudinalSlipRatioAbs,
    rightWheelState.longitudinalSlipRatioAbs,
    0.02
  )

  return clamp01(
    Math.max(supportDifference01, angularSpeedDifference01, slipDifference01)
  )
}

function calculatePreloadForceNewtons(leftWheelState, rightWheelState, spec = {}) {
  const preloadTorqueNewtonMeters =
    resolveLimitedSlipDifferentialPreloadTorqueNewtonMeters(spec)
  const averageRollingRadiusMeters =
    (leftWheelState.effectiveTireRollingRadiusMeters +
      rightWheelState.effectiveTireRollingRadiusMeters) /
    2

  if (averageRollingRadiusMeters <= 0) return 0

  return preloadTorqueNewtonMeters / averageRollingRadiusMeters
}

function calculateSupportWeightedLeftShare01(supportScores) {
  const totalSupportScore = supportScores.left + supportScores.right

  if (totalSupportScore <= SUPPORT_EPSILON) return 0.5

  return clamp01(supportScores.left / totalSupportScore)
}

function selectPreferredBiasSide({
  leftWheelState,
  rightWheelState,
  supportScores,
  differentialSlipSpeedEpsilonRadiansPerSecond,
}) {
  if (leftWheelState.isGrounded && !rightWheelState.isGrounded) return 'left'
  if (rightWheelState.isGrounded && !leftWheelState.isGrounded) return 'right'

  if (Math.abs(supportScores.left - supportScores.right) > SUPPORT_EPSILON) {
    return supportScores.left > supportScores.right ? 'left' : 'right'
  }

  const angularVelocityDifferenceRadiansPerSecond =
    leftWheelState.angularSpeedRadiansPerSecond -
    rightWheelState.angularSpeedRadiansPerSecond

  if (
    Math.abs(angularVelocityDifferenceRadiansPerSecond) >
    differentialSlipSpeedEpsilonRadiansPerSecond
  ) {
    return angularVelocityDifferenceRadiansPerSecond < 0 ? 'left' : 'right'
  }

  const slipRatioDifference =
    leftWheelState.longitudinalSlipRatioAbs -
    rightWheelState.longitudinalSlipRatioAbs

  if (Math.abs(slipRatioDifference) > 0.02) {
    return slipRatioDifference < 0 ? 'left' : 'right'
  }

  return null
}

function selectSupportDominantSide(
  supportScores,
  leftWheelState,
  rightWheelState,
  differentialSlipSpeedEpsilonRadiansPerSecond
) {
  if (Math.abs(supportScores.left - supportScores.right) > SUPPORT_EPSILON) {
    return supportScores.left > supportScores.right ? 'left' : 'right'
  }

  return selectPreferredBiasSide({
    leftWheelState,
    rightWheelState,
    supportScores,
    differentialSlipSpeedEpsilonRadiansPerSecond,
  })
}

function resolveRearDifferentialAvailableTypes(value) {
  if (!Array.isArray(value)) {
    return [...DEFAULT_REAR_DIFFERENTIAL_AVAILABLE_TYPES]
  }

  const availableTypes = value.filter((type) =>
    DEFAULT_REAR_DIFFERENTIAL_AVAILABLE_TYPES.includes(type)
  )

  return availableTypes.length > 0
    ? [...new Set(availableTypes)]
    : [...DEFAULT_REAR_DIFFERENTIAL_AVAILABLE_TYPES]
}

function resolveRearDifferentialType(value, rearDifferentialAvailableTypes) {
  const availableTypes = Array.isArray(rearDifferentialAvailableTypes)
    ? rearDifferentialAvailableTypes
    : DEFAULT_REAR_DIFFERENTIAL_AVAILABLE_TYPES

  return availableTypes.includes(value)
    ? value
    : REAR_DIFFERENTIAL_TYPES.OPEN
}

function resolveLimitedSlipDifferentialLockFactor01(spec = {}) {
  return clamp01(spec.limitedSlipDifferentialLockFactor01 ?? 0.35)
}

function resolveLimitedSlipDifferentialPreloadTorqueNewtonMeters(spec = {}) {
  return sanitizeNonNegativeNumber(
    spec.limitedSlipDifferentialPreloadTorqueNewtonMeters,
    80
  )
}

function resolveLimitedSlipDifferentialCouplingGainNewtonMetersPerRadianPerSecond(
  spec = {}
) {
  return sanitizeNonNegativeNumber(
    spec.limitedSlipDifferentialCouplingGainNewtonMetersPerRadianPerSecond,
    600
  )
}

function resolveLimitedSlipDifferentialMaxCouplingTorqueNewtonMeters(
  spec = {}
) {
  return sanitizeNonNegativeNumber(
    spec.limitedSlipDifferentialMaxCouplingTorqueNewtonMeters,
    1800
  )
}

function resolveTorsenDifferentialTorqueBiasRatio(spec = {}) {
  return sanitizePositiveNumber(spec.torsenDifferentialTorqueBiasRatio, 3)
}

function resolveLockedDifferentialLockFactor01(spec = {}) {
  return clamp01(spec.lockedDifferentialLockFactor01 ?? 1)
}

function resolveDifferentialSlipSpeedEpsilonRadiansPerSecond(spec = {}) {
  return sanitizePositiveNumber(
    spec.differentialSlipSpeedEpsilonRadiansPerSecond,
    0.5
  )
}

function resolveRearDifferentialHardCouplingEpsilonRadiansPerSecond(spec = {}) {
  return sanitizePositiveNumber(
    spec.rearDifferentialHardCouplingEpsilonRadiansPerSecond,
    0.001
  )
}

function resolveWheelRollingRadiusMeters(wheelState = {}) {
  const effectiveTireRollingRadiusMeters = sanitizePositiveNumber(
    wheelState.effectiveTireRollingRadiusMeters,
    sanitizePositiveNumber(wheelState.radius, 0.48)
  )

  return effectiveTireRollingRadiusMeters > 0
    ? effectiveTireRollingRadiusMeters
    : 0.48
}

function normalizeDifference01(leftValue, rightValue, epsilon) {
  const safeLeftValue = Math.abs(sanitizeNumber(leftValue))
  const safeRightValue = Math.abs(sanitizeNumber(rightValue))
  const safeEpsilon = sanitizePositiveNumber(epsilon, 0.001)
  const denominator = Math.max(safeLeftValue, safeRightValue, safeEpsilon)

  return denominator > 0
    ? Math.abs(safeLeftValue - safeRightValue) / denominator
    : 0
}

function sanitizePositiveNumber(value, fallback = 0) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeNonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function lerp(a, b, t) {
  return a + (b - a) * clamp01(t)
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function clamp01(value) {
  return clamp(sanitizeNumber(value), 0, 1)
}