// test/rollCenterConsumption.test.js

// Locks the roll-center consumption of the 3-DOF vertical chassis dynamics.
//
// A roll center splits the lateral load transfer into two paths:
//   - the DIRECT (geometric) path: the part the links carry, which lands on
//     the tire loads without passing through a suspension spring,
//   - the ELASTIC path: the part the springs carry, which the body roll
//     produces.
//
// The roll arm is the distance from the center of mass to the roll axis, so
// a roll center shortens the arm, the body rolls less, and the springs carry
// less of the transfer. The per-axle totals stay conserved:
//
//   m_axle * a_lat * h_cg / track_axle
//     = elastic transfer of the axle + direct transfer of the axle
//
// The stock vehicle has no roll center, so its roll axis stays on the ground
// and every number below is the pre-roll-center behavior.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
  createVerticalChassisDynamicsState,
  updateVerticalChassisDynamics,
} from '../src/vehicle/dynamics/verticalChassisDynamicsState.js'
import {
  deriveLinkageRollCenterHeightMeters,
  resolveAxleRollCenterHeightsMeters,
  resolveRollAxisHeightMeters,
} from '../src/vehicle/dynamics/rollCenterGeometry.js'
import { DEFAULT_VEHICLE_SPEC } from '../src/vehicle/defaultVehicleSpec.js'
import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import {
  VEHICLE_COMPONENT_CATALOG,
} from '../src/vehicle/config/componentCatalog.js'

const DT_SECONDS = 1 / 60
const GRAVITY_METERS_PER_SECOND_SQUARED = 9.80665
const SPEC = DEFAULT_VEHICLE_SPEC
const MASS_KG = SPEC.massKg
const CENTER_OF_MASS_HEIGHT_METERS = SPEC.centerOfMassHeightMeters
const WHEELBASE_METERS = SPEC.wheelbaseMeters
const TRACK_WIDTH_METERS = SPEC.frontTrackWidthMeters
const HALF_TRACK_METERS = TRACK_WIDTH_METERS / 2
const HALF_WHEELBASE_METERS = WHEELBASE_METERS / 2
const AXLE_SPRUNG_MASS_KG = MASS_KG / 2
const STATIC_NORMAL_FORCE_PER_WHEEL_NEWTONS =
  (MASS_KG * GRAVITY_METERS_PER_SECOND_SQUARED) / 4
const STATIC_COMPRESSION_METERS =
  SPEC.suspensionTravelMeters * SPEC.suspensionTargetStaticCompressionRatio01
const SPRING_RATE_NEWTONS_PER_METER =
  STATIC_NORMAL_FORCE_PER_WHEEL_NEWTONS / STATIC_COMPRESSION_METERS
const DAMPING_NEWTONS_PER_METER_PER_SECOND =
  2 *
  SPEC.suspensionDampingRatio *
  Math.sqrt(SPRING_RATE_NEWTONS_PER_METER * (MASS_KG / 4))
const ROLL_STIFFNESS_NEWTON_METERS_PER_RADIAN =
  4 * SPRING_RATE_NEWTONS_PER_METER * HALF_TRACK_METERS * HALF_TRACK_METERS

const WISHBONE_LINKAGE =
  VEHICLE_COMPONENT_CATALOG.suspensionFront.components['susp-double-wishbone']
    .spec.suspensionLinkage
const MACPHERSON_LINKAGE =
  VEHICLE_COMPONENT_CATALOG.suspensionFront.components['susp-macpherson-strut']
    .spec.suspensionLinkage
const SOLID_AXLE_ROLL_CENTER_HEIGHT_METERS = 0.25

// The SHA-256 of the stock vehicle's 5400-step physics trace. The digest was
// taken from the pre-roll-center code and must not change: the stock vehicle
// has no roll center, so its roll axis stays on the ground, its roll arm
// stays the center-of-mass height, and every number in the trace is the
// behavior the simulation had before roll centers were consumed.
const STOCK_TRACE_SHA256 =
  '960348ad9ec4c2f8f6e39d7391ecc5ff29fcbc5fa10a110fed51f7ad48e3af09'

function makeWheelState({ x, z, axle }) {
  return {
    isGrounded: true,
    axle,
    side: x > 0 ? 'left' : 'right',
    localPosition: { x, y: 0, z },
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
    verticalDynamicsDirectLoadTransferNewtons: 0,
  }
}

