// src/vehicle/dynamics/lateralSlipAngleState.js

export const LATERAL_SLIP_STATES = Object.freeze({
  UNAVAILABLE: 'unavailable',
  STOPPED: 'stopped',
  TRACKING: 'tracking',
  WARNING: 'warning',
  HIGH: 'high',
})

const DEFAULT_LATERAL_SLIP_THRESHOLDS = Object.freeze({
  lateralSlipAngleWarningRadians: 0.08,
  lateralSlipAngleHighRadians: 0.16,
  lateralSlipMinGroundSpeedMetersPerSecond: 0.75,
})

const FORWARD_SPEED_EPSILON_METERS_PER_SECOND = 0.001
const RADIANS_TO_DEGREES = 180 / Math.PI

export function createLateralSlipSummary() {
  return {
    maxAbsLateralSlipAngleRadians: 0,
    maxAbsLateralSlipAngleDegrees: 0,
    highLateralSlipWheelCount: 0,
    lateralSlipWarningWheelCount: 0,
    sampledLateralSlipWheelCount: 0,
    dominantLateralSlipState: LATERAL_SLIP_STATES.UNAVAILABLE,
    frontAxleMaxAbsLateralSlipAngleRadians: 0,
    frontAxleMaxAbsLateralSlipAngleDegrees: 0,
    rearAxleMaxAbsLateralSlipAngleRadians: 0,
    rearAxleMaxAbsLateralSlipAngleDegrees: 0,
  }
}

export function resetLateralSlipSummary(lateralSlipSummary) {
  lateralSlipSummary.maxAbsLateralSlipAngleRadians = 0
  lateralSlipSummary.maxAbsLateralSlipAngleDegrees = 0
  lateralSlipSummary.highLateralSlipWheelCount = 0
  lateralSlipSummary.lateralSlipWarningWheelCount = 0
  lateralSlipSummary.sampledLateralSlipWheelCount = 0
  lateralSlipSummary.dominantLateralSlipState =
    LATERAL_SLIP_STATES.UNAVAILABLE
  lateralSlipSummary.frontAxleMaxAbsLateralSlipAngleRadians = 0
  lateralSlipSummary.frontAxleMaxAbsLateralSlipAngleDegrees = 0
  lateralSlipSummary.rearAxleMaxAbsLateralSlipAngleRadians = 0
  lateralSlipSummary.rearAxleMaxAbsLateralSlipAngleDegrees = 0

  return lateralSlipSummary
}

export function resetWheelLateralSlipAngleState(wheelState) {
  wheelState.lateralSlipAngleRadians = 0
  wheelState.lateralSlipAngleDegrees = 0
  wheelState.lateralSlipAngleAbsRadians = 0
  wheelState.hasLateralSlipAngleSample = false
  wheelState.wheelLocalForwardVelocityMetersPerSecond = 0
  wheelState.wheelLocalLateralVelocityMetersPerSecond = 0
  wheelState.lateralSlipState = LATERAL_SLIP_STATES.UNAVAILABLE
  wheelState.lateralSlipStateReason = 'reset'
  wheelState.isLateralSlipAngleHigh = false
  wheelState.lateralSlip = 0

  return wheelState
}

