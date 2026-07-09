// src/vehicle/dynamics/longitudinalTractionState.js

export const LONGITUDINAL_TRACTION_STATES = Object.freeze({
  AIRBORNE: 'airborne',
  STOPPED: 'stopped',
  ROLLING: 'rolling',
  SATURATED: 'saturated',
  DRIVE_SPIN: 'drive_spin',
  BRAKE_LOCK_TENDENCY: 'brake_lock_tendency',
})

const DEFAULT_TRACTION_STATE_THRESHOLDS = Object.freeze({
  tractionSlipRatioWarningThreshold: 0.08,
  tractionSlipRatioSaturationThreshold: 0.18,
  brakeLockGroundSpeedThresholdMetersPerSecond: 0.5,
  brakeLockWheelSurfaceSpeedThresholdMetersPerSecond: 0.25,
  driveSpinSlipRatioThreshold: 0.12,
})

const TORQUE_EPSILON_NEWTON_METERS = 0.001

export function createTractionStateSummary() {
  return {
    groundedWheelCount: 0,
    airborneWheelCount: 0,
    stoppedWheelCount: 0,
    rollingWheelCount: 0,
    saturatedWheelCount: 0,
    driveSpinningWheelCount: 0,
    brakeLockTendencyWheelCount: 0,
    serviceBrakeLockTendencyWheelCount: 0,
    parkingBrakeLockTendencyWheelCount: 0,
    maxAbsLongitudinalSlipRatio: 0,
    maxLongitudinalTireForceSaturationRatio: 0,
    dominantLongitudinalTractionState: LONGITUDINAL_TRACTION_STATES.STOPPED,
  }
}

export function resetTractionStateSummary(tractionStateSummary) {
  tractionStateSummary.groundedWheelCount = 0
  tractionStateSummary.airborneWheelCount = 0
  tractionStateSummary.stoppedWheelCount = 0
  tractionStateSummary.rollingWheelCount = 0
  tractionStateSummary.saturatedWheelCount = 0
  tractionStateSummary.driveSpinningWheelCount = 0
  tractionStateSummary.brakeLockTendencyWheelCount = 0
  tractionStateSummary.serviceBrakeLockTendencyWheelCount = 0
  tractionStateSummary.parkingBrakeLockTendencyWheelCount = 0
  tractionStateSummary.maxAbsLongitudinalSlipRatio = 0
  tractionStateSummary.maxLongitudinalTireForceSaturationRatio = 0
  tractionStateSummary.dominantLongitudinalTractionState =
    LONGITUDINAL_TRACTION_STATES.STOPPED

  return tractionStateSummary
}

