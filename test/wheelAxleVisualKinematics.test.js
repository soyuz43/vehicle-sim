// test/wheelAxleVisualKinematics.test.js

import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import { createCar } from '../src/car/createCar.js'
import {
  applySegmentBetweenPointsState,
  createSegmentBetweenPointsState,
  updateSegmentBetweenPointsState,
} from '../src/car/segmentBetweenPoints.js'
import { createHeightfieldTerrainContactQuery } from '../src/terrain/createHeightfieldTerrainContactQuery.js'
import { createTerrainSurfaceProfile } from '../src/terrain/createTerrainSurfaceProfile.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'

const STEP_SECONDS = 1 / 60
const ALIGNMENT_TOLERANCE_METERS = 0.000001

test('segment helper aligns a unit cylinder for finite endpoints without drift', () => {
  const cases = [
    [new THREE.Vector3(-2, 0, 0), new THREE.Vector3(3, 0, 0)],
    [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 4, 0)],
    [new THREE.Vector3(1, 2, 3), new THREE.Vector3(4, 6, 9)],
    [new THREE.Vector3(4, 6, 9), new THREE.Vector3(1, 2, 3)],
    [new THREE.Vector3(), new THREE.Vector3(0.00001, 0, 0)],
  ]
  const state = createSegmentBetweenPointsState()
  const node = createUnitSegmentNode()

  for (const [start, end] of cases) {
    updateSegmentBetweenPointsState(state, start, end)
    assert.equal(applySegmentBetweenPointsState(node, state), true)
    node.updateMatrixWorld(true)

    assertVectorNear(readSegmentEndpoint(node, -0.5), start)
    assertVectorNear(readSegmentEndpoint(node, 0.5), end)
    assert.ok(Math.abs(state.lengthMeters - start.distanceTo(end)) < 1e-12)
    assertFiniteTransform(node)

    const firstTransform = captureNodeTransform(node)
    updateSegmentBetweenPointsState(state, start, end)
    applySegmentBetweenPointsState(node, state)
    assert.deepEqual(captureNodeTransform(node), firstTransform)
  }
})

test('segment helper uses finite fallbacks for zero-length and invalid endpoints', () => {
  const state = createSegmentBetweenPointsState({
    minimumLengthMeters: 0.0001,
    fallbackDirection: new THREE.Vector3(0, 0, 1),
  })
  const node = createUnitSegmentNode()
  const coincident = new THREE.Vector3(2, 3, 4)

  updateSegmentBetweenPointsState(state, coincident, coincident)
  assert.equal(state.isDegenerate, true)
  assert.equal(state.isFinite, true)
  assert.equal(state.lengthMeters, 0.0001)
  assert.equal(applySegmentBetweenPointsState(node, state), true)
  assertVectorNear(node.position, coincident)
  assertFiniteTransform(node)

  const finiteFallbackTransform = captureNodeTransform(node)
  updateSegmentBetweenPointsState(
    state,
    new THREE.Vector3(Number.NaN, 0, 0),
    new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0)
  )
  assert.equal(state.isInputFinite, false)
  assert.equal(state.isFinite, true)
  assert.equal(applySegmentBetweenPointsState(node, state), true)
  assert.deepEqual(captureNodeTransform(node), finiteFallbackTransform)
})

test('baseline wheel stack is concentric and independent segments reach every hub', () => {
  const car = createCar()
  const controller = createVehicleController({ vehicle: car })
  const snapshot = controller.getSnapshot()
  const alignment = snapshot.wheelAxleVisualKinematics

  assert.equal(car.getObjectByName('front-axle'), undefined)
  assert.equal(car.getObjectByName('rear-axle'), undefined)
  assert.ok(car.getObjectByName('rear-differential-housing-placeholder'))
  assert.equal(
    alignment.representationKind,
    'independent-half-shafts-and-front-spindle-links-v1'
  )
  assert.equal(alignment.segments.length, 4)
  assertAlignmentValid(alignment)
  assert.doesNotThrow(() => JSON.stringify(alignment))

  for (const wheel of alignment.wheels) {
    assertVectorNear(
      wheel.hubCenterWorldMeters,
      wheel.authoritativeWheelCenterWorldMeters
    )
    assertVectorNear(wheel.rimCenterWorldMeters, wheel.hubCenterWorldMeters)
    assertVectorNear(wheel.tireCenterWorldMeters, wheel.hubCenterWorldMeters)
    assertVectorNear(
      wheel.axleOrShaftOuterEndpointWorldMeters,
      wheel.hubCenterWorldMeters
    )
  }
})

