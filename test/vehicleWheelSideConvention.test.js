// test/vehicleWheelSideConvention.test.js

// Locks the car's left/right convention.
//
// The car frame is +Z forward and +Y up, so the driver's right hand points
// along forward x up = -X: +X is the car's LEFT side. The wheel ids, the
// side label, the telemetry, and the stability-control corrections must all
// agree with that physical handedness.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { updateLoadTransferState } from '../src/vehicle/dynamics/loadTransferState.js'
import { computeElectronicStabilityControl } from '../src/vehicle/dynamics/brakeAndStabilityControlState.js'

const STEP_SECONDS = 1 / 60
const GRAVITY_METERS_PER_SECOND_SQUARED = 9.80665
const HALF_TRACK_METERS = 1.25

function createSettledController() {
  const vehicle = createCar()
  const controller = createVehicleController({ vehicle })
  for (let step = 0; step < 20; step += 1) {
    controller.update(STEP_SECONDS, {})
  }
  return { vehicle, controller }
}

test('wheel ids and the side label follow the physical left/right sides', () => {
  const { controller } = createSettledController()
  const wheelStates = controller.getSnapshot().wheelStates

  const expectedById = {
    'front-left': HALF_TRACK_METERS,
    'front-right': -HALF_TRACK_METERS,
    'rear-left': HALF_TRACK_METERS,
    'rear-right': -HALF_TRACK_METERS,
  }

  assert.equal(wheelStates.length, 4)
  for (const wheelState of wheelStates) {
    const expectedXMeters = expectedById[wheelState.id]
    assert.ok(
      expectedXMeters !== undefined,
      `unexpected wheel id ${wheelState.id}`
    )
    assert.equal(
      wheelState.localPosition.x,
      expectedXMeters,
      `${wheelState.id} must sit on the side its name describes`
    )
    assert.equal(
      wheelState.side,
      expectedXMeters > 0 ? 'left' : 'right',
      `${wheelState.id} must carry the matching side label`
    )
  }
})

test('the left side of the car is the +X side in world space', () => {
  const { vehicle, controller } = createSettledController()
  const snapshot = controller.getSnapshot()

  const forward = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(vehicle.quaternion)
    .normalize()
  const up = new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3().crossVectors(forward, up).normalize()

  for (const wheelState of snapshot.wheelStates) {
    const lateralOffsetMeters = wheelState.wheelCenterWorldPosition
      .clone()
      .sub(vehicle.position)
      .dot(right)
    if (wheelState.side === 'left') {
      assert.ok(
        lateralOffsetMeters < 0,
        `${wheelState.id} is labeled left but sits ${lateralOffsetMeters} m to the vehicle's right`
      )
    } else {
      assert.ok(
        lateralOffsetMeters > 0,
        `${wheelState.id} is labeled right but sits ${lateralOffsetMeters} m to the vehicle's left`
      )
    }
  }
})

test('a left turn loads the physical right wheels', () => {
  const { controller } = createSettledController()
  const wheelStates = controller.getSnapshot().wheelStates

  updateLoadTransferState(
    wheelStates,
    {
      planarAccelerationLocalForwardMetersPerSecondSquared: 0,
      planarAccelerationLocalLateralMetersPerSecondSquared:
        GRAVITY_METERS_PER_SECOND_SQUARED,
    },
    { loadTransferEnabled: true, minimumNormalForceNewtons: 0 },
    {
      totalStaticNormalForceNewtons: 0,
      totalDynamicNormalForceNewtons: 0,
      totalLongitudinalTransferAbsNewtons: 0,
      totalLateralTransferAbsNewtons: 0,
      frontAxleNormalForceNewtons: 0,
      rearAxleNormalForceNewtons: 0,
      leftSideNormalForceNewtons: 0,
      rightSideNormalForceNewtons: 0,
      maxWheelNormalForceNewtons: 0,
      minGroundedWheelNormalForceNewtons: 0,
      unloadedWheelCount: 0,
      totalBaseSupportNormalForceNewtons: 0,
      normalForceConservationErrorNewtons: 0,
    }
  )

  const rightWheel = wheelStates.find(
    (wheelState) => wheelState.id === 'front-right'
  )
  const leftWheel = wheelStates.find(
    (wheelState) => wheelState.id === 'front-left'
  )
  assert.ok(
    rightWheel.normalForceNewtons > leftWheel.normalForceNewtons,
    'a left turn must load the physical right wheels'
  )
})

test('ESC corrects the physical outer and inner wheels', () => {
  const { controller } = createSettledController()
  const wheelStates = controller.getSnapshot().wheelStates

  // A positive target yaw rate is a left turn in this frame.
  const oversteer = computeElectronicStabilityControl({
    wheelStates,
    spec: { electronicStabilityControlEnabled: true },
    yawRateRadiansPerSecond: 0.6,
    targetYawRateRadiansPerSecond: 0.3,
  })
  const understeer = computeElectronicStabilityControl({
    wheelStates,
    spec: { electronicStabilityControlEnabled: true },
    yawRateRadiansPerSecond: 0.1,
    targetYawRateRadiansPerSecond: 0.3,
  })

  const brakedWheel = (result) => {
    const index = Number(Object.keys(result.wheelBrakeTorqueDeltas)[0])
    return wheelStates[index]
  }

  assert.equal(oversteer.escState, 'oversteer_correction')
  assert.equal(brakedWheel(oversteer).id, 'front-right')
  assert.equal(brakedWheel(understeer).id, 'rear-left')
})
