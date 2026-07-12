// test/chassisAttitudeState.test.js

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createChassisAttitudeState,
  estimateSupportPlaneFromWheelStates,
  resetChassisAttitudeState,
  updateChassisAttitudeState,
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

function createWheelStates({ leftOffsetMeters = 0, frontOffsetMeters = 0 } = {}) {
  return [
    createWheelState(
      'front-left',
      -1.25,
      1.45,
      leftOffsetMeters + frontOffsetMeters
    ),
    createWheelState('front-right', 1.25, 1.45, frontOffsetMeters),
    createWheelState('rear-left', -1.25, -1.45, leftOffsetMeters),
    createWheelState('rear-right', 1.25, -1.45, 0),
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
