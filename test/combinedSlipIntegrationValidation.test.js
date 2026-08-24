// test/combinedSlipIntegrationValidation.test.js
//
// Combined-slip tire model integration validation (v1).
//
// Compares the default friction-circle tire model (combinedSlipTireModelEnabled:
// false) against the Fiala/brush combined-slip model (combinedSlipTireModelEnabled:
// true) across deterministic driving scenarios at 60/120/240/480 Hz.
//
// This suite is a boundedness / regression guard and a model-comparison harness,
// NOT a proof of physical fidelity or numerical convergence. The 480 Hz run is a
// finer-step reference, not ground truth.
//
// KEY FINDING (this change): with the combined-slip model enabled, both models
// stay finite and timestep-bounded, but the combined model produces materially
// weaker high-slip longitudinal force. Under braking it does NOT reach a stop
// within the scenario durations (residual 2.7-3.9 m/s where the baseline stops
// at 0), and acceleration / cornering distances are larger. The kinetic-friction
// floor added alongside this harness addresses only the extreme-slip asymptote
// (slip ratio > ~7); it does not engage in these scenarios because slip ratios
// stay below ~2. Because the stopping-distance criterion is not acceptable, the
// default flag remains disabled. This harness lands the validation + findings;
// promotion is deferred to a follow-up that resolves the high-slip braking gap.

import assert from 'node:assert/strict'
import test from 'node:test'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import {
  createTerrainSurfaceProfile,
} from '../src/terrain/createTerrainSurfaceProfile.js'
import {
  createHeightfieldTerrainContactQuery,
} from '../src/terrain/createHeightfieldTerrainContactQuery.js'

const TIMESTEP_RATES_HZ = [60, 120, 240, 480]
const EXPECTED_WHEEL_COUNT = 4
const STOPPED_SPEED_METERS_PER_SECOND = 0.05

// --- Per-config invariants (regression guards, not correctness claims) ---
// Ceilings derived from a fresh baseline measurement plus modest headroom.
const MAX_ABS_SLIP_RATIO_CEILING = 5.0
const LATERAL_SLIP_ANGLE_CEILING_RADIANS = 1.6
const WHEEL_ANGULAR_VELOCITY_CEILING_RAD_PER_S = 500
const WHEEL_SURFACE_SPEED_CEILING_M_PER_S = 250

// --- Per-config timestep-sensitivity spreads (480 Hz reference, not truth) ---
const TIMESTEP_FINAL_SPEED_SPREAD_TOLERANCE_M_PER_S = 0.5
const TIMESTEP_FINAL_POSITION_SPREAD_TOLERANCE_M = 1.5
const TIMESTEP_FINAL_YAW_SPREAD_TOLERANCE_RAD = 0.3
const TIMESTEP_FINAL_YAW_RATE_SPREAD_TOLERANCE_RAD_PER_S = 0.1
const TIMESTEP_STOP_TIME_SPREAD_TOLERANCE_S = 0.6

// --- Cross-model divergence (combined vs baseline, same rate) ---
// Acceptance is "stable + bounded", NOT numeric equivalence: the two models are
// physically different, so these tolerances are intentionally wide and set from
// the observed divergence plus headroom. They catch a future blow-up, not the
// current gap (which is documented above and in the PR).
const CROSS_MODEL_FINAL_SPEED_TOLERANCE_M_PER_S = 4.5
const CROSS_MODEL_FINAL_POSITION_TOLERANCE_M = 12.5
const CROSS_MODEL_FINAL_YAW_TOLERANCE_RAD = 0.8
const CROSS_MODEL_FINAL_YAW_RATE_TOLERANCE_RAD_PER_S = 0.2
const CROSS_MODEL_RESIDUAL_SPEED_CEILING_M_PER_S = 5.0
// Combined-slip model must keep the friction circle emergent: |F| <= mu*Fz.
const COMBINED_FORCE_RATIO_CEILING = 1.001

