// src/car/tirePressureVisualScales.js

// Pure pressure/load response helpers for visual-only tire deformation. They
// map authoritative wheel state into bounded carcass parameters and never
// mutate physical contact, force, or rolling-radius state.

export const TIRE_PRESSURE_VISUAL_DEFAULTS = Object.freeze({
  visualResponseSeconds: 2,
  loadResponseSeconds: 0.14,
  maximumVisualLoadRatio: 2.2,
  maximumContactFlatteningMeters: 0.115,
  maximumSidewallBulgeMeters: 0.052,
  maximumSevereSidewallBulgeMeters: 0.028,
  maximumLowerSidewallCollapseMeters: 0.065,
  maximumPressureOnlyRadialChangeMeters: 0.018,
  maximumPressureOnlySidewallBulgeMeters: 0.02,
  flatContactPatchScaleWidth: 1.4,
  flatContactPatchScaleLength: 1.7,
  overInflatedContactPatchScaleWidth: 0.94,
  overInflatedContactPatchScaleLength: 0.9,
})

const SETTLE_EPSILON = 0.002

export function createTirePressureVisualConfig(options = {}) {
  const config = { ...TIRE_PRESSURE_VISUAL_DEFAULTS, ...options }

  for (const key of Object.keys(TIRE_PRESSURE_VISUAL_DEFAULTS)) {
    if (!Number.isFinite(config[key])) {
      config[key] = TIRE_PRESSURE_VISUAL_DEFAULTS[key]
    }
  }

  config.visualResponseSeconds = Math.max(config.visualResponseSeconds, 1e-3)
  config.loadResponseSeconds = Math.max(config.loadResponseSeconds, 1e-3)
  config.maximumVisualLoadRatio = clamp(config.maximumVisualLoadRatio, 0.25, 4)
  config.maximumContactFlatteningMeters = clamp(
    config.maximumContactFlatteningMeters,
    0,
    0.14
  )
  config.maximumSidewallBulgeMeters = clamp(
    config.maximumSidewallBulgeMeters,
    0,
    0.065
  )
  config.maximumSevereSidewallBulgeMeters = clamp(
    config.maximumSevereSidewallBulgeMeters,
    0,
    0.04
  )
  config.maximumLowerSidewallCollapseMeters = clamp(
    config.maximumLowerSidewallCollapseMeters,
    0,
    0.075
  )
  config.maximumPressureOnlyRadialChangeMeters = clamp(
    config.maximumPressureOnlyRadialChangeMeters,
    0,
    0.028
  )
  config.maximumPressureOnlySidewallBulgeMeters = clamp(
    config.maximumPressureOnlySidewallBulgeMeters,
    0,
    0.036
  )
  return config
}

export function clamp01(value) {
  if (!Number.isFinite(value)) return 1
  return Math.min(Math.max(value, 0), 1)
}

export function calculateNominalPressureRatio01(pressureState = {}) {
  const minTirePressureKpa = Number(pressureState.minTirePressureKpa)
  const maxTirePressureKpa = Number(pressureState.maxTirePressureKpa)
  const defaultTirePressureKpa = Number(pressureState.defaultTirePressureKpa)
  const pressureRangeKpa = maxTirePressureKpa - minTirePressureKpa

  if (
    !Number.isFinite(minTirePressureKpa) ||
    !Number.isFinite(maxTirePressureKpa) ||
    !Number.isFinite(defaultTirePressureKpa) ||
    pressureRangeKpa <= 0
  ) {
    return 1
  }

  return clamp01(
    (defaultTirePressureKpa - minTirePressureKpa) / pressureRangeKpa
  )
}

// A smooth three-region response: restrained around nominal, progressively
// compliant through moderate underinflation, and strongly collapsed near zero.
export function computeTirePressureVisualScales(
  visualRatio01,
  nominalRatio01,
  config = TIRE_PRESSURE_VISUAL_DEFAULTS
) {
  const pressureRatio01 = clamp01(visualRatio01)
  const nominal = clamp01(nominalRatio01)
  const pressureRatioOfNominal =
    nominal > Number.EPSILON ? pressureRatio01 / nominal : 1
  const visualInflation01 = clamp01(
    (pressureRatio01 - nominal) / Math.max(1 - nominal, Number.EPSILON)
  )
  const severeDeflation01 = 1 - smoothstep(0, 0.55, pressureRatioOfNominal)
  const moderateDeflation01 =
    1 - smoothstep(0.35, 0.85, pressureRatioOfNominal)
  const nominalUnderinflation01 =
    1 - smoothstep(0.82, 0.95, pressureRatioOfNominal)
  const visualDeflation01 = clamp01(
    nominalUnderinflation01 * 0.06 +
      moderateDeflation01 * 0.37 +
      severeDeflation01 * 0.45
  )
  const pressureCompliance01 = clamp(
    0.44 + visualDeflation01 * 0.54 - visualInflation01 * 0.2,
    0.2,
    1
  )

  return {
    pressureRatio01,
    pressureRatioOfNominal,
    visualDeflation01,
    severeDeflation01,
    moderateDeflation01,
    visualInflation01,
    pressureCompliance01,
    pressureOnlyRadialOffsetMeters:
      -config.maximumPressureOnlyRadialChangeMeters *
        (visualDeflation01 * 0.74 + severeDeflation01 * 0.26) +
      config.maximumPressureOnlyRadialChangeMeters *
        0.32 *
        visualInflation01,
    pressureOnlySidewallBulgeMeters:
      config.maximumPressureOnlySidewallBulgeMeters *
        (visualDeflation01 * 0.7 + severeDeflation01 * 0.3) -
      config.maximumPressureOnlySidewallBulgeMeters *
        0.26 *
        visualInflation01,
  }
}

