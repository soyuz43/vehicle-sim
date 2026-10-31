// src/physics/Collision.js

import * as THREE from 'three'

const _scratchZeroPositionMeters = new THREE.Vector3()
const _scratchIdentityQuaternion = new THREE.Quaternion()
const _identityTransform = {
  positionMeters: _scratchZeroPositionMeters,
  orientationQuaternion: _scratchIdentityQuaternion,
}

const _scratchCenterA = new THREE.Vector3()
const _scratchCenterB = new THREE.Vector3()
const _scratchCenterDelta = new THREE.Vector3()
const _scratchNormal = new THREE.Vector3()
const _scratchContactPoint = new THREE.Vector3()
const _scratchTemporary = new THREE.Vector3()
const _scratchInverseOrientation = new THREE.Quaternion()
const _scratchSphereCenterLocal = new THREE.Vector3()
const _scratchBoxPointLocal = new THREE.Vector3()
const _scratchCapsuleAxisA = new THREE.Vector3()
const _scratchCapsuleAxisB = new THREE.Vector3()
const _scratchSegmentAStart = new THREE.Vector3()
const _scratchSegmentAEnd = new THREE.Vector3()
const _scratchSegmentBStart = new THREE.Vector3()
const _scratchSegmentBEnd = new THREE.Vector3()
const _scratchSegmentDirectionA = new THREE.Vector3()
const _scratchSegmentDirectionB = new THREE.Vector3()
const _scratchSegmentOffset = new THREE.Vector3()
const _scratchClosestPointA = new THREE.Vector3()
const _scratchClosestPointB = new THREE.Vector3()
const _scratchPerpendicularSeed = new THREE.Vector3()
const _scratchHalfExtentsA = new THREE.Vector3()
const _scratchHalfExtentsB = new THREE.Vector3()
const _scratchCandidateAxis = new THREE.Vector3()
const _scratchBestNormal = new THREE.Vector3()
const _scratchSupportPointA = new THREE.Vector3()
const _scratchSupportPointB = new THREE.Vector3()
const _scratchBoxAxesA = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
const _scratchBoxAxesB = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
let _minimumPenetrationDepth = Infinity

export function testCollision(shapeA, transformA, shapeB, transformB) {
  const typeA = shapeA?.type
  const typeB = shapeB?.type

  if (typeA === 'sphere' && typeB === 'sphere') {
    return collideSphereSphere(shapeA, transformA, shapeB, transformB)
  }
  if (typeA === 'sphere' && typeB === 'box') {
    return collideSphereBox(shapeA, transformA, shapeB, transformB)
  }
  if (typeA === 'box' && typeB === 'sphere') {
    return invertContact(collideSphereBox(shapeB, transformB, shapeA, transformA))
  }
  if (typeA === 'sphere' && typeB === 'capsule') {
    return collideSphereCapsule(shapeA, transformA, shapeB, transformB)
  }
  if (typeA === 'capsule' && typeB === 'sphere') {
    return invertContact(collideSphereCapsule(shapeB, transformB, shapeA, transformA))
  }
  if (typeA === 'capsule' && typeB === 'capsule') {
    return collideCapsuleCapsule(shapeA, transformA, shapeB, transformB)
  }
  if (typeA === 'box' && typeB === 'box') {
    return collideBoxBox(shapeA, transformA, shapeB, transformB)
  }

  throw new TypeError(
    'Unsupported collision pair: ' + (typeA || 'unknown') + ' vs ' + (typeB || 'unknown')
  )
}

function collideSphereSphere(sphereA, transformA, sphereB, transformB) {
  _scratchCenterA.copy(getPosition(resolveTransform(sphereA, transformA)))
  _scratchCenterB.copy(getPosition(resolveTransform(sphereB, transformB)))
  _scratchCenterDelta.subVectors(_scratchCenterB, _scratchCenterA)

  const radiusSum = sphereA.radius + sphereB.radius
  const distanceSquared = _scratchCenterDelta.lengthSq()
  if (distanceSquared > radiusSum * radiusSum) return null

  const distance = Math.sqrt(distanceSquared)
  if (distance > 0) {
    _scratchNormal.copy(_scratchCenterDelta).multiplyScalar(1 / distance)
  } else {
    _scratchNormal.set(1, 0, 0)
  }

  const depth = radiusSum - distance
  _scratchContactPoint
    .copy(_scratchCenterA)
    .addScaledVector(_scratchNormal, sphereA.radius - depth * 0.5)
  return createContact(depth)
}

