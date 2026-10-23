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
//
// The MacPherson strut (Session A3) is a PER-CORNER visual. It is not a
// coupling: a strut carries one corner and couples to nothing, so it is
// selected by the spec's suspension visual kind rather than by the axle
// coupling state. The strut is drawn in the vehicle's local frame between
// the body's strut tower (a fixed point) and the wheel hub (a published
// wheel position), so it compresses and extends with the suspension
// travel. Like the leaf pack, its top does NOT follow the rolling body:
// the visible gap between the strut tower and the body changes with body
// roll. The MacPherson archetype's physics are identical to the stock
// profile - the strut is a visual seam, not a force model.

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

// MacPherson strut geometry (Session A3). All lengths are metres.
const STRUT_DAMPER_RADIUS_METERS = 0.026
const STRUT_DAMPER_RADIAL_SEGMENTS = 12
const STRUT_COIL_RADIUS_METERS = 0.055
const STRUT_COIL_TUBE_RADIUS_METERS = 0.011
const STRUT_COIL_TORUS_SEGMENTS = 16
const STRUT_COIL_COUNT = 6
// The coil rides on the upper part of the strut; the lower part is the
// bare damper body.
const STRUT_COIL_SPAN_FRACTION01 = 0.6
const STRUT_COIL_TOP_MARGIN_FRACTION01 = 0.08
// The strut sits inboard of the wheel, clear of the tire's inner face.
const STRUT_BOTTOM_INBOARD_OFFSET_METERS = 0.26
const STRUT_TOP_INBOARD_OFFSET_METERS = 0.32

// Which axle a suspension visual kind draws struts on. A visual kind
// carries no physics: it only selects which archetype geometry is drawn.
const STRUT_VISUAL_AXLE_BY_KIND = Object.freeze({
  macphersonStrut: 'front',
})
const NO_SUSPENSION_VISUAL_KIND = 'none'
const WISHBONE_VISUAL_KIND = 'doubleWishbone'
const WISHBONE_LINKAGE_KIND = 'double-wishbone'
// Visual approximation only: the 2D linkage has no fore-aft dimension.
const WISHBONE_INNER_PIVOT_HALF_SPAN_METERS = 0.15
const WISHBONE_ARM_RADIUS_METERS = 0.021
const WISHBONE_CARRIER_RADIUS_METERS = 0.035
const WISHBONE_RADIAL_SEGMENTS = 12
const WISHBONE_SEGMENT_DEFINITIONS = Object.freeze([
  'upper-arm-front-link',
  'upper-arm-rear-link',
  'upper-arm-crossbar',
  'lower-arm-front-link',
  'lower-arm-rear-link',
  'lower-arm-crossbar',
  'hub-carrier',
])

