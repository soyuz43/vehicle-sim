// src/physics/ContactSolver.js

import * as THREE from 'three'
import { applyImpulse } from './RigidBody.js'

// Projected Gauss-Seidel (sequential impulse) contact solver.
//
// Sign convention:
//   contact.normal points from bodyA toward bodyB.
//   The solver measures the relative velocity of B with respect to A at the
//   contact point and projects it on the normal:
//     vn = normal . (vB + wB x rB - vA - wA x rA)
//   vn < 0 means the bodies are approaching (the penetration grows) and
//   vn > 0 means they are separating. The normal constraint drives vn up to a
//   target that is never negative, so a positive accumulated impulse can only
//   push the bodies apart.
//
// The solver writes velocity changes directly into the rigid bodies
// (velocityMetersPerSecond / angularVelocityRadiansPerSecond) and applies a
// direct positional projection to positionMeters / orientationQuaternion.
// It never touches the force accumulators. It composes with symplectic Euler
// when called between integrateRigidBodyVelocityPhase and
// integrateRigidBodyPositionPhase.

const _scratchRelativeVelocity = new THREE.Vector3()
const _scratchLeverArmA = new THREE.Vector3()
const _scratchLeverArmB = new THREE.Vector3()
const _scratchAngularContribution = new THREE.Vector3()
const _scratchNormal = new THREE.Vector3()
const _scratchTangent1 = new THREE.Vector3()
const _scratchTangent2 = new THREE.Vector3()
const _scratchPerpendicularSeed = new THREE.Vector3()
const _scratchCrossProductA = new THREE.Vector3()
const _scratchCrossProductB = new THREE.Vector3()
const _scratchInverseInertiaA = new THREE.Vector3()
const _scratchInverseInertiaB = new THREE.Vector3()
const _scratchImpulse = new THREE.Vector3()
const _scratchOppositeImpulse = new THREE.Vector3()
const _scratchInverseQuaternion = new THREE.Quaternion()
const _scratchAngularDisplacementQuaternion = new THREE.Quaternion()
const _scratchOrientationDeltaQuaternion = new THREE.Quaternion()

export const DEFAULT_CONTACT_SOLVER_SETTINGS = Object.freeze({
  velocityIterations: 10,
  positionIterations: 1,
  slopMeters: 0.005,
  positionCorrectionFactor: 0.2,
  restitution: 0,
  frictionCoefficient: 0.5,
  restitutionVelocityThresholdMetersPerSecond: 0.5,
})

const _functionalSettings = { ...DEFAULT_CONTACT_SOLVER_SETTINGS }
const _defaultSolverOptions = Object.freeze({})

// Creates a contact constraint entry for the solver.
//
// The caller owns the contact lifecycle: the same object must be reused for
// a persisting contact across frames, otherwise the warm-start accumulators
// are lost and the contact restarts from a cold solve.
export function createContactConstraint(
  bodyA,
  bodyB,
  normal,
  depth,
  point,
  overrides = {}
) {
  return {
    bodyA,
    bodyB,
    normal,
    depth,
    point,
    restitution: overrides.restitution,
    frictionCoefficient: overrides.frictionCoefficient,
    accumulatedNormalImpulseNewtonSeconds: 0,
    accumulatedFrictionImpulseNewtonSeconds: 0,
    accumulatedFrictionImpulseTangent1NewtonSeconds: 0,
    accumulatedFrictionImpulseTangent2NewtonSeconds: 0,
    solverInitialPositionAMeters: new THREE.Vector3(),
    solverInitialPositionBMeters: new THREE.Vector3(),
    solverInitialOrientationAQuaternion: new THREE.Quaternion(),
    solverInitialOrientationBQuaternion: new THREE.Quaternion(),
    solverRestitutionTargetVelocityMetersPerSecond: 0,
    solverNormalEffectiveMassKg: 0,
    solverTangent1EffectiveMassKg: 0,
    solverTangent2EffectiveMassKg: 0,
  }
}

