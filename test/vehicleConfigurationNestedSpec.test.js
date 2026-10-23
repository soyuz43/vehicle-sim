// test/vehicleConfigurationNestedSpec.test.js

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyVehicleConfiguration,
  buildSuspensionSlotSpec,
} from '../src/vehicle/config/applyVehicleConfiguration.js'
import {
  SUSPENSION_OWNED_SPEC_FIELDS,
  getComponent,
} from '../src/vehicle/config/componentCatalog.js'
import { DEFAULT_VEHICLE_SPEC } from '../src/vehicle/defaultVehicleSpec.js'
import {
  createDefaultVehicleConfiguration,
  setVehicleConfigurationSlot,
} from '../src/vehicle/config/createVehicleConfiguration.js'
import { createCar } from '../src/car/createCar.js'
import { resolveAxleRollCenterHeightsMeters } from '../src/vehicle/dynamics/rollCenterGeometry.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'

// The leaf-pack roll-center height is the one owned field that is arbitrated
// rather than aliased: the flat runtime value describes the axle that is
// actually coupled, while each nested slot spec describes its own archetype.
const SIMPLE_FLAT_ALIAS_FIELDS = SUSPENSION_OWNED_SPEC_FIELDS.filter(
  (field) => field !== 'solidAxleRollCenterHeightMeters'
)

test('nested suspension specs expose the complete per-slot owned shape', () => {
  const applied = applyVehicleConfiguration(createDefaultVehicleConfiguration())
  const frontSpec = applied.spec.suspensionFront
  const rearSpec = applied.spec.suspensionRear

  assert.ok(frontSpec, 'spec.suspensionFront must exist')
  assert.ok(rearSpec, 'spec.suspensionRear must exist')

  for (const field of SUSPENSION_OWNED_SPEC_FIELDS) {
    assert.ok(
      Object.hasOwn(frontSpec, field),
      `suspensionFront must own ${field}`
    )
    assert.ok(
      Object.hasOwn(rearSpec, field),
      `suspensionRear must own ${field}`
    )
  }

  assert.equal(frontSpec.axleCoupling, 'independent')
  assert.equal(rearSpec.axleCoupling, 'independent')
  assert.equal(frontSpec.suspensionVisualKind, 'independent')
})

test('nested suspension fields fall back to the default spec when undeclared', () => {
  const stockComponent = getComponent('suspensionFront', 'susp-stock')
  const nested = buildSuspensionSlotSpec(stockComponent)

  for (const field of SUSPENSION_OWNED_SPEC_FIELDS) {
    const declared = stockComponent.spec[field]
    const expected = declared === undefined || declared === null
      ? DEFAULT_VEHICLE_SPEC[field]
      : declared

    assert.equal(nested[field], expected)
  }
})

test('flat suspension fields remain aliases to the front nested spec', () => {
  const applied = applyVehicleConfiguration(createDefaultVehicleConfiguration())

  for (const field of SIMPLE_FLAT_ALIAS_FIELDS) {
    assert.equal(
      applied.spec[field],
      applied.spec.suspensionFront[field],
      `flat ${field} must alias suspensionFront.${field}`
    )
  }

  // The stock pairing has no coupled axle, so the arbitrated roll-center
  // value still matches the front slot's zero.
  assert.equal(
    applied.spec.solidAxleRollCenterHeightMeters,
    applied.spec.suspensionFront.solidAxleRollCenterHeightMeters
  )
})

test('mixed suspension slots keep independent nested specs', () => {
  const configuration = setVehicleConfigurationSlot(
    createDefaultVehicleConfiguration(),
    'suspensionRear',
    'susp-solid-axle'
  )
  const solidAxleComponent = getComponent('suspensionRear', 'susp-solid-axle')
  const applied = applyVehicleConfiguration(configuration)
  const frontSpec = applied.spec.suspensionFront
  const rearSpec = applied.spec.suspensionRear

  assert.equal(frontSpec.axleCoupling, 'independent')
  assert.equal(rearSpec.axleCoupling, 'rigidAxle')
  assert.equal(
    rearSpec.solidAxleRollCenterHeightMeters,
    solidAxleComponent.spec.solidAxleRollCenterHeightMeters
  )
  assert.equal(frontSpec.solidAxleRollCenterHeightMeters, 0)
  assert.notDeepEqual(frontSpec, rearSpec)

  for (const field of SIMPLE_FLAT_ALIAS_FIELDS) {
    assert.equal(applied.spec[field], frontSpec[field])
  }

  // The coupled rear axle owns the flat roll-center value in Phase A.
  assert.equal(
    applied.spec.solidAxleRollCenterHeightMeters,
    rearSpec.solidAxleRollCenterHeightMeters
  )
})

