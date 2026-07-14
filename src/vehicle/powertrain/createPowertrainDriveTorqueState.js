// src/vehicle/powertrain/createPowertrainDriveTorqueState.js

// Active powertrain drive torque source v1.
//
// This module turns the selected engine torque curve, transmission ratio,
// final-drive ratio, throttle, and entering-step driven-wheel angular velocity
// into an authoritative per-axle drive torque. It is the default drive source
// when spec.powertrainDriveTorqueEnabled is true; when false, the controller
// falls back to the legacy fixed-force drive path.
//
// Staged v1 scope:
// - one representative fixed ratio (first forward gear; reverse uses the
//   absolute reverse ratio; CVT uses the same midpoint policy as telemetry);
// - idle-RPM launch coupling floor (idealized; no clutch/torque converter);
// - smooth redline torque taper to zero;
// - constant drivetrain efficiency.
//
// Explicitly excluded: gear selection, shift schedules, manual shifting, CVT
// ratio control, clutch, torque converter, engine rotational integration,
// engine braking, driveline compliance, traction control, launch control.

import {
  RPM_PER_RADIAN_PER_SECOND,
  selectRepresentativeForwardRatio,
  selectReverseDriveRatio,
  computeEffectiveDriveRatio,
} from './createPowertrainKinematics.js'

const TWO_PI = Math.PI * 2

const RATIO_KINDS = Object.freeze({
  NONE: 'none',
  FORWARD: 'forward',
  REVERSE: 'reverse',
  CVT: 'cvt',
})

const FALLBACK_REASONS = Object.freeze({
  NONE: 'none',
  DISABLED: 'legacy-fixed-force',
  NO_ENGINE: 'missing-engine-profile',
  NO_TRANSMISSION: 'missing-transmission-profile',
})

const DEFAULT_TAPER_BAND_RPM = 800
const DEFAULT_EFFICIENCY_01 = 0.9
const SAFE_EPSILON_NEWTON_METERS = 1e-6

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0
}

function sanitizeNonNegative(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 1)
}

// Redline taper band sanitized as finite and non-negative, clamped so it never
// exceeds the redline.
function sanitizeTaperBandRpm(taperBandRpm, redlineRpm) {
  const candidate = sanitizeNonNegative(taperBandRpm, DEFAULT_TAPER_BAND_RPM)
  const red = Number.isFinite(redlineRpm) && redlineRpm > 0 ? redlineRpm : 0
  return red > 0 ? Math.min(candidate, red) : candidate
}

// Deterministic piecewise-linear interpolation over ordered torque samples.
// No mutation of frozen profile data; exact samples return exact torque;
// endpoint clamping below the first and above the final sample; non-negative
// magnitude; no extrapolated growth beyond profile data.
export function interpolateEngineTorqueCurve(engineProfile, rpm) {
  const samples = engineProfile?.torqueCurveSamples

  if (!Array.isArray(samples) || samples.length === 0) return 0

  const firstTorque = Math.max(0, samples[0].torqueNewtonMeters)
  const lastSample = samples[samples.length - 1]
  const lastTorque = Math.max(0, lastSample.torqueNewtonMeters)

  if (!Number.isFinite(rpm) || rpm <= 0) return firstTorque
  if (rpm <= samples[0].rpm) return firstTorque
  if (rpm >= lastSample.rpm) return lastTorque

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const next = samples[index]

    if (rpm <= next.rpm) {
      const span = next.rpm - previous.rpm
      if (span <= 0) return Math.max(0, next.torqueNewtonMeters)
      const fraction = (rpm - previous.rpm) / span
      return Math.max(
        0,
        previous.torqueNewtonMeters +
          (next.torqueNewtonMeters - previous.torqueNewtonMeters) * fraction
      )
    }
  }

  return lastTorque
}

// Linear 1 -> 0 redline torque multiplier. At or below the taper start the
// multiplier is 1; it decreases linearly to 0 at redline; at or above redline
// it is 0. Division-by-zero is guarded because the middle branch only applies
// when rpm is strictly between taperStart and redline (taperStart < redline).
export function computeRedlineTorqueMultiplier01(redlineRpm, taperBandRpm, rpm) {
  const red = Number.isFinite(redlineRpm) && redlineRpm > 0 ? redlineRpm : 1
  const clampedBand = Math.min(sanitizeNonNegative(taperBandRpm, 0), red)
  const taperStartRpm = red - clampedBand
  const r = finiteOrZero(rpm)

  if (r <= taperStartRpm) return 1
  if (r >= red) return 0

  return (red - r) / (red - taperStartRpm)
}

