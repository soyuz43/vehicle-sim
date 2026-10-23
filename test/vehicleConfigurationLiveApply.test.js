// test/vehicleConfigurationLiveApply.test.js

// Runtime vehicle configuration apply via setVehicleConfiguration().
//
// The Config Panel's Apply button used to warn and do nothing. This session
// adds the controller-side API that makes the apply real: the seven catalog
// slots are swapped in place on the running controller, the vehicle keeps its
// pose, velocity, gear, and tire pressures, and the chassis slot re-derives
// the mass properties and drops the stale vertical dynamics state.
//
// The snapshot exposes live state objects (the position vector, the wheel
// states, the chassis mass properties, the vertical dynamics state), so the
// assertions copy the values they compare BEFORE the apply. Comparing the
// snapshot objects themselves would compare the state after the apply with
// itself.

import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { applyConfigurationToController } from '../src/vehicle/config/applyVehicleConfigurationToController.js'
import { createDefaultVehicleConfiguration } from '../src/vehicle/config/createVehicleConfiguration.js'

const DT_SECONDS = 1 / 60

function createController() {
  const car = createCar()
  const controller = createVehicleController({
    vehicle: car,
    startPosition: new THREE.Vector3(0, 0, 0),
  })

  return { car, controller }
}

function drive(controller, steps, input = { throttle: true }) {
  let snapshot
  for (let step = 0; step < steps; step += 1) {
    snapshot = controller.update(DT_SECONDS, input)
  }
  return snapshot
}

function configurationWith(slotOverrides = {}) {
  return {
    version: 1,
    slots: {
      ...createDefaultVehicleConfiguration().slots,
      ...slotOverrides,
    },
  }
}

function countNodes(node) {
  let count = 0
  for (const child of node?.children ?? []) {
    count += 1 + countNodes(child)
  }
  return count
}

function captureMotion(snapshot) {
  return {
    positionX: snapshot.position.x,
    positionY: snapshot.position.y,
    positionZ: snapshot.position.z,
    velocityX: snapshot.worldVelocityMetersPerSecond.x,
    velocityY: snapshot.worldVelocityMetersPerSecond.y,
    velocityZ: snapshot.worldVelocityMetersPerSecond.z,
    yawRadians: snapshot.yawRadians,
    gear: snapshot.gear,
    tirePressureKpa: snapshot.tirePressureKpa,
  }
}

test('the controller derives the active catalog configuration from the running state', () => {
  const { controller } = createController()

  const active = controller.getVehicleConfiguration()

  assert.deepEqual(
    active.slots,
    createDefaultVehicleConfiguration().slots,
    'a fresh controller runs the default catalog configuration'
  )
})

test('a configuration apply reports one change to the configuration listeners', () => {
  const { controller } = createController()
  const reported = []
  const unsubscribe = controller.onConfigurationChanged((active) => reported.push(active))

  controller.setVehicleConfiguration(configurationWith({ chassis: 'chassis-suv' }))

  assert.equal(reported.length, 1, 'the apply reports exactly one change')
  assert.equal(reported[0].slots.chassis, 'chassis-suv')

  unsubscribe()
  controller.setVehicleConfiguration(configurationWith({ chassis: 'chassis-hatchback' }))

  assert.equal(reported.length, 1, 'an unsubscribed listener stops hearing about changes')
})

test('a console suspension swap is reported to the configuration listeners', () => {
  const { controller } = createController()
  const reported = []
  controller.onConfigurationChanged((active) => reported.push(active))

  controller.setSuspension('rear', 'susp-solid-axle')

  assert.equal(reported.length, 1, 'the swap reports one change')
  assert.equal(reported[0].slots.suspensionRear, 'susp-solid-axle')
  assert.equal(
    reported[0].slots.chassis,
    'chassis-hatchback',
    'the slots the swap did not touch keep their component'
  )
})

test('a drivetrain state that matches no catalog component is reported as no component', () => {
  const { controller } = createController()

  controller.setTransmission('manual-6')

  const active = controller.getVehicleConfiguration()

  assert.equal(
    active.slots.drivetrain,
    null,
    'a manual gearbox on the stock inline-4 is not a catalog component'
  )
  assert.equal(active.slots.chassis, 'chassis-hatchback')
})

test('the controller exposes a runtime vehicle configuration apply', () => {
  const { controller } = createController()

  assert.equal(typeof controller.setVehicleConfiguration, 'function')
})

