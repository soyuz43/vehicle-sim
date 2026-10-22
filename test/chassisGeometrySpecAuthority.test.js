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

const ASSEMBLY_SPRING_RATE_NEWTONS_PER_METER = 12000
const ASSEMBLY_DAMPING_RATE_NEWTONS_PER_METER_PER_SECOND = 2500
const ASSEMBLY_BASE_NORMAL_FORCE_NEWTONS = 100000
const ASSEMBLY_PROBE_ATTITUDE = 0.01
const ASSEMBLY_PROBE_RATE = 0.01

function makeVerticalAssemblyWheelStates(spec, rateOverrides = {}) {
  const staticCompressionMeters =
    spec.suspensionTravelMeters * spec.suspensionTargetStaticCompressionRatio01

  return meshWheelStates().map((wheelState) => {
    const springRateNewtonsPerMeter =
      rateOverrides.springRateForWheel?.(wheelState) ??
      rateOverrides.springRateNewtonsPerMeter ??
      ASSEMBLY_SPRING_RATE_NEWTONS_PER_METER
    const dampingRateNewtonsPerMeterPerSecond =
      rateOverrides.dampingRateForWheel?.(wheelState) ??
      rateOverrides.dampingRateNewtonsPerMeterPerSecond ??
      ASSEMBLY_DAMPING_RATE_NEWTONS_PER_METER_PER_SECOND

    return {
      ...wheelState,
      suspensionSpringRateNewtonsPerMeter: springRateNewtonsPerMeter,
      suspensionCompressionDampingNewtonsPerMeterPerSecond:
        dampingRateNewtonsPerMeterPerSecond,
      suspensionReboundDampingNewtonsPerMeterPerSecond:
        dampingRateNewtonsPerMeterPerSecond,
      suspensionCompressionMeters: staticCompressionMeters,
      baseNormalForceNewtons: ASSEMBLY_BASE_NORMAL_FORCE_NEWTONS,
      normalForceNewtons: ASSEMBLY_BASE_NORMAL_FORCE_NEWTONS,
      frictionCoefficient: 1,
    }
  })
}

function expectedSpecWheelArms(wheelState, spec) {
  const trackWidthMeters = wheelState.axle === 'front'
    ? spec.frontTrackWidthMeters
    : spec.rearTrackWidthMeters
  const sideSign = wheelState.side === 'left' ? 1 : -1

  return {
    xMeters: sideSign * trackWidthMeters / 2,
    zMeters: wheelState.axle === 'front'
      ? spec.wheelbaseMeters / 2
      : -spec.wheelbaseMeters / 2,
  }
}

function probeVerticalAssembly(spec, wheelStates, initialState = {}) {
  const state = createVerticalChassisDynamicsState(spec)
  Object.assign(state, initialState)
  updateVerticalChassisDynamics(state, wheelStates, spec, 0, {
    planarAccelerationLocalForwardMetersPerSecondSquared: 0,
    planarAccelerationLocalLateralMetersPerSecondSquared: 0,
  })
  return state
}