export function createPowertrainDriveTorqueState() {
  return resetPowertrainDriveTorqueState({})
}

export function resetPowertrainDriveTorqueState(state = {}) {
  state.enabled = false
  state.mode = 'legacy-fixed-force'
  state.gearDirection = 0
  state.ratioKind = RATIO_KINDS.NONE
  state.transmissionRatio = 0
  state.finalDriveRatio = 0
  state.effectiveDriveRatio = 0
  state.averageEnteringDrivenWheelAngularVelocityRadiansPerSecond = 0
  state.rawCoupledEngineRpm = 0
  state.torqueLookupEngineRpm = 0
  state.idleRpm = 0
  state.redlineRpm = 0
  state.interpolatedTorqueCurveTorqueNewtonMeters = 0
  state.throttleInput = 0
  state.throttleScaledTorqueNewtonMeters = 0
  state.redlineTorqueMultiplier01 = 1
  state.isRedlineTorqueLimited = false
  state.redlineTorqueTaperStartRpm = 0
  state.engineOutputTorqueNewtonMeters = 0
  state.drivetrainEfficiency01 = DEFAULT_EFFICIENCY_01
  state.requestedAxleDriveTorqueNewtonMeters = 0
  state.totalAxleOutputTorqueNewtonMeters = 0
  state.fallbackReason = FALLBACK_REASONS.NONE

  return state
}

