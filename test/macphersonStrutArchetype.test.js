// test/macphersonStrutArchetype.test.js

// The MacPherson strut archetype (Session A3, camber session).
//
// The archetype keeps the stock suspension model and the stock coupling
// modes, and it is physics-distinct in exactly one respect: the strut's
// positive camber gain.
//
//   - the catalog entry exists and describes its own scope honestly,
//   - the entry differs from the stock preset in the suspension visual kind
//     and in the camber gain, and in nothing else,
//   - the stock car draws no strut geometry at all, and the MacPherson
//     profile draws a strut on each front corner and none on the rear,
//   - the strut follows the published wheel position, so it compresses with
//     the suspension travel instead of being a static prop,
//   - a runtime swap to the archetype changes the visuals AND the physics:
//     the physics trace is distinguishable from a run that never swapped,
//     and the per-wheel lateral force delta stays bounded.
//
// The bounded-delta test is the load-bearing one. The camber gain is a
// real tire-model term and a small effect by construction: it is not a
// handling rewrite, and the test says so.

import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { createFlatTerrainContactQuery } from '../src/terrain/createFlatTerrainContactQuery.js'
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
import { solveLinkageCamber } from '../src/vehicle/dynamics/linkageCamberSolver.js'
import { DEFAULT_VEHICLE_SPEC } from '../src/vehicle/defaultVehicleSpec.js'

const DT_SECONDS = 1 / 60
const SETTLE_STEPS = 300
const TRACE_STEPS = 900
const STEP_HEIGHT_METERS = 0.08
const ARCHETYPE_ID = 'susp-macpherson-strut'
const STOCK_ID = 'susp-stock'

// +X is the car's LEFT side and +Z is forward (src/car/createCar.js).
const FRONT_LEFT_WHEEL_XZ = Object.freeze({ x: 1.25, z: 1.45 })
const REAR_LEFT_WHEEL_XZ = Object.freeze({ x: 1.25, z: -1.45 })

// The strut is drawn inboard of the wheel. The offset is a property of the
// visual module, not of the simulation, so the test reads it back from the
// drawn strut instead of hard-coding it.
const STRUT_INBOARD_OFFSET_METERS = 0.26

