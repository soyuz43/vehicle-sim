// test/aeroAndTireThermal.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeAerodynamicVerticalForceNewtons,
  updateWheelTireThermalState,
} from '../src/vehicle/dynamics/aeroAndTireThermalState.js'

test('aero vertical force is zero at zero speed and grows with speed squared', () => {
  assert.equal(
    computeAerodynamicVerticalForceNewtons({
      speedMetersPerSecond: 0,
      downforceCoefficientNewtonsPerMeterSquared: 3,
    }),
    0
  )
  const low = computeAerodynamicVerticalForceNewtons({
    speedMetersPerSecond: 10,
    downforceCoefficientNewtonsPerMeterSquared: 3,
  })
  const high = computeAerodynamicVerticalForceNewtons({
    speedMetersPerSecond: 20,
    downforceCoefficientNewtonsPerMeterSquared: 3,
  })
  assert.ok(low > 0, 'downforce should add load')
  assert.ok(high > low * 3, 'force should scale with speed squared')
})

test('lift reduces vertical load (negative contribution)', () => {
  const lift = computeAerodynamicVerticalForceNewtons({
    speedMetersPerSecond: 20,
    downforceCoefficientNewtonsPerMeterSquared: 0,
    liftCoefficientNewtonsPerMeterSquared: 3,
  })
  assert.ok(lift < 0, 'lift should subtract load')
})

test('tire temperature rises with slip/scrub work and cools toward ambient', () => {
  const spec = {
    tireAmbientTemperatureCelsius: 25,
    tireOptimalTemperatureCelsius: 90,
    tireTemperatureRisePerWorkWatt: 0.0004,
    tireCoolingRatePerSecond: 0.03,
    tireWearPerWorkJoule: 1e-7,
    tireMuTempPenaltyPerDegree: 0.001,
    tireMuWearPenalty01: 0.3,
    tireMuMultiplierMin01: 0.5,
  }
  const wheel = {
    frictionCoefficient: 1,
    wheelSurfaceSpeedMetersPerSecond: 30,
    longitudinalGroundSpeedMetersPerSecond: 10,
    appliedLongitudinalForceNewtons: 2000,
    appliedLateralTireForceNewtons: 0,
    lateralSlipAngleRadians: 0,
    tireTemperatureCelsius: 25,
    tireWearFraction01: 0,
  }
  const hot = updateWheelTireThermalState(wheel, spec, 1)
  assert.ok(hot.tireTemperatureCelsius > 25, 'temperature should rise under slip work')
  assert.ok(hot.tireWearFraction01 > 0, 'wear should accumulate')

  // Now coast (no slip work): temperature should decay toward ambient.
  const cooled = updateWheelTireThermalState(
    { ...hot, wheelSurfaceSpeedMetersPerSecond: 10, longitudinalGroundSpeedMetersPerSecond: 10, appliedLongitudinalForceNewtons: 0 },
    spec,
    10
  )
  assert.ok(cooled.tireTemperatureCelsius < hot.tireTemperatureCelsius, 'temperature should cool')
  assert.ok(cooled.tireTemperatureCelsius > 25, 'should not overshoot below ambient')
})

test('tire mu multiplier degrades with temperature above optimal', () => {
  const spec = {
    tireAmbientTemperatureCelsius: 25,
    tireOptimalTemperatureCelsius: 90,
    tireTemperatureRisePerWorkWatt: 0,
    tireCoolingRatePerSecond: 0,
    tireWearPerWorkJoule: 0,
    tireMuTempPenaltyPerDegree: 0.001,
    tireMuWearPenalty01: 0,
    tireMuMultiplierMin01: 0.5,
  }
  const wheel = {
    frictionCoefficient: 1,
    wheelSurfaceSpeedMetersPerSecond: 10,
    longitudinalGroundSpeedMetersPerSecond: 10,
    appliedLongitudinalForceNewtons: 0,
    appliedLateralTireForceNewtons: 0,
    lateralSlipAngleRadians: 0,
    tireTemperatureCelsius: 25,
    tireWearFraction01: 0,
  }
  const hotWheel = { ...wheel, tireTemperatureCelsius: 150 }
  const result = updateWheelTireThermalState(hotWheel, spec, 0)
  assert.ok(result.tireMuMultiplier01 < 1, 'mu should drop when very hot')
  assert.ok(result.tireMuMultiplier01 >= 0.5, 'mu multiplier has a floor')
})
