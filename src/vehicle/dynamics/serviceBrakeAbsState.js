// src/vehicle/dynamics/serviceBrakeAbsState.js

export const SERVICE_BRAKE_ABS_STATES = Object.freeze({
  INACTIVE: 'inactive',
  MONITORING: 'monitoring',
  RELEASING: 'releasing',
  HOLDING: 'holding',
  REAPPLYING: 'reapplying',
})

const DEFAULT_SERVICE_BRAKE_ABS_SPEC = Object.freeze({
  serviceBrakeAbsEnabled: true,
  serviceBrakeAbsMinGroundSpeedMetersPerSecond: 2.5,
  serviceBrakeAbsSlipRatioTriggerThreshold: 0.18,
  serviceBrakeAbsSlipRatioRecoveryThreshold: 0.08,
  serviceBrakeAbsReleaseRatePerSecond: 10,
  serviceBrakeAbsReapplyRatePerSecond: 4,
  serviceBrakeAbsMinimumModulation01: 0.2,
})

const PRESSURE_EPSILON_01 = 0.001
const MODULATION_EPSILON_01 = 0.001

export function resetWheelServiceBrakeAbsState(wheelState) {
  wheelState.serviceBrakeAbsState = SERVICE_BRAKE_ABS_STATES.INACTIVE
  wheelState.serviceBrakeAbsActive = false
  wheelState.serviceBrakeAbsModulation01 = 1
  wheelState.serviceBrakeAbsReleaseCommand01 = 0
  wheelState.serviceBrakeAbsCycleCount = 0
  wheelState.serviceBrakeAbsReason = 'reset'
  wheelState.serviceBrakeTorqueBeforeAbsNewtonMeters = 0
  wheelState.serviceBrakeTorqueAfterAbsNewtonMeters = 0
}

