// src/rocket/createRocket.js

import * as THREE from 'three'
import { createRocketRigidBody } from './rocketRigidBody.js'

// The rocket entity: geometry, visuals, and mass properties.
//
// The mesh group origin is the CENTER OF MASS. The structural frame used by
// the mass properties has the BASE of the body at structural y = 0 and the
// body axis along +Y, so structural y grows toward the nose.

export const DEFAULT_ROCKET_SPEC = Object.freeze({
  bodyRadiusMeters: 1.2,
  bodyLengthMeters: 12,
  noseLengthMeters: 3.5,
  bodyMassKg: 700,
  noseMassKg: 300,
  thrustNewtons: 15000,
  thrustApplicationStructuralYMeters: 0,
  airDensityKgPerCubicMeter: 1.225,
  dragCoefficient: 0.25,
  // The fins put the centre of pressure in the LOWER body, below the centre
  // of mass. That placement is what makes the airframe statically stable:
  // a centre of pressure ABOVE the centre of mass produces a
  // destabilising moment at speed instead of a restoring one, which is why
  // a slender fin-less rocket with a nose-heavy mass distribution has to
  // fly on active control alone.
  dragApplicationStructuralYMeters: 3,
  finHeightMeters: 2.5,
  finSpanMeters: 0.35,
  finThicknessMeters: 0.06,
  groundContactStiffnessNewtonsPerMeter: 200000,
  groundContactDampingNewtonSecondsPerMeter: 30000,
  groundContactSampleCount: 8,
  attitudeControlEnabled: true,
  attitudeProportionalGainNewtonMetersPerRadian: 20000,
  attitudeIntegralGainNewtonMetersPerRadianSecond: 5000,
  attitudeDerivativeGainNewtonMetersSecondPerRadian: 40000,
  attitudeIntegralLimitRadianSeconds: 0.5,
  attitudeMaximumTorqueNewtonMeters: 400000,
  separationImpulseNewtonsSecond: 12000,
  separationLateralImpulseShare01: 0.35,
  separationTumbleRadiansPerSecond: 1.5,
})