function makeSymmetricWheelStates() {
  return [
    makeWheelState({
      x: -HALF_TRACK_METERS,
      z: HALF_WHEELBASE_METERS,
      axle: 'front',
    }),
    makeWheelState({
      x: HALF_TRACK_METERS,
      z: HALF_WHEELBASE_METERS,
      axle: 'front',
    }),
    makeWheelState({
      x: -HALF_TRACK_METERS,
      z: -HALF_WHEELBASE_METERS,
      axle: 'rear',
    }),
    makeWheelState({
      x: HALF_TRACK_METERS,
      z: -HALF_WHEELBASE_METERS,
      axle: 'rear',
    }),
  ]
}

function makeSpec(extraSpec = {}) {
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
    ...extraSpec,
  }
}

// Runs the vertical dynamics seam with a constant planar acceleration until
// the body attitude reaches its steady state.
function settleVerticalDynamics({
  wheelStates = makeSymmetricWheelStates(),
  lateralAccelerationMetersPerSecondSquared = 0,
  spec = makeSpec(),
  steps = 60 * 40,
} = {}) {
  const state = createVerticalChassisDynamicsState(spec)
  for (let step = 0; step < steps; step += 1) {
    updateVerticalChassisDynamics(state, wheelStates, spec, DT_SECONDS, {
      planarAccelerationLocalLateralMetersPerSecondSquared:
        lateralAccelerationMetersPerSecondSquared,
      planarAccelerationLocalForwardMetersPerSecondSquared: 0,
    })
  }
  return { state, wheelStates }
}

// The transfer one axle takes: the spread between its two corners.
function axleTransferNewtons(wheelStates, axle, field) {
  const corners = wheelStates.filter((wheelState) => wheelState.axle === axle)
  const values = corners.map((wheelState) => wheelState[field])
  return (Math.max(...values) - Math.min(...values)) / 2
}

function classicAxleTransferNewtons(lateralAccelerationMetersPerSecondSquared) {
  return (
    (AXLE_SPRUNG_MASS_KG *
      lateralAccelerationMetersPerSecondSquared *
      CENTER_OF_MASS_HEIGHT_METERS) /
    TRACK_WIDTH_METERS
  )
}

test('the stock vehicle keeps a ground-level roll axis and the full roll arm', () => {
  const spec = makeSpec()
  const { state } = settleVerticalDynamics({ spec })

  assert.equal(state.frontRollCenterHeightMeters, 0)
  assert.equal(state.rearRollCenterHeightMeters, 0)
  assert.equal(state.rollAxisHeightMeters, 0)
  assert.equal(state.rollArmMeters, CENTER_OF_MASS_HEIGHT_METERS)
})

test('the linkage geometry derives a roll-center height for each archetype', () => {
  const wishboneHeightMeters =
    deriveLinkageRollCenterHeightMeters(WISHBONE_LINKAGE)
  const macphersonHeightMeters =
    deriveLinkageRollCenterHeightMeters(MACPHERSON_LINKAGE)

  // The instant center of the wishbone linkage is far inboard at
  // (-2.828 m, 0.386 m), and the line from the contact patch to it crosses
  // the centerline at 0.0766 m. The MacPherson instant center is further out
  // at (-6.897 m, 1.035 m) and crosses at 0.0954 m.
  assert.ok(
    Math.abs(wishboneHeightMeters - 0.076587) < 1e-6,
    'wishbone roll center must be 0.076587 m, got ' + wishboneHeightMeters
  )
  assert.ok(
    Math.abs(macphersonHeightMeters - 0.095368) < 1e-6,
    'MacPherson roll center must be 0.095368 m, got ' + macphersonHeightMeters
  )
  assert.ok(
    macphersonHeightMeters > wishboneHeightMeters,
    'a real MacPherson strut has the higher roll center'
  )
  assert.equal(deriveLinkageRollCenterHeightMeters(null), 0)
})

test('the archetypes have differentiated roll-center heights', () => {
  const stock = resolveAxleRollCenterHeightsMeters(makeSpec(), {
    front: false,
    rear: false,
  })
  const wishbone = resolveAxleRollCenterHeightsMeters(
    makeSpec({ suspensionLinkage: WISHBONE_LINKAGE }),
    { front: false, rear: false }
  )
  const macpherson = resolveAxleRollCenterHeightsMeters(
    makeSpec({ suspensionLinkage: MACPHERSON_LINKAGE }),
    { front: false, rear: false }
  )
  const solidAxle = resolveAxleRollCenterHeightsMeters(
    makeSpec({ solidAxleRollCenterHeightMeters: SOLID_AXLE_ROLL_CENTER_HEIGHT_METERS }),
    { front: false, rear: true }
  )

  assert.equal(stock.front, 0)
  assert.equal(stock.rear, 0)
  assert.ok(wishbone.front > 0.05 && wishbone.front < 0.1)
  assert.equal(wishbone.front, wishbone.rear)
  assert.ok(macpherson.front > 0.08 && macpherson.front < 0.12)
  assert.equal(macpherson.front, macpherson.rear)
  // A coupled axle takes its roll center from the leaf pack, not from a
  // linkage, so the solid axle archetype has a rear roll center and no
  // front roll center.
  assert.equal(solidAxle.front, 0)
  assert.equal(solidAxle.rear, SOLID_AXLE_ROLL_CENTER_HEIGHT_METERS)
})

