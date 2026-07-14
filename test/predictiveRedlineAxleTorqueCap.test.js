// Focused unit coverage for computePredictiveRedlineAxleTorqueCap.
//
// Pure, deterministic helper: given the requested (uncapped) axle drive
// torque magnitude, the resolved per-wheel differential shares, entering-step
// wheel angular velocity, wheel inertia, fixed dt, redline, and effective
// drive ratio, it returns the maximum axle torque magnitude that the drive
// contribution alone may apply this step without advancing any driven wheel
// past the redline-consistent angular velocity.
//
// It is a staged numerical/controls bound, NOT an engine-inertia, clutch,
// torque-converter, shifting, or ECU fuel-cut model. Opposing contact/
// rolling/brake torque is intentionally ignored so the cap stays conservative.

import assert from "node:assert/strict"
import test from "node:test"

import { computePredictiveRedlineAxleTorqueCap } from "../src/vehicle/powertrain/createPowertrainDriveTorqueState.js"

const RPM_PER_RADIAN_PER_SECOND = 60 / (2 * Math.PI)
const REAR_EFFECTIVE_RATIO = 4.17 * 3.2
const REDLINE_RPM = 6800
const WHEEL_INERTIA_KG_METER_SQUARED = 1.2
const DT_SECONDS = 1 / 60

// Redline-consistent rear-wheel angular velocity for the default car.
const REDLINE_WHEEL_ANGULAR_VELOCITY =
  REDLINE_RPM /
  (RPM_PER_RADIAN_PER_SECOND * REAR_EFFECTIVE_RATIO)

function openPair(omegaRadiansPerSecond, share01 = 0.5) {
  return [
    {
      angularVelocityRadiansPerSecond: omegaRadiansPerSecond,
      wheelInertiaKgMeterSquared: WHEEL_INERTIA_KG_METER_SQUARED,
      share01,
    },
    {
      angularVelocityRadiansPerSecond: omegaRadiansPerSecond,
      wheelInertiaKgMeterSquared: WHEEL_INERTIA_KG_METER_SQUARED,
      share01: 1 - share01,
    },
  ]
}

function cap(overrides = {}) {
  return computePredictiveRedlineAxleTorqueCap({
    requestedAxleDriveTorqueMagnitudeNewtonMeters: 2000,
    gearDirection: 1,
    redlineRpm: REDLINE_RPM,
    effectiveDriveRatio: REAR_EFFECTIVE_RATIO,
    drivenWheelDescriptors: openPair(10),
    dtSeconds: DT_SECONDS,
    ...overrides,
  })
}

test("below-redline torque passes unchanged when the step headroom fits it", () => {
  const result = cap({ requestedAxleDriveTorqueMagnitudeNewtonMeters: 2000 })
  assert.ok(Number.isFinite(result.appliedAxleDriveTorqueMagnitudeNewtonMeters))
  assert.equal(result.appliedAxleDriveTorqueMagnitudeNewtonMeters, 2000)
  assert.equal(result.isPredictiveLimiterActive, false)
  assert.equal(result.predictiveLimiterReason, "none")
})

test("requested torque is reduced when it would overshoot redline", () => {
  // Wheel sits just below redline; a 5000 Nm request would leap past it
  // in one step, so the cap returns a smaller finite positive value.
  const result = cap({
    requestedAxleDriveTorqueMagnitudeNewtonMeters: 5000,
    drivenWheelDescriptors: openPair(REDLINE_WHEEL_ANGULAR_VELOCITY - 3),
  })
  assert.ok(result.appliedAxleDriveTorqueMagnitudeNewtonMeters < 5000)
  assert.ok(result.appliedAxleDriveTorqueMagnitudeNewtonMeters > 0)
  assert.equal(result.isPredictiveLimiterActive, true)
  assert.equal(result.predictiveLimiterReason, "redline-headroom")
})

test("exactly at redline produces zero positive drive torque", () => {
  const result = cap({
    drivenWheelDescriptors: openPair(REDLINE_WHEEL_ANGULAR_VELOCITY),
  })
  assert.equal(result.appliedAxleDriveTorqueMagnitudeNewtonMeters, 0)
  assert.equal(result.isPredictiveLimiterActive, true)
})

test("above redline produces zero positive drive torque", () => {
  const result = cap({
    drivenWheelDescriptors: openPair(REDLINE_WHEEL_ANGULAR_VELOCITY + 5),
  })
  assert.equal(result.appliedAxleDriveTorqueMagnitudeNewtonMeters, 0)
})