// Predictive discrete-time redline axle-torque cap.
//
// Staged numerical/controls approximation. NOT an engine-inertia, clutch,
// torque-converter, shifting, or ECU fuel-cut model. The entering-step drive
// torque alone must not advance any driven wheel past the redline-consistent
// angular velocity within one fixed timestep. Opposing contact/rolling/brake
// torques are intentionally ignored so the cap stays conservative: drive torque
// alone cannot overshoot, while opposing torque can only leave the wheel below
// redline. On the next step the recovered headroom permits enough drive torque
// to track the limit instead of alternating above and below it.
//
// Ownership: the active powertrain source owns the REQUESTED axle torque and
// the redline/effective-ratio context; the controller/differential integration
// owns the applied limit and calls this helper. The helper is pure: identical
// inputs produce identical outputs and it mutates nothing.
//
// Pairing rule: each descriptor share01 is the wheel resolved differential
// share. Only wheels with a positive share participate. A zero share is
// ignored safely. When no wheel participates, the cap imposes no reduction.
export function computePredictiveRedlineAxleTorqueCap({
  requestedAxleDriveTorqueMagnitudeNewtonMeters = 0,
  gearDirection = 0,
  redlineRpm = 0,
  effectiveDriveRatio = 0,
  drivenWheelDescriptors = [],
  dtSeconds = 0,
}) {
  const requestedAxleDriveTorqueMagnitude = Math.abs(
    Number.isFinite(requestedAxleDriveTorqueMagnitudeNewtonMeters)
      ? requestedAxleDriveTorqueMagnitudeNewtonMeters
      : 0
  )

  // Fail-closed policy: any input required to establish the redline bound that
  // is invalid must NOT silently allow the full requested torque. Instead the
  // applied axle torque collapses to zero. This never creates torque and never
  // flips sign, so the invariant "applied magnitude never exceeds requested"
  // holds and no unsafe unlimited fallback survives.
  const SHARE_SUM_TOLERANCE_01 = 1e-6
  const directedSign = gearDirection < 0 ? -1 : gearDirection > 0 ? 1 : 0
  const hasRedline = Number.isFinite(redlineRpm) && redlineRpm > 0
  const absEffectiveRatio = Math.abs(
    Number.isFinite(effectiveDriveRatio) ? effectiveDriveRatio : 0
  )
  const hasEffectiveRatio = absEffectiveRatio > 0
  const finiteDt =
    Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0

  let predictiveLimiterReason = 'none'

  if (requestedAxleDriveTorqueMagnitude <= 0) {
    predictiveLimiterReason = 'no-request'
  } else if (directedSign === 0) {
    predictiveLimiterReason = 'neutral'
  } else if (!hasRedline) {
    predictiveLimiterReason = 'invalid-redline'
  } else if (!hasEffectiveRatio) {
    predictiveLimiterReason = 'invalid-effective-ratio'
  } else if (finiteDt <= 0) {
    predictiveLimiterReason = 'invalid-dt'
  }

  // Validate per-wheel descriptors before attempting to resolve the bound. A
  // participating wheel has a positive finite share; such a wheel must also
  // have a finite angular velocity and a positive finite inertia. Participating
  // shares must sum to one. Any violation fails the limiter closed.
  const validatedDescriptors = []
  let shareSum01 = 0

  if (predictiveLimiterReason === 'none') {
    for (const descriptor of drivenWheelDescriptors) {
      const angularVelocityRadiansPerSecond = Number.isFinite(
        descriptor?.angularVelocityRadiansPerSecond
      )
        ? descriptor.angularVelocityRadiansPerSecond
        : NaN
      const wheelInertiaKgMeterSquared = Number.isFinite(
        descriptor?.wheelInertiaKgMeterSquared
      )
        ? descriptor.wheelInertiaKgMeterSquared
        : NaN
      const share01 = Number.isFinite(descriptor?.share01)
        ? descriptor.share01
        : NaN

      if (!Number.isFinite(share01) || share01 < 0 || share01 > 1) {
        predictiveLimiterReason = 'invalid-shares'
        break
      }

      if (share01 <= 0) {
        // Non-participating wheel (differential assigned it no drive). Valid
        // and ignored; it contributes no bound.
        continue
      }

      if (
        !Number.isFinite(angularVelocityRadiansPerSecond) ||
        !Number.isFinite(wheelInertiaKgMeterSquared) ||
        wheelInertiaKgMeterSquared <= 0
      ) {
        predictiveLimiterReason = 'invalid-wheel-state'
        break
      }

      shareSum01 += share01
      validatedDescriptors.push({
        angularVelocityRadiansPerSecond,
        wheelInertiaKgMeterSquared,
        share01,
      })
    }
  }

  if (predictiveLimiterReason === 'none' && validatedDescriptors.length === 0) {
    // No wheel participates (all shares zero, or no descriptors). The bound
    // cannot be established, so this is a missing-driven-wheels failure.
    predictiveLimiterReason = 'missing-driven-wheels'
  } else if (
    predictiveLimiterReason === 'none' &&
    Math.abs(shareSum01 - 1) > SHARE_SUM_TOLERANCE_01
  ) {
    // Participating wheels exist but their shares do not sum to one, so the
    // per-wheel axle-torque reconstruction is undefined.
    predictiveLimiterReason = 'invalid-shares'
  }

  if (predictiveLimiterReason !== 'none') {
    // Fail closed: no drive torque is permitted when the bound cannot be
    // established from valid inputs.
    return {
      redlineWheelAngularVelocityRadiansPerSecond: hasRedline
        ? redlineRpm / (RPM_PER_RADIAN_PER_SECOND * absEffectiveRatio)
        : 0,
      maximumPredictiveAxleTorqueMagnitudeNewtonMeters: 0,
      appliedAxleDriveTorqueMagnitudeNewtonMeters: 0,
      minimumWheelAngularVelocityHeadroomRadiansPerSecond: 0,
      isPredictiveLimiterActive: false,
      predictiveLimiterReason,
      participatingWheelCount: validatedDescriptors.length,
    }
  }

  // All inputs valid: compute the predictive cap from entering-step state. The
  // opposing contact/rolling/brake torque is intentionally ignored so the cap
  // is conservative: drive torque alone cannot overshoot the redline in one
  // step, while opposing torque can only leave the wheel below redline.
  const redlineWheelAngularVelocityRadiansPerSecond =
    redlineRpm / (RPM_PER_RADIAN_PER_SECOND * absEffectiveRatio)

  let minimumWheelAngularVelocityHeadroomRadiansPerSecond =
    Number.POSITIVE_INFINITY
  let allowedAxleTorqueMagnitudeNewtonMeters =
    requestedAxleDriveTorqueMagnitude

  for (const descriptor of validatedDescriptors) {
    const directedWheelAngularVelocityRadiansPerSecond =
      descriptor.angularVelocityRadiansPerSecond * directedSign
    const remainingAngularVelocityHeadroomRadiansPerSecond = Math.max(
      0,
      redlineWheelAngularVelocityRadiansPerSecond -
        directedWheelAngularVelocityRadiansPerSecond
    )
    minimumWheelAngularVelocityHeadroomRadiansPerSecond = Math.min(
      minimumWheelAngularVelocityHeadroomRadiansPerSecond,
      remainingAngularVelocityHeadroomRadiansPerSecond
    )

    const maxWheelDriveTorqueFromHeadroomNewtonMeters =
      (descriptor.wheelInertiaKgMeterSquared *
        remainingAngularVelocityHeadroomRadiansPerSecond) /
      finiteDt
    const maxAxleTorqueFromWheelNewtonMeters =
      maxWheelDriveTorqueFromHeadroomNewtonMeters / descriptor.share01

    allowedAxleTorqueMagnitudeNewtonMeters = Math.min(
      allowedAxleTorqueMagnitudeNewtonMeters,
      maxAxleTorqueFromWheelNewtonMeters
    )
  }

  const maximumPredictiveAxleTorqueMagnitudeNewtonMeters =
    allowedAxleTorqueMagnitudeNewtonMeters
  const appliedAxleDriveTorqueMagnitudeNewtonMeters = Math.min(
    requestedAxleDriveTorqueMagnitude,
    maximumPredictiveAxleTorqueMagnitudeNewtonMeters
  )
  const isPredictiveLimiterActive =
    appliedAxleDriveTorqueMagnitudeNewtonMeters <
    requestedAxleDriveTorqueMagnitude - SAFE_EPSILON_NEWTON_METERS

  return {
    redlineWheelAngularVelocityRadiansPerSecond,
    maximumPredictiveAxleTorqueMagnitudeNewtonMeters,
    appliedAxleDriveTorqueMagnitudeNewtonMeters,
    minimumWheelAngularVelocityHeadroomRadiansPerSecond,
    isPredictiveLimiterActive,
    predictiveLimiterReason: isPredictiveLimiterActive
      ? 'redline-headroom'
      : 'none',
    participatingWheelCount: validatedDescriptors.length,
  }
}

