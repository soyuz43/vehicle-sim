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

export function createRearDifferentialState(spec = {}) {
  return resetRearDifferentialState({}, spec)
}

export function resetRearDifferentialState(state = {}, spec = {}) {
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
  state.rearDifferentialInputDriveForceNewtons = 0
  state.rearDifferentialLeftOutputDriveForceNewtons = 0
  state.rearDifferentialRightOutputDriveForceNewtons = 0
  state.rearDifferentialLeftShare01 = 0.5
  state.rearDifferentialRightShare01 = 0.5
  state.rearDifferentialWheelSpeedDifferenceRadiansPerSecond = 0
  state.rearDifferentialTorqueBiasRatio = 0
  state.isRearDifferentialBiasing = false
  state.isRearDifferentialLockedApproximation = false

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

export function updateRearDifferentialDriveForceSplit(
  state = {},
  rearWheelStates = [],
  totalDriveForceNewtons = 0,
  spec = {}
) {
  resetRearDifferentialState(state, spec)

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
  state.rearDifferentialWheelSpeedDifferenceRadiansPerSecond =
    leftWheelState.angularVelocityRadiansPerSecond -
    rightWheelState.angularVelocityRadiansPerSecond

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
  const angularSpeedDifference01 =
    normalizeDifference01(
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