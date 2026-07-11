// src/car/createWheelAxleVisualKinematics.js

import * as THREE from 'three'
import {
  applySegmentBetweenPointsState,
  createSegmentBetweenPointsState,
  updateSegmentBetweenPointsState,
} from './segmentBetweenPoints.js'

const SEGMENT_OUTER_ENDPOINT_LOCAL = new THREE.Vector3(0, 0.5, 0)
const RIGID_ALIGNMENT_TOLERANCE_METERS = 0.000001

export function createWheelAxleVisualKinematics(vehicle) {
  const vehicleMetadata = vehicle?.userData?.vehicle ?? {}
  const wheelMetadata = vehicleMetadata.wheels ?? []
  const segmentMetadata = vehicleMetadata.drivetrain?.articulatedSegments ?? []
  const wheelEntries = wheelMetadata.map((wheel) =>
    createWheelEntry(vehicle, wheel)
  )
  const wheelEntryById = new Map(
    wheelEntries.map((entry) => [entry.wheelId, entry])
  )
  const segmentEntries = segmentMetadata.map((segment) =>
    createSegmentEntry(vehicle, segment)
  )
  const snapshot = createSnapshot(vehicleMetadata, wheelEntries, segmentEntries)

  function updateFromWheelStates(wheelStates = []) {
    vehicle.updateMatrixWorld(true)

    for (const wheelState of wheelStates) {
      const wheelEntry = wheelEntryById.get(wheelState?.id)
      const wheelCenterLocalMeters =
        wheelState?.wheelCenterLocalPosition ?? wheelState?.localPosition

      if (!wheelEntry || !hasFiniteVector3(wheelCenterLocalMeters)) continue
      wheelEntry.authoritativeWheelCenterLocalMeters.copy(
        wheelCenterLocalMeters
      )
    }

    for (const segmentEntry of segmentEntries) {
      const wheelEntry = wheelEntryById.get(segmentEntry.outerWheelId)
      if (!wheelEntry) continue
      resolveSegmentInnerAttachmentLocalMeters(vehicle, segmentEntry)

      updateSegmentBetweenPointsState(
        segmentEntry.kinematics,
        segmentEntry.resolvedInnerAttachmentLocalMeters,
        wheelEntry.authoritativeWheelCenterLocalMeters
      )
      segmentEntry.isNodeTransformFinite = applySegmentBetweenPointsState(
        segmentEntry.node,
        segmentEntry.kinematics
      )
    }

    updateAlignmentTelemetry()
    return snapshot
  }

  function updateAlignmentTelemetry() {
    vehicle.updateMatrixWorld(true)
    snapshot.maximumHubToWheelCenterErrorMeters = 0
    snapshot.maximumRimToWheelCenterErrorMeters = 0
    snapshot.maximumTireToWheelCenterErrorMeters = 0
    snapshot.maximumAxleOrShaftEndpointToHubErrorMeters = 0
    snapshot.isFinite = true
    snapshot.rigidAlignmentIsValid = true

    for (const wheelEntry of wheelEntries) {
      wheelEntry.authoritativeWheelCenterWorldMeters
        .copy(wheelEntry.authoritativeWheelCenterLocalMeters)
        .applyMatrix4(vehicle.matrixWorld)
      getWorldPositionOrFallback(
        wheelEntry.hubNode,
        wheelEntry.hubCenterWorldMeters,
        wheelEntry.authoritativeWheelCenterWorldMeters
      )
      getWorldPositionOrFallback(
        wheelEntry.rimNode,
        wheelEntry.rimCenterWorldMeters,
        wheelEntry.authoritativeWheelCenterWorldMeters
      )
      getWorldPositionOrFallback(
        wheelEntry.tireNode,
        wheelEntry.tireCenterWorldMeters,
        wheelEntry.authoritativeWheelCenterWorldMeters
      )

      const segmentEntry = findSegmentForWheel(segmentEntries, wheelEntry.wheelId)
      if (segmentEntry?.node) {
        segmentEntry.outerEndpointWorldMeters
          .copy(SEGMENT_OUTER_ENDPOINT_LOCAL)
          .applyMatrix4(segmentEntry.node.matrixWorld)
        wheelEntry.axleOrShaftOuterEndpointWorldMeters.copy(
          segmentEntry.outerEndpointWorldMeters
        )
      } else {
        wheelEntry.axleOrShaftOuterEndpointWorldMeters.copy(
          wheelEntry.authoritativeWheelCenterWorldMeters
        )
      }

      wheelEntry.hubToWheelCenterErrorMeters =
        wheelEntry.hubCenterWorldMeters.distanceTo(
          wheelEntry.authoritativeWheelCenterWorldMeters
        )
      wheelEntry.rimToWheelCenterErrorMeters =
        wheelEntry.rimCenterWorldMeters.distanceTo(
          wheelEntry.authoritativeWheelCenterWorldMeters
        )
      wheelEntry.tireToWheelCenterErrorMeters =
        wheelEntry.tireCenterWorldMeters.distanceTo(
          wheelEntry.authoritativeWheelCenterWorldMeters
        )
      wheelEntry.axleOrShaftEndpointToHubErrorMeters =
        wheelEntry.axleOrShaftOuterEndpointWorldMeters.distanceTo(
          wheelEntry.hubCenterWorldMeters
        )
      wheelEntry.suspensionVisualOffsetMeters =
        wheelEntry.authoritativeWheelCenterLocalMeters.y -
        wheelEntry.authoredWheelCenterLocalMeters.y
      wheelEntry.rigidAlignmentIsValid =
        wheelEntry.hubToWheelCenterErrorMeters <= RIGID_ALIGNMENT_TOLERANCE_METERS &&
        wheelEntry.rimToWheelCenterErrorMeters <= RIGID_ALIGNMENT_TOLERANCE_METERS &&
        wheelEntry.tireToWheelCenterErrorMeters <= RIGID_ALIGNMENT_TOLERANCE_METERS &&
        wheelEntry.axleOrShaftEndpointToHubErrorMeters <= RIGID_ALIGNMENT_TOLERANCE_METERS
      wheelEntry.isFinite = hasFiniteWheelEntry(wheelEntry)
      updateWheelSnapshot(wheelEntry)

      snapshot.maximumHubToWheelCenterErrorMeters = Math.max(
        snapshot.maximumHubToWheelCenterErrorMeters,
        wheelEntry.hubToWheelCenterErrorMeters
      )
      snapshot.maximumRimToWheelCenterErrorMeters = Math.max(
        snapshot.maximumRimToWheelCenterErrorMeters,
        wheelEntry.rimToWheelCenterErrorMeters
      )
      snapshot.maximumTireToWheelCenterErrorMeters = Math.max(
        snapshot.maximumTireToWheelCenterErrorMeters,
        wheelEntry.tireToWheelCenterErrorMeters
      )
      snapshot.maximumAxleOrShaftEndpointToHubErrorMeters = Math.max(
        snapshot.maximumAxleOrShaftEndpointToHubErrorMeters,
        wheelEntry.axleOrShaftEndpointToHubErrorMeters
      )
      snapshot.isFinite = snapshot.isFinite && wheelEntry.isFinite
      snapshot.rigidAlignmentIsValid =
        snapshot.rigidAlignmentIsValid && wheelEntry.rigidAlignmentIsValid
    }

    for (const segmentEntry of segmentEntries) {
      segmentEntry.snapshot.lengthMeters = segmentEntry.kinematics.lengthMeters
      segmentEntry.snapshot.isInputFinite = segmentEntry.kinematics.isInputFinite
      segmentEntry.snapshot.isDegenerate = segmentEntry.kinematics.isDegenerate
      segmentEntry.snapshot.isFinite =
        segmentEntry.kinematics.isFinite && segmentEntry.isNodeTransformFinite
      segmentEntry.snapshot.innerAttachmentLocalMeters.copy(
        segmentEntry.innerAttachmentLocalMeters
      )
      segmentEntry.snapshot.resolvedInnerAttachmentLocalMeters.copy(
        segmentEntry.resolvedInnerAttachmentLocalMeters
      )
      segmentEntry.snapshot.outerAttachmentLocalMeters.copy(
        segmentEntry.kinematics.endLocalMeters
      )
      segmentEntry.snapshot.midpointLocalMeters.copy(
        segmentEntry.kinematics.midpointLocalMeters
      )
      segmentEntry.snapshot.outerEndpointWorldMeters.copy(
        segmentEntry.outerEndpointWorldMeters
      )
      snapshot.isFinite = snapshot.isFinite && segmentEntry.snapshot.isFinite
    }
  }

  function reset() {
    for (const wheelEntry of wheelEntries) {
      wheelEntry.authoritativeWheelCenterLocalMeters.copy(
        wheelEntry.authoredWheelCenterLocalMeters
      )
    }

    return updateFromWheelStates(wheelMetadata)
  }

  function getSnapshot() {
    return snapshot
  }

  reset()

  return {
    updateFromWheelStates,
    reset,
    getSnapshot,
  }
}