// Compute the active drive torque source from the entering-step driven-wheel
// state. Writes a serializable telemetry snapshot into `state` and returns the
// signed total axle output torque (positive drive, negative reverse, zero
// neutral). The controller splits this through the rear differential.
export function updatePowertrainDriveTorqueSource({
  state,
  spec = {},
  engineProfile,
  transmissionProfile,
  gearDirection = 0,
  throttleInput = 0,
  averageDrivenWheelAngularVelocityRadiansPerSecond = 0,
  speedAlongSelectedGearMetersPerSecond = 0,
}) {
  const enabled = spec.powertrainDriveTorqueEnabled !== false
  const idleRpm = finiteOrZero(engineProfile?.idleRpm)
  const redlineRpm = finiteOrZero(engineProfile?.redlineRpm)
  const taperBandRpm = sanitizeTaperBandRpm(
    spec.powertrainRedlineTorqueTaperRpm,
    redlineRpm
  )
  const efficiency01 = clamp01(
    spec.powertrainDrivetrainEfficiency01 ?? DEFAULT_EFFICIENCY_01
  )
  const throttle = clamp01(finiteOrZero(throttleInput))

  const isReverse = gearDirection < 0
  const isNeutral = !gearDirection || gearDirection === 0
  const directionSign = isNeutral ? 0 : Math.sign(gearDirection)

  const transmissionRatio = isReverse
    ? selectReverseDriveRatio(transmissionProfile)
    : selectRepresentativeForwardRatio(transmissionProfile)
  const finalDriveRatio = finiteOrZero(transmissionProfile?.finalDriveRatio)
  const effectiveDriveRatio = computeEffectiveDriveRatio(
    transmissionProfile,
    isReverse
  )
  const ratioKind = isNeutral
    ? RATIO_KINDS.NONE
    : isReverse
      ? RATIO_KINDS.REVERSE
      : transmissionProfile?.transmissionKind === 'cvt'
        ? RATIO_KINDS.CVT
        : RATIO_KINDS.FORWARD

  const averageEnteringOmega = finiteOrZero(
    averageDrivenWheelAngularVelocityRadiansPerSecond
  )
  // Raw coupled engine RPM is unclamped so redline behavior remains visible to
  // active physics. Absolute value keeps direction-agnostic wheel speed finite.
  const rawCoupledEngineRpm =
    Math.abs(averageEnteringOmega) *
    RPM_PER_RADIAN_PER_SECOND *
    Math.abs(effectiveDriveRatio)
  // Idealized launch coupling: floor torque-lookup RPM to idle. This is not a
  // clutch or torque converter; it simply lets torque curve read a finite value
  // at standstill instead of extrapolating to zero.
  const torqueLookupEngineRpm = Math.max(rawCoupledEngineRpm, idleRpm)

  const interpolatedTorque = interpolateEngineTorqueCurve(
    engineProfile,
    torqueLookupEngineRpm
  )
  const redlineTorqueMultiplier01 = computeRedlineTorqueMultiplier01(
    redlineRpm,
    taperBandRpm,
    rawCoupledEngineRpm
  )
  const isRedlineTorqueLimited = redlineTorqueMultiplier01 < 1

  // Top-speed guard mirrors the legacy drive request: no drive past the
  // selected-gear speed limiter.
  const maxGearSpeedMetersPerSecond =
    directionSign > 0
      ? Number.isFinite(spec.maxForwardSpeedMetersPerSecond)
        ? spec.maxForwardSpeedMetersPerSecond
        : Infinity
      : Number.isFinite(spec.maxReverseSpeedMetersPerSecond)
        ? spec.maxReverseSpeedMetersPerSecond
        : Infinity
  const aboveMaxSpeed =
    !isNeutral &&
    Number.isFinite(speedAlongSelectedGearMetersPerSecond) &&
    speedAlongSelectedGearMetersPerSecond >= maxGearSpeedMetersPerSecond

  const throttleScaledTorque = aboveMaxSpeed
    ? 0
    : interpolatedTorque * throttle
  const engineOutputTorque = throttleScaledTorque * redlineTorqueMultiplier01
  const totalAxleOutputTorqueNewtonMeters =
    engineOutputTorque *
    Math.abs(effectiveDriveRatio) *
    efficiency01 *
    directionSign

  let fallbackReason = FALLBACK_REASONS.NONE
  if (!enabled) fallbackReason = FALLBACK_REASONS.DISABLED
  else if (!engineProfile) fallbackReason = FALLBACK_REASONS.NO_ENGINE
  else if (!transmissionProfile) fallbackReason = FALLBACK_REASONS.NO_TRANSMISSION

  state.enabled = enabled
  state.mode = enabled ? 'active-torque' : 'legacy-fixed-force'
  state.gearDirection = directionSign
  state.ratioKind = ratioKind
  state.transmissionRatio = finiteOrZero(transmissionRatio)
  state.finalDriveRatio = finalDriveRatio
  state.effectiveDriveRatio = effectiveDriveRatio
  state.averageEnteringDrivenWheelAngularVelocityRadiansPerSecond =
    averageEnteringOmega
  state.rawCoupledEngineRpm = rawCoupledEngineRpm
  state.torqueLookupEngineRpm = torqueLookupEngineRpm
  state.idleRpm = idleRpm
  state.redlineRpm = redlineRpm
  state.interpolatedTorqueCurveTorqueNewtonMeters = interpolatedTorque
  state.throttleInput = throttle
  state.throttleScaledTorqueNewtonMeters = throttleScaledTorque
  state.redlineTorqueMultiplier01 = redlineTorqueMultiplier01
  state.isRedlineTorqueLimited = isRedlineTorqueLimited
  state.redlineTorqueTaperStartRpm = redlineRpm - taperBandRpm
  state.engineOutputTorqueNewtonMeters = engineOutputTorque
  state.drivetrainEfficiency01 = efficiency01
  state.requestedAxleDriveTorqueNewtonMeters = totalAxleOutputTorqueNewtonMeters
  state.totalAxleOutputTorqueNewtonMeters = totalAxleOutputTorqueNewtonMeters
  state.fallbackReason = fallbackReason

  return totalAxleOutputTorqueNewtonMeters
}

export const POWERTRAIN_DRIVE_TORQUE_RATIO_KINDS = RATIO_KINDS
export const POWERTRAIN_DRIVE_TORQUE_FALLBACK_REASONS = FALLBACK_REASONS
export const DEFAULT_POWERTRAIN_REDLINE_TAPER_BAND_RPM = DEFAULT_TAPER_BAND_RPM
