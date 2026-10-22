// test/camberState.test.js

import assert from 'node:assert/strict'
import test from 'node:test'

import { createCar } from '../src/car/createCar.js'
import { DEFAULT_VEHICLE_SPEC } from '../src/vehicle/defaultVehicleSpec.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import {
  captureWheelCamberStaticCompressionReference,
  computeCamberThrustForceNewtons,
  resetWheelCamberState,
  updateWheelCamberState,
} from '../src/vehicle/dynamics/camberState.js'
import { updateWheelLateralTireForceState } from '../src/vehicle/dynamics/lateralTireForceState.js'
import { updateWheelCombinedSlipTireForce } from '../src/vehicle/dynamics/combinedSlipTireForceState.js'

const DT_SECONDS = 1 / 60
const DESIGN_COMPRESSION_METERS = 0.22 * 0.4

function makeWheel(overrides = {}) {
  return {
    id: 'front-right',
    axle: 'front',
    side: 'right',
    localPosition: { x: -1.25, y: 0.3, z: 1.45 },
    isGrounded: true,
    normalForceNewtons: 4000,
    tractionLimitNewtons: 4000,
    frictionCoefficient: 1,
    suspensionCompressionMeters: DESIGN_COMPRESSION_METERS,
    camberRadians: 0,
    camberRadiansDegrees: 0,
    camberEffectiveTravelMeters: 0,
    camberRollInducedTravelMeters: 0,
    camberThrustForceNewtons: 0,
    camberStaticCompressionReferenceMeters: null,
    lateralSlipAngleRadians: 0,
    hasLateralSlipAngleSample: true,
    longitudinalSlipRatio: 0,
    pressureAdjustedLateralTireStiffnessNewtonsPerRadian: 6000,
    pressureAdjustedLongitudinalTireStiffnessNewtonsPerSlipRatio: 1600,
    appliedLongitudinalForceNewtons: 0,
    appliedLateralTireForceNewtons: 0,
    uncappedLongitudinalTireForceNewtons: 0,
    uncappedLateralTireForceNewtons: 0,
    linearLateralTireForceNewtons: 0,
    longitudinalTireForceSaturationRatio: 0,
    lateralTireForceSaturationRatio: 0,
    combinedTireForceMagnitudeNewtons: 0,
    combinedTireForceLimitNewtons: 0,
    combinedTireForceScale01: 1,
    combinedTireForceSaturationRatio: 0,
    isLongitudinalTireForceSaturated: false,
    isLateralTireForceSaturated: false,
    isCombinedTireForceSaturated: false,
    isSlipping: false,
    ...overrides,
  }
}

const CAMBER_SPEC = {
  suspensionTravelMeters: 0.22,
  suspensionTargetStaticCompressionRatio01: 0.4,
  camberStaticRadians: 0,
  camberGainRadiansPerMeterCompression: -0.262,
  camberStiffnessNewtonsPerRadianPerNewton: 0.35,
}

// ---------------------------------------------------------------------------
// The camber derivation.
// ---------------------------------------------------------------------------

test('a wheel at the design ride position reports no camber', () => {
  const wheel = makeWheel()
  updateWheelCamberState([wheel], CAMBER_SPEC, 0)

  assert.equal(wheel.camberEffectiveTravelMeters, 0)
  assert.equal(wheel.camberRadians, 0)
})

test('the camber is measured from the design position, not from the raw compression', () => {
  const wheel = makeWheel({ suspensionCompressionMeters: DESIGN_COMPRESSION_METERS + 0.05 })
  updateWheelCamberState([wheel], CAMBER_SPEC, 0)

  assert.equal(wheel.camberEffectiveTravelMeters, 0.05)
  assert.ok(Math.abs(wheel.camberRadians + 0.262 * 0.05) < 1e-12)
})

test('the captured static compression overrides the spec ratio at rest', () => {
  const wheel = makeWheel({ suspensionCompressionMeters: 0.088 })
  assert.equal(
    captureWheelCamberStaticCompressionReference([wheel]),
    true
  )

  updateWheelCamberState(
    [wheel],
    { ...CAMBER_SPEC, suspensionTargetStaticCompressionRatio01: 0.65 },
    0
  )

  assert.equal(wheel.camberStaticCompressionReferenceMeters, 0.088)
  assert.equal(wheel.camberEffectiveTravelMeters, 0)
  assert.equal(wheel.camberRadians, 0)
})

test('the captured static compression is not recaptured while the wheel travels', () => {
  const wheel = makeWheel({ suspensionCompressionMeters: 0.088 })
  captureWheelCamberStaticCompressionReference([wheel])

  wheel.suspensionCompressionMeters = 0.12
  assert.equal(
    captureWheelCamberStaticCompressionReference([wheel]),
    true
  )
  updateWheelCamberState([wheel], CAMBER_SPEC, 0)

  assert.equal(wheel.camberStaticCompressionReferenceMeters, 0.088)
  assert.equal(wheel.camberEffectiveTravelMeters, 0.032)
})

