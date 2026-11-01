// src/physics/CollisionWorld.js

import * as THREE from 'three'
import {
  addForce,
  clearForceAccumulators,
  integrateRigidBodyPositionPhase,
  integrateRigidBodyVelocityPhase,
} from './RigidBody.js'
import { testCollision } from './Collision.js'
import { createContactCache } from './ContactCache.js'
import { createContactSolver } from './ContactSolver.js'

const DEFAULT_FILTER_GROUP = 1
const DEFAULT_FILTER_MASK = 0xffffffff

export function createCollisionWorld(config = {}) {
  const gravityMetersPerSecondSquared = requireFiniteNumber(
    config.gravityMetersPerSecondSquared ?? -9.80665,
    'gravityMetersPerSecondSquared'
  )
  const contactCache = config.contactCache ?? createContactCache()
  const contactSolver = config.contactSolver ?? createContactSolver(config.solverOptions)
  const registeredRecords = []
  const recordsByBody = new Map()
  const gravityForceNewtons = new THREE.Vector3()
  const contactsToSolveScratch = []
  const collisionPairsScratch = []
  const collisionPairPoolScratch = []
  const contactCandidate = {
    bodyA: null,
    bodyB: null,
    bodyAId: undefined,
    bodyBId: undefined,
    featureId: '',
    normal: new THREE.Vector3(),
    depth: 0,
    point: new THREE.Vector3(),
    restitution: undefined,
    frictionCoefficient: undefined,
  }
  let nextBodyId = 1

  const world = {
    contactCache,
    contactSolver,
    gravityMetersPerSecondSquared,

    registerBody(body, colliders, filterGroup = DEFAULT_FILTER_GROUP, filterMask = DEFAULT_FILTER_MASK) {
      validateBody(body)
      requireColliderList(colliders)
      requireFilterMask(filterGroup, 'filterGroup')
      requireFilterMask(filterMask, 'filterMask')
      if (recordsByBody.has(body)) {
        throw new TypeError('body is already registered in this CollisionWorld')
      }

      const bodyId = nextBodyId
      nextBodyId += 1
      const registeredColliders = colliders.map(createRegisteredCollider)
      const record = {
        bodyId,
        body,
        colliders: registeredColliders,
        filterGroup,
        filterMask,
        isStatic: body.isStatic === true,
      }

      body.collisionWorldId = bodyId
      registeredRecords.push(record)
      recordsByBody.set(body, record)
      ensureCollisionPairPool(collisionPairPoolScratch, registeredRecords.length)

      return record
    },

    removeBody(body) {
      const record = recordsByBody.get(body)
      if (!record) {
        throw new TypeError('body is not registered in this CollisionWorld')
      }

      const recordIndex = registeredRecords.indexOf(record)
      if (recordIndex >= 0) {
        registeredRecords.splice(recordIndex, 1)
      }
      clearCollisionPairReferences(collisionPairPoolScratch, record)
      collisionPairsScratch.length = 0
      contactsToSolveScratch.length = 0
      recordsByBody.delete(body)
      delete body.collisionWorldId
    },

    applyGravity() {
      for (let recordIndex = 0; recordIndex < registeredRecords.length; recordIndex += 1) {
        const record = registeredRecords[recordIndex]
        if (!record.isStatic) {
          gravityForceNewtons.set(
            0,
            gravityMetersPerSecondSquared * record.body.massKg,
            0
          )
          addForce(record.body, gravityForceNewtons)
        }
      }
    },

    step(deltaTimeSeconds) {
      const validatedDeltaTimeSeconds = requirePositiveNumber(
        deltaTimeSeconds,
        'deltaTimeSeconds'
      )

      for (let recordIndex = 0; recordIndex < registeredRecords.length; recordIndex += 1) {
        const record = registeredRecords[recordIndex]
        if (!record.isStatic) {
          clearForceAccumulators(record.body)
        }
      }
      world.applyGravity()

      for (let recordIndex = 0; recordIndex < registeredRecords.length; recordIndex += 1) {
        const record = registeredRecords[recordIndex]
        if (!record.isStatic) {
          integrateRigidBodyVelocityPhase(record.body, validatedDeltaTimeSeconds)
        }
      }

      generateFilteredPairs(
        registeredRecords,
        collisionPairsScratch,
        collisionPairPoolScratch
      )
      contactCache.beginStep()
      generateContacts(
        collisionPairsScratch,
        contactsToSolveScratch,
        contactCache,
        contactCandidate,
        config.restitution,
        config.frictionCoefficient
      )
      contactSolver.solve(contactsToSolveScratch)

      for (let recordIndex = 0; recordIndex < registeredRecords.length; recordIndex += 1) {
        const record = registeredRecords[recordIndex]
        if (!record.isStatic) {
          integrateRigidBodyPositionPhase(record.body, validatedDeltaTimeSeconds)
        }
      }

      contactCache.commit()
    },
  }

  return world
}