const BASELINE_SPEC = Object.freeze({ combinedSlipTireModelEnabled: false })
const COMBINED_SPEC = Object.freeze({ combinedSlipTireModelEnabled: true })

const UNEVEN_TERRAIN_QUERY = createHeightfieldTerrainContactQuery({
  surfaceProfile: createTerrainSurfaceProfile(),
})

const SCENARIOS = {
  launch: {
    label: 'straight full-throttle launch from rest',
    durationSeconds: 3.0,
    terrainQuery: null,
    buildInput: () => ({ throttle: true }),
  },
  brakeAfterThrottle: {
    label: 'throttle then hard braking',
    durationSeconds: 4.0,
    terrainQuery: null,
    buildInput(timeSeconds) {
      return timeSeconds < 2.0 ? { throttle: true } : { brake: true }
    },
  },
  steadyCorner: {
    label: 'steady powered cornering',
    durationSeconds: 3.0,
    terrainQuery: null,
    buildInput: () => ({ throttle: true, left: true }),
  },
  combinedBrakeCorner: {
    label: 'braking while cornering',
    durationSeconds: 5.0,
    terrainQuery: null,
    buildInput(timeSeconds) {
      return timeSeconds < 2.0
        ? { throttle: true, left: true }
        : { brake: true, left: true }
    },
  },
  lowSpeedCorner: {
    label: 'low-speed powered cornering',
    durationSeconds: 2.0,
    terrainQuery: null,
    buildInput: () => ({ throttle: true, left: true }),
  },
  longThrottleThenBrake: {
    label: 'longer throttle then braking',
    durationSeconds: 6.0,
    terrainQuery: null,
    buildInput(timeSeconds) {
      return timeSeconds < 3.0 ? { throttle: true } : { brake: true }
    },
  },
  unevenTerrain: {
    label: 'uneven-terrain straight traversal',
    durationSeconds: 6.0,
    terrainQuery: UNEVEN_TERRAIN_QUERY,
    buildInput: () => ({ throttle: true }),
  },
}

function accumulateMaxAbs(currentMaxAbs, value) {
  return Math.max(currentMaxAbs, Math.abs(value))
}

function planarDistanceMeters(position) {
  return Math.hypot(position.x, position.z)
}

function wrappedAngleDeltaRadians(angleA, angleB) {
  return Math.atan2(
    Math.sin(angleA - angleB),
    Math.cos(angleA - angleB)
  )
}

