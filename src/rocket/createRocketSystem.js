// src/rocket/createRocketSystem.js

import * as THREE from 'three'
import {
  applyRocketFinDeflectionVisuals,
  applyRocketMassPropertiesToVisuals,
  computeRocketMassProperties,
  createRocket,
  setRocketPlumeVisible,
} from './createRocket.js'
import { createRocketRigidBody } from './rocketRigidBody.js'
import {
  createRocketAttitudeControllerState,
  resetRocketAttitudeControllerState,
} from './rocketAttitudeController.js'
import {
  createRocketControlState,
  resetRocketControlState,
  setRocketFinsEnabled,
  toggleRocketFins,
  updateRocketControlState,
} from './rocketControls.js'
import { updateRocketDynamics } from './updateRocketDynamics.js'
import { updateDebrisDynamics } from './updateDebrisDynamics.js'
import { separateRocketStage } from './stageSeparation.js'

// Owns the rocket, the separated stages, and the telemetry the HUD reads.
//
// The system is step-driven: the caller hands it a FIXED step and it runs
// the same physics the vehicle runs (one integration per step), so the
// rocket inherits the stability of the fixed-timestep runner instead of
// depending on the render frame rate.

const DEFAULT_SPAWN_POSITION_METERS = { x: 0, y: 0, z: 0 }