function collideSphereBox(sphere, sphereTransform, box, boxTransform) {
  const worldBoxTransform = resolveTransform(box, boxTransform)
  _scratchCenterA.copy(getPosition(resolveTransform(sphere, sphereTransform)))
  _scratchCenterB.copy(getPosition(worldBoxTransform))
  _scratchSphereCenterLocal
    .copy(_scratchCenterA)
    .sub(_scratchCenterB)
    .applyQuaternion(
      _scratchInverseOrientation.copy(getOrientation(worldBoxTransform)).invert()
    )

  const halfExtents = box.halfExtents
  _scratchBoxPointLocal.set(
    THREE.MathUtils.clamp(_scratchSphereCenterLocal.x, -halfExtents.x, halfExtents.x),
    THREE.MathUtils.clamp(_scratchSphereCenterLocal.y, -halfExtents.y, halfExtents.y),
    THREE.MathUtils.clamp(_scratchSphereCenterLocal.z, -halfExtents.z, halfExtents.z)
  )
  _scratchTemporary
    .copy(_scratchBoxPointLocal)
    .applyQuaternion(getOrientation(worldBoxTransform))
    .add(_scratchCenterB)
  _scratchCenterDelta.subVectors(_scratchTemporary, _scratchCenterA)

  const distanceSquared = _scratchCenterDelta.lengthSq()
  const radiusSquared = sphere.radius * sphere.radius
  if (distanceSquared > radiusSquared) return null

  if (distanceSquared > 0) {
    const distance = Math.sqrt(distanceSquared)
    _scratchNormal.copy(_scratchCenterDelta).multiplyScalar(1 / distance)
    _scratchContactPoint.copy(_scratchTemporary)
    return createContact(sphere.radius - distance)
  }

  const distanceToXFace = halfExtents.x - Math.abs(_scratchSphereCenterLocal.x)
  const distanceToYFace = halfExtents.y - Math.abs(_scratchSphereCenterLocal.y)
  const distanceToZFace = halfExtents.z - Math.abs(_scratchSphereCenterLocal.z)
  _scratchBoxPointLocal.copy(_scratchSphereCenterLocal)

  if (distanceToXFace <= distanceToYFace && distanceToXFace <= distanceToZFace) {
    const faceSign = _scratchSphereCenterLocal.x < 0 ? -1 : 1
    _scratchBoxPointLocal.x = faceSign * halfExtents.x
    _scratchNormal.set(-faceSign, 0, 0)
    _scratchTemporary.x = distanceToXFace
  } else if (distanceToYFace <= distanceToZFace) {
    const faceSign = _scratchSphereCenterLocal.y < 0 ? -1 : 1
    _scratchBoxPointLocal.y = faceSign * halfExtents.y
    _scratchNormal.set(0, -faceSign, 0)
    _scratchTemporary.x = distanceToYFace
  } else {
    const faceSign = _scratchSphereCenterLocal.z < 0 ? -1 : 1
    _scratchBoxPointLocal.z = faceSign * halfExtents.z
    _scratchNormal.set(0, 0, -faceSign)
    _scratchTemporary.x = distanceToZFace
  }

  _scratchNormal.applyQuaternion(getOrientation(worldBoxTransform))
  _scratchContactPoint
    .copy(_scratchBoxPointLocal)
    .applyQuaternion(getOrientation(worldBoxTransform))
    .add(_scratchCenterB)
  return createContact(sphere.radius + _scratchTemporary.x)
}

