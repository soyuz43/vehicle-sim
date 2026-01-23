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
renderer.setPixelRatio(window.devicePixelRatio)
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

  // Press C to cycle camera modes
  if (e.code === 'KeyC') {
    cameraManager.cycleMode()
  }
})

window.addEventListener('keyup', (e) => {
  keys[e.code] = false
})

/* =========================
   Car Movement (placeholder)
========================= */
function updateCarMovement() {
  const moveSpeed = 0.2
  const turnSpeed = 0.04

  // W should move "forward" (away from the chase cam behind the car)
  if (keys['KeyW']) car.translateZ(moveSpeed)

  // S should move "backward" (toward the chase cam behind the car)
  if (keys['KeyS']) car.translateZ(-moveSpeed)

  if (keys['KeyA']) car.rotation.y += turnSpeed
  if (keys['KeyD']) car.rotation.y -= turnSpeed
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

  updateCarMovement()
  cameraManager.update()

  renderer.render(scene, camera)
}

animate()
