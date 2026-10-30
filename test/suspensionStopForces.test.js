// test/suspensionStopForces.test.js

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computeProgressiveSuspensionStopForceNewtons,
  computeProgressiveSuspensionStopRateNewtonsPerMeter,
} from '../src/vehicle/dynamics/suspensionStopForces.js'
import { updateSuspensionNormalForceState } from '../src/vehicle/dynamics/suspensionNormalForceState.js'
import {
  createVerticalChassisDynamicsState,
  updateVerticalChassisDynamics,
} from '../src/vehicle/dynamics/verticalChassisDynamicsState.js'

const BASE_SUSPENSION_SPEC = {
  massKg: 1000,
  suspensionRestLengthMeters: 0.4,
  suspensionMinimumLengthMeters: 0.2,
  suspensionMaximumLengthMeters: 0.5,
  suspensionTravelMeters: 0.3,
  suspensionSpringRateNewtonsPerMeter: 1000,
  suspensionTargetStaticCompressionRatio01: 0.2,
  suspensionCompressionDampingNewtonsPerMeterPerSecond: 0,
  suspensionReboundDampingNewtonsPerMeterPerSecond: 0,
  maximumSuspensionNormalForceNewtons: 100000,
  suspensionBumpStopEngagementMeters: 0,
  suspensionBumpStopMaximumForceNewtons: 0,
  suspensionReboundStopEngagementMeters: 0,
  suspensionReboundStopMaximumForceNewtons: 0,
}

function makeWheelState({ axle = 'front', x = 0, z = 0, lengthMeters }) {
  return {
    axle,
    side: x >= 0 ? 'left' : 'right',
    isGrounded: true,
    frictionCoefficient: 1,
    localPosition: { x, y: 0, z },
    suspensionCurrentLengthMeters: lengthMeters,
    previousSuspensionCompressionMeters: 0,
    hasSuspensionCompressionSample: false,
  }
}

function makeFourWheelStates(lengthMeters) {
  return [
    makeWheelState({ axle: 'front', x: -1.25, z: 1.45, lengthMeters }),
    makeWheelState({ axle: 'front', x: 1.25, z: 1.45, lengthMeters }),
    makeWheelState({ axle: 'rear', x: -1.25, z: -1.45, lengthMeters }),
    makeWheelState({ axle: 'rear', x: 1.25, z: -1.45, lengthMeters }),
  ]
}

test('progressive stop force is zero before engagement and rises quadratically', () => {
  const forceAtEntryNewtons = computeProgressiveSuspensionStopForceNewtons(
    0.1, 0.2, 0.1, 8000
  )
  const forceAtMidpointNewtons = computeProgressiveSuspensionStopForceNewtons(
    0.15, 0.2, 0.1, 8000
  )
  const forceAtLimitNewtons = computeProgressiveSuspensionStopForceNewtons(
    0.2, 0.2, 0.1, 8000
  )

  assert.equal(forceAtEntryNewtons, 0)
  assert.ok(Math.abs(forceAtMidpointNewtons - 2000) < 1e-9)
  assert.equal(forceAtLimitNewtons, 8000)
  assert.ok(
    Math.abs(
      computeProgressiveSuspensionStopRateNewtonsPerMeter(
        0.15, 0.2, 0.1, 8000
      ) - 80000
    ) < 1e-9
  )
})

test('bump-stop forces route independently through front and rear specs', () => {
  const wheelStates = [
    makeWheelState({ axle: 'front', lengthMeters: 0.25 }),
    makeWheelState({ axle: 'rear', lengthMeters: 0.25 }),
  ]
  const spec = {
    ...BASE_SUSPENSION_SPEC,
    suspensionFront: {
      suspensionBumpStopEngagementMeters: 0.1,
      suspensionBumpStopMaximumForceNewtons: 8000,
    },
    suspensionRear: {
      suspensionBumpStopEngagementMeters: 0.1,
      suspensionBumpStopMaximumForceNewtons: 4000,
    },
  }

  updateSuspensionNormalForceState(wheelStates, spec, 1 / 60)

  assert.ok(Math.abs(wheelStates[0].bumpStopForceNewtons - 2000) < 1e-9)
  assert.ok(Math.abs(wheelStates[1].bumpStopForceNewtons - 1000) < 1e-9)
})

test('rebound stop opposes support through the configured droop zone', () => {
  const wheelStates = [
    makeWheelState({ axle: 'front', lengthMeters: 0.475 }),
    makeWheelState({ axle: 'front', lengthMeters: 0.25 }),
  ]
  const spec = {
    ...BASE_SUSPENSION_SPEC,
    suspensionReboundStopEngagementMeters: 0.05,
    suspensionReboundStopMaximumForceNewtons: 4000,
  }

  updateSuspensionNormalForceState(wheelStates, spec, 1 / 60)

  assert.ok(Math.abs(wheelStates[0].reboundStopForceNewtons - 1000) < 1e-9)
  assert.equal(wheelStates[0].rawSuspensionNormalForceNewtons, 0)
  assert.ok(wheelStates[1].baseNormalForceNewtons > 0)
})

test('stop force and tangent stiffness reach vertical chassis dynamics', () => {
  function resolveHeaveForcing(bumpStopMaximumForceNewtons) {
    const wheelStates = makeFourWheelStates(0.25)
    const spec = {
      ...BASE_SUSPENSION_SPEC,
      verticalDynamicsEnabled: true,
      verticalDynamicsForcingEnabled: true,
      wheelbaseMeters: 2.9,
      frontTrackWidthMeters: 2.5,
      rearTrackWidthMeters: 2.5,
      centerOfMassHeightMeters: 0.55,
      suspensionBumpStopEngagementMeters: 0.1,
      suspensionBumpStopMaximumForceNewtons: bumpStopMaximumForceNewtons,
    }
    updateSuspensionNormalForceState(wheelStates, spec, 1 / 60)
    const state = createVerticalChassisDynamicsState(spec)
    updateVerticalChassisDynamics(state, wheelStates, spec, 0)
    return state.heaveForcingForceNewtons
  }

  const baselineHeaveForcingNewtons = resolveHeaveForcing(0)
  const stopHeaveForcingNewtons = resolveHeaveForcing(8000)

  assert.ok(
    Math.abs(
      stopHeaveForcingNewtons - baselineHeaveForcingNewtons - 8000
    ) < 1e-8
  )
})
