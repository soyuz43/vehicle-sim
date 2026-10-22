// test/verticalDynamicsLoadTransferTargets.test.js

// Locks the steady-state load-transfer targets of the 3-DOF vertical chassis
// dynamics seam against the closed-form vehicle-dynamics formulas:
//
//   lateral:      dF = m * a_lat * h_cg / track_width
//   longitudinal: dF = m * a_fwd * h_cg / wheelbase
//
// Conventions used below:
//   - lateral dF is the change of the total load on one side, which is also
//     the difference between the outside and the inside wheel load;
//   - longitudinal dF is the change of the front axle total load.
//
// The body attitude is solved as ODE state; the wheel loads recover the
// suspension reaction to that body motion through the load deviation
// (-k * u - c * uRate) applied on top of the raycast base support. These
// tests are the prerequisite guard for later suspension-geometry work
// (camber, roll centers, wishbone): if a body displacement stops producing
// the corresponding tire load, the classic formulas below stop holding.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createVerticalChassisDynamicsState,
  updateVerticalChassisDynamics,
} from '../src/vehicle/dynamics/verticalChassisDynamicsState.js'
import { DEFAULT_VEHICLE_SPEC } from '../src/vehicle/defaultVehicleSpec.js'
import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'

const DT_SECONDS = 1 / 60
const GRAVITY_METERS_PER_SECOND_SQUARED = 9.80665
const SPEC = DEFAULT_VEHICLE_SPEC
const MASS_KG = SPEC.massKg
const CENTER_OF_MASS_HEIGHT_METERS = SPEC.centerOfMassHeightMeters
const WHEELBASE_METERS = SPEC.wheelbaseMeters
const TRACK_WIDTH_METERS = SPEC.frontTrackWidthMeters
const HALF_TRACK_METERS = TRACK_WIDTH_METERS / 2
const HALF_WHEELBASE_METERS = WHEELBASE_METERS / 2
const STATIC_NORMAL_FORCE_PER_WHEEL_NEWTONS =
  (MASS_KG * GRAVITY_METERS_PER_SECOND_SQUARED) / 4
const STATIC_COMPRESSION_METERS =
  SPEC.suspensionTravelMeters * SPEC.suspensionTargetStaticCompressionRatio01
// The suspension module derives the spring rate from the static load and the
// target static compression, so the analytic expectations below use the same
// rate the solver integrates.
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

