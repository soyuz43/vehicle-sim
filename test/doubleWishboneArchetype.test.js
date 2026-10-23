// test/doubleWishboneArchetype.test.js
//
// The double wishbone archetype.
//
// The entry keeps the stock suspension model and adds the linkage's
// defining behavior: a negative camber gain. A compressed wishbone wheel
// gains negative camber, so the tire keeps a little more lateral force in
// a corner than the stock setup, and more than the MacPherson strut, which
// gains positive camber instead.
//
// The effect is small by construction: it is a real tire-model term at the
// measured camber stiffness, not a handling rewrite. The tests below assert
// the direction and the bound, not a big number.

import assert from 'node:assert/strict'
import test from 'node:test'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
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

const DT_SECONDS = 1 / 60
const TRACE_STEPS = 900
const CORNER_WINDOW_STEPS = 300
const ARCHETYPE_ID = 'susp-double-wishbone'
const STOCK_ID = 'susp-stock'
const MACPHERSON_ID = 'susp-macpherson-strut'
const OUTER_WHEEL_ID = 'front-right'
const INNER_WHEEL_ID = 'front-left'

function createCatalogCar(suspensionComponentId) {
  const configuration = setVehicleConfigurationSlot(
    createDefaultVehicleConfiguration(),
    'suspension',
    suspensionComponentId
  )
  const applied = applyVehicleConfiguration(configuration)

  const controller = createVehicleController({
    vehicle: createCar(),
    spec: applied.spec,
  })

  return { controller, spec: applied.spec }
}

// The mean lateral force of every wheel over the cornering window, plus the
// final state, so two archetypes can be compared without depending on a
// single noisy sample.
function buildCornerStatistics(controller, steps = TRACE_STEPS) {
  const lateralForceSums = []
  const lateralForceCounts = []
  let snapshot = controller.getSnapshot()

  for (let step = 0; step < steps; step += 1) {
    const input = step < 300 ? { throttle: true } : { throttle: true, left: true }
    snapshot = controller.update(DT_SECONDS, input)

    if (step >= steps - CORNER_WINDOW_STEPS) {
      snapshot.wheelStates.forEach((wheel, index) => {
        lateralForceSums[index] =
          (lateralForceSums[index] ?? 0) + wheel.appliedLateralTireForceNewtons
        lateralForceCounts[index] = (lateralForceCounts[index] ?? 0) + 1
      })
    }
  }

  return {
    snapshot,
    meanLateralForceNewtons: lateralForceSums.map(
      (sum, index) => sum / lateralForceCounts[index]
    ),
  }
}

function wheelById(snapshot, id) {
  const found = snapshot.wheelStates.find((wheel) => wheel.id === id)
  assert.ok(found, 'wheel ' + id + ' must exist in the snapshot')
  return found
}

function meanLateralForce(statistics, id) {
  const index = statistics.snapshot.wheelStates.findIndex(
    (wheel) => wheel.id === id
  )
  return statistics.meanLateralForceNewtons[index]
}

// ---------------------------------------------------------------------------
// The catalog entry.
// ---------------------------------------------------------------------------

test('the catalog exposes exactly one double wishbone archetype', () => {
  const suspensionComponents = VEHICLE_COMPONENT_CATALOG.suspension.components
  const wishboneIds = Object.keys(suspensionComponents).filter((componentId) =>
    componentId.includes('wishbone')
  )

  assert.deepEqual(wishboneIds, [ARCHETYPE_ID])
  assert.equal(VEHICLE_COMPONENT_CATALOG.suspension.defaultComponentId, STOCK_ID)
})

