// test/antiRollBar.test.js

// Anti-roll bar (ARB) v1 physics coverage.
//
// The ARB couples the two wheels of one axle through a torsional stiffness
// that opposes their relative suspension compression. This file verifies:
//
//   - a zero-stiffness (or absent) ARB is a true no-op: the 5400-step stock
//     trace is byte-identical to the pre-ARB baseline (AGENTS.md 3.1 contract);
//   - a one-sided compression produces equal/opposite left/right normal-force
//     changes on an independent axle, and zero effect on a rigid (coupled)
//     axle;
//   - a stiffer ARB reduces steady-state body roll (monotonic roll stiffness);
//   - an ARB on a solid (coupled) axle changes nothing.
//
// The harness mirrors solidAxleArchetype.test.js: a flat heightfield query, a
// one-wheel raised-step query to induce asymmetric compression, and the
// catalog-driven controller construction.

import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { createHeightfieldTerrainContactQuery } from '../src/terrain/createHeightfieldTerrainContactQuery.js'
import { applyVehicleConfiguration } from '../src/vehicle/config/applyVehicleConfiguration.js'
import {
  createDefaultVehicleConfiguration,
  setVehicleConfigurationSlot,
} from '../src/vehicle/config/createVehicleConfiguration.js'

const DT_SECONDS = 1 / 60
const SETTLE_STEPS = 600
const LONG_TRACE_STEPS = 5400
const STEP_HEIGHT_METERS = 0.08
const STIFF_ARB_NEWTONS_PER_METER = 40000

// +X is the car's LEFT side and +Z is forward (src/car/createCar.js).
const FRONT_LEFT_XZ = Object.freeze({ x: 1.25, z: 1.45 })
const REAR_LEFT_XZ = Object.freeze({ x: 1.25, z: -1.45 })

