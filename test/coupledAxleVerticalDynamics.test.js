// test/coupledAxleVerticalDynamics.test.js

// The vertical dynamics ODE and coupled axles (Session A3.5).
//
// A coupled axle is ONE spring at the axle centre, not two springs at the
// wheel offsets. Before this session the ODE assembled its stiffness and its
// per-corner load deviation as if every corner owned an independent spring,
// so a solid rear axle behaved exactly like an independent one under lateral
// load: it carried half of the lateral load transfer across its own tires
// and added its own roll stiffness.
//
// These tests lock the coupled-axle behaviour to the physical result:
//
//   - a coupled axle takes NO lateral load transfer across its own corners
//     (its load deviation is the same on both sides),
//   - the whole transfer moves to the other axle,
//   - the body rolls further, because a solid axle cannot contribute roll
//     stiffness,
//   - the total normal force is unchanged, and the pitch response is
//     unchanged, because the axle centre shares the axle's z offset.
//
// The independent axle is the control: its numbers have to stay exactly
// where the classic m * a * h / track formula puts them.

import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import {
  createVerticalChassisDynamicsState,
  updateVerticalChassisDynamics,
} from '../src/vehicle/dynamics/verticalChassisDynamicsState.js'
import { DEFAULT_VEHICLE_SPEC } from '../src/vehicle/defaultVehicleSpec.js'
import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { createHeightfieldTerrainContactQuery } from '../src/terrain/createHeightfieldTerrainContactQuery.js'
import { applyVehicleConfiguration } from '../src/vehicle/config/applyVehicleConfiguration.js'
import {
  createDefaultVehicleConfiguration,
  setVehicleConfigurationSlot,
} from '../src/vehicle/config/createVehicleConfiguration.js'

const DT_SECONDS = 1 / 60
const GRAVITY_METERS_PER_SECOND_SQUARED = 9.80665
const SPEC = DEFAULT_VEHICLE_SPEC
const MASS_KG = SPEC.massKg
const CENTER_OF_MASS_HEIGHT_METERS = SPEC.centerOfMassHeightMeters
const WHEELBASE_METERS = SPEC.wheelbaseMeters
const TRACK_WIDTH_METERS = SPEC.frontTrackWidthMeters
const HALF_TRACK_METERS = TRACK_WIDTH_METERS / 2
const HALF_WHEELBASE_METERS = WHEELBASE_METERS / 2
const VEHICLE_WEIGHT_NEWTONS = MASS_KG * GRAVITY_METERS_PER_SECOND_SQUARED
const STATIC_NORMAL_FORCE_PER_WHEEL_NEWTONS = VEHICLE_WEIGHT_NEWTONS / 4
const STATIC_COMPRESSION_METERS =
  SPEC.suspensionTravelMeters * SPEC.suspensionTargetStaticCompressionRatio01
const SPRING_RATE_NEWTONS_PER_METER =
  STATIC_NORMAL_FORCE_PER_WHEEL_NEWTONS / STATIC_COMPRESSION_METERS
const DAMPING_NEWTONS_PER_METER_PER_SECOND =
  2 *
  SPEC.suspensionDampingRatio *
  Math.sqrt(SPRING_RATE_NEWTONS_PER_METER * (MASS_KG / 4))

const LATERAL_ACCELERATION_METERS_PER_SECOND_SQUARED =
  0.5 * GRAVITY_METERS_PER_SECOND_SQUARED
const FORWARD_ACCELERATION_METERS_PER_SECOND_SQUARED =
  -0.5 * GRAVITY_METERS_PER_SECOND_SQUARED

// The classic lateral transfer per side: m * a_lat * h_cg / track.
const EXPECTED_LATERAL_TRANSFER_NEWTONS =
  (MASS_KG *
    LATERAL_ACCELERATION_METERS_PER_SECOND_SQUARED *
    CENTER_OF_MASS_HEIGHT_METERS) /
  TRACK_WIDTH_METERS

// The roll stiffness of four independent corners and of an axle pair that
// carries the roll on one axle only.
const INDEPENDENT_ROLL_STIFFNESS =
  4 * SPRING_RATE_NEWTONS_PER_METER * HALF_TRACK_METERS * HALF_TRACK_METERS