test("opposing gear direction is handled through directed angular velocity", () => {
  // Reverse: wheel spins negative, gearDirection -1 makes the directed
  // wheel speed positive, so a low reverse speed is far below the
  // redline-consistent magnitude and is not capped.
  const reverse = computePredictiveRedlineAxleTorqueCap({
    requestedAxleDriveTorqueMagnitudeNewtonMeters: 2000,
    gearDirection: -1,
    redlineRpm: REDLINE_RPM,
    effectiveDriveRatio: REAR_EFFECTIVE_RATIO,
    drivenWheelDescriptors: [
      {
        angularVelocityRadiansPerSecond: -10,
        wheelInertiaKgMeterSquared: WHEEL_INERTIA_KG_METER_SQUARED,
        share01: 0.5,
      },
      {
        angularVelocityRadiansPerSecond: -10,
        wheelInertiaKgMeterSquared: WHEEL_INERTIA_KG_METER_SQUARED,
        share01: 0.5,
      },
    ],
    dtSeconds: DT_SECONDS,
  })
  assert.equal(reverse.appliedAxleDriveTorqueMagnitudeNewtonMeters, 2000)
})

test("neutral requested magnitude is zero so the applied torque is zero", () => {
  const result = cap({
    requestedAxleDriveTorqueMagnitudeNewtonMeters: 0,
    gearDirection: 0,
  })
  assert.equal(result.appliedAxleDriveTorqueMagnitudeNewtonMeters, 0)
})

test("zero share is ignored safely and does not pollute the cap", () => {
  const descriptors = [
    {
      angularVelocityRadiansPerSecond: 20,
      wheelInertiaKgMeterSquared: WHEEL_INERTIA_KG_METER_SQUARED,
      share01: 0,
    },
    {
      angularVelocityRadiansPerSecond: 20,
      wheelInertiaKgMeterSquared: WHEEL_INERTIA_KG_METER_SQUARED,
      share01: 1,
    },
  ]
  const result = computePredictiveRedlineAxleTorqueCap({
    requestedAxleDriveTorqueMagnitudeNewtonMeters: 2000,
    gearDirection: 1,
    redlineRpm: REDLINE_RPM,
    effectiveDriveRatio: REAR_EFFECTIVE_RATIO,
    drivenWheelDescriptors: descriptors,
    dtSeconds: DT_SECONDS,
  })
  assert.ok(Number.isFinite(result.appliedAxleDriveTorqueMagnitudeNewtonMeters))
  assert.equal(result.appliedAxleDriveTorqueMagnitudeNewtonMeters, 2000)
})

test("asymmetric shares preserve the resolved split after capping", () => {
  const descriptors = [
    {
      angularVelocityRadiansPerSecond: 10,
      wheelInertiaKgMeterSquared: WHEEL_INERTIA_KG_METER_SQUARED,
      share01: 0.7,
    },
    {
      angularVelocityRadiansPerSecond: 10,
      wheelInertiaKgMeterSquared: WHEEL_INERTIA_KG_METER_SQUARED,
      share01: 0.3,
    },
  ]
  const result = computePredictiveRedlineAxleTorqueCap({
    requestedAxleDriveTorqueMagnitudeNewtonMeters: 2000,
    gearDirection: 1,
    redlineRpm: REDLINE_RPM,
    effectiveDriveRatio: REAR_EFFECTIVE_RATIO,
    drivenWheelDescriptors: descriptors,
    dtSeconds: DT_SECONDS,
  })
  // Both wheels are well below redline, so the requested magnitude is
  // preserved; the shares only matter at the axle-split stage.
  assert.equal(result.appliedAxleDriveTorqueMagnitudeNewtonMeters, 2000)
  assert.equal(result.isPredictiveLimiterActive, false)
})

test("non-finite and zero dt remain finite and safe", () => {
  for (const dt of [0, NaN, Infinity, -1 / 60]) {
    const result = cap({ dtSeconds: dt })
    assert.ok(
      Number.isFinite(result.appliedAxleDriveTorqueMagnitudeNewtonMeters),
      "finite for dt=" + dt
    )
  }
  // With no time to integrate, the conservative cap permits no step advance.
  const zeroDt = cap({ dtSeconds: 0 })
  assert.equal(zeroDt.appliedAxleDriveTorqueMagnitudeNewtonMeters, 0)
})

test("non-positive and non-finite wheel inertia remain finite and safe", () => {
  for (const inertia of [0, -1, NaN, Infinity]) {
    const result = computePredictiveRedlineAxleTorqueCap({
      requestedAxleDriveTorqueMagnitudeNewtonMeters: 2000,
      gearDirection: 1,
      redlineRpm: REDLINE_RPM,
      effectiveDriveRatio: REAR_EFFECTIVE_RATIO,
      drivenWheelDescriptors: [
        {
          angularVelocityRadiansPerSecond: REDLINE_WHEEL_ANGULAR_VELOCITY,
          wheelInertiaKgMeterSquared: inertia,
          share01: 0.5,
        },
        {
          angularVelocityRadiansPerSecond: REDLINE_WHEEL_ANGULAR_VELOCITY,
          wheelInertiaKgMeterSquared: inertia,
          share01: 0.5,
        },
      ],
      dtSeconds: DT_SECONDS,
    })
    assert.ok(
      Number.isFinite(result.appliedAxleDriveTorqueMagnitudeNewtonMeters),
      "finite for inertia=" + inertia
    )
  }
})