test('setVehicleConfiguration applies all seven catalog slots to the running spec', () => {
  const { controller } = createController()

  controller.setVehicleConfiguration(
    configurationWith({
      chassis: 'chassis-suv',
      suspensionRear: 'susp-solid-axle',
      wheels: 'tires-slicks',
      drivetrain: 'drivetrain-sport',
      brakes: 'brakes-sport',
      aero: 'aero-downforce',
    })
  )

  const snapshot = controller.getSnapshot()

  // Chassis slot.
  assert.equal(snapshot.spec.massKg, 1950)
  assert.equal(snapshot.spec.centerOfMassHeightMeters, 0.72)
  assert.equal(snapshot.spec.yawMomentOfInertiaKgMeterSquared, 3800)

  // Suspension slot.
  assert.equal(snapshot.spec.rearAxleCoupling, 'rigidAxle')
  assert.equal(snapshot.axleCoupling.axles.rear.couplingMode, 'rigidAxle')

  // Wheels slot.
  assert.equal(snapshot.spec.lateralTireStiffnessNewtonsPerRadian, 9000)
  assert.equal(snapshot.spec.rollingResistanceCoefficient, 0.012)

  // Drivetrain slot.
  assert.equal(snapshot.engineProfile.engineId, 'v8')
  assert.equal(snapshot.transmissionProfile.transmissionId, 'manual-6')
  assert.equal(snapshot.rearDifferentialType, 'limited-slip')

  // Brakes slot.
  assert.equal(snapshot.spec.maxServiceBrakeTorqueNewtonMeters, 1600)
  assert.equal(snapshot.spec.maxBrakeForceNewtons, 16000)

  // Aero slot.
  assert.equal(snapshot.spec.dragCoefficient, 0.34)
  assert.equal(snapshot.spec.frontalAreaSquareMeters, 2.3)
  assert.equal(snapshot.spec.aeroDownforceEnabled, true)
  assert.equal(snapshot.spec.aeroDownforceCoefficientNewtonsPerMeterSquared, 12)
})

test('a configuration apply preserves the pose, velocity, gear, and tire pressure', () => {
  const { controller } = createController()
  drive(controller, 120)

  const before = captureMotion(controller.getSnapshot())
  const beforeMassKg = controller.getSnapshot().chassisMassProperties.massKg

  controller.setVehicleConfiguration(
    configurationWith({
      chassis: 'chassis-suv',
      drivetrain: 'drivetrain-sport',
      wheels: 'tires-slicks',
    })
  )

  const after = captureMotion(controller.getSnapshot())

  assert.equal(after.positionX, before.positionX)
  assert.equal(after.positionY, before.positionY)
  assert.equal(after.positionZ, before.positionZ)
  assert.equal(after.velocityX, before.velocityX)
  assert.equal(after.velocityY, before.velocityY)
  assert.equal(after.velocityZ, before.velocityZ)
  assert.equal(after.yawRadians, before.yawRadians)
  assert.equal(after.gear, before.gear)
  assert.equal(after.tirePressureKpa, before.tirePressureKpa)
  assert.notEqual(
    controller.getSnapshot().chassisMassProperties.massKg,
    beforeMassKg,
    'the applied chassis really changed the mass'
  )
})

test('a chassis change re-derives the mass properties and drops the vertical dynamics state', () => {
  const { controller } = createController()
  drive(controller, 120)

  const before = controller.getSnapshot()
  assert.equal(before.chassisMassProperties.massKg, 1400)

  // The vertical dynamics state is a live object on the snapshot, so it can
  // be seeded directly: a settled car has no heave or pitch rate to observe.
  const verticalState = before.verticalDynamics
  verticalState.heaveMeters = 0.04
  verticalState.heaveVelocityMetersPerSecond = 1.2
  verticalState.pitchRadians = 0.05
  verticalState.pitchRateRadiansPerSecond = 0.3
  verticalState.rollRadians = 0.06
  verticalState.rollRateRadiansPerSecond = -0.4

  controller.setVehicleConfiguration(configurationWith({ chassis: 'chassis-suv' }))

  const snapshot = controller.getSnapshot()

  assert.equal(snapshot.chassisMassProperties.massKg, 1950)
  assert.equal(
    snapshot.chassisMassProperties.yawMomentOfInertiaKgMeterSquared,
    3800
  )
  assert.equal(snapshot.verticalDynamics.heaveMeters, 0)
  assert.equal(snapshot.verticalDynamics.heaveVelocityMetersPerSecond, 0)
  assert.equal(snapshot.verticalDynamics.pitchRadians, 0)
  assert.equal(snapshot.verticalDynamics.pitchRateRadiansPerSecond, 0)
  assert.equal(snapshot.verticalDynamics.rollRadians, 0)
  assert.equal(snapshot.verticalDynamics.rollRateRadiansPerSecond, 0)
})

