// test/terrainVerticalDynamicsCoupling.test.js

// Locks the terrain coupling of the 3-DOF vertical chassis dynamics.
//
// The suspension spring force deviation that already drives body heave must
// also reach the roll and pitch rows of the ODE. Without that, the body stays
// perfectly level over uneven terrain, and a solid axle becomes numerically
// indistinguishable from an independent suspension.
//
// Sign conventions used below are the ones the solver already uses:
//   - +X is the car's LEFT side and +Z is forward (src/car/createCar.js).
//   - Positive roll lifts the +X (left) side, so a terrain rise under the
//     left wheels rolls the body with the left side up and the right side
//     down.
//   - Positive pitch lifts the nose, so a terrain rise under the front wheels
//     pitches the body nose up.
//   - The moment rows use the generalized force convention
//     momentRoll = sum(x_i * F_i) and momentPitch = sum(z_i * F_i), where
//     F_i is the upward force the terrain applies to the body through that
//     corner. That is the same convention the stiffness and damping terms of
//     those rows use.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createVerticalChassisDynamicsState,
  updateVerticalChassisDynamics,
} from '../src/vehicle/dynamics/verticalChassisDynamicsState.js'
import { DEFAULT_VEHICLE_SPEC } from '../src/vehicle/defaultVehicleSpec.js'
import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { createHeightfieldTerrainContactQuery } from '../src/terrain/createHeightfieldTerrainContactQuery.js'
import * as THREE from 'three'

const DT_SECONDS = 1 / 60
const GRAVITY_METERS_PER_SECOND_SQUARED = 9.80665
const SPEC = DEFAULT_VEHICLE_SPEC
const MASS_KG = SPEC.massKg
const HALF_TRACK_METERS = SPEC.frontTrackWidthMeters / 2
const HALF_WHEELBASE_METERS = SPEC.wheelbaseMeters / 2
const STATIC_NORMAL_FORCE_PER_WHEEL_NEWTONS =
  (MASS_KG * GRAVITY_METERS_PER_SECOND_SQUARED) / 4
const STATIC_COMPRESSION_METERS =
  SPEC.suspensionTravelMeters * SPEC.suspensionTargetStaticCompressionRatio01
const SPRING_RATE_NEWTONS_PER_METER =
  STATIC_NORMAL_FORCE_PER_WHEEL_NEWTONS / STATIC_COMPRESSION_METERS
const DAMPING_NEWTONS_PER_METER_PER_SECOND =
  2 *
  SPEC.suspensionDampingRatio *
  Math.sqrt(SPRING_RATE_NEWTONS_PER_METER * (MASS_KG / 4))
const ROLL_STIFFNESS_NEWTON_METERS_PER_RADIAN =
  4 * SPRING_RATE_NEWTONS_PER_METER * HALF_TRACK_METERS * HALF_TRACK_METERS
const PITCH_STIFFNESS_NEWTON_METERS_PER_RADIAN =
  4 * SPRING_RATE_NEWTONS_PER_METER * HALF_WHEELBASE_METERS * HALF_WHEELBASE_METERS
const BUMP_HEIGHT_METERS = 0.08
const BUMP_DURATION_SECONDS = 0.3

// Quasi-static roll of a sustained 80 mm rise under one corner and under a
// whole side of the car: the terrain moment divided by the roll stiffness.
const SINGLE_CORNER_QUASI_STATIC_ROLL_RADIANS =
  (SPRING_RATE_NEWTONS_PER_METER * BUMP_HEIGHT_METERS * HALF_TRACK_METERS) /
  ROLL_STIFFNESS_NEWTON_METERS_PER_RADIAN
const ONE_SIDE_QUASI_STATIC_ROLL_RADIANS =
  (2 * SPRING_RATE_NEWTONS_PER_METER * BUMP_HEIGHT_METERS * HALF_TRACK_METERS) /
  ROLL_STIFFNESS_NEWTON_METERS_PER_RADIAN
