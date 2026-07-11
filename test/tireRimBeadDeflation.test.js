// test/tireRimBeadDeflation.test.js

import assert from 'node:assert/strict'
import test from 'node:test'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { WHEEL_TIRE_VISUAL_DIMENSIONS } from '../src/car/wheelTireVisualDimensions.js'
import {
  createAnchoredToroidalTireGeometryData,
  deformAnchoredToroidalTirePositions,
} from '../src/car/tireDeformationGeometry.js'
import { computeLoadAwareTireDeformation } from '../src/car/tirePressureVisualScales.js'

test('shared rim and tire dimensions are ordered with bounded bead overlap', () => {
  const dimensions = WHEEL_TIRE_VISUAL_DIMENSIONS
  assert.ok(dimensions.hubDiscRadiusMeters < dimensions.rimBarrelOuterRadiusMeters)
  assert.ok(dimensions.rimBarrelOuterRadiusMeters < dimensions.beadSeatRadiusMeters)
  assert.ok(dimensions.beadSeatRadiusMeters < dimensions.rimFlangeRadiusMeters)
  assert.ok(dimensions.rimFlangeRadiusMeters < dimensions.tireOuterRadiusMeters)
  assert.ok(
    Math.abs(
      dimensions.beadSeatRadiusMeters -
        dimensions.tireBeadRadiusMeters -
        dimensions.beadInterfaceOverlapMeters
    ) < 1e-9
  )

  const car = createCar()
  for (const wheel of car.userData.vehicle.wheels) {
    assert.ok(car.getObjectByName(wheel.visualNodes.rimBarrel))
    assert.ok(car.getObjectByName(wheel.visualNodes.beadSeatLeft))
    assert.ok(car.getObjectByName(wheel.visualNodes.beadSeatRight))
    assert.ok(car.getObjectByName(wheel.visualNodes.rimFlangeLeft))
    assert.ok(car.getObjectByName(wheel.visualNodes.rimFlangeRight))
  }
})

test('bead rings stay fixed through severe loaded deformation', () => {
  const data = createAnchoredToroidalTireGeometryData({
    visualDimensions: WHEEL_TIRE_VISUAL_DIMENSIONS,
  })
  const targetPositions = new Float32Array(data.baselinePositions)
  const deformation = computeLoadAwareTireDeformation(0, 220 / 340, {
    isGrounded: true,
    normalForceNewtons: 3432,
    referenceNormalForceNewtons: 3432,
    effectivePhysicalRollingRadiusMeters: 0.39,
  })

  const result = deformAnchoredToroidalTirePositions({
    baselinePositions: data.baselinePositions,
    targetPositions,
    deformationData: data,
    localContactPoint: { x: 0, y: -0.39, z: 0 },
    isGrounded: true,
    pressureOnlyRadialOffsetMeters: deformation.pressureOnlyRadialOffsetMeters,
    pressureOnlySidewallBulgeMeters: deformation.pressureOnlySidewallBulgeMeters,
    contactFlatteningMeters: deformation.contactFlatteningMeters,
    sidewallBulgeMeters: deformation.sidewallBulgeMeters,
    lowerSidewallCollapseMeters: deformation.lowerSidewallCollapseMeters,
  })
  assert.ok(result.maximumBeadAnchorDisplacementMeters <= 1e-7)
  assert.ok(result.minimumTerrainFacingRadiusMeters >= 0.39 - 1e-6)
})

test('zero pressure survives controller state and is worse than nominal through handling seams', () => {
  const controller = createVehicleController({ vehicle: createCar() })
  controller.setTirePressureKpa(0)
  let snapshot = controller.update(1 / 60, {})

  for (const wheel of snapshot.wheelStates) {
    assert.equal(wheel.tirePressureKpa, 0)
    assert.equal(wheel.calculationTirePressureKpa, 20)
    assert.ok(wheel.effectiveTireRollingRadiusMeters < 0.48)
    assert.ok(wheel.tirePressureLongitudinalStiffnessMultiplier < 1)
    assert.ok(wheel.tirePressureLateralStiffnessMultiplier < 1)
    assert.ok(wheel.rollingResistanceCoefficient > 0.015)
  }

  controller.reset()
  snapshot = controller.getSnapshot()
  assert.equal(snapshot.tirePressureState.tirePressureKpa, 220)
  assert.ok(snapshot.wheelStates.every((wheel) => wheel.tirePressureKpa === 220))
})
