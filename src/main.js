import * as THREE from 'three'
import { createTerrain } from './terrain/createTerrain.js'
import { createCar } from './car/createCar.js'
import { CameraManager } from './controls/CameraManager.js'

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
   Keyboard Input
========================= */
const keys = {}

window.addEventListener('keydown', (e) => {
  keys[e.code] = true
  if (e.code === 'KeyC') {
    cameraManager.cycleMode()
  }
})

window.addEventListener('keyup', (e) => {
  keys[e.code] = false
})

/* =========================
   Car Physics Constants
   (Units per Second)
========================= */
const PHYSICS = {
  maxSpeed: 40.0,      // Max units per second
  acceleration: 20.0,  // Speed increase per second
  friction: 15.0,      // Deceleration per second
  turnSpeed: 2.5       // Radians per second
}

// Internal state
let currentSpeed = 0
const clock = new THREE.Clock()

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

  renderer.render(scene, camera)
}

animate()