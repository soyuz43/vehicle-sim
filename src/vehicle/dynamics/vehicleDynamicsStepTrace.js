// src/vehicle/dynamics/vehicleDynamicsStepTrace.js

export const VEHICLE_DYNAMICS_STEP_TRACE_STAGES = Object.freeze({
  INTEGRATION_INPUT: 'integrationInput',
  POST_INTEGRATION: 'postIntegration',
})

const VEHICLE_DYNAMICS_UPDATE_ORDER = Object.freeze([
  'input-steering-and-brake-lights',
  'quasi-static-chassis-support-height',
  'pressure-adjusted-radius-and-suspension-ray-contact',
  'spring-damper-base-support-and-load-transfer',
  'driver-force-brake-torque-and-abs',
  'contact-plane-basis-and-pre-integration-slip',
  'longitudinal-and-lateral-tire-force',
  'integration-input-force-yaw-and-slope-gravity-budget',
  'wheel-angular-dynamics',
  'powertrain-kinematics-telemetry',
  'yaw-planar-and-position-integration',
  'post-integration-traction-telemetry-without-contact-or-force-refresh',
  'wheel-visual-sync',
])

const DEFAULT_GRAVITY_METERS_PER_SECOND_SQUARED = 9.80665

export function createVehicleDynamicsStepTrace(wheelStates = []) {
  return {
    kind: 'vehicle-dynamics-step-trace-v1',
    version: 1,
    behaviorImpact: 'telemetry-only',
    historyMode: 'latest-step-only',
    stepIndex: 0,
    stepDeltaSeconds: 0,
    updateOrder: VEHICLE_DYNAMICS_UPDATE_ORDER,
    stages: {
      [VEHICLE_DYNAMICS_STEP_TRACE_STAGES.INTEGRATION_INPUT]:
        createStageTrace(
          VEHICLE_DYNAMICS_STEP_TRACE_STAGES.INTEGRATION_INPUT,
          'integrated-this-step',
          wheelStates
        ),
      [VEHICLE_DYNAMICS_STEP_TRACE_STAGES.POST_INTEGRATION]:
        createStageTrace(
          VEHICLE_DYNAMICS_STEP_TRACE_STAGES.POST_INTEGRATION,
          'not-integrated-this-step',
          wheelStates
        ),
    },
  }
}

export function resetVehicleDynamicsStepTrace(
  trace,
  wheelStates = []
) {
  trace.stepIndex = 0
  trace.stepDeltaSeconds = 0
  resetStageTrace(
    trace.stages[VEHICLE_DYNAMICS_STEP_TRACE_STAGES.INTEGRATION_INPUT],
    wheelStates
  )
  resetStageTrace(
    trace.stages[VEHICLE_DYNAMICS_STEP_TRACE_STAGES.POST_INTEGRATION],
    wheelStates
  )

  return trace
}

export function beginVehicleDynamicsStepTrace(
  trace,
  dtSeconds,
  wheelStates = []
) {
  trace.stepIndex = sanitizeNonNegativeInteger(trace.stepIndex) + 1
  trace.stepDeltaSeconds = sanitizeNonNegativeNumber(dtSeconds)
  resetStageTrace(
    trace.stages[VEHICLE_DYNAMICS_STEP_TRACE_STAGES.INTEGRATION_INPUT],
    wheelStates
  )
  resetStageTrace(
    trace.stages[VEHICLE_DYNAMICS_STEP_TRACE_STAGES.POST_INTEGRATION],
    wheelStates
  )

  return trace
}

