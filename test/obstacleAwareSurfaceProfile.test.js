// test/obstacleAwareSurfaceProfile.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTerrainSurfaceProfile } from '../src/terrain/createTerrainSurfaceProfile.js'
import { createOffroadPlaygroundProfile } from '../src/terrain/createEnhancedTerrainSurfaceProfile.js'
import { createObstacleField } from '../src/terrain/obstacles/createObstacleField.js'
import { createObstacleAwareSurfaceProfile } from '../src/terrain/createObstacleAwareSurfaceProfile.js'

test('obstacle-aware profile overlays obstacle height onto terrain', () => {
  const base = createTerrainSurfaceProfile()
  const field = createObstacleField({
    obstacles: [
      { id: 'd', shape: 'dome', centerXMeters: 0, centerZMeters: 0, radiusMeters: 1, surfaceKind: 'rock' },
    ],
  })
  const profile = createObstacleAwareSurfaceProfile({ baseProfile: base, obstacleField: field })
  const terrainHeight = base.getHeightAtWorldXZ(0, 0)
  const merged = profile.getHeightAtWorldXZ(0, 0)
  assert.ok(merged > terrainHeight, 'obstacle raises height')
  assert.ok(Math.abs(merged - (terrainHeight + 1)) < 1e-9, 'dome center adds radius')
  assert.ok(
    Math.abs(profile.getHeightAtWorldXZ(10, 10) - base.getHeightAtWorldXZ(10, 10)) < 1e-9,
    'outside obstacle equals terrain'
  )
})

test('obstacle-aware query reports obstacle surface kind and friction', () => {
  const base = createTerrainSurfaceProfile()
  const field = createObstacleField({
    obstacles: [
      { id: 'd', shape: 'dome', centerXMeters: 0, centerZMeters: 0, radiusMeters: 1, surfaceKind: 'rock' },
    ],
  })
  const profile = createObstacleAwareSurfaceProfile({ baseProfile: base, obstacleField: field })
  const surface = profile.querySurfaceAtWorldPosition(0, 0)
  assert.equal(surface.surfaceKind, 'rock')
  // Catalog rock friction is 0.85.
  assert.ok(Math.abs(surface.frictionCoefficient - 0.85) < 1e-9, 'rock friction')
  assert.ok(surface.terrainHeightMeters > base.getHeightAtWorldXZ(0, 0))
})

test('obstacle-aware profile exports a normal that matches its own surface query', () => {
  const base = createOffroadPlaygroundProfile({ seed: null, sizeMeters: 400 })
  const profile = createObstacleAwareSurfaceProfile({ baseProfile: base })

  // The trailing edge of the step-up jump on the 400 m off-road course is a
  // genuinely sloped position, so the normal there is not the flat world-up
  // default that the base enhanced profile inherits from its flat base.
  const worldXMeters = 0
  const worldZMeters = -15.5

  const queried = profile.querySurfaceAtWorldPosition(worldXMeters, worldZMeters)
  const exported = profile.calculateNormalAtWorldXZ(worldXMeters, worldZMeters)

  assert.ok(
    Math.abs(queried.normalWorld.x - exported.x) < 1e-12 &&
      Math.abs(queried.normalWorld.y - exported.y) < 1e-12 &&
      Math.abs(queried.normalWorld.z - exported.z) < 1e-12,
    'the exported normal matches the normal the surface query reports, got ' +
      queried.normalWorld.x + ', ' + queried.normalWorld.y + ', ' + queried.normalWorld.z +
      ' vs ' + exported.x + ', ' + exported.y + ', ' + exported.z
  )

  assert.ok(
    exported.y < 0.9,
    'the exported normal is the flat world-up default at a sloped position, got ' + exported.y
  )

  // The slope the query reports is derived from the same normal.
  const slopeRadians = Math.acos(Math.min(1, Math.max(-1, queried.normalWorld.y)))
  assert.ok(
    Math.abs(queried.slopeRadians - slopeRadians) < 1e-12,
    'the reported slope agrees with the reported normal'
  )
})
