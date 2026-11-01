// test/collisionWorld.test.js

import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createRigidBody } from '../src/physics/RigidBody.js'
import { createBox } from '../src/physics/shapes/Box.js'
import { createSphere } from '../src/physics/shapes/Sphere.js'
import { createCollisionWorld } from '../src/physics/CollisionWorld.js'

const FIXED_TIMESTEP_SECONDS = 1 / 120

test('multi-body sphere impact transfers impulse through the cache', () => {
  const world = createCollisionWorld({
    gravityMetersPerSecondSquared: 0,
    restitution: 0,
    frictionCoefficient: 0,
  })
  const sphereRadiusMeters = 0.1
  const firstBody = createRigidBody({
    contactId: 'cradle-first',
    positionMeters: [0, 0, 0],
    massKg: 1,
  })
  const secondBody = createRigidBody({
    contactId: 'cradle-middle',
    positionMeters: [0.2, 0, 0],
    massKg: 1,
  })
  const thirdBody = createRigidBody({
    contactId: 'cradle-last',
    positionMeters: [0.4, 0, 0],
    massKg: 1,
  })
  firstBody.velocityMetersPerSecond.x = 1

  for (const body of [firstBody, secondBody, thirdBody]) {
    world.registerBody(body, [
      { shape: createSphere(sphereRadiusMeters), positionMeters: [0, 0, 0] },
    ])
  }

  world.step(FIXED_TIMESTEP_SECONDS)

  assert.ok(thirdBody.velocityMetersPerSecond.x > 0.01)
  assert.ok(thirdBody.positionMeters.x > 0.4)
  assert.ok(
    Math.abs(secondBody.positionMeters.x - 0.2) < 0.05,
    `middle sphere moved ${secondBody.positionMeters.x - 0.2} m`
  )
  assert.ok(firstBody.velocityMetersPerSecond.x < 0.5)
})

test('stacked boxes settle above the static floor', () => {
  const world = createCollisionWorld({
    restitution: 0,
    frictionCoefficient: 0.7,
  })
  const halfExtentsMeters = new THREE.Vector3(0.25, 0.25, 0.25)
  const floorBody = createRigidBody({
    contactId: 'stack-floor',
    positionMeters: [0, -0.5, 0],
  })
  floorBody.isStatic = true
  const lowerBody = createRigidBody({
    contactId: 'stack-lower',
    positionMeters: [0, 0.25, 0],
    massKg: 1,
  })
  const middleBody = createRigidBody({
    contactId: 'stack-middle',
    positionMeters: [0, 0.75, 0],
    massKg: 1,
  })
  const upperBody = createRigidBody({
    contactId: 'stack-upper',
    positionMeters: [0, 1.25, 0],
    massKg: 1,
  })

  world.registerBody(floorBody, [
    { shape: createBox(new THREE.Vector3(4, 0.5, 4)), positionMeters: [0, 0, 0] },
  ])
  for (const body of [lowerBody, middleBody, upperBody]) {
    world.registerBody(body, [
      { shape: createBox(halfExtentsMeters), positionMeters: [0, 0, 0] },
    ])
  }

  for (let stepIndex = 0; stepIndex < 120; stepIndex += 1) {
    world.step(FIXED_TIMESTEP_SECONDS)
  }

  assert.ok(lowerBody.positionMeters.y >= 0)
  assert.ok(lowerBody.positionMeters.y < 0.26)
  assert.ok(Math.abs(lowerBody.positionMeters.x) < 0.1)
  assert.ok(Math.abs(lowerBody.positionMeters.z) < 0.1)
  assert.ok(Math.abs(lowerBody.velocityMetersPerSecond.y) < 0.1)
  assert.ok(middleBody.positionMeters.y > lowerBody.positionMeters.y)
  assert.ok(upperBody.positionMeters.y > middleBody.positionMeters.y)
  assert.strictEqual(world.contactCache.size > 0, true)
})