export function updateWheelServiceBrakeAbsState(
  wheelState,
  spec,
  serviceBrakePressure01,
  serviceBrakeTorqueBeforeAbsNewtonMeters,
  dt
) {
  const absEnabled = spec.serviceBrakeAbsEnabled !== false
  const serviceBrakePressure01Safe = clamp01(serviceBrakePressure01)
  const serviceBrakeTorqueBeforeAbsNewtonMetersSafe = sanitizeNonNegativeNumber(
    serviceBrakeTorqueBeforeAbsNewtonMeters
  )
  const minGroundSpeedMetersPerSecond = sanitizePositiveNumber(
    spec.serviceBrakeAbsMinGroundSpeedMetersPerSecond,
    DEFAULT_SERVICE_BRAKE_ABS_SPEC.serviceBrakeAbsMinGroundSpeedMetersPerSecond
  )
  const slipRatioTriggerThreshold = sanitizePositiveNumber(
    spec.serviceBrakeAbsSlipRatioTriggerThreshold,
    DEFAULT_SERVICE_BRAKE_ABS_SPEC.serviceBrakeAbsSlipRatioTriggerThreshold
  )
  const slipRatioRecoveryThreshold = sanitizePositiveNumber(
    spec.serviceBrakeAbsSlipRatioRecoveryThreshold,
    DEFAULT_SERVICE_BRAKE_ABS_SPEC.serviceBrakeAbsSlipRatioRecoveryThreshold
  )
  const releaseRatePerSecond = sanitizePositiveNumber(
    spec.serviceBrakeAbsReleaseRatePerSecond,
    DEFAULT_SERVICE_BRAKE_ABS_SPEC.serviceBrakeAbsReleaseRatePerSecond
  )
  const reapplyRatePerSecond = sanitizePositiveNumber(
    spec.serviceBrakeAbsReapplyRatePerSecond,
    DEFAULT_SERVICE_BRAKE_ABS_SPEC.serviceBrakeAbsReapplyRatePerSecond
  )
  const minimumModulation01 = clamp01(
    sanitizeNumber(
      spec.serviceBrakeAbsMinimumModulation01,
      DEFAULT_SERVICE_BRAKE_ABS_SPEC.serviceBrakeAbsMinimumModulation01
    )
  )

  const groundSpeedMetersPerSecond = sanitizeNumber(
    wheelState.longitudinalGroundSpeedMetersPerSecond
  )
  const groundSpeedAbsMetersPerSecond = Math.abs(groundSpeedMetersPerSecond)
  const slipRatio = sanitizeNumber(wheelState.longitudinalSlipRatio)
  const serviceBrakeLockTendency =
    wheelState.isServiceBrakeLockTendency === true ||
    wheelState.brakeLockTendencySource === 'service_brake' ||
    wheelState.brakeLockTendencySource === 'service_and_parking_brake'
  const serviceBrakeIsActive =
    serviceBrakePressure01Safe > PRESSURE_EPSILON_01 &&
    serviceBrakeTorqueBeforeAbsNewtonMetersSafe > 0
  const speedIsMeaningful =
    groundSpeedAbsMetersPerSecond >= minGroundSpeedMetersPerSecond
  const wheelStopped = wheelState.isWheelStopped === true
  const canRunAbs =
    absEnabled &&
    serviceBrakeIsActive &&
    wheelState.isGrounded === true &&
    speedIsMeaningful &&
    !wheelStopped

  wheelState.serviceBrakeTorqueBeforeAbsNewtonMeters =
    serviceBrakeTorqueBeforeAbsNewtonMetersSafe

  if (!canRunAbs) {
    wheelState.serviceBrakeAbsState = SERVICE_BRAKE_ABS_STATES.INACTIVE
    wheelState.serviceBrakeAbsActive = false
    wheelState.serviceBrakeAbsModulation01 = 1
    wheelState.serviceBrakeAbsReleaseCommand01 = 0
    wheelState.serviceBrakeAbsReason = describeAbsInactiveReason({
      absEnabled,
      serviceBrakeIsActive,
      isGrounded: wheelState.isGrounded === true,
      speedIsMeaningful,
      wheelStopped,
    })
    wheelState.serviceBrakeTorqueAfterAbsNewtonMeters =
      serviceBrakeTorqueBeforeAbsNewtonMetersSafe
    return wheelState
  }

  const previousModulation01 = clamp01(
    sanitizeNumber(wheelState.serviceBrakeAbsModulation01, 1)
  )
  const slipRatioTriggered = slipRatio <= -slipRatioTriggerThreshold
  const slipRatioRecovered = slipRatio >= -slipRatioRecoveryThreshold
  const shouldRelease = serviceBrakeLockTendency || slipRatioTriggered
  const hasReducedModulation =
    previousModulation01 < 1 - MODULATION_EPSILON_01

  if (shouldRelease) {
    if (
      wheelState.serviceBrakeAbsState !== SERVICE_BRAKE_ABS_STATES.RELEASING &&
      wheelState.serviceBrakeAbsState !== SERVICE_BRAKE_ABS_STATES.HOLDING
    ) {
      wheelState.serviceBrakeAbsCycleCount += 1
    }

    wheelState.serviceBrakeAbsModulation01 = Math.max(
      minimumModulation01,
      previousModulation01 - releaseRatePerSecond * Math.max(dt, 0)
    )
    wheelState.serviceBrakeAbsState =
      wheelState.serviceBrakeAbsModulation01 <=
        minimumModulation01 + MODULATION_EPSILON_01
        ? SERVICE_BRAKE_ABS_STATES.HOLDING
        : SERVICE_BRAKE_ABS_STATES.RELEASING
    wheelState.serviceBrakeAbsActive = true
    wheelState.serviceBrakeAbsReleaseCommand01 = clamp01(
      (Math.abs(slipRatio) - slipRatioTriggerThreshold) /
        Math.max(1 - slipRatioTriggerThreshold, MODULATION_EPSILON_01)
    )
    wheelState.serviceBrakeAbsReason = serviceBrakeLockTendency
      ? 'service-brake lock tendency detected'
      : 'braking slip ratio exceeded ABS trigger threshold'
  } else if (hasReducedModulation && !slipRatioRecovered) {
    wheelState.serviceBrakeAbsState = SERVICE_BRAKE_ABS_STATES.HOLDING
    wheelState.serviceBrakeAbsActive = true
    wheelState.serviceBrakeAbsModulation01 = previousModulation01
    wheelState.serviceBrakeAbsReleaseCommand01 = 0
    wheelState.serviceBrakeAbsReason =
      'holding reduced service brake torque until braking slip recovers'
  } else if (hasReducedModulation) {
    wheelState.serviceBrakeAbsModulation01 = Math.min(
      1,
      previousModulation01 + reapplyRatePerSecond * Math.max(dt, 0)
    )
    wheelState.serviceBrakeAbsState =
      wheelState.serviceBrakeAbsModulation01 >= 1 - MODULATION_EPSILON_01
        ? SERVICE_BRAKE_ABS_STATES.MONITORING
        : SERVICE_BRAKE_ABS_STATES.REAPPLYING
    wheelState.serviceBrakeAbsActive =
      wheelState.serviceBrakeAbsModulation01 < 1 - MODULATION_EPSILON_01
    wheelState.serviceBrakeAbsReleaseCommand01 = 0
    wheelState.serviceBrakeAbsReason =
      wheelState.serviceBrakeAbsActive
        ? 'reapplying service brake torque after ABS release'
        : 'service brake slip recovered'
  } else {
    wheelState.serviceBrakeAbsState = SERVICE_BRAKE_ABS_STATES.MONITORING
    wheelState.serviceBrakeAbsActive = false
    wheelState.serviceBrakeAbsModulation01 = 1
    wheelState.serviceBrakeAbsReleaseCommand01 = 0
    wheelState.serviceBrakeAbsReason =
      'monitoring service brake slip and wheel speed'
  }

  wheelState.serviceBrakeTorqueAfterAbsNewtonMeters =
    serviceBrakeTorqueBeforeAbsNewtonMetersSafe *
    wheelState.serviceBrakeAbsModulation01

  return wheelState
}

