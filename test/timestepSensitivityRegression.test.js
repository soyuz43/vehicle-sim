// test/timestepSensitivityRegression.test.js
//
// C2 timestep-sensitivity regression suite.
//
// This suite runs deterministic vehicle-controller scenarios at several fixed
// timesteps and compares the results. It is a multi-rate comparison and a
// boundedness / regression guard, NOT a proof of numerical convergence or
// physical fidelity. The 480 Hz run is used only as a finer-step reference,
// not as ground truth. Known artifacts (timestep-dependent hard-braking slip
// overshoot, a stopping-state discrepancy across rates, and large sustained
// wheelspin angular velocity) are intentionally left in place; the guards here
// detect material worsening rather than certifying the current behavior.

import assert from 'node:assert/strict'
import test from 'node:test'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'

const TIMESTEP_RATES_HZ = [60, 120, 240, 480]
const REFERENCE_RATE_HZ = 480
const NON_REFERENCE_RATES_HZ = TIMESTEP_RATES_HZ.filter(
  (rateHz) => rateHz !== REFERENCE_RATE_HZ
)
const EXPECTED_WHEEL_COUNT = 4

// Test-only stopped condition. The controller snapshot exposes no canonical
// vehicle-level "stopped" boolean, so this suite documents its own threshold on
// absolute forward speed. Production stop logic is not changed.
const STOPPED_SPEED_METERS_PER_SECOND = 0.05

// Corruption / runaway guards. Values come from a fresh baseline measurement
// plus headroom; passing them does NOT make the current behavior realistic.
// Baseline peaks (default car, these scenarios): wheel angular velocity
// ~908 rad/s, wheel surface speed ~436 m/s, |slip| ~1.71.
const WHEEL_ANGULAR_VELOCITY_CEILING_RADIANS_PER_SECOND = 1100
const WHEEL_SURFACE_SPEED_CEILING_METERS_PER_SECOND = 600
const SLIP_CORRUPTION_CEILING = 3.0

// Braking regression guards. The 60 Hz hard-braking transient currently
// overshoots to |slip| ~1.25 (short brake) and ~1.71 (long brake); these
// ceilings detect worsening without asserting the overshoot itself is correct.
const BRAKE_PEAK_SLIP_CEILING = 2.0
const BRAKE_RESIDUAL_SPEED_CEILING_METERS_PER_SECOND = 0.5
// The stopping state is a known timestep-sensitive artifact. We bound the
// absolute spread of first-stop times (never a relative error against zero
// speed) rather than asserting convergence. Baseline spread ~0.48 s.
const STOP_TIME_SPREAD_CEILING_SECONDS = 2.0

// Sensitivity tolerances vs the 480 Hz reference. Baseline worst-case (60 Hz)
// divergences are far smaller than these bounds: launch speed ~0.014 m/s,
// launch planar position ~0.003 m, corner speed ~0.006 m/s, corner planar
// position ~0.012 m, corner yaw and yaw rate ~0.0021. Headroom guards against
// floating-point noise while still catching material (order-of-magnitude)
// timestep-sensitivity regressions.
const LAUNCH_FINAL_SPEED_ABS_TOLERANCE_METERS_PER_SECOND = 0.1
const LAUNCH_PLANAR_POSITION_TOLERANCE_METERS = 0.1
const CORNER_FINAL_SPEED_ABS_TOLERANCE_METERS_PER_SECOND = 0.1
const CORNER_PLANAR_POSITION_TOLERANCE_METERS = 0.1
const CORNER_YAW_TOLERANCE_RADIANS = 0.03
const CORNER_YAW_RATE_TOLERANCE_RADIANS_PER_SECOND = 0.03

function accumulateMaxAbs(currentMaxAbs, value) {
  return Math.max(currentMaxAbs, Math.abs(value))
}

function wrappedAngleDeltaRadians(angleARadians, angleBRadians) {
  return Math.atan2(
    Math.sin(angleARadians - angleBRadians),
    Math.cos(angleARadians - angleBRadians)
  )
}

function planarDistanceMeters(positionA, positionB) {
  const deltaXMeters = positionA.x - positionB.x
  const deltaZMeters = positionA.z - positionB.z
  return Math.sqrt(deltaXMeters * deltaXMeters + deltaZMeters * deltaZMeters)
}

