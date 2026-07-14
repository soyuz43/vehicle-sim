// test/vehicleControllerActiveDriveTorque.test.js
//
// Controller integration coverage for the active powertrain drive-torque source
// v1 (spec.powertrainDriveTorqueEnabled === true, the default). These tests
// confirm the new torque path drives the wheels end-to-end: curve -> axle
// torque -> rear-differential split -> per-wheel torque -> wheel integrator.

import assert from "node:assert/strict"
import test from "node:test"

import { createCar } from "../src/car/createCar.js"
import { createVehicleController } from "../src/vehicle/createVehicleController.js"

const DT_SECONDS = 1 / 60

function launch(controller, steps, gear = "drive") {
  controller.setGear(gear)
  let snapshot = controller.getSnapshot()
  let peakRearOmega = 0
  let sawRedlineLimit = false
  let minRedlineMultiplier = 1
  for (let index = 0; index < steps; index += 1) {
    snapshot = controller.update(DT_SECONDS, { throttle: true })
    const rearWheels = snapshot.wheelStates.filter((w) => w.axle === "rear")
    for (const wheel of rearWheels) {
      peakRearOmega = Math.max(peakRearOmega, Math.abs(wheel.angularVelocityRadiansPerSecond))
    }
    const pt = snapshot.powertrainDriveTorque
    if (pt) {
      if (pt.isRedlineTorqueLimited) sawRedlineLimit = true
      minRedlineMultiplier = Math.min(minRedlineMultiplier, pt.redlineTorqueMultiplier01)
    }
  }
  return { snapshot, peakRearOmega, sawRedlineLimit, minRedlineMultiplier }
}

function rollingRadiusMeters(wheelState) {
  const effective = wheelState.effectiveTireRollingRadiusMeters
  if (Number.isFinite(effective) && effective > 0) return effective
  return wheelState.radius
}

function rearWheels(snapshot) {
  return snapshot.wheelStates.filter((w) => w.axle === "rear")
}

test("active launch moves the chassis forward under throttle", () => {
  const controller = createVehicleController({ vehicle: createCar() })
  const { snapshot } = launch(controller, 8)

  assert.equal(snapshot.powertrainDriveTorqueEnabled, true)
  assert.ok(snapshot.speedMetersPerSecond > 0)
  assert.ok(snapshot.position.z > 0)
})

test("rear-wheel drive torque is profile-derived from the active axle source", () => {
  const controller = createVehicleController({ vehicle: createCar() })
  const { snapshot } = launch(controller, 8)

  // The active powertrain source owns the REQUESTED (uncapped profile)
  // torque; the controller owns the APPLIED (post-cap) axle torque. They
  // are equal while the predictive redline limiter is inactive, and the
  // applied magnitude can never exceed the requested magnitude.
  const totalAxle = snapshot.totalAxleDriveTorqueNewtonMeters
  const requestedAxle = snapshot.powertrainDriveTorque.requestedAxleDriveTorqueNewtonMeters
  const requestedLegacy = snapshot.powertrainDriveTorque.totalAxleOutputTorqueNewtonMeters
  assert.ok(Number.isFinite(totalAxle))
  assert.ok(Number.isFinite(requestedAxle))
  assert.ok(totalAxle > 0)
  assert.ok(requestedAxle > 0)
  assert.ok(Math.abs(requestedAxle - requestedLegacy) < 1e-9)
  assert.ok(Math.abs(totalAxle) <= requestedAxle + 1e-9)

  const rear = rearWheels(snapshot)
  assert.equal(rear.length, 2)
  for (const wheel of rear) {
    assert.ok(Math.abs(wheel.driveTorqueNewtonMeters - totalAxle / 2) < 1e-6)
  }
})

test("active and legacy drive sources are not blended", () => {
  const controller = createVehicleController({ vehicle: createCar() })
  const { snapshot } = launch(controller, 8)

  // Active torque split is the only positive source: legacy force-split outputs
  // stay zero while the torque-split outputs are nonzero.
  assert.ok(snapshot.rearDifferentialLeftOutputDriveTorqueNewtonMeters > 0)
  assert.ok(snapshot.rearDifferentialRightOutputDriveTorqueNewtonMeters > 0)
  assert.equal(snapshot.rearDifferentialLeftOutputDriveForceNewtons, 0)
  assert.equal(snapshot.rearDifferentialRightOutputDriveForceNewtons, 0)
})

