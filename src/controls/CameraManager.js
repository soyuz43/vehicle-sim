import * as THREE from 'three'
import {
  createOrbitCameraControls,
  createChaseCameraControls,
  createFirstPersonCameraControls
} from './cameraControls.js'

export class CameraManager {
  constructor(camera, renderer, car) {
    this.camera = camera
    this.car = car
    this.renderer = renderer

    this.handleWheel = this.handleWheel.bind(this)
    this.renderer.domElement.addEventListener('wheel', this.handleWheel, {
      passive: false,
    })

    // --- Camera modes ---
    this.modes = {
      orbit: createOrbitCameraControls(camera, renderer, car, {
        // If your car ever appears "facing" the orbit camera,
        // flip this to new THREE.Vector3(0, 0, -1)
        forwardAxisLocal: new THREE.Vector3(0, 0, 1)
      }),
      chase: createChaseCameraControls(camera, car, {
        // Tweak chase parameters here if needed
        baseDistance: 12.0,
        baseHeight: 5.5
      }),
      fp: createFirstPersonCameraControls(camera, car)
    }

    // --- Mode order for cycling ---
    this.modeOrder = ['orbit', 'chase', 'fp']
    this.currentIndex = 0
    this.activeMode = null

    // --- IMPORTANT ---
    // Force an explicit enter() on startup so orbit camera
    // is initialized BEHIND the car, not inherited from main.js
    this.setMode(this.modeOrder[this.currentIndex])
  }

  /**
   * Switch to a specific camera mode.
   * Handles clean exit/enter so camera state never leaks.
   */
  setMode(modeName) {
    if (!this.modes[modeName]) {
      console.warn(`Camera mode "${modeName}" does not exist.`)
      return
    }

    // Exit previous mode cleanly
    if (this.activeMode && this.modes[this.activeMode]?.exit) {
      this.modes[this.activeMode].exit()
    }

    this.activeMode = modeName

    // Enter new mode (snaps orbit behind car, etc.)
    if (this.modes[this.activeMode]?.enter) {
      this.modes[this.activeMode].enter()
    }

  }

  /**
   * Cycle to the next camera mode (used by 'C' key)
   */
  cycleMode() {
    this.currentIndex =
      (this.currentIndex + 1) % this.modeOrder.length
    this.setMode(this.modeOrder[this.currentIndex])
  }

  handleWheel(event) {
    event.preventDefault()
    this.zoom(event.deltaY)
  }

  zoom(deltaY) {
    const mode = this.modes[this.activeMode]

    if (!mode?.zoom) return

    mode.zoom(deltaY)
  }

  /**
   * Per-frame update (called from main animation loop)
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    const mode = this.modes[this.activeMode]
    if (mode && mode.update) {
      mode.update(dt)
    }
  }
}
