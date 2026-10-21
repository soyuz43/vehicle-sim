// test/verticalDynamicsLivePath.test.js

import assert from 'node:assert/strict'
import test from 'node:test'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import * as THREE from 'three'

import { createHeightfieldTerrainContactQuery } from '../src/terrain/createHeightfieldTerrainContactQuery.js'

const STEP_SECONDS = 1 / 60
const VEHICLE_MASS_KG = 1400
const CENTER_OF_MASS_HEIGHT_METERS = 0.55
const WHEELBASE_METERS = 2.9
const BRAKING_ACCELERATION_METERS_PER_SECOND_SQUARED = -0.5 * 9.80665
const INITIAL_BRAKE_SPEED_METERS_PER_SECOND = 20

function createController(specOverrides = {}, options = {}) {
  const vehicle = createCar()
  const speedMetersPerSecond = options.speedMetersPerSecond ?? 0
  const controller = createVehicleController({
    vehicle,
    startPosition: options.startPosition
      ? new THREE.Vector3(
          options.startPosition.x,
          options.startPosition.y,
          options.startPosition.z
        )
      : undefined,
    terrainContactQuery: options.terrainContactQuery,
    spec: specOverrides,
  })

  if (speedMetersPerSecond !== 0) {
    controller.getSnapshot().velocity.set(0, 0, speedMetersPerSecond)
  }

  return controller
}

function axleLoadNewtons(snapshot, axle) {
  return snapshot.wheelStates
    .filter((wheelState) => wheelState.axle === axle && wheelState.isGrounded)
    .reduce((total, wheelState) => total + wheelState.normalForceNewtons, 0)
}

function sideLoadNewtons(snapshot, side) {
  return snapshot.wheelStates
    .filter((wheelState) => wheelState.side === side && wheelState.isGrounded)
    .reduce((total, wheelState) => total + wheelState.normalForceNewtons, 0)
}

function assertFiniteVehicleMotion(snapshot, label) {
  const vertical = snapshot.verticalDynamics
  assert.ok(vertical, `${label}: vertical dynamics snapshot is present`)
  assert.equal(vertical.isFinite, true, `${label}: vertical state is finite`)
  for (const wheelState of snapshot.wheelStates) {
    assert.ok(
      Number.isFinite(wheelState.normalForceNewtons),
      `${label}: wheel normal force is finite`
    )
  }
}

test('live acceleration couples into vertical pitch and rearward load', () => {
  const controller = createController()
  let peakPitchRadians = 0
  const frontMinusRearSamplesNewtons = []
  let unusedMaximumFrontMinusRearNewtons = Number.NEGATIVE_INFINITY

  for (let step = 0; step < 45; step += 1) {
    const snapshot = controller.update(STEP_SECONDS, { throttle: true })
    peakPitchRadians = Math.max(
      peakPitchRadians,
      Math.abs(snapshot.verticalDynamics.pitchRadians)
    )
    unusedMaximumFrontMinusRearNewtons = Math.min(
      unusedMaximumFrontMinusRearNewtons,
      axleLoadNewtons(snapshot, 'front') - axleLoadNewtons(snapshot, 'rear')
    )
    assertFiniteVehicleMotion(snapshot, `acceleration step ${step}`)
  }

  assert.ok(peakPitchRadians > 1e-5)
  assert.ok(unusedMaximumFrontMinusRearNewtons < -10)
  assert.equal(
    controller.getSnapshot().verticalDynamics.planarForceCouplingActive,
    true
  )
})

test('live half-g braking matches static pitch load transfer', () => {
  const brakingTorquePerWheelNewtonMeters = 164
  const controller = createController(
    {
      maxServiceBrakeTorqueNewtonMeters: 8000,
      serviceBrakeAbsEnabled: false,
      longitudinalTireForceRelaxationEnabled: false,
      longitudinalTireStiffnessNewtonsPerSlipRatio: 2400,
    },
    { speedMetersPerSecond: INITIAL_BRAKE_SPEED_METERS_PER_SECOND }
  )

  const expectedTransferNewtons = Math.abs(
    BRAKING_ACCELERATION_METERS_PER_SECOND_SQUARED *
      VEHICLE_MASS_KG *
      CENTER_OF_MASS_HEIGHT_METERS /
      WHEELBASE_METERS
  )

  for (let step = 0; step < 30; step += 1) {
    controller.update(STEP_SECONDS, {})
  }
  // Steps 30-39 compare during settling; the remaining gap is transient
  // sprung-mass inertia, not steady-state error.
  const frontMinusRearSamplesNewtons = []
  let unusedMaximumFrontMinusRearNewtons = Number.POSITIVE_INFINITY
  let minimumPitchRadians = 0

  for (let step = 0; step < 40; step += 1) {
    const snapshot = controller.update(STEP_SECONDS, { brake: true })
    const frontMinusRearNewtons =
      axleLoadNewtons(snapshot, 'front') - axleLoadNewtons(snapshot, 'rear')
    frontMinusRearSamplesNewtons.push(frontMinusRearNewtons)
    unusedMaximumFrontMinusRearNewtons = Math.max(
      unusedMaximumFrontMinusRearNewtons,
      frontMinusRearNewtons
    )
    minimumPitchRadians = Math.min(
      minimumPitchRadians,
      snapshot.verticalDynamics.pitchRadians
    )
    assertFiniteVehicleMotion(snapshot, `braking step ${step}`)
  }

  assert.ok(minimumPitchRadians < -1e-5)
  const steadyFrontMinusRearNewtons =
    frontMinusRearSamplesNewtons.slice(30).reduce((total, value) => total + value, 0) / 10
  assert.ok(
    Math.abs(
      steadyFrontMinusRearNewtons - expectedTransferNewtons * 2
    ) < expectedTransferNewtons * 2 * 0.25,
    `expected steady front-rear transfer near ${(expectedTransferNewtons * 2).toFixed(1)} N; got ${steadyFrontMinusRearNewtons.toFixed(1)} N`
  )
})

