// src/main.js

import * as THREE from 'three'
import { CameraManager } from './controls/CameraManager.js'
import { createSimulation } from './createSimulation.js'
import { runSimulationFrame } from './runSimulationFrame.js'
import { runRenderFrame } from './runRenderFrame.js'
import {
  areVehicleConfigurationsEqual,
  cloneVehicleConfiguration,
  createDefaultVehicleConfiguration,
} from './vehicle/config/createVehicleConfiguration.js'
import { createDriverHUD } from './ui/driver-hud/createDriverHUD.js'
import { createTelemetryPanel } from './ui/telemetry-panel/createTelemetryPanel.js'
import { createControlPanel } from './ui/control-panel/createControlPanel.js'
import { createConfigPanel } from './ui/config-panel/createConfigPanel.js'
import { applyVehicleConfigurationToSession } from './vehicle/config/applyVehicleConfigurationToSession.js'
import {
  resolveInitialVehicleConfiguration,
  writeStoredVehicleConfiguration,
} from './vehicle/config/vehicleConfigurationStorage.js'
import { describeVehicleApplyWarning } from './vehicle/config/describeVehicleApplyWarning.js'
import { initTheme } from './ui/design-system/theme.js'
import { initResponsive } from './ui/design-system/layout/Responsive.js'

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x1a1a1a)
scene.fog = new THREE.Fog(0x1a1a1a, 50, 200)
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500)
camera.position.set(0, 15, 30)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
renderer.shadowMap.enabled = true
Object.assign(renderer.domElement.style, {
  position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
})
document.body.style.margin = '0'
document.body.style.overflow = 'hidden'
document.body.appendChild(renderer.domElement)
scene.add(new THREE.AmbientLight(0xffffff, 0.4))
const sun = new THREE.DirectionalLight(0xffffff, 1)
sun.position.set(20, 40, 20)
sun.castShadow = true
scene.add(sun)
initTheme()
initResponsive()

const keyState = { forward: false, backward: false, left: false, right: false, handbrake: false }
// The vehicle setup the session starts with. A stored configuration is
// restored; a missing, corrupt, or invalid one falls back to the stock
// setup. The terrain is carried by the session URL, the vehicle setup by
// this store.
const simulation = createSimulation({
  scene,
  keyState,
  vehicleConfiguration: resolveInitialVehicleConfiguration(),
})
const { terrainSelection, vehicleController, car, initialVehicleConfig } = simulation
const cameraManager = new CameraManager(camera, renderer, car)

const inputKeys = new Map([
  ['ArrowUp', 'forward'], ['w', 'forward'], ['W', 'forward'],
  ['ArrowDown', 'backward'], ['s', 'backward'], ['S', 'backward'],
  ['ArrowLeft', 'left'], ['a', 'left'], ['A', 'left'],
  ['ArrowRight', 'right'], ['d', 'right'], ['D', 'right'],
  [' ', 'handbrake'],
])
window.addEventListener('keydown', (event) => {
  const control = inputKeys.get(event.key)
  if (control) keyState[control] = true
  else if (event.key === '[') vehicleController.requestShiftDown()
  else if (event.key === ']') vehicleController.requestShiftUp()
  else if (event.key === 'c' || event.key === 'C') cameraManager.cycleMode()
  else if (event.key === 'r' || event.key === 'R') vehicleController.reset()
})
window.addEventListener('keyup', (event) => {
  const control = inputKeys.get(event.key)
  if (control) keyState[control] = false
})

const driverHUD = createDriverHUD({ anchor: 'bottom-right', initiallyCollapsed: false })
const telemetryPanel = createTelemetryPanel({ anchor: 'top-left', initiallyCollapsed: false, persistState: true })
const controlPanel = createControlPanel({
  anchor: 'top-right', initiallyCollapsed: false,
  onTirePressureKpaChange: (kpa) => vehicleController.setTirePressureKpa?.(kpa),
  onDynamicsTuningChange: (values) => vehicleController.setDynamicsTuning?.(values),
  onRearDifferentialChange: (type) => vehicleController.setRearDifferentialType?.(type),
  onReset: () => vehicleController.resetDynamicsTuning?.(),
})
// The configuration the running controller actually carries. An Apply that
// changes nothing is a no-op instead of a redundant re-apply.
let lastAppliedVehicleConfig = cloneVehicleConfiguration(initialVehicleConfig)

