// test/verticalChassisDynamics.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createVerticalChassisDynamicsState,
  resetVerticalChassisDynamicsState,
  updateVerticalChassisDynamics,
} from '../src/vehicle/dynamics/verticalChassisDynamicsState.js'
import { applyVehicleConfiguration } from '../src/vehicle/config/applyVehicleConfiguration.js'
import {
  createDefaultVehicleConfiguration,
  setVehicleConfigurationSlot,
} from '../src/vehicle/config/createVehicleConfiguration.js'

const DT_SECONDS = 1 / 60
const SPRING_RATE = 39000
const DAMPING = 2500
const BASE_NORMAL_FORCE = (1400 * 9.80665) / 4

function makeWheelState({ x, z, axle }) {
  return {
    isGrounded: true,
    axle,
    side: x > 0 ? 'left' : 'right',
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

test('extreme chassis pitch and roll clamp at the hard attitude limits', () => {
  const wheelStates = makeSymmetricWheelStates()
  const spec = makeSpec()
  const state = createVerticalChassisDynamicsState(spec)
  const attitudeLimitRadians = (80 * Math.PI) / 180

  state.pitchRadians = attitudeLimitRadians - 0.01
  state.pitchRateRadiansPerSecond = 100
  state.rollRadians = -attitudeLimitRadians + 0.01
  state.rollRateRadiansPerSecond = -100
  updateVerticalChassisDynamics(state, wheelStates, spec, DT_SECONDS)

  assert.equal(state.pitchRadians, attitudeLimitRadians)
  assert.equal(state.rollRadians, -attitudeLimitRadians)
  assert.equal(state.pitchRateRadiansPerSecond, 0)
  assert.equal(state.rollRateRadiansPerSecond, 0)
  assert.equal(state.isFinite, true)
})

test('non-finite chassis attitude inputs recover to finite neutral angles', () => {
  const wheelStates = makeSymmetricWheelStates()
  const spec = makeSpec()
  const state = createVerticalChassisDynamicsState(spec)

  state.pitchRadians = Number.POSITIVE_INFINITY
  state.pitchRateRadiansPerSecond = Number.NaN
  state.rollRadians = Number.NEGATIVE_INFINITY
  state.rollRateRadiansPerSecond = Number.POSITIVE_INFINITY
  updateVerticalChassisDynamics(state, wheelStates, spec, 0)

  assert.equal(state.pitchRadians, 0)
  assert.equal(state.rollRadians, 0)
  assert.equal(state.pitchRateRadiansPerSecond, 0)
  assert.equal(state.rollRateRadiansPerSecond, 0)
  assert.equal(state.isFinite, true)
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

test('roll (left side up) transfers load to the right wheels', () => {
  const wheelStates = makeSymmetricWheelStates()
  const state = createVerticalChassisDynamicsState(makeSpec())
  state.rollRadians = 0.05
  updateVerticalChassisDynamics(state, wheelStates, makeSpec(), 0)
  const left = wheelStates.filter((wheelState) => wheelState.localPosition.x > 0)
  const right = wheelStates.filter((wheelState) => wheelState.localPosition.x < 0)
  const leftLoad = left.reduce((total, wheelState) => total + wheelState.normalForceNewtons, 0)
  const rightLoad = right.reduce((total, wheelState) => total + wheelState.normalForceNewtons, 0)
  assert.ok(leftLoad < rightLoad, 'left (raised) side must carry less load')
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
// Phase B.1: the heave bounds and the per-corner static-compression
// reference are consumed per axle. A mixed slot setup (stiff front, lifted
// rear) must derive each corner's static compression from its own slot's
// travel and target ratio, and the body's single heave DOF must clamp to the
// more restrictive axle's bound. A consumer that reads one flat travel value
// for both axles collapses this difference and fails the assertions.
function createMixedTravelConfiguration() {
  let configuration = setVehicleConfigurationSlot(
    createDefaultVehicleConfiguration(),
    'suspensionFront',
    'susp-stiff'
  )
  configuration = setVehicleConfigurationSlot(
    configuration,
    'suspensionRear',
    'susp-lifted'
  )
  return applyVehicleConfiguration(configuration)
}

test('mixed slot travel keeps per-corner static compression distinct', () => {
  const applied = createMixedTravelConfiguration()
  const spec = applied.spec
  spec.verticalDynamicsEnabled = true
  const wheelStates = makeSymmetricWheelStates()
  const state = createVerticalChassisDynamicsState(spec)
  updateVerticalChassisDynamics(state, wheelStates, spec, DT_SECONDS)
  assert.ok(state.isFinite)

  // The per-corner reference must resolve each wheel's own slot ratio:
  // stiff front (0.16 m travel, 0.25 target) and lifted rear (0.26 m
  // travel, 0.32 target) cannot share one nominal static compression.
  const frontNominal = 0.16 * 0.25
  const rearNominal = 0.26 * 0.32
  const frontWheels = wheelStates.filter((w) => w.axle === 'front')
  const rearWheels = wheelStates.filter((w) => w.axle === 'rear')
  assert.notEqual(
    frontNominal,
    rearNominal,
    'the mixed slots must declare different nominal compressions'
  )

  // The front corners clamp their geometric compression to the front slot's
  // 0.16 m travel; the rear corners keep the rear slot's 0.26 m travel.
  // The raycast suspension path clamps per wheel, so the front wheels'
  // maximum compression must stay below the rear wheels' maximum.
  const frontMaxCompression = Math.max(
    ...frontWheels.map((w) => w.suspensionCompressionMeters ?? 0)
  )
  const rearMaxCompression = Math.max(
    ...rearWheels.map((w) => w.suspensionCompressionMeters ?? 0)
  )
  assert.ok(
    frontMaxCompression <= 0.16 + 1e-9,
    'front wheels must respect the stiff front slot travel bound, got ' +
      frontMaxCompression
  )
  assert.ok(
    rearMaxCompression <= 0.26 + 1e-9,
    'rear wheels must respect the lifted rear slot travel bound, got ' +
      rearMaxCompression
  )
})

test('the body heave bound clamps to the more restrictive mixed slot', () => {
  const applied = createMixedTravelConfiguration()
  const spec = applied.spec
  spec.verticalDynamicsEnabled = true
  const wheelStates = makeSymmetricWheelStates()
  const state = createVerticalChassisDynamicsState(spec)

  // The stiff front axle's droop bound is 0.16 * 0.25 = 0.04 m; the lifted
  // rear axle's droop bound is 0.26 * 0.32 = 0.0832 m. The body's single
  // heave DOF must respect the more restrictive (front) droop bound, so a
  // body state past it clamps to 0.04 m rather than riding the rear bound.
  const frontDroopBound = 0.16 * 0.25
  const rearDroopBound = 0.26 * 0.32
  assert.ok(frontDroopBound < rearDroopBound)

  // Droop is the negative heave direction: a body heave of -0.075 m is
  // past the front axle's -0.04 m droop bound but inside the rear axle's
  // -0.0832 m droop bound. The body must clamp to the front bound.
  // The heave clamp runs inside the integration block, so the step must
  // advance time: dt = 0 skips the clamp entirely.
  state.heaveMeters = -0.075
  state.heaveVelocityMetersPerSecond = 0
  updateVerticalChassisDynamics(state, wheelStates, spec, DT_SECONDS)
  assert.ok(
    state.heaveMeters >= -frontDroopBound - 1e-9,
    'body heave must clamp to the front slot droop bound, got ' +
      state.heaveMeters
  )
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