export function createRocketSpec(config = {}) {
  const spec = { ...DEFAULT_ROCKET_SPEC, ...(config ?? {}) }

  spec.bodyRadiusMeters = sanitizePositiveNumber(spec.bodyRadiusMeters, DEFAULT_ROCKET_SPEC.bodyRadiusMeters)
  spec.bodyLengthMeters = sanitizePositiveNumber(spec.bodyLengthMeters, DEFAULT_ROCKET_SPEC.bodyLengthMeters)
  spec.noseLengthMeters = sanitizePositiveNumber(spec.noseLengthMeters, DEFAULT_ROCKET_SPEC.noseLengthMeters)
  spec.bodyMassKg = sanitizePositiveNumber(spec.bodyMassKg, DEFAULT_ROCKET_SPEC.bodyMassKg)
  spec.noseMassKg = sanitizeNonNegativeNumber(spec.noseMassKg, DEFAULT_ROCKET_SPEC.noseMassKg)
  spec.thrustNewtons = sanitizeNonNegativeNumber(spec.thrustNewtons, DEFAULT_ROCKET_SPEC.thrustNewtons)
  spec.thrustApplicationStructuralYMeters = sanitizeNumber(
    spec.thrustApplicationStructuralYMeters,
    DEFAULT_ROCKET_SPEC.thrustApplicationStructuralYMeters
  )
  spec.airDensityKgPerCubicMeter = sanitizeNonNegativeNumber(
    spec.airDensityKgPerCubicMeter,
    DEFAULT_ROCKET_SPEC.airDensityKgPerCubicMeter
  )
  spec.dragCoefficient = sanitizeNonNegativeNumber(spec.dragCoefficient, DEFAULT_ROCKET_SPEC.dragCoefficient)
  spec.dragApplicationStructuralYMeters = sanitizeNumber(
    spec.dragApplicationStructuralYMeters,
    DEFAULT_ROCKET_SPEC.dragApplicationStructuralYMeters
  )
  spec.groundContactStiffnessNewtonsPerMeter = sanitizePositiveNumber(
    spec.groundContactStiffnessNewtonsPerMeter,
    DEFAULT_ROCKET_SPEC.groundContactStiffnessNewtonsPerMeter
  )
  spec.groundContactDampingNewtonSecondsPerMeter = sanitizeNonNegativeNumber(
    spec.groundContactDampingNewtonSecondsPerMeter,
    DEFAULT_ROCKET_SPEC.groundContactDampingNewtonSecondsPerMeter
  )
  spec.groundContactSampleCount = Math.max(
    1,
    Math.round(sanitizePositiveNumber(spec.groundContactSampleCount, DEFAULT_ROCKET_SPEC.groundContactSampleCount))
  )
  spec.attitudeControlEnabled = spec.attitudeControlEnabled !== false
  spec.attitudeProportionalGainNewtonMetersPerRadian = sanitizeNonNegativeNumber(
    spec.attitudeProportionalGainNewtonMetersPerRadian,
    DEFAULT_ROCKET_SPEC.attitudeProportionalGainNewtonMetersPerRadian
  )
  spec.attitudeIntegralGainNewtonMetersPerRadianSecond = sanitizeNonNegativeNumber(
    spec.attitudeIntegralGainNewtonMetersPerRadianSecond,
    DEFAULT_ROCKET_SPEC.attitudeIntegralGainNewtonMetersPerRadianSecond
  )
  spec.attitudeDerivativeGainNewtonMetersSecondPerRadian = sanitizeNonNegativeNumber(
    spec.attitudeDerivativeGainNewtonMetersSecondPerRadian,
    DEFAULT_ROCKET_SPEC.attitudeDerivativeGainNewtonMetersSecondPerRadian
  )
  spec.attitudeIntegralLimitRadianSeconds = sanitizePositiveNumber(
    spec.attitudeIntegralLimitRadianSeconds,
    DEFAULT_ROCKET_SPEC.attitudeIntegralLimitRadianSeconds
  )
  spec.attitudeMaximumTorqueNewtonMeters = sanitizePositiveNumber(
    spec.attitudeMaximumTorqueNewtonMeters,
    DEFAULT_ROCKET_SPEC.attitudeMaximumTorqueNewtonMeters
  )
  spec.separationImpulseNewtonsSecond = sanitizeNonNegativeNumber(
    spec.separationImpulseNewtonsSecond,
    DEFAULT_ROCKET_SPEC.separationImpulseNewtonsSecond
  )
  spec.finHeightMeters = sanitizePositiveNumber(spec.finHeightMeters, DEFAULT_ROCKET_SPEC.finHeightMeters)
  spec.finSpanMeters = sanitizePositiveNumber(spec.finSpanMeters, DEFAULT_ROCKET_SPEC.finSpanMeters)
  spec.finThicknessMeters = sanitizePositiveNumber(
    spec.finThicknessMeters,
    DEFAULT_ROCKET_SPEC.finThicknessMeters
  )
  spec.separationLateralImpulseShare01 = clamp01(spec.separationLateralImpulseShare01)
  spec.separationTumbleRadiansPerSecond = sanitizeNonNegativeNumber(
    spec.separationTumbleRadiansPerSecond,
    DEFAULT_ROCKET_SPEC.separationTumbleRadiansPerSecond
  )

  // The reference area is the plan-view area of the body, derived rather
  // than authored so a radius change cannot desynchronize it. The fin drag
  // is folded into the drag coefficient rather than into the area.
  spec.referenceAreaSquareMeters =
    Math.PI * spec.bodyRadiusMeters * spec.bodyRadiusMeters
  // The fins are what the vehicle stands on, so they set the contact
  // radius.
  spec.finTipRadiusMeters = spec.bodyRadiusMeters + spec.finSpanMeters

  return spec
}