export function createSuspensionVisuals(vehicle) {
  const axleEntries = new Map()
  const strutEntries = new Map()
  const wishboneEntries = new Map()
  const strutTopLocal = new THREE.Vector3()
  const strutBottomLocal = new THREE.Vector3()
  const strutMidpointLocal = new THREE.Vector3()
  const strutAxisLocal = new THREE.Vector3()
  const STRUT_UP_AXIS = new THREE.Vector3(0, 1, 0)
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
  const strutDamperMaterial = new THREE.MeshStandardMaterial({
    color: 0x30343a,
    metalness: 0.8,
    roughness: 0.4,
  })
  const strutCoilMaterial = new THREE.MeshStandardMaterial({
    color: 0x9aa3ad,
    metalness: 0.85,
    roughness: 0.35,
  })
  let wishboneArmGeometry = null
  let wishboneCarrierGeometry = null
  let wishboneArmMaterial = null
  let wishboneCarrierMaterial = null

  const snapshot = {
    axles: {},
    struts: {},
    suspensionVisualKind: NO_SUSPENSION_VISUAL_KIND,
    isFinite: true,
  }

  for (const axle of AXLE_IDS) {
    snapshot.axles[axle] = createAxleSnapshot(axle)
  }

  // Places the beam and the leaf pack of every axle from the published wheel
  // positions. The axle coupling state decides whether an axle is drawn as a
  // rigid beam at all.
  function updateFromWheelStates(
    wheelStates = [],
    axleCouplingState = null,
    suspensionVisualKind = NO_SUSPENSION_VISUAL_KIND,
    suspensionLinkage = null
  ) {
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

    updateStruts(wheelStateList, suspensionVisualKind)
    updateWishbones(wheelStateList, suspensionVisualKind, suspensionLinkage)

    snapshot.isFinite =
      Object.values(snapshot.axles).every(
        (axleSnapshot) => axleSnapshot.isFinite
      ) &&
      Object.values(snapshot.struts).every(
        (strutSnapshot) => strutSnapshot.isFinite
      ) &&
      areWishboneEntriesFinite()

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

    for (const entry of strutEntries.values()) {
      hideStrutEntry(entry)
      updateStrutSnapshot(snapshot.struts[entry.wheelId], {
        isVisible: false,
        hasNode: true,
        lengthMeters: 0,
        isFinite: true,
      })
    }

    for (const entry of wishboneEntries.values()) {
      hideWishboneEntry(entry)
      entry.isFinite = true
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

  // Places the struts of the axle the current visual kind selects. A wheel
  // whose axle does not match the kind gets no strut at all.
  function updateStruts(wheelStateList, suspensionVisualKind) {
    const visualKind =
      typeof suspensionVisualKind === 'string'
        ? suspensionVisualKind
        : NO_SUSPENSION_VISUAL_KIND
    snapshot.suspensionVisualKind = visualKind
    const strutAxle = STRUT_VISUAL_AXLE_BY_KIND[visualKind] ?? null

    for (const wheelState of wheelStateList) {
      const wheelId = wheelState?.id
      if (!wheelId) continue

      const entry = strutEntries.get(wheelId) ?? null
      if (!snapshot.struts[wheelId]) {
        snapshot.struts[wheelId] = createStrutSnapshot(wheelId)
      }
      if (!strutAxle || wheelState.axle !== strutAxle) {
        if (entry) hideStrutEntry(entry)
        updateStrutSnapshot(snapshot.struts[wheelId], {
          wheelId,
          axle: wheelState.axle ?? null,
          isVisible: false,
          hasNode: entry !== null,
          lengthMeters: 0,
          isFinite: true,
        })
        continue
      }

      const activeEntry = entry ?? createStrutEntry(wheelId, wheelState.axle)
      const isPoseFinite = applyStrutPose(activeEntry, wheelState)
      if (isPoseFinite) {
        activeEntry.topLocalMeters.copy(strutTopLocal)
        activeEntry.bottomLocalMeters.copy(strutBottomLocal)
      }
      updateStrutSnapshot(snapshot.struts[wheelId], {
        wheelId,
        axle: wheelState.axle ?? null,
        isVisible: isPoseFinite,
        hasNode: true,
        lengthMeters: activeEntry.lengthMeters,
        isFinite: isPoseFinite,
      })
      if (isPoseFinite) {
        snapshot.struts[wheelId].topLocalMeters.copy(strutTopLocal)
        snapshot.struts[wheelId].bottomLocalMeters.copy(strutBottomLocal)
      }
    }
  }

  function updateWishbones(wheelStateList, suspensionVisualKind, linkageSpec) {
    const isWishboneActive =
      suspensionVisualKind === WISHBONE_VISUAL_KIND &&
      linkageSpec?.kind === WISHBONE_LINKAGE_KIND &&
      linkageSpec.leftSide

    if (!isWishboneActive) {
      for (const entry of wishboneEntries.values()) {
        hideWishboneEntry(entry)
        entry.isFinite = true
      }
      return
    }

    for (const wheelState of wheelStateList) {
      const wheelId = wheelState?.id
      if (!wheelId || (wheelState.axle !== 'front' && wheelState.axle !== 'rear')) continue
      if (wheelState.side !== 'left' && wheelState.side !== 'right') continue

      const entry = wishboneEntries.get(wheelId) ?? createWishboneEntry(wheelId)
      entry.isFinite = applyWishbonePose(entry, wheelState, linkageSpec)
      if (!entry.isFinite) hideWishboneEntry(entry)
    }

    for (const entry of wishboneEntries.values()) {
      if (!findWheelStateById(wheelStateList, entry.wheelId)) {
        hideWishboneEntry(entry)
        entry.isFinite = true
      }
    }
  }

  function createWishboneEntry(wheelId) {
    if (!wishboneArmGeometry) {
      wishboneArmGeometry = new THREE.CylinderGeometry(
        WISHBONE_ARM_RADIUS_METERS,
        WISHBONE_ARM_RADIUS_METERS,
        1,
        WISHBONE_RADIAL_SEGMENTS
      )
      wishboneCarrierGeometry = new THREE.CylinderGeometry(
        WISHBONE_CARRIER_RADIUS_METERS,
        WISHBONE_CARRIER_RADIUS_METERS,
        1,
        WISHBONE_RADIAL_SEGMENTS
      )
      wishboneArmMaterial = new THREE.MeshStandardMaterial({
        color: 0x454b52,
        metalness: 0.78,
        roughness: 0.38,
      })
      wishboneCarrierMaterial = new THREE.MeshStandardMaterial({
        color: 0x8a929a,
        metalness: 0.82,
        roughness: 0.32,
      })
    }

    const group = new THREE.Group()
    group.name = wheelId + '-wishbone-visual'
    group.visible = false
    const segments = new Map()

    for (const segmentName of WISHBONE_SEGMENT_DEFINITIONS) {
      const isCarrier = segmentName === 'hub-carrier'
      const node = new THREE.Mesh(
        isCarrier ? wishboneCarrierGeometry : wishboneArmGeometry,
        isCarrier ? wishboneCarrierMaterial : wishboneArmMaterial
      )
      node.name = `wishbone-${wheelId}-${segmentName}-segment-visual`
      node.castShadow = true
      node.visible = false
      group.add(node)
      segments.set(segmentName, {
        node,
        kinematics: createSegmentBetweenPointsState(),
      })
    }

    vehicle.add(group)

    const entry = {
      wheelId,
      group,
      segments,
      points: {
        upperInnerFront: new THREE.Vector3(),
        upperInnerRear: new THREE.Vector3(),
        upperOuter: new THREE.Vector3(),
        lowerInnerFront: new THREE.Vector3(),
        lowerInnerRear: new THREE.Vector3(),
        lowerOuter: new THREE.Vector3(),
        outerMidpoint: new THREE.Vector3(),
        wheelCenter: new THREE.Vector3(),
      },
      isFinite: true,
    }
    wishboneEntries.set(wheelId, entry)
    return entry
  }

  function applyWishbonePose(entry, wheelState, linkageSpec) {
    const leftSide = linkageSpec.leftSide
    const upperInner = leftSide.upperArm?.innerPivot
    const lowerInner = leftSide.lowerArm?.innerPivot
    const kinematics = wheelState.wishboneKinematics
    const upperJoint = kinematics?.upperOuterJoint
    const lowerJoint = kinematics?.lowerOuterJoint
    const wheelCenter = wheelState.wheelCenterLocalPosition
    const axlePosition = wheelState.localPosition
    const sideSign = wheelState.side === 'right' ? -1 : 1
    const axleZMeters = Number(axlePosition?.z ?? wheelCenter?.z)
    const frontPivotZMeters =
      axleZMeters + WISHBONE_INNER_PIVOT_HALF_SPAN_METERS
    const rearPivotZMeters =
      axleZMeters - WISHBONE_INNER_PIVOT_HALF_SPAN_METERS
    const points = entry.points

    points.upperInnerFront.set(
      sideSign * Number(upperInner?.xMeters),
      Number(upperInner?.yMeters),
      frontPivotZMeters
    )
    points.upperInnerRear.set(
      sideSign * Number(upperInner?.xMeters),
      Number(upperInner?.yMeters),
      rearPivotZMeters
    )
    points.upperOuter.set(
      sideSign * Number(upperJoint?.xMeters),
      Number(upperJoint?.yMeters),
      axleZMeters
    )
    points.lowerInnerFront.set(
      sideSign * Number(lowerInner?.xMeters),
      Number(lowerInner?.yMeters),
      frontPivotZMeters
    )
    points.lowerInnerRear.set(
      sideSign * Number(lowerInner?.xMeters),
      Number(lowerInner?.yMeters),
      rearPivotZMeters
    )
    points.lowerOuter.set(
      sideSign * Number(lowerJoint?.xMeters),
      Number(lowerJoint?.yMeters),
      axleZMeters
    )
    points.outerMidpoint
      .copy(points.upperOuter)
      .add(points.lowerOuter)
      .multiplyScalar(0.5)
    points.wheelCenter.set(
      Number(wheelCenter?.x),
      Number(wheelCenter?.y),
      Number(wheelCenter?.z)
    )

    if (
      !isFiniteVector3(points.upperInnerFront) ||
      !isFiniteVector3(points.upperInnerRear) ||
      !isFiniteVector3(points.upperOuter) ||
      !isFiniteVector3(points.lowerInnerFront) ||
      !isFiniteVector3(points.lowerInnerRear) ||
      !isFiniteVector3(points.lowerOuter) ||
      !isFiniteVector3(points.outerMidpoint) ||
      !isFiniteVector3(points.wheelCenter)
    ) {
      return false
    }

    if (
      !applyWishboneSegment(
        entry,
        'upper-arm-front-link',
        points.upperInnerFront,
        points.upperOuter
      ) ||
      !applyWishboneSegment(
        entry,
        'upper-arm-rear-link',
        points.upperInnerRear,
        points.upperOuter
      ) ||
      !applyWishboneSegment(
        entry,
        'upper-arm-crossbar',
        points.upperInnerFront,
        points.upperInnerRear
      ) ||
      !applyWishboneSegment(
        entry,
        'lower-arm-front-link',
        points.lowerInnerFront,
        points.lowerOuter
      ) ||
      !applyWishboneSegment(
        entry,
        'lower-arm-rear-link',
        points.lowerInnerRear,
        points.lowerOuter
      ) ||
      !applyWishboneSegment(
        entry,
        'lower-arm-crossbar',
        points.lowerInnerFront,
        points.lowerInnerRear
      ) ||
      !applyWishboneSegment(
        entry,
        'hub-carrier',
        points.outerMidpoint,
        points.wheelCenter
      )
    ) {
      return false
    }

    entry.group.visible = true
    return true
  }

  function applyWishboneSegment(entry, name, startLocalMeters, endLocalMeters) {
    const segment = entry.segments.get(name)
    updateSegmentBetweenPointsState(
      segment.kinematics,
      startLocalMeters,
      endLocalMeters
    )
    if (!applySegmentBetweenPointsState(segment.node, segment.kinematics)) {
      return false
    }
    segment.node.visible = true
    return true
  }

  function hideWishboneEntry(entry) {
    entry.group.visible = false
    for (const segment of entry.segments.values()) {
      segment.node.visible = false
    }
  }

  function areWishboneEntriesFinite() {
    for (const entry of wishboneEntries.values()) {
      if (!entry.isFinite) return false
    }
    return true
  }

  function createStrutEntry(wheelId, axle) {
    const group = new THREE.Group()
    group.name = wheelId + '-strut-visual'
    group.visible = false

    const damperMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(
        STRUT_DAMPER_RADIUS_METERS,
        STRUT_DAMPER_RADIUS_METERS,
        1,
        STRUT_DAMPER_RADIAL_SEGMENTS
      ),
      strutDamperMaterial
    )
    damperMesh.name = wheelId + '-strut-damper-visual'
    damperMesh.castShadow = true
    group.add(damperMesh)

    const coilTori = []
    for (let index = 0; index < STRUT_COIL_COUNT; index += 1) {
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(
          STRUT_COIL_RADIUS_METERS,
          STRUT_COIL_TUBE_RADIUS_METERS,
          STRUT_COIL_TORUS_SEGMENTS,
          STRUT_COIL_TORUS_SEGMENTS
        ),
        strutCoilMaterial
      )
      torus.name = wheelId + '-strut-coil-' + index + '-visual'
      torus.rotation.x = Math.PI / 2
      torus.castShadow = true
      group.add(torus)
      coilTori.push(torus)
    }

    vehicle.add(group)

    const entry = {
      wheelId,
      axle,
      group,
      damperMesh,
      coilTori,
      topLocalMeters: new THREE.Vector3(),
      bottomLocalMeters: new THREE.Vector3(),
      lengthMeters: 0,
      isFinite: true,
    }

    strutEntries.set(wheelId, entry)
    return entry
  }

  // Orients the strut from the body's strut tower down to the wheel hub.
  // The tower is a fixed point in the vehicle's frame, so the strut's
  // length follows the published wheel position and the strut visibly
  // compresses with the suspension travel.
  function applyStrutPose(entry, wheelState) {
    const mountLocal = wheelState.suspensionMountLocalPosition
    const wheelCentreLocal = wheelState.wheelCenterLocalPosition
    const mountXMeters = Number(mountLocal?.x)
    const mountYMeters = Number(mountLocal?.y)
    const mountZMeters = Number(mountLocal?.z)
    const wheelXMeters = Number(wheelCentreLocal?.x)
    const wheelYMeters = Number(wheelCentreLocal?.y)
    const wheelZMeters = Number(wheelCentreLocal?.z)

    if (
      !Number.isFinite(mountXMeters) ||
      !Number.isFinite(mountYMeters) ||
      !Number.isFinite(mountZMeters) ||
      !Number.isFinite(wheelXMeters) ||
      !Number.isFinite(wheelYMeters) ||
      !Number.isFinite(wheelZMeters)
    ) {
      hideStrutEntry(entry)
      entry.isFinite = false
      return false
    }

    // +X is the car's left side, so the inboard direction is -x for the
    // left wheel and +x for the right wheel.
    const inboardSign = wheelXMeters >= 0 ? -1 : 1
    strutTopLocal.set(
      mountXMeters + inboardSign * STRUT_TOP_INBOARD_OFFSET_METERS,
      mountYMeters,
      mountZMeters
    )
    strutBottomLocal.set(
      wheelXMeters + inboardSign * STRUT_BOTTOM_INBOARD_OFFSET_METERS,
      wheelYMeters,
      wheelZMeters
    )

    strutAxisLocal.subVectors(strutTopLocal, strutBottomLocal)
    const lengthMeters = strutAxisLocal.length()
    if (!Number.isFinite(lengthMeters) || lengthMeters < 1e-4) {
      hideStrutEntry(entry)
      entry.isFinite = false
      return false
    }

    strutAxisLocal.multiplyScalar(1 / lengthMeters)
    strutMidpointLocal
      .addVectors(strutTopLocal, strutBottomLocal)
      .multiplyScalar(0.5)

    entry.group.position.copy(strutMidpointLocal)
    entry.group.quaternion.setFromUnitVectors(STRUT_UP_AXIS, strutAxisLocal)
    entry.group.visible = true
    entry.damperMesh.scale.set(1, lengthMeters, 1)

    // The coil occupies the upper part of the strut. The coil tori are
    // positioned individually instead of scaling a coil group, so the
    // wire's thickness stays constant as the strut compresses.
    const coilSpanMeters = lengthMeters * STRUT_COIL_SPAN_FRACTION01
    const coilTopMeters =
      lengthMeters * (0.5 - STRUT_COIL_TOP_MARGIN_FRACTION01)
    const coilBottomMeters = coilTopMeters - coilSpanMeters
    const lastIndex = entry.coilTori.length - 1
    for (let index = 0; index <= lastIndex; index += 1) {
      const fraction = lastIndex > 0 ? index / lastIndex : 0
      entry.coilTori[index].position.y =
        coilBottomMeters + fraction * coilSpanMeters
    }

    entry.lengthMeters = lengthMeters
    entry.isFinite = true
    return true
  }

  function hideStrutEntry(entry) {
    entry.group.visible = false
  }

  function isFiniteVector3(vector) {
    return (
      vector?.isVector3 === true &&
      Number.isFinite(vector.x) &&
      Number.isFinite(vector.y) &&
      Number.isFinite(vector.z)
    )
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

function createStrutSnapshot(wheelId) {
  return {
    wheelId,
    axle: null,
    isVisible: false,
    hasNode: false,
    lengthMeters: 0,
    topLocalMeters: new THREE.Vector3(),
    bottomLocalMeters: new THREE.Vector3(),
    isFinite: true,
  }
}

function updateStrutSnapshot(strutSnapshot, updates) {
  strutSnapshot.axle = updates.axle ?? strutSnapshot.axle
  strutSnapshot.isVisible = updates.isVisible
  strutSnapshot.hasNode = updates.hasNode
  strutSnapshot.lengthMeters = updates.lengthMeters ?? 0
  strutSnapshot.isFinite = updates.isFinite
  return strutSnapshot
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

function findWheelStateById(wheelStates, wheelId) {
  for (const wheelState of wheelStates) {
    if (wheelState?.id === wheelId) return wheelState
  }
  return null
}