// Creates a solver instance that owns a resolved settings snapshot.
export function createContactSolver(options = _defaultSolverOptions) {
  const settings = { ...DEFAULT_CONTACT_SOLVER_SETTINGS }
  applySettingsOverrides(options, settings)

  return {
    settings,
    solve(contacts) {
      return solveContactsWithSettings(contacts, settings)
    },
  }
}

// One-shot entry point. settings are resolved per call into a module-scope
// object so that no garbage is produced on the hot path.
export function solveContacts(contacts, options = _defaultSolverOptions) {
  copyDefaultSettings(_functionalSettings)
  applySettingsOverrides(options, _functionalSettings)
  return solveContactsWithSettings(contacts, _functionalSettings)
}

function solveContactsWithSettings(contacts, settings) {
  if (!contacts || contacts.length === 0) return 0

  let activeContactCount = 0
  for (let contactIndex = 0; contactIndex < contacts.length; contactIndex += 1) {
    const contact = contacts[contactIndex]
    if (!isContactUsable(contact)) continue
    prepareContact(contact, settings)
    activeContactCount += 1
  }
  if (activeContactCount === 0) return 0

  for (let contactIndex = 0; contactIndex < contacts.length; contactIndex += 1) {
    const contact = contacts[contactIndex]
    if (!isContactUsable(contact)) continue
    warmStartContact(contact)
  }

  for (
    let iterationIndex = 0;
    iterationIndex < settings.velocityIterations;
    iterationIndex += 1
  ) {
    for (let contactIndex = 0; contactIndex < contacts.length; contactIndex += 1) {
      const contact = contacts[contactIndex]
      if (!isContactUsable(contact)) continue
      solveContactNormal(contact)
      solveContactFriction(contact, settings)
    }
  }

  for (
    let iterationIndex = 0;
    iterationIndex < settings.positionIterations;
    iterationIndex += 1
  ) {
    for (let contactIndex = 0; contactIndex < contacts.length; contactIndex += 1) {
      const contact = contacts[contactIndex]
      if (!isContactUsable(contact)) continue
      correctContactPosition(contact, settings)
    }
  }

  return activeContactCount
}

// Caches the per-contact quantities that stay constant during the velocity
// iterations: the restitution target (derived from the pre-solve relative
// normal velocity) and the effective masses of the three constraint
// directions.
function prepareContact(contact, settings) {
  const bodyA = contact.bodyA
  const bodyB = contact.bodyB
  const point = contact.point

  _scratchNormal.copy(contact.normal).normalize()

  if (bodyA) {
    contact.solverInitialPositionAMeters.copy(bodyA.positionMeters)
    contact.solverInitialOrientationAQuaternion.copy(
      bodyA.orientationQuaternion
    )
  }
  if (bodyB) {
    contact.solverInitialPositionBMeters.copy(bodyB.positionMeters)
    contact.solverInitialOrientationBQuaternion.copy(
      bodyB.orientationQuaternion
    )
  }

  if (bodyA) _scratchLeverArmA.subVectors(point, bodyA.positionMeters)
  if (bodyB) _scratchLeverArmB.subVectors(point, bodyB.positionMeters)

  const restitution = clampUnitInterval(
    contact.restitution ?? settings.restitution
  )
  const restitutionThresholdMetersPerSecond =
    settings.restitutionVelocityThresholdMetersPerSecond

  computeRelativeVelocityAtPoint(bodyA, bodyB, point, _scratchRelativeVelocity)
  const normalVelocityMetersPerSecond = _scratchRelativeVelocity.dot(_scratchNormal)

  // Restitution is only honoured for impacts above the threshold, so a
  // resting contact does not jitter on micro penetrations.
  contact.solverRestitutionTargetVelocityMetersPerSecond =
    restitution > 0 && normalVelocityMetersPerSecond < -restitutionThresholdMetersPerSecond
      ? -restitution * normalVelocityMetersPerSecond
      : 0

  contact.solverNormalEffectiveMassKg = computeEffectiveMassKg(
    bodyA,
    bodyB,
    _scratchNormal
  )

  computeTangentBasis(_scratchNormal, _scratchTangent1, _scratchTangent2)
  contact.solverTangent1EffectiveMassKg = computeEffectiveMassKg(
    bodyA,
    bodyB,
    _scratchTangent1
  )
  contact.solverTangent2EffectiveMassKg = computeEffectiveMassKg(
    bodyA,
    bodyB,
    _scratchTangent2
  )
}

