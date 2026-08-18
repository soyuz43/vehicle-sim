// test/obstacleAwareSurfaceProfile.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTerrainSurfaceProfile } from '../src/terrain/createTerrainSurfaceProfile.js'
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
