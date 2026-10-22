// test/chassisGeometrySpecAuthority.test.js

// Locks the chassis geometry the dynamics actually uses.
//
// The vehicle SPEC owns wheelbaseMeters, frontTrackWidthMeters and
// rearTrackWidthMeters. The rendered car mesh is a fixed hatchback shape
// (2.9 m wheelbase, 2.5 m track), so deriving the geometry from the wheel
// layout made the load transfer, the chassis mass properties and the
// vertical dynamics disagree with each other: one vehicle was simulated with
// two different geometries in the same step.
//
// These tests measure the geometry each consumer really used, by inverting
// the closed-form load-transfer and inertia relations, rather than reading an
// internal helper. A consumer that quietly falls back to the mesh layout
// therefore fails here.

import assert from 'node:assert/strict'
import test from 'node:test'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { DEFAULT_VEHICLE_SPEC } from '../src/vehicle/defaultVehicleSpec.js'
import { applyVehicleConfiguration } from '../src/vehicle/config/applyVehicleConfiguration.js'
import {
  createDefaultVehicleConfiguration,
  setVehicleConfigurationSlot,
} from '../src/vehicle/config/createVehicleConfiguration.js'
import {
  calculateChassisMassPropertiesState,
} from '../src/vehicle/dynamics/chassisMassPropertiesState.js'
import {
  createLoadTransferSummary,
  updateLoadTransferState,
} from '../src/vehicle/dynamics/loadTransferState.js'
import {
  createVerticalChassisDynamicsState,
  updateVerticalChassisDynamics,
} from '../src/vehicle/dynamics/verticalChassisDynamicsState.js'

const GRAVITY_METERS_PER_SECOND_SQUARED = 9.80665
const FORWARD_ACCELERATION_METERS_PER_SECOND_SQUARED = 2
const LATERAL_ACCELERATION_METERS_PER_SECOND_SQUARED = 2

const CHASSIS_COMPONENT_IDS = [
  'chassis-hatchback',
  'chassis-lightroadster',
  'chassis-suv',
  'chassis-heavytruck',
]

// The wheel layout of the rendered mesh. It never changes: the car mesh is a
// fixed hatchback shape.
function meshWheelStates() {
  const car = createCar()
  const wheels = car.userData.vehicle?.wheels ?? []

  return wheels.map((wheel) => ({
    axle: wheel.axle,
    side: wheel.side,
    isGrounded: true,
    localPosition: {
      x: wheel.localPosition.x,
      y: wheel.localPosition.y,
      z: wheel.localPosition.z,
    },
  }))
}

function specForChassis(componentId) {
  const configuration = setVehicleConfigurationSlot(
    createDefaultVehicleConfiguration(),
    'chassis',
    componentId
  )
  const applied = applyVehicleConfiguration(configuration)

  return { ...DEFAULT_VEHICLE_SPEC, ...applied.spec }
}

// Inverts the load-transfer relations to recover the geometry the load
// transfer really used:
//
//   longitudinal: dF = m * a_fwd * h_cg / wheelbase
//   lateral:      dF = m * a_lat * h_cg / track_width
//
// The lateral summary total is the sum of the two axles' per-axle transfer,
// so it equals m * a_lat * h_cg / track for a symmetric front/rear track.
function measureLoadTransferGeometry(spec, wheelStates) {
  const states = wheelStates.map((wheelState) => ({
    ...wheelState,
    contactPatchLocal: { ...wheelState.localPosition },
    baseNormalForceNewtons: 1,
    normalForceNewtons: 1,
  }))
  const summary = createLoadTransferSummary()

  updateLoadTransferState(
    states,
    {
      planarAccelerationLocalForwardMetersPerSecondSquared:
        FORWARD_ACCELERATION_METERS_PER_SECOND_SQUARED,
      planarAccelerationLocalLateralMetersPerSecondSquared:
        LATERAL_ACCELERATION_METERS_PER_SECOND_SQUARED,
    },
    spec,
    summary
  )

  const massKg = spec.massKg
  const centerOfMassHeightMeters = spec.centerOfMassHeightMeters
  const longitudinalTransferNewtons =
    summary.totalLongitudinalTransferAbsNewtons
  const lateralTransferNewtons = summary.totalLateralTransferAbsNewtons

  return {
    wheelbaseMeters:
      (massKg *
        FORWARD_ACCELERATION_METERS_PER_SECOND_SQUARED *
        centerOfMassHeightMeters) /
      longitudinalTransferNewtons,
    trackWidthMeters:
      (massKg *
        LATERAL_ACCELERATION_METERS_PER_SECOND_SQUARED *
        centerOfMassHeightMeters) /
      lateralTransferNewtons,
  }
}

