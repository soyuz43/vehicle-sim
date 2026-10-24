// test/engineDrivetrainControllerRegression.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { createFlatTerrainContactQuery } from '../src/terrain/createFlatTerrainContactQuery.js'

const DT_SECONDS = 1 / 60

function makeController({
  initialGear = 'drive',
  transmissionId = 'automatic-6',
  spec = {},
} = {}) {
  return createVehicleController({
    vehicle: createCar(),
    initialGear,
    transmissionId,
    terrainContactQuery: createFlatTerrainContactQuery({ frictionCoefficient: 1 }),
    spec: {
      engineDrivetrainModelEnabled: true,
      throttleResponseTimeSeconds: 0,
      throttleReleaseTimeSeconds: 0,
      manualShiftCooldownSeconds: 0,
      ...spec,
    },
  })
}

function rearDrivenWheelStates(snapshot) {
  return snapshot.wheelStates.filter(
    (wheelState) => wheelState.driven && wheelState.axle === 'rear'
  )
}

test('engine drivetrain sends clutch torque through ratios and differential shares', () => {
  const snapshot = makeController().update(DT_SECONDS, { throttle: true })
  const rearWheels = rearDrivenWheelStates(snapshot)
  const gearRatio = snapshot.transmissionProfile.forwardGearRatios[
    snapshot.selectedForwardGearIndex
  ]
  const expectedAxleTorqueNewtonMeters =
    snapshot.clutchTorqueNewtonMeters *
    gearRatio *
    snapshot.transmissionProfile.finalDriveRatio *
    snapshot.spec.powertrainDrivetrainEfficiency01

  assert.ok(snapshot.clutchTorqueNewtonMeters > 0)
  assert.ok(expectedAxleTorqueNewtonMeters > 0)
  assert.ok(
    Math.abs(snapshot.totalAxleDriveTorqueNewtonMeters - expectedAxleTorqueNewtonMeters) < 1e-6,
    'axle torque should be clutch torque times gear, final drive, and efficiency'
  )
  assert.equal(rearWheels.length, 2)
  for (const wheelState of rearWheels) {
    assert.ok(
      Math.abs(wheelState.requestedDriveTorqueNewtonMeters - expectedAxleTorqueNewtonMeters / 2) < 1e-6,
      'each open-differential wheel should receive half of the axle torque'
    )
  }
})

test('reverse clutch reaction opposes engine rotation independent of gear direction', () => {
  const reverseSnapshot = makeController({ initialGear: 'reverse' }).update(
    DT_SECONDS,
    { throttle: true }
  )
  const neutralSnapshot = makeController({ initialGear: 'neutral' }).update(
    DT_SECONDS,
    { throttle: true }
  )

  assert.ok(reverseSnapshot.clutchTorqueNewtonMeters > 0)
  assert.ok(
    reverseSnapshot.engineAngularVelocityRadiansPerSecond <
      neutralSnapshot.engineAngularVelocityRadiansPerSecond,
    'reverse clutch load should reduce engine acceleration instead of adding to it'
  )
})

test('gentle throttle in neutral does not pull engine below idle', () => {
  const controller = makeController({
    initialGear: 'neutral',
    spec: { throttleResponseTimeSeconds: 0.3 },
  })
  const engineProfile = controller.getSnapshot().engineProfile
  const idleOmegaRadiansPerSecond = engineProfile.idleRpm * (Math.PI * 2) / 60
  const snapshot = controller.update(DT_SECONDS, { throttle: true })

  assert.ok(snapshot.throttleInput > 0 && snapshot.throttleInput < 1)
  assert.ok(
    snapshot.engineAngularVelocityRadiansPerSecond >= idleOmegaRadiansPerSecond,
    'net negative torque after pumping drag should not lower neutral idle speed'
  )
})

