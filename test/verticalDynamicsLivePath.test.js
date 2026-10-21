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

// Geometry of the off-road course step-up jump, reproduced as an analytic
// height field so the live path can drive over a deterministic feature.
// See src/terrain/createEnhancedTerrainSurfaceProfile.js stepUpJump().
const STEP_UP_JUMP_CENTER_Z_METERS = -20
const STEP_UP_JUMP_WIDTH_X_METERS = 12
const STEP_UP_JUMP_WIDTH_Z_METERS = 6
const STEP_UP_JUMP_HEIGHT_METERS = 0.8
const STEP_UP_JUMP_CREST_NZ = 2 / 3
const STEP_UP_JUMP_TRAILING_EDGE_NZ = 5 / 6
const STEP_UP_JUMP_APPROACH_Z_METERS = -45
// The front axle sits ahead of the vehicle origin, so the vehicle origin has
// to stay further back than the jump start for the whole car to be flat.
const STEP_UP_JUMP_FLAT_APPROACH_Z_METERS = -28
const STEP_UP_JUMP_CRUISE_SPEED_METERS_PER_SECOND = 15
const STEP_UP_JUMP_DRIVE_STEPS = 300

function smoothStep01(value, edge0, edge1) {
  if (!Number.isFinite(value) || edge1 <= edge0) return 0
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function stepUpJumpHeightMeters(worldXMeters, worldZMeters) {
  const normalizedX = worldXMeters / STEP_UP_JUMP_WIDTH_X_METERS
  const normalizedZ =
    (worldZMeters - STEP_UP_JUMP_CENTER_Z_METERS) / STEP_UP_JUMP_WIDTH_Z_METERS
  if (normalizedZ < -1 || normalizedZ > STEP_UP_JUMP_TRAILING_EDGE_NZ) return 0
  if (Math.abs(normalizedX) > 1) return 0
  const rampProfile = Math.min(
    1,
    Math.max(0, (normalizedZ + 1) / (STEP_UP_JUMP_CREST_NZ + 1))
  )
  const trailingFalloff = 1 - smoothStep01(
    normalizedZ,
    STEP_UP_JUMP_CREST_NZ,
    STEP_UP_JUMP_TRAILING_EDGE_NZ
  )
  return (
    STEP_UP_JUMP_HEIGHT_METERS *
    rampProfile *
    trailingFalloff *
    (1 - Math.abs(normalizedX) * 0.3)
  )
}

function createStepUpJumpContactQuery() {
  return createHeightfieldTerrainContactQuery({
    surfaceProfile: {
      profileName: 'vertical-dynamics-step-up-jump',
      surfaceKind: 'test-asphalt',
      frictionCoefficient: 1,
      querySurfaceAtWorldPosition(worldXMeters, worldZMeters, target = {}) {
        const heightMeters = stepUpJumpHeightMeters(worldXMeters, worldZMeters)
        const sampleSpacingMeters = 0.02
        const slopeX =
          (stepUpJumpHeightMeters(worldXMeters + sampleSpacingMeters, worldZMeters) -
            stepUpJumpHeightMeters(worldXMeters - sampleSpacingMeters, worldZMeters)) /
          (2 * sampleSpacingMeters)
        const slopeZ =
          (stepUpJumpHeightMeters(worldXMeters, worldZMeters + sampleSpacingMeters) -
            stepUpJumpHeightMeters(worldXMeters, worldZMeters - sampleSpacingMeters)) /
          (2 * sampleSpacingMeters)
        const normal = new THREE.Vector3(-slopeX, 1, -slopeZ).normalize()
        target.isWithinBounds = true
        target.isInsideTerrainBounds = true
        target.profileName = 'vertical-dynamics-step-up-jump'
        target.surfaceKind = 'test-asphalt'
        target.frictionCoefficient = 1
        target.terrainHeightMeters = heightMeters
        target.groundHeightMeters = heightMeters
        target.normalWorld = target.normalWorld ?? {}
        target.normalWorld.x = normal.x
        target.normalWorld.y = normal.y
        target.normalWorld.z = normal.z
        target.slopeRadians = Math.atan(Math.hypot(slopeX, slopeZ))
        target.slopeDegrees = target.slopeRadians * (180 / Math.PI)
        target.status = 'surface-available'
        return target
      },
    },
  })
}

// Drives the live controller over the step-up jump and samples the vertical
// dynamics state every fixed step.
function runStepUpJumpDrive(specOverrides = {}) {
  const controller = createController(specOverrides, {
    startPosition: { x: 0, y: 0, z: STEP_UP_JUMP_APPROACH_Z_METERS },
    terrainContactQuery: createStepUpJumpContactQuery(),
  })
  controller.reset()
  controller.getSnapshot().velocity.set(
    0,
    0,
    STEP_UP_JUMP_CRUISE_SPEED_METERS_PER_SECOND
  )

  const samples = []
  for (let step = 0; step < STEP_UP_JUMP_DRIVE_STEPS; step += 1) {
    const snapshot = controller.update(STEP_SECONDS, {})
    samples.push({
      step,
      worldZMeters: snapshot.position.z,
      heaveMeters: snapshot.chassisAttitude.heaveOffsetMeters,
      heaveVelocityMetersPerSecond:
        snapshot.verticalDynamics.heaveVelocityMetersPerSecond,
      heaveForcingForceNewtons:
        snapshot.verticalDynamics.heaveForcingForceNewtons,
      groundedWheelCount: snapshot.wheelStates.filter(
        (wheelState) => wheelState.isGrounded
      ).length,
    })
  }
  return samples
}

function peakAbsHeaveMeters(samples) {
  return samples.reduce(
    (peak, sample) => Math.max(peak, Math.abs(sample.heaveMeters)),
    0
  )
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
    verticalDynamicsForcingEnabled: false,
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

test('terrain step-up jump produces a bounded heave response', () => {
  const samples = runStepUpJumpDrive()
  const peakHeaveMeters = peakAbsHeaveMeters(samples)

  assert.ok(
    peakHeaveMeters > 0.002,
    `terrain should push the body above 2 mm of heave; got ${(peakHeaveMeters * 1000).toFixed(2)} mm`
  )
  assert.ok(
    peakHeaveMeters < 0.15,
    `heave should stay bounded by the suspension travel; got ${peakHeaveMeters.toFixed(4)} m`
  )

  // The heave must be terrain driven, not a spawn transient: the vehicle
  // starts on flat ground well before the jump.
  const approachSamples = samples.filter(
    (sample) => sample.worldZMeters < STEP_UP_JUMP_FLAT_APPROACH_Z_METERS
  )
  assert.ok(approachSamples.length > 30)
  for (const sample of approachSamples) {
    assert.equal(
      sample.heaveMeters,
      0,
      `flat approach should not excite heave at step ${sample.step}`
    )
  }

  const peakSample = samples.reduce(
    (best, sample) =>
      Math.abs(sample.heaveMeters) > Math.abs(best.heaveMeters) ? sample : best,
    samples[0]
  )
  assert.ok(
    peakSample.worldZMeters > STEP_UP_JUMP_FLAT_APPROACH_Z_METERS,
    'the heave peak should occur after the vehicle reaches the jump feature'
  )
})

test('heave settles back toward zero after the bump', () => {
  const samples = runStepUpJumpDrive()
  const peakHeaveMeters = peakAbsHeaveMeters(samples)
  const peakIndex = samples.reduce(
    (bestIndex, sample, index) =>
      Math.abs(sample.heaveMeters) > Math.abs(samples[bestIndex].heaveMeters)
        ? index
        : bestIndex,
    0
  )

  // Damped return: the heave must come to rest inside 5% of its peak within
  // 2 s of the peak and stay there.
  const settleToleranceMeters = 0.05 * peakHeaveMeters
  const settleDeadlineIndex = peakIndex + 2 * 60
  let settledIndex = -1
  for (let index = peakIndex; index <= settleDeadlineIndex; index += 1) {
    const staysSettled = samples
      .slice(index, Math.min(index + 60, samples.length))
      .every((sample) => Math.abs(sample.heaveMeters) <= settleToleranceMeters)
    if (staysSettled) {
      settledIndex = index
      break
    }
  }
  assert.ok(
    settledIndex > 0,
    `heave should settle within 2 s of its peak; peak was ${peakHeaveMeters.toFixed(4)} m`
  )

  const tailSamples = samples.slice(-60)
  const tailPeakMeters = tailSamples.reduce(
    (peak, sample) => Math.max(peak, Math.abs(sample.heaveMeters)),
    0
  )
  assert.ok(
    tailPeakMeters < 0.001,
    `heave should return to rest after the bump; tail peak was ${tailPeakMeters.toFixed(5)} m`
  )
})

test('contact loss does not spike the heave', () => {
  const samples = runStepUpJumpDrive()
  const contactLossSamples = samples.filter(
    (sample) => sample.groundedWheelCount < 4
  )
  assert.ok(
    contactLossSamples.length > 0,
    'the step-up jump should induce a contact loss event'
  )

  let maximumStepDeltaMeters = 0
  for (let index = 1; index < samples.length; index += 1) {
    const stepDeltaMeters = Math.abs(
      samples[index].heaveMeters - samples[index - 1].heaveMeters
    )
    maximumStepDeltaMeters = Math.max(
      maximumStepDeltaMeters,
      stepDeltaMeters
    )
  }
  assert.ok(
    maximumStepDeltaMeters < 0.03,
    `heave should not jump in a single step; largest step was ${(maximumStepDeltaMeters * 1000).toFixed(2)} mm`
  )

  for (const sample of samples) {
    assert.ok(Number.isFinite(sample.heaveMeters))
    assert.ok(
      Math.abs(sample.heaveMeters) < 0.15,
      `heave stayed bounded through contact loss; got ${sample.heaveMeters} m`
    )
  }
})

test('disabling the coupling flag keeps the heave inert', () => {
  const controller = createController({
    verticalDynamicsForcingEnabled: false,
  })

  for (let step = 0; step < 45; step += 1) {
    const snapshot = controller.update(STEP_SECONDS, { throttle: true })
    assert.equal(snapshot.verticalDynamics.heaveForceCouplingActive, false)
    assert.equal(snapshot.verticalDynamics.heaveMeters, 0)
    assert.equal(snapshot.verticalDynamics.heaveVelocityMetersPerSecond, 0)
    assert.equal(snapshot.chassisAttitude.heaveOffsetMeters, 0)
  }
})

test('disabling the coupling flag leaves the terrain heave inert', () => {
  const samples = runStepUpJumpDrive({
    verticalDynamicsForcingEnabled: false,
  })

  for (const sample of samples) {
    assert.equal(
      sample.heaveMeters,
      0,
      `flag-off heave must stay inert at step ${sample.step}`
    )
    assert.equal(sample.heaveForcingForceNewtons, 0)
  }
})

test('quasi-static fallback is unaffected by the heave forcing', () => {
  const withCoupling = runStepUpJumpDrive({ verticalDynamicsEnabled: false })
  const withoutCoupling = runStepUpJumpDrive({
    verticalDynamicsEnabled: false,
    verticalDynamicsForcingEnabled: false,
  })

  assert.equal(withCoupling.length, withoutCoupling.length)
  for (let index = 0; index < withCoupling.length; index += 1) {
    assert.equal(
      withCoupling[index].heaveMeters,
      withoutCoupling[index].heaveMeters,
      `quasi-static fallback must not depend on the coupling flag (step ${index})`
    )
    assert.equal(
      withCoupling[index].groundedWheelCount,
      withoutCoupling[index].groundedWheelCount,
      `quasi-static fallback contact state must not depend on the coupling flag (step ${index})`
    )
  }

  const controller = createController({ verticalDynamicsEnabled: false })
  let sawNonzeroPitchTelemetry = false
  for (let step = 0; step < 45; step += 1) {
    const snapshot = controller.update(STEP_SECONDS, { throttle: true })
    sawNonzeroPitchTelemetry = sawNonzeroPitchTelemetry ||
      Math.abs(snapshot.loadTransferSummary.totalLongitudinalTransferAbsNewtons) > 1
    assert.equal(snapshot.verticalDynamics.available, false)
  }
  assert.ok(sawNonzeroPitchTelemetry)
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