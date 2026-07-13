// test/numericalStabilizationObservability.test.js

import assert from 'node:assert/strict'
import test from 'node:test'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { DEFAULT_VEHICLE_SPEC } from '../src/vehicle/defaultVehicleSpec.js'

const NEW_TRACE_FIELDS = [
  'longitudinalSlipRatio',
  'longitudinalGroundSpeedMetersPerSecond',
  'wheelSurfaceSpeedMetersPerSecond',
  'angularVelocityRadiansPerSecond',
  'netTorqueNewtonMeters',
]

const STAGE_NAMES = ['integrationInput', 'postIntegration']

function runSteps(controller, count, input = { throttle: true }) {
  let snapshot = controller.getSnapshot()
  for (let index = 0; index < count; index += 1) {
    snapshot = controller.update(1 / 60, input)
  }
  return snapshot
}

function cloneStage(stage) {
  return {
    hasSample: stage.hasSample,
    wheels: stage.wheels.map((wheel) => ({ ...wheel })),
  }
}

function maxAbs(values) {
  return values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0)
}

function drivenWheelMaxCorrectionTorque(snapshot) {
  return snapshot.wheelStates
    .filter((wheelState) => wheelState.driven)
    .reduce(
      (maximum, wheelState) =>
        Math.max(
          maximum,
          Math.abs(wheelState.rollingConstraintCorrectionTorqueNewtonMeters)
        ),
      0
    )
}

test('default spec owns the three stabilization constants with exact literal values', () => {
  assert.equal(DEFAULT_VEHICLE_SPEC.slipRatioSpeedEpsilonMetersPerSecond, 0.1)
  assert.equal(DEFAULT_VEHICLE_SPEC.rollingConstraintCorrectionTimeSeconds, 1.5)
  assert.equal(DEFAULT_VEHICLE_SPEC.tractionLimitEpsilonNewtons, 0.001)
})

test('default spec remains frozen', () => {
  assert.ok(Object.isFrozen(DEFAULT_VEHICLE_SPEC))
})

test('controller constructs and updates finitely with a partial spec omitting the three fields', () => {
  const controller = createVehicleController({
    vehicle: createCar(),
    spec: {
      massKg: 1400,
      // The three stabilization constants are intentionally absent; the
      // default spec supplies them, so behavior is preserved.
    },
  })

  const snapshot = runSteps(controller, 8)

  assert.ok(Number.isFinite(snapshot.speedMetersPerSecond))
  for (const wheelState of snapshot.wheelStates) {
    assert.ok(Number.isFinite(wheelState.angularVelocityRadiansPerSecond))
    assert.ok(Number.isFinite(wheelState.netTorqueNewtonMeters))
    assert.ok(Number.isFinite(wheelState.longitudinalSlipRatio))
  }
})

test('explicitly-absent (undefined) stabilization fields fall back to the literal and match default behavior', () => {
  const baseline = createVehicleController({ vehicle: createCar() })
  const fallback = createVehicleController({
    vehicle: createCar(),
    spec: {
      slipRatioSpeedEpsilonMetersPerSecond: undefined,
      rollingConstraintCorrectionTimeSeconds: undefined,
      tractionLimitEpsilonNewtons: undefined,
    },
  })

  let baselineSnapshot
  let fallbackSnapshot
  for (let index = 0; index < 8; index += 1) {
    baselineSnapshot = baseline.update(1 / 60, { throttle: true })
    fallbackSnapshot = fallback.update(1 / 60, { throttle: true })
  }

  assert.deepEqual(
    fallbackSnapshot.wheelStates.map((wheel) => wheel.longitudinalSlipRatio),
    baselineSnapshot.wheelStates.map((wheel) => wheel.longitudinalSlipRatio)
  )
  for (const wheelState of fallbackSnapshot.wheelStates) {
    assert.ok(Number.isFinite(wheelState.angularVelocityRadiansPerSecond))
    assert.ok(Number.isFinite(wheelState.netTorqueNewtonMeters))
  }
})

