import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createChassisTerrainSupportState,
  updateChassisTerrainSupportState,
} from '../src/vehicle/dynamics/chassisTerrainSupportState.js'

test('wheel mean height uses corners while bounds and metadata use chassis center', () => {
  const state = createChassisTerrainSupportState()
  const terrainContactQuery = {
    queryAtWorldXZ(worldXMeters, worldZMeters, target) {
      target.isInsideTerrainBounds = worldXMeters > -5
      target.profileName = worldXMeters === 0
        ? 'chassis-center-profile'
        : 'wheel-profile'
      target.surfaceKind = 'asphalt'
      target.slopeDegrees = worldXMeters === 0 ? 2 : 20
      target.terrainHeightMeters = worldXMeters === 0 ? 5 : 1
      target.groundHeightMeters = target.terrainHeightMeters
      target.normalWorld = target.normalWorld ?? {}
      target.normalWorld.x = 0
      target.normalWorld.y = 1
      target.normalWorld.z = 0
    },
  }

  updateChassisTerrainSupportState(state, {
    terrainContactQuery,
    worldXMeters: 0,
    worldZMeters: 0,
    wheelWorldPositions: [
      { x: -10, z: 1.45 },
      { x: -1.25, z: 1.45 },
      { x: 1.25, z: 1.45 },
      { x: 1.25, z: -1.45 },
    ],
    dtSeconds: 1 / 60,
    snapToTarget: true,
  })

  assert.equal(state.isWithinTerrainBounds, true)
  assert.equal(state.profileName, 'chassis-center-profile')
  assert.equal(state.supportSlopeDegrees, 2)
  assert.ok(Math.abs(state.supportTerrainHeightMeters - 1) < 1e-12)
})
