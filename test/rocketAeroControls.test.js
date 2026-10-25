import assert from 'node:assert/strict'
import test from 'node:test'
import { createRocketSystem } from '../src/rocket/createRocketSystem.js'
import { createRocket } from '../src/rocket/createRocket.js'
import { updateRocketDynamics } from '../src/rocket/updateRocketDynamics.js'
import { createRocketRigidBody, getRocketUpVectorWorld } from '../src/rocket/rocketRigidBody.js'
import { createRocketAttitudeControllerState } from '../src/rocket/rocketAttitudeController.js'
import {
  createRocketControlState,
  setRocketFinsEnabled,
  updateRocketControlState,
} from '../src/rocket/rocketControls.js'
import * as THREE from 'three'

const FIXED_STEP_SECONDS = 1 / 60
const TEST_SPEED_METERS_PER_SECOND = 100

// A bare rocket, so a test can drive the control surfaces and the airframe
// without the ground contact or the stage separation in the way.
function createTestRocket(specOverrides = {}) {
  const visual = createRocket({ spec: specOverrides })
  const rocket = {
    ...visual,
    body: createRocketRigidBody({
      massKg: visual.massProperties.totalMassKg,
      inertiaAXKgMeterSquared: visual.massProperties.inertiaTensorKgMeterSquared.x,
      inertiaAYKgMeterSquared: visual.massProperties.inertiaTensorKgMeterSquared.y,
      inertiaAZKgMeterSquared: visual.massProperties.inertiaTensorKgMeterSquared.z,
    }),
    attitudeController: createRocketAttitudeControllerState(),
    controls: createRocketControlState(),
    motorIgnited: false,
    throttle01: 0,
  }

  return rocket
}

// One step of the whole loop: the fins slew, then the airframe answers.
function stepRocket(rocket, input, deltaTimeSeconds = FIXED_STEP_SECONDS) {
  updateRocketControlState(rocket.controls, rocket.spec, input, deltaTimeSeconds)
  updateRocketDynamics(rocket, deltaTimeSeconds, {})

  return rocket
}

test('the fin control surfaces start disarmed', () => {
  const system = createRocketSystem({ terrainContactQuery: null })

  assert.equal(system.areFinsEnabled(), false)
  assert.equal(system.getTelemetry().finsEnabled, false)
  assert.equal(system.getTelemetry().finDeflectionPitchRadians, 0)
  assert.equal(system.getTelemetry().finDeflectionRollRadians, 0)
})

test('a deflected fin produces no torque at rest', () => {
  const rocket = createTestRocket()
  setRocketFinsEnabled(rocket.controls, true)
  rocket.controls.finDeflectionPitchRadians = 0.2

  stepRocket(rocket, { pitchForward: true })

  assert.equal(
    rocket.body.torqueAccumulatorNewtonMeters.length(),
    0,
    'expected no fin torque without airflow'
  )
  assert.equal(
    rocket.controls.appliedFinTorqueNewtonMeters.length(),
    0,
    'expected no fin torque without airflow'
  )
})

test('a deflected fin produces a torque at speed', () => {
  const rocket = createTestRocket()
  setRocketFinsEnabled(rocket.controls, true)
  rocket.controls.finDeflectionPitchRadians = 0.2
  rocket.body.velocityMetersPerSecond.set(0, TEST_SPEED_METERS_PER_SECOND, 0)

  // The dynamics step only: the deflection stays exactly where the test
  // set it, so the expected moment can be computed from it.
  updateRocketDynamics(rocket, FIXED_STEP_SECONDS, {})

  const torqueMagnitudeNewtonMeters = rocket.body.torqueAccumulatorNewtonMeters.length()
  assert.ok(
    torqueMagnitudeNewtonMeters > 0,
    `expected a fin torque at speed, got ${torqueMagnitudeNewtonMeters}`
  )

  // The fin force is q * A * C * sin(deflection) and the moment arm is the
  // distance from the centre of mass down to the fin level.
  const dynamicPressurePascals =
    0.5 *
    rocket.spec.airDensityKgPerCubicMeter *
    TEST_SPEED_METERS_PER_SECOND *
    TEST_SPEED_METERS_PER_SECOND
  const expectedForceNewtons =
    dynamicPressurePascals *
    rocket.spec.finReferenceAreaSquareMeters *
    rocket.spec.finLiftCoefficient *
    Math.sin(0.2)
  const expectedMomentArmMeters =
    rocket.massProperties.centerOfMassStructuralYMeters - rocket.spec.finApplicationStructuralYMeters
  const expectedTorqueNewtonMeters = expectedForceNewtons * expectedMomentArmMeters

  assert.ok(
    Math.abs(torqueMagnitudeNewtonMeters - expectedTorqueNewtonMeters) <
      expectedTorqueNewtonMeters * 0.01,
    `expected about ${expectedTorqueNewtonMeters} N*m, got ${torqueMagnitudeNewtonMeters} N*m`
  )
})

