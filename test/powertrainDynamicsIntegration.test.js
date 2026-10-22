// test/powertrainDynamicsIntegration.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { createFlatTerrainContactQuery } from '../src/terrain/createFlatTerrainContactQuery.js'
import { DEFAULT_VEHICLE_SPEC } from '../src/vehicle/defaultVehicleSpec.js'
import {
  profileSupportsAutomaticShifting,
} from '../src/vehicle/powertrain/createPowertrainSelection.js'
import {
  TRANSMISSION_PROFILE_BY_ID,
} from '../src/vehicle/powertrain/createTransmissionProfiles.js'

const DT = 1 / 60
const FIRST_GEAR_RATIO = 4.17 * 3.2 // automatic-6 first gear * final drive
const MANUAL_6_FIRST_GEAR_RATIO = 3.55 * 3.73 // manual-6 first gear * final drive

function makeController(specOverrides = {}, frictionCoefficient = 1.0) {
  return createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createFlatTerrainContactQuery({ frictionCoefficient }),
    spec: specOverrides,
  })
}

function makeControllerWithTransmission(transmissionId, specOverrides = {}, frictionCoefficient = 1.0) {
  return createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createFlatTerrainContactQuery({ frictionCoefficient }),
    transmissionId,
    spec: specOverrides,
  })
}

function rearDriveTorque(snapshot) {
  return snapshot.wheelStates
    .filter((w) => w.driven && w.axle === 'rear')
    .reduce((sum, w) => sum + Math.abs(w.requestedDriveTorqueNewtonMeters), 0)
}

test('default vehicle spec enables automatic gear selection', () => {
  assert.equal(DEFAULT_VEHICLE_SPEC.automaticTransmissionEnabled, true)
})

test('default automatic transmission upshifts to a higher gear under acceleration', () => {
  const controller = makeController()
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
  const controller = makeController({ automaticTransmissionEnabled: false })
  for (let i = 0; i < 160; i += 1) controller.update(DT, { throttle: true })
  const snap = controller.getSnapshot()
  assert.equal(snap.selectedForwardGearIndex, 0)
  assert.ok(Math.abs(snap.effectiveDriveRatio - FIRST_GEAR_RATIO) < 1e-6)
})

test('manual transmission profile does not auto-shift even when the global flag is enabled', () => {
  const controller = makeControllerWithTransmission('manual-6', {
    automaticTransmissionEnabled: true,
  })
  const seenGearIndices = new Set()
  for (let i = 0; i < 300; i += 1) {
    const snap = controller.update(DT, { throttle: true })
    seenGearIndices.add(snap.selectedForwardGearIndex)
  }
  const snap = controller.getSnapshot()

  assert.equal(
    snap.transmissionProfile.supportsAutomaticShifting,
    false,
    'manual-6 must declare that it cannot auto-shift'
  )
  assert.deepEqual(
    [...seenGearIndices],
    [0],
    'manual-6 must stay in the first forward gear, saw ' + JSON.stringify([...seenGearIndices])
  )
  assert.equal(snap.selectedForwardGearIndex, 0)
  assert.ok(
    Math.abs(snap.effectiveDriveRatio - MANUAL_6_FIRST_GEAR_RATIO) < 1e-6,
    'manual-6 should hold its first gear ratio, got ' + snap.effectiveDriveRatio
  )
  assert.ok(
    snap.speedMetersPerSecond > 0.5,
    'manual-6 should still accelerate, got ' + snap.speedMetersPerSecond
  )
})

test('manual transmission profile does not auto-shift under the shipped default spec', () => {
  // The default spec has automaticTransmissionEnabled: true. The manual
  // profile's own capability must still suppress shifting.
  assert.equal(DEFAULT_VEHICLE_SPEC.automaticTransmissionEnabled, true)
  const controller = makeControllerWithTransmission('manual-6')
  for (let i = 0; i < 300; i += 1) controller.update(DT, { throttle: true })
  const snap = controller.getSnapshot()

  assert.equal(snap.selectedForwardGearIndex, 0)
  assert.ok(
    Math.abs(snap.effectiveDriveRatio - MANUAL_6_FIRST_GEAR_RATIO) < 1e-6,
    'manual-6 should hold its first gear ratio, got ' + snap.effectiveDriveRatio
  )
})

test('automatic transmission profile still auto-shifts under the same global flag', () => {
  const controller = makeControllerWithTransmission('automatic-6', {
    automaticTransmissionEnabled: true,
  })
  for (let i = 0; i < 160; i += 1) controller.update(DT, { throttle: true })
  const snap = controller.getSnapshot()

  assert.equal(snap.transmissionProfile.supportsAutomaticShifting, true)
  assert.ok(
    snap.selectedForwardGearIndex > 0,
    'automatic-6 should upshift, gear index ' + snap.selectedForwardGearIndex
  )
  assert.ok(
    snap.effectiveDriveRatio < FIRST_GEAR_RATIO,
    'effective ratio should drop after upshift, got ' + snap.effectiveDriveRatio
  )
})

test('manual and automatic profiles diverge under identical conditions', () => {
  function forwardGearIndexAfterAcceleration(transmissionId) {
    const controller = makeControllerWithTransmission(transmissionId, {
      automaticTransmissionEnabled: true,
    })
    for (let i = 0; i < 300; i += 1) controller.update(DT, { throttle: true })
    return controller.getSnapshot().selectedForwardGearIndex
  }

  assert.equal(forwardGearIndexAfterAcceleration('manual-6'), 0)
  assert.ok(forwardGearIndexAfterAcceleration('automatic-6') > 0)
})

test('profileSupportsAutomaticShifting reflects the shipped profile catalog', () => {
  for (const profile of Object.values(TRANSMISSION_PROFILE_BY_ID)) {
    const expected = profile.supportsAutomaticShifting === false ? false : true
    assert.equal(
      profileSupportsAutomaticShifting(profile),
      expected,
      'unexpected capability for ' + profile.transmissionId
    )
  }

  assert.equal(profileSupportsAutomaticShifting(TRANSMISSION_PROFILE_BY_ID['manual-6']), false)
  assert.equal(profileSupportsAutomaticShifting(TRANSMISSION_PROFILE_BY_ID['automatic-6']), true)
  assert.equal(profileSupportsAutomaticShifting(TRANSMISSION_PROFILE_BY_ID['dct-7']), true)
  assert.equal(profileSupportsAutomaticShifting(TRANSMISSION_PROFILE_BY_ID['cvt']), true)

  // A profile without the flag is treated as capable so an incomplete
  // profile cannot silently disable shifting.
  assert.equal(profileSupportsAutomaticShifting({ transmissionKind: 'automatic' }), true)
  assert.equal(profileSupportsAutomaticShifting(undefined), true)
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
