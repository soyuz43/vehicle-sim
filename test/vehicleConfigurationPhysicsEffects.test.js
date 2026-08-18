// test/vehicleConfigurationPhysicsEffects.test.js

import assert from 'node:assert/strict'
import test from 'node:test'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { applyVehicleConfiguration } from '../src/vehicle/config/applyVehicleConfiguration.js'
import {
  createDefaultVehicleConfiguration,
  setVehicleConfigurationSlot,
} from '../src/vehicle/config/createVehicleConfiguration.js'

function buildController(configuration) {
  const applied = applyVehicleConfiguration(configuration)
  return createVehicleController({
    vehicle: createCar(),
    spec: applied.spec,
    engineId: applied.engineId,
    transmissionId: applied.transmissionId,
  })
}

function withSlot(slot, componentId) {
  return setVehicleConfigurationSlot(createDefaultVehicleConfiguration(), slot, componentId)
}

function settle(configuration) {
  const controller = buildController(configuration)
  let snapshot = controller.getSnapshot()
  for (let index = 0; index < 120; index += 1) {
    snapshot = controller.update(1 / 60, {})
  }
  return snapshot
}

function accelerate(configuration, stepCount) {
  const controller = buildController(configuration)
  let snapshot = controller.getSnapshot()
  for (let index = 0; index < stepCount; index += 1) {
    snapshot = controller.update(1 / 60, { throttle: true })
  }
  return snapshot
}

test('heavier chassis reduces straight-line acceleration (mass -> acceleration)', () => {
  const light = accelerate(withSlot('chassis', 'chassis-lightroadster'), 40)
  const heavy = accelerate(withSlot('chassis', 'chassis-heavytruck'), 40)

  assert.ok(light.speedMetersPerSecond > heavy.speedMetersPerSecond)
  assert.ok(
    light.planarAccelerationLocalForwardMetersPerSecondSquared >
      heavy.planarAccelerationLocalForwardMetersPerSecondSquared
  )
})

test('suspension baseline offset changes static ride height', () => {
  const lowered = settle(withSlot('suspension', 'susp-lowered')).chassisTerrainSupport
    .currentChassisSupportHeightMeters
  const stock = settle(withSlot('suspension', 'susp-stock')).chassisTerrainSupport
    .currentChassisSupportHeightMeters
  const lifted = settle(withSlot('suspension', 'susp-lifted')).chassisTerrainSupport
    .currentChassisSupportHeightMeters

  assert.ok(lowered < stock)
  assert.ok(stock < lifted)
  assert.ok(Math.abs(lowered - -0.06) < 1e-6)
  assert.ok(Math.abs(lifted - 0.07) < 1e-6)
})

test('aero drag coefficient and frontal area increase drag at speed', () => {
  const brick = accelerate(withSlot('aero', 'aero-brick'), 150)
  const slip = accelerate(withSlot('aero', 'aero-slippery'), 150)

  const brickDragFactor = brick.aerodynamicDrag.dragForceNewtons / (brick.speedMetersPerSecond * brick.speedMetersPerSecond)
  const slipDragFactor = slip.aerodynamicDrag.dragForceNewtons / (slip.speedMetersPerSecond * slip.speedMetersPerSecond)

  assert.ok(brick.aerodynamicDrag.dragForceNewtons > slip.aerodynamicDrag.dragForceNewtons)
  assert.ok(brickDragFactor > slipDragFactor)
})

test('drivetrain selection changes available axle drive torque', () => {
  const v8 = accelerate(withSlot('drivetrain', 'drivetrain-sport'), 60)
  const eco = accelerate(withSlot('drivetrain', 'drivetrain-eco'), 60)

  assert.ok(v8.totalAxleDriveTorqueNewtonMeters > eco.totalAxleDriveTorqueNewtonMeters)
})

test('brake component scales the requested brake force under braking', () => {
  function requestedBrakeForceSum(configuration) {
    const controller = buildController(configuration)
    let snapshot = controller.getSnapshot()
    for (let index = 0; index < 80; index += 1) {
      snapshot = controller.update(1 / 60, { throttle: true })
    }
    let totalRequestedBrakeForceNewtons = 0
    for (let index = 0; index < 12; index += 1) {
      snapshot = controller.update(1 / 60, { brake: true })
      totalRequestedBrakeForceNewtons += snapshot.wheelStates.reduce(
        (sum, wheelState) => sum + Math.abs(wheelState.requestedBrakeForceNewtons),
        0
      )
    }
    return totalRequestedBrakeForceNewtons / snapshot.wheelStates.length
  }

  const weak = requestedBrakeForceSum(withSlot('brakes', 'brakes-eco'))
  const stock = requestedBrakeForceSum(withSlot('brakes', 'brakes-stock'))
  const big = requestedBrakeForceSum(withSlot('brakes', 'brakes-big'))

  assert.ok(weak < stock)
  assert.ok(stock < big)
})

test('same configuration and same inputs produce identical results (deterministic)', () => {
  const configuration = withSlot('chassis', 'chassis-suv')

  const first = accelerate(configuration, 90)
  const second = accelerate(configuration, 90)

  assert.equal(first.speedMetersPerSecond, second.speedMetersPerSecond)
  assert.equal(
    first.totalAxleDriveTorqueNewtonMeters,
    second.totalAxleDriveTorqueNewtonMeters
  )
})

test('default offroad configuration matches the proving-ground baseline mass', () => {
  const defaultSnapshot = buildController(createDefaultVehicleConfiguration()).getSnapshot()
  const customized = buildController(withSlot('chassis', 'chassis-heavytruck')).getSnapshot()

  assert.equal(defaultSnapshot.spec.massKg, 1400)
  assert.equal(customized.spec.massKg, 3200)
})
