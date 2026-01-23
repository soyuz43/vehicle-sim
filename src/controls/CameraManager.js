import {
  createOrbitCameraControls,
  createChaseCameraControls,
  createFirstPersonCameraControls
} from './cameraControls.js'

export class CameraManager {
  constructor(camera, renderer, car) {
    this.camera = camera
    this.car = car

    this.modes = {
      orbit: createOrbitCameraControls(camera, renderer, car),
      chase: createChaseCameraControls(camera, car),
      fp: createFirstPersonCameraControls(camera, car)
    }

    this.modeOrder = ['orbit', 'chase', 'fp']
    this.currentIndex = 0
    this.activeMode = this.modeOrder[this.currentIndex]
  }

  cycleMode() {
    this.currentIndex =
      (this.currentIndex + 1) % this.modeOrder.length
    this.activeMode = this.modeOrder[this.currentIndex]
    console.log('Camera mode:', this.activeMode)
  }

  update() {
    const mode = this.modes[this.activeMode]
    if (mode && mode.update) {
      mode.update()
    }
  }
}
