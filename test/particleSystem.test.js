// test/particleSystem.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createParticleSystem } from '../src/effects/createParticleSystem.js'

function build(seed = 12345) {
  const ps = createParticleSystem({ maxParticles: 100, seed })
  ps.emit('debris', 0, 0, 0, 8)
  for (let i = 0; i < 30; i += 1) ps.step(1 / 60)
  return ps
}

test('emit increases active and emitted counts', () => {
  const ps = createParticleSystem({ maxParticles: 100 })
  ps.emit('dust', 1, 0, 1, 5)
  const snap = ps.getSnapshot()
  assert.equal(snap.emittedCount, 5)
  assert.ok(snap.activeCount > 0)
  assert.equal(snap.maxParticles, 100)
})

test('particle life decays and the particle dies after its lifetime', () => {
  const ps = createParticleSystem({ maxParticles: 100, seed: 1 })
  ps.emit('dust', 0, 0, 0, 1)
  assert.equal(ps.getSnapshot().activeCount, 1)
  // Step well past the dust lifetime (~1.4s).
  for (let i = 0; i < 200; i += 1) ps.step(1 / 60)
  assert.equal(ps.getSnapshot().activeCount, 0)
})

test('stepping is deterministic for identical emit/step sequences', () => {
  const a = build()
  const b = build()
  assert.equal(a.getSnapshot().emittedCount, b.getSnapshot().emittedCount)
  assert.equal(a.getSnapshot().activeCount, b.getSnapshot().activeCount)

  const arrA = a.object3D.geometry.attributes.position.array
  const arrB = b.object3D.geometry.attributes.position.array
  assert.deepEqual(Array.from(arrA.slice(0, 12)), Array.from(arrB.slice(0, 12)))
})

test('round-robin pool is bounded; emitting past capacity overwrites oldest', () => {
  const ps = createParticleSystem({ maxParticles: 10 })
  ps.emit('dust', 0, 0, 0, 50) // more than capacity
  const snap = ps.getSnapshot()
  assert.equal(snap.activeCount, 10, 'active count capped at capacity')
  assert.equal(snap.emittedCount, 50)
})

test('reset clears all particles', () => {
  const ps = createParticleSystem({ maxParticles: 100 })
  ps.emit('dust', 0, 0, 0, 10)
  ps.step(1 / 60)
  ps.reset()
  const snap = ps.getSnapshot()
  assert.equal(snap.activeCount, 0)
  assert.equal(snap.emittedCount, 0)
})

test('unknown particle kind is ignored', () => {
  const ps = createParticleSystem({ maxParticles: 100 })
  ps.emit('not-a-kind', 0, 0, 0, 5)
  assert.equal(ps.getSnapshot().emittedCount, 0)
})