test('the toggle switches the fin effect on and off', () => {
  const system = createRocketSystem({ terrainContactQuery: null })
  const rocket = system.rocket

  rocket.body.velocityMetersPerSecond.set(0, TEST_SPEED_METERS_PER_SECOND, 0)
  system.setControlInput('pitchForward', true)

  // Disarmed: the fins stay centred and make no force.
  for (let stepIndex = 0; stepIndex < 30; stepIndex += 1) {
    system.step(FIXED_STEP_SECONDS)
  }

  assert.equal(system.areFinsEnabled(), false)
  assert.equal(system.getTelemetry().finDeflectionPitchRadians, 0)
  assert.equal(
    system.getTelemetry().finTorqueNewtonMeters,
    0,
    'expected no fin torque while the fins are disarmed'
  )

  // Armed: the same input now produces a torque.
  assert.equal(system.toggleFins(), true)
  assert.equal(system.areFinsEnabled(), true)

  for (let stepIndex = 0; stepIndex < 30; stepIndex += 1) {
    system.step(FIXED_STEP_SECONDS)
  }

  assert.ok(system.getTelemetry().finDeflectionPitchRadians > 0)
  assert.ok(
    system.getTelemetry().finTorqueNewtonMeters > 0,
    `expected a fin torque once armed, got ${system.getTelemetry().finTorqueNewtonMeters} N*m`
  )

  // Disarmed again: the torque stops.
  assert.equal(system.toggleFins(), false)

  for (let stepIndex = 0; stepIndex < 30; stepIndex += 1) {
    system.step(FIXED_STEP_SECONDS)
  }

  assert.equal(system.getTelemetry().finTorqueNewtonMeters, 0)
  assert.equal(system.getTelemetry().finDeflectionPitchRadians, 0)
})

test('the fins slew at a finite rate instead of snapping', () => {
  const rocket = createTestRocket()
  setRocketFinsEnabled(rocket.controls, true)

  stepRocket(rocket, { pitchForward: true })

  const expectedDeflectionRadians =
    rocket.spec.finActuationRateRadiansPerSecond * FIXED_STEP_SECONDS
  assert.ok(
    Math.abs(rocket.controls.finDeflectionPitchRadians - expectedDeflectionRadians) < 1e-9,
    `expected ${expectedDeflectionRadians} rad after one step, got ${rocket.controls.finDeflectionPitchRadians}`
  )
  assert.ok(
    rocket.controls.finDeflectionPitchRadians < rocket.spec.finMaximumDeflectionRadians,
    'expected the fin to be short of its maximum deflection after one step'
  )

  // Held long enough, the fin reaches the maximum deflection.
  for (let stepIndex = 0; stepIndex < 120; stepIndex += 1) {
    stepRocket(rocket, { pitchForward: true })
  }

  assert.ok(
    Math.abs(
      rocket.controls.finDeflectionPitchRadians - rocket.spec.finMaximumDeflectionRadians
    ) < 1e-9,
    `expected the fin to reach ${rocket.spec.finMaximumDeflectionRadians} rad, got ${rocket.controls.finDeflectionPitchRadians}`
  )
})

test('a positive pitch command swings the nose toward the body +Z', () => {
  const rocket = createTestRocket()
  setRocketFinsEnabled(rocket.controls, true)
  rocket.body.velocityMetersPerSecond.set(0, TEST_SPEED_METERS_PER_SECOND, 0)

  const upVector = new THREE.Vector3()
  for (let stepIndex = 0; stepIndex < 30; stepIndex += 1) {
    stepRocket(rocket, { pitchForward: true })
  }

  getRocketUpVectorWorld(rocket.body, upVector)
  assert.ok(
    upVector.z > 0,
    `expected the nose to swing toward the body +Z, got ${upVector.z}`
  )
})

