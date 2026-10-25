// src/rocket/rocketGroundContact.js

import * as THREE from 'three'
import { addRocketForceAtPoint } from './rocketRigidBody.js'

// Unilateral ground contact for the rocket.
//
// The base of the body is sampled at a ring of points, and the body and
// nose are sampled along their length. Every sample point that sits below
// the terrain surface contributes a spring-damper normal force plus a
// Coulomb-limited tangential friction force. Sampling a ring (instead of a
// single point) is what lets the rocket tip over instead of pivoting around
// one artificial contact point, while the extra body and nose samples keep
// an inverted or nose-down airframe from tunnelling through the terrain.

const MAX_ROCKET_CONTACTS = 48

const _contactWorldMeters = Array.from({ length: MAX_ROCKET_CONTACTS }, () => new THREE.Vector3())
const _contactNormalUnit = Array.from({ length: MAX_ROCKET_CONTACTS }, () => new THREE.Vector3())
const _contactPointVelocityMetersPerSecond = Array.from({ length: MAX_ROCKET_CONTACTS }, () => new THREE.Vector3())
const _contactTangentVelocityMetersPerSecond = Array.from({ length: MAX_ROCKET_CONTACTS }, () => new THREE.Vector3())
const _contactNormalUnitForce = Array.from({ length: MAX_ROCKET_CONTACTS }, () => new THREE.Vector3())
const _contactFrictionForceNewtons = Array.from({ length: MAX_ROCKET_CONTACTS }, () => new THREE.Vector3())
const _contactPenetrationMeters = new Float64Array(MAX_ROCKET_CONTACTS)
const _contactFrictionCoefficient = new Float64Array(MAX_ROCKET_CONTACTS)

const _sampleLocalMeters = new THREE.Vector3()
const _sampleWorldMeters = new THREE.Vector3()
const _leverArmWorldMeters = new THREE.Vector3()
const _pointVelocityMetersPerSecond = new THREE.Vector3()
const _tangentVelocityMetersPerSecond = new THREE.Vector3()
const _combinedFrictionForceNewtons = new THREE.Vector3()
const _surfaceResult = {
  normalWorld: new THREE.Vector3(0, 1, 0),
  terrainHeightMeters: 0,
  isWithinBounds: true,
}

const DEFAULT_FRICTION_COEFFICIENT = 0.6
const FRICTION_SPEED_EPSILON_METERS_PER_SECOND = 1e-4