export function computeLoadAwareTireDeformation(
  visualRatio01,
  nominalRatio01,
  input = {},
  config = TIRE_PRESSURE_VISUAL_DEFAULTS
) {
  const pressure = computeTirePressureVisualScales(
    visualRatio01,
    nominalRatio01,
    config
  )
  const isGrounded = input.isGrounded === true
  const normalForceNewtons = sanitizeNonNegativeNumber(input.normalForceNewtons)
  const referenceNormalForceNewtons = resolveReferenceLoadNewtons(
    input.referenceNormalForceNewtons,
    normalForceNewtons
  )
  const normalizedLoadRatio = isGrounded
    ? clamp(
        normalForceNewtons / referenceNormalForceNewtons,
        0,
        config.maximumVisualLoadRatio
      )
    : 0
  const loadResponse01 = clamp01(
    normalizedLoadRatio / config.maximumVisualLoadRatio
  )
  const effectivePhysicalRollingRadiusMeters = sanitizePositiveNumber(
    input.effectivePhysicalRollingRadiusMeters,
    NaN
  )
  const contactFlatteningMeters = isGrounded
    ? config.maximumContactFlatteningMeters *
      pressure.pressureCompliance01 *
      loadResponse01
    : 0
  const sidewallBulgeMeters = isGrounded
    ? (
        config.maximumSidewallBulgeMeters * pressure.pressureCompliance01 +
        config.maximumSevereSidewallBulgeMeters * pressure.severeDeflation01
      ) * loadResponse01
    : 0
  const lowerSidewallCollapseMeters = isGrounded
    ? config.maximumLowerSidewallCollapseMeters *
      pressure.severeDeflation01 *
      loadResponse01
    : 0
  const contactPatchScale = {
    width: clamp(
      0.96 +
        loadResponse01 * 0.09 +
        pressure.visualDeflation01 * (0.2 + loadResponse01 * 0.18) +
        pressure.severeDeflation01 * 0.08 -
        pressure.visualInflation01 *
          (1 - config.overInflatedContactPatchScaleWidth) *
          (0.3 + loadResponse01 * 0.7),
      0.82,
      config.flatContactPatchScaleWidth
    ),
    length: clamp(
      0.94 +
        loadResponse01 * 0.12 +
        pressure.visualDeflation01 * (0.28 + loadResponse01 * 0.22) +
        pressure.severeDeflation01 * 0.12 -
        pressure.visualInflation01 *
          (1 - config.overInflatedContactPatchScaleLength) *
          (0.3 + loadResponse01 * 0.7),
      0.8,
      config.flatContactPatchScaleLength
    ),
  }

  return {
    ...pressure,
    isGrounded,
    normalForceNewtons,
    referenceNormalForceNewtons,
    normalizedLoadRatio,
    loadResponse01,
    effectivePhysicalRollingRadiusMeters,
    visualLoadedRadiusMeters: effectivePhysicalRollingRadiusMeters,
    contactFlatteningMeters,
    sidewallBulgeMeters,
    lowerSidewallCollapseMeters,
    contactPatchScale,
  }
}

export function smoothTirePressureRatio(current, target, dtSeconds, responseSeconds) {
  return smoothTireVisualScalar(
    current,
    target,
    dtSeconds,
    responseSeconds,
    clamp01
  )
}

export function smoothTireVisualLoadRatio(
  current,
  target,
  dtSeconds,
  responseSeconds,
  maximumVisualLoadRatio
) {
  const maximum = clamp(
    maximumVisualLoadRatio,
    0.25,
    TIRE_PRESSURE_VISUAL_DEFAULTS.maximumVisualLoadRatio * 2
  )
  return smoothTireVisualScalar(
    current,
    target,
    dtSeconds,
    responseSeconds,
    (value) => clamp(value, 0, maximum)
  )
}

function smoothTireVisualScalar(current, target, dtSeconds, responseSeconds, sanitize) {
  const tau = Math.max(
    Number.isFinite(responseSeconds) ? responseSeconds : 2,
    1e-3
  )
  const dt = Number.isFinite(dtSeconds) && dtSeconds > 0
    ? Math.min(dtSeconds, 0.25)
    : 0
  const clampedTarget = sanitize(target)
  const currentClamped = sanitize(current)
  const alpha = 1 - Math.exp(-dt / tau)
  const value = sanitize(
    currentClamped + (clampedTarget - currentClamped) * alpha
  )

  return {
    value,
    isSettled: Math.abs(clampedTarget - value) < SETTLE_EPSILON,
  }
}

function resolveReferenceLoadNewtons(referenceNormalForceNewtons, normalForceNewtons) {
  const staticReferenceNormalForceNewtons = sanitizeNonNegativeNumber(
    referenceNormalForceNewtons
  )
  return staticReferenceNormalForceNewtons > 1e-6
    ? staticReferenceNormalForceNewtons
    : Math.max(normalForceNewtons, 1)
}

function sanitizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeNonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function smoothstep(edge0, edge1, value) {
  const span = edge1 - edge0
  if (span <= Number.EPSILON) return value >= edge1 ? 1 : 0
  const t = clamp01((value - edge0) / span)
  return t * t * (3 - 2 * t)
}

function clamp(value, minimum, maximum) {
  const safeValue = Number.isFinite(value) ? value : minimum
  return Math.min(maximum, Math.max(minimum, safeValue))
}
