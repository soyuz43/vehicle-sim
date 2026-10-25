import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { createRocketSystem } from '../src/rocket/createRocketSystem.js'
import { createRocket } from '../src/rocket/createRocket.js'
import { updateRocketDynamics } from '../src/rocket/updateRocketDynamics.js'
import { createRocketRigidBody } from '../src/rocket/rocketRigidBody.js'
import { createRocketAttitudeControllerState } from '../src/rocket/rocketAttitudeController.js'
import { separateRocketStage } from '../src/rocket/stageSeparation.js'
import { createFlatTerrainContactQuery } from '../src/terrain/createFlatTerrainContactQuery.js'
import { createSimulation } from '../src/createSimulation.js'
import { runSimulationFrame } from '../src/runSimulationFrame.js'
import { EARTH_GRAVITY } from '../src/simulation/simulationConstants.js'

const FIXED_STEP_SECONDS = 1 / 60

function createTestRocketSystem(overrides = {}) {
  return createRocketSystem({
    terrainContactQuery: null,
    ...overrides,
  })
}

test('rocket starts at rest with the authored mass and inertia', () => {
  const system = createTestRocketSystem()
  const rocket = system.rocket

  assert.equal(rocket.massProperties.totalMassKg, 1000)
  assert.equal(rocket.body.massKg, 1000)
  assert.ok(rocket.body.inertiaTensorKgMeterSquared.y > 0)
  assert.equal(rocket.body.velocityMetersPerSecond.length(), 0)
  assert.equal(system.getTelemetry().stageSeparated, false)
})

test('thrust overcomes gravity and produces net upward acceleration', () => {
  const system = createTestRocketSystem()
  const rocket = system.rocket

  system.step(FIXED_STEP_SECONDS)
  const weightOnlyAcceleration = rocket.body.linearAccelerationMetersPerSecondSquared.y
  assert.ok(
    Math.abs(weightOnlyAcceleration + EARTH_GRAVITY.standardMetersPerSecondSquared) < 1e-6,
    `expected gravity only, got ${weightOnlyAcceleration}`
  )

  system.setMotorIgnited(true)
  system.step(FIXED_STEP_SECONDS)

  const netAcceleration = rocket.body.linearAccelerationMetersPerSecondSquared.y
  assert.ok(netAcceleration > 0, `expected upward acceleration, got ${netAcceleration}`)

  // 15000 N of thrust against 1000 kg of weight. The residual difference
  // is the drag from the small velocity the first step produced.
  const expectedAccelerationMetersPerSecondSquared =
    (15000 - EARTH_GRAVITY.standardMetersPerSecondSquared * 1000) / 1000
  assert.ok(
    Math.abs(netAcceleration - expectedAccelerationMetersPerSecondSquared) <
      expectedAccelerationMetersPerSecondSquared * 0.001,
    `expected ~${expectedAccelerationMetersPerSecondSquared}, got ${netAcceleration}`
  )
})

test('the rocket climbs while the motor burns', () => {
  const system = createTestRocketSystem()
  system.setMotorIgnited(true)

  const startHeightMeters = system.rocket.body.positionMeters.y
  for (let stepIndex = 0; stepIndex < 60; stepIndex += 1) {
    system.step(FIXED_STEP_SECONDS)
  }

  assert.ok(
    system.rocket.body.positionMeters.y > startHeightMeters,
    'expected the rocket to gain altitude'
  )
  assert.ok(system.rocket.body.velocityMetersPerSecond.y > 0)
})

