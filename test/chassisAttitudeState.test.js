// test/chassisAttitudeState.test.js

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createChassisAttitudeState,
  computePerAxleRollFromWheelStates,
  estimateSupportPlaneFromWheelStates,
  resetChassisAttitudeState,
  updateChassisAttitudeState,
  updatePerAxleRollStateFromWheelStates,
} from '../src/vehicle/dynamics/chassisAttitudeState.js'

const BASE_WHEEL_Y_METERS = 0.48
const SPEC = Object.freeze({
  chassisAttitudeVisualBodyHeightMeters: 1.36,
  chassisAttitudeMaximumHeaveOffsetMeters: 0.18,
  chassisAttitudeMaximumPitchRadians: 0.12,
  chassisAttitudeMaximumRollRadians: 0.12,
  chassisAttitudeResponseSeconds: 0,
})

test('reset returns a neutral finite chassis attitude state', () => {
  const state = createChassisAttitudeState(SPEC)

  updateChassisAttitudeState(
    state,
    createWheelStates({ leftOffsetMeters: 0.08, frontOffsetMeters: 0.05 }),
    SPEC,
    1 / 60
  )
  resetChassisAttitudeState(state, SPEC)

  assert.equal(state.heaveOffsetMeters, 0)
  assert.equal(state.heaveVelocityMetersPerSecond, 0)
  assert.equal(state.pitchRadians, 0)
  assert.equal(state.pitchRateRadiansPerSecond, 0)
  assert.equal(state.rollRadians, 0)
  assert.equal(state.rollRateRadiansPerSecond, 0)
  assert.equal(state.visualBodyHeightMeters, SPEC.chassisAttitudeVisualBodyHeightMeters)
  assert.equal(state.supportPlaneModeLabel, 'neutral-reset')
  assert.equal(state.isFinite, true)
})

test('flat equal support produces near-zero pitch and roll', () => {
  const estimate = estimateSupportPlaneFromWheelStates(createWheelStates(), SPEC)

  assert.ok(Math.abs(estimate.heaveOffsetMeters) < 1e-12)
  assert.ok(Math.abs(estimate.pitchRadians) < 1e-12)
  assert.ok(Math.abs(estimate.rollRadians) < 1e-12)
  assert.equal(estimate.groundedSupportCount, 4)
  assert.equal(estimate.supportPlaneModeLabel, 'support-plane-estimate')
})

test('asymmetric left/right support produces finite roll with expected sign', () => {
  const estimate = estimateSupportPlaneFromWheelStates(
    createWheelStates({ leftOffsetMeters: 0.08 }),
    SPEC
  )

  assert.ok(Number.isFinite(estimate.rollRadians))
  assert.ok(estimate.rollRadians < 0)
  assert.ok(Math.abs(estimate.pitchRadians) < 1e-12)
})

test('asymmetric front/rear support produces finite pitch with expected sign', () => {
  const estimate = estimateSupportPlaneFromWheelStates(
    createWheelStates({ frontOffsetMeters: 0.08 }),
    SPEC
  )

  assert.ok(Number.isFinite(estimate.pitchRadians))
  assert.ok(estimate.pitchRadians < 0)
  assert.ok(Math.abs(estimate.rollRadians) < 1e-12)
})

test('missing, airborne, and invalid wheel data remain finite and conservative', () => {
  const state = createChassisAttitudeState(SPEC)
  const invalidWheelStates = [
    createWheelState('front-left', -1.25, 1.45, 0, { isGrounded: false }),
    { id: 'bad-local', isGrounded: true, localPosition: { x: NaN, y: 0, z: 0 } },
    { id: 'bad-center', isGrounded: true, localPosition: { x: 0, y: 0, z: 0 }, wheelCenterLocalPosition: { x: 0, y: Infinity, z: 0 } },
    null,
  ]

  updateChassisAttitudeState(state, invalidWheelStates, SPEC, 1 / 60)

  assert.equal(state.heaveOffsetMeters, 0)
  assert.equal(state.pitchRadians, 0)
  assert.equal(state.rollRadians, 0)
  assert.equal(state.groundedSupportCount, 0)
  assert.equal(state.supportPlaneModeLabel, 'no-grounded-support')
  assert.equal(state.isFinite, true)
})

