// test/obstacleFieldVisuals.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMovableObstacleField } from '../src/terrain/obstacles/createMovableObstacleField.js'
import { createObstacleFieldVisuals } from '../src/terrain/obstacles/createObstacleFieldVisuals.js'

const CONTACT_EMISSIVE_INTENSITY = 0.7

function createVisuals() {
  const field = createMovableObstacleField({
    obstacles: [
      {
        id: 'dome-1',
        shape: 'dome',
        centerXMeters: 0,
        centerZMeters: 0,
        radiusMeters: 1,
        surfaceKind: 'rock',
      },
      {
        id: 'box-1',
        shape: 'box',
        centerXMeters: 6,
        centerZMeters: 0,
        halfExtentXMeters: 0.5,
        halfExtentZMeters: 0.5,
        heightMeters: 0.5,
        surfaceKind: 'concrete',
      },
    ],
  })
  return { field, visuals: createObstacleFieldVisuals(field) }
}

function emissiveIntensityById(visuals) {
  const intensities = {}
  for (const entry of visuals.meshes) {
    intensities[entry.obstacle.id] = entry.mesh.material.emissiveIntensity
  }
  return intensities
}

test('a wheel contact inside an obstacle footprint raises its emissive highlight', () => {
  const { visuals } = createVisuals()

  visuals.updateContactVisuals([{ x: 0, y: 0, z: 0 }])

  const intensities = emissiveIntensityById(visuals)
  assert.equal(intensities['dome-1'], CONTACT_EMISSIVE_INTENSITY)
  assert.equal(intensities['box-1'], 0)
})

test('the contact highlight follows the obstacle footprint of a box', () => {
  const { visuals } = createVisuals()

  visuals.updateContactVisuals([{ x: 6, y: 0, z: 0 }])

  const intensities = emissiveIntensityById(visuals)
  assert.equal(intensities['box-1'], CONTACT_EMISSIVE_INTENSITY)
  assert.equal(intensities['dome-1'], 0)
})

test('the contact highlight clears once the wheels leave the obstacle', () => {
  const { visuals } = createVisuals()

  visuals.updateContactVisuals([{ x: 0, y: 0, z: 0 }])
  visuals.updateContactVisuals([{ x: 30, y: 0, z: 30 }])

  const intensities = emissiveIntensityById(visuals)
  assert.equal(intensities['dome-1'], 0)
  assert.equal(intensities['box-1'], 0)
})

test('the contact highlight follows a moved obstacle to its live position', () => {
  const { field, visuals } = createVisuals()
  const obstacle = field.getObstacleById('box-1')
  const startingXMeters = obstacle.position.x

  // Push the box well clear of its own footprint. No terrain height function
  // is supplied, so the step does not apply ground friction.
  field.applyImpulseToObstacle('box-1', 12000, 0, 0, startingXMeters, 0)
  field.stepMovableObstacles(0.5)
  const movedXMeters = field.getObstacleById('box-1').position.x
  assert.ok(
    movedXMeters > startingXMeters + 1,
    'the box did not move clear of its footprint, moved to ' + movedXMeters
  )

  visuals.updateContactVisuals([{ x: movedXMeters, y: 0, z: 0 }])

  const intensities = emissiveIntensityById(visuals)
  assert.equal(intensities['box-1'], CONTACT_EMISSIVE_INTENSITY)
  assert.equal(intensities['dome-1'], 0)
})
