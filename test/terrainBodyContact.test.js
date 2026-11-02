// test/terrainBodyContact.test.js

import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCollisionWorld } from '../src/physics/CollisionWorld.js'
import { createRigidBody } from '../src/physics/RigidBody.js'
import { createBox } from '../src/physics/shapes/Box.js'
import { createCapsule } from '../src/physics/shapes/Capsule.js'
import { createSphere } from '../src/physics/shapes/Sphere.js'
import { testTerrainCollision } from '../src/terrain/HeightfieldBodyContact.js'

const FIXED_TIMESTEP_SECONDS = 1 / 120
const TERRAIN_SIZE_METERS = 100

function createTerrainSurfaceProfile({ slope = 0, frictionCoefficient = 1 } = {}) {
  return {
    sizeMeters: TERRAIN_SIZE_METERS,
    halfSizeMeters: TERRAIN_SIZE_METERS * 0.5,
    querySurfaceAtWorldPosition(worldXMeters, worldZMeters, target = {}) {
      target.isWithinBounds =
        Math.abs(worldXMeters) <= TERRAIN_SIZE_METERS * 0.5 &&
        Math.abs(worldZMeters) <= TERRAIN_SIZE_METERS * 0.5
      target.isInsideTerrainBounds = target.isWithinBounds
      target.terrainHeightMeters = slope * worldXMeters
      target.groundHeightMeters = target.terrainHeightMeters
      target.normalWorld ??= new THREE.Vector3()
      target.normalWorld.set(-slope, 1, 0).normalize()
      target.frictionCoefficient = frictionCoefficient
      return target
    },
  }
}

function createWorldWithTerrain(profile) {
  const world = createCollisionWorld({ restitution: 0 })
  world.registerTerrain({ surfaceProfile: profile })
  return world
}

test('a box settles on flat heightfield terrain without falling through', () => {
  const world = createWorldWithTerrain(createTerrainSurfaceProfile())
  const halfExtentsMeters = new THREE.Vector3(0.2, 0.25, 0.2)
  const boxBody = createRigidBody({
    contactId: 'terrain-flat-box',
    positionMeters: [0, 1.5, 0],
    massKg: 2,
    inertiaXKgMeterSquared: 2 * (4 / 3) * (
      halfExtentsMeters.y * halfExtentsMeters.y +
      halfExtentsMeters.z * halfExtentsMeters.z
    ),
    inertiaYKgMeterSquared: 2 * (4 / 3) * (
      halfExtentsMeters.x * halfExtentsMeters.x +
      halfExtentsMeters.z * halfExtentsMeters.z
    ),
    inertiaZKgMeterSquared: 2 * (4 / 3) * (
      halfExtentsMeters.x * halfExtentsMeters.x +
      halfExtentsMeters.y * halfExtentsMeters.y
    ),
  })
  world.registerBody(boxBody, [{
    shape: createBox(halfExtentsMeters),
    positionMeters: [halfExtentsMeters.x, 0, halfExtentsMeters.z],
  }])

  for (let stepIndex = 0; stepIndex < 60; stepIndex += 1) {
    world.step(1 / 60)
  }

  const boxBottomYMeters = boxBody.positionMeters.y - halfExtentsMeters.y
  assert.ok(boxBottomYMeters >= -0.02, 'box penetrated ' + -boxBottomYMeters + ' m')
  assert.ok(boxBottomYMeters <= 0.04, 'box remained ' + boxBottomYMeters + ' m above terrain')
  assert.ok(Math.abs(boxBody.velocityMetersPerSecond.y) < 0.08)
  assert.ok(world.contactCache.size > 0)
  const contact = world.contactCache.getActiveContacts()[0]
  assert.ok(contact.normal.y < -0.99, 'solver contact normal points from box toward terrain')
})

