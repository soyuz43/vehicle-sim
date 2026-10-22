// test/vehicleApplyAtSpeedWarning.test.js

// The apply-at-speed warning.
//
// A chassis change drops the stored heave, pitch, and roll state, so the
// body re-levels over the frames after the apply. At speed that
// discontinuity is felt, so the apply reports it. The warning is
// information, not a gate: the apply always proceeds.
//
// The decision compares the pending chassis against the chassis the
// vehicle is actually running, not against the stock configuration.

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  APPLY_AT_SPEED_WARNING_THRESHOLD_METERS_PER_SECOND,
  describeVehicleApplyWarning,
} from '../src/vehicle/config/describeVehicleApplyWarning.js'
import { createDefaultVehicleConfiguration } from '../src/vehicle/config/createVehicleConfiguration.js'

const SPEED_120_KMH_METERS_PER_SECOND = 120 / 3.6

function configurationWith(slotOverrides = {}) {
  return {
    version: 1,
    slots: {
      ...createDefaultVehicleConfiguration().slots,
      ...slotOverrides,
    },
  }
}

test('a chassis change above the threshold is reported', () => {
  const warning = describeVehicleApplyWarning({
    pendingVehicleConfig: configurationWith({ chassis: 'chassis-suv' }),
    appliedVehicleConfig: createDefaultVehicleConfiguration(),
    speedMetersPerSecond: SPEED_120_KMH_METERS_PER_SECOND,
  })

  assert.ok(warning, 'the chassis change is reported')
  assert.match(warning, /km\/h/)
  assert.match(warning, /heave, pitch, and roll state was dropped/)
  assert.match(warning, /re-levels over the next few frames/)
})

test('a chassis change below the threshold is not reported', () => {
  const warning = describeVehicleApplyWarning({
    pendingVehicleConfig: configurationWith({ chassis: 'chassis-suv' }),
    appliedVehicleConfig: createDefaultVehicleConfiguration(),
    speedMetersPerSecond: 0,
  })

  assert.equal(warning, null, 'a standstill chassis change is not reported')
})

test('an unchanged chassis is not reported, even at speed', () => {
  const warning = describeVehicleApplyWarning({
    pendingVehicleConfig: configurationWith({ chassis: 'chassis-hatchback' }),
    appliedVehicleConfig: configurationWith({ chassis: 'chassis-hatchback' }),
    speedMetersPerSecond: SPEED_120_KMH_METERS_PER_SECOND,
  })

  assert.equal(
    warning,
    null,
    'applying the chassis the vehicle already has changes nothing'
  )
})

test('a non-chassis change is not reported, even at speed', () => {
  const warning = describeVehicleApplyWarning({
    pendingVehicleConfig: configurationWith({ aero: 'aero-slippery' }),
    appliedVehicleConfig: createDefaultVehicleConfiguration(),
    speedMetersPerSecond: SPEED_120_KMH_METERS_PER_SECOND,
  })

  assert.equal(
    warning,
    null,
    'an aero change drops no vertical dynamics state'
  )
})

test('the warning threshold is 30 km/h and never lower', () => {
  assert.equal(
    APPLY_AT_SPEED_WARNING_THRESHOLD_METERS_PER_SECOND,
    30 / 3.6
  )
  assert.ok(
    APPLY_AT_SPEED_WARNING_THRESHOLD_METERS_PER_SECOND >= 30 / 3.6,
    'the threshold is never below 30 km/h'
  )
})
