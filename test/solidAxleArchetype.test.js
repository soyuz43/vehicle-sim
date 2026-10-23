// test/solidAxleArchetype.test.js

// The rear solid axle archetype (Session A2).
//
// The A1 session implemented the rigid axle beam constraint and left it
// unreachable: no catalog entry, no visual, no way for a driver to select it.
// This file covers the archetype as a selectable, observable configuration:
//
//   - the catalog entry exists and describes itself honestly,
//   - the entry differs from the stock preset ONLY in the rear coupling mode,
//   - selecting it at construction time couples the rear axle and leaves the
//     front axle independent,
//   - a coupled rear axle reports ONE shared suspension length for both of
//     its wheels, while an independent axle does not.
//
// The visual half of the archetype (the axle beam mesh and its leaf pack) is
// covered in the same file further down.

import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { createHeightfieldTerrainContactQuery } from '../src/terrain/createHeightfieldTerrainContactQuery.js'
import { applyVehicleConfiguration } from '../src/vehicle/config/applyVehicleConfiguration.js'
import {
  createDefaultVehicleConfiguration,
  setVehicleConfigurationSlot,
} from '../src/vehicle/config/createVehicleConfiguration.js'
import {
  SUSPENSION_OWNED_SPEC_FIELDS,
  VEHICLE_COMPONENT_CATALOG,
  getComponent,
} from '../src/vehicle/config/componentCatalog.js'
import { DEFAULT_VEHICLE_SPEC } from '../src/vehicle/defaultVehicleSpec.js'

const DT_SECONDS = 1 / 60
const SETTLE_STEPS = 300
const STEP_HEIGHT_METERS = 0.08
const ARCHETYPE_ID = 'susp-solid-axle-rear'
const STOCK_ID = 'susp-stock'
const HEAVY_TRUCK_CHASSIS_ID = 'chassis-heavytruck'

// +X is the car's LEFT side and +Z is forward (src/car/createCar.js).
const REAR_LEFT_WHEEL_XZ = Object.freeze({ x: 1.25, z: -1.45 })
const FRONT_LEFT_WHEEL_XZ = Object.freeze({ x: 1.25, z: 1.45 })

function createFlatHeightfieldQuery() {
  return createHeightfieldTerrainContactQuery({
    surfaceProfile: {
      profileName: 'solid-axle-flat',
      surfaceKind: 'test-asphalt',
      frictionCoefficient: 1,
      querySurfaceAtWorldPosition(worldXMeters, worldZMeters, target = {}) {
        target.isWithinBounds = true
        target.isInsideTerrainBounds = true
        target.profileName = 'solid-axle-flat'
        target.surfaceKind = 'test-asphalt'
        target.frictionCoefficient = 1
        target.terrainHeightMeters = 0
        target.groundHeightMeters = 0
        target.normalWorld = target.normalWorld ?? {}
        target.normalWorld.x = 0
        target.normalWorld.y = 1
        target.normalWorld.z = 0
        target.slopeRadians = 0
        target.slopeDegrees = 0
        target.status = 'surface-available'
        return target
      },
    },
  })
}

// Raises the terrain under ONE wheel inside the suspension contact query
// only, so the chassis terrain support state keeps seeing flat ground. This
// isolates the axle constraint from the pre-existing chassis coupling.
function createRaisedStepQuery(targetWheelXZ, stepHeightMeters = STEP_HEIGHT_METERS) {
  const baseQuery = createFlatHeightfieldQuery()
  const matchToleranceMeters = 0.1

  return {
    kind: 'solid-axle-archetype-step-query',
    queryAtWorldXZ: (worldXMeters, worldZMeters, target) =>
      baseQuery.queryAtWorldXZ(worldXMeters, worldZMeters, target),
    querySuspensionContact(input, target) {
      baseQuery.querySuspensionContact(input, target)

      const isTargetWheel =
        Math.abs(input.rayOriginWorld.x - targetWheelXZ.x) < matchToleranceMeters &&
        Math.abs(input.rayOriginWorld.z - targetWheelXZ.z) < matchToleranceMeters

      if (!isTargetWheel || target.hasContact !== true) return target

      target.rayDistanceMeters += stepHeightMeters
      target.terrainRayDistanceMeters = target.rayDistanceMeters
      target.wheelCenterDistanceAlongSuspensionMeters -= stepHeightMeters
      target.contactPointWorld.y += stepHeightMeters
      target.terrainHeightMeters += stepHeightMeters
      return target
    },
  }
}