const ONE_AXLE_QUASI_STATIC_PITCH_RADIANS =
  (2 *
    SPRING_RATE_NEWTONS_PER_METER *
    BUMP_HEIGHT_METERS *
    HALF_WHEELBASE_METERS) /
  PITCH_STIFFNESS_NEWTON_METERS_PER_RADIAN

function makeSpec(overrides = {}) {
  return {
    verticalDynamicsEnabled: true,
    verticalDynamicsForcingEnabled: true,
    massKg: MASS_KG,
    wheelbaseMeters: SPEC.wheelbaseMeters,
    frontTrackWidthMeters: SPEC.frontTrackWidthMeters,
    rearTrackWidthMeters: SPEC.rearTrackWidthMeters,
    centerOfMassHeightMeters: SPEC.centerOfMassHeightMeters,
    suspensionTravelMeters: SPEC.suspensionTravelMeters,
    suspensionTargetStaticCompressionRatio01:
      SPEC.suspensionTargetStaticCompressionRatio01,
    suspensionDampingRatio: SPEC.suspensionDampingRatio,
    ...overrides,
  }
}

function makeWheelState({ x, z, id }) {
  return {
    id,
    isGrounded: true,
    axle: z > 0 ? 'front' : 'rear',
    side: x > 0 ? 'left' : 'right',
    localPosition: { x, y: 0, z },
    suspensionSpringRateNewtonsPerMeter: SPRING_RATE_NEWTONS_PER_METER,
    suspensionCompressionDampingNewtonsPerMeterPerSecond:
      DAMPING_NEWTONS_PER_METER_PER_SECOND,
    suspensionReboundDampingNewtonsPerMeterPerSecond:
      DAMPING_NEWTONS_PER_METER_PER_SECOND,
    baseNormalForceNewtons: STATIC_NORMAL_FORCE_PER_WHEEL_NEWTONS,
    normalForceNewtons: STATIC_NORMAL_FORCE_PER_WHEEL_NEWTONS,
    frictionCoefficient: 1,
    tractionLimitNewtons: STATIC_NORMAL_FORCE_PER_WHEEL_NEWTONS,
    verticalDynamicsLoadDeviationNewtons: 0,
  }
}

function makeWheelStates() {
  return [
    makeWheelState({
      id: 'front-right',
      x: -HALF_TRACK_METERS,
      z: HALF_WHEELBASE_METERS,
    }),
    makeWheelState({
      id: 'front-left',
      x: HALF_TRACK_METERS,
      z: HALF_WHEELBASE_METERS,
    }),
    makeWheelState({
      id: 'rear-right',
      x: -HALF_TRACK_METERS,
      z: -HALF_WHEELBASE_METERS,
    }),
    makeWheelState({
      id: 'rear-left',
      x: HALF_TRACK_METERS,
      z: -HALF_WHEELBASE_METERS,
    }),
  ]
}

// Runs the vertical dynamics seam with a prescribed per-corner terrain
// compression deviation, the way the raycast suspension path would deliver a
// terrain feature to the body. `deviationFor(wheelId, timeSeconds)` returns
// the extra compression in meters for that corner.
function runTerrainScenario({
  deviationFor,
  durationSeconds = 6,
  specOverrides = {},
} = {}) {
  const spec = makeSpec(specOverrides)
  const wheelStates = makeWheelStates()
  const state = createVerticalChassisDynamicsState(spec)
  const samples = []
  const steps = Math.round(durationSeconds / DT_SECONDS)

  for (let step = 0; step < steps; step += 1) {
    const timeSeconds = step * DT_SECONDS
    for (const wheelState of wheelStates) {
      wheelState.suspensionCompressionMeters =
        STATIC_COMPRESSION_METERS + deviationFor(wheelState.id, timeSeconds)
    }
    updateVerticalChassisDynamics(state, wheelStates, spec, DT_SECONDS, null)
    samples.push({
      timeSeconds,
      heaveMeters: state.heaveMeters,
      pitchRadians: state.pitchRadians,
      rollRadians: state.rollRadians,
      rollRateRadiansPerSecond: state.rollRateRadiansPerSecond,
      terrainRollMomentNewtonMeters: state.terrainRollMomentNewtonMeters,
      terrainPitchMomentNewtonMeters: state.terrainPitchMomentNewtonMeters,
    })
  }

  return { state, wheelStates, samples }
}

