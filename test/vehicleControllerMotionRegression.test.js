// test/vehicleControllerMotionRegression.test.js

import assert from 'node:assert/strict'
import test from 'node:test'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'

test('locked rear differential still produces nonzero applied longitudinal tire force and forward chassis motion', () => {
  const controller = createVehicleController({
    vehicle: createCar(),
  })
  controller.setRearDifferentialType('locked')

  let snapshot = controller.getSnapshot()

  for (let index = 0; index < 8; index += 1) {
    snapshot = controller.update(1 / 60, { throttle: true })
  }

  const maximumDrivenWheelAppliedForceNewtons = snapshot.wheelStates
    .filter((wheelState) => wheelState.driven)
    .reduce(
      (maximumForceNewtons, wheelState) =>
        Math.max(
          maximumForceNewtons,
          Math.abs(wheelState.appliedLongitudinalForceNewtons)
        ),
      0
    )

  assert.ok(maximumDrivenWheelAppliedForceNewtons > 0)
  assert.ok(Math.abs(snapshot.forces.totalLongitudinalTireForceNewtons) > 0)
  assert.ok(snapshot.speedMetersPerSecond > 0)
  assert.ok(snapshot.position.z > 0)
})

test('locked rear differential preserves reverse-sign chassis motion under throttle in reverse gear', () => {
  const controller = createVehicleController({
    vehicle: createCar(),
  })
  controller.setRearDifferentialType('locked')
  controller.setGear('reverse')

  let snapshot = controller.getSnapshot()

  for (let index = 0; index < 8; index += 1) {
    snapshot = controller.update(1 / 60, { throttle: true })
  }

  const minimumDrivenWheelAppliedForceNewtons = snapshot.wheelStates
    .filter((wheelState) => wheelState.driven)
    .reduce(
      (minimumForceNewtons, wheelState) =>
        Math.min(minimumForceNewtons, wheelState.appliedLongitudinalForceNewtons),
      0
    )

  assert.ok(minimumDrivenWheelAppliedForceNewtons < 0)
  assert.ok(snapshot.signedForwardSpeedMetersPerSecond < 0)
  assert.ok(snapshot.position.z < 0)
})

test('controller reset clears differential coupling telemetry without dropping the selected mode', () => {
  const controller = createVehicleController({
    vehicle: createCar(),
  })
  controller.setRearDifferentialType('locked')

  for (let index = 0; index < 8; index += 1) {
    controller.update(1 / 60, { throttle: true })
  }

  const activeSnapshot = controller.getSnapshot()
  assert.equal(activeSnapshot.rearDifferentialType, 'locked')
  assert.equal(activeSnapshot.isRearDifferentialHardSpeedCouplingApplied, true)

  const resetSnapshot = controller.reset()

  assert.equal(resetSnapshot.rearDifferentialType, 'locked')
  assert.equal(resetSnapshot.rearDifferentialLeftCouplingTorqueNewtonMeters, 0)
  assert.equal(resetSnapshot.rearDifferentialRightCouplingTorqueNewtonMeters, 0)
  assert.equal(resetSnapshot.isRearDifferentialHardSpeedCouplingApplied, false)
})