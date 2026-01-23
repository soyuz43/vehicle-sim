import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

/**
 * ORBIT CAMERA (smoothly follows car + interactive orbit)
 */
export function createOrbitCameraControls(camera, renderer, targetObject) {
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false
  controls.enableZoom = false
  controls.maxPolarAngle = Math.PI / 2.2
  controls.minDistance = 5
  controls.maxDistance = 50

  const tempTarget = new THREE.Vector3()

  function update() {
    targetObject.getWorldPosition(tempTarget)
    controls.target.lerp(tempTarget, 0.1) // Smooth follow
    controls.update()
  }

  return {
    update,
    controls // optional: expose raw OrbitControls instance
  }
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

  function update() {
    const carWorldPos = new THREE.Vector3()
    targetObject.getWorldPosition(carWorldPos)

    const carQuaternion = new THREE.Quaternion()
    targetObject.getWorldQuaternion(carQuaternion)

    const offsetWorld = offset.clone().applyQuaternion(carQuaternion)
    desiredPosition.copy(carWorldPos).add(offsetWorld)

    camera.position.lerp(desiredPosition, smoothness)

    currentLookAt.lerp(carWorldPos, smoothness)
    camera.lookAt(currentLookAt)
  }

  return { update }
}

/**
 * FIRST-PERSON CAMERA
 * Locks camera to a cockpit-like view from the car
 */
export function createFirstPersonCameraControls(camera, targetObject, config = {}) {
  const localOffset = config.offset || new THREE.Vector3(0, 0.8, 1.0)

  const cockpitPos = new THREE.Vector3()
  const cockpitQuat = new THREE.Quaternion()

  function update() {
    targetObject.getWorldPosition(cockpitPos)
    targetObject.getWorldQuaternion(cockpitQuat)

    const worldOffset = localOffset.clone().applyQuaternion(cockpitQuat)
    camera.position.copy(cockpitPos).add(worldOffset)
    camera.quaternion.copy(cockpitQuat)
  }

  return { update }
}