test('capture waits until every grounded wheel has a reference', () => {
  const grounded = makeWheel({ id: 'grounded', suspensionCompressionMeters: 0.088 })
  const airborne = makeWheel({
    id: 'airborne',
    isGrounded: false,
    suspensionCompressionMeters: 0,
  })

  assert.equal(
    captureWheelCamberStaticCompressionReference([grounded, airborne], true),
    false
  )
  assert.equal(grounded.camberStaticCompressionReferenceMeters, 0.088)
  assert.equal(airborne.camberStaticCompressionReferenceMeters, null)

  airborne.isGrounded = true
  assert.equal(
    captureWheelCamberStaticCompressionReference([grounded, airborne], true),
    true
  )
  assert.equal(airborne.camberStaticCompressionReferenceMeters, 0)
})

test('the roll-induced travel tilts the compressed wheel negative', () => {
  const bodyRollRadians = 0.01
  const right = makeWheel({ side: 'right', localPosition: { x: -1.25, y: 0.3, z: 1.45 } })
  const left = makeWheel({ side: 'left', localPosition: { x: 1.25, y: 0.3, z: 1.45 } })

  updateWheelCamberState([right, left], CAMBER_SPEC, bodyRollRadians)

  // Positive body roll lifts the +X (left) side, so the right wheel is the
  // compressed one and the left wheel extends.
  assert.ok(Math.abs(right.camberRollInducedTravelMeters - 0.0125) < 1e-12)
  assert.ok(Math.abs(left.camberRollInducedTravelMeters + 0.0125) < 1e-12)
  assert.ok(right.camberRadians < 0, 'the compressed wheel gains negative camber')
  assert.ok(left.camberRadians > 0, 'the extended wheel gains positive camber')
})

test('a suspension archetype with no camber gain reports no camber at all', () => {
  const wheel = makeWheel()
  updateWheelCamberState([wheel], { ...CAMBER_SPEC, camberGainRadiansPerMeterCompression: 0 }, 0.02)

  assert.equal(wheel.camberRadians, 0)
  assert.equal(computeCamberThrustForceNewtons(wheel, CAMBER_SPEC), 0)
})

test('the camber state resets to zero', () => {
  const wheel = makeWheel({ camberRadians: 0.5, camberThrustForceNewtons: 120 })
  resetWheelCamberState(wheel)

  assert.equal(wheel.camberRadians, 0)
  assert.equal(wheel.camberThrustForceNewtons, 0)
  assert.equal(wheel.camberEffectiveTravelMeters, 0)
  assert.equal(wheel.camberStaticCompressionReferenceMeters, null)
})

// ---------------------------------------------------------------------------
// The camber thrust.
// ---------------------------------------------------------------------------

test('a positive camber pushes the wheel outboard', () => {
  const left = makeWheel({ side: 'left', localPosition: { x: 1.25, y: 0.3, z: 1.45 }, camberRadians: 0.1 })
  const right = makeWheel({ side: 'right', localPosition: { x: -1.25, y: 0.3, z: 1.45 }, camberRadians: 0.1 })

  const leftThrust = computeCamberThrustForceNewtons(left, CAMBER_SPEC)
  const rightThrust = computeCamberThrustForceNewtons(right, CAMBER_SPEC)

  // The applied lateral tire force is positive toward the wheel's local left,
  // which is the outboard side for the left wheel only.
  assert.ok(leftThrust > 0)
  assert.ok(rightThrust < 0)
  assert.ok(Math.abs(leftThrust + rightThrust) < 1e-9)
})

test('a wheel without a camber angle produces exactly zero thrust, never NaN', () => {
  const wheel = makeWheel()
  delete wheel.camberRadians

  const thrust = computeCamberThrustForceNewtons(wheel, CAMBER_SPEC)

  assert.equal(thrust, 0)
  assert.ok(Number.isFinite(thrust))
})

test('a wheel without a vertical load produces no camber thrust', () => {
  const wheel = makeWheel({ camberRadians: 0.1, normalForceNewtons: 0 })

  assert.equal(computeCamberThrustForceNewtons(wheel, CAMBER_SPEC), 0)
})

// ---------------------------------------------------------------------------
// The tire force paths.
// ---------------------------------------------------------------------------

test('a zero-camber wheel keeps the slip-only lateral force', () => {
  const wheel = makeWheel({ lateralSlipAngleRadians: 0.05 })
  updateWheelLateralTireForceState(wheel, CAMBER_SPEC)

  assert.equal(wheel.camberThrustForceNewtons, 0)
  assert.ok(
    Math.abs(wheel.appliedLateralTireForceNewtons + 6000 * 0.05) < 1e-9,
    'the lateral force must stay the slip-only value'
  )
})