function collideSphereCapsule(sphere, sphereTransform, capsule, capsuleTransform) {
  _scratchCenterA.copy(getPosition(resolveTransform(sphere, sphereTransform)))
  setCapsuleSegment(
    capsule,
    capsuleTransform,
    _scratchSegmentBStart,
    _scratchSegmentBEnd,
    _scratchCapsuleAxisB
  )
  _scratchSegmentDirectionB.subVectors(_scratchSegmentBEnd, _scratchSegmentBStart)
  _scratchTemporary.subVectors(_scratchCenterA, _scratchSegmentBStart)

  const segmentLengthSquared = _scratchSegmentDirectionB.lengthSq()
  const segmentParameter = segmentLengthSquared > 0
    ? clamp01(_scratchTemporary.dot(_scratchSegmentDirectionB) / segmentLengthSquared)
    : 0
  _scratchClosestPointB
    .copy(_scratchSegmentBStart)
    .addScaledVector(_scratchSegmentDirectionB, segmentParameter)
  _scratchCenterDelta.subVectors(_scratchClosestPointB, _scratchCenterA)

  const radiusSum = sphere.radius + capsule.radius
  const distanceSquared = _scratchCenterDelta.lengthSq()
  if (distanceSquared > radiusSum * radiusSum) return null

  const distance = Math.sqrt(distanceSquared)
  if (distance > 0) {
    _scratchNormal.copy(_scratchCenterDelta).multiplyScalar(1 / distance)
  } else {
    setDeterministicPerpendicular(_scratchNormal, _scratchCapsuleAxisB)
  }

  const depth = radiusSum - distance
  _scratchContactPoint
    .copy(_scratchCenterA)
    .addScaledVector(_scratchNormal, sphere.radius - depth * 0.5)
  return createContact(depth)
}

function collideCapsuleCapsule(capsuleA, transformA, capsuleB, transformB) {
  setCapsuleSegment(
    capsuleA,
    transformA,
    _scratchSegmentAStart,
    _scratchSegmentAEnd,
    _scratchCapsuleAxisA
  )
  setCapsuleSegment(
    capsuleB,
    transformB,
    _scratchSegmentBStart,
    _scratchSegmentBEnd,
    _scratchCapsuleAxisB
  )
  _scratchSegmentDirectionA.subVectors(_scratchSegmentAEnd, _scratchSegmentAStart)
  _scratchSegmentDirectionB.subVectors(_scratchSegmentBEnd, _scratchSegmentBStart)
  _scratchSegmentOffset.subVectors(_scratchSegmentAStart, _scratchSegmentBStart)
  closestPointsOnSegments()
  _scratchCenterDelta.subVectors(_scratchClosestPointB, _scratchClosestPointA)

  const radiusSum = capsuleA.radius + capsuleB.radius
  const distanceSquared = _scratchCenterDelta.lengthSq()
  if (distanceSquared > radiusSum * radiusSum) return null

  const distance = Math.sqrt(distanceSquared)
  if (distance > 0) {
    _scratchNormal.copy(_scratchCenterDelta).multiplyScalar(1 / distance)
  } else {
    const fallbackAxis = _scratchSegmentDirectionA.lengthSq() >= _scratchSegmentDirectionB.lengthSq()
      ? _scratchSegmentDirectionA
      : _scratchSegmentDirectionB
    setDeterministicPerpendicular(_scratchNormal, fallbackAxis)
  }

  const depth = radiusSum - distance
  _scratchContactPoint
    .copy(_scratchClosestPointA)
    .addScaledVector(_scratchNormal, capsuleA.radius - depth * 0.5)
  return createContact(depth)
}

