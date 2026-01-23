import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

/**
 * ORBIT CAMERA (interactive orbit + smoothly follows car)
 *
 * Why it was "inverted":
 * - Previously, the camera's initial pose was effectively coming from world-space setup
 *   (e.g., camera.position = (0,15,30) in main.js) and/or from whatever the last camera mode left behind.
 * - When switching modes, OrbitControls would inherit a "good" pose from chase cam (behind the car),
 *   making it look like orbit was correct only AFTER toggling.
 *
 * How this fixes it long-term:
 * - On enter(), we compute a car-relative "behind + above" camera pose using the car's WORLD forward vector.
 * - This works even if the car starts rotated, and it guarantees startup orbit == re-enter orbit.
 * - We do not assume any hard-coded world Z direction for "behind".
 */
export function createOrbitCameraControls(camera, renderer, targetObject, config = {}) {
  const controls = new OrbitControls(camera, renderer.domElement)

  controls.enableDamping = true
  controls.enablePan = false
  controls.enableZoom = false
  controls.maxPolarAngle = Math.PI / 2.2
  controls.minDistance = 5
  controls.maxDistance = 50

  // Configurable orbit placement relative to car
  const distance = config.distance ?? 18          // how far behind
  const height = config.height ?? 8               // how high above
  const lookHeight = config.lookHeight ?? 1.0     // look slightly above the ground
  const followLerp = config.followLerp ?? 0.12    // smooth follow of target

  // IMPORTANT: forward axis convention.
  // If your car's "forward" is +Z (common in three, and matches translateZ(+speed) forward),
  // keep (0,0,1). If your model faces -Z, flip to (0,0,-1).
  const forwardAxisLocal = config.forwardAxisLocal?.clone() ?? new THREE.Vector3(0, 0, 1)

  // Scratch objects to avoid per-frame allocations
  const carPos = new THREE.Vector3()
  const carQuat = new THREE.Quaternion()
  const forwardWorld = new THREE.Vector3()
  const desiredCamPos = new THREE.Vector3()
  const desiredTarget = new THREE.Vector3()

  function computeDesiredPose() {
    targetObject.getWorldPosition(carPos)
    targetObject.getWorldQuaternion(carQuat)

    // Forward direction in world space derived from car orientation
    forwardWorld.copy(forwardAxisLocal).applyQuaternion(carQuat).normalize()

    // Desired target (car position + a bit upward so you orbit around "body" not ground)
    desiredTarget.copy(carPos).addScaledVector(THREE.Object3D.DEFAULT_UP, lookHeight)

    // Camera behind the car = carPos + up*height - forward*distance
    desiredCamPos
      .copy(carPos)
      .addScaledVector(THREE.Object3D.DEFAULT_UP, height)
      .addScaledVector(forwardWorld, -distance)
  }

  function enter() {
    // Snap orbit to a consistent "behind and above" pose
    computeDesiredPose()

    camera.position.copy(desiredCamPos)
    controls.target.copy(desiredTarget)

    // OrbitControls needs update() after manual pose changes
    controls.update()

    controls.enabled = true
  }

  function exit() {
    controls.enabled = false
  }

  function update() {
    // Keep orbit centered on the moving car smoothly
    computeDesiredPose()
    controls.target.lerp(desiredTarget, followLerp)
    controls.update()
  }

  return { enter, exit, update, controls }
}

/**
 * CHASE CAMERA
 * Smoothly follows behind and above the vehicle
 */
export function createChaseCameraControls(camera, targetObject, config = {}) {
  const offset = config.offset || new THREE.Vector3(0, 5, -10)
  const smoothness = config.smoothness || 0.05

  const desiredPosition = new THREE.Vector3()
  const currentLookAt = new THREE.Vector3()

  // scratch (avoid allocations each frame)
  const carWorldPos = new THREE.Vector3()
  const carQuaternion = new THREE.Quaternion()
  const offsetWorld = new THREE.Vector3()

  function enter() {}
  function exit() {}

  function update() {
    targetObject.getWorldPosition(carWorldPos)
    targetObject.getWorldQuaternion(carQuaternion)

    offsetWorld.copy(offset).applyQuaternion(carQuaternion)
    desiredPosition.copy(carWorldPos).add(offsetWorld)

    camera.position.lerp(desiredPosition, smoothness)

    currentLookAt.lerp(carWorldPos, smoothness)
    camera.lookAt(currentLookAt)
  }

  return { enter, exit, update }
}

/**
 * FIRST-PERSON CAMERA
 * Locks camera to a cockpit-like view from the car
 */
export function createFirstPersonCameraControls(camera, targetObject, config = {}) {
  const localOffset = config.offset || new THREE.Vector3(0, 0.8, 1.0)

  const cockpitPos = new THREE.Vector3()
  const cockpitQuat = new THREE.Quaternion()
  const worldOffset = new THREE.Vector3()

  function enter() {}
  function exit() {}

  function update() {
    targetObject.getWorldPosition(cockpitPos)
    targetObject.getWorldQuaternion(cockpitQuat)

    worldOffset.copy(localOffset).applyQuaternion(cockpitQuat)
    camera.position.copy(cockpitPos).add(worldOffset)
    camera.quaternion.copy(cockpitQuat)
  }

  return { enter, exit, update }
}
