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
import {
  getTerrainSurfaceProfile,
  testTerrainCollision,
} from '../terrain/HeightfieldBodyContact.js'

const DEFAULT_FILTER_GROUP = 1
const DEFAULT_FILTER_MASK = 0xffffffff
const TERRAIN_FEATURE_IDS_BY_SHAPE = Object.freeze({
  sphere: Object.freeze(['sphere:bottom']),
  capsule: Object.freeze(['capsule:end:-', 'capsule:end:+']),
  box: Object.freeze([
    'box:corner:---',
    'box:corner:--+',
    'box:corner:-+-',
    'box:corner:-++',
    'box:corner:+--',
    'box:corner:+-+',
    'box:corner:++-',
    'box:corner:+++',
  ]),
})

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
  let previouslyUsedCollisionPairCount = 0
  let terrainRecord = null
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
      if (
        terrainRecord &&
        String(body.contactId) === String(terrainRecord.body.contactId)
      ) {
        throw new TypeError('body contactId must be unique from the registered terrain')
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

    registerTerrain(terrain, options = {}) {
      if (terrainRecord) {
        throw new TypeError('a terrain collider is already registered in this CollisionWorld')
      }
      const surfaceProfile = getTerrainSurfaceProfile(terrain)
      const terrainHalfSizeMeters =
        surfaceProfile?.halfSizeMeters ?? surfaceProfile?.sizeMeters * 0.5
      if (
        typeof surfaceProfile?.querySurfaceAtWorldPosition !== 'function' ||
        !Number.isFinite(terrainHalfSizeMeters) ||
        terrainHalfSizeMeters <= 0
      ) {
        throw new TypeError('terrain must expose a bounded heightfield surface profile')
      }

      const contactId =
        options.contactId ?? 'collision-world-terrain-' + String(nextBodyId)
      if (String(contactId).length === 0) {
        throw new TypeError('terrain contactId must not be empty')
      }
      for (let recordIndex = 0; recordIndex < registeredRecords.length; recordIndex += 1) {
        if (String(registeredRecords[recordIndex].body.contactId) === String(contactId)) {
          throw new TypeError('terrain contactId must be unique in this CollisionWorld')
        }
      }
      const filterGroup = options.filterGroup ?? DEFAULT_FILTER_GROUP
      const filterMask = options.filterMask ?? DEFAULT_FILTER_MASK
      requireFilterMask(filterGroup, 'filterGroup')
      requireFilterMask(filterMask, 'filterMask')

      const terrainBody = { contactId, isStatic: true }
      terrainRecord = {
        bodyId: nextBodyId,
        body: terrainBody,
        colliders: [],
        filterGroup,
        filterMask,
        isStatic: true,
        isTerrain: true,
        terrain,
        terrainHalfSizeMeters,
      }
      nextBodyId += 1
      registeredRecords.push(terrainRecord)
      ensureCollisionPairPool(collisionPairPoolScratch, registeredRecords.length)
      return terrainRecord
    },

    removeTerrain() {
      if (!terrainRecord) {
        throw new TypeError('terrain is not registered in this CollisionWorld')
      }
      const recordIndex = registeredRecords.indexOf(terrainRecord)
      if (recordIndex >= 0) registeredRecords.splice(recordIndex, 1)
      clearCollisionPairReferences(collisionPairPoolScratch, terrainRecord)
      collisionPairsScratch.length = 0
      contactsToSolveScratch.length = 0
      const removedTerrain = terrainRecord.terrain
      terrainRecord = null
      return removedTerrain
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

      previouslyUsedCollisionPairCount = generateFilteredPairs(
        registeredRecords,
        collisionPairsScratch,
        collisionPairPoolScratch,
        previouslyUsedCollisionPairCount
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

function generateFilteredPairs(
  registeredRecords,
  collisionPairsScratch,
  collisionPairPoolScratch,
  previouslyUsedCollisionPairCount
) {
  collisionPairsScratch.length = 0
  for (let firstIndex = 0; firstIndex < registeredRecords.length; firstIndex += 1) {
    const firstRecord = registeredRecords[firstIndex]
    for (let secondIndex = firstIndex + 1; secondIndex < registeredRecords.length; secondIndex += 1) {
      const secondRecord = registeredRecords[secondIndex]
      if (!canCollide(firstRecord, secondRecord)) continue
      if (firstRecord.isStatic && secondRecord.isStatic) continue
      if (
        firstRecord.isTerrain &&
        !overlapsTerrainBounds(secondRecord, firstRecord)
      ) continue
      if (
        secondRecord.isTerrain &&
        !overlapsTerrainBounds(firstRecord, secondRecord)
      ) continue

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
  const currentCollisionPairCount = collisionPairsScratch.length
  for (
    let pairIndex = currentCollisionPairCount;
    pairIndex < previouslyUsedCollisionPairCount;
    pairIndex += 1
  ) {
    clearCollisionPair(collisionPairPoolScratch[pairIndex])
  }
  collisionPairsScratch.sort(compareCollisionPairs)
  return currentCollisionPairCount
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
    if (pair.recordA.isTerrain || pair.recordB.isTerrain) {
      generateTerrainContacts(
        pair,
        contactsToSolveScratch,
        contactCache,
        contactCandidate,
        restitution,
        frictionCoefficient
      )
      continue
    }
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

function generateTerrainContacts(
  pair,
  contactsToSolveScratch,
  contactCache,
  contactCandidate,
  restitution,
  frictionCoefficient
) {
  const terrainRecord = pair.recordA.isTerrain ? pair.recordA : pair.recordB
  const dynamicRecord = pair.recordA.isTerrain ? pair.recordB : pair.recordA
  updateColliderTransforms(dynamicRecord)

  for (let colliderIndex = 0; colliderIndex < dynamicRecord.colliders.length; colliderIndex += 1) {
    const collider = dynamicRecord.colliders[colliderIndex]
    const collision = testTerrainCollision(
      terrainRecord.terrain,
      collider.shape,
      collider.worldTransform
    )
    if (!collision) continue

    contactCandidate.bodyA = dynamicRecord.body
    contactCandidate.bodyB = null
    contactCandidate.bodyAId = dynamicRecord.body.contactId
    contactCandidate.bodyBId = terrainRecord.body.contactId
    const terrainFeatureId = collider.terrainFeatureIds[collision.featureId]
    if (!terrainFeatureId) {
      throw new Error('terrain collision returned an unregistered support feature')
    }
    contactCandidate.featureId = terrainFeatureId
    contactCandidate.normal.copy(collision.normal).negate()
    contactCandidate.depth = collision.depth
    contactCandidate.point.copy(collision.point)
    contactCandidate.restitution = restitution
    contactCandidate.frictionCoefficient =
      frictionCoefficient ?? collision.frictionCoefficient
    contactsToSolveScratch.push(contactCache.acquire(contactCandidate))
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

function overlapsTerrainBounds(bodyRecord, terrainRecord) {
  const body = bodyRecord.body
  let horizontalRadiusMeters = 0
  for (let colliderIndex = 0; colliderIndex < bodyRecord.colliders.length; colliderIndex += 1) {
    const collider = bodyRecord.colliders[colliderIndex]
    const shape = collider.shape
    let shapeRadiusMeters
    if (shape.type === 'sphere') {
      shapeRadiusMeters = shape.radiusMeters
    } else if (shape.type === 'capsule') {
      shapeRadiusMeters = shape.radiusMeters + shape.halfHeightMeters
    } else {
      const halfExtentsMeters = shape.halfExtentsMeters
      shapeRadiusMeters = Math.sqrt(
        halfExtentsMeters.x * halfExtentsMeters.x +
        halfExtentsMeters.y * halfExtentsMeters.y +
        halfExtentsMeters.z * halfExtentsMeters.z
      )
    }
    const localPositionMeters = collider.localPositionMeters
    const colliderRadiusMeters = shapeRadiusMeters + Math.sqrt(
      localPositionMeters.x * localPositionMeters.x +
      localPositionMeters.y * localPositionMeters.y +
      localPositionMeters.z * localPositionMeters.z
    )
    horizontalRadiusMeters = Math.max(horizontalRadiusMeters, colliderRadiusMeters)
  }

  const terrainHalfSizeMeters = terrainRecord.terrainHalfSizeMeters
  return (
    body.positionMeters.x + horizontalRadiusMeters >= -terrainHalfSizeMeters &&
    body.positionMeters.x - horizontalRadiusMeters <= terrainHalfSizeMeters &&
    body.positionMeters.z + horizontalRadiusMeters >= -terrainHalfSizeMeters &&
    body.positionMeters.z - horizontalRadiusMeters <= terrainHalfSizeMeters
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
    terrainFeatureIds: createTerrainFeatureIds(colliderId, shape),
    localPositionMeters,
    localOrientationQuaternion,
    worldTransform: {
      positionMeters: new THREE.Vector3(),
      orientationQuaternion: new THREE.Quaternion(),
    },
  }
}

function createTerrainFeatureIds(colliderId, shape) {
  const featureIds = TERRAIN_FEATURE_IDS_BY_SHAPE[shape.type]
  const terrainFeatureIds = Object.create(null)
  const featurePrefix = 'terrain:' + String(colliderId) + ':'
  for (let featureIndex = 0; featureIndex < featureIds.length; featureIndex += 1) {
    const featureId = featureIds[featureIndex]
    terrainFeatureIds[featureId] = featurePrefix + featureId
  }
  return Object.freeze(terrainFeatureIds)
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
