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
import { createControllerConfig } from './vehicle/config/applyVehicleConfiguration.js'
import { createDefaultVehicleConfiguration } from './vehicle/config/createVehicleConfiguration.js'
import { createCustomizationUI } from './vehicle/ui/createCustomizationUI.js'
import { createGearIndicator } from './ui/gearIndicator/createGearIndicator.js'
import { createTireInflationPanel } from './ui/tireInflationPanel/createTireInflationPanel.js'
import { createDeveloperTuningPanel } from './ui/developerTuningPanel/createDeveloperTuningPanel.js'
import { createTireSlipFeedback } from './effects/tireSlipFeedback/createTireSlipFeedback.js'
import { createFixedTimestepRunner } from './simulation/createFixedTimestepRunner.js'
import { createTerrainDeformation } from './terrain/deformation/createTerrainDeformation.js'
import { createDeformationVisuals } from './terrain/deformation/createDeformationVisuals.js'
import { createVehicleObstacleInteraction } from './terrain/obstacles/createVehicleObstacleInteraction.js'
import { createParticleSystem } from './effects/createParticleSystem.js'

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
//
// Phase 3 terrain deformation field is created up front and passed into the
// selection so the offroad obstacle-aware profile can fold rut depth into both
// the physics contact and the mesh. It is inert for the proving-ground path.
const terrainDeformation = createTerrainDeformation()
const terrainSelection = createTerrainSelection({ deformationField: terrainDeformation })
const terrainSurfaceProfile = terrainSelection.surfaceProfile

const terrain = createTerrain({
  surfaceProfile: terrainSurfaceProfile,
})
scene.add(terrain)

// Phase 3 terrain deformation visuals (offroad only; updates the mesh in the
// active rut region, no-op until deformation accrues).
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
// Phase 4 vehicle customization (offroad modes only). The proving-ground path
// keeps the original controller creation unchanged: buildVehicleControllerConfig
// returns the same { vehicle, terrainContactQuery } shape when no configuration is
// supplied, so behavior is byte-identical to prior merged phases.
const isOffroadMode =
  terrainSelection.name === 'offroad' || terrainSelection.name === 'offroad-water'

function buildVehicleControllerConfig(configuration) {
  if (!configuration) {
    return { vehicle: car, terrainContactQuery }
  }
  return createControllerConfig(configuration, {
    vehicle: car,
    terrainContactQuery,
    startPosition: new THREE.Vector3(0, 0, 0),
    startRotation: new THREE.Euler(0, 0, 0),
  })
}

let activeVehicleConfiguration = isOffroadMode ? createDefaultVehicleConfiguration() : null
let vehicleController = createVehicleController(buildVehicleControllerConfig(activeVehicleConfiguration))

function rebuildVehicleController(configuration) {
  activeVehicleConfiguration = configuration
  vehicleController = createVehicleController(buildVehicleControllerConfig(configuration))
  return vehicleController.getSnapshot()
}

const tireSlipFeedback = createTireSlipFeedback({
  maxWheelEffects: vehicleController.getSnapshot().wheelStates.length,
})
scene.add(tireSlipFeedback.root)

// Phase 3 visual-only particle system (deterministic, does not affect physics).
const particleSystem = createParticleSystem({ maxParticles: 2000 })
scene.add(particleSystem.object3D)

