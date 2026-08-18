// test/combinedSlipTireForce.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  updateWheelCombinedSlipTireForce,
  updateCombinedSlipTireForces,
} from '../src/vehicle/dynamics/combinedSlipTireForceState.js'

function makeWheel(opts = {}) {
  const frictionCoefficient = opts.mu ?? 1
  const normalForceNewtons = opts.fz ?? 3433
  return {
    isGrounded: true,
    longitudinalSlipRatio: opts.kappa ?? 0,
    lateralSlipAngleRadians: opts.alpha ?? 0,
    frictionCoefficient,
    normalForceNewtons,
    tractionLimitNewtons: frictionCoefficient * normalForceNewtons,
    pressureAdjustedLongitudinalTireStiffnessNewtonsPerSlipRatio: opts.cx ?? 1600,
    pressureAdjustedLateralTireStiffnessNewtonsPerRadian: opts.cy ?? 6000,
    appliedLongitudinalForceNewtons: 0,
    appliedLateralTireForceNewtons: 0,
    uncappedLongitudinalTireForceNewtons: 0,
    uncappedLateralTireForceNewtons: 0,
    combinedTireForceMagnitudeNewtons: 0,
    combinedTireForceLimitNewtons: 0,
    combinedTireForceScale01: 1,
    combinedTireForceSaturationRatio: 0,
    longitudinalTireForceSaturationRatio: 0,
    lateralTireForceSaturationRatio: 0,
    isLongitudinalTireForceSaturated: false,
    isLateralTireForceSaturated: false,
    isCombinedTireForceSaturated: false,
    isSlipping: false,
  }
}

test('small slip is linear in both axes', () => {
  const wheel = makeWheel({ kappa: 0.02, alpha: 0.02 })
  updateWheelCombinedSlipTireForce(wheel)
  assert.ok(Math.abs(wheel.appliedLongitudinalForceNewtons - 1600 * 0.02) < 1e-6)
  assert.ok(
    Math.abs(wheel.appliedLateralTireForceNewtons + 6000 * Math.tan(0.02)) < 1e-6
  )
  assert.ok(!wheel.isCombinedTireForceSaturated)
})

test('longitudinal force peaks at mu*Fz then falls off', () => {
  const muFz = 3433
  const peak = makeWheel({ kappa: 2.0 })
  updateWheelCombinedSlipTireForce(peak)
  const highSlip = makeWheel({ kappa: 8 })
  updateWheelCombinedSlipTireForce(highSlip)
  // Peak region value is at or below the friction limit.
  assert.ok(Math.abs(peak.appliedLongitudinalForceNewtons) <= muFz + 1e-3)
  // Well past the peak the force has fallen off below the peak value.
  assert.ok(
    Math.abs(highSlip.appliedLongitudinalForceNewtons) <
      Math.abs(peak.appliedLongitudinalForceNewtons)
  )
  assert.ok(Math.abs(highSlip.appliedLongitudinalForceNewtons) < muFz)
  assert.ok(Math.abs(highSlip.appliedLongitudinalForceNewtons) > 0)
})

test('combined slip respects the friction circle (|F| <= mu*Fz)', () => {
  const muFz = 3433
  const wheel = makeWheel({ kappa: 2.0, alpha: 0.3 })
  updateWheelCombinedSlipTireForce(wheel)
  assert.ok(wheel.isCombinedTireForceSaturated)
  assert.ok(
    wheel.combinedTireForceMagnitudeNewtons <= muFz + 1e-6,
    `combined magnitude ${wheel.combinedTireForceMagnitudeNewtons} exceeded mu*Fz`
  )
})

test('sign conventions: drive slip forward, positive slip angle loads left', () => {
  const drive = makeWheel({ kappa: 0.5 })
  updateWheelCombinedSlipTireForce(drive)
  assert.ok(drive.appliedLongitudinalForceNewtons > 0)
  const corner = makeWheel({ alpha: 0.3 })
  updateWheelCombinedSlipTireForce(corner)
  assert.ok(corner.appliedLateralTireForceNewtons < 0)
})

test('combined force direction follows the elastic slip direction', () => {
  const wheel = makeWheel({ kappa: 2.0, alpha: 0.3 })
  updateWheelCombinedSlipTireForce(wheel)
  const elasticLong = 1600 * 2.0
  const elasticLat = -6000 * Math.tan(0.3)
  const expectedRatio = elasticLong / elasticLat
  const actualRatio =
    wheel.appliedLongitudinalForceNewtons / wheel.appliedLateralTireForceNewtons
  assert.ok(Math.abs(actualRatio - expectedRatio) < 1e-6)
})

test('airborne wheel produces no tire force', () => {
  const wheel = makeWheel({ kappa: 1, alpha: 0.2 })
  wheel.isGrounded = false
  updateWheelCombinedSlipTireForce(wheel)
  assert.equal(wheel.appliedLongitudinalForceNewtons, 0)
  assert.equal(wheel.appliedLateralTireForceNewtons, 0)
})

test('batch update applies to every wheel', () => {
  const wheels = [makeWheel({ kappa: 0.5 }), makeWheel({ alpha: 0.2 })]
  updateCombinedSlipTireForces(wheels)
  assert.ok(wheels[0].appliedLongitudinalForceNewtons > 0)
  assert.ok(wheels[1].appliedLateralTireForceNewtons < 0)
})
