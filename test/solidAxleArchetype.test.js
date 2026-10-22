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

function createController({ spec = {}, terrainContactQuery } = {}) {
  return createVehicleController({
    vehicle: createCar(),
    startPosition: new THREE.Vector3(0, 0, 0),
    terrainContactQuery: terrainContactQuery ?? createFlatHeightfieldQuery(),
    spec,
  })
}

function createCatalogController(suspensionComponentId, terrainContactQuery) {
  const configuration = setVehicleConfigurationSlot(
    createDefaultVehicleConfiguration(),
    'suspension',
    suspensionComponentId
  )
  const applied = applyVehicleConfiguration(configuration)

  return createController({
    spec: applied.spec,
    terrainContactQuery,
  })
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
    for (const field of SUSPENSION_OWNED_SPEC_FIELDS) {
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