test('stage separation reduces the main mass and spawns a debris body', () => {
  const system = createTestRocketSystem()
  const rocket = system.rocket
  const massBeforeSeparationKg = rocket.body.massKg
  const positionBeforeSeparation = rocket.body.positionMeters.clone()
  const centerOfMassBeforeSeparationStructuralY =
    rocket.massProperties.centerOfMassStructuralYMeters

  const result = system.separateStage()

  assert.ok(result)
  assert.equal(system.debrisEntities.length, 1)
  assert.equal(system.getTelemetry().debrisCount, 1)

  // 30% of the mass leaves with the nose cone.
  assert.equal(massBeforeSeparationKg, 1000)
  assert.equal(rocket.body.massKg, 700)
  assert.ok(rocket.body.massKg < massBeforeSeparationKg)
  assert.equal(result.debris.body.massKg, 300)

  // The centre of mass drops to the surviving body, which sits lower in
  // the structural frame than the assembled rocket did.
  assert.ok(
    rocket.massProperties.centerOfMassStructuralYMeters <
      centerOfMassBeforeSeparationStructuralY,
    'expected the centre of mass to drop'
  )
  assert.ok(
    Math.abs(
      rocket.massProperties.centerOfMassStructuralYMeters -
        rocket.massProperties.bodyCenterStructuralYMeters
    ) < 1e-9
  )

  // The debris leaves at the nose cone position, above the rocket body.
  const debrisPosition = result.debris.body.positionMeters
  assert.ok(debrisPosition.y > positionBeforeSeparation.y)
})

test('separation applies an equal and opposite impulse to the rocket', () => {
  const system = createTestRocketSystem()
  const rocket = system.rocket
  rocket.body.velocityMetersPerSecond.set(0, 40, 0)

  const velocityBeforeSeparation = rocket.body.velocityMetersPerSecond.clone()
  const result = system.separateStage()

  // The reaction impulse pushes the remaining rocket down, and the debris
  // leaves faster than the rocket did.
  assert.ok(rocket.body.velocityMetersPerSecond.y < velocityBeforeSeparation.y)
  assert.ok(result.debris.body.velocityMetersPerSecond.y > velocityBeforeSeparation.y)
})

test('separated debris flies ballistically under gravity without thrust', () => {
  const system = createTestRocketSystem()
  system.setMotorIgnited(true)
  for (let stepIndex = 0; stepIndex < 30; stepIndex += 1) {
    system.step(FIXED_STEP_SECONDS)
  }

  const result = system.separateStage()
  const debris = result.debris
  const velocityBefore = debris.body.velocityMetersPerSecond.y

  for (let stepIndex = 0; stepIndex < 30; stepIndex += 1) {
    system.step(FIXED_STEP_SECONDS)
  }

  assert.ok(
    debris.body.velocityMetersPerSecond.y < velocityBefore,
    'expected the debris to lose vertical speed to gravity'
  )
  // Gravity and drag both pull the debris down; nothing pushes it up. The
  // debris carries no motor.
  assert.ok(debris.body.forceAccumulatorNewtons.y < 0)
  assert.ok(debris.body.linearAccelerationMetersPerSecondSquared.y < 0)
})

test('attitude control drives a tilted rocket back toward vertical', () => {
  const visual = createRocket()
  const rocket = {
    ...visual,
    body: createRocketRigidBody({
      massKg: visual.massProperties.totalMassKg,
      inertiaAXKgMeterSquared: visual.massProperties.inertiaTensorKgMeterSquared.x,
      inertiaAYKgMeterSquared: visual.massProperties.inertiaTensorKgMeterSquared.y,
      inertiaAZKgMeterSquared: visual.massProperties.inertiaTensorKgMeterSquared.z,
    }),
    attitudeController: createRocketAttitudeControllerState(),
  }

  // Tilt the rocket 20 degrees about the body forward axis.
  const tiltRadians = THREE.MathUtils.degToRad(20)
  rocket.body.orientationQuaternion.setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    tiltRadians
  )

  const initialErrorRadians = rocket.attitudeController.attitudeErrorRadians
  assert.equal(initialErrorRadians, 0)

  let lastErrorRadians = tiltRadians
  for (let stepIndex = 0; stepIndex < 240; stepIndex += 1) {
    updateRocketDynamics(rocket, FIXED_STEP_SECONDS, {})
    lastErrorRadians = rocket.attitudeController.attitudeErrorRadians
  }

  assert.ok(
    lastErrorRadians < tiltRadians * 0.5,
    `expected the tilt to shrink, got ${lastErrorRadians}`
  )
})