// Each scenario returns the input object for a step given the simulated time at
// the START of that step. Transition times land on an exact integer step at
// every rate (durationSeconds*rate and transitionSeconds*rate are integers for
// 60/120/240/480 Hz), so every rate receives the identical physical input
// schedule with no off-by-one drift.
const SCENARIOS = {
  launch: {
    label: 'full-throttle launch from rest',
    durationSeconds: 3.0,
    locked: false,
    buildInput: () => ({ throttle: true }),
  },
  brakeAfterThrottle: {
    label: 'throttle then hard braking',
    durationSeconds: 4.0,
    locked: false,
    buildInput(timeSeconds) {
      return timeSeconds < 2.0 ? { throttle: true } : { brake: true }
    },
  },
  corner: {
    label: 'low-speed powered cornering',
    durationSeconds: 2.0,
    locked: false,
    buildInput: () => ({ throttle: true, left: true }),
  },
  longThrottleThenBrake: {
    label: 'longer throttle then braking',
    durationSeconds: 6.0,
    locked: false,
    buildInput(timeSeconds) {
      return timeSeconds < 3.0 ? { throttle: true } : { brake: true }
    },
  },
}

function runScenarioAtRate(scenario, rateHz) {
  const controller = createVehicleController({ vehicle: createCar() })
  if (scenario.locked) {
    controller.setRearDifferentialType('locked')
  }

  const deltaTimeSeconds = 1 / rateHz
  const stepCount = Math.round(scenario.durationSeconds * rateHz)

  const metrics = {
    rateHz,
    stepCount,
    allFinite: true,
    minWheelCount: Number.POSITIVE_INFINITY,
    maxAbsSlipRatio: 0,
    maxAbsAngularVelocityRadiansPerSecond: 0,
    maxAbsWheelSurfaceSpeedMetersPerSecond: 0,
    brakeStarted: false,
    firstStoppedTimeSeconds: null,
  }

  let latestSnapshot = null

  for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
    const stepStartTimeSeconds = stepIndex / rateHz
    const input = scenario.buildInput(stepStartTimeSeconds)
    latestSnapshot = controller.update(deltaTimeSeconds, input)

    const postIntegration =
      latestSnapshot.vehicleDynamicsStepTrace.stages.postIntegration
    metrics.minWheelCount = Math.min(
      metrics.minWheelCount,
      postIntegration.wheels.length
    )

    for (const wheelTrace of postIntegration.wheels) {
      // Slip ratio, ground speed, and wheel surface speed are the pre-integration
      // slip sample (identical in both C1 stages). Angular velocity is the final
      // post-integration value after rotational integration and rear-differential
      // coupling, so wheel-speed monitoring deliberately reads this stage.
      metrics.maxAbsSlipRatio = accumulateMaxAbs(
        metrics.maxAbsSlipRatio,
        wheelTrace.longitudinalSlipRatio
      )
      metrics.maxAbsAngularVelocityRadiansPerSecond = accumulateMaxAbs(
        metrics.maxAbsAngularVelocityRadiansPerSecond,
        wheelTrace.angularVelocityRadiansPerSecond
      )
      metrics.maxAbsWheelSurfaceSpeedMetersPerSecond = accumulateMaxAbs(
        metrics.maxAbsWheelSurfaceSpeedMetersPerSecond,
        wheelTrace.wheelSurfaceSpeedMetersPerSecond
      )

      if (
        !Number.isFinite(wheelTrace.longitudinalSlipRatio) ||
        !Number.isFinite(wheelTrace.longitudinalGroundSpeedMetersPerSecond) ||
        !Number.isFinite(wheelTrace.wheelSurfaceSpeedMetersPerSecond) ||
        !Number.isFinite(wheelTrace.angularVelocityRadiansPerSecond) ||
        !Number.isFinite(wheelTrace.netTorqueNewtonMeters)
      ) {
        metrics.allFinite = false
      }
    }

    const signedForwardSpeedMetersPerSecond =
      latestSnapshot.signedForwardSpeedMetersPerSecond
    if (
      !Number.isFinite(latestSnapshot.speedMetersPerSecond) ||
      !Number.isFinite(signedForwardSpeedMetersPerSecond) ||
      !Number.isFinite(latestSnapshot.yawRadians) ||
      !Number.isFinite(latestSnapshot.yawRateRadiansPerSecond) ||
      !Number.isFinite(latestSnapshot.position.x) ||
      !Number.isFinite(latestSnapshot.position.z)
    ) {
      metrics.allFinite = false
    }

    if (input.brake) {
      metrics.brakeStarted = true
    }
    const stepEndTimeSeconds = (stepIndex + 1) / rateHz
    if (
      metrics.brakeStarted &&
      metrics.firstStoppedTimeSeconds === null &&
      Math.abs(signedForwardSpeedMetersPerSecond) <
        STOPPED_SPEED_METERS_PER_SECOND
    ) {
      metrics.firstStoppedTimeSeconds = stepEndTimeSeconds
    }
  }

  metrics.finalSpeedMetersPerSecond = latestSnapshot.speedMetersPerSecond
  metrics.finalSignedForwardSpeedMetersPerSecond =
    latestSnapshot.signedForwardSpeedMetersPerSecond
  metrics.finalPosition = {
    x: latestSnapshot.position.x,
    z: latestSnapshot.position.z,
  }
  metrics.finalYawRadians = latestSnapshot.yawRadians
  metrics.finalYawRateRadiansPerSecond = latestSnapshot.yawRateRadiansPerSecond
  metrics.finalWheelCount = latestSnapshot.wheelStates.length
  metrics.residualSpeedMetersPerSecond = Math.abs(
    latestSnapshot.signedForwardSpeedMetersPerSecond
  )

  return metrics
}

