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
const _scratchHalfExtentsAMeters = new THREE.Vector3()
const _scratchHalfExtentsBMeters = new THREE.Vector3()
const _scratchCandidateAxis = new THREE.Vector3()
const _scratchBestNormal = new THREE.Vector3()
const _scratchFeatureAxis = new THREE.Vector3()
const _scratchOutsideAxes = []
const _scratchFaceCenter = new THREE.Vector3()
const _scratchOppositeFaceCenter = new THREE.Vector3()
const _scratchOppositeFaceNormal = new THREE.Vector3()
const _scratchIncidentFaceCenter = new THREE.Vector3()
const _scratchSupportEdgeCenter = new THREE.Vector3()
const _scratchClipEdge = new THREE.Vector3()
const _scratchClipRelative = new THREE.Vector3()
const _scratchClipPolygonA = Array.from({ length: 16 }, () => new THREE.Vector3())
const _scratchClipPolygonB = Array.from({ length: 16 }, () => new THREE.Vector3())
const _scratchBoxAxesA = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
const _scratchBoxAxesB = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
const BOX_FACE_CORNER_SIGNS = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
let _minimumPenetrationDepthMeters = Infinity
let _minimumPenetrationFeature = 0
let _minimumPenetrationAxisA = 0
let _minimumPenetrationAxisB = 0

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

  const radiusSumMeters = sphereA.radiusMeters + sphereB.radiusMeters
  const distanceMetersSquared = _scratchCenterDelta.lengthSq()
  if (distanceMetersSquared > radiusSumMeters * radiusSumMeters) return null

  const distanceMeters = Math.sqrt(distanceMetersSquared)
  if (distanceMeters > 0) {
    _scratchNormal.copy(_scratchCenterDelta).multiplyScalar(1 / distanceMeters)
  } else {
    _scratchNormal.set(1, 0, 0)
  }

  const depth = radiusSumMeters - distanceMeters
  _scratchContactPoint
    .copy(_scratchCenterA)
    .addScaledVector(_scratchNormal, sphereA.radiusMeters - depth * 0.5)
  return createContact(depth, 'sphere-sphere:center-line')
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

  const halfExtentsMeters = box.halfExtentsMeters
  _scratchBoxPointLocal.set(
    THREE.MathUtils.clamp(_scratchSphereCenterLocal.x, -halfExtentsMeters.x, halfExtentsMeters.x),
    THREE.MathUtils.clamp(_scratchSphereCenterLocal.y, -halfExtentsMeters.y, halfExtentsMeters.y),
    THREE.MathUtils.clamp(_scratchSphereCenterLocal.z, -halfExtentsMeters.z, halfExtentsMeters.z)
  )
  _scratchTemporary
    .copy(_scratchBoxPointLocal)
    .applyQuaternion(getOrientation(worldBoxTransform))
    .add(_scratchCenterB)
  _scratchCenterDelta.subVectors(_scratchTemporary, _scratchCenterA)

  const distanceMetersSquared = _scratchCenterDelta.lengthSq()
  const radiusMetersSquared = sphere.radiusMeters * sphere.radiusMeters
  if (distanceMetersSquared > radiusMetersSquared) return null

  const sphereCenterIsInsideBox =
    Math.abs(_scratchSphereCenterLocal.x) <= halfExtentsMeters.x &&
    Math.abs(_scratchSphereCenterLocal.y) <= halfExtentsMeters.y &&
    Math.abs(_scratchSphereCenterLocal.z) <= halfExtentsMeters.z

  if (!sphereCenterIsInsideBox) {
    const distanceMeters = Math.sqrt(distanceMetersSquared)
    _scratchNormal.copy(_scratchCenterDelta).multiplyScalar(1 / distanceMeters)
    _scratchContactPoint.copy(_scratchTemporary)
    return createContact(
      sphere.radiusMeters - distanceMeters,
      createSphereBoxOutsideFeatureId(halfExtentsMeters)
    )
  }

  const distanceToXFaceMeters = halfExtentsMeters.x - Math.abs(_scratchSphereCenterLocal.x)
  const distanceToYFaceMeters = halfExtentsMeters.y - Math.abs(_scratchSphereCenterLocal.y)
  const distanceToZFaceMeters = halfExtentsMeters.z - Math.abs(_scratchSphereCenterLocal.z)
  _scratchBoxPointLocal.copy(_scratchSphereCenterLocal)
  let featureId = null

  if (distanceToXFaceMeters <= distanceToYFaceMeters && distanceToXFaceMeters <= distanceToZFaceMeters) {
    const faceSign = _scratchSphereCenterLocal.x < 0 ? -1 : 1
    _scratchBoxPointLocal.x = faceSign * halfExtentsMeters.x
    _scratchNormal.set(-faceSign, 0, 0)
    _scratchTemporary.x = distanceToXFaceMeters
    featureId = `sphere-box:inside:face:x${faceSign > 0 ? '+' : '-'}`
  } else if (distanceToYFaceMeters <= distanceToZFaceMeters) {
    const faceSign = _scratchSphereCenterLocal.y < 0 ? -1 : 1
    _scratchBoxPointLocal.y = faceSign * halfExtentsMeters.y
    _scratchNormal.set(0, -faceSign, 0)
    _scratchTemporary.x = distanceToYFaceMeters
    featureId = `sphere-box:inside:face:y${faceSign > 0 ? '+' : '-'}`
  } else {
    const faceSign = _scratchSphereCenterLocal.z < 0 ? -1 : 1
    _scratchBoxPointLocal.z = faceSign * halfExtentsMeters.z
    _scratchNormal.set(0, 0, -faceSign)
    _scratchTemporary.x = distanceToZFaceMeters
    featureId = `sphere-box:inside:face:z${faceSign > 0 ? '+' : '-'}`
  }

  _scratchNormal.applyQuaternion(getOrientation(worldBoxTransform))
  _scratchContactPoint
    .copy(_scratchBoxPointLocal)
    .applyQuaternion(getOrientation(worldBoxTransform))
    .add(_scratchCenterB)
  return createContact(sphere.radiusMeters + _scratchTemporary.x, featureId)
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

  const radiusSumMeters = sphere.radiusMeters + capsule.radiusMeters
  const distanceMetersSquared = _scratchCenterDelta.lengthSq()
  if (distanceMetersSquared > radiusSumMeters * radiusSumMeters) return null

  const distanceMeters = Math.sqrt(distanceMetersSquared)
  if (distanceMeters > 0) {
    _scratchNormal.copy(_scratchCenterDelta).multiplyScalar(1 / distanceMeters)
  } else {
    setDeterministicPerpendicular(_scratchNormal, _scratchCapsuleAxisB)
  }

  const depth = radiusSumMeters - distanceMeters
  _scratchContactPoint
    .copy(_scratchCenterA)
    .addScaledVector(_scratchNormal, sphere.radiusMeters - depth * 0.5)
  return createContact(depth, 'sphere-capsule:segment')
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

  const radiusSumMeters = capsuleA.radiusMeters + capsuleB.radiusMeters
  const distanceMetersSquared = _scratchCenterDelta.lengthSq()
  if (distanceMetersSquared > radiusSumMeters * radiusSumMeters) return null

  const distanceMeters = Math.sqrt(distanceMetersSquared)
  if (distanceMeters > 0) {
    _scratchNormal.copy(_scratchCenterDelta).multiplyScalar(1 / distanceMeters)
  } else {
    _scratchNormal.crossVectors(_scratchSegmentDirectionA, _scratchSegmentDirectionB)
    const segmentLengthASquared = _scratchSegmentDirectionA.lengthSq()
    const segmentLengthBSquared = _scratchSegmentDirectionB.lengthSq()
    const parallelThreshold = segmentLengthASquared * segmentLengthBSquared * 1e-24
    if (_scratchNormal.lengthSq() > parallelThreshold) {
      _scratchNormal.normalize()
    } else {
      const fallbackAxis = segmentLengthASquared >= segmentLengthBSquared
        ? _scratchSegmentDirectionA
        : _scratchSegmentDirectionB
      setDeterministicPerpendicular(_scratchNormal, fallbackAxis)
    }
  }

  const depth = radiusSumMeters - distanceMeters
  _scratchContactPoint
    .copy(_scratchClosestPointA)
    .addScaledVector(_scratchNormal, capsuleA.radiusMeters - depth * 0.5)
  return createContact(depth, 'capsule-capsule:segment-pair')
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
  _scratchHalfExtentsAMeters.copy(boxA.halfExtentsMeters)
  _scratchHalfExtentsBMeters.copy(boxB.halfExtentsMeters)
  setBoxAxes(getOrientation(worldTransformA), _scratchBoxAxesA)
  setBoxAxes(getOrientation(worldTransformB), _scratchBoxAxesB)
  _minimumPenetrationDepthMeters = Infinity
  _minimumPenetrationFeature = 0

  for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
    if (!evaluateSatAxis(_scratchBoxAxesA[axisIndex], 0, axisIndex, -1)) return null
  }
  for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
    if (!evaluateSatAxis(_scratchBoxAxesB[axisIndex], 1, -1, axisIndex)) return null
  }
  for (let axisIndexA = 0; axisIndexA < 3; axisIndexA += 1) {
    for (let axisIndexB = 0; axisIndexB < 3; axisIndexB += 1) {
      _scratchCandidateAxis.crossVectors(
        _scratchBoxAxesA[axisIndexA],
        _scratchBoxAxesB[axisIndexB]
      )
      if (!evaluateSatAxis(_scratchCandidateAxis, 2, axisIndexA, axisIndexB)) return null
    }
  }

  if (_minimumPenetrationFeature === 2) {
    setBoxSupportEdge(
      _scratchCenterA,
      _scratchBoxAxesA,
      _scratchHalfExtentsAMeters,
      _minimumPenetrationAxisA,
      _scratchBestNormal,
      _scratchSegmentAStart,
      _scratchSegmentAEnd
    )
    _scratchSegmentDirectionA.subVectors(_scratchSegmentAEnd, _scratchSegmentAStart)
    setBoxSupportEdge(
      _scratchCenterB,
      _scratchBoxAxesB,
      _scratchHalfExtentsBMeters,
      _minimumPenetrationAxisB,
      _scratchTemporary.copy(_scratchBestNormal).negate(),
      _scratchSegmentBStart,
      _scratchSegmentBEnd
    )
    _scratchSegmentDirectionB.subVectors(_scratchSegmentBEnd, _scratchSegmentBStart)
    _scratchSegmentOffset.subVectors(_scratchSegmentAStart, _scratchSegmentBStart)
    closestPointsOnSegments()
    _scratchContactPoint
      .copy(_scratchClosestPointA)
      .add(_scratchClosestPointB)
      .multiplyScalar(0.5)
  } else if (_minimumPenetrationFeature === 0) {
    setBoxFaceContactPoint(
      _scratchCenterA,
      _scratchBoxAxesA,
      _scratchHalfExtentsAMeters,
      _minimumPenetrationAxisA,
      _scratchBestNormal,
      _scratchCenterB,
      _scratchBoxAxesB,
      _scratchHalfExtentsBMeters,
      _scratchTemporary.copy(_scratchBestNormal).negate()
    )
  } else {
    setBoxFaceContactPoint(
      _scratchCenterB,
      _scratchBoxAxesB,
      _scratchHalfExtentsBMeters,
      _minimumPenetrationAxisB,
      _scratchTemporary.copy(_scratchBestNormal).negate(),
      _scratchCenterA,
      _scratchBoxAxesA,
      _scratchHalfExtentsAMeters,
      _scratchBestNormal
    )
  }
  _scratchNormal.copy(_scratchBestNormal)
  return createContact(
    _minimumPenetrationDepthMeters,
    createBoxBoxFeatureId()
  )
}

