// src/main.js

import * as THREE from 'three'
import { CameraManager } from './controls/CameraManager.js'
import { createSimulation } from './createSimulation.js'
import { runSimulationFrame } from './runSimulationFrame.js'
import { runRenderFrame } from './runRenderFrame.js'
import {
  cloneVehicleConfiguration,
  createDefaultVehicleConfiguration,
} from './vehicle/config/createVehicleConfiguration.js'
import { createDriverHUD } from './ui/driver-hud/createDriverHUD.js'
import { createTelemetryPanel } from './ui/telemetry-panel/createTelemetryPanel.js'
import { createControlPanel } from './ui/control-panel/createControlPanel.js'
import { createConfigPanel } from './ui/config-panel/createConfigPanel.js'
import { createRocketPanel } from './rocket/createRocketPanel.js'
import { applySessionConfiguration } from './vehicle/config/applySessionConfiguration.js'
import { resolveInitialVehicleConfiguration } from './vehicle/config/vehicleConfigurationStorage.js'
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
sun.userData.shadowFollowOffsetMeters = new THREE.Vector3(20, 40, 20)
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.left = -260
sun.shadow.camera.right = 260
sun.shadow.camera.top = 260
sun.shadow.camera.bottom = -260
sun.shadow.camera.near = 0.1
sun.shadow.camera.far = 500
sun.shadow.camera.updateProjectionMatrix()
sun.shadow.bias = -0.0002
scene.add(sun)
scene.add(sun.target)
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
const { terrainSelection, vehicleController, car, initialVehicleConfig, rocketSystem } = simulation
const cameraManager = new CameraManager(camera, renderer, car)

const inputKeys = new Map([
  ['ArrowUp', 'forward'], ['w', 'forward'], ['W', 'forward'],
  ['ArrowDown', 'backward'], ['s', 'backward'], ['S', 'backward'],
  ['ArrowLeft', 'left'], ['a', 'left'], ['A', 'left'],
  ['ArrowRight', 'right'], ['d', 'right'], ['D', 'right'],
  [' ', 'handbrake'],
])
// The rocket's attitude is controlled by its fins, so the driving keys
// become fin commands in rocket mode. The fins have to be armed with F
// before they produce any force.
const rocketControlKeys = new Map([
  ['w', 'pitchForward'], ['W', 'pitchForward'],
  ['s', 'pitchBackward'], ['S', 'pitchBackward'],
  ['a', 'rollLeft'], ['A', 'rollLeft'],
  ['d', 'rollRight'], ['D', 'rollRight'],
])
// Which simulation owns the fixed step. The rocket prototype and the
// vehicle never step at the same time.
function applySimulationMode(mode) {
  const isRocketMode = mode === 'rocket'
  simulation.mode = isRocketMode ? 'rocket' : 'car'
  car.visible = !isRocketMode
  rocketSystem.group.visible = isRocketMode

  // A fin key held while the mode changed would keep commanding the
  // control surfaces.
  rocketSystem.clearControlInput()

  if (isRocketMode) {
    rocketSystem.reset()
    cameraManager.setTarget(rocketSystem.getRocketGroup())
    // A driving key held while the mode changed would keep the vehicle
    // accelerating the moment the mode switches back.
    inputKeys.forEach((control) => {
      keyState[control] = false
    })
  } else {
    cameraManager.setTarget(car)
  }

  if (isRocketMode) rocketPanel.expand()
  else rocketPanel.collapse()
}

window.addEventListener('keydown', (event) => {
  // Rocket mode owns its keys: the driving keys would fight the rocket, and
  // the brake key doubles as the stage-separation key.
  if (simulation.mode === 'rocket') {
    if (event.key === ' ' || event.key === 't' || event.key === 'T') {
      event.preventDefault()
      rocketSystem.setMotorIgnited(!rocketSystem.isMotorIgnited())
      return
    }
    // The fins are the attitude authority: WASD commands the control
    // surfaces, and F arms them.
    const finControl = rocketControlKeys.get(event.key)
    if (finControl) {
      event.preventDefault()
      rocketSystem.setControlInput(finControl, true)
      return
    }
    if (event.key === 'f' || event.key === 'F') {
      event.preventDefault()
      rocketSystem.toggleFins()
      return
    }
    // The stage separation moved off S, which is now a fin command.
    if (event.key === 'x' || event.key === 'X') {
      event.preventDefault()
      rocketSystem.requestStageSeparation()
      return
    }
    if (event.key === 'm' || event.key === 'M') {
      applySimulationMode('car')
      controlPanel.setSimulationMode('car')
      return
    }
    if (event.key === 'r' || event.key === 'R') {
      rocketSystem.reset()
      return
    }
    if (event.key === 'c' || event.key === 'C') cameraManager.cycleMode()
    return
  }

  const control = inputKeys.get(event.key)
  if (control) keyState[control] = true
  else if (event.key === '[') vehicleController.requestShiftDown()
  else if (event.key === ']') vehicleController.requestShiftUp()
  else if (event.key === 'c' || event.key === 'C') cameraManager.cycleMode()
  else if (event.key === 'r' || event.key === 'R') vehicleController.reset()
  else if (event.key === 'm' || event.key === 'M') {
    applySimulationMode('rocket')
    controlPanel.setSimulationMode('rocket')
  }
})
window.addEventListener('keyup', (event) => {
  if (simulation.mode === 'rocket') {
    const finControl = rocketControlKeys.get(event.key)
    if (finControl) {
      rocketSystem.setControlInput(finControl, false)
      return
    }
  }

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
  onSimulationModeChange: (mode) => applySimulationMode(mode),
})
// The configuration the running controller actually carries. An Apply that
// changes nothing is a no-op instead of a redundant re-apply.
let lastAppliedVehicleConfig = cloneVehicleConfiguration(initialVehicleConfig)