export function captureVehicleDynamicsStepTraceStage(
  trace,
  stageName,
  wheelStates = [],
  forces = {},
  gravityMetersPerSecondSquared =
    DEFAULT_GRAVITY_METERS_PER_SECOND_SQUARED
) {
  const stage = trace?.stages?.[stageName]

  if (!stage) {
    throw new Error(`Unknown vehicle dynamics trace stage: ${stageName}`)
  }

  const safeWheelStates = Array.isArray(wheelStates) ? wheelStates : []

  resetStageTrace(stage, safeWheelStates)
  stage.hasSample = true

  for (
    let wheelIndex = 0;
    wheelIndex < safeWheelStates.length;
    wheelIndex += 1
  ) {
    const wheelState = safeWheelStates[wheelIndex] ?? {}
    const wheelTrace = stage.wheels[wheelIndex]
    const isGrounded = wheelState.isGrounded === true
    const normalForceNewtons = sanitizeNonNegativeNumber(
      wheelState.normalForceNewtons
    )
    const tractionLimitNewtons = sanitizeNonNegativeNumber(
      wheelState.tractionLimitNewtons
    )
    const targetLongitudinalTireForceNewtons = sanitizeNumber(
      wheelState.targetLongitudinalTireForceNewtons
    )
    const relaxedLongitudinalTireForceNewtons = sanitizeNumber(
      wheelState.relaxedLongitudinalTireForceNewtons
    )
    const appliedLongitudinalForceNewtons = sanitizeNumber(
      wheelState.appliedLongitudinalForceNewtons
    )
    const appliedLateralTireForceNewtons = sanitizeNumber(
      wheelState.appliedLateralTireForceNewtons
    )
    const suspensionCurrentLengthMeters = sanitizeNonNegativeNumber(
      wheelState.suspensionCurrentLengthMeters
    )
    const suspensionCompressionMeters = sanitizeNonNegativeNumber(
      wheelState.suspensionCompressionMeters
    )
    const rawSuspensionNormalForceNewtons = sanitizeNonNegativeNumber(
      wheelState.rawSuspensionNormalForceNewtons
    )
    const baseNormalForceNewtons = sanitizeNonNegativeNumber(
      wheelState.baseNormalForceNewtons
    )

    wheelTrace.id = sanitizeIdentifier(
      wheelState.id ?? wheelState.wheelId,
      wheelIndex
    )
    wheelTrace.isGrounded = isGrounded
    wheelTrace.normalForceNewtons = normalForceNewtons
    wheelTrace.tractionLimitNewtons = tractionLimitNewtons
    wheelTrace.targetLongitudinalTireForceNewtons =
      targetLongitudinalTireForceNewtons
    wheelTrace.relaxedLongitudinalTireForceNewtons =
      relaxedLongitudinalTireForceNewtons
    wheelTrace.appliedLongitudinalForceNewtons =
      appliedLongitudinalForceNewtons
    wheelTrace.appliedLateralTireForceNewtons =
      appliedLateralTireForceNewtons
    wheelTrace.suspensionContactStatus =
      typeof wheelState.suspensionContactStatus === 'string'
        ? wheelState.suspensionContactStatus
        : 'unavailable'
    wheelTrace.suspensionCurrentLengthMeters = suspensionCurrentLengthMeters
    wheelTrace.suspensionCompressionMeters = suspensionCompressionMeters
    wheelTrace.rawSuspensionNormalForceNewtons =
      rawSuspensionNormalForceNewtons
    wheelTrace.baseNormalForceNewtons = baseNormalForceNewtons
    wheelTrace.contactSlopeDegrees = sanitizeNonNegativeNumber(
      wheelState.contactSlopeDegrees
    )
    wheelTrace.isContactTangentBasisValid =
      wheelState.isContactTangentBasisValid === true

    if (isGrounded) {
      stage.groundedWheelCount += 1
      stage.normalForceSummary.minGroundedNewtons =
        stage.groundedWheelCount === 1
          ? normalForceNewtons
          : Math.min(
              stage.normalForceSummary.minGroundedNewtons,
              normalForceNewtons
            )
      stage.normalForceSummary.maxGroundedNewtons = Math.max(
        stage.normalForceSummary.maxGroundedNewtons,
        normalForceNewtons
      )
      stage.tractionLimitSummary.minGroundedNewtons =
        stage.groundedWheelCount === 1
          ? tractionLimitNewtons
          : Math.min(
              stage.tractionLimitSummary.minGroundedNewtons,
              tractionLimitNewtons
            )
      stage.tractionLimitSummary.maxGroundedNewtons = Math.max(
        stage.tractionLimitSummary.maxGroundedNewtons,
        tractionLimitNewtons
      )
    }

    stage.normalForceSummary.totalNewtons = addFinite(
      stage.normalForceSummary.totalNewtons,
      normalForceNewtons
    )
    stage.tractionLimitSummary.totalNewtons = addFinite(
      stage.tractionLimitSummary.totalNewtons,
      tractionLimitNewtons
    )
    stage.longitudinalTireForceSummary.requestedTotalNewtons = addFinite(
      stage.longitudinalTireForceSummary.requestedTotalNewtons,
      wheelState.requestedLongitudinalForceNewtons
    )
    stage.longitudinalTireForceSummary.targetTotalNewtons = addFinite(
      stage.longitudinalTireForceSummary.targetTotalNewtons,
      targetLongitudinalTireForceNewtons
    )
    stage.longitudinalTireForceSummary.relaxedTotalNewtons = addFinite(
      stage.longitudinalTireForceSummary.relaxedTotalNewtons,
      relaxedLongitudinalTireForceNewtons
    )
    stage.longitudinalTireForceSummary.appliedTotalNewtons = addFinite(
      stage.longitudinalTireForceSummary.appliedTotalNewtons,
      appliedLongitudinalForceNewtons
    )
    stage.lateralTireForceSummary.appliedTotalNewtons = addFinite(
      stage.lateralTireForceSummary.appliedTotalNewtons,
      appliedLateralTireForceNewtons
    )
    stage.lateralTireForceSummary.appliedAbsoluteTotalNewtons = addFinite(
      stage.lateralTireForceSummary.appliedAbsoluteTotalNewtons,
      Math.abs(appliedLateralTireForceNewtons)
    )
  }

  stage.planarForceSummary.netLongitudinalNewtons = sanitizeNumber(
    forces.netLongitudinalForceNewtons
  )
  stage.planarForceSummary.netLateralNewtons = sanitizeNumber(
    forces.netLateralForceNewtons
  )
  stage.planarForceSummary.netWorldXNewtons = sanitizeNumber(
    forces.netForceWorldXNewtons
  )
  stage.planarForceSummary.netWorldZNewtons = sanitizeNumber(
    forces.netForceWorldZNewtons
  )
  stage.yawMomentSummary.totalNewtonMeters = sanitizeNumber(
    forces.yawMomentNewtonMeters
  )
  stage.yawMomentSummary.longitudinalNewtonMeters = sanitizeNumber(
    forces.netLongitudinalYawMomentNewtonMeters
  )
  stage.yawMomentSummary.lateralNewtonMeters = sanitizeNumber(
    forces.netLateralYawMomentNewtonMeters
  )
  stage.aerodynamicDragForceNewtons = sanitizeNonNegativeNumber(
    forces.aerodynamicDragForceNewtons
  )
  stage.slopeGravityForceWorldXNewtons = sanitizeNumber(
    forces.slopeGravityForceWorldXNewtons
  )
  stage.slopeGravityForceWorldZNewtons = sanitizeNumber(
    forces.slopeGravityForceWorldZNewtons
  )
  stage.slopeGravityForceNewtons = sanitizeNonNegativeNumber(
    forces.slopeGravityForceNewtons
  )

  const forwardAccelerationMetersPerSecondSquared = sanitizeNumber(
    forces.longitudinalAccelerationMetersPerSecondSquared
  )
  const lateralAccelerationMetersPerSecondSquared = sanitizeNumber(
    forces.lateralAccelerationMetersPerSecondSquared
  )
  const gravity = sanitizePositiveNumber(
    gravityMetersPerSecondSquared,
    DEFAULT_GRAVITY_METERS_PER_SECOND_SQUARED
  )

  stage.accelerationSummary.forwardMetersPerSecondSquared =
    forwardAccelerationMetersPerSecondSquared
  stage.accelerationSummary.lateralMetersPerSecondSquared =
    lateralAccelerationMetersPerSecondSquared
  stage.accelerationSummary.forwardG =
    forwardAccelerationMetersPerSecondSquared / gravity
  stage.accelerationSummary.lateralG =
    lateralAccelerationMetersPerSecondSquared / gravity
  stage.accelerationSummary.totalG = Math.hypot(
    stage.accelerationSummary.forwardG,
    stage.accelerationSummary.lateralG
  )

  return trace
}