const ONE_AXLE_ROLL_STIFFNESS =
  2 * SPRING_RATE_NEWTONS_PER_METER * HALF_TRACK_METERS * HALF_TRACK_METERS

const REAR_LEFT_WHEEL_XZ = Object.freeze({ x: 1.25, z: -1.45 })
const STEP_HEIGHT_METERS = 0.08
const SETTLE_STEPS = 300

function makeWheelState({ x, z, axle, isGrounded = true }) {
  return {
    isGrounded,
    axle,
    side: x < 0 ? 'left' : 'right',
    localPosition: { x, y: 0, z },
    suspensionRestLengthMeters: SPEC.suspensionRestLengthMeters,
    suspensionTravelMeters: SPEC.suspensionTravelMeters,
    suspensionTargetStaticCompressionRatio01:
      SPEC.suspensionTargetStaticCompressionRatio01,
    suspensionCompressionMeters: STATIC_COMPRESSION_METERS,
    suspensionSpringRateNewtonsPerMeter: SPRING_RATE_NEWTONS_PER_METER,
    suspensionCompressionDampingNewtonsPerMeterPerSecond:
      DAMPING_NEWTONS_PER_METER_PER_SECOND,
    suspensionReboundDampingNewtonsPerMeterPerSecond:
      DAMPING_NEWTONS_PER_METER_PER_SECOND,
    baseNormalForceNewtons: STATIC_NORMAL_FORCE_PER_WHEEL_NEWTONS,
    normalForceNewtons: STATIC_NORMAL_FORCE_PER_WHEEL_NEWTONS,
    frictionCoefficient: 1,
    tractionLimitNewtons: STATIC_NORMAL_FORCE_PER_WHEEL_NEWTONS,
    verticalDynamicsLoadDeviationNewtons: 0,
  }
}

function makeWheelStates() {
  return [
    makeWheelState({ x: -HALF_TRACK_METERS, z: HALF_WHEELBASE_METERS, axle: 'front' }),
    makeWheelState({ x: HALF_TRACK_METERS, z: HALF_WHEELBASE_METERS, axle: 'front' }),
    makeWheelState({ x: -HALF_TRACK_METERS, z: -HALF_WHEELBASE_METERS, axle: 'rear' }),
    makeWheelState({ x: HALF_TRACK_METERS, z: -HALF_WHEELBASE_METERS, axle: 'rear' }),
  ]
}

function makeSpec(coupledRear) {
  return {
    verticalDynamicsEnabled: true,
    verticalDynamicsForcingEnabled: true,
    massKg: MASS_KG,
    wheelbaseMeters: WHEELBASE_METERS,
    frontTrackWidthMeters: TRACK_WIDTH_METERS,
    rearTrackWidthMeters: TRACK_WIDTH_METERS,
    centerOfMassHeightMeters: CENTER_OF_MASS_HEIGHT_METERS,
    suspensionTravelMeters: SPEC.suspensionTravelMeters,
    suspensionTargetStaticCompressionRatio01:
      SPEC.suspensionTargetStaticCompressionRatio01,
    suspensionDampingRatio: SPEC.suspensionDampingRatio,
    frontAxleCoupling: 'independent',
    rearAxleCoupling: coupledRear ? 'rigidAxle' : 'independent',
  }
}

// Runs the vertical dynamics seam with a constant planar acceleration until
// the body attitude reaches its steady state.
function settleVerticalDynamics({
  wheelStates = makeWheelStates(),
  coupledRear = false,
  lateralAccelerationMetersPerSecondSquared = 0,
  forwardAccelerationMetersPerSecondSquared = 0,
  steps = 60 * 20,
} = {}) {
  const spec = makeSpec(coupledRear)
  const state = createVerticalChassisDynamicsState(spec)

  for (let step = 0; step < steps; step += 1) {
    updateVerticalChassisDynamics(state, wheelStates, spec, DT_SECONDS, {
      planarAccelerationLocalForwardMetersPerSecondSquared:
        forwardAccelerationMetersPerSecondSquared,
      planarAccelerationLocalLateralMetersPerSecondSquared:
        lateralAccelerationMetersPerSecondSquared,
    })
  }

  return { state, wheelStates, spec }
}

