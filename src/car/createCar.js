// src/car/createCar.js

import * as THREE from 'three'
import { createTirePressureVisuals } from './createTirePressureVisuals.js'
import { createWheelAxleVisualKinematics } from './createWheelAxleVisualKinematics.js'
import { createAnchoredToroidalTireGeometry } from './tireDeformationGeometry.js'
import { WHEEL_TIRE_VISUAL_DIMENSIONS } from './wheelTireVisualDimensions.js'

const BODY_LENGTH = 2.8
const BODY_WIDTH = 1.45
const BODY_HEIGHT = 0.65

const WHEEL_RADIUS = WHEEL_TIRE_VISUAL_DIMENSIONS.tireOuterRadiusMeters
const WHEEL_WIDTH = WHEEL_TIRE_VISUAL_DIMENSIONS.tireSectionWidthMeters
const WHEEL_ROTATION_WITNESS_WIDTH = WHEEL_WIDTH * 1.08
const WHEEL_ROTATION_WITNESS_HEIGHT = 0.028
const WHEEL_ROTATION_WITNESS_DEPTH = WHEEL_RADIUS * 0.28

const FRONT_AXLE_Z = 1.45
const REAR_AXLE_Z = -1.45
const WHEEL_X = 1.25
const WHEEL_Y = WHEEL_RADIUS
// Authored visual mount height: with the default 0.35 m rest length and
// 40% static compression, the static hub remains at the pre-feature 0.48 m.
const WHEEL_STATIC_SUSPENSION_LENGTH_METERS = 0.262
const WHEEL_SUSPENSION_MOUNT_Y =
  WHEEL_Y + WHEEL_STATIC_SUSPENSION_LENGTH_METERS

const BODY_Y = 1.36
const FRAME_Y = 0.98

const FRAME_RAIL_X = 0.52
const FRAME_RAIL_WIDTH = 0.11
const FRAME_RAIL_HEIGHT = 0.11
const FRAME_RAIL_LENGTH = 3.65
const CHASSIS_ATTITUDE_VISUAL_ROOT_NAME = 'chassis-attitude-visual-root'
const CHASSIS_ATTITUDE_PIVOT_Y = WHEEL_Y

const SPINDLE_SUPPORT_WIDTH = 0.08
const SPINDLE_SUPPORT_DEPTH = 0.08
const SPINDLE_SUPPORT_TOP_Y = FRAME_Y - FRAME_RAIL_HEIGHT / 2
const SPINDLE_SUPPORT_BOTTOM_Y = WHEEL_Y

const ARTICULATED_SEGMENT_RADIUS = 0.045
const REAR_DIFFERENTIAL_RADIUS = 0.19
const REAR_HALF_SHAFT_INNER_X = 0.18
const FRONT_SPINDLE_INNER_X = FRAME_RAIL_X
const TRANSMISSION_OUTPUT_Z = 1.15
const REAR_DIFFERENTIAL_HANGER_X = 0.24
const REAR_DIFFERENTIAL_HANGER_WIDTH = 0.075
const REAR_DIFFERENTIAL_HANGER_DEPTH = 0.08
const TRANSMISSION_OUTPUT_MOUNT_Y = FRAME_Y - 0.18

const BRAKE_LIGHT_WIDTH = 0.22
const BRAKE_LIGHT_HEIGHT = 0.16
const BRAKE_LIGHT_DEPTH = 0.05
const BRAKE_LIGHT_X = BODY_WIDTH * 0.32
const BRAKE_LIGHT_Y = BODY_Y + BODY_HEIGHT * 0.12
const BRAKE_LIGHT_Z = -BODY_LENGTH / 2 - BRAKE_LIGHT_DEPTH / 2 - 0.012