function makeWheelState({ x, z, axle }) {
  return {
    isGrounded: true,
    axle,
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

function makeSymmetricWheelStates() {
  return [
    makeWheelState({
      x: -HALF_TRACK_METERS,
      z: HALF_WHEELBASE_METERS,
      axle: 'front',
    }),
    makeWheelState({
      x: HALF_TRACK_METERS,
      z: HALF_WHEELBASE_METERS,
      axle: 'front',
    }),
    makeWheelState({
      x: -HALF_TRACK_METERS,
      z: -HALF_WHEELBASE_METERS,
      axle: 'rear',
    }),
    makeWheelState({
      x: HALF_TRACK_METERS,
      z: -HALF_WHEELBASE_METERS,
      axle: 'rear',
    }),
  ]
}

function makeSpec() {
  return {
    verticalDynamicsEnabled: true,
    verticalDynamicsForcingEnabled: true,
    massKg: MASS_KG,
    wheelbaseMeters: WHEELBASE_METERS,
    frontTrackWidthMeters: TRACK_WIDTH_METERS,
    rearTrackWidthMeters: TRACK_WIDTH_METERS,
    centerOfMassHeightMeters: CENTER_OF_MASS_HEIGHT_METERS,
    suspensionTravelMeters: SPEC.suspensionTravelMeters,
    suspensionTargetStaticCompressionRatio01:
      SPEC.suspensionTargetStaticCompressionRatio01,
    suspensionDampingRatio: SPEC.suspensionDampingRatio,
  }
}

// Runs the vertical dynamics seam with a constant planar acceleration until
// the body attitude reaches its steady state.
function settleVerticalDynamics({
  wheelStates = makeSymmetricWheelStates(),
  lateralAccelerationMetersPerSecondSquared = 0,
  forwardAccelerationMetersPerSecondSquared = 0,
  steps = 60 * 20,
} = {}) {
  const spec = makeSpec()
  const state = createVerticalChassisDynamicsState(spec)
  for (let step = 0; step < steps; step += 1) {
    updateVerticalChassisDynamics(state, wheelStates, spec, DT_SECONDS, {
      planarAccelerationLocalLateralMetersPerSecondSquared:
        lateralAccelerationMetersPerSecondSquared,
      planarAccelerationLocalForwardMetersPerSecondSquared:
        forwardAccelerationMetersPerSecondSquared,
    })
  }
  return { state, wheelStates }
}

// The lateral load transfer of the classic formula: the difference between
// the outside and the inside wheel load, which is also the change of the
// total load carried by one side.
function lateralTransferNewtons(wheelStates) {
  const left = wheelStates.filter(
    (wheelState) => wheelState.localPosition.x < 0
  )
  const right = wheelStates.filter(
    (wheelState) => wheelState.localPosition.x > 0
  )
  const leftAverage =
    left.reduce((total, wheelState) => total + wheelState.normalForceNewtons, 0) /
    left.length
  const rightAverage =
    right.reduce((total, wheelState) => total + wheelState.normalForceNewtons, 0) /
    right.length
  return Math.abs(leftAverage - rightAverage)
}

// The longitudinal load transfer of the classic formula: the change of the
// front axle total load.
function longitudinalTransferNewtons(wheelStates) {
  const front = wheelStates
    .filter((wheelState) => wheelState.axle === 'front')
    .reduce((total, wheelState) => total + wheelState.normalForceNewtons, 0)
  const rear = wheelStates
    .filter((wheelState) => wheelState.axle === 'rear')
    .reduce((total, wheelState) => total + wheelState.normalForceNewtons, 0)
  return (front - rear) / 2
}

test('a sustained body roll transfers load by exactly k * u', () => {
  const rollRadians = 0.05
  const wheelStates = makeSymmetricWheelStates()
  const spec = makeSpec()
  const state = createVerticalChassisDynamicsState(spec)
  state.rollRadians = rollRadians
  state.rollRateRadiansPerSecond = 0
  updateVerticalChassisDynamics(state, wheelStates, spec, 0)

  const expectedDeviationNewtons =
    SPRING_RATE_NEWTONS_PER_METER * rollRadians * HALF_TRACK_METERS

  for (const wheelState of wheelStates) {
    const expectedSign = wheelState.localPosition.x < 0 ? 1 : -1
    const expectedNormalForceNewtons =
      STATIC_NORMAL_FORCE_PER_WHEEL_NEWTONS +
      expectedSign * expectedDeviationNewtons
    assert.ok(
      Math.abs(
        wheelState.verticalDynamicsLoadDeviationNewtons -
          expectedSign * expectedDeviationNewtons
      ) < 1e-6,
      `load deviation should be -k * u; got ${wheelState.verticalDynamicsLoadDeviationNewtons}`
    )
    assert.ok(
      Math.abs(wheelState.normalForceNewtons - expectedNormalForceNewtons) < 1e-6,
      `normal force should be base - k * u; got ${wheelState.normalForceNewtons}`
    )
  }

  assert.ok(
    Math.abs(
      lateralTransferNewtons(wheelStates) - 2 * expectedDeviationNewtons
    ) < 1e-6,
    'the rolled side must carry the full k * u transfer'
  )
})

test('steady-state lateral transfer matches m * a_lat * h_cg / track', () => {
  for (const lateralAccelerationMetersPerSecondSquared of [
    0.5 * GRAVITY_METERS_PER_SECOND_SQUARED,
    GRAVITY_METERS_PER_SECOND_SQUARED,
  ]) {
    const { state, wheelStates } = settleVerticalDynamics({
      lateralAccelerationMetersPerSecondSquared,
    })

    const expectedTransferNewtons =
      (MASS_KG *
        lateralAccelerationMetersPerSecondSquared *
        CENTER_OF_MASS_HEIGHT_METERS) /
      TRACK_WIDTH_METERS
    const measuredTransferNewtons = lateralTransferNewtons(wheelStates)
    assert.ok(
      Math.abs(measuredTransferNewtons - expectedTransferNewtons) < 1,
      `lateral transfer should be ${expectedTransferNewtons.toFixed(1)} N; got ${measuredTransferNewtons.toFixed(1)} N`
    )

    const expectedRollRadians =
      (MASS_KG *
        lateralAccelerationMetersPerSecondSquared *
        CENTER_OF_MASS_HEIGHT_METERS) /
      ROLL_STIFFNESS_NEWTON_METERS_PER_RADIAN
    assert.ok(
      Math.abs(state.rollRadians - expectedRollRadians) < 1e-4,
      `steady roll should be ${expectedRollRadians.toFixed(5)} rad; got ${state.rollRadians.toFixed(5)} rad`
    )
  }
})

test('steady-state longitudinal transfer matches m * a_fwd * h_cg / wheelbase', () => {
  const forwardAccelerationMetersPerSecondSquared =
    -0.5 * GRAVITY_METERS_PER_SECOND_SQUARED
  const { state, wheelStates } = settleVerticalDynamics({
    forwardAccelerationMetersPerSecondSquared,
  })

  const expectedTransferNewtons =
    (MASS_KG *
      Math.abs(forwardAccelerationMetersPerSecondSquared) *
      CENTER_OF_MASS_HEIGHT_METERS) /
    WHEELBASE_METERS
  const measuredTransferNewtons = longitudinalTransferNewtons(wheelStates)
  assert.ok(
    Math.abs(measuredTransferNewtons - expectedTransferNewtons) < 1,
    `longitudinal transfer should be ${expectedTransferNewtons.toFixed(1)} N; got ${measuredTransferNewtons.toFixed(1)} N`
  )

  const expectedPitchRadians =
    (MASS_KG *
      forwardAccelerationMetersPerSecondSquared *
      CENTER_OF_MASS_HEIGHT_METERS) /
    PITCH_STIFFNESS_NEWTON_METERS_PER_RADIAN
  assert.ok(
    Math.abs(state.pitchRadians - expectedPitchRadians) < 1e-4,
    `steady pitch should be ${expectedPitchRadians.toFixed(5)} rad; got ${state.pitchRadians.toFixed(5)} rad`
  )
})

test('the live cornering path tracks the classic lateral transfer', () => {
  const vehicle = createCar()
  const controller = createVehicleController({ vehicle })
  controller.getSnapshot().velocity.set(0, 0, 12)

  let measuredTransferNewtons = 0
  let expectedTransferNewtons = 0
  for (let step = 0; step < 120; step += 1) {
    const snapshot = controller.update(DT_SECONDS, {
      throttle: true,
      left: true,
    })
    if (step < 40) continue
    const lateralAccelerationMetersPerSecondSquared =
      snapshot.planarAccelerationLocalLateralMetersPerSecondSquared
    measuredTransferNewtons = lateralTransferNewtons(snapshot.wheelStates)
    expectedTransferNewtons =
      (MASS_KG *
        Math.abs(lateralAccelerationMetersPerSecondSquared) *
        CENTER_OF_MASS_HEIGHT_METERS) /
      TRACK_WIDTH_METERS
  }

  assert.ok(expectedTransferNewtons > 100, 'the corner must build lateral load')
  assert.ok(
    Math.abs(measuredTransferNewtons - expectedTransferNewtons) <
      expectedTransferNewtons * 0.1,
    `live lateral transfer ${measuredTransferNewtons.toFixed(1)} N should be within 10% of ${expectedTransferNewtons.toFixed(1)} N`
  )
})