function smoothstep01(value) {
  const clamped = Math.min(1, Math.max(0, value))
  return clamped * clamped * (3 - 2 * clamped)
}

function plateau01(value, low, high, margin) {
  if (value <= low || value >= high) return 0
  if (value < low + margin) return smoothstep01((value - low) / margin)
  if (value > high - margin) return smoothstep01((high - value) / margin)
  return 1
}

function createOneSidedBumpQuery() {
  const heightAt = (worldXMeters, worldZMeters) =>
    STEP_HEIGHT_METERS *
    plateau01(worldXMeters, 0.8, 1.7, 0.25) *
    plateau01(worldZMeters, 12, 18, 0.6)

  return createHeightfieldTerrainContactQuery({
    surfaceProfile: {
      profileName: 'heavy-truck-one-sided-bump',
      surfaceKind: 'test-asphalt',
      frictionCoefficient: 1,
      querySurfaceAtWorldPosition(worldXMeters, worldZMeters, target = {}) {
        const sampleSpacingMeters = 0.02
        const slopeXMetersPerMeter =
          (heightAt(worldXMeters + sampleSpacingMeters, worldZMeters) -
            heightAt(worldXMeters - sampleSpacingMeters, worldZMeters)) /
          (2 * sampleSpacingMeters)
        const slopeZMetersPerMeter =
          (heightAt(worldXMeters, worldZMeters + sampleSpacingMeters) -
            heightAt(worldXMeters, worldZMeters - sampleSpacingMeters)) /
          (2 * sampleSpacingMeters)
        const normal = new THREE.Vector3(
          -slopeXMetersPerMeter,
          1,
          -slopeZMetersPerMeter
        ).normalize()

        target.isWithinBounds = true
        target.isInsideTerrainBounds = true
        target.profileName = 'heavy-truck-one-sided-bump'
        target.surfaceKind = 'test-asphalt'
        target.frictionCoefficient = 1
        target.terrainHeightMeters = heightAt(worldXMeters, worldZMeters)
        target.groundHeightMeters = target.terrainHeightMeters
        target.normalWorld = target.normalWorld ?? {}
        target.normalWorld.x = normal.x
        target.normalWorld.y = normal.y
        target.normalWorld.z = normal.z
        target.slopeRadians = Math.atan(
          Math.hypot(slopeXMetersPerMeter, slopeZMetersPerMeter)
        )
        target.slopeDegrees = (target.slopeRadians * 180) / Math.PI
        target.status = 'surface-available'
        return target
      },
    },
  })
}

function createController({ spec = {}, terrainContactQuery } = {}) {
  return createVehicleController({
    vehicle: createCar(),
    startPosition: new THREE.Vector3(0, 0, 0),
    terrainContactQuery: terrainContactQuery ?? createFlatHeightfieldQuery(),
    spec,
  })
}

function createCatalogCar(
  suspensionComponentId,
  terrainContactQuery,
  chassisComponentId = null
) {
  const car = createCar()
  let configuration = setVehicleConfigurationSlot(
    createDefaultVehicleConfiguration(),
    'suspension',
    suspensionComponentId
  )
  if (chassisComponentId) {
    configuration = setVehicleConfigurationSlot(
      configuration,
      'chassis',
      chassisComponentId
    )
  }
  const applied = applyVehicleConfiguration(configuration)

  const controller = createVehicleController({
    vehicle: car,
    startPosition: new THREE.Vector3(0, 0, 0),
    terrainContactQuery: terrainContactQuery ?? createFlatHeightfieldQuery(),
    spec: applied.spec,
  })

  return { car, controller }
}