function generateFilteredPairs(registeredRecords, collisionPairsScratch, collisionPairPoolScratch) {
  collisionPairsScratch.length = 0
  for (let firstIndex = 0; firstIndex < registeredRecords.length; firstIndex += 1) {
    const firstRecord = registeredRecords[firstIndex]
    for (let secondIndex = firstIndex + 1; secondIndex < registeredRecords.length; secondIndex += 1) {
      const secondRecord = registeredRecords[secondIndex]
      if (!canCollide(firstRecord, secondRecord)) continue
      if (firstRecord.isStatic && secondRecord.isStatic) continue

      const pair = collisionPairPoolScratch[collisionPairsScratch.length]
      if (!pair) {
        throw new Error('Collision pair pool is smaller than the broad-phase result')
      }
      pair.bodyIdA = Math.min(firstRecord.bodyId, secondRecord.bodyId)
      pair.bodyIdB = Math.max(firstRecord.bodyId, secondRecord.bodyId)
      pair.recordA = firstRecord.bodyId === pair.bodyIdA ? firstRecord : secondRecord
      pair.recordB = firstRecord.bodyId === pair.bodyIdB ? firstRecord : secondRecord
      collisionPairsScratch.push(pair)
    }
  }
  for (let pairIndex = collisionPairsScratch.length; pairIndex < collisionPairPoolScratch.length; pairIndex += 1) {
    clearCollisionPair(collisionPairPoolScratch[pairIndex])
  }
  collisionPairsScratch.sort(compareCollisionPairs)
}

function canCollide(firstRecord, secondRecord) {
  return (
    (firstRecord.filterGroup & secondRecord.filterMask) !== 0 &&
    (secondRecord.filterGroup & firstRecord.filterMask) !== 0
  )
}

function generateContacts(
  collisionPairsScratch,
  contactsToSolveScratch,
  contactCache,
  contactCandidate,
  restitution,
  frictionCoefficient
) {
  contactsToSolveScratch.length = 0
  for (let pairIndex = 0; pairIndex < collisionPairsScratch.length; pairIndex += 1) {
    const pair = collisionPairsScratch[pairIndex]
    updateColliderTransforms(pair.recordA)
    updateColliderTransforms(pair.recordB)

    for (let colliderAIndex = 0; colliderAIndex < pair.recordA.colliders.length; colliderAIndex += 1) {
      const colliderA = pair.recordA.colliders[colliderAIndex]
      for (let colliderBIndex = 0; colliderBIndex < pair.recordB.colliders.length; colliderBIndex += 1) {
        const colliderB = pair.recordB.colliders[colliderBIndex]
        const collision = testCollision(
          colliderA.shape,
          colliderA.worldTransform,
          colliderB.shape,
          colliderB.worldTransform
        )
        if (!collision) continue

        acquireNormalizedContact(
          pair,
          colliderA,
          colliderB,
          collision,
          contactsToSolveScratch,
          contactCache,
          contactCandidate,
          restitution,
          frictionCoefficient
        )
      }
    }
  }
}

