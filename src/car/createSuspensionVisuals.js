// src/car/createSuspensionVisuals.js

import * as THREE from 'three'
import {
  applySegmentBetweenPointsState,
  createSegmentBetweenPointsState,
  updateSegmentBetweenPointsState,
} from './segmentBetweenPoints.js'

// Visual-only solid axle representation (Session A2).
//
// An axle whose coupling mode is 'rigidAxle' is drawn as a rigid beam that
// spans the two wheel centres of that axle, with a leaf pack riding on top
// of it. An axle whose coupling mode is 'independent' is drawn with no beam
// at all, so the two archetypes are distinguishable at a glance.
//
// The mesh is placed from the SAME wheel positions the simulation publishes,
// so the beam follows the wheels rather than duplicating the constraint.
//
// Pose rules:
//   - The beam's endpoints are the two wheel centres of the axle, expressed
//     in the vehicle's local frame, which is the frame the wheel pivots live
//     in.
//   - The beam's roll about the vehicle's longitudinal axis is the roll the
//     simulation solved, read from the axle coupling state. The beam runs
//     from the RIGHT wheel to the LEFT wheel, so its axis points along +X and
//     a positive roll lifts the left side, which matches the sign
//     convention of src/vehicle/dynamics/axleCouplingState.js.
//     The drawn roll is the SIMULATED roll, not the exact inclination of the
//     line through the two wheel centres: the A1 solve uses the small-angle
//     form (height difference over the lateral span), so the exact
//     inclination differs from the simulated roll by about 1e-5 rad at an
//     80 mm step. Drawing the simulated roll keeps the mesh consistent with
//     the model that placed the wheels; the beam's ends then land within a
//     few micrometres of the wheel centres.
//   - When both wheels of a coupled axle are airborne, the beam pose is
//     interpolated from the two wheel centers. The A1 solve defines no
//     hanging-beam pose in that state (sharedSuspensionLengthMeters = null,
//     roll = 0), so this is an approximation. The visual continues to render
//     at the interpolated pose rather than vanishing because the beam is a
//     persistent mechanical component of the archetype.
//
// The leaf pack is a visual of the shared leaf that carries the beam. The
// physics models that leaf as ONE linear spring with one shared length:
// there is no leaf wrap, no curvature, no inter-leaf friction, and no
// progressive rate. The pack is drawn above the beam and follows the beam's
// roll. It is not attached to the rolling chassis body, so the visible gap
// between the pack and the body changes with body roll.
//
// The beam and the leaf pack are created the first time their axle is
// coupled and are hidden again when the axle returns to the independent
// mode. They are never rebuilt, so a runtime suspension swap cannot leak
// geometry.

const AXLE_IDS = Object.freeze(['front', 'rear'])

const BEAM_RADIUS_METERS = 0.055
const BEAM_RADIAL_SEGMENTS = 16
const LEAF_PACK_PLATE_COUNT = 3
const LEAF_PACK_PLATE_THICKNESS_METERS = 0.018
const LEAF_PACK_PLATE_SPACING_METERS = 0.024
const LEAF_PACK_PLATE_WIDTH_METERS = 0.06
// Plate lengths are fractions of the beam length: a leaf pack is longest at
// the bottom leaf and shortens towards the top leaf.
const LEAF_PACK_PLATE_LENGTH_FRACTIONS = Object.freeze([0.8, 0.66, 0.52])
const LEAF_PACK_HEIGHT_ABOVE_BEAM_METERS = 0.085