test('non-overlapping collision filters do not generate contacts', () => {
  const world = createCollisionWorld({ gravityMetersPerSecondSquared: 0 })
  const firstBody = createRigidBody({
    contactId: 'filtered-first',
    positionMeters: [-0.05, 0, 0],
  })
  const secondBody = createRigidBody({
    contactId: 'filtered-second',
    positionMeters: [0.05, 0, 0],
  })

  world.registerBody(firstBody, [createSphere(0.1)], 1, 1)
  world.registerBody(secondBody, [createSphere(0.1)], 2, 2)
  world.step(FIXED_TIMESTEP_SECONDS)

  assert.strictEqual(world.contactCache.size, 0)
  assert.strictEqual(firstBody.positionMeters.x, -0.05)
  assert.strictEqual(secondBody.positionMeters.x, 0.05)
})

test('repeat world runs produce byte-identical final states', () => {
  const runScenario = () => {
    const world = createCollisionWorld({
      gravityMetersPerSecondSquared: -9.80665,
      restitution: 0.25,
      frictionCoefficient: 0.4,
    })
    const floorBody = createRigidBody({
      contactId: 'deterministic-floor',
      positionMeters: [0, -0.5, 0],
    })
    floorBody.isStatic = true
    const firstBody = createRigidBody({
      contactId: 'deterministic-first',
      positionMeters: [0, 0.26, 0],
      massKg: 1,
    })
    const secondBody = createRigidBody({
      contactId: 'deterministic-second',
      positionMeters: [0.2, 0.76, 0],
      massKg: 1,
    })
    firstBody.velocityMetersPerSecond.x = 0.3
    firstBody.velocityMetersPerSecond.y = -1

    world.registerBody(floorBody, [
      { shape: createBox(new THREE.Vector3(3, 0.5, 3)), positionMeters: [0, 0, 0] },
    ])
    world.registerBody(firstBody, [createSphere(0.25)])
    world.registerBody(secondBody, [createSphere(0.25)])

    for (let stepIndex = 0; stepIndex < 120; stepIndex += 1) {
      world.step(FIXED_TIMESTEP_SECONDS)
    }

    return JSON.stringify([
      firstBody.positionMeters.toArray(),
      firstBody.velocityMetersPerSecond.toArray(),
      firstBody.orientationQuaternion.toArray(),
      firstBody.angularVelocityRadiansPerSecond.toArray(),
      secondBody.positionMeters.toArray(),
      secondBody.velocityMetersPerSecond.toArray(),
      secondBody.orientationQuaternion.toArray(),
      secondBody.angularVelocityRadiansPerSecond.toArray(),
    ])
  }

  assert.strictEqual(runScenario(), runScenario())
})

test('body ids remain strictly monotonic after removal', () => {
  const world = createCollisionWorld({ gravityMetersPerSecondSquared: 0 })
  const firstBody = createRigidBody({ contactId: 'id-first' })
  const secondBody = createRigidBody({ contactId: 'id-second' })
  const thirdBody = createRigidBody({ contactId: 'id-third' })
  const shape = createSphere(0.1)

  const firstRecord = world.registerBody(firstBody, [shape])
  const secondRecord = world.registerBody(secondBody, [shape])
  world.removeBody(secondBody)
  const thirdRecord = world.registerBody(thirdBody, [shape])

  assert.strictEqual(firstRecord.body.collisionWorldId, 1)
  assert.strictEqual(secondRecord.bodyId, 2)
  assert.strictEqual(thirdRecord.body.collisionWorldId, 3)
})

test('raw static bodies can omit force accumulators and mass', () => {
  const world = createCollisionWorld({ gravityMetersPerSecondSquared: 0 })
  const staticBody = {
    contactId: 'raw-static',
    positionMeters: new THREE.Vector3(0, -0.1, 0),
    orientationQuaternion: new THREE.Quaternion(),
    isStatic: true,
  }

  world.registerBody(staticBody, [createSphere(0.1)])

  assert.strictEqual(world.step(FIXED_TIMESTEP_SECONDS), undefined)
})
