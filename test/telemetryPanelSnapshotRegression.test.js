import assert from 'node:assert/strict'
import test from 'node:test'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'

function buildTelemetrySnapshot(vehicleSnapshot) {
  return {
    vehicleSnapshot,
    forces: vehicleSnapshot.forces,
    powertrain: vehicleSnapshot.powertrain,
    powertrainKinematics: vehicleSnapshot.powertrainKinematics,
    rearDifferentialState: vehicleSnapshot.rearDifferentialState,
    wheelStates: vehicleSnapshot.wheelStates,
    loadTransferSummary: vehicleSnapshot.loadTransferSummary,
    chassisAttitude: vehicleSnapshot.chassisAttitude,
  }
}

test('telemetry snapshot carries defined live controller signals after one step', () => {
  const controller = createVehicleController({
    vehicle: createCar(),
    initialGear: 'drive',
    spec: { verticalDynamicsEnabled: true },
  })
  const vehicleSnapshot = controller.update(1 / 60, { throttle: true })
  const telemetrySnapshot = buildTelemetrySnapshot(vehicleSnapshot)

  for (const [field, value] of Object.entries(telemetrySnapshot)) {
    assert.notEqual(value, undefined, `${field} must be present in telemetry snapshot`)
  }

  const consumedFields = [
    ['speedMetersPerSecond', vehicleSnapshot.speedMetersPerSecond],
    ['localForwardVelocityMetersPerSecond', vehicleSnapshot.localForwardVelocityMetersPerSecond],
    ['yawRateRadiansPerSecond', vehicleSnapshot.yawRateRadiansPerSecond],
    ['massKilograms', vehicleSnapshot.chassisMassProperties.massKilograms],
    ['gear', vehicleSnapshot.gear],
    ['throttleInput', vehicleSnapshot.throttleInput],
    ['brakeInput', vehicleSnapshot.brakeInput],
    ['serviceBrakeFrontBias01', vehicleSnapshot.spec.serviceBrakeFrontBias01],
    ['active ABS wheel count', vehicleSnapshot.serviceBrakeAbsSummary.activeWheelCount],
    ['world X force', telemetrySnapshot.forces.netForceWorldXNewtons],
    ['world Z force', telemetrySnapshot.forces.netForceWorldZNewtons],
    ['yaw moment', telemetrySnapshot.forces.yawMomentNewtonMeters],
    ['drag force', telemetrySnapshot.forces.aerodynamicDragForceNewtons],
    ['engine RPM', telemetrySnapshot.powertrainKinematics.estimatedEngineRpm],
    ['differential type', telemetrySnapshot.rearDifferentialState.rearDifferentialType],
    ['differential left share', telemetrySnapshot.rearDifferentialState.rearDifferentialLeftShare01],
    ['longitudinal load transfer', telemetrySnapshot.loadTransferSummary.totalLongitudinalTransferAbsNewtons],
    ['chassis heave', telemetrySnapshot.chassisAttitude.heaveOffsetMeters],
    ...telemetrySnapshot.wheelStates.flatMap((wheelState, index) => [
      [`wheel ${index} longitudinal slip`, wheelState.longitudinalSlipRatioAbs],
      [`wheel ${index} lateral slip`, wheelState.lateralSlipAngleDegrees],
      [`wheel ${index} longitudinal tire force`, wheelState.appliedLongitudinalForceNewtons],
      [`wheel ${index} lateral tire force`, wheelState.appliedLateralTireForceNewtons],
      [`wheel ${index} normal force`, wheelState.normalForceNewtons],
      [`wheel ${index} brake torque`, wheelState.appliedServiceBrakeTorqueNewtonMeters],
      [`wheel ${index} vertical aero load`, wheelState.aeroVerticalForceNewtons],
      [`wheel ${index} suspension travel`, wheelState.suspensionTravelMeters],
      [`wheel ${index} spring force`, wheelState.springForceNewtons],
    ]),
  ]

  for (const [field, value] of consumedFields) {
    assert.notEqual(value, undefined, `${field} must not be undefined`)
  }

  assert.ok(telemetrySnapshot.vehicleSnapshot.throttleInput > 0)
  assert.equal(telemetrySnapshot.vehicleSnapshot.throttleInput, vehicleSnapshot.throttleInput)
  assert.ok(telemetrySnapshot.powertrainKinematics.estimatedEngineRpm > 0)
  assert.equal(
    telemetrySnapshot.powertrainKinematics.estimatedEngineRpm,
    vehicleSnapshot.powertrainKinematics.estimatedEngineRpm
  )
  assert.ok(telemetrySnapshot.wheelStates[0].normalForceNewtons > 0)
  assert.equal(
    telemetrySnapshot.wheelStates[0].normalForceNewtons,
    vehicleSnapshot.wheelStates[0].normalForceNewtons
  )
  assert.notEqual(telemetrySnapshot.rearDifferentialState.rearDifferentialType, '')
  assert.equal(
    telemetrySnapshot.rearDifferentialState.rearDifferentialType,
    vehicleSnapshot.rearDifferentialState.rearDifferentialType
  )
})