test('a frictionless sphere accelerates down a sloped heightfield', () => {
  const world = createWorldWithTerrain(
    createTerrainSurfaceProfile({ slope: 1, frictionCoefficient: 0 })
  )
  const sphereBody = createRigidBody({
    contactId: 'terrain-slope-sphere',
    positionMeters: [0, 1.2, 0],
    massKg: 1,
  })
  world.registerBody(sphereBody, [createSphere(0.25)])

  for (let stepIndex = 0; stepIndex < 120; stepIndex += 1) {
    world.step(FIXED_TIMESTEP_SECONDS)
  }

  assert.ok(sphereBody.velocityMetersPerSecond.x < -0.5)
  assert.ok(Number.isFinite(sphereBody.positionMeters.x))
  const contact = world.contactCache.getActiveContacts()[0]
  assert.ok(contact, 'sphere retains a terrain contact')
  assert.ok(contact.normal.x > 0 && contact.normal.y < 0)
  assert.ok(Math.abs(contact.normal.x + contact.normal.y) < 1e-6)
})

test('high-friction terrain brings a box to rest on a slope', () => {
  const world = createWorldWithTerrain(
    createTerrainSurfaceProfile({ slope: 1, frictionCoefficient: 5 })
  )
  const halfExtentsMeters = new THREE.Vector3(0.15, 0.15, 0.15)
  const boxBody = createRigidBody({
    contactId: 'terrain-friction-box',
    positionMeters: [0, halfExtentsMeters.y + 0.005, 0],
    massKg: 1,
    inertiaXKgMeterSquared: (4 / 3) * (
      halfExtentsMeters.y * halfExtentsMeters.y +
      halfExtentsMeters.z * halfExtentsMeters.z
    ),
    inertiaYKgMeterSquared: (4 / 3) * (
      halfExtentsMeters.x * halfExtentsMeters.x +
      halfExtentsMeters.z * halfExtentsMeters.z
    ),
    inertiaZKgMeterSquared: (4 / 3) * (
      halfExtentsMeters.x * halfExtentsMeters.x +
      halfExtentsMeters.y * halfExtentsMeters.y
    ),
  })
  world.registerBody(boxBody, [{
    shape: createBox(halfExtentsMeters),
    positionMeters: [-halfExtentsMeters.x, 0, halfExtentsMeters.z],
  }])

  for (let stepIndex = 0; stepIndex < 240; stepIndex += 1) {
    world.step(FIXED_TIMESTEP_SECONDS)
  }

  const contact = world.contactCache.getActiveContacts()[0]
  assert.ok(contact, 'box remains supported by terrain')
  assert.equal(contact.frictionCoefficient, 5)
  assert.ok(
    Math.hypot(
      boxBody.velocityMetersPerSecond.x,
      boxBody.velocityMetersPerSecond.z
    ) < 0.15,
    'box horizontal speed was ' + boxBody.velocityMetersPerSecond.length().toFixed(3) + ' m/s'
  )
  assert.ok(boxBody.angularVelocityRadiansPerSecond.length() < 0.15)
})

test('terrain contact identities stay unique across registration lifecycle', () => {
  const terrain = { surfaceProfile: createTerrainSurfaceProfile() }
  const world = createCollisionWorld()
  const firstTerrainRecord = world.registerTerrain(terrain)
  world.removeTerrain()
  const secondTerrainRecord = world.registerTerrain(terrain)
  assert.notEqual(firstTerrainRecord.body.contactId, secondTerrainRecord.body.contactId)

  const duplicateIdentityBody = createRigidBody({
    contactId: secondTerrainRecord.body.contactId,
  })
  assert.throws(
    () => world.registerBody(duplicateIdentityBody, [createSphere(0.25)]),
    /unique from the registered terrain/
  )
})

test('terrain body contacts select a deterministic box corner and capsule endpoint', () => {
  const terrain = { surfaceProfile: createTerrainSurfaceProfile() }
  const boxContact = testTerrainCollision(
    terrain,
    createBox(new THREE.Vector3(0.5, 0.5, 0.5)),
    {
      positionMeters: new THREE.Vector3(0, 0.4, 0),
      orientationQuaternion: new THREE.Quaternion(),
    }
  )
  assert.equal(boxContact.featureId, 'box:corner:---')

  const capsuleContact = testTerrainCollision(
    terrain,
    createCapsule(0.2, 0.3),
    {
      positionMeters: new THREE.Vector3(0, 0.1, 0),
      orientationQuaternion: new THREE.Quaternion(),
    }
  )
  assert.equal(capsuleContact.featureId, 'capsule:end:-')
  assert.ok(capsuleContact.normal.y > 0.99)
})
