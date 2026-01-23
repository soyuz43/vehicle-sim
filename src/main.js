import * as THREE from 'three'
import './style.css'

// --- Scene ---
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x87ceeb) // sky blue

// --- Camera ---
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
)
camera.position.set(0, 5, 10)
camera.lookAt(0, 0, 0)

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(window.devicePixelRatio)
renderer.shadowMap.enabled = true
document.body.appendChild(renderer.domElement)

// --- Lights ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
scene.add(ambientLight)

const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
directionalLight.position.set(10, 20, 10)
directionalLight.castShadow = true
scene.add(directionalLight)

// --- Terrain ---
import { createTerrain } from './terrain/createTerrain.js'
const terrain = createTerrain()
scene.add(terrain)

// --- Resize Handling ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// --- Animation Loop ---
function animate() {
  requestAnimationFrame(animate)

  // future: physics step here
  // future: car.update(delta)

  renderer.render(scene, camera)
}

animate()