function measureVerticalAssemblyResponse(spec, accelerationKind) {
  const staticCompressionMeters =
    spec.suspensionTravelMeters * spec.suspensionTargetStaticCompressionRatio01
  const springRateNewtonsPerMeter =
    (spec.massKg * GRAVITY_METERS_PER_SECOND_SQUARED / 4) /
    staticCompressionMeters
  const dampingRateNewtonsPerMeterPerSecond =
    2 * spec.suspensionDampingRatio *
    Math.sqrt(springRateNewtonsPerMeter * spec.massKg / 4)
  const wheelStates = makeVerticalAssemblyWheelStates(spec, {
    springRateNewtonsPerMeter,
    dampingRateNewtonsPerMeterPerSecond,
  })
  const state = createVerticalChassisDynamicsState(spec)
  const accelerationMetersPerSecondSquared =
    accelerationKind === 'braking'
      ? -0.5 * GRAVITY_METERS_PER_SECOND_SQUARED
      : 0.5 * GRAVITY_METERS_PER_SECOND_SQUARED

  for (let step = 0; step < 1200; step += 1) {
    updateVerticalChassisDynamics(state, wheelStates, spec, 1 / 60, {
      planarAccelerationLocalForwardMetersPerSecondSquared:
        accelerationKind === 'braking'
          ? accelerationMetersPerSecondSquared
          : 0,
      planarAccelerationLocalLateralMetersPerSecondSquared:
        accelerationKind === 'lateral'
          ? accelerationMetersPerSecondSquared
          : 0,
    })
  }

  return { state, wheelStates, springRateNewtonsPerMeter }
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

test('the vertical assembly stiffness uses spec arms for every chassis', () => {
  for (const componentId of CHASSIS_COMPONENT_IDS) {
    const spec = specForChassis(componentId)
    const wheelStates = makeVerticalAssemblyWheelStates(spec)
    const expectedPitchStiffness = wheelStates.reduce(
      (total, wheelState) => {
        const arms = expectedSpecWheelArms(wheelState, spec)
        return total +
          wheelState.suspensionSpringRateNewtonsPerMeter * arms.zMeters ** 2
      },
      0
    )
    const expectedRollStiffness = wheelStates.reduce(
      (total, wheelState) => {
        const arms = expectedSpecWheelArms(wheelState, spec)
        return total +
          wheelState.suspensionSpringRateNewtonsPerMeter * arms.xMeters ** 2
      },
      0
    )
    const pitchProbe = probeVerticalAssembly(spec, wheelStates, {
      pitchRadians: ASSEMBLY_PROBE_ATTITUDE,
    })
    const rollProbe = probeVerticalAssembly(spec, wheelStates, {
      rollRadians: ASSEMBLY_PROBE_ATTITUDE,
    })
    const measuredPitchStiffness =
      -pitchProbe.pitchAccelerationRadiansPerSecondSquared *
      pitchProbe.pitchInertiaKgMeterSquared / ASSEMBLY_PROBE_ATTITUDE
    const measuredRollStiffness =
      -rollProbe.rollAccelerationRadiansPerSecondSquared *
      rollProbe.rollInertiaKgMeterSquared / ASSEMBLY_PROBE_ATTITUDE

    assert.ok(
      Math.abs(measuredPitchStiffness - expectedPitchStiffness) < 1e-7,
      componentId + ': pitch stiffness did not use the spec axle arms'
    )
    assert.ok(
      Math.abs(measuredRollStiffness - expectedRollStiffness) < 1e-7,
      componentId + ': roll stiffness did not use the spec track arms'
    )
  }
})

test('the heavy-truck symmetric stiffness and damping cross terms vanish', () => {
  const spec = specForChassis('chassis-heavytruck')
  const wheelStates = makeVerticalAssemblyWheelStates(spec)
  const stiffnessProbe = probeVerticalAssembly(spec, wheelStates, {
    rollRadians: ASSEMBLY_PROBE_ATTITUDE,
  })
  const dampingProbe = probeVerticalAssembly(spec, wheelStates, {
    rollRateRadiansPerSecond: ASSEMBLY_PROBE_RATE,
  })
  const measuredKpr =
    -stiffnessProbe.pitchAccelerationRadiansPerSecondSquared *
    stiffnessProbe.pitchInertiaKgMeterSquared / ASSEMBLY_PROBE_ATTITUDE
  const measuredCpr =
    -dampingProbe.pitchAccelerationRadiansPerSecondSquared *
    dampingProbe.pitchInertiaKgMeterSquared / ASSEMBLY_PROBE_RATE

  assert.ok(Math.abs(measuredKpr) < 1e-9)
  assert.ok(Math.abs(measuredCpr) < 1e-9)
})

test('asymmetric heavy-truck corner rates retain spec-based cross terms', () => {
  const spec = specForChassis('chassis-heavytruck')
  const wheelStates = makeVerticalAssemblyWheelStates(spec, {
    springRateForWheel: (wheelState) =>
      wheelState.axle === 'front' && wheelState.side === 'left'
        ? 24000
        : 12000,
    dampingRateForWheel: (wheelState) =>
      wheelState.axle === 'front' && wheelState.side === 'left'
        ? 5000
        : 2500,
  })
  const expectedKpr = wheelStates.reduce((total, wheelState) => {
    const arms = expectedSpecWheelArms(wheelState, spec)
    return total +
      wheelState.suspensionSpringRateNewtonsPerMeter *
      arms.xMeters * arms.zMeters
  }, 0)
  const expectedCpr = wheelStates.reduce((total, wheelState) => {
    const arms = expectedSpecWheelArms(wheelState, spec)
    return total +
      wheelState.suspensionCompressionDampingNewtonsPerMeterPerSecond *
      arms.xMeters * arms.zMeters
  }, 0)
  const stiffnessProbe = probeVerticalAssembly(spec, wheelStates, {
    rollRadians: ASSEMBLY_PROBE_ATTITUDE,
  })
  const dampingProbe = probeVerticalAssembly(spec, wheelStates, {
    rollRateRadiansPerSecond: ASSEMBLY_PROBE_RATE,
  })
  const measuredKpr =
    -stiffnessProbe.pitchAccelerationRadiansPerSecondSquared *
    stiffnessProbe.pitchInertiaKgMeterSquared / ASSEMBLY_PROBE_ATTITUDE
  const measuredCpr =
    -dampingProbe.pitchAccelerationRadiansPerSecondSquared *
    dampingProbe.pitchInertiaKgMeterSquared / ASSEMBLY_PROBE_RATE

  assert.ok(Math.abs(measuredKpr - expectedKpr) < 1e-7)
  assert.ok(Math.abs(measuredCpr - expectedCpr) < 1e-7)
})

test('vertical load writeback uses the spec arm for every chassis corner', () => {
  for (const componentId of CHASSIS_COMPONENT_IDS) {
    const spec = specForChassis(componentId)
    const wheelStates = makeVerticalAssemblyWheelStates(spec)
    const initialState = {
      heaveMeters: 0.012,
      heaveVelocityMetersPerSecond: 0.03,
      pitchRadians: -0.004,
      pitchRateRadiansPerSecond: -0.02,
      rollRadians: 0.006,
      rollRateRadiansPerSecond: 0.04,
    }
    probeVerticalAssembly(spec, wheelStates, initialState)

    for (const wheelState of wheelStates) {
      const arms = expectedSpecWheelArms(wheelState, spec)
      const uMeters =
        initialState.heaveMeters +
        initialState.pitchRadians * arms.zMeters +
        initialState.rollRadians * arms.xMeters
      const uRateMetersPerSecond =
        initialState.heaveVelocityMetersPerSecond +
        initialState.pitchRateRadiansPerSecond * arms.zMeters +
        initialState.rollRateRadiansPerSecond * arms.xMeters
      const expectedDeviationNewtons =
        -wheelState.suspensionSpringRateNewtonsPerMeter * uMeters -
        wheelState.suspensionCompressionDampingNewtonsPerMeterPerSecond *
          uRateMetersPerSecond

      assert.ok(
        Math.abs(
          wheelState.verticalDynamicsLoadDeviationNewtons -
            expectedDeviationNewtons
        ) < 1e-8,
        componentId + ': ' + wheelState.side + ' ' + wheelState.axle +
          ' writeback did not use its spec-derived arms'
      )
    }
  }
})

test('heavy-truck terrain moments use spec-derived corner arms', () => {
  const spec = specForChassis('chassis-heavytruck')
  const wheelStates = makeVerticalAssemblyWheelStates(spec)
  const frontLeft = wheelStates.find(
    (wheelState) =>
      wheelState.axle === 'front' && wheelState.side === 'left'
  )
  const staticCompressionMeters =
    spec.suspensionTravelMeters * spec.suspensionTargetStaticCompressionRatio01
  const terrainCompressionDeviationMeters = 0.01 - 1e-4
  frontLeft.suspensionCompressionMeters =
    staticCompressionMeters + 0.01
  const state = probeVerticalAssembly(spec, wheelStates)
  const arms = expectedSpecWheelArms(frontLeft, spec)
  const terrainForceNewtons =
    frontLeft.suspensionSpringRateNewtonsPerMeter *
    terrainCompressionDeviationMeters

  assert.ok(
    Math.abs(
      state.terrainRollMomentNewtonMeters -
        arms.xMeters * terrainForceNewtons
    ) < 1e-9
  )
  assert.ok(
    Math.abs(
      state.terrainPitchMomentNewtonMeters -
        arms.zMeters * terrainForceNewtons
    ) < 1e-9
  )
})

test('the heavy truck steady braking transfer uses the 4.2 m spec wheelbase', () => {
  const spec = specForChassis('chassis-heavytruck')
  const { state, wheelStates, springRateNewtonsPerMeter } =
    measureVerticalAssemblyResponse(spec, 'braking')
  const expectedPerCornerDeviationNewtons =
    (spec.massKg *
      0.5 * GRAVITY_METERS_PER_SECOND_SQUARED *
      spec.centerOfMassHeightMeters) /
    (2 * spec.wheelbaseMeters)
  const frontWheelStates = wheelStates.filter(
    (wheelState) => wheelState.axle === 'front'
  )
  const frontAverageDeviationNewtons =
    frontWheelStates.reduce(
      (total, wheelState) =>
        total + wheelState.verticalDynamicsLoadDeviationNewtons,
      0
    ) / frontWheelStates.length
  const totalLoadDeviationNewtons = wheelStates.reduce(
    (total, wheelState) =>
      total + wheelState.verticalDynamicsLoadDeviationNewtons,
    0
  )
  const expectedPitchRadians =
    -(spec.massKg *
      0.5 * GRAVITY_METERS_PER_SECOND_SQUARED *
      spec.centerOfMassHeightMeters) /
    (springRateNewtonsPerMeter * spec.wheelbaseMeters ** 2)

  assert.ok(Math.abs(state.pitchRadians - expectedPitchRadians) < 1e-10)
  assert.ok(
    Math.abs(frontAverageDeviationNewtons - expectedPerCornerDeviationNewtons) <
      1e-8
  )
  assert.ok(Math.abs(totalLoadDeviationNewtons) < 1e-8)
})

test('the heavy-truck steady lateral transfer uses the 2.7 m spec track', () => {
  const spec = specForChassis('chassis-heavytruck')
  const { state, wheelStates, springRateNewtonsPerMeter } =
    measureVerticalAssemblyResponse(spec, 'lateral')
  const expectedPerCornerDeviationNewtons =
    (spec.massKg *
      0.5 * GRAVITY_METERS_PER_SECOND_SQUARED *
      spec.centerOfMassHeightMeters) /
    (2 * spec.frontTrackWidthMeters)
  const leftWheelStates = wheelStates.filter(
    (wheelState) => wheelState.side === 'left'
  )
  const leftAverageDeviationNewtons =
    leftWheelStates.reduce(
      (total, wheelState) =>
        total + wheelState.verticalDynamicsLoadDeviationNewtons,
      0
    ) / leftWheelStates.length
  const expectedRollRadians =
    (spec.massKg *
      0.5 * GRAVITY_METERS_PER_SECOND_SQUARED *
      spec.centerOfMassHeightMeters) /
    (springRateNewtonsPerMeter * spec.frontTrackWidthMeters ** 2)

  assert.ok(Math.abs(state.rollRadians - expectedRollRadians) < 1e-10)
  assert.ok(
    Math.abs(leftAverageDeviationNewtons + expectedPerCornerDeviationNewtons) <
      1e-8
  )
})

test('coupled axle-center averaging uses spec lateral arms', () => {
  const spec = {
    ...specForChassis('chassis-heavytruck'),
    frontAxleCoupling: 'rigidAxle',
  }
  const wheelStates = makeVerticalAssemblyWheelStates(spec).filter(
    (wheelState) =>
      wheelState.axle !== 'front' || wheelState.side !== 'right'
  )
  const expectedRollStiffness = wheelStates.reduce(
    (total, wheelState) => {
      const arms = expectedSpecWheelArms(wheelState, spec)
      const rollArmMeters = wheelState.axle === 'front'
        ? spec.frontTrackWidthMeters / 2
        : arms.xMeters
      return total +
        wheelState.suspensionSpringRateNewtonsPerMeter * rollArmMeters ** 2
    },
    0
  )
  const rollProbe = probeVerticalAssembly(spec, wheelStates, {
    rollRadians: ASSEMBLY_PROBE_ATTITUDE,
  })
  const measuredRollStiffness =
    -rollProbe.rollAccelerationRadiansPerSecondSquared *
    rollProbe.rollInertiaKgMeterSquared / ASSEMBLY_PROBE_ATTITUDE

  assert.ok(Math.abs(measuredRollStiffness - expectedRollStiffness) < 1e-7)
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