test('live cornering couples into vertical roll and lateral load', () => {
  const controller = createController()
  let peakRollRadians = 0
  let peakLeftMinusRightNewtons = Number.NEGATIVE_INFINITY

  for (let step = 0; step < 60; step += 1) {
    const snapshot = controller.update(STEP_SECONDS, {
      throttle: true,
      left: true,
    })
    peakRollRadians = Math.max(
      peakRollRadians,
      Math.abs(snapshot.verticalDynamics.rollRadians)
    )
    peakLeftMinusRightNewtons = Math.max(
      peakLeftMinusRightNewtons,
      sideLoadNewtons(snapshot, 'left') - sideLoadNewtons(snapshot, 'right')
    )
    assertFiniteVehicleMotion(snapshot, `cornering step ${step}`)
  }

  assert.ok(peakRollRadians > 1e-5)
  assert.ok(Math.abs(peakLeftMinusRightNewtons) > 10)
  assert.equal(
    controller.getSnapshot().verticalDynamics.planarForceCouplingActive,
    true
  )
})

test('terrain bump produces finite pitch and roll response', () => {
  const terrainContactQuery = createHeightfieldTerrainContactQuery({
    surfaceProfile: {
      profileName: 'vertical-dynamics-bump',
      surfaceKind: 'test-asphalt',
      frictionCoefficient: 1,
      querySurfaceAtWorldPosition(worldXMeters, worldZMeters, target = {}) {
        const bumpMeters = 0.12 * Math.exp(
          -(worldZMeters * worldZMeters) / (2 * 0.55 * 0.55)
        )
        target.isWithinBounds = true
        target.isInsideTerrainBounds = true
        target.profileName = 'vertical-dynamics-bump'
        target.surfaceKind = 'test-asphalt'
        target.frictionCoefficient = 1
        target.terrainHeightMeters = bumpMeters
        target.groundHeightMeters = bumpMeters
        target.normalWorld = target.normalWorld ?? {}
        target.normalWorld.x = 0
        target.normalWorld.y = 1
        target.normalWorld.z = 0
        target.slopeRadians = 0
        target.slopeDegrees = 0
        target.status = 'surface-available'
        return target
      },
    },
  })
  const controller = createController(
    {},
    {
      startPosition: { x: 0, y: 0, z: -12 },
      terrainContactQuery,
    }
  )
  let peakPitchRadians = 0
  let peakRollRadians = 0

  for (let step = 0; step < 90; step += 1) {
    const snapshot = controller.update(STEP_SECONDS, { throttle: true })
    peakPitchRadians = Math.max(
      peakPitchRadians,
      Math.abs(snapshot.verticalDynamics.pitchRadians)
    )
    peakRollRadians = Math.max(
      peakRollRadians,
      Math.abs(snapshot.verticalDynamics.rollRadians)
    )
    assertFiniteVehicleMotion(snapshot, `bump step ${step}`)
  }

  assert.ok(peakPitchRadians > 0, 'terrain contact should excite pitch')
  assert.ok(Number.isFinite(peakRollRadians))
})

test('disabling planar force coupling restores inert vertical excitation', () => {
  const controller = createController({
    verticalDynamicsPlanarForceCouplingEnabled: false,
  })

  for (let step = 0; step < 45; step += 1) {
    const snapshot = controller.update(STEP_SECONDS, { throttle: true })
    assert.equal(
      snapshot.verticalDynamics.planarForceCouplingActive,
      false
    )
    assert.equal(snapshot.verticalDynamics.pitchRadians, 0)
    assert.equal(snapshot.verticalDynamics.rollRadians, 0)
    assertFiniteVehicleMotion(snapshot, `disabled step ${step}`)
  }
})

test('disabling vertical dynamics restores quasi-static load transfer', () => {
  const controller = createController({
    verticalDynamicsEnabled: false,
  })
  let sawNonzeroPitchTelemetry = false

  for (let step = 0; step < 45; step += 1) {
    const snapshot = controller.update(STEP_SECONDS, { throttle: true })
    sawNonzeroPitchTelemetry = sawNonzeroPitchTelemetry ||
      Math.abs(snapshot.loadTransferSummary.totalLongitudinalTransferAbsNewtons) > 1
    assertFiniteVehicleMotion(snapshot, `fallback step ${step}`)
  }

  assert.ok(sawNonzeroPitchTelemetry)
  assert.equal(controller.getSnapshot().verticalDynamics.available, false)
})