// test/vehicleControllerLegacyDriveForceCompatibility.test.js
//
// Compatibility coverage for the legacy fixed-force drive path, exercised only
// when spec.powertrainDriveTorqueEnabled is false. This isolates the old launch
// behavior (a single fixed force source) so the active profile-derived source
// can be rebaselined without losing the A/B reference.

import assert from "node:assert/strict"
import test from "node:test"

import { createCar } from "../src/car/createCar.js"
import { createVehicleController } from "../src/vehicle/createVehicleController.js"

const DT_SECONDS = 1 / 60

function legacyController() {
  return createVehicleController({
    vehicle: createCar(),
    spec: { powertrainDriveTorqueEnabled: false },
  })
}

function launch(controller, steps, gear = "drive") {
  controller.setGear(gear)
  let snapshot = controller.getSnapshot()
  let peakRearOmega = 0
  for (let index = 0; index < steps; index += 1) {
    snapshot = controller.update(DT_SECONDS, { throttle: true })
    for (const wheel of snapshot.wheelStates.filter((w) => w.axle === "rear")) {
      peakRearOmega = Math.max(peakRearOmega, Math.abs(wheel.angularVelocityRadiansPerSecond))
    }
  }
  return { snapshot, peakRearOmega }
}

function rollingRadiusMeters(wheelState) {
  const effective = wheelState.effectiveTireRollingRadiusMeters
  if (Number.isFinite(effective) && effective > 0) return effective
  return wheelState.radius
}

test("legacy flag disables the active torque source and uses the fixed-force path", () => {
  const controller = legacyController()
  const { snapshot } = launch(controller, 8)

  assert.equal(snapshot.powertrainDriveTorqueEnabled, false)
  assert.equal(snapshot.powertrainDriveTorque.enabled, false)
  assert.equal(snapshot.totalAxleDriveTorqueNewtonMeters, 0)
  assert.equal(snapshot.powertrainDriveTorque.totalAxleOutputTorqueNewtonMeters, 0)

  // Legacy force split is the live source; the active torque split stays idle.
  assert.ok(snapshot.rearDifferentialLeftOutputDriveForceNewtons > 0)
  assert.equal(snapshot.rearDifferentialLeftOutputDriveTorqueNewtonMeters, 0)
  assert.equal(snapshot.rearDifferentialRightOutputDriveTorqueNewtonMeters, 0)
})

test("legacy launch reproduces the old high wheel angular velocity", () => {
  const controller = legacyController()
  const { snapshot, peakRearOmega } = launch(controller, 180)

  assert.ok(snapshot.speedMetersPerSecond > 0)
  // Old fixed-force launch peaked near 908 rad/s. Materially above the active
  // profile-derived baseline (which stays below 200).
  assert.ok(peakRearOmega > 500, `legacy peak rear omega ${peakRearOmega}`)
  assert.ok(peakRearOmega < 1000, `legacy peak rear omega ${peakRearOmega}`)
})

test("legacy drive torque is derived from the fixed force via torque = force * radius", () => {
  const controller = legacyController()
  const { snapshot } = launch(controller, 8)

  for (const wheel of snapshot.wheelStates.filter((w) => w.axle === "rear")) {
    const expectedTorque = wheel.requestedDriveForceNewtons * rollingRadiusMeters(wheel)
    assert.ok(Math.abs(wheel.driveTorqueNewtonMeters - expectedTorque) < 1e-6)
    assert.equal(wheel.driveTorqueNewtonMeters, wheel.requestedDriveTorqueNewtonMeters)
  }
})

test("legacy reverse preserves rear-wheel sign and moves the chassis backward", () => {
  const controller = legacyController()
  const { snapshot } = launch(controller, 8, "reverse")

  assert.ok(snapshot.totalAxleDriveTorqueNewtonMeters === 0)
  for (const wheel of snapshot.wheelStates.filter((w) => w.axle === "rear")) {
    assert.ok(wheel.driveTorqueNewtonMeters < 0)
  }
  assert.ok(snapshot.signedForwardSpeedMetersPerSecond < 0)
  assert.ok(snapshot.position.z < 0)
})