let configPanel
configPanel = createConfigPanel({
  anchor: 'bottom-left', initiallyCollapsed: false,
  initialTerrain: terrainSelection.name, initialVehicleConfig,
  onTerrainChange: (terrainName) => {
    const params = new URLSearchParams(typeof globalThis.location?.search === 'string' ? globalThis.location.search : '')
    params.set('terrain', terrainName)
    if (globalThis.location) globalThis.location.search = params.toString()
  },
  onApply: ({ terrain, vehicleConfig }) => {
    if (terrain !== terrainSelection.name) {
      const params = new URLSearchParams(typeof globalThis.location?.search === 'string' ? globalThis.location.search : '')
      params.set('terrain', terrain)
      if (globalThis.location) globalThis.location.search = params.toString()
      // The session URL is now the committed terrain, and the document is
      // being replaced. The panel is told that the terrain it staged is
      // running, so it does not keep reporting it as pending on the way out.
      configPanel.markTerrainApplied(terrain)
    }
    applyVehicleConfigurationToController(vehicleConfig)
  },
  onReset: () => {
    // Reset Vehicle restores the vehicle setup only. The terrain is not
    // touched: a terrain selection is applied by reloading the session.
    const stockVehicleConfig = createDefaultVehicleConfiguration()
    applyVehicleConfigurationToController(stockVehicleConfig)
  },
})

// Keep the panel in step with a configuration change made outside it, for
// example through the browser console hook. The controller reports the
// catalog configuration it is effectively running, derived from the live
// vehicle state.
vehicleController.onConfigurationChanged((activeVehicleConfig) => {
  configPanel.applyExternalVehicleConfig(activeVehicleConfig)
})

// Adopt the configuration the controller is running, so the panel starts in
// step with the vehicle instead of assuming the initial selection.
configPanel.applyExternalVehicleConfig(vehicleController.getVehicleConfiguration())

// Apply a vehicle configuration to the running controller.
//
// The controller object never changes: the configuration is swapped in place,
// so every holder of a controller reference (the camera, the panels, the
// obstacle interaction, the console hook) keeps working. A failed apply
// leaves the controller untouched and reports the failure to the panel.
function applyVehicleConfigurationToController(vehicleConfig) {
  // The panel has no controller reference and no snapshot access, so the
  // speed is read here and the consequence is described here. The apply
  // always proceeds: the warning reports what already happened.
  const warning = describeVehicleApplyWarning({
    pendingVehicleConfig: vehicleConfig,
    appliedVehicleConfig: lastAppliedVehicleConfig,
    speedMetersPerSecond:
      vehicleController.getSnapshot().worldSpeedMetersPerSecond,
  })

  if (areVehicleConfigurationsEqual(vehicleConfig, lastAppliedVehicleConfig)) {
    // Nothing changed on the vehicle, but the session record is refreshed
    // so it always describes the setup the vehicle is running.
    writeStoredVehicleConfiguration(lastAppliedVehicleConfig)
    configPanel.markApplied({ vehicleConfig: lastAppliedVehicleConfig, warning })
    return
  }

  applyVehicleConfigurationToSession({
    vehicleController,
    vehicleConfig,
    onApplied: () => {
      lastAppliedVehicleConfig = cloneVehicleConfiguration(vehicleConfig)
      configPanel.markApplied({ vehicleConfig: lastAppliedVehicleConfig, warning })
    },
    onError: (error) => {
      console.error('[ConfigPanel] Vehicle configuration apply failed.', error)
      configPanel.setApplyError(error)
    },
  })
}

const panels = { driverHUD, telemetryPanel, controlPanel }

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
// DEV ONLY — expose simulation internals for browser-console testing.
// Example: __vehicleSim.vehicleController.setTransmission('manual-6')
// Example: __vehicleSim.vehicleController.setSuspension('susp-solid-axle-rear')
window.__vehicleSim = { vehicleController, simulation, camera, renderer, cameraManager, panels }

const clock = new THREE.Clock()
function animate() {
  requestAnimationFrame(animate)
  const deltaSeconds = clock.getDelta()
  runSimulationFrame(simulation, deltaSeconds)
  runRenderFrame({ simulation, panels, camera, renderer, cameraManager }, deltaSeconds)
}
animate()
