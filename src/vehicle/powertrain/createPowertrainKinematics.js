// src/vehicle/powertrain/createPowertrainKinematics.js

// Inert powertrain kinematics / engine-RPM telemetry foundation, plus the
// shared representative-ratio helpers used by both telemetry and the active
// drive-torque source.
//
// This module derives an ESTIMATED (clamped) engine RPM and driveline connection
// state from static profile data, current wheel state, and the forward gear the
// driveline is actually engaged in. The engaged gear index is resolved by the
// caller - the same resolved index the active drive-torque source uses - and is
// threaded in, so the reported gear, drive ratio, and engine RPM can never
// describe a gear the vehicle is not in.
//
// The estimated engine RPM is TELEMETRY ONLY and is never fed back into drive force,
// wheel torque, braking, tire behavior, or vehicle motion.
//
// The representative-ratio helpers (selectRepresentativeForwardRatio,
// selectReverseDriveRatio, computeEffectiveDriveRatio) are shared: the same
// single fixed ratio is used by the estimated-RPM telemetry and by the active
// powertrain drive-torque source to multiply engine torque into axle torque.
// No engine braking, shifting, clutch, torque converter, or other drivetrain
// physics is implemented here beyond ratio ownership and the clamped RPM
// estimate.

const TWO_PI = Math.PI * 2

// Radians/second -> revolutions/minute.
export const RPM_PER_RADIAN_PER_SECOND = 60 / TWO_PI

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
// For fixed-ratio transmissions this is the shared fallback helper used by the
// active drive-torque source. The estimated-RPM telemetry does NOT use it for a
// fixed-ratio box: that telemetry reports the engaged gear, which the caller
// resolves and threads in.
export function selectRepresentativeForwardRatio(transmissionProfile) {
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

// Absolute reverse gear ratio used by active drive torque and telemetry.
export function selectReverseDriveRatio(transmissionProfile) {
  return Math.abs(finiteOrZero(transmissionProfile?.reverseGearRatio))
}

// Single authoritative effective drive ratio shared by telemetry and active
// torque so they cannot silently select different ratios.
export function computeEffectiveDriveRatio(
  transmissionProfile,
  isReverse,
  selectedForwardGearIndex = null
) {
  const finalDriveRatio = finiteOrZero(transmissionProfile?.finalDriveRatio)

  let transmissionRatio
  if (isReverse) {
    transmissionRatio = selectReverseDriveRatio(transmissionProfile)
  } else if (
    selectedForwardGearIndex !== null &&
    selectedForwardGearIndex !== undefined &&
    Array.isArray(transmissionProfile?.forwardGearRatios) &&
    selectedForwardGearIndex >= 0 &&
    selectedForwardGearIndex < transmissionProfile.forwardGearRatios.length
  ) {
    transmissionRatio = transmissionProfile.forwardGearRatios[selectedForwardGearIndex]
  } else {
    transmissionRatio = selectRepresentativeForwardRatio(transmissionProfile)
  }

  if (!Number.isFinite(transmissionRatio)) return 0

  return transmissionRatio * finalDriveRatio
}

// Resolve the engaged forward gear index for telemetry.
//
// The engaged index is the gear the driveline is actually in. It is resolved by
// the caller - a manual selection wins over the automatic selector - and is
// threaded in here, so the displayed gear, the displayed drive ratio, and the
// applied drive torque always describe the same gear.
//
// Returns null when the profile has no discrete forward gears (a CVT) or when
// no engaged index was supplied. There is deliberately NO fallback to first
// gear: silently reporting first gear is exactly what left the engine-RPM
// telemetry stale after a manual shift.
function resolveEngagedForwardGearIndex(
  transmissionProfile,
  engagedForwardGearIndex
) {
  const ratios = transmissionProfile?.forwardGearRatios

  if (!Array.isArray(ratios) || ratios.length === 0) return null

  if (
    engagedForwardGearIndex === null ||
    engagedForwardGearIndex === undefined
  ) {
    return null
  }

  const index = Math.trunc(Number(engagedForwardGearIndex))

  if (!Number.isFinite(index)) return null
  if (index < 0 || index >= ratios.length) return null

  return index
}

// Shared shape for a powertrain that is not transmitting drive torque: the R/N/D
// selector is in neutral, or the engaged forward gear is not known.
function createDisconnectedKinematics({
  finalDriveRatio,
  wheelAngularVelocityRadiansPerSecond,
  idleRpm,
  redlineRpm,
  engineRpmClampReason,
}) {
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
    engineRpmClampReason,
  }
}

