// test/telemetrySchemaContract.test.js
import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { createSimulation } from '../src/createSimulation.js'
import { runSimulationFrame } from '../src/runSimulationFrame.js'

// If the telemetry panel starts reading a new snapshot field, add it here
// and verify the panel reads it via that exact path.
const REQUIRED_TELEMETRY_FIELDS = [
  'speedMetersPerSecond',
  'localForwardVelocityMetersPerSecond',
  'yawRateRadiansPerSecond',
  'forces.netForceWorldXNewtons',
  'forces.netForceWorldZNewtons',
  'forces.yawMomentNewtonMeters',
  'chassisMassProperties.massKilograms',
  'powertrainKinematics.estimatedEngineRpm',
  'gear',
  'throttleInput',
  'brakeInput',
  'totalAxleDriveTorqueNewtonMeters',
  'rearDifferentialState.rearDifferentialType',
  'rearDifferentialState.rearDifferentialLeftShare01',
  'wheelStates[0].longitudinalSlipRatioAbs',
  'wheelStates[0].lateralSlipAngleDegrees',
  'wheelStates[0].id',
  'wheelStates[0].appliedLongitudinalForceNewtons',
  'wheelStates[0].appliedLateralTireForceNewtons',
  'loadTransferSummary.totalLongitudinalTransferAbsNewtons',
  'wheelStates[0].normalForceNewtons',
  'spec.serviceBrakeFrontBias01',
  'serviceBrakeAbsSummary.activeWheelCount',
  'wheelStates[0].appliedServiceBrakeTorqueNewtonMeters',
  'forces.aerodynamicDragForceNewtons',
  'wheelStates[0].aeroVerticalForceNewtons',
  'chassisAttitude.heaveOffsetMeters',
  'wheelStates[0].suspensionTravelMeters',
  'wheelStates[0].springForceNewtons',
]

function resolveSnapshotPath(snapshot, path) {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .reduce((value, key) => value?.[key], snapshot)
}

test('every telemetry panel snapshot field is defined after a simulation step', () => {
  const simulation = createSimulation({ scene: new THREE.Scene() })
  runSimulationFrame(simulation, 1 / 60)
  const snapshot = simulation.vehicleController.getSnapshot()

  for (const path of REQUIRED_TELEMETRY_FIELDS) {
    assert.notEqual(resolveSnapshotPath(snapshot, path), undefined, `${path} is undefined`)
  }
})