function runScenarioAtRate(scenario, rateHz, spec) {
  const config = { vehicle: createCar(), spec }
  if (scenario.terrainQuery) config.terrainContactQuery = scenario.terrainQuery
  const controller = createVehicleController(config)

  const deltaTimeSeconds = 1 / rateHz
  const stepCount = Math.round(scenario.durationSeconds * rateHz)

  const metrics = {
    rateHz,
    stepCount,
    allFinite: true,
    minWheelCount: Number.POSITIVE_INFINITY,
    finalWheelCount: 0,
    maxAbsSlipRatio: 0,
    maxAbsLateralSlipAngleRadians: 0,
    maxAbsAngularVelocityRadPerS: 0,
    maxAbsWheelSurfaceSpeedMPerS: 0,
    maxCombinedForceRatio: 0,
    observedFloored: false,
    firstStoppedTimeSeconds: null,
    brakeStarted: false,
  }

  let latestSnapshot = null
  for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
    const stepStartTimeSeconds = stepIndex / rateHz
    const input = scenario.buildInput(stepStartTimeSeconds)
    latestSnapshot = controller.update(deltaTimeSeconds, input)

    const wheelStates = latestSnapshot.wheelStates
    metrics.minWheelCount = Math.min(metrics.minWheelCount, wheelStates.length)

    for (const wheel of wheelStates) {
      metrics.maxAbsSlipRatio = accumulateMaxAbs(
        metrics.maxAbsSlipRatio,
        wheel.longitudinalSlipRatio
      )
      metrics.maxAbsLateralSlipAngleRadians = accumulateMaxAbs(
        metrics.maxAbsLateralSlipAngleRadians,
        wheel.lateralSlipAngleRadians
      )
      metrics.maxAbsAngularVelocityRadPerS = accumulateMaxAbs(
        metrics.maxAbsAngularVelocityRadPerS,
        wheel.angularVelocityRadiansPerSecond
      )
      metrics.maxAbsWheelSurfaceSpeedMPerS = accumulateMaxAbs(
        metrics.maxAbsWheelSurfaceSpeedMPerS,
        wheel.wheelSurfaceSpeedMetersPerSecond
      )
      const limitNewtons = wheel.combinedTireForceLimitNewtons
      const magnitudeNewtons = wheel.combinedTireForceMagnitudeNewtons
      if (
        Number.isFinite(limitNewtons) &&
        limitNewtons > 0 &&
        Number.isFinite(magnitudeNewtons)
      ) {
        metrics.maxCombinedForceRatio = Math.max(
          metrics.maxCombinedForceRatio,
          magnitudeNewtons / limitNewtons
        )
      }
      if (wheel.isCombinedTireForceFloored === true) {
        metrics.observedFloored = true
      }
      if (
        !Number.isFinite(wheel.longitudinalSlipRatio) ||
        !Number.isFinite(wheel.lateralSlipAngleRadians) ||
        !Number.isFinite(wheel.angularVelocityRadiansPerSecond) ||
        !Number.isFinite(wheel.wheelSurfaceSpeedMetersPerSecond) ||
        !Number.isFinite(wheel.appliedLongitudinalForceNewtons) ||
        !Number.isFinite(wheel.appliedLateralTireForceNewtons)
      ) {
        metrics.allFinite = false
      }
    }

    if (
      !Number.isFinite(latestSnapshot.speedMetersPerSecond) ||
      !Number.isFinite(latestSnapshot.signedForwardSpeedMetersPerSecond) ||
      !Number.isFinite(latestSnapshot.yawRadians) ||
      !Number.isFinite(latestSnapshot.yawRateRadiansPerSecond) ||
      !Number.isFinite(latestSnapshot.position.x) ||
      !Number.isFinite(latestSnapshot.position.z)
    ) {
      metrics.allFinite = false
    }

    if (input.brake) metrics.brakeStarted = true
    const stepEndTimeSeconds = (stepIndex + 1) / rateHz
    const signedForwardSpeedMetersPerSecond =
      latestSnapshot.signedForwardSpeedMetersPerSecond
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
  metrics.finalYawRateRadiansPerSecond =
    latestSnapshot.yawRateRadiansPerSecond
  metrics.finalWheelCount = latestSnapshot.wheelStates.length
  metrics.residualSpeedMetersPerSecond = Math.abs(
    latestSnapshot.signedForwardSpeedMetersPerSecond
  )
  return metrics
}

function runConfigAcrossRates(scenario, spec) {
  const results = new Map()
  for (const rateHz of TIMESTEP_RATES_HZ) {
    results.set(rateHz, runScenarioAtRate(scenario, rateHz, spec))
  }
  return results
}