test('overriding slipRatioSpeedEpsilonMetersPerSecond changes observed slip ratio (denominator floor active)', () => {
  const smallEpsilon = createVehicleController({
    vehicle: createCar(),
    spec: { slipRatioSpeedEpsilonMetersPerSecond: 0.1 },
  })
  const largeEpsilon = createVehicleController({
    vehicle: createCar(),
    spec: { slipRatioSpeedEpsilonMetersPerSecond: 50 },
  })

  // Run only a couple of steps so the wheel surface speed stays below the
  // large 50 m/s epsilon, keeping its slip denominator floor / sample gate
  // active (the drive wheel spins up fast once slip is nonzero).
  runSteps(smallEpsilon, 2)
  runSteps(largeEpsilon, 2)

  const smallSlip = smallEpsilon
    .getSnapshot()
    .wheelStates.map((wheel) => wheel.longitudinalSlipRatio)
  const largeSlip = largeEpsilon
    .getSnapshot()
    .wheelStates.map((wheel) => wheel.longitudinalSlipRatio)

  // Default epsilon 0.1: wheel surface speed exceeds the floor => slip sample
  // computed (nonzero during launch wheelspin).
  assert.ok(maxAbs(smallSlip) > 0)
  // Large epsilon 50: wheel surface speed is still below the floor, so the
  // sample gate suppresses reported slip (proves the controller consumed the
  // field rather than merely carrying it).
  assert.ok(maxAbs(largeSlip) < maxAbs(smallSlip))
  assert.notDeepEqual(largeSlip, smallSlip)
})

test('overriding rollingConstraintCorrectionTimeSeconds scales the correction torque (inverse-time ratio)', () => {
  const base = createVehicleController({
    vehicle: createCar(),
    spec: { rollingConstraintCorrectionTimeSeconds: 1.5 },
  })
  const slower = createVehicleController({
    vehicle: createCar(),
    spec: { rollingConstraintCorrectionTimeSeconds: 3.0 },
  })

  // Step 1: ground speed ~ 0 => correction torque ~ 0 for both, so the wheel
  // angular velocity integrated this step is identical across controllers.
  base.update(1 / 60, { throttle: true })
  slower.update(1 / 60, { throttle: true })

  // Step 2: same angular-velocity error => correction torque scales with the
  // inverse of the correction time constant.
  const baseSnapshot = base.update(1 / 60, { throttle: true })
  const slowerSnapshot = slower.update(1 / 60, { throttle: true })

  const baseTorque = drivenWheelMaxCorrectionTorque(baseSnapshot)
  const slowerTorque = drivenWheelMaxCorrectionTorque(slowerSnapshot)

  assert.ok(baseTorque > 0)
  assert.ok(Math.abs(slowerTorque / baseTorque - 0.5) < 1e-6)
})

test('invalid slip epsilon values fall back to the 0.1 literal and keep the sim finite', () => {
  for (const badEpsilon of [NaN, -1, Infinity, 0]) {
    const baseline = createVehicleController({ vehicle: createCar() })
    const controller = createVehicleController({
      vehicle: createCar(),
      spec: { slipRatioSpeedEpsilonMetersPerSecond: badEpsilon },
    })

    let baselineSnapshot
    let snapshot
    for (let index = 0; index < 12; index += 1) {
      baselineSnapshot = baseline.update(1 / 60, { throttle: true })
      snapshot = controller.update(1 / 60, { throttle: true })
    }

    for (const wheelState of snapshot.wheelStates) {
      assert.ok(Number.isFinite(wheelState.angularVelocityRadiansPerSecond))
      assert.ok(Number.isFinite(wheelState.longitudinalSlipRatio))
      assert.ok(Number.isFinite(wheelState.netTorqueNewtonMeters))
    }

    // Fallback reproduces the default (0.1) behavior rather than NaN.
    assert.deepEqual(
      snapshot.wheelStates.map((wheel) => wheel.longitudinalSlipRatio),
      baselineSnapshot.wheelStates.map((wheel) => wheel.longitudinalSlipRatio)
    )
  }
})