export function createRocketSystem(config = {}) {
  const terrainContactQuery = config.terrainContactQuery ?? null

  const group = new THREE.Group()
  group.name = 'rocket-system'

  const rocketVisual = createRocket({ spec: config.spec })
  const rocket = {
    ...rocketVisual,
    body: createRocketRigidBody({
      massKg: rocketVisual.massProperties.totalMassKg,
      inertiaAXKgMeterSquared: rocketVisual.massProperties.inertiaTensorKgMeterSquared.x,
      inertiaAYKgMeterSquared: rocketVisual.massProperties.inertiaTensorKgMeterSquared.y,
      inertiaAZKgMeterSquared: rocketVisual.massProperties.inertiaTensorKgMeterSquared.z,
    }),
    attitudeController: createRocketAttitudeControllerState(),
    controls: createRocketControlState(),
    stageSeparated: false,
    dragApplicationStructuralYMeters: rocketVisual.spec.dragApplicationStructuralYMeters,
  }
  group.add(rocket.group)

  const debrisEntities = []

  // The held-key input the pilot is giving the control surfaces. The
  // keyboard only records which keys are down; the fins read this.
  const controlInput = {
    pitchForward: false,
    pitchBackward: false,
    rollLeft: false,
    rollRight: false,
  }

  const telemetry = {
    isActive: false,
    motorIgnited: false,
    throttle01: 0,
    thrustNewtons: 0,
    massKg: rocket.body.massKg,
    altitudeMeters: 0,
    speedMetersPerSecond: 0,
    verticalSpeedMetersPerSecond: 0,
    attitudeErrorRadians: 0,
    controlTorqueNewtonMeters: 0,
    stageSeparated: false,
    debrisCount: 0,
    separationCount: 0,
    finsEnabled: false,
    finDeflectionPitchRadians: 0,
    finDeflectionRollRadians: 0,
    finTorqueNewtonMeters: 0,
    dynamicPressurePascals: 0,
  }

  const spawnPositionMeters = {
    ...DEFAULT_SPAWN_POSITION_METERS,
    ...(config.spawnPositionMeters ?? {}),
  }

  let stageSeparationRequested = false

  function resolveTerrainHeightMeters(worldXMeters, worldZMeters) {
    if (!terrainContactQuery) return 0

    const surfaceResult = { normalWorld: new THREE.Vector3(0, 1, 0) }
    terrainContactQuery.queryAtWorldXZ(worldXMeters, worldZMeters, surfaceResult)
    const terrainHeightMeters = surfaceResult.terrainHeightMeters

    return Number.isFinite(terrainHeightMeters) ? terrainHeightMeters : 0
  }

  function resetRocket() {
    for (const debris of debrisEntities) {
      debris.group.removeFromParent()
    }
    debrisEntities.length = 0

    // The rocket starts upright, with its base resting on the terrain.
    const massProperties = computeRocketMassProperties(rocket.spec)
    rocket.massProperties = massProperties
    applyRocketMassPropertiesToVisuals(rocket, massProperties)
    rocket.body.massKg = massProperties.totalMassKg
    rocket.body.inertiaTensorKgMeterSquared.set(
      massProperties.inertiaTensorKgMeterSquared.x,
      massProperties.inertiaTensorKgMeterSquared.y,
      massProperties.inertiaTensorKgMeterSquared.z
    )
    rocket.body.positionMeters.set(
      spawnPositionMeters.x,
      resolveTerrainHeightMeters(spawnPositionMeters.x, spawnPositionMeters.z) +
        massProperties.centerOfMassStructuralYMeters,
      spawnPositionMeters.z
    )
    rocket.body.velocityMetersPerSecond.set(0, 0, 0)
    rocket.body.orientationQuaternion.set(0, 0, 0, 1)
    rocket.body.angularVelocityRadiansPerSecond.set(0, 0, 0)
    resetRocketAttitudeControllerState(rocket.attitudeController)
    resetRocketControlState(rocket.controls)
    rocket.dragApplicationStructuralYMeters = rocket.spec.dragApplicationStructuralYMeters
    rocket.motorIgnited = false
    rocket.throttle01 = 0
    rocket.stageSeparated = false
    stageSeparationRequested = false
    setRocketPlumeVisible(rocket, false, 0)
    syncRocketVisuals()
    updateTelemetry()
  }

  function syncRocketVisuals() {
    rocket.group.position.copy(rocket.body.positionMeters)
    rocket.group.quaternion.copy(rocket.body.orientationQuaternion)
    // The chase camera reads the velocity from the target it follows.
    rocket.group.userData.velocity = rocket.body.velocityMetersPerSecond
    // The fin meshes show the commanded deflection.
    applyRocketFinDeflectionVisuals(
      rocket,
      rocket.controls?.finDeflectionPitchRadians ?? 0,
      rocket.controls?.finDeflectionRollRadians ?? 0
    )

    for (const debris of debrisEntities) {
      debris.group.position.copy(debris.body.positionMeters)
      debris.group.quaternion.copy(debris.body.orientationQuaternion)
    }
  }

  function updateTelemetry() {
    telemetry.isActive = true
    telemetry.motorIgnited = rocket.motorIgnited === true
    telemetry.throttle01 = rocket.throttle01 ?? 0
    telemetry.thrustNewtons =
      rocket.motorIgnited === true
        ? rocket.spec.thrustNewtons * (rocket.throttle01 ?? 0)
        : 0
    telemetry.massKg = rocket.body.massKg
    telemetry.altitudeMeters =
      rocket.body.positionMeters.y -
      rocket.massProperties.centerOfMassStructuralYMeters
    telemetry.speedMetersPerSecond = rocket.body.velocityMetersPerSecond.length()
    telemetry.verticalSpeedMetersPerSecond = rocket.body.velocityMetersPerSecond.y
    telemetry.attitudeErrorRadians = rocket.attitudeController.attitudeErrorRadians
    telemetry.controlTorqueNewtonMeters =
      rocket.attitudeController.appliedTorqueNewtonMeters.length()
    telemetry.stageSeparated = rocket.stageSeparated === true
    telemetry.debrisCount = debrisEntities.length
    telemetry.finsEnabled = rocket.controls.finsEnabled === true
    telemetry.finDeflectionPitchRadians = rocket.controls.finDeflectionPitchRadians
    telemetry.finDeflectionRollRadians = rocket.controls.finDeflectionRollRadians
    telemetry.finTorqueNewtonMeters = rocket.controls.appliedFinTorqueNewtonMeters.length()
    telemetry.dynamicPressurePascals = rocket.controls.dynamicPressurePascals
  }

  function step(deltaTimeSeconds) {
    if (stageSeparationRequested) {
      stageSeparationRequested = false
      performStageSeparation()
    }

    // The fins move first, so the dynamics read the deflection the
    // surfaces have actually reached this step.
    updateRocketControlState(rocket.controls, rocket.spec, controlInput, deltaTimeSeconds)

    updateRocketDynamics(rocket, deltaTimeSeconds, { terrainContactQuery })

    for (const debris of debrisEntities) {
      updateDebrisDynamics(debris, deltaTimeSeconds, { terrainContactQuery })
    }

    syncRocketVisuals()
    updateTelemetry()
  }

  function performStageSeparation() {
    const result = separateRocketStage(rocket)
    if (!result) return null

    debrisEntities.push(result.debris)
    group.add(result.debris.group)
    syncRocketVisuals()
    updateTelemetry()

    return result
  }

  function setMotorIgnited(isIgnited) {
    rocket.motorIgnited = isIgnited === true
    rocket.throttle01 = rocket.motorIgnited ? 1 : 0
    setRocketPlumeVisible(rocket, rocket.motorIgnited, rocket.throttle01)
    updateTelemetry()
  }

  function requestStageSeparation() {
    stageSeparationRequested = true
  }

  // Records which control key is held. The fins read the held keys on
  // every step, so the input is a state and not an event.
  function setControlInput(controlName, isActive) {
    if (!(controlName in controlInput)) return false

    controlInput[controlName] = isActive === true

    return true
  }

  function clearControlInput() {
    controlInput.pitchForward = false
    controlInput.pitchBackward = false
    controlInput.rollLeft = false
    controlInput.rollRight = false
  }

  function setFinsEnabled(isEnabled) {
    setRocketFinsEnabled(rocket.controls, isEnabled)
    updateTelemetry()
  }

  function toggleFins() {
    toggleRocketFins(rocket.controls)
    updateTelemetry()

    return rocket.controls.finsEnabled === true
  }

  resetRocket()

  return {
    group,
    rocket,
    debrisEntities,
    telemetry,
    step,
    reset: resetRocket,
    setMotorIgnited,
    isMotorIgnited: () => rocket.motorIgnited === true,
    requestStageSeparation,
    separateStage: performStageSeparation,
    setControlInput,
    clearControlInput,
    setFinsEnabled,
    toggleFins,
    areFinsEnabled: () => rocket.controls.finsEnabled === true,
    getTelemetry: () => telemetry,
    getRocketGroup: () => rocket.group,
    isStageSeparated: () => rocket.stageSeparated === true,
  }
}