let configPanel
configPanel = createConfigPanel({
  anchor: 'bottom-left', initiallyCollapsed: false,
  initialTerrain: terrainSelection.name, initialVehicleConfig,
  onApply: ({ terrain, vehicleConfig }) => {
    applySessionConfigurationToController({ vehicleConfig, terrain })
  },
  onReset: () => {
    // Reset Vehicle restores the vehicle setup only. The terrain is not
    // touched: a terrain selection is applied by reloading the session.
    const stockVehicleConfig = createDefaultVehicleConfiguration()
    applySessionConfigurationToController({ vehicleConfig: stockVehicleConfig })
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

// Apply the staged session configuration to the running controller.
//
// The controller object never changes: the configuration is swapped in place,
// so every holder of a controller reference (the camera, the panels, the
// obstacle interaction, the console hook) keeps working. A failed apply
// leaves the controller untouched and reports the failure to the panel.
//
// The vehicle setup is applied and recorded BEFORE the terrain is
// committed. A terrain change reloads the session, and the recorded setup
// is what the next session restores, so the record has to be in place
// first. That is what makes a combined apply land both changes.
function applySessionConfigurationToController({ vehicleConfig, terrain = null }) {
  return applySessionConfiguration({
    vehicleController,
    vehicleConfig,
    lastAppliedVehicleConfig,
    terrain,
    runningTerrain: terrainSelection.name,
    commitTerrain: commitTerrainSelection,
    onApplied: ({ vehicleConfig: appliedConfig, warning }) => {
      lastAppliedVehicleConfig = cloneVehicleConfiguration(appliedConfig)
      configPanel.markApplied({ vehicleConfig: lastAppliedVehicleConfig, warning })
    },
    onError: (error) => {
      console.error('[ConfigPanel] Vehicle configuration apply failed.', error)
      configPanel.setApplyError(error)
    },
  })
}

// Commit a terrain selection.
//
// A terrain change is applied by reloading the session: the terrain is
// built when the page starts, so the new session URL is the whole change.
// The panel is told that the terrain it staged is now the running one, so
// it does not keep reporting it as pending on the way out.
function commitTerrainSelection(terrain) {
  const params = new URLSearchParams(typeof globalThis.location?.search === 'string' ? globalThis.location.search : '')
  params.set('terrain', terrain)
  if (globalThis.location) globalThis.location.search = params.toString()
  configPanel.markTerrainApplied(terrain)
}

const rocketPanel = createRocketPanel({ anchor: 'bottom-center' })
rocketPanel.collapse()

// The stored panel state carries the simulation mode, so a reload can come
// back into the simulation it was left in.
applySimulationMode(controlPanel.getSimulationMode())

const panels = { driverHUD, telemetryPanel, controlPanel, rocketPanel }

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
// DEV ONLY — expose simulation internals for browser-console testing.
// Example: __vehicleSim.vehicleController.setTransmission('manual-6')
// Example: __vehicleSim.vehicleController.setSuspension('front', 'susp-double-wishbone')
// Example: __vehicleSim.vehicleController.setSuspension('rear', 'susp-solid-axle')
window.__vehicleSim = { vehicleController, rocketSystem, simulation, camera, renderer, cameraManager, panels }

const clock = new THREE.Clock()
function animate() {
  requestAnimationFrame(animate)
  const deltaSeconds = clock.getDelta()
  runSimulationFrame(simulation, deltaSeconds)
  runRenderFrame({ simulation, panels, camera, renderer, cameraManager, shadowLight: sun }, deltaSeconds)
}
animate()