test('runtime suspension swaps keep both nested slot specs synchronized', () => {
  const applied = applyVehicleConfiguration(createDefaultVehicleConfiguration())
  const controller = createVehicleController({
    vehicle: createCar(),
    spec: applied.spec,
    engineId: applied.engineId,
    transmissionId: applied.transmissionId,
  })

  const mixedConfiguration = setVehicleConfigurationSlot(
    createDefaultVehicleConfiguration(),
    'suspensionRear',
    'susp-solid-axle'
  )
  const solidAxleComponent = getComponent('suspensionRear', 'susp-solid-axle')
  controller.setVehicleConfiguration(mixedConfiguration)

  const snapshot = controller.getSnapshot()
  const frontSpec = snapshot.spec.suspensionFront
  const rearSpec = snapshot.spec.suspensionRear

  assert.ok(frontSpec, 'runtime spec.suspensionFront must exist')
  assert.ok(rearSpec, 'runtime spec.suspensionRear must exist')
  assert.equal(frontSpec.axleCoupling, 'independent')
  assert.equal(rearSpec.axleCoupling, 'rigidAxle')
  assert.equal(
    rearSpec.solidAxleRollCenterHeightMeters,
    solidAxleComponent.spec.solidAxleRollCenterHeightMeters
  )

  for (const field of SIMPLE_FLAT_ALIAS_FIELDS) {
    assert.equal(
      snapshot.spec[field],
      frontSpec[field],
      `runtime flat ${field} must alias suspensionFront.${field}`
    )
  }

  assert.equal(
    snapshot.spec.solidAxleRollCenterHeightMeters,
    rearSpec.solidAxleRollCenterHeightMeters
  )
})

// Phase B.1: mixed configs must run distinct physics per axle. The front
// slot's wishbone linkage drives the front camber; the rear slot's solid
// axle keeps the coefficient path (zero camber) and its own roll-center
// height. A consumer that reads one flat spec for both axles breaks these
// assertions, so this test is the mutation-detection anchor for the
// per-axle consumption refactor.
test('a mixed wishbone-front solid-rear config runs distinct per-axle physics', () => {
  const applied = applyVehicleConfiguration(
    setVehicleConfigurationSlot(
      setVehicleConfigurationSlot(
        createDefaultVehicleConfiguration(),
        'suspensionFront',
        'susp-double-wishbone'
      ),
      'suspensionRear',
      'susp-solid-axle'
    )
  )
  const controller = createVehicleController({
    vehicle: createCar(),
    spec: applied.spec,
    engineId: applied.engineId,
    transmissionId: applied.transmissionId,
  })

  // Settle the static ride height first so the cornering window samples a
  // steady-state response instead of the launch transient.
  let snapshot = controller.getSnapshot()
  for (let step = 0; step < 240; step += 1) {
    snapshot = controller.update(1 / 60, {})
  }
  for (let step = 0; step < 300; step += 1) {
    snapshot = controller.update(1 / 60, { throttle: true })
  }

  let frontLinkageCorners = 0
  let frontCamberSamples = 0
  let frontCamberAbsSumRadians = 0
  let rearCoefficientCorners = 0
  let rearCamberAbsSumRadians = 0
  let rearCamberSamples = 0
  for (let step = 0; step < 120; step += 1) {
    snapshot = controller.update(1 / 60, { throttle: true, left: true })
    for (const wheelState of snapshot.wheelStates) {
      if (wheelState.axle === 'front') {
        if (wheelState.camberGainSource === 'linkage') frontLinkageCorners += 1
        frontCamberAbsSumRadians += Math.abs(wheelState.camberRadians)
        frontCamberSamples += 1
      } else {
        if (wheelState.camberGainSource === 'coefficient') {
          rearCoefficientCorners += 1
        }
        rearCamberAbsSumRadians += Math.abs(wheelState.camberRadians)
        rearCamberSamples += 1
      }
    }
  }

  // The front slot's wishbone linkage must drive the front axle's camber.
  assert.equal(
    frontLinkageCorners,
    frontCamberSamples,
    'every front corner must use the linkage camber source'
  )
  // The rear slot's solid axle must fall back to the coefficient path,
  // which is zero for the solid-axle archetype's camber gains.
  assert.equal(
    rearCoefficientCorners,
    rearCamberSamples,
    'every rear corner must use the coefficient camber source'
  )
  assert.ok(
    frontCamberAbsSumRadians > 0,
    'the front axle must develop linkage camber during cornering'
  )
  assert.equal(
    rearCamberAbsSumRadians,
    0,
    'the solid-axle rear must keep zero camber during cornering'
  )

  // Roll-center consumption: the wishbone front linkage produces a nonzero
  // linkage roll center, while the rear solid axle uses its declared
  // leaf-pack height. Assert via the flat spec's coupled-axle arbitration,
  // which the roll-center consumer reads per axle.
  const rollCenterSpec = snapshot.spec
  assert.equal(
    rollCenterSpec.frontAxleCoupling,
    'independent',
    'the wishbone front must stay independent'
  )
  assert.equal(
    rollCenterSpec.rearAxleCoupling,
    'rigidAxle',
    'the solid-axle rear must stay coupled'
  )
  assert.ok(
    rollCenterSpec.solidAxleRollCenterHeightMeters > 0,
    'the coupled rear axle must contribute a nonzero leaf-pack roll center'
  )
})