function createFlatHeightfieldQuery() {
  return createHeightfieldTerrainContactQuery({
    surfaceProfile: {
      profileName: 'arb-flat',
      surfaceKind: 'test-asphalt',
      frictionCoefficient: 1,
      querySurfaceAtWorldPosition(worldXMeters, worldZMeters, target = {}) {
        target.isWithinBounds = true
        target.isInsideTerrainBounds = true
        target.profileName = 'arb-flat'
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

// Raises terrain under ONE wheel only, to induce a one-sided suspension
// compression (and therefore body roll) without moving the chassis support.
function createRaisedStepQuery(targetWheelXZ, stepHeightMeters = STEP_HEIGHT_METERS) {
  const baseQuery = createFlatHeightfieldQuery()
  const matchToleranceMeters = 0.1

  return {
    kind: 'arb-step-query',
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

// Builds a controller. Per-axle ARB stiffness defaults to 0; the solid-axle
// rear archetype can be selected to exercise the coupled-axle skip path.
function createArbController({
  frontAntiRollBarStiffnessNewtonsPerMeter = 0,
  rearAntiRollBarStiffnessNewtonsPerMeter = 0,
  rearCoupled = false,
  terrainContactQuery,
} = {}) {
  let configuration = createDefaultVehicleConfiguration()
  if (rearCoupled) {
    configuration = setVehicleConfigurationSlot(
      configuration,
      'suspensionRear',
      'susp-solid-axle'
    )
  }
  const applied = applyVehicleConfiguration(configuration)
  applied.spec.suspensionFront.antiRollBarStiffnessNewtonsPerMeter =
    frontAntiRollBarStiffnessNewtonsPerMeter
  applied.spec.suspensionRear.antiRollBarStiffnessNewtonsPerMeter =
    rearAntiRollBarStiffnessNewtonsPerMeter

  return createVehicleController({
    vehicle: createCar(),
    startPosition: new THREE.Vector3(0, 0, 0),
    terrainContactQuery: terrainContactQuery ?? createFlatHeightfieldQuery(),
    spec: applied.spec,
  })
}

function settle(controller, steps = SETTLE_STEPS) {
  let snapshot
  for (let step = 0; step < steps; step += 1) {
    snapshot = controller.update(DT_SECONDS, {})
  }
  return snapshot
}

function wheelById(snapshot, wheelId) {
  const found = snapshot.wheelStates.find((wheel) => wheel.id === wheelId)
  assert.ok(found, 'wheel ' + wheelId + ' must exist in the snapshot')
  return found
}

// A compact, scalar-only signature of a wheel's physics state. Comparing the
// whole wheelState (which carries Vector3/contact buffers) under deepEqual is
// both fragile and slow, so we compare only the meaningful physics leaves.
function wheelSignature(wheel) {
  return {
    id: wheel.id,
    isGrounded: wheel.isGrounded,
    normalForceNewtons: wheel.normalForceNewtons,
    suspensionCompressionMeters: wheel.suspensionCompressionMeters,
    suspensionSpringRateNewtonsPerMeter: wheel.suspensionSpringRateNewtonsPerMeter,
    verticalDynamicsLoadDeviationNewtons: wheel.verticalDynamicsLoadDeviationNewtons,
    verticalDynamicsDirectLoadTransferNewtons:
      wheel.verticalDynamicsDirectLoadTransferNewtons,
    tractionLimitNewtons: wheel.tractionLimitNewtons,
    lateralSlipAngleRadians: wheel.lateralSlipAngleRadians,
  }
}

function verticalDynamicsSignature(vd) {
  return {
    rollRadians: vd.rollRadians,
    pitchRadians: vd.pitchRadians,
    heaveMeters: vd.heaveMeters,
    rollRateRadiansPerSecond: vd.rollRateRadiansPerSecond,
    pitchRateRadiansPerSecond: vd.pitchRateRadiansPerSecond,
    heaveVelocityMetersPerSecond: vd.heaveVelocityMetersPerSecond,
    rollAccelerationRadiansPerSecondSquared: vd.rollAccelerationRadiansPerSecondSquared,
    pitchAccelerationRadiansPerSecondSquared: vd.pitchAccelerationRadiansPerSecondSquared,
    heaveAccelerationMetersPerSecondSquared: vd.heaveAccelerationMetersPerSecondSquared,
    planarForceRollMomentNewtonMeters: vd.planarForceRollMomentNewtonMeters,
    planarForcePitchMomentNewtonMeters: vd.planarForcePitchMomentNewtonMeters,
    terrainRollMomentNewtonMeters: vd.terrainRollMomentNewtonMeters,
    terrainPitchMomentNewtonMeters: vd.terrainPitchMomentNewtonMeters,
    directLateralLoadTransferNewtons: vd.directLateralLoadTransferNewtons,
    elasticLateralLoadTransferNewtons: vd.elasticLateralLoadTransferNewtons,
    sprungMassKg: vd.sprungMassKg,
    rollArmMeters: vd.rollArmMeters,
    isFinite: vd.isFinite,
    integratedWheelCount: vd.integratedWheelCount,
  }
}

function snapshotSignature(snapshot) {
  return {
    wheels: snapshot.wheelStates.map(wheelSignature),
    verticalDynamics: verticalDynamicsSignature(snapshot.verticalDynamics),
  }
}

test('a zero or absent ARB leaves the 5400-step stock trace byte-identical', () => {
  // Baseline: field is entirely absent from the runtime spec.
  const baselineController = createVehicleController({
    vehicle: createCar(),
    startPosition: new THREE.Vector3(0, 0, 0),
    terrainContactQuery: createFlatHeightfieldQuery(),
    spec: {},
  })
  // Variant: field present but exactly zero on both axles.
  const zeroController = createArbController({
    frontAntiRollBarStiffnessNewtonsPerMeter: 0,
    rearAntiRollBarStiffnessNewtonsPerMeter: 0,
  })

  const baselineSnapshot = settle(baselineController, LONG_TRACE_STEPS)
  const zeroSnapshot = settle(zeroController, LONG_TRACE_STEPS)

  // The scalar physics outputs are identical (no-op ARB).
  assert.deepEqual(
    snapshotSignature(baselineSnapshot),
    snapshotSignature(zeroSnapshot)
  )

  // The new telemetry field is exactly zero everywhere (true no-op).
  for (const wheel of zeroSnapshot.wheelStates) {
    assert.equal(
      wheel.verticalDynamicsAntiRollBarLoadTransferNewtons,
      0,
      wheel.id + ' ARB transfer must be zero with a zero-stiffness bar'
    )
  }
})

test('a one-sided compression yields equal/opposite ARB load transfer on an independent axle', () => {
  const neutralController = createArbController({
    frontAntiRollBarStiffnessNewtonsPerMeter: 0,
    terrainContactQuery: createRaisedStepQuery(FRONT_LEFT_XZ),
  })
  const arbController = createArbController({
    frontAntiRollBarStiffnessNewtonsPerMeter: STIFF_ARB_NEWTONS_PER_METER,
    terrainContactQuery: createRaisedStepQuery(FRONT_LEFT_XZ),
  })

  const neutralSnapshot = settle(neutralController)
  const arbSnapshot = settle(arbController)

  const neutralFL = wheelById(neutralSnapshot, 'front-left')
  const neutralFR = wheelById(neutralSnapshot, 'front-right')
  const arbFL = wheelById(arbSnapshot, 'front-left')
  const arbFR = wheelById(arbSnapshot, 'front-right')

  // Neutral run: no ARB transfer.
  assert.equal(neutralFL.verticalDynamicsAntiRollBarLoadTransferNewtons, 0)
  assert.equal(neutralFR.verticalDynamicsAntiRollBarLoadTransferNewtons, 0)

  // Stiff run: equal/opposite transfer, and it matches the force law
  // F_arb = -k * (compL - compR).
  const arbForceNewtons =
    -STIFF_ARB_NEWTONS_PER_METER *
    (arbFL.suspensionCompressionMeters - arbFR.suspensionCompressionMeters)
  assert.ok(
    Math.abs(
      arbFL.verticalDynamicsAntiRollBarLoadTransferNewtons - arbForceNewtons
    ) < 1e-3,
    'front-left ARB transfer must equal -k * (compL - compR)'
  )
  assert.ok(
    Math.abs(
      arbFL.verticalDynamicsAntiRollBarLoadTransferNewtons +
        arbFR.verticalDynamicsAntiRollBarLoadTransferNewtons
    ) < 1e-6,
    'left and right ARB transfers must be equal and opposite'
  )

  // The bar is a pure couple: it redistributes load within the axle but does
  // not change the axle's total normal force.
  const neutralAxleLoadNewtons =
    neutralFL.normalForceNewtons + neutralFR.normalForceNewtons
  const arbAxleLoadNewtons =
    arbFL.normalForceNewtons + arbFR.normalForceNewtons
  assert.ok(
    Math.abs(neutralAxleLoadNewtons - arbAxleLoadNewtons) < 1e-6,
    'ARB must preserve the axle total normal force'
  )
})

test('a stiffer ARB reduces steady-state body roll (monotonic roll stiffness)', () => {
  const rollFor = (stiffness) => {
    const controller = createArbController({
      frontAntiRollBarStiffnessNewtonsPerMeter: stiffness,
      terrainContactQuery: createRaisedStepQuery(FRONT_LEFT_XZ),
    })
    const snapshot = settle(controller)
    return Math.abs(snapshot.verticalDynamics.rollRadians)
  }

  const rollZero = rollFor(0)
  const rollStiff = rollFor(STIFF_ARB_NEWTONS_PER_METER)

  assert.ok(rollZero > 1e-4, 'the step must induce measurable body roll')
  assert.ok(
    rollStiff < rollZero,
    'a stiff ARB must reduce body roll; got rollZero=' +
      rollZero.toFixed(5) +
      ' rollStiff=' +
      rollStiff.toFixed(5)
  )
})

test('an ARB on a solid (coupled) axle is a no-op', () => {
  const coupledNeutral = createArbController({
    rearCoupled: true,
    frontAntiRollBarStiffnessNewtonsPerMeter: 0,
    rearAntiRollBarStiffnessNewtonsPerMeter: 0,
    terrainContactQuery: createRaisedStepQuery(REAR_LEFT_XZ),
  })
  const coupledArb = createArbController({
    rearCoupled: true,
    frontAntiRollBarStiffnessNewtonsPerMeter: 0,
    rearAntiRollBarStiffnessNewtonsPerMeter: STIFF_ARB_NEWTONS_PER_METER,
    terrainContactQuery: createRaisedStepQuery(REAR_LEFT_XZ),
  })

  const neutralSnapshot = settle(coupledNeutral)
  const arbSnapshot = settle(coupledArb)

  // Rear (coupled) ARB transfer is zero despite a non-zero stiffness.
  const neutralRL = wheelById(neutralSnapshot, 'rear-left')
  const neutralRR = wheelById(neutralSnapshot, 'rear-right')
  const arbRL = wheelById(arbSnapshot, 'rear-left')
  const arbRR = wheelById(arbSnapshot, 'rear-right')
  assert.equal(arbRL.verticalDynamicsAntiRollBarLoadTransferNewtons, 0)
  assert.equal(arbRR.verticalDynamicsAntiRollBarLoadTransferNewtons, 0)

  // The rear wheels are byte-identical between the two runs.
  assert.deepEqual(wheelSignature(neutralRL), wheelSignature(arbRL))
  assert.deepEqual(wheelSignature(neutralRR), wheelSignature(arbRR))

  // Sanity: the front (independent) axle shows no ARB transfer because its
  // stiffness is zero.
  assert.equal(
    wheelById(arbSnapshot, 'front-left').verticalDynamicsAntiRollBarLoadTransferNewtons,
    0
  )
})