function createStageTrace(stageName, behaviorRole, wheelStates) {
  const stage = {
    stageName,
    behaviorRole,
    hasSample: false,
    wheelCount: 0,
    groundedWheelCount: 0,
    normalForceSummary: {
      totalNewtons: 0,
      minGroundedNewtons: 0,
      maxGroundedNewtons: 0,
    },
    tractionLimitSummary: {
      totalNewtons: 0,
      minGroundedNewtons: 0,
      maxGroundedNewtons: 0,
    },
    longitudinalTireForceSummary: {
      requestedTotalNewtons: 0,
      targetTotalNewtons: 0,
      relaxedTotalNewtons: 0,
      appliedTotalNewtons: 0,
    },
    lateralTireForceSummary: {
      appliedTotalNewtons: 0,
      appliedAbsoluteTotalNewtons: 0,
    },
    planarForceSummary: {
      netLongitudinalNewtons: 0,
      netLateralNewtons: 0,
      netWorldXNewtons: 0,
      netWorldZNewtons: 0,
    },
    yawMomentSummary: {
      totalNewtonMeters: 0,
      longitudinalNewtonMeters: 0,
      lateralNewtonMeters: 0,
    },
    aerodynamicDragForceNewtons: 0,
    slopeGravityForceWorldXNewtons: 0,
    slopeGravityForceWorldZNewtons: 0,
    slopeGravityForceNewtons: 0,
    accelerationSummary: {
      forwardMetersPerSecondSquared: 0,
      lateralMetersPerSecondSquared: 0,
      forwardG: 0,
      lateralG: 0,
      totalG: 0,
    },
    wheels: [],
  }

  resetStageTrace(stage, wheelStates)
  return stage
}