// --- Group A: per-config invariants (finite + bounded) at every rate ---
for (const [scenarioKey, scenario] of Object.entries(SCENARIOS)) {
  for (const [configKey, spec] of [
    ['baseline', BASELINE_SPEC],
    ['combined', COMBINED_SPEC],
  ]) {
    test(`invariants hold for ${scenario.label} [${configKey}] at every fixed timestep`, () => {
      for (const rateHz of TIMESTEP_RATES_HZ) {
        const m = runScenarioAtRate(scenario, rateHz, spec)
        const where = `${scenarioKey}/${configKey}@${rateHz}Hz`
        assert.ok(m.allFinite, `${where}: non-finite state detected`)
        assert.equal(
          m.minWheelCount,
          EXPECTED_WHEEL_COUNT,
          `${where}: wheel count dropped during run`
        )
        assert.equal(
          m.finalWheelCount,
          EXPECTED_WHEEL_COUNT,
          `${where}: final wheel count mismatch`
        )
        assert.ok(
          m.maxAbsSlipRatio < MAX_ABS_SLIP_RATIO_CEILING,
          `${where}: max |slip| ${m.maxAbsSlipRatio.toFixed(3)} exceeded ceiling`
        )
        assert.ok(
          m.maxAbsLateralSlipAngleRadians <
            LATERAL_SLIP_ANGLE_CEILING_RADIANS,
          `${where}: max lateral slip angle ${m.maxAbsLateralSlipAngleRadians.toFixed(
            3
          )} rad exceeded ceiling`
        )
        assert.ok(
          m.maxAbsAngularVelocityRadPerS <
            WHEEL_ANGULAR_VELOCITY_CEILING_RAD_PER_S,
          `${where}: max wheel angular velocity ${m.maxAbsAngularVelocityRadPerS.toFixed(
            1
          )} rad/s exceeded ceiling`
        )
        assert.ok(
          m.maxAbsWheelSurfaceSpeedMPerS <
            WHEEL_SURFACE_SPEED_CEILING_M_PER_S,
          `${where}: max wheel surface speed ${m.maxAbsWheelSurfaceSpeedMPerS.toFixed(
            1
          )} m/s exceeded ceiling`
        )
      }
    })
  }
}

// --- Group B: per-config timestep sensitivity (bounded spread) ---
for (const [scenarioKey, scenario] of Object.entries(SCENARIOS)) {
  for (const [configKey, spec] of [
    ['baseline', BASELINE_SPEC],
    ['combined', COMBINED_SPEC],
  ]) {
    test(`timestep sensitivity bounded for ${scenario.label} [${configKey}]`, () => {
      const results = runConfigAcrossRates(scenario, spec)
      const speeds = TIMESTEP_RATES_HZ.map(
        (r) => results.get(r).finalSpeedMetersPerSecond
      )
      const positions = TIMESTEP_RATES_HZ.map((r) =>
        planarDistanceMeters(results.get(r).finalPosition)
      )
      const yaws = TIMESTEP_RATES_HZ.map((r) => results.get(r).finalYawRadians)
      const yawRates = TIMESTEP_RATES_HZ.map(
        (r) => results.get(r).finalYawRateRadiansPerSecond
      )
      const stopTimes = TIMESTEP_RATES_HZ.map(
        (r) => results.get(r).firstStoppedTimeSeconds
      )

      const speedSpread = Math.max(...speeds) - Math.min(...speeds)
      const positionSpread = Math.max(...positions) - Math.min(...positions)
      const yawSpread = Math.max(...yaws) - Math.min(...yaws)
      const yawRateSpread = Math.max(...yawRates) - Math.min(...yawRates)
      assert.ok(
        speedSpread < TIMESTEP_FINAL_SPEED_SPREAD_TOLERANCE_M_PER_S,
        `${scenarioKey}/${configKey}: final-speed spread ${speedSpread.toFixed(
          3
        )} m/s`
      )
      assert.ok(
        positionSpread < TIMESTEP_FINAL_POSITION_SPREAD_TOLERANCE_M,
        `${scenarioKey}/${configKey}: final-position spread ${positionSpread.toFixed(
          3
        )} m`
      )
      assert.ok(
        yawSpread < TIMESTEP_FINAL_YAW_SPREAD_TOLERANCE_RAD,
        `${scenarioKey}/${configKey}: yaw spread ${yawSpread.toFixed(3)} rad`
      )
      assert.ok(
        yawRateSpread < TIMESTEP_FINAL_YAW_RATE_SPREAD_TOLERANCE_RAD_PER_S,
        `${scenarioKey}/${configKey}: yaw-rate spread ${yawRateSpread.toFixed(
          3
        )} rad/s`
      )
      if (stopTimes.every((t) => t !== null)) {
        const stopSpread = Math.max(...stopTimes) - Math.min(...stopTimes)
        assert.ok(
          stopSpread < TIMESTEP_STOP_TIME_SPREAD_TOLERANCE_S,
          `${scenarioKey}/${configKey}: stop-time spread ${stopSpread.toFixed(
            3
          )} s`
        )
      }
    })
  }
}

