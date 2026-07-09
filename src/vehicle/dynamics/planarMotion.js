// src/vehicle/dynamics/planarMotion.js

import * as THREE from 'three'

const YAW_RATE_EPSILON_RADIANS_PER_SECOND = 0.0001
const YAW_ACCELERATION_EPSILON_RADIANS_PER_SECOND_SQUARED = 0.0001

export function createPlanarMotionState(config = {}) {
  const state = {
    yawRadians: config.yawRadians ?? 0,
    yawRateRadiansPerSecond: 0,
    yawAccelerationRadiansPerSecondSquared: 0,
    worldVelocityMetersPerSecond:
      config.worldVelocityMetersPerSecond ?? new THREE.Vector3(),
    planarAccelerationWorldMetersPerSecondSquared: new THREE.Vector3(),
    forwardWorld: new THREE.Vector3(),
    rightWorld: new THREE.Vector3(),
    localForwardVelocityMetersPerSecond: 0,
    localLateralVelocityMetersPerSecond: 0,
    signedForwardSpeedMetersPerSecond: 0,
    lateralSpeedMetersPerSecond: 0,
    worldSpeedMetersPerSecond: 0,
    planarAccelerationLocalForwardMetersPerSecondSquared: 0,
    planarAccelerationLocalLateralMetersPerSecondSquared: 0,
  }

  resetPlanarMotionState(state, {
    yawRadians: state.yawRadians,
  })

  return state
}

export function resetPlanarMotionState(state, config = {}) {
  state.yawRadians = config.yawRadians ?? 0
  state.yawRateRadiansPerSecond = 0
  state.yawAccelerationRadiansPerSecondSquared = 0
  state.worldVelocityMetersPerSecond.set(0, 0, 0)
  state.planarAccelerationWorldMetersPerSecondSquared.set(0, 0, 0)
  state.planarAccelerationLocalForwardMetersPerSecondSquared = 0
  state.planarAccelerationLocalLateralMetersPerSecondSquared = 0

  updatePlanarBasisFromYaw(state)
  updatePlanarVelocityTelemetry(state)
}

export function updatePlanarBasisFromYaw(state) {
  const sinYaw = Math.sin(state.yawRadians)
  const cosYaw = Math.cos(state.yawRadians)

  state.forwardWorld.set(sinYaw, 0, cosYaw)
  state.rightWorld.set(cosYaw, 0, -sinYaw)
}

export function updatePlanarVelocityTelemetry(state) {
  const worldVelocity = state.worldVelocityMetersPerSecond
  worldVelocity.y = 0

  state.localForwardVelocityMetersPerSecond =
    worldVelocity.dot(state.forwardWorld)
  state.localLateralVelocityMetersPerSecond =
    worldVelocity.dot(state.rightWorld)
  state.signedForwardSpeedMetersPerSecond =
    state.localForwardVelocityMetersPerSecond
  state.lateralSpeedMetersPerSecond =
    state.localLateralVelocityMetersPerSecond
  state.worldSpeedMetersPerSecond = Math.sqrt(
    worldVelocity.x * worldVelocity.x + worldVelocity.z * worldVelocity.z
  )
}

export function setPlanarLocalVelocity(
  state,
  localForwardVelocityMetersPerSecond,
  localLateralVelocityMetersPerSecond
) {
  state.worldVelocityMetersPerSecond
    .copy(state.forwardWorld)
    .multiplyScalar(localForwardVelocityMetersPerSecond)
    .addScaledVector(state.rightWorld, localLateralVelocityMetersPerSecond)
  state.worldVelocityMetersPerSecond.y = 0

  updatePlanarVelocityTelemetry(state)
}