export function updateWheelLateralSlipAngleState(
  wheelState,
  planarMotion,
  spec = {}
) {
  const warningThresholdRadians = sanitizePositiveNumber(
    spec.lateralSlipAngleWarningRadians,
    DEFAULT_LATERAL_SLIP_THRESHOLDS.lateralSlipAngleWarningRadians
  )
  const highThresholdRadians = Math.max(
    warningThresholdRadians,
    sanitizePositiveNumber(
      spec.lateralSlipAngleHighRadians,
      DEFAULT_LATERAL_SLIP_THRESHOLDS.lateralSlipAngleHighRadians
    )
  )
  const minGroundSpeedMetersPerSecond = sanitizePositiveNumber(
    spec.lateralSlipMinGroundSpeedMetersPerSecond,
    DEFAULT_LATERAL_SLIP_THRESHOLDS.lateralSlipMinGroundSpeedMetersPerSecond
  )
  let wheelLocalForwardVelocityMetersPerSecond = 0
  let wheelLocalLateralVelocityMetersPerSecond = 0

  if (
    wheelState.isContactTangentBasisValid === true &&
    hasFiniteVector3(wheelState.contactPatchVelocityWorld) &&
    hasFiniteVector3(wheelState.contactForwardTangentWorld) &&
    hasFiniteVector3(wheelState.contactLateralTangentWorld)
  ) {
    // Contact-plane basis v1: velocity remains planar because the chassis is
    // planar, but its longitudinal/lateral projections now respect terrain
    // slope and steering rather than assuming a world-up contact plane.
    wheelLocalForwardVelocityMetersPerSecond = dotVector3(
      wheelState.contactPatchVelocityWorld,
      wheelState.contactForwardTangentWorld
    )
    wheelLocalLateralVelocityMetersPerSecond = dotVector3(
      wheelState.contactPatchVelocityWorld,
      wheelState.contactLateralTangentWorld
    )
  } else {
    const yawRateRadiansPerSecond = sanitizeNumber(
      planarMotion?.yawRateRadiansPerSecond
    )
    const chassisLocalForwardVelocityMetersPerSecond = sanitizeNumber(
      planarMotion?.localForwardVelocityMetersPerSecond
    )
    const chassisLocalLateralVelocityMetersPerSecond = sanitizeNumber(
      planarMotion?.localLateralVelocityMetersPerSecond
    )
    const contactPatchLocal = wheelState.contactPatchLocal ?? wheelState.localPosition
    const wheelOffsetRightMeters = sanitizeNumber(contactPatchLocal?.x)
    const wheelOffsetForwardMeters = sanitizeNumber(contactPatchLocal?.z)
    const steeringAngleRadians = sanitizeNumber(wheelState.steeringAngleRadians)
    const contactPatchLocalForwardVelocityMetersPerSecond =
      chassisLocalForwardVelocityMetersPerSecond -
      yawRateRadiansPerSecond * wheelOffsetRightMeters
    const contactPatchLocalLateralVelocityMetersPerSecond =
      chassisLocalLateralVelocityMetersPerSecond +
      yawRateRadiansPerSecond * wheelOffsetForwardMeters
    const steeringSin = Math.sin(steeringAngleRadians)
    const steeringCos = Math.cos(steeringAngleRadians)

    wheelLocalForwardVelocityMetersPerSecond =
      contactPatchLocalForwardVelocityMetersPerSecond * steeringCos +
      contactPatchLocalLateralVelocityMetersPerSecond * steeringSin
    wheelLocalLateralVelocityMetersPerSecond =
      contactPatchLocalLateralVelocityMetersPerSecond * steeringCos -
      contactPatchLocalForwardVelocityMetersPerSecond * steeringSin
  }

  wheelState.wheelLocalForwardVelocityMetersPerSecond =
    sanitizeNumber(wheelLocalForwardVelocityMetersPerSecond)
  wheelState.wheelLocalLateralVelocityMetersPerSecond =
    sanitizeNumber(wheelLocalLateralVelocityMetersPerSecond)
  wheelState.lateralSlipAngleRadians = 0
  wheelState.lateralSlipAngleDegrees = 0
  wheelState.lateralSlipAngleAbsRadians = 0
  wheelState.hasLateralSlipAngleSample = false
  wheelState.isLateralSlipAngleHigh = false
  wheelState.lateralSlip = 0

  if (!wheelState.isGrounded) {
    setWheelLateralSlipState(
      wheelState,
      LATERAL_SLIP_STATES.UNAVAILABLE,
      'wheel contact state is airborne'
    )
    return wheelState
  }

  const groundSpeedMetersPerSecond = Math.hypot(
    wheelState.wheelLocalForwardVelocityMetersPerSecond,
    wheelState.wheelLocalLateralVelocityMetersPerSecond
  )

  if (groundSpeedMetersPerSecond < minGroundSpeedMetersPerSecond) {
    setWheelLateralSlipState(
      wheelState,
      LATERAL_SLIP_STATES.STOPPED,
      'wheel contact patch speed is below lateral slip telemetry threshold'
    )
    return wheelState
  }

  // Positive slip means contact-patch velocity points toward the wheel's
  // local right axis. Using abs(forward) keeps reverse motion finite and
  // sign-stable near direction changes.
  const lateralSlipAngleRadians = Math.atan2(
    wheelState.wheelLocalLateralVelocityMetersPerSecond,
    Math.abs(wheelState.wheelLocalForwardVelocityMetersPerSecond) +
      FORWARD_SPEED_EPSILON_METERS_PER_SECOND
  )
  const lateralSlipAngleAbsRadians = Math.abs(lateralSlipAngleRadians)

  wheelState.lateralSlipAngleRadians = lateralSlipAngleRadians
  wheelState.lateralSlipAngleDegrees =
    lateralSlipAngleRadians * RADIANS_TO_DEGREES
  wheelState.lateralSlipAngleAbsRadians = lateralSlipAngleAbsRadians
  wheelState.hasLateralSlipAngleSample = true
  wheelState.lateralSlip = lateralSlipAngleRadians

  if (lateralSlipAngleAbsRadians >= highThresholdRadians) {
    wheelState.isLateralSlipAngleHigh = true
    setWheelLateralSlipState(
      wheelState,
      LATERAL_SLIP_STATES.HIGH,
      'lateral slip angle exceeds the high telemetry threshold'
    )
    return wheelState
  }

  if (lateralSlipAngleAbsRadians >= warningThresholdRadians) {
    setWheelLateralSlipState(
      wheelState,
      LATERAL_SLIP_STATES.WARNING,
      'lateral slip angle exceeds the warning telemetry threshold'
    )
    return wheelState
  }

  setWheelLateralSlipState(
    wheelState,
    LATERAL_SLIP_STATES.TRACKING,
    'grounded wheel is tracking below lateral slip warning threshold'
  )

  return wheelState
}