export function createCar() {
  const car = new THREE.Group()
  car.name = 'vehicle-root'

  const materials = createMaterials()
  const chassisVisualRoot = createChassisAttitudeVisualRoot()

  const body = createBody(materials.body)
  const nose = createNose(materials.nose)
  const brakeLights = createBrakeLights(materials.brakeLight)

  const frameRails = [
    createFrameRail('left-frame-rail', -FRAME_RAIL_X, materials.frame),
    createFrameRail('right-frame-rail', FRAME_RAIL_X, materials.frame),
  ]

  const crossmembers = [
    createCrossmember('front-crossmember', FRONT_AXLE_Z, materials.frame),
    createCrossmember('rear-crossmember', REAR_AXLE_Z, materials.frame),
    createCrossmember('center-crossmember', 0, materials.frame),
  ]

  const frontSpindleSupports = [
    createSpindleInnerSupport(
      'front-left-spindle-inner-support-placeholder',
      -FRAME_RAIL_X,
      FRONT_AXLE_Z,
      materials.frame
    ),
    createSpindleInnerSupport(
      'front-right-spindle-inner-support-placeholder',
      FRAME_RAIL_X,
      FRONT_AXLE_Z,
      materials.frame
    ),
  ]

  const rearDifferentialHousing = createRearDifferentialHousing(
    materials.drivetrain
  )
  const driveshaft = createDriveshaft(materials.drivetrain)
  const rearDifferentialHangers = [
    createVerticalChassisBracket(
      'rear-differential-left-hanger',
      -REAR_DIFFERENTIAL_HANGER_X,
      REAR_AXLE_Z,
      FRAME_Y - FRAME_RAIL_HEIGHT / 2,
      WHEEL_Y + REAR_DIFFERENTIAL_RADIUS * 0.65,
      materials.frame
    ),
    createVerticalChassisBracket(
      'rear-differential-right-hanger',
      REAR_DIFFERENTIAL_HANGER_X,
      REAR_AXLE_Z,
      FRAME_Y - FRAME_RAIL_HEIGHT / 2,
      WHEEL_Y + REAR_DIFFERENTIAL_RADIUS * 0.65,
      materials.frame
    ),
    createVerticalChassisBracket(
      'transmission-output-hanger',
      0,
      TRANSMISSION_OUTPUT_Z,
      FRAME_Y - FRAME_RAIL_HEIGHT / 2,
      TRANSMISSION_OUTPUT_MOUNT_Y,
      materials.frame,
      0.09,
      0.09
    ),
  ]
  const chassisAnchors = [
    createChassisVisualAnchor(
      'front-left-spindle-inner-anchor',
      -FRONT_SPINDLE_INNER_X,
      WHEEL_Y,
      FRONT_AXLE_Z
    ),
    createChassisVisualAnchor(
      'front-right-spindle-inner-anchor',
      FRONT_SPINDLE_INNER_X,
      WHEEL_Y,
      FRONT_AXLE_Z
    ),
    createChassisVisualAnchor(
      'rear-left-half-shaft-inner-anchor',
      -REAR_HALF_SHAFT_INNER_X,
      WHEEL_Y,
      REAR_AXLE_Z
    ),
    createChassisVisualAnchor(
      'rear-right-half-shaft-inner-anchor',
      REAR_HALF_SHAFT_INNER_X,
      WHEEL_Y,
      REAR_AXLE_Z
    ),
  ]
  const articulatedSegments = [
    createArticulatedSegment(
      'front-left-spindle-link',
      'non-driven-spindle-link-placeholder',
      'front-left',
      new THREE.Vector3(-FRONT_SPINDLE_INNER_X, WHEEL_Y, FRONT_AXLE_Z),
      new THREE.Vector3(-1, 0, 0),
      'front-left-spindle-inner-anchor',
      materials.metal
    ),
    createArticulatedSegment(
      'front-right-spindle-link',
      'non-driven-spindle-link-placeholder',
      'front-right',
      new THREE.Vector3(FRONT_SPINDLE_INNER_X, WHEEL_Y, FRONT_AXLE_Z),
      new THREE.Vector3(1, 0, 0),
      'front-right-spindle-inner-anchor',
      materials.metal
    ),
    createArticulatedSegment(
      'rear-left-half-shaft',
      'driven-half-shaft-placeholder',
      'rear-left',
      new THREE.Vector3(-REAR_HALF_SHAFT_INNER_X, WHEEL_Y, REAR_AXLE_Z),
      new THREE.Vector3(-1, 0, 0),
      'rear-left-half-shaft-inner-anchor',
      materials.drivetrain
    ),
    createArticulatedSegment(
      'rear-right-half-shaft',
      'driven-half-shaft-placeholder',
      'rear-right',
      new THREE.Vector3(REAR_HALF_SHAFT_INNER_X, WHEEL_Y, REAR_AXLE_Z),
      new THREE.Vector3(1, 0, 0),
      'rear-right-half-shaft-inner-anchor',
      materials.drivetrain
    ),
  ]

  const wheels = [
    createWheel('front-left', -WHEEL_X, FRONT_AXLE_Z, materials),
    createWheel('front-right', WHEEL_X, FRONT_AXLE_Z, materials),
    createWheel('rear-left', -WHEEL_X, REAR_AXLE_Z, materials),
    createWheel('rear-right', WHEEL_X, REAR_AXLE_Z, materials),
  ]

  const contactPatches = wheels.map((wheel) =>
    createContactPatch(wheel.userData.wheel, materials.contactPatch)
  )

  for (let index = 0; index < wheels.length; index += 1) {
    wheels[index].userData.wheel.visualNodes.contactPatch =
      contactPatches[index].name
  }

  car.add(chassisVisualRoot)
  addToChassisVisualRoot(chassisVisualRoot, body)
  addToChassisVisualRoot(chassisVisualRoot, nose)

  for (const brakeLight of brakeLights) {
    addToChassisVisualRoot(chassisVisualRoot, brakeLight)
  }

  for (const rail of frameRails) {
    addToChassisVisualRoot(chassisVisualRoot, rail)
  }

  for (const crossmember of crossmembers) {
    addToChassisVisualRoot(chassisVisualRoot, crossmember)
  }

  for (const support of frontSpindleSupports) {
    addToChassisVisualRoot(chassisVisualRoot, support)
  }

  addToChassisVisualRoot(chassisVisualRoot, rearDifferentialHousing)
  addToChassisVisualRoot(chassisVisualRoot, driveshaft)

  for (const hanger of rearDifferentialHangers) {
    addToChassisVisualRoot(chassisVisualRoot, hanger)
  }

  for (const anchor of chassisAnchors) {
    addToChassisVisualRoot(chassisVisualRoot, anchor)
  }

  for (const segment of articulatedSegments) {
    car.add(segment.node)
  }

  for (const wheel of wheels) {
    car.add(wheel)
  }

  for (const patch of contactPatches) {
    car.add(patch)
  }

  car.userData.vehicle = {
    kind: 'raised-four-wheel-test-chassis',
    forwardAxisLocal: new THREE.Vector3(0, 0, 1),
    body: {
      length: BODY_LENGTH,
      width: BODY_WIDTH,
      height: BODY_HEIGHT,
      centerY: BODY_Y,
      bottomY: BODY_Y - BODY_HEIGHT / 2,
    },
    frame: {
      railX: FRAME_RAIL_X,
      railY: FRAME_Y,
      railLength: FRAME_RAIL_LENGTH,
      spindleInnerSupportNodes: frontSpindleSupports.map(
        (support) => support.name
      ),
    },
    chassisVisual: {
      rootNode: chassisVisualRoot.name,
      attitudePivotLocalMeters:
        chassisVisualRoot.userData.chassisAttitudeVisual.pivotLocalMeters,
      behaviorImpact: 'visual-only',
      attitudeRepresentationKind:
        'body-frame-drivetrain-anchor-root-v1',
      anchorNodes: chassisAnchors.map((anchor) => anchor.name),
      hangerNodes: rearDifferentialHangers.map((hanger) => hanger.name),
    },
    drivetrain: {
      layout: 'rear-wheel-drive-visual-placeholder',
      drivenWheels: ['rear-left', 'rear-right'],
      representationKind: 'independent-half-shafts-and-front-spindle-links-v1',
      differentialHousingNode: rearDifferentialHousing.name,
      driveshaftNode: driveshaft.name,
      articulatedSegments: articulatedSegments.map((segment) => ({
        id: segment.id,
        kind: segment.kind,
        node: segment.node.name,
        outerWheelId: segment.outerWheelId,
        innerAttachmentNode: segment.innerAttachmentNode,
        innerAttachmentLocalMeters: segment.innerAttachmentLocalMeters,
        fallbackDirectionLocal: segment.fallbackDirectionLocal,
      })),
      note: 'Visual-only independent articulation; no CV-joint, control-arm, or driveshaft torque physics.',
    },
    lighting: {
      brakeLightNodes: brakeLights.map((brakeLight) => brakeLight.name),
    },
    steering: {
      steerableWheels: ['front-left', 'front-right'],
      plannedMaxSteerRadians: Math.PI / 5,
      note: 'Front wheel pivots own local-Y steering at the authoritative wheel center.',
    },
    wheels: wheels.map((wheel) => ({
      ...wheel.userData.wheel,
    })),
    tireInflationVisuals: {
      contactPatchNodes: contactPatches.map((patch) => patch.name),
    },
    setChassisAttitudeVisualState: (chassisAttitudeState) => {
      applyChassisAttitudeVisualState(chassisVisualRoot, chassisAttitudeState)
    },
    setTireInflationVisualState: (tirePressureState, wheelStates = null) => {
      tirePressureVisuals.setTargetFromPressureState(tirePressureState)
      tirePressureVisuals.setTargetFromWheelStates(wheelStates)
    },
  }

  const wheelAxleVisualKinematics = createWheelAxleVisualKinematics(car)
  car.userData.vehicle.wheelAxleVisualKinematics = wheelAxleVisualKinematics

  const tirePressureVisuals = createTirePressureVisuals(car)
  car.userData.vehicle.tirePressureVisuals = tirePressureVisuals
  tirePressureVisuals.reset()

  return car
}