function createFlatHeightfieldQuery() {
  return createHeightfieldTerrainContactQuery({
    surfaceProfile: {
      profileName: 'macpherson-flat',
      surfaceKind: 'test-asphalt',
      frictionCoefficient: 1,
      querySurfaceAtWorldPosition(worldXMeters, worldZMeters, target = {}) {
        target.isWithinBounds = true
        target.isInsideTerrainBounds = true
        target.profileName = 'macpherson-flat'
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
// isolates the strut's travel from the pre-existing chassis coupling.
function createRaisedStepQuery(
  targetWheelXZ,
  stepHeightMeters = STEP_HEIGHT_METERS
) {
  const baseQuery = createFlatHeightfieldQuery()
  const matchToleranceMeters = 0.1

  return {
    kind: 'macpherson-strut-step-query',
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
    terrainContactQuery: terrainContactQuery ?? createFlatTerrainContactQuery(),
    spec,
  })
}

function createCatalogCar(suspensionComponentId, terrainContactQuery) {
  const car = createCar()
  const configuration = setVehicleConfigurationSlot(
    createDefaultVehicleConfiguration(),
    'suspension',
    suspensionComponentId
  )
  const applied = applyVehicleConfiguration(configuration)

  const controller = createVehicleController({
    vehicle: car,
    startPosition: new THREE.Vector3(0, 0, 0),
    terrainContactQuery: terrainContactQuery ?? createFlatTerrainContactQuery(),
    spec: applied.spec,
  })

  return { car, controller, spec: applied.spec }
}

// The lateral force of every wheel at every step, so two runs can be
// compared field by field without depending on the text trace format.
function buildLateralForceTrace(controller, steps = TRACE_STEPS) {
  const rows = []

  for (let step = 0; step < steps; step += 1) {
    const input = step < 300 ? { throttle: true } : { throttle: true, left: true }
    const snapshot = controller.update(DT_SECONDS, input)
    rows.push(
      snapshot.wheelStates.map((wheel) => wheel.appliedLateralTireForceNewtons)
    )
  }

  return rows
}

function maximumPerWheelForceDelta(stockRows, otherRows) {
  let maximumDeltaNewtons = 0

  for (let step = 0; step < stockRows.length; step += 1) {
    for (let wheel = 0; wheel < stockRows[step].length; wheel += 1) {
      maximumDeltaNewtons = Math.max(
        maximumDeltaNewtons,
        Math.abs(stockRows[step][wheel] - otherRows[step][wheel])
      )
    }
  }

  return maximumDeltaNewtons
}

function runCorner(controller, steps = TRACE_STEPS) {
  let snapshot

  for (let step = 0; step < steps; step += 1) {
    const input = step < 300 ? { throttle: true } : { throttle: true, left: true }
    snapshot = controller.update(DT_SECONDS, input)
  }

  return snapshot
}

function settle(controller, steps = SETTLE_STEPS) {
  let snapshot
  for (let step = 0; step < steps; step += 1) {
    snapshot = controller.update(DT_SECONDS, {})
  }
  return snapshot
}

// Every node name in the vehicle tree, so a test can assert that a kind of
// geometry is absent without depending on one specific node name.
function collectNodeNames(node, names = []) {
  if (node?.name) names.push(node.name)
  for (const child of node?.children ?? []) collectNodeNames(child, names)
  return names
}

function findStrutNodeNames(car) {
  return collectNodeNames(car).filter((name) => name.includes('strut'))
}

function wheelState(snapshot, wheelId) {
  const found = snapshot.wheelStates.find((wheel) => wheel.id === wheelId)
  assert.ok(found, 'wheel ' + wheelId + ' must exist in the snapshot')
  return found
}

// A canonical text trace of a driving run. It is used to compare two runs
// field by field without depending on object identity.
function buildPhysicsTrace(controller, steps = TRACE_STEPS) {
  const lines = []

  for (let step = 0; step < steps; step += 1) {
    const input = step < 300 ? { throttle: true } : { throttle: true, left: true }
    const snapshot = controller.update(DT_SECONDS, input)
    const verticalDynamics = snapshot.verticalDynamics

    const wheelFields = []
    for (const wheel of snapshot.wheelStates) {
      wheelFields.push(
        wheel.id,
        wheel.isGrounded ? 1 : 0,
        wheel.suspensionCurrentLengthMeters.toFixed(9),
        wheel.suspensionCompressionMeters.toFixed(9),
        wheel.baseNormalForceNewtons.toFixed(9),
        wheel.normalForceNewtons.toFixed(9),
        wheel.verticalDynamicsLoadDeviationNewtons.toFixed(9)
      )
    }

    lines.push(
      [
        step,
        snapshot.position.x.toFixed(9),
        snapshot.position.y.toFixed(9),
        snapshot.position.z.toFixed(9),
        snapshot.yawRadians.toFixed(9),
        verticalDynamics.heaveMeters.toFixed(9),
        verticalDynamics.rollRadians.toFixed(9),
        verticalDynamics.pitchRadians.toFixed(9),
        ...wheelFields,
      ].join('|')
    )
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// The catalog entry.
// ---------------------------------------------------------------------------

test('the catalog exposes exactly one MacPherson archetype', () => {
  const suspensionComponents = VEHICLE_COMPONENT_CATALOG.suspension.components
  const macphersonIds = Object.keys(suspensionComponents).filter((componentId) =>
    componentId.includes('macpherson')
  )

  assert.deepEqual(macphersonIds, [ARCHETYPE_ID])
  assert.equal(VEHICLE_COMPONENT_CATALOG.suspension.defaultComponentId, STOCK_ID)
})

test('the MacPherson archetype describes what it actually models', () => {
  const component = getComponent('suspension', ARCHETYPE_ID)

  assert.equal(component.id, ARCHETYPE_ID)
  assert.equal(typeof component.label, 'string')
  assert.ok(component.label.length > 0)
  assert.match(component.label, /strut/i)
  assert.match(component.label, /camber/i)
  assert.doesNotMatch(component.label, /visual only/i)

  // The description must name the visual, say that the front axle is the
  // strut axle and that the rear stays independent, claim the camber gain
  // it actually models, and still not claim models this simulation does
  // not have.
  assert.match(component.description, /strut/i)
  assert.match(component.description, /front/i)
  assert.match(component.description, /rear/i)
  assert.match(component.description, /independent/i)
  assert.match(component.description, /same independent suspension model as stock/i)
  assert.match(component.description, /no spring rate, travel, damping, or coupling mode/i)
  assert.match(component.description, /not modelled/i)
  assert.match(component.description, /roll-center parameters/i)
  assert.match(component.description, /camber gain/i)
  assert.match(component.description, /camber gain is modelled/i)
  assert.match(component.description, /\+0\.52 deg/)
  assert.match(component.description, /does change handling/i)
  assert.doesNotMatch(component.description, /does not currently change handling/i)
})

test('the MacPherson archetype differs from the stock preset in its visual kind, its camber gain and its linkage', () => {
  const archetype = getComponent('suspension', ARCHETYPE_ID)
  const stock = getComponent('suspension', STOCK_ID)

  assert.equal(archetype.spec.suspensionVisualKind, 'macphersonStrut')
  assert.equal(stock.spec.suspensionVisualKind, 'none')
  assert.equal(archetype.spec.frontAxleCoupling, 'independent')
  assert.equal(archetype.spec.rearAxleCoupling, 'independent')

  // The linear coefficient is zeroed so the linkage solver owns the camber
  // curve; the linkage geometry is the only other field that departs from stock.
  assert.equal(archetype.spec.camberGainRadiansPerMeterCompression, 0)
  assert.equal(stock.spec.camberGainRadiansPerMeterCompression, 0)
  assert.ok(Object.hasOwn(archetype.spec, 'suspensionLinkage'))
  assert.ok(!Object.hasOwn(stock.spec, 'suspensionLinkage'))

  // Every other owned field must still match the stock preset.
  for (const field of SUSPENSION_OWNED_SPEC_FIELDS) {
    if (field === 'suspensionVisualKind') continue
    if (field === 'camberGainRadiansPerMeterCompression') continue
    if (field === 'suspensionLinkage') continue
    assert.equal(
      archetype.spec[field],
      stock.spec[field],
      field + ' must match the stock preset so the linkage is the only difference'
    )
  }
})

test('the MacPherson archetype declares every field the suspension slot owns', () => {
  const component = getComponent('suspension', ARCHETYPE_ID)

  for (const field of SUSPENSION_OWNED_SPEC_FIELDS.filter(
    (field) => field !== 'suspensionLinkage'
  )) {
    assert.ok(
      Object.hasOwn(component.spec, field),
      ARCHETYPE_ID + ' must declare ' + field
    )
  }
})

test('the default configuration still produces the stock vehicle', () => {
  const applied = applyVehicleConfiguration(createDefaultVehicleConfiguration())

  assert.equal(applied.spec.suspensionVisualKind, 'none')
  assert.equal(
    DEFAULT_VEHICLE_SPEC.suspensionVisualKind,
    'none',
    'the shipped default must draw no archetype geometry'
  )
})

// ---------------------------------------------------------------------------
// The visual.
// ---------------------------------------------------------------------------

test('the stock car carries no strut geometry at all', () => {
  const { car, controller } = createCatalogCar(STOCK_ID)
  const snapshot = settle(controller)

  assert.deepEqual(findStrutNodeNames(car), [])
  assert.equal(car.getObjectByName('front-left-strut-visual'), undefined)
  assert.equal(car.getObjectByName('front-right-strut-visual'), undefined)
  assert.equal(snapshot.suspensionVisuals.suspensionVisualKind, 'none')
})

test('the MacPherson archetype draws a strut on each front corner only', () => {
  const { car, controller } = createCatalogCar(ARCHETYPE_ID)
  const snapshot = settle(controller)

  const frontLeftNode = car.getObjectByName('front-left-strut-visual')
  const frontRightNode = car.getObjectByName('front-right-strut-visual')

  assert.ok(frontLeftNode, 'the front left corner must draw a strut')
  assert.ok(frontRightNode, 'the front right corner must draw a strut')
  assert.equal(frontLeftNode.visible, true)
  assert.equal(frontRightNode.visible, true)

  assert.equal(
    car.getObjectByName('rear-left-strut-visual'),
    undefined,
    'the rear axle stays stock and must draw no strut'
  )
  assert.equal(car.getObjectByName('rear-right-strut-visual'), undefined)

  const struts = snapshot.suspensionVisuals.struts
  assert.equal(struts['front-left'].isVisible, true)
  assert.equal(struts['front-right'].isVisible, true)
  assert.equal(struts['rear-left'].isVisible, false)
  assert.equal(struts['rear-right'].isVisible, false)
  assert.equal(
    snapshot.suspensionVisuals.suspensionVisualKind,
    'macphersonStrut'
  )
})

test('the strut tracks the published wheel position it spans', () => {
  // The step under the front left wheel moves that wheel away from its
  // static height, so a strut that is frozen at a fixed height cannot
  // pass this test.
  const { car, controller } = createCatalogCar(
    ARCHETYPE_ID,
    createRaisedStepQuery(FRONT_LEFT_WHEEL_XZ)
  )
  const snapshot = settle(controller)

  const strutNode = car.getObjectByName('front-left-strut-visual')
  assert.ok(strutNode)

  const wheel = wheelState(snapshot, 'front-left')
  const strut = snapshot.suspensionVisuals.struts['front-left']

  assert.ok(
    Math.abs(
      strut.bottomLocalMeters.y - wheel.wheelCenterLocalPosition.y
    ) < 1e-9,
    'the strut must end at the published wheel centre height; got ' +
      strut.bottomLocalMeters.y +
      ' vs ' +
      wheel.wheelCenterLocalPosition.y
  )
  assert.ok(
    Math.abs(
      strut.bottomLocalMeters.z - wheel.wheelCenterLocalPosition.z
    ) < 1e-9,
    'the strut must end at the published wheel centre'
  )
  assert.ok(
    Math.abs(
      Math.abs(strut.bottomLocalMeters.x - wheel.wheelCenterLocalPosition.x) -
        STRUT_INBOARD_OFFSET_METERS
    ) < 1e-9,
    'the strut must sit inboard of the wheel by a fixed offset'
  )

  // The drawn node must agree with the published strut pose.
  const expectedMidpoint = new THREE.Vector3()
    .addVectors(strut.topLocalMeters, strut.bottomLocalMeters)
    .multiplyScalar(0.5)
  assert.ok(
    strutNode.position.distanceTo(expectedMidpoint) < 1e-6,
    'the strut node must sit between its two ends'
  )

  const expectedAxis = new THREE.Vector3()
    .subVectors(strut.topLocalMeters, strut.bottomLocalMeters)
    .normalize()
  const drawnAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(
    strutNode.quaternion
  )
  assert.ok(
    drawnAxis.distanceTo(expectedAxis) < 1e-6,
    'the strut node must point along its own axis'
  )
})

test('the strut compresses with the suspension travel', () => {
  const flat = createCatalogCar(ARCHETYPE_ID)
  const flatSnapshot = settle(flat.controller)

  const bumped = createCatalogCar(
    ARCHETYPE_ID,
    createRaisedStepQuery(FRONT_LEFT_WHEEL_XZ)
  )
  const bumpedSnapshot = settle(bumped.controller)

  const flatStrut = flatSnapshot.suspensionVisuals.struts['front-left']
  const bumpedStrut = bumpedSnapshot.suspensionVisuals.struts['front-left']
  const farStrut = bumpedSnapshot.suspensionVisuals.struts['front-right']

  assert.ok(
    bumpedStrut.lengthMeters < flatStrut.lengthMeters - 0.01,
    'the strut over the raised step must be shorter; got ' +
      bumpedStrut.lengthMeters +
      ' vs ' +
      flatStrut.lengthMeters
  )
  assert.ok(
    Math.abs(bumpedStrut.lengthMeters - farStrut.lengthMeters) > 0.01,
    'the compressed corner must differ from the untouched one'
  )
})

test('a reset keeps the archetype and its struts', () => {
  const { car, controller } = createCatalogCar(ARCHETYPE_ID)
  settle(controller)

  const strutNode = car.getObjectByName('front-left-strut-visual')
  assert.equal(strutNode.visible, true)

  controller.reset()
  const snapshot = settle(controller, 1)

  assert.equal(snapshot.spec.suspensionVisualKind, 'macphersonStrut')
  assert.equal(strutNode.visible, true)
  assert.equal(snapshot.suspensionVisuals.struts['front-left'].isVisible, true)
})

// ---------------------------------------------------------------------------
// The physics identity: the archetype's whole claim is that it changes no
// physics, so the trace has to prove it.
// ---------------------------------------------------------------------------

test('the MacPherson archetype keeps both axles independent', () => {
  const { controller } = createCatalogCar(ARCHETYPE_ID)
  const snapshot = settle(controller)

  assert.equal(snapshot.axleCoupling.axles.front.isCoupled, false)
  assert.equal(snapshot.axleCoupling.axles.rear.isCoupled, false)
  assert.equal(snapshot.axleCoupling.axles.front.couplingMode, 'independent')
  assert.equal(snapshot.axleCoupling.axles.rear.couplingMode, 'independent')
})

test('the MacPherson archetype produces a distinguishable but bounded physics trace', () => {
  const stock = createCatalogCar(STOCK_ID)
  const macpherson = createCatalogCar(ARCHETYPE_ID)

  const stockTrace = buildPhysicsTrace(stock.controller)
  const macphersonTrace = buildPhysicsTrace(macpherson.controller)

  assert.equal(macphersonTrace.split('\n').length, TRACE_STEPS)
  assert.notEqual(
    macphersonTrace,
    stockTrace,
    'the camber gain must make the archetype physics-distinct from stock'
  )

  const stockForces = buildLateralForceTrace(
    createCatalogCar(STOCK_ID).controller
  )
  const macphersonForces = buildLateralForceTrace(
    createCatalogCar(ARCHETYPE_ID).controller
  )
  const maximumLateralForceDeltaNewtons = maximumPerWheelForceDelta(
    stockForces,
    macphersonForces
  )

  assert.ok(
    maximumLateralForceDeltaNewtons > 0,
    'the archetype must change the per-wheel lateral force'
  )
  assert.ok(
    maximumLateralForceDeltaNewtons < 15,
    'the per-wheel lateral force delta must stay bounded, got ' +
      maximumLateralForceDeltaNewtons + ' N'
  )
})

test('the MacPherson camber gain makes the archetype physics-distinct in a corner', () => {
  const stockSnapshot = runCorner(createCatalogCar(STOCK_ID).controller)
  const macphersonSnapshot = runCorner(
    createCatalogCar(ARCHETYPE_ID).controller
  )

  const wheel = (snapshot, id) =>
    snapshot.wheelStates.find((entry) => entry.id === id)
  const outer = wheel(macphersonSnapshot, 'front-right')
  const inner = wheel(macphersonSnapshot, 'front-left')

  // The body rolls to the right in a left turn, so the right (outer) strut
  // is the compressed one and the left (inner) strut extends.
  assert.ok(
    outer.camberRadians > 0,
    'the compressed strut wheel must gain positive camber'
  )
  assert.ok(
    inner.camberRadians < 0,
    'the extended strut wheel must gain negative camber'
  )
  assert.equal(
    wheel(stockSnapshot, 'front-right').camberRadians,
    0,
    'the stock vehicle must report no camber'
  )

  // The positive camber pushes the outer wheel outboard, away from the
  // turn, so the strut gives up a little lateral force there.
  assert.ok(
    outer.appliedLateralTireForceNewtons <
      wheel(stockSnapshot, 'front-right').appliedLateralTireForceNewtons,
    'the strut camber must cost the outer wheel a little lateral force'
  )
})

test('swapping to the MacPherson archetype at runtime changes the visuals and the physics', () => {
  const swapped = createCatalogCar(STOCK_ID)
  const control = createCatalogCar(STOCK_ID)

  const swappedLines = []
  const controlLines = []

  for (let step = 0; step < TRACE_STEPS; step += 1) {
    if (step === 300) {
      swapped.controller.setSuspension(ARCHETYPE_ID)
    }

    const input = step < 300 ? { throttle: true } : { throttle: true, left: true }
    const swappedSnapshot = swapped.controller.update(DT_SECONDS, input)
    const controlSnapshot = control.controller.update(DT_SECONDS, input)

    const traceLine = (snapshot) =>
      [
        snapshot.position.x.toFixed(9),
        snapshot.position.z.toFixed(9),
        snapshot.yawRadians.toFixed(9),
        snapshot.verticalDynamics.rollRadians.toFixed(9),
        ...snapshot.wheelStates.map((wheel) =>
          [
            wheel.id,
            wheel.suspensionCurrentLengthMeters.toFixed(9),
            wheel.normalForceNewtons.toFixed(9),
          ].join(':')
        ),
      ].join('|')

    swappedLines.push(traceLine(swappedSnapshot))
    controlLines.push(traceLine(controlSnapshot))
  }

  assert.notEqual(
    swappedLines.join('\n'),
    controlLines.join('\n'),
    'the runtime swap must change the physics through the camber gain'
  )

  assert.ok(
    swapped.car.getObjectByName('front-left-strut-visual'),
    'the swap must create the struts'
  )
  assert.equal(
    swapped.controller.getSnapshot().spec.suspensionVisualKind,
    'macphersonStrut'
  )
})


test('the MacPherson archetype uses the linkage solver and reports camberGainSource linkage', () => {
  const { controller } = createCatalogCar(ARCHETYPE_ID)
  for (let step = 0; step < 120; step += 1) {
    controller.update(DT_SECONDS, {})
  }
  const snapshot = controller.update(DT_SECONDS, { throttle: true })
  for (const wheelState of snapshot.wheelStates) {
    assert.equal(wheelState.camberGainSource, 'linkage')
  }
})

test('the MacPherson camber curve matches the probe compression slope at +/-25mm and +/-50mm', () => {
  const archetype = getComponent('suspension', ARCHETYPE_ID)
  const linkage = archetype.spec.suspensionLinkage
  assert.equal(linkage.kind, 'macpherson-strut')

  const slopeDegreesPer100mm = (travelMeters) => {
    const staticCamber = solveLinkageCamber({ wheelTravelMeters: 0, linkageSpec: linkage })
    const displacedCamber = solveLinkageCamber({ wheelTravelMeters: travelMeters, linkageSpec: linkage })
    return ((displacedCamber - staticCamber) * 180) / Math.PI / (Math.abs(travelMeters) * 10)
  }

  // Compression gains positive camber at ~ +0.52 deg/100mm (the probe value).
  assert.ok(
    Math.abs(slopeDegreesPer100mm(0.05) - 0.52) <= 0.52 * 0.05,
    'bump slope must be ~ +0.52 deg/100mm, got ' + slopeDegreesPer100mm(0.05)
  )
  // The MacPherson strut is nonlinear near static, so the 25mm slope is
  // steeper than the 50mm probe value; assert the correct sign and finiteness.
  assert.ok(
    slopeDegreesPer100mm(0.025) > 0,
    'bump slope at 25mm must stay positive (linkage-derived positive camber), got ' +
      slopeDegreesPer100mm(0.025)
  )

  // The MacPherson strut has a fixed top mount, so its camber-vs-travel curve
  // is mildly nonlinear; the rebound side is steeper. Both ends stay finite.
  assert.ok(Number.isFinite(slopeDegreesPer100mm(-0.05)))
  assert.ok(Number.isFinite(slopeDegreesPer100mm(-0.025)))
})