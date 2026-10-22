// test/powertrainEngagedGearTelemetry.test.js
//
// Regression coverage for the powertrain telemetry gear/ratio/RPM seam.
//
// The estimated engine RPM is telemetry only, but it must describe the gear
// the driveline is actually engaged in. These tests pin that the reported
// gear index, gear label, effective drive ratio, and estimated engine RPM all
// follow the SAME engaged gear the active drive-torque source uses.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { createFlatTerrainContactQuery } from '../src/terrain/createFlatTerrainContactQuery.js'
import {
  RPM_PER_RADIAN_PER_SECOND,
  computePowertrainKinematics,
} from '../src/vehicle/powertrain/createPowertrainKinematics.js'
import {
  TRANSMISSION_PROFILE_BY_ID,
} from '../src/vehicle/powertrain/createTransmissionProfiles.js'

const DT = 1 / 60

function makeController(transmissionId, specOverrides = {}) {
  return createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createFlatTerrainContactQuery({ frictionCoefficient: 1.0 }),
    transmissionId,
    spec: specOverrides,
  })
}

// Analytic engine RPM for the gear the driveline is engaged in:
// wheel angular velocity x engaged gear ratio x final drive x 60 / 2pi,
// clamped to the same idle/redline bounds the telemetry applies.
function expectedEngineRpm(snapshot, profile) {
  const kinematics = snapshot.powertrainKinematics
  const engagedIndex = snapshot.selectedForwardGearIndex
  const ratio =
    profile.forwardGearRatios[engagedIndex] * profile.finalDriveRatio
  const omega =
    kinematics.averageDrivenWheelAngularVelocityRadiansPerSecond

  const raw =
    Math.abs(omega) * RPM_PER_RADIAN_PER_SECOND * ratio

  if (raw < kinematics.idleRpm) return kinematics.idleRpm
  if (kinematics.redlineRpm > 0 && raw > kinematics.redlineRpm) {
    return kinematics.redlineRpm
  }

  return raw
}

function assertRpmMatchesEngagedGear(snapshot, profile, tolerance = 0.05) {
  const kinematics = snapshot.powertrainKinematics
  const expected = expectedEngineRpm(snapshot, profile)

  assert.ok(
    expected > 0,
    'the analytic engine RPM must be positive for a comparison to be meaningful'
  )

  const relativeError =
    Math.abs(kinematics.estimatedEngineRpm - expected) / expected

  assert.ok(
    relativeError <= tolerance,
    `estimated engine RPM ${kinematics.estimatedEngineRpm} does not match the ` +
      `engaged-gear analytic value ${expected} (relative error ${relativeError})`
  )
}

test('the powertrain telemetry reports the gear the driveline is engaged in', () => {
  const controller = makeController('automatic-6')
  let snapshot = controller.getSnapshot()

  for (let step = 0; step < 300; step += 1) {
    snapshot = controller.update(DT, { throttle: true })
  }

  const kinematics = snapshot.powertrainKinematics
  const profile = TRANSMISSION_PROFILE_BY_ID['automatic-6']

  assert.ok(
    snapshot.selectedForwardGearIndex > 0,
    'the automatic box is expected to have upshifted by now'
  )
  assert.equal(kinematics.selectedForwardGearIndex, snapshot.selectedForwardGearIndex)
  assert.equal(kinematics.selectedForwardGearLabel, snapshot.forwardGearLabel)
  assert.equal(
    kinematics.effectiveDriveRatio,
    snapshot.effectiveDriveRatio,
    'the telemetry ratio must be the ratio the drive-torque source applied'
  )
  assertRpmMatchesEngagedGear(snapshot, profile)
})