function createCatalogController(suspensionComponentId, terrainContactQuery) {
  return createCatalogCar(suspensionComponentId, terrainContactQuery).controller
}

// Every node name in the vehicle tree, so a test can assert that a kind of
// geometry is absent without depending on one specific node name.
function collectNodeNames(node, names = []) {
  if (node?.name) names.push(node.name)
  for (const child of node?.children ?? []) collectNodeNames(child, names)
  return names
}

// The axle beam and the leaf pack are the archetype's visual signature. A
// stock car must carry neither.
function findAxleBeamNodeNames(car) {
  return collectNodeNames(car).filter(
    (name) => name.includes('axle-beam') || name.includes('axle-leaf-pack')
  )
}

// The beam's roll, read back from the node's own transform rather than from
// the visual module's bookkeeping. The beam runs from the RIGHT wheel to the
// LEFT wheel, so its axis points along +X and its elevation angle is the
// axle's roll in radians (positive when the left wheel is higher).
function readBeamRollRadians(beamNode) {
  const beamAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(beamNode.quaternion)
  return Math.atan2(beamAxis.y, beamAxis.x)
}

function settle(controller, steps = SETTLE_STEPS) {
  let snapshot
  for (let step = 0; step < steps; step += 1) {
    snapshot = controller.update(DT_SECONDS, {})
  }
  return snapshot
}

function wheelState(snapshot, wheelId) {
  const found = snapshot.wheelStates.find((wheel) => wheel.id === wheelId)
  assert.ok(found, 'wheel ' + wheelId + ' must exist in the snapshot')
  return found
}

test('the catalog exposes exactly one solid axle archetype', () => {
  const suspensionComponents = VEHICLE_COMPONENT_CATALOG.suspension.components
  const solidAxleIds = Object.keys(suspensionComponents).filter((componentId) =>
    componentId.includes('solid-axle')
  )

  assert.deepEqual(solidAxleIds, [ARCHETYPE_ID])
  assert.equal(VEHICLE_COMPONENT_CATALOG.suspension.defaultComponentId, STOCK_ID)
})

test('the solid axle archetype describes what it actually models', () => {
  const component = getComponent('suspension', ARCHETYPE_ID)

  assert.equal(component.id, ARCHETYPE_ID)
  assert.equal(typeof component.label, 'string')
  assert.ok(component.label.length > 0)

  // The description must name the rear beam, say that the front stays
  // independent, and not claim models this simulation does not have.
  assert.match(component.description, /rear/i)
  assert.match(component.description, /beam/i)
  assert.match(component.description, /front/i)
  assert.match(component.description, /independent/i)
  assert.doesNotMatch(component.description, /progressive leaf model\b(?![^.]*no )/i)
  assert.match(component.description, /no progressive leaf model/i)
  assert.match(component.description, /no anti-roll bar/i)
  assert.match(component.description, /no unsprung-mass model/i)
  assert.doesNotMatch(component.description, /leaf spring rate/i)
})

test('the solid axle archetype differs from the stock preset only in the rear coupling mode', () => {
  const archetype = getComponent('suspension', ARCHETYPE_ID)
  const stock = getComponent('suspension', STOCK_ID)

  assert.equal(archetype.spec.frontAxleCoupling, 'independent')
  assert.equal(archetype.spec.rearAxleCoupling, 'rigidAxle')
  assert.equal(stock.spec.frontAxleCoupling, 'independent')
  assert.equal(stock.spec.rearAxleCoupling, 'independent')

  for (const field of SUSPENSION_OWNED_SPEC_FIELDS) {
    if (field === 'rearAxleCoupling') continue
    assert.equal(
      archetype.spec[field],
      stock.spec[field],
      field + ' must match the stock preset so the coupling is the only difference'
    )
  }
})