// Mass properties of the stacked body + nose cone.
//
// Inertias are the closed-form solids of revolution about the structural
// axis (y) and about a transverse axis, combined with the parallel-axis
// theorem about the assembled centre of mass.
export function computeRocketMassProperties(spec) {
  const bodyRadiusMeters = spec.bodyRadiusMeters
  const bodyLengthMeters = spec.bodyLengthMeters
  const noseLengthMeters = spec.noseLengthMeters
  const bodyMassKg = spec.bodyMassKg
  const noseMassKg = spec.noseMassKg
  const totalMassKg = bodyMassKg + noseMassKg

  const bodyCenterStructuralYMeters = bodyLengthMeters * 0.5
  const noseBaseStructuralYMeters = bodyLengthMeters
  const noseCenterStructuralYMeters = noseBaseStructuralYMeters + noseLengthMeters * 0.5
  // A uniform solid cone has its centre of mass a quarter of its height
  // above the base.
  const noseCenterOfMassStructuralYMeters = noseBaseStructuralYMeters + noseLengthMeters * 0.25

  const centerOfMassStructuralYMeters =
    totalMassKg > 0
      ? (bodyMassKg * bodyCenterStructuralYMeters +
          noseMassKg * noseCenterOfMassStructuralYMeters) /
        totalMassKg
      : bodyCenterStructuralYMeters

  const bodyInertiaAxisKgMeterSquared = 0.5 * bodyMassKg * bodyRadiusMeters * bodyRadiusMeters
  const bodyInertiaTransverseKgMeterSquared =
    (bodyMassKg * (3 * bodyRadiusMeters * bodyRadiusMeters + bodyLengthMeters * bodyLengthMeters)) / 12

  const noseInertiaAxisKgMeterSquared = 0.3 * noseMassKg * bodyRadiusMeters * bodyRadiusMeters
  const noseInertiaTransverseKgMeterSquared =
    (3 / 80) *
    noseMassKg *
    (4 * bodyRadiusMeters * bodyRadiusMeters + noseLengthMeters * noseLengthMeters)

  const bodyOffsetMeters = bodyCenterStructuralYMeters - centerOfMassStructuralYMeters
  const noseOffsetMeters = noseCenterOfMassStructuralYMeters - centerOfMassStructuralYMeters

  const inertiaAxisKgMeterSquared = bodyInertiaAxisKgMeterSquared + noseInertiaAxisKgMeterSquared
  const inertiaTransverseKgMeterSquared =
    bodyInertiaTransverseKgMeterSquared +
    bodyMassKg * bodyOffsetMeters * bodyOffsetMeters +
    noseInertiaTransverseKgMeterSquared +
    noseMassKg * noseOffsetMeters * noseOffsetMeters

  return {
    totalMassKg,
    bodyMassKg,
    noseMassKg,
    bodyInertiaTensorKgMeterSquared: {
      x: bodyInertiaTransverseKgMeterSquared,
      y: bodyInertiaAxisKgMeterSquared,
      z: bodyInertiaTransverseKgMeterSquared,
    },
    noseInertiaTensorKgMeterSquared: {
      x: noseInertiaTransverseKgMeterSquared,
      y: noseInertiaAxisKgMeterSquared,
      z: noseInertiaTransverseKgMeterSquared,
    },
    bodyCenterStructuralYMeters,
    noseBaseStructuralYMeters,
    noseCenterStructuralYMeters,
    noseCenterOfMassStructuralYMeters,
    centerOfMassStructuralYMeters,
    inertiaTensorKgMeterSquared: {
      x: inertiaTransverseKgMeterSquared,
      y: inertiaAxisKgMeterSquared,
      z: inertiaTransverseKgMeterSquared,
    },
  }
}

export function createRocket(config = {}) {
  const spec = createRocketSpec(config.spec)
  const massProperties = computeRocketMassProperties(spec)

  const group = new THREE.Group()
  group.name = 'rocket'

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xd9dde3,
    roughness: 0.55,
    metalness: 0.15,
  })
  const noseMaterial = new THREE.MeshStandardMaterial({
    color: 0xc0392b,
    roughness: 0.5,
    metalness: 0.1,
  })

  const bodyGeometry = new THREE.CylinderGeometry(
    spec.bodyRadiusMeters,
    spec.bodyRadiusMeters,
    spec.bodyLengthMeters,
    24,
    1
  )
  const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial)
  bodyMesh.name = 'rocket-body'
  bodyMesh.castShadow = true
  bodyMesh.receiveShadow = true
  group.add(bodyMesh)

  const noseGeometry = new THREE.ConeGeometry(spec.bodyRadiusMeters, spec.noseLengthMeters, 24, 1)
  const noseMesh = new THREE.Mesh(noseGeometry, noseMaterial)
  noseMesh.name = 'rocket-nose'
  noseMesh.castShadow = true
  group.add(noseMesh)

  // Four fins at the base. They carry the aerodynamic centre of pressure
  // down into the lower body, which is what makes the vehicle statically
  // stable, and they are what the rocket stands on.
  const finMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b939c,
    roughness: 0.6,
    metalness: 0.2,
  })
  const finGeometry = new THREE.BoxGeometry(
    spec.finSpanMeters,
    spec.finHeightMeters,
    spec.finThicknessMeters
  )
  const finGroup = new THREE.Group()
  finGroup.name = 'rocket-fins'
  for (let finIndex = 0; finIndex < 4; finIndex += 1) {
    const finMesh = new THREE.Mesh(finGeometry, finMaterial)
    const angleRadians = (finIndex / 4) * Math.PI * 2
    finMesh.rotation.y = -angleRadians
    finMesh.position.set(
      Math.cos(angleRadians) * (spec.bodyRadiusMeters + spec.finSpanMeters * 0.5),
      spec.finHeightMeters * 0.5,
      Math.sin(angleRadians) * (spec.bodyRadiusMeters + spec.finSpanMeters * 0.5)
    )
    finMesh.castShadow = true
    finGroup.add(finMesh)
  }
  group.add(finGroup)

  const plumeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb347,
    transparent: true,
    opacity: 0.85,
  })
  const plumeGeometry = new THREE.ConeGeometry(
    spec.bodyRadiusMeters * 0.75,
    spec.bodyRadiusMeters * 2.4,
    16,
    1
  )
  const plumeMesh = new THREE.Mesh(plumeGeometry, plumeMaterial)
  plumeMesh.name = 'rocket-plume'
  // The cone points along +Y, so flip it to point away from the engine.
  plumeMesh.rotation.x = Math.PI
  plumeMesh.visible = false
  group.add(plumeMesh)

  const rocket = {
    group,
    bodyMesh,
    noseMesh,
    finGroup,
    plumeMesh,
    spec,
    massProperties,
    motorIgnited: false,
    throttle01: 0,
  }

  applyRocketMassPropertiesToVisuals(rocket, massProperties)

  return rocket
}