test('a positive roll command swings the nose toward the body +X', () => {
  const rocket = createTestRocket()
  setRocketFinsEnabled(rocket.controls, true)
  rocket.body.velocityMetersPerSecond.set(0, TEST_SPEED_METERS_PER_SECOND, 0)

  const upVector = new THREE.Vector3()
  for (let stepIndex = 0; stepIndex < 30; stepIndex += 1) {
    stepRocket(rocket, { rollRight: true })
  }

  getRocketUpVectorWorld(rocket.body, upVector)
  assert.ok(
    upVector.x > 0,
    `expected the nose to swing toward the body +X, got ${upVector.x}`
  )
})

test('the fins are inert while they are disarmed', () => {
  const rocket = createTestRocket()
  rocket.body.velocityMetersPerSecond.set(0, TEST_SPEED_METERS_PER_SECOND, 0)

  for (let stepIndex = 0; stepIndex < 60; stepIndex += 1) {
    stepRocket(rocket, { pitchForward: true, rollRight: true })
  }

  assert.equal(rocket.controls.finDeflectionPitchRadians, 0)
  assert.equal(rocket.controls.finDeflectionRollRadians, 0)
  assert.equal(rocket.body.torqueAccumulatorNewtonMeters.length(), 0)
})

test('the fin meshes follow the commanded deflection', () => {
  const system = createRocketSystem({ terrainContactQuery: null })

  system.setFinsEnabled(true)
  system.setControlInput('rollRight', true)
  for (let stepIndex = 0; stepIndex < 60; stepIndex += 1) {
    system.step(FIXED_STEP_SECONDS)
  }

  const finGroup = system.getRocketGroup().getObjectByName('rocket-fins')
  assert.ok(finGroup)

  // The roll channel is carried by the fins on the body +Z and -Z sides.
  // They deflect in mirrored senses, so the pair makes a net side force
  // instead of a pure rolling couple.
  const deflectionByAzimuth = new Map()
  for (const finMesh of finGroup.children) {
    deflectionByAzimuth.set(
      finMesh.userData?.azimuthRadians ?? 0,
      readFinChordDeflectionRadians(finMesh)
    )
  }

  const maximumDeflectionRadians = system.getTelemetry().finDeflectionRollRadians
  assert.ok(maximumDeflectionRadians > 0)

  assert.ok(
    Math.abs(deflectionByAzimuth.get(Math.PI * 0.5) - maximumDeflectionRadians) < 1e-6,
    'expected the +Z fin to deflect with the roll command'
  )
  assert.ok(
    Math.abs(deflectionByAzimuth.get(Math.PI * 1.5) + maximumDeflectionRadians) < 1e-6,
    'expected the -Z fin to deflect against the roll command'
  )
  assert.ok(
    Math.abs(deflectionByAzimuth.get(0)) < 1e-6,
    'expected the +X fin to stay neutral'
  )
  assert.ok(
    Math.abs(deflectionByAzimuth.get(Math.PI)) < 1e-6,
    'expected the -X fin to stay neutral'
  )
})

// The signed tilt of a fin chord, about the radial axis of that fin.
function readFinChordDeflectionRadians(finMesh) {
  const baseQuaternion = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    -(finMesh.userData?.azimuthRadians ?? 0)
  )
  // The residual is taken in the fin's own frame, so it is the chord
  // tilt about the radial axis.
  const residualQuaternion = baseQuaternion
    .clone()
    .invert()
    .multiply(finMesh.quaternion)
  const sineHalfAngle = Math.hypot(
    residualQuaternion.x,
    residualQuaternion.y,
    residualQuaternion.z
  )
  const angleRadians = 2 * Math.atan2(sineHalfAngle, residualQuaternion.w)
  if (sineHalfAngle <= 1e-9) return 0

  const axisX = residualQuaternion.x / sineHalfAngle

  return axisX >= 0 ? angleRadians : -angleRadians
}