test('a wheels change writes the new wheel inertia into every wheel state', () => {
  const { controller } = createController()
  drive(controller, 60)

  controller.setVehicleConfiguration(configurationWith({ wheels: 'tires-slicks' }))

  const snapshot = controller.getSnapshot()

  assert.equal(snapshot.wheelStates.length, 4)
  for (const wheelState of snapshot.wheelStates) {
    assert.equal(wheelState.wheelInertiaKgMeterSquared, 1.1, wheelState.id)
  }
})

test('a drivetrain change updates the engine, the transmission, and the differential', () => {
  const { controller } = createController()

  const before = controller.getSnapshot()
  assert.equal(before.engineProfile.engineId, 'inline-4')
  assert.equal(before.transmissionProfile.transmissionId, 'automatic-6')
  assert.equal(before.rearDifferentialType, 'open')

  controller.setVehicleConfiguration(
    configurationWith({ drivetrain: 'drivetrain-rally' })
  )

  const after = controller.getSnapshot()
  assert.equal(after.engineProfile.engineId, 'v6')
  assert.equal(after.transmissionProfile.transmissionId, 'manual-6')
  assert.equal(after.rearDifferentialType, 'locked')
  assert.equal(after.spec.rearDifferentialType, 'locked')
})

test('a suspension change through the configuration API reuses the suspension swap semantics', () => {
  const { car, controller } = createController()
  drive(controller, 60)

  controller.setVehicleConfiguration(
    configurationWith({ suspensionRear: 'susp-solid-axle' })
  )
  const coupled = controller.update(DT_SECONDS, { throttle: true })

  assert.equal(coupled.axleCoupling.axles.rear.isCoupled, true)
  assert.equal(coupled.axleCoupling.axles.rear.couplingMode, 'rigidAxle')
  assert.equal(coupled.axleCoupling.axles.front.isCoupled, false)
  assert.ok(car.getObjectByName('rear-axle-beam-visual'))

  // Swapping back through the configuration API restores the independent axle.
  controller.setVehicleConfiguration(configurationWith({ suspensionRear: 'susp-stock' }))
  const independent = controller.update(DT_SECONDS, { throttle: true })

  assert.equal(independent.axleCoupling.axles.rear.isCoupled, false)
  assert.equal(independent.axleCoupling.axles.rear.couplingMode, 'independent')
  assert.equal(independent.spec.rearAxleCoupling, 'independent')
  assert.equal(
    car.getObjectByName('rear-axle-beam-visual').visible,
    false,
    'the beam must be hidden again when the axle is independent'
  )
})

test('a suspension change through the configuration API drops the damper sample', () => {
  const { controller } = createController()
  drive(controller, 120)

  // The lowered profile has a different rest length, so the suspension
  // compression changes at the swap.
  controller.setVehicleConfiguration(configurationWith({ suspensionFront: 'susp-lowered' }))
  const snapshot = controller.update(DT_SECONDS, { throttle: true })

  for (const wheelState of snapshot.wheelStates) {
    assert.equal(
      wheelState.suspensionCompressionVelocityMetersPerSecond,
      0,
      wheelState.id + ' must not report a compression velocity on the first step after a swap'
    )
  }
})

test('setVehicleConfiguration rejects an invalid configuration', () => {
  const { controller } = createController()

  assert.throws(
    () =>
      controller.setVehicleConfiguration({
        version: 1,
        slots: { chassis: 'not-a-chassis' },
      }),
    /invalid vehicle configuration/
  )
  assert.throws(
    () => controller.setVehicleConfiguration(null),
    /invalid vehicle configuration/
  )
})

test('a slot component that does not declare a field restores the default value', () => {
  const { controller } = createController()

  controller.setVehicleConfiguration(configurationWith({ aero: 'aero-downforce' }))
  assert.equal(
    controller.getSnapshot().spec.aeroDownforceCoefficientNewtonsPerMeterSquared,
    12
  )

  controller.setVehicleConfiguration(configurationWith({ aero: 'aero-stock' }))
  assert.equal(
    controller.getSnapshot().spec.aeroDownforceCoefficientNewtonsPerMeterSquared,
    3,
    'the stock aero component does not declare a downforce coefficient'
  )
})