test('pitch, roll, and heave clamps prevent extreme attitude output', () => {
  const clampedSpec = {
    ...SPEC,
    chassisAttitudeMaximumHeaveOffsetMeters: 0.05,
    chassisAttitudeMaximumPitchRadians: 0.04,
    chassisAttitudeMaximumRollRadians: 0.03,
  }
  const estimate = estimateSupportPlaneFromWheelStates(
    createWheelStates({ leftOffsetMeters: 10, frontOffsetMeters: 10 }),
    clampedSpec
  )

  assert.ok(Math.abs(estimate.heaveOffsetMeters) <= 0.05)
  assert.ok(Math.abs(estimate.pitchRadians) <= 0.04)
  assert.ok(Math.abs(estimate.rollRadians) <= 0.03)
  assert.ok(Number.isFinite(estimate.heaveOffsetMeters))
  assert.ok(Number.isFinite(estimate.pitchRadians))
  assert.ok(Number.isFinite(estimate.rollRadians))
})

test('symmetric compression heaves the body upward (positive offset)', () => {
  const estimate = estimateSupportPlaneFromWheelStates(
    createWheelStates({ uniformOffsetMeters: 0.08 }),
    SPEC
  )

  assert.ok(estimate.heaveOffsetMeters > 0)
  assert.ok(Math.abs(estimate.pitchRadians) < 1e-12)
  assert.ok(Math.abs(estimate.rollRadians) < 1e-12)
})

test('symmetric rebound drops the body downward (negative offset)', () => {
  const estimate = estimateSupportPlaneFromWheelStates(
    createWheelStates({ uniformOffsetMeters: -0.08 }),
    SPEC
  )

  assert.ok(estimate.heaveOffsetMeters < 0)
  assert.ok(Math.abs(estimate.pitchRadians) < 1e-12)
  assert.ok(Math.abs(estimate.rollRadians) < 1e-12)
})

test('front load yields negative pitch and rear load yields positive pitch', () => {
  const frontEstimate = estimateSupportPlaneFromWheelStates(
    createWheelStates({ frontOffsetMeters: 0.08 }),
    SPEC
  )
  const rearEstimate = estimateSupportPlaneFromWheelStates(
    createWheelStates({ rearOffsetMeters: 0.08 }),
    SPEC
  )

  // The visual layer consumes these signs directly via
  // chassisVisualRoot.rotation.set(pitchRadians, 0, rollRadians) in
  // src/car/createCar.js. These assertions lock the EXISTING sign
  // convention (front-loaded support -> negative pitch, rear-loaded support
  // -> positive pitch) so a future sign flip is caught by the suite. This is
  // a regression lock of the published convention, not a claim about the
  // physical rotation direction the visual layer applies.
  assert.ok(frontEstimate.pitchRadians < 0)
  assert.ok(rearEstimate.pitchRadians > 0)
  assert.ok(Math.abs(frontEstimate.rollRadians) < 1e-12)
  assert.ok(Math.abs(rearEstimate.rollRadians) < 1e-12)
})