function createChassisAttitudeVisualRoot() {
  const root = new THREE.Group()
  root.name = CHASSIS_ATTITUDE_VISUAL_ROOT_NAME
  root.position.set(0, CHASSIS_ATTITUDE_PIVOT_Y, 0)
  root.userData.chassisAttitudeVisual = {
    pivotLocalMeters: new THREE.Vector3(0, CHASSIS_ATTITUDE_PIVOT_Y, 0),
  }

  return root
}

function addToChassisVisualRoot(chassisVisualRoot, node) {
  const pivotLocalMeters =
    chassisVisualRoot.userData.chassisAttitudeVisual.pivotLocalMeters
  node.position.sub(pivotLocalMeters)
  chassisVisualRoot.add(node)

  return node
}

function applyChassisAttitudeVisualState(chassisVisualRoot, state = {}) {
  const heaveOffsetMeters = sanitizeFiniteNumber(state.heaveOffsetMeters)
  const pitchRadians = sanitizeFiniteNumber(state.pitchRadians)
  const rollRadians = sanitizeFiniteNumber(state.rollRadians)

  chassisVisualRoot.position.set(
    0,
    CHASSIS_ATTITUDE_PIVOT_Y + heaveOffsetMeters,
    0
  )
  chassisVisualRoot.rotation.set(pitchRadians, 0, rollRadians)
}

