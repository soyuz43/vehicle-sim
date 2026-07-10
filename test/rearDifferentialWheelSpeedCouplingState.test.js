// test/rearDifferentialWheelSpeedCouplingState.test.js

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createRearDifferentialState,
  resetRearDifferentialState,
  resetRearDifferentialStepState,
  setRearDifferentialType,
  updateRearDifferentialDriveForceSplit,
  updateRearDifferentialWheelSpeedCoupling,
} from '../src/vehicle/dynamics/rearDifferentialState.js'

const SPEC = Object.freeze({
  rearDifferentialType: 'open',
  rearDifferentialAvailableTypes: [
    'open',
    'limited-slip',
    'torsen',
    'locked',
    'welded',
  ],
  limitedSlipDifferentialLockFactor01: 0.35,
  limitedSlipDifferentialPreloadTorqueNewtonMeters: 80,
  limitedSlipDifferentialCouplingGainNewtonMetersPerRadianPerSecond: 600,
  limitedSlipDifferentialMaxCouplingTorqueNewtonMeters: 1800,
  torsenDifferentialTorqueBiasRatio: 3,
  lockedDifferentialLockFactor01: 1,
  differentialSlipSpeedEpsilonRadiansPerSecond: 0.5,
  rearDifferentialHardCouplingEpsilonRadiansPerSecond: 0.001,
})

const STEP_DT_SECONDS = 1 / 60
const MOMENTUM_TOLERANCE = 1e-9

test('open differential applies zero direct coupling and leaves unequal speeds unequal', () => {
  const state = createRearDifferentialState(SPEC)
  setRearDifferentialType(state, SPEC, 'open')
  const wheelStates = [
    createRearWheelState('left', 12, 1.2),
    createRearWheelState('right', 3, 1.2),
  ]

  updateRearDifferentialWheelSpeedCoupling(state, wheelStates, STEP_DT_SECONDS, SPEC)

  assert.equal(state.rearDifferentialCouplingState, 'uncoupled')
  assert.equal(state.rearDifferentialLeftCouplingTorqueNewtonMeters, 0)
  assert.equal(state.rearDifferentialRightCouplingTorqueNewtonMeters, 0)
  assert.equal(wheelStates[0].angularVelocityRadiansPerSecond, 12)
  assert.equal(wheelStates[1].angularVelocityRadiansPerSecond, 3)
  assert.ok(state.rearDifferentialWheelSpeedDifferenceAbsRadiansPerSecond > 0)
})

test('torsen keeps torque bias behavior without imposing wheel-speed equality', () => {
  const state = createRearDifferentialState(SPEC)
  setRearDifferentialType(state, SPEC, 'torsen')
  const wheelStates = [
    createRearWheelState('left', 8, 1.2, {
      tractionLimitNewtons: 4200,
      longitudinalSlipRatioAbs: 0.02,
    }),
    createRearWheelState('right', 2, 1.2, {
      tractionLimitNewtons: 900,
      longitudinalSlipRatioAbs: 0.25,
    }),
  ]

  updateRearDifferentialDriveForceSplit(state, wheelStates, 1200, SPEC)
  assert.ok(state.rearDifferentialLeftShare01 > 0.5)
  assert.ok(state.rearDifferentialRightShare01 < 0.5)
  assert.equal(state.rearDifferentialTorqueBiasRatio, SPEC.torsenDifferentialTorqueBiasRatio)

  updateRearDifferentialWheelSpeedCoupling(state, wheelStates, STEP_DT_SECONDS, SPEC)

  assert.equal(state.rearDifferentialCouplingState, 'torque-bias-only')
  assert.equal(state.rearDifferentialLeftCouplingTorqueNewtonMeters, 0)
  assert.equal(state.rearDifferentialRightCouplingTorqueNewtonMeters, 0)
  assert.equal(wheelStates[0].angularVelocityRadiansPerSecond, 8)
  assert.equal(wheelStates[1].angularVelocityRadiansPerSecond, 2)
  assert.equal(state.isRearDifferentialHardSpeedCouplingApplied, false)
})