// Applies the impulses accumulated during the previous frame and leaves them
// in the accumulators so the current solve can start from a converged state
// and reduce an over-applied impulse if later constraints require it.
function warmStartContact(contact) {
  const bodyA = contact.bodyA
  const bodyB = contact.bodyB
  const point = contact.point

  const previousNormalImpulseNewtonSeconds =
    contact.accumulatedNormalImpulseNewtonSeconds || 0
  const previousTangent1ImpulseNewtonSeconds =
    contact.accumulatedFrictionImpulseTangent1NewtonSeconds || 0
  const previousTangent2ImpulseNewtonSeconds =
    contact.accumulatedFrictionImpulseTangent2NewtonSeconds || 0

  _scratchNormal.copy(contact.normal).normalize()

  if (previousNormalImpulseNewtonSeconds !== 0) {
    _scratchImpulse
      .copy(_scratchNormal)
      .multiplyScalar(previousNormalImpulseNewtonSeconds)
    applyImpulse(bodyB, _scratchImpulse, point)
    applyImpulse(bodyA, _scratchOppositeImpulse.copy(_scratchImpulse).negate(), point)
  }

  if (
    previousTangent1ImpulseNewtonSeconds !== 0 ||
    previousTangent2ImpulseNewtonSeconds !== 0
  ) {
    computeTangentBasis(_scratchNormal, _scratchTangent1, _scratchTangent2)
    _scratchImpulse
      .copy(_scratchTangent1)
      .multiplyScalar(previousTangent1ImpulseNewtonSeconds)
      .addScaledVector(_scratchTangent2, previousTangent2ImpulseNewtonSeconds)
    applyImpulse(bodyB, _scratchImpulse, point)
    applyImpulse(bodyA, _scratchOppositeImpulse.copy(_scratchImpulse).negate(), point)
  }

  contact.accumulatedFrictionImpulseNewtonSeconds = Math.hypot(
    previousTangent1ImpulseNewtonSeconds,
    previousTangent2ImpulseNewtonSeconds
  )
}

// Normal (non-penetration) constraint.
function solveContactNormal(contact) {
  const bodyA = contact.bodyA
  const bodyB = contact.bodyB
  const point = contact.point
  const effectiveMassKg = contact.solverNormalEffectiveMassKg || 0
  if (effectiveMassKg <= 0) return

  _scratchNormal.copy(contact.normal).normalize()
  computeRelativeVelocityAtPoint(bodyA, bodyB, point, _scratchRelativeVelocity)
  const normalVelocityMetersPerSecond = _scratchRelativeVelocity.dot(_scratchNormal)
  const targetVelocityMetersPerSecond =
    contact.solverRestitutionTargetVelocityMetersPerSecond || 0

  const previousNormalImpulseNewtonSeconds =
    contact.accumulatedNormalImpulseNewtonSeconds || 0
  let accumulatedNormalImpulseNewtonSeconds =
    previousNormalImpulseNewtonSeconds +
    (targetVelocityMetersPerSecond - normalVelocityMetersPerSecond) *
      effectiveMassKg
  // A contact can push but never pull: the accumulated impulse is clamped
  // at zero.
  if (accumulatedNormalImpulseNewtonSeconds < 0) {
    accumulatedNormalImpulseNewtonSeconds = 0
  }
  const deltaNormalImpulseNewtonSeconds =
    accumulatedNormalImpulseNewtonSeconds - previousNormalImpulseNewtonSeconds
  contact.accumulatedNormalImpulseNewtonSeconds =
    accumulatedNormalImpulseNewtonSeconds
  if (deltaNormalImpulseNewtonSeconds === 0) return

  _scratchImpulse
    .copy(_scratchNormal)
    .multiplyScalar(deltaNormalImpulseNewtonSeconds)
  applyImpulse(bodyB, _scratchImpulse, point)
  applyImpulse(bodyA, _scratchOppositeImpulse.copy(_scratchImpulse).negate(), point)
}

