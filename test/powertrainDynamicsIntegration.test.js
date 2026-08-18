// test/powertrainDynamicsIntegration.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { createFlatTerrainContactQuery } from '../src/terrain/createFlatTerrainContactQuery.js'

const DT = 1 / 60
const FIRST_GEAR_RATIO = 4.17 * 3.2 // automatic-6 first gear * final drive

function makeController(specOverrides = {}, frictionCoefficient = 1.0) {
  return createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createFlatTerrainContactQuery({ frictionCoefficient }),
    spec: specOverrides,
  })
}

function rearDriveTorque(snapshot) {
  return snapshot.wheelStates
    .filter((w) => w.driven && w.axle === 'rear')
    .reduce((sum, w) => sum + Math.abs(w.requestedDriveTorqueNewtonMeters), 0)
}

test('automatic transmission upshifts to a higher gear under acceleration', () => {
  const controller = makeController({ automaticTransmissionEnabled: true })
  for (let i = 0; i < 160; i += 1) controller.update(DT, { throttle: true })
  const snap = controller.getSnapshot()
  assert.ok(snap.speedMetersPerSecond > 1, `expected motion, got ${snap.speedMetersPerSecond}`)
  assert.ok(
    snap.selectedForwardGearIndex > 0,
    `expected upshift, gear index ${snap.selectedForwardGearIndex}`
  )
  assert.ok(
    snap.effectiveDriveRatio < FIRST_GEAR_RATIO,
    `effective ratio should drop after upshift, got ${snap.effectiveDriveRatio}`
  )
})

test('automatic transmission is inert when disabled (first gear representative)', () => {
  const controller = makeController({})
  for (let i = 0; i < 160; i += 1) controller.update(DT, { throttle: true })
  const snap = controller.getSnapshot()
  assert.equal(snap.selectedForwardGearIndex, 0)
  assert.ok(Math.abs(snap.effectiveDriveRatio - FIRST_GEAR_RATIO) < 1e-6)
})

test('engine braking decelerates the vehicle faster when coasting', () => {
  function coastFinalSpeed(engineBraking) {
    const controller = makeController({ engineBrakingEnabled: engineBraking })
    for (let i = 0; i < 120; i += 1) controller.update(DT, { throttle: true })
    for (let i = 0; i < 60; i += 1) controller.update(DT, {}) // coast
    return controller.getSnapshot().speedMetersPerSecond
  }
  const withBraking = coastFinalSpeed(true)
  const withoutBraking = coastFinalSpeed(false)
  assert.ok(
    withBraking < withoutBraking,
    `engine braking should slow more: ${withBraking} vs ${withoutBraking}`
  )
})

test('clutch slip limits launch drive torque until engagement', () => {
  const controller = makeController({ clutchModelEnabled: true })
  // Disengage the clutch at standstill (no throttle, below engage speed).
  for (let i = 0; i < 20; i += 1) controller.update(DT, {})
  assert.ok(controller.getSnapshot().clutchEngagement01 < 0.2, 'clutch should disengage at rest')

  let earlyRearTorque = 0
  let earlyClutch = 1
  for (let i = 0; i < 5; i += 1) {
    const snap = controller.update(DT, { throttle: true })
    earlyRearTorque += rearDriveTorque(snap)
    earlyClutch = Math.min(earlyClutch, snap.clutchEngagement01)
  }
  earlyRearTorque /= 5

  // Let the clutch fully engage under sustained throttle.
  for (let i = 0; i < 50; i += 1) controller.update(DT, { throttle: true })
  const engagedSnap = controller.update(DT, { throttle: true })
  const engagedRearTorque = rearDriveTorque(engagedSnap)

  assert.ok(earlyClutch < 1, `clutch should ramp from disengaged, got ${earlyClutch}`)
  assert.ok(
    engagedRearTorque > earlyRearTorque,
    `rear drive torque should grow as clutch engages: ${earlyRearTorque} -> ${engagedRearTorque}`
  )
})

test('clutch is fully engaged immediately when disabled', () => {
  const controller = makeController({})
  const snap = controller.update(DT, { throttle: true })
  assert.equal(snap.clutchEngagement01, 1)
})

test('automatic transmission + clutch + engine braking compose without regressions', () => {
  const controller = makeController({
    automaticTransmissionEnabled: true,
    clutchModelEnabled: true,
    engineBrakingEnabled: true,
  })
  let moved = false
  for (let i = 0; i < 200; i += 1) {
    const snap = controller.update(DT, { throttle: true })
    if (snap.speedMetersPerSecond > 2) moved = true
  }
  assert.ok(moved, 'vehicle should still accelerate with all powertrain assists enabled')
})
