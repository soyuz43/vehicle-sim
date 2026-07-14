// test/powertrainDriveTorqueState.test.js
//
// Focused unit coverage for the active powertrain drive-torque source v1.
// Pure-module tests: torque-curve interpolation, redline taper, ratio/RPM
// ownership, efficiency clamping, and the signed axle-torque output.

import assert from "node:assert/strict"
import test from "node:test"

import {
  interpolateEngineTorqueCurve,
  computeRedlineTorqueMultiplier01,
  createPowertrainDriveTorqueState,
  updatePowertrainDriveTorqueSource,
  resetPowertrainDriveTorqueState,
} from "../src/vehicle/powertrain/createPowertrainDriveTorqueState.js"

const ENGINE_PROFILE = Object.freeze({
  idleRpm: 800,
  redlineRpm: 6500,
  torqueCurveSamples: Object.freeze([
    Object.freeze({ rpm: 1000, torqueNewtonMeters: 100 }),
    Object.freeze({ rpm: 2000, torqueNewtonMeters: 200 }),
    Object.freeze({ rpm: 3000, torqueNewtonMeters: 150 }),
    Object.freeze({ rpm: 4000, torqueNewtonMeters: 100 }),
  ]),
})

const TRANSMISSION_PROFILE = Object.freeze({
  transmissionKind: "manual",
  forwardGearRatios: Object.freeze([3.45]),
  reverseGearRatio: -3.17,
  finalDriveRatio: 3.91,
})

const ACTIVE_SPEC = Object.freeze({
  powertrainDriveTorqueEnabled: true,
  powertrainRedlineTorqueTaperRpm: 800,
  powertrainDrivetrainEfficiency01: 0.9,
})

const FORWARD_EFFECTIVE_RATIO = 3.45 * 3.91
const RPM_PER_RAD = 60 / (2 * Math.PI)

// --- Torque curve interpolation -------------------------------------------

test("interpolation returns the exact torque at a sample rpm", () => {
  assert.equal(interpolateEngineTorqueCurve(ENGINE_PROFILE, 2000), 200)
  assert.equal(interpolateEngineTorqueCurve(ENGINE_PROFILE, 1000), 100)
  assert.equal(interpolateEngineTorqueCurve(ENGINE_PROFILE, 4000), 100)
})

test("interpolation is linear at the midpoint between samples", () => {
  assert.equal(interpolateEngineTorqueCurve(ENGINE_PROFILE, 1500), 150)
})

test("interpolation clamps below the first sample to the first sample", () => {
  assert.equal(interpolateEngineTorqueCurve(ENGINE_PROFILE, 0), 100)
  assert.equal(interpolateEngineTorqueCurve(ENGINE_PROFILE, 500), 100)
})

test("interpolation clamps above the last sample to the last sample", () => {
  assert.equal(interpolateEngineTorqueCurve(ENGINE_PROFILE, 4000), 100)
  assert.equal(interpolateEngineTorqueCurve(ENGINE_PROFILE, 9000), 100)
})

test("interpolation returns zero for missing or empty samples", () => {
  assert.equal(interpolateEngineTorqueCurve({}, 2000), 0)
  assert.equal(interpolateEngineTorqueCurve({ torqueCurveSamples: [] }, 2000), 0)
  assert.equal(interpolateEngineTorqueCurve(null, 2000), 0)
})

test("interpolation tolerates non-finite rpm and stays non-negative", () => {
  assert.equal(interpolateEngineTorqueCurve(ENGINE_PROFILE, NaN), 100)
  assert.equal(interpolateEngineTorqueCurve(ENGINE_PROFILE, -5), 100)
  assert.equal(interpolateEngineTorqueCurve(ENGINE_PROFILE, Infinity), 100)
  for (const sample of ENGINE_PROFILE.torqueCurveSamples) {
    assert.ok(sample.torqueNewtonMeters >= 0)
  }
})

// --- Redline taper ---------------------------------------------------------

test("redline taper is 1 below the taper start and 0 at/above redline", () => {
  assert.equal(computeRedlineTorqueMultiplier01(6500, 800, 0), 1)
  assert.equal(computeRedlineTorqueMultiplier01(6500, 800, 5700), 1)
  assert.equal(computeRedlineTorqueMultiplier01(6500, 800, 6500), 0)
  assert.equal(computeRedlineTorqueMultiplier01(6500, 800, 7000), 0)
})

test("redline taper is linear inside the band", () => {
  assert.ok(Math.abs(computeRedlineTorqueMultiplier01(6500, 800, 6100) - 0.5) < 1e-9)
  assert.ok(Math.abs(computeRedlineTorqueMultiplier01(6500, 800, 5900) - 0.75) < 1e-9)
})

test("redline taper is finite and in [0,1] for malformed inputs", () => {
  for (const value of [
    computeRedlineTorqueMultiplier01(0, 800, 1000),
    computeRedlineTorqueMultiplier01(6500, -100, 1000),
    computeRedlineTorqueMultiplier01(NaN, NaN, NaN),
  ]) {
    assert.ok(Number.isFinite(value))
    assert.ok(value >= 0 && value <= 1)
  }
})

// --- Signed axle output ----------------------------------------------------

function updateActive(spec, overrides = {}) {
  const state = createPowertrainDriveTorqueState()
  const total = updatePowertrainDriveTorqueSource({
    state,
    spec,
    engineProfile: ENGINE_PROFILE,
    transmissionProfile: TRANSMISSION_PROFILE,
    gearDirection: overrides.gearDirection ?? 1,
    throttleInput: overrides.throttleInput ?? 1,
    averageDrivenWheelAngularVelocityRadiansPerSecond: overrides.averageOmega ?? 0,
    speedAlongSelectedGearMetersPerSecond: overrides.speed ?? 0,
  })
  return { state, total }
}