// Coulomb friction constraint, solved in the tangent plane of the contact.
function solveContactFriction(contact, settings) {
  const bodyA = contact.bodyA
  const bodyB = contact.bodyB
  const point = contact.point

  const normalImpulseNewtonSeconds =
    contact.accumulatedNormalImpulseNewtonSeconds || 0
  const frictionCoefficient = Math.max(
    0,
    contact.frictionCoefficient ?? settings.frictionCoefficient
  )
  const maxFrictionImpulseNewtonSeconds =
    frictionCoefficient * normalImpulseNewtonSeconds

  _scratchNormal.copy(contact.normal).normalize()
  computeTangentBasis(_scratchNormal, _scratchTangent1, _scratchTangent2)
  computeRelativeVelocityAtPoint(bodyA, bodyB, point, _scratchRelativeVelocity)

  const tangentVelocity1MetersPerSecond = _scratchRelativeVelocity.dot(_scratchTangent1)
  const tangentVelocity2MetersPerSecond = _scratchRelativeVelocity.dot(_scratchTangent2)

  const previousTangent1ImpulseNewtonSeconds =
    contact.accumulatedFrictionImpulseTangent1NewtonSeconds || 0
  const previousTangent2ImpulseNewtonSeconds =
    contact.accumulatedFrictionImpulseTangent2NewtonSeconds || 0

  let tangent1ImpulseNewtonSeconds =
    previousTangent1ImpulseNewtonSeconds -
    tangentVelocity1MetersPerSecond * contact.solverTangent1EffectiveMassKg
  let tangent2ImpulseNewtonSeconds =
    previousTangent2ImpulseNewtonSeconds -
    tangentVelocity2MetersPerSecond * contact.solverTangent2EffectiveMassKg

  // Coulomb clamp: the magnitude of the friction impulse may never exceed
  // mu times the accumulated normal impulse.

  const frictionImpulseMagnitudeNewtonSeconds = Math.hypot(
    tangent1ImpulseNewtonSeconds,
    tangent2ImpulseNewtonSeconds
  )
  if (
    frictionImpulseMagnitudeNewtonSeconds > maxFrictionImpulseNewtonSeconds
  ) {
    const clampScale =
      maxFrictionImpulseNewtonSeconds / frictionImpulseMagnitudeNewtonSeconds
    tangent1ImpulseNewtonSeconds *= clampScale
    tangent2ImpulseNewtonSeconds *= clampScale
  }

  const deltaTangent1ImpulseNewtonSeconds =
    tangent1ImpulseNewtonSeconds - previousTangent1ImpulseNewtonSeconds
  const deltaTangent2ImpulseNewtonSeconds =
    tangent2ImpulseNewtonSeconds - previousTangent2ImpulseNewtonSeconds
  contact.accumulatedFrictionImpulseTangent1NewtonSeconds =
    tangent1ImpulseNewtonSeconds
  contact.accumulatedFrictionImpulseTangent2NewtonSeconds =
    tangent2ImpulseNewtonSeconds
  contact.accumulatedFrictionImpulseNewtonSeconds = Math.hypot(
    tangent1ImpulseNewtonSeconds,
    tangent2ImpulseNewtonSeconds
  )

  if (
    deltaTangent1ImpulseNewtonSeconds === 0 &&
    deltaTangent2ImpulseNewtonSeconds === 0
  ) {
    return
  }

  _scratchImpulse
    .copy(_scratchTangent1)
    .multiplyScalar(deltaTangent1ImpulseNewtonSeconds)
    .addScaledVector(_scratchTangent2, deltaTangent2ImpulseNewtonSeconds)
  applyImpulse(bodyB, _scratchImpulse, point)
  applyImpulse(bodyA, _scratchOppositeImpulse.copy(_scratchImpulse).negate(), point)
}