test('aerodynamic drag below the centre of mass statically stabilises the rocket', () => {
  // The active controller is switched off so this measures the AIRFRAME
  // alone: the drag acts at the fin-level centre of pressure, which sits
  // below the centre of mass, so the aerodynamic moment restores the tilt.
  const visual = createRocket({ spec: { attitudeControlEnabled: false } })
  const rocket = {
    ...visual,
    body: createRocketRigidBody({
      massKg: visual.massProperties.totalMassKg,
      inertiaAXKgMeterSquared: visual.massProperties.inertiaTensorKgMeterSquared.x,
      inertiaAYKgMeterSquared: visual.massProperties.inertiaTensorKgMeterSquared.y,
      inertiaAZKgMeterSquared: visual.massProperties.inertiaTensorKgMeterSquared.z,
    }),
    attitudeController: createRocketAttitudeControllerState(),
    motorIgnited: false,
    throttle01: 0,
  }

  const tiltRadians = THREE.MathUtils.degToRad(15)
  rocket.body.orientationQuaternion.setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    tiltRadians
  )
  rocket.body.velocityMetersPerSecond.set(0, 80, 0)

  let lastErrorRadians = tiltRadians
  for (let stepIndex = 0; stepIndex < 60; stepIndex += 1) {
    updateRocketDynamics(rocket, FIXED_STEP_SECONDS, {})
    lastErrorRadians = rocket.attitudeController.attitudeErrorRadians
  }

  assert.ok(
    lastErrorRadians < tiltRadians,
    `expected the airframe to restore the tilt, got ${lastErrorRadians}`
  )
})

test('the rocket rests on flat terrain instead of sinking', () => {
  const terrainContactQuery = createFlatTerrainContactQuery({
    groundHeightMeters: 0,
    surfaceKind: 'asphalt',
  })
  const system = createTestRocketSystem({ terrainContactQuery })

  for (let stepIndex = 0; stepIndex < 180; stepIndex += 1) {
    system.step(FIXED_STEP_SECONDS)
  }

  const baseHeightMeters =
    system.rocket.body.positionMeters.y -
    system.rocket.massProperties.centerOfMassStructuralYMeters
  assert.ok(
    Math.abs(baseHeightMeters) < 0.2,
    `expected the base to rest on the terrain, got ${baseHeightMeters}`
  )
  assert.ok(Math.abs(system.rocket.body.velocityMetersPerSecond.y) < 0.5)
})

test('the session routes the fixed step to the rocket in rocket mode', () => {
  const simulation = createSimulation({
    scene: new THREE.Scene(),
    keyState: {
      forward: false,
      backward: false,
      left: false,
      right: false,
      handbrake: false,
    },
  })

  // Car mode: the vehicle owns the step and the rocket stays parked.
  runSimulationFrame(simulation, 1 / 60)
  const parkedAltitudeMeters = simulation.rocketSystem.getTelemetry().altitudeMeters
  assert.equal(simulation.rocketSystem.getTelemetry().verticalSpeedMetersPerSecond, 0)

  simulation.mode = 'rocket'
  simulation.rocketSystem.setMotorIgnited(true)
  for (let frameIndex = 0; frameIndex < 30; frameIndex += 1) {
    runSimulationFrame(simulation, 1 / 60)
  }

  const telemetry = simulation.rocketSystem.getTelemetry()
  assert.ok(
    telemetry.altitudeMeters > parkedAltitudeMeters,
    'expected the rocket to climb once it owns the step'
  )
  assert.ok(telemetry.verticalSpeedMetersPerSecond > 0)
  assert.equal(telemetry.massKg, 1000)
})

test('separating a stage twice is refused', () => {
  const system = createTestRocketSystem()

  assert.ok(system.separateStage())
  assert.equal(system.separateStage(), null)
  assert.equal(system.debrisEntities.length, 1)
})