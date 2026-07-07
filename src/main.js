// src/main.js

import * as THREE from 'three'
import { createTerrain } from './terrain/createTerrain.js'
import { createCar } from './car/createCar.js'
import { CameraManager } from './controls/CameraManager.js'
import { createDebugHud } from './ui/debugHud/createDebugHud.js'

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
   Car Physics Constants
   (Units per Second)
========================= */
const PHYSICS = {
  maxSpeed: 60.0,      // Max units per second
  acceleration: 24.0,  // Speed increase per second
  friction: 30.0,      // Deceleration per second
  turnSpeed: 2.5,      // Radians per second
}

// Internal state
let currentSpeed = 0
const clock = new THREE.Clock()

const carStartPosition = new THREE.Vector3(0, 0, 0)
const carStartRotation = new THREE.Euler(0, 0, 0)

/* =========================
   Reset
========================= */
function resetCar() {
  currentSpeed = 0

  car.position.copy(carStartPosition)
  car.rotation.copy(carStartRotation)
  car.userData.velocity.set(0, 0, 0)

  cameraManager.setMode(cameraManager.activeMode ?? 'orbit')
  updateDebugHud(0)
}

/* =========================
   Debug HUD
========================= */
function updateDebugHud(dt) {
  const pos = car.position

  const outsideTerrain =
    Math.abs(pos.x) > terrainInfo.halfSize ||
    Math.abs(pos.z) > terrainInfo.halfSize

  debugHud.update({
    cameraMode: cameraManager.activeMode,
    dt,
    position: pos,
    speedScalar: currentSpeed,
    velocity: car.userData.velocity,
    terrainSize: terrainInfo.size,
    outsideTerrain,
  })
}

/* =========================
   Car Movement Logic
========================= */
function updateCarMovement(dt) {
  // 1. Acceleration / Deceleration (Time-based)
  if (keys['KeyW']) {
    currentSpeed += PHYSICS.acceleration * dt
  } else if (keys['KeyS']) {
    currentSpeed -= PHYSICS.acceleration * dt
  } else {
    // Friction
    const decel = PHYSICS.friction * dt
    if (currentSpeed > 0) {
      currentSpeed = Math.max(0, currentSpeed - decel)
    } else if (currentSpeed < 0) {
      currentSpeed = Math.min(0, currentSpeed + decel)
    }
  }

  // 2. Clamp Speed
  currentSpeed = THREE.MathUtils.clamp(
    currentSpeed,
    -PHYSICS.maxSpeed,
    PHYSICS.maxSpeed
  )

  // 3. Steering (Time-based)
  if (Math.abs(currentSpeed) > 0.1) {
    const turnAmount = PHYSICS.turnSpeed * dt
    if (keys['KeyA']) car.rotation.y += turnAmount
    if (keys['KeyD']) car.rotation.y -= turnAmount
  }

  // 4. Apply Position Change (Distance = Speed * Time)
  car.translateZ(currentSpeed * dt)

  // 5. UPDATE VELOCITY FOR CAMERA (Zero-Allocation)
  // We reuse the existing vector instead of creating a new one.
  // This is the specific fix for the "GC Stutter".
  const v = car.userData.velocity
  v.set(0, 0, 1)
  v.applyQuaternion(car.quaternion)
  v.multiplyScalar(currentSpeed)
  // Note: We store "Units per Second" in velocity, which matches what
  // the camera controller expects for its physics calculations.
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

  // Get precise time since last frame (in seconds)
  const dt = clock.getDelta()

  // Update Car and Camera using the exact same delta time
  updateCarMovement(dt)
  cameraManager.update(dt)
  updateDebugHud(dt)

  renderer.render(scene, camera)
}

animate()