export function updateWheelLongitudinalTractionState(
  wheelState,
  spec = {}
) {
  const tractionSlipRatioWarningThreshold = sanitizePositiveNumber(
    spec.tractionSlipRatioWarningThreshold,
    DEFAULT_TRACTION_STATE_THRESHOLDS.tractionSlipRatioWarningThreshold
  )
  const tractionSlipRatioSaturationThreshold = sanitizePositiveNumber(
    spec.tractionSlipRatioSaturationThreshold,
    DEFAULT_TRACTION_STATE_THRESHOLDS.tractionSlipRatioSaturationThreshold
  )
  const brakeLockGroundSpeedThresholdMetersPerSecond = sanitizePositiveNumber(
    spec.brakeLockGroundSpeedThresholdMetersPerSecond,
    DEFAULT_TRACTION_STATE_THRESHOLDS.brakeLockGroundSpeedThresholdMetersPerSecond
  )
  const brakeLockWheelSurfaceSpeedThresholdMetersPerSecond = sanitizePositiveNumber(
    spec.brakeLockWheelSurfaceSpeedThresholdMetersPerSecond,
    DEFAULT_TRACTION_STATE_THRESHOLDS.brakeLockWheelSurfaceSpeedThresholdMetersPerSecond
  )
  const driveSpinSlipRatioThreshold = sanitizePositiveNumber(
    spec.driveSpinSlipRatioThreshold,
    DEFAULT_TRACTION_STATE_THRESHOLDS.driveSpinSlipRatioThreshold
  )
  const groundSpeedMetersPerSecond = sanitizeNumber(
    wheelState.longitudinalGroundSpeedMetersPerSecond
  )
  const wheelSurfaceSpeedMetersPerSecond = sanitizeNumber(
    wheelState.wheelSurfaceSpeedMetersPerSecond
  )
  const groundSpeedAbsMetersPerSecond = Math.abs(groundSpeedMetersPerSecond)
  const wheelSurfaceSpeedAbsMetersPerSecond = Math.abs(
    wheelSurfaceSpeedMetersPerSecond
  )
  const longitudinalSlipRatioAbs = Math.abs(
    sanitizeNumber(wheelState.longitudinalSlipRatioAbs)
  )
  const longitudinalSlipRatio = sanitizeNumber(wheelState.longitudinalSlipRatio)
  const longitudinalTireForceSaturationRatio = Math.max(
    0,
    sanitizeNumber(wheelState.longitudinalTireForceSaturationRatio)
  )

  wheelState.longitudinalSlipRatioAbs = longitudinalSlipRatioAbs
  wheelState.longitudinalTireForceSaturationRatio =
    longitudinalTireForceSaturationRatio
  wheelState.isWheelAirborne = !wheelState.isGrounded
  wheelState.isWheelStopped = false
  wheelState.isDriveWheelSpinning = false
  wheelState.isBrakeLockTendency = false
  wheelState.brakeLockTendencySource = 'none'
  wheelState.isServiceBrakeLockTendency = false
  wheelState.isParkingBrakeLockTendency = false
  wheelState.isLongitudinalTractionSaturated = false
  wheelState.tractionStateSeverity01 = 0

  if (!wheelState.isGrounded) {
    setWheelTractionState(
      wheelState,
      LONGITUDINAL_TRACTION_STATES.AIRBORNE,
      'wheel contact state is airborne'
    )
    return wheelState
  }

  const isStopped =
    groundSpeedAbsMetersPerSecond <
      brakeLockGroundSpeedThresholdMetersPerSecond &&
    wheelSurfaceSpeedAbsMetersPerSecond <
      brakeLockWheelSurfaceSpeedThresholdMetersPerSecond

  if (isStopped) {
    wheelState.isWheelStopped = true
    setWheelTractionState(
      wheelState,
      LONGITUDINAL_TRACTION_STATES.STOPPED,
      'ground speed and wheel surface speed are both near zero'
    )
    return wheelState
  }

  const driveTorqueNewtonMeters = sanitizeNumber(
    wheelState.driveTorqueNewtonMeters
  )
  const serviceBrakeTorqueNewtonMeters = sanitizeNumber(
    wheelState.appliedServiceBrakeTorqueNewtonMeters
  )
  const parkingBrakeTorqueNewtonMeters = sanitizeNumber(
    wheelState.appliedParkingBrakeTorqueNewtonMeters
  )
  const totalBrakeTorqueNewtonMeters = Number.isFinite(
    wheelState.totalBrakeTorqueNewtonMeters
  )
    ? wheelState.totalBrakeTorqueNewtonMeters
    : sanitizeNumber(wheelState.appliedBrakeTorqueNewtonMeters)
  const driveTorqueDirection = Math.sign(driveTorqueNewtonMeters)
  const wheelSurfaceDirection = Math.sign(wheelSurfaceSpeedMetersPerSecond)
  const driveTorqueIsMeaningful =
    Math.abs(driveTorqueNewtonMeters) > TORQUE_EPSILON_NEWTON_METERS
  const wheelSurfaceMatchesDriveDirection =
    driveTorqueDirection !== 0 &&
    wheelSurfaceDirection !== 0 &&
    driveTorqueDirection === wheelSurfaceDirection

  if (
    wheelState.driven &&
    driveTorqueIsMeaningful &&
    wheelSurfaceMatchesDriveDirection &&
    longitudinalSlipRatio >= driveSpinSlipRatioThreshold
  ) {
    wheelState.isDriveWheelSpinning = true
    wheelState.tractionStateSeverity01 = clamp01(
      longitudinalSlipRatioAbs /
        tractionSlipRatioSaturationThreshold
    )
    setWheelTractionState(
      wheelState,
      LONGITUDINAL_TRACTION_STATES.DRIVE_SPIN,
      'driven wheel surface speed exceeds ground speed under drive torque'
    )
    return wheelState
  }

  const brakeTorqueIsMeaningful =
    totalBrakeTorqueNewtonMeters > TORQUE_EPSILON_NEWTON_METERS
  const brakeLockSpeedConditions =
    groundSpeedAbsMetersPerSecond >=
      brakeLockGroundSpeedThresholdMetersPerSecond &&
    (
      wheelSurfaceSpeedAbsMetersPerSecond <=
        brakeLockWheelSurfaceSpeedThresholdMetersPerSecond ||
      longitudinalSlipRatio <=
        -tractionSlipRatioWarningThreshold
    )

  if (brakeTorqueIsMeaningful && brakeLockSpeedConditions) {
    wheelState.isBrakeLockTendency = true
    wheelState.isServiceBrakeLockTendency =
      serviceBrakeTorqueNewtonMeters > TORQUE_EPSILON_NEWTON_METERS
    wheelState.isParkingBrakeLockTendency =
      parkingBrakeTorqueNewtonMeters > TORQUE_EPSILON_NEWTON_METERS
    wheelState.brakeLockTendencySource = selectBrakeLockTendencySource(
      wheelState
    )
    wheelState.tractionStateSeverity01 = clamp01(
      Math.max(
        longitudinalSlipRatioAbs /
          tractionSlipRatioSaturationThreshold,
        1 -
          wheelSurfaceSpeedAbsMetersPerSecond /
            brakeLockGroundSpeedThresholdMetersPerSecond
      )
    )
    setWheelTractionState(
      wheelState,
      LONGITUDINAL_TRACTION_STATES.BRAKE_LOCK_TENDENCY,
      'braked wheel surface speed is low relative to ground speed'
    )
    return wheelState
  }

  const isSaturated =
    Boolean(wheelState.isLongitudinalTireForceSaturated) ||
    longitudinalTireForceSaturationRatio >= 0.98

  if (isSaturated) {
    wheelState.isLongitudinalTractionSaturated = true
    wheelState.tractionStateSeverity01 = clamp01(
      Math.max(longitudinalTireForceSaturationRatio, longitudinalSlipRatioAbs)
    )
    setWheelTractionState(
      wheelState,
      LONGITUDINAL_TRACTION_STATES.SATURATED,
      'longitudinal tire force is near or beyond the traction cap'
    )
    return wheelState
  }

  wheelState.tractionStateSeverity01 = clamp01(
    longitudinalSlipRatioAbs / tractionSlipRatioWarningThreshold
  )
  setWheelTractionState(
    wheelState,
    LONGITUDINAL_TRACTION_STATES.ROLLING,
    'grounded wheel is rolling below traction warning thresholds'
  )

  return wheelState
}