test('a manual shift moves the engine RPM telemetry to the shifted gear', () => {
  const controller = makeController('manual-6')
  const profile = TRANSMISSION_PROFILE_BY_ID['manual-6']

  for (let step = 0; step < 60; step += 1) {
    controller.update(DT, { throttle: true })
  }

  controller.requestShiftUp()
  const snapshot = controller.update(DT, { throttle: true })
  const kinematics = snapshot.powertrainKinematics

  assert.equal(snapshot.selectedForwardGearIndex, 1)
  assert.equal(kinematics.selectedForwardGearIndex, 1)
  assert.equal(kinematics.selectedForwardGearLabel, '2')
  assert.equal(
    kinematics.effectiveDriveRatio,
    profile.forwardGearRatios[1] * profile.finalDriveRatio
  )
  assertRpmMatchesEngagedGear(snapshot, profile)

  // The first-gear ratio would produce a different RPM; the telemetry must
  // not report the first-gear value while the box is in second gear.
  const firstGearRpm =
    Math.abs(
      kinematics.averageDrivenWheelAngularVelocityRadiansPerSecond
    ) *
    RPM_PER_RADIAN_PER_SECOND *
    profile.forwardGearRatios[0] *
    profile.finalDriveRatio

  assert.ok(
    Math.abs(kinematics.estimatedEngineRpm - firstGearRpm) >
      Math.abs(kinematics.estimatedEngineRpm) * 0.05,
    'the telemetry must not fall back to the first-gear engine RPM'
  )
})

test('a manual override on an automatic box reports the overridden gear', () => {
  const controller = makeController('automatic-6')
  const profile = TRANSMISSION_PROFILE_BY_ID['automatic-6']

  for (let step = 0; step < 60; step += 1) {
    controller.update(DT, { throttle: true })
  }

  controller.requestShiftDown()
  const snapshot = controller.update(DT, { throttle: true })
  const kinematics = snapshot.powertrainKinematics

  assert.equal(kinematics.selectedForwardGearIndex, snapshot.selectedForwardGearIndex)
  assert.equal(kinematics.selectedForwardGearLabel, snapshot.forwardGearLabel)
  assert.equal(kinematics.effectiveDriveRatio, snapshot.effectiveDriveRatio)
  assertRpmMatchesEngagedGear(snapshot, profile)
})

test('the telemetry keeps following the engaged gear after an override expires', () => {
  const controller = makeController('automatic-6', {
    manualShiftOverrideTimeoutSeconds: 0.5,
  })
  const profile = TRANSMISSION_PROFILE_BY_ID['automatic-6']

  for (let step = 0; step < 60; step += 1) {
    controller.update(DT, { throttle: true })
  }

  controller.requestShiftDown()
  controller.update(DT, { throttle: true })

  const stepsToExpire = Math.ceil(0.5 / DT) + 2
  let snapshot = null
  for (let step = 0; step < stepsToExpire; step += 1) {
    snapshot = controller.update(DT, { throttle: true })
  }

  const kinematics = snapshot.powertrainKinematics

  assert.equal(snapshot.shiftMode, 'auto')
  assert.equal(kinematics.selectedForwardGearIndex, snapshot.selectedForwardGearIndex)
  assert.equal(kinematics.selectedForwardGearLabel, snapshot.forwardGearLabel)
  assertRpmMatchesEngagedGear(snapshot, profile)
})

test('the reported engine RPM uses the engaged gear ratio, not the first gear', () => {
  const profile = TRANSMISSION_PROFILE_BY_ID['manual-6']
  const omega = 40

  const secondGear = computePowertrainKinematics({
    transmissionProfile: profile,
    gearDirection: 1,
    averageDrivenWheelAngularVelocityRadiansPerSecond: omega,
    selectedForwardGearIndex: 1,
  })

  const expected =
    Math.abs(omega) *
    RPM_PER_RADIAN_PER_SECOND *
    profile.forwardGearRatios[1] *
    profile.finalDriveRatio

  assert.equal(secondGear.selectedForwardGearLabel, '2')
  assert.ok(
    Math.abs(secondGear.estimatedEngineRpm - expected) / expected < 1e-12,
    'the estimated RPM must be the engaged gear ratio times the wheel speed'
  )
  assert.ok(
    secondGear.estimatedEngineRpm <
      Math.abs(omega) *
        RPM_PER_RADIAN_PER_SECOND *
        profile.forwardGearRatios[0] *
        profile.finalDriveRatio,
    'the second-gear RPM must be lower than the first-gear RPM at the same speed'
  )
})