function createWheelEntry(vehicle, wheel) {
  const visualNodes = wheel?.visualNodes ?? {}
  const entry = {
    wheelId: wheel?.id ?? 'unknown',
    authoredWheelCenterLocalMeters: cloneFiniteVector3(wheel?.localPosition),
    authoritativeWheelCenterLocalMeters: cloneFiniteVector3(
      wheel?.localPosition
    ),
    authoritativeWheelCenterWorldMeters: new THREE.Vector3(),
    hubCenterWorldMeters: new THREE.Vector3(),
    rimCenterWorldMeters: new THREE.Vector3(),
    tireCenterWorldMeters: new THREE.Vector3(),
    axleOrShaftOuterEndpointWorldMeters: new THREE.Vector3(),
    hubNode: vehicle.getObjectByName(visualNodes.hub) ?? null,
    rimNode: vehicle.getObjectByName(visualNodes.rimBarrel) ?? null,
    tireNode: vehicle.getObjectByName(visualNodes.tire) ?? null,
    hubToWheelCenterErrorMeters: 0,
    rimToWheelCenterErrorMeters: 0,
    tireToWheelCenterErrorMeters: 0,
    axleOrShaftEndpointToHubErrorMeters: 0,
    suspensionVisualOffsetMeters: 0,
    rigidAlignmentIsValid: true,
    isFinite: true,
    snapshot: null,
  }

  entry.snapshot = {
    wheelId: entry.wheelId,
    authoritativeWheelCenterWorldMeters:
      entry.authoritativeWheelCenterWorldMeters,
    hubCenterWorldMeters: entry.hubCenterWorldMeters,
    rimCenterWorldMeters: entry.rimCenterWorldMeters,
    tireCenterWorldMeters: entry.tireCenterWorldMeters,
    axleOrShaftOuterEndpointWorldMeters:
      entry.axleOrShaftOuterEndpointWorldMeters,
    hubToWheelCenterErrorMeters: 0,
    rimToWheelCenterErrorMeters: 0,
    tireToWheelCenterErrorMeters: 0,
    axleOrShaftEndpointToHubErrorMeters: 0,
    suspensionVisualOffsetMeters: 0,
    rigidAlignmentIsValid: true,
    isFinite: true,
  }

  return entry
}