function resetStageTrace(stage, wheelStates) {
  const safeWheelStates = Array.isArray(wheelStates) ? wheelStates : []

  ensureWheelTraceCount(stage.wheels, safeWheelStates.length)
  stage.hasSample = false
  stage.wheelCount = safeWheelStates.length
  stage.groundedWheelCount = 0
  resetForceRangeSummary(stage.normalForceSummary)
  resetForceRangeSummary(stage.tractionLimitSummary)
  stage.longitudinalTireForceSummary.requestedTotalNewtons = 0
  stage.longitudinalTireForceSummary.targetTotalNewtons = 0
  stage.longitudinalTireForceSummary.relaxedTotalNewtons = 0
  stage.longitudinalTireForceSummary.appliedTotalNewtons = 0
  stage.lateralTireForceSummary.appliedTotalNewtons = 0
  stage.lateralTireForceSummary.appliedAbsoluteTotalNewtons = 0
  stage.planarForceSummary.netLongitudinalNewtons = 0
  stage.planarForceSummary.netLateralNewtons = 0
  stage.planarForceSummary.netWorldXNewtons = 0
  stage.planarForceSummary.netWorldZNewtons = 0
  stage.yawMomentSummary.totalNewtonMeters = 0
  stage.yawMomentSummary.longitudinalNewtonMeters = 0
  stage.yawMomentSummary.lateralNewtonMeters = 0
  stage.aerodynamicDragForceNewtons = 0
  stage.slopeGravityForceWorldXNewtons = 0
  stage.slopeGravityForceWorldZNewtons = 0
  stage.slopeGravityForceNewtons = 0
  stage.accelerationSummary.forwardMetersPerSecondSquared = 0
  stage.accelerationSummary.lateralMetersPerSecondSquared = 0
  stage.accelerationSummary.forwardG = 0
  stage.accelerationSummary.lateralG = 0
  stage.accelerationSummary.totalG = 0

  for (let wheelIndex = 0; wheelIndex < stage.wheels.length; wheelIndex += 1) {
    const wheelState = safeWheelStates[wheelIndex] ?? {}
    const wheelTrace = stage.wheels[wheelIndex]

    wheelTrace.id = sanitizeIdentifier(
      wheelState.id ?? wheelState.wheelId,
      wheelIndex
    )
    wheelTrace.isGrounded = false
    wheelTrace.normalForceNewtons = 0
    wheelTrace.tractionLimitNewtons = 0
    wheelTrace.targetLongitudinalTireForceNewtons = 0
    wheelTrace.relaxedLongitudinalTireForceNewtons = 0
    wheelTrace.appliedLongitudinalForceNewtons = 0
    wheelTrace.appliedLateralTireForceNewtons = 0
    wheelTrace.suspensionContactStatus = 'unavailable'
    wheelTrace.suspensionCurrentLengthMeters = 0
    wheelTrace.suspensionCompressionMeters = 0
    wheelTrace.rawSuspensionNormalForceNewtons = 0
    wheelTrace.baseNormalForceNewtons = 0
    wheelTrace.contactSlopeDegrees = 0
    wheelTrace.isContactTangentBasisValid = false
  }
}

function ensureWheelTraceCount(wheelTraces, wheelCount) {
  while (wheelTraces.length < wheelCount) {
    wheelTraces.push({
      id: '',
      isGrounded: false,
      normalForceNewtons: 0,
      tractionLimitNewtons: 0,
      targetLongitudinalTireForceNewtons: 0,
      relaxedLongitudinalTireForceNewtons: 0,
      appliedLongitudinalForceNewtons: 0,
      appliedLateralTireForceNewtons: 0,
      suspensionContactStatus: 'unavailable',
      suspensionCurrentLengthMeters: 0,
      suspensionCompressionMeters: 0,
      rawSuspensionNormalForceNewtons: 0,
      baseNormalForceNewtons: 0,
      contactSlopeDegrees: 0,
      isContactTangentBasisValid: false,
    })
  }

  if (wheelTraces.length > wheelCount) {
    wheelTraces.length = wheelCount
  }
}

function resetForceRangeSummary(summary) {
  summary.totalNewtons = 0
  summary.minGroundedNewtons = 0
  summary.maxGroundedNewtons = 0
}


function addFinite(total, value) {
  const nextTotal = sanitizeNumber(total) + sanitizeNumber(value)
  return Number.isFinite(nextTotal) ? nextTotal : 0
}

function sanitizeIdentifier(value, fallbackIndex) {
  if (typeof value === 'string') return value
  if (Number.isFinite(value)) return String(value)
  return `wheel-${fallbackIndex}`
}

function sanitizeNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0
}

function sanitizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeNonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function sanitizeNumber(value) {
  return Number.isFinite(value) ? value : 0
}
