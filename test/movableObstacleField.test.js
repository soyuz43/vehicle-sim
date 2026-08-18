// test/movableObstacleField.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMovableObstacleField } from '../src/terrain/obstacles/createMovableObstacleField.js'

test('movable obstacle field initializes with obstacles', () => {
  const field = createMovableObstacleField({
    obstacles: [
      { id: 'test-box', shape: 'box', centerXMeters: 0, centerZMeters: 0, halfExtentXMeters: 0.5, halfExtentZMeters: 0.5, heightMeters: 0.5, surfaceKind: 'concrete' },
    ]
  })
  
  const obstacles = field.getObstacles()
  assert.ok(obstacles.length > 0, 'field has obstacles')
  
  const obstacle = obstacles[0]
  assert.ok(obstacle.isMovable, 'small box is movable')
  assert.ok(obstacle.position, 'obstacle has position')
  assert.ok(obstacle.velocity, 'obstacle has velocity')
})

test('movable obstacle field applies force correctly', () => {
  const field = createMovableObstacleField({
    obstacles: [
      { id: 'test-box', shape: 'box', centerXMeters: 0, centerZMeters: 0, halfExtentXMeters: 0.5, halfExtentZMeters: 0.5, heightMeters: 0.5, surfaceKind: 'concrete' },
    ]
  })
  
  // Apply a force and update
  const force = { x: 100, y: 0, z: 0 }
  const contactPoint = { x: 0.5, y: 0.25, z: 0 }
  field.applyForceToObstacle('test-box', force, contactPoint, 0.1)
  field.update(0.1)
  
  const obstacles = field.getObstacles()
  const obstacle = obstacles[0]
  
  // Check that velocity and position have changed
  assert.ok(obstacle.velocity.x > 0, 'velocity increased in X direction')
  assert.ok(obstacle.position.x > 0, 'position changed in X direction')
})

test('large obstacles are not movable', () => {
  const field = createMovableObstacleField({
    obstacles: [
      { id: 'large-rock', shape: 'dome', centerXMeters: 0, centerZMeters: 0, radiusMeters: 2.0, surfaceKind: 'rock' },
    ]
  })
  
  const obstacles = field.getObstacles()
  const obstacle = obstacles[0]
  assert.ok(!obstacle.isMovable, 'large rock is not movable')
})