function runScenarioAcrossRates(scenario) {
  const resultsByRate = new Map()
  for (const rateHz of TIMESTEP_RATES_HZ) {
    resultsByRate.set(rateHz, runScenarioAtRate(scenario, rateHz))
  }
  return resultsByRate
}

// --- Invariant assertions: finite + bounded at every rate and scenario ---

for (const [scenarioKey, scenario] of Object.entries(SCENARIOS)) {
  test(`invariants hold for ${scenario.label} at every fixed timestep`, () => {
    for (const rateHz of TIMESTEP_RATES_HZ) {
      const metrics = runScenarioAtRate(scenario, rateHz)
      const where = `${scenarioKey}@${rateHz}Hz`

      assert.equal(
        metrics.stepCount,
        Math.round(scenario.durationSeconds * rateHz),
        `${where}: executed step count must equal duration*rate`
      )
      assert.ok(metrics.allFinite, `${where}: all sampled state must be finite`)
      assert.equal(
        metrics.finalWheelCount,
        EXPECTED_WHEEL_COUNT,
        `${where}: snapshot wheel count must remain ${EXPECTED_WHEEL_COUNT}`
      )
      assert.equal(
        metrics.minWheelCount,
        EXPECTED_WHEEL_COUNT,
        `${where}: trace wheel count must remain ${EXPECTED_WHEEL_COUNT}`
      )
      assert.ok(
        metrics.maxAbsAngularVelocityRadiansPerSecond <
          WHEEL_ANGULAR_VELOCITY_CEILING_RADIANS_PER_SECOND,
        `${where}: |wheel angular velocity| ${metrics.maxAbsAngularVelocityRadiansPerSecond.toFixed(
          2
        )} rad/s exceeded runaway guard ${WHEEL_ANGULAR_VELOCITY_CEILING_RADIANS_PER_SECOND} (guard only; not a realism claim)`
      )
      assert.ok(
        metrics.maxAbsWheelSurfaceSpeedMetersPerSecond <
          WHEEL_SURFACE_SPEED_CEILING_METERS_PER_SECOND,
        `${where}: |wheel surface speed| ${metrics.maxAbsWheelSurfaceSpeedMetersPerSecond.toFixed(
          2
        )} m/s exceeded runaway guard ${WHEEL_SURFACE_SPEED_CEILING_METERS_PER_SECOND}`
      )
      assert.ok(
        metrics.maxAbsSlipRatio < SLIP_CORRUPTION_CEILING,
        `${where}: |slip ratio| ${metrics.maxAbsSlipRatio.toFixed(
          3
        )} exceeded corruption guard ${SLIP_CORRUPTION_CEILING}`
      )
    }
  })
}