test('the camber thrust is added to the slip response in the simple path', () => {
  const camberRadians = 0.05
  // A left wheel with positive camber pushes outboard, which is the positive
  // applied lateral tire force direction.
  const wheel = makeWheel({
    side: 'left',
    localPosition: { x: 1.25, y: 0.3, z: 1.45 },
    lateralSlipAngleRadians: 0.02,
    camberRadians,
  })
  updateWheelLateralTireForceState(wheel, CAMBER_SPEC)

  const expectedThrust = 0.35 * 4000 * camberRadians
  assert.ok(Math.abs(wheel.camberThrustForceNewtons - expectedThrust) < 1e-9)
  assert.ok(
    Math.abs(
      wheel.appliedLateralTireForceNewtons -
        (-6000 * 0.02 + expectedThrust)
    ) < 1e-9
  )
})

test('the simple path bounds the camber thrust with the friction cap', () => {
  const camberRadians = (10 * Math.PI) / 180
  const wheel = makeWheel({
    side: 'left',
    localPosition: { x: 1.25, y: 0.3, z: 1.45 },
    lateralSlipAngleRadians: 0.9,
    camberRadians,
  })
  updateWheelLateralTireForceState(wheel, CAMBER_SPEC)

  // The uncapped force carries both the slip response and the camber thrust,
  // and the applied force stays inside the friction limit.
  const expectedThrust = 0.35 * 4000 * camberRadians
  assert.ok(
    Math.abs(
      wheel.uncappedLateralTireForceNewtons - (-6000 * 0.9 + expectedThrust)
    ) < 1e-9,
    'the uncapped force must carry the camber thrust on top of the slip force'
  )
  assert.ok(
    Math.abs(wheel.appliedLateralTireForceNewtons) <= wheel.tractionLimitNewtons + 1e-6,
    'the camber thrust must not push the lateral force past the friction limit'
  )
  assert.ok(wheel.isLateralTireForceSaturated)
})

test('the combined-slip path adds the camber thrust to the elastic lateral force', () => {
  const camberRadians = 0.05
  const wheel = makeWheel({
    side: 'left',
    localPosition: { x: 1.25, y: 0.3, z: 1.45 },
    lateralSlipAngleRadians: 0.02,
    camberRadians,
  })
  updateWheelCombinedSlipTireForce(wheel, CAMBER_SPEC)

  const expectedThrust = 0.35 * 4000 * camberRadians
  assert.ok(Math.abs(wheel.camberThrustForceNewtons - expectedThrust) < 1e-9)
  assert.ok(
    Math.abs(
      wheel.uncappedLateralTireForceNewtons -
        (-6000 * Math.tan(0.02) + expectedThrust)
    ) < 1e-9
  )
})

test('the combined-slip path bounds the camber thrust with the friction circle', () => {
  const camberRadians = (10 * Math.PI) / 180
  const wheel = makeWheel({
    side: 'left',
    localPosition: { x: 1.25, y: 0.3, z: 1.45 },
    lateralSlipAngleRadians: 0.4,
    camberRadians,
  })
  updateWheelCombinedSlipTireForce(wheel, CAMBER_SPEC)

  assert.ok(
    wheel.combinedTireForceMagnitudeNewtons <= wheel.tractionLimitNewtons + 1e-6,
    'the combined magnitude must stay inside the friction circle'
  )
})

test('a combined-slip wheel without a camber angle keeps the slip-only force', () => {
  const wheel = makeWheel({ lateralSlipAngleRadians: 0.02 })
  delete wheel.camberRadians
  updateWheelCombinedSlipTireForce(wheel, CAMBER_SPEC)

  assert.equal(wheel.camberThrustForceNewtons, 0)
  assert.ok(
    Math.abs(wheel.uncappedLateralTireForceNewtons + 6000 * Math.tan(0.02)) < 1e-9
  )
})

// ---------------------------------------------------------------------------
// The live vehicle.
// ---------------------------------------------------------------------------

function runCorner(spec = {}) {
  const controller = createVehicleController({
    vehicle: createCar(),
    spec,
  })
  let snapshot = controller.getSnapshot()

  for (let step = 0; step < 600; step += 1) {
    const input = step < 300 ? { throttle: true } : { throttle: true, left: true }
    snapshot = controller.update(DT_SECONDS, input)
  }

  return snapshot
}

test('the stock vehicle reports no camber and no camber thrust', () => {
  const snapshot = runCorner()

  for (const wheelState of snapshot.wheelStates) {
    assert.equal(wheelState.camberRadians, 0)
    assert.equal(wheelState.camberThrustForceNewtons, 0)
  }
})

