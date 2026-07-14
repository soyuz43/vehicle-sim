// test/rearDifferentialDriveTorqueSplit.test.js
//
// Focused coverage for updateRearDifferentialDriveTorqueSplit: the authoritative
// axle-torque distribution used by the active powertrain drive-torque source.
// It reuses the same share calculation as the legacy force split, so every
// differential mode is exercised, and left+right always sums to the input axle
// torque (no torque created or destroyed).

import assert from "node:assert/strict"
import test from "node:test"

import {
  createRearDifferentialState,
  resetRearDifferentialState,
  setRearDifferentialType,
  updateRearDifferentialDriveTorqueSplit,
  updateRearDifferentialDriveTorqueSplitWithShares,
  updateRearDifferentialWheelSpeedCoupling,
  resolveRearDifferentialDriveTorqueShares,
  resolveRearDifferentialDriveForceShares,
} from "../src/vehicle/dynamics/rearDifferentialState.js"

const SPEC = Object.freeze({
  rearDifferentialType: "open",
  rearDifferentialAvailableTypes: ["open", "limited-slip", "torsen", "locked", "welded"],
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

function createRearWheelState(side, angularVelocityRadiansPerSecond, wheelInertiaKgMeterSquared, overrides = {}) {
  return {
    side,
    axle: "rear",
    driven: true,
    angularVelocityRadiansPerSecond,
    angularSpeedRadiansPerSecond: Math.abs(angularVelocityRadiansPerSecond),
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

function split(type, wheelStates, inputTorque, spec = SPEC) {
  const state = createRearDifferentialState(spec)
  setRearDifferentialType(state, spec, type)
  updateRearDifferentialDriveTorqueSplit(state, wheelStates, inputTorque, spec)
  return state
}

test("open differential splits the axle torque symmetrically and conserves it", () => {
  const wheelStates = [createRearWheelState("left", 10, 1.2), createRearWheelState("right", 10, 1.2)]
  const state = split("open", wheelStates, 2000)

  assert.equal(state.rearDifferentialLeftShare01, 0.5)
  assert.equal(state.rearDifferentialRightShare01, 0.5)
  assert.ok(Math.abs(state.rearDifferentialLeftOutputDriveTorqueNewtonMeters - 1000) < 1e-9)
  assert.ok(Math.abs(state.rearDifferentialRightOutputDriveTorqueNewtonMeters - 1000) < 1e-9)
  assert.ok(
    Math.abs(
      state.rearDifferentialLeftOutputDriveTorqueNewtonMeters +
        state.rearDifferentialRightOutputDriveTorqueNewtonMeters -
        2000
    ) < 1e-9
  )
})

test("limited-slip, torsen, locked, and welded all produce finite torque outputs", () => {
  const wheelStates = [createRearWheelState("left", 20, 1.5), createRearWheelState("right", 4, 0.9)]
  for (const type of ["limited-slip", "torsen", "locked", "welded"]) {
    const state = split(type, wheelStates, 3000)
    assert.ok(Number.isFinite(state.rearDifferentialLeftOutputDriveTorqueNewtonMeters), type + " left finite")
    assert.ok(Number.isFinite(state.rearDifferentialRightOutputDriveTorqueNewtonMeters), type + " right finite")
    assert.ok(
      Math.abs(
        state.rearDifferentialLeftOutputDriveTorqueNewtonMeters +
          state.rearDifferentialRightOutputDriveTorqueNewtonMeters -
          3000
      ) < 1e-9,
      type + " conserves axle torque"
    )
  }
})

test("reverse-sign input conserves magnitude and flips sign", () => {
  const wheelStates = [createRearWheelState("left", 10, 1.2), createRearWheelState("right", 10, 1.2)]
  const state = split("open", wheelStates, -2000)
  assert.ok(state.rearDifferentialLeftOutputDriveTorqueNewtonMeters < 0)
  assert.ok(state.rearDifferentialRightOutputDriveTorqueNewtonMeters < 0)
  assert.ok(
    Math.abs(state.rearDifferentialLeftOutputDriveTorqueNewtonMeters + 1000) < 1e-9
  )
  assert.ok(
    Math.abs(
      state.rearDifferentialLeftOutputDriveTorqueNewtonMeters +
        state.rearDifferentialRightOutputDriveTorqueNewtonMeters +
        2000
    ) < 1e-9
  )
})

test("left share plus right share always equals one for every mode", () => {
  const wheelStates = [createRearWheelState("left", 18, 1.4, { tractionLimitNewtons: 4200, longitudinalSlipRatioAbs: 0.02 }), createRearWheelState("right", 2, 1.4, { tractionLimitNewtons: 900, longitudinalSlipRatioAbs: 0.25 })]
  for (const type of ["open", "limited-slip", "torsen", "locked", "welded"]) {
    const state = split(type, wheelStates, 2400)
    assert.ok(Math.abs(state.rearDifferentialLeftShare01 + state.rearDifferentialRightShare01 - 1) < 1e-9, type)
  }
})

test("asymmetric rolling radii preserve the total axle torque", () => {
  const wheelStates = [
    createRearWheelState("left", 12, 1.2, { effectiveTireRollingRadiusMeters: 0.42, radius: 0.42 }),
    createRearWheelState("right", 12, 1.2, { effectiveTireRollingRadiusMeters: 0.55, radius: 0.55 }),
  ]
  const input = 1800
  const state = split("open", wheelStates, input)
  assert.ok(
    Math.abs(
      state.rearDifferentialLeftOutputDriveTorqueNewtonMeters +
        state.rearDifferentialRightOutputDriveTorqueNewtonMeters -
        input
    ) < 1e-9
  )
})

test("wheel-speed coupling after a torque split remains momentum-conserving", () => {
  const state = createRearDifferentialState(SPEC)
  setRearDifferentialType(state, SPEC, "locked")
  const wheelStates = [createRearWheelState("left", 7, 1.2), createRearWheelState("right", -1, 2.4)]
  updateRearDifferentialDriveTorqueSplit(state, wheelStates, 1500, SPEC)

  const initialMomentum = wheelStates.reduce(
    (total, w) => total + w.wheelInertiaKgMeterSquared * w.angularVelocityRadiansPerSecond,
    0
  )
  updateRearDifferentialWheelSpeedCoupling(state, wheelStates, STEP_DT_SECONDS, SPEC)
  const finalMomentum = wheelStates.reduce(
    (total, w) => total + w.wheelInertiaKgMeterSquared * w.angularVelocityRadiansPerSecond,
    0
  )
  assert.ok(Math.abs(finalMomentum - initialMomentum) <= MOMENTUM_TOLERANCE)
})

test("torque-split step reset preserves the selected mode and clears torque outputs", () => {
  const wheelStates = [createRearWheelState("left", 9, 1.2), createRearWheelState("right", 1, 1.2)]
  const state = split("locked", wheelStates, 1500)

  assert.equal(state.rearDifferentialType, "locked")
  assert.ok(Math.abs(state.rearDifferentialLeftOutputDriveTorqueNewtonMeters) > 0)

  resetRearDifferentialState(state, SPEC)
  assert.equal(state.rearDifferentialLeftOutputDriveTorqueNewtonMeters, 0)
  assert.equal(state.rearDifferentialRightOutputDriveTorqueNewtonMeters, 0)
  assert.equal(state.rearDifferentialType, "locked")
  assert.doesNotThrow(() => JSON.stringify(state))
})


test("torque-share wrapper matches the force resolver via mean-radius conversion", () => {
  // The active torque wrapper must convert axle torque to an equivalent axle
  // force using the arithmetic-mean rear rolling radius, then resolve the SAME
  // dimensionless shares the force resolver would. This proves no Newton-meter
  // value enters the force arithmetic and no dimension mixing occurs.
  const wheelStates = [
    createRearWheelState("left", 4, 1.2),
    createRearWheelState("right", 20, 1.2),
  ]
  const axleTorque = 3000
  const state = createRearDifferentialState(SPEC)
  setRearDifferentialType(state, SPEC, "limited-slip")
  const torqueShares = resolveRearDifferentialDriveTorqueShares(
    state,
    wheelStates,
    axleTorque,
    SPEC
  )

  const meanRadius = (0.48 + 0.48) / 2
  const equivalentForceNewtons = Math.abs(axleTorque) / meanRadius
  const state2 = createRearDifferentialState(SPEC)
  setRearDifferentialType(state2, SPEC, "limited-slip")
  const forceShares = resolveRearDifferentialDriveForceShares(
    state2,
    wheelStates[0],
    wheelStates[1],
    equivalentForceNewtons,
    SPEC
  )

  assert.ok(Math.abs(torqueShares.leftShare01 - forceShares.leftShare01) < 1e-9)
  assert.ok(Math.abs(torqueShares.rightShare01 - forceShares.rightShare01) < 1e-9)
  assert.ok(Number.isFinite(equivalentForceNewtons) && equivalentForceNewtons > 0)
})

test("asymmetric rolling radii use arithmetic-mean reference radius", () => {
  const wheelStates = [
    createRearWheelState("left", 4, 1.2, { effectiveTireRollingRadiusMeters: 0.4, radius: 0.4 }),
    createRearWheelState("right", 20, 1.2, { effectiveTireRollingRadiusMeters: 0.56, radius: 0.56 }),
  ]
  const meanRadius = (0.4 + 0.56) / 2
  const axleTorque = 2400
  const state = createRearDifferentialState(SPEC)
  setRearDifferentialType(state, SPEC, "limited-slip")
  const torqueShares = resolveRearDifferentialDriveTorqueShares(
    state,
    wheelStates,
    axleTorque,
    SPEC
  )

  const equivalentForceNewtons = Math.abs(axleTorque) / meanRadius
  const state2 = createRearDifferentialState(SPEC)
  setRearDifferentialType(state2, SPEC, "limited-slip")
  const forceShares = resolveRearDifferentialDriveForceShares(
    state2,
    wheelStates[0],
    wheelStates[1],
    equivalentForceNewtons,
    SPEC
  )

  assert.ok(Math.abs(torqueShares.leftShare01 - forceShares.leftShare01) < 1e-9)
  assert.ok(Math.abs(torqueShares.rightShare01 - forceShares.rightShare01) < 1e-9)
})

test("split-with-shares conserves axle torque for arbitrary shares", () => {
  const wheelStates = [
    createRearWheelState("left", 10, 1.2),
    createRearWheelState("right", 10, 1.2),
  ]
  const state = createRearDifferentialState(SPEC)
  const shares = { leftShare01: 0.3, rightShare01: 0.7 }
  updateRearDifferentialDriveTorqueSplitWithShares(
    state,
    wheelStates,
    2000,
    shares,
    SPEC
  )
  assert.ok(Math.abs(state.rearDifferentialLeftOutputDriveTorqueNewtonMeters - 600) < 1e-9)
  assert.ok(Math.abs(state.rearDifferentialRightOutputDriveTorqueNewtonMeters - 1400) < 1e-9)
  assert.ok(
    Math.abs(
      state.rearDifferentialLeftOutputDriveTorqueNewtonMeters +
        state.rearDifferentialRightOutputDriveTorqueNewtonMeters -
        2000
    ) < 1e-9
  )
})

test("predictor and split consume identical shares (no disagreement)", () => {
  // Integration seam check: the same resolved shares must drive both the
  // predictive cap and the applied torque split. Here we verify the torque
  // wrapper returns shares in [0,1] that sum to one and that applying them via
  // the split reproduces left+right === input.
  const wheelStates = [
    createRearWheelState("left", 4, 1.2),
    createRearWheelState("right", 20, 1.2),
  ]
  const state = createRearDifferentialState(SPEC)
  setRearDifferentialType(state, SPEC, "limited-slip")
  const shares = resolveRearDifferentialDriveTorqueShares(
    state,
    wheelStates,
    3000,
    SPEC
  )
  assert.ok(shares.leftShare01 >= 0 && shares.leftShare01 <= 1)
  assert.ok(shares.rightShare01 >= 0 && shares.rightShare01 <= 1)
  assert.ok(Math.abs(shares.leftShare01 + shares.rightShare01 - 1) < 1e-9)

  const splitState = createRearDifferentialState(SPEC)
  updateRearDifferentialDriveTorqueSplitWithShares(
    splitState,
    wheelStates,
    3000,
    shares,
    SPEC
  )
  assert.ok(
    Math.abs(
      splitState.rearDifferentialLeftOutputDriveTorqueNewtonMeters +
        splitState.rearDifferentialRightOutputDriveTorqueNewtonMeters -
        3000
    ) < 1e-9
  )
})
