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
  assert.equal(frontSpec.suspensionVisualKind, 'none')
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