// The separated nose cone. It is an independent body: it keeps its own
// mass and inertia, it has no motor, and it flies ballistically.
export function createRocketDebris(config = {}) {
  const spec = config.spec
  const massProperties = config.massProperties
  if (!spec || !massProperties) return null

  const group = new THREE.Group()
  group.name = 'rocket-stage-debris'

  const noseMaterial = new THREE.MeshStandardMaterial({
    color: 0xc0392b,
    roughness: 0.5,
    metalness: 0.1,
  })
  const noseGeometry = new THREE.ConeGeometry(
    spec.bodyRadiusMeters,
    spec.noseLengthMeters,
    24,
    1
  )
  const coneMesh = new THREE.Mesh(noseGeometry, noseMaterial)
  coneMesh.name = 'rocket-debris-nose'
  coneMesh.castShadow = true
  // The cone mesh is centred on the geometry, the debris body is centred on
  // the mass, and a solid cone's mass sits a quarter of its height above
  // the base.
  coneMesh.position.y = spec.noseLengthMeters * 0.25
  group.add(coneMesh)

  const body = createRocketRigidBody({
    massKg: massProperties.noseMassKg,
    inertiaAXKgMeterSquared: massProperties.noseInertiaTensorKgMeterSquared.x,
    inertiaAYKgMeterSquared: massProperties.noseInertiaTensorKgMeterSquared.y,
    inertiaAZKgMeterSquared: massProperties.noseInertiaTensorKgMeterSquared.z,
  })

  return {
    group,
    coneMesh,
    body,
    spec,
    massProperties,
    isDebris: true,
  }
}

// Re-lays the visuals around the centre of mass. Called after a stage
// separation changes the mass distribution.
export function applyRocketMassPropertiesToVisuals(rocket, massProperties) {
  if (!rocket || !massProperties) return rocket

  const centerOfMassStructuralYMeters = massProperties.centerOfMassStructuralYMeters

  rocket.bodyMesh.position.y =
    massProperties.bodyCenterStructuralYMeters - centerOfMassStructuralYMeters
  rocket.noseMesh.position.y =
    massProperties.noseCenterStructuralYMeters - centerOfMassStructuralYMeters
  rocket.plumeMesh.position.y =
    -centerOfMassStructuralYMeters - rocket.spec.bodyRadiusMeters * 1.2
  rocket.finGroup.position.y = -centerOfMassStructuralYMeters

  return rocket
}

export function setRocketPlumeVisible(rocket, isVisible, throttle01 = 0) {
  if (!rocket) return rocket

  rocket.plumeMesh.visible = isVisible === true
  const throttle = clamp01(throttle01)
  const scale = isVisible === true ? 0.35 + throttle * 0.65 : 0
  rocket.plumeMesh.scale.set(0.6 + throttle * 0.4, scale, 0.6 + throttle * 0.4)

  return rocket
}

function sanitizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeNonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}