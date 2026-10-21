// src/main.js

import * as THREE from 'three'
import { CameraManager } from './controls/CameraManager.js'
import { createSimulation } from './createSimulation.js'
import { runSimulationFrame } from './runSimulationFrame.js'
import { runRenderFrame } from './runRenderFrame.js'
import { areVehicleConfigurationsEqual, createDefaultVehicleConfiguration } from './vehicle/config/createVehicleConfiguration.js'
import { createDriverHUD } from './ui/driver-hud/createDriverHUD.js'
import { createTelemetryPanel } from './ui/telemetry-panel/createTelemetryPanel.js'
import { createControlPanel } from './ui/control-panel/createControlPanel.js'
import { createConfigPanel } from './ui/config-panel/createConfigPanel.js'
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
const simulation = createSimulation({ scene, keyState })
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
  else if (event.key === '[') vehicleController.shiftDown()
  else if (event.key === ']') vehicleController.shiftUp()
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
    }
    if (!areVehicleConfigurationsEqual(vehicleConfig, initialVehicleConfig)) {
      console.warn('[ConfigPanel] Vehicle component selections are preview-only; the running controller and rendered vehicle are unchanged.', { vehicleConfig })
    }
  },
  onReset: () => {
    configPanel.setTerrain('proving-ground')
    configPanel.setVehicleConfig(createDefaultVehicleConfiguration())
  },
})
const panels = { driverHUD, telemetryPanel, controlPanel }

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
const clock = new THREE.Clock()
function animate() {
  requestAnimationFrame(animate)
  const deltaSeconds = clock.getDelta()
  runSimulationFrame(simulation, deltaSeconds)
  runRenderFrame({ simulation, panels, camera, renderer, cameraManager }, deltaSeconds)
}
animate()
