// test/terrainVisualOverhaul.test.js

import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { createTerrain } from '../src/terrain/createTerrain.js'
import { createTerrainSurfaceProfile } from '../src/terrain/createTerrainSurfaceProfile.js'

function createReliefTestProfile() {
  return {
    sizeMeters: 8,
    profileName: 'relief-visual-test',
    surfaceKind: 'dirt',
    getHeightAtWorldXZ(worldXMeters, worldZMeters) {
      return worldXMeters * 0.08 + Math.sin(worldZMeters * 1.1) * 0.35
    },
  }
}

test('terrain mesh maps dips, baseline, and peaks to distinct vertex colors', () => {
  const terrain = createTerrain({
    surfaceProfile: createReliefTestProfile(),
    subdivisions: 16,
  })
  const positions = terrain.geometry.getAttribute('position')
  const colors = terrain.geometry.getAttribute('color')
  let minimumIndex = 0
  let maximumIndex = 0
  let baselineIndex = 0
  let minimumHeightMeters = Number.POSITIVE_INFINITY
  let maximumHeightMeters = Number.NEGATIVE_INFINITY
  let baselineDistanceMeters = Number.POSITIVE_INFINITY

  for (let index = 0; index < positions.count; index += 1) {
    const heightMeters = positions.getY(index)
    if (heightMeters < minimumHeightMeters) {
      minimumHeightMeters = heightMeters
      minimumIndex = index
    }
    if (heightMeters > maximumHeightMeters) {
      maximumHeightMeters = heightMeters
      maximumIndex = index
    }
    if (Math.abs(heightMeters) < baselineDistanceMeters) {
      baselineDistanceMeters = Math.abs(heightMeters)
      baselineIndex = index
    }
  }

  assert.equal(terrain.material.vertexColors, true)
  assert.ok(colors)
  assert.ok(colors.getZ(minimumIndex) > colors.getY(minimumIndex))
  assert.ok(colors.getY(baselineIndex) > colors.getZ(baselineIndex))
  assert.ok(colors.getX(maximumIndex) > colors.getY(baselineIndex))
  assert.equal(
    terrain.userData.terrain.heightRange.minimumHeightMeters,
    minimumHeightMeters
  )
  assert.equal(
    terrain.userData.terrain.heightRange.maximumHeightMeters,
    maximumHeightMeters
  )
  assert.equal(terrain.userData.terrain.heightRange.baselineHeightMeters, 0)
})

test('terrain receives directional shadows and includes a finite contour grid', () => {
  const terrain = createTerrain({
    surfaceProfile: createReliefTestProfile(),
    subdivisions: 16,
  })
  const grid = terrain.getObjectByName('terrain-contour-grid')

  assert.equal(terrain.receiveShadow, true)
  assert.ok(grid instanceof THREE.LineSegments)
  assert.ok(grid.geometry.getAttribute('position').count > 0)
  assert.ok(grid.material.transparent)
  assert.equal(grid.userData.gridSpacingMeters, 4)
  for (const component of grid.geometry.getAttribute('position').array) {
    assert.ok(Number.isFinite(component))
  }
})

test('flat terrain keeps a uniform base-ground color', () => {
  const surfaceProfile = createTerrainSurfaceProfile({
    sizeMeters: 8,
    profileName: 'flat',
  })
  const terrain = createTerrain({ surfaceProfile, subdivisions: 16 })
  const colors = terrain.geometry.getAttribute('color')
  const firstColor = [colors.getX(0), colors.getY(0), colors.getZ(0)]

  for (let index = 1; index < colors.count; index += 1) {
    assert.deepEqual(
      [colors.getX(index), colors.getY(index), colors.getZ(index)],
      firstColor
    )
  }
})
