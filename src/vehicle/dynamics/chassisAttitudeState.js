// src/vehicle/dynamics/chassisAttitudeState.js

const DEFAULT_CHASSIS_ATTITUDE_SPEC = Object.freeze({
  chassisAttitudeEnabled: true,
  chassisAttitudeVisualBodyHeightMeters: 1.36,
  chassisAttitudeMaximumHeaveOffsetMeters: 0.18,
  chassisAttitudeMaximumPitchRadians: 0.12,
  chassisAttitudeMaximumRollRadians: 0.12,
  chassisAttitudeResponseSeconds: 0.08,
})

const SUPPORT_PLANE_EPSILON = 0.000001

export function createChassisAttitudeState(spec = {}) {
  return resetChassisAttitudeState(
    {
      heaveOffsetMeters: 0,
      heaveVelocityMetersPerSecond: 0,
      pitchRadians: 0,
      pitchRateRadiansPerSecond: 0,
      rollRadians: 0,
      rollRateRadiansPerSecond: 0,
      visualBodyHeightMeters: 0,
      groundedSupportCount: 0,
      supportPlaneModeLabel: 'neutral-reset',
      isFinite: true,
    },
    spec
  )
}

export function resetChassisAttitudeState(state, spec = {}) {
  if (!state) return state

  state.heaveOffsetMeters = 0
  state.heaveVelocityMetersPerSecond = 0
  state.pitchRadians = 0
  state.pitchRateRadiansPerSecond = 0
  state.rollRadians = 0
  state.rollRateRadiansPerSecond = 0
  state.visualBodyHeightMeters = resolveVisualBodyHeightMeters(spec)
  state.groundedSupportCount = 0
  state.supportPlaneModeLabel = 'neutral-reset'
  state.isFinite = true

  return state
}

export function updateChassisAttitudeState(
  state,
  wheelStates = [],
  spec = {},
  dtSeconds = 0
) {
  if (!state) return state

  const previousHeaveOffsetMeters = state.heaveOffsetMeters
  const previousPitchRadians = state.pitchRadians
  const previousRollRadians = state.rollRadians
  const sample = estimateSupportPlaneFromWheelStates(wheelStates, spec)
  const responseAlpha = calculateResponseAlpha(dtSeconds, spec)

  state.groundedSupportCount = sample.groundedSupportCount
  state.supportPlaneModeLabel = sample.supportPlaneModeLabel
  state.heaveOffsetMeters = lerp(
    previousHeaveOffsetMeters,
    sample.heaveOffsetMeters,
    responseAlpha
  )
  state.pitchRadians = lerp(
    previousPitchRadians,
    sample.pitchRadians,
    responseAlpha
  )
  state.rollRadians = lerp(
    previousRollRadians,
    sample.rollRadians,
    responseAlpha
  )
  state.visualBodyHeightMeters =
    resolveVisualBodyHeightMeters(spec) + state.heaveOffsetMeters

  const safeDtSeconds = sanitizeNonNegativeNumber(dtSeconds)
  if (safeDtSeconds > 0) {
    state.heaveVelocityMetersPerSecond =
      (state.heaveOffsetMeters - previousHeaveOffsetMeters) / safeDtSeconds
    state.pitchRateRadiansPerSecond =
      (state.pitchRadians - previousPitchRadians) / safeDtSeconds
    state.rollRateRadiansPerSecond =
      (state.rollRadians - previousRollRadians) / safeDtSeconds
  } else {
    state.heaveVelocityMetersPerSecond = 0
    state.pitchRateRadiansPerSecond = 0
    state.rollRateRadiansPerSecond = 0
  }

  sanitizeChassisAttitudeState(state, spec)

  return state
}