test('every suspension component declares every field the suspension slot owns', () => {
  const suspensionComponents = VEHICLE_COMPONENT_CATALOG.suspension.components

  for (const componentId of Object.keys(suspensionComponents)) {
    const component = suspensionComponents[componentId]
    for (const field of SUSPENSION_OWNED_SPEC_FIELDS.filter(
      (field) => field !== 'suspensionLinkage'
    )) {
      assert.ok(
        Object.hasOwn(component.spec, field),
        componentId + ' must declare ' + field
      )
    }
  }
})

test('the default configuration still produces the stock vehicle', () => {
  const applied = applyVehicleConfiguration(createDefaultVehicleConfiguration())

  for (const field of SUSPENSION_OWNED_SPEC_FIELDS) {
    assert.equal(
      applied.spec[field],
      DEFAULT_VEHICLE_SPEC[field],
      field + ' must match the default spec'
    )
  }
  assert.equal(applied.spec.rearAxleCoupling, 'independent')
})

test('selecting the archetype at construction time couples the rear axle only', () => {
  const snapshot = settle(createCatalogController(ARCHETYPE_ID))

  assert.equal(snapshot.axleCoupling.axles.rear.isCoupled, true)
  assert.equal(snapshot.axleCoupling.axles.rear.couplingMode, 'rigidAxle')
  assert.equal(snapshot.axleCoupling.axles.front.isCoupled, false)
  assert.equal(snapshot.axleCoupling.axles.front.couplingMode, 'independent')
})

test('a coupled rear axle reports one shared suspension length for both wheels', () => {
  const coupled = settle(
    createCatalogController(ARCHETYPE_ID, createRaisedStepQuery(REAR_LEFT_WHEEL_XZ))
  )
  const independent = settle(
    createCatalogController(STOCK_ID, createRaisedStepQuery(REAR_LEFT_WHEEL_XZ))
  )

  const coupledNear = wheelState(coupled, 'rear-left')
  const coupledFar = wheelState(coupled, 'rear-right')
  const independentNear = wheelState(independent, 'rear-left')
  const independentFar = wheelState(independent, 'rear-right')

  assert.ok(
    Math.abs(
      coupledNear.suspensionCurrentLengthMeters -
        coupledFar.suspensionCurrentLengthMeters
    ) < 1e-9,
    'a coupled axle must report the same suspension length on both wheels'
  )
  assert.ok(
    Math.abs(
      independentNear.suspensionCurrentLengthMeters -
        independentFar.suspensionCurrentLengthMeters
    ) > 1e-3,
    'an independent axle must keep its own suspension length per wheel'
  )
  assert.ok(
    coupledNear.suspensionCompressionMeters < independentNear.suspensionCompressionMeters,
    'the shared leaf must carry less compression than the lifted corner alone'
  )
  assert.ok(
    Math.abs(
      coupledNear.suspensionCompressionMeters -
        coupledFar.suspensionCompressionMeters
    ) < 1e-9,
    'both wheels of a coupled axle must report the same compression'
  )
})

test('the front axle of the archetype stays independent', () => {
  const snapshot = settle(
    createCatalogController(ARCHETYPE_ID, createRaisedStepQuery(FRONT_LEFT_WHEEL_XZ))
  )

  const near = wheelState(snapshot, 'front-left')
  const far = wheelState(snapshot, 'front-right')

  assert.ok(
    Math.abs(
      near.suspensionCurrentLengthMeters - far.suspensionCurrentLengthMeters
    ) > 1e-3,
    'the front axle must keep its own suspension length per wheel'
  )
  assert.equal(snapshot.axleCoupling.axles.front.isCoupled, false)
})

// ---------------------------------------------------------------------------
// The archetype's visual: a rigid beam that spans the two wheel centres of a
// coupled axle, plus the leaf pack that carries it.
// ---------------------------------------------------------------------------

test('the stock car carries no axle beam geometry at all', () => {
  const { car, controller } = createCatalogCar(STOCK_ID)
  settle(controller)

  assert.deepEqual(findAxleBeamNodeNames(car), [])
  assert.equal(car.getObjectByName('rear-axle-beam-visual'), undefined)
  assert.equal(car.getObjectByName('front-axle-beam-visual'), undefined)
  assert.equal(car.getObjectByName('rear-axle-leaf-pack-visual'), undefined)
})

