// src/car/createCar.js

import * as THREE from 'three'
import { createTirePressureVisuals } from './createTirePressureVisuals.js'
import { createAnchoredToroidalTireGeometry } from './tireDeformationGeometry.js'

const BODY_LENGTH = 2.8
const BODY_WIDTH = 1.45
const BODY_HEIGHT = 0.65

const WHEEL_RADIUS = 0.48
const WHEEL_WIDTH = 0.38
const WHEEL_ROTATION_WITNESS_WIDTH = WHEEL_WIDTH * 1.08
const WHEEL_ROTATION_WITNESS_HEIGHT = 0.028
const WHEEL_ROTATION_WITNESS_DEPTH = WHEEL_RADIUS * 0.28

const FRONT_AXLE_Z = 1.45
const REAR_AXLE_Z = -1.45
const WHEEL_X = 1.25
const WHEEL_Y = WHEEL_RADIUS

const BODY_Y = 1.36
const FRAME_Y = 0.98

const AXLE_LENGTH = WHEEL_X * 2.18
const AXLE_RADIUS = 0.055

const FRAME_RAIL_X = 0.52
const FRAME_RAIL_WIDTH = 0.11
const FRAME_RAIL_HEIGHT = 0.11
const FRAME_RAIL_LENGTH = 3.65

const AXLE_HANGER_WIDTH = 0.08
const AXLE_HANGER_DEPTH = 0.08
const AXLE_HANGER_TOP_Y = FRAME_Y - FRAME_RAIL_HEIGHT / 2
const AXLE_HANGER_BOTTOM_Y = WHEEL_Y

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

  const axleHangers = [
    createAxleHanger('front-left-axle-hanger', -FRAME_RAIL_X, FRONT_AXLE_Z, materials.frame),
    createAxleHanger('front-right-axle-hanger', FRAME_RAIL_X, FRONT_AXLE_Z, materials.frame),
    createAxleHanger('rear-left-axle-hanger', -FRAME_RAIL_X, REAR_AXLE_Z, materials.frame),
    createAxleHanger('rear-right-axle-hanger', FRAME_RAIL_X, REAR_AXLE_Z, materials.frame),
  ]

  const frontAxle = createAxle('front-axle', FRONT_AXLE_Z, materials.metal)
  const rearAxle = createAxle('rear-axle', REAR_AXLE_Z, materials.metal)
  const driveshaft = createDriveshaft(materials.drivetrain)

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

  car.add(body)
  car.add(nose)

  for (const brakeLight of brakeLights) {
    car.add(brakeLight)
  }

  for (const rail of frameRails) {
    car.add(rail)
  }

  for (const crossmember of crossmembers) {
    car.add(crossmember)
  }

  for (const hanger of axleHangers) {
    car.add(hanger)
  }

  car.add(frontAxle)
  car.add(rearAxle)
  car.add(driveshaft)

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
      axleHangerNodes: axleHangers.map((hanger) => hanger.name),
    },
    drivetrain: {
      layout: 'rear-wheel-drive-placeholder',
      drivenWheels: ['rear-left', 'rear-right'],
    },
    lighting: {
      brakeLightNodes: brakeLights.map((brakeLight) => brakeLight.name),
    },
    steering: {
      steerableWheels: ['front-left', 'front-right'],
      plannedMaxSteerRadians: Math.PI / 5,
      note: 'Front wheel groups are centered on their wheel hubs so they can later pivot around local Y for steering.',
    },
    wheels: wheels.map((wheel) => ({
      ...wheel.userData.wheel,
    })),
    tireInflationVisuals: {
      contactPatchNodes: contactPatches.map((patch) => patch.name),
    },
    setTireInflationVisualState: (tirePressureState, wheelStates = null) => {
      tirePressureVisuals.setTargetFromPressureState(tirePressureState)
      tirePressureVisuals.setTargetFromWheelStates(wheelStates)
    },
  }

  const tirePressureVisuals = createTirePressureVisuals(car)
  car.userData.vehicle.tirePressureVisuals = tirePressureVisuals
  tirePressureVisuals.reset()

  return car
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
      color: 0x777777,
      metalness: 0.8,
      roughness: 0.25,
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