test('limited-slip coupling is equal and opposite, bounded, momentum-preserving, and reduces speed difference without overshoot', () => {
  const state = createRearDifferentialState(SPEC)
  setRearDifferentialType(state, SPEC, 'limited-slip')
  const wheelStates = [
    createRearWheelState('left', 20, 1.5),
    createRearWheelState('right', 4, 0.9),
  ]
  const initialMomentum = calculateAngularMomentum(wheelStates)
  const initialSignedDifference =
    wheelStates[0].angularVelocityRadiansPerSecond -
    wheelStates[1].angularVelocityRadiansPerSecond
  let previousDifferenceAbs = Math.abs(initialSignedDifference)

  for (let index = 0; index < 6; index += 1) {
    updateRearDifferentialWheelSpeedCoupling(state, wheelStates, STEP_DT_SECONDS, SPEC)

    const currentSignedDifference =
      wheelStates[0].angularVelocityRadiansPerSecond -
      wheelStates[1].angularVelocityRadiansPerSecond
    const currentDifferenceAbs = Math.abs(currentSignedDifference)
    const maximumExpectedCouplingTorqueNewtonMeters =
      SPEC.limitedSlipDifferentialMaxCouplingTorqueNewtonMeters *
      SPEC.limitedSlipDifferentialLockFactor01

    assert.ok(currentDifferenceAbs <= previousDifferenceAbs + 1e-9)
    assert.ok(currentSignedDifference * initialSignedDifference >= -1e-9)
    assert.ok(
      Math.abs(state.rearDifferentialLeftCouplingTorqueNewtonMeters) <=
        maximumExpectedCouplingTorqueNewtonMeters + 1e-9
    )
    assert.ok(
      Math.abs(
        state.rearDifferentialLeftCouplingTorqueNewtonMeters +
          state.rearDifferentialRightCouplingTorqueNewtonMeters
      ) < 1e-9
    )

    previousDifferenceAbs = currentDifferenceAbs
  }

  const finalMomentum = calculateAngularMomentum(wheelStates)

  assert.ok(previousDifferenceAbs < Math.abs(initialSignedDifference))
  assert.ok(
    Math.abs(finalMomentum - initialMomentum) <= MOMENTUM_TOLERANCE,
    `expected momentum preservation, got ${initialMomentum} -> ${finalMomentum}`
  )
  assert.ok(state.rearDifferentialLimitedSlipCouplingFraction01 > 0)
})

test('limited-slip coupling remains finite with zero dt and invalid inputs', () => {
  const state = createRearDifferentialState(SPEC)
  setRearDifferentialType(state, SPEC, 'limited-slip')
  const zeroDtWheelStates = [
    createRearWheelState('left', 5, 1.2),
    createRearWheelState('right', 0, 1.2),
  ]

  updateRearDifferentialWheelSpeedCoupling(state, zeroDtWheelStates, 0, SPEC)

  assert.equal(state.rearDifferentialCouplingState, 'dt-zero')
  assert.ok(Number.isFinite(state.rearDifferentialWheelSpeedDifferenceRadiansPerSecond))
  assert.equal(state.rearDifferentialLeftCouplingTorqueNewtonMeters, 0)
  assert.equal(state.rearDifferentialRightCouplingTorqueNewtonMeters, 0)

  const invalidInertiaWheelStates = [
    createRearWheelState('left', 5, 0),
    createRearWheelState('right', -2, 1.2),
  ]

  updateRearDifferentialWheelSpeedCoupling(state, invalidInertiaWheelStates, STEP_DT_SECONDS, SPEC)

  assert.equal(state.rearDifferentialCouplingState, 'invalid-inertia')
  assert.ok(Number.isFinite(state.rearDifferentialLeftCouplingTorqueNewtonMeters))
  assert.ok(Number.isFinite(state.rearDifferentialRightCouplingTorqueNewtonMeters))
})

test('locked differential matches rear wheel speeds and preserves combined angular momentum', () => {
  const state = createRearDifferentialState(SPEC)
  setRearDifferentialType(state, SPEC, 'locked')
  const wheelStates = [
    createRearWheelState('left', 7, 1.2),
    createRearWheelState('right', -1, 2.4),
  ]
  const initialMomentum = calculateAngularMomentum(wheelStates)
  const expectedCommonAngularVelocityRadiansPerSecond =
    initialMomentum /
    (wheelStates[0].wheelInertiaKgMeterSquared + wheelStates[1].wheelInertiaKgMeterSquared)

  updateRearDifferentialWheelSpeedCoupling(state, wheelStates, STEP_DT_SECONDS, SPEC)

  assert.ok(
    Math.abs(
      wheelStates[0].angularVelocityRadiansPerSecond -
        wheelStates[1].angularVelocityRadiansPerSecond
    ) <= SPEC.rearDifferentialHardCouplingEpsilonRadiansPerSecond
  )
  assert.ok(
    Math.abs(calculateAngularMomentum(wheelStates) - initialMomentum) <=
      MOMENTUM_TOLERANCE
  )
  assert.equal(state.rearDifferentialCouplingState, 'constrained')
  assert.equal(state.isRearDifferentialHardSpeedCouplingApplied, true)
  assert.ok(
    Math.abs(
      state.rearDifferentialCommonAngularVelocityRadiansPerSecond -
        expectedCommonAngularVelocityRadiansPerSecond
    ) <= 1e-9
  )
  assert.ok(
    Math.abs(
      state.rearDifferentialLeftCouplingAngularImpulseNewtonMeterSeconds +
        state.rearDifferentialRightCouplingAngularImpulseNewtonMeterSeconds
    ) <= 1e-9
  )
})

