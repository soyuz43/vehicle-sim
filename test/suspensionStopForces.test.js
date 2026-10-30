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

function makeStopDynamicsWheelStates(compressionMeters, staticCompressionMeters = 0.088) {
  const cornerPositions = [
    { axle: 'front', x: -1.25, z: 1.45 },
    { axle: 'front', x: 1.25, z: 1.45 },
    { axle: 'rear', x: -1.25, z: -1.45 },
    { axle: 'rear', x: 1.25, z: -1.45 },
  ]
  return cornerPositions.map(({ axle, x, z }) => ({
    isGrounded: true,
    axle,
    side: x > 0 ? 'left' : 'right',
    localPosition: { x, y: 0, z },
    baseNormalForceNewtons: 4000,
    normalForceNewtons: 4000,
    frictionCoefficient: 1,
    tractionLimitNewtons: 4000,
    suspensionRestLengthMeters: 0.4,
    suspensionMountLocalPosition: {
      y: 0.9 - staticCompressionMeters,
    },
    effectiveTireRollingRadiusMeters: 0.5,
    suspensionCompressionMeters: compressionMeters,
    suspensionDroopMeters: 0,
    suspensionMaximumCompressionMeters: 0.22,
    suspensionMaximumDroopMeters: 0.1,
    suspensionBumpStopEngagementMeters: 0.05,
    suspensionBumpStopMaximumForceNewtons: 30000,
    suspensionReboundStopEngagementMeters: 0.04,
    suspensionReboundStopMaximumForceNewtons: 5000,
    suspensionSpringRateNewtonsPerMeter: 39000,
    suspensionCompressionDampingNewtonsPerMeterPerSecond: 0,
    suspensionReboundDampingNewtonsPerMeterPerSecond: 0,
    verticalDynamicsLoadDeviationNewtons: 0,
  }))
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

test('bump-stop force and tangent follow body-adjusted corner travel', () => {
  function resolveStateAtHeave(heaveMeters, bumpStopMaximumForceNewtons) {
    const wheelStates = makeStopDynamicsWheelStates(0.19)
    for (const wheelState of wheelStates) {
      wheelState.suspensionBumpStopMaximumForceNewtons =
        bumpStopMaximumForceNewtons
    }
    const spec = {
      ...BASE_SUSPENSION_SPEC,
      verticalDynamicsEnabled: true,
      verticalDynamicsForcingEnabled: true,
      wheelbaseMeters: 2.9,
      frontTrackWidthMeters: 2.5,
      rearTrackWidthMeters: 2.5,
      centerOfMassHeightMeters: 0.55,
      suspensionTravelMeters: 0.22,
      suspensionTargetStaticCompressionRatio01: 0.4,
    }
    const state = createVerticalChassisDynamicsState(spec)
    state.heaveMeters = heaveMeters
    updateVerticalChassisDynamics(state, wheelStates, spec, 0)
    return { state, wheelStates }
  }

  const activeStop = resolveStateAtHeave(0.019, 30000)
  const activeStopWithoutForce = resolveStateAtHeave(0.019, 0)
  const clearStop = resolveStateAtHeave(0.021, 30000)
  const clearStopWithoutForce = resolveStateAtHeave(0.021, 0)
  const bodyClearOfStop = resolveStateAtHeave(0.04, 30000)
  const bodyClearWithoutStop = resolveStateAtHeave(0.04, 0)

  assert.ok(
    activeStop.state.heaveAccelerationMetersPerSecondSquared >
      activeStopWithoutForce.state.heaveAccelerationMetersPerSecondSquared,
    'the stop should add force while adjusted travel is inside its engagement zone'
  )
  assert.ok(
    Math.abs(
      clearStop.state.heaveAccelerationMetersPerSecondSquared -
        clearStopWithoutForce.state.heaveAccelerationMetersPerSecondSquared
    ) < 1e-9,
    'force and tangent should both be zero after adjusted travel clears engagement'
  )
  assert.ok(
    Math.abs(
      bodyClearOfStop.state.heaveAccelerationMetersPerSecondSquared -
        bodyClearWithoutStop.state.heaveAccelerationMetersPerSecondSquared
    ) < 1e-9
  )
  for (const wheelState of bodyClearOfStop.wheelStates) {
    assert.ok(wheelState.normalForceNewtons > 0)
    assert.ok(
      Math.abs(
        wheelState.verticalDynamicsLoadDeviationNewtons + 39000 * 0.04
      ) < 1e-8
    )
  }
})

test('static droop rebound-stop force is removed at the ride-height reference', () => {
  const staticDroopMeters = 0.082
  const wheelStates = makeFourWheelStates(0.4 + staticDroopMeters)
  for (const wheelState of wheelStates) {
    wheelState.suspensionMountLocalPosition = { y: 0.982 }
    wheelState.effectiveTireRollingRadiusMeters = 0.5
  }
  const spec = {
    ...BASE_SUSPENSION_SPEC,
    verticalDynamicsEnabled: true,
    verticalDynamicsForcingEnabled: true,
    wheelbaseMeters: 2.9,
    frontTrackWidthMeters: 2.5,
    rearTrackWidthMeters: 2.5,
    centerOfMassHeightMeters: 0.55,
    suspensionRestLengthMeters: 0.4,
    suspensionMinimumLengthMeters: 0.2,
    suspensionMaximumLengthMeters: 0.5,
    suspensionMaximumDroopMeters: 0.1,
    suspensionMaximumCompressionMeters: 0.2,
    suspensionTravelMeters: 0.3,
    suspensionReboundStopEngagementMeters: 0.04,
    suspensionReboundStopMaximumForceNewtons: 5000,
  }
  updateSuspensionNormalForceState(wheelStates, spec, 0)
  const state = createVerticalChassisDynamicsState(spec)

  updateVerticalChassisDynamics(state, wheelStates, spec, 0)

  assert.ok(
    Math.abs(state.heaveForcingForceNewtons) < 1e-8,
    `parked static droop must not create heave forcing, got ${state.heaveForcingForceNewtons}`
  )
})

test('rebound-stop follows body-adjusted travel across engagement', () => {
  function resolveStateAtHeave(heaveMeters, reboundStopMaximumForceNewtons) {
    const wheelStates = makeStopDynamicsWheelStates(0)
    for (const wheelState of wheelStates) {
      wheelState.suspensionDroopMeters = 0.09
      wheelState.suspensionReboundStopMaximumForceNewtons =
        reboundStopMaximumForceNewtons
    }
    const spec = {
      ...BASE_SUSPENSION_SPEC,
      verticalDynamicsEnabled: true,
      verticalDynamicsForcingEnabled: true,
      wheelbaseMeters: 2.9,
      frontTrackWidthMeters: 2.5,
      rearTrackWidthMeters: 2.5,
      centerOfMassHeightMeters: 0.55,
      suspensionTravelMeters: 0.22,
      suspensionTargetStaticCompressionRatio01: 0.4,
    }
    const state = createVerticalChassisDynamicsState(spec)
    state.heaveMeters = heaveMeters
    updateVerticalChassisDynamics(state, wheelStates, spec, 0)
    return state
  }

  const activeStop = resolveStateAtHeave(-0.029, 30000)
  const activeStopWithoutForce = resolveStateAtHeave(-0.029, 0)
  const clearStop = resolveStateAtHeave(-0.031, 30000)
  const clearStopWithoutForce = resolveStateAtHeave(-0.031, 0)

  assert.ok(
    activeStop.heaveAccelerationMetersPerSecondSquared <
      activeStopWithoutForce.heaveAccelerationMetersPerSecondSquared,
    'the rebound stop should pull downward while adjusted droop is engaged'
  )
  assert.ok(
    Math.abs(
      clearStop.heaveAccelerationMetersPerSecondSquared -
        clearStopWithoutForce.heaveAccelerationMetersPerSecondSquared
    ) < 1e-9,
    'rebound force and tangent should clear when adjusted droop exits engagement'
  )
})

test('single grounded rigid-axle wheel creates no stop roll moment', () => {
  const wheelStates = makeStopDynamicsWheelStates(0.088, 0.088)
  for (const wheelState of wheelStates) {
    wheelState.isGrounded = false
    wheelState.suspensionBumpStopMaximumForceNewtons = 10000
  }
  wheelStates[3].isGrounded = true
  const spec = {
    ...BASE_SUSPENSION_SPEC,
    verticalDynamicsEnabled: true,
    verticalDynamicsForcingEnabled: true,
    wheelbaseMeters: 2.9,
    frontTrackWidthMeters: 2.5,
    rearTrackWidthMeters: 2.5,
    centerOfMassHeightMeters: 0.55,
    suspensionTravelMeters: 0.22,
    suspensionTargetStaticCompressionRatio01: 0.4,
    rearAxleCoupling: 'rigidAxle',
  }
  const state = createVerticalChassisDynamicsState(spec)
  state.heaveMeters = -0.085

  updateVerticalChassisDynamics(state, wheelStates, spec, 1 / 60)

  assert.ok(
    Math.abs(state.terrainRollMomentNewtonMeters) < 1e-9,
    'a centered rigid-axle stop must not create roll moment, got ' +
      state.terrainRollMomentNewtonMeters +
      ' Nm'
  )
  assert.ok(Math.abs(state.rollAccelerationRadiansPerSecondSquared) < 1e-9)
  assert.ok(Math.abs(state.rollRadians) < 1e-9)
})
