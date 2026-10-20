// test/tireModelLibrary.test.js
//
// Unit tests for the named tire-compound preset library.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TIRE_PRESETS,
  DEFAULT_TIRE_PRESET_NAME,
  getTirePreset,
  magicFormulaSlideFactor,
} from '../src/vehicle/dynamics/tireModelLibrary.js'

test('getTirePreset falls back to brushFiala for unknown names', () => {
  assert.strictEqual(getTirePreset('nope').name, DEFAULT_TIRE_PRESET_NAME)
  assert.strictEqual(getTirePreset(undefined).name, DEFAULT_TIRE_PRESET_NAME)
  assert.strictEqual(getTirePreset(null).name, DEFAULT_TIRE_PRESET_NAME)
  assert.strictEqual(getTirePreset('street').isMagicFormula, true)
  assert.strictEqual(getTirePreset('brushFiala').isMagicFormula, false)
})

test('every Magic Formula preset carries valid B/C/D/E shape coefficients', () => {
  for (const [name, preset] of Object.entries(TIRE_PRESETS)) {
    if (!preset.isMagicFormula) continue
    for (const axis of ['longitudinal', 'lateral']) {
      const coeffs = preset[axis]
      assert.ok(coeffs && coeffs.b > 0 && coeffs.c > 0, name + '.' + axis)
      assert.ok(Number.isFinite(coeffs.d) && Number.isFinite(coeffs.e), name + '.' + axis + ' de')
    }
  }
})

test('magicFormulaSlideFactor is continuous at the transition and bounded', () => {
  const coeffs = TIRE_PRESETS.street.longitudinal
  assert.ok(Math.abs(magicFormulaSlideFactor(1, coeffs) - 1) < 1e-9)
  const f2 = magicFormulaSlideFactor(2, coeffs)
  const f10 = magicFormulaSlideFactor(10, coeffs)
  assert.ok(f2 <= 1 + 1e-9 && f2 > 0.9, 'factor(2) near peak')
  assert.ok(f10 < f2, 'factor decays with slip')
  assert.ok(f10 > 0.3, 'factor bounded away from zero (no brush artifact)')
  const fBig = magicFormulaSlideFactor(1000, coeffs)
  assert.ok(Number.isFinite(fBig) && fBig > 0.3, 'finite bounded asymptote')
})
