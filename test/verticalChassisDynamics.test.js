// test/verticalChassisDynamics.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createVerticalChassisDynamicsState,
  resetVerticalChassisDynamicsState,
  updateVerticalChassisDynamics,
} from '../src/vehicle/dynamics/verticalChassisDynamicsState.js'

const DT_SECONDS = 1 / 60
const SPRING_RATE = 39000
const DAMPING = 2500
const BASE_NORMAL_FORCE = (1400 * 9.80665) / 4

function makeWheelState({ x, z, axle }) {
  return {
    isGrounded: true,
    axle,
    localPosition: { x, y: 0, z },
    suspensionSpringRateNewtonsPerMeter: SPRING_RATE,
    suspensionCompressionDampingNewtonsPerMeterPerSecond: DAMPING,
    suspensionReboundDampingNewtonsPerMeterPerSecond: DAMPING,
    baseNormalForceNewtons: BASE_NORMAL_FORCE,
    normalForceNewtons: BASE_NORMAL_FORCE,
    frictionCoefficient: 1,
    tractionLimitNewtons: BASE_NORMAL_FORCE,
    verticalDynamicsLoadDeviationNewtons: 0,
  }
}

function makeSymmetricWheelStates() {
  return [
    makeWheelState({ x: -1.25, z: 1.45, axle: 'front' }),
    makeWheelState({ x: 1.25, z: 1.45, axle: 'front' }),
    makeWheelState({ x: -1.25, z: -1.45, axle: 'rear' }),
    makeWheelState({ x: 1.25, z: -1.45, axle: 'rear' }),
  ]
}

function makeSpec() {
  return {
    verticalDynamicsEnabled: true,
    massKg: 1400,
    wheelbaseMeters: 2.9,
    frontTrackWidthMeters: 2.5,
    rearTrackWidthMeters: 2.5,
    centerOfMassHeightMeters: 0.55,
  }
}

test('equilibrium: grounded wheels at rest keep their base normal force', () => {
  const wheelStates = makeSymmetricWheelStates()
  const state = createVerticalChassisDynamicsState(makeSpec())
  updateVerticalChassisDynamics(state, wheelStates, makeSpec(), DT_SECONDS)
  for (const wheelState of wheelStates) {
    assert.ok(state.isFinite)
    assert.ok(
      Math.abs(wheelState.normalForceNewtons - BASE_NORMAL_FORCE) < 1e-6,
      `normal force should equal base at equilibrium, got ${wheelState.normalForceNewtons}`
    )
    assert.ok(
      Math.abs(wheelState.verticalDynamicsLoadDeviationNewtons) < 1e-9
    )
  }
})

test('pitch (nose up) transfers load rearward and conserves total', () => {
  const wheelStates = makeSymmetricWheelStates()
  const state = createVerticalChassisDynamicsState(makeSpec())
  state.pitchRadians = 0.05
  updateVerticalChassisDynamics(state, wheelStates, makeSpec(), 0)
  const front = wheelStates.filter((w) => w.axle === 'front')
  const rear = wheelStates.filter((w) => w.axle === 'rear')
  const frontLoad = front.reduce((s, w) => s + w.normalForceNewtons, 0)
  const rearLoad = rear.reduce((s, w) => s + w.normalForceNewtons, 0)
  const baseTotal = wheelStates.length * BASE_NORMAL_FORCE
  assert.ok(frontLoad < baseTotal / 2)
  assert.ok(rearLoad > baseTotal / 2)
  assert.ok(
    Math.abs(frontLoad + rearLoad - baseTotal) < 1e-6,
    'total normal force must be conserved under pure pitch'
  )
})

test('roll (right side up) transfers load to the left wheels', () => {
  const wheelStates = makeSymmetricWheelStates()
  const state = createVerticalChassisDynamicsState(makeSpec())
  state.rollRadians = 0.05
  updateVerticalChassisDynamics(state, wheelStates, makeSpec(), 0)
  const right = wheelStates.filter((w) => w.localPosition.x > 0)
  const left = wheelStates.filter((w) => w.localPosition.x < 0)
  const rightLoad = right.reduce((s, w) => s + w.normalForceNewtons, 0)
  const leftLoad = left.reduce((s, w) => s + w.normalForceNewtons, 0)
  assert.ok(rightLoad < leftLoad, 'right (raised) side must carry less load')
})

test('free vertical bounce is stable and decays to equilibrium', () => {
  const wheelStates = makeSymmetricWheelStates()
  const state = createVerticalChassisDynamicsState(makeSpec())
  state.heaveMeters = 0.05
  const spec = makeSpec()
  for (let i = 0; i < 600; i++) {
    updateVerticalChassisDynamics(state, wheelStates, spec, DT_SECONDS)
  }
  assert.ok(state.isFinite)
  assert.ok(
    Math.abs(state.heaveMeters) < 1e-3,
    `heave should decay, got ${state.heaveMeters}`
  )
})

test('airborne wheel contributes no normal force and is skipped', () => {
  const wheelStates = makeSymmetricWheelStates()
  wheelStates[0].isGrounded = false
  const state = createVerticalChassisDynamicsState(makeSpec())
  updateVerticalChassisDynamics(state, wheelStates, makeSpec(), DT_SECONDS)
  assert.equal(wheelStates[0].normalForceNewtons, 0)
  assert.equal(state.integratedWheelCount, 3)
})

test('disabled flag leaves state untouched and available false', () => {
  const wheelStates = makeSymmetricWheelStates()
  const state = createVerticalChassisDynamicsState(makeSpec())
  state.pitchRadians = 0.05
  const disabledSpec = makeSpec()
  disabledSpec.verticalDynamicsEnabled = false
  updateVerticalChassisDynamics(state, wheelStates, disabledSpec, DT_SECONDS)
  assert.equal(state.available, false)
  for (const wheelState of wheelStates) {
    assert.equal(wheelState.verticalDynamicsLoadDeviationNewtons, 0)
  }
})