// --- Launch endpoint sensitivity + convergence reporting ---

test('full-throttle launch endpoint stays within timestep-sensitivity bounds', () => {
  const results = runScenarioAcrossRates(SCENARIOS.launch)
  const reference = results.get(REFERENCE_RATE_HZ)

  const speedErrors = NON_REFERENCE_RATES_HZ.map((rateHz) => ({
    rateHz,
    absoluteErrorMetersPerSecond: Math.abs(
      results.get(rateHz).finalSpeedMetersPerSecond -
        reference.finalSpeedMetersPerSecond
    ),
  }))
  const report = speedErrors
    .map(
      (entry) =>
        `${entry.rateHz}Hz Δspeed=${entry.absoluteErrorMetersPerSecond.toFixed(
          4
        )} m/s`
    )
    .join(', ')

  for (const entry of speedErrors) {
    assert.ok(
      entry.absoluteErrorMetersPerSecond <
        LAUNCH_FINAL_SPEED_ABS_TOLERANCE_METERS_PER_SECOND,
      `launch final speed at ${entry.rateHz}Hz diverged from ${REFERENCE_RATE_HZ}Hz reference ${reference.finalSpeedMetersPerSecond.toFixed(
        4
      )} m/s by ${entry.absoluteErrorMetersPerSecond.toFixed(
        4
      )} m/s (tolerance ${LAUNCH_FINAL_SPEED_ABS_TOLERANCE_METERS_PER_SECOND}); observed: ${report}`
    )
  }

  for (const rateHz of NON_REFERENCE_RATES_HZ) {
    const positionErrorMeters = planarDistanceMeters(
      results.get(rateHz).finalPosition,
      reference.finalPosition
    )
    assert.ok(
      positionErrorMeters < LAUNCH_PLANAR_POSITION_TOLERANCE_METERS,
      `launch final planar position at ${rateHz}Hz diverged by ${positionErrorMeters.toFixed(
        4
      )} m (tolerance ${LAUNCH_PLANAR_POSITION_TOLERANCE_METERS})`
    )
  }
})

// --- Cornering endpoint sensitivity (planar + yaw) ---

test('low-speed powered cornering endpoint stays within timestep-sensitivity bounds', () => {
  const results = runScenarioAcrossRates(SCENARIOS.corner)
  const reference = results.get(REFERENCE_RATE_HZ)

  // Confirm the scenario actually produced yaw/lateral motion (not longitudinal-only).
  assert.ok(
    Math.abs(reference.finalYawRadians) > 0.05,
    `corner reference yaw ${reference.finalYawRadians.toFixed(
      4
    )} rad should be clearly nonzero`
  )

  for (const rateHz of NON_REFERENCE_RATES_HZ) {
    const metrics = results.get(rateHz)

    const speedError = Math.abs(
      metrics.finalSpeedMetersPerSecond - reference.finalSpeedMetersPerSecond
    )
    assert.ok(
      speedError < CORNER_FINAL_SPEED_ABS_TOLERANCE_METERS_PER_SECOND,
      `corner final speed at ${rateHz}Hz diverged by ${speedError.toFixed(
        4
      )} m/s (tolerance ${CORNER_FINAL_SPEED_ABS_TOLERANCE_METERS_PER_SECOND})`
    )

    const positionError = planarDistanceMeters(
      metrics.finalPosition,
      reference.finalPosition
    )
    assert.ok(
      positionError < CORNER_PLANAR_POSITION_TOLERANCE_METERS,
      `corner final planar position at ${rateHz}Hz diverged by ${positionError.toFixed(
        4
      )} m (tolerance ${CORNER_PLANAR_POSITION_TOLERANCE_METERS})`
    )

    const yawError = Math.abs(
      wrappedAngleDeltaRadians(
        metrics.finalYawRadians,
        reference.finalYawRadians
      )
    )
    assert.ok(
      yawError < CORNER_YAW_TOLERANCE_RADIANS,
      `corner final yaw at ${rateHz}Hz diverged by ${yawError.toFixed(
        4
      )} rad (tolerance ${CORNER_YAW_TOLERANCE_RADIANS})`
    )

    const yawRateError = Math.abs(
      metrics.finalYawRateRadiansPerSecond -
        reference.finalYawRateRadiansPerSecond
    )
    assert.ok(
      yawRateError < CORNER_YAW_RATE_TOLERANCE_RADIANS_PER_SECOND,
      `corner final yaw rate at ${rateHz}Hz diverged by ${yawRateError.toFixed(
        4
      )} rad/s (tolerance ${CORNER_YAW_RATE_TOLERANCE_RADIANS_PER_SECOND})`
    )
  }
})

