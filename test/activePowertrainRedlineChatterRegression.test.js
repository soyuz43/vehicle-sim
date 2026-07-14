import assert from "node:assert/strict"
import test from "node:test"

import { createCar } from "../src/car/createCar.js"
import { createVehicleController } from "../src/vehicle/createVehicleController.js"

// Regression guard for the predictive redline limiter.
//
// Before the corrective fix, the active drive-torque path resolved
// differential shares AFTER (and differently from) the predictive cap and fed
// Newton-meter axle torque directly into the force-domain share resolver. The
// resulting launch chattered at 60 Hz: rear-wheel angular velocity swung
// roughly 46 <-> 55 rad/s, raw engine RPM roughly 5860 <-> 7050, vehicle speed
// jittered about +/-1.7 m/s, and tail speed standard deviation was ~0.5 m/s.
//
// The corrected limiter resolves shares ONCE from the requested axle torque,
// converts only for dimensionless share selection (Option A: equivalent-force
// domain), uses those same shares for the cap and the applied split, and fails
// closed on invalid inputs. This test rejects the old oscillation and verifies
// stable, finite, timestep-insensitive behavior at 60/120/240/480 Hz.

const TIMESTEP_RATES_HZ = [60, 120, 240, 480]
const LAUNCH_DURATION_SECONDS = 3.0
const RPM_PER_RADIAN_PER_SECOND = 60 / (2 * Math.PI)
const TAIL_DURATION_SECONDS = 1.0

function runLaunch(rateHz) {
  const controller = createVehicleController({ vehicle: createCar() })
  controller.setGear("drive")
  const dt = 1 / rateHz
  const steps = Math.round(LAUNCH_DURATION_SECONDS * rateHz)
  const rearOmegaSeries = []
  const speedSeries = []
  let peakRearOmega = 0
  let peakRawRpm = 0
  let everyFinite = true
  for (let i = 0; i < steps; i += 1) {
    const snapshot = controller.update(dt, { throttle: true })
    const pt = snapshot.powertrainDriveTorque
    const rear = snapshot.wheelStates.filter((w) => w.axle === "rear")
    const omega = Math.max(
      ...rear.map((w) => Math.abs(w.angularVelocityRadiansPerSecond))
    )
    peakRearOmega = Math.max(peakRearOmega, omega)
    if (Number.isFinite(pt.rawCoupledEngineRpm)) {
      peakRawRpm = Math.max(peakRawRpm, pt.rawCoupledEngineRpm)
    }
    if (
      !Number.isFinite(omega) ||
      !Number.isFinite(snapshot.speedMetersPerSecond)
    ) {
      everyFinite = false
    }
    rearOmegaSeries.push(omega)
    speedSeries.push(snapshot.speedMetersPerSecond)
  }

  const finalSnapshot = controller.getSnapshot()
  const redlineRpm = finalSnapshot.powertrainDriveTorque.redlineRpm
  const effectiveDriveRatio =
    finalSnapshot.powertrainDriveTorque.effectiveDriveRatio
  const redlineWheelOmega =
    redlineRpm / (RPM_PER_RADIAN_PER_SECOND * effectiveDriveRatio)

  const tailCount = Math.round(TAIL_DURATION_SECONDS * rateHz)
  const tailOmega = rearOmegaSeries.slice(-tailCount)
  const tailSpeed = speedSeries.slice(-tailCount)
  const rangeOf = (arr) => Math.max(...arr) - Math.min(...arr)
  const stddevOf = (arr) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length
    return Math.sqrt(
      arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length
    )
  }

  return {
    rateHz,
    redlineRpm,
    redlineWheelOmega,
    peakRearOmega,
    peakRawRpm,
    everyFinite,
    tailOmegaRange: rangeOf(tailOmega),
    tailSpeedRange: rangeOf(tailSpeed),
    tailSpeedStd: stddevOf(tailSpeed),
  }
}

for (const rateHz of TIMESTEP_RATES_HZ) {
  test(`active launch at ${rateHz} Hz stays near redline without chatter`, () => {
    const m = runLaunch(rateHz)

    assert.ok(m.everyFinite, `${rateHz}Hz: all sampled state finite`)
    // Bounded near redline: the limiter holds the wheel just below the
    // redline-consistent speed; it must not spin toward the legacy ~908 rad/s.
    assert.ok(
      m.peakRearOmega < m.redlineWheelOmega + 15,
      `${rateHz}Hz: peak rear omega ${m.peakRearOmega.toFixed(
        2
      )} exceeded redline-consistent ${m.redlineWheelOmega.toFixed(2)} + 15`
    )
    // Raw engine RPM must not overshoot redline into the old 7050 chatter
    // band (old behavior reached ~7050 against a 6800 redline).
    assert.ok(
      m.peakRawRpm < m.redlineRpm + 200,
      `${rateHz}Hz: peak raw RPM ${m.peakRawRpm.toFixed(
        0
      )} exceeded redline ${m.redlineRpm} + 200`
    )
    // Tail (last 1 s) rear-wheel speed must be stable, not swinging ~9 rad/s
    // like the old 46 <-> 55 rad/s chatter.
    assert.ok(
      m.tailOmegaRange < 4,
      `${rateHz}Hz: tail rear-wheel omega range ${m.tailOmegaRange.toFixed(
        3
      )} rad/s exceeds stable bound (old chatter ~9)`
    )
    // Tail vehicle speed must not jitter ~3.4 m/s like the old +/-1.7 m/s.
    assert.ok(
      m.tailSpeedRange < 3.0,
      `${rateHz}Hz: tail vehicle-speed range ${m.tailSpeedRange.toFixed(
        3
      )} m/s exceeds stable bound (old chatter ~3.4)`
    )
    // Steady-state speed variation stays bounded (old stddev ~0.5).
    assert.ok(
      m.tailSpeedStd < 0.7,
      `${rateHz}Hz: tail speed stddev ${m.tailSpeedStd.toFixed(
        3
      )} m/s exceeds stable bound`
    )
  })
}

test("active launch limiter makes the peak rear-wheel speed timestep-insensitive", () => {
  const metrics = TIMESTEP_RATES_HZ.map((rateHz) => runLaunch(rateHz))
  for (const m of metrics) {
    assert.ok(m.everyFinite, `${m.rateHz}Hz: finite`)
  }
  const peakOmegas = metrics.map((m) => m.peakRearOmega)
  const spread = Math.max(...peakOmegas) - Math.min(...peakOmegas)
  // The corrective limiter removes the 60 Hz-specific runaway; peak speed must
  // not diverge wildly across rates (old 60 Hz chattered while finer rates did
  // not, producing a large spread).
  assert.ok(
    spread < 10,
    `peak rear-wheel omega spread across rates was ${spread.toFixed(
      2
    )} rad/s (regression guard 10)`
  )
})