test('multi-step update approaches the target exponentially without overshoot', () => {
  const RESPONSE_SPEC = { ...SPEC, chassisAttitudeResponseSeconds: 0.08 }
  const state = createChassisAttitudeState(RESPONSE_SPEC)
  const wheelStates = createWheelStates({ uniformOffsetMeters: 0.08 })
  const targetHeaveOffsetMeters = 0.08

  let previousHeaveOffsetMeters = state.heaveOffsetMeters

  for (let step = 0; step < 10; step += 1) {
    updateChassisAttitudeState(state, wheelStates, RESPONSE_SPEC, 1 / 60)

    assert.ok(Number.isFinite(state.heaveOffsetMeters))
    assert.ok(state.heaveOffsetMeters > previousHeaveOffsetMeters)
    assert.ok(state.heaveOffsetMeters <= targetHeaveOffsetMeters + 1e-12)
    assert.equal(state.isFinite, true)
    previousHeaveOffsetMeters = state.heaveOffsetMeters
  }

  assert.ok(state.heaveOffsetMeters > 0)
  assert.ok(state.heaveOffsetMeters < targetHeaveOffsetMeters)
})

test('per-axle roll uses the matching axle track width', () => {
  const wheelStates = [
    createWheelState('front-left', NaN, 1.45, 0, { side: 'left' }),
    createWheelState('front-right', NaN, 1.45, 0, { side: 'right' }),
    createWheelState('rear-left', -1, -1.45, 0),
    createWheelState('rear-right', 1, -1.45, 0.2),
  ]
  const roll = computePerAxleRollFromWheelStates(wheelStates, 0.12)

  assert.equal(roll.frontRollRadians, 0)
  assert.ok(Math.abs(roll.rearRollRadians - Math.atan2(0.2, 2)) < 1e-12)
})

test('vertical-dynamics per-axle roll smooths and honors the live roll clamp', () => {
  const responseSpec = {
    ...SPEC,
    chassisAttitudeResponseSeconds: 0.08,
    chassisAttitudeMaximumRollRadians: 0.03,
  }
  const state = createChassisAttitudeState(responseSpec)
  const wheelStates = createWheelStates({ leftOffsetMeters: 10 })

  updatePerAxleRollStateFromWheelStates(
    state,
    wheelStates,
    responseSpec,
    0
  )
  assert.equal(state.frontRollRadians, 0)

  updatePerAxleRollStateFromWheelStates(
    state,
    wheelStates,
    responseSpec,
    1 / 60
  )
  assert.ok(
    state.frontRollRadians < 0,
    `expected negative roll, got ${state.frontRollRadians}`
  )
  assert.ok(state.frontRollRadians > -0.03)

  for (let index = 0; index < 120; index += 1) {
    updatePerAxleRollStateFromWheelStates(
      state,
      wheelStates,
      responseSpec,
      1 / 60
    )
  }
  assert.ok(Math.abs(state.frontRollRadians + 0.03) < 1e-9)
})

function createWheelStates({
  leftOffsetMeters = 0,
  frontOffsetMeters = 0,
  rearOffsetMeters = 0,
  uniformOffsetMeters = 0,
} = {}) {
  return [
    createWheelState(
      'front-left',
      -1.25,
      1.45,
      uniformOffsetMeters + leftOffsetMeters + frontOffsetMeters
    ),
    createWheelState(
      'front-right',
      1.25,
      1.45,
      uniformOffsetMeters + frontOffsetMeters
    ),
    createWheelState(
      'rear-left',
      -1.25,
      -1.45,
      uniformOffsetMeters + leftOffsetMeters + rearOffsetMeters
    ),
    createWheelState(
      'rear-right',
      1.25,
      -1.45,
      uniformOffsetMeters + rearOffsetMeters
    ),
  ]
}

function createWheelState(
  id,
  xMeters,
  zMeters,
  supportOffsetMeters,
  options = {}
) {
  return {
    id,
    axle: id.startsWith('front') ? 'front' : 'rear',
    side: options.side ?? (xMeters < 0 ? 'left' : xMeters > 0 ? 'right' : null),
    isGrounded: options.isGrounded ?? true,
    localPosition: {
      x: xMeters,
      y: BASE_WHEEL_Y_METERS,
      z: zMeters,
    },
    wheelCenterLocalPosition: {
      x: xMeters,
      y: BASE_WHEEL_Y_METERS + supportOffsetMeters,
      z: zMeters,
    },
  }
}