test('the coupled archetype draws a rear axle beam and a leaf pack', () => {
  const { car, controller } = createCatalogCar(ARCHETYPE_ID)
  settle(controller)

  const beamNode = car.getObjectByName('rear-axle-beam-visual')
  const leafPackNode = car.getObjectByName('rear-axle-leaf-pack-visual')

  assert.ok(beamNode, 'the coupled rear axle must draw a beam')
  assert.ok(leafPackNode, 'the coupled rear axle must draw a leaf pack')
  assert.equal(beamNode.visible, true)
  assert.equal(leafPackNode.visible, true)
  assert.equal(
    car.getObjectByName('front-axle-beam-visual'),
    undefined,
    'the independent front axle must not draw a beam'
  )
  assert.equal(car.getObjectByName('front-axle-leaf-pack-visual'), undefined)
})

test('the axle beam tracks the wheel positions it spans', () => {
  const { car, controller } = createCatalogCar(
    ARCHETYPE_ID,
    createRaisedStepQuery(REAR_LEFT_WHEEL_XZ)
  )
  const snapshot = settle(controller)

  const beamNode = car.getObjectByName('rear-axle-beam-visual')
  assert.ok(beamNode)

  const leftCenter = wheelState(snapshot, 'rear-left').wheelCenterLocalPosition.clone()
  const rightCenter = wheelState(snapshot, 'rear-right').wheelCenterLocalPosition.clone()
  const expectedMidpoint = new THREE.Vector3()
    .addVectors(leftCenter, rightCenter)
    .multiplyScalar(0.5)

  assert.ok(
    beamNode.position.distanceTo(expectedMidpoint) < 1e-6,
    'the beam must sit at the mean of the two wheel centres; got ' +
      beamNode.position.toArray().join(', ') + ' vs ' + expectedMidpoint.toArray().join(', ')
  )
  assert.ok(
    Math.abs(beamNode.scale.y - leftCenter.distanceTo(rightCenter)) < 1e-6,
    'the beam must be stretched to the distance between the wheel centres'
  )
})

test('the heavy truck stays stable over a one-sided bump at speed', () => {
  const { controller } = createCatalogCar(
    ARCHETYPE_ID,
    createOneSidedBumpQuery(),
    HEAVY_TRUCK_CHASSIS_ID
  )
  let previousBeamRollRadians = null
  let previousBodyRollRadians = null
  let maximumBeamRollStepRadians = 0
  let maximumBodyRollStepRadians = 0
  let maximumAbsoluteBodyRollRadians = 0
  let maximumSpeedAtBumpMetersPerSecond = 0
  let maximumBumpContactHeightMeters = 0

  for (let step = 0; step < 900; step += 1) {
    const snapshot = controller.update(DT_SECONDS, { throttle: true })
    const rearAxle = snapshot.axleCoupling.axles.rear
    const beamRollRadians = rearAxle.beamRollRadians
    const bodyRollRadians = snapshot.verticalDynamics.rollRadians
    const rearLeftWheel = wheelState(snapshot, 'rear-left')
    const rearRightWheel = wheelState(snapshot, 'rear-right')
    const bumpContactHeightMeters = Math.max(
      rearLeftWheel.contactPointWorldPosition.y,
      rearRightWheel.contactPointWorldPosition.y
    )

    assert.equal(rearAxle.isCoupled, true)
    assert.ok(Number.isFinite(snapshot.position.z))
    assert.ok(Number.isFinite(snapshot.speedMetersPerSecond))
    assert.ok(Number.isFinite(beamRollRadians))
    assert.ok(Number.isFinite(bodyRollRadians))

    if (bumpContactHeightMeters > 0.04) {
      maximumBumpContactHeightMeters = Math.max(
        maximumBumpContactHeightMeters,
        bumpContactHeightMeters
      )
      maximumSpeedAtBumpMetersPerSecond = Math.max(
        maximumSpeedAtBumpMetersPerSecond,
        snapshot.speedMetersPerSecond
      )
    }

    maximumAbsoluteBodyRollRadians = Math.max(
      maximumAbsoluteBodyRollRadians,
      Math.abs(bodyRollRadians)
    )
    if (previousBeamRollRadians !== null) {
      maximumBeamRollStepRadians = Math.max(
        maximumBeamRollStepRadians,
        Math.abs(beamRollRadians - previousBeamRollRadians)
      )
      maximumBodyRollStepRadians = Math.max(
        maximumBodyRollStepRadians,
        Math.abs(bodyRollRadians - previousBodyRollRadians)
      )
    }
    previousBeamRollRadians = beamRollRadians
    previousBodyRollRadians = bodyRollRadians
  }

  assert.ok(
    maximumBumpContactHeightMeters > 0.06,
    'the rear axle must cross the one-sided terrain bump'
  )
  assert.ok(
    maximumSpeedAtBumpMetersPerSecond > 2,
    'the truck must cross the bump while moving at speed'
  )
  assert.ok(
    maximumAbsoluteBodyRollRadians < 0.2,
    'the body roll must remain bounded rather than oscillating or diverging'
  )
  assert.ok(
    maximumBeamRollStepRadians < 0.1,
    'the beam roll must change continuously without frame-to-frame jitter'
  )
  assert.ok(
    maximumBodyRollStepRadians < 0.05,
    'the body roll must change continuously without frame-to-frame jitter'
  )
})

