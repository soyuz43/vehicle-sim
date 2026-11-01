// src/physics/ContactCache.js

import { createContactConstraint } from './ContactSolver.js'

// Reused key-part array so building a contact key does not allocate an
// intermediate array on every step. The serialized key form is unchanged.
const _scratchContactKeyParts = ['', '', '']

// A contact key is ordered because the solver's normal points from body A to
// body B. Reversing the pair would reverse the normal and invalidate the
// previous impulse sign, so pair order is part of the stable identity.
export function createContactKey(bodyAId, bodyBId, featureId) {
  const normalizedBodyAId = normalizeIdentity(bodyAId, 'bodyAId')
  const normalizedBodyBId = normalizeIdentity(bodyBId, 'bodyBId')
  const normalizedFeatureId = normalizeIdentity(featureId, 'featureId')
  if (normalizedBodyAId === normalizedBodyBId) {
    throw new TypeError('A contact body pair must use distinct identities')
  }
  _scratchContactKeyParts[0] = normalizedBodyAId
  _scratchContactKeyParts[1] = normalizedBodyBId
  _scratchContactKeyParts[2] = normalizedFeatureId
  return JSON.stringify(_scratchContactKeyParts)
}

// Resolves the cache key from a contact candidate. The candidate supplies raw
// collision geometry plus stable identities. Static solver bodies may be null,
// so bodyBId can be supplied explicitly when bodyB is null.
export function resolveContactKey(contact) {
  return createContactKey(
    contact?.bodyAId ?? contact?.bodyA?.contactId,
    contact?.bodyBId ?? contact?.bodyB?.contactId,
    contact?.featureId
  )
}

// Owns contact-constraint lifetime. Warm-start acquisition happens while the
// caller generates contacts; commit() runs after position integration and
// replaces the active set, dropping contacts that were not generated this step.
export function createContactCache() {
  // The two maps and the duplicate-key set are reused for the lifetime of the
  // cache. A step fills the pending map; commit() swaps it with the active map
  // and clears the retired one, so no container is allocated per tick.
  let _activeConstraintsByKey = new Map()
  let _pendingConstraintsByKey = new Map()
  let _pendingKeys = new Set()
  let _stepOpen = false
  const _sortedContactKeysScratch = []

  const cache = {
    beginStep() {
      _pendingConstraintsByKey.clear()
      _pendingKeys.clear()
      _stepOpen = true
      return cache
    },

    acquire(contact) {
      if (!_stepOpen) cache.beginStep()
      validateContactCandidate(contact)

      const bodyAId = normalizeIdentity(
        contact.bodyAId ?? contact.bodyA?.contactId,
        'bodyAId'
      )
      const bodyBId = normalizeIdentity(
        contact.bodyBId ?? contact.bodyB?.contactId,
        'bodyBId'
      )
      const featureId = normalizeIdentity(contact.featureId, 'featureId')
      const contactKey = createContactKey(bodyAId, bodyBId, featureId)
      if (_pendingKeys.has(contactKey)) {
        throw new TypeError(`Duplicate contact key in one step: ${contactKey}`)
      }
      _pendingKeys.add(contactKey)

      const existingConstraint = _activeConstraintsByKey.get(contactKey)
      const canReuseExistingConstraint =
        !!existingConstraint &&
        existingConstraint.bodyA === contact.bodyA &&
        existingConstraint.bodyB === contact.bodyB

      if (canReuseExistingConstraint) {
        updateConstraintGeometry(existingConstraint, contact)
        existingConstraint.contactKey = contactKey
        existingConstraint.bodyAId = bodyAId
        existingConstraint.bodyBId = bodyBId
        existingConstraint.featureId = featureId
        existingConstraint.ageSteps += 1
        _pendingConstraintsByKey.set(contactKey, existingConstraint)
        return existingConstraint
      }

      const newConstraint = createContactConstraint(
        contact.bodyA,
        contact.bodyB,
        contact.normal,
        contact.depth,
        contact.point,
        {
          restitution: contact.restitution,
          frictionCoefficient: contact.frictionCoefficient,
        }
      )
      newConstraint.contactKey = contactKey
      newConstraint.bodyAId = bodyAId
      newConstraint.bodyBId = bodyBId
      newConstraint.featureId = featureId
      newConstraint.ageSteps = 1
      _pendingConstraintsByKey.set(contactKey, newConstraint)
      return newConstraint
    },

    commit() {
      if (!_stepOpen) return cache.getActiveContacts()

      const activeConstraints = getSortedConstraints(
        _pendingConstraintsByKey,
        _sortedContactKeysScratch
      )
      const retiredConstraintsByKey = _activeConstraintsByKey
      _activeConstraintsByKey = _pendingConstraintsByKey
      _pendingConstraintsByKey = retiredConstraintsByKey
      _pendingConstraintsByKey.clear()
      _pendingKeys.clear()
      _stepOpen = false
      return activeConstraints
    },

    update(contacts) {
      cache.beginStep()
      if (contacts) {
        for (let contactIndex = 0; contactIndex < contacts.length; contactIndex += 1) {
          cache.acquire(contacts[contactIndex])
        }
      }
      return cache.commit()
    },

    get(contactKey) {
      return _activeConstraintsByKey.get(contactKey) ?? null
    },

    getActiveContacts() {
      return getSortedConstraints(_activeConstraintsByKey, _sortedContactKeysScratch)
    },

    get size() {
      return _activeConstraintsByKey.size
    },

    clear() {
      _activeConstraintsByKey.clear()
      _pendingConstraintsByKey.clear()
      _pendingKeys.clear()
      _stepOpen = false
    },
  }

  return cache
}

function updateConstraintGeometry(constraint, contact) {
  constraint.normal.copy(contact.normal)
  constraint.depth = contact.depth
  constraint.point.copy(contact.point)
  constraint.restitution = contact.restitution
  constraint.frictionCoefficient = contact.frictionCoefficient
}

// The sorted key list is reused across calls. The returned constraint array is
// freshly allocated because callers retain it as the active-contact snapshot.
function getSortedConstraints(constraintsByKey, sortedContactKeysScratch) {
  sortedContactKeysScratch.length = 0
  for (const contactKey of constraintsByKey.keys()) {
    sortedContactKeysScratch.push(contactKey)
  }
  sortedContactKeysScratch.sort()

  const sortedConstraints = new Array(sortedContactKeysScratch.length)
  for (let index = 0; index < sortedContactKeysScratch.length; index += 1) {
    sortedConstraints[index] = constraintsByKey.get(sortedContactKeysScratch[index])
  }
  return sortedConstraints
}

function validateContactCandidate(contact) {
  if (
    !contact ||
    !contact.normal ||
    !contact.point ||
    !Number.isFinite(contact.depth)
  ) {
    throw new TypeError('Contact candidates require finite depth, normal, and point')
  }
}

function normalizeIdentity(identity, fieldName) {
  if (identity === undefined || identity === null) {
    throw new TypeError(`Contact ${fieldName} is required`)
  }
  const normalizedIdentity = String(identity)
  if (normalizedIdentity.length === 0) {
    throw new TypeError(`Contact ${fieldName} must not be empty`)
  }
  return normalizedIdentity
}
