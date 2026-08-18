// test/brakeAndStabilityControl.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateWheelLockState,
  updateWheelAdvancedAbsState,
  updateWheelTractionControlState,
  computeElectronicStabilityControl,
  WHEEL_LOCK_STATES,
} from '../src/vehicle/dynamics/brakeAndStabilityControlState.js'

function baseWheel(overrides = {}) {
  return {
    isGrounded: true,
    driven: false,
    axle: 'rear',
    side: 'left',
    angularVelocityRadiansPerSecond: 10,
    longitudinalGroundSpeedMetersPerSecond: 10,
    wheelSurfaceSpeedMetersPerSecond: 10,
    longitudinalSlipRatio: 0,
    totalBrakeTorqueNewtonMeters: 0,
    requestedDriveTorqueNewtonMeters: 0,
    isServiceBraking: false,
    isParkingBraking: false,
    ...overrides,
  }
}

test('lock detection: rolling wheel is not locked', () => {
  const w = baseWheel()
  evaluateWheelLockState(w, {})
  assert.equal(w.isWheelLocked, false)
  assert.equal(w.wheelLockState, WHEEL_LOCK_STATES.ROLLING)
})

test('lock detection: slow wheel while moving and braking is locked', () => {
  const w = baseWheel({
    angularVelocityRadiansPerSecond: 0.1,
    longitudinalGroundSpeedMetersPerSecond: 12,
    wheelSurfaceSpeedMetersPerSecond: 0.1,
    totalBrakeTorqueNewtonMeters: 600,
    isServiceBraking: true,
  })
  evaluateWheelLockState(w, {})
  assert.equal(w.isWheelLocked, true)
  assert.equal(w.wheelLockState, WHEEL_LOCK_STATES.LOCKED)
})

test('advanced ABS is inactive and passes torque through when disabled', () => {
  const w = baseWheel({ longitudinalSlipRatio: -0.4 })
  const out = updateWheelAdvancedAbsState(w, { advancedAbsEnabled: false }, 500, 1 / 60)
  assert.equal(out, 500)
  assert.equal(w.advancedAbsActive, false)
})

test('advanced ABS releases brake when slip exceeds the grip-peak target', () => {
  const w = baseWheel({ longitudinalSlipRatio: -0.35 })
  const out = updateWheelAdvancedAbsState(
    w,
    { advancedAbsEnabled: true, advancedAbsTargetSlipRatio: 0.12 },
    500,
    1 / 60
  )
  assert.ok(out < 500, `expected modulated < 500, got ${out}`)
  assert.ok(w.advancedAbsActive)
  assert.equal(w.advancedAbsState, 'releasing')
})

test('advanced ABS restores torque once slip recovers', () => {
  const w = baseWheel({ longitudinalSlipRatio: -0.35 })
  const spec = { advancedAbsEnabled: true, advancedAbsTargetSlipRatio: 0.12 }
  updateWheelAdvancedAbsState(w, spec, 500, 1 / 60) // release first
  const released = w.advancedAbsModulation01
  assert.ok(released < 1)
  // Now recovered: slip near zero -> reapply toward 1.
  w.longitudinalSlipRatio = 0
  const out = updateWheelAdvancedAbsState(w, spec, 500, 1 / 60)
  assert.ok(w.advancedAbsModulation01 > released)
  assert.ok(out > 500 * released)
})

test('traction control is inactive when disabled or non-driven', () => {
  const driven = baseWheel({ driven: true, longitudinalSlipRatio: 0.4 })
  const non = baseWheel({ driven: false, longitudinalSlipRatio: 0.4 })
  assert.equal(
    updateWheelTractionControlState(driven, { tractionControlEnabled: false }, 300, 1 / 60),
    300
  )
  assert.equal(
    updateWheelTractionControlState(non, { tractionControlEnabled: true }, 300, 1 / 60),
    300
  )
})

test('traction control reduces drive torque on a spinning driven wheel', () => {
  const w = baseWheel({ driven: true, longitudinalSlipRatio: 0.4 })
  const out = updateWheelTractionControlState(
    w,
    { tractionControlEnabled: true },
    300,
    1 / 60
  )
  assert.ok(out < 300, `expected reduced drive torque, got ${out}`)
  assert.ok(w.tractionControlActive)
})

test('ESC inactive when disabled', () => {
  const r = computeElectronicStabilityControl({
    wheelStates: [
      { axle: 'front', side: 'left' },
      { axle: 'front', side: 'right' },
      { axle: 'rear', side: 'left' },
      { axle: 'rear', side: 'right' },
    ],
    spec: { electronicStabilityControlEnabled: false },
    yawRateRadiansPerSecond: 0.6,
    targetYawRateRadiansPerSecond: 0.3,
  })
  assert.equal(r.active, false)
  assert.deepEqual(r.wheelBrakeTorqueDeltas, {})
})

test('ESC oversteer correction brakes the outer front wheel and cuts engine', () => {
  const wheels = [
    { axle: 'front', side: 'left' },
    { axle: 'front', side: 'right' },
    { axle: 'rear', side: 'left' },
    { axle: 'rear', side: 'right' },
  ]
  const r = computeElectronicStabilityControl({
    wheelStates: wheels,
    spec: { electronicStabilityControlEnabled: true },
    yawRateRadiansPerSecond: 0.6,
    targetYawRateRadiansPerSecond: 0.3, // left turn commanded
  })
  assert.equal(r.escState, 'oversteer_correction')
  assert.ok(r.wheelBrakeTorqueDeltas[1] > 0) // right-front (outer) wheel
  assert.ok(r.engineTorqueCut01 > 0)
})

test('ESC understeer correction brakes the inner rear wheel', () => {
  const wheels = [
    { axle: 'front', side: 'left' },
    { axle: 'front', side: 'right' },
    { axle: 'rear', side: 'left' },
    { axle: 'rear', side: 'right' },
  ]
  const r = computeElectronicStabilityControl({
    wheelStates: wheels,
    spec: { electronicStabilityControlEnabled: true },
    yawRateRadiansPerSecond: 0.1,
    targetYawRateRadiansPerSecond: 0.3, // left turn commanded, but car under-rotates
  })
  assert.equal(r.escState, 'understeer_correction')
  assert.ok(r.wheelBrakeTorqueDeltas[2] > 0) // left-rear (inner) wheel
})

test('ESC does nothing inside the yaw deadzone', () => {
  const r = computeElectronicStabilityControl({
    wheelStates: [
      { axle: 'front', side: 'left' },
      { axle: 'front', side: 'right' },
      { axle: 'rear', side: 'left' },
      { axle: 'rear', side: 'right' },
    ],
    spec: { electronicStabilityControlEnabled: true, escYawRateDeadzoneRadiansPerSecond: 0.05 },
    yawRateRadiansPerSecond: 0.31,
    targetYawRateRadiansPerSecond: 0.3,
  })
  assert.equal(r.active, false)
})
