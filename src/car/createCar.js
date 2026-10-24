// src/car/createCar.js

import * as THREE from 'three'
import { createSuspensionVisuals } from './createSuspensionVisuals.js'
import { createTirePressureVisuals } from './createTirePressureVisuals.js'
import { createWheelAxleVisualKinematics } from './createWheelAxleVisualKinematics.js'
import { createAnchoredToroidalTireGeometry } from './tireDeformationGeometry.js'
import { WHEEL_TIRE_VISUAL_DIMENSIONS } from './wheelTireVisualDimensions.js'

const DEFAULT_BODY_LENGTH = 2.8
const DEFAULT_BODY_WIDTH = 1.45
const DEFAULT_BODY_HEIGHT = 0.65

const WHEEL_RADIUS = WHEEL_TIRE_VISUAL_DIMENSIONS.tireOuterRadiusMeters
const WHEEL_WIDTH = WHEEL_TIRE_VISUAL_DIMENSIONS.tireSectionWidthMeters
const WHEEL_STATIC_SUSPENSION_LENGTH_METERS = 0.262
const WHEEL_ROTATION_WITNESS_WIDTH = WHEEL_WIDTH * 1.08
const WHEEL_ROTATION_WITNESS_HEIGHT = 0.028
const WHEEL_ROTATION_WITNESS_DEPTH = WHEEL_RADIUS * 0.28

const DEFAULT_FRONT_AXLE_Z = 1.45
const DEFAULT_REAR_AXLE_Z = -1.45
const DEFAULT_WHEEL_X = 1.25
const DEFAULT_BODY_Y = 1.36
const DEFAULT_FRAME_Y = 0.98

const DEFAULT_FRAME_RAIL_X = 0.52
const FRAME_RAIL_WIDTH = 0.11
const FRAME_RAIL_HEIGHT = 0.11
const FRAME_RAIL_LENGTH = 3.65
const CHASSIS_ATTITUDE_VISUAL_ROOT_NAME = 'chassis-attitude-visual-root'
const ARTICULATED_SEGMENT_RADIUS = 0.045
const REAR_DIFFERENTIAL_RADIUS = 0.19
const REAR_HALF_SHAFT_INNER_X = 0.18
const TRANSMISSION_OUTPUT_Z = 1.15
const REAR_DIFFERENTIAL_HANGER_X = 0.24
const REAR_DIFFERENTIAL_HANGER_WIDTH = 0.075
const REAR_DIFFERENTIAL_HANGER_DEPTH = 0.08
const BRAKE_LIGHT_WIDTH = 0.22
const BRAKE_LIGHT_HEIGHT = 0.16
const BRAKE_LIGHT_DEPTH = 0.05

function sanitizePositiveMeters(value, fallbackMeters) {
  return Number.isFinite(value) && value > 0 ? value : fallbackMeters
}

function deriveVisualGeometry(spec = {}) {
  const wheelbaseMeters = sanitizePositiveMeters(
    spec.wheelbaseMeters,
    DEFAULT_FRONT_AXLE_Z * 2
  )
  const trackWidthMeters = sanitizePositiveMeters(
    spec.frontTrackWidthMeters,
    DEFAULT_WHEEL_X * 2
  )
  const rearTrackWidthMeters = sanitizePositiveMeters(
    spec.rearTrackWidthMeters,
    trackWidthMeters
  )
  const bodyVisualKind = spec.bodyVisualKind ?? 'hatchback'

  const bodyLengthMeters = wheelbaseMeters + 1.1
  const bodyWidthMeters = trackWidthMeters - 0.35
  const bodyHeightMeters =
    bodyVisualKind === 'truck'
      ? 0.95
      : bodyVisualKind === 'suv'
        ? 0.95
        : bodyVisualKind === 'roadster'
          ? 0.55
          : DEFAULT_BODY_HEIGHT

  return {
    bodyVisualKind,
    wheelbaseMeters,
    trackWidthMeters,
    bodyLengthMeters,
    bodyWidthMeters,
    bodyHeightMeters,
    frontAxleZMeters: wheelbaseMeters / 2,
    rearAxleZMeters: -wheelbaseMeters / 2,
    wheelXMeters: trackWidthMeters / 2,
    frontWheelXMeters: trackWidthMeters / 2,
    rearWheelXMeters: rearTrackWidthMeters / 2,
    wheelYMeters: WHEEL_RADIUS,
    wheelSuspensionMountYMeters:
      WHEEL_RADIUS + WHEEL_STATIC_SUSPENSION_LENGTH_METERS,
    frameY: DEFAULT_FRAME_Y + (bodyHeightMeters - DEFAULT_BODY_HEIGHT) * 0.5,
    bodyY: DEFAULT_BODY_Y + (bodyHeightMeters - DEFAULT_BODY_HEIGHT) * 0.5,
    frameRailXMeters: Math.max(0.3, trackWidthMeters / 2 - 0.73),
    brakeLightYMeters:
      DEFAULT_BODY_Y +
      (bodyHeightMeters - DEFAULT_BODY_HEIGHT) * 0.5 +
      bodyHeightMeters * 0.12,
    brakeLightZMeters: -(bodyLengthMeters / 2) - BRAKE_LIGHT_DEPTH / 2 - 0.012,
    transmissionOutputMountYMeters:
      DEFAULT_FRAME_Y + (bodyHeightMeters - DEFAULT_BODY_HEIGHT) * 0.5 - 0.18,
  }
}

