// test/telemetrySchemaContract.test.js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

function collectTelemetryPanelSnapshotReadPaths() {
  const panelSource = readFileSync(
    new URL('../src/ui/telemetry-panel/createTelemetryPanel.js', import.meta.url),
    'utf8'
  )
  const updateStartMarker = '  function update(snapshot) {\n'
  const updateEndMarker = '\n  // Mobile bottom sheet'
  const updateStart = panelSource.indexOf(updateStartMarker)
  const updateEnd = panelSource.indexOf(updateEndMarker, updateStart)
  assert.notEqual(updateStart, -1, 'telemetry panel update(snapshot) must remain discoverable')
  assert.ok(updateEnd > updateStart, 'telemetry panel update(snapshot) must have an end marker')

  let updateSource = panelSource.slice(updateStart + updateStartMarker.length, updateEnd)
  const aliasSetupStatements = [
    'const vehicle = snapshot.vehicleSnapshot ?? snapshot;',
    'const forces = snapshot.forces ?? vehicle.forces;',
    'const powertrainKin = snapshot.powertrainKinematics ?? vehicle.powertrainKinematics;',
    'const rearDiff = snapshot.rearDifferentialState ?? vehicle.rearDifferentialState;',
    'const wheelStates = snapshot.wheelStates ?? vehicle.wheelStates;',
    'const loadTransfer = snapshot.loadTransferSummary ?? vehicle.loadTransferSummary;',
    'const chassisAttitude = snapshot.chassisAttitude ?? vehicle.chassisAttitude;',
  ]
  for (const statement of aliasSetupStatements) {
    const exactStatement = `    ${statement}\n`
    const statementCount = updateSource.split(exactStatement).length - 1
    assert.equal(statementCount, 1, `update(snapshot) alias changed: ${statement}`)
    updateSource = updateSource.replace(exactStatement, '')
  }

  assert.doesNotMatch(
    updateSource,
    /\b(snapshot|vehicle|forces|powertrainKin|rearDiff|wheelStates|loadTransfer|chassisAttitude|ws)\s*\[/,
    'telemetry snapshot reads must use explicit property paths'
  )

  assert.doesNotMatch(
    updateSource,
    /\b(?:const|let|var)\s+\{[^}]+\}\s*=/,
    'telemetry snapshot reads must use explicit property paths'
  )

  const aliasPaths = {
    snapshot: '',
    vehicle: '',
    forces: 'forces',
    powertrainKin: 'powertrainKinematics',
    rearDiff: 'rearDifferentialState',
    wheelStates: 'wheelStates',
    loadTransfer: 'loadTransferSummary',
    chassisAttitude: 'chassisAttitude',
    ws: 'wheelStates[0]',
  }
  const propertyReadPattern =
    /\b(snapshot|vehicle|forces|powertrainKin|rearDiff|wheelStates|loadTransfer|chassisAttitude|ws)\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)(?:\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*))?/g
  const readPaths = new Set()
  for (const match of updateSource.matchAll(propertyReadPattern)) {
    const [, alias, firstField, secondField] = match
    const readPath = [aliasPaths[alias], firstField, secondField]
      .filter(Boolean)
      .join('.')
    readPaths.add(readPath)
  }

  return [...readPaths].sort()
}

test('telemetry panel snapshot reads are declared in the field contract', () => {
  const requiredFields = new Set(REQUIRED_TELEMETRY_FIELDS)

  for (const path of collectTelemetryPanelSnapshotReadPaths()) {
    assert.ok(
      requiredFields.has(path),
      `telemetry panel reads undeclared snapshot field "${path}"; add it to REQUIRED_TELEMETRY_FIELDS`
    )
  }
})

test('every telemetry panel snapshot field is defined after a simulation step', () => {
  const simulation = createSimulation({ scene: new THREE.Scene() })
  runSimulationFrame(simulation, 1 / 60)
  const snapshot = simulation.vehicleController.getSnapshot()

  for (const path of REQUIRED_TELEMETRY_FIELDS) {
    assert.notEqual(resolveSnapshotPath(snapshot, path), undefined, `${path} is undefined`)
  }
})