test('the roll axis height at the center of mass interpolates the axles', () => {
  const chassisGeometry = {
    frontAxleCenterZMeters: HALF_WHEELBASE_METERS,
    rearAxleCenterZMeters: -HALF_WHEELBASE_METERS,
  }

  assert.equal(
    resolveRollAxisHeightMeters(0, 0, chassisGeometry),
    0,
    'a vehicle with no roll center keeps the ground-level roll axis'
  )
  assert.ok(
    Math.abs(
      resolveRollAxisHeightMeters(0.1, 0.3, chassisGeometry) - 0.2
    ) < 1e-12,
    'a center of mass at mid-wheelbase sits halfway between the roll centers'
  )
})

test('a roll center shortens the roll arm and the body roll', () => {
  const lateralAccelerationMetersPerSecondSquared =
    0.5 * GRAVITY_METERS_PER_SECOND_SQUARED

  const stock = settleVerticalDynamics({
    lateralAccelerationMetersPerSecondSquared,
  })
  const wishbone = settleVerticalDynamics({
    lateralAccelerationMetersPerSecondSquared,
    spec: makeSpec({ suspensionLinkage: WISHBONE_LINKAGE }),
  })
  const macpherson = settleVerticalDynamics({
    lateralAccelerationMetersPerSecondSquared,
    spec: makeSpec({ suspensionLinkage: MACPHERSON_LINKAGE }),
  })

  const expectedRollRadians =
    (MASS_KG *
      lateralAccelerationMetersPerSecondSquared *
      CENTER_OF_MASS_HEIGHT_METERS) /
    ROLL_STIFFNESS_NEWTON_METERS_PER_RADIAN
  assert.ok(
    Math.abs(stock.state.rollRadians - expectedRollRadians) < 1e-6,
    'the stock roll must stay the pre-roll-center roll'
  )

  const wishboneExpectedRollRadians =
    (MASS_KG *
      lateralAccelerationMetersPerSecondSquared *
      wishbone.state.rollArmMeters) /
    ROLL_STIFFNESS_NEWTON_METERS_PER_RADIAN
  assert.ok(
    Math.abs(wishbone.state.rollRadians - wishboneExpectedRollRadians) < 1e-6,
    'the wishbone roll must follow the shortened roll arm'
  )
  assert.ok(
    wishbone.state.rollRadians < stock.state.rollRadians,
    'a roll center must reduce the body roll'
  )
  assert.ok(
    macpherson.state.rollRadians < wishbone.state.rollRadians,
    'the higher MacPherson roll center must roll less than the wishbone'
  )
})

test('the lateral load transfer splits into the direct and the elastic part and stays conserved', () => {
  const lateralAccelerationMetersPerSecondSquared =
    0.5 * GRAVITY_METERS_PER_SECOND_SQUARED
  const classicTransferNewtons = classicAxleTransferNewtons(
    lateralAccelerationMetersPerSecondSquared
  )

  for (const [label, spec] of [
    ['stock', makeSpec()],
    ['wishbone', makeSpec({ suspensionLinkage: WISHBONE_LINKAGE })],
    ['macpherson', makeSpec({ suspensionLinkage: MACPHERSON_LINKAGE })],
  ]) {
    const { state, wheelStates } = settleVerticalDynamics({
      lateralAccelerationMetersPerSecondSquared,
      spec,
    })

    for (const axle of ['front', 'rear']) {
      const elasticNewtons = axleTransferNewtons(
        wheelStates,
        axle,
        'verticalDynamicsLoadDeviationNewtons'
      )
      const directNewtons = axleTransferNewtons(
        wheelStates,
        axle,
        'verticalDynamicsDirectLoadTransferNewtons'
      )

      assert.ok(
        Math.abs(elasticNewtons + directNewtons - classicTransferNewtons) <
          1,
        label +
          ' ' +
          axle +
          ' axle must carry the classic transfer, got ' +
          (elasticNewtons + directNewtons)
      )
      assert.ok(
        Math.abs(state.directLateralLoadTransferNewtons -
          (directNewtons + axleTransferNewtons(
            wheelStates,
            axle === 'front' ? 'rear' : 'front',
            'verticalDynamicsDirectLoadTransferNewtons'
          ))) < 1e-6,
        label + ' must report the direct transfer of both axles'
      )
    }
  }
})