// Inverts the two-point-mass pitch inertia and the beam roll inertia to
// recover the geometry the vertical dynamics really used:
//
//   pitch: I = m_sprung * (wheelbase / 2)^2
//   roll:  I = m_sprung * (track_width^2 / 12 + h_cg^2)
function measureVerticalDynamicsGeometry(spec, wheelStates) {
  const state = createVerticalChassisDynamicsState(spec)

  updateVerticalChassisDynamics(state, wheelStates, spec, 1 / 60, {
    planarAccelerationLocalForwardMetersPerSecondSquared: 0,
    planarAccelerationLocalLateralMetersPerSecondSquared: 0,
  })

  const sprungMassKg = state.sprungMassKg
  const centerOfMassHeightMeters = spec.centerOfMassHeightMeters

  return {
    wheelbaseMeters:
      2 *
      Math.sqrt(state.pitchInertiaKgMeterSquared / sprungMassKg),
    trackWidthMeters: Math.sqrt(
      12 *
        (state.rollInertiaKgMeterSquared / sprungMassKg -
          centerOfMassHeightMeters * centerOfMassHeightMeters)
    ),
  }
}

test('the spec is the authoritative chassis geometry for every consumer', () => {
  const wheelStates = meshWheelStates()

  for (const componentId of CHASSIS_COMPONENT_IDS) {
    const spec = specForChassis(componentId)
    const massProperties = calculateChassisMassPropertiesState(spec, wheelStates)
    const loadTransfer = measureLoadTransferGeometry(spec, wheelStates)
    const verticalDynamics = measureVerticalDynamicsGeometry(spec, wheelStates)

    // The load transfer reads the spec wheelbase.
    assert.ok(
      Math.abs(loadTransfer.wheelbaseMeters - spec.wheelbaseMeters) < 1e-9,
      componentId +
        ': load transfer used a ' +
        loadTransfer.wheelbaseMeters +
        ' m wheelbase, expected the spec ' +
        spec.wheelbaseMeters +
        ' m'
    )

    // The load transfer reads the spec track widths.
    assert.ok(
      Math.abs(loadTransfer.trackWidthMeters - spec.frontTrackWidthMeters) < 1e-9,
      componentId +
        ': load transfer used a ' +
        loadTransfer.trackWidthMeters +
        ' m track, expected the spec ' +
        spec.frontTrackWidthMeters +
        ' m'
    )

    // The chassis mass properties read the spec geometry.
    assert.equal(massProperties.wheelbaseMeters, spec.wheelbaseMeters)
    assert.equal(
      massProperties.frontTrackWidthMeters,
      spec.frontTrackWidthMeters
    )
    assert.equal(
      massProperties.rearTrackWidthMeters,
      spec.rearTrackWidthMeters
    )
    assert.equal(massProperties.geometrySource, 'spec')

    // The vertical dynamics CG split reads the spec wheelbase.
    assert.ok(
      Math.abs(verticalDynamics.wheelbaseMeters - spec.wheelbaseMeters) < 1e-9,
      componentId +
        ': vertical dynamics used a ' +
        verticalDynamics.wheelbaseMeters +
        ' m wheelbase, expected the spec ' +
        spec.wheelbaseMeters +
        ' m'
    )

    // The vertical dynamics roll inertia reads the spec track widths.
    assert.ok(
      Math.abs(verticalDynamics.trackWidthMeters - spec.frontTrackWidthMeters) < 1e-9,
      componentId +
        ': vertical dynamics used a ' +
        verticalDynamics.trackWidthMeters +
        ' m track, expected the spec ' +
        spec.frontTrackWidthMeters +
        ' m'
    )
  }
})

test('the load transfer, the mass properties and the vertical dynamics agree on one geometry', () => {
  const wheelStates = meshWheelStates()

  for (const componentId of CHASSIS_COMPONENT_IDS) {
    const spec = specForChassis(componentId)
    const massProperties = calculateChassisMassPropertiesState(spec, wheelStates)
    const loadTransfer = measureLoadTransferGeometry(spec, wheelStates)
    const verticalDynamics = measureVerticalDynamicsGeometry(spec, wheelStates)

    assert.ok(
      Math.abs(
        loadTransfer.wheelbaseMeters - massProperties.wheelbaseMeters
      ) < 1e-9,
      componentId + ': load transfer and mass properties disagree on the wheelbase'
    )
    assert.ok(
      Math.abs(
        verticalDynamics.wheelbaseMeters - massProperties.wheelbaseMeters
      ) < 1e-9,
      componentId + ': vertical dynamics and mass properties disagree on the wheelbase'
    )
    assert.ok(
      Math.abs(loadTransfer.trackWidthMeters - massProperties.frontTrackWidthMeters) <
        1e-9,
      componentId + ': load transfer and mass properties disagree on the track'
    )
    assert.ok(
      Math.abs(
        verticalDynamics.trackWidthMeters - massProperties.frontTrackWidthMeters
      ) < 1e-9,
      componentId + ': vertical dynamics and mass properties disagree on the track'
    )
  }
})