// A bump that rises and falls under the listed corners.
function bumpDeviationFor(cornerIds, heightMeters = BUMP_HEIGHT_METERS) {
  return (wheelId, timeSeconds) => {
    if (!cornerIds.includes(wheelId)) return 0
    if (timeSeconds > BUMP_DURATION_SECONDS) return 0
    return (
      heightMeters *
      Math.sin((Math.PI * timeSeconds) / BUMP_DURATION_SECONDS)
    )
  }
}

// A sustained one-sided input that ramps in slowly.
function rampDeviationFor(cornerIds, heightMeters = BUMP_HEIGHT_METERS) {
  const rampSeconds = 3
  return (wheelId, timeSeconds) => {
    if (!cornerIds.includes(wheelId)) return 0
    const t = Math.min(1, timeSeconds / rampSeconds)
    return heightMeters * t * t * (3 - 2 * t)
  }
}

function peakSigned(samples, key) {
  let peak = 0
  for (const sample of samples) {
    if (Math.abs(sample[key]) > Math.abs(peak)) peak = sample[key]
  }
  return peak
}

function peakMagnitude(samples, key) {
  return Math.abs(peakSigned(samples, key))
}

// Time in seconds after the peak at which the response stays inside 5% of
// its own peak magnitude.
function settlingSecondsAfterPeak(samples, key) {
  const peakIndex = samples.reduce((bestIndex, sample, index) =>
    Math.abs(sample[key]) > Math.abs(samples[bestIndex][key]) ? index : bestIndex
  , 0)
  const peakMagnitudeValue = Math.abs(samples[peakIndex][key])
  const deadlineIndex = peakIndex + Math.round(3 / DT_SECONDS)
  for (let index = peakIndex; index <= deadlineIndex; index += 1) {
    const staysSettled = samples
      .slice(index, index + 60)
      .every((sample) => Math.abs(sample[key]) <= 0.05 * peakMagnitudeValue)
    if (staysSettled) {
      return (index - peakIndex) * DT_SECONDS
    }
  }
  return Number.POSITIVE_INFINITY
}

test('a one-sided terrain bump rolls the body close to the analytic prediction', () => {
  const { samples } = runTerrainScenario({
    deviationFor: bumpDeviationFor(['front-left']),
  })

  const peakRollRadians = peakMagnitude(samples, 'rollRadians')
  const peakHeaveMeters = peakMagnitude(samples, 'heaveMeters')

  assert.ok(
    peakRollRadians > 0.005 && peakRollRadians < 0.02,
    `one-sided bump roll should land in the analytic band; got ${peakRollRadians.toFixed(5)} rad`
  )
  assert.ok(
    Math.abs(peakRollRadians - SINGLE_CORNER_QUASI_STATIC_ROLL_RADIANS) <
      SINGLE_CORNER_QUASI_STATIC_ROLL_RADIANS * 0.25,
    `roll should be proportional to the analytic quasi-static value ${SINGLE_CORNER_QUASI_STATIC_ROLL_RADIANS.toFixed(5)} rad; got ${peakRollRadians.toFixed(5)} rad`
  )
  assert.ok(
    peakHeaveMeters > 0.005,
    `the bump must still drive the heave; got ${peakHeaveMeters.toFixed(5)} m`
  )
  // A rise under the left wheels lifts the left side, which is a positive
  // roll in this convention.
  assert.ok(
    peakSigned(samples, 'rollRadians') > 0,
    'a left-side terrain rise must roll the body with the left side up'
  )
})

