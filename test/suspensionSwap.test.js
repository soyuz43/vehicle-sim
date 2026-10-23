// test/suspensionSwap.test.js

// Runtime suspension swapping via setSuspension(slot, id).
//
// The A1 session made the rigid axle real but unreachable. This session adds
// the catalog entry, the visual, and this API, so a driver can select a
// suspension archetype per axle in the running browser:
//
//   __vehicleSim.vehicleController.setSuspension('rear', 'susp-solid-axle')
//   __vehicleSim.vehicleController.setSuspension('front', 'susp-double-wishbone')
//
// The swap replaces the suspension-owned spec fields (front slot) or the
// slot's coupling mode (rear slot), re-syncs the axle coupling state, and
// leaves the vehicle where it is. It is a setup change, not a reset.

import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'

const DT_SECONDS = 1 / 60
const ARCHETYPE_ID = 'susp-solid-axle'
const STOCK_ID = 'susp-stock'
const LOWERED_ID = 'susp-lowered'

function createController() {
  const car = createCar()
  const controller = createVehicleController({
    vehicle: car,
    startPosition: new THREE.Vector3(0, 0, 0),
  })

  return { car, controller }
}

function drive(controller, steps, input = { throttle: true }) {
  let snapshot
  for (let step = 0; step < steps; step += 1) {
    snapshot = controller.update(DT_SECONDS, input)
  }
  return snapshot
}

function countNodes(node) {
  let count = 0
  for (const child of node?.children ?? []) {
    count += 1 + countNodes(child)
  }
  return count
}

test('the controller exposes a runtime suspension swap', () => {
  const { controller } = createController()

  assert.equal(typeof controller.setSuspension, 'function')
})

test('setSuspension returns the selected catalog component', () => {
  const { controller } = createController()

  const component = controller.setSuspension('rear', ARCHETYPE_ID)

  assert.equal(component.id, ARCHETYPE_ID)
  assert.equal(typeof component.label, 'string')
})

test('setSuspension couples the rear axle of the running vehicle', () => {
  const { car, controller } = createController()
  drive(controller, 60)

  assert.equal(controller.getSnapshot().axleCoupling.axles.rear.isCoupled, false)

  controller.setSuspension('rear', ARCHETYPE_ID)
  const snapshot = controller.update(DT_SECONDS, { throttle: true })

  assert.equal(snapshot.axleCoupling.axles.rear.isCoupled, true)
  assert.equal(snapshot.axleCoupling.axles.rear.couplingMode, 'rigidAxle')
  assert.equal(snapshot.axleCoupling.axles.front.isCoupled, false)

  const beamNode = car.getObjectByName('rear-axle-beam-visual')
  assert.ok(beamNode, 'the swap must draw the axle beam')
  assert.equal(beamNode.visible, true)
})

test('setSuspension couples the front axle of the running vehicle', () => {
  const { car, controller } = createController()
  drive(controller, 60)

  controller.setSuspension('front', ARCHETYPE_ID)
  const snapshot = controller.update(DT_SECONDS, { throttle: true })

  assert.equal(snapshot.axleCoupling.axles.front.isCoupled, true)
  assert.equal(snapshot.axleCoupling.axles.front.couplingMode, 'rigidAxle')
  assert.equal(snapshot.axleCoupling.axles.rear.isCoupled, false)
  assert.equal(snapshot.spec.frontAxleCoupling, 'rigidAxle')
  assert.equal(snapshot.spec.rearAxleCoupling, 'independent')

  const beamNode = car.getObjectByName('front-axle-beam-visual')
  assert.ok(beamNode, 'the front swap must draw the axle beam')
  assert.equal(beamNode.visible, true)
  assert.equal(car.getObjectByName('rear-axle-beam-visual'), undefined)
})

test('mixed front wishbone and rear solid axle is expressible', () => {
  const { car, controller } = createController()
  drive(controller, 60)

  controller.setSuspension('front', 'susp-double-wishbone')
  controller.setSuspension('rear', ARCHETYPE_ID)
  const snapshot = controller.update(DT_SECONDS, { throttle: true })

  assert.equal(snapshot.axleCoupling.axles.rear.couplingMode, 'rigidAxle')
  assert.equal(snapshot.axleCoupling.axles.front.couplingMode, 'independent')
  assert.ok(
    snapshot.spec.suspensionLinkage,
    'the wishbone linkage reaches the flat spec'
  )
  assert.ok(
    car.getObjectByName('rear-axle-beam-visual'),
    'the coupled rear axle draws its beam'
  )
  assert.equal(
    car.getObjectByName('front-axle-beam-visual'),
    undefined,
    'the independent front axle draws no beam'
  )
})

