// test/surfaceMaterialCatalog.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SURFACE_MATERIAL_KINDS,
  DEFAULT_SURFACE_MATERIAL_CATALOG,
  getSurfaceMaterial,
  resolveSurfaceFrictionCoefficient,
  resolveSurfaceProperties,
  applySurfaceCondition,
  createSurfaceMaterialCatalog,
} from '../src/terrain/createSurfaceMaterialCatalog.js'

test('catalog defines the ten documented surface kinds', () => {
  const kinds = Object.values(SURFACE_MATERIAL_KINDS)
  assert.ok(kinds.includes('asphalt'))
  assert.ok(kinds.includes('ice'))
  assert.ok(kinds.includes('mud'))
  assert.equal(kinds.length, 10)
})

test('friction coefficients are finite and physically plausible', () => {
  for (const kind of Object.values(SURFACE_MATERIAL_KINDS)) {
    const mu = resolveSurfaceFrictionCoefficient(DEFAULT_SURFACE_MATERIAL_CATALOG, kind)
    assert.ok(Number.isFinite(mu) && mu > 0 && mu <= 1.2, kind + ' mu=' + mu)
  }
  assert.ok(
    resolveSurfaceFrictionCoefficient(DEFAULT_SURFACE_MATERIAL_CATALOG, 'ice') <
      resolveSurfaceFrictionCoefficient(DEFAULT_SURFACE_MATERIAL_CATALOG, 'asphalt')
  )
})

test('unknown kind falls back to the asphalt material', () => {
  const material = getSurfaceMaterial(DEFAULT_SURFACE_MATERIAL_CATALOG, 'does-not-exist')
  assert.equal(material.kind, SURFACE_MATERIAL_KINDS.ASPHALT)
})

test('surface condition multipliers reduce grip as documented', () => {
  const base = getSurfaceMaterial(DEFAULT_SURFACE_MATERIAL_CATALOG, 'asphalt')
  const wet = applySurfaceCondition(base, 'WET')
  assert.ok(wet.frictionCoefficient < base.frictionCoefficient)
  assert.ok(Math.abs(wet.frictionCoefficient - base.frictionCoefficient * 0.6) < 1e-9)
})

test('resolveSurfaceProperties exposes SI material coefficients', () => {
  const props = resolveSurfaceProperties(DEFAULT_SURFACE_MATERIAL_CATALOG, 'mud')
  assert.ok(Number.isFinite(props.rollingResistanceCoefficient))
  assert.ok(Number.isFinite(props.dampingCoefficient))
  assert.ok(Number.isFinite(props.roughnessRmsMeters))
})

test('createSurfaceMaterialCatalog applies overrides immutably', () => {
  const catalog = createSurfaceMaterialCatalog({ ice: { frictionCoefficient: 0.05 } })
  assert.ok(Math.abs(resolveSurfaceFrictionCoefficient(catalog, 'ice') - 0.05) < 1e-9)
  // The default catalog is unchanged.
  assert.ok(
    Math.abs(resolveSurfaceFrictionCoefficient(DEFAULT_SURFACE_MATERIAL_CATALOG, 'ice') - 0.1) < 1e-9
  )
})
