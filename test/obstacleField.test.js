// test/obstacleField.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createObstacleField } from '../src/terrain/obstacles/createObstacleField.js'

test('sample returns null outside any obstacle', () => {
  const field = createObstacleField()
  assert.equal(field.sampleTopSurfaceAtWorldXZ(200, 200), null)
})

test('dome obstacle contributes local height and surface kind', () => {
  const field = createObstacleField({
    obstacles: [
      { id: 'd', shape: 'dome', centerXMeters: 0, centerZMeters: 0, radiusMeters: 1, surfaceKind: 'rock' },
    ],
  })
  const atCenter = field.sampleTopSurfaceAtWorldXZ(0, 0)
  assert.ok(atCenter && atCenter.localHeightMeters > 0, 'center height')
  // Hemisphere dome: center height equals the radius above its base.
  assert.ok(Math.abs(atCenter.localHeightMeters - 1) < 1e-9, 'dome center height = r')
  assert.equal(atCenter.surfaceKind, 'rock')
  assert.equal(field.sampleTopSurfaceAtWorldXZ(5, 0), null)
})

test('box obstacle has flat top height and nulls outside its footprint', () => {
  const field = createObstacleField({
    obstacles: [
      { id: 'b', shape: 'box', centerXMeters: 0, centerZMeters: 0, halfExtentXMeters: 1, halfExtentZMeters: 1, heightMeters: 0.5, surfaceKind: 'concrete' },
    ],
    edgeRampMeters: 0.25,
  })
  const atCenter = field.sampleTopSurfaceAtWorldXZ(0, 0)
  assert.ok(Math.abs(atCenter.localHeightMeters - 0.5) < 1e-9, 'box top height')
  assert.equal(field.sampleTopSurfaceAtWorldXZ(2, 0), null)
})

test('obstacle mass and inertia derive consistently from geometry and density', () => {
  const r = 1
  const rho = 2600
  const field = createObstacleField({
    obstacles: [
      { id: 'dome', shape: 'dome', centerXMeters: 0, centerZMeters: 0, radiusMeters: r, surfaceKind: 'rock' },
    ],
  })
  const dome = field.getObstacles()[0]
  const expectedMass = (2 / 3) * Math.PI * r * r * r * rho
  assert.ok(Math.abs(dome.massKg - expectedMass) < 1e-6, 'dome mass = (2/3) pi r^3 rho')
  assert.ok(Math.abs(dome.inertiaKgMeterSquared - (2 / 5) * expectedMass * r * r) < 1e-6, 'dome inertia')
  assert.ok(dome.frictionCoefficient > 0, 'friction resolved from catalog')
})

test('default obstacle layout is non-empty and well-formed', () => {
  const field = createObstacleField()
  const obstacles = field.getObstacles()
  assert.ok(obstacles.length > 0, 'default layout has obstacles')
  for (const o of obstacles) {
    assert.ok(Number.isFinite(o.massKg) && o.massKg > 0)
    assert.ok(Number.isFinite(o.inertiaKgMeterSquared) && o.inertiaKgMeterSquared > 0)
    assert.ok(Number.isFinite(o.frictionCoefficient) && o.frictionCoefficient > 0)
  }
})