test('a suspension swap preserves position, velocity, gear, and transmission', () => {
  const { controller } = createController()
  const before = drive(controller, 120)

  controller.setSuspension('rear', ARCHETYPE_ID)
  const after = controller.getSnapshot()

  assert.equal(after.position.x, before.position.x)
  assert.equal(after.position.y, before.position.y)
  assert.equal(after.position.z, before.position.z)
  assert.equal(
    after.worldVelocityMetersPerSecond.x,
    before.worldVelocityMetersPerSecond.x
  )
  assert.equal(
    after.worldVelocityMetersPerSecond.z,
    before.worldVelocityMetersPerSecond.z
  )
  assert.equal(after.gear, before.gear)
  assert.equal(
    after.transmissionProfile.transmissionId,
    before.transmissionProfile.transmissionId
  )
})

test('swapping back to the stock profile restores the independent mode', () => {
  const { car, controller } = createController()
  drive(controller, 60)

  controller.setSuspension('rear', ARCHETYPE_ID)
  drive(controller, 30)
  assert.equal(controller.getSnapshot().axleCoupling.axles.rear.isCoupled, true)

  controller.setSuspension('rear', STOCK_ID)
  const snapshot = controller.update(DT_SECONDS, { throttle: true })

  assert.equal(snapshot.axleCoupling.axles.rear.isCoupled, false)
  assert.equal(snapshot.axleCoupling.axles.rear.couplingMode, 'independent')
  assert.equal(snapshot.spec.rearAxleCoupling, 'independent')
  assert.equal(
    car.getObjectByName('rear-axle-beam-visual').visible,
    false,
    'the beam must be hidden again when the axle is independent'
  )
})

test('the snapshot reports the new coupling mode immediately after the swap', () => {
  const { controller } = createController()
  drive(controller, 60)

  controller.setSuspension('rear', ARCHETYPE_ID)
  const afterSwap = controller.getSnapshot()

  assert.equal(afterSwap.axleCoupling.axles.rear.couplingMode, 'rigidAxle')
  assert.equal(
    afterSwap.axleCoupling.axles.rear.isCoupled,
    false,
    'the beam pose is not solved until the next step'
  )
  assert.equal(afterSwap.spec.rearAxleCoupling, 'rigidAxle')
})

test('a front suspension swap replaces the suspension-owned spec fields', () => {
  const { controller } = createController()

  controller.setSuspension('front', LOWERED_ID)
  const lowered = controller.getSnapshot()
  assert.equal(lowered.spec.suspensionRestLengthMeters, 0.3)
  assert.equal(lowered.spec.chassisTerrainSupportBaselineOffsetMeters, -0.06)

  controller.setSuspension('front', STOCK_ID)
  const stock = controller.getSnapshot()
  assert.equal(stock.spec.suspensionRestLengthMeters, 0.35)
  assert.equal(stock.spec.chassisTerrainSupportBaselineOffsetMeters, 0)
  assert.equal(stock.spec.frontAxleCoupling, 'independent')
  assert.equal(stock.spec.rearAxleCoupling, 'independent')
})

test('setSuspension rejects an unknown suspension id', () => {
  const { controller } = createController()

  assert.throws(
    () => controller.setSuspension('rear', 'not-a-suspension'),
    /Unknown suspension/
  )
})

test('setSuspension rejects an unknown suspension slot', () => {
  const { controller } = createController()

  assert.throws(
    () => controller.setSuspension('middle', STOCK_ID),
    /Unknown suspension slot/
  )
})

test('repeated suspension swaps do not leak visual geometry', () => {
  const { car, controller } = createController()
  drive(controller, 30)

  // The beam and the leaf pack are created the first time their axle is
  // coupled and are kept (hidden) afterwards, so the node count has to
  // stabilise rather than grow with every swap.
  controller.setSuspension('rear', ARCHETYPE_ID)
  controller.update(DT_SECONDS, { throttle: true })
  controller.setSuspension('rear', STOCK_ID)
  controller.update(DT_SECONDS, { throttle: true })

  const nodeCountAfterFirstSwap = countNodes(car)

  for (let index = 0; index < 10; index += 1) {
    controller.setSuspension('rear', ARCHETYPE_ID)
    controller.update(DT_SECONDS, { throttle: true })
    controller.setSuspension('rear', STOCK_ID)
    controller.update(DT_SECONDS, { throttle: true })
  }

  assert.equal(
    countNodes(car),
    nodeCountAfterFirstSwap,
    'repeated swaps must not add nodes to the vehicle'
  )
})

test('a suspension swap does not produce a damper spike on the next step', () => {
  const { controller } = createController()
  drive(controller, 120)

  // The lowered profile has a different rest length, so the suspension
  // compression changes at the swap.
  controller.setSuspension('front', LOWERED_ID)
  const snapshot = controller.update(DT_SECONDS, { throttle: true })

  for (const wheelState of snapshot.wheelStates) {
    assert.equal(
      wheelState.suspensionCompressionVelocityMetersPerSecond,
      0,
      wheelState.id + ' must not report a compression velocity on the first step after a swap'
    )
  }
})
