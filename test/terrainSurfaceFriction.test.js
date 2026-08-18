// test/terrainSurfaceFriction.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTerrainSurfaceProfile } from '../src/terrain/createTerrainSurfaceProfile.js'
import { createHeightfieldTerrainContactQuery } from '../src/terrain/createHeightfieldTerrainContactQuery.js'
import {
  updateWheelCombinedSlipTireForce,
} from '../src/vehicle/dynamics/combinedSlipTireForceState.js'

function flatWheel(frictionCoefficient, normalForceNewtons = 4000) {
  return {
    isGrounded: true,
    longitudinalSlipRatio: 2.0,
    lateralSlipAngleRadians: 0,
    frictionCoefficient,
    normalForceNewtons,
    tractionLimitNewtons: frictionCoefficient * normalForceNewtons,
    pressureAdjustedLongitudinalTireStiffnessNewtonsPerSlipRatio: 1600,
    pressureAdjustedLateralTireStiffnessNewtonsPerRadian: 6000,
  }
}

test('default profile exposes a single global mu with no per-surface field', () => {
  const profile = createTerrainSurfaceProfile()
  const surface = profile.querySurfaceAtWorldPosition(5, 5)
  assert.equal(surface.frictionCoefficient, 1)
  assert.equal(surface.surfaceKind, 'asphalt-proving-ground')
})

test('surfaceFrictionByKind maps a surface material to its mu', () => {
  const profile = createTerrainSurfaceProfile({
    surfaceFrictionByKind: { 'asphalt-proving-ground': 0.8 },
  })
  const surface = profile.querySurfaceAtWorldPosition(5, 5)
  assert.equal(surface.surfaceKind, 'asphalt-proving-ground')
  assert.equal(surface.frictionCoefficient, 0.8)
})

test('unknown kind falls back to the global default mu', () => {
  const profile = createTerrainSurfaceProfile({
    frictionCoefficient: 1.0,
    surfaceFrictionByKind: { gravel: 0.4 },
  })
  // Default surface kind is not "gravel", so the map does not apply.
  assert.equal(profile.querySurfaceAtWorldPosition(5, 5).frictionCoefficient, 1.0)
})

test('surface region overrides both surface kind and mu', () => {
  const profile = createTerrainSurfaceProfile({
    frictionCoefficient: 1.0,
    surfaceRegions: [
      {
        kind: 'gravel',
        minXMeters: -10,
        maxXMeters: 10,
        minZMeters: -10,
        maxZMeters: 10,
        frictionCoefficient: 0.5,
      },
    ],
  })
  const inside = profile.querySurfaceAtWorldPosition(0, 0)
  assert.equal(inside.surfaceKind, 'gravel')
  assert.equal(inside.frictionCoefficient, 0.5)

  const outside = profile.querySurfaceAtWorldPosition(50, 50)
  assert.equal(outside.surfaceKind, 'asphalt-proving-ground')
  assert.equal(outside.frictionCoefficient, 1.0)
})

test('region without explicit mu consults surfaceFrictionByKind', () => {
  const profile = createTerrainSurfaceProfile({
    frictionCoefficient: 1.0,
    surfaceFrictionByKind: { 'wet-asphalt': 0.3 },
    surfaceRegions: [
      {
        kind: 'wet-asphalt',
        minXMeters: -5,
        maxXMeters: 5,
        minZMeters: -5,
        maxZMeters: 5,
      },
    ],
  })
  const inside = profile.querySurfaceAtWorldPosition(0, 0)
  assert.equal(inside.surfaceKind, 'wet-asphalt')
  assert.equal(inside.frictionCoefficient, 0.3)
})

test('different mu values produce different tire force limits', () => {
  const high = flatWheel(1.0)
  const low = flatWheel(0.5)
  updateWheelCombinedSlipTireForce(high)
  updateWheelCombinedSlipTireForce(low)
  // At heavy longitudinal slip the combined model approaches mu*Fz.
  assert.ok(Math.abs(high.combinedTireForceLimitNewtons - 1.0 * 4000) < 1e-6)
  assert.ok(Math.abs(low.combinedTireForceLimitNewtons - 0.5 * 4000) < 1e-6)
  assert.ok(
    high.combinedTireForceLimitNewtons > low.combinedTireForceLimitNewtons
  )
})

test('mixed-surface tire forces reflect per-contact mu', () => {
  const profile = createTerrainSurfaceProfile({
    frictionCoefficient: 1.0,
    surfaceRegions: [
      {
        kind: 'ice',
        minXMeters: -10,
        maxXMeters: 10,
        minZMeters: -10,
        maxZMeters: 10,
        frictionCoefficient: 0.2,
      },
    ],
  })
  const onIce = profile.querySurfaceAtWorldPosition(0, 0).frictionCoefficient
  const onAsphalt = profile.querySurfaceAtWorldPosition(50, 50).frictionCoefficient
  assert.equal(onIce, 0.2)
  assert.equal(onAsphalt, 1.0)

  const iceWheel = flatWheel(onIce)
  const asphaltWheel = flatWheel(onAsphalt)
  updateWheelCombinedSlipTireForce(iceWheel)
  updateWheelCombinedSlipTireForce(asphaltWheel)
  assert.ok(
    asphaltWheel.combinedTireForceLimitNewtons >
      iceWheel.combinedTireForceLimitNewtons
  )
})

test('per-surface mu flows through the heightfield contact query', () => {
  const query = createHeightfieldTerrainContactQuery({
    surfaceFrictionByKind: { 'asphalt-proving-ground': 0.7 },
  })
  const surface = query.queryAtWorldXZ(5, 5)
  assert.equal(surface.frictionCoefficient, 0.7)
})

test('malformed region/mu configs are ignored and fall back gracefully', () => {
  const profile = createTerrainSurfaceProfile({
    frictionCoefficient: 1.0,
    surfaceFrictionByKind: { gravel: -0.1, sand: 'not-a-number' },
    surfaceRegions: [
      { kind: 123, minXMeters: 0, maxXMeters: 1, minZMeters: 0, maxZMeters: 1 },
      {
        kind: 'gravel',
        minXMeters: 5,
        maxXMeters: 1,
        minZMeters: 0,
        maxZMeters: 1,
      },
    ],
  })
  // No valid regions remain, so the global mu applies everywhere.
  assert.equal(profile.querySurfaceAtWorldPosition(0, 0).frictionCoefficient, 1.0)
})