function acquireNormalizedContact(
  pair,
  colliderA,
  colliderB,
  collision,
  contactsToSolveScratch,
  contactCache,
  contactCandidate,
  restitution,
  frictionCoefficient
) {
  const recordA = pair.recordA
  const recordB = pair.recordB
  const hasStaticRecord = recordA.isStatic !== recordB.isStatic
  const dynamicRecord = recordA.isStatic ? recordB : recordA
  const staticRecord = recordA.isStatic ? recordA : recordB
  const dynamicIsFirst = dynamicRecord === recordA

  contactCandidate.bodyA = hasStaticRecord ? dynamicRecord.body : recordA.body
  contactCandidate.bodyB = hasStaticRecord ? null : recordB.body
  contactCandidate.bodyAId = contactCandidate.bodyA.contactId
  contactCandidate.bodyBId = hasStaticRecord ? staticRecord.body.contactId : undefined
  contactCandidate.featureId =
    String(colliderA.colliderId) + ':' + String(colliderB.colliderId) + ':' + collision.featureId
  contactCandidate.normal.copy(collision.normal)
  if (hasStaticRecord && !dynamicIsFirst) {
    contactCandidate.normal.negate()
  }
  contactCandidate.depth = collision.depth
  contactCandidate.point.copy(collision.point)
  contactCandidate.restitution = restitution
  contactCandidate.frictionCoefficient = frictionCoefficient
  contactsToSolveScratch.push(contactCache.acquire(contactCandidate))
}

function updateColliderTransforms(record) {
  const body = record.body
  for (let colliderIndex = 0; colliderIndex < record.colliders.length; colliderIndex += 1) {
    const collider = record.colliders[colliderIndex]
    collider.worldTransform.positionMeters
      .copy(collider.localPositionMeters)
      .applyQuaternion(body.orientationQuaternion)
      .add(body.positionMeters)
    collider.worldTransform.orientationQuaternion
      .copy(body.orientationQuaternion)
      .multiply(collider.localOrientationQuaternion)
  }
}

function ensureCollisionPairPool(collisionPairPoolScratch, bodyCount) {
  const requiredPairCount = bodyCount * bodyCount
  while (collisionPairPoolScratch.length < requiredPairCount) {
    collisionPairPoolScratch.push(createCollisionPair())
  }
}

function clearCollisionPairReferences(collisionPairPoolScratch, record) {
  for (let pairIndex = 0; pairIndex < collisionPairPoolScratch.length; pairIndex += 1) {
    const pair = collisionPairPoolScratch[pairIndex]
    if (pair.recordA === record || pair.recordB === record) {
      clearCollisionPair(pair)
    }
  }
}

function clearCollisionPair(pair) {
  pair.bodyIdA = 0
  pair.bodyIdB = 0
  pair.recordA = null
  pair.recordB = null
}

function createCollisionPair() {
  return {
    bodyIdA: 0,
    bodyIdB: 0,
    recordA: null,
    recordB: null,
  }
}

function compareCollisionPairs(firstPair, secondPair) {
  return firstPair.bodyIdA - secondPair.bodyIdA || firstPair.bodyIdB - secondPair.bodyIdB
}

function createRegisteredCollider(collider, colliderId) {
  const shape = collider?.shape ?? collider
  validateShape(shape)
  const localPositionMeters = new THREE.Vector3()
  const localOrientationQuaternion = new THREE.Quaternion()
  const localPosition = collider?.positionMeters ?? collider?.localTransform?.positionMeters
  const localOrientation =
    collider?.orientationQuaternion ?? collider?.localTransform?.orientationQuaternion

  if (localPosition) {
    copyVector(localPosition, localPositionMeters, 'collider positionMeters')
  }
  if (localOrientation) {
    copyQuaternion(
      localOrientation,
      localOrientationQuaternion,
      'collider orientationQuaternion'
    )
  }

  return {
    colliderId,
    shape,
    localPositionMeters,
    localOrientationQuaternion,
    worldTransform: {
      positionMeters: new THREE.Vector3(),
      orientationQuaternion: new THREE.Quaternion(),
    },
  }
}

