// src/vehicle/createVehicleController.js

import * as THREE from 'three'
import { DEFAULT_VEHICLE_SPEC } from './defaultVehicleSpec.js'

const DEFAULT_CONTROLLER_PARAMS = {
  turnSpeedRadiansPerSecond: 2.5,
  maxVisualSteeringAngleRadians: Math.PI / 5,
  steeringDeadSpeedMetersPerSecond: 0.1,
  stopEpsilonMetersPerSecond: 0.03,
  maxSimulationDeltaSeconds: 0.1,
}

const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1)

export function createVehicleController(config = {}) {
  const vehicle = config.vehicle

  if (!vehicle) {
    throw new Error('createVehicleController requires a vehicle object.')
  }

  const spec = {
    ...DEFAULT_VEHICLE_SPEC,
    ...(config.spec ?? {}),
  }

  const params = {
    ...DEFAULT_CONTROLLER_PARAMS,
    ...(config.params ?? {}),
  }

  const startPosition = (config.startPosition ?? vehicle.position).clone()
  const startRotation = (config.startRotation ?? vehicle.rotation).clone()

  const velocity = ensureVelocityVector(vehicle)
  const wheelStates = createWheelRuntimeStates(vehicle)

  const state = {
    controllerKind: 'flat-ground-force-longitudinal',
    speedScalar: 0,
    throttleInput: 0,
    reverseInput: 0,
    brakingInput: 0,
    steeringInput: 0,
    wheelStates,
    forces: createEmptyForceSnapshot(),
  }

  function update(dt, input = {}) {
    const safeDt = sanitizeDeltaTime(dt, params)

    readInput(input)
    updateLongitudinalMotion(safeDt)
    updateSteering(safeDt)
    updatePosition(safeDt)
    updateVelocityVector()
    updateWheelRuntimeState(safeDt)

    return getSnapshot()
  }

  function reset() {
    state.speedScalar = 0
    state.throttleInput = 0
    state.reverseInput = 0
    state.brakingInput = 0
    state.steeringInput = 0
    state.forces = createEmptyForceSnapshot()

    vehicle.position.copy(startPosition)
    vehicle.rotation.copy(startRotation)
    velocity.set(0, 0, 0)

    for (const wheelState of state.wheelStates) {
      wheelState.angularVelocityRadiansPerSecond = 0
      wheelState.spinAngleRadians = 0
      wheelState.steeringAngleRadians = 0
      wheelState.normalForceNewtons = 0
      wheelState.tractionLimitNewtons = 0
      wheelState.requestedLongitudinalForceNewtons = 0
      wheelState.appliedLongitudinalForceNewtons = 0
      wheelState.longitudinalSlip = 0
      wheelState.lateralSlip = 0
      wheelState.frictionCoefficient = spec.defaultSurfaceFrictionCoefficient
      wheelState.surfaceKind = 'flat-asphalt-placeholder'
      wheelState.isGrounded = true
      wheelState.isSlipping = false

      applyWheelVisualState(wheelState)
    }

    updateWheelRuntimeState(0)

    return getSnapshot()
  }

  function getSnapshot() {
    return {
      controllerKind: state.controllerKind,
      spec,
      params,
      speedScalar: state.speedScalar,
      throttleInput: state.throttleInput,
      reverseInput: state.reverseInput,
      brakingInput: state.brakingInput,
      steeringInput: state.steeringInput,
      position: vehicle.position,
      rotation: vehicle.rotation,
      velocity,
      longitudinalAcceleration:
        state.forces.longitudinalAccelerationMetersPerSecondSquared,
      forces: state.forces,
      wheelStates: state.wheelStates,
    }
  }

  function readInput(input) {
    const forward = Boolean(input.forward)
    const reverse = Boolean(input.reverse)

    state.throttleInput = forward && !reverse ? 1 : 0
    state.reverseInput = reverse && !forward ? 1 : 0
    state.brakingInput = forward && reverse ? 1 : 0

    if (input.left && !input.right) {
      state.steeringInput = 1
    } else if (input.right && !input.left) {
      state.steeringInput = -1
    } else {
      state.steeringInput = 0
    }
  }

  function updateLongitudinalMotion(dt) {
    const oldSpeed = state.speedScalar
    const forces = calculateLongitudinalForces()

    let nextSpeed =
      oldSpeed +
      forces.longitudinalAccelerationMetersPerSecondSquared * dt

    if (shouldClampToStop(oldSpeed, nextSpeed, forces)) {
      nextSpeed = 0
    }

    nextSpeed = THREE.MathUtils.clamp(
      nextSpeed,
      -spec.maxReverseSpeedMetersPerSecond,
      spec.maxForwardSpeedMetersPerSecond
    )

    if (
      Math.abs(nextSpeed) < params.stopEpsilonMetersPerSecond &&
      !isDriveTryingToMoveFromStop()
    ) {
      nextSpeed = 0
    }

    state.speedScalar = nextSpeed
    state.forces = forces
  }

  function calculateLongitudinalForces() {
    const speed = state.speedScalar
    const speedDirection = getSignWithDeadzone(
      speed,
      params.stopEpsilonMetersPerSecond
    )

    const normalForceNewtons =
      spec.massKg * spec.gravityMetersPerSecondSquared

    const tractionLimitLongitudinalNewtons =
      spec.defaultSurfaceFrictionCoefficient * normalForceNewtons

    const { driveForceNewtons, brakeForceNewtons } =
      calculateRequestedTireForces(speed, speedDirection)

    const requestedTireForceNewtons =
      driveForceNewtons + brakeForceNewtons

    const appliedTireForceNewtons = THREE.MathUtils.clamp(
      requestedTireForceNewtons,
      -tractionLimitLongitudinalNewtons,
      tractionLimitLongitudinalNewtons
    )

    const rollingResistanceForceNewtons =
      calculateRollingResistanceForce(speedDirection, normalForceNewtons)

    const aerodynamicDragForceNewtons =
      calculateAerodynamicDragForce(speed, speedDirection)

    const netLongitudinalForceNewtons =
      appliedTireForceNewtons +
      rollingResistanceForceNewtons +
      aerodynamicDragForceNewtons

    return {
      normalForceNewtons,
      tractionLimitLongitudinalNewtons,
      driveForceNewtons,
      brakeForceNewtons,
      requestedTireForceNewtons,
      appliedTireForceNewtons,
      rollingResistanceForceNewtons,
      aerodynamicDragForceNewtons,
      netLongitudinalForceNewtons,
      longitudinalAccelerationMetersPerSecondSquared:
        netLongitudinalForceNewtons / spec.massKg,
      isTractionLimited:
        Math.abs(requestedTireForceNewtons) >
        tractionLimitLongitudinalNewtons,
    }
  }

  function calculateRequestedTireForces(speed, speedDirection) {
    let driveForceNewtons = 0
    let brakeForceNewtons = 0

    if (state.brakingInput > 0 && speedDirection !== 0) {
      brakeForceNewtons =
        -speedDirection * spec.maxBrakeForceNewtons

      return {
        driveForceNewtons,
        brakeForceNewtons,
      }
    }

    if (state.throttleInput > 0) {
      if (speed < -params.steeringDeadSpeedMetersPerSecond) {
        brakeForceNewtons = spec.maxBrakeForceNewtons
      } else if (speed < spec.maxForwardSpeedMetersPerSecond) {
        driveForceNewtons = spec.maxDriveForceNewtons
      }
    }

    if (state.reverseInput > 0) {
      if (speed > params.steeringDeadSpeedMetersPerSecond) {
        brakeForceNewtons = -spec.maxBrakeForceNewtons
      } else if (speed > -spec.maxReverseSpeedMetersPerSecond) {
        driveForceNewtons = -spec.maxReverseDriveForceNewtons
      }
    }

    return {
      driveForceNewtons,
      brakeForceNewtons,
    }
  }

  function calculateRollingResistanceForce(speedDirection, normalForceNewtons) {
    if (speedDirection === 0) return 0

    return (
      -speedDirection *
      spec.rollingResistanceCoefficient *
      normalForceNewtons
    )
  }

  function calculateAerodynamicDragForce(speed, speedDirection) {
    if (speedDirection === 0) return 0

    return (
      -speedDirection *
      0.5 *
      spec.airDensityKgPerCubicMeter *
      spec.dragCoefficient *
      spec.frontalAreaSquareMeters *
      speed *
      speed
    )
  }

  function shouldClampToStop(oldSpeed, nextSpeed, forces) {
    if (!crossedZero(oldSpeed, nextSpeed)) return false

    const tireForceDirection = getSignWithDeadzone(
      forces.appliedTireForceNewtons,
      0.001
    )

    const oldSpeedDirection = getSignWithDeadzone(
      oldSpeed,
      params.stopEpsilonMetersPerSecond
    )

    const tireForceOpposesMotion =
      tireForceDirection !== 0 &&
      oldSpeedDirection !== 0 &&
      tireForceDirection !== oldSpeedDirection

    const resistanceOnly =
      Math.abs(forces.appliedTireForceNewtons) < 0.001

    return tireForceOpposesMotion || resistanceOnly
  }

  function isDriveTryingToMoveFromStop() {
    return state.throttleInput > 0 || state.reverseInput > 0
  }

  function updateSteering(dt) {
    const speedDirection = getSignWithDeadzone(
      state.speedScalar,
      params.steeringDeadSpeedMetersPerSecond
    )

    if (speedDirection === 0) return

    vehicle.rotation.y +=
      params.turnSpeedRadiansPerSecond *
      state.steeringInput *
      speedDirection *
      dt
  }

  function updatePosition(dt) {
    vehicle.translateZ(state.speedScalar * dt)
  }

  function updateVelocityVector() {
    velocity.copy(LOCAL_FORWARD)
    velocity.applyQuaternion(vehicle.quaternion)
    velocity.multiplyScalar(state.speedScalar)
  }

  function updateWheelRuntimeState(dt) {
    vehicle.updateMatrixWorld(true)

    const wheelCount = Math.max(1, state.wheelStates.length)
    const normalForcePerWheel =
      state.forces.normalForceNewtons / wheelCount

    const requestedForceDistribution = distributeLongitudinalTireForce(
      state.forces.requestedTireForceNewtons
    )

    const appliedForceDistribution = distributeLongitudinalTireForce(
      state.forces.appliedTireForceNewtons
    )

    for (const wheelState of state.wheelStates) {
      const requestedForce =
        requestedForceDistribution.get(wheelState.id) ?? 0

      const appliedForce =
        appliedForceDistribution.get(wheelState.id) ?? 0

      wheelState.contactPatchWorldPosition
        .copy(wheelState.contactPatchLocal)
        .applyMatrix4(vehicle.matrixWorld)

      wheelState.isGrounded = true
      wheelState.surfaceKind = 'flat-asphalt-placeholder'
      wheelState.frictionCoefficient =
        spec.defaultSurfaceFrictionCoefficient
      wheelState.normalForceNewtons = normalForcePerWheel
      wheelState.tractionLimitNewtons =
        wheelState.frictionCoefficient * normalForcePerWheel

      wheelState.requestedLongitudinalForceNewtons = requestedForce
      wheelState.appliedLongitudinalForceNewtons = appliedForce
      wheelState.isSlipping =
        Math.abs(requestedForce) >
        wheelState.tractionLimitNewtons + 0.001

      wheelState.longitudinalSlip = wheelState.isSlipping ? 1 : 0
      wheelState.lateralSlip = 0

      wheelState.angularVelocityRadiansPerSecond =
        wheelState.radius > 0
          ? state.speedScalar / wheelState.radius
          : 0

      wheelState.spinAngleRadians +=
        wheelState.angularVelocityRadiansPerSecond * dt

      wheelState.steeringAngleRadians = wheelState.steerable
        ? params.maxVisualSteeringAngleRadians * state.steeringInput
        : 0

      applyWheelVisualState(wheelState)
    }
  }

  function distributeLongitudinalTireForce(totalForceNewtons) {
    const forceByWheelId = new Map()

    if (state.wheelStates.length === 0) {
      return forceByWheelId
    }

    const isDriveForce =
      Math.abs(state.forces.driveForceNewtons) > 0.001

    const activeWheels = isDriveForce
      ? state.wheelStates.filter((wheelState) => wheelState.driven)
      : state.wheelStates

    const fallbackWheels =
      activeWheels.length > 0 ? activeWheels : state.wheelStates

    const forcePerWheel = totalForceNewtons / fallbackWheels.length

    for (const wheelState of fallbackWheels) {
      forceByWheelId.set(wheelState.id, forcePerWheel)
    }

    return forceByWheelId
  }

  updateWheelRuntimeState(0)

  return {
    update,
    reset,
    getSnapshot,
  }
}