function createMaterials() {
  return {
    body: new THREE.MeshStandardMaterial({
      color: 0x990000,
      metalness: 0.55,
      roughness: 0.35,
    }),
    nose: new THREE.MeshStandardMaterial({
      color: 0xff3333,
      metalness: 0.55,
      roughness: 0.35,
    }),
    tire: new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.05,
      roughness: 0.9,
    }),
    hub: new THREE.MeshStandardMaterial({
      color: 0x666a70,
      metalness: 0.82,
      roughness: 0.28,
    }),
    rim: new THREE.MeshStandardMaterial({
      color: 0x939aa3,
      metalness: 0.86,
      roughness: 0.22,
    }),
    wheelRotationWitness: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.15,
      metalness: 0,
      roughness: 0.35,
    }),
    frame: new THREE.MeshStandardMaterial({
      color: 0x202020,
      metalness: 0.65,
      roughness: 0.35,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x666666,
      metalness: 0.8,
      roughness: 0.25,
    }),
    drivetrain: new THREE.MeshStandardMaterial({
      color: 0x303030,
      metalness: 0.8,
      roughness: 0.3,
    }),
    contactPatch: new THREE.MeshStandardMaterial({
      color: 0x050505,
      metalness: 0,
      roughness: 1,
      transparent: true,
      opacity: 0.55,
    }),
    brakeLight: new THREE.MeshStandardMaterial({
      color: 0x330000,
      emissive: 0x000000,
      emissiveIntensity: 0,
      metalness: 0,
      roughness: 0.25,
      toneMapped: false,
    }),
  }
}