export function applyRocketGroundContact(rocket, options = {}, deltaTimeSeconds = 0) {
  const body = rocket?.body
  const spec = rocket?.spec
  const terrainContactQuery = options.terrainContactQuery
  if (!body || !spec || !terrainContactQuery) return rocket

  const safeDeltaTimeSeconds =
    Number.isFinite(deltaTimeSeconds) && deltaTimeSeconds > 0 ? deltaTimeSeconds : 0

  // The vehicle stands on its fin tips, so the base contact ring uses the
  // fin tip radius. The body and nose use their own radii so a tipped or
  // inverted airframe can land on any part of its skin.
  const baseRadiusMeters = spec.finTipRadiusMeters ?? spec.bodyRadiusMeters
  const bodyRadiusMeters = spec.bodyRadiusMeters
  const bodyLengthMeters = spec.bodyLengthMeters
  const noseLengthMeters = spec.noseLengthMeters
  const centerOfMassStructuralYMeters = rocket.massProperties.centerOfMassStructuralYMeters
  const sampleCount = Math.max(1, Math.round(spec.groundContactSampleCount))

  let activeContactCount = 0
  let maximumTangentSpeedMetersPerSecond = 0

  // Find all penetrating contact samples before applying any forces. The
  // authored stiffness and damping are whole-body values, so they are split
  // across the contacts that are actually loaded rather than across every
  // possible sample.
  const addContactSamples = (structuralYMeters, radiusMeters, ringSampleCount) => {
    for (let sampleIndex = 0; sampleIndex < ringSampleCount; sampleIndex += 1) {
      if (activeContactCount >= MAX_ROCKET_CONTACTS) return

      const angleRadians =
        ringSampleCount === 1 ? 0 : (sampleIndex / ringSampleCount) * Math.PI * 2
      _sampleLocalMeters.set(
        Math.cos(angleRadians) * radiusMeters,
        structuralYMeters - centerOfMassStructuralYMeters,
        Math.sin(angleRadians) * radiusMeters
      )
      _sampleWorldMeters
        .copy(_sampleLocalMeters)
        .applyQuaternion(body.orientationQuaternion)
        .add(body.positionMeters)

      terrainContactQuery.queryAtWorldXZ(_sampleWorldMeters.x, _sampleWorldMeters.z, _surfaceResult)
      const terrainHeightMeters = _surfaceResult.terrainHeightMeters
      if (!Number.isFinite(terrainHeightMeters)) continue

      const penetrationMeters = terrainHeightMeters - _sampleWorldMeters.y
      if (penetrationMeters <= 0) continue

      const normalWorld = _surfaceResult.normalWorld
      if (!normalWorld || !Number.isFinite(normalWorld.y)) continue

      const contactIndex = activeContactCount
      _contactWorldMeters[contactIndex].copy(_sampleWorldMeters)
      _contactNormalUnit[contactIndex].copy(normalWorld)
      _contactPenetrationMeters[contactIndex] = penetrationMeters
      _contactFrictionCoefficient[contactIndex] = Number.isFinite(_surfaceResult.frictionCoefficient)
        ? Math.max(0, _surfaceResult.frictionCoefficient)
        : DEFAULT_FRICTION_COEFFICIENT

      _leverArmWorldMeters.copy(_sampleWorldMeters).sub(body.positionMeters)
      _pointVelocityMetersPerSecond
        .copy(body.angularVelocityRadiansPerSecond)
        .cross(_leverArmWorldMeters)
        .add(body.velocityMetersPerSecond)
      _contactPointVelocityMetersPerSecond[contactIndex].copy(_pointVelocityMetersPerSecond)

      const normalSpeedMetersPerSecond = _pointVelocityMetersPerSecond.dot(normalWorld)
      _contactTangentVelocityMetersPerSecond[contactIndex]
        .copy(_pointVelocityMetersPerSecond)
        .addScaledVector(normalWorld, -normalSpeedMetersPerSecond)

      const tangentSpeedMetersPerSecond = _contactTangentVelocityMetersPerSecond[contactIndex].length()
      if (tangentSpeedMetersPerSecond > maximumTangentSpeedMetersPerSecond) {
        maximumTangentSpeedMetersPerSecond = tangentSpeedMetersPerSecond
      }

      activeContactCount += 1
    }
  }

  // Feet / base ring.
  addContactSamples(0, baseRadiusMeters, sampleCount)
  // Body midpoint, body top / nose base, nose midpoint, and nose tip. These
  // extra stations catch an inverted rocket's nose and a horizontal body
  // resting on its side.
  addContactSamples(bodyLengthMeters * 0.5, bodyRadiusMeters, sampleCount)
  addContactSamples(bodyLengthMeters, bodyRadiusMeters, sampleCount)
  addContactSamples(
    bodyLengthMeters + noseLengthMeters * 0.5,
    bodyRadiusMeters * 0.5,
    sampleCount
  )
  addContactSamples(bodyLengthMeters + noseLengthMeters, 0, 1)

  if (activeContactCount === 0) return rocket

  const stiffnessNewtonsPerMeter =
    spec.groundContactStiffnessNewtonsPerMeter / activeContactCount
  const dampingNewtonSecondsPerMeter =
    spec.groundContactDampingNewtonSecondsPerMeter / activeContactCount

  _combinedFrictionForceNewtons.set(0, 0, 0)

  for (let contactIndex = 0; contactIndex < activeContactCount; contactIndex += 1) {
    const normalWorld = _contactNormalUnit[contactIndex]
    const pointVelocity = _contactPointVelocityMetersPerSecond[contactIndex]
    const tangentVelocity = _contactTangentVelocityMetersPerSecond[contactIndex]

    const normalSpeedMetersPerSecond = pointVelocity.dot(normalWorld)
    const normalMagnitudeNewtons = Math.max(
      0,
      stiffnessNewtonsPerMeter * _contactPenetrationMeters[contactIndex] -
        dampingNewtonSecondsPerMeter * normalSpeedMetersPerSecond
    )
    if (normalMagnitudeNewtons <= 0) {
      _contactNormalUnitForce[contactIndex].set(0, 0, 0)
      _contactFrictionForceNewtons[contactIndex].set(0, 0, 0)
      continue
    }

    _contactNormalUnitForce[contactIndex]
      .copy(normalWorld)
      .multiplyScalar(normalMagnitudeNewtons)

    const tangentSpeedMetersPerSecond = tangentVelocity.length()
    if (tangentSpeedMetersPerSecond <= FRICTION_SPEED_EPSILON_METERS_PER_SECOND) {
      _contactFrictionForceNewtons[contactIndex].set(0, 0, 0)
      continue
    }

    const maximumFrictionNewtons =
      _contactFrictionCoefficient[contactIndex] * normalMagnitudeNewtons
    _contactFrictionForceNewtons[contactIndex]
      .copy(tangentVelocity)
      .multiplyScalar(-maximumFrictionNewtons / tangentSpeedMetersPerSecond)
    _combinedFrictionForceNewtons.add(_contactFrictionForceNewtons[contactIndex])
  }

  // One combined Coulomb/momentum limit for the whole contact set. Applying
  // the full body momentum limit at every point independently could reverse
  // the body's motion several times in a single step and inject energy.
  const combinedFrictionMagnitudeNewtons = _combinedFrictionForceNewtons.length()
  const maximumCombinedFrictionNewtons =
    (body.massKg * maximumTangentSpeedMetersPerSecond) /
    Math.max(safeDeltaTimeSeconds, 1e-6)
  if (
    combinedFrictionMagnitudeNewtons > maximumCombinedFrictionNewtons &&
    combinedFrictionMagnitudeNewtons > 0
  ) {
    const frictionScale =
      maximumCombinedFrictionNewtons / combinedFrictionMagnitudeNewtons
    for (let contactIndex = 0; contactIndex < activeContactCount; contactIndex += 1) {
      _contactFrictionForceNewtons[contactIndex].multiplyScalar(frictionScale)
    }
  }

  for (let contactIndex = 0; contactIndex < activeContactCount; contactIndex += 1) {
    const applicationPointWorldMeters = _contactWorldMeters[contactIndex]
    if (_contactNormalUnitForce[contactIndex].lengthSq() > 0) {
      addRocketForceAtPoint(
        body,
        _contactNormalUnitForce[contactIndex],
        applicationPointWorldMeters
      )
    }
    if (_contactFrictionForceNewtons[contactIndex].lengthSq() > 0) {
      addRocketForceAtPoint(
        body,
        _contactFrictionForceNewtons[contactIndex],
        applicationPointWorldMeters
      )
    }
  }

  return rocket
}