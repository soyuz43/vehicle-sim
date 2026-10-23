// test/suspensionVisualsPerAxle.test.js

import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import { createCar } from '../src/car/createCar.js'
import { createSuspensionVisuals } from '../src/car/createSuspensionVisuals.js'
import { getComponent } from '../src/vehicle/config/componentCatalog.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'

const DT_SECONDS = 1 / 60
const STOCK_ID = 'susp-stock'
const MACPHERSON_ID = 'susp-macpherson-strut'
const WISHBONE_ID = 'susp-double-wishbone'
const SOLID_AXLE_ID = 'susp-solid-axle'
const WHEEL_IDS = Object.freeze([
  'front-left',
  'front-right',
  'rear-left',
  'rear-right',
])

function createController() {
  const car = createCar()
  const controller = createVehicleController({
    vehicle: car,
    startPosition: new THREE.Vector3(0, 0, 0),
  })
  return { car, controller }
}

function selectBothAndUpdate(controller, frontId, rearId) {
  controller.setSuspension('front', frontId)
  controller.setSuspension('rear', rearId)
  return controller.update(DT_SECONDS, {})
}

function countNamedNodes(vehicle) {
  let count = 0
  vehicle.traverse((node) => {
    if (/strut|wishbone|beam|leaf/i.test(node.name)) count += 1
  })
  return count
}

function countNamedNodesMatching(vehicle, pattern) {
  let count = 0
  vehicle.traverse((node) => {
    if (pattern.test(node.name)) count += 1
  })
  return count
}

function assertCornerVisibility(vehicle, axle, kind, expected) {
  for (const side of ['left', 'right']) {
    const wheelId = axle + '-' + side
    if (kind === 'wishbone') {
      const node = vehicle.getObjectByName(wheelId + '-wishbone-visual')
      assert.equal(node?.visible ?? false, expected, wheelId + ' wishbone')
    } else if (kind === 'strut') {
      const node = vehicle.getObjectByName(wheelId + '-strut-visual')
      assert.equal(node?.visible ?? false, expected, wheelId + ' strut')
    }
  }
}

function createSyntheticWheelStates() {
  return WHEEL_IDS.map((id) => {
    const [axle, side] = id.split('-')
    const sideSign = side === 'left' ? 1 : -1
    const xMeters = sideSign * 0.82
    const zMeters = axle === 'front' ? 1.35 : -1.35
    return {
      id,
      axle,
      side,
      localPosition: { x: xMeters, y: 0.22, z: zMeters },
      wheelCenterLocalPosition: new THREE.Vector3(xMeters, 0.22, zMeters),
      suspensionMountLocalPosition: new THREE.Vector3(
        sideSign * 0.48,
        0.82,
        zMeters
      ),
      wishboneKinematics: {
        upperOuterJoint: { xMeters: 0.65, yMeters: 0.46 },
        lowerOuterJoint: { xMeters: 0.7, yMeters: 0.17 },
      },
    }
  })
}

function componentSpec(slot, componentId) {
  const component = getComponent(slot, componentId)
  assert.ok(component, slot + ' component ' + componentId + ' must exist')
  return component.spec
}

function createNestedSuspensionSpec(frontId, rearId) {
  return {
    suspensionFront: componentSpec('suspensionFront', frontId),
    suspensionRear: componentSpec('suspensionRear', rearId),
  }
}

test('case 1: stock suspension creates no archetype-specific visual nodes', () => {
  const { car, controller } = createController()
  controller.update(DT_SECONDS, {})
  assert.equal(countNamedNodes(car), 0)
})

test('case 2: both MacPherson slots draw struts on all four corners', () => {
  const { car, controller } = createController()
  selectBothAndUpdate(controller, MACPHERSON_ID, MACPHERSON_ID)
  assert.equal(countNamedNodesMatching(car, /strut/i), 32)
  assertCornerVisibility(car, 'front', 'strut', true)
  assertCornerVisibility(car, 'rear', 'strut', true)
})

test('case 3: front MacPherson and rear stock draw only front struts', () => {
  const { car, controller } = createController()
  selectBothAndUpdate(controller, MACPHERSON_ID, STOCK_ID)
  assert.equal(countNamedNodesMatching(car, /strut/i), 16)
  assertCornerVisibility(car, 'front', 'strut', true)
  assertCornerVisibility(car, 'rear', 'strut', false)
})

test('case 4: rear MacPherson and front stock draw only rear struts', () => {
  const { car, controller } = createController()
  selectBothAndUpdate(controller, STOCK_ID, MACPHERSON_ID)
  assert.equal(countNamedNodesMatching(car, /strut/i), 16)
  assertCornerVisibility(car, 'front', 'strut', false)
  assertCornerVisibility(car, 'rear', 'strut', true)
})

test('case 5: both wishbone slots draw A-arms and carriers on all corners', () => {
  const { car, controller } = createController()
  selectBothAndUpdate(controller, WISHBONE_ID, WISHBONE_ID)
  assert.equal(countNamedNodesMatching(car, /wishbone/i), 32)
  assertCornerVisibility(car, 'front', 'wishbone', true)
  assertCornerVisibility(car, 'rear', 'wishbone', true)
})

