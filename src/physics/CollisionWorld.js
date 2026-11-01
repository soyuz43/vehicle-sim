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

const _gravityForceNewtons = new THREE.Vector3()
const _contactNormalScratch = new THREE.Vector3()
const _contactsToSolveScratch = []
const _collisionPairsScratch = []
const _collisionPairPoolScratch = []

export function createCollisionWorld(config = {}) {
  const gravityMetersPerSecondSquared = requireFiniteNumber(
    config.gravityMetersPerSecondSquared ?? -9.80665,
    'gravityMetersPerSecondSquared'
  )
  const contactCache = config.contactCache ?? createContactCache()
  const contactSolver = config.contactSolver ?? createContactSolver(config.solverOptions)
  const registeredRecords = []
  const recordsByBody = new Map()
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
      const registeredColliders = colliders.map((collider) =>
        createRegisteredCollider(collider)
      )
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
      ensureCollisionPairPool(registeredRecords.length)

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
      recordsByBody.delete(body)
      delete body.collisionWorldId
    },

    applyGravity() {
      _gravityForceNewtons.set(
        0,
        gravityMetersPerSecondSquared,
        0
      )
      for (let recordIndex = 0; recordIndex < registeredRecords.length; recordIndex += 1) {
        const record = registeredRecords[recordIndex]
        if (!record.isStatic) {
          addForce(record.body, _gravityForceNewtons)
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

      generateFilteredPairs()
      contactCache.beginStep()
      generateContacts()
      contactSolver.solve(_contactsToSolveScratch)

      for (let recordIndex = 0; recordIndex < registeredRecords.length; recordIndex += 1) {
        const record = registeredRecords[recordIndex]
        if (!record.isStatic) {
          integrateRigidBodyPositionPhase(record.body, validatedDeltaTimeSeconds)
        }
      }

      contactCache.commit()
    },
  }

  function generateFilteredPairs() {
    _collisionPairsScratch.length = 0
    for (let firstIndex = 0; firstIndex < registeredRecords.length; firstIndex += 1) {
      const firstRecord = registeredRecords[firstIndex]
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < registeredRecords.length;
        secondIndex += 1
      ) {
        const secondRecord = registeredRecords[secondIndex]
        if (!canCollide(firstRecord, secondRecord)) continue
        if (firstRecord.isStatic && secondRecord.isStatic) continue

        const pairIndex = _collisionPairsScratch.length
        const pair = _collisionPairPoolScratch[pairIndex]
        if (!pair) {
          throw new Error('Collision pair pool is smaller than the broad-phase result')
        }
        pair.bodyIdA = Math.min(firstRecord.bodyId, secondRecord.bodyId)
        pair.bodyIdB = Math.max(firstRecord.bodyId, secondRecord.bodyId)
        pair.recordA = firstRecord.bodyId === pair.bodyIdA ? firstRecord : secondRecord
        pair.recordB = firstRecord.bodyId === pair.bodyIdB ? firstRecord : secondRecord
        _collisionPairsScratch.push(pair)
      }
    }
    _collisionPairsScratch.sort(compareCollisionPairs)
  }

  function canCollide(firstRecord, secondRecord) {
    return (
      (firstRecord.filterGroup & secondRecord.filterMask) !== 0 ||
      (secondRecord.filterGroup & firstRecord.filterMask) !== 0
    )
  }

  function generateContacts() {
    _contactsToSolveScratch.length = 0

    for (
      let pairIndex = 0;
      pairIndex < _collisionPairsScratch.length;
      pairIndex += 1
    ) {
      const pair = _collisionPairsScratch[pairIndex]
      updateColliderTransforms(pair.recordA)
      updateColliderTransforms(pair.recordB)

      for (
        let colliderAIndex = 0;
        colliderAIndex < pair.recordA.colliders.length;
        colliderAIndex += 1
      ) {
        const colliderA = pair.recordA.colliders[colliderAIndex]
        for (
          let colliderBIndex = 0;
          colliderBIndex < pair.recordB.colliders.length;
          colliderBIndex += 1
        ) {
          const colliderB = pair.recordB.colliders[colliderBIndex]
          const collision = testCollision(
            colliderA.shape,
            colliderA.worldTransform,
            colliderB.shape,
            colliderB.worldTransform
          )
          if (!collision) continue

          acquireNormalizedContact(pair, collision)
        }
      }
    }
  }

  function acquireNormalizedContact(pair, collision) {
    const recordA = pair.recordA
    const recordB = pair.recordB
    const hasStaticRecord = recordA.isStatic !== recordB.isStatic
    const dynamicRecord = recordA.isStatic ? recordB : recordA
    const staticRecord = recordA.isStatic ? recordA : recordB
    const dynamicIsFirst = dynamicRecord === recordA
    const bodyA = hasStaticRecord ? dynamicRecord.body : recordA.body
    const bodyB = hasStaticRecord ? null : recordB.body
    const staticContactId = hasStaticRecord ? staticRecord.body.contactId : undefined
    const normalAtoB =
      !hasStaticRecord || dynamicIsFirst
        ? collision.normal
        : _contactNormalScratch.copy(collision.normal).negate()

    _contactsToSolveScratch.push(
      contactCache.acquire({
        bodyA,
        bodyB,
        bodyAId: bodyA.contactId,
        bodyBId: staticContactId,
        featureId: collision.featureId,
        normal: normalAtoB,
        depth: collision.depth,
        point: collision.point,
        restitution: config.restitution,
        frictionCoefficient: config.frictionCoefficient,
      })
    )
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

  return world
}

function ensureCollisionPairPool(bodyCount) {
  const requiredPairCount = bodyCount * bodyCount
  while (_collisionPairPoolScratch.length < requiredPairCount) {
    _collisionPairPoolScratch.push(createCollisionPair())
  }
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

function createRegisteredCollider(collider) {
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
        !body.velocityMetersPerSecond ||
        !body.angularVelocityRadiansPerSecond ||
        !body.forceAccumulatorNewtons ||
        !body.torqueAccumulatorNewtonMeters))
  ) {
    throw new TypeError(
      'dynamic body must provide contactId, positionMeters, orientationQuaternion, finite massKg, velocities, and force accumulators; static body may omit the dynamic fields'
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
    filterMask < 0 ||
    filterMask > 0xffffffff
  ) {
    throw new RangeError(`${fieldName} must be a non-negative 32-bit integer`)
  }
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
