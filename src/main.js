// src/main.js

import * as THREE from 'three'
import { createTerrain } from './terrain/createTerrain.js'
import { createTerrainSurfaceProfile } from './terrain/createTerrainSurfaceProfile.js'
import { createHeightfieldTerrainContactQuery } from './terrain/createHeightfieldTerrainContactQuery.js'
import { createTerrainSelection } from './terrain/createTerrainSelection.js'
import { createObstacleFieldVisuals } from './terrain/obstacles/createObstacleFieldVisuals.js'
import { createCar } from './car/createCar.js'
import { CameraManager } from './controls/CameraManager.js'
import { createVehicleController } from './vehicle/createVehicleController.js'
import { createControllerConfig } from './vehicle/config/applyVehicleConfiguration.js'
import {
  areVehicleConfigurationsEqual,
  createDefaultVehicleConfiguration,
} from './vehicle/config/createVehicleConfiguration.js'
import { createTireSlipFeedback } from './effects/tireSlipFeedback/createTireSlipFeedback.js'
import { createFixedTimestepRunner } from './simulation/createFixedTimestepRunner.js'
import { createTerrainDeformation } from './terrain/deformation/createTerrainDeformation.js'
import { createDeformationVisuals } from './terrain/deformation/createDeformationVisuals.js'
import { createVehicleObstacleInteraction } from './terrain/obstacles/createVehicleObstacleInteraction.js'
import { createParticleSystem } from './effects/createParticleSystem.js'

// New Design System UI
import { createDriverHUD } from './ui/driver-hud/createDriverHUD.js'
import { createTelemetryPanel } from './ui/telemetry-panel/createTelemetryPanel.js'
import { createControlPanel } from './ui/control-panel/createControlPanel.js'
import { createConfigPanel } from './ui/config-panel/createConfigPanel.js'
import { initTheme } from './ui/design-system/theme.js'
import { initResponsive } from './ui/design-system/layout/Responsive.js'

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
   Theme & Design System
========================= */
initTheme()
initResponsive()

/* =========================
   Terrain
========================= */
const terrainDeformation = createTerrainDeformation()
const terrainSelection = createTerrainSelection({ deformationField: terrainDeformation })
const terrainSurfaceProfile = terrainSelection.surfaceProfile

const terrain = createTerrain({
  surfaceProfile: terrainSurfaceProfile,
})
scene.add(terrain)

let deformationVisuals = null
if (terrainSelection.obstacleField) {
  deformationVisuals = createDeformationVisuals({
    terrainMesh: terrain,
    deformationField: terrainDeformation,
  })
}

const terrainInfo = terrain.userData.terrain
const terrainContactQuery = createHeightfieldTerrainContactQuery({
  surfaceProfile: terrainSurfaceProfile,
})

let obstacleVisuals = null
if (terrainSelection.obstacleField) {
  obstacleVisuals = createObstacleFieldVisuals(terrainSelection.obstacleField, {
    baseProfile: terrainSurfaceProfile,
  })
}

let waterVisuals = null
if (terrainSelection.waterSurface) {
  waterVisuals = createWaterVisuals(terrainSelection.waterSurface)
  scene.add(waterVisuals.mesh)
}

/* =========================
   Car (created first - needed for controller config)
========================= */
const initialVehicleConfig = createDefaultVehicleConfiguration()
const car = createCar()
scene.add(car)

/* =========================
   Vehicle Controller Config
========================= */
const controllerConfig = createControllerConfig(initialVehicleConfig, {
  vehicle: car,
  terrainContactQuery,
  terrainSurfaceProfile,
})

/* =========================
   Vehicle Controller
========================= */
const vehicleController = createVehicleController(controllerConfig)

/* =========================
   Camera Manager
========================= */
const cameraManager = new CameraManager(camera, renderer, car)

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
    case '[':
      vehicleController.shiftDown()
      break
    case ']':
      vehicleController.shiftUp()
      break
    case 'c':
    case 'C':
      cameraManager.cycleMode()
      break
    case 'r':
    case 'R':
      vehicleController.reset()
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
   UI Panels