function evaluateSatAxis(axis, feature, axisIndexA, axisIndexB) {
  const axisLengthSquared = axis.lengthSq()
  if (axisLengthSquared === 0) return true

  const projectionA0 = axis.dot(_scratchBoxAxesA[0])
  const projectionA1 = axis.dot(_scratchBoxAxesA[1])
  const projectionA2 = axis.dot(_scratchBoxAxesA[2])
  const projectionB0 = axis.dot(_scratchBoxAxesB[0])
  const projectionB1 = axis.dot(_scratchBoxAxesB[1])
  const projectionB2 = axis.dot(_scratchBoxAxesB[2])
  const projectedRadiusAMeters =
    _scratchHalfExtentsAMeters.x * Math.abs(projectionA0) +
    _scratchHalfExtentsAMeters.y * Math.abs(projectionA1) +
    _scratchHalfExtentsAMeters.z * Math.abs(projectionA2)
  const projectedRadiusBMeters =
    _scratchHalfExtentsBMeters.x * Math.abs(projectionB0) +
    _scratchHalfExtentsBMeters.y * Math.abs(projectionB1) +
    _scratchHalfExtentsBMeters.z * Math.abs(projectionB2)
  const signedCenterDistanceMeters = _scratchCenterDelta.dot(axis)
  const overlapMeters =
    projectedRadiusAMeters + projectedRadiusBMeters - Math.abs(signedCenterDistanceMeters)
  if (overlapMeters < 0) return false

  const penetrationDepthMeters = overlapMeters / Math.sqrt(axisLengthSquared)
  if (penetrationDepthMeters < _minimumPenetrationDepthMeters) {
    const orientationSign = signedCenterDistanceMeters < 0 ? -1 : 1
    _scratchBestNormal.copy(axis).multiplyScalar(
      orientationSign / Math.sqrt(axisLengthSquared)
    )
    _minimumPenetrationDepthMeters = penetrationDepthMeters
    _minimumPenetrationFeature = feature
    _minimumPenetrationAxisA = axisIndexA
    _minimumPenetrationAxisB = axisIndexB
  }
  return true
}

