import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { testCollision } from '../src/physics/Collision.js'
import { createBox } from '../src/physics/shapes/Box.js'
import { createCapsule } from '../src/physics/shapes/Capsule.js'
import { createSphere } from '../src/physics/shapes/Sphere.js'

function createTransform(x = 0, y = 0, z = 0, orientationQuaternion = new THREE.Quaternion()) {
  return {
    positionMeters: new THREE.Vector3(x, y, z),
    orientationQuaternion,
  }
}

function _capsuleWorldAxis(transform) {
  return new THREE.Vector3(0, 1, 0).applyQuaternion(transform.orientationQuaternion)
}

function assertPointInsideBox(pointWorldMeters, transform, halfExtentsMeters) {
  const pointLocalMeters = pointWorldMeters.clone()
    .sub(transform.positionMeters)
    .applyQuaternion(transform.orientationQuaternion.clone().invert())
  assert.ok(Math.abs(pointLocalMeters.x) <= halfExtentsMeters.x + 1e-12)
  assert.ok(Math.abs(pointLocalMeters.y) <= halfExtentsMeters.y + 1e-12)
  assert.ok(Math.abs(pointLocalMeters.z) <= halfExtentsMeters.z + 1e-12)
}

test('sphere-sphere overlap returns exact normal, depth, and contact point', () => {
  const contact = testCollision(
    createSphere(1), createTransform(), createSphere(1), createTransform(1.5)
  )
  assert.deepStrictEqual(contact.normal.toArray(), [1, 0, 0])
  assert.strictEqual(contact.depth, 0.5)
  assert.deepStrictEqual(contact.point.toArray(), [0.75, 0, 0])
})

test('spheres touching exactly produce a zero-depth contact', () => {
  const contact = testCollision(
    createSphere(1), createTransform(), createSphere(1), createTransform(2)
  )
  assert.deepStrictEqual(contact.normal.toArray(), [1, 0, 0])
  assert.strictEqual(contact.depth, 0)
  assert.deepStrictEqual(contact.point.toArray(), [1, 0, 0])
})

test('separated spheres do not collide', () => {
  assert.strictEqual(
    testCollision(createSphere(1), createTransform(), createSphere(1), createTransform(2.01)),
    null
  )
})

test('sphere-box overlap returns a world-space point on the box', () => {
  const box = createBox(new THREE.Vector3(1, 1, 1))
  const contact = testCollision(createSphere(1), createTransform(1.5), box, createTransform())
  assert.deepStrictEqual(contact.normal.toArray(), [-1, 0, 0])
  assert.strictEqual(contact.depth, 0.5)
  assert.deepStrictEqual(contact.point.toArray(), [1, 0, 0])
})

test('box-sphere dispatch reverses the normal to preserve A-to-B direction', () => {
  const contact = testCollision(
    createBox(new THREE.Vector3(1, 1, 1)), createTransform(),
    createSphere(1), createTransform(1.5)
  )
  assert.deepStrictEqual(contact.normal.toArray(), [1, 0, 0])
  assert.strictEqual(contact.depth, 0.5)
})

test('sphere-box separation returns null', () => {
  assert.strictEqual(
    testCollision(
      createSphere(0.5), createTransform(2),
      createBox(new THREE.Vector3(1, 1, 1)), createTransform()
    ),
    null
  )
})

test('sphere-box uses the box orientation for closest-point calculation', () => {
  const orientation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0), Math.PI / 2
  )
  const box = createBox(new THREE.Vector3(2, 0.5, 0.5))
  const contact = testCollision(
    createSphere(0.5), createTransform(0, 0, -2.25),
    box, createTransform(0, 0, 0, orientation)
  )
  assert.ok(Math.abs(contact.depth - 0.25) < 1e-12)
  assert.ok(Math.abs(contact.normal.x) < 1e-12)
  assert.ok(Math.abs(contact.normal.y) < 1e-12)
  assert.ok(Math.abs(contact.normal.z - 1) < 1e-12)
})

test('sphere-capsule overlap uses the closest point on its Y-axis segment', () => {
  const contact = testCollision(
    createSphere(0.5), createTransform(0.75),
    createCapsule(0.5, 1), createTransform()
  )
  assert.deepStrictEqual(contact.normal.toArray(), [-1, 0, 0])
  assert.strictEqual(contact.depth, 0.25)
  assert.deepStrictEqual(contact.point.toArray(), [0.375, 0, 0])
})