function closestPointsOnSegments() {
  const segmentLengthASquared = _scratchSegmentDirectionA.lengthSq()
  const segmentLengthBSquared = _scratchSegmentDirectionB.lengthSq()
  const offsetProjectionOnB = _scratchSegmentDirectionB.dot(_scratchSegmentOffset)

  let parameterA = 0
  let parameterB = 0

  if (segmentLengthASquared <= 0 && segmentLengthBSquared <= 0) {
    _scratchClosestPointA.copy(_scratchSegmentAStart)
    _scratchClosestPointB.copy(_scratchSegmentBStart)
    return
  }

  if (segmentLengthASquared <= 0) {
    parameterB = clamp01(offsetProjectionOnB / segmentLengthBSquared)
  } else {
    const offsetProjectionOnA = _scratchSegmentDirectionA.dot(_scratchSegmentOffset)
    if (segmentLengthBSquared <= 0) {
      parameterA = clamp01(-offsetProjectionOnA / segmentLengthASquared)
    } else {
      const directionDot = _scratchSegmentDirectionA.dot(_scratchSegmentDirectionB)
      const denominator =
        segmentLengthASquared * segmentLengthBSquared - directionDot * directionDot
      parameterA = denominator !== 0
        ? clamp01(
            (directionDot * offsetProjectionOnB - offsetProjectionOnA * segmentLengthBSquared) /
              denominator
          )
        : 0
      parameterB =
        (directionDot * parameterA + offsetProjectionOnB) / segmentLengthBSquared

      if (parameterB < 0) {
        parameterB = 0
        parameterA = clamp01(-offsetProjectionOnA / segmentLengthASquared)
      } else if (parameterB > 1) {
        parameterB = 1
        parameterA = clamp01(
          (directionDot - offsetProjectionOnA) / segmentLengthASquared
        )
      }
    }
  }

  _scratchClosestPointA
    .copy(_scratchSegmentAStart)
    .addScaledVector(_scratchSegmentDirectionA, parameterA)
  _scratchClosestPointB
    .copy(_scratchSegmentBStart)
    .addScaledVector(_scratchSegmentDirectionB, parameterB)
}

function collideBoxBox(boxA, transformA, boxB, transformB) {
  const worldTransformA = resolveTransform(boxA, transformA)
  const worldTransformB = resolveTransform(boxB, transformB)
  _scratchCenterA.copy(getPosition(worldTransformA))
  _scratchCenterB.copy(getPosition(worldTransformB))
  _scratchCenterDelta.subVectors(_scratchCenterB, _scratchCenterA)
  _scratchHalfExtentsA.copy(boxA.halfExtents)
  _scratchHalfExtentsB.copy(boxB.halfExtents)
  setBoxAxes(getOrientation(worldTransformA), _scratchBoxAxesA)
  setBoxAxes(getOrientation(worldTransformB), _scratchBoxAxesB)
  _minimumPenetrationDepth = Infinity

  for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
    if (!evaluateSatAxis(_scratchBoxAxesA[axisIndex])) return null
  }
  for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
    if (!evaluateSatAxis(_scratchBoxAxesB[axisIndex])) return null
  }
  for (let axisIndexA = 0; axisIndexA < 3; axisIndexA += 1) {
    for (let axisIndexB = 0; axisIndexB < 3; axisIndexB += 1) {
      _scratchCandidateAxis.crossVectors(
        _scratchBoxAxesA[axisIndexA],
        _scratchBoxAxesB[axisIndexB]
      )
      if (!evaluateSatAxis(_scratchCandidateAxis)) return null
    }
  }

  _scratchSupportPointA.copy(_scratchCenterA)
  _scratchSupportPointB.copy(_scratchCenterB)
  for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
    const axisA = _scratchBoxAxesA[axisIndex]
    const axisB = _scratchBoxAxesB[axisIndex]
    const projectionA = axisA.dot(_scratchBestNormal)
    const projectionB = axisB.dot(_scratchBestNormal)
    const halfExtentA = _scratchHalfExtentsA.getComponent(axisIndex)
    const halfExtentB = _scratchHalfExtentsB.getComponent(axisIndex)
    _scratchSupportPointA.addScaledVector(
      axisA,
      projectionA >= 0 ? halfExtentA : -halfExtentA
    )
    _scratchSupportPointB.addScaledVector(
      axisB,
      projectionB <= 0 ? halfExtentB : -halfExtentB
    )
  }
  _scratchContactPoint
    .copy(_scratchSupportPointA)
    .add(_scratchSupportPointB)
    .multiplyScalar(0.5)
  _scratchNormal.copy(_scratchBestNormal)
  return createContact(_minimumPenetrationDepth)
}