function createBody(material) {
  const geometry = new THREE.BoxGeometry(BODY_WIDTH, BODY_HEIGHT, BODY_LENGTH)
  const body = new THREE.Mesh(geometry, material)

  body.name = 'raised-body-shell'
  body.castShadow = true
  body.position.set(0, BODY_Y, 0)

  return body
}

function createNose(material) {
  const geometry = new THREE.ConeGeometry(0.72, 1.15, 3)
  const nose = new THREE.Mesh(geometry, material)

  nose.name = 'front-direction-nose'
  nose.castShadow = true
  nose.rotation.x = Math.PI / 2
  nose.position.set(0, BODY_Y, BODY_LENGTH / 2 + 0.52)

  return nose
}

function createBrakeLights(material) {
  return [
    createBrakeLight('brake-light-left', -BRAKE_LIGHT_X, material),
    createBrakeLight('brake-light-right', BRAKE_LIGHT_X, material),
  ]
}

function createBrakeLight(name, x, material) {
  const geometry = new THREE.BoxGeometry(
    BRAKE_LIGHT_WIDTH,
    BRAKE_LIGHT_HEIGHT,
    BRAKE_LIGHT_DEPTH
  )

  const brakeLight = new THREE.Mesh(geometry, material)
  brakeLight.name = name
  brakeLight.castShadow = false
  brakeLight.position.set(x, BRAKE_LIGHT_Y, BRAKE_LIGHT_Z)

  return brakeLight
}

function createFrameRail(name, x, material) {
  const geometry = new THREE.BoxGeometry(
    FRAME_RAIL_WIDTH,
    FRAME_RAIL_HEIGHT,
    FRAME_RAIL_LENGTH
  )

  const rail = new THREE.Mesh(geometry, material)
  rail.name = name
  rail.castShadow = true
  rail.position.set(x, FRAME_Y, 0)

  return rail
}

function createCrossmember(name, z, material) {
  const geometry = new THREE.BoxGeometry(
    FRAME_RAIL_X * 2 + FRAME_RAIL_WIDTH,
    FRAME_RAIL_HEIGHT,
    0.12
  )

  const crossmember = new THREE.Mesh(geometry, material)
  crossmember.name = name
  crossmember.castShadow = true
  crossmember.position.set(0, FRAME_Y, z)

  return crossmember
}

function createSpindleInnerSupport(name, x, z, material) {
  const height = SPINDLE_SUPPORT_TOP_Y - SPINDLE_SUPPORT_BOTTOM_Y

  const geometry = new THREE.BoxGeometry(
    SPINDLE_SUPPORT_WIDTH,
    height,
    SPINDLE_SUPPORT_DEPTH
  )

  const support = new THREE.Mesh(geometry, material)
  support.name = name
  support.castShadow = true
  support.position.set(
    x,
    SPINDLE_SUPPORT_BOTTOM_Y + height / 2,
    z
  )

  return support
}

function createVerticalChassisBracket(
  name,
  x,
  z,
  topY,
  bottomY,
  material,
  width = REAR_DIFFERENTIAL_HANGER_WIDTH,
  depth = REAR_DIFFERENTIAL_HANGER_DEPTH
) {
  const height = Math.max(0.01, topY - bottomY)
  const bracket = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material
  )

  bracket.name = name
  bracket.castShadow = true
  bracket.position.set(x, bottomY + height / 2, z)

  return bracket
}

function createChassisVisualAnchor(name, x, y, z) {
  const anchor = new THREE.Object3D()
  anchor.name = name
  anchor.position.set(x, y, z)
  return anchor
}

function createRearDifferentialHousing(material) {
  const housing = new THREE.Mesh(
    new THREE.SphereGeometry(REAR_DIFFERENTIAL_RADIUS, 20, 12),
    material
  )
  housing.name = 'rear-differential-housing-placeholder'
  housing.castShadow = true
  housing.position.set(0, WHEEL_Y, REAR_AXLE_Z)
  housing.scale.set(1.35, 1, 1)
  return housing
}

