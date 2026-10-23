// test/verticalDynamicsLoadConservation.test.js

import assert from 'node:assert/strict'
import test from 'node:test'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { createFlatTerrainContactQuery } from '../src/terrain/createFlatTerrainContactQuery.js'
import { applyVehicleConfiguration } from '../src/vehicle/config/applyVehicleConfiguration.js'
import {
  createDefaultVehicleConfiguration,
  setVehicleConfigurationSlot,
} from '../src/vehicle/config/createVehicleConfiguration.js'

// Regression coverage for the static load-conservation bug: the vertical
// dynamics' static compression reference ignored the chassis terrain support
// baseline offset, so the ride-height offset was integrated as a standing
// terrain compression and biased every corner's load by springRate * offset.

const STEP_SECONDS = 1 / 60
const VEHICLE_MASS_KG = 1400
const VEHICLE_WEIGHT_NEWTONS = VEHICLE_MASS_KG * 9.80665
const STATIC_NORMAL_FORCE_PER_WHEEL_NEWTONS = VEHICLE_WEIGHT_NEWTONS / 4
const SETTLE_STEPS = 240
const SUPPORT_BASELINE_OFFSETS_METERS = [-0.06, -0.03, 0, 0.03, 0.07]
const LOAD_CONSERVATION_TOLERANCE_NEWTONS = 1
const PER_WHEEL_LOAD_TOLERANCE_NEWTONS = 1
const STEER_SETTLE_STEPS = 60
const STEER_ACCELERATION_STEPS = 480
const STEER_SAMPLE_STEPS = 150
const STEER_LATERAL_ACCELERATION_TOLERANCE_METERS_PER_SECOND_SQUARED = 0.1
const MINIMUM_EXPECTED_PEAK_LATERAL_ACCELERATION_METERS_PER_SECOND_SQUARED = 5.5
const CATALOG_SUSPENSION_COMPONENT_IDS = [
  'susp-stock',
  'susp-lowered',
  'susp-lifted',
  'susp-stiff',
  'susp-solid-axle',
  'susp-macpherson-strut',
]

function createController({ spec = {}, engineId, transmissionId } = {}) {
  return createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createFlatTerrainContactQuery(),
    spec,
    engineId,
    transmissionId,
  })
}

function createCatalogController(suspensionComponentId) {
  const configuration = setVehicleConfigurationSlot(
    createDefaultVehicleConfiguration(),
    'suspensionFront',
    suspensionComponentId
  )
  const applied = applyVehicleConfiguration(configuration)

  return createController({
    spec: applied.spec,
    engineId: applied.engineId,
    transmissionId: applied.transmissionId,
  })
}

function settleOnFlatGround(controller) {
  let snapshot = controller.getSnapshot()
  for (let step = 0; step < SETTLE_STEPS; step += 1) {
    snapshot = controller.update(STEP_SECONDS, {})
  }
  return snapshot
}

function sumNormalForceNewtons(wheelStates) {
  return wheelStates.reduce(
    (total, wheelState) => total + wheelState.normalForceNewtons,
    0
  )
}

function measureFullLockStepSteer(controller) {
  for (let step = 0; step < STEER_SETTLE_STEPS; step += 1) {
    controller.update(STEP_SECONDS, {})
  }
  for (let step = 0; step < STEER_ACCELERATION_STEPS; step += 1) {
    controller.update(STEP_SECONDS, { throttle: true })
  }

  let peakLateralAccelerationMetersPerSecondSquared = 0
  for (let step = 0; step < STEER_SAMPLE_STEPS; step += 1) {
    const snapshot = controller.update(STEP_SECONDS, {
      throttle: true,
      left: true,
    })
    peakLateralAccelerationMetersPerSecondSquared = Math.max(
      peakLateralAccelerationMetersPerSecondSquared,
      Math.abs(snapshot.planarAccelerationLocalLateralMetersPerSecondSquared)
    )
  }

  return { peakLateralAccelerationMetersPerSecondSquared }
}

test('static load is conserved at every chassis support baseline offset', () => {
  for (const offsetMeters of SUPPORT_BASELINE_OFFSETS_METERS) {
    const controller = createController({
      spec: { chassisTerrainSupportBaselineOffsetMeters: offsetMeters },
    })
    const snapshot = settleOnFlatGround(controller)
    const totalNormalForceNewtons = sumNormalForceNewtons(snapshot.wheelStates)

    assert.ok(
      Math.abs(totalNormalForceNewtons - VEHICLE_WEIGHT_NEWTONS) <
        LOAD_CONSERVATION_TOLERANCE_NEWTONS,
      `total normal force should equal the vehicle weight at offset ${offsetMeters} m; ` +
        `got ${totalNormalForceNewtons.toFixed(2)} N vs ${VEHICLE_WEIGHT_NEWTONS.toFixed(2)} N`
    )
  }
})

test('every catalog suspension preset conserves static load', () => {
  for (const suspensionComponentId of CATALOG_SUSPENSION_COMPONENT_IDS) {
    const snapshot = settleOnFlatGround(
      createCatalogController(suspensionComponentId)
    )
    const totalNormalForceNewtons = sumNormalForceNewtons(snapshot.wheelStates)

    assert.ok(
      Math.abs(totalNormalForceNewtons - VEHICLE_WEIGHT_NEWTONS) <
        LOAD_CONSERVATION_TOLERANCE_NEWTONS,
      `${suspensionComponentId} should carry the vehicle weight; ` +
        `got ${totalNormalForceNewtons.toFixed(2)} N`
    )
  }
})

test('the lowered catalog preset carries the static load on every wheel', () => {
  const snapshot = settleOnFlatGround(createCatalogController('susp-lowered'))

  for (const wheelState of snapshot.wheelStates) {
    assert.ok(
      Math.abs(
        wheelState.normalForceNewtons - STATIC_NORMAL_FORCE_PER_WHEEL_NEWTONS
      ) < PER_WHEEL_LOAD_TOLERANCE_NEWTONS,
      `${wheelState.id} should carry ${STATIC_NORMAL_FORCE_PER_WHEEL_NEWTONS.toFixed(1)} N; ` +
        `got ${wheelState.normalForceNewtons.toFixed(1)} N`
    )
  }
})

test('the lowered catalog preset corners like the stock preset', () => {
  const stock = measureFullLockStepSteer(
    createCatalogController('susp-stock')
  )
  const lowered = measureFullLockStepSteer(
    createCatalogController('susp-lowered')
  )

  assert.ok(
    stock.peakLateralAccelerationMetersPerSecondSquared >
      MINIMUM_EXPECTED_PEAK_LATERAL_ACCELERATION_METERS_PER_SECOND_SQUARED,
    'the stock baseline should reach a usable lateral acceleration; got ' +
      `${stock.peakLateralAccelerationMetersPerSecondSquared.toFixed(3)} m/s^2`
  )
  assert.ok(
    Math.abs(
      lowered.peakLateralAccelerationMetersPerSecondSquared -
        stock.peakLateralAccelerationMetersPerSecondSquared
    ) < STEER_LATERAL_ACCELERATION_TOLERANCE_METERS_PER_SECOND_SQUARED,
    'the lowered preset should match the stock lateral acceleration; got ' +
      `${lowered.peakLateralAccelerationMetersPerSecondSquared.toFixed(3)} m/s^2 vs ` +
      `${stock.peakLateralAccelerationMetersPerSecondSquared.toFixed(3)} m/s^2`
  )
})