function validateBody(body) {
  const isDynamicBody = body?.isStatic !== true
  if (
    !body ||
    !body.contactId ||
    !body.positionMeters ||
    !body.orientationQuaternion ||
    (isDynamicBody &&
      (typeof body.massKg !== 'number' ||
        !Number.isFinite(body.massKg) ||
        body.massKg <= 0 ||
        !body.velocityMetersPerSecond ||
        !body.angularVelocityRadiansPerSecond ||
        !body.forceAccumulatorNewtons ||
        !body.torqueAccumulatorNewtonMeters ||
        !isFiniteVector3(body.linearAccelerationMetersPerSecondSquared) ||
        !isFiniteVector3(body.angularAccelerationRadiansPerSecondSquared) ||
        !isPositiveFiniteVector3(body.inertiaTensorKgMeterSquared)))
  ) {
    throw new TypeError(
      'dynamic body must provide contactId, positionMeters, orientationQuaternion, positive finite massKg, velocities, force accumulators, accelerations, and positive finite inertia; static body may omit the dynamic fields'
    )
  }
}

function requireColliderList(colliders) {
  if (!Array.isArray(colliders) || colliders.length === 0) {
    throw new TypeError('colliders must be a non-empty array')
  }
}

function requireFilterMask(filterMask, fieldName) {
  if (
    !Number.isInteger(filterMask) ||
    filterMask === 0 ||
    filterMask < -0x80000000 ||
    (filterMask > 0x7fffffff && filterMask !== 0xffffffff)
  ) {
    throw new RangeError(fieldName + ' must be a non-zero signed 32-bit integer or 0xffffffff')
  }
}

function isFiniteVector3(vector) {
  return (
    vector &&
    typeof vector.copy === 'function' &&
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  )
}

function isPositiveFiniteVector3(vector) {
  return (
    isFiniteVector3(vector) &&
    vector.x > 0 &&
    vector.y > 0 &&
    vector.z > 0
  )
}

function validateShape(shape) {
  if (
    !shape ||
    (shape.type !== 'sphere' && shape.type !== 'box' && shape.type !== 'capsule')
  ) {
    throw new TypeError('collider shape must be a supported sphere, box, or capsule')
  }
}

function copyVector(source, target, fieldName) {
  if (Array.isArray(source)) {
    if (source.length !== 3 || source.some((value) => !Number.isFinite(value))) {
      throw new TypeError(`${fieldName} must contain three finite values`)
    }
    target.fromArray(source)
    return
  }
  if (!source.isVector3 || !Number.isFinite(source.x) || !Number.isFinite(source.y) || !Number.isFinite(source.z)) {
    throw new TypeError(`${fieldName} must be a finite THREE.Vector3 or [x, y, z] array`)
  }
  target.copy(source)
}

function copyQuaternion(source, target, fieldName) {
  if (Array.isArray(source)) {
    if (source.length !== 4 || source.some((value) => !Number.isFinite(value))) {
      throw new TypeError(`${fieldName} must contain four finite values`)
    }
    target.fromArray(source)
    return
  }
  if (!source.isQuaternion || !Number.isFinite(source.x) || !Number.isFinite(source.y) || !Number.isFinite(source.z) || !Number.isFinite(source.w)) {
    throw new TypeError(`${fieldName} must be a finite THREE.Quaternion or [x, y, z, w] array`)
  }
  target.copy(source)
}

function requireFiniteNumber(value, fieldName) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${fieldName} must be a finite number`)
  }
  return value
}

function requirePositiveNumber(value, fieldName) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${fieldName} must be a finite positive number`)
  }
  return value
}
