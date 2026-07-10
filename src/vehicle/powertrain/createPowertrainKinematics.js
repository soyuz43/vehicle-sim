// src/vehicle/powertrain/createPowertrainKinematics.js

// Inert powertrain kinematics / engine-RPM telemetry foundation.
//
// This module derives an ESTIMATED engine RPM and driveline connection state
// purely from existing static profile data and current wheel/selector state.
// It is TELEMETRY ONLY. The result is never fed back into drive force, wheel
// torque, braking, tire behavior, or any vehicle motion. No engine braking,
// torque-curve drive behavior, shifting, clutch, torque converter, gear-ratio
// force multiplication, differential, or drivetrain physics is implemented here.

const TWO_PI = Math.PI * 2

// Radians/second -> revolutions/minute.
const RPM_PER_RADIAN_PER_SECOND = 60 / TWO_PI

const CONNECTION_STATES = Object.freeze({
  DISCONNECTED: 'disconnected',
  FORWARD_CONNECTED: 'forward_connected',
  REVERSE_CONNECTED: 'reverse_connected',
})

const RPM_STATES = Object.freeze({
  IDLE: 'idle',
  COUPLED: 'coupled',
  REDLINE_CLAMPED: 'redline_clamped',
  UNAVAILABLE: 'unavailable',
})

const RATIO_KINDS = Object.freeze({
  NONE: 'none',
  FORWARD: 'forward',
  REVERSE: 'reverse',
  CVT: 'cvt',
})

const DEFAULT_GEAR_INDEX = -1
const DEFAULT_GEAR_LABEL = 'none'

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0
}

// For CVT, use a fixed representative midpoint ratio for telemetry only.
// For fixed-ratio transmissions, use the first forward gear ratio for telemetry
// only. No automatic shifting or speed-based gear selection is performed.
function selectRepresentativeForwardRatio(transmissionProfile) {
  if (transmissionProfile.transmissionKind === 'cvt') {
    const minRatio = transmissionProfile.cvtMinRatio
    const maxRatio = transmissionProfile.cvtMaxRatio

    if (Number.isFinite(minRatio) && Number.isFinite(maxRatio)) {
      return (minRatio + maxRatio) / 2
    }

    return null
  }

  const forwardGearRatios = transmissionProfile.forwardGearRatios

  if (!Array.isArray(forwardGearRatios) || forwardGearRatios.length === 0) {
    return null
  }

  return forwardGearRatios[0]
}

function selectForwardGearIndex(transmissionProfile) {
  if (transmissionProfile.transmissionKind === 'cvt') return DEFAULT_GEAR_INDEX
  return 0
}

function selectForwardGearLabel(transmissionProfile) {
  if (transmissionProfile.transmissionKind === 'cvt') return 'CVT'
  return '1'
}

// Derive inert powertrain kinematics/RPM telemetry.
// Inputs must already be sanitized by the caller (engineProfile and
// transmissionProfile come from the safe powertrain selection helpers, and
// gearDirection is -1 / 0 / 1 from the existing R/N/D selector).
export function computePowertrainKinematics({
  engineProfile,
  transmissionProfile,
  gearDirection,
  averageDrivenWheelAngularVelocityRadiansPerSecond,
}) {
  const idleRpm = finiteOrZero(engineProfile?.idleRpm)
  const redlineRpm = finiteOrZero(engineProfile?.redlineRpm)

  const wheelAngularVelocityRadiansPerSecond = finiteOrZero(
    averageDrivenWheelAngularVelocityRadiansPerSecond
  )

  const finalDriveRatio = finiteOrZero(transmissionProfile?.finalDriveRatio)

  // Neutral (gearDirection === 0, or missing): powertrain is disconnected and
  // the estimated engine RPM is simply idle RPM.
  if (!gearDirection || gearDirection === 0) {
    return {
      powertrainConnectionState: CONNECTION_STATES.DISCONNECTED,
      selectedRatioKind: RATIO_KINDS.NONE,
      selectedForwardGearIndex: DEFAULT_GEAR_INDEX,
      selectedForwardGearLabel: DEFAULT_GEAR_LABEL,
      transmissionRatio: null,
      finalDriveRatio,
      effectiveDriveRatio: 0,
      averageDrivenWheelAngularVelocityRadiansPerSecond:
        wheelAngularVelocityRadiansPerSecond,
      estimatedEngineRpm: idleRpm,
      idleRpm,
      redlineRpm,
      engineRpmState: RPM_STATES.IDLE,
      engineRpmClampReason: 'neutral-disconnected',
    }
  }

  const isReverse = gearDirection < 0

  let transmissionRatio
  let selectedRatioKind
  let selectedForwardGearIndex
  let selectedForwardGearLabel

  if (isReverse) {
    transmissionRatio = Math.abs(finiteOrZero(transmissionProfile?.reverseGearRatio))
    selectedRatioKind = RATIO_KINDS.REVERSE
    selectedForwardGearIndex = DEFAULT_GEAR_INDEX
    selectedForwardGearLabel = 'R'
  } else {
    transmissionRatio = finiteOrZero(selectRepresentativeForwardRatio(transmissionProfile))
    const isCvt = transmissionProfile?.transmissionKind === 'cvt'
    selectedRatioKind = isCvt ? RATIO_KINDS.CVT : RATIO_KINDS.FORWARD
    selectedForwardGearIndex = selectForwardGearIndex(transmissionProfile)
    selectedForwardGearLabel = selectForwardGearLabel(transmissionProfile)
  }

  const effectiveDriveRatio = transmissionRatio * finalDriveRatio

  // Raw estimated engine RPM from driven wheel speed and the effective drive
  // ratio. Absolute value keeps direction-agnostic wheel speed finite/positive.
  const rawEngineRpm =
    Math.abs(wheelAngularVelocityRadiansPerSecond) *
    RPM_PER_RADIAN_PER_SECOND *
    effectiveDriveRatio

  let estimatedEngineRpm = rawEngineRpm
  let engineRpmState = RPM_STATES.COUPLED
  let engineRpmClampReason = 'none'

  if (estimatedEngineRpm < idleRpm) {
    estimatedEngineRpm = idleRpm
    engineRpmState = RPM_STATES.IDLE
    engineRpmClampReason = 'idle'
  } else if (estimatedEngineRpm > redlineRpm && redlineRpm > 0) {
    estimatedEngineRpm = redlineRpm
    engineRpmState = RPM_STATES.REDLINE_CLAMPED
    engineRpmClampReason = 'redline'
  }

  return {
    powertrainConnectionState: isReverse
      ? CONNECTION_STATES.REVERSE_CONNECTED
      : CONNECTION_STATES.FORWARD_CONNECTED,
    selectedRatioKind,
    selectedForwardGearIndex,
    selectedForwardGearLabel,
    transmissionRatio,
    finalDriveRatio,
    effectiveDriveRatio,
    averageDrivenWheelAngularVelocityRadiansPerSecond:
      wheelAngularVelocityRadiansPerSecond,
    estimatedEngineRpm,
    idleRpm,
    redlineRpm,
    engineRpmState,
    engineRpmClampReason,
  }
}

export const POWERTRAIN_CONNECTION_STATES = CONNECTION_STATES
export const POWERTRAIN_RPM_STATES = RPM_STATES
export const POWERTRAIN_RATIO_KINDS = RATIO_KINDS