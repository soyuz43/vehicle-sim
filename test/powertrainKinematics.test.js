// test/powertrainKinematics.test.js
//
// Focused coverage for the shared representative-ratio helpers introduced for
// the active powertrain drive-torque source. Active physics and RPM telemetry
// must select the same effective drive ratio, so both are exercised here and
// compared against computePowertrainKinematics.

import assert from "node:assert/strict"
import test from "node:test"

import {
  RPM_PER_RADIAN_PER_SECOND,
  selectRepresentativeForwardRatio,
  selectReverseDriveRatio,
  computeEffectiveDriveRatio,
  computePowertrainKinematics,
} from "../src/vehicle/powertrain/createPowertrainKinematics.js"

const MANUAL = Object.freeze({
  transmissionKind: "manual",
  forwardGearRatios: Object.freeze([3.45, 1.95, 1.3, 0.97]),
  reverseGearRatio: -3.17,
  finalDriveRatio: 3.91,
})

const CVT = Object.freeze({
  transmissionKind: "cvt",
  forwardGearRatios: Object.freeze([]),
  reverseGearRatio: -2.5,
  finalDriveRatio: 5.42,
  cvtMinRatio: 2.35,
  cvtMaxRatio: 0.39,
})

test("RPM_PER_RADIAN_PER_SECOND equals 60 / 2pi", () => {
  assert.ok(Math.abs(RPM_PER_RADIAN_PER_SECOND - 60 / (2 * Math.PI)) < 1e-12)
})

test("representative forward ratio is the first forward gear for a manual box", () => {
  assert.equal(selectRepresentativeForwardRatio(MANUAL), 3.45)
})

test("representative forward ratio is the cvt midpoint for a cvt", () => {
  assert.ok(Math.abs(selectRepresentativeForwardRatio(CVT) - (2.35 + 0.39) / 2) < 1e-12)
})

test("reverse drive ratio is the absolute reverse gear ratio", () => {
  assert.equal(selectReverseDriveRatio(MANUAL), 3.17)
  assert.equal(selectReverseDriveRatio(CVT), 2.5)
})

test("effective drive ratio multiplies the representative ratio by the final drive", () => {
  assert.ok(Math.abs(computeEffectiveDriveRatio(MANUAL, false) - 3.45 * 3.91) < 1e-12)
  assert.ok(Math.abs(computeEffectiveDriveRatio(MANUAL, true) - 3.17 * 3.91) < 1e-12)
})

test("active physics and telemetry select the same forward effective ratio", () => {
  const forward = computePowertrainKinematics({
    transmissionProfile: MANUAL,
    gearDirection: 1,
    averageDrivenWheelAngularVelocityRadiansPerSecond: 0,
  })
  assert.ok(Math.abs(forward.effectiveDriveRatio - computeEffectiveDriveRatio(MANUAL, false)) < 1e-12)
})

test("active physics and telemetry select the same reverse effective ratio", () => {
  const reverse = computePowertrainKinematics({
    transmissionProfile: MANUAL,
    gearDirection: -1,
    averageDrivenWheelAngularVelocityRadiansPerSecond: 0,
  })
  assert.ok(Math.abs(reverse.effectiveDriveRatio - computeEffectiveDriveRatio(MANUAL, true)) < 1e-12)
})

test("cvt telemetry and active ratio share the midpoint policy", () => {
  const cvt = computePowertrainKinematics({
    transmissionProfile: CVT,
    gearDirection: 1,
    averageDrivenWheelAngularVelocityRadiansPerSecond: 0,
  })
  assert.ok(Math.abs(cvt.effectiveDriveRatio - computeEffectiveDriveRatio(CVT, false)) < 1e-12)
})

test("neutral kinematics report a zero effective ratio without throwing", () => {
  const neutral = computePowertrainKinematics({
    transmissionProfile: MANUAL,
    gearDirection: 0,
    averageDrivenWheelAngularVelocityRadiansPerSecond: 0,
  })
  assert.equal(neutral.effectiveDriveRatio, 0)
})