function corner(wheelStates, axle, side) {
  const found = wheelStates.find(
    (wheelState) => wheelState.axle === axle && wheelState.side === side
  )
  assert.ok(found, 'the ' + axle + '-' + side + ' corner must exist')
  return found
}

function deviationNewtons(wheelStates, axle, side) {
  return corner(wheelStates, axle, side).verticalDynamicsLoadDeviationNewtons
}

function totalNormalForceNewtons(wheelStates) {
  return wheelStates.reduce(
    (total, wheelState) => total + wheelState.normalForceNewtons,
    0
  )
}

// ---------------------------------------------------------------------------
// The control: the independent axle keeps the classic behaviour.
// ---------------------------------------------------------------------------

test('an independent rear axle keeps the classic lateral load transfer', () => {
  const { state, wheelStates } = settleVerticalDynamics({
    lateralAccelerationMetersPerSecondSquared:
      LATERAL_ACCELERATION_METERS_PER_SECOND_SQUARED,
  })

  const expectedRollRadians =
    (MASS_KG *
      LATERAL_ACCELERATION_METERS_PER_SECOND_SQUARED *
      CENTER_OF_MASS_HEIGHT_METERS) /
    INDEPENDENT_ROLL_STIFFNESS
  assert.ok(
    Math.abs(state.rollRadians - expectedRollRadians) < 1e-6,
    'the independent steady roll should match the closed form; got ' +
      state.rollRadians.toFixed(8) +
      ' vs ' +
      expectedRollRadians.toFixed(8)
  )

  // The classic split: every corner carries half of the transfer.
  for (const axle of ['front', 'rear']) {
    for (const side of ['left', 'right']) {
      const deviation = deviationNewtons(wheelStates, axle, side)
      assert.ok(
        Math.abs(Math.abs(deviation) - EXPECTED_LATERAL_TRANSFER_NEWTONS / 2) <
          1,
        'the independent ' +
          axle +
          '-' +
          side +
          ' corner should carry half the transfer; got ' +
          deviation.toFixed(3)
      )
    }
  }
})

// ---------------------------------------------------------------------------
// The coupled axle.
// ---------------------------------------------------------------------------

test('a coupled rear axle takes no lateral load transfer across its corners', () => {
  const { wheelStates } = settleVerticalDynamics({
    coupledRear: true,
    lateralAccelerationMetersPerSecondSquared:
      LATERAL_ACCELERATION_METERS_PER_SECOND_SQUARED,
  })

  const rearLeft = deviationNewtons(wheelStates, 'rear', 'left')
  const rearRight = deviationNewtons(wheelStates, 'rear', 'right')

  assert.ok(
    Math.abs(rearLeft - rearRight) < 1,
    'a coupled axle must report the same load deviation on both corners; got ' +
      rearLeft.toFixed(3) +
      ' vs ' +
      rearRight.toFixed(3)
  )
  assert.ok(
    Math.abs(rearLeft) < 1,
    'a coupled axle must not take any lateral load transfer; got ' +
      rearLeft.toFixed(3)
  )
})

test('a coupled rear axle leaves the whole lateral transfer on the front axle', () => {
  const { wheelStates } = settleVerticalDynamics({
    coupledRear: true,
    lateralAccelerationMetersPerSecondSquared:
      LATERAL_ACCELERATION_METERS_PER_SECOND_SQUARED,
  })

  const frontLeft = deviationNewtons(wheelStates, 'front', 'left')
  const frontRight = deviationNewtons(wheelStates, 'front', 'right')

  assert.ok(
    Math.abs(Math.abs(frontLeft) - EXPECTED_LATERAL_TRANSFER_NEWTONS) < 1,
    'the front corner should carry the whole m * a * h / track transfer; got ' +
      frontLeft.toFixed(3) +
      ' vs ' +
      EXPECTED_LATERAL_TRANSFER_NEWTONS.toFixed(3)
  )
  assert.ok(
    Math.abs(frontLeft + frontRight) < 1,
    'the two front corners must carry opposite deviations'
  )
})