test('the camber comes from the effective travel: the outer wheel gains negative camber', () => {
  const snapshot = runCorner({
    camberGainRadiansPerMeterCompression: -0.262,
  })

  const wheel = (id) => snapshot.wheelStates.find((entry) => entry.id === id)
  const outer = wheel('front-right')
  const inner = wheel('front-left')

  // A left turn rolls the body to the right, so the right wheel is the
  // compressed one. A negative camber gain tilts its top inward.
  assert.ok(outer.camberRadians < 0, 'the outer wheel must gain negative camber')
  assert.ok(inner.camberRadians > 0, 'the inner wheel must gain positive camber')
  assert.ok(
    Math.abs(outer.camberRollInducedTravelMeters) > 0,
    'the roll-induced travel must be part of the camber derivation'
  )
})

test('the camber response scales with the chassis lateral lever arm', () => {
  const hatchback = runCorner({ camberGainRadiansPerMeterCompression: -0.262 })
  const truck = runCorner({
    camberGainRadiansPerMeterCompression: -0.262,
    massKg: 3200,
    wheelbaseMeters: 4.2,
    frontTrackWidthMeters: 2.7,
    rearTrackWidthMeters: 2.7,
    centerOfMassHeightMeters: 0.92,
    yawMomentOfInertiaKgMeterSquared: 6400,
  })

  const outerWheel = (snapshot) =>
    snapshot.wheelStates.find((entry) => entry.id === 'front-right')
  const lateralAcceleration = (snapshot) =>
    Math.abs(snapshot.planarAccelerationLocalLateralMetersPerSecondSquared)
  const rollTravelPerAcceleration = (snapshot) =>
    Math.abs(outerWheel(snapshot).camberRollInducedTravelMeters) /
    lateralAcceleration(snapshot)

  // The identical maneuver reaches a different lateral acceleration for the
  // heavier truck, so the comparison is normalized by lateral acceleration.
  // The truck has a wider track and a taller center of mass, so its outer
  // wheel travels further for the same cornering load.
  assert.ok(
    rollTravelPerAcceleration(truck) > rollTravelPerAcceleration(hatchback),
    'the truck must see a proportionally larger roll-induced travel'
  )
  assert.ok(
    Math.abs(outerWheel(truck).camberRadians) /
      lateralAcceleration(truck) >
      Math.abs(outerWheel(hatchback).camberRadians) /
        lateralAcceleration(hatchback),
    'the truck must see a proportionally larger camber response'
  )
})

test('the default spec keeps the camber gain at zero', () => {
  assert.equal(DEFAULT_VEHICLE_SPEC.camberStaticRadians, 0)
  assert.equal(DEFAULT_VEHICLE_SPEC.camberGainRadiansPerMeterCompression, 0)
  assert.equal(DEFAULT_VEHICLE_SPEC.camberStiffnessNewtonsPerRadianPerNewton, 0.35)
})

test('a softened static target still reports zero camber at spawn', () => {
  const controller = createVehicleController({
    vehicle: createCar(),
    spec: {
      suspensionTargetStaticCompressionRatio01: 0.65,
      camberGainRadiansPerMeterCompression: -0.262,
    },
  })
  const snapshot = controller.update(DT_SECONDS, {})

  for (const wheelState of snapshot.wheelStates) {
    assert.ok(
      Math.abs(wheelState.camberEffectiveTravelMeters) < 1e-15,
      'spawn effective travel must be numerical zero'
    )
    assert.ok(
      Math.abs(wheelState.camberRadians) < 1e-15,
      'spawn camber must be numerical zero'
    )
  }
})

test('a suspension change re-captures the static reference after the vehicle settles', () => {
  const controller = createVehicleController({
    vehicle: createCar(),
    spec: {
      suspensionTargetStaticCompressionRatio01: 0.65,
      camberGainRadiansPerMeterCompression: -0.262,
    },
  })
  let snapshot = controller.update(DT_SECONDS, {})

  for (let step = 0; step < 300; step += 1) {
    snapshot = controller.update(DT_SECONDS, { throttle: true })
  }
  snapshot = controller.setSuspension('susp-double-wishbone')

  for (let step = 0; step < 1800; step += 1) {
    snapshot = controller.update(DT_SECONDS, { brake: true })
    if (Math.abs(snapshot.speedMetersPerSecond) < 1e-4) break
  }

  for (let step = 0; step < 900; step += 1) {
    snapshot = controller.update(DT_SECONDS, {})
  }

  assert.equal(snapshot.speedMetersPerSecond, 0)
  for (const wheelState of snapshot.wheelStates) {
    assert.ok(
      Math.abs(wheelState.camberRadians) < 1e-12,
      'settled camber must return to zero'
    )
    assert.ok(
      Math.abs(wheelState.camberEffectiveTravelMeters) < 1e-12,
      'settled effective travel must return to zero'
    )
  }
})
