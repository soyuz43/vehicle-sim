// src/car/segmentBetweenPoints.js

import * as THREE from 'three'

const DEFAULT_MINIMUM_LENGTH_METERS = 0.000001
const DEFAULT_LOCAL_LENGTH_AXIS = new THREE.Vector3(0, 1, 0)
const DEFAULT_FALLBACK_DIRECTION = new THREE.Vector3(1, 0, 0)

export function createSegmentBetweenPointsState(options = {}) {
  const localLengthAxis = copyFiniteDirection(
    new THREE.Vector3(),
    options.localLengthAxis,
    DEFAULT_LOCAL_LENGTH_AXIS
  )
  const fallbackDirection = copyFiniteDirection(
    new THREE.Vector3(),
    options.fallbackDirection,
    DEFAULT_FALLBACK_DIRECTION
  )

  return {
    startLocalMeters: new THREE.Vector3(),
    endLocalMeters: new THREE.Vector3(),
    midpointLocalMeters: new THREE.Vector3(),
    directionLocal: fallbackDirection.clone(),
    localLengthAxis,
    fallbackDirection,
    quaternion: new THREE.Quaternion().setFromUnitVectors(
      localLengthAxis,
      fallbackDirection
    ),
    lengthMeters: DEFAULT_MINIMUM_LENGTH_METERS,
    minimumLengthMeters: sanitizePositiveNumber(
      options.minimumLengthMeters,
      DEFAULT_MINIMUM_LENGTH_METERS
    ),
    isInputFinite: false,
    isDegenerate: true,
    isFinite: true,
  }
}

export function updateSegmentBetweenPointsState(
  state,
  startLocalMeters,
  endLocalMeters
) {
  if (!state) return null

  const isInputFinite =
    hasFiniteVector3(startLocalMeters) && hasFiniteVector3(endLocalMeters)
  state.isInputFinite = isInputFinite

  if (!isInputFinite) {
    state.isDegenerate = true
    state.isFinite = hasFiniteSegmentState(state)
    return state
  }

  state.startLocalMeters.copy(startLocalMeters)
  state.endLocalMeters.copy(endLocalMeters)
  state.midpointLocalMeters
    .copy(startLocalMeters)
    .add(endLocalMeters)
    .multiplyScalar(0.5)
  state.directionLocal.copy(endLocalMeters).sub(startLocalMeters)

  const endpointSeparationMeters = state.directionLocal.length()
  state.isDegenerate =
    !Number.isFinite(endpointSeparationMeters) ||
    endpointSeparationMeters < state.minimumLengthMeters

  if (state.isDegenerate) {
    state.directionLocal.copy(state.fallbackDirection)
    state.lengthMeters = state.minimumLengthMeters
  } else {
    state.directionLocal.multiplyScalar(1 / endpointSeparationMeters)
    state.fallbackDirection.copy(state.directionLocal)
    state.lengthMeters = endpointSeparationMeters
  }

  state.quaternion.setFromUnitVectors(
    state.localLengthAxis,
    state.directionLocal
  )
  state.isFinite = hasFiniteSegmentState(state)

  if (!state.isFinite) {
    state.directionLocal.copy(DEFAULT_FALLBACK_DIRECTION)
    state.fallbackDirection.copy(DEFAULT_FALLBACK_DIRECTION)
    state.quaternion.setFromUnitVectors(
      state.localLengthAxis,
      state.fallbackDirection
    )
    state.lengthMeters = state.minimumLengthMeters
    state.isDegenerate = true
    state.isFinite = hasFiniteSegmentState(state)
  }

  return state
}

export function applySegmentBetweenPointsState(segmentNode, state) {
  if (!segmentNode || !state?.isFinite) return false

  segmentNode.position.copy(state.midpointLocalMeters)
  segmentNode.quaternion.copy(state.quaternion)
  segmentNode.scale.set(1, state.lengthMeters, 1)

  return hasFiniteNodeTransform(segmentNode)
}

function copyFiniteDirection(target, source, fallback) {
  if (hasFiniteVector3(source) && source.lengthSq() > Number.EPSILON) {
    return target.copy(source).normalize()
  }

  return target.copy(fallback)
}

function hasFiniteSegmentState(state) {
  return (
    hasFiniteVector3(state.midpointLocalMeters) &&
    hasFiniteVector3(state.directionLocal) &&
    hasFiniteQuaternion(state.quaternion) &&
    Number.isFinite(state.lengthMeters) &&
    state.lengthMeters > 0
  )
}

function hasFiniteNodeTransform(node) {
  return (
    hasFiniteVector3(node.position) &&
    hasFiniteQuaternion(node.quaternion) &&
    hasFiniteVector3(node.scale)
  )
}

function hasFiniteVector3(value) {
  return (
    value?.isVector3 === true &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  )
}

function hasFiniteQuaternion(value) {
  return (
    value?.isQuaternion === true &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z) &&
    Number.isFinite(value.w)
  )
}

function sanitizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}