test('left and right terrain bumps produce mirrored roll', () => {
  const left = runTerrainScenario({
    deviationFor: bumpDeviationFor(['front-left', 'rear-left']),
  })
  const right = runTerrainScenario({
    deviationFor: bumpDeviationFor(['front-right', 'rear-right']),
  })

  const leftPeakRollRadians = peakSigned(left.samples, 'rollRadians')
  const rightPeakRollRadians = peakSigned(right.samples, 'rollRadians')

  assert.ok(leftPeakRollRadians > 0, 'the left-side bump must roll positive')
  assert.ok(rightPeakRollRadians < 0, 'the right-side bump must roll negative')
  assert.ok(
    Math.abs(Math.abs(leftPeakRollRadians) - Math.abs(rightPeakRollRadians)) <
      1e-9,
    `mirrored bumps must produce mirrored roll; got ${leftPeakRollRadians.toFixed(6)} and ${rightPeakRollRadians.toFixed(6)} rad`
  )
  assert.ok(
    Math.abs(Math.abs(leftPeakRollRadians) - ONE_SIDE_QUASI_STATIC_ROLL_RADIANS) <
      ONE_SIDE_QUASI_STATIC_ROLL_RADIANS * 0.25,
    `a one-sided bump should reach the analytic one-side roll ${ONE_SIDE_QUASI_STATIC_ROLL_RADIANS.toFixed(5)} rad; got ${leftPeakRollRadians.toFixed(5)} rad`
  )
})

test('a symmetric terrain bump heaves without rolling or pitching', () => {
  const { samples } = runTerrainScenario({
    deviationFor: bumpDeviationFor([
      'front-left',
      'front-right',
      'rear-left',
      'rear-right',
    ]),
  })

  assert.ok(
    peakMagnitude(samples, 'rollRadians') < 0.001,
    `a symmetric bump must not roll the body; got ${peakMagnitude(samples, 'rollRadians').toFixed(6)} rad`
  )
  assert.ok(
    peakMagnitude(samples, 'pitchRadians') < 0.001,
    `a symmetric bump must not pitch the body; got ${peakMagnitude(samples, 'pitchRadians').toFixed(6)} rad`
  )
  assert.ok(
    peakMagnitude(samples, 'heaveMeters') > 0.02,
    `a symmetric bump must heave the body; got ${peakMagnitude(samples, 'heaveMeters').toFixed(5)} m`
  )
})

test('front and rear terrain bumps pitch the body in opposite directions', () => {
  const front = runTerrainScenario({
    deviationFor: bumpDeviationFor(['front-left', 'front-right']),
  })
  const rear = runTerrainScenario({
    deviationFor: bumpDeviationFor(['rear-left', 'rear-right']),
  })

  const frontPitchRadians = peakSigned(front.samples, 'pitchRadians')
  const rearPitchRadians = peakSigned(rear.samples, 'pitchRadians')

  assert.ok(frontPitchRadians > 0, 'a front rise must pitch the nose up')
  assert.ok(rearPitchRadians < 0, 'a rear rise must pitch the nose down')
  assert.ok(
    Math.abs(Math.abs(frontPitchRadians) - Math.abs(rearPitchRadians)) < 1e-9,
    `front and rear bumps must produce mirrored pitch; got ${frontPitchRadians.toFixed(6)} and ${rearPitchRadians.toFixed(6)} rad`
  )
  assert.ok(
    Math.abs(Math.abs(frontPitchRadians) - ONE_AXLE_QUASI_STATIC_PITCH_RADIANS) <
      ONE_AXLE_QUASI_STATIC_PITCH_RADIANS * 0.25,
    `the pitch should match the analytic quasi-static value ${ONE_AXLE_QUASI_STATIC_PITCH_RADIANS.toFixed(5)} rad; got ${frontPitchRadians.toFixed(5)} rad`
  )
  assert.ok(
    peakMagnitude(front.samples, 'rollRadians') < 0.001,
    'a front-only bump must not roll the body'
  )
  assert.ok(
    peakMagnitude(rear.samples, 'rollRadians') < 0.001,
    'a rear-only bump must not roll the body'
  )
})