export function updateLateralSlipSummary(lateralSlipSummary, wheelStates) {
  resetLateralSlipSummary(lateralSlipSummary)

  let stoppedWheelCount = 0
  let unavailableWheelCount = 0

  for (const wheelState of wheelStates) {
    const lateralSlipState =
      wheelState.lateralSlipState ?? LATERAL_SLIP_STATES.UNAVAILABLE
    const lateralSlipAngleAbsRadians = Math.abs(
      sanitizeNumber(wheelState.lateralSlipAngleAbsRadians)
    )

    if (wheelState.hasLateralSlipAngleSample) {
      lateralSlipSummary.sampledLateralSlipWheelCount += 1
      lateralSlipSummary.maxAbsLateralSlipAngleRadians = Math.max(
        lateralSlipSummary.maxAbsLateralSlipAngleRadians,
        lateralSlipAngleAbsRadians
      )
    }

    if (lateralSlipState === LATERAL_SLIP_STATES.WARNING) {
      lateralSlipSummary.lateralSlipWarningWheelCount += 1
    }

    if (lateralSlipState === LATERAL_SLIP_STATES.HIGH) {
      lateralSlipSummary.highLateralSlipWheelCount += 1
    }

    if (lateralSlipState === LATERAL_SLIP_STATES.STOPPED) {
      stoppedWheelCount += 1
    }

    if (lateralSlipState === LATERAL_SLIP_STATES.UNAVAILABLE) {
      unavailableWheelCount += 1
    }

    if (wheelState.axle === 'front') {
      lateralSlipSummary.frontAxleMaxAbsLateralSlipAngleRadians = Math.max(
        lateralSlipSummary.frontAxleMaxAbsLateralSlipAngleRadians,
        lateralSlipAngleAbsRadians
      )
    } else if (wheelState.axle === 'rear') {
      lateralSlipSummary.rearAxleMaxAbsLateralSlipAngleRadians = Math.max(
        lateralSlipSummary.rearAxleMaxAbsLateralSlipAngleRadians,
        lateralSlipAngleAbsRadians
      )
    }
  }

  lateralSlipSummary.maxAbsLateralSlipAngleDegrees =
    lateralSlipSummary.maxAbsLateralSlipAngleRadians * RADIANS_TO_DEGREES
  lateralSlipSummary.frontAxleMaxAbsLateralSlipAngleDegrees =
    lateralSlipSummary.frontAxleMaxAbsLateralSlipAngleRadians *
    RADIANS_TO_DEGREES
  lateralSlipSummary.rearAxleMaxAbsLateralSlipAngleDegrees =
    lateralSlipSummary.rearAxleMaxAbsLateralSlipAngleRadians *
    RADIANS_TO_DEGREES
  lateralSlipSummary.dominantLateralSlipState = selectDominantLateralSlipState(
    lateralSlipSummary,
    stoppedWheelCount,
    unavailableWheelCount
  )

  return lateralSlipSummary
}

function setWheelLateralSlipState(wheelState, stateName, reason) {
  wheelState.lateralSlipState = stateName
  wheelState.lateralSlipStateReason = reason
}

function selectDominantLateralSlipState(
  lateralSlipSummary,
  stoppedWheelCount,
  unavailableWheelCount
) {
  if (lateralSlipSummary.highLateralSlipWheelCount > 0) {
    return LATERAL_SLIP_STATES.HIGH
  }

  if (lateralSlipSummary.lateralSlipWarningWheelCount > 0) {
    return LATERAL_SLIP_STATES.WARNING
  }

  const trackingWheelCount =
    lateralSlipSummary.sampledLateralSlipWheelCount -
    lateralSlipSummary.highLateralSlipWheelCount -
    lateralSlipSummary.lateralSlipWarningWheelCount

  if (trackingWheelCount > 0) {
    return LATERAL_SLIP_STATES.TRACKING
  }

  if (stoppedWheelCount > 0) {
    return LATERAL_SLIP_STATES.STOPPED
  }

  if (unavailableWheelCount > 0) {
    return LATERAL_SLIP_STATES.UNAVAILABLE
  }

  return LATERAL_SLIP_STATES.UNAVAILABLE
}

function hasFiniteVector3(vector) {
  return (
    vector &&
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  )
}

function dotVector3(a, b) {
  return sanitizeNumber(a.x) * sanitizeNumber(b.x) +
    sanitizeNumber(a.y) * sanitizeNumber(b.y) +
    sanitizeNumber(a.z) * sanitizeNumber(b.z)
}

function sanitizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeNumber(value) {
  return Number.isFinite(value) ? value : 0
}