// --- Group C: cross-model comparison (combined vs baseline, same rate) ---
for (const [scenarioKey, scenario] of Object.entries(SCENARIOS)) {
  test(`combined-slip vs baseline bounded for ${scenario.label}`, () => {
    const baseline = runConfigAcrossRates(scenario, BASELINE_SPEC)
    const combined = runConfigAcrossRates(scenario, COMBINED_SPEC)
    for (const rateHz of TIMESTEP_RATES_HZ) {
      const b = baseline.get(rateHz)
      const c = combined.get(rateHz)
      const where = `${scenarioKey}@${rateHz}Hz`
      assert.ok(
        Math.abs(
          c.finalSpeedMetersPerSecond - b.finalSpeedMetersPerSecond
        ) < CROSS_MODEL_FINAL_SPEED_TOLERANCE_M_PER_S,
        `${where}: final-speed divergence ${Math.abs(
          c.finalSpeedMetersPerSecond - b.finalSpeedMetersPerSecond
        ).toFixed(3)} m/s`
      )
      const cPos = planarDistanceMeters(c.finalPosition)
      const bPos = planarDistanceMeters(b.finalPosition)
      assert.ok(
        Math.abs(cPos - bPos) < CROSS_MODEL_FINAL_POSITION_TOLERANCE_M,
        `${where}: final-position divergence ${Math.abs(cPos - bPos).toFixed(
          3
        )} m`
      )
      assert.ok(
        Math.abs(
          wrappedAngleDeltaRadians(c.finalYawRadians, b.finalYawRadians)
        ) < CROSS_MODEL_FINAL_YAW_TOLERANCE_RAD,
        `${where}: final-yaw divergence ${Math.abs(
          wrappedAngleDeltaRadians(c.finalYawRadians, b.finalYawRadians)
        ).toFixed(3)} rad`
      )
      assert.ok(
        Math.abs(
          c.finalYawRateRadiansPerSecond - b.finalYawRateRadiansPerSecond
        ) < CROSS_MODEL_FINAL_YAW_RATE_TOLERANCE_RAD_PER_S,
        `${where}: final-yaw-rate divergence ${Math.abs(
          c.finalYawRateRadiansPerSecond - b.finalYawRateRadiansPerSecond
        ).toFixed(3)} rad/s`
      )
      // Documented finding: when the baseline reaches a stop, the combined model
      // (weaker high-slip braking) may leave a bounded residual rather than an
      // identical stop. We guard the residual is finite and bounded, not equal.
      if (b.firstStoppedTimeSeconds !== null) {
        assert.ok(
          c.residualSpeedMetersPerSecond <
            CROSS_MODEL_RESIDUAL_SPEED_CEILING_M_PER_S,
          `${where}: combined residual ${c.residualSpeedMetersPerSecond.toFixed(
            3
          )} m/s after baseline stopped (expected bounded, not equal)`
        )
      }
    }
  })
}

// --- Group D: combined model keeps the friction circle emergent (|F| <= mu*Fz) ---
test('combined-slip model keeps combined tire force within the traction limit', () => {
  for (const [scenarioKey, scenario] of Object.entries(SCENARIOS)) {
    const results = runConfigAcrossRates(scenario, COMBINED_SPEC)
    for (const rateHz of TIMESTEP_RATES_HZ) {
      const ratio = results.get(rateHz).maxCombinedForceRatio
      assert.ok(
        ratio <= COMBINED_FORCE_RATIO_CEILING,
        `${scenarioKey}@${rateHz}Hz: combined force ratio ${ratio.toFixed(
          4
        )} exceeded mu*Fz (friction circle violation)`
      )
    }
  }
})
