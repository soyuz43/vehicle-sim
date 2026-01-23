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

    // --- Camera modes ---
    this.modes = {
      orbit: createOrbitCameraControls(camera, renderer, car, {
        // If your car ever appears "facing" the orbit camera,
        // flip this to new THREE.Vector3(0, 0, -1)
        forwardAxisLocal: new THREE.Vector3(0, 0, 1)
      }),
      chase: createChaseCameraControls(camera, car),
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

    console.log('Camera mode:', this.activeMode)
  }

  /**
   * Cycle to the next camera mode (used by 'C' key)
   */
  cycleMode() {
    this.currentIndex =
      (this.currentIndex + 1) % this.modeOrder.length
    this.setMode(this.modeOrder[this.currentIndex])
  }

  /**
   * Per-frame update (called from main animation loop)
   */
  update() {
    const mode = this.modes[this.activeMode]
    if (mode && mode.update) {
      mode.update()
    }
  }
}