test('the axle beam roll tracks the simulated beam roll', () => {
  const { car, controller } = createCatalogCar(
    ARCHETYPE_ID,
    createRaisedStepQuery(REAR_LEFT_WHEEL_XZ)
  )
  const snapshot = settle(controller)

  const beamNode = car.getObjectByName('rear-axle-beam-visual')
  const leafPackNode = car.getObjectByName('rear-axle-leaf-pack-visual')
  const simulatedRollRadians = snapshot.axleCoupling.axles.rear.beamRollRadians

  assert.ok(
    Math.abs(simulatedRollRadians) > 1e-3,
    'a one-sided rear step must roll the beam; got ' + simulatedRollRadians
  )
  assert.ok(
    Math.abs(readBeamRollRadians(beamNode) - simulatedRollRadians) < 1e-6,
    'the drawn beam roll must match the simulated beam roll; got ' +
      readBeamRollRadians(beamNode) + ' vs ' + simulatedRollRadians
  )
  assert.ok(
    Math.abs(leafPackNode.rotation.z - simulatedRollRadians) < 1e-6,
    'the leaf pack must roll with the beam'
  )
})

test('a level axle draws a level beam', () => {
  const { car, controller } = createCatalogCar(ARCHETYPE_ID)
  const snapshot = settle(controller)

  const beamNode = car.getObjectByName('rear-axle-beam-visual')
  const simulatedRollRadians = snapshot.axleCoupling.axles.rear.beamRollRadians

  assert.ok(Math.abs(simulatedRollRadians) < 1e-9)
  assert.ok(Math.abs(readBeamRollRadians(beamNode)) < 1e-9)
})

test('a reset keeps the archetype and its beam', () => {
  const { car, controller } = createCatalogCar(
    ARCHETYPE_ID,
    createRaisedStepQuery(REAR_LEFT_WHEEL_XZ)
  )
  settle(controller)

  const beamNode = car.getObjectByName('rear-axle-beam-visual')
  const leafPackNode = car.getObjectByName('rear-axle-leaf-pack-visual')
  assert.equal(beamNode.visible, true)

  controller.reset()
  const snapshot = settle(controller, 1)

  // A reset re-solves the axle coupling inside the reset itself, so the
  // archetype and its beam survive it.
  assert.equal(snapshot.axleCoupling.axles.rear.isCoupled, true)
  assert.equal(beamNode.visible, true)
  assert.equal(leafPackNode.visible, true)
  assert.ok(
    Math.abs(
      readBeamRollRadians(beamNode) -
        snapshot.axleCoupling.axles.rear.beamRollRadians
    ) < 1e-6
  )
})

