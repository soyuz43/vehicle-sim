// test/offroadPlaygroundHeightEvaluator.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createOffroadPlaygroundHeightEvaluator } from '../src/terrain/createEnhancedTerrainSurfaceProfile.js'

test('height evaluator returns finite, bounded heights over the playground', () => {
  const evalH = createOffroadPlaygroundHeightEvaluator({ sizeMeters: 400 })
  let maxH = -Infinity
  let minH = Infinity
  let anyBad = false
  for (let x = -200; x <= 200; x += 5) {
    for (let z = -200; z <= 200; z += 5) {
      const h = evalH(x, z, 0)
      if (!Number.isFinite(h)) anyBad = true
      maxH = Math.max(maxH, h)
      minH = Math.min(minH, h)
    }
  }
  assert.ok(!anyBad, 'no NaN/Infinity heights')
  assert.ok(maxH < 20, 'max height bounded, got ' + maxH)
  assert.ok(minH > -5, 'min height bounded, got ' + minH)
})

test('jump features raise height above the local baseline', () => {
  const evalH = createOffroadPlaygroundHeightEvaluator({ sizeMeters: 400 })
  // Tabletop jump centered at Z = -halfSize + 120 = -80.
  const onJump = evalH(0, -80, 0)
  assert.ok(onJump > 0.5, 'tabletop jump produces positive height, got ' + onJump)
})

test('rock garden zone introduces height variation', () => {
  const evalH = createOffroadPlaygroundHeightEvaluator({ sizeMeters: 400 })
  let minV = Infinity
  let maxV = -Infinity
  for (let x = -30; x <= -5; x += 1) {
    for (let z = -60; z <= -20; z += 1) {
      const h = evalH(x, z, 0)
      minV = Math.min(minV, h)
      maxV = Math.max(maxV, h)
    }
  }
  assert.ok(maxV - minV > 0.05, 'rock garden produces variation, range=' + (maxV - minV))
})