export function createSuspensionVisuals(vehicle) {
  const axleEntries = new Map()
  const beamAxisLocal = new THREE.Vector3()
  const beamStartLocal = new THREE.Vector3()
  const beamEndLocal = new THREE.Vector3()
  const beamMidpointLocal = new THREE.Vector3()
  const beamMaterial = new THREE.MeshStandardMaterial({
    color: 0x3c3c3c,
    metalness: 0.75,
    roughness: 0.35,
  })
  const leafPackMaterial = new THREE.MeshStandardMaterial({
    color: 0x2b2b2b,
    metalness: 0.7,
    roughness: 0.45,
  })

  const snapshot = {
    axles: {},
    isFinite: true,
  }

  for (const axle of AXLE_IDS) {
    snapshot.axles[axle] = createAxleSnapshot(axle)
  }

  // Places the beam and the leaf pack of every axle from the published wheel
  // positions. The axle coupling state decides whether an axle is drawn as a
  // rigid beam at all.
  function updateFromWheelStates(wheelStates = [], axleCouplingState = null) {
    const wheelStateList = Array.isArray(wheelStates) ? wheelStates : []

    for (const axle of AXLE_IDS) {
      const record = axleCouplingState?.axles?.[axle] ?? null
      const isCoupled = record?.isCoupled === true
      const entry = axleEntries.get(axle) ?? null

      if (!isCoupled) {
        if (entry) hideAxleEntry(entry)
        updateAxleSnapshot(snapshot.axles[axle], {
          isCoupled: false,
          hasBeamNode: entry !== null,
          beamLengthMeters: 0,
          beamRollRadians: 0,
          isFinite: true,
        })
        continue
      }

      const activeEntry = entry ?? createAxleEntry(axle)
      const leftWheelState = findWheelState(wheelStateList, axle, 'left')
      const rightWheelState = findWheelState(wheelStateList, axle, 'right')
      const beamRollRadians = Number.isFinite(record?.beamRollRadians)
        ? record.beamRollRadians
        : 0

      if (!leftWheelState || !rightWheelState) {
        hideAxleEntry(activeEntry)
        updateAxleSnapshot(snapshot.axles[axle], {
          isCoupled: true,
          hasBeamNode: true,
          beamLengthMeters: 0,
          beamRollRadians: 0,
          isFinite: false,
        })
        continue
      }

      applyAxleEntryPose(
        activeEntry,
        leftWheelState,
        rightWheelState,
        beamRollRadians
      )
      updateAxleSnapshot(snapshot.axles[axle], {
        isCoupled: true,
        hasBeamNode: true,
        beamLengthMeters: activeEntry.beamLengthMeters,
        beamRollRadians: activeEntry.beamRollRadians,
        beamMidpointLocalMeters: activeEntry.beamMidpointLocalMeters,
        isFinite: activeEntry.isFinite,
      })
    }

    snapshot.isFinite = Object.values(snapshot.axles).every(
      (axleSnapshot) => axleSnapshot.isFinite
    )

    return snapshot
  }

  function reset() {
    for (const entry of axleEntries.values()) {
      hideAxleEntry(entry)
      updateAxleSnapshot(snapshot.axles[entry.axle], {
        isCoupled: false,
        hasBeamNode: true,
        isFinite: true,
      })
    }

    return snapshot
  }

  function getSnapshot() {
    return snapshot
  }

  function createAxleEntry(axle) {
    const beamNode = new THREE.Mesh(
      new THREE.CylinderGeometry(
        BEAM_RADIUS_METERS,
        BEAM_RADIUS_METERS,
        1,
        BEAM_RADIAL_SEGMENTS
      ),
      beamMaterial
    )
    beamNode.name = axle + '-axle-beam-visual'
    beamNode.castShadow = true
    beamNode.visible = false

    const leafPackNode = new THREE.Group()
    leafPackNode.name = axle + '-axle-leaf-pack-visual'
    leafPackNode.visible = false

    for (let index = 0; index < LEAF_PACK_PLATE_COUNT; index += 1) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(
          LEAF_PACK_PLATE_LENGTH_FRACTIONS[index] ?? 0.52,
          LEAF_PACK_PLATE_THICKNESS_METERS,
          LEAF_PACK_PLATE_WIDTH_METERS
        ),
        leafPackMaterial
      )
      plate.name = axle + '-axle-leaf-plate-' + index + '-visual'
      plate.castShadow = true
      plate.position.y = index * LEAF_PACK_PLATE_SPACING_METERS
      leafPackNode.add(plate)
    }

    vehicle.add(beamNode)
    vehicle.add(leafPackNode)

    const entry = {
      axle,
      beamNode,
      leafPackNode,
      kinematics: createSegmentBetweenPointsState(),
      beamLengthMeters: 0,
      beamRollRadians: 0,
      beamMidpointLocalMeters: new THREE.Vector3(),
      isFinite: true,
    }

    axleEntries.set(axle, entry)
    return entry
  }

  function applyAxleEntryPose(
    entry,
    leftWheelState,
    rightWheelState,
    beamRollRadians
  ) {
    const leftCenter = leftWheelState.wheelCenterLocalPosition
    const rightCenter = rightWheelState.wheelCenterLocalPosition

    // The beam is centred between the two wheel centres and is long enough
    // to reach both of them. Its axis is the simulated beam axis, so the
    // drawn roll is the roll the simulation solved.
    beamMidpointLocal
      .copy(leftCenter)
      .add(rightCenter)
      .multiplyScalar(0.5)
    const halfLengthMeters = leftCenter.distanceTo(rightCenter) * 0.5

    beamAxisLocal.set(Math.cos(beamRollRadians), Math.sin(beamRollRadians), 0)
    beamStartLocal
      .copy(beamMidpointLocal)
      .addScaledVector(beamAxisLocal, -halfLengthMeters)
    beamEndLocal
      .copy(beamMidpointLocal)
      .addScaledVector(beamAxisLocal, halfLengthMeters)

    updateSegmentBetweenPointsState(entry.kinematics, beamStartLocal, beamEndLocal)
    const isNodeTransformFinite = applySegmentBetweenPointsState(
      entry.beamNode,
      entry.kinematics
    )

    entry.beamLengthMeters = entry.kinematics.lengthMeters
    entry.beamRollRadians = beamRollRadians
    entry.beamMidpointLocalMeters.copy(beamMidpointLocal)
    entry.isFinite = entry.kinematics.isFinite && isNodeTransformFinite

    // The leaf pack is scaled along the beam so its plates span the same
    // distance as the beam, and it is rolled with the beam.
    entry.leafPackNode.position
      .copy(entry.kinematics.midpointLocalMeters)
      .add(LEAF_PACK_UP_OFFSET)
    entry.leafPackNode.rotation.set(0, 0, entry.beamRollRadians)
    entry.leafPackNode.scale.set(entry.beamLengthMeters, 1, 1)

    entry.beamNode.visible = true
    entry.leafPackNode.visible = true
  }

  function hideAxleEntry(entry) {
    entry.beamNode.visible = false
    entry.leafPackNode.visible = false
  }

  return {
    updateFromWheelStates,
    reset,
    getSnapshot,
  }
}

const LEAF_PACK_UP_OFFSET = new THREE.Vector3(
  0,
  LEAF_PACK_HEIGHT_ABOVE_BEAM_METERS,
  0
)

function createAxleSnapshot(axle) {
  return {
    axle,
    isCoupled: false,
    hasBeamNode: false,
    beamLengthMeters: 0,
    beamRollRadians: 0,
    midpointLocalMeters: new THREE.Vector3(),
    isFinite: true,
  }
}

function updateAxleSnapshot(axleSnapshot, updates) {
  axleSnapshot.isCoupled = updates.isCoupled
  axleSnapshot.hasBeamNode = updates.hasBeamNode
  axleSnapshot.beamLengthMeters = updates.beamLengthMeters ?? 0
  axleSnapshot.beamRollRadians = updates.beamRollRadians ?? 0
  if (updates.beamMidpointLocalMeters) {
    axleSnapshot.midpointLocalMeters.copy(updates.beamMidpointLocalMeters)
  }
  axleSnapshot.isFinite = updates.isFinite
  return axleSnapshot
}

function findWheelState(wheelStates, axle, side) {
  for (const wheelState of wheelStates) {
    if (wheelState?.axle === axle && wheelState?.side === side) return wheelState
  }
  return null
}
