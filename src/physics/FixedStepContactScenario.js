// src/physics/FixedStepContactScenario.js

import * as THREE from 'three'
import {
  addForce,
  clearForceAccumulators,
  integrateRigidBodyPositionPhase,
  integrateRigidBodyVelocityPhase,
} from './RigidBody.js'
import { testCollision } from './Collision.js'
import { createContactSolver } from './ContactSolver.js'
import { createContactCache } from './ContactCache.js'

export const DEFAULT_FIXED_CONTACT_TIMESTEP_SECONDS = 1 / 120
export const DEFAULT_CONTACT_GRAVITY_METERS_PER_SECOND_SQUARED = -9.80665

// One fixed-step vertical slice for a dynamic primitive against a static
// primitive. The order is intentional:
//   1. clear force accumulators and apply gravity;
//   2. integrate velocity and clear the consumed force accumulator;
//   3. generate contact geometry and acquire a persistent constraint;
//   4. solve velocity constraints and positional projection;
//   5. integrate position once from the post-solve velocity;
//   6. commit the contact cache for the next step.
//
// Projection corrects the pre-integration pose inside the solver. Position
// integration then advances once with the post-solve velocity and never
// reapplies the measured penetration. The double-correction regression test
// checks the expected final pose from those two distinct operations.
export function createFixedStepContactScenario(config = {}) {
  const dynamicBody = requireBody(config.dynamicBody, 'dynamicBody')
  const staticBody = requireStaticBody(config.staticBody)
  const dynamicShape = requireShape(config.dynamicShape, 'dynamicShape')
  const staticShape = requireShape(config.staticShape, 'staticShape')
  const fixedTimeStepSeconds = requirePositiveNumber(
    config.fixedTimeStepSeconds ?? DEFAULT_FIXED_CONTACT_TIMESTEP_SECONDS,
    'fixedTimeStepSeconds'
  )
  const gravityMetersPerSecondSquared = requireFiniteNumber(
    config.gravityMetersPerSecondSquared ??
      DEFAULT_CONTACT_GRAVITY_METERS_PER_SECOND_SQUARED,
    'gravityMetersPerSecondSquared'
  )
  const contactSolver = config.contactSolver ?? createContactSolver(config.solverOptions)
  const contactCache = config.contactCache ?? createContactCache()
  const gravityForceNewtons = new THREE.Vector3()
  let stepIndex = 0

  const scenario = {
    dynamicBody,
    staticBody,
    dynamicShape,
    staticShape,
    contactSolver,
    contactCache,
    fixedTimeStepSeconds,
    gravityMetersPerSecondSquared,

    step() {
      clearForceAccumulators(dynamicBody)
      gravityForceNewtons.set(
        0,
        gravityMetersPerSecondSquared * dynamicBody.massKg,
        0
      )
      addForce(dynamicBody, gravityForceNewtons)
      integrateRigidBodyVelocityPhase(dynamicBody, fixedTimeStepSeconds)
      clearForceAccumulators(dynamicBody)

      contactCache.beginStep()
      const collision = testCollision(
        dynamicShape,
        dynamicBody,
        staticShape,
        staticBody
      )
      const contactsToSolve = []
      if (collision) {
        contactsToSolve.push(
          contactCache.acquire({
            bodyA: dynamicBody,
            bodyB: null,
            bodyAId: dynamicBody.contactId,
            bodyBId: staticBody.contactId,
            featureId: collision.featureId,
            normal: collision.normal,
            depth: collision.depth,
            point: collision.point,
            restitution: config.restitution,
            frictionCoefficient: config.frictionCoefficient,
          })
        )
      }

      const solvedContactCount =
        contactsToSolve.length > 0 ? contactSolver.solve(contactsToSolve) : 0
      integrateRigidBodyPositionPhase(dynamicBody, fixedTimeStepSeconds)
      const activeContacts = contactCache.commit()

      const stepResult = {
        stepIndex,
        collisionGenerated: !!collision,
        solvedContactCount,
        activeContactCount: activeContacts.length,
        activeContacts,
      }
      stepIndex += 1
      return stepResult
    },

    getActiveContacts() {
      return contactCache.getActiveContacts()
    },

    getStateSnapshot() {
      return {
        stepIndex,
        positionMeters: dynamicBody.positionMeters.toArray(),
        velocityMetersPerSecond: dynamicBody.velocityMetersPerSecond.toArray(),
        orientationQuaternion: dynamicBody.orientationQuaternion.toArray(),
        angularVelocityRadiansPerSecond:
          dynamicBody.angularVelocityRadiansPerSecond.toArray(),
        contacts: contactCache.getActiveContacts().map(serializeContact),
      }
    },
  }

  return scenario
}

function serializeContact(contact) {
  return {
    contactKey: contact.contactKey,
    bodyAId: contact.bodyAId,
    bodyBId: contact.bodyBId,
    featureId: contact.featureId,
    ageSteps: contact.ageSteps,
    depthMeters: contact.depth,
    normal: contact.normal.toArray(),
    pointMeters: contact.point.toArray(),
    accumulatedNormalImpulseNewtonSeconds:
      contact.accumulatedNormalImpulseNewtonSeconds,
    accumulatedFrictionImpulseNewtonSeconds:
      contact.accumulatedFrictionImpulseNewtonSeconds,
  }
}

function requireBody(body, fieldName) {
  if (
    !body ||
    !body.positionMeters ||
    !body.velocityMetersPerSecond ||
    !body.orientationQuaternion ||
    !body.angularVelocityRadiansPerSecond ||
    !Number.isFinite(body.massKg) ||
    body.massKg <= 0 ||
    !body.contactId
  ) {
    throw new TypeError(`${fieldName} must be a dynamic rigid body with a contactId`)
  }
  return body
}

function requireStaticBody(body) {
  if (!body || !body.positionMeters || !body.orientationQuaternion || !body.contactId) {
    throw new TypeError('staticBody must provide contactId, positionMeters, and orientationQuaternion')
  }
  return body
}

function requireShape(shape, fieldName) {
  if (!shape || !shape.type) {
    throw new TypeError(`${fieldName} must be a supported primitive shape`)
  }
  return shape
}

function requireFiniteNumber(value, fieldName) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${fieldName} must be a finite number`)
  }
  return value
}

function requirePositiveNumber(value, fieldName) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${fieldName} must be a finite positive number`)
  }
  return value
}
