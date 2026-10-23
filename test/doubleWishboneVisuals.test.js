// test/doubleWishboneVisuals.test.js

import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import { createCar } from '../src/car/createCar.js'
import { createHeightfieldTerrainContactQuery } from '../src/terrain/createHeightfieldTerrainContactQuery.js'
import { createTerrainSurfaceProfile } from '../src/terrain/createTerrainSurfaceProfile.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'

const DT_SECONDS = 1 / 60
const WISHBONE_ID = 'susp-double-wishbone'
const STOCK_ID = 'susp-stock'
const MACPHERSON_ID = 'susp-macpherson-strut'
const SOLID_AXLE_ID = 'susp-solid-axle'

function createController() {
  const car = createCar()
  const controller = createVehicleController({
    vehicle: car,
    startPosition: new THREE.Vector3(0, 0, 0),
  })
  return { car, controller }
}

function selectAndUpdate(controller, axle, componentId) {
  controller.setSuspension(axle, componentId)
  return controller.update(DT_SECONDS, {})
}

function wishboneGroups(car) {
  const groups = []
  car.traverse((node) => {
    if (node.name.endsWith('-wishbone-visual')) groups.push(node)
  })
  return groups
}

function wishboneSegments(car) {
  const segments = []
  car.traverse((node) => {
    if (
      node.name.startsWith('wishbone-') &&
      node.name.endsWith('-segment-visual')
    ) {
      segments.push(node)
    }
  })
  return segments
}

function segmentByName(car, name) {
  const node = car.getObjectByName(name)
  assert.ok(node, 'expected segment ' + name)
  return node
}

function segmentEndpoints(segment) {
  const halfAxis = new THREE.Vector3(0, 0.5, 0)
    .applyQuaternion(segment.quaternion)
    .multiplyScalar(segment.scale.y)
  return {
    start: segment.position.clone().sub(halfAxis),
    end: segment.position.clone().add(halfAxis),
  }
}

function assertVectorClose(actual, expected, epsilonMeters = 1e-9) {
  assert.ok(actual.distanceTo(expected) <= epsilonMeters)
}

test('wishbone selection creates seven visible segments on all four corners', () => {
  const { car, controller } = createController()
  selectAndUpdate(controller, 'front', WISHBONE_ID)
  const snapshot = selectAndUpdate(controller, 'rear', WISHBONE_ID)

  assert.equal(wishboneGroups(car).length, 4)
  assert.equal(wishboneSegments(car).length, 28)
  for (const wheelState of snapshot.wheelStates) {
    assert.equal(
      car.getObjectByName(wheelState.id + '-wishbone-visual').visible,
      true,
      wheelState.id + ' wishbone group must be visible'
    )
    const cornerSegments = wishboneSegments(car).filter((segment) =>
      segment.name.startsWith('wishbone-' + wheelState.id + '-')
    )
    assert.equal(cornerSegments.length, 7, wheelState.id)
    assert.ok(cornerSegments.every((segment) => segment.visible))
    for (const crossbarName of ['upper-arm-crossbar', 'lower-arm-crossbar']) {
      const crossbar = segmentByName(
        car,
        'wishbone-' + wheelState.id + '-' + crossbarName + '-segment-visual'
      )
      assert.ok(Math.abs(crossbar.scale.y - 0.3) < 1e-9)
    }
  }
})

test('stock starts without wishbone nodes and hides cached nodes after swap-back', () => {
  const { car, controller } = createController()

  assert.equal(car.getObjectByName('front-left-wishbone-visual'), undefined)
  assert.equal(wishboneSegments(car).length, 0)

  selectAndUpdate(controller, 'front', WISHBONE_ID)
  const cachedGroups = wishboneGroups(car)
  const cachedSegments = wishboneSegments(car)
  assert.equal(cachedGroups.length, 2)
  assert.equal(cachedSegments.length, 14)

  selectAndUpdate(controller, 'front', STOCK_ID)
  assert.ok(cachedGroups.every((group) => group.visible === false))
  assert.ok(cachedSegments.every((segment) => segment.visible === false))
})

