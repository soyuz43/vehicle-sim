// src/vehicle/dynamics/dynamicsTuningState.js

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
    limits: DYNAMICS_TUNING_LIMITS,
  }
}

function sanitizeTuningMultiplier(value, limits) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) return limits.defaultValue

  return Math.min(Math.max(numericValue, limits.min), limits.max)
}