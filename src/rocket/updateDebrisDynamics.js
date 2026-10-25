// src/rocket/updateDebrisDynamics.js

import * as THREE from 'three'
import { EARTH_GRAVITY } from '../simulation/simulationConstants.js'
import {
  addRocketForceAtPoint,
  clearRocketForceAccumulator,
  integrateRocketRigidBody,
} from './rocketRigidBody.js'

// Ballistic motion for separated stages: gravity, quadratic drag, and a
// simple landing constraint. No motor, no attitude control.
//
// The drag is applied at the debris centre of mass. A tumbling cone would
// have a centre of pressure away from its centre of mass, which produces a
// tumbling moment; that coupling is not modelled here, so the debris
// tumbles only because it inherits angular rate at separation.

const _gravityForce = new THREE.Vector3()
const _dragForce = new THREE.Vector3()
const _surfaceResult = {
  normalWorld: new THREE.Vector3(0, 1, 0),
  terrainHeightMeters: 0,
  frictionCoefficient: 0.6,
}

export function updateDebrisDynamics(debris, deltaTimeSeconds, options = {}) {
  if (!debris?.body || !debris.spec) return debris

  const body = debris.body
  const spec = debris.spec
  const deltaSeconds = Number.isFinite(deltaTimeSeconds) && deltaTimeSeconds > 0 ? deltaTimeSeconds : 0

  clearRocketForceAccumulator(body)

  _gravityForce.set(0, -EARTH_GRAVITY.standardMetersPerSecondSquared * body.massKg, 0)
  addRocketForceAtPoint(body, _gravityForce, body.positionMeters)

  const speedMetersPerSecond = body.velocityMetersPerSecond.length()
  if (speedMetersPerSecond > 1e-4) {
    const dragMagnitudeNewtons =
      0.5 *
      spec.airDensityKgPerCubicMeter *
      spec.dragCoefficient *
      spec.referenceAreaSquareMeters *
      speedMetersPerSecond *
      speedMetersPerSecond
    _dragForce
      .copy(body.velocityMetersPerSecond)
      .multiplyScalar(-dragMagnitudeNewtons / speedMetersPerSecond)
    addRocketForceAtPoint(body, _dragForce, body.positionMeters)
  }

  integrateRocketRigidBody(body, deltaSeconds)

  applyDebrisLandingConstraint(debris, options, deltaSeconds)

  return debris
}

// The separated stage settles on the terrain instead of sinking through it.
// This is a positional constraint, not an impulse: the debris is a dead
// object, so a soft landing does not need contact-force fidelity.
function applyDebrisLandingConstraint(debris, options, deltaTimeSeconds = 0) {
  const body = debris.body
  const spec = debris.spec
  const terrainContactQuery = options.terrainContactQuery
  if (!terrainContactQuery) return debris

  terrainContactQuery.queryAtWorldXZ(body.positionMeters.x, body.positionMeters.z, _surfaceResult)
  const terrainHeightMeters = _surfaceResult.terrainHeightMeters
  if (!Number.isFinite(terrainHeightMeters)) return debris

  const restingHeightMeters = terrainHeightMeters + spec.bodyRadiusMeters
  if (body.positionMeters.y >= restingHeightMeters) return debris

  body.positionMeters.y = restingHeightMeters
  if (body.velocityMetersPerSecond.y < 0) body.velocityMetersPerSecond.y = 0

  const horizontalSpeedMetersPerSecond = Math.hypot(
    body.velocityMetersPerSecond.x,
    body.velocityMetersPerSecond.z
  )
  if (horizontalSpeedMetersPerSecond > 1e-4) {
    const frictionCoefficient = Number.isFinite(_surfaceResult.frictionCoefficient)
      ? Math.max(0, _surfaceResult.frictionCoefficient)
      : 0.6
    // Coulomb friction decelerates the debris at mu * g.
    const speedReductionMetersPerSecond = Math.min(
      horizontalSpeedMetersPerSecond,
      frictionCoefficient * EARTH_GRAVITY.standardMetersPerSecondSquared * deltaTimeSeconds
    )
    const scale = (horizontalSpeedMetersPerSecond - speedReductionMetersPerSecond) /
      horizontalSpeedMetersPerSecond
    body.velocityMetersPerSecond.x *= scale
    body.velocityMetersPerSecond.z *= scale
  }

  return debris
}