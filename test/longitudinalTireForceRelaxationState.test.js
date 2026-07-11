// test/longitudinalTireForceRelaxationState.test.js

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resetWheelLongitudinalTireForceRelaxationState,
  resetWheelLongitudinalTireForceStepState,
  updateWheelLongitudinalTireForceRelaxationState,
} from '../src/vehicle/dynamics/longitudinalTireForceRelaxationState.js'

const SPEC = Object.freeze({
  longitudinalTireForceRelaxationEnabled: true,
  longitudinalTireForceRelaxationLengthMeters: 0.35,
  minimumLongitudinalTireForceRelaxationSpeedMetersPerSecond: 1,
})

test('positive dt advances nonzero longitudinal tire force target into applied force', () => {
  const wheelState = createGroundedWheelState({
    targetLongitudinalTireForceNewtons: 500,
  })

  updateWheelLongitudinalTireForceRelaxationState(
    wheelState,
    SPEC,
    1 / 60
  )

  assert.ok(wheelState.longitudinalTireForceRelaxationAlpha > 0)
  assert.ok(wheelState.relaxedLongitudinalTireForceNewtons > 0)
  assert.equal(
    wheelState.appliedLongitudinalForceNewtons,
    wheelState.relaxedLongitudinalTireForceNewtons
  )
})

test('repeated steps retain and advance relaxation history', () => {
  const wheelState = createGroundedWheelState({
    targetLongitudinalTireForceNewtons: 500,
  })

  updateWheelLongitudinalTireForceRelaxationState(
    wheelState,
    SPEC,
    1 / 60
  )
  const firstRelaxedForceNewtons =
    wheelState.relaxedLongitudinalTireForceNewtons

  resetWheelLongitudinalTireForceStepState(wheelState, SPEC)
  wheelState.targetLongitudinalTireForceNewtons = 500
  updateWheelLongitudinalTireForceRelaxationState(
    wheelState,
    SPEC,
    1 / 60
  )

  assert.ok(
    wheelState.relaxedLongitudinalTireForceNewtons >
      firstRelaxedForceNewtons
  )
})

test('explicit relaxation reset clears accumulated history', () => {
  const wheelState = createGroundedWheelState({
    relaxedLongitudinalTireForceNewtons: 250,
    appliedLongitudinalForceNewtons: 250,
    targetLongitudinalTireForceNewtons: 500,
  })

  resetWheelLongitudinalTireForceRelaxationState(wheelState, SPEC)

  assert.equal(wheelState.relaxedLongitudinalTireForceNewtons, 0)
  assert.equal(wheelState.appliedLongitudinalForceNewtons, 0)
  assert.equal(wheelState.targetLongitudinalTireForceNewtons, 0)
})


test('zero target relaxes existing force toward zero without growing it', () => {
  const wheelState = createGroundedWheelState({
    relaxedLongitudinalTireForceNewtons: 250,
    appliedLongitudinalForceNewtons: 250,
    targetLongitudinalTireForceNewtons: 0,
  })

  updateWheelLongitudinalTireForceRelaxationState(
    wheelState,
    SPEC,
    1 / 60
  )

  assert.ok(wheelState.relaxedLongitudinalTireForceNewtons >= 0)
  assert.ok(wheelState.relaxedLongitudinalTireForceNewtons < 250)
  assert.equal(
    wheelState.appliedLongitudinalForceNewtons,
    wheelState.relaxedLongitudinalTireForceNewtons
  )
})

test('zero traction limit clamps relaxed and applied force to zero', () => {
  const wheelState = createGroundedWheelState({
    tractionLimitNewtons: 0,
    relaxedLongitudinalTireForceNewtons: 250,
    appliedLongitudinalForceNewtons: 250,
    targetLongitudinalTireForceNewtons: 500,
  })

  updateWheelLongitudinalTireForceRelaxationState(
    wheelState,
    SPEC,
    1 / 60
  )

  assert.equal(wheelState.relaxedLongitudinalTireForceNewtons, 0)
  assert.equal(wheelState.appliedLongitudinalForceNewtons, 0)
})

function createGroundedWheelState(overrides = {}) {
  return {
    tractionLimitNewtons: 1000,
    longitudinalGroundSpeedMetersPerSecond: 0,
    uncappedLongitudinalTireForceNewtons: 0,
    linearLongitudinalTireForceNewtons: 0,
    appliedLongitudinalForceNewtons: 0,
    targetLongitudinalTireForceNewtons: 0,
    relaxedLongitudinalTireForceNewtons: 0,
    longitudinalTireForceRelaxationAlpha: 0,
    longitudinalTireForceRelaxationLengthMeters:
      SPEC.longitudinalTireForceRelaxationLengthMeters,
    longitudinalTireForceSaturationRatio: 0,
    isLongitudinalTireForceSaturated: false,
    isLongitudinalTireForceRelaxing: false,
    ...overrides,
  }
}