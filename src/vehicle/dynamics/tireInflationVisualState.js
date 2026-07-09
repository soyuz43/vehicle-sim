// src/vehicle/dynamics/tireInflationVisualState.js

import * as THREE from 'three'

export function createTirePressureState(spec) {
  const tirePressureState = {
    tirePressureKpa: spec.defaultTirePressureKpa,
    defaultTirePressureKpa: spec.defaultTirePressureKpa,
    minTirePressureKpa: spec.minTirePressureKpa,
    maxTirePressureKpa: spec.maxTirePressureKpa,
    tireInflationNormalized01: 0,
    visualTireDeflectionRatio: 0,
    visualContactPatchScale: {
      width: 1,
      length: 1,
    },
    inflationVisualLabel: 'normal',
  }

  updateTirePressureState(
    tirePressureState,
    spec.defaultTirePressureKpa,
    spec
  )

  return tirePressureState
}

export function updateTirePressureState(
  tirePressureState,
  nextTirePressureKpa,
  spec
) {
  const tirePressureKpa = sanitizeTirePressureKpa(
    nextTirePressureKpa,
    spec
  )
  const underInflationRatio = calculateUnderInflationRatio(
    tirePressureKpa,
    spec
  )
  const overInflationRatio = calculateOverInflationRatio(
    tirePressureKpa,
    spec
  )

  tirePressureState.tirePressureKpa = tirePressureKpa
  tirePressureState.defaultTirePressureKpa = spec.defaultTirePressureKpa
  tirePressureState.minTirePressureKpa = spec.minTirePressureKpa
  tirePressureState.maxTirePressureKpa = spec.maxTirePressureKpa
  tirePressureState.tireInflationNormalized01 =
    calculateTireInflationNormalized01(tirePressureKpa, spec)
  tirePressureState.visualTireDeflectionRatio =
    underInflationRatio * 0.3 - overInflationRatio * 0.08
  tirePressureState.visualContactPatchScale.width = THREE.MathUtils.clamp(
    1 + underInflationRatio * 0.35 - overInflationRatio * 0.15,
    0.78,
    1.35
  )
  tirePressureState.visualContactPatchScale.length = THREE.MathUtils.clamp(
    1 + underInflationRatio * 0.7 - overInflationRatio * 0.25,
    0.72,
    1.7
  )
  tirePressureState.inflationVisualLabel = getTireInflationVisualLabel(
    underInflationRatio,
    overInflationRatio
  )

  return tirePressureState
}

export function calculateTireInflationNormalized01(tirePressureKpa, spec) {
  const pressureRangeKpa = spec.maxTirePressureKpa - spec.minTirePressureKpa

  if (!Number.isFinite(pressureRangeKpa) || pressureRangeKpa <= 0) return 1

  return THREE.MathUtils.clamp(
    (tirePressureKpa - spec.minTirePressureKpa) / pressureRangeKpa,
    0,
    1
  )
}

function sanitizeTirePressureKpa(nextTirePressureKpa, spec) {
  const tirePressureKpa = Number(nextTirePressureKpa)

  if (!Number.isFinite(tirePressureKpa)) {
    return spec.defaultTirePressureKpa
  }

  return THREE.MathUtils.clamp(
    tirePressureKpa,
    spec.minTirePressureKpa,
    spec.maxTirePressureKpa
  )
}

function calculateUnderInflationRatio(tirePressureKpa, spec) {
  const underPressureRangeKpa =
    spec.defaultTirePressureKpa - spec.minTirePressureKpa

  if (tirePressureKpa >= spec.defaultTirePressureKpa) return 0
  if (!Number.isFinite(underPressureRangeKpa) || underPressureRangeKpa <= 0) {
    return 0
  }

  return THREE.MathUtils.clamp(
    (spec.defaultTirePressureKpa - tirePressureKpa) /
      underPressureRangeKpa,
    0,
    1
  )
}

function calculateOverInflationRatio(tirePressureKpa, spec) {
  const overPressureRangeKpa =
    spec.maxTirePressureKpa - spec.defaultTirePressureKpa

  if (tirePressureKpa <= spec.defaultTirePressureKpa) return 0
  if (!Number.isFinite(overPressureRangeKpa) || overPressureRangeKpa <= 0) {
    return 0
  }

  return THREE.MathUtils.clamp(
    (tirePressureKpa - spec.defaultTirePressureKpa) /
      overPressureRangeKpa,
    0,
    1
  )
}

function getTireInflationVisualLabel(underInflationRatio, overInflationRatio) {
  if (underInflationRatio > 0.05) return 'underinflated-visual'
  if (overInflationRatio > 0.05) return 'overinflated-visual'

  return 'normal-visual'
}