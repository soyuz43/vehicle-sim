// test/terrainDeformation.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTerrainDeformation } from '../src/terrain/deformation/createTerrainDeformation.js'
import { createTerrainSurfaceProfile } from '../src/terrain/createTerrainSurfaceProfile.js'
import { createObstacleAwareSurfaceProfile } from '../src/terrain/createObstacleAwareSurfaceProfile.js'
import { createMovableObstacleField } from '../src/terrain/obstacles/createMovableObstacleField.js'
import { SURFACE_MATERIAL_KINDS } from '../src/terrain/createSurfaceMaterialCatalog.js'

test('no deformation initially; offset is zero', () => {
  const d = createTerrainDeformation()
  assert.equal(d.getHeightOffsetAtWorldXZ(0, 0), 0)
  assert.equal(d.getActiveBounds(), null)
  assert.equal(d.getSnapshot().activeCellCount, 0)
})

test('deformable surface accrues a depression at the contact', () => {
  const d = createTerrainDeformation()
  const wheel = { isGrounded: true, surfaceKind: SURFACE_MATERIAL_KINDS.MUD, suspensionNormalForceNewtons: 4000, contactPointWorldPosition: { x: 3, y: 0, z: 4 } }
  d.accrueFromWheelContacts([wheel], 5)
  d.step(1 / 60)
  const offset = d.getHeightOffsetAtWorldXZ(3, 4)
  assert.ok(offset < 0, 'depression is negative')
  assert.ok(offset >= -d.maxDepthMeters - 1e-9, 'within max depth')
})

test('rigid surface (rock) deforms negligibly', () => {
  const d = createTerrainDeformation()
  const wheel = { isGrounded: true, surfaceKind: SURFACE_MATERIAL_KINDS.ROCK, suspensionNormalForceNewtons: 4000, contactPointWorldPosition: { x: 3, y: 0, z: 4 } }
  d.accrueFromWheelContacts([wheel], 5)
  d.step(1 / 60)
  const rockDepth = -d.getHeightOffsetAtWorldXZ(3, 4)
  assert.ok(rockDepth >= 0 && rockDepth < 0.001, 'rock is effectively rigid')
})

test('depression increases with load and motion, clamped to max depth', () => {
  const d = createTerrainDeformation({ maxDepthMeters: 0.25 })
  const light = { isGrounded: true, surfaceKind: SURFACE_MATERIAL_KINDS.SAND, suspensionNormalForceNewtons: 1000, contactPointWorldPosition: { x: 0, y: 0, z: 0 } }
  d.accrueFromWheelContacts([light], 1)
  d.step(1 / 60)
  const lightDepth = -d.getHeightOffsetAtWorldXZ(0, 0)

  const heavy = { isGrounded: true, surfaceKind: SURFACE_MATERIAL_KINDS.SAND, suspensionNormalForceNewtons: 8000, contactPointWorldPosition: { x: 5, y: 0, z: 0 }, isDriveWheelSpinning: true }
  d.accrueFromWheelContacts([heavy], 8)
  d.step(1 / 60)
  const heavyDepth = -d.getHeightOffsetAtWorldXZ(5, 0)

  assert.ok(heavyDepth > lightDepth, 'heavier/faster deforms more')
  assert.ok(heavyDepth <= 0.25 + 1e-9, 'clamped to max depth')
})

test('bilinear offset is smooth between cells', () => {
  const d = createTerrainDeformation({ cellSizeMeters: 2 })
  const wheel = { isGrounded: true, surfaceKind: SURFACE_MATERIAL_KINDS.MUD, suspensionNormalForceNewtons: 4000, contactPointWorldPosition: { x: 0, y: 0, z: 0 } }
  d.accrueFromWheelContacts([wheel], 5)
  d.step(1 / 60)
  const atCenter = d.getHeightOffsetAtWorldXZ(0, 0)
  const midway = d.getHeightOffsetAtWorldXZ(1, 0)
  const far = d.getHeightOffsetAtWorldXZ(20, 0)
  // atCenter is negative (depression); midway interpolates toward 0; far is 0.
  assert.ok(midway <= far + 1e-9 && midway >= atCenter - 1e-9, 'bilinear between center and far')
  assert.ok(far === 0, 'no deformation far away')
})

test('unloaded depression recovers toward zero and prunes', () => {
  const d = createTerrainDeformation({ recoveryRatePerSecond: 1.0 })
  const wheel = { isGrounded: true, surfaceKind: SURFACE_MATERIAL_KINDS.MUD, suspensionNormalForceNewtons: 4000, contactPointWorldPosition: { x: 0, y: 0, z: 0 } }
  d.accrueFromWheelContacts([wheel], 5)
  d.step(1 / 60)
  const peaked = -d.getHeightOffsetAtWorldXZ(0, 0)
  for (let i = 0; i < 600; i += 1) d.step(1 / 60) // no accrue -> recover
  const recovered = -d.getHeightOffsetAtWorldXZ(0, 0)
  assert.ok(recovered < peaked, 'healed')
  assert.ok(d.getActiveBounds() === null || recovered < 1e-3, 'pruned or near zero')
})

test('deformation feeds back into the surface profile height', () => {
  const base = createTerrainSurfaceProfile({ sizeMeters: 64, profileName: 'flat' })
  const field = createMovableObstacleField({ obstacles: [] })
  const deformation = createTerrainDeformation({
    minXMeters: -32, maxXMeters: 32, minZMeters: -32, maxZMeters: 32, cellSizeMeters: 2,
  })
  const wheel = { isGrounded: true, surfaceKind: SURFACE_MATERIAL_KINDS.MUD, suspensionNormalForceNewtons: 4000, contactPointWorldPosition: { x: 0, y: 0, z: 0 } }
  deformation.accrueFromWheelContacts([wheel], 5)
  deformation.step(1 / 60)

  const profile = createObstacleAwareSurfaceProfile({ baseProfile: base, obstacleField: field, deformationField: deformation })
  const baseHeight = base.getHeightAtWorldXZ(0, 0)
  const merged = profile.getHeightAtWorldXZ(0, 0)
  assert.ok(merged < baseHeight, 'deformation lowers merged height')

  const surface = profile.querySurfaceAtWorldPosition(0, 0)
  assert.ok(surface.terrainHeightMeters < baseHeight, 'query reflects deformation')
  assert.equal(surface.obstacleId, null)
  assert.equal(surface.isObstacleContact, false)
})

test('deformation is deterministic for identical inputs', () => {
  function run() {
    const d = createTerrainDeformation()
    const wheel = { isGrounded: true, surfaceKind: SURFACE_MATERIAL_KINDS.MUD, suspensionNormalForceNewtons: 4000, contactPointWorldPosition: { x: 1, y: 0, z: 1 } }
    for (let i = 0; i < 10; i += 1) {
      d.accrueFromWheelContacts([wheel], i)
      d.step(1 / 60)
    }
    return d.getHeightOffsetAtWorldXZ(1, 1)
  }
  assert.equal(run(), run())
})