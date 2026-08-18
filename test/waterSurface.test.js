// test/waterSurface.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWaterSurface } from '../src/terrain/water/createWaterSurface.js'

test('water surface returns base level when no waves', () => {
  const water = createWaterSurface({ waterLevelYMeters: -0.5 })
  assert.equal(water.getHeightAtWorldXZ(0, 0), -0.5)
  assert.equal(water.getHeightAtWorldXZ(10, 15), -0.5)
})

test('water surface returns base level for invalid coordinates', () => {
  const water = createWaterSurface({ waterLevelYMeters: -0.5 })
  assert.equal(water.getHeightAtWorldXZ(NaN, 0), -0.5)
  assert.equal(water.getHeightAtWorldXZ(0, Infinity), -0.5)
})

test('water surface calculates buoyant force correctly', () => {
  const water = createWaterSurface()
  // F = rho * g * V = 1000 * 9.80665 * 0.5 = 4903.325
  const force = water.calculateBuoyantForce(0.5)
  assert.ok(Math.abs(force - 4903.325) < 1e-6)
})

test('water surface returns zero buoyant force for invalid volumes', () => {
  const water = createWaterSurface()
  assert.equal(water.calculateBuoyantForce(-1), 0)
  assert.equal(water.calculateBuoyantForce(0), 0)
  assert.equal(water.calculateBuoyantForce(NaN), 0)
})

test('water surface normal is up when no waves', () => {
  const water = createWaterSurface()
  const normal = water.calculateNormalAtWorldXZ(0, 0)
  assert.equal(normal.x, 0)
  assert.equal(normal.y, 1)
  assert.equal(normal.z, 0)
})
