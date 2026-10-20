// src/vehicle/dynamics/tireModelLibrary.js
//
// Named tire-compound presets for the combined-slip tire seam.
//
// Each preset supplies a Pacejka-style Magic Formula (B/C/D/E) coefficient set
// for the longitudinal and lateral force falloff, plus a peak friction scalar.
// The combined-slip seam (combinedSlipTireForceState.js) dispatches on
// spec.combinedSlipTirePresetName; presets other than 'brushFiala' replace the
// brush falloff with the Magic Formula magnitude curve while keeping the same
// friction-circle-emerges architecture and output telemetry.
//
// Honest scope (per AGENTS.md S3.2): this is a parameterized Magic Formula per
// compound, not a multi-vendor tire database. Normal-load, slip-speed, and
// temperature dependence are deferred seams.
//
// Curve-shape note: the Magic Formula magnitude factor is normalized so it
// equals 1.0 exactly at the stick/slide transition (normalized combined slip
// rho = 1), which makes the combined-force peak exactly the friction-circle
// limit (peakFrictionCoefficient * Fz). The B/C/E coefficients then shape the
// post-peak decay; the D coefficient is part of the raw curve but cancels under
// the normalization, so peak grip is governed by peakFrictionCoefficient and
// shape by B/C/E. This avoids the classic brush artifact where force decays
// toward zero at extreme slip.

function sanitizePositiveNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function sanitizeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

// Raw Pacejka Magic Formula magnitude factor for normalized combined slip rho.
// Returns |F| / (mu*Fz) for the pure-slip curve (un-normalized).
function magicFormulaRawFactor(rho, b, c, d, e) {
  const x = Math.max(rho, 0)
  const argument = c * Math.atan(b * x - e * (b * x - Math.atan(b * x)))
  return d * Math.sin(argument)
}

// Normalized slide-region factor. Equals 1.0 at rho = 1 (continuous with the
// linear stick region) and decays to a bounded, non-zero asymptote past peak.
export function magicFormulaSlideFactor(rho, coefficients) {
  const b = sanitizePositiveNumber(coefficients?.b, 1)
  const c = sanitizePositiveNumber(coefficients?.c, 1)
  const d = sanitizePositiveNumber(coefficients?.d, 1)
  const e = sanitizeNumber(coefficients?.e, 1)
  const rawAtOne = magicFormulaRawFactor(1, b, c, d, e)
  if (!Number.isFinite(rawAtOne) || rawAtOne === 0) return 1
  const raw = magicFormulaRawFactor(rho, b, c, d, e)
  return raw / rawAtOne
}

export const TIRE_PRESETS = {
  // Baseline preset: reproduces the existing brush/Fiala seam exactly. It carries
  // no Magic Formula coefficients; the seam short-circuits to the original brush
  // logic when this preset is selected (the default), preserving the baseline.
  brushFiala: {
    name: 'brushFiala',
    isMagicFormula: false,
    peakFrictionCoefficient: 1.0,
    longitudinal: null,
    lateral: null,
  },
  // Street compound: moderate grip, gentle breakaway.
  street: {
    name: 'street',
    isMagicFormula: true,
    peakFrictionCoefficient: 1.0,
    longitudinal: { b: 10.0, c: 1.65, d: 1.0, e: 0.97 },
    lateral: { b: 9.0, c: 1.5, d: 1.0, e: 0.85 },
  },
  // Sport compound: higher grip, sharper breakaway.
  sport: {
    name: 'sport',
    isMagicFormula: true,
    peakFrictionCoefficient: 1.15,
    longitudinal: { b: 12.0, c: 1.55, d: 1.0, e: 0.92 },
    lateral: { b: 11.0, c: 1.45, d: 1.0, e: 0.8 },
  },
  // Race slick: very high grip, abrupt breakaway.
  race: {
    name: 'race',
    isMagicFormula: true,
    peakFrictionCoefficient: 1.4,
    longitudinal: { b: 14.0, c: 1.5, d: 1.0, e: 0.85 },
    lateral: { b: 13.0, c: 1.4, d: 1.0, e: 0.75 },
  },
  // Low-mu / wet: reduced grip, soft breakaway.
  lowMu: {
    name: 'lowMu',
    isMagicFormula: true,
    peakFrictionCoefficient: 0.5,
    longitudinal: { b: 8.0, c: 1.7, d: 1.0, e: 1.0 },
    lateral: { b: 7.5, c: 1.6, d: 1.0, e: 0.95 },
  },
}

export const DEFAULT_TIRE_PRESET_NAME = 'brushFiala'

export function getTirePreset(name) {
  if (typeof name === 'string' && TIRE_PRESETS[name]) {
    return TIRE_PRESETS[name]
  }
  return TIRE_PRESETS[DEFAULT_TIRE_PRESET_NAME]
}
