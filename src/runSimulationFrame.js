// src/runSimulationFrame.js

export function runSimulationFrame(simulation, deltaSeconds) {
  return simulation.fixedSimulationRunner.update(deltaSeconds)
}

export function stepSimulation(simulation, fixedDt) {
  const { input, keyState, vehicleController } = simulation
  input.throttle = keyState.forward ? 1 : 0
  input.brake = keyState.backward ? 1 : 0
  input.left = keyState.left
  input.right = keyState.right
  input.handbrake = keyState.handbrake ? 1 : 0
  const vehicleSnapshot = vehicleController.update(fixedDt, input)

  if (simulation.terrainSelection.obstacleField) {
    simulation.terrainDeformation.update(
      fixedDt,
      vehicleSnapshot.wheelStates,
      vehicleSnapshot.speedMetersPerSecond
    )
  }

  if (simulation.vehicleObstacleInteraction) {
    const obstacleSnapshot = simulation.vehicleObstacleSnapshot
    obstacleSnapshot.position = vehicleSnapshot.position
    obstacleSnapshot.worldVelocityMetersPerSecond =
      vehicleSnapshot.worldVelocityMetersPerSecond
    obstacleSnapshot.yawRateRadiansPerSecond =
      vehicleSnapshot.yawRateRadiansPerSecond
    obstacleSnapshot.chassisMassProperties =
      vehicleSnapshot.chassisMassProperties
    obstacleSnapshot.wheelStates = vehicleSnapshot.wheelStates
    simulation.vehicleObstacleInteraction.step(fixedDt, obstacleSnapshot)
  }
}