// Direct positional projection (non-linear Gauss-Seidel style correction).
//
// The penetration deeper than the slop threshold is removed by a fraction of
// the excess. The correction is distributed with the same effective mass
// formulation as the velocity constraint, so it also produces the matching
// rotation of both bodies.
function correctContactPosition(contact, settings) {
  const remainingDepthMeters = computeRemainingDepthMeters(contact)
  if (
    !Number.isFinite(remainingDepthMeters) ||
    remainingDepthMeters <= settings.slopMeters
  ) {
    return
  }

  const correctionMeters =
    (remainingDepthMeters - settings.slopMeters) *
    settings.positionCorrectionFactor
  if (correctionMeters <= 0) return

  const bodyA = contact.bodyA
  const bodyB = contact.bodyB
  const point = contact.point

  _scratchNormal.copy(contact.normal).normalize()
  if (bodyA) _scratchLeverArmA.subVectors(point, bodyA.positionMeters)
  if (bodyB) _scratchLeverArmB.subVectors(point, bodyB.positionMeters)

  // The orientation may have changed since the velocity pass, so the
  // effective mass is recomputed here.
  const effectiveMassKg = computeEffectiveMassKg(bodyA, bodyB, _scratchNormal)
  if (effectiveMassKg <= 0) return

  const pseudoImpulseKilogramMeters = correctionMeters * effectiveMassKg
  _scratchImpulse
    .copy(_scratchNormal)
    .multiplyScalar(pseudoImpulseKilogramMeters)

  if (bodyB) {
    bodyB.positionMeters.addScaledVector(
      _scratchNormal,
      pseudoImpulseKilogramMeters / bodyB.massKg
    )
    _scratchCrossProductB.crossVectors(_scratchLeverArmB, _scratchImpulse)
    applyInverseInertiaWorld(bodyB, _scratchCrossProductB, _scratchInverseInertiaB)
    applyAngularDisplacement(bodyB, _scratchInverseInertiaB)
  }

  if (bodyA) {
    bodyA.positionMeters.addScaledVector(
      _scratchNormal,
      -pseudoImpulseKilogramMeters / bodyA.massKg
    )
    _scratchCrossProductA.crossVectors(
      _scratchLeverArmA,
      _scratchOppositeImpulse.copy(_scratchImpulse).negate()
    )
    applyInverseInertiaWorld(bodyA, _scratchCrossProductA, _scratchInverseInertiaA)
    applyAngularDisplacement(bodyA, _scratchInverseInertiaA)
  }
}

// Derive penetration from the body transforms changed by earlier position
// corrections instead of repeatedly using the depth measured before solving.
function computeRemainingDepthMeters(contact) {
  const initialDepthMeters = contact.depth
  if (!Number.isFinite(initialDepthMeters)) return initialDepthMeters

  _scratchNormal.copy(contact.normal).normalize()
  let separationMeters = 0

  if (contact.bodyA) {
    _scratchInverseQuaternion
      .copy(contact.solverInitialOrientationAQuaternion)
      .invert()
    _scratchOrientationDeltaQuaternion
      .copy(contact.bodyA.orientationQuaternion)
      .multiply(_scratchInverseQuaternion)
    _scratchLeverArmA
      .copy(contact.point)
      .sub(contact.solverInitialPositionAMeters)
      .applyQuaternion(_scratchOrientationDeltaQuaternion)
    _scratchAngularContribution
      .copy(contact.bodyA.positionMeters)
      .add(_scratchLeverArmA)
      .sub(contact.point)
    separationMeters -= _scratchAngularContribution.dot(_scratchNormal)
  }

  if (contact.bodyB) {
    _scratchInverseQuaternion
      .copy(contact.solverInitialOrientationBQuaternion)
      .invert()
    _scratchOrientationDeltaQuaternion
      .copy(contact.bodyB.orientationQuaternion)
      .multiply(_scratchInverseQuaternion)
    _scratchLeverArmB
      .copy(contact.point)
      .sub(contact.solverInitialPositionBMeters)
      .applyQuaternion(_scratchOrientationDeltaQuaternion)
    _scratchAngularContribution
      .copy(contact.bodyB.positionMeters)
      .add(_scratchLeverArmB)
      .sub(contact.point)
    separationMeters += _scratchAngularContribution.dot(_scratchNormal)
  }

  return Math.max(0, initialDepthMeters - separationMeters)
}

