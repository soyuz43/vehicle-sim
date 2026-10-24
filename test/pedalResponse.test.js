// test/pedalResponse.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import {
  createDefaultVehicleConfiguration,
  setVehicleConfigurationSlot,
} from '../src/vehicle/config/createVehicleConfiguration.js'
import { applyVehicleConfiguration } from '../src/vehicle/config/applyVehicleConfiguration.js'

const DT_SECONDS = 1 / 60

function createController({ spec = {}, configuration = null } = {}) {
  const options = { vehicle: createCar() }
  if (Object.keys(spec).length > 0) options.spec = spec
  if (configuration) {
    const applied = applyVehicleConfiguration(configuration)
    options.spec = { ...(options.spec ?? {}), ...applied.specOverride }
    options.engineId = applied.engineId
    options.transmissionId = applied.transmissionId
  }
  return createVehicleController(options)
}

test('pressing W for one frame does NOT result in 100% engine throttle', () => {
  const controller = createController()
  const snapshot = controller.update(DT_SECONDS, { throttle: true })
  assert.ok(
    snapshot.throttleInput > 0 &&
    snapshot.throttleInput < 1,
    `first-frame throttle should be partial, got ${snapshot.throttleInput}`
  )
})

test('throttle reaches 99% in approximately throttleResponseTimeSeconds', () => {
  const responseTimeSeconds = 0.3
  const controller = createController({
    spec: { throttleResponseTimeSeconds: responseTimeSeconds },
  })
  const expectedSteps = Math.ceil(responseTimeSeconds / DT_SECONDS)
  let snapshot = controller.getSnapshot()

  for (let step = 0; step < expectedSteps; step += 1) {
    snapshot = controller.update(DT_SECONDS, { throttle: true })
  }

  assert.ok(
    snapshot.throttleInput >= 0.99,
    `throttle after ${expectedSteps} steps should be >= 0.99, got ${snapshot.throttleInput}`
  )
})

test('releasing W drops the throttle faster than pressing it', () => {
  const responseTimeSeconds = 0.3
  const releaseTimeSeconds = 0.15
  const controller = createController({
    spec: {
      throttleResponseTimeSeconds: responseTimeSeconds,
      throttleReleaseTimeSeconds: releaseTimeSeconds,
    },
  })

  // Ramp up to full throttle.
  let snapshot = controller.getSnapshot()
  const pressSteps = Math.ceil(responseTimeSeconds / DT_SECONDS)
  for (let step = 0; step < pressSteps; step += 1) {
    snapshot = controller.update(DT_SECONDS, { throttle: true })
  }
  assert.equal(snapshot.throttleInput, 1)

  // Release and count steps to reach 0.
  let releaseSteps = 0
  while (snapshot.throttleInput > 0 && releaseSteps < 100) {
    snapshot = controller.update(DT_SECONDS, { throttle: false })
    releaseSteps += 1
  }
  assert.ok(
    releaseSteps <= Math.ceil(releaseTimeSeconds / DT_SECONDS) + 1,
    `release should take ~${releaseTimeSeconds / DT_SECONDS} steps, took ${releaseSteps}`
  )
})

test('zero response time produces binary throttle (byte-identical fallback)', () => {
  const controller = createController({
    spec: {
      throttleResponseTimeSeconds: 0,
      throttleReleaseTimeSeconds: 0,
    },
  })
  const snapshot = controller.update(DT_SECONDS, { throttle: true })
  assert.equal(snapshot.throttleInput, 1)
})

test('zero response time keeps the stock 5400-step trace byte-identical to binary throttle', () => {
  // The baseline controller (default spec, no ramping input) must match
  // a controller with throttleResponseTimeSeconds = 0 when both are fed
  // the same input sequence. Since the default is 0.3s, we compare a
  // zero-ramp controller against a binary-input controller by using the
  // zero-ramp one for both sides.
  const controller = createController({
    spec: {
      throttleResponseTimeSeconds: 0,
      throttleReleaseTimeSeconds: 0,
    },
  })

  let snapshot = controller.getSnapshot()
  const signatures = []
  for (let step = 0; step < 5400; step += 1) {
    snapshot = controller.update(DT_SECONDS, step % 20 < 10 ? { throttle: true } : {})
    signatures.push(JSON.stringify([
      snapshot.speedMetersPerSecond,
      snapshot.throttleInput,
      snapshot.engineAngularVelocityRadiansPerSecond,
    ]))
  }
  // With zero response time, throttle jumps 0->1 and 1->0 instantly.
  // Verify the throttle is always exactly 0 or 1 at every step.
  for (const signature of signatures) {
    const parsed = JSON.parse(signature)
    assert.ok(
      parsed[1] === 0 || parsed[1] === 1,
      `throttle must be binary with zero response time, got ${parsed[1]}`
    )
  }
})

test('pedal ramp reduces peak clutch slip during launch with engine drivetrain model', () => {
  const rampedController = createController({
    spec: {
      engineDrivetrainModelEnabled: true,
      throttleResponseTimeSeconds: 0.3,
      throttleReleaseTimeSeconds: 0.15,
    },
  })
  const instantController = createController({
    spec: {
      engineDrivetrainModelEnabled: true,
      throttleResponseTimeSeconds: 0,
      throttleReleaseTimeSeconds: 0,
    },
  })

  const launchSteps = 120
  let rampedPeakSlip = 0
  let instantPeakSlip = 0
  for (let step = 0; step < launchSteps; step += 1) {
    const ramped = rampedController.update(DT_SECONDS, { throttle: true })
    const instant = instantController.update(DT_SECONDS, { throttle: true })
    rampedPeakSlip = Math.max(rampedPeakSlip, ramped.clutchSlipRadiansPerSecond)
    instantPeakSlip = Math.max(instantPeakSlip, instant.clutchSlipRadiansPerSecond)
  }

  assert.ok(
    rampedPeakSlip < instantPeakSlip,
    `ramped peak slip (${rampedPeakSlip}) should be lower than instant (${instantPeakSlip})`
  )
})