function setBoxFaceContactPoint(
  referenceCenter,
  referenceAxes,
  referenceHalfExtentsMeters,
  referenceFaceAxisIndex,
  referenceOutwardNormal,
  incidentCenter,
  incidentAxes,
  incidentHalfExtentsMeters,
  incidentOutwardNormal
) {
  const referenceFaceAxis = referenceAxes[referenceFaceAxisIndex]
  const referenceFaceSign = referenceFaceAxis.dot(referenceOutwardNormal) < 0 ? -1 : 1
  _scratchFaceCenter
    .copy(referenceCenter)
    .addScaledVector(
      referenceFaceAxis,
      referenceFaceSign * referenceHalfExtentsMeters.getComponent(referenceFaceAxisIndex)
    )

  let incidentFaceAxisIndex = 0
  let incidentFaceAlignment = Math.abs(incidentAxes[0].dot(incidentOutwardNormal))
  for (let axisIndex = 1; axisIndex < 3; axisIndex += 1) {
    const alignment = Math.abs(incidentAxes[axisIndex].dot(incidentOutwardNormal))
    if (alignment > incidentFaceAlignment) {
      incidentFaceAxisIndex = axisIndex
      incidentFaceAlignment = alignment
    }
  }

  const incidentFaceAxis = incidentAxes[incidentFaceAxisIndex]
  const incidentFaceSign = incidentFaceAxis.dot(incidentOutwardNormal) < 0 ? -1 : 1
  _scratchIncidentFaceCenter
    .copy(incidentCenter)
    .addScaledVector(
      incidentFaceAxis,
      incidentFaceSign * incidentHalfExtentsMeters.getComponent(incidentFaceAxisIndex)
    )

  const incidentTangentAxisIndexA = (incidentFaceAxisIndex + 1) % 3
  const incidentTangentAxisIndexB = (incidentFaceAxisIndex + 2) % 3
  const incidentTangentAxisA = incidentAxes[incidentTangentAxisIndexA]
  const incidentTangentAxisB = incidentAxes[incidentTangentAxisIndexB]
  const incidentTangentExtentAMeters = incidentHalfExtentsMeters.getComponent(incidentTangentAxisIndexA)
  const incidentTangentExtentBMeters = incidentHalfExtentsMeters.getComponent(incidentTangentAxisIndexB)
  for (let vertexIndex = 0; vertexIndex < 4; vertexIndex += 1) {
    const signs = BOX_FACE_CORNER_SIGNS[vertexIndex]
    _scratchClipPolygonA[vertexIndex]
      .copy(_scratchIncidentFaceCenter)
      .addScaledVector(incidentTangentAxisA, signs[0] * incidentTangentExtentAMeters)
      .addScaledVector(incidentTangentAxisB, signs[1] * incidentTangentExtentBMeters)
  }

  let polygonInput = _scratchClipPolygonA
  let polygonOutput = _scratchClipPolygonB
  let polygonVertexCount = 4
  for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
    if (axisIndex === referenceFaceAxisIndex) continue
    const clipAxis = referenceAxes[axisIndex]
    const clipExtentMeters = referenceHalfExtentsMeters.getComponent(axisIndex)
    for (let directionSign = 1; directionSign >= -1; directionSign -= 2) {
      polygonVertexCount = clipPolygonAgainstFaceSide(
        polygonInput,
        polygonVertexCount,
        polygonOutput,
        clipAxis,
        directionSign,
        clipExtentMeters,
        referenceCenter
      )
      const previousInput = polygonInput
      polygonInput = polygonOutput
      polygonOutput = previousInput
    }
  }

  polygonVertexCount = clipPolygonAgainstFaceSide(
    polygonInput,
    polygonVertexCount,
    polygonOutput,
    referenceOutwardNormal,
    1,
    0,
    _scratchFaceCenter
  )
  const previousInput = polygonInput
  polygonInput = polygonOutput
  polygonOutput = previousInput

  _scratchOppositeFaceNormal.copy(referenceOutwardNormal).negate()
  _scratchOppositeFaceCenter
    .copy(referenceCenter)
    .addScaledVector(
      referenceOutwardNormal,
      -referenceHalfExtentsMeters.getComponent(referenceFaceAxisIndex)
    )
  polygonVertexCount = clipPolygonAgainstFaceSide(
    polygonInput,
    polygonVertexCount,
    polygonOutput,
    _scratchOppositeFaceNormal,
    1,
    0,
    _scratchOppositeFaceCenter
  )
  const faceClipInput = polygonInput
  polygonInput = polygonOutput
  polygonOutput = faceClipInput

  _scratchContactPoint.set(0, 0, 0)
  if (polygonVertexCount === 0) {
    _scratchContactPoint.copy(_scratchCenterA).add(_scratchCenterB).multiplyScalar(0.5)
    return
  }
  for (let vertexIndex = 0; vertexIndex < polygonVertexCount; vertexIndex += 1) {
    _scratchContactPoint.add(polygonInput[vertexIndex])
  }
  _scratchContactPoint.divideScalar(polygonVertexCount)
  const faceAlignment = Math.abs(incidentFaceAxis.dot(referenceOutwardNormal))
  if (faceAlignment >= 1 - 1e-12) {
    _scratchClipRelative.subVectors(_scratchContactPoint, _scratchFaceCenter)
    const faceSeparationMeters = _scratchClipRelative.dot(referenceOutwardNormal)
    _scratchContactPoint.addScaledVector(referenceOutwardNormal, -faceSeparationMeters * 0.5)
  }
}