test('capsule-sphere dispatch reverses the normal', () => {
  const contact = testCollision(
    createCapsule(0.5, 1), createTransform(),
    createSphere(0.5), createTransform(0.75)
  )
  assert.deepStrictEqual(contact.normal.toArray(), [1, 0, 0])
  assert.strictEqual(contact.depth, 0.25)
})

test('separated sphere-capsule pair returns null', () => {
  assert.strictEqual(
    testCollision(
      createSphere(0.5), createTransform(2),
      createCapsule(0.5, 1), createTransform()
    ),
    null
  )
})

test('parallel capsules return a deterministic closest-segment contact', () => {
  const contact = testCollision(
    createCapsule(0.5, 2), createTransform(),
    createCapsule(0.5, 2), createTransform(0.75)
  )
  assert.deepStrictEqual(contact.normal.toArray(), [1, 0, 0])
  assert.strictEqual(contact.depth, 0.25)
  assert.deepStrictEqual(contact.point.toArray(), [0.375, -2, 0])
})

test('crossing capsules use the perpendicular separation direction', () => {
  const transformA = createTransform()
  const transformB = createTransform(0, 0, 0, new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0), Math.PI / 2
  ))
  const contact = testCollision(
    createCapsule(0.5, 2), transformA,
    createCapsule(0.5, 2), transformB
  )
  assert.deepStrictEqual(contact.normal.toArray(), [1, 0, 0])
  assert.strictEqual(contact.depth, 1)
  assert.strictEqual(contact.normal.dot(_capsuleWorldAxis(transformA)), 0)
  assert.ok(Math.abs(contact.normal.dot(_capsuleWorldAxis(transformB))) < 1e-15)
})

test('coincident parallel capsules retain the deterministic fallback normal', () => {
  const contact = testCollision(
    createCapsule(0.5, 2), createTransform(),
    createCapsule(0.5, 2), createTransform()
  )
  assert.deepStrictEqual(contact.normal.toArray(), [0, 0, -1])
  assert.strictEqual(contact.depth, 1)
})

test('separated parallel capsules do not collide', () => {
  assert.strictEqual(
    testCollision(
      createCapsule(0.5, 2), createTransform(),
      createCapsule(0.5, 2), createTransform(1.01)
    ),
    null
  )
})

test('box-box overlap returns the minimum-penetration axis and contact point', () => {
  const box = createBox(new THREE.Vector3(1, 1, 1))
  const contact = testCollision(box, createTransform(), box, createTransform(1.5))
  assert.deepStrictEqual(contact.normal.toArray(), [1, 0, 0])
  assert.strictEqual(contact.depth, 0.5)
  assert.deepStrictEqual(contact.point.toArray(), [0.75, 0, 0])
})

test('face-to-face boxes touching exactly return a zero-depth contact', () => {
  const box = createBox(new THREE.Vector3(1, 1, 1))
  const contact = testCollision(box, createTransform(), box, createTransform(2))
  assert.deepStrictEqual(contact.normal.toArray(), [1, 0, 0])
  assert.strictEqual(contact.depth, 0)
  assert.deepStrictEqual(contact.point.toArray(), [1, 0, 0])
})

test('contained boxes use a contact point in their shared volume', () => {
  const contact = testCollision(
    createBox(new THREE.Vector3(1, 1, 1)), createTransform(),
    createBox(new THREE.Vector3(2, 2, 2)), createTransform()
  )
  assert.deepStrictEqual(contact.normal.toArray(), [1, 0, 0])
  assert.strictEqual(contact.depth, 3)
  assert.deepStrictEqual(contact.point.toArray(), [0, 0, 0])
})

test('box-box face contact point remains within the shared face area', () => {
  const contact = testCollision(
    createBox(new THREE.Vector3(1, 1, 1)), createTransform(),
    createBox(new THREE.Vector3(1, 0.25, 0.25)), createTransform(2)
  )
  assert.deepStrictEqual(contact.point.toArray(), [1, 0, 0])
  assert.ok(Math.abs(contact.point.y) <= 0.25)
  assert.ok(Math.abs(contact.point.z) <= 0.25)
})

test('separated boxes do not collide', () => {
  const box = createBox(new THREE.Vector3(1, 1, 1))
  assert.strictEqual(testCollision(box, createTransform(), box, createTransform(2.01)), null)
})

