// src/vehicle/dynamics/dynamicsTuningState.js

const DEFAULT_CHASSIS_ATTITUDE_TUNING = Object.freeze({
  responseSeconds: 0.08,
  maximumHeaveOffsetMeters: 0.18,
  maximumPitchRadians: 0.12,
  maximumRollRadians: 0.12,
})

const DYNAMICS_TUNING_LIMITS = Object.freeze({
  driveTorqueMultiplier: Object.freeze({
    defaultValue: 1,
    min: 0.25,
    max: 5,
  }),
  serviceBrakeTorqueMultiplier: Object.freeze({
    defaultValue: 1,
    min: 0.25,
    max: 5,
  }),
  longitudinalTireStiffnessMultiplier: Object.freeze({
    defaultValue: 1,
    min: 0.25,
    max: 4,
  }),
})

export function createDynamicsTuningState(overrides = {}) {
  return updateDynamicsTuningState(
    createDefaultDynamicsTuningState(),
    overrides
  )
}

export function resetDynamicsTuningState(dynamicsTuningState) {
  return updateDynamicsTuningState(
    dynamicsTuningState,
    createDefaultDynamicsTuningState()
  )
}

export function updateDynamicsTuningState(
  dynamicsTuningState,
  nextDynamicsTuning = {}
) {
  dynamicsTuningState.driveTorqueMultiplier = sanitizeTuningMultiplier(
    nextDynamicsTuning.driveTorqueMultiplier,
    DYNAMICS_TUNING_LIMITS.driveTorqueMultiplier
  )
  dynamicsTuningState.serviceBrakeTorqueMultiplier = sanitizeTuningMultiplier(
    nextDynamicsTuning.serviceBrakeTorqueMultiplier,
    DYNAMICS_TUNING_LIMITS.serviceBrakeTorqueMultiplier
  )
  dynamicsTuningState.longitudinalTireStiffnessMultiplier = sanitizeTuningMultiplier(
    nextDynamicsTuning.longitudinalTireStiffnessMultiplier,
    DYNAMICS_TUNING_LIMITS.longitudinalTireStiffnessMultiplier
  )
  dynamicsTuningState.chassisAttitudeResponseSeconds = sanitizeChassisAttitudeTuningValue(
    nextDynamicsTuning.chassisAttitudeResponseSeconds,
    dynamicsTuningState.chassisAttitudeResponseSeconds,
    DEFAULT_CHASSIS_ATTITUDE_TUNING.responseSeconds
  )
  dynamicsTuningState.chassisAttitudeMaximumHeaveOffsetMeters =
    sanitizeChassisAttitudeTuningValue(
      nextDynamicsTuning.chassisAttitudeMaximumHeaveOffsetMeters,
      dynamicsTuningState.chassisAttitudeMaximumHeaveOffsetMeters,
      DEFAULT_CHASSIS_ATTITUDE_TUNING.maximumHeaveOffsetMeters
    )
  dynamicsTuningState.chassisAttitudeMaximumPitchRadians =
    sanitizeChassisAttitudeTuningValue(
      nextDynamicsTuning.chassisAttitudeMaximumPitchRadians,
      dynamicsTuningState.chassisAttitudeMaximumPitchRadians,
      DEFAULT_CHASSIS_ATTITUDE_TUNING.maximumPitchRadians
    )
  dynamicsTuningState.chassisAttitudeMaximumRollRadians =
    sanitizeChassisAttitudeTuningValue(
      nextDynamicsTuning.chassisAttitudeMaximumRollRadians,
      dynamicsTuningState.chassisAttitudeMaximumRollRadians,
      DEFAULT_CHASSIS_ATTITUDE_TUNING.maximumRollRadians
    )
  dynamicsTuningState.limits = DYNAMICS_TUNING_LIMITS

  return dynamicsTuningState
}

function createDefaultDynamicsTuningState() {
  return {
    driveTorqueMultiplier:
      DYNAMICS_TUNING_LIMITS.driveTorqueMultiplier.defaultValue,
    serviceBrakeTorqueMultiplier:
      DYNAMICS_TUNING_LIMITS.serviceBrakeTorqueMultiplier.defaultValue,
    longitudinalTireStiffnessMultiplier:
      DYNAMICS_TUNING_LIMITS.longitudinalTireStiffnessMultiplier.defaultValue,
    chassisAttitudeResponseSeconds:
      DEFAULT_CHASSIS_ATTITUDE_TUNING.responseSeconds,
    chassisAttitudeMaximumHeaveOffsetMeters:
      DEFAULT_CHASSIS_ATTITUDE_TUNING.maximumHeaveOffsetMeters,
    chassisAttitudeMaximumPitchRadians:
      DEFAULT_CHASSIS_ATTITUDE_TUNING.maximumPitchRadians,
    chassisAttitudeMaximumRollRadians:
      DEFAULT_CHASSIS_ATTITUDE_TUNING.maximumRollRadians,
    limits: DYNAMICS_TUNING_LIMITS,
  }
}

function sanitizeTuningMultiplier(value, limits) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) return limits.defaultValue

  return Math.min(Math.max(numericValue, limits.min), limits.max)
}

function sanitizeChassisAttitudeTuningValue(value, previous, fallback) {
  const numericValue = Number(value)

  if (Number.isFinite(numericValue) && numericValue >= 0) return numericValue
  return Number.isFinite(previous) ? previous : fallback
}