function sanitizeDeltaTime(dt, params) {
  if (!Number.isFinite(dt) || dt <= 0) return 0
  return Math.min(dt, params.maxSimulationDeltaSeconds)
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

  return wheelMetadata.map((wheel) => {
    const visualNodes = wheel.visualNodes ?? {}

    return {
      id: wheel.id,
      axle: wheel.axle,
      side: wheel.side,
      driven: Boolean(wheel.driven),
      steerable: Boolean(wheel.steerable),
      radius: wheel.radius,
      width: wheel.width,
      localPosition: cloneVector3(wheel.localPosition),
      contactPatchLocal: cloneVector3(wheel.contactPatchLocal),
      contactPatchWorldPosition: new THREE.Vector3(),
      steeringAngleRadians: 0,
      spinAngleRadians: 0,
      angularVelocityRadiansPerSecond: 0,
      isGrounded: true,
      isSlipping: false,
      surfaceKind: 'flat-asphalt-placeholder',
      frictionCoefficient:
        DEFAULT_VEHICLE_SPEC.defaultSurfaceFrictionCoefficient,
      normalForceNewtons: 0,
      tractionLimitNewtons: 0,
      requestedLongitudinalForceNewtons: 0,
      appliedLongitudinalForceNewtons: 0,
      longitudinalSlip: 0,
      lateralSlip: 0,
      visual: {
        pivot: visualNodes.pivot
          ? vehicle.getObjectByName(visualNodes.pivot)
          : null,
        rollingAssembly: visualNodes.rollingAssembly
          ? vehicle.getObjectByName(visualNodes.rollingAssembly)
          : null,
      },
    }
  })
}