test("wheel integrator consumes the requested torque directly and derives force once", () => {
  const controller = createVehicleController({ vehicle: createCar() })
  const { snapshot } = launch(controller, 8)

  for (const wheel of rearWheels(snapshot)) {
    assert.equal(wheel.driveTorqueNewtonMeters, wheel.requestedDriveTorqueNewtonMeters)
    const radius = rollingRadiusMeters(wheel)
    const expectedForce = wheel.driveTorqueNewtonMeters / radius
    assert.ok(Math.abs(wheel.requestedDriveForceNewtons - expectedForce) < 1e-6)
    assert.ok(Math.abs(wheel.appliedDriveTorqueNewtonMeters - wheel.driveTorqueNewtonMeters) < 1e-9)
  }
})

test("redline taper limits the active torque during a sustained launch", () => {
  const controller = createVehicleController({ vehicle: createCar() })
  const { sawRedlineLimit, minRedlineMultiplier } = launch(controller, 180)

  assert.ok(sawRedlineLimit, "redline torque limiting engaged")
  assert.ok(minRedlineMultiplier < 1, "redline multiplier dropped below 1")
  assert.ok(minRedlineMultiplier >= 0)
})

test("peak rear-wheel angular velocity stays materially below the old fixed-force launch", () => {
  const controller = createVehicleController({ vehicle: createCar() })
  const { peakRearOmega } = launch(controller, 180)

  // Old fixed-force launch peaked near 908 rad/s; the active profile-derived
  // source must stay well below that.
  assert.ok(peakRearOmega < 200, `peak rear omega ${peakRearOmega}`)
})

test("open rear differential yields matched left/right active torque outputs", () => {
  const controller = createVehicleController({ vehicle: createCar() })
  const { snapshot } = launch(controller, 8)

  assert.equal(snapshot.rearDifferentialLeftOutputDriveTorqueNewtonMeters, snapshot.rearDifferentialRightOutputDriveTorqueNewtonMeters)
  const rear = rearWheels(snapshot)
  assert.ok(Math.abs(rear[0].driveTorqueNewtonMeters - rear[1].driveTorqueNewtonMeters) < 1e-9)
})

test("reset clears the active torque state", () => {
  const controller = createVehicleController({ vehicle: createCar() })
  const { snapshot: active } = launch(controller, 8)
  assert.ok(active.totalAxleDriveTorqueNewtonMeters > 0)

  const reset = controller.reset()
  assert.equal(reset.powertrainDriveTorque.totalAxleOutputTorqueNewtonMeters, 0)
  assert.equal(reset.totalAxleDriveTorqueNewtonMeters, 0)
  assert.equal(reset.rearDifferentialLeftOutputDriveTorqueNewtonMeters, 0)
  assert.equal(reset.rearDifferentialRightOutputDriveTorqueNewtonMeters, 0)
})

test("neutral produces no active drive torque", () => {
  const controller = createVehicleController({ vehicle: createCar() })
  const { snapshot } = launch(controller, 8, "neutral")

  assert.equal(snapshot.totalAxleDriveTorqueNewtonMeters, 0)
  for (const wheel of rearWheels(snapshot)) {
    assert.equal(wheel.driveTorqueNewtonMeters, 0)
  }
})

test("reverse produces rear-wheel torque with the correct sign", () => {
  const controller = createVehicleController({ vehicle: createCar() })
  const { snapshot } = launch(controller, 8, "reverse")

  assert.ok(snapshot.totalAxleDriveTorqueNewtonMeters < 0)
  for (const wheel of rearWheels(snapshot)) {
    assert.ok(wheel.driveTorqueNewtonMeters < 0)
  }
  assert.ok(snapshot.signedForwardSpeedMetersPerSecond < 0)
  assert.ok(snapshot.position.z < 0)
})
