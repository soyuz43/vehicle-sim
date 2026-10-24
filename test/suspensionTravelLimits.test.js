// test/suspensionTravelLimits.test.js

import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveSuspensionTravelLimits } from '../src/vehicle/dynamics/suspensionTravelLimits.js'
import { updateSuspensionNormalForceState } from '../src/vehicle/dynamics/suspensionNormalForceState.js'

const EXPECTED_DEFAULT_LIMITS = {
  restLengthMeters: 0.35,
  minimumLengthMeters: 0.13,
  maximumLengthMeters: 0.35,
  travelMeters: 0.22,
  maximumCompressionMeters: 0.22,
  maximumDroopMeters: 0,
}

test('default hard travel limits preserve the existing suspension range', () => {
  const limits = resolveSuspensionTravelLimits()
  for (const key of Object.keys(EXPECTED_DEFAULT_LIMITS)) {
    assert.ok(
      Math.abs(limits[key] - EXPECTED_DEFAULT_LIMITS[key]) < 1e-12,
      key + ' should preserve its existing value'
    )
  }
})

test('maximum compression and droop resolve from suspension rest length', () => {
  const limits = resolveSuspensionTravelLimits({
    suspensionRestLengthMeters: 0.4,
    suspensionMaximumCompressionMeters: 0.15,
    suspensionMaximumDroopMeters: 0.3,
  })

  assert.deepEqual(limits, {
    restLengthMeters: 0.4,
    minimumLengthMeters: 0.25,
    maximumLengthMeters: 0.7,
    travelMeters: 0.44999999999999996,
    maximumCompressionMeters: 0.15000000000000002,
    maximumDroopMeters: 0.29999999999999993,
  })
})

test('extreme and non-finite limit inputs resolve to bounded finite lengths', () => {
  const limits = resolveSuspensionTravelLimits({
    suspensionRestLengthMeters: Number.MAX_VALUE,
    suspensionMaximumCompressionMeters: Number.MAX_VALUE,
    suspensionMaximumDroopMeters: Number.MAX_VALUE,
    suspensionTravelMeters: Number.POSITIVE_INFINITY,
  })

  for (const value of Object.values(limits)) {
    assert.ok(Number.isFinite(value))
  }
  assert.ok(limits.minimumLengthMeters > 0)
  assert.ok(limits.maximumLengthMeters <= 10)
  assert.ok(limits.minimumLengthMeters < limits.maximumLengthMeters)
})

test('wheel suspension state clamps extreme compression and exposes both stops', () => {
  const wheelStates = [{
    axle: 'front',
    isGrounded: true,
    frictionCoefficient: 1,
    suspensionCurrentLengthMeters: 0,
    previousSuspensionCompressionMeters: 0,
    hasSuspensionCompressionSample: false,
  }]
  const spec = {
    massKg: 1000,
    suspensionRestLengthMeters: 0.4,
    suspensionMaximumCompressionMeters: 0.15,
    suspensionMaximumDroopMeters: 0.3,
  }

  updateSuspensionNormalForceState(wheelStates, spec, 1 / 60)

  const [wheelState] = wheelStates
  assert.equal(wheelState.suspensionCurrentLengthMeters, 0.25)
  assert.equal(wheelState.suspensionMaximumCompressionMeters, 0.15000000000000002)
  assert.equal(wheelState.suspensionMaximumDroopMeters, 0.29999999999999993)
  assert.equal(wheelState.isSuspensionAtCompressionLimit, true)
  assert.ok(Number.isFinite(wheelState.springForceNewtons))
  assert.ok(Number.isFinite(wheelState.normalForceNewtons))
})
