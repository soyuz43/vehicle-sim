import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import {
  createContactCache,
  createContactKey,
  resolveContactKey,
} from '../src/physics/ContactCache.js'
import { createRigidBody, resetRigidBody } from '../src/physics/RigidBody.js'

const DYNAMIC_BODY_ID = 'dynamic-body'
const STATIC_BODY_ID = 'static-body'
const STATIC_GROUND_FEATURE_ID = 'sphere-box:outside:face:y+'
const _dynamicBody = { contactId: DYNAMIC_BODY_ID }

function createCandidate(overrides = {}) {
  const bodyA = overrides.bodyA ?? _dynamicBody
  return {
    bodyA,
    bodyB: null,
    bodyAId: DYNAMIC_BODY_ID,
    bodyBId: STATIC_BODY_ID,
    featureId: STATIC_GROUND_FEATURE_ID,
    normal: new THREE.Vector3(0, -1, 0),
    depth: 0.01,
    point: new THREE.Vector3(0, 0, 0),
    restitution: 0,
    frictionCoefficient: 0.5,
    ...overrides,
  }
}

test('a matching body pair and feature reuses the contact constraint and warm start', () => {
  const cache = createContactCache()
  const [firstConstraint] = cache.update([createCandidate()])
  firstConstraint.accumulatedNormalImpulseNewtonSeconds = 4.25
  firstConstraint.accumulatedFrictionImpulseTangent1NewtonSeconds = 0.75

  const [persistedConstraint] = cache.update([
    createCandidate({
      depth: 0.008,
      point: new THREE.Vector3(0.1, 0, 0),
    }),
  ])

  assert.strictEqual(persistedConstraint, firstConstraint)
  assert.strictEqual(persistedConstraint.depth, 0.008)
  assert.deepStrictEqual(persistedConstraint.point.toArray(), [0.1, 0, 0])
  assert.strictEqual(
    persistedConstraint.accumulatedNormalImpulseNewtonSeconds,
    4.25
  )
  assert.strictEqual(
    persistedConstraint.accumulatedFrictionImpulseTangent1NewtonSeconds,
    0.75
  )
  assert.strictEqual(persistedConstraint.ageSteps, 2)
  assert.strictEqual(cache.size, 1)
})

test('active contacts are returned in deterministic contact-key order', () => {
  const cache = createContactCache()
  const activeContacts = cache.update([
    createCandidate({ featureId: 'sphere-box:outside:face:z+' }),
    createCandidate({ featureId: 'sphere-box:outside:face:x+' }),
  ])

  const contactKeys = activeContacts.map((contact) => contact.contactKey)
  assert.deepStrictEqual(contactKeys, [...contactKeys].sort())
  assert.deepStrictEqual(
    cache.getActiveContacts().map((contact) => contact.contactKey),
    contactKeys
  )
})

test('a contact-feature change replaces the constraint and clears warm-start state', () => {
  const cache = createContactCache()
  const [oldConstraint] = cache.update([createCandidate()])
  const oldContactKey = oldConstraint.contactKey
  oldConstraint.accumulatedNormalImpulseNewtonSeconds = 9

  const [newConstraint] = cache.update([
    createCandidate({ featureId: 'sphere-box:outside:edge:x+,y+' }),
  ])

  assert.notStrictEqual(newConstraint, oldConstraint)
  assert.strictEqual(newConstraint.accumulatedNormalImpulseNewtonSeconds, 0)
  assert.strictEqual(newConstraint.ageSteps, 1)
  assert.strictEqual(cache.size, 1)
  assert.strictEqual(cache.get(oldContactKey), null)
})

test('a contact body-pair change replaces the constraint and clears warm-start state', () => {
  const cache = createContactCache()
  const [oldConstraint] = cache.update([createCandidate()])
  oldConstraint.accumulatedNormalImpulseNewtonSeconds = 7

  const [newConstraint] = cache.update([
    createCandidate({ bodyBId: 'replacement-static-body' }),
  ])

  assert.notStrictEqual(newConstraint, oldConstraint)
  assert.strictEqual(newConstraint.accumulatedNormalImpulseNewtonSeconds, 0)
  assert.strictEqual(newConstraint.bodyBId, 'replacement-static-body')
  assert.strictEqual(newConstraint.ageSteps, 1)
})

test('a contact absent from the next generation is evicted', () => {
  const cache = createContactCache()
  const [constraint] = cache.update([createCandidate()])

  assert.strictEqual(cache.size, 1)
  assert.deepStrictEqual(cache.update([]), [])
  assert.strictEqual(cache.size, 0)
  assert.strictEqual(cache.get(constraint.contactKey), null)
})

test('contact keys use stable identities and preserve A-to-B ordering', () => {
  const candidate = createCandidate({ bodyAId: undefined })
  const expectedKey = createContactKey(DYNAMIC_BODY_ID, STATIC_BODY_ID, STATIC_GROUND_FEATURE_ID)

  assert.strictEqual(resolveContactKey(candidate), expectedKey)
  assert.notStrictEqual(
    createContactKey(STATIC_BODY_ID, DYNAMIC_BODY_ID, STATIC_GROUND_FEATURE_ID),
    expectedKey
  )
})

test('a rigid body contact identity remains stable across resets', () => {
  const body = createRigidBody({ contactId: 'replay-sphere' })

  resetRigidBody(body, { positionMeters: [1, 2, 3] })
  assert.strictEqual(body.contactId, 'replay-sphere')

  resetRigidBody(body, { contactId: 'replacement-sphere' })
  assert.strictEqual(body.contactId, 'replacement-sphere')
})