// Per-axle spring-rate consumption: the two slots may declare different
// physical values. A consumer that reads one flat spec for both axles
// collapses the two slots into one, so this test mutates the rear slot's
// static compression ratio and asserts the derived spring rates differ.
test('per-axle spring rate consumption differentiates the two slots', () => {
  const configuration = setVehicleConfigurationSlot(
    setVehicleConfigurationSlot(
      createDefaultVehicleConfiguration(),
      'suspensionFront',
      'susp-stock'
    ),
    'suspensionRear',
    'susp-stock'
  )
  const applied = applyVehicleConfiguration(configuration)
  // Give the rear slot a stiffer static compression target so the derived
  // spring rate differs from the front slot's derived rate.
  applied.spec.suspensionRear.suspensionTargetStaticCompressionRatio01 = 0.5

  const controller = createVehicleController({
    vehicle: createCar(),
    spec: applied.spec,
  })
  let snapshot = controller.getSnapshot()
  for (let step = 0; step < 120; step += 1) {
    snapshot = controller.update(1 / 60, {})
  }

  const frontRate = snapshot.wheelStates
    .filter((w) => w.axle === 'front')
    .map((w) => w.suspensionSpringRateNewtonsPerMeter)[0]
  const rearRate = snapshot.wheelStates
    .filter((w) => w.axle === 'rear')
    .map((w) => w.suspensionSpringRateNewtonsPerMeter)[0]

  assert.ok(
    Number.isFinite(frontRate) && Number.isFinite(rearRate),
    'both axles must report a finite spring rate'
  )
  assert.ok(
    Math.abs(frontRate - rearRate) > 1,
    'front and rear spring rates must differ when the slots declare ' +
      'different compression targets, got front=' + frontRate +
      ' rear=' + rearRate
  )
})

// Per-axle roll-center consumption: the wishbone front linkage derives a
// nonzero linkage roll center while the coupled rear axle uses its declared
// leaf-pack height. A consumer that reads one flat source for both axles
// collapses the two heights into one, so this test asserts both heights.
test('per-axle roll center consumption resolves the slot heights', () => {
  const configuration = setVehicleConfigurationSlot(
    setVehicleConfigurationSlot(
      createDefaultVehicleConfiguration(),
      'suspensionFront',
      'susp-double-wishbone'
    ),
    'suspensionRear',
    'susp-solid-axle'
  )
  const applied = applyVehicleConfiguration(configuration)

  const heights = resolveAxleRollCenterHeightsMeters(applied.spec, {
    front: false,
    rear: true,
  })

  assert.ok(
    heights.front > 0 && heights.front < 0.2,
    'the wishbone front linkage must derive a small positive roll-center ' +
      'height, got ' + heights.front
  )
  assert.ok(
    Math.abs(heights.rear - 0.25) < 1e-9,
    'the coupled rear axle must use the declared leaf-pack height, got ' +
      heights.rear
  )
})