export function estimateSupportPlaneFromWheelStates(wheelStates = [], spec = {}) {
  const samples = []
  const safeWheelStates = Array.isArray(wheelStates) ? wheelStates : []

  for (const wheelState of safeWheelStates) {
    const sample = createWheelSupportSample(wheelState)
    if (sample) samples.push(sample)
  }

  if (samples.length === 0 || spec.chassisAttitudeEnabled === false) {
    return createNeutralEstimate(
      0,
      spec.chassisAttitudeEnabled === false
        ? 'disabled-neutral'
        : 'no-grounded-support'
    )
  }

  const maximumHeaveOffsetMeters = resolveMaximumHeaveOffsetMeters(spec)
  const maximumPitchRadians = resolveMaximumPitchRadians(spec)
  const maximumRollRadians = resolveMaximumRollRadians(spec)
  let meanXMeters = 0
  let meanZMeters = 0
  let meanSupportOffsetMeters = 0

  for (const sample of samples) {
    meanXMeters += sample.xMeters
    meanZMeters += sample.zMeters
    meanSupportOffsetMeters += sample.supportOffsetMeters
  }

  meanXMeters /= samples.length
  meanZMeters /= samples.length
  meanSupportOffsetMeters /= samples.length

  let xx = 0
  let zz = 0
  let xz = 0
  let xy = 0
  let zy = 0

  for (const sample of samples) {
    const centeredXMeters = sample.xMeters - meanXMeters
    const centeredZMeters = sample.zMeters - meanZMeters
    const centeredSupportOffsetMeters =
      sample.supportOffsetMeters - meanSupportOffsetMeters

    xx += centeredXMeters * centeredXMeters
    zz += centeredZMeters * centeredZMeters
    xz += centeredXMeters * centeredZMeters
    xy += centeredXMeters * centeredSupportOffsetMeters
    zy += centeredZMeters * centeredSupportOffsetMeters
  }

  const determinant = xx * zz - xz * xz
  let supportSlopeRightMetersPerMeter = 0
  let supportSlopeForwardMetersPerMeter = 0
  let supportPlaneModeLabel = 'support-plane-estimate'

  if (samples.length >= 3 && Math.abs(determinant) > SUPPORT_PLANE_EPSILON) {
    supportSlopeRightMetersPerMeter = (xy * zz - zy * xz) / determinant
    supportSlopeForwardMetersPerMeter = (zy * xx - xy * xz) / determinant
  } else {
    supportPlaneModeLabel = 'insufficient-support-neutral-attitude'
  }

  const heaveOffsetMeters = clamp(
    meanSupportOffsetMeters,
    -maximumHeaveOffsetMeters,
    maximumHeaveOffsetMeters
  )
  const pitchRadians = clamp(
    -Math.atan(supportSlopeForwardMetersPerMeter),
    -maximumPitchRadians,
    maximumPitchRadians
  )
  const rollRadians = clamp(
    Math.atan(supportSlopeRightMetersPerMeter),
    -maximumRollRadians,
    maximumRollRadians
  )

  return {
    heaveOffsetMeters,
    pitchRadians,
    rollRadians,
    groundedSupportCount: samples.length,
    supportPlaneModeLabel,
  }
}

function createWheelSupportSample(wheelState) {
  if (wheelState?.isGrounded !== true) return null

  const localPosition = wheelState.localPosition ?? wheelState.contactPatchLocal
  const wheelCenterLocalPosition =
    wheelState.wheelCenterLocalPosition ?? wheelState.localPosition

  if (
    !hasFiniteVector3(localPosition) ||
    !hasFiniteVector3(wheelCenterLocalPosition)
  ) {
    return null
  }

  return {
    xMeters: localPosition.x,
    zMeters: localPosition.z,
    supportOffsetMeters:
      wheelCenterLocalPosition.y - localPosition.y,
  }
}

function createNeutralEstimate(groundedSupportCount, supportPlaneModeLabel) {
  return {
    heaveOffsetMeters: 0,
    pitchRadians: 0,
    rollRadians: 0,
    groundedSupportCount,
    supportPlaneModeLabel,
  }
}

