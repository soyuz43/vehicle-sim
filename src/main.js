// src/main.js

import * as THREE from 'three'
import { createTerrain } from './terrain/createTerrain.js'
import { createTerrainSurfaceProfile } from './terrain/createTerrainSurfaceProfile.js'
import { createHeightfieldTerrainContactQuery } from './terrain/createHeightfieldTerrainContactQuery.js'
import { createTerrainSelection } from './terrain/createTerrainSelection.js'
import { createObstacleFieldVisuals } from './terrain/obstacles/createObstacleFieldVisuals.js'
import { createTerrainSelector } from './ui/terrainSelector/createTerrainSelector.js'
import { createCar } from './car/createCar.js'
import { CameraManager } from './controls/CameraManager.js'
import { createDebugHud } from './ui/debugHud/createDebugHud.js'
import { createVehicleController } from './vehicle/createVehicleController.js'
import { createGearIndicator } from './ui/gearIndicator/createGearIndicator.js'
import { createTireInflationPanel } from './ui/tireInflationPanel/createTireInflationPanel.js'
import { createDeveloperTuningPanel } from './ui/developerTuningPanel/createDeveloperTuningPanel.js'
import { createTireSlipFeedback } from './effects/tireSlipFeedback/createTireSlipFeedback.js'
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
// Terrain selection. The default (no ?terrain= param) reproduces the
// original proving-ground behavior exactly; ?terrain=offroad composes the
// catalog-driven enhanced profile, the procedural playground generator, and
// the static obstacle field.
const terrainSelection = createTerrainSelection()
const terrainSurfaceProfile = terrainSelection.surfaceProfile

const terrain = createTerrain({
  surfaceProfile: terrainSurfaceProfile,
})
scene.add(terrain)

const terrainInfo = terrain.userData.terrain
const terrainContactQuery = createHeightfieldTerrainContactQuery({
  surfaceProfile: terrainSurfaceProfile,
})

// Static obstacle visuals (offroad mode only). Purely visual; the physics uses
// the same obstacle geometry through the obstacle-aware surface profile.
let obstacleVisuals = null
if (terrainSelection.obstacleField) {
  obstacleVisuals = createObstacleFieldVisuals(terrainSelection.obstacleField, {
    baseProfile: terrainSelection.baseProfile,
  })
  scene.add(obstacleVisuals.group)
}

// Water visuals (offroad-water mode only). Purely visual; the physics uses
// the water surface through the obstacle-aware surface profile.
let waterVisuals = null
if (terrainSelection.waterSurface) {
  waterVisuals = createWaterVisuals(terrainSelection.waterSurface)
  scene.add(waterVisuals.mesh)
}

// Minimal terrain selector UI; reloads with the chosen ?terrain= parameter.
createTerrainSelector({ selection: terrainSelection })

/* =========================
   Car
========================= */
const car = createCar()

// Visual-only tire pressure deformation layer (reads sim pressure, eases mesh).
const tirePressureVisuals = car.userData.vehicle.tirePressureVisuals

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

const tireSlipFeedback = createTireSlipFeedback({
  maxWheelEffects: vehicleController.getSnapshot().wheelStates.length,
})
scene.add(tireSlipFeedback.root)

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
   UI
========================= */
const debugHud = createDebugHud()
document.body.appendChild(debugHud.element)

const gearIndicator = createGearIndicator()
document.body.appendChild(gearIndicator.element)

const tireInflationPanel = createTireInflationPanel({
  vehicleController,
})
document.body.appendChild(tireInflationPanel.element)

const developerTuningPanel = createDeveloperTuningPanel({
  vehicleController,
})
document.body.appendChild(developerTuningPanel.element)

/* =========================
   Clock
========================= */
const clock = new THREE.Clock()

/* =========================
   Input
========================= */
const keyState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  handbrake: false,
}

function getVehicleInput() {
  return {
    throttle: keyState.forward ? 1 : 0,
    brake: keyState.backward ? 1 : 0,
    steer: keyState.right ? 1 : keyState.left ? -1 : 0,
    handbrake: keyState.handbrake,
  }
}

window.addEventListener('keydown', (event) => {
  switch (event.key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      keyState.forward = true
      break
    case 'ArrowDown':
    case 's':
    case 'S':
      keyState.backward = true
      break
    case 'ArrowLeft':
    case 'a':
    case 'A':
      keyState.left = true
      break
    case 'ArrowRight':
    case 'd':
    case 'D':
      keyState.right = true
      break
    case ' ':
      keyState.handbrake = true
      break
  }
})

window.addEventListener('keyup', (event) => {
  switch (event.key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      keyState.forward = false
      break
    case 'ArrowDown':
    case 's':
    case 'S':
      keyState.backward = false
      break
    case 'ArrowLeft':
    case 'a':
    case 'A':
      keyState.left = false
      break
    case 'ArrowRight':
    case 'd':
    case 'D':
      keyState.right = false
      break
    case ' ':
      keyState.handbrake = false
      break
  }
})

/* =========================
   HUD Updates
========================= */
function updateDebugHud(renderDeltaSeconds, fixedSimulationSnapshot) {
  const vehicleSnapshot = vehicleController.getSnapshot()
  debugHud.update({
    renderDeltaSeconds,
    fixedSimulationSnapshot,
    vehicleSnapshot,
  })
}

function updateGearIndicator() {
  const vehicleSnapshot = vehicleController.getSnapshot()
  gearIndicator.update(vehicleSnapshot.powertrainState.gear)
}

/* =========================
   Water Visuals Helper
========================= */
function createWaterVisuals(waterSurface) {
  // Create a simple water plane visual
  const waterGeometry = new THREE.PlaneGeometry(200, 200, 1, 1)
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x0077be,
    transparent: true,
    opacity: 0.7,
    roughness: 0.1,
    metalness: 0.9,
  })
  
  const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial)
  waterMesh.rotation.x = -Math.PI / 2
  waterMesh.position.y = waterSurface.waterLevelYMeters
  
  return {
    mesh: waterMesh,
    update: function(time) {
      // Could add wave animation here in the future
    }
  }
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
  const vehicleSnapshot = vehicleController.getSnapshot()
  if (obstacleVisuals) {
    const wheelContactPoints = (vehicleSnapshot.wheelStates || [])
      .map((wheelState) => (wheelState ? wheelState.contactPointWorldPosition : null))
      .filter(Boolean)
    obstacleVisuals.updateContactVisuals(wheelContactPoints)
  }
  tireSlipFeedback.update(
    vehicleSnapshot,
    car,
    clampedRenderDeltaSeconds
  )
  tirePressureVisuals.setTargetFromWheelStates(vehicleSnapshot.wheelStates)
  tirePressureVisuals.update(clampedRenderDeltaSeconds)
  updateDebugHud(clampedRenderDeltaSeconds, fixedSimulationSnapshot)
  updateGearIndicator()

  renderer.render(scene, camera)
}

animate()

function sanitizeRenderDeltaSeconds(frameDeltaSeconds) {
  if (!Number.isFinite(frameDeltaSeconds) || frameDeltaSeconds <= 0) return 0
  return Math.min(frameDeltaSeconds, maxFrameDeltaSeconds)
}