test('pressure deformation never mutates rigid wheel transforms or segment attachment', () => {
  const car = createCar()
  const controller = createVehicleController({ vehicle: car })
  const tirePressureVisuals = car.userData.vehicle.tirePressureVisuals
  const rigidBaseline = captureAllRigidWheelLocalTransforms(car)

  for (const pressureKpa of [0, 80, 220, 340]) {
    controller.setTirePressureKpa(pressureKpa)
    const snapshot = controller.update(STEP_SECONDS, {})
    tirePressureVisuals.setTargetFromWheelStates(snapshot.wheelStates)
    tirePressureVisuals.update(1)

    assertAlignmentValid(snapshot.wheelAxleVisualKinematics)
    assert.deepEqual(captureAllRigidWheelLocalTransforms(car), rigidBaseline)
    assert.ok(
      snapshot.wheelStates.every(
        (wheel) => wheel.tirePressureKpa === pressureKpa
      )
    )
  }
})

test('symmetric and asymmetric suspension travel keep segments attached independently', () => {
  const symmetric = createTerrainController((xMeters) =>
    Math.abs(xMeters) > 0.5 ? 0.06 : 0
  )
  const symmetricSnapshot = symmetric.controller.getSnapshot()
  const symmetricOffsets = symmetricSnapshot.wheelAxleVisualKinematics.wheels.map(
    (wheel) => wheel.suspensionVisualOffsetMeters
  )

  assertAlignmentValid(symmetricSnapshot.wheelAxleVisualKinematics)
  assert.ok(symmetricOffsets.every((offset) => offset > 0.05))
  assert.ok(
    symmetricOffsets.every(
      (offset) => Math.abs(offset - symmetricOffsets[0]) < 0.00001
    )
  )

  const asymmetric = createTerrainController((xMeters) =>
    xMeters < -0.5 ? 0.075 : 0
  )
  const asymmetricSnapshot = asymmetric.controller.getSnapshot()
  const frontLeft = findAlignmentWheel(asymmetricSnapshot, 'front-left')
  const frontRight = findAlignmentWheel(asymmetricSnapshot, 'front-right')
  const rearLeft = findAlignmentWheel(asymmetricSnapshot, 'rear-left')

  assertAlignmentValid(asymmetricSnapshot.wheelAxleVisualKinematics)
  assert.ok(frontLeft.suspensionVisualOffsetMeters > 0.06)
  assert.ok(frontRight.suspensionVisualOffsetMeters < 0.001)
  assert.ok(rearLeft.suspensionVisualOffsetMeters > 0.06)

  const leftFrontSegment = findSegment(
    asymmetricSnapshot,
    'front-left-spindle-link'
  )
  const rightFrontSegment = findSegment(
    asymmetricSnapshot,
    'front-right-spindle-link'
  )
  assert.notEqual(leftFrontSegment.lengthMeters, rightFrontSegment.lengthMeters)
})

test('steering and wheel spin preserve centers and do not rotate segment ownership', () => {
  const car = createCar()
  const controller = createVehicleController({ vehicle: car })
  const segmentBaseline = captureArticulatedSegmentTransforms(car)

  for (const steeringInput of [{ left: true }, {}, { right: true }]) {
    const snapshot = controller.update(STEP_SECONDS, steeringInput)
    assertAlignmentValid(snapshot.wheelAxleVisualKinematics)
  }

  let snapshot = controller.getSnapshot()
  for (let step = 0; step < 12; step += 1) {
    snapshot = controller.update(STEP_SECONDS, { throttle: true })
  }

  assert.ok(
    snapshot.wheelStates.some(
      (wheel) => Math.abs(wheel.spinAngleRadians) > 0.01
    )
  )
  assertAlignmentValid(snapshot.wheelAxleVisualKinematics)
  assert.deepEqual(captureArticulatedSegmentTransforms(car), segmentBaseline)

  controller.reset()
  controller.setGear('reverse')
  for (let step = 0; step < 12; step += 1) {
    snapshot = controller.update(STEP_SECONDS, { throttle: true })
  }
  assert.ok(
    snapshot.wheelStates.some((wheel) => wheel.spinAngleRadians < -0.01)
  )
  assertAlignmentValid(snapshot.wheelAxleVisualKinematics)
})

