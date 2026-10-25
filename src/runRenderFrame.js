// src/runRenderFrame.js

const maxFrameDeltaSeconds = 1 / 30
const uiRefreshIntervalSeconds = 1 / 15
const uiRefreshAccumulators = new WeakMap()

export function runRenderFrame(deps, deltaSeconds) {
  const { simulation, panels, camera, renderer, cameraManager, shadowLight } = deps
  const clampedRenderDeltaSeconds = sanitizeRenderDeltaSeconds(deltaSeconds)
  let uiRefreshAccumulatorSeconds =
    (uiRefreshAccumulators.get(simulation) ?? 0) + clampedRenderDeltaSeconds
  uiRefreshAccumulators.set(simulation, uiRefreshAccumulatorSeconds)

  if (cameraManager) {
    cameraManager.update(clampedRenderDeltaSeconds)
  }
  // The shadow light follows whichever simulation owns the frame.
  const followTarget =
    simulation.mode === 'rocket' && simulation.rocketSystem
      ? simulation.rocketSystem.getRocketGroup()
      : simulation.car
  if (shadowLight?.userData?.shadowFollowOffsetMeters && followTarget?.position) {
    const followPosition = followTarget.position
    const shadowFollowOffsetMeters = shadowLight.userData.shadowFollowOffsetMeters
    shadowLight.target.position.copy(followPosition)
    shadowLight.position.set(
      followPosition.x + shadowFollowOffsetMeters.x,
      followPosition.y + shadowFollowOffsetMeters.y,
      followPosition.z + shadowFollowOffsetMeters.z
    )
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
    const rocketTelemetry = simulation.rocketSystem ? simulation.rocketSystem.getTelemetry() : null;
    panels.telemetryPanel.update(vehicleSnapshot)
    panels.telemetryPanel.updateRocketTelemetry?.(rocketTelemetry)
    panels.controlPanel.update(vehicleSnapshot)
    if (panels.rocketPanel && simulation.rocketSystem) {
      panels.rocketPanel.update(simulation.rocketSystem.getTelemetry())
    }
  }

  renderer.render(simulation.scene, camera)
}

function sanitizeRenderDeltaSeconds(frameDeltaSeconds) {
  if (!Number.isFinite(frameDeltaSeconds) || frameDeltaSeconds <= 0) return 0
  return Math.min(frameDeltaSeconds, maxFrameDeltaSeconds)
}