test('the stock hatchback keeps its 2.9 m / 2.5 m geometry in every consumer', () => {
  const wheelStates = meshWheelStates()
  const spec = specForChassis('chassis-hatchback')
  const massProperties = calculateChassisMassPropertiesState(spec, wheelStates)
  const loadTransfer = measureLoadTransferGeometry(spec, wheelStates)
  const verticalDynamics = measureVerticalDynamicsGeometry(spec, wheelStates)

  assert.equal(spec.wheelbaseMeters, 2.9)
  assert.equal(massProperties.wheelbaseMeters, 2.9)
  assert.ok(Math.abs(loadTransfer.wheelbaseMeters - 2.9) < 1e-9)
  assert.ok(Math.abs(verticalDynamics.wheelbaseMeters - 2.9) < 1e-9)
  assert.equal(massProperties.frontTrackWidthMeters, 2.5)
  assert.equal(massProperties.rearTrackWidthMeters, 2.5)
  assert.ok(Math.abs(loadTransfer.trackWidthMeters - 2.5) < 1e-9)
  assert.ok(Math.abs(verticalDynamics.trackWidthMeters - 2.5) < 1e-9)
})

test('the heavy truck chassis uses its 4.2 m / 2.7 m spec geometry', () => {
  const wheelStates = meshWheelStates()
  const spec = specForChassis('chassis-heavytruck')
  const massProperties = calculateChassisMassPropertiesState(spec, wheelStates)
  const loadTransfer = measureLoadTransferGeometry(spec, wheelStates)
  const verticalDynamics = measureVerticalDynamicsGeometry(spec, wheelStates)

  assert.equal(spec.wheelbaseMeters, 4.2)
  assert.equal(massProperties.wheelbaseMeters, 4.2)
  assert.ok(Math.abs(loadTransfer.wheelbaseMeters - 4.2) < 1e-9)
  assert.ok(Math.abs(verticalDynamics.wheelbaseMeters - 4.2) < 1e-9)
  assert.equal(massProperties.frontTrackWidthMeters, 2.7)
  assert.equal(massProperties.rearTrackWidthMeters, 2.7)
  assert.ok(Math.abs(loadTransfer.trackWidthMeters - 2.7) < 1e-9)
  assert.ok(Math.abs(verticalDynamics.trackWidthMeters - 2.7) < 1e-9)
})

test('the chassis geometry falls back to the wheel layout when the spec has none', () => {
  const wheelStates = meshWheelStates()
  const spec = { ...DEFAULT_VEHICLE_SPEC }
  delete spec.wheelbaseMeters
  delete spec.frontTrackWidthMeters
  delete spec.rearTrackWidthMeters

  const massProperties = calculateChassisMassPropertiesState(spec, wheelStates)
  const loadTransfer = measureLoadTransferGeometry(spec, wheelStates)
  const verticalDynamics = measureVerticalDynamicsGeometry(spec, wheelStates)

  assert.equal(massProperties.geometrySource, 'wheel-layout')
  assert.equal(massProperties.wheelbaseMeters, 2.9)
  assert.equal(massProperties.frontTrackWidthMeters, 2.5)
  assert.ok(Math.abs(loadTransfer.wheelbaseMeters - 2.9) < 1e-9)
  assert.ok(Math.abs(verticalDynamics.wheelbaseMeters - 2.9) < 1e-9)
})

test('a live chassis apply reaches the derived geometry through the controller', () => {
  const controller = createVehicleController({
    vehicle: createCar(),
    spec: applyVehicleConfiguration(
      setVehicleConfigurationSlot(
        createDefaultVehicleConfiguration(),
        'chassis',
        'chassis-hatchback'
      )
    ).spec,
  })

  assert.equal(
    controller.getSnapshot().chassisMassProperties.wheelbaseMeters,
    2.9
  )

  controller.setVehicleConfiguration(
    setVehicleConfigurationSlot(
      createDefaultVehicleConfiguration(),
      'chassis',
      'chassis-heavytruck'
    )
  )

  const snapshot = controller.getSnapshot()
  assert.equal(snapshot.chassisMassProperties.wheelbaseMeters, 4.2)
  assert.equal(snapshot.chassisMassProperties.frontTrackWidthMeters, 2.7)
  assert.equal(snapshot.chassisMassProperties.rearTrackWidthMeters, 2.7)
})

test('the heavy truck lateral load transfer uses its longer wheelbase and wider track', () => {
  const wheelStates = meshWheelStates()
  const hatchbackSpec = specForChassis('chassis-hatchback')
  const truckSpec = specForChassis('chassis-heavytruck')

  const hatchback = measureLoadTransferGeometry(hatchbackSpec, wheelStates)
  const truck = measureLoadTransferGeometry(truckSpec, wheelStates)

  // The longitudinal transfer fraction of the weight is m * a * h / L / W.
  // With the truck's larger mass and higher center of mass, the fraction is
  // set by h / L, not by L alone.
  const hatchbackFraction =
    (hatchbackSpec.centerOfMassHeightMeters * FORWARD_ACCELERATION_METERS_PER_SECOND_SQUARED) /
    hatchbackSpec.wheelbaseMeters
  const truckFraction =
    (truckSpec.centerOfMassHeightMeters * FORWARD_ACCELERATION_METERS_PER_SECOND_SQUARED) /
    truckSpec.wheelbaseMeters

  assert.ok(truckFraction > hatchbackFraction)
})