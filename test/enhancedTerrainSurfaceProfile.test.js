// test/enhancedTerrainSurfaceProfile.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createEnhancedTerrainSurfaceProfile,
  createOffroadPlaygroundProfile,
} from '../src/terrain/createEnhancedTerrainSurfaceProfile.js'

test('enhanced profile resolves friction from the catalog by surface kind', () => {
  const profile = createEnhancedTerrainSurfaceProfile({
    surfaceRegions: [
      { kind: 'ice', minXMeters: -10, maxXMeters: 10, minZMeters: -10, maxZMeters: 10 },
    ],
  })
  const surface = profile.querySurfaceAtWorldPosition(0, 0)
  assert.equal(surface.surfaceKind, 'ice')
  // Catalog ice friction is 0.1.
  assert.ok(Math.abs(surface.frictionCoefficient - 0.1) < 1e-9, 'ice friction from catalog')
  assert.ok(Number.isFinite(surface.dampingCoefficient))
  assert.ok(Number.isFinite(surface.rollingResistanceCoefficient))
})

test('offroad playground profile exposes finite bounded heights', () => {
  const profile = createOffroadPlaygroundProfile()
  let maxH = -Infinity
  let minH = Infinity
  let anyBad = false
  for (let x = -100; x <= 100; x += 4) {
    for (let z = -100; z <= 100; z += 4) {
      const h = profile.getHeightAtWorldXZ(x, z)
      if (!Number.isFinite(h)) anyBad = true
      maxH = Math.max(maxH, h)
      minH = Math.min(minH, h)
    }
  }
  assert.ok(!anyBad, 'no NaN heights')
  assert.ok(maxH < 20 && minH > -5, 'heights bounded')
  assert.equal(profile.profileName, 'offroad-playground-v1')
})