function createDriveshaft(material) {
  const length = Math.abs(TRANSMISSION_OUTPUT_Z - REAR_AXLE_Z)
  const geometry = new THREE.CylinderGeometry(0.045, 0.045, length, 16)
  const driveshaft = new THREE.Mesh(geometry, material)

  driveshaft.name = 'center-driveshaft-placeholder'
  driveshaft.castShadow = true
  driveshaft.rotation.x = Math.PI / 2
  driveshaft.position.set(
    0,
    WHEEL_Y,
    (TRANSMISSION_OUTPUT_Z + REAR_AXLE_Z) * 0.5
  )

  return driveshaft
}

function createArticulatedSegment(
  id,
  kind,
  outerWheelId,
  innerAttachmentLocalMeters,
  fallbackDirectionLocal,
  innerAttachmentNode,
  material
) {
  const node = new THREE.Mesh(
    new THREE.CylinderGeometry(
      ARTICULATED_SEGMENT_RADIUS,
      ARTICULATED_SEGMENT_RADIUS,
      1,
      16
    ),
    material
  )
  node.name = id
  node.castShadow = true

  return {
    id,
    kind,
    node,
    outerWheelId,
    innerAttachmentLocalMeters,
    fallbackDirectionLocal,
    innerAttachmentNode,
  }
}

function createWheel(id, x, z, materials) {
  const dimensions = WHEEL_TIRE_VISUAL_DIMENSIONS
  const wheelPivot = new THREE.Group()
  wheelPivot.name = `wheel-pivot-${id}`

  const rollingAssembly = new THREE.Group()
  rollingAssembly.name = `wheel-rolling-assembly-${id}`

  const tireGeometryData = createAnchoredToroidalTireGeometry({
    visualDimensions: dimensions,
  })
  const tire = new THREE.Mesh(tireGeometryData.geometry, materials.tire)
  tire.name = `tire-${id}`
  tire.castShadow = true

  // The retained hub is the central mounting disc. The barrel, two bead seats,
  // and flanges are distinct rigid rim components that share tire dimensions.
  const hub = createRigidWheelCylinder(
    `hub-${id}`,
    dimensions.hubDiscRadiusMeters,
    dimensions.hubDiscWidthMeters,
    0,
    materials.hub
  )
  const rimBarrel = createRigidWheelCylinder(
    `rim-barrel-${id}`,
    dimensions.rimBarrelOuterRadiusMeters,
    dimensions.rimBarrelWidthMeters,
    0,
    materials.rim
  )
  const leftBeadSeat = createRigidWheelCylinder(
    `rim-bead-seat-left-${id}`,
    dimensions.beadSeatRadiusMeters,
    dimensions.beadSeatWidthMeters,
    -dimensions.beadSeatAxialPositionMeters,
    materials.rim
  )
  const rightBeadSeat = createRigidWheelCylinder(
    `rim-bead-seat-right-${id}`,
    dimensions.beadSeatRadiusMeters,
    dimensions.beadSeatWidthMeters,
    dimensions.beadSeatAxialPositionMeters,
    materials.rim
  )
  const leftFlange = createRigidWheelCylinder(
    `rim-flange-left-${id}`,
    dimensions.rimFlangeRadiusMeters,
    dimensions.rimFlangeWidthMeters,
    -dimensions.rimFlangeAxialPositionMeters,
    materials.rim
  )
  const rightFlange = createRigidWheelCylinder(
    `rim-flange-right-${id}`,
    dimensions.rimFlangeRadiusMeters,
    dimensions.rimFlangeWidthMeters,
    dimensions.rimFlangeAxialPositionMeters,
    materials.rim
  )
  const rotationWitness = createWheelRotationWitness(
    id,
    materials.wheelRotationWitness
  )

  rollingAssembly.add(
    tire,
    hub,
    rimBarrel,
    leftBeadSeat,
    rightBeadSeat,
    leftFlange,
    rightFlange,
    rotationWitness
  )
  wheelPivot.add(rollingAssembly)
  wheelPivot.position.set(x, WHEEL_Y, z)

  wheelPivot.userData.wheel = {
    id,
    localPosition: new THREE.Vector3(x, WHEEL_Y, z),
    suspensionMountLocal: new THREE.Vector3(
      x,
      WHEEL_SUSPENSION_MOUNT_Y,
      z
    ),
    suspensionAxisDownLocal: new THREE.Vector3(0, -1, 0),
    radius: dimensions.tireOuterRadiusMeters,
    width: dimensions.tireSectionWidthMeters,
    tireGeometry: {
      kind: tireGeometryData.metadata.kind,
      outerRadiusMeters: tireGeometryData.metadata.tireOuterRadiusMeters,
      sectionWidthMeters: tireGeometryData.metadata.tireSectionWidthMeters,
      beadRadiusMeters: tireGeometryData.metadata.tireBeadRadiusMeters,
      beadAxialPositionMeters:
        tireGeometryData.metadata.tireBeadAxialPositionMeters,
      beadInterfaceOverlapMeters:
        tireGeometryData.metadata.beadInterfaceOverlapMeters,
      beadInterfaceToleranceMeters:
        tireGeometryData.metadata.beadInterfaceToleranceMeters,
    },
    rigidWheelGeometry: {
      kind: 'rim-barrel-bead-seat-and-flange-v1',
      hubDiscRadiusMeters: dimensions.hubDiscRadiusMeters,
      hubDiscWidthMeters: dimensions.hubDiscWidthMeters,
      rimBarrelOuterRadiusMeters: dimensions.rimBarrelOuterRadiusMeters,
      rimBarrelWidthMeters: dimensions.rimBarrelWidthMeters,
      beadSeatRadiusMeters: dimensions.beadSeatRadiusMeters,
      beadSeatWidthMeters: dimensions.beadSeatWidthMeters,
      beadSeatAxialPositionMeters: dimensions.beadSeatAxialPositionMeters,
      rimFlangeRadiusMeters: dimensions.rimFlangeRadiusMeters,
      rimFlangeWidthMeters: dimensions.rimFlangeWidthMeters,
      rimFlangeAxialPositionMeters: dimensions.rimFlangeAxialPositionMeters,
    },
    axle: z > 0 ? 'front' : 'rear',
    side: x < 0 ? 'left' : 'right',
    driven: z < 0,
    steerable: z > 0,
    steeringPivotLocal: new THREE.Vector3(x, WHEEL_Y, z),
    rollingAxisLocal: new THREE.Vector3(1, 0, 0),
    contactPatchLocal: new THREE.Vector3(x, 0, z),
    visualNodes: {
      pivot: wheelPivot.name,
      rollingAssembly: rollingAssembly.name,
      tire: tire.name,
      hub: hub.name,
      rimBarrel: rimBarrel.name,
      beadSeatLeft: leftBeadSeat.name,
      beadSeatRight: rightBeadSeat.name,
      rimFlangeLeft: leftFlange.name,
      rimFlangeRight: rightFlange.name,
      rotationWitness: rotationWitness.name,
    },
  }

  return wheelPivot
}