// Relative velocity of B with respect to A at the contact point.
function computeRelativeVelocityAtPoint(bodyA, bodyB, point, target) {
  target.set(0, 0, 0)

  if (bodyA) {
    _scratchLeverArmA.subVectors(point, bodyA.positionMeters)
    _scratchAngularContribution.crossVectors(
      bodyA.angularVelocityRadiansPerSecond,
      _scratchLeverArmA
    )
    target.sub(bodyA.velocityMetersPerSecond).sub(_scratchAngularContribution)
  }

  if (bodyB) {
    _scratchLeverArmB.subVectors(point, bodyB.positionMeters)
    _scratchAngularContribution.crossVectors(
      bodyB.angularVelocityRadiansPerSecond,
      _scratchLeverArmB
    )
    target.add(bodyB.velocityMetersPerSecond).add(_scratchAngularContribution)
  }

  return target
}

// Effective mass of the constraint along `direction`, expressed in kg.
//
// The reciprocal of the constraint mass is
//   1/mA + 1/mB + (rA x d) . IA^-1 (rA x d) + (rB x d) . IB^-1 (rB x d)
// and the effective mass is its reciprocal.
function computeEffectiveMassKg(bodyA, bodyB, direction) {
  let inverseMassSum = 0

  if (bodyA) {
    inverseMassSum += 1 / bodyA.massKg
    _scratchCrossProductA.crossVectors(_scratchLeverArmA, direction)
    applyInverseInertiaWorld(bodyA, _scratchCrossProductA, _scratchInverseInertiaA)
    inverseMassSum += _scratchCrossProductA.dot(_scratchInverseInertiaA)
  }

  if (bodyB) {
    inverseMassSum += 1 / bodyB.massKg
    _scratchCrossProductB.crossVectors(_scratchLeverArmB, direction)
    applyInverseInertiaWorld(bodyB, _scratchCrossProductB, _scratchInverseInertiaB)
    inverseMassSum += _scratchCrossProductB.dot(_scratchInverseInertiaB)
  }

  if (!(inverseMassSum > 0)) return 0
  return 1 / inverseMassSum
}

// Rotates a world-frame vector by the inverse of the diagonal body-frame
// inertia tensor.
function applyInverseInertiaWorld(body, worldVector, target) {
  _scratchInverseQuaternion.copy(body.orientationQuaternion).invert()
  target.copy(worldVector).applyQuaternion(_scratchInverseQuaternion)
  target.set(
    target.x / body.inertiaTensorKgMeterSquared.x,
    target.y / body.inertiaTensorKgMeterSquared.y,
    target.z / body.inertiaTensorKgMeterSquared.z
  )
  return target.applyQuaternion(body.orientationQuaternion)
}

// Applies a small world-frame angular displacement to the body orientation.
function applyAngularDisplacement(body, angularDisplacementRadians) {
  _scratchAngularDisplacementQuaternion.set(
    angularDisplacementRadians.x,
    angularDisplacementRadians.y,
    angularDisplacementRadians.z,
    0
  )
  _scratchOrientationDeltaQuaternion
    .copy(_scratchAngularDisplacementQuaternion)
    .multiply(body.orientationQuaternion)
  body.orientationQuaternion.x += 0.5 * _scratchOrientationDeltaQuaternion.x
  body.orientationQuaternion.y += 0.5 * _scratchOrientationDeltaQuaternion.y
  body.orientationQuaternion.z += 0.5 * _scratchOrientationDeltaQuaternion.z
  body.orientationQuaternion.w += 0.5 * _scratchOrientationDeltaQuaternion.w
  body.orientationQuaternion.normalize()
}