test('welded differential uses the same hard coupling mechanics while remaining separately identified', () => {
  const lockedState = createRearDifferentialState(SPEC)
  setRearDifferentialType(lockedState, SPEC, 'locked')
  const weldedState = createRearDifferentialState(SPEC)
  setRearDifferentialType(weldedState, SPEC, 'welded')
  const lockedWheelStates = [
    createRearWheelState('left', 5, 1.2),
    createRearWheelState('right', -3, 1.2),
  ]
  const weldedWheelStates = [
    createRearWheelState('left', 5, 1.2),
    createRearWheelState('right', -3, 1.2),
  ]

  updateRearDifferentialWheelSpeedCoupling(
    lockedState,
    lockedWheelStates,
    STEP_DT_SECONDS,
    SPEC
  )
  updateRearDifferentialWheelSpeedCoupling(
    weldedState,
    weldedWheelStates,
    STEP_DT_SECONDS,
    SPEC
  )

  assert.equal(weldedState.rearDifferentialType, 'welded')
  assert.equal(weldedState.rearDifferentialModeLabel, 'Welded')
  assert.equal(weldedState.rearDifferentialCouplingState, 'constrained')
  assert.equal(weldedState.isRearDifferentialHardSpeedCouplingApplied, true)
  assert.ok(
    Math.abs(
      lockedState.rearDifferentialCommonAngularVelocityRadiansPerSecond -
        weldedState.rearDifferentialCommonAngularVelocityRadiansPerSecond
    ) <= 1e-9
  )
  assert.ok(
    Math.abs(
      lockedWheelStates[0].angularVelocityRadiansPerSecond -
        weldedWheelStates[0].angularVelocityRadiansPerSecond
    ) <= 1e-9
  )
  assert.ok(
    Math.abs(
      lockedWheelStates[1].angularVelocityRadiansPerSecond -
        weldedWheelStates[1].angularVelocityRadiansPerSecond
    ) <= 1e-9
  )
})

test('step reset preserves selected mode while full reset clears transient coupling telemetry', () => {
  const state = createRearDifferentialState(SPEC)
  setRearDifferentialType(state, SPEC, 'locked')
  const wheelStates = [
    createRearWheelState('left', 9, 1.2),
    createRearWheelState('right', 1, 1.2),
  ]

  updateRearDifferentialWheelSpeedCoupling(state, wheelStates, STEP_DT_SECONDS, SPEC)
  assert.equal(state.isRearDifferentialHardSpeedCouplingApplied, true)
  assert.ok(Math.abs(state.rearDifferentialLeftCouplingTorqueNewtonMeters) > 0)
  assert.doesNotThrow(() => JSON.stringify(state))

  resetRearDifferentialStepState(state, SPEC)

  assert.equal(state.rearDifferentialType, 'locked')
  assert.equal(state.rearDifferentialLeftCouplingTorqueNewtonMeters, 0)
  assert.equal(state.rearDifferentialRightCouplingTorqueNewtonMeters, 0)
  assert.equal(state.isRearDifferentialHardSpeedCouplingApplied, false)

  resetRearDifferentialState(state, SPEC)

  assert.equal(state.rearDifferentialType, 'locked')
  assert.equal(state.rearDifferentialCouplingState, 'idle')
  assert.equal(state.rearDifferentialWheelSpeedDifferenceAbsRadiansPerSecond, 0)
})

function createRearWheelState(
  side,
  angularVelocityRadiansPerSecond,
  wheelInertiaKgMeterSquared,
  overrides = {}
) {
  return {
    side,
    axle: 'rear',
    driven: true,
    angularVelocityRadiansPerSecond,
    angularAccelerationRadiansPerSecondSquared: 0,
    wheelInertiaKgMeterSquared,
    effectiveTireRollingRadiusMeters: 0.48,
    radius: 0.48,
    rollingSurfaceSpeedMetersPerSecond: angularVelocityRadiansPerSecond * 0.48,
    spinAngleRadians: 0,
    netTorqueNewtonMeters: 0,
    differentialCouplingTorqueNewtonMeters: 0,
    differentialCouplingAngularImpulseNewtonMeterSeconds: 0,
    isGrounded: true,
    tractionLimitNewtons: 2000,
    longitudinalSlipRatioAbs: 0,
    ...overrides,
  }
}

function calculateAngularMomentum(wheelStates) {
  return wheelStates.reduce(
    (total, wheelState) =>
      total +
      wheelState.wheelInertiaKgMeterSquared *
        wheelState.angularVelocityRadiansPerSecond,
    0
  )
}