function createRigidWheelCylinder(name, radiusMeters, widthMeters, xMeters, material) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusMeters, radiusMeters, widthMeters, 24),
    material
  )
  mesh.name = name
  mesh.castShadow = true
  mesh.rotation.z = Math.PI / 2
  mesh.position.x = xMeters
  return mesh
}

function createWheelRotationWitness(id, material) {
  const geometry = new THREE.BoxGeometry(
    WHEEL_ROTATION_WITNESS_WIDTH,
    WHEEL_ROTATION_WITNESS_HEIGHT,
    WHEEL_ROTATION_WITNESS_DEPTH
  )

  const marker = new THREE.Mesh(geometry, material)
  marker.name = `wheel-rotation-witness-${id}`
  marker.castShadow = false
  marker.position.y = WHEEL_RADIUS + WHEEL_ROTATION_WITNESS_HEIGHT / 2

  return marker
}

function createContactPatch(wheelInfo, material) {
  const geometry = new THREE.BoxGeometry(
    WHEEL_WIDTH * 0.9,
    0.025,
    WHEEL_RADIUS * 0.7
  )

  const patch = new THREE.Mesh(geometry, material)
  patch.name = `contact-patch-${wheelInfo.id}`
  patch.position.copy(wheelInfo.contactPatchLocal)
  patch.position.y = 0.0125
  patch.receiveShadow = true

  return patch
}

function sanitizeFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}