export function integratePlanarVelocityFromLocalAcceleration(
  state,
  localForwardAccelerationMetersPerSecondSquared,
  localLateralAccelerationMetersPerSecondSquared,
  dt
) {
  state.planarAccelerationLocalForwardMetersPerSecondSquared =
    localForwardAccelerationMetersPerSecondSquared
  state.planarAccelerationLocalLateralMetersPerSecondSquared =
    localLateralAccelerationMetersPerSecondSquared

  state.planarAccelerationWorldMetersPerSecondSquared
    .copy(state.forwardWorld)
    .multiplyScalar(localForwardAccelerationMetersPerSecondSquared)
    .addScaledVector(
      state.rightWorld,
      localLateralAccelerationMetersPerSecondSquared
    )
  state.planarAccelerationWorldMetersPerSecondSquared.y = 0

  if (dt > 0) {
    state.worldVelocityMetersPerSecond.addScaledVector(
      state.planarAccelerationWorldMetersPerSecondSquared,
      dt
    )
    state.worldVelocityMetersPerSecond.y = 0
  }

  updatePlanarVelocityTelemetry(state)
}

export function integratePlanarVelocityFromWorldAcceleration(
  state,
  worldAccelerationXMetersPerSecondSquared,
  worldAccelerationZMetersPerSecondSquared,
  dt
) {
  state.planarAccelerationWorldMetersPerSecondSquared.set(
    sanitizeNumber(worldAccelerationXMetersPerSecondSquared),
    0,
    sanitizeNumber(worldAccelerationZMetersPerSecondSquared)
  )
  state.planarAccelerationLocalForwardMetersPerSecondSquared =
    state.planarAccelerationWorldMetersPerSecondSquared.dot(state.forwardWorld)
  state.planarAccelerationLocalLateralMetersPerSecondSquared =
    state.planarAccelerationWorldMetersPerSecondSquared.dot(state.rightWorld)

  if (dt > 0) {
    state.worldVelocityMetersPerSecond.addScaledVector(
      state.planarAccelerationWorldMetersPerSecondSquared,
      dt
    )
    state.worldVelocityMetersPerSecond.y = 0
  }

  updatePlanarVelocityTelemetry(state)
}

export function integrateYawRate(state, yawRateRadiansPerSecond, dt) {
  const previousYawRateRadiansPerSecond = state.yawRateRadiansPerSecond

  state.yawRateRadiansPerSecond = yawRateRadiansPerSecond
  state.yawAccelerationRadiansPerSecondSquared =
    dt > 0
      ? (yawRateRadiansPerSecond - previousYawRateRadiansPerSecond) / dt
      : 0

  if (dt > 0) {
    state.yawRadians += state.yawRateRadiansPerSecond * dt
  }

  updatePlanarBasisFromYaw(state)
  updatePlanarVelocityTelemetry(state)
}

export function integrateYawAcceleration(
  state,
  yawAccelerationRadiansPerSecondSquared,
  yawRateDampingPerSecond,
  maxYawRateRadiansPerSecond,
  dt
) {
  state.yawAccelerationRadiansPerSecondSquared = sanitizeNumber(
    yawAccelerationRadiansPerSecondSquared
  )

  if (dt > 0) {
    state.yawRateRadiansPerSecond +=
      state.yawAccelerationRadiansPerSecondSquared * dt

    if (Number.isFinite(yawRateDampingPerSecond) && yawRateDampingPerSecond > 0) {
      state.yawRateRadiansPerSecond *= Math.max(
        0,
        1 - yawRateDampingPerSecond * dt
      )
    }

    if (Number.isFinite(maxYawRateRadiansPerSecond) && maxYawRateRadiansPerSecond > 0) {
      state.yawRateRadiansPerSecond = THREE.MathUtils.clamp(
        state.yawRateRadiansPerSecond,
        -maxYawRateRadiansPerSecond,
        maxYawRateRadiansPerSecond
      )
    }

    if (
      Math.abs(state.yawRateRadiansPerSecond) <
        YAW_RATE_EPSILON_RADIANS_PER_SECOND &&
      Math.abs(state.yawAccelerationRadiansPerSecondSquared) <
        YAW_ACCELERATION_EPSILON_RADIANS_PER_SECOND_SQUARED
    ) {
      state.yawRateRadiansPerSecond = 0
    }

    state.yawRadians += state.yawRateRadiansPerSecond * dt
  }

  updatePlanarBasisFromYaw(state)
  updatePlanarVelocityTelemetry(state)
}

export function integratePlanarPosition(position, state, dt) {
  if (dt <= 0) return

  position.addScaledVector(state.worldVelocityMetersPerSecond, dt)
}

function sanitizeNumber(value) {
  return Number.isFinite(value) ? value : 0
}