========================= */

// Driver HUD (bottom-right) - replaces GearIndicator
const driverHUD = createDriverHUD({
  anchor: 'bottom-right',
  initiallyCollapsed: false,
})

// Telemetry Panel (top-left) - replaces DebugHUD
const telemetryPanel = createTelemetryPanel({
  anchor: 'top-left',
  initiallyCollapsed: false,
  persistState: true,
})

// Control Panel (top-right) - replaces TireInflationPanel + DeveloperTuningPanel
const controlPanel = createControlPanel({
  anchor: 'top-right',
  initiallyCollapsed: false,
  onTirePressureKpaChange: (kpa) => {
    vehicleController.setTirePressureKpa?.(kpa)
  },
  onDynamicsTuningChange: (values) => {
    vehicleController.setDynamicsTuning?.(values)
  },
  onRearDifferentialChange: (type) => {
    vehicleController.setRearDifferentialType?.(type)
  },
  onReset: () => {
    vehicleController.resetDynamicsTuning?.()
  },
})

// Config Panel (bottom-left) - replaces TerrainSelector + VehicleCustomizationUI
const configPanel = createConfigPanel({
  anchor: 'bottom-left',
  initiallyCollapsed: false,
  initialTerrain: terrainSelection.name,
  initialVehicleConfig,
  onTerrainChange: (terrainName) => {
    const search = globalThis.location?.search
    const params = new URLSearchParams(typeof search === 'string' ? search : '')
    params.set('terrain', terrainName)
    if (globalThis.location) {
      globalThis.location.search = params.toString()
    }
  },
  onApply: ({ terrain, vehicleConfig }) => {
    if (terrain !== terrainSelection.name) {
      const search = globalThis.location?.search
      const params = new URLSearchParams(typeof search === 'string' ? search : '')
      params.set('terrain', terrain)
      if (globalThis.location) {
        globalThis.location.search = params.toString()
      }
    }
    if (!areVehicleConfigurationsEqual(vehicleConfig, initialVehicleConfig)) {
      console.warn(
        '[ConfigPanel] Vehicle component selections are preview-only; the running controller and rendered vehicle are unchanged.',
        { vehicleConfig }
      )
    }
  },
  onReset: () => {
    configPanel.setTerrain('proving-ground')
    configPanel.setVehicleConfig(createDefaultVehicleConfiguration())
  },
})

/* =========================
   Tire Pressure Visuals
========================= */
const tirePressureVisuals = car.userData.vehicle.tirePressureVisuals

/* =========================
   Particle System
========================= */
const particleSystem = createParticleSystem()
scene.add(particleSystem.object3D)

/* =========================
   Vehicle-Obstacle Interaction
========================= */
let vehicleObstacleInteraction = null
if (terrainSelection.obstacleField) {
  vehicleObstacleInteraction = createVehicleObstacleInteraction({
    obstacleField: terrainSelection.obstacleField,
    terrainHeightFn: terrainSelection.baseProfile.getHeightAtWorldXZ,
    applyVehiclePlanarImpulse:
      vehicleController.applyExternalPlanarImpulseNewtonsSecond,
  })
}

/* =========================
   Tire Slip Feedback
========================= */
const tireSlipFeedback = createTireSlipFeedback({
  vehicleController,
  car,
  particleSystem,
})

/* =========================
   Simulation Runner
========================= */
const vehicleObstacleSnapshot = {
  position: null,
  worldVelocityMetersPerSecond: null,
  yawRateRadiansPerSecond: 0,
  chassisMassProperties: null,
  wheelStates: null,
}