test('engine pumping drag reaches the wheels as negative torque while coasting', () => {
  const controller = makeController({ spec: { engineBrakingEnabled: true } })
  for (let step = 0; step < 180; step += 1) {
    controller.update(DT_SECONDS, { throttle: true })
  }

  let coastSnapshot
  let transmittedEngineBraking = false
  for (let step = 0; step < 30; step += 1) {
    coastSnapshot = controller.update(DT_SECONDS, {})
    if (
      coastSnapshot.clutchTorqueNewtonMeters < 0 &&
      coastSnapshot.totalAxleDriveTorqueNewtonMeters < 0
    ) {
      transmittedEngineBraking = true
      break
    }
  }

  assert.equal(coastSnapshot.throttleInput, 0)
  assert.ok(coastSnapshot.speedMetersPerSecond > 0.1)
  assert.ok(transmittedEngineBraking, 'pumping drag should reach the wheels through the clutch')
})

test('new drivetrain ordering preserves tire-road reaction torque on driven wheels', () => {
  const controller = makeController()
  controller.update(DT_SECONDS, { throttle: true })
  const snapshot = controller.update(DT_SECONDS, { throttle: true })
  const rearWheels = rearDrivenWheelStates(snapshot)

  assert.equal(rearWheels.length, 2)
  for (const wheelState of rearWheels) {
    assert.ok(wheelState.appliedLongitudinalForceNewtons > 0)
    assert.ok(wheelState.contactReactionTorqueNewtonMeters < 0)
    assert.ok(
      Math.abs(
        wheelState.contactReactionTorqueNewtonMeters +
        wheelState.appliedLongitudinalForceNewtons * wheelState.effectiveTireRollingRadiusMeters
      ) < 1e-6
    )
  }
})

test('automatic gear reporting and manual downshift use the resolved gear', () => {
  const controller = makeController()
  for (let step = 0; step < 220; step += 1) {
    controller.update(DT_SECONDS, { throttle: true })
  }

  const snapshot = controller.getSnapshot()
  const resolvedAutomaticGearIndex =
    snapshot.powertrainKinematics.selectedForwardGearIndex
  assert.ok(resolvedAutomaticGearIndex > 0, 'expected the automatic transmission to upshift')
  assert.equal(snapshot.selectedForwardGearIndex, resolvedAutomaticGearIndex)

  const afterDownshiftRequest = controller.requestShiftDown()
  assert.equal(
    afterDownshiftRequest.selectedForwardGearIndex,
    resolvedAutomaticGearIndex - 1
  )
})

test('CVT remains on its supported legacy powertrain path when the engine model is enabled', () => {
  const controller = makeController({ transmissionId: 'cvt' })
  let snapshot
  for (let step = 0; step < 90; step += 1) {
    snapshot = controller.update(DT_SECONDS, { throttle: true })
  }

  const drivenWheels = snapshot.wheelStates.filter((wheelState) => wheelState.driven)
  const averageDrivenWheelOmegaRadiansPerSecond = drivenWheels.reduce(
    (sumRadiansPerSecond, wheelState) =>
      sumRadiansPerSecond + wheelState.angularVelocityRadiansPerSecond,
    0
  ) / drivenWheels.length
  const expectedEngineRpm = Math.min(
    snapshot.engineProfile.redlineRpm,
    Math.max(
      snapshot.engineProfile.idleRpm,
      Math.abs(averageDrivenWheelOmegaRadiansPerSecond) *
        60 / (Math.PI * 2) *
        snapshot.powertrainKinematics.effectiveDriveRatio
    )
  )

  assert.equal(snapshot.powertrainKinematics.selectedRatioKind, 'cvt')
  assert.ok(snapshot.totalAxleDriveTorqueNewtonMeters > 0)
  assert.ok(snapshot.speedMetersPerSecond > 0)
  assert.equal(snapshot.clutchSlipRadiansPerSecond, 0)
  assert.ok(
    Math.abs(snapshot.powertrainKinematics.estimatedEngineRpm - expectedEngineRpm) < 1e-6
  )
})