test('sphere inside a box selects the nearest face deterministically', () => {
  const contact = testCollision(
    createSphere(0.25), createTransform(0.5),
    createBox(new THREE.Vector3(1, 1, 1)), createTransform()
  )
  assert.deepStrictEqual(contact.normal.toArray(), [-1, 0, 0])
  assert.strictEqual(contact.depth, 0.75)
  assert.deepStrictEqual(contact.point.toArray(), [1, 0, 0])
})

test('sphere inside a translated box uses local containment despite roundoff', () => {
  const contact = testCollision(
    createSphere(0.25), createTransform(0.3),
    createBox(new THREE.Vector3(1, 1, 1)), createTransform(1)
  )
  assert.deepStrictEqual(contact.normal.toArray(), [1, 0, 0])
  assert.strictEqual(contact.depth, 0.55)
  assert.deepStrictEqual(contact.point.toArray(), [0, 0, 0])
})

test('rotated box face contacts remain inside both boxes', () => {
  const orientationQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.2, 0.2))
  const positionMeters = new THREE.Vector3(-1.5, 0, -0.5)
  const halfExtentsMeters = new THREE.Vector3(1, 0.25, 0.3)
  const contact = testCollision(
    createBox(halfExtentsMeters), createTransform(),
    createBox(halfExtentsMeters), {
      positionMeters,
      orientationQuaternion,
    }
  )
  assertPointInsideBox(contact.point, createTransform(), halfExtentsMeters)
  assertPointInsideBox(contact.point, { positionMeters, orientationQuaternion }, halfExtentsMeters)
})

test('box-box edge contacts use points on the closest edge features', () => {
  const orientationQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.2, 0.2))
  const positionMeters = new THREE.Vector3(-1, -0.5, -0.5)
  const halfExtentsMeters = new THREE.Vector3(1, 0.25, 0.3)
  const contact = testCollision(
    createBox(halfExtentsMeters), createTransform(),
    createBox(halfExtentsMeters), { positionMeters, orientationQuaternion }
  )
  const boxAxesA = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ]
  const boxAxesB = boxAxesA.map(axis => axis.clone().applyQuaternion(orientationQuaternion))
  assert.ok(boxAxesA.every(axis => Math.abs(axis.dot(contact.normal)) < 0.9))
  assert.ok(boxAxesB.every(axis => Math.abs(axis.dot(contact.normal)) < 0.9))
  assertPointInsideBox(contact.point, createTransform(), halfExtentsMeters)
  assertPointInsideBox(contact.point, { positionMeters, orientationQuaternion }, halfExtentsMeters)
})

test('box-box SAT rejects a pair separated only along a cross-product axis', () => {
  const boxA = createBox(new THREE.Vector3(1, 0.25, 0.3))
  const boxB = createBox(new THREE.Vector3(1, 0.25, 0.3))
  const orientationA = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.4, 0.2))
  const orientationB = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0.6, -0.3))
  assert.strictEqual(
    testCollision(
      boxA, createTransform(0, 0, 0, orientationA),
      boxB, createTransform(-1.5, -0.9, 0.2, orientationB)
    ),
    null
  )
})

test('shape definitions retain their optional world-transform reference', () => {
  const worldTransform = createTransform(3, 4, 5)
  assert.strictEqual(createSphere(1, worldTransform).worldTransform, worldTransform)
  assert.strictEqual(createCapsule(1, 2, worldTransform).worldTransform, worldTransform)
  assert.strictEqual(
    createBox(new THREE.Vector3(1, 2, 3), worldTransform).worldTransform,
    worldTransform
  )
})

test('shape dimensions expose SI units in their field names', () => {
  const sphere = createSphere(1)
  const capsule = createCapsule(1, 2)
  const halfExtentsMeters = new THREE.Vector3(1, 2, 3)
  const box = createBox(halfExtentsMeters)
  assert.strictEqual(sphere.radiusMeters, 1)
  assert.strictEqual(capsule.radiusMeters, 1)
  assert.strictEqual(capsule.halfHeightMeters, 2)
  assert.strictEqual(box.halfExtentsMeters, halfExtentsMeters)
  assert.strictEqual('radius' in sphere, false)
  assert.strictEqual('halfHeight' in capsule, false)
  assert.strictEqual('halfExtents' in box, false)
})

test('unsupported capsule-box pairs fail explicitly instead of appearing separated', () => {
  assert.throws(
    () => testCollision(
      createCapsule(1, 1), createTransform(),
      createBox(new THREE.Vector3(1, 1, 1)), createTransform()
    ),
    /Unsupported collision pair: capsule vs box/
  )
})