// --- Braking: peak slip + residual speed regression guards ---

test('hard braking peak slip and residual speed stay within regression guards', () => {
  const results = runScenarioAcrossRates(SCENARIOS.brakeAfterThrottle)

  for (const rateHz of TIMESTEP_RATES_HZ) {
    const metrics = results.get(rateHz)
    // Regression guard, not a physical-validity claim: the 60 Hz braking
    // transient currently overshoots slip, so this ceiling detects worsening.
    assert.ok(
      metrics.maxAbsSlipRatio < BRAKE_PEAK_SLIP_CEILING,
      `brake peak |slip| at ${rateHz}Hz was ${metrics.maxAbsSlipRatio.toFixed(
        4
      )} (regression ceiling ${BRAKE_PEAK_SLIP_CEILING}; not a validity claim)`
    )
    assert.ok(
      metrics.residualSpeedMetersPerSecond <
        BRAKE_RESIDUAL_SPEED_CEILING_METERS_PER_SECOND,
      `brake residual speed at ${rateHz}Hz was ${metrics.residualSpeedMetersPerSecond.toFixed(
        4
      )} m/s (ceiling ${BRAKE_RESIDUAL_SPEED_CEILING_METERS_PER_SECOND})`
    )
    assert.ok(
      metrics.firstStoppedTimeSeconds !== null,
      `brake at ${rateHz}Hz never reached the stopped threshold (${STOPPED_SPEED_METERS_PER_SECOND} m/s) within ${SCENARIOS.brakeAfterThrottle.durationSeconds}s`
    )
  }
})

// --- Longer throttle-then-brake: stop reached; stopping state is timestep-sensitive ---

test('longer throttle-then-brake reaches a stop at every rate and records bounded stopping-state sensitivity', () => {
  const results = runScenarioAcrossRates(SCENARIOS.longThrottleThenBrake)

  const stopTimes = TIMESTEP_RATES_HZ.map((rateHz) => {
    const metrics = results.get(rateHz)
    assert.ok(
      metrics.firstStoppedTimeSeconds !== null,
      `longBrake at ${rateHz}Hz never reached the stopped threshold within ${SCENARIOS.longThrottleThenBrake.durationSeconds}s`
    )
    assert.ok(
      metrics.maxAbsSlipRatio < BRAKE_PEAK_SLIP_CEILING,
      `longBrake peak |slip| at ${rateHz}Hz was ${metrics.maxAbsSlipRatio.toFixed(
        4
      )} (regression ceiling ${BRAKE_PEAK_SLIP_CEILING})`
    )
    return { rateHz, stopTimeSeconds: metrics.firstStoppedTimeSeconds }
  })

  // The stopping state is a known timestep-sensitive artifact; record it as an
  // absolute spread of first-stop times (never a relative error against zero
  // speed) and only guard that the spread stays bounded, not that it converges.
  const stopTimeValues = stopTimes.map((entry) => entry.stopTimeSeconds)
  const stopTimeSpreadSeconds =
    Math.max(...stopTimeValues) - Math.min(...stopTimeValues)
  const report = stopTimes
    .map((entry) => `${entry.rateHz}Hz=${entry.stopTimeSeconds.toFixed(3)}s`)
    .join(', ')
  assert.ok(
    stopTimeSpreadSeconds < STOP_TIME_SPREAD_CEILING_SECONDS,
    `longBrake stop-time spread ${stopTimeSpreadSeconds.toFixed(
      3
    )}s exceeded bounded-sensitivity guard ${STOP_TIME_SPREAD_CEILING_SECONDS}s (${report})`
  )
})