test('the wishbone archetype declares every field the suspension slot owns', () => {
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

test('the wishbone archetype differs from the stock preset only in camber, linkage, and visual kind', () => {
  const archetype = getComponent('suspension', ARCHETYPE_ID)
  const stock = getComponent('suspension', STOCK_ID)

  // The linear coefficient is zeroed so the linkage solver owns the camber
  // curve; the linkage geometry is the only other field that departs from stock.
  assert.equal(archetype.spec.camberGainRadiansPerMeterCompression, 0)
  assert.equal(stock.spec.camberGainRadiansPerMeterCompression, 0)
  assert.equal(archetype.spec.suspensionVisualKind, 'doubleWishbone')
  assert.equal(stock.spec.suspensionVisualKind, 'none')
  assert.ok(Object.hasOwn(archetype.spec, 'suspensionLinkage'))
  assert.ok(!Object.hasOwn(stock.spec, 'suspensionLinkage'))
  assert.equal(archetype.spec.frontAxleCoupling, 'independent')
  assert.equal(archetype.spec.rearAxleCoupling, 'independent')

  for (const field of SUSPENSION_OWNED_SPEC_FIELDS) {
    if (field === 'camberGainRadiansPerMeterCompression') continue
    if (field === 'suspensionLinkage') continue
    if (field === 'suspensionVisualKind') continue
    assert.equal(
      archetype.spec[field],
      stock.spec[field],
      field + ' must match the stock preset so the linkage is the only difference'
    )
  }
})

test('the wishbone archetype describes the camber gain it models', () => {
  const component = getComponent('suspension', ARCHETYPE_ID)

  assert.match(component.description, /wishbone/i)
  assert.match(component.description, /negative camber gain/i)
  assert.match(component.description, /-1\.64 deg/)
  assert.match(component.description, /fore-aft inner-pivot spacing/i)
  assert.match(component.description, /visual-only hub carrier/i)
  assert.match(component.description, /roll-center parameters/i)
  assert.match(component.description, /not modelled/i)
})

// ---------------------------------------------------------------------------
// The physics.
// ---------------------------------------------------------------------------

test('the wishbone gains negative camber on the compressed wheel in a corner', () => {
  const { controller } = createCatalogCar(ARCHETYPE_ID)
  const { snapshot } = buildCornerStatistics(controller)

  // A left turn rolls the body to the right, so the right wheel is the
  // compressed one and the left wheel extends.
  const outer = wheelById(snapshot, OUTER_WHEEL_ID)
  const inner = wheelById(snapshot, INNER_WHEEL_ID)

  assert.ok(
    outer.camberRadians < 0,
    'the compressed wishbone wheel must gain negative camber'
  )
  assert.ok(
    inner.camberRadians > 0,
    'the extended wishbone wheel must gain positive camber'
  )
})

test('the camber comes from the effective travel, so the wheels of an axle differ', () => {
  const { controller } = createCatalogCar(ARCHETYPE_ID)
  const { snapshot } = buildCornerStatistics(controller)

  const outer = wheelById(snapshot, OUTER_WHEEL_ID)
  const inner = wheelById(snapshot, INNER_WHEEL_ID)

  // The raycast suspension length is the same on flat ground, so only the
  // roll-induced travel can separate the two wheels of an axle.
  assert.ok(
    Math.abs(outer.camberRollInducedTravelMeters) > 0,
    'the roll-induced travel must be part of the camber derivation'
  )
  assert.ok(
    Math.abs(outer.camberRadians - inner.camberRadians) > 0,
    'the two wheels of an axle must report different camber angles'
  )
})

test('the wishbone keeps more lateral force than the stock setup and the MacPherson strut', () => {
  const stock = buildCornerStatistics(createCatalogCar(STOCK_ID).controller)
  const macpherson = buildCornerStatistics(
    createCatalogCar(MACPHERSON_ID).controller
  )
  const wishbone = buildCornerStatistics(
    createCatalogCar(ARCHETYPE_ID).controller
  )

  const stockOuter = meanLateralForce(stock, OUTER_WHEEL_ID)
  const macphersonOuter = meanLateralForce(macpherson, OUTER_WHEEL_ID)
  const wishboneOuter = meanLateralForce(wishbone, OUTER_WHEEL_ID)

  assert.ok(
    wishboneOuter > stockOuter,
    'the wishbone must keep more lateral force than the stock setup'
  )
  assert.ok(
    stockOuter > macphersonOuter,
    'the stock setup must keep more lateral force than the MacPherson strut'
  )

  const marginNewtons = wishboneOuter - macphersonOuter
  assert.ok(
    marginNewtons > 3,
    'the wishbone margin over the MacPherson must be measurable, got ' +
      marginNewtons + ' N'
  )
  assert.ok(
    marginNewtons < 15,
    'the wishbone margin over the MacPherson must stay bounded, got ' +
      marginNewtons + ' N'
  )
})

test('the wishbone margin against the MacPherson strut stays bounded over the whole run', () => {
  const macphersonRows = buildLateralForceRows(
    createCatalogCar(MACPHERSON_ID).controller
  )
  const wishboneRows = buildLateralForceRows(
    createCatalogCar(ARCHETYPE_ID).controller
  )

  let maximumDeltaNewtons = 0
  for (let step = 0; step < macphersonRows.length; step += 1) {
    for (let wheel = 0; wheel < macphersonRows[step].length; wheel += 1) {
      maximumDeltaNewtons = Math.max(
        maximumDeltaNewtons,
        Math.abs(wishboneRows[step][wheel] - macphersonRows[step][wheel])
      )
    }
  }

  assert.ok(
    maximumDeltaNewtons > 0,
    'the wishbone must change the per-wheel lateral force'
  )
  assert.ok(
    maximumDeltaNewtons < 15,
    'the per-wheel lateral force delta must stay bounded, got ' +
      maximumDeltaNewtons + ' N'
  )
})

function buildLateralForceRows(controller, steps = TRACE_STEPS) {
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

test('the wishbone archetype uses the linkage solver and reports camberGainSource linkage', () => {
  const { controller } = createCatalogCar(ARCHETYPE_ID)
  // Settle the static reference before measuring camber.
  for (let step = 0; step < 120; step += 1) {
    controller.update(DT_SECONDS, {})
  }
  const snapshot = controller.update(DT_SECONDS, { throttle: true })

  for (const wheelState of snapshot.wheelStates) {
    assert.equal(wheelState.camberGainSource, 'linkage')
  }
})

test('the wishbone camber curve matches the probe slope at +/-25mm and +/-50mm', () => {
  const archetype = getComponent('suspension', ARCHETYPE_ID)
  const linkage = archetype.spec.suspensionLinkage
  assert.equal(linkage.kind, 'double-wishbone')

  const slopeDegreesPer100mm = (travelMeters) => {
    const staticCamber = solveLinkageCamber({ wheelTravelMeters: 0, linkageSpec: linkage })
    const displacedCamber = solveLinkageCamber({ wheelTravelMeters: travelMeters, linkageSpec: linkage })
    return ((displacedCamber - staticCamber) * 180) / Math.PI / (Math.abs(travelMeters) * 10)
  }

  assert.ok(
    Math.abs(slopeDegreesPer100mm(0.05) + 1.64) <= 1.64 * 0.05,
    'bump slope must be ~ -1.64 deg/100mm, got ' + slopeDegreesPer100mm(0.05)
  )
  assert.ok(
    Math.abs(slopeDegreesPer100mm(-0.05) - 1.64) <= 1.64 * 0.05,
    'rebound slope must be ~ +1.64 deg/100mm, got ' + slopeDegreesPer100mm(-0.05)
  )
  assert.ok(
    Math.abs(slopeDegreesPer100mm(0.025) + 1.64) <= 1.64 * 0.05,
    'bump slope at 25mm must be ~ -1.64 deg/100mm, got ' + slopeDegreesPer100mm(0.025)
  )
  assert.ok(
    Math.abs(slopeDegreesPer100mm(-0.025) - 1.64) <= 1.64 * 0.05,
    'rebound slope at 25mm must be ~ +1.64 deg/100mm, got ' + slopeDegreesPer100mm(-0.025)
  )
})