test("drive direction produces positive axle torque derived from the curve", () => {
  const { state, total } = updateActive(ACTIVE_SPEC)
  assert.ok(total > 0)
  // idle-floor lookup at standstill: raw 0, lookup clamped to idle 800.
  assert.equal(state.rawCoupledEngineRpm, 0)
  assert.equal(state.torqueLookupEngineRpm, ENGINE_PROFILE.idleRpm)
  assert.equal(state.engineOutputTorqueNewtonMeters, 100)
  const expected =
    100 * FORWARD_EFFECTIVE_RATIO * ACTIVE_SPEC.powertrainDrivetrainEfficiency01
  assert.ok(Math.abs(total - expected) < 1e-9)
})

test("reverse direction produces negative axle torque using the reverse ratio", () => {
  const { state, total } = updateActive(ACTIVE_SPEC, { gearDirection: -1 })
  assert.ok(total < 0)
  assert.equal(state.gearDirection, -1)
  const reverseRatio =
    Math.abs(TRANSMISSION_PROFILE.reverseGearRatio) *
    TRANSMISSION_PROFILE.finalDriveRatio
  const expected = 100 * reverseRatio * ACTIVE_SPEC.powertrainDrivetrainEfficiency01
  assert.ok(Math.abs(total + expected) < 1e-9)
})

test("neutral produces zero axle torque", () => {
  const { state, total } = updateActive(ACTIVE_SPEC, { gearDirection: 0 })
  assert.equal(total, 0)
  assert.equal(state.gearDirection, 0)
})

test("zero throttle produces no axle torque; half throttle halves it", () => {
  assert.equal(updateActive(ACTIVE_SPEC, { throttleInput: 0 }).total, 0)
  const full = updateActive(ACTIVE_SPEC, { throttleInput: 1 }).total
  const half = updateActive(ACTIVE_SPEC, { throttleInput: 0.5 }).total
  assert.ok(Math.abs(half - full / 2) < 1e-9)
})

test("throttle is clamped to [0,1]", () => {
  const over = updateActive(ACTIVE_SPEC, { throttleInput: 5 }).total
  const full = updateActive(ACTIVE_SPEC, { throttleInput: 1 }).total
  assert.ok(Math.abs(over - full) < 1e-9)
})

test("redline taper limits torque below the taper start, inside, and at/above", () => {
  const omegaForRpm = (rpm) => rpm / (RPM_PER_RAD * FORWARD_EFFECTIVE_RATIO)

  assert.equal(updateActive(ACTIVE_SPEC, { averageOmega: 1 }).state.redlineTorqueMultiplier01, 1)

  const inside = updateActive(ACTIVE_SPEC, { averageOmega: omegaForRpm(6100) }).state
  assert.ok(inside.redlineTorqueMultiplier01 > 0)
  assert.ok(inside.redlineTorqueMultiplier01 < 1)

  assert.equal(
    updateActive(ACTIVE_SPEC, { averageOmega: omegaForRpm(6510) }).state.redlineTorqueMultiplier01,
    0
  )
})

test("drivetrain efficiency is clamped to [0,1] and applied", () => {
  const over = updateActive({
    ...ACTIVE_SPEC,
    powertrainDrivetrainEfficiency01: 5,
  })
  assert.equal(over.state.drivetrainEfficiency01, 1)
  const atUnity = updateActive({
    ...ACTIVE_SPEC,
    powertrainDrivetrainEfficiency01: 1,
  }).total
  assert.ok(Math.abs(over.total - atUnity) < 1e-9)

  const under = updateActive({
    ...ACTIVE_SPEC,
    powertrainDrivetrainEfficiency01: -0.5,
  })
  assert.equal(under.state.drivetrainEfficiency01, 0)
  assert.equal(under.total, 0)
})

test("no drive past the selected-gear speed limiter", () => {
  const capped = updateActive(
    { ...ACTIVE_SPEC, maxForwardSpeedMetersPerSecond: 1 },
    { speed: 999 }
  )
  assert.equal(capped.total, 0)
})

test("engine profile samples are not mutated by the update", () => {
  const before = JSON.stringify(ENGINE_PROFILE.torqueCurveSamples)
  updateActive(ACTIVE_SPEC, { averageOmega: 47 })
  assert.equal(JSON.stringify(ENGINE_PROFILE.torqueCurveSamples), before)
})

test("telemetry is finite and JSON-serializable", () => {
  const { state } = updateActive(ACTIVE_SPEC, { averageOmega: 47 })
  assert.doesNotThrow(() => JSON.stringify(state))
  for (const [key, value] of Object.entries(state)) {
    if (typeof value === "number") {
      assert.ok(Number.isFinite(value), `finite ${key}`)
    }
  }
})

test("reset clears the torque telemetry to finite defaults", () => {
  const state = createPowertrainDriveTorqueState()
  updatePowertrainDriveTorqueSource({
    state,
    spec: ACTIVE_SPEC,
    engineProfile: ENGINE_PROFILE,
    transmissionProfile: TRANSMISSION_PROFILE,
    gearDirection: 1,
    throttleInput: 1,
  })
  resetPowertrainDriveTorqueState(state)
  assert.equal(state.totalAxleOutputTorqueNewtonMeters, 0)
  assert.equal(state.enabled, false)
  assert.doesNotThrow(() => JSON.stringify(state))
})
