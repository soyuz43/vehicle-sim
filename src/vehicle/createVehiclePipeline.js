// src/vehicle/createVehiclePipeline.js

import { VEHICLE_DYNAMICS_STEP_TRACE_STAGES } from './dynamics/vehicleDynamicsStepTrace.js'

const PIPELINE_STAGES = [
  // Input & setup
  'readInput',
  'updateSteering',
  'updateBrakeLights',

  // Terrain & contact (chassis)
  'updateTerrainSupportAndContact',

  // Aero & thermal (tire)
  'applyAeroAndTireThermal',

  // Chassis attitude (chassis)
  'updateChassisAttitude',

  // Powertrain torque requests (powertrain)
  'calculateLongitudinalForceRequests',

  // Slip telemetry (tire)
  'updateLateralSlipTelemetry',
  'updateLongitudinalSlipTelemetry',

  // Tire force models (tire)
  'calculateLongitudinalTireForces',
  'calculateLateralTireForces',
  'updateCombinedSlipTireForces',

  // Force aggregation (chassis)
  'calculatePlanarForces',
  'captureTrace:INTEGRATION_INPUT',

  // Post-force summaries (tire)
  'updateLateralTireForceSummary',

  // Assist systems (assist)
  'updateAssistSystems',

  // Wheel rotational integration (powertrain)
  'updateWheelRotationalStates',

  // Powertrain kinematics (powertrain)
  'updatePowertrainKinematics',

  // Chassis integration (chassis)
  'updateYawState',
  'updatePlanarMotion',
  'updatePosition',
  'syncVehicleYaw',

  // Post-integration telemetry (tire)
  'refreshPostIntegrationTelemetry',
  'captureTrace:POST_INTEGRATION',

  // Visual sync
  'updateWheelVisualStates',
]

const TRACE_STAGE_MAP = {
  'captureTrace:INTEGRATION_INPUT': VEHICLE_DYNAMICS_STEP_TRACE_STAGES.INTEGRATION_INPUT,
  'captureTrace:POST_INTEGRATION': VEHICLE_DYNAMICS_STEP_TRACE_STAGES.POST_INTEGRATION,
}

function createVehiclePipeline(subControllers, config = {}) {
  const {
    vehicle,
    spec,
    params,
    wheelStates,
    planarMotion,
    vehicleDynamicsStepTrace,
    forces,
    terrainContactQuery,
    startPosition,
    startRotation,
    getSnapshot,
  } = config

  const sharedState = {
    // Inputs (set each step)
    dt: 0,
    throttleInput: 0,
    brakeInput: 0,
    parkingBrakeInput: 0,
    steeringInput: 0,
    gear: 'drive',

    // Core references
    vehicle,
    spec,
    params,
    wheelStates,
    planarMotion,
    vehicleDynamicsStepTrace,
    forces,
    terrainContactQuery,
    startPosition,
    startRotation,

    // Sub-controller state namespaces (populated by sub-controllers)
    powertrain: {},
    chassis: {},
    tire: {},
    assist: {},

    // Cross-cutting
    getSnapshot,
  }

  // Initialize sub-controllers with shared state reference
  for (const [name, controller] of Object.entries(subControllers)) {
    if (controller.initialize) {
      controller.initialize(sharedState)
    }
    // Expose sub-controller for pipeline aggregation
    sharedState[name] = controller
  }

  function step(dt, input = {}) {
    const safeDt = sanitizeDeltaTime(dt, params)
    sharedState.dt = safeDt

    // Read input into shared state
    sharedState.throttleInput = Boolean(input.throttle ?? input.forward) ? 1 : 0
    sharedState.brakeInput = Boolean(input.brake ?? input.reverse) ? 1 : 0
    sharedState.parkingBrakeInput = Boolean(input.parkingBrake) ? 1 : 0

    if (input.left && !input.right) {
      sharedState.steeringInput = 1
    } else if (input.right && !input.left) {
      sharedState.steeringInput = -1
    } else {
      sharedState.steeringInput = 0
    }

    sharedState.gear = input.gear ?? sharedState.gear

    // Begin step trace
    if (vehicleDynamicsStepTrace && vehicleDynamicsStepTrace.begin) {
      vehicleDynamicsStepTrace.begin(safeDt, wheelStates)
    }

    // Execute pipeline stages
    for (const stageName of PIPELINE_STAGES) {
      executeStage(stageName, sharedState, safeDt)
    }

    return getSnapshot()
  }

  function executeStage(stageName, state, dt) {
    // Handle trace capture stages
    if (stageName.startsWith('captureTrace:')) {
      const traceStage = TRACE_STAGE_MAP[stageName]
      if (traceStage && state.vehicleDynamicsStepTrace && state.vehicleDynamicsStepTrace.capture) {
        state.vehicleDynamicsStepTrace.capture(traceStage, state.wheelStates, state.forces, state.spec.gravityMetersPerSecondSquared)
      }
      return
    }

    // Find which sub-controller owns this stage
    const controller = findControllerForStage(stageName, state)
    if (controller && controller[stageName]) {
      controller[stageName](state, dt)
    }
  }

  function findControllerForStage(stageName, state) {
    // Stage ownership mapping
    const stageOwners = {
      // Input stages - handled inline in step()
      readInput: null,
      updateSteering: 'tire',
      updateBrakeLights: 'chassis',

      // Chassis stages
      updateTerrainSupportAndContact: 'chassis',
      updateChassisAttitude: 'chassis',
      calculatePlanarForces: 'chassis',
      updateYawState: 'chassis',
      updatePlanarMotion: 'chassis',
      updatePosition: 'chassis',
      syncVehicleYaw: 'chassis',

      // Tire stages
      applyAeroAndTireThermal: 'tire',
      updateLateralSlipTelemetry: 'tire',
      updateLongitudinalSlipTelemetry: 'tire',
      calculateLongitudinalTireForces: 'tire',
      calculateLateralTireForces: 'tire',
      updateCombinedSlipTireForces: 'tire',
      updateLateralTireForceSummary: 'tire',
      refreshPostIntegrationTelemetry: 'tire',

      // Powertrain stages
      calculateLongitudinalForceRequests: 'powertrain',
      updateWheelRotationalStates: 'powertrain',
      updatePowertrainKinematics: 'powertrain',

      // Assist stages
      updateAssistSystems: 'assist',

      // Visual
      updateWheelVisualStates: 'chassis',
      updateBrakeLights: 'chassis',
    }

    const ownerKey = stageOwners[stageName]
    if (!ownerKey) return null
    return state[ownerKey]
  }

  function reset() {
    for (const controller of Object.values(subControllers)) {
      if (controller.reset) {
        controller.reset()
      }
    }
    // Reset shared state inputs
    sharedState.throttleInput = 0
    sharedState.brakeInput = 0
    sharedState.parkingBrakeInput = 0
    sharedState.steeringInput = 0
    sharedState.dt = 0
    return getSnapshot()
  }

  return { step, reset }
}

function sanitizeDeltaTime(dt, params) {
  if (!Number.isFinite(dt) || dt <= 0) return 0
  return Math.min(dt, params.maxSimulationDeltaSeconds)
}

export { createVehiclePipeline, PIPELINE_STAGES }