test('the direct transfer loads the outside wheel and unloads the inside wheel', () => {
  const lateralAccelerationMetersPerSecondSquared =
    0.5 * GRAVITY_METERS_PER_SECOND_SQUARED
  const { wheelStates } = settleVerticalDynamics({
    lateralAccelerationMetersPerSecondSquared,
    spec: makeSpec({ suspensionLinkage: WISHBONE_LINKAGE }),
  })

  // A positive lateral acceleration points toward the vehicle local left
  // (+X), so the outside of that turn is the local right (-X).
  const frontRight = wheelStates.find(
    (wheelState) => wheelState.axle === 'front' && wheelState.localPosition.x < 0
  )
  const frontLeft = wheelStates.find(
    (wheelState) => wheelState.axle === 'front' && wheelState.localPosition.x > 0
  )

  assert.ok(
    frontRight.verticalDynamicsDirectLoadTransferNewtons > 0,
    'the outside wheel must carry the direct transfer'
  )
  assert.ok(
    frontLeft.verticalDynamicsDirectLoadTransferNewtons < 0,
    'the inside wheel must lose the direct transfer'
  )
  assert.ok(
    Math.abs(
      frontRight.verticalDynamicsDirectLoadTransferNewtons +
        frontLeft.verticalDynamicsDirectLoadTransferNewtons
    ) < 1e-6,
    'the direct transfer must not change the total load of the axle'
  )
})

test('a coupled axle takes no direct lateral transfer and no lateral transfer at all', () => {
  const lateralAccelerationMetersPerSecondSquared =
    0.5 * GRAVITY_METERS_PER_SECOND_SQUARED
  const { state, wheelStates } = settleVerticalDynamics({
    lateralAccelerationMetersPerSecondSquared,
    spec: makeSpec({
      rearAxleCoupling: 'rigidAxle',
      solidAxleRollCenterHeightMeters: SOLID_AXLE_ROLL_CENTER_HEIGHT_METERS,
    }),
  })

  assert.equal(state.rearRollCenterHeightMeters, SOLID_AXLE_ROLL_CENTER_HEIGHT_METERS)
  assert.equal(state.frontRollCenterHeightMeters, 0)
  // The roll axis tilts: the coupled rear roll center lifts it above the
  // ground, so the elastic roll arm is shorter than the center-of-mass
  // height.
  assert.ok(
    Math.abs(state.rollAxisHeightMeters - 0.125) < 1e-12,
    'the roll axis height at the center of mass must be 0.125 m'
  )

  const rearDirectNewtons = axleTransferNewtons(
    wheelStates,
    'rear',
    'verticalDynamicsDirectLoadTransferNewtons'
  )
  const rearElasticNewtons = axleTransferNewtons(
    wheelStates,
    'rear',
    'verticalDynamicsLoadDeviationNewtons'
  )
  assert.equal(rearDirectNewtons, 0)
  assert.equal(rearElasticNewtons, 0)
  assert.equal(state.directLateralLoadTransferNewtons, 0)
})

test('the stock vehicle keeps its byte-identical physics trace', () => {
  const controller = createVehicleController({ vehicle: createCar() })
  const lines = []
  let lastVerticalDynamics = null

  for (let step = 0; step < 5400; step += 1) {
    // The trace has to exercise the roll path: a straight-line run never
    // develops body roll, so a broken roll arm would stay invisible.
    const input =
      step < 2700
        ? { throttle: true }
        : step < 3600
          ? { throttle: true, left: true }
          : { brake: true }
    const snapshot = controller.update(DT_SECONDS, input)
    const verticalDynamics = snapshot.verticalDynamics
    lastVerticalDynamics = verticalDynamics
    const wheelFields = []
    for (const wheelState of snapshot.wheelStates) {
      wheelFields.push(
        wheelState.id,
        wheelState.suspensionCurrentLengthMeters.toFixed(9),
        wheelState.baseNormalForceNewtons.toFixed(9),
        wheelState.normalForceNewtons.toFixed(9),
        wheelState.verticalDynamicsLoadDeviationNewtons.toFixed(9)
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

  const trace = lines.join('\n')
  const digest = createHash('sha256').update(trace).digest('hex')

  assert.equal(
    digest,
    STOCK_TRACE_SHA256,
    'the stock vehicle must keep its pre-roll-center trace'
  )
  assert.equal(
    lastVerticalDynamics.directLateralLoadTransferNewtons,
    0,
    'the stock vehicle has no roll center and no direct transfer'
  )
})