test('invalid rolling-correction time and traction-limit epsilon keep the sim finite', () => {
  const invalidSpecs = [
    { rollingConstraintCorrectionTimeSeconds: NaN },
    { rollingConstraintCorrectionTimeSeconds: -2 },
    { tractionLimitEpsilonNewtons: NaN },
    { tractionLimitEpsilonNewtons: -0.5 },
    { tractionLimitEpsilonNewtons: Infinity },
  ]

  for (const spec of invalidSpecs) {
    const controller = createVehicleController({ vehicle: createCar(), spec })
    const snapshot = runSteps(controller, 12)
    assert.ok(Number.isFinite(snapshot.speedMetersPerSecond))
    for (const wheelState of snapshot.wheelStates) {
      assert.ok(Number.isFinite(wheelState.angularVelocityRadiansPerSecond))
      assert.ok(Number.isFinite(wheelState.netTorqueNewtonMeters))
      assert.ok(Number.isFinite(wheelState.longitudinalSlipRatio))
    }
  }
})

test('both trace stages record the five new per-wheel fields as finite numbers', () => {
  const controller = createVehicleController({ vehicle: createCar() })
  runSteps(controller, 6)

  const trace = controller.getSnapshot().vehicleDynamicsStepTrace

  for (const stageName of STAGE_NAMES) {
    const stage = trace.stages[stageName]
    assert.ok(stage.hasSample)
    assert.equal(stage.wheels.length, controller.getSnapshot().wheelStates.length)
    for (const wheelTrace of stage.wheels) {
      for (const field of NEW_TRACE_FIELDS) {
        assert.ok(field in wheelTrace, `missing ${field} in ${stageName}`)
        assert.equal(
          typeof wheelTrace[field],
          'number',
          `${field} is not a number in ${stageName}`
        )
        assert.ok(
          Number.isFinite(wheelTrace[field]),
          `${field} is not finite in ${stageName}`
        )
      }
    }
  }
})

test('post-integration angular velocity is captured after rear-differential coupling adjusts it', () => {
  const controller = createVehicleController({ vehicle: createCar() })
  controller.setRearDifferentialType('locked')

  // Spin the rear wheels up so there is meaningful angular velocity to couple.
  runSteps(controller, 8)

  // Force an explicit left/right rear asymmetry so locked coupling must perform
  // a nonzero direct angular-velocity adjustment during the next step. Without
  // this, a symmetric launch lets coupling settle to a ~0 delta, so the capture
  // check could pass even if the trace sampled before the coupling writer.
  const rearWheelStatesBeforeStep = controller
    .getSnapshot()
    .wheelStates.filter(
      (wheelState) => wheelState.driven && wheelState.axle === 'rear'
    )
  assert.equal(rearWheelStatesBeforeStep.length, 2)
  const baselineAngularVelocityRadiansPerSecond =
    rearWheelStatesBeforeStep[0].angularVelocityRadiansPerSecond
  rearWheelStatesBeforeStep[0].angularVelocityRadiansPerSecond =
    baselineAngularVelocityRadiansPerSecond + 20
  rearWheelStatesBeforeStep[1].angularVelocityRadiansPerSecond =
    baselineAngularVelocityRadiansPerSecond - 20

  const snapshot = controller.update(1 / 60, { throttle: true })
  const postStage = snapshot.vehicleDynamicsStepTrace.stages.postIntegration

  // The capture equals the authoritative final wheel state for every wheel.
  assert.equal(snapshot.wheelStates.length, postStage.wheels.length)
  for (let index = 0; index < snapshot.wheelStates.length; index += 1) {
    assert.equal(
      postStage.wheels[index].angularVelocityRadiansPerSecond,
      snapshot.wheelStates[index].angularVelocityRadiansPerSecond
    )
  }

  // Coupling actually performed a nonzero angular-velocity adjustment this step.
  assert.equal(snapshot.isRearDifferentialHardSpeedCouplingApplied, true)
  assert.ok(
    Math.abs(
      snapshot.rearDifferentialLeftCouplingAngularImpulseNewtonMeterSeconds
    ) > 0 ||
      Math.abs(
        snapshot.rearDifferentialRightCouplingAngularImpulseNewtonMeterSeconds
      ) > 0
  )

  // Locked coupling drove the two rear wheels to a common speed, so the
  // post-integration capture reflects the coupled value, not the pre-coupling
  // asymmetry that primary integration produced.
  const rearWheelStatesAfterStep = snapshot.wheelStates.filter(
    (wheelState) => wheelState.driven && wheelState.axle === 'rear'
  )
  assert.ok(
    Math.abs(
      rearWheelStatesAfterStep[0].angularVelocityRadiansPerSecond -
        rearWheelStatesAfterStep[1].angularVelocityRadiansPerSecond
    ) < 1e-6
  )
})

