// src/vehicle/createVehicleController.js

import * as THREE from 'three'
import {
  EARTH_GRAVITY,
  SIMULATION_UNITS,
} from '../simulation/simulationConstants.js'

const DEFAULT_PARAMS = {
  maxSpeed: 60.0,       // meters per second
  acceleration: 24.0,   // meters per second squared
  friction: 30.0,       // meters per second squared
  turnSpeed: 2.5,       // radians per second
  gravity: EARTH_GRAVITY.worldUnitsPerSecondSquared,
  metersPerWorldUnit: SIMULATION_UNITS.metersPerWorldUnit,
}

const WORLD_FORWARD_LOCAL = new THREE.Vector3(0, 0, 1)

export function createVehicleController(config = {}) {
  const vehicle = config.vehicle

  if (!vehicle) {
    throw new Error('createVehicleController requires a vehicle object.')
  }

  const params = {
    ...DEFAULT_PARAMS,
    ...(config.params ?? {}),
  }

  const startPosition = (config.startPosition ?? vehicle.position).clone()
  const startRotation = (config.startRotation ?? vehicle.rotation).clone()

  const velocity = ensureVelocityVector(vehicle)
  const wheelStates = createWheelRuntimeStates(vehicle)

  const state = {
    controllerKind: 'arcade-kinematic',
    speedScalar: 0,
    throttleInput: 0,
    steeringInput: 0,
    reverseInput: 0,
    brakingInput: 0,
    wheelStates,
  }

  function update(dt, input = {}) {
    const safeDt = sanitizeDeltaTime(dt)

    readInput(input)
    updateArcadeSpeed(safeDt)
    updateArcadeSteering(safeDt)
    updateArcadePosition(safeDt)
    updateVelocityVector()
    updateWheelContactPlaceholders()

    return getSnapshot()
  }

  function reset() {
    state.speedScalar = 0
    state.throttleInput = 0
    state.steeringInput = 0
    state.reverseInput = 0
    state.brakingInput = 0

    vehicle.position.copy(startPosition)
    vehicle.rotation.copy(startRotation)
    velocity.set(0, 0, 0)

    for (const wheelState of state.wheelStates) {
      wheelState.angularVelocity = 0
      wheelState.spinAngle = 0
      wheelState.steeringAngle = 0
      wheelState.longitudinalSlip = 0
      wheelState.lateralSlip = 0
      wheelState.frictionCoefficient = null
      wheelState.surfaceKind = 'unknown'
      wheelState.isGrounded = true
    }

    updateWheelContactPlaceholders()

    return getSnapshot()
  }

  function getSnapshot() {
    return {
      controllerKind: state.controllerKind,
      params,
      speedScalar: state.speedScalar,
      throttleInput: state.throttleInput,
      steeringInput: state.steeringInput,
      reverseInput: state.reverseInput,
      brakingInput: state.brakingInput,
      position: vehicle.position,
      rotation: vehicle.rotation,
      velocity,
      wheelStates: state.wheelStates,
    }
  }

  function readInput(input) {
    state.throttleInput = input.forward ? 1 : 0
    state.reverseInput = input.reverse ? 1 : 0

    if (input.left && !input.right) {
      state.steeringInput = 1
    } else if (input.right && !input.left) {
      state.steeringInput = -1
    } else {
      state.steeringInput = 0
    }

    state.brakingInput = 0
  }

  function updateArcadeSpeed(dt) {
    if (state.throttleInput > 0) {
      state.speedScalar += params.acceleration * dt
    } else if (state.reverseInput > 0) {
      state.speedScalar -= params.acceleration * dt
    } else {
      applyFriction(dt)
    }

    state.speedScalar = THREE.MathUtils.clamp(
      state.speedScalar,
      -params.maxSpeed,
      params.maxSpeed
    )
  }

  function applyFriction(dt) {
    const decel = params.friction * dt

    if (state.speedScalar > 0) {
      state.speedScalar = Math.max(0, state.speedScalar - decel)
    } else if (state.speedScalar < 0) {
      state.speedScalar = Math.min(0, state.speedScalar + decel)
    }
  }

  function updateArcadeSteering(dt) {
    if (Math.abs(state.speedScalar) <= 0.1) return

    const turnAmount = params.turnSpeed * state.steeringInput * dt
    vehicle.rotation.y += turnAmount
  }

  function updateArcadePosition(dt) {
    vehicle.translateZ(state.speedScalar * dt)
  }

  function updateVelocityVector() {
    velocity.copy(WORLD_FORWARD_LOCAL)
    velocity.applyQuaternion(vehicle.quaternion)
    velocity.multiplyScalar(state.speedScalar)
  }

  function updateWheelContactPlaceholders() {
    for (const wheelState of state.wheelStates) {
      wheelState.contactPatchWorldPosition
        .copy(wheelState.contactPatchLocal)
        .applyMatrix4(vehicle.matrixWorld)

      wheelState.isGrounded = true
      wheelState.surfaceKind = 'flat-terrain-placeholder'
      wheelState.frictionCoefficient = null
    }
  }

  updateWheelContactPlaceholders()

  return {
    update,
    reset,
    getSnapshot,
  }
}

function sanitizeDeltaTime(dt) {
  if (!Number.isFinite(dt) || dt <= 0) return 0
  return Math.min(dt, 0.1)
}

function ensureVelocityVector(vehicle) {
  const existingVelocity = vehicle.userData.velocity

  if (existingVelocity?.isVector3) {
    return existingVelocity
  }

  vehicle.userData.velocity = new THREE.Vector3()
  return vehicle.userData.velocity
}

function createWheelRuntimeStates(vehicle) {
  const wheelMetadata = vehicle.userData.vehicle?.wheels ?? []

  return wheelMetadata.map((wheel) => ({
    id: wheel.id,
    axle: wheel.axle,
    side: wheel.side,
    driven: wheel.driven,
    steerable: wheel.steerable,
    radius: wheel.radius,
    width: wheel.width,
    localPosition: wheel.localPosition.clone(),
    contactPatchLocal: wheel.contactPatchLocal.clone(),
    contactPatchWorldPosition: new THREE.Vector3(),
    steeringAngle: 0,
    spinAngle: 0,
    angularVelocity: 0,
    isGrounded: true,
    surfaceKind: 'unknown',
    frictionCoefficient: null,
    longitudinalSlip: 0,
    lateralSlip: 0,
  }))
}