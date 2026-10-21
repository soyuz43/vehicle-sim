// test/renderFrameIntegration.test.js
import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { createSimulation } from '../src/createSimulation.js'
import { runRenderFrame } from '../src/runRenderFrame.js'

function createFakePanels() {
  const calls = { driverHUD: [], telemetryPanel: [], controlPanel: [] }
  return {
    calls,
    driverHUD: { update: (...args) => calls.driverHUD.push(args) },
    telemetryPanel: { update: (...args) => calls.telemetryPanel.push(args) },
    controlPanel: { update: (...args) => calls.controlPanel.push(args) },
  }
}

function createFakeRenderer() {
  const calls = []
  return { calls, render: (...args) => calls.push(args) }
}

function createFakeCameraManager() {
  const calls = []
  return { calls, update: (...args) => calls.push(args) }
}

function createTestRenderDeps({ includeCameraManager = true } = {}) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  const simulation = createSimulation({ scene })
  const panels = createFakePanels()
  const renderer = createFakeRenderer()
  const cameraManager = createFakeCameraManager()
  const deps = { simulation, panels, camera, renderer }
  if (includeCameraManager) deps.cameraManager = cameraManager
  return { ...deps, cameraManager, panels, renderer, scene, camera }
}

test('runRenderFrame calls getSnapshot exactly once', () => {
  const deps = createTestRenderDeps()
  const getSnapshot = deps.simulation.vehicleController.getSnapshot.bind(deps.simulation.vehicleController)
  const snapshot = getSnapshot()
  let snapshotReadCount = 0
  deps.simulation.vehicleController.getSnapshot = () => {
    snapshotReadCount += 1
    return snapshot
  }

  runRenderFrame(deps, 1 / 15)

  // If this ever fails, check for a second getSnapshot call in the render path — the throttle fix depends on one call per frame.
  assert.equal(snapshotReadCount, 1)
})

test('runRenderFrame passes the same snapshot to all three panels', () => {
  const deps = createTestRenderDeps()
  const expectedSnapshot = deps.simulation.vehicleController.getSnapshot()
  deps.simulation.vehicleController.getSnapshot = () => expectedSnapshot

  runRenderFrame(deps, 1 / 30)
  runRenderFrame(deps, 1 / 30)

  assert.equal(deps.panels.calls.driverHUD.length, 1)
  assert.equal(deps.panels.calls.telemetryPanel.length, 1)
  assert.equal(deps.panels.calls.controlPanel.length, 1)
  assert.equal(deps.panels.calls.driverHUD[0][0], expectedSnapshot)
  assert.equal(deps.panels.calls.telemetryPanel[0][0], expectedSnapshot)
  assert.equal(deps.panels.calls.controlPanel[0][0], expectedSnapshot)
})

test('runRenderFrame calls renderer.render once', () => {
  const deps = createTestRenderDeps()

  runRenderFrame(deps, 1 / 60)

  assert.equal(deps.renderer.calls.length, 1)
  assert.deepEqual(deps.renderer.calls[0], [deps.scene, deps.camera])
})

test('runRenderFrame does not throw when cameraManager is omitted', () => {
  const deps = createTestRenderDeps({ includeCameraManager: false })

  assert.doesNotThrow(() => runRenderFrame(deps, 1 / 15))
  assert.equal(deps.renderer.calls.length, 1)
})