test('a coupled rear axle rolls further than an independent rear axle', () => {
  const independent = settleVerticalDynamics({
    lateralAccelerationMetersPerSecondSquared:
      LATERAL_ACCELERATION_METERS_PER_SECOND_SQUARED,
  })
  const coupled = settleVerticalDynamics({
    coupledRear: true,
    lateralAccelerationMetersPerSecondSquared:
      LATERAL_ACCELERATION_METERS_PER_SECOND_SQUARED,
  })

  assert.ok(
    coupled.state.rollRadians > independent.state.rollRadians,
    'a solid axle cannot contribute roll stiffness, so the body must roll more'
  )

  const expectedCoupledRollRadians =
    (MASS_KG *
      LATERAL_ACCELERATION_METERS_PER_SECOND_SQUARED *
      CENTER_OF_MASS_HEIGHT_METERS) /
    ONE_AXLE_ROLL_STIFFNESS
  assert.ok(
    Math.abs(coupled.state.rollRadians - expectedCoupledRollRadians) < 1e-6,
    'the coupled steady roll should match the one-axle closed form; got ' +
      coupled.state.rollRadians.toFixed(8) +
      ' vs ' +
      expectedCoupledRollRadians.toFixed(8)
  )
})

test('the total normal force is conserved with a coupled rear axle', () => {
  const { wheelStates } = settleVerticalDynamics({
    coupledRear: true,
    lateralAccelerationMetersPerSecondSquared:
      LATERAL_ACCELERATION_METERS_PER_SECOND_SQUARED,
  })

  assert.ok(
    Math.abs(totalNormalForceNewtons(wheelStates) - VEHICLE_WEIGHT_NEWTONS) < 1,
    'the total normal force must still equal the vehicle weight; got ' +
      totalNormalForceNewtons(wheelStates).toFixed(3)
  )
})

test('an asymmetric coupled axle still conserves the total normal force', () => {
  // The shipped car is symmetric, so every axle's corner offsets sum to
  // zero and the total normal force comes out the same under any roll arm.
  // An axle whose corners sit at different lateral offsets removes that
  // symmetry, so a load deviation that double-counts the roll term shows
  // up as a total normal force that no longer equals the vehicle weight.
  const asymmetricWheelStates = makeWheelStates()
  asymmetricWheelStates[2].localPosition.x = -1.05

  const { wheelStates } = settleVerticalDynamics({
    wheelStates: asymmetricWheelStates,
    coupledRear: true,
    lateralAccelerationMetersPerSecondSquared:
      LATERAL_ACCELERATION_METERS_PER_SECOND_SQUARED,
  })

  assert.ok(
    Math.abs(totalNormalForceNewtons(wheelStates) - VEHICLE_WEIGHT_NEWTONS) < 1,
    'the total normal force must equal the vehicle weight; got ' +
      totalNormalForceNewtons(wheelStates).toFixed(3)
  )
})

test('the pitch response does not change with a coupled rear axle', () => {
  const independent = settleVerticalDynamics({
    forwardAccelerationMetersPerSecondSquared:
      FORWARD_ACCELERATION_METERS_PER_SECOND_SQUARED,
  })
  const coupled = settleVerticalDynamics({
    coupledRear: true,
    forwardAccelerationMetersPerSecondSquared:
      FORWARD_ACCELERATION_METERS_PER_SECOND_SQUARED,
  })

  assert.ok(
    Math.abs(coupled.state.pitchRadians - independent.state.pitchRadians) < 1e-9,
    'both wheels of an axle share the axle z offset, so the pitch stiffness ' +
      'must not change; got ' +
      coupled.state.pitchRadians.toFixed(9) +
      ' vs ' +
      independent.state.pitchRadians.toFixed(9)
  )
})