function evaluateSatAxis(axis) {
  const axisLengthSquared = axis.lengthSq()
  if (axisLengthSquared === 0) return true

  const projectionA0 = axis.dot(_scratchBoxAxesA[0])
  const projectionA1 = axis.dot(_scratchBoxAxesA[1])
  const projectionA2 = axis.dot(_scratchBoxAxesA[2])
  const projectionB0 = axis.dot(_scratchBoxAxesB[0])
  const projectionB1 = axis.dot(_scratchBoxAxesB[1])
  const projectionB2 = axis.dot(_scratchBoxAxesB[2])
  const radiusA =
    _scratchHalfExtentsA.x * Math.abs(projectionA0) +
    _scratchHalfExtentsA.y * Math.abs(projectionA1) +
    _scratchHalfExtentsA.z * Math.abs(projectionA2)
  const radiusB =
    _scratchHalfExtentsB.x * Math.abs(projectionB0) +
    _scratchHalfExtentsB.y * Math.abs(projectionB1) +
    _scratchHalfExtentsB.z * Math.abs(projectionB2)
  const signedCenterDistance = _scratchCenterDelta.dot(axis)
  const overlap = radiusA + radiusB - Math.abs(signedCenterDistance)
  if (overlap < 0) return false

  const penetrationDepth = overlap / Math.sqrt(axisLengthSquared)
  if (penetrationDepth < _minimumPenetrationDepth) {
    const orientationSign = signedCenterDistance < 0 ? -1 : 1
    _scratchBestNormal.copy(axis).multiplyScalar(
      orientationSign / Math.sqrt(axisLengthSquared)
    )
    _minimumPenetrationDepth = penetrationDepth
  }
  return true
}

function setBoxAxes(orientationQuaternion, axes) {
  axes[0].set(1, 0, 0).applyQuaternion(orientationQuaternion)
  axes[1].set(0, 1, 0).applyQuaternion(orientationQuaternion)
  axes[2].set(0, 0, 1).applyQuaternion(orientationQuaternion)
}

function setCapsuleSegment(capsule, transform, start, end, axis) {
  const worldTransform = resolveTransform(capsule, transform)
  const position = getPosition(worldTransform)
  axis.set(0, 1, 0).applyQuaternion(getOrientation(worldTransform))
  start.copy(position).addScaledVector(axis, -capsule.halfHeight)
  end.copy(position).addScaledVector(axis, capsule.halfHeight)
}

function setDeterministicPerpendicular(target, direction) {
  if (direction.lengthSq() === 0) {
    target.set(1, 0, 0)
    return
  }

  const absoluteX = Math.abs(direction.x)
  const absoluteY = Math.abs(direction.y)
  const absoluteZ = Math.abs(direction.z)
  if (absoluteX <= absoluteY && absoluteX <= absoluteZ) {
    _scratchPerpendicularSeed.set(1, 0, 0)
  } else if (absoluteY <= absoluteZ) {
    _scratchPerpendicularSeed.set(0, 1, 0)
  } else {
    _scratchPerpendicularSeed.set(0, 0, 1)
  }
  target.crossVectors(direction, _scratchPerpendicularSeed).normalize()
}

function createContact(depth) {
  return {
    normal: _scratchNormal.clone(),
    depth,
    point: _scratchContactPoint.clone(),
  }
}

function invertContact(contact) {
  if (contact) {
    contact.normal.set(
      contact.normal.x === 0 ? 0 : -contact.normal.x,
      contact.normal.y === 0 ? 0 : -contact.normal.y,
      contact.normal.z === 0 ? 0 : -contact.normal.z
    )
  }
  return contact
}

function resolveTransform(shape, transform) {
  return transform ?? shape.worldTransform ?? _identityTransform
}

function getPosition(transform) {
  return transform.positionMeters ?? transform.position ?? _scratchZeroPositionMeters
}

function getOrientation(transform) {
  return transform.orientationQuaternion ?? transform.quaternion ?? _scratchIdentityQuaternion
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value))
}