test('case 6: front wishbone and rear stock draw A-arms on front only', () => {
  const { car, controller } = createController()
  selectBothAndUpdate(controller, WISHBONE_ID, STOCK_ID)
  assert.equal(countNamedNodesMatching(car, /wishbone/i), 16)
  assertCornerVisibility(car, 'front', 'wishbone', true)
  assertCornerVisibility(car, 'rear', 'wishbone', false)
})

test('case 7: rear wishbone and front stock draw A-arms on rear only', () => {
  const { car, controller } = createController()
  selectBothAndUpdate(controller, STOCK_ID, WISHBONE_ID)
  assert.equal(countNamedNodesMatching(car, /wishbone/i), 16)
  assertCornerVisibility(car, 'front', 'wishbone', false)
  assertCornerVisibility(car, 'rear', 'wishbone', true)
})

test('case 8: front wishbone and rear solid axle route visuals independently', () => {
  const { car, controller } = createController()
  selectBothAndUpdate(controller, WISHBONE_ID, SOLID_AXLE_ID)
  assert.equal(countNamedNodesMatching(car, /wishbone/i), 16)
  assert.equal(countNamedNodesMatching(car, /beam|leaf/i), 5)
  assertCornerVisibility(car, 'front', 'wishbone', true)
  assertCornerVisibility(car, 'rear', 'wishbone', false)
  assert.equal(car.getObjectByName('rear-axle-beam-visual').visible, true)
  assert.equal(car.getObjectByName('rear-axle-leaf-pack-visual').visible, true)
})

test('case 9: front solid axle and rear wishbone route visuals independently', () => {
  const { car, controller } = createController()
  selectBothAndUpdate(controller, SOLID_AXLE_ID, WISHBONE_ID)
  assert.equal(countNamedNodesMatching(car, /wishbone/i), 16)
  assert.equal(countNamedNodesMatching(car, /beam|leaf/i), 5)
  assertCornerVisibility(car, 'front', 'wishbone', false)
  assertCornerVisibility(car, 'rear', 'wishbone', true)
  assert.equal(car.getObjectByName('front-axle-beam-visual').visible, true)
  assert.equal(car.getObjectByName('front-axle-leaf-pack-visual').visible, true)
})

test('case 10: both solid axles continue drawing beams and leaf packs', () => {
  const { car, controller } = createController()
  selectBothAndUpdate(controller, SOLID_AXLE_ID, SOLID_AXLE_ID)
  assert.equal(countNamedNodesMatching(car, /beam|leaf/i), 10)
  for (const axle of ['front', 'rear']) {
    assert.equal(car.getObjectByName(axle + '-axle-beam-visual').visible, true)
    assert.equal(car.getObjectByName(axle + '-axle-leaf-pack-visual').visible, true)
  }
})

test('case 11: rear wishbone appears after mid-run slot swap without leaking nodes', () => {
  const { car, controller } = createController()
  selectBothAndUpdate(controller, WISHBONE_ID, STOCK_ID)
  const beforeSwapCount = countNamedNodes(car)
  assertCornerVisibility(car, 'front', 'wishbone', true)
  assertCornerVisibility(car, 'rear', 'wishbone', false)

  selectBothAndUpdate(controller, WISHBONE_ID, WISHBONE_ID)
  const afterFirstRearCreateCount = countNamedNodes(car)
  assert.equal(afterFirstRearCreateCount - beforeSwapCount, 16)
  assertCornerVisibility(car, 'rear', 'wishbone', true)

  for (let index = 0; index < 10; index += 1) {
    selectBothAndUpdate(controller, WISHBONE_ID, STOCK_ID)
    assertCornerVisibility(car, 'rear', 'wishbone', false)
    selectBothAndUpdate(controller, WISHBONE_ID, WISHBONE_ID)
    assert.equal(countNamedNodes(car), afterFirstRearCreateCount)
  }
})

test('case 12: ten independent axle swaps keep archetype node count stable', () => {
  const { car, controller } = createController()
  selectBothAndUpdate(controller, WISHBONE_ID, WISHBONE_ID)
  selectBothAndUpdate(controller, MACPHERSON_ID, MACPHERSON_ID)
  selectBothAndUpdate(controller, SOLID_AXLE_ID, SOLID_AXLE_ID)
  selectBothAndUpdate(controller, STOCK_ID, STOCK_ID)
  const primedNodeCount = countNamedNodes(car)

  for (let index = 0; index < 10; index += 1) {
    controller.setSuspension('front', WISHBONE_ID)
    controller.update(DT_SECONDS, {})
    assert.equal(countNamedNodes(car), primedNodeCount)
    controller.setSuspension('rear', MACPHERSON_ID)
    controller.update(DT_SECONDS, {})
    assert.equal(countNamedNodes(car), primedNodeCount)
    controller.setSuspension('front', SOLID_AXLE_ID)
    controller.update(DT_SECONDS, {})
    assert.equal(countNamedNodes(car), primedNodeCount)
    controller.setSuspension('rear', WISHBONE_ID)
    controller.update(DT_SECONDS, {})
    assert.equal(countNamedNodes(car), primedNodeCount)
    controller.setSuspension('front', STOCK_ID)
    controller.update(DT_SECONDS, {})
    assert.equal(countNamedNodes(car), primedNodeCount)
    controller.setSuspension('rear', STOCK_ID)
    controller.update(DT_SECONDS, {})
    assert.equal(countNamedNodes(car), primedNodeCount)
  }
})

