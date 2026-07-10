// src/car/tirePressureVisualScales.js

// Pure, Three.js-free helpers for load-aware tire deformation. These functions
// only map already-simulated pressure, load, and contact state to conservative
// visual parameters. They never change physical wheel or tire-force state.

export const TIRE_PRESSURE_VISUAL_DEFAULTS = Object.freeze({
  visualResponseSeconds: 2.0,
  loadResponseSeconds: 0.14,
  maximumVisualLoadRatio: 2.2,
  maximumContactFlatteningMeters: 0.072,
  maximumSidewallBulgeMeters: 0.034,
  maximumPressureOnlyRadialChangeMeters: 0.008,
  maximumPressureOnlySidewallBulgeMeters: 0.012,
  flatContactPatchScaleWidth: 1.28,
  flatContactPatchScaleLength: 1.48,
  overInflatedContactPatchScaleWidth: 0.94,
  overInflatedContactPatchScaleLength: 0.88,
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
    0.09
  )
  config.maximumSidewallBulgeMeters = clamp(
    config.maximumSidewallBulgeMeters,
    0,
    0.05
  )
  config.maximumPressureOnlyRadialChangeMeters = clamp(
    config.maximumPressureOnlyRadialChangeMeters,
    0,
    0.02
  )
  config.maximumPressureOnlySidewallBulgeMeters = clamp(
    config.maximumPressureOnlySidewallBulgeMeters,
    0,
    0.024
  )

  return config
}

export function clamp01(value) {
  if (!Number.isFinite(value)) return 1
  return Math.min(Math.max(value, 0), 1)
}

// Position of the default (nominal) pressure within the 0..1 pressure range.
export function calculateNominalPressureRatio01(pressureState = {}) {
  const min = Number(pressureState.minTirePressureKpa)
  const max = Number(pressureState.maxTirePressureKpa)
  const def = Number(pressureState.defaultTirePressureKpa)

  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(def)) {
    return 1
  }

  const range = max - min
  if (range <= 0) return 1

  return clamp01((def - min) / range)
}

// Pressure affects visual compliance rather than object-level tire scale.
// Nominal pressure remains close to the authored baseline; lower pressure
// becomes more compliant and high pressure becomes more resistant to load.
export function computeTirePressureVisualScales(
  visualRatio01,
  nominalRatio01,
  config = TIRE_PRESSURE_VISUAL_DEFAULTS
) {
  const p = clamp01(visualRatio01)
  const n = clamp01(nominalRatio01)
  const underSpan = Math.max(n, 1e-6)
  const overSpan = Math.max(1 - n, 1e-6)
  const visualDeflation01 = clamp01((n - p) / underSpan)
  const visualInflation01 = clamp01((p - n) / overSpan)
  const pressureCompliance01 = clamp(
    0.42 + visualDeflation01 * 0.58 - visualInflation01 * 0.22,
    0.18,
    1
  )

  return {
    visualDeflation01,
    visualInflation01,
    pressureCompliance01,
    pressureOnlyRadialOffsetMeters:
      -config.maximumPressureOnlyRadialChangeMeters * visualDeflation01 +
      config.maximumPressureOnlyRadialChangeMeters * 0.35 * visualInflation01,
    pressureOnlySidewallBulgeMeters:
      config.maximumPressureOnlySidewallBulgeMeters * visualDeflation01 -
      config.maximumPressureOnlySidewallBulgeMeters * 0.3 * visualInflation01,
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
  const contactFlatteningMeters = isGrounded
    ? config.maximumContactFlatteningMeters *
      pressure.pressureCompliance01 *
      loadResponse01
    : 0
  const sidewallBulgeMeters = isGrounded
    ? config.maximumSidewallBulgeMeters *
      pressure.pressureCompliance01 *
      loadResponse01
    : 0
  const contactPatchScale = {
    width: clamp(
      0.94 +
        loadResponse01 * 0.12 +
        pressure.visualDeflation01 *
          (config.flatContactPatchScaleWidth - 1) *
          (0.25 + loadResponse01 * 0.75) -
        pressure.visualInflation01 *
          (1 - config.overInflatedContactPatchScaleWidth) *
          (0.25 + loadResponse01 * 0.75),
      0.78,
      1.6
    ),
    length: clamp(
      0.9 +
        loadResponse01 * 0.16 +
        pressure.visualDeflation01 *
          (config.flatContactPatchScaleLength - 1) *
          (0.25 + loadResponse01 * 0.75) -
        pressure.visualInflation01 *
          (1 - config.overInflatedContactPatchScaleLength) *
          (0.25 + loadResponse01 * 0.75),
      0.72,
      1.72
    ),
  }

  return {
    ...pressure,
    isGrounded,
    normalForceNewtons,
    referenceNormalForceNewtons,
    normalizedLoadRatio,
    loadResponse01,
    contactFlatteningMeters,
    sidewallBulgeMeters,
    contactPatchScale,
  }
}

// Exponential smoothing toward a pressure target. The update is a convex
// blend, so it cannot overshoot even with a large render-frame delta.
export function smoothTirePressureRatio(
  current,
  target,
  dtSeconds,
  responseSeconds
) {
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

function smoothTireVisualScalar(
  current,
  target,
  dtSeconds,
  responseSeconds,
  sanitize
) {
  const tau = Math.max(
    Number.isFinite(responseSeconds) ? responseSeconds : 2.0,
    1e-3
  )
  const dt =
    Number.isFinite(dtSeconds) && dtSeconds > 0
      ? Math.min(dtSeconds, 0.25)
      : 0
  const clampedTarget = sanitize(target)
  const currentClamped = sanitize(current)
  const alpha = 1 - Math.exp(-dt / tau)
  const next = currentClamped + (clampedTarget - currentClamped) * alpha

  return {
    value: sanitize(next),
    isSettled: Math.abs(clampedTarget - sanitize(next)) < SETTLE_EPSILON,
  }
}

function resolveReferenceLoadNewtons(referenceNormalForceNewtons, normalForceNewtons) {
  const staticReferenceNormalForceNewtons = sanitizeNonNegativeNumber(
    referenceNormalForceNewtons
  )

  if (staticReferenceNormalForceNewtons > 1e-6) {
    return staticReferenceNormalForceNewtons
  }

  // The dynamic wheel load is the narrow fallback when static telemetry is
  // temporarily unavailable. It avoids a second physical load source.
  return Math.max(normalForceNewtons, 1)
}

function sanitizeNonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function clamp(value, minimum, maximum) {
  const safeValue = Number.isFinite(value) ? value : minimum
  return Math.min(maximum, Math.max(minimum, safeValue))
}