test('the axle centre stays continuous when a corner leaves the ground', () => {
  const grounded = settleVerticalDynamics({
    coupledRear: true,
    lateralAccelerationMetersPerSecondSquared:
      LATERAL_ACCELERATION_METERS_PER_SECOND_SQUARED,
  })

  // The same run, but with the rear left corner in the air. The axle centre
  // is the mean of the axle's wheel offsets, and it counts EVERY wheel of
  // the axle, so the surviving corner must still see the same roll arm.
  const airborneWheelStates = makeWheelStates()
  airborneWheelStates[2].isGrounded = false
  airborneWheelStates[2].baseNormalForceNewtons = 0
  airborneWheelStates[2].normalForceNewtons = 0

  const airborne = settleVerticalDynamics({
    wheelStates: airborneWheelStates,
    coupledRear: true,
    lateralAccelerationMetersPerSecondSquared:
      LATERAL_ACCELERATION_METERS_PER_SECOND_SQUARED,
  })

  assert.ok(
    Math.abs(
      deviationNewtons(airborne.wheelStates, 'rear', 'right') -
        deviationNewtons(grounded.wheelStates, 'rear', 'right')
    ) < 1,
    'the axle centre must not jump when a corner leaves the ground; got ' +
      deviationNewtons(airborne.wheelStates, 'rear', 'right').toFixed(3) +
      ' vs ' +
      deviationNewtons(grounded.wheelStates, 'rear', 'right').toFixed(3)
  )
  assert.ok(
    Math.abs(
      airborne.state.rollRadians - grounded.state.rollRadians
    ) < 1e-9,
    'the body roll must not jump when a corner leaves the ground'
  )
})

// ---------------------------------------------------------------------------
// The end-to-end path: the archetype in the running vehicle.
// ---------------------------------------------------------------------------

function createFlatHeightfieldQuery() {
  return createHeightfieldTerrainContactQuery({
    surfaceProfile: {
      profileName: 'coupled-axle-flat',
      surfaceKind: 'test-asphalt',
      frictionCoefficient: 1,
      querySurfaceAtWorldPosition(worldXMeters, worldZMeters, target = {}) {
        target.isWithinBounds = true
        target.isInsideTerrainBounds = true
        target.profileName = 'coupled-axle-flat'
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

function createRaisedStepQuery(targetWheelXZ, stepHeightMeters = STEP_HEIGHT_METERS) {
  const baseQuery = createFlatHeightfieldQuery()
  const matchToleranceMeters = 0.1

  return {
    kind: 'coupled-axle-step-query',
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

function createCatalogController(suspensionComponentId, terrainContactQuery) {
  const configuration = setVehicleConfigurationSlot(
    createDefaultVehicleConfiguration(),
    'suspension',
    suspensionComponentId
  )
  const applied = applyVehicleConfiguration(configuration)

  return createVehicleController({
    vehicle: createCar(),
    startPosition: new THREE.Vector3(0, 0, 0),
    terrainContactQuery: terrainContactQuery ?? createFlatHeightfieldQuery(),
    spec: applied.spec,
  })
}

test('a coupled rear axle under a one-sided bump still produces zero body roll', () => {
  const controller = createCatalogController(
    'susp-solid-axle-rear',
    createRaisedStepQuery(REAR_LEFT_WHEEL_XZ)
  )

  let peakRollRadians = 0
  let snapshot = null
  for (let step = 0; step < SETTLE_STEPS; step += 1) {
    snapshot = controller.update(DT_SECONDS, {})
    peakRollRadians = Math.max(
      peakRollRadians,
      Math.abs(snapshot.verticalDynamics.rollRadians)
    )
  }

  assert.equal(snapshot.axleCoupling.axles.rear.isCoupled, true)
  assert.equal(
    peakRollRadians,
    0,
    'a coupled axle contributes no terrain roll moment, so the body must not roll; got ' +
      peakRollRadians
  )

  const rearLeft = corner(snapshot.wheelStates, 'rear', 'left')
  const rearRight = corner(snapshot.wheelStates, 'rear', 'right')
  assert.ok(
    Math.abs(
      rearLeft.normalForceNewtons - rearRight.normalForceNewtons
    ) < 1e-6,
    'the coupled axle must split its load evenly between its corners'
  )
})