// Deterministic orthonormal tangent basis of the contact plane.
function computeTangentBasis(normal, tangent1, tangent2) {
  const absoluteX = Math.abs(normal.x)
  const absoluteY = Math.abs(normal.y)
  const absoluteZ = Math.abs(normal.z)

  if (absoluteX <= absoluteY && absoluteX <= absoluteZ) {
    _scratchPerpendicularSeed.set(1, 0, 0)
  } else if (absoluteY <= absoluteZ) {
    _scratchPerpendicularSeed.set(0, 1, 0)
  } else {
    _scratchPerpendicularSeed.set(0, 0, 1)
  }

  tangent1.crossVectors(normal, _scratchPerpendicularSeed).normalize()
  tangent2.crossVectors(normal, tangent1).normalize()
}

function isContactUsable(contact) {
  return (
    !!contact &&
    !!contact.normal &&
    !!contact.point &&
    (!!contact.bodyA || !!contact.bodyB)
  )
}

function copyDefaultSettings(target) {
  target.velocityIterations = DEFAULT_CONTACT_SOLVER_SETTINGS.velocityIterations
  target.positionIterations = DEFAULT_CONTACT_SOLVER_SETTINGS.positionIterations
  target.slopMeters = DEFAULT_CONTACT_SOLVER_SETTINGS.slopMeters
  target.positionCorrectionFactor =
    DEFAULT_CONTACT_SOLVER_SETTINGS.positionCorrectionFactor
  target.restitution = DEFAULT_CONTACT_SOLVER_SETTINGS.restitution
  target.frictionCoefficient = DEFAULT_CONTACT_SOLVER_SETTINGS.frictionCoefficient
  target.restitutionVelocityThresholdMetersPerSecond =
    DEFAULT_CONTACT_SOLVER_SETTINGS.restitutionVelocityThresholdMetersPerSecond
  return target
}

function applySettingsOverrides(source, target) {
  if (!source) return target

  const velocityIterations = source.velocityIterations
  if (Number.isFinite(velocityIterations) && velocityIterations >= 1) {
    target.velocityIterations = Math.floor(velocityIterations)
  }

  const positionIterations = source.positionIterations
  if (Number.isFinite(positionIterations) && positionIterations >= 0) {
    target.positionIterations = Math.floor(positionIterations)
  }

  const slopMeters = source.slopMeters
  if (Number.isFinite(slopMeters) && slopMeters >= 0) {
    target.slopMeters = slopMeters
  }

  const positionCorrectionFactor = source.positionCorrectionFactor
  if (Number.isFinite(positionCorrectionFactor) && positionCorrectionFactor >= 0) {
    target.positionCorrectionFactor = positionCorrectionFactor
  }

  const restitution = source.restitution
  if (Number.isFinite(restitution) && restitution >= 0) {
    target.restitution = clampUnitInterval(restitution)
  }

  const frictionCoefficient = source.frictionCoefficient
  if (Number.isFinite(frictionCoefficient) && frictionCoefficient >= 0) {
    target.frictionCoefficient = frictionCoefficient
  }

  const restitutionVelocityThresholdMetersPerSecond =
    source.restitutionVelocityThresholdMetersPerSecond
  if (
    Number.isFinite(restitutionVelocityThresholdMetersPerSecond) &&
    restitutionVelocityThresholdMetersPerSecond >= 0
  ) {
    target.restitutionVelocityThresholdMetersPerSecond =
      restitutionVelocityThresholdMetersPerSecond
  }

  return target
}

function clampUnitInterval(value) {
  return Math.max(0, Math.min(1, value))
}