test('a sustained one-sided terrain input settles to the quasi-static roll', () => {
  const { samples } = runTerrainScenario({
    deviationFor: rampDeviationFor(['front-left', 'rear-left']),
    durationSeconds: 12,
  })

  const settledRollRadians = samples[samples.length - 1].rollRadians
  assert.ok(
    Math.abs(settledRollRadians - ONE_SIDE_QUASI_STATIC_ROLL_RADIANS) <
      ONE_SIDE_QUASI_STATIC_ROLL_RADIANS * 0.2,
    `the settled roll should be within 20% of ${ONE_SIDE_QUASI_STATIC_ROLL_RADIANS.toFixed(5)} rad; got ${settledRollRadians.toFixed(5)} rad`
  )
})

test('terrain roll and pitch responses stay bounded and damped', () => {
  const { samples } = runTerrainScenario({
    deviationFor: bumpDeviationFor(['front-left', 'rear-left']),
  })

  const peakRollRadians = peakMagnitude(samples, 'rollRadians')
  assert.ok(
    peakRollRadians > 0.005,
    `the damping check needs a real roll response; got ${peakRollRadians.toFixed(5)} rad`
  )
  assert.ok(
    peakRollRadians < 0.1,
    'the roll must stay bounded'
  )
  assert.ok(
    peakMagnitude(samples, 'pitchRadians') < 0.1,
    'the pitch must stay bounded'
  )
  assert.ok(
    settlingSecondsAfterPeak(samples, 'rollRadians') < 2,
    'the roll must damp out instead of oscillating'
  )
  assert.ok(
    settlingSecondsAfterPeak(samples, 'heaveMeters') < 2,
    'the heave must damp out instead of oscillating'
  )
})

test('the terrain moments are reported and gated by the forcing flag', () => {
  const forced = runTerrainScenario({
    deviationFor: bumpDeviationFor(['front-left', 'rear-left']),
  })
  assert.ok(
    peakMagnitude(forced.samples, 'terrainRollMomentNewtonMeters') > 0,
    'a left-side terrain rise must report a terrain roll moment'
  )
  assert.ok(
    peakSigned(forced.samples, 'terrainRollMomentNewtonMeters') > 0,
    'a left-side terrain rise must report a positive terrain roll moment'
  )
  assert.ok(
    Math.abs(peakMagnitude(forced.samples, 'terrainPitchMomentNewtonMeters')) <
      1e-9,
    'a left-side terrain rise must not report a terrain pitch moment'
  )

  const disabled = runTerrainScenario({
    deviationFor: bumpDeviationFor(['front-left', 'rear-left']),
    specOverrides: { verticalDynamicsForcingEnabled: false },
  })
  assert.equal(disabled.state.terrainRollMomentNewtonMeters, 0)
  assert.equal(disabled.state.terrainPitchMomentNewtonMeters, 0)
  assert.ok(
    peakMagnitude(disabled.samples, 'terrainRollMomentNewtonMeters') === 0,
    'the terrain roll moment must stay zero when the forcing flag is off'
  )
  assert.ok(
    peakMagnitude(disabled.samples, 'rollRadians') === 0,
    'the roll must stay inert when the forcing flag is off'
  )
})

// --- Live vehicle path ---------------------------------------------------

const STEP_HEIGHT_METERS = 0.08