function createAxleHanger(name, x, z, material) {
  const height = AXLE_HANGER_TOP_Y - AXLE_HANGER_BOTTOM_Y

  const geometry = new THREE.BoxGeometry(
    AXLE_HANGER_WIDTH,
    height,
    AXLE_HANGER_DEPTH
  )

  const hanger = new THREE.Mesh(geometry, material)
  hanger.name = name
  hanger.castShadow = true
  hanger.position.set(
    x,
    AXLE_HANGER_BOTTOM_Y + height / 2,
    z
  )

  return hanger
}

function createAxle(name, z, material) {
  const geometry = new THREE.CylinderGeometry(
    AXLE_RADIUS,
    AXLE_RADIUS,
    AXLE_LENGTH,
    16
  )

  const axle = new THREE.Mesh(geometry, material)
  axle.name = name
  axle.castShadow = true
  axle.rotation.z = Math.PI / 2
  axle.position.set(0, WHEEL_Y, z)

  return axle
}

function createDriveshaft(material) {
  const length = Math.abs(FRONT_AXLE_Z - REAR_AXLE_Z)
  const geometry = new THREE.CylinderGeometry(0.045, 0.045, length, 16)
  const driveshaft = new THREE.Mesh(geometry, material)

  driveshaft.name = 'center-driveshaft-placeholder'
  driveshaft.castShadow = true
  driveshaft.rotation.x = Math.PI / 2
  driveshaft.position.set(0, WHEEL_Y, 0)

  return driveshaft
}

function createWheel(id, x, z, materials) {
  const wheelPivot = new THREE.Group()
  wheelPivot.name = `wheel-pivot-${id}`

  const rollingAssembly = new THREE.Group()
  rollingAssembly.name = `wheel-rolling-assembly-${id}`

  const hubRadiusMeters = WHEEL_RADIUS * 0.42
  const tireGeometryData = createAnchoredToroidalTireGeometry({
    outerRadiusMeters: WHEEL_RADIUS,
    widthMeters: WHEEL_WIDTH,
    hubRadiusMeters,
  })

  const tire = new THREE.Mesh(tireGeometryData.geometry, materials.tire)
  tire.name = `tire-${id}`
  tire.castShadow = true

  const hubGeometry = new THREE.CylinderGeometry(
    hubRadiusMeters,
    hubRadiusMeters,
    WHEEL_WIDTH * 1.08,
    24
  )

  const hub = new THREE.Mesh(hubGeometry, materials.hub)
  hub.name = `hub-${id}`
  hub.castShadow = true
  hub.rotation.z = Math.PI / 2

  const rotationWitness = createWheelRotationWitness(
    id,
    materials.wheelRotationWitness
  )

  rollingAssembly.add(tire)
  rollingAssembly.add(hub)
  rollingAssembly.add(rotationWitness)

  wheelPivot.add(rollingAssembly)
  wheelPivot.position.set(x, WHEEL_Y, z)

  wheelPivot.userData.wheel = {
    id,
    localPosition: new THREE.Vector3(x, WHEEL_Y, z),
    radius: WHEEL_RADIUS,
    width: WHEEL_WIDTH,
    tireGeometry: {
      kind: tireGeometryData.metadata.kind,
      outerRadiusMeters: tireGeometryData.metadata.outerRadiusMeters,
      innerBeadRadiusMeters: tireGeometryData.metadata.innerBeadRadiusMeters,
      hubExclusionRadiusMeters: tireGeometryData.metadata.hubExclusionRadiusMeters,
      widthMeters: tireGeometryData.metadata.widthMeters,
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
      rotationWitness: rotationWitness.name,
    },
  }

  return wheelPivot
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