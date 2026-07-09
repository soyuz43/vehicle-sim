// src/main.js

import * as THREE from 'three'
import { createTerrain } from './terrain/createTerrain.js'
import { createFlatTerrainContactQuery } from './terrain/createFlatTerrainContactQuery.js'
import { createCar } from './car/createCar.js'
import { CameraManager } from './controls/CameraManager.js'
import { createDebugHud } from './ui/debugHud/createDebugHud.js'
import { createVehicleController } from './vehicle/createVehicleController.js'
import { createGearIndicator } from './ui/gearIndicator/createGearIndicator.js'
import { createTireInflationPanel } from './ui/tireInflationPanel/createTireInflationPanel.js'
import { createDeveloperTuningPanel } from './ui/developerTuningPanel/createDeveloperTuningPanel.js'
import { createFixedTimestepRunner } from './simulation/createFixedTimestepRunner.js'

/* =========================
   Scene
========================= */
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x1a1a1a)
scene.fog = new THREE.Fog(0x1a1a1a, 50, 200)

/* =========================
   Camera
========================= */
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  500
)
camera.position.set(0, 15, 30)

/* =========================
   Renderer
========================= */
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)

// OPTIMIZATION: Cap pixel ratio at 1.5 or 2.0.
// Rendering at native 3x or 4x on high-DPI screens causes frame time variance
// which leads to physics stutter, even with dt integration.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))

renderer.shadowMap.enabled = true
renderer.domElement.style.position = 'absolute'
renderer.domElement.style.top = '0'
renderer.domElement.style.left = '0'
renderer.domElement.style.width = '100%'
renderer.domElement.style.height = '100%'

document.body.style.margin = '0'
document.body.style.overflow = 'hidden'
document.body.appendChild(renderer.domElement)

/* =========================
   Lights
========================= */
scene.add(new THREE.AmbientLight(0xffffff, 0.4))

const sun = new THREE.DirectionalLight(0xffffff, 1)
sun.position.set(20, 40, 20)
sun.castShadow = true
scene.add(sun)

/* =========================
   Terrain
========================= */
const terrain = createTerrain()
scene.add(terrain)

const terrainInfo = terrain.userData.terrain
const terrainContactQuery = createFlatTerrainContactQuery({
  terrain,
})

const terrainGrid = new THREE.GridHelper(
  terrainInfo.size,
  200,
  0x777777,
  0x555555
)
terrainGrid.position.y = 0.02
terrainGrid.material.transparent = true
terrainGrid.material.opacity = 0.45
scene.add(terrainGrid)

/* =========================
   Car
========================= */
const car = createCar()

// CRITICAL: Pre-allocate the velocity vector.
// We will reuse this object every frame to avoid Garbage Collection stutter.
car.userData.velocity = new THREE.Vector3()

scene.add(car)

/* =========================
   Vehicle Controller
========================= */
const vehicleController = createVehicleController({
  vehicle: car,
  terrainContactQuery,
})

/* =========================
   Fixed Simulation Loop
========================= */
const fixedTimeStepSeconds = 1 / 60
const maxFrameDeltaSeconds = 0.1
const maxPhysicsStepsPerFrame = 6

const fixedSimulationRunner = createFixedTimestepRunner({
  fixedTimeStepSeconds,
  maxFrameDeltaSeconds,
  maxStepsPerFrame: maxPhysicsStepsPerFrame,
  step: (stepDeltaSeconds) => {
    vehicleController.update(stepDeltaSeconds, getVehicleInput())
  },
})

/* =========================
   Camera Manager
========================= */
const cameraManager = new CameraManager(camera, renderer, car)

/* =========================
   Debug HUD
========================= */
const debugHud = createDebugHud({
  parent: document.body,
  initialCorner: 'top-left',
  initialCollapsed: false,
})

const gearIndicator = createGearIndicator({
  parent: document.body,
  initialGear: vehicleController.getSnapshot().gear,
})

const tireInflationPanel = createTireInflationPanel({
  parent: document.body,
  initialTirePressureState: vehicleController.getTirePressureState(),
  onTirePressureKpaChange: (nextTirePressureKpa) => {
    vehicleController.setTirePressureKpa(nextTirePressureKpa)
    updateTireInflationPanel()
  },
  onReset: () => {
    vehicleController.resetTirePressure()
    updateTireInflationPanel()
  },
})

const developerTuningPanel = createDeveloperTuningPanel({
  parent: document.body,
  initialDynamicsTuning: vehicleController.getDynamicsTuning(),
  onDynamicsTuningChange: (nextDynamicsTuning) => {
    vehicleController.setDynamicsTuning(nextDynamicsTuning)
    updateDeveloperTuningPanel()
  },
  onReset: () => {
    vehicleController.resetDynamicsTuning()
    updateDeveloperTuningPanel()
  },
})

/* =========================
   Keyboard Input
========================= */
const keys = {}

window.addEventListener('keydown', (e) => {
  keys[e.code] = true

  if (e.repeat) return

  if (e.code === 'KeyC') {
    cameraManager.cycleMode()
  }

  if (e.code === 'KeyR') {
    resetCar()
  }

  if (e.code === 'BracketLeft') {
    vehicleController.shiftGearDown()
  }

  if (e.code === 'BracketRight') {
    vehicleController.shiftGearUp()
  }
})

window.addEventListener('keyup', (e) => {
  keys[e.code] = false
})

