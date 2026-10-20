// test/magicFormulaCombinedSlip.test.js
//
// Unit validation for the Magic Formula tire-compound presets on the
// combined-slip seam. Asserts curve-shape fidelity (rise to peak, bounded
// non-zero asymptote), friction-circle boundedness, and that the brush/Fiala
// baseline is unchanged when its preset is selected.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  updateWheelCombinedSlipTireForce,
} from '../src/vehicle/dynamics/combinedSlipTireForceState.js'
import {
  getTirePreset,
  magicFormulaSlideFactor,
} from '../src/vehicle/dynamics/tireModelLibrary.js'

const MAGIC_PRESETS = ['street', 'sport', 'race', 'lowMu']

function makeWheelState(overrides = {}) {
  return {
    isGrounded: true,
    normalForceNewtons: 4000,
    frictionCoefficient: 1.0,
    longitudinalSlipRatio: 0,
    lateralSlipAngleRadians: 0,
    pressureAdjustedLongitudinalTireStiffnessNewtonsPerSlipRatio: 30000,
    pressureAdjustedLateralTireStiffnessNewtonsPerRadian: 6000,
    ...overrides,
  }
}

function assertForceMagnitudeNear(actualMagnitudeNewtons, expectedMagnitudeNewtons, message) {
  const toleranceNewtons = Math.max(1, expectedMagnitudeNewtons) * 1e-10
  assert.ok(
    Math.abs(actualMagnitudeNewtons - expectedMagnitudeNewtons) <= toleranceNewtons,
    message
  )
}

function getAppliedForceMagnitudeNewtons(wheelState) {
  return Math.hypot(
    wheelState.appliedLongitudinalForceNewtons,
    wheelState.appliedLateralTireForceNewtons
  )
}

function updateWithPreset(wheelState, presetName) {
  updateWheelCombinedSlipTireForce(wheelState, {
    combinedSlipTireModelEnabled: true,
    combinedSlipTirePresetName: presetName,
  })
}

test('brushFiala preset reproduces the original brush floor (baseline preserved)', () => {
  const wheelState = makeWheelState({ longitudinalSlipRatio: 50 })
  updateWheelCombinedSlipTireForce(wheelState, {
    combinedSlipTireModelEnabled: true,
    combinedSlipTirePresetName: 'brushFiala',
  })
  assert.ok(Number.isFinite(wheelState.appliedLongitudinalForceNewtons))
  // Brush model is floored at kineticFrictionFloor * limit (0.65 * 4000).
  assert.ok(Math.abs(wheelState.appliedLongitudinalForceNewtons) <= 4000 * 0.65 + 1)
})

test('Magic Formula presets keep forces finite and within the friction circle', () => {
  for (const presetName of MAGIC_PRESETS) {
    const preset = getTirePreset(presetName)
    const expectedLimit = preset.peakFrictionCoefficient * 4000
    const wheelState = makeWheelState({ longitudinalSlipRatio: 3 })
    updateWheelCombinedSlipTireForce(wheelState, {
      combinedSlipTireModelEnabled: true,
      combinedSlipTirePresetName: presetName,
    })
    const magnitude = Math.hypot(
      wheelState.appliedLongitudinalForceNewtons,
      wheelState.appliedLateralTireForceNewtons
    )
    assert.ok(Number.isFinite(magnitude), presetName + ' finite')
    assert.ok(magnitude <= expectedLimit * 1.001, presetName + ' within circle')
  }
})

test('Magic Formula uses the matching curve for longitudinal and lateral sliding', () => {
  for (const presetName of MAGIC_PRESETS) {
    const preset = getTirePreset(presetName)
    const tractionLimitNewtons = preset.peakFrictionCoefficient * 4000
    const longitudinalSlipRatio = 3
    const longitudinalElasticForceNewtons =
      longitudinalSlipRatio * 30000
    const longitudinalSlip =
      longitudinalElasticForceNewtons / tractionLimitNewtons
    const longitudinalWheelState = makeWheelState({ longitudinalSlipRatio })
    updateWithPreset(longitudinalWheelState, presetName)
    assertForceMagnitudeNear(
      getAppliedForceMagnitudeNewtons(longitudinalWheelState),
      tractionLimitNewtons *
        magicFormulaSlideFactor(longitudinalSlip, preset.longitudinal),
      presetName + ' longitudinal curve'
    )

    const lateralSlipAngleRadians = 1.2
    const lateralElasticForceNewtons =
      6000 * Math.tan(lateralSlipAngleRadians)
    const lateralSlip = lateralElasticForceNewtons / tractionLimitNewtons
    const lateralWheelState = makeWheelState({ lateralSlipAngleRadians })
    updateWithPreset(lateralWheelState, presetName)
    assertForceMagnitudeNear(
      getAppliedForceMagnitudeNewtons(lateralWheelState),
      tractionLimitNewtons * magicFormulaSlideFactor(lateralSlip, preset.lateral),
      presetName + ' lateral curve'
    )
  }
})