test('applying the same configuration twice is idempotent', () => {
  const { controller } = createController()
  drive(controller, 60)

  const configuration = configurationWith({
    chassis: 'chassis-suv',
    wheels: 'tires-slicks',
  })

  controller.setVehicleConfiguration(configuration)
  const first = controller.getSnapshot()
  const firstMassKg = first.chassisMassProperties.massKg
  const firstYawInertia = first.chassisMassProperties.yawMomentOfInertiaKgMeterSquared
  const firstGear = first.gear

  // The vertical dynamics state is only dropped when the chassis really
  // changes, so a repeated apply must not disturb the body again.
  first.verticalDynamics.heaveVelocityMetersPerSecond = 0.75

  controller.setVehicleConfiguration(configuration)
  const second = controller.getSnapshot()

  assert.equal(second.chassisMassProperties.massKg, firstMassKg)
  assert.equal(
    second.chassisMassProperties.yawMomentOfInertiaKgMeterSquared,
    firstYawInertia
  )
  assert.equal(second.gear, firstGear)
  assert.equal(
    second.verticalDynamics.heaveVelocityMetersPerSecond,
    0.75,
    'a repeated apply must not drop the vertical dynamics state again'
  )
  for (const wheelState of second.wheelStates) {
    assert.equal(wheelState.wheelInertiaKgMeterSquared, 1.1, wheelState.id)
  }
})


test('a chassis change with an airborne car drops the vertical dynamics state before the next step', () => {
  const { car, controller } = createController()
  drive(controller, 120)

  // Lift the car clear of the ground so the body is unsupported.
  car.position.y += 2
  const airborne = controller.update(DT_SECONDS, { throttle: true })

  // The model holds the last heave value while the body is unsupported, so
  // the rate has to be seeded to make the zeroing observable.
  airborne.verticalDynamics.heaveVelocityMetersPerSecond = 1.5
  airborne.verticalDynamics.pitchRateRadiansPerSecond = 0.4
  airborne.verticalDynamics.rollRateRadiansPerSecond = -0.3

  controller.setVehicleConfiguration(configurationWith({ chassis: 'chassis-suv' }))

  const snapshot = controller.getSnapshot()

  assert.equal(snapshot.chassisMassProperties.massKg, 1950)
  assert.equal(snapshot.verticalDynamics.heaveVelocityMetersPerSecond, 0)
  assert.equal(snapshot.verticalDynamics.pitchRateRadiansPerSecond, 0)
  assert.equal(snapshot.verticalDynamics.rollRateRadiansPerSecond, 0)
})

test('repeated configuration applies do not leak visual geometry', () => {
  const { car, controller } = createController()
  drive(controller, 30)

  controller.setVehicleConfiguration(
    configurationWith({ suspensionRear: 'susp-solid-axle' })
  )
  controller.update(DT_SECONDS, { throttle: true })
  controller.setVehicleConfiguration(configurationWith({ suspensionRear: 'susp-stock' }))
  controller.update(DT_SECONDS, { throttle: true })

  const nodeCountAfterFirstSwap = countNodes(car)

  for (let index = 0; index < 10; index += 1) {
    controller.setVehicleConfiguration(
      configurationWith({ suspensionRear: 'susp-solid-axle' })
    )
    controller.update(DT_SECONDS, { throttle: true })
    controller.setVehicleConfiguration(configurationWith({ suspensionRear: 'susp-stock' }))
    controller.update(DT_SECONDS, { throttle: true })
  }

  assert.equal(
    countNodes(car),
    nodeCountAfterFirstSwap,
    'repeated applies must not add nodes to the vehicle'
  )
})

test('a failed apply reports the error and leaves the controller untouched', () => {
  const { controller } = createController()
  drive(controller, 60)

  const beforeMassKg = controller.getSnapshot().chassisMassProperties.massKg
  let applied = null
  let reported = null

  const outcome = applyConfigurationToController({
    vehicleController: controller,
    vehicleConfig: {
      version: 1,
      slots: { chassis: 'not-a-chassis' },
    },
    onApplied: (result) => {
      applied = result
    },
    onError: (error) => {
      reported = error
    },
  })

  assert.equal(outcome.applied, false)
  assert.equal(applied, null)
  assert.ok(reported instanceof Error)
  assert.match(reported.message, /invalid vehicle configuration/)
  assert.equal(
    controller.getSnapshot().chassisMassProperties.massKg,
    beforeMassKg,
    'a failed apply must not change the controller'
  )
})

test('a successful apply reports the applied configuration', () => {
  const { controller } = createController()
  const configuration = configurationWith({ chassis: 'chassis-suv' })
  let applied = null

  const outcome = applyConfigurationToController({
    vehicleController: controller,
    vehicleConfig: configuration,
    onApplied: (result) => {
      applied = result
    },
  })

  assert.equal(outcome.applied, true)
  assert.equal(outcome.error, null)
  assert.equal(applied.configuration.slots.chassis, 'chassis-suv')
  assert.equal(applied.components.chassis.id, 'chassis-suv')
})
