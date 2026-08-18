// test/powertrainDynamics.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  selectForwardGearIndexForSpeed,
  computeSelectedGearForwardRatio,
  computeClutchEngagement01,
  computeEngineBrakingTorqueNewtonMeters,
  updateEngineAngularVelocity,
} from '../src/vehicle/dynamics/powertrainDynamicsState.js'

const AUTOMATIC_6 = {
  transmissionKind: 'automatic',
  forwardGearRatios: [4.17, 2.34, 1.52, 1.14, 0.87, 0.69],
  finalDriveRatio: 3.2,
}

function rpmFor(wheelRps, gearIndex) {
  // rpm = wheel_rps * 60/(2pi) * ratio * finalDrive
  return (
    wheelRps * (60 / (2 * Math.PI)) *
    AUTOMATIC_6.forwardGearRatios[gearIndex] *
    AUTOMATIC_6.finalDriveRatio
  )
}

test('gear selection picks first gear at/near standstill', () => {
  assert.equal(
    selectForwardGearIndexForSpeed({
      wheelAngularVelocityRadiansPerSecond: 0,
      transmissionProfile: AUTOMATIC_6,
      downshiftRpm: 1500,
      redlineRpm: 6500,
    }),
    0
  )
})

test('gear selection upshifts as wheel speed rises', () => {
  // Find a wheel speed whose 1st-gear implied RPM exceeds redline, forcing a
  // higher gear. With finalDrive 3.2 and 1st ratio 4.17, rpm = w*60/2pi*13.34.
  // At w = 20 rad/s, 1st gear rpm ~ 2547 (in band -> gear 0). At w = 80 rad/s,
  // 1st gear rpm ~ 10190 (over redline) -> must upshift.
  const lowGear = selectForwardGearIndexForSpeed({
    wheelAngularVelocityRadiansPerSecond: 20,
    transmissionProfile: AUTOMATIC_6,
    downshiftRpm: 1500,
    redlineRpm: 6500,
  })
  const highGear = selectForwardGearIndexForSpeed({
    wheelAngularVelocityRadiansPerSecond: 80,
    transmissionProfile: AUTOMATIC_6,
    downshiftRpm: 1500,
    redlineRpm: 6500,
  })
  assert.equal(lowGear, 0)
  assert.ok(highGear > lowGear, `expected upshift, got ${lowGear} -> ${highGear}`)
})

test('selected gear ratio decreases as gear index increases', () => {
  assert.ok(
    computeSelectedGearForwardRatio(AUTOMATIC_6, 5) <
      computeSelectedGearForwardRatio(AUTOMATIC_6, 0)
  )
})

test('clutch engages and disengages over time', () => {
  let c = 0
  for (let i = 0; i < 30; i += 1) {
    c = computeClutchEngagement01({
      clutchEngagement01: c,
      commandedEngaged: true,
      engageRatePerSecond: 4,
      disengageRatePerSecond: 8,
      dt: 1 / 60,
    })
  }
  assert.ok(c > 0.9, `clutch should engage, got ${c}`)
  // Now disengage.
  for (let i = 0; i < 30; i += 1) {
    c = computeClutchEngagement01({
      clutchEngagement01: c,
      commandedEngaged: false,
      engageRatePerSecond: 4,
      disengageRatePerSecond: 8,
      dt: 1 / 60,
    })
  }
  assert.ok(c < 0.1, `clutch should disengage, got ${c}`)
})

test('engine braking increases with engine speed and clutch engagement', () => {
  const profile = {
    engineBrakingBaseTorqueNewtonMeters: 15,
    engineBrakingTorquePerRadPerSecond: 0.5,
  }
  const low = computeEngineBrakingTorqueNewtonMeters({
    engineProfile: profile,
    engineAngularVelocityRadiansPerSecond: 50,
    clutchEngagement01: 1,
  })
  const high = computeEngineBrakingTorqueNewtonMeters({
    engineProfile: profile,
    engineAngularVelocityRadiansPerSecond: 300,
    clutchEngagement01: 1,
  })
  const disengaged = computeEngineBrakingTorqueNewtonMeters({
    engineProfile: profile,
    engineAngularVelocityRadiansPerSecond: 300,
    clutchEngagement01: 0,
  })
  assert.ok(high > low, 'engine braking should grow with engine speed')
  assert.equal(disengaged, 0, 'disengaged clutch transmits no engine braking')
})

test('engine angular velocity integrates with inertia', () => {
  // Positive net torque should increase angular velocity.
  const omega = updateEngineAngularVelocity({
    engineAngularVelocityRadiansPerSecond: 100,
    netEngineTorqueNewtonMeters: 50,
    engineInertiaKgMeterSquared: 0.2,
    dt: 1 / 60,
  })
  assert.ok(omega > 100, `engine speed should increase, got ${omega}`)
})