export function updateLongitudinalTractionStateSummary(
  tractionStateSummary,
  wheelStates
) {
  resetTractionStateSummary(tractionStateSummary)

  for (const wheelState of wheelStates) {
    if (wheelState.isGrounded) {
      tractionStateSummary.groundedWheelCount += 1
    } else {
      tractionStateSummary.airborneWheelCount += 1
    }

    if (wheelState.isWheelStopped) {
      tractionStateSummary.stoppedWheelCount += 1
    }

    if (
      wheelState.longitudinalTractionState ===
      LONGITUDINAL_TRACTION_STATES.ROLLING
    ) {
      tractionStateSummary.rollingWheelCount += 1
    }

    if (wheelState.isLongitudinalTractionSaturated) {
      tractionStateSummary.saturatedWheelCount += 1
    }

    if (wheelState.isDriveWheelSpinning) {
      tractionStateSummary.driveSpinningWheelCount += 1
    }

    if (wheelState.isBrakeLockTendency) {
      tractionStateSummary.brakeLockTendencyWheelCount += 1
    }

    if (wheelState.isServiceBrakeLockTendency) {
      tractionStateSummary.serviceBrakeLockTendencyWheelCount += 1
    }

    if (wheelState.isParkingBrakeLockTendency) {
      tractionStateSummary.parkingBrakeLockTendencyWheelCount += 1
    }

    tractionStateSummary.maxAbsLongitudinalSlipRatio = Math.max(
      tractionStateSummary.maxAbsLongitudinalSlipRatio,
      Math.abs(sanitizeNumber(wheelState.longitudinalSlipRatioAbs))
    )

    tractionStateSummary.maxLongitudinalTireForceSaturationRatio = Math.max(
      tractionStateSummary.maxLongitudinalTireForceSaturationRatio,
      Math.max(0, sanitizeNumber(wheelState.longitudinalTireForceSaturationRatio))
    )
  }

  tractionStateSummary.dominantLongitudinalTractionState =
    selectDominantLongitudinalTractionState(tractionStateSummary)

  return tractionStateSummary
}

function selectBrakeLockTendencySource(wheelState) {
  if (
    wheelState.isServiceBrakeLockTendency &&
    wheelState.isParkingBrakeLockTendency
  ) {
    return 'service_and_parking_brake'
  }

  if (wheelState.isParkingBrakeLockTendency) return 'parking_brake'
  if (wheelState.isServiceBrakeLockTendency) return 'service_brake'

  return 'none'
}
function setWheelTractionState(wheelState, stateName, reason) {
  wheelState.longitudinalTractionState = stateName
  wheelState.longitudinalTractionStateReason = reason
}

function selectDominantLongitudinalTractionState(tractionStateSummary) {
  if (tractionStateSummary.brakeLockTendencyWheelCount > 0) {
    return LONGITUDINAL_TRACTION_STATES.BRAKE_LOCK_TENDENCY
  }

  if (tractionStateSummary.driveSpinningWheelCount > 0) {
    return LONGITUDINAL_TRACTION_STATES.DRIVE_SPIN
  }

  if (tractionStateSummary.saturatedWheelCount > 0) {
    return LONGITUDINAL_TRACTION_STATES.SATURATED
  }

  if (tractionStateSummary.groundedWheelCount === 0) {
    return LONGITUDINAL_TRACTION_STATES.AIRBORNE
  }

  if (
    tractionStateSummary.stoppedWheelCount ===
    tractionStateSummary.groundedWheelCount
  ) {
    return LONGITUDINAL_TRACTION_STATES.STOPPED
  }

  return LONGITUDINAL_TRACTION_STATES.ROLLING
}

function sanitizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeNumber(value) {
  return Number.isFinite(value) ? value : 0
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0

  return Math.min(Math.max(value, 0), 1)
}