function createSteppedTerrainContactQuery() {
  return createHeightfieldTerrainContactQuery({
    surfaceProfile: {
      profileName: 'terrain-coupling-left-step',
      surfaceKind: 'test-asphalt',
      frictionCoefficient: 1,
      querySurfaceAtWorldPosition(worldXMeters, worldZMeters, target = {}) {
        // Only the +X (left) half of the road carries the step, so the
        // vehicle settles on a one-sided terrain step.
        const heightMeters =
          worldXMeters > 0 ? STEP_HEIGHT_METERS : 0
        const sampleSpacingMeters = 0.02
        const heightAt = (xMeters) => (xMeters > 0 ? STEP_HEIGHT_METERS : 0)
        const slopeX =
          (heightAt(worldXMeters + sampleSpacingMeters) -
            heightAt(worldXMeters - sampleSpacingMeters)) /
          (2 * sampleSpacingMeters)
        const slopeZ = 0
        const normal = new THREE.Vector3(-slopeX, 1, -slopeZ).normalize()
        target.isWithinBounds = true
        target.isInsideTerrainBounds = true
        target.profileName = 'terrain-coupling-left-step'
        target.surfaceKind = 'test-asphalt'
        target.frictionCoefficient = 1
        target.terrainHeightMeters = heightMeters
        target.groundHeightMeters = heightMeters
        target.normalWorld = target.normalWorld ?? {}
        target.normalWorld.x = normal.x
        target.normalWorld.y = normal.y
        target.normalWorld.z = normal.z
        target.slopeRadians = Math.atan(Math.hypot(slopeX, slopeZ))
        target.slopeDegrees = (target.slopeRadians * 180) / Math.PI
        target.status = 'surface-available'
        return target
      },
    },
  })
}

function runSteppedTerrainDrive(specOverrides = {}) {
  const controller = createVehicleController({
    vehicle: createCar(),
    startPosition: new THREE.Vector3(0, 0, -20),
    terrainContactQuery: createSteppedTerrainContactQuery(),
    spec: specOverrides,
  })
  controller.getSnapshot().velocity.set(0, 0, 15)

  const samples = []
  for (let step = 0; step < 240; step += 1) {
    const snapshot = controller.update(DT_SECONDS, { throttle: true })
    samples.push({
      step,
      rollRadians: snapshot.verticalDynamics.rollRadians,
      pitchRadians: snapshot.verticalDynamics.pitchRadians,
      heaveMeters: snapshot.verticalDynamics.heaveMeters,
      terrainRollMomentNewtonMeters:
        snapshot.verticalDynamics.terrainRollMomentNewtonMeters,
    })
  }
  return samples
}

test('the live vehicle rolls onto a one-sided terrain step', () => {
  const samples = runSteppedTerrainDrive()
  const tail = samples.slice(-60)
  const settledRollRadians =
    tail.reduce((total, sample) => total + sample.rollRadians, 0) / tail.length

  assert.ok(
    settledRollRadians > 0,
    `the vehicle must roll with the left side up onto a left-side step; got ${settledRollRadians.toFixed(5)} rad`
  )
  assert.ok(
    Math.abs(settledRollRadians - ONE_SIDE_QUASI_STATIC_ROLL_RADIANS) <
      ONE_SIDE_QUASI_STATIC_ROLL_RADIANS * 0.2,
    `the settled live roll should be within 20% of ${ONE_SIDE_QUASI_STATIC_ROLL_RADIANS.toFixed(5)} rad; got ${settledRollRadians.toFixed(5)} rad`
  )
  assert.ok(
    Math.abs(peakMagnitude(samples, 'rollRadians')) < 0.1,
    'the live roll must stay bounded'
  )
})

test('the live vehicle stays level on a one-sided step without the forcing flag', () => {
  const samples = runSteppedTerrainDrive({
    verticalDynamicsForcingEnabled: false,
  })

  for (const sample of samples) {
    assert.equal(sample.rollRadians, 0)
    assert.equal(sample.terrainRollMomentNewtonMeters, 0)
  }
})