function applyWheelVisualState(wheelState) {
  if (wheelState.visual.pivot && wheelState.steerable) {
    wheelState.visual.pivot.rotation.y =
      wheelState.steeringAngleRadians
  }

  if (wheelState.visual.rollingAssembly) {
    wheelState.visual.rollingAssembly.rotation.x =
      wheelState.spinAngleRadians
  }
}

function cloneVector3(value) {
  if (value?.isVector3) return value.clone()

  return new THREE.Vector3(
    value?.x ?? 0,
    value?.y ?? 0,
    value?.z ?? 0
  )
}

function createEmptyForceSnapshot() {
  return {
    normalForceNewtons: 0,
    tractionLimitLongitudinalNewtons: 0,
    driveForceNewtons: 0,
    brakeForceNewtons: 0,
    requestedTireForceNewtons: 0,
    appliedTireForceNewtons: 0,
    rollingResistanceForceNewtons: 0,
    aerodynamicDragForceNewtons: 0,
    netLongitudinalForceNewtons: 0,
    longitudinalAccelerationMetersPerSecondSquared: 0,
    isTractionLimited: false,
  }
}

function getSignWithDeadzone(value, deadzone) {
  if (Math.abs(value) <= deadzone) return 0
  return Math.sign(value)
}

function crossedZero(before, after) {
  return (
    (before > 0 && after < 0) ||
    (before < 0 && after > 0)
  )
}