function updateWheelSnapshot(entry) {
  entry.snapshot.hubToWheelCenterErrorMeters =
    entry.hubToWheelCenterErrorMeters
  entry.snapshot.rimToWheelCenterErrorMeters =
    entry.rimToWheelCenterErrorMeters
  entry.snapshot.tireToWheelCenterErrorMeters =
    entry.tireToWheelCenterErrorMeters
  entry.snapshot.axleOrShaftEndpointToHubErrorMeters =
    entry.axleOrShaftEndpointToHubErrorMeters
  entry.snapshot.suspensionVisualOffsetMeters =
    entry.suspensionVisualOffsetMeters
  entry.snapshot.rigidAlignmentIsValid = entry.rigidAlignmentIsValid
  entry.snapshot.isFinite = entry.isFinite
}

function createSegmentEntry(vehicle, segment) {
  const entry = {
    id: segment?.id ?? 'unknown-segment',
    kind: segment?.kind ?? 'visual-segment',
    outerWheelId: segment?.outerWheelId ?? 'unknown',
    node: vehicle.getObjectByName(segment?.node) ?? null,
    innerAttachmentNode:
      vehicle.getObjectByName(segment?.innerAttachmentNode) ?? null,
    innerAttachmentLocalMeters: cloneFiniteVector3(
      segment?.innerAttachmentLocalMeters
    ),
    resolvedInnerAttachmentLocalMeters: cloneFiniteVector3(
      segment?.innerAttachmentLocalMeters
    ),
    innerAttachmentWorldMeters: new THREE.Vector3(),
    kinematics: createSegmentBetweenPointsState({
      fallbackDirection: segment?.fallbackDirectionLocal,
    }),
    outerEndpointWorldMeters: new THREE.Vector3(),
    isNodeTransformFinite: false,
    snapshot: null,
  }

  entry.snapshot = {
    id: entry.id,
    kind: entry.kind,
    outerWheelId: entry.outerWheelId,
    innerAttachmentLocalMeters: new THREE.Vector3(),
    resolvedInnerAttachmentLocalMeters: new THREE.Vector3(),
    hasVisualInnerAttachmentNode: entry.innerAttachmentNode !== null,
    outerAttachmentLocalMeters: new THREE.Vector3(),
    midpointLocalMeters: new THREE.Vector3(),
    outerEndpointWorldMeters: new THREE.Vector3(),
    lengthMeters: 0,
    isInputFinite: false,
    isDegenerate: true,
    isFinite: false,
  }

  return entry
}