test("malformed redline fails closed to zero applied torque", () => {
  // No meaningful redline => the bound cannot be established, so the limiter
  // must NOT silently allow the full requested torque. It fails closed.
  const result = cap({ redlineRpm: 0, drivenWheelDescriptors: openPair(50) })
  assert.ok(Number.isFinite(result.appliedAxleDriveTorqueMagnitudeNewtonMeters))
  assert.equal(result.appliedAxleDriveTorqueMagnitudeNewtonMeters, 0)
  assert.equal(result.predictiveLimiterReason, "invalid-redline")
  assert.equal(result.isPredictiveLimiterActive, false)
})

test("malformed effective ratio fails closed to zero applied torque", () => {
  const result = cap({ effectiveDriveRatio: 0, drivenWheelDescriptors: openPair(50) })
  assert.ok(Number.isFinite(result.appliedAxleDriveTorqueMagnitudeNewtonMeters))
  assert.equal(result.appliedAxleDriveTorqueMagnitudeNewtonMeters, 0)
  assert.equal(result.predictiveLimiterReason, "invalid-effective-ratio")
  assert.equal(result.isPredictiveLimiterActive, false)
})

test("invalid dt fails closed with a reason", () => {
  const result = cap({ dtSeconds: 0, drivenWheelDescriptors: openPair(50) })
  assert.equal(result.appliedAxleDriveTorqueMagnitudeNewtonMeters, 0)
  assert.equal(result.predictiveLimiterReason, "invalid-dt")
})

test("neutral gear direction fails closed to zero", () => {
  const result = cap({
    requestedAxleDriveTorqueMagnitudeNewtonMeters: 3000,
    gearDirection: 0,
    drivenWheelDescriptors: openPair(50),
  })
  assert.equal(result.appliedAxleDriveTorqueMagnitudeNewtonMeters, 0)
  assert.equal(result.predictiveLimiterReason, "neutral")
})

test("reverse at redline produces zero positive drive torque", () => {
  // Wheel spinning at -redline (full reverse) with reverse gear: the directed
  // wheel speed reaches the redline-consistent magnitude, so headroom is zero.
  const result = computePredictiveRedlineAxleTorqueCap({
    requestedAxleDriveTorqueMagnitudeNewtonMeters: 3000,
    gearDirection: -1,
    redlineRpm: REDLINE_RPM,
    effectiveDriveRatio: REAR_EFFECTIVE_RATIO,
    drivenWheelDescriptors: [
      {
        angularVelocityRadiansPerSecond: -REDLINE_WHEEL_ANGULAR_VELOCITY,
        wheelInertiaKgMeterSquared: WHEEL_INERTIA_KG_METER_SQUARED,
        share01: 0.5,
      },
      {
        angularVelocityRadiansPerSecond: -REDLINE_WHEEL_ANGULAR_VELOCITY,
        wheelInertiaKgMeterSquared: WHEEL_INERTIA_KG_METER_SQUARED,
        share01: 0.5,
      },
    ],
    dtSeconds: DT_SECONDS,
  })
  assert.equal(result.appliedAxleDriveTorqueMagnitudeNewtonMeters, 0)
  assert.equal(result.predictiveLimiterReason, "redline-headroom")
})

test("invalid shares fail closed", () => {
  const result = computePredictiveRedlineAxleTorqueCap({
    requestedAxleDriveTorqueMagnitudeNewtonMeters: 2000,
    gearDirection: 1,
    redlineRpm: REDLINE_RPM,
    effectiveDriveRatio: REAR_EFFECTIVE_RATIO,
    drivenWheelDescriptors: [
      {
        angularVelocityRadiansPerSecond: 10,
        wheelInertiaKgMeterSquared: WHEEL_INERTIA_KG_METER_SQUARED,
        share01: 2,
      },
      {
        angularVelocityRadiansPerSecond: 10,
        wheelInertiaKgMeterSquared: WHEEL_INERTIA_KG_METER_SQUARED,
        share01: -1,
      },
    ],
    dtSeconds: DT_SECONDS,
  })
  assert.equal(result.appliedAxleDriveTorqueMagnitudeNewtonMeters, 0)
  assert.equal(result.predictiveLimiterReason, "invalid-shares")
})

