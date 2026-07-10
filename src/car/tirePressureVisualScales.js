// src/car/tirePressureVisualScales.js

// Pure, Three.js-free helpers for tire pressure visual deformation.
// These functions only map a normalized pressure ratio (0..1) to conservative
// visual scale factors. They never touch scene objects, physics, or wheel
// radius used by the simulation, so they can be unit-tested in isolation.

export const TIRE_PRESSURE_VISUAL_DEFAULTS = {
  // Time constant for the visual pressure to ease toward the target pressure.
  visualResponseSeconds: 2.0,
  // Hard lower clamp on the radial scale so a fully deflated tire still renders.
  minimumVisualPressureRatio01: 0.30,
  // Radial (radius) scale at full under-inflation, within 0.72..0.82.
  flatTireRadiusScale: 0.80,
  // Width (along axle) scale at full under-inflation, within 1.15..1.30.
  flatTireWidthScale: 1.22,
  // Contact patch width scale at full under-inflation, within 1.25..1.60.
  flatContactPatchScaleWidth: 1.30,
  // Contact patch length scale at full under-inflation, within 1.25..1.60.
  flatContactPatchScaleLength: 1.45,
  // Radial scale at full over-inflation, within 1.02..1.05.
  overInflatedRadiusScale: 1.035,
  // Width scale at full over-inflation, within 0.95..0.98.
  overInflatedWidthScale: 0.965,
}

const SETTLE_EPSILON = 0.002

export function createTirePressureVisualConfig(options = {}) {
  const config = { ...TIRE_PRESSURE_VISUAL_DEFAULTS, ...options }

  for (const key of Object.keys(TIRE_PRESSURE_VISUAL_DEFAULTS)) {
    if (!Number.isFinite(config[key])) {
      config[key] = TIRE_PRESSURE_VISUAL_DEFAULTS[key]
    }
  }

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

// Map a normalized visual pressure ratio to conservative, finite scale factors.
// Under-inflation (ratio below nominal) flattens the radius, widens the tire,
// and enlarges the contact patch. Over-inflation is kept subtle.
export function computeTirePressureVisualScales(
  visualRatio01,
  nominalRatio01,
  config
) {
  const p = clamp01(visualRatio01)
  const n = clamp01(nominalRatio01)
  const underSpan = Math.max(n, 1e-6)
  const overSpan = Math.max(1 - n, 1e-6)

  const under = clamp01((n - p) / underSpan)
  const over = clamp01((p - n) / overSpan)

  const flatRadius = config.flatTireRadiusScale
  const radiusScale = clamp(
    1 - under * (1 - flatRadius) + over * (config.overInflatedRadiusScale - 1),
    config.minimumVisualPressureRatio01,
    1.1
  )

  const flatWidth = config.flatTireWidthScale
  const widthScale = clamp(
    1 + under * (flatWidth - 1) - over * (1 - config.overInflatedWidthScale),
    0.8,
    1.6
  )

  const contactPatchScale = {
    width: clamp(
      1 + under * (config.flatContactPatchScaleWidth - 1),
      0.78,
      1.6
    ),
    length: clamp(
      1 + under * (config.flatContactPatchScaleLength - 1),
      0.72,
      1.7
    ),
  }

  const visualTireDeflectionRatio = under * 0.3 - over * 0.08

  return {
    visualDeflation01: under,
    visualInflation01: over,
    radiusScale,
    widthScale,
    sidewallBulgeScale: widthScale,
    contactPatchScale,
    visualTireDeflectionRatio,
  }
}

// Exponential smoothing toward a target ratio. Returns the next ratio and a
// settled flag. Never overshoots because the step is a convex blend.
export function smoothTirePressureRatio(
  current,
  target,
  dtSeconds,
  responseSeconds
) {
  const tau = Math.max(
    Number.isFinite(responseSeconds) ? responseSeconds : 2.0,
    1e-3
  )
  const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? Math.min(dtSeconds, 0.25) : 0
  const clampedTarget = clamp01(target)
  const currentClamped = clamp01(current)
  const alpha = 1 - Math.exp(-dt / tau)
  const next = currentClamped + (clampedTarget - currentClamped) * alpha

  return {
    value: clamp01(next),
    isSettled: Math.abs(clampedTarget - clamp01(next)) < SETTLE_EPSILON,
  }
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}