test('engine RPM telemetry follows integrated engine speed in neutral and clutch slip', () => {
  const neutralController = makeController({ initialGear: 'neutral' })
  let neutralSnapshot
  for (let step = 0; step < 60; step += 1) {
    neutralSnapshot = neutralController.update(DT_SECONDS, { throttle: true })
  }
  const neutralEngineRpm =
    neutralSnapshot.engineAngularVelocityRadiansPerSecond * 60 / (Math.PI * 2)
  assert.ok(neutralEngineRpm > neutralSnapshot.engineProfile.idleRpm)
  assert.ok(
    Math.abs(neutralSnapshot.powertrainKinematics.estimatedEngineRpm - neutralEngineRpm) < 1e-6
  )

  const slippingController = makeController()
  let slippingSnapshot
  for (let step = 0; step < 12; step += 1) {
    slippingSnapshot = slippingController.update(DT_SECONDS, { throttle: true })
  }
  const slippingEngineRpm =
    slippingSnapshot.engineAngularVelocityRadiansPerSecond * 60 / (Math.PI * 2)
  assert.ok(slippingSnapshot.clutchSlipRadiansPerSecond > 1)
  assert.ok(
    Math.abs(slippingSnapshot.powertrainKinematics.estimatedEngineRpm - slippingEngineRpm) < 1e-6
  )
})

test('drivetrain physical identifiers retain explicit units', () => {
  const controllerSource = readFileSync(
    new URL('../src/vehicle/VehicleController.js', import.meta.url),
    'utf8'
  )
  const drivetrainSource = readFileSync(
    new URL('../src/vehicle/powertrain/createEngineDrivetrainState.js', import.meta.url),
    'utf8'
  )

  assert.match(
    controllerSource,
    /const engineOmegaRadiansPerSecond\s*=\s*state\.engineDrivetrain\.engineOmegaRadiansPerSecond/
  )
  assert.match(controllerSource, /const interpolatedTorqueNewtonMeters =/)
  assert.doesNotMatch(
    controllerSource,
    /const engineOmega = state.engineDrivetrain.engineOmegaRadiansPerSecond/
  )
  assert.doesNotMatch(controllerSource, /const interpolatedTorque =/)
  assert.match(drivetrainSource, /const safeEngineOmegaRadiansPerSecond = sanitizeFinite/)
  assert.doesNotMatch(drivetrainSource, /const engineOmega = sanitizeFinite/)
})

test('drivetrain hot loops reuse wheel and torque scratch state', () => {
  const controllerSource = readFileSync(
    new URL('../src/vehicle/VehicleController.js', import.meta.url),
    'utf8'
  )
  const drivetrainSource = readFileSync(
    new URL('../src/vehicle/powertrain/createEngineDrivetrainState.js', import.meta.url),
    'utf8'
  )
  const engineStep = controllerSource.match(
    /function updateEngineDrivetrainState\(dtSeconds\) {([\s\S]*?)\n    }\n\n    function computeAverageDrivenWheelAngularVelocityRadiansPerSecond\(\)/
  )
  const averageWheelSpeed = controllerSource.match(
    /function computeAverageDrivenWheelAngularVelocityRadiansPerSecond\(\) {([\s\S]*?)\n    }\n\n    function captureDynamicsStepTraceStage/
  )

  assert.ok(engineStep, 'expected to locate the engine drivetrain hot loop')
  assert.ok(averageWheelSpeed, 'expected to locate the driven-wheel average loop')
  assert.doesNotMatch(engineStep[1], /\.filter\(/)
  assert.doesNotMatch(averageWheelSpeed[1], /\.filter\(/)
  assert.match(controllerSource, /REAR_DIFFERENTIAL_EQUAL_SHARES/)
  assert.match(controllerSource, /result: engineDrivetrainClutchResult/)
  assert.match(drivetrainSource, /result = undefined/)
  assert.match(drivetrainSource, /return clutchResult/)
})
