// test/aeroAndTireThermalIntegration.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { createFlatTerrainContactQuery } from '../src/terrain/createFlatTerrainContactQuery.js'

const DT = 1 / 60

function makeController(specOverrides = {}, frictionCoefficient = 1.0) {
  return createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createFlatTerrainContactQuery({ frictionCoefficient }),
    spec: specOverrides,
  })
}

function totalNormalForce(snapshot) {
  return snapshot.wheelStates.reduce(
    (sum, w) => sum + Math.max(0, w.normalForceNewtons),
    0
  )
}

function maxTireTemperature(snapshot) {
  return snapshot.wheelStates.reduce(
    (max, w) => Math.max(max, w.tireTemperatureCelsius ?? 25),
    -Infinity
  )
}

test('aerodynamic downforce increases effective vertical load with speed', () => {
  const off = makeController({ aeroDownforceEnabled: false })
  const on = makeController({ aeroDownforceEnabled: true, aeroDownforceCoefficientNewtonsPerMeterSquared: 3 })
  for (let i = 0; i < 120; i += 1) {
    off.update(DT, { throttle: true })
    on.update(DT, { throttle: true })
  }
  // Downforce can only add load, never remove it (lift disabled).
  assert.ok(
    totalNormalForce(on.getSnapshot()) > totalNormalForce(off.getSnapshot()),
    'downforce should increase total vertical load'
  )
  const aeroLoad = on.getSnapshot().wheelStates[0].aeroVerticalForceNewtons
  assert.ok(aeroLoad > 0, 'front wheel should see a positive aero load')
})

test('aerodynamic lift reduces effective vertical load with speed', () => {
  const off = makeController({ aeroDownforceEnabled: false })
  const on = makeController({
    aeroDownforceEnabled: true,
    aeroDownforceCoefficientNewtonsPerMeterSquared: 0,
    aeroLiftCoefficientNewtonsPerMeterSquared: 3,
  })
  for (let i = 0; i < 120; i += 1) {
    off.update(DT, { throttle: true })
    on.update(DT, { throttle: true })
  }
  assert.ok(
    totalNormalForce(on.getSnapshot()) < totalNormalForce(off.getSnapshot()),
    'lift should reduce total vertical load'
  )
})

test('tire temperature rises under high-slip workload and wear accumulates', () => {
  const controller = makeController(
    { tireThermalModelEnabled: true },
    0.3 // low grip -> rear wheels spin under throttle
  )
  let peakTemp = 25
  let finalWear = 0
  for (let i = 0; i < 120; i += 1) {
    const snap = controller.update(DT, { throttle: true })
    peakTemp = Math.max(peakTemp, maxTireTemperature(snap))
    finalWear = snap.wheelStates.reduce(
      (m, w) => Math.max(m, w.tireWearFraction01 ?? 0),
      0
    )
  }
  assert.ok(peakTemp > 25, `tire temperature should rise above ambient, got ${peakTemp}`)
  assert.ok(finalWear > 0, 'tire wear should accumulate under workload')
})

test('tire temperature cools toward ambient when workload is removed', () => {
  const controller = makeController({ tireThermalModelEnabled: true }, 0.3)
  for (let i = 0; i < 120; i += 1) controller.update(DT, { throttle: true })
  const hotSnap = controller.getSnapshot()
  const hotTemp = maxTireTemperature(hotSnap)
  for (let i = 0; i < 120; i += 1) controller.update(DT, {}) // coast
  const coolTemp = maxTireTemperature(controller.getSnapshot())
  assert.ok(hotTemp > 25, 'tires should be hot after spinning')
  assert.ok(
    coolTemp < hotTemp,
    `tires should cool when coasting, ${hotTemp} -> ${coolTemp}`
  )
})

test('aero and thermal models are inert when disabled (default behavior)', () => {
  const controller = makeController({})
  const snap = controller.update(DT, { throttle: true })
  for (const w of snap.wheelStates) {
    assert.equal(w.aeroVerticalForceNewtons, 0)
    assert.equal(w.tireWearFraction01, 0)
    assert.ok(Math.abs((w.tireTemperatureCelsius ?? 25) - 25) < 1e-6)
  }
})