function clipPolygonAgainstFaceSide(
  polygonInput,
  polygonVertexCount,
  polygonOutput,
  planeAxis,
  directionSign,
  planeExtentMeters,
  referenceCenter
) {
  if (polygonVertexCount === 0) return 0

  let outputVertexCount = 0
  let previousVertex = polygonInput[polygonVertexCount - 1]
  _scratchClipRelative.subVectors(previousVertex, referenceCenter)
  let previousDistance = directionSign * planeAxis.dot(_scratchClipRelative) - planeExtentMeters
  let previousIsInside = previousDistance <= 0

  for (let vertexIndex = 0; vertexIndex < polygonVertexCount; vertexIndex += 1) {
    const currentVertex = polygonInput[vertexIndex]
    _scratchClipRelative.subVectors(currentVertex, referenceCenter)
    const currentDistance = directionSign * planeAxis.dot(_scratchClipRelative) - planeExtentMeters
    const currentIsInside = currentDistance <= 0

    if (currentIsInside !== previousIsInside) {
      const interpolation = previousDistance / (previousDistance - currentDistance)
      _scratchClipEdge.subVectors(currentVertex, previousVertex)
      polygonOutput[outputVertexCount]
        .copy(previousVertex)
        .addScaledVector(_scratchClipEdge, interpolation)
      outputVertexCount += 1
    }
    if (currentIsInside) {
      polygonOutput[outputVertexCount].copy(currentVertex)
      outputVertexCount += 1
    }

    previousVertex = currentVertex
    previousDistance = currentDistance
    previousIsInside = currentIsInside
  }
  return outputVertexCount
}