test('terrain normals and per-wheel pressure remain visual-kinematically independent', () => {
  const profile = createTerrainSurfaceProfile()
  const car = createCar()
  car.position.z = 50.55
  const controller = createVehicleController({
    vehicle: car,
    terrainContactQuery: createHeightfieldTerrainContactQuery({
      surfaceProfile: profile,
    }),
  })
  const baseline = controller.getSnapshot()
  const unaffectedBaseline = findAlignmentWheel(baseline, 'front-right')
  const unaffectedBaselineCenter = unaffectedBaseline.hubCenterWorldMeters.clone()

  controller.setWheelTirePressureKpa('front-left', 0)
  const changed = controller.update(STEP_SECONDS, {})
  const changedLeft = findAlignmentWheel(changed, 'front-left')
  const unchangedRight = findAlignmentWheel(changed, 'front-right')

  assertAlignmentValid(changed.wheelAxleVisualKinematics)
  assert.ok(changedLeft.suspensionVisualOffsetMeters < -0.01)
  assert.ok(
    unchangedRight.hubCenterWorldMeters.distanceTo(unaffectedBaselineCenter) <
      0.00001
  )
  assert.equal(findWheel(changed, 'front-right').tirePressureKpa, 220)
})

test('reset restores exact baseline alignment after pressure, steering, spin, and travel', () => {
  const terrain = { leftHeightMeters: 0 }
  const { car, controller } = createTerrainController((xMeters) =>
    xMeters < -0.5 ? terrain.leftHeightMeters : 0
  )
  const baseline = captureVisualKinematics(controller.getSnapshot(), car)

  terrain.leftHeightMeters = 0.075
  controller.setWheelTirePressureKpa('front-left', 0)
  for (let step = 0; step < 8; step += 1) {
    controller.update(STEP_SECONDS, { throttle: true, left: true })
  }
  terrain.leftHeightMeters = 0
  const resetSnapshot = controller.reset()

  assertAlignmentValid(resetSnapshot.wheelAxleVisualKinematics)
  assert.equal(resetSnapshot.tirePressureState.tirePressureKpa, 220)
  assert.ok(
    resetSnapshot.wheelStates.every(
      (wheel) =>
        wheel.spinAngleRadians === 0 && wheel.steeringAngleRadians === 0
    )
  )
  assert.deepEqual(captureVisualKinematics(resetSnapshot, car), baseline)
})

test('proving-ground features plus airborne and recontact preserve visual attachment', () => {
  const profile = createTerrainSurfaceProfile()

  for (const zMeters of [0, 32, 50.55, 75, 98, 126]) {
    const car = createCar()
    car.position.z = zMeters
    const controller = createVehicleController({
      vehicle: car,
      terrainContactQuery: createHeightfieldTerrainContactQuery({
        surfaceProfile: profile,
      }),
    })
    assertAlignmentValid(
      controller.getSnapshot().wheelAxleVisualKinematics
    )
  }

  const terrain = { leftDepthMeters: 0 }
  const { controller } = createTerrainController((xMeters) =>
    xMeters < -0.5 ? -terrain.leftDepthMeters : 0
  )
  terrain.leftDepthMeters = 0.55
  let snapshot = controller.update(STEP_SECONDS, {})
  assert.equal(findWheel(snapshot, 'front-left').isGrounded, false)
  assertAlignmentValid(snapshot.wheelAxleVisualKinematics)

  terrain.leftDepthMeters = 0
  snapshot = controller.update(STEP_SECONDS, {})
  assert.equal(findWheel(snapshot, 'front-left').isGrounded, true)
  assertAlignmentValid(snapshot.wheelAxleVisualKinematics)
})

test('identical visual update sequences are deterministic without cumulative drift', () => {
  const createSystem = () => {
    const car = createCar()
    return { car, controller: createVehicleController({ vehicle: car }) }
  }
  const first = createSystem()
  const second = createSystem()
  const inputs = [
    { throttle: true },
    { throttle: true, left: true },
    { brake: true },
    { parkingBrake: true, right: true },
    {},
  ]

  first.controller.setWheelTirePressureKpa('rear-left', 80)
  second.controller.setWheelTirePressureKpa('rear-left', 80)
  for (const input of inputs) {
    first.controller.update(STEP_SECONDS, input)
    second.controller.update(STEP_SECONDS, input)
  }

  const firstTransform = captureVisualKinematics(
    first.controller.getSnapshot(),
    first.car
  )
  const secondTransform = captureVisualKinematics(
    second.controller.getSnapshot(),
    second.car
  )
  assert.deepEqual(firstTransform, secondTransform)

  const manager = first.car.userData.vehicle.wheelAxleVisualKinematics
  const wheelStates = first.controller.getSnapshot().wheelStates
  manager.updateFromWheelStates(wheelStates)
  const repeatedTransform = captureVisualKinematics(
    first.controller.getSnapshot(),
    first.car
  )
  assert.deepEqual(repeatedTransform, firstTransform)
})

function createUnitSegmentNode() {
  return new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8))
}

