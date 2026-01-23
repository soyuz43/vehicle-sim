// src/controls/cameraControls.js
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

export function createOrbitCameraControls(camera, renderer, targetObject) {
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false
  controls.enableZoom = false
  controls.maxPolarAngle = Math.PI / 2.2
  controls.minDistance = 5
  controls.maxDistance = 50

  controls.target.copy(targetObject.position)
  controls.update()

  return controls
}