function setBoxSupportEdge(center, axes, halfExtentsMeters, edgeAxisIndex, supportDirection, start, end) {
  _scratchSupportEdgeCenter.copy(center)
  for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
    if (axisIndex === edgeAxisIndex) continue
    const axis = axes[axisIndex]
    const sign = axis.dot(supportDirection) >= 0 ? 1 : -1
    _scratchSupportEdgeCenter.addScaledVector(
      axis,
      sign * halfExtentsMeters.getComponent(axisIndex)
    )
  }
  const edgeAxis = axes[edgeAxisIndex]
  const edgeHalfExtentMeters = halfExtentsMeters.getComponent(edgeAxisIndex)
  start.copy(_scratchSupportEdgeCenter).addScaledVector(edgeAxis, -edgeHalfExtentMeters)
  end.copy(_scratchSupportEdgeCenter).addScaledVector(edgeAxis, edgeHalfExtentMeters)
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
  start.copy(position).addScaledVector(axis, -capsule.halfHeightMeters)
  end.copy(position).addScaledVector(axis, capsule.halfHeightMeters)
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

// featureId identifies the stable primitive support feature selected by the
// narrow phase. It deliberately does not encode the continuously moving
// contact point. Capsule pairs use a bounded primitive-level fallback because
// this single-point API does not expose cap/segment parameter metadata.
function createContact(depth, featureId) {
  return {
    normal: _scratchNormal.clone(),
    depth,
    point: _scratchContactPoint.clone(),
    featureId,
  }
}