function readSegmentEndpoint(node, localY) {
  return new THREE.Vector3(0, localY, 0).applyMatrix4(node.matrixWorld)
}

function createTerrainController(heightAtWorldX) {
  const profile = createTestProfile(heightAtWorldX)
  const car = createCar()
  const controller = createVehicleController({
    vehicle: car,
    terrainContactQuery: createHeightfieldTerrainContactQuery({
      surfaceProfile: profile,
    }),
  })
  return { car, controller }
}

function createTestProfile(heightAtWorldX) {
  return {
    profileName: 'visual-kinematics-test-profile',
    surfaceKind: 'test-asphalt',
    frictionCoefficient: 1,
    querySurfaceAtWorldPosition(xMeters, zMeters, target = {}) {
      const heightMeters = heightAtWorldX(xMeters, zMeters)
      target.isWithinBounds = true
      target.isInsideTerrainBounds = true
      target.profileName = this.profileName
      target.surfaceKind = this.surfaceKind
      target.frictionCoefficient = this.frictionCoefficient
      target.terrainHeightMeters = heightMeters
      target.groundHeightMeters = heightMeters
      target.normalWorld = target.normalWorld ?? {}
      target.normalWorld.x = 0
      target.normalWorld.y = 1
      target.normalWorld.z = 0
      target.slopeRadians = 0
      target.slopeDegrees = 0
      target.status = 'surface-available'
      return target
    },
  }
}

function captureAllRigidWheelLocalTransforms(car) {
  const transforms = {}
  for (const wheel of car.userData.vehicle.wheels) {
    for (const key of [
      'hub',
      'rimBarrel',
      'beadSeatLeft',
      'beadSeatRight',
      'rimFlangeLeft',
      'rimFlangeRight',
    ]) {
      const node = car.getObjectByName(wheel.visualNodes[key])
      transforms[node.name] = captureNodeTransform(node)
    }
  }
  return transforms
}

function captureArticulatedSegmentTransforms(car) {
  const transforms = {}
  for (const segment of car.userData.vehicle.drivetrain.articulatedSegments) {
    transforms[segment.id] = captureNodeTransform(
      car.getObjectByName(segment.node)
    )
  }
  return transforms
}

function captureVisualKinematics(snapshot, car) {
  return {
    alignment: JSON.parse(
      JSON.stringify(snapshot.wheelAxleVisualKinematics)
    ),
    segments: captureArticulatedSegmentTransforms(car),
    wheelPivots: snapshot.wheelStates.map((wheel) =>
      captureNodeTransform(wheel.visual.pivot)
    ),
    rollingAssemblies: snapshot.wheelStates.map((wheel) =>
      captureNodeTransform(wheel.visual.rollingAssembly)
    ),
  }
}

function captureNodeTransform(node) {
  return {
    position: node.position.toArray(),
    quaternion: node.quaternion.toArray(),
    scale: node.scale.toArray(),
  }
}

function findAlignmentWheel(snapshot, wheelId) {
  return snapshot.wheelAxleVisualKinematics.wheels.find(
    (wheel) => wheel.wheelId === wheelId
  )
}

function findWheel(snapshot, wheelId) {
  return snapshot.wheelStates.find((wheel) => wheel.id === wheelId)
}

function findSegment(snapshot, segmentId) {
  return snapshot.wheelAxleVisualKinematics.segments.find(
    (segment) => segment.id === segmentId
  )
}

function assertAlignmentValid(alignment) {
  assert.equal(alignment.isFinite, true)
  assert.equal(alignment.rigidAlignmentIsValid, true)
  assert.ok(
    alignment.maximumHubToWheelCenterErrorMeters <=
      ALIGNMENT_TOLERANCE_METERS
  )
  assert.ok(
    alignment.maximumRimToWheelCenterErrorMeters <=
      ALIGNMENT_TOLERANCE_METERS
  )
  assert.ok(
    alignment.maximumTireToWheelCenterErrorMeters <=
      ALIGNMENT_TOLERANCE_METERS
  )
  assert.ok(
    alignment.maximumAxleOrShaftEndpointToHubErrorMeters <=
      ALIGNMENT_TOLERANCE_METERS
  )
  assert.ok(alignment.wheels.every((wheel) => wheel.isFinite))
  assert.ok(alignment.segments.every((segment) => segment.isFinite))
}

function assertVectorNear(actual, expected, tolerance = 1e-9) {
  assert.ok(actual.distanceTo(expected) <= tolerance)
}

function assertFiniteTransform(node) {
  for (const value of [
    ...node.position.toArray(),
    ...node.quaternion.toArray(),
    ...node.scale.toArray(),
  ]) {
    assert.ok(Number.isFinite(value))
  }
}
