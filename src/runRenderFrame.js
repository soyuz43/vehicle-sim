// src/runRenderFrame.js

const maxFrameDeltaSeconds = 1 / 30
const uiRefreshIntervalSeconds = 1 / 15
const uiRefreshAccumulators = new WeakMap()

export function runRenderFrame(deps, deltaSeconds) {
  const { simulation, panels, camera, renderer, cameraManager } = deps
  const clampedRenderDeltaSeconds = sanitizeRenderDeltaSeconds(deltaSeconds)
  let uiRefreshAccumulatorSeconds =
    (uiRefreshAccumulators.get(simulation) ?? 0) + clampedRenderDeltaSeconds
  uiRefreshAccumulators.set(simulation, uiRefreshAccumulatorSeconds)

  if (cameraManager) {
    cameraManager.update(clampedRenderDeltaSeconds)
  }
  const vehicleSnapshot = simulation.vehicleController.getSnapshot()

  if (simulation.obstacleVisuals) {
    simulation.obstacleVisuals.updateObstacleTransforms()
    const wheelContactPoints = (vehicleSnapshot.wheelStates || [])
      .map((wheelState) => (wheelState ? wheelState.contactPointWorldPosition : null))
      .filter(Boolean)
    simulation.obstacleVisuals.updateContactVisuals(wheelContactPoints)
  }

  if (simulation.deformationVisuals) {
    simulation.deformationVisuals.update(clampedRenderDeltaSeconds)
  }

  if (simulation.waterVisuals) {
    simulation.waterVisuals.update(clampedRenderDeltaSeconds)
  }

  simulation.tireSlipFeedback.update(
    vehicleSnapshot,
    simulation.car,
    clampedRenderDeltaSeconds
  )
  simulation.tirePressureVisuals.setTargetFromWheelStates(vehicleSnapshot.wheelStates)
  simulation.tirePressureVisuals.update(clampedRenderDeltaSeconds)

  if (uiRefreshAccumulatorSeconds >= uiRefreshIntervalSeconds) {
    uiRefreshAccumulatorSeconds %= uiRefreshIntervalSeconds
    uiRefreshAccumulators.set(simulation, uiRefreshAccumulatorSeconds)
    panels.driverHUD.update(vehicleSnapshot)
    panels.telemetryPanel.update(vehicleSnapshot)
    panels.controlPanel.update(vehicleSnapshot)
  }

  renderer.render(simulation.scene, camera)
}

function sanitizeRenderDeltaSeconds(frameDeltaSeconds) {
  if (!Number.isFinite(frameDeltaSeconds) || frameDeltaSeconds <= 0) return 0
  return Math.min(frameDeltaSeconds, maxFrameDeltaSeconds)
}