export function createServiceBrakeAbsSummary() {
  return {
    activeWheelCount: 0,
    releasingWheelCount: 0,
    holdingWheelCount: 0,
    reapplyingWheelCount: 0,
    minModulation01: 1,
    dominantState: SERVICE_BRAKE_ABS_STATES.INACTIVE,
  }
}

export function resetServiceBrakeAbsSummary(serviceBrakeAbsSummary) {
  serviceBrakeAbsSummary.activeWheelCount = 0
  serviceBrakeAbsSummary.releasingWheelCount = 0
  serviceBrakeAbsSummary.holdingWheelCount = 0
  serviceBrakeAbsSummary.reapplyingWheelCount = 0
  serviceBrakeAbsSummary.minModulation01 = 1
  serviceBrakeAbsSummary.dominantState = SERVICE_BRAKE_ABS_STATES.INACTIVE

  return serviceBrakeAbsSummary
}

export function updateServiceBrakeAbsSummary(
  serviceBrakeAbsSummary,
  wheelStates
) {
  resetServiceBrakeAbsSummary(serviceBrakeAbsSummary)

  for (const wheelState of wheelStates) {
    if (wheelState.serviceBrakeAbsActive) {
      serviceBrakeAbsSummary.activeWheelCount += 1
    }

    if (wheelState.serviceBrakeAbsState === SERVICE_BRAKE_ABS_STATES.RELEASING) {
      serviceBrakeAbsSummary.releasingWheelCount += 1
    }

    if (wheelState.serviceBrakeAbsState === SERVICE_BRAKE_ABS_STATES.HOLDING) {
      serviceBrakeAbsSummary.holdingWheelCount += 1
    }

    if (wheelState.serviceBrakeAbsState === SERVICE_BRAKE_ABS_STATES.REAPPLYING) {
      serviceBrakeAbsSummary.reapplyingWheelCount += 1
    }

    serviceBrakeAbsSummary.minModulation01 = Math.min(
      serviceBrakeAbsSummary.minModulation01,
      clamp01(sanitizeNumber(wheelState.serviceBrakeAbsModulation01, 1))
    )
  }

  serviceBrakeAbsSummary.dominantState =
    selectDominantServiceBrakeAbsState(serviceBrakeAbsSummary)

  if (wheelStates.length === 0) {
    serviceBrakeAbsSummary.minModulation01 = 1
  }

  return serviceBrakeAbsSummary
}

function describeAbsInactiveReason({
  absEnabled,
  serviceBrakeIsActive,
  isGrounded,
  speedIsMeaningful,
  wheelStopped,
}) {
  if (!absEnabled) return 'service brake ABS disabled by spec'
  if (!serviceBrakeIsActive) return 'service brake input is inactive'
  if (!isGrounded) return 'wheel is airborne'
  if (!speedIsMeaningful) return 'ground speed is below ABS activation threshold'
  if (wheelStopped) return 'wheel is in the stopped/resting state'
  return 'service brake ABS inactive'
}

function selectDominantServiceBrakeAbsState(serviceBrakeAbsSummary) {
  if (serviceBrakeAbsSummary.releasingWheelCount > 0) {
    return SERVICE_BRAKE_ABS_STATES.RELEASING
  }

  if (serviceBrakeAbsSummary.holdingWheelCount > 0) {
    return SERVICE_BRAKE_ABS_STATES.HOLDING
  }

  if (serviceBrakeAbsSummary.reapplyingWheelCount > 0) {
    return SERVICE_BRAKE_ABS_STATES.REAPPLYING
  }

  if (serviceBrakeAbsSummary.activeWheelCount > 0) {
    return SERVICE_BRAKE_ABS_STATES.MONITORING
  }

  return SERVICE_BRAKE_ABS_STATES.INACTIVE
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function sanitizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeNonNegativeNumber(value) {
  return Number.isFinite(value) && value > 0 ? value : 0
}