function createSphereBoxOutsideFeatureId(halfExtentsMeters) {
  const outsideAxes = _scratchOutsideAxes
  outsideAxes.length = 0
  appendOutsideAxis(outsideAxes, _scratchSphereCenterLocal.x, halfExtentsMeters.x, 'x+', 'x-')
  appendOutsideAxis(outsideAxes, _scratchSphereCenterLocal.y, halfExtentsMeters.y, 'y+', 'y-')
  appendOutsideAxis(outsideAxes, _scratchSphereCenterLocal.z, halfExtentsMeters.z, 'z+', 'z-')
  const featureKind =
    outsideAxes.length === 1 ? 'face' : outsideAxes.length === 2 ? 'edge' : 'vertex'
  return `sphere-box:outside:${featureKind}:${outsideAxes.join(',')}`
}

// The axis labels are constant strings, so building a feature id does not
// allocate a label per axis per contact.
function appendOutsideAxis(
  outsideAxes,
  coordinateMeters,
  halfExtentMeters,
  positiveAxisLabel,
  negativeAxisLabel
) {
  if (coordinateMeters > halfExtentMeters) outsideAxes.push(positiveAxisLabel)
  else if (coordinateMeters < -halfExtentMeters) outsideAxes.push(negativeAxisLabel)
}

function createBoxBoxFeatureId() {
  if (_minimumPenetrationFeature === 2) {
    _scratchFeatureAxis.crossVectors(
      _scratchBoxAxesA[_minimumPenetrationAxisA],
      _scratchBoxAxesB[_minimumPenetrationAxisB]
    )
    const normalSign = _scratchBestNormal.dot(_scratchFeatureAxis) >= 0 ? '+' : '-'
    return `box-box:edge:a:${_minimumPenetrationAxisA}:b:${_minimumPenetrationAxisB}:${normalSign}`
  }

  const referenceAxes =
    _minimumPenetrationFeature === 0 ? _scratchBoxAxesA : _scratchBoxAxesB
  const referenceBoxName = _minimumPenetrationFeature === 0 ? 'a' : 'b'
  const referenceAxisIndex =
    _minimumPenetrationFeature === 0
      ? _minimumPenetrationAxisA
      : _minimumPenetrationAxisB
  const bestNormalProjection = _scratchBestNormal.dot(referenceAxes[referenceAxisIndex])
  const outwardProjection =
    _minimumPenetrationFeature === 0 ? bestNormalProjection : -bestNormalProjection
  const faceSign = outwardProjection >= 0 ? '+' : '-'
  return `box-box:face:${referenceBoxName}:${referenceAxisIndex}:${faceSign}`
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