function sanitizeChassisAttitudeState(state, spec) {
  const maximumHeaveOffsetMeters = resolveMaximumHeaveOffsetMeters(spec)
  const maximumPitchRadians = resolveMaximumPitchRadians(spec)
  const maximumRollRadians = resolveMaximumRollRadians(spec)

  state.heaveOffsetMeters = clamp(
    sanitizeNumber(state.heaveOffsetMeters),
    -maximumHeaveOffsetMeters,
    maximumHeaveOffsetMeters
  )
  state.heaveVelocityMetersPerSecond = sanitizeNumber(
    state.heaveVelocityMetersPerSecond
  )
  state.pitchRadians = clamp(
    sanitizeNumber(state.pitchRadians),
    -maximumPitchRadians,
    maximumPitchRadians
  )
  state.pitchRateRadiansPerSecond = sanitizeNumber(
    state.pitchRateRadiansPerSecond
  )
  state.rollRadians = clamp(
    sanitizeNumber(state.rollRadians),
    -maximumRollRadians,
    maximumRollRadians
  )
  state.rollRateRadiansPerSecond = sanitizeNumber(
    state.rollRateRadiansPerSecond
  )
  state.visualBodyHeightMeters = sanitizeNumber(
    state.visualBodyHeightMeters,
    resolveVisualBodyHeightMeters(spec)
  )
  state.groundedSupportCount = Math.max(
    0,
    Number.isInteger(state.groundedSupportCount)
      ? state.groundedSupportCount
      : 0
  )
  state.supportPlaneModeLabel =
    typeof state.supportPlaneModeLabel === 'string'
      ? state.supportPlaneModeLabel
      : 'invalid-sanitized'
  state.isFinite =
    Number.isFinite(state.heaveOffsetMeters) &&
    Number.isFinite(state.heaveVelocityMetersPerSecond) &&
    Number.isFinite(state.pitchRadians) &&
    Number.isFinite(state.pitchRateRadiansPerSecond) &&
    Number.isFinite(state.rollRadians) &&
    Number.isFinite(state.rollRateRadiansPerSecond) &&
    Number.isFinite(state.visualBodyHeightMeters)
}

function calculateResponseAlpha(dtSeconds, spec) {
  const safeDtSeconds = sanitizeNonNegativeNumber(dtSeconds)
  const responseSeconds = sanitizeNonNegativeNumber(
    spec.chassisAttitudeResponseSeconds,
    DEFAULT_CHASSIS_ATTITUDE_SPEC.chassisAttitudeResponseSeconds
  )

  if (safeDtSeconds <= 0) return 0
  if (responseSeconds <= Number.EPSILON) return 1

  return clamp01(1 - Math.exp(-safeDtSeconds / responseSeconds))
}

function resolveVisualBodyHeightMeters(spec) {
  return sanitizeNumber(
    spec.chassisAttitudeVisualBodyHeightMeters,
    DEFAULT_CHASSIS_ATTITUDE_SPEC.chassisAttitudeVisualBodyHeightMeters
  )
}

function resolveMaximumHeaveOffsetMeters(spec) {
  return sanitizePositiveNumber(
    spec.chassisAttitudeMaximumHeaveOffsetMeters,
    DEFAULT_CHASSIS_ATTITUDE_SPEC.chassisAttitudeMaximumHeaveOffsetMeters
  )
}

function resolveMaximumPitchRadians(spec) {
  return sanitizePositiveNumber(
    spec.chassisAttitudeMaximumPitchRadians,
    DEFAULT_CHASSIS_ATTITUDE_SPEC.chassisAttitudeMaximumPitchRadians
  )
}

function resolveMaximumRollRadians(spec) {
  return sanitizePositiveNumber(
    spec.chassisAttitudeMaximumRollRadians,
    DEFAULT_CHASSIS_ATTITUDE_SPEC.chassisAttitudeMaximumRollRadians
  )
}

function hasFiniteVector3(value) {
  return (
    value &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  )
}

function lerp(start, end, alpha) {
  return start + (end - start) * clamp01(alpha)
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

function clamp01(value) {
  return clamp(sanitizeNumber(value), 0, 1)
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, sanitizeNumber(value)))
}