test('trace with the five new fields survives a JSON round-trip', () => {
  const controller = createVehicleController({ vehicle: createCar() })
  runSteps(controller, 6)

  const trace = controller.getSnapshot().vehicleDynamicsStepTrace
  const parsed = JSON.parse(JSON.stringify(trace))

  for (const stageName of STAGE_NAMES) {
    const stage = parsed.stages[stageName]
    assert.ok(stage.hasSample)
    for (const wheelTrace of stage.wheels) {
      for (const field of NEW_TRACE_FIELDS) {
        assert.ok(field in wheelTrace, `missing ${field} in ${stageName}`)
        assert.equal(
          typeof wheelTrace[field],
          'number',
          `${field} is not numeric after round-trip`
        )
        assert.ok(Number.isFinite(wheelTrace[field]))
      }
    }
  }

  // Existing trace data remains available after serialization.
  assert.ok('normalForceSummary' in parsed.stages.integrationInput)
  assert.ok('longitudinalTireForceSummary' in parsed.stages.postIntegration)
  assert.ok('planarForceSummary' in parsed.stages.postIntegration)
})

test('launch-then-brake trace exposes changing angular velocity, slip, speed, and torque', () => {
  const controller = createVehicleController({ vehicle: createCar() })

  controller.update(1 / 60, { throttle: true })
  const firstStage = cloneStage(
    controller.getSnapshot().vehicleDynamicsStepTrace.stages.postIntegration
  )

  runSteps(controller, 10)
  const launchStage = cloneStage(
    controller.getSnapshot().vehicleDynamicsStepTrace.stages.postIntegration
  )

  runSteps(controller, 10, { brake: true })
  const brakeStage = cloneStage(
    controller.getSnapshot().vehicleDynamicsStepTrace.stages.postIntegration
  )

  const firstMaxOmega = maxAbs(firstStage.wheels.map((w) => w.angularVelocityRadiansPerSecond))
  const launchMaxOmega = maxAbs(launchStage.wheels.map((w) => w.angularVelocityRadiansPerSecond))
  assert.ok(launchMaxOmega > firstMaxOmega)

  for (const stage of [firstStage, launchStage, brakeStage]) {
    for (const wheelTrace of stage.wheels) {
      assert.ok(Number.isFinite(wheelTrace.longitudinalSlipRatio))
      assert.ok(Number.isFinite(wheelTrace.longitudinalGroundSpeedMetersPerSecond))
      assert.ok(Number.isFinite(wheelTrace.wheelSurfaceSpeedMetersPerSecond))
      assert.ok(Number.isFinite(wheelTrace.netTorqueNewtonMeters))
    }
  }

  // Speed context is present during the launch.
  const launchMaxGround = maxAbs(
    launchStage.wheels.map((w) => w.longitudinalGroundSpeedMetersPerSecond)
  )
  assert.ok(launchMaxGround > 0)
})