function createSnapshot(vehicleMetadata, wheelEntries, segmentEntries) {
  return {
    representationKind:
      vehicleMetadata.drivetrain?.representationKind ?? 'unavailable',
    behaviorImpact: 'visual-only',
    maximumHubToWheelCenterErrorMeters: 0,
    maximumRimToWheelCenterErrorMeters: 0,
    maximumTireToWheelCenterErrorMeters: 0,
    maximumAxleOrShaftEndpointToHubErrorMeters: 0,
    isFinite: true,
    rigidAlignmentIsValid: true,
    wheels: wheelEntries.map((entry) => entry.snapshot),
    segments: segmentEntries.map((entry) => entry.snapshot),
  }
}

function resolveSegmentInnerAttachmentLocalMeters(vehicle, segmentEntry) {
  if (!segmentEntry.innerAttachmentNode) {
    segmentEntry.resolvedInnerAttachmentLocalMeters.copy(
      segmentEntry.innerAttachmentLocalMeters
    )
    return segmentEntry.resolvedInnerAttachmentLocalMeters
  }

  segmentEntry.innerAttachmentNode.getWorldPosition(
    segmentEntry.innerAttachmentWorldMeters
  )
  if (!hasFiniteVector3(segmentEntry.innerAttachmentWorldMeters)) {
    segmentEntry.resolvedInnerAttachmentLocalMeters.copy(
      segmentEntry.innerAttachmentLocalMeters
    )
    return segmentEntry.resolvedInnerAttachmentLocalMeters
  }

  segmentEntry.resolvedInnerAttachmentLocalMeters.copy(
    segmentEntry.innerAttachmentWorldMeters
  )
  vehicle.worldToLocal(segmentEntry.resolvedInnerAttachmentLocalMeters)

  if (!hasFiniteVector3(segmentEntry.resolvedInnerAttachmentLocalMeters)) {
    segmentEntry.resolvedInnerAttachmentLocalMeters.copy(
      segmentEntry.innerAttachmentLocalMeters
    )
  }

  return segmentEntry.resolvedInnerAttachmentLocalMeters
}

function findSegmentForWheel(segmentEntries, wheelId) {
  for (const segmentEntry of segmentEntries) {
    if (segmentEntry.outerWheelId === wheelId) return segmentEntry
  }

  return null
}

function getWorldPositionOrFallback(node, target, fallback) {
  if (!node) return target.copy(fallback)
  node.getWorldPosition(target)
  if (!hasFiniteVector3(target)) target.copy(fallback)
  return target
}

function hasFiniteWheelEntry(entry) {
  return (
    hasFiniteVector3(entry.authoritativeWheelCenterLocalMeters) &&
    hasFiniteVector3(entry.authoritativeWheelCenterWorldMeters) &&
    hasFiniteVector3(entry.hubCenterWorldMeters) &&
    hasFiniteVector3(entry.rimCenterWorldMeters) &&
    hasFiniteVector3(entry.tireCenterWorldMeters) &&
    hasFiniteVector3(entry.axleOrShaftOuterEndpointWorldMeters) &&
    Number.isFinite(entry.hubToWheelCenterErrorMeters) &&
    Number.isFinite(entry.rimToWheelCenterErrorMeters) &&
    Number.isFinite(entry.tireToWheelCenterErrorMeters) &&
    Number.isFinite(entry.axleOrShaftEndpointToHubErrorMeters) &&
    Number.isFinite(entry.suspensionVisualOffsetMeters)
  )
}

function cloneFiniteVector3(source) {
  return hasFiniteVector3(source) ? source.clone() : new THREE.Vector3()
}

function hasFiniteVector3(value) {
  return (
    value?.isVector3 === true &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  )
}