window.addEventListener('blur', () => {
  for (const key of Object.keys(keys)) {
    keys[key] = false
  }
})

/* =========================
   Clock
========================= */
const clock = new THREE.Clock()

/* =========================
   Reset
========================= */
function resetCar() {
  vehicleController.reset()
  fixedSimulationRunner.reset()
  cameraManager.setMode(cameraManager.activeMode ?? 'orbit')
  updateDebugHud(0, fixedSimulationRunner.getSnapshot())
  updateGearIndicator()
  updateTireInflationPanel()
  updateDeveloperTuningPanel()
}

/* =========================
   Vehicle Input
========================= */
function getVehicleInput() {
  return {
    throttle: keys['KeyW'],
    brake: keys['KeyS'],
    left: keys['KeyA'],
    right: keys['KeyD'],
  }
}

function createDriverTelemetrySnapshot(vehicleSnapshot) {
  return {
    gear: vehicleSnapshot.gear,
    gearLabel: vehicleSnapshot.gearLabel,
    speedMetersPerSecond:
      vehicleSnapshot.speedMetersPerSecond ?? vehicleSnapshot.speedScalar ?? 0,
    wheelStates: vehicleSnapshot.wheelStates,
  }
}

/* =========================
   Debug HUD
========================= */

function updateDebugHud(dt, fixedSimulationSnapshot) {
  const vehicleSnapshot = vehicleController.getSnapshot()
  const pos = vehicleSnapshot.position

  const outsideTerrain =
    Math.abs(pos.x) > terrainInfo.halfSize ||
    Math.abs(pos.z) > terrainInfo.halfSize

  debugHud.update({
    cameraMode: cameraManager.activeMode,
    controllerKind: vehicleSnapshot.controllerKind,
    throttleInput: vehicleSnapshot.throttleInput,
    brakeInput: vehicleSnapshot.brakeInput,
    steeringInput: vehicleSnapshot.steeringInput,
    dt,
    fixedSimulation: fixedSimulationSnapshot,
    position: pos,
    speedScalar: vehicleSnapshot.speedScalar,
    speedMetersPerSecond: vehicleSnapshot.speedMetersPerSecond,
    worldVelocityMetersPerSecond:
      vehicleSnapshot.worldVelocityMetersPerSecond,
    localForwardVelocityMetersPerSecond:
      vehicleSnapshot.localForwardVelocityMetersPerSecond,
    localLateralVelocityMetersPerSecond:
      vehicleSnapshot.localLateralVelocityMetersPerSecond,
    signedForwardSpeedMetersPerSecond:
      vehicleSnapshot.signedForwardSpeedMetersPerSecond,
    lateralSpeedMetersPerSecond:
      vehicleSnapshot.lateralSpeedMetersPerSecond,
    worldSpeedMetersPerSecond:
      vehicleSnapshot.worldSpeedMetersPerSecond,
    yawRadians: vehicleSnapshot.yawRadians,
    yawRateRadiansPerSecond:
      vehicleSnapshot.yawRateRadiansPerSecond,
    yawAccelerationRadiansPerSecondSquared:
      vehicleSnapshot.yawAccelerationRadiansPerSecondSquared,
    planarAccelerationWorldMetersPerSecondSquared:
      vehicleSnapshot.planarAccelerationWorldMetersPerSecondSquared,
    planarAccelerationLocalForwardMetersPerSecondSquared:
      vehicleSnapshot.planarAccelerationLocalForwardMetersPerSecondSquared,
    planarAccelerationLocalLateralMetersPerSecondSquared:
      vehicleSnapshot.planarAccelerationLocalLateralMetersPerSecondSquared,
    velocity: vehicleSnapshot.velocity,
    longitudinalAcceleration:
      vehicleSnapshot.longitudinalAcceleration,
    forces: vehicleSnapshot.forces,
    wheelStates: vehicleSnapshot.wheelStates,
    tirePressureState: vehicleSnapshot.tirePressureState,
    dynamicsTuning: vehicleSnapshot.dynamicsTuning,
    terrainSize: terrainInfo.size,
    outsideTerrain,
  })
}

function updateGearIndicator() {
  const vehicleSnapshot = vehicleController.getSnapshot()

  gearIndicator.update(createDriverTelemetrySnapshot(vehicleSnapshot))
}

function updateTireInflationPanel() {
  tireInflationPanel.update(vehicleController.getTirePressureState())
}

function updateDeveloperTuningPanel() {
  developerTuningPanel.update(vehicleController.getDynamicsTuning())
}

/* =========================
   Resize Handling
========================= */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

/* =========================
   Animation Loop
========================= */
function animate() {
  requestAnimationFrame(animate)

  const renderDeltaSeconds = clock.getDelta()
  const fixedSimulationSnapshot =
    fixedSimulationRunner.update(renderDeltaSeconds)
  const clampedRenderDeltaSeconds = sanitizeRenderDeltaSeconds(
    renderDeltaSeconds
  )

  cameraManager.update(clampedRenderDeltaSeconds)
  updateDebugHud(clampedRenderDeltaSeconds, fixedSimulationSnapshot)
  updateGearIndicator()

  renderer.render(scene, camera)
}

animate()

function sanitizeRenderDeltaSeconds(frameDeltaSeconds) {
  if (!Number.isFinite(frameDeltaSeconds) || frameDeltaSeconds <= 0) return 0
  return Math.min(frameDeltaSeconds, maxFrameDeltaSeconds)
}