test("a participating wheel with invalid inertia fails closed", () => {
  const result = computePredictiveRedlineAxleTorqueCap({
    requestedAxleDriveTorqueMagnitudeNewtonMeters: 2000,
    gearDirection: 1,
    redlineRpm: REDLINE_RPM,
    effectiveDriveRatio: REAR_EFFECTIVE_RATIO,
    drivenWheelDescriptors: [
      {
        angularVelocityRadiansPerSecond: 10,
        wheelInertiaKgMeterSquared: WHEEL_INERTIA_KG_METER_SQUARED,
        share01: 0.5,
      },
      {
        angularVelocityRadiansPerSecond: 10,
        wheelInertiaKgMeterSquared: 0,
        share01: 0.5,
      },
    ],
    dtSeconds: DT_SECONDS,
  })
  assert.equal(result.appliedAxleDriveTorqueMagnitudeNewtonMeters, 0)
  assert.equal(result.predictiveLimiterReason, "invalid-wheel-state")
})

test("missing driven wheels fails closed", () => {
  const empty = computePredictiveRedlineAxleTorqueCap({
    requestedAxleDriveTorqueMagnitudeNewtonMeters: 2000,
    gearDirection: 1,
    redlineRpm: REDLINE_RPM,
    effectiveDriveRatio: REAR_EFFECTIVE_RATIO,
    drivenWheelDescriptors: [],
    dtSeconds: DT_SECONDS,
  })
  assert.equal(empty.appliedAxleDriveTorqueMagnitudeNewtonMeters, 0)
  assert.equal(empty.predictiveLimiterReason, "missing-driven-wheels")

  const allZero = computePredictiveRedlineAxleTorqueCap({
    requestedAxleDriveTorqueMagnitudeNewtonMeters: 2000,
    gearDirection: 1,
    redlineRpm: REDLINE_RPM,
    effectiveDriveRatio: REAR_EFFECTIVE_RATIO,
    drivenWheelDescriptors: [
      {
        angularVelocityRadiansPerSecond: 10,
        wheelInertiaKgMeterSquared: WHEEL_INERTIA_KG_METER_SQUARED,
        share01: 0,
      },
      {
        angularVelocityRadiansPerSecond: 10,
        wheelInertiaKgMeterSquared: WHEEL_INERTIA_KG_METER_SQUARED,
        share01: 0,
      },
    ],
    dtSeconds: DT_SECONDS,
  })
  assert.equal(allZero.appliedAxleDriveTorqueMagnitudeNewtonMeters, 0)
  assert.equal(allZero.predictiveLimiterReason, "missing-driven-wheels")
})

test("one near-redline wheel with a larger share becomes the limiter", () => {
  // Wheel A: large share (0.7) and small headroom (2 rad/s). Wheel B: small
  // share (0.3) and large headroom. The smallest implied axle torque wins, so
  // wheel A binds the cap. The test computes the expected value directly from
  // the documented formula.
  const headroomA = 2
  const omegaA = REDLINE_WHEEL_ANGULAR_VELOCITY - headroomA
  const omegaB = 10
  const shareA = 0.7
  const shareB = 0.3
  const descriptors = [
    {
      angularVelocityRadiansPerSecond: omegaA,
      wheelInertiaKgMeterSquared: WHEEL_INERTIA_KG_METER_SQUARED,
      share01: shareA,
    },
    {
      angularVelocityRadiansPerSecond: omegaB,
      wheelInertiaKgMeterSquared: WHEEL_INERTIA_KG_METER_SQUARED,
      share01: shareB,
    },
  ]
  const result = computePredictiveRedlineAxleTorqueCap({
    requestedAxleDriveTorqueMagnitudeNewtonMeters: 10000,
    gearDirection: 1,
    redlineRpm: REDLINE_RPM,
    effectiveDriveRatio: REAR_EFFECTIVE_RATIO,
    drivenWheelDescriptors: descriptors,
    dtSeconds: DT_SECONDS,
  })
  const expectedWheelATorque =
    ((WHEEL_INERTIA_KG_METER_SQUARED * headroomA) / DT_SECONDS) / shareA
  const expectedWheelBTorque =
    ((WHEEL_INERTIA_KG_METER_SQUARED *
      (REDLINE_WHEEL_ANGULAR_VELOCITY - omegaB)) /
      DT_SECONDS) /
    shareB
  const expectedCap = Math.min(expectedWheelATorque, expectedWheelBTorque)
  assert.ok(
    Math.abs(
      result.maximumPredictiveAxleTorqueMagnitudeNewtonMeters - expectedCap
    ) < 1e-6
  )
  assert.ok(expectedWheelATorque < expectedWheelBTorque)
  assert.ok(result.appliedAxleDriveTorqueMagnitudeNewtonMeters < 10000)
  assert.equal(result.isPredictiveLimiterActive, true)
  assert.equal(result.predictiveLimiterReason, "redline-headroom")
})
