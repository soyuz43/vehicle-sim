// src/vehicle/dynamics/contactPlaneBasisState.js

import * as THREE from 'three'

const BASIS_EPSILON = 1e-8

export function updateWheelContactPlaneBasis(
  wheelState,
  planarMotion
) {
  ensureWheelBasisVectors(wheelState)

  const normalWorld = wheelState.contactNormalWorld
  const forwardWorld = planarMotion?.forwardWorld
  const rightWorld = planarMotion?.rightWorld

  wheelState.isContactTangentBasisValid = false

  if (
    wheelState.isGrounded !== true ||
    !isFiniteVector3(normalWorld) ||
    !isFiniteVector3(forwardWorld) ||
    !isFiniteVector3(rightWorld)
  ) {
    setFallbackBasis(wheelState)
    return wheelState
  }

  wheelState.contactNormalWorld.copy(normalWorld)
  if (wheelState.contactNormalWorld.lengthSq() <= BASIS_EPSILON) {
    setFallbackBasis(wheelState)
    return wheelState
  }
  wheelState.contactNormalWorld.normalize()

  const steeringAngleRadians = sanitizeNumber(
    wheelState.steeringAngleRadians
  )
  const steeringCos = Math.cos(steeringAngleRadians)
  const steeringSin = Math.sin(steeringAngleRadians)

  wheelState.wheelForwardWorld
    .copy(forwardWorld)
    .multiplyScalar(steeringCos)
    .addScaledVector(rightWorld, steeringSin)

  wheelState.contactForwardTangentWorld
    .copy(wheelState.wheelForwardWorld)
    .addScaledVector(
      wheelState.contactNormalWorld,
      -wheelState.wheelForwardWorld.dot(wheelState.contactNormalWorld)
    )

  if (wheelState.contactForwardTangentWorld.lengthSq() <= BASIS_EPSILON) {
    wheelState.contactForwardTangentWorld
      .copy(forwardWorld)
      .addScaledVector(
        wheelState.contactNormalWorld,
        -forwardWorld.dot(wheelState.contactNormalWorld)
      )
  }

  if (wheelState.contactForwardTangentWorld.lengthSq() <= BASIS_EPSILON) {
    setFallbackBasis(wheelState)
    return wheelState
  }

  wheelState.contactForwardTangentWorld.normalize()
  wheelState.contactLateralTangentWorld
    .crossVectors(
      wheelState.contactNormalWorld,
      wheelState.contactForwardTangentWorld
    )
    .normalize()

  if (wheelState.contactLateralTangentWorld.lengthSq() <= BASIS_EPSILON) {
    setFallbackBasis(wheelState)
    return wheelState
  }

  wheelState.isContactTangentBasisValid = true
  return wheelState
}

export function updateWheelContactPatchPlanarVelocity(
  wheelState,
  planarMotion
) {
  ensureWheelBasisVectors(wheelState)

  const velocityWorld = planarMotion?.worldVelocityMetersPerSecond
  const forwardWorld = planarMotion?.forwardWorld
  const rightWorld = planarMotion?.rightWorld

  wheelState.contactPatchVelocityWorld.set(0, 0, 0)

  if (
    !isFiniteVector3(velocityWorld) ||
    !isFiniteVector3(forwardWorld) ||
    !isFiniteVector3(rightWorld)
  ) {
    return wheelState
  }

  const contactPatchLocal =
    wheelState.contactPatchLocal ?? wheelState.localPosition
  const wheelOffsetRightMeters = sanitizeNumber(contactPatchLocal?.x)
  const wheelOffsetForwardMeters = sanitizeNumber(contactPatchLocal?.z)
  const yawRateRadiansPerSecond = sanitizeNumber(
    planarMotion?.yawRateRadiansPerSecond
  )

  wheelState.contactPatchVelocityWorld
    .copy(velocityWorld)
    .addScaledVector(
      forwardWorld,
      -yawRateRadiansPerSecond * wheelOffsetRightMeters
    )
    .addScaledVector(
      rightWorld,
      yawRateRadiansPerSecond * wheelOffsetForwardMeters
    )
  wheelState.contactPatchVelocityWorld.y = 0

  return wheelState
}

function ensureWheelBasisVectors(wheelState) {
  if (!wheelState.wheelForwardWorld?.isVector3) {
    wheelState.wheelForwardWorld = new THREE.Vector3(0, 0, 1)
  }
  if (!wheelState.contactForwardTangentWorld?.isVector3) {
    wheelState.contactForwardTangentWorld = new THREE.Vector3(0, 0, 1)
  }
  if (!wheelState.contactLateralTangentWorld?.isVector3) {
    wheelState.contactLateralTangentWorld = new THREE.Vector3(1, 0, 0)
  }
  if (!wheelState.contactPatchVelocityWorld?.isVector3) {
    wheelState.contactPatchVelocityWorld = new THREE.Vector3()
  }
}

function setFallbackBasis(wheelState) {
  wheelState.wheelForwardWorld.set(0, 0, 1)
  wheelState.contactForwardTangentWorld.set(0, 0, 1)
  wheelState.contactLateralTangentWorld.set(1, 0, 0)
  wheelState.isContactTangentBasisValid = false
}

function isFiniteVector3(vector) {
  return (
    vector?.isVector3 &&
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  )
}

function sanitizeNumber(value) {
  return Number.isFinite(value) ? value : 0
}