// Phase 3 movable-obstacle momentum exchange (offroad only). Steps obstacle
// dynamics and resolves wheel/obstacle contacts; reacts on the vehicle through
// the controller's external impulse API and emits debris particles on impact.
let vehicleObstacleInteraction = null
if (terrainSelection.obstacleField) {
  vehicleObstacleInteraction = createVehicleObstacleInteraction({
    obstacleField: terrainSelection.obstacleField,
    terrainHeightFn: (worldXMeters, worldZMeters) =>
      terrainSelection.baseProfile.getHeightAtWorldXZ(worldXMeters, worldZMeters),
    applyVehiclePlanarImpulse: (impulseWorldXNewtonsSecond, impulseWorldZNewtonsSecond, yawImpulseNewtonMetersSecond) =>
      vehicleController.applyExternalPlanarImpulseNewtonsSecond(
        impulseWorldXNewtonsSecond,
        impulseWorldZNewtonsSecond,
        yawImpulseNewtonMetersSecond
      ),
    getVehicleMassProperties: () => vehicleController.getSnapshot().chassisMassProperties,
    emitEffect: (event) => particleSystem.emit(event.kind, event.x, event.y, event.z, 2),
  })
}

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
    if (terrainSelection.obstacleField) {
      const snapshot = vehicleController.getSnapshot()
      if (terrainDeformation) {
        terrainDeformation.update(
          stepDeltaSeconds,
          snapshot.wheelStates,
          snapshot.speedMetersPerSecond
        )
      }
      if (vehicleObstacleInteraction) {
        vehicleObstacleInteraction.step(stepDeltaSeconds, snapshot)
      }
      if (terrainDeformation && deformationVisuals) {
        deformationVisuals.update()
      }
      if (particleSystem) {
        emitWheelSurfaceParticles(snapshot)
        particleSystem.step(stepDeltaSeconds)
      }
    }
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
   Phase 4 Vehicle Customization UI (offroad modes only)
   Explorer-facing component builder. It never touches physics directly; slot
   changes rebuild the vehicle controller from the new configuration and reset
   restores the default configuration + simulation state. The proving-ground
   path never creates this panel, so its behavior is unchanged.
========================= */
let customizationUI = null

if (isOffroadMode) {
  customizationUI = createCustomizationUI({
    configuration: activeVehicleConfiguration,
    onChange: (nextConfiguration) => {
      rebuildVehicleController(nextConfiguration)
    },
    onReset: () => {
      const defaultConfiguration = createDefaultVehicleConfiguration()
      rebuildVehicleController(defaultConfiguration)
      customizationUI.setConfiguration(defaultConfiguration)
    },
  })
}

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
    obstacleVisuals.updateObstacleTransforms()
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

/* =========================
   Phase 3 Wheel-Surface Particle Emission
   Deterministic, physics-event driven. Emits visual-only spray/dust/debris
   from grounded wheel contacts on water/soft surfaces. The sub-step cadence
   keeps the pool fed a reproducible stream; emission never alters sim state.
========================= */
let particleEmitStepCounter = 0

function emitWheelSurfaceParticles(snapshot) {
  if (!particleSystem) return
  particleEmitStepCounter += 1
  const wheelStates = Array.isArray(snapshot.wheelStates) ? snapshot.wheelStates : []
  const speedMetersPerSecond = Number.isFinite(snapshot.speedMetersPerSecond)
    ? snapshot.speedMetersPerSecond
    : 0

  for (let index = 0; index < wheelStates.length; index += 1) {
    const wheelState = wheelStates[index]
    if (!wheelState || !wheelState.isGrounded) continue
    const contact = wheelState.contactPointWorldPosition
    if (!contact || !Number.isFinite(contact.x)) continue
    if (((particleEmitStepCounter + index) % 3) !== 0) continue

    const kind = particleKindForSurface(wheelState.surfaceKind)
    if (kind === 'water-spray') {
      particleSystem.emit(kind, contact.x, Number.isFinite(contact.y) ? contact.y : 0, contact.z, 2)
    } else if (kind && speedMetersPerSecond > 1.5) {
      particleSystem.emit(kind, contact.x, Number.isFinite(contact.y) ? contact.y : 0, contact.z, 1)
    }
  }
}

function particleKindForSurface(surfaceKind) {
  switch (surfaceKind) {
    case 'water': return 'water-spray'
    case 'mud': return 'mud'
    case 'dirt':
    case 'sand':
    case 'grass': return 'dust'
    case 'snow': return 'snow'
    default: return null
  }
}