const fixedSimulationRunner = createFixedTimestepRunner({
  fixedTimeStepSeconds: 1 / 60,
  maxFrameDeltaSeconds: 0.1,
  maxStepsPerFrame: 6,
  step: (fixedDt, simTime) => {
    const input = {
      throttle: keyState.forward ? 1 : 0,
      brake: keyState.backward ? 1 : 0,
      left: keyState.left,
      right: keyState.right,
      handbrake: keyState.handbrake ? 1 : 0,
    }
    const vehicleSnapshot = vehicleController.update(fixedDt, input)

    if (terrainSelection.obstacleField) {
      terrainDeformation.update(
        fixedDt,
        vehicleSnapshot.wheelStates,
        vehicleSnapshot.speedMetersPerSecond
      )
    }

    if (vehicleObstacleInteraction) {
      vehicleObstacleSnapshot.position = vehicleSnapshot.position
      vehicleObstacleSnapshot.worldVelocityMetersPerSecond =
        vehicleSnapshot.worldVelocityMetersPerSecond
      vehicleObstacleSnapshot.yawRateRadiansPerSecond =
        vehicleSnapshot.yawRateRadiansPerSecond
      vehicleObstacleSnapshot.chassisMassProperties =
        vehicleSnapshot.chassisMassProperties
      vehicleObstacleSnapshot.wheelStates = vehicleSnapshot.wheelStates
      vehicleObstacleInteraction.step(fixedDt, vehicleObstacleSnapshot)
    }
  },
})

const clock = new THREE.Clock()
const maxFrameDeltaSeconds = 1 / 30

/* =========================
   HUD Update Functions
========================= */
function updateDriverHUD() {
  const snapshot = vehicleController.getSnapshot()
  driverHUD.update(snapshot)
}

function updateTelemetryPanel() {
  const vehicleSnapshot = vehicleController.getSnapshot()
  // Build comprehensive snapshot for telemetry
  const snapshot = {
    vehicleSnapshot,
    forces: vehicleController.getForcesSnapshot?.() ?? {},
    powertrain: vehicleController.getPowertrainSnapshot?.() ?? {},
    powertrainKinematics: vehicleController.getPowertrainKinematicsSnapshot?.() ?? {},
    rearDifferentialState: vehicleController.getRearDifferentialSnapshot?.() ?? {},
    wheelStates: vehicleSnapshot.wheelStates ?? [],
    lateralSlipSummary: vehicleController.getLateralSlipSnapshot?.() ?? {},
    lateralTireForceSummary: vehicleController.getLateralTireForceSnapshot?.() ?? {},
    loadTransferSummary: vehicleController.getLoadTransferSnapshot?.() ?? {},
    suspensionNormalForceSummary: vehicleController.getSuspensionNormalForceSnapshot?.() ?? {},
    chassisAttitude: vehicleController.getChassisAttitudeSnapshot?.() ?? {},
    slopeGravity: vehicleController.getSlopeGravitySnapshot?.() ?? {},
  }
  telemetryPanel.update(snapshot)
}

function updateControlPanel() {
  const snapshot = vehicleController.getSnapshot()
  controlPanel.update(snapshot)
}

/* =========================
   Water Visuals Helper
========================= */
function createWaterVisuals(waterSurface) {
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
    obstacleVisuals.updateObstacleTransforms()
    const wheelContactPoints = (vehicleSnapshot.wheelStates || [])
      .map((wheelState) => (wheelState ? wheelState.contactPointWorldPosition : null))
      .filter(Boolean)
    obstacleVisuals.updateContactVisuals(wheelContactPoints)
  }

  if (deformationVisuals) {
    deformationVisuals.update(clampedRenderDeltaSeconds)
  }

  if (waterVisuals) {
    waterVisuals.update(clampedRenderDeltaSeconds)
  }

  tireSlipFeedback.update(
    vehicleSnapshot,
    car,
    clampedRenderDeltaSeconds
  )
  tirePressureVisuals.setTargetFromWheelStates(vehicleSnapshot.wheelStates)
  tirePressureVisuals.update(clampedRenderDeltaSeconds)

  // Update all UI panels
  updateDriverHUD()
  updateTelemetryPanel()
  updateControlPanel()

  renderer.render(scene, camera)
}

function sanitizeRenderDeltaSeconds(frameDeltaSeconds) {
  if (!Number.isFinite(frameDeltaSeconds) || frameDeltaSeconds <= 0) return 0
  return Math.min(frameDeltaSeconds, maxFrameDeltaSeconds)
}

animate()
