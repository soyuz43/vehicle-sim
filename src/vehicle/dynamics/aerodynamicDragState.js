// src/vehicle/dynamics/aerodynamicDragState.js

export function createAerodynamicDragState() {
  return {
    enabled: false,
    airDensityKgPerCubicMeter: 0,
    dragCoefficient: 0,
    frontalAreaSquareMeters: 0,
    dragAreaSquareMeters: 0,
    speedMetersPerSecond: 0,
    dragForceNewtons: 0,
    dragForceWorldXNewtons: 0,
    dragForceWorldZNewtons: 0,
    dragAccelerationMetersPerSecondSquared: 0,
  }
}

export function calculateAerodynamicDragState(
  config = {},
  worldVelocityMetersPerSecond = {},
  massKg = 0
) {
  return updateAerodynamicDragState(
    createAerodynamicDragState(),
    config,
    worldVelocityMetersPerSecond,
    massKg
  )
}

export function updateAerodynamicDragState(
  state,
  config = {},
  worldVelocityMetersPerSecond = {},
  massKg = 0
) {
  state.enabled =
    config.enabled === true || config.aerodynamicDragEnabled === true
  state.airDensityKgPerCubicMeter = sanitizeNonNegativeNumber(
    config.airDensityKgPerCubicMeter
  )
  state.dragCoefficient = sanitizeNonNegativeNumber(config.dragCoefficient)
  state.frontalAreaSquareMeters = sanitizeNonNegativeNumber(
    config.frontalAreaSquareMeters
  )

  const dragAreaSquareMeters =
    state.dragCoefficient * state.frontalAreaSquareMeters
  state.dragAreaSquareMeters = Number.isFinite(dragAreaSquareMeters)
    ? dragAreaSquareMeters
    : 0

  const velocityXMetersPerSecond = sanitizeFiniteNumber(
    worldVelocityMetersPerSecond.x
  )
  const velocityZMetersPerSecond = sanitizeFiniteNumber(
    worldVelocityMetersPerSecond.z
  )
  const maximumVelocityComponentMetersPerSecond = Math.max(
    Math.abs(velocityXMetersPerSecond),
    Math.abs(velocityZMetersPerSecond)
  )
  const scaledVelocityX =
    maximumVelocityComponentMetersPerSecond > 0
      ? velocityXMetersPerSecond / maximumVelocityComponentMetersPerSecond
      : 0
  const scaledVelocityZ =
    maximumVelocityComponentMetersPerSecond > 0
      ? velocityZMetersPerSecond / maximumVelocityComponentMetersPerSecond
      : 0
  const scaledSpeed = Math.hypot(scaledVelocityX, scaledVelocityZ)
  const rawSpeedMetersPerSecond =
    maximumVelocityComponentMetersPerSecond * scaledSpeed
  const directionX = scaledSpeed > 0 ? scaledVelocityX / scaledSpeed : 0
  const directionZ = scaledSpeed > 0 ? scaledVelocityZ / scaledSpeed : 0

  state.speedMetersPerSecond = Number.isFinite(rawSpeedMetersPerSecond)
    ? rawSpeedMetersPerSecond
    : 0
  resetDragForce(state)

  if (
    !state.enabled ||
    !Number.isFinite(rawSpeedMetersPerSecond) ||
    rawSpeedMetersPerSecond === 0 ||
    state.airDensityKgPerCubicMeter === 0 ||
    state.dragAreaSquareMeters === 0
  ) {
    return state
  }

  const dragForceNewtons =
    0.5 *
    state.airDensityKgPerCubicMeter *
    state.dragAreaSquareMeters *
    state.speedMetersPerSecond *
    state.speedMetersPerSecond

  if (!Number.isFinite(dragForceNewtons)) return state

  state.dragForceNewtons = dragForceNewtons
  state.dragForceWorldXNewtons = -state.dragForceNewtons * directionX
  state.dragForceWorldZNewtons = -state.dragForceNewtons * directionZ

  const safeMassKg = sanitizePositiveNumber(massKg, 1)
  const dragAccelerationMetersPerSecondSquared =
    state.dragForceNewtons / safeMassKg
  state.dragAccelerationMetersPerSecondSquared = Number.isFinite(
    dragAccelerationMetersPerSecondSquared
  )
    ? dragAccelerationMetersPerSecondSquared
    : 0

  return state
}

function resetDragForce(state) {
  state.dragForceNewtons = 0
  state.dragForceWorldXNewtons = 0
  state.dragForceWorldZNewtons = 0
  state.dragAccelerationMetersPerSecondSquared = 0
}

function sanitizeFiniteNumber(value) {
  return Number.isFinite(value) ? value : 0
}

function sanitizeNonNegativeNumber(value) {
  if (!Number.isFinite(value) || value <= 0) return 0
  return value
}

function sanitizePositiveNumber(value, fallbackValue) {
  return Number.isFinite(value) && value > 0 ? value : fallbackValue
}