test('case 13: REGRESSION rear MacPherson draws rear struts with front stock', () => {
  const { car, controller } = createController()
  const snapshot = selectBothAndUpdate(controller, STOCK_ID, MACPHERSON_ID)
  assert.equal(countNamedNodesMatching(car, /strut/i), 16)
  assertCornerVisibility(car, 'front', 'strut', false)
  assertCornerVisibility(car, 'rear', 'strut', true)
  assert.equal(snapshot.suspensionVisuals.frontSuspensionVisualKind, 'none')
  assert.equal(
    snapshot.suspensionVisuals.rearSuspensionVisualKind,
    'macphersonStrut'
  )
})

test('case 14: REGRESSION rear wishbone draws rear A-arms with front stock', () => {
  const { car, controller } = createController()
  selectBothAndUpdate(controller, STOCK_ID, WISHBONE_ID)
  assert.equal(countNamedNodesMatching(car, /wishbone/i), 16)
  assertCornerVisibility(car, 'front', 'wishbone', false)
  assertCornerVisibility(car, 'rear', 'wishbone', true)
})

test('case 15: REGRESSION both-slot MacPherson draws four struts', () => {
  const { car, controller } = createController()
  selectBothAndUpdate(controller, MACPHERSON_ID, MACPHERSON_ID)
  assert.equal(countNamedNodesMatching(car, /strut/i), 32)
  assertCornerVisibility(car, 'front', 'strut', true)
  assertCornerVisibility(car, 'rear', 'strut', true)
})

test('decorrelation: nested kinds route despite finite kinematics on both axles', () => {
  const vehicle = new THREE.Group()
  const visuals = createSuspensionVisuals(vehicle)
  const wheelStates = createSyntheticWheelStates()
  assert.ok(
    wheelStates.every((state) =>
      Number.isFinite(state.wishboneKinematics.upperOuterJoint.xMeters) &&
      Number.isFinite(state.wishboneKinematics.upperOuterJoint.yMeters) &&
      Number.isFinite(state.wishboneKinematics.lowerOuterJoint.xMeters) &&
      Number.isFinite(state.wishboneKinematics.lowerOuterJoint.yMeters) &&
      state.wheelCenterLocalPosition.toArray().every(Number.isFinite)
    )
  )

  visuals.updateFromWheelStates(
    wheelStates,
    null,
    createNestedSuspensionSpec(MACPHERSON_ID, WISHBONE_ID)
  )

  assertCornerVisibility(vehicle, 'front', 'strut', true)
  assertCornerVisibility(vehicle, 'rear', 'wishbone', true)
  assertCornerVisibility(vehicle, 'front', 'wishbone', false)
  assertCornerVisibility(vehicle, 'rear', 'strut', false)

  visuals.updateFromWheelStates(
    wheelStates,
    null,
    createNestedSuspensionSpec(WISHBONE_ID, MACPHERSON_ID)
  )

  assertCornerVisibility(vehicle, 'front', 'wishbone', true)
  assertCornerVisibility(vehicle, 'rear', 'strut', true)
  assertCornerVisibility(vehicle, 'front', 'strut', false)
  assertCornerVisibility(vehicle, 'rear', 'wishbone', false)
})

test('legacy flat spec fallback applies wishbone kind and linkage to both axles', () => {
  const vehicle = new THREE.Group()
  const visuals = createSuspensionVisuals(vehicle)
  visuals.updateFromWheelStates(createSyntheticWheelStates(), null, {
    suspensionVisualKind: 'doubleWishbone',
    suspensionLinkage: componentSpec('suspensionFront', WISHBONE_ID)
      .suspensionLinkage,
  })
  assert.equal(countNamedNodesMatching(vehicle, /wishbone/i), 32)
  assertCornerVisibility(vehicle, 'front', 'wishbone', true)
  assertCornerVisibility(vehicle, 'rear', 'wishbone', true)
})

test('legacy four-argument MacPherson call draws struts on all four corners', () => {
  const vehicle = new THREE.Group()
  const visuals = createSuspensionVisuals(vehicle)
  visuals.updateFromWheelStates(
    createSyntheticWheelStates(),
    null,
    'macphersonStrut',
    null
  )
  assert.equal(countNamedNodesMatching(vehicle, /strut/i), 32)
  assertCornerVisibility(vehicle, 'front', 'strut', true)
  assertCornerVisibility(vehicle, 'rear', 'strut', true)
})