// Derive inert powertrain kinematics/RPM telemetry.
// Inputs must already be sanitized by the caller (engineProfile and
// transmissionProfile come from the safe powertrain selection helpers, and
// gearDirection is -1 / 0 / 1 from the existing R/N/D selector).
//
// selectedForwardGearIndex is the ENGAGED forward gear index resolved by the
// caller. It is the same index the active drive-torque source uses, so the
// telemetry can never describe a different gear than the one applying torque.
// A null/undefined index means "no engaged forward gear is known".
export function computePowertrainKinematics({
  engineProfile,
  transmissionProfile,
  gearDirection,
  averageDrivenWheelAngularVelocityRadiansPerSecond,
  selectedForwardGearIndex = null,
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
    return createDisconnectedKinematics({
      finalDriveRatio,
      wheelAngularVelocityRadiansPerSecond,
      idleRpm,
      redlineRpm,
      engineRpmClampReason: 'neutral-disconnected',
    })
  }

  const isReverse = gearDirection < 0

  let transmissionRatio
  let selectedRatioKind
  let reportedForwardGearIndex
  let reportedForwardGearLabel

  if (isReverse) {
    transmissionRatio = selectReverseDriveRatio(transmissionProfile)
    selectedRatioKind = RATIO_KINDS.REVERSE
    reportedForwardGearIndex = DEFAULT_GEAR_INDEX
    reportedForwardGearLabel = 'R'
  } else {
    const isCvt = transmissionProfile?.transmissionKind === 'cvt'
    selectedRatioKind = isCvt ? RATIO_KINDS.CVT : RATIO_KINDS.FORWARD
    const engagedGearIndex = resolveEngagedForwardGearIndex(
      transmissionProfile,
      selectedForwardGearIndex
    )

    if (isCvt) {
      // A CVT has no discrete forward gears: the representative midpoint ratio
      // is the telemetry ratio and there is no gear number to report.
      transmissionRatio = finiteOrZero(
        selectRepresentativeForwardRatio(transmissionProfile)
      )
      reportedForwardGearIndex = DEFAULT_GEAR_INDEX
      reportedForwardGearLabel = 'CVT'
    } else if (engagedGearIndex !== null) {
      // The engaged gear: its ratio and its 1-based label are the ones the
      // driveline is actually using.
      transmissionRatio = finiteOrZero(
        transmissionProfile.forwardGearRatios[engagedGearIndex]
      )
      reportedForwardGearIndex = engagedGearIndex
      reportedForwardGearLabel = String(engagedGearIndex + 1)
    } else {
      // A fixed-ratio box with no known engaged gear. Report the powertrain as
      // disconnected instead of claiming first gear.
      return createDisconnectedKinematics({
        finalDriveRatio,
        wheelAngularVelocityRadiansPerSecond,
        idleRpm,
        redlineRpm,
        engineRpmClampReason: 'no-engaged-gear',
      })
    }
  }

  const effectiveDriveRatio = computeEffectiveDriveRatio(
    transmissionProfile,
    isReverse,
    reportedForwardGearIndex
  )

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
    selectedForwardGearIndex: reportedForwardGearIndex,
    selectedForwardGearLabel: reportedForwardGearLabel,
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