export function createCar(spec = {}) {
  const visualGeometry = deriveVisualGeometry(spec)
  const FRONT_AXLE_Z = visualGeometry.frontAxleZMeters
  const REAR_AXLE_Z = visualGeometry.rearAxleZMeters
  const WHEEL_X = visualGeometry.wheelXMeters
  const FRONT_WHEEL_X = visualGeometry.frontWheelXMeters
  const REAR_WHEEL_X = visualGeometry.rearWheelXMeters
  const WHEEL_Y = WHEEL_RADIUS
  const FRAME_Y = visualGeometry.frameY
  const FRAME_RAIL_X = Math.max(0.3, WHEEL_X - 0.73)
  const WHEEL_STATIC_SUSPENSION_LENGTH_METERS = 0.262
  const WHEEL_SUSPENSION_MOUNT_Y =
    WHEEL_Y + WHEEL_STATIC_SUSPENSION_LENGTH_METERS
  const CHASSIS_ATTITUDE_PIVOT_Y = WHEEL_Y
  const SPINDLE_SUPPORT_TOP_Y = FRAME_Y - FRAME_RAIL_HEIGHT / 2
  const SPINDLE_SUPPORT_BOTTOM_Y = WHEEL_Y
  const FRONT_SPINDLE_INNER_X = FRAME_RAIL_X
  const TRANSMISSION_OUTPUT_MOUNT_Y = FRAME_Y - 0.18
  CHASSIS_TWIST_UNIFORMS.uFrontAxleZ.value = FRONT_AXLE_Z
  CHASSIS_TWIST_UNIFORMS.uRearAxleZ.value = REAR_AXLE_Z
  const car = new THREE.Group()
  car.name = 'vehicle-root'

  const materials = createMaterials()
  const chassisVisualRoot = createChassisAttitudeVisualRoot(visualGeometry)

  applyTwistShader(materials.body)

  let bodyVisualGeometry = visualGeometry
  let bodyVisuals = createBodyVisuals(materials, visualGeometry)

  const frameRails = [
    createFrameRail(
      'right-frame-rail',
      -visualGeometry.frameRailXMeters,
      materials.frame,
      visualGeometry
    ),
    createFrameRail(
      'left-frame-rail',
      visualGeometry.frameRailXMeters,
      materials.frame,
      visualGeometry
    ),
  ]

  const crossmembers = [
    createCrossmember(
      'front-crossmember',
      FRONT_AXLE_Z,
      materials.frame,
      visualGeometry
    ),
    createCrossmember(
      'rear-crossmember',
      REAR_AXLE_Z,
      materials.frame,
      visualGeometry
    ),
    createCrossmember('center-crossmember', 0, materials.frame, visualGeometry),
  ]

  const rearDifferentialHousing = createRearDifferentialHousing(
    materials.drivetrain,
    visualGeometry
  )
  const driveshaft = createDriveshaft(materials.drivetrain, visualGeometry)
  const rearDifferentialHangers = [
    createVerticalChassisBracket(
      'rear-differential-right-hanger',
      -REAR_DIFFERENTIAL_HANGER_X,
      REAR_AXLE_Z,
      FRAME_Y - FRAME_RAIL_HEIGHT / 2,
      WHEEL_Y + REAR_DIFFERENTIAL_RADIUS * 0.65,
      materials.frame
    ),
    createVerticalChassisBracket(
      'rear-differential-left-hanger',
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
      'front-right-spindle-inner-anchor',
      -FRONT_SPINDLE_INNER_X,
      WHEEL_Y,
      FRONT_AXLE_Z
    ),
    createChassisVisualAnchor(
      'front-left-spindle-inner-anchor',
      FRONT_SPINDLE_INNER_X,
      WHEEL_Y,
      FRONT_AXLE_Z
    ),
    createChassisVisualAnchor(
      'rear-right-half-shaft-inner-anchor',
      -REAR_HALF_SHAFT_INNER_X,
      WHEEL_Y,
      REAR_AXLE_Z
    ),
    createChassisVisualAnchor(
      'rear-left-half-shaft-inner-anchor',
      REAR_HALF_SHAFT_INNER_X,
      WHEEL_Y,
      REAR_AXLE_Z
    ),
  ]
  const articulatedSegments = [
    createArticulatedSegment(
      'front-right-spindle-link',
      'non-driven-spindle-link-visual',
      'front-right',
      new THREE.Vector3(-FRONT_SPINDLE_INNER_X, WHEEL_Y, FRONT_AXLE_Z),
      new THREE.Vector3(-1, 0, 0),
      'front-right-spindle-inner-anchor',
      materials.metal
    ),
    createArticulatedSegment(
      'front-left-spindle-link',
      'non-driven-spindle-link-visual',
      'front-left',
      new THREE.Vector3(FRONT_SPINDLE_INNER_X, WHEEL_Y, FRONT_AXLE_Z),
      new THREE.Vector3(1, 0, 0),
      'front-left-spindle-inner-anchor',
      materials.metal
    ),
    createArticulatedSegment(
      'rear-right-half-shaft',
      'driven-half-shaft-visual',
      'rear-right',
      new THREE.Vector3(-REAR_HALF_SHAFT_INNER_X, WHEEL_Y, REAR_AXLE_Z),
      new THREE.Vector3(-1, 0, 0),
      'rear-right-half-shaft-inner-anchor',
      materials.drivetrain
    ),
    createArticulatedSegment(
      'rear-left-half-shaft',
      'driven-half-shaft-visual',
      'rear-left',
      new THREE.Vector3(REAR_HALF_SHAFT_INNER_X, WHEEL_Y, REAR_AXLE_Z),
      new THREE.Vector3(1, 0, 0),
      'rear-left-half-shaft-inner-anchor',
      materials.drivetrain
    ),
  ]

  // The car frame is +Z forward and +Y up, so +X is the car's LEFT side
  // (the driver's right hand points to -X = forward x up). Wheel ids and the
  // side label below follow that physical handedness. The wheel geometry is
  // unchanged; only the names move to the wheel they actually describe.
  const wheels = [
    createWheel(
      'front-right',
      -FRONT_WHEEL_X,
      FRONT_AXLE_Z,
      materials,
      visualGeometry
    ),
    createWheel(
      'front-left',
      FRONT_WHEEL_X,
      FRONT_AXLE_Z,
      materials,
      visualGeometry
    ),
    createWheel(
      'rear-right',
      -REAR_WHEEL_X,
      REAR_AXLE_Z,
      materials,
      visualGeometry
    ),
    createWheel(
      'rear-left',
      REAR_WHEEL_X,
      REAR_AXLE_Z,
      materials,
      visualGeometry
    ),
  ]

  const contactPatches = wheels.map((wheel) =>
    createContactPatch(wheel.userData.wheel, materials.contactPatch)
  )

  for (let index = 0; index < wheels.length; index += 1) {
    wheels[index].userData.wheel.visualNodes.contactPatch =
      contactPatches[index].name
  }

  car.add(chassisVisualRoot)
  addBodyVisualsToChassisRoot(chassisVisualRoot, bodyVisuals)

  for (const rail of frameRails) {
    addToChassisVisualRoot(chassisVisualRoot, rail)
  }

  for (const crossmember of crossmembers) {
    addToChassisVisualRoot(chassisVisualRoot, crossmember)
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
    body: createBodyMetadata(visualGeometry),
    frame: {
      railX: FRAME_RAIL_X,
      railY: FRAME_Y,
      railLength: FRAME_RAIL_LENGTH,
      spindleInnerSupportNodes: [],
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
    suspension: {
      type: 'per-axle',
      frontAxleCoupling: spec.suspensionFront?.axleCoupling ?? 'independent',
      rearAxleCoupling: spec.suspensionRear?.axleCoupling ?? 'independent',
      visualRepresentation: 'per-axle-suspension-visual-kinds-v1',
      frontSuspensionVisualKind:
        spec.suspensionFront?.suspensionVisualKind ??
        spec.suspensionVisualKind ??
        'independent',
      rearSuspensionVisualKind:
        spec.suspensionRear?.suspensionVisualKind ??
        spec.suspensionVisualKind ??
        'independent',
      behavior: 'physics-driven-suspension-v1',
    },
    drivetrain: {
      layout: 'rear-wheel-drive-visual-layout',
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
      brakeLightNodes: bodyVisuals.brakeLights.map((brakeLight) => brakeLight.name),
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
    updateBodyVisuals: (nextSpec = {}) => {
      const nextVisualGeometry = deriveVisualGeometry(nextSpec)
      if (areBodyVisualGeometriesEqual(bodyVisualGeometry, nextVisualGeometry)) {
        return false
      }

      const nextBodyVisuals = createBodyVisuals(materials, nextVisualGeometry)
      addBodyVisualsToChassisRoot(chassisVisualRoot, nextBodyVisuals)

      const previousBodyVisuals = bodyVisuals
      bodyVisuals = nextBodyVisuals
      bodyVisualGeometry = nextVisualGeometry
      car.userData.vehicle.body = createBodyMetadata(nextVisualGeometry)
      CHASSIS_TWIST_UNIFORMS.uFrontAxleZ.value =
        nextVisualGeometry.frontAxleZMeters
      CHASSIS_TWIST_UNIFORMS.uRearAxleZ.value =
        nextVisualGeometry.rearAxleZMeters
      disposeBodyVisuals(chassisVisualRoot, previousBodyVisuals)

      return true
    },
    setChassisAttitudeVisualState: (chassisAttitudeState) => {
      applyChassisAttitudeVisualState(chassisVisualRoot, chassisAttitudeState)
    },
    setChassisTwistUniforms: (chassisAttitudeState) => {
      const frontRollRadians = sanitizeFiniteNumber(
        chassisAttitudeState?.frontRollRadians
      )
      const rearRollRadians = sanitizeFiniteNumber(
        chassisAttitudeState?.rearRollRadians
      )
      const meanAxleRollRadians =
        (frontRollRadians + rearRollRadians) * 0.5
      CHASSIS_TWIST_UNIFORMS.uFrontRollDeviationRadians.value =
        frontRollRadians - meanAxleRollRadians
      CHASSIS_TWIST_UNIFORMS.uRearRollDeviationRadians.value =
        rearRollRadians - meanAxleRollRadians
    },
    setTireInflationVisualState: (tirePressureState, wheelStates = null) => {
      tirePressureVisuals.setTargetFromPressureState(tirePressureState)
      tirePressureVisuals.setTargetFromWheelStates(wheelStates)
    },
  }

  const wheelAxleVisualKinematics = createWheelAxleVisualKinematics(car)
  car.userData.vehicle.wheelAxleVisualKinematics = wheelAxleVisualKinematics

  // The solid axle beam and leaf pack are created on demand by this module,
  // the first time their axle is coupled. The stock car therefore has no
  // axle beam geometry at all.
  const suspensionVisuals = createSuspensionVisuals(car)
  car.userData.vehicle.suspensionVisuals = suspensionVisuals

  const tirePressureVisuals = createTirePressureVisuals(car)
  car.userData.vehicle.tirePressureVisuals = tirePressureVisuals
  tirePressureVisuals.reset()

  return car
}

function createBodyVisuals(materials, visualGeometry) {
  return {
    body: createBody(materials.body, visualGeometry),
    greenhouse: createGreenhouse(materials.glass, visualGeometry),
    brakeLights: createBrakeLights(materials.brakeLight, visualGeometry),
  }
}

function addBodyVisualsToChassisRoot(chassisVisualRoot, bodyVisuals) {
  for (const node of getBodyVisualNodes(bodyVisuals)) {
    addToChassisVisualRoot(chassisVisualRoot, node)
  }
}

function disposeBodyVisuals(chassisVisualRoot, bodyVisuals) {
  for (const node of getBodyVisualNodes(bodyVisuals)) {
    chassisVisualRoot.remove(node)
    node.traverse((child) => {
      child.geometry?.dispose()
    })
  }
}

function getBodyVisualNodes(bodyVisuals) {
  return [
    bodyVisuals.body,
    bodyVisuals.greenhouse,
    ...bodyVisuals.brakeLights,
  ]
}

function createBodyMetadata(visualGeometry) {
  return {
    length: visualGeometry.bodyLengthMeters,
    width: visualGeometry.bodyWidthMeters,
    height: visualGeometry.bodyHeightMeters,
    centerY: visualGeometry.bodyY,
    bottomY: visualGeometry.bodyY - visualGeometry.bodyHeightMeters / 2,
    visualKind: visualGeometry.bodyVisualKind,
  }
}

function areBodyVisualGeometriesEqual(left, right) {
  return (
    left.bodyVisualKind === right.bodyVisualKind &&
    left.bodyLengthMeters === right.bodyLengthMeters &&
    left.bodyWidthMeters === right.bodyWidthMeters &&
    left.bodyHeightMeters === right.bodyHeightMeters &&
    left.bodyY === right.bodyY
  )
}

function createChassisAttitudeVisualRoot(visualGeometry) {
  const root = new THREE.Group()
  root.name = CHASSIS_ATTITUDE_VISUAL_ROOT_NAME
  root.position.set(0, visualGeometry.wheelYMeters, 0)
  root.userData.chassisAttitudeVisual = {
    pivotLocalMeters: new THREE.Vector3(0, visualGeometry.wheelYMeters, 0),
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
  const pivotLocalMeters =
    chassisVisualRoot.userData.chassisAttitudeVisual.pivotLocalMeters

  chassisVisualRoot.position.set(
    0,
    pivotLocalMeters.y + heaveOffsetMeters,
    0
  )
  chassisVisualRoot.rotation.set(pitchRadians, 0, rollRadians)
}

const CHASSIS_TWIST_UNIFORMS = {
  uFrontRollDeviationRadians: { value: 0 },
  uRearRollDeviationRadians: { value: 0 },
  uFrontAxleZ: { value: DEFAULT_FRONT_AXLE_Z },
  uRearAxleZ: { value: DEFAULT_REAR_AXLE_Z },
}

function applyTwistShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFrontRollDeviationRadians =
      CHASSIS_TWIST_UNIFORMS.uFrontRollDeviationRadians
    shader.uniforms.uRearRollDeviationRadians =
      CHASSIS_TWIST_UNIFORMS.uRearRollDeviationRadians
    shader.uniforms.uFrontAxleZ = CHASSIS_TWIST_UNIFORMS.uFrontAxleZ
    shader.uniforms.uRearAxleZ = CHASSIS_TWIST_UNIFORMS.uRearAxleZ

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uFrontRollDeviationRadians;
      uniform float uRearRollDeviationRadians;
      uniform float uFrontAxleZ;
      uniform float uRearAxleZ;`
    )

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float twistT = (position.z - uFrontAxleZ) / (uRearAxleZ - uFrontAxleZ);
      twistT = clamp(twistT, 0.0, 1.0);
      float twistAngle = mix(uFrontRollDeviationRadians, uRearRollDeviationRadians, twistT);
      float twistCos = cos(twistAngle);
      float twistSin = sin(twistAngle);
      float twistedX = transformed.x * twistCos - transformed.y * twistSin;
      float twistedY = transformed.x * twistSin + transformed.y * twistCos;
      transformed.x = twistedX;
      transformed.y = twistedY;
      objectNormal.x = normal.x * twistCos - normal.y * twistSin;
      objectNormal.y = normal.x * twistSin + normal.y * twistCos;
      objectNormal = normalize(objectNormal);`
    )
  }
  material.needsUpdate = true
}

function createMaterials() {
  return {
    body: new THREE.MeshStandardMaterial({
      color: 0x990000,
      metalness: 0.55,
      roughness: 0.35,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x101820,
      metalness: 0.25,
      roughness: 0.08,
      transparent: true,
      opacity: 0.82,
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

function createBody(material, visualGeometry) {
  const geometry = createBodyShellGeometry(visualGeometry)
  const body = new THREE.Mesh(geometry, material)

  body.name = 'raised-body-shell'
  body.castShadow = true
  body.position.set(0, visualGeometry.bodyY, 0)

  return body
}

function createGreenhouse(material, visualGeometry) {
  const lengthMeters = visualGeometry.bodyLengthMeters
  const heightMeters = visualGeometry.bodyHeightMeters
  const kind = visualGeometry.bodyVisualKind
  const greenhouseDepthMeters =
    kind === 'suv'
      ? lengthMeters * 0.72
      : kind === 'truck'
        ? lengthMeters * 0.4
        : kind === 'roadster'
          ? lengthMeters * 0.3
          : lengthMeters * 0.42
  const greenhouseCenterZMeters =
    kind === 'suv'
      ? -lengthMeters * 0.06
      : kind === 'truck'
        ? lengthMeters * 0.02
        : kind === 'roadster'
          ? lengthMeters * 0.07
          : lengthMeters * 0.01
  const greenhouseHeightMeters =
    heightMeters * (kind === 'roadster' ? 0.3 : 0.38)


  const geometry = new THREE.BoxGeometry(
    visualGeometry.bodyWidthMeters + 0.018,
    greenhouseHeightMeters,
    greenhouseDepthMeters
  )
  const greenhouse = new THREE.Mesh(geometry, material)
  greenhouse.name = 'greenhouse-visual'
  greenhouse.castShadow = false
  greenhouse.position.set(
    0,
    visualGeometry.bodyY + heightMeters * 0.12,
    greenhouseCenterZMeters
  )

  return greenhouse
}

function createBodyShellGeometry(visualGeometry) {
  const shape = new THREE.Shape()
  const lengthMeters = visualGeometry.bodyLengthMeters
  const heightMeters = visualGeometry.bodyHeightMeters
  const halfLengthMeters = lengthMeters / 2
  const floorY = -heightMeters / 2
  const roofY = heightMeters / 2

  shape.moveTo(-halfLengthMeters, floorY)

  if (visualGeometry.bodyVisualKind === 'roadster') {
    shape.lineTo(halfLengthMeters * 0.9, floorY + heightMeters * 0.35)
    shape.lineTo(halfLengthMeters * 0.45, roofY)
    shape.lineTo(-halfLengthMeters * 0.15, roofY * 0.65)
    shape.lineTo(-halfLengthMeters, floorY + heightMeters * 0.2)
  } else if (visualGeometry.bodyVisualKind === 'suv') {
    shape.lineTo(halfLengthMeters * 0.85, floorY + heightMeters * 0.42)
    shape.lineTo(halfLengthMeters * 0.6, roofY)
    shape.lineTo(-halfLengthMeters * 0.85, roofY)
    shape.lineTo(-halfLengthMeters, floorY + heightMeters * 0.35)
  } else if (visualGeometry.bodyVisualKind === 'truck') {
    shape.lineTo(halfLengthMeters * 0.95, floorY + heightMeters * 0.55)
    shape.lineTo(halfLengthMeters * 0.45, roofY)
    shape.lineTo(-halfLengthMeters * 0.35, roofY)
    shape.lineTo(-halfLengthMeters * 0.4, floorY + heightMeters * 0.15)
    shape.lineTo(-halfLengthMeters, floorY + heightMeters * 0.15)
  } else {
    shape.lineTo(halfLengthMeters * 0.92, floorY + heightMeters * 0.35)
    shape.lineTo(halfLengthMeters * 0.45, roofY)
    shape.lineTo(-halfLengthMeters * 0.4, roofY)
    shape.lineTo(-halfLengthMeters * 0.95, floorY + heightMeters * 0.35)
  }

  shape.closePath()

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: visualGeometry.bodyWidthMeters,
    bevelEnabled: false,
  })
  geometry.rotateY(-Math.PI / 2)
  geometry.translate(visualGeometry.bodyWidthMeters / 2, 0, 0)

  return geometry
}

function createBrakeLights(material, visualGeometry) {
  return [
    createBrakeLight(
      'brake-light-right',
      -visualGeometry.bodyWidthMeters * 0.32,
      material,
      visualGeometry
    ),
    createBrakeLight(
      'brake-light-left',
      visualGeometry.bodyWidthMeters * 0.32,
      material,
      visualGeometry
    ),
  ]
}

function createBrakeLight(name, x, material, visualGeometry) {
  const geometry = new THREE.BoxGeometry(
    BRAKE_LIGHT_WIDTH,
    BRAKE_LIGHT_HEIGHT,
    BRAKE_LIGHT_DEPTH
  )

  const brakeLight = new THREE.Mesh(geometry, material)
  brakeLight.name = name
  brakeLight.castShadow = false
  brakeLight.position.set(
    x,
    visualGeometry.brakeLightYMeters,
    visualGeometry.brakeLightZMeters
  )

  return brakeLight
}

function createFrameRail(name, x, material, visualGeometry) {
  const geometry = new THREE.BoxGeometry(
    FRAME_RAIL_WIDTH,
    FRAME_RAIL_HEIGHT,
    FRAME_RAIL_LENGTH
  )

  const rail = new THREE.Mesh(geometry, material)
  rail.name = name
  rail.castShadow = true
  rail.position.set(x, visualGeometry.frameY, 0)

  return rail
}

function createCrossmember(name, z, material, visualGeometry) {
  const geometry = new THREE.BoxGeometry(
    visualGeometry.frameRailXMeters * 2 + FRAME_RAIL_WIDTH,
    FRAME_RAIL_HEIGHT,
    0.12
  )

  const crossmember = new THREE.Mesh(geometry, material)
  crossmember.name = name
  crossmember.castShadow = true
  crossmember.position.set(0, visualGeometry.frameY, z)

  return crossmember
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

function createRearDifferentialHousing(material, visualGeometry) {
  const housing = new THREE.Mesh(
    new THREE.SphereGeometry(REAR_DIFFERENTIAL_RADIUS, 20, 12),
    material
  )
  housing.name = 'rear-differential-housing-visual'
  housing.castShadow = true
  housing.position.set(0, visualGeometry.wheelYMeters, visualGeometry.rearAxleZMeters)
  housing.scale.set(1.35, 1, 1)
  return housing
}

function createDriveshaft(material, visualGeometry) {
  const length = Math.abs(TRANSMISSION_OUTPUT_Z - visualGeometry.rearAxleZMeters)
  const geometry = new THREE.CylinderGeometry(0.045, 0.045, length, 16)
  const driveshaft = new THREE.Mesh(geometry, material)

  driveshaft.name = 'center-driveshaft-visual'
  driveshaft.castShadow = true
  driveshaft.rotation.x = Math.PI / 2
  driveshaft.position.set(
    0,
    visualGeometry.wheelYMeters,
    (TRANSMISSION_OUTPUT_Z + visualGeometry.rearAxleZMeters) * 0.5
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

function createWheel(id, x, z, materials, visualGeometry) {
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
    dimensions.beadSeatAxialPositionMeters,
    materials.rim
  )
  const rightBeadSeat = createRigidWheelCylinder(
    `rim-bead-seat-right-${id}`,
    dimensions.beadSeatRadiusMeters,
    dimensions.beadSeatWidthMeters,
    -dimensions.beadSeatAxialPositionMeters,
    materials.rim
  )
  const leftFlange = createRigidWheelCylinder(
    `rim-flange-left-${id}`,
    dimensions.rimFlangeRadiusMeters,
    dimensions.rimFlangeWidthMeters,
    dimensions.rimFlangeAxialPositionMeters,
    materials.rim
  )
  const rightFlange = createRigidWheelCylinder(
    `rim-flange-right-${id}`,
    dimensions.rimFlangeRadiusMeters,
    dimensions.rimFlangeWidthMeters,
    -dimensions.rimFlangeAxialPositionMeters,
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
  wheelPivot.position.set(x, visualGeometry.wheelYMeters, z)

  wheelPivot.userData.wheel = {
    id,
    localPosition: new THREE.Vector3(x, visualGeometry.wheelYMeters, z),
    suspensionMountLocal: new THREE.Vector3(
      x,
      visualGeometry.wheelSuspensionMountYMeters,
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
    side: x < 0 ? 'right' : 'left',
    driven: z < 0,
    steerable: z > 0,
    steeringPivotLocal: new THREE.Vector3(
      x,
      visualGeometry.wheelYMeters,
      z
    ),
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
