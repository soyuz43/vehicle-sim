// test/wheelLockAndAssistIntegration.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { createFlatTerrainContactQuery } from '../src/terrain/createFlatTerrainContactQuery.js'

const DT = 1 / 60

function makeController(specOverrides = {}, frictionCoefficient = 1.0) {
  return createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createFlatTerrainContactQuery({ frictionCoefficient }),
    spec: specOverrides,
  })
}

function run(controller, steps, input) {
  let everLocked = false
  let everAbsActive = false
  let everTcActive = false
  let lockedSteps = 0
  let maxEscDelta = 0
  let maxRearOmega = 0
  for (let i = 0; i < steps; i += 1) {
    const snap = controller.update(DT, input)
    let stepLocked = false
    for (const w of snap.wheelStates) {
      if (w.isWheelLocked) {
        everLocked = true
        stepLocked = true
      }
      if (w.advancedAbsActive) everAbsActive = true
      if (w.tractionControlActive) everTcActive = true
      if (w.axle === 'rear') {
        maxRearOmega = Math.max(maxRearOmega, Math.abs(w.angularVelocityRadiansPerSecond))
      }
      maxEscDelta = Math.max(maxEscDelta, Math.abs(w.escBrakeTorqueDeltaNewtonMeters ?? 0))
    }
    if (stepLocked) lockedSteps += 1
  }
  return { everLocked, everAbsActive, everTcActive, lockedSteps, maxEscDelta, maxRearOmega }
}

test('wheel-lock occurs under heavy braking when lock physics is enabled (ABS off)', () => {
  const controller = makeController(
    {
      wheelLockModelEnabled: true,
      serviceBrakeAbsEnabled: false,
      advancedAbsEnabled: false,
      wheelLockSpeedThresholdMetersPerSecond: 0.1,
      maxServiceBrakeTorqueNewtonMeters: 900,
      advancedAbsMinGroundSpeedMetersPerSecond: 0.5,
    },
    0.2
  )
  run(controller, 150, { throttle: true })
  const { everLocked, lockedSteps } = run(controller, 80, { brake: true })
  assert.ok(everLocked, 'expected at least one wheel to lock under heavy braking')
  assert.ok(lockedSteps > 30, `expected sustained lock, got ${lockedSteps}/80 locked steps`)
})

test('advanced ABS prevents sustained wheel lock under the same braking', () => {
  const controller = makeController(
    {
      wheelLockModelEnabled: true,
      advancedAbsEnabled: true,
      serviceBrakeAbsEnabled: false,
      wheelLockSpeedThresholdMetersPerSecond: 0.1,
      maxServiceBrakeTorqueNewtonMeters: 900,
      advancedAbsMinGroundSpeedMetersPerSecond: 0.5,
    },
    0.2
  )
  run(controller, 150, { throttle: true })
  const { everAbsActive, lockedSteps } = run(controller, 80, { brake: true })
  assert.ok(everAbsActive, 'advanced ABS should activate during hard braking')
  // ABS should limit the wheel to a brief transient lock, not a sustained one.
  assert.ok(lockedSteps <= 15, `ABS should prevent sustained lock, got ${lockedSteps}/80`)
})

test('traction control limits driven-wheel spin on low grip', () => {
  const off = makeController({ tractionControlEnabled: false }, 0.35)
  const on = makeController({ tractionControlEnabled: true }, 0.35)
  const offRun = run(off, 80, { throttle: true })
  const onRun = run(on, 80, { throttle: true })
  assert.ok(onRun.everTcActive, 'traction control should engage on spinning driven wheels')
  assert.ok(onRun.maxRearOmega < offRun.maxRearOmega, 'TC should reduce peak rear spin')
})

test('ESC applies selective brake torque under a yaw error on low grip', () => {
  const controller = makeController({ electronicStabilityControlEnabled: true }, 0.15)
  run(controller, 70, { throttle: true })
  const { maxEscDelta } = run(controller, 60, { throttle: true, left: true })
  assert.ok(
    maxEscDelta > 0,
    'ESC should apply a corrective selective brake torque during the yaw-error maneuver'
  )
})

test('assists cleanly disable via flags (default behavior unaffected)', () => {
  const controller = makeController({}, 1.0)
  const snap = run(controller, 40, { throttle: true, brake: true })
  assert.equal(snap.everLocked, false)
  assert.equal(snap.everTcActive, false)
  assert.equal(snap.maxEscDelta, 0)
})