test('A-arm outer endpoints track linkage output while inner pivots stay fixed', () => {
  const car = createCar()
  const controller = createVehicleController({
    vehicle: car,
    terrainContactQuery: createHeightfieldTerrainContactQuery({
      surfaceProfile: createTerrainSurfaceProfile(),
    }),
  })
  controller.setSuspension('front', WISHBONE_ID)
  let snapshot = controller.update(DT_SECONDS, {})
  let wheelState = snapshot.wheelStates.find(
    (state) => state.id === 'front-left'
  )
  const armSegment = segmentByName(
    car,
    'wishbone-front-left-upper-arm-front-link-segment-visual'
  )
  const carrierSegment = segmentByName(
    car,
    'wishbone-front-left-hub-carrier-segment-visual'
  )
  const initialArmEndpoints = segmentEndpoints(armSegment)
  const initialJoint = {
    xMeters: wheelState.wishboneKinematics.upperOuterJoint.xMeters,
    yMeters: wheelState.wishboneKinematics.upperOuterJoint.yMeters,
  }
  const initialWheelCenter = wheelState.wheelCenterLocalPosition.clone()
  let maximumJointTravelMeters = 0
  let maximumWheelCenterTravelMeters = 0
  let stepCount = 0

  while (snapshot.position.z < 65 && stepCount < 960) {
    snapshot = controller.update(DT_SECONDS, { throttle: true })
    wheelState = snapshot.wheelStates.find(
      (state) => state.id === 'front-left'
    )
    const armEndpoints = segmentEndpoints(armSegment)
    const carrierEndpoints = segmentEndpoints(carrierSegment)
    const jointPoint = new THREE.Vector3(
      wheelState.wishboneKinematics.upperOuterJoint.xMeters,
      wheelState.wishboneKinematics.upperOuterJoint.yMeters,
      wheelState.localPosition.z
    )
    const jointTravelMeters = Math.hypot(
      jointPoint.x - initialJoint.xMeters,
      jointPoint.y - initialJoint.yMeters
    )

    maximumJointTravelMeters = Math.max(
      maximumJointTravelMeters,
      jointTravelMeters
    )
    maximumWheelCenterTravelMeters = Math.max(
      maximumWheelCenterTravelMeters,
      wheelState.wheelCenterLocalPosition.distanceTo(initialWheelCenter)
    )

    assertVectorClose(armEndpoints.start, initialArmEndpoints.start)
    assertVectorClose(armEndpoints.end, jointPoint)
    assertVectorClose(carrierEndpoints.end, wheelState.wheelCenterLocalPosition)
    stepCount += 1
  }

  assert.ok(snapshot.position.z >= 65, 'vehicle must traverse proving-ground bumps')
  assert.ok(maximumWheelCenterTravelMeters > 0.01)
  assert.ok(maximumJointTravelMeters > 0.01)
})

test('hub carrier joins the outer-joint midpoint to the wheel center', () => {
  const { car, controller } = createController()
  const snapshot = selectAndUpdate(controller, 'front', WISHBONE_ID)
  const wheelState = snapshot.wheelStates.find(
    (state) => state.id === 'front-left'
  )
  const carrier = segmentByName(
    car,
    'wishbone-front-left-hub-carrier-segment-visual'
  )
  const endpoints = segmentEndpoints(carrier)
  const kinematics = wheelState.wishboneKinematics
  const expectedMidpoint = new THREE.Vector3(
    (kinematics.upperOuterJoint.xMeters + kinematics.lowerOuterJoint.xMeters) / 2,
    (kinematics.upperOuterJoint.yMeters + kinematics.lowerOuterJoint.yMeters) / 2,
    wheelState.localPosition.z
  )

  assertVectorClose(endpoints.start, expectedMidpoint)
  assertVectorClose(endpoints.end, wheelState.wheelCenterLocalPosition)
})

test('repeated archetype swaps reuse the same wishbone nodes', () => {
  const { car, controller } = createController()
  selectAndUpdate(controller, 'front', WISHBONE_ID)
  const stableNodeCount = wishboneGroups(car).length + wishboneSegments(car).length

  for (let index = 0; index < 10; index += 1) {
    selectAndUpdate(controller, 'front', MACPHERSON_ID)
    selectAndUpdate(controller, 'front', WISHBONE_ID)
    selectAndUpdate(controller, 'front', STOCK_ID)
    selectAndUpdate(controller, 'front', WISHBONE_ID)
    assert.equal(
      wishboneGroups(car).length + wishboneSegments(car).length,
      stableNodeCount
    )
  }
})

test('MacPherson struts and solid axle beam remain archetype-specific', () => {
  const { car, controller } = createController()

  selectAndUpdate(controller, 'front', MACPHERSON_ID)
  assert.equal(car.getObjectByName('front-left-strut-visual').visible, true)
  assert.equal(car.getObjectByName('front-right-strut-visual').visible, true)
  assert.equal(car.getObjectByName('rear-left-strut-visual'), undefined)
  assert.equal(wishboneGroups(car).length, 0)

  selectAndUpdate(controller, 'rear', SOLID_AXLE_ID)
  assert.equal(car.getObjectByName('rear-axle-beam-visual').visible, true)
  assert.equal(car.getObjectByName('rear-axle-leaf-pack-visual').visible, true)
  assert.equal(wishboneGroups(car).length, 0)
})