test('Magic Formula smoothly blends curves for combined slip', () => {
  for (const presetName of MAGIC_PRESETS) {
    const preset = getTirePreset(presetName)
    const tractionLimitNewtons = preset.peakFrictionCoefficient * 4000
    const longitudinalElasticForceNewtons = 60000
    const lateralElasticForceNewtons = 30000
    const longitudinalSlipRatio = longitudinalElasticForceNewtons / 30000
    const lateralSlipAngleRadians = Math.atan(
      lateralElasticForceNewtons / 6000
    )
    const elasticMagnitudeNewtons = Math.hypot(
      longitudinalElasticForceNewtons,
      lateralElasticForceNewtons
    )
    const normalizedCombinedSlip = elasticMagnitudeNewtons / tractionLimitNewtons
    const expectedSlideFactor =
      (longitudinalElasticForceNewtons ** 2 /
        elasticMagnitudeNewtons ** 2) *
        magicFormulaSlideFactor(normalizedCombinedSlip, preset.longitudinal) +
      (lateralElasticForceNewtons ** 2 / elasticMagnitudeNewtons ** 2) *
        magicFormulaSlideFactor(normalizedCombinedSlip, preset.lateral)
    const wheelState = makeWheelState({
      longitudinalSlipRatio,
      lateralSlipAngleRadians,
    })

    updateWithPreset(wheelState, presetName)

    assertForceMagnitudeNear(
      getAppliedForceMagnitudeNewtons(wheelState),
      tractionLimitNewtons * expectedSlideFactor,
      presetName + ' weighted combined-slip curves'
    )
  }
})

test('Magic Formula presets peak at the friction-circle limit and decay to a bounded asymptote', () => {
  for (const presetName of MAGIC_PRESETS) {
    const preset = getTirePreset(presetName)
    const expectedLimit = preset.peakFrictionCoefficient * 4000
    let peakMagnitude = 0
    let asymptoteMagnitude = 0
    for (let kappa = 0.001; kappa <= 0.5; kappa += 0.001) {
      const ws = makeWheelState({ longitudinalSlipRatio: kappa })
      updateWheelCombinedSlipTireForce(ws, {
        combinedSlipTireModelEnabled: true,
        combinedSlipTirePresetName: presetName,
      })
      const m = Math.hypot(ws.appliedLongitudinalForceNewtons, ws.appliedLateralTireForceNewtons)
      peakMagnitude = Math.max(peakMagnitude, m)
    }
    for (const kappa of [10, 30, 50]) {
      const ws = makeWheelState({ longitudinalSlipRatio: kappa })
      updateWheelCombinedSlipTireForce(ws, {
        combinedSlipTireModelEnabled: true,
        combinedSlipTirePresetName: presetName,
      })
      asymptoteMagnitude = Math.hypot(ws.appliedLongitudinalForceNewtons, ws.appliedLateralTireForceNewtons)
    }
    assert.ok(peakMagnitude >= expectedLimit * 0.95, presetName + ' peak near limit')
    assert.ok(peakMagnitude <= expectedLimit * 1.001, presetName + ' peak within limit')
    assert.ok(asymptoteMagnitude > expectedLimit * 0.2, presetName + ' bounded asymptote')
  }
})

test('Magic Formula presets produce more grip than brush in deep slip (same mu)', () => {
  for (const presetName of MAGIC_PRESETS) {
    const preset = getTirePreset(presetName)
    const mf = makeWheelState({ longitudinalSlipRatio: 0.5 })
    updateWheelCombinedSlipTireForce(mf, {
      combinedSlipTireModelEnabled: true,
      combinedSlipTirePresetName: presetName,
    })
    const brush = makeWheelState({
      longitudinalSlipRatio: 0.5,
      frictionCoefficient: preset.peakFrictionCoefficient,
    })
    updateWheelCombinedSlipTireForce(brush, {
      combinedSlipTireModelEnabled: true,
      combinedSlipTirePresetName: 'brushFiala',
    })
    const mfMag = Math.hypot(mf.appliedLongitudinalForceNewtons, mf.appliedLateralTireForceNewtons)
    const brushMag = Math.hypot(brush.appliedLongitudinalForceNewtons, brush.appliedLateralTireForceNewtons)
    assert.ok(mfMag > brushMag, presetName + ' deeper-slip grip exceeds brush')
  }
})
