// src/vehicle/powertrain/createStockEngineCatalog.js

// Stock engine catalog seed foundation.
//
// This module attaches source-derived, manual, STATIC stock engine catalog
// records to the existing piston-engine profiles. It is catalog METADATA and
// derived display/validation telemetry ONLY.
//
// It does NOT generate torque curves, model combustion, build custom engines,
// model tuning packages, or perform any online/network import. Geometry and
// performance fields are catalog metadata. Derived displacement is validation/
// display telemetry only and never drives vehicle behavior. No physics reads
// these values.

export const STOCK_ENGINE_CATALOG_SCHEMA_VERSION = 1

const STROKE_GEOMETRY_KINDS = Object.freeze({
  UNDERSQUARE: 'undersquare',
  SQUARE: 'square',
  OVERSQUARE: 'oversquare',
  UNKNOWN: 'unknown',
})

const CATALOG_TELEMETRY_STATUS = Object.freeze({
  AVAILABLE: 'available',
  UNAVAILABLE: 'unavailable',
})

const SQUARE_TOLERANCE_MILLIMETERS = 1.0

function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0
}

function safeDivide(numerator, denominator) {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return 0
  }

  return numerator / denominator
}

function deepFreeze(object) {
  if (object && typeof object === 'object' && !Object.isFrozen(object)) {
    Object.freeze(object)

    for (const key of Object.keys(object)) {
      const value = object[key]

      if (value && typeof value === 'object') {
        deepFreeze(value)
      }
    }
  }

  return object
}

// Derived displacement is validation/display telemetry only.
// per-cylinder volume = π * (bore/2)^2 * stroke (mm^3); total in liters.
function deriveDisplacementLitersFromBoreStroke(
  boreMillimeters,
  strokeMillimeters,
  cylinderCount
) {
  if (!(boreMillimeters > 0) || !(strokeMillimeters > 0) || !(cylinderCount > 0)) {
    return 0
  }

  const radiusMillimeters = boreMillimeters / 2
  const perCylinderCubicMillimeters =
    Math.PI * radiusMillimeters * radiusMillimeters * strokeMillimeters
  const totalCubicMillimeters = perCylinderCubicMillimeters * cylinderCount
  const totalCubicCentimeters = totalCubicMillimeters / 1000
  const totalLiters = totalCubicCentimeters / 1000

  return totalLiters
}

export function classifyStrokeGeometryFromBoreStroke(
  boreMillimeters,
  strokeMillimeters
) {
  const bore = finiteOrZero(boreMillimeters)
  const stroke = finiteOrZero(strokeMillimeters)

  if (!(bore > 0) || !(stroke > 0)) {
    return STROKE_GEOMETRY_KINDS.UNKNOWN
  }

  const difference = bore - stroke

  if (Math.abs(difference) <= SQUARE_TOLERANCE_MILLIMETERS) {
    return STROKE_GEOMETRY_KINDS.SQUARE
  }

  if (bore > stroke) {
    return STROKE_GEOMETRY_KINDS.OVERSQUARE
  }

  return STROKE_GEOMETRY_KINDS.UNDERSQUARE
}

const RAW_STOCK_ENGINE_CATALOG_SEEDS = [
  {
    catalogSchemaVersion: STOCK_ENGINE_CATALOG_SCHEMA_VERSION,
    catalogId: 'ford-fox-1-0-ecoboost-i3',
    linkedEngineProfileId: 'inline-3',
    sourceKind: 'manual_seed',
    dataConfidence: 'high',
    reference: {
      manufacturer: 'Ford',
      family: 'EcoBoost Fox',
      engineCode: '1.0L GTDI',
      displayName: 'Ford 1.0L EcoBoost I3 Turbo',
      productionContext: 'small-displacement turbocharged production inline-3',
    },
    architecture: {
      layoutKind: 'inline',
      cylinderCount: 3,
      cylinderBankCount: 1,
      cylindersPerBank: 3,
      bankAngleDegrees: 0,
      aspirationKind: 'turbocharged',
      fuelKind: 'gasoline',
    },
    geometry: {
      displacementCubicCentimeters: 999,
      displacementLiters: 0.999,
      boreMillimeters: 71.9,
      strokeMillimeters: 82.0,
      compressionRatio: 10.0,
      valvesPerCylinder: 4,
    },
    stockPerformance: {
      peakPowerKilowatts: 92,
      peakPowerRpm: 6000,
      peakTorqueNewtonMeters: null,
      peakTorqueRpm: null,
      torquePlateauStartRpm: null,
      torquePlateauEndRpm: null,
    },
    metadata: {
      sourceLabel: 'Ford owner-manual 1.0L EcoBoost specification',
      sourceNotes:
        'official Ford service/owner content listed 999 cc, 71.9 mm bore, 82.0 mm stroke, 10.0:1 compression, 92 kW at 6000 rpm',
      lastReviewedDate: '2026-07-09',
    },
  },
  {
    catalogSchemaVersion: STOCK_ENGINE_CATALOG_SCHEMA_VERSION,
    catalogId: 'vw-audi-ea888-2-0-tsi-i4',
    linkedEngineProfileId: 'inline-4',
    sourceKind: 'manual_seed',
    dataConfidence: 'medium_high',
    reference: {
      manufacturer: 'Volkswagen Group',
      family: 'EA888',
      engineCode: '2.0 TSI/TFSI representative',
      displayName: 'VW/Audi EA888 2.0 TSI I4 Turbo',
      productionContext: 'common turbocharged production inline-4',
    },
    architecture: {
      layoutKind: 'inline',
      cylinderCount: 4,
      cylinderBankCount: 1,
      cylindersPerBank: 4,
      bankAngleDegrees: 0,
      aspirationKind: 'turbocharged',
      fuelKind: 'gasoline',
    },
    geometry: {
      displacementCubicCentimeters: 1984,
      displacementLiters: 1.984,
      boreMillimeters: 82.5,
      strokeMillimeters: 92.8,
      compressionRatio: 9.6,
      valvesPerCylinder: 4,
    },
    stockPerformance: {
      peakPowerKilowatts: null,
      peakPowerRpm: null,
      peakTorqueNewtonMeters: null,
      peakTorqueRpm: null,
      torquePlateauStartRpm: null,
      torquePlateauEndRpm: null,
    },
    metadata: {
      sourceLabel: 'VW/Audi EA888 public technical specification',
      sourceNotes:
        'public EA888 Gen 3 style specs list 1984 cc, 82.5 mm bore, 92.8 mm stroke, 9.6:1 compression',
      lastReviewedDate: '2026-07-09',
    },
  },
  {
    catalogSchemaVersion: STOCK_ENGINE_CATALOG_SCHEMA_VERSION,
    catalogId: 'audi-daza-2-5-tfsi-i5',
    linkedEngineProfileId: 'inline-5',
    sourceKind: 'manual_seed',
    dataConfidence: 'high',
    reference: {
      manufacturer: 'Audi',
      family: 'EA855 Evo',
      engineCode: 'DAZA',
      displayName: 'Audi 2.5 TFSI I5 Turbo',
      productionContext: 'high-output turbocharged production inline-5',
    },
    architecture: {
      layoutKind: 'inline',
      cylinderCount: 5,
      cylinderBankCount: 1,
      cylindersPerBank: 5,
      bankAngleDegrees: 0,
      aspirationKind: 'turbocharged',
      fuelKind: 'gasoline',
    },
    geometry: {
      displacementCubicCentimeters: 2480,
      displacementLiters: 2.480,
      boreMillimeters: 82.5,
      strokeMillimeters: 92.8,
      compressionRatio: 10.0,
      valvesPerCylinder: 4,
    },
    stockPerformance: {
      peakPowerKilowatts: 298,
      peakPowerRpm: 5850,
      peakTorqueNewtonMeters: 480,
      peakTorqueRpm: 1700,
      torquePlateauStartRpm: 1700,
      torquePlateauEndRpm: 5850,
    },
    metadata: {
      sourceLabel: 'Audi 2.5L TFSI EA855 Evo technical training/NHTSA document',
      sourceNotes:
        'source listed DAZA 2480 cc, 82.5 mm bore, 92.8 mm stroke, 10.0:1 compression, 298 kW, 480 Nm',
      lastReviewedDate: '2026-07-09',
    },
  },
  {
    catalogSchemaVersion: STOCK_ENGINE_CATALOG_SCHEMA_VERSION,
    catalogId: 'bmw-b58-3-0-i6',
    linkedEngineProfileId: 'inline-6',
    sourceKind: 'manual_seed',
    dataConfidence: 'medium_high',
    reference: {
      manufacturer: 'BMW',
      family: 'B58',
      engineCode: 'B58 representative',
      displayName: 'BMW B58 3.0 I6 Turbo',
      productionContext: 'modern turbocharged production inline-6',
    },
    architecture: {
      layoutKind: 'inline',
      cylinderCount: 6,
      cylinderBankCount: 1,
      cylindersPerBank: 6,
      bankAngleDegrees: 0,
      aspirationKind: 'turbocharged',
      fuelKind: 'gasoline',
    },
    geometry: {
      displacementCubicCentimeters: 2998,
      displacementLiters: 2.998,
      boreMillimeters: 82.0,
      strokeMillimeters: 94.6,
      compressionRatio: 11.0,
      valvesPerCylinder: 4,
    },
    stockPerformance: {
      peakPowerKilowatts: null,
      peakPowerRpm: null,
      peakTorqueNewtonMeters: null,
      peakTorqueRpm: null,
      torquePlateauStartRpm: null,
      torquePlateauEndRpm: null,
    },
    metadata: {
      sourceLabel: 'BMW B58 public technical specification',
      sourceNotes:
        'public B58 specs list 2998 cc, 82.0 mm bore, 94.6 mm stroke, 11.0:1 compression',
      lastReviewedDate: '2026-07-09',
    },
  },
  {
    catalogSchemaVersion: STOCK_ENGINE_CATALOG_SCHEMA_VERSION,
    catalogId: 'toyota-2gr-fe-3-5-v6',
    linkedEngineProfileId: 'v6',
    sourceKind: 'manual_seed',
    dataConfidence: 'medium_high',
    reference: {
      manufacturer: 'Toyota',
      family: 'GR',
      engineCode: '2GR-FE representative',
      displayName: 'Toyota 2GR-FE 3.5 V6 NA',
      productionContext: 'common naturally aspirated production 60-degree V6',
    },
    architecture: {
      layoutKind: 'v',
      cylinderCount: 6,
      cylinderBankCount: 2,
      cylindersPerBank: 3,
      bankAngleDegrees: 60,
      aspirationKind: 'naturally_aspirated',
      fuelKind: 'gasoline',
    },
    geometry: {
      displacementCubicCentimeters: 3456,
      displacementLiters: 3.456,
      boreMillimeters: 94.0,
      strokeMillimeters: 83.0,
      compressionRatio: 10.8,
      valvesPerCylinder: 4,
    },
    stockPerformance: {
      peakPowerKilowatts: null,
      peakPowerRpm: null,
      peakTorqueNewtonMeters: null,
      peakTorqueRpm: null,
      torquePlateauStartRpm: null,
      torquePlateauEndRpm: null,
    },
    metadata: {
      sourceLabel: 'Toyota 2GR-FE public technical specification',
      sourceNotes:
        'public 2GR-FE specs list 3456 cc, 94.0 mm bore, 83.0 mm stroke, 10.8:1 compression',
      lastReviewedDate: '2026-07-09',
    },
  },
  {
    catalogSchemaVersion: STOCK_ENGINE_CATALOG_SCHEMA_VERSION,
    catalogId: 'ford-coyote-5-0-v8',
    linkedEngineProfileId: 'v8',
    sourceKind: 'manual_seed',
    dataConfidence: 'medium_high',
    reference: {
      manufacturer: 'Ford',
      family: 'Coyote',
      engineCode: '5.0 Ti-VCT representative',
      displayName: 'Ford 5.0 Coyote V8 NA',
      productionContext: 'modern naturally aspirated production V8',
    },
    architecture: {
      layoutKind: 'v',
      cylinderCount: 8,
      cylinderBankCount: 2,
      cylindersPerBank: 4,
      bankAngleDegrees: 90,
      aspirationKind: 'naturally_aspirated',
      fuelKind: 'gasoline',
    },
    geometry: {
      displacementCubicCentimeters: 5038,
      displacementLiters: 5.038,
      boreMillimeters: 92.2,
      strokeMillimeters: 92.7,
      compressionRatio: 11.0,
      valvesPerCylinder: 4,
    },
    stockPerformance: {
      peakPowerKilowatts: null,
      peakPowerRpm: null,
      peakTorqueNewtonMeters: null,
      peakTorqueRpm: null,
      torquePlateauStartRpm: null,
      torquePlateauEndRpm: null,
    },
    metadata: {
      sourceLabel: 'Ford 5.0 Coyote public technical specification',
      sourceNotes:
        'public Coyote specs vary by year/application; seed uses 92.2 mm bore, 92.7 mm stroke, and a Mustang-like 11.0:1 compression representative value',
      lastReviewedDate: '2026-07-09',
    },
  },
  {
    catalogSchemaVersion: STOCK_ENGINE_CATALOG_SCHEMA_VERSION,
    catalogId: 'audi-lamborghini-5-2-v10',
    linkedEngineProfileId: 'v10',
    sourceKind: 'manual_seed',
    dataConfidence: 'high',
    reference: {
      manufacturer: 'Audi/Lamborghini',
      family: '5.2 FSI V10',
      engineCode: '5.2 V10 representative',
      displayName: 'Audi/Lamborghini 5.2 V10 NA',
      productionContext: 'high-revving naturally aspirated production V10',
    },
    architecture: {
      layoutKind: 'v',
      cylinderCount: 10,
      cylinderBankCount: 2,
      cylindersPerBank: 5,
      bankAngleDegrees: 90,
      aspirationKind: 'naturally_aspirated',
      fuelKind: 'gasoline',
    },
    geometry: {
      displacementCubicCentimeters: 5204,
      displacementLiters: 5.204,
      boreMillimeters: 84.5,
      strokeMillimeters: 92.8,
      compressionRatio: 12.5,
      valvesPerCylinder: 4,
    },
    stockPerformance: {
      peakPowerKilowatts: null,
      peakPowerRpm: null,
      peakTorqueNewtonMeters: null,
      peakTorqueRpm: null,
      torquePlateauStartRpm: null,
      torquePlateauEndRpm: null,
    },
    metadata: {
      sourceLabel: 'Audi R8 5.2 FSI V10 public specification',
      sourceNotes:
        'public Audi R8 5.2 FSI specs list 5204 cc, 84.5 mm bore, 92.8 mm stroke, 12.5:1 compression',
      lastReviewedDate: '2026-07-09',
    },
  },
  {
    catalogSchemaVersion: STOCK_ENGINE_CATALOG_SCHEMA_VERSION,
    catalogId: 'bmw-m70-5-0-v12',
    linkedEngineProfileId: 'v12',
    sourceKind: 'manual_seed',
    dataConfidence: 'medium_high',
    reference: {
      manufacturer: 'BMW',
      family: 'M70',
      engineCode: 'M70B50 representative',
      displayName: 'BMW M70 5.0 V12 NA',
      productionContext: 'classic naturally aspirated production 60-degree V12',
    },
    architecture: {
      layoutKind: 'v',
      cylinderCount: 12,
      cylinderBankCount: 2,
      cylindersPerBank: 6,
      bankAngleDegrees: 60,
      aspirationKind: 'naturally_aspirated',
      fuelKind: 'gasoline',
    },
    geometry: {
      displacementCubicCentimeters: 4988,
      displacementLiters: 4.988,
      boreMillimeters: 84.0,
      strokeMillimeters: 75.0,
      compressionRatio: 8.8,
      valvesPerCylinder: 2,
    },
    stockPerformance: {
      peakPowerKilowatts: null,
      peakPowerRpm: null,
      peakTorqueNewtonMeters: null,
      peakTorqueRpm: null,
      torquePlateauStartRpm: null,
      torquePlateauEndRpm: null,
    },
    metadata: {
      sourceLabel: 'BMW M70 public technical specification',
      sourceNotes:
        'public M70 specs list 60-degree V12, 4988 cc, 84.0 mm bore, 75.0 mm stroke, 8.8:1 compression',
      lastReviewedDate: '2026-07-09',
    },
  },
]

export const STOCK_ENGINE_CATALOG_SEEDS = Object.freeze(
  RAW_STOCK_ENGINE_CATALOG_SEEDS.map((seed) => deepFreeze(seed))
)

const STOCK_ENGINE_CATALOG_INDEX_BY_CATALOG_ID = (() => {
  const index = {}

  for (const seed of STOCK_ENGINE_CATALOG_SEEDS) {
    index[seed.catalogId] = seed
  }

  return Object.freeze(index)
})()

const STOCK_ENGINE_CATALOG_INDEX_BY_LINKED_PROFILE_ID = (() => {
  const index = {}

  for (const seed of STOCK_ENGINE_CATALOG_SEEDS) {
    index[seed.linkedEngineProfileId] = seed
  }

  return Object.freeze(index)
})()

export function getStockEngineCatalogEntries() {
  return Object.freeze(
    STOCK_ENGINE_CATALOG_SEEDS.map((seed) => createStockEngineCatalogSnapshot(seed))
  )
}

export function findStockEngineCatalogEntryById(catalogId) {
  if (typeof catalogId !== 'string') return null

  const entry = STOCK_ENGINE_CATALOG_INDEX_BY_CATALOG_ID[catalogId] ?? null

  return entry ? createStockEngineCatalogSnapshot(entry) : null
}

export function findStockEngineCatalogEntryByLinkedProfileId(
  linkedEngineProfileId
) {
  if (typeof linkedEngineProfileId !== 'string') return null

  const entry =
    STOCK_ENGINE_CATALOG_INDEX_BY_LINKED_PROFILE_ID[linkedEngineProfileId] ?? null

  return entry ? createStockEngineCatalogSnapshot(entry) : null
}

// Returns a cloned, sanitized, frozen snapshot rather than the mutable seed.
export function createStockEngineCatalogSnapshot(entry) {
  if (!entry) return null

  return deepFreeze(JSON.parse(JSON.stringify(entry)))
}

export function deriveStockEngineCatalogTelemetry(entry) {
  if (!entry) {
    return {
      stockEngineCatalog: null,
      stockEngineCatalogId: null,
      stockEngineDisplayName: null,
      sourceKind: null,
      dataConfidence: null,
      manufacturer: null,
      engineFamily: null,
      engineCode: null,
      layoutKind: null,
      cylinderCount: null,
      aspirationKind: null,
      displacementLiters: null,
      derivedDisplacementLiters: 0,
      derivedDisplacementCubicCentimeters: 0,
      displacementErrorLiters: 0,
      displacementErrorPercent: 0,
      boreStrokeRatio: 0,
      strokeGeometryKind: STROKE_GEOMETRY_KINDS.UNKNOWN,
      specificPowerKilowattsPerLiter: 0,
      specificTorqueNewtonMetersPerLiter: 0,
      catalogTelemetryStatus: CATALOG_TELEMETRY_STATUS.UNAVAILABLE,
      catalogTelemetryReason: 'no-catalog-entry',
    }
  }

  const ref = entry.reference ?? {}
  const arch = entry.architecture ?? {}
  const geom = entry.geometry ?? {}
  const perf = entry.stockPerformance ?? {}

  const bore = finiteOrZero(geom.boreMillimeters)
  const stroke = finiteOrZero(geom.strokeMillimeters)
  const cylinderCount = finiteOrZero(arch.cylinderCount)
  const listedDisplacementLiters = finiteOrZero(geom.displacementLiters)

  const derivedDisplacementLiters = deriveDisplacementLitersFromBoreStroke(
    bore,
    stroke,
    cylinderCount
  )
  const derivedDisplacementCubicCentimeters = derivedDisplacementLiters * 1000
  const displacementErrorLiters = derivedDisplacementLiters - listedDisplacementLiters
  const displacementErrorPercent =
    listedDisplacementLiters > 0
      ? (displacementErrorLiters / listedDisplacementLiters) * 100
      : 0
  const boreStrokeRatio = stroke > 0 ? bore / stroke : 0
  const strokeGeometryKind = classifyStrokeGeometryFromBoreStroke(bore, stroke)

  const specificPowerKilowattsPerLiter = safeDivide(
    finiteOrZero(perf.peakPowerKilowatts),
    listedDisplacementLiters
  )
  const specificTorqueNewtonMetersPerLiter = safeDivide(
    finiteOrZero(perf.peakTorqueNewtonMeters),
    listedDisplacementLiters
  )

  return {
    stockEngineCatalog: createStockEngineCatalogSnapshot(entry),
    stockEngineCatalogId: entry.catalogId,
    stockEngineDisplayName: ref.displayName ?? null,
    sourceKind: entry.sourceKind ?? null,
    dataConfidence: entry.dataConfidence ?? null,
    manufacturer: ref.manufacturer ?? null,
    engineFamily: ref.family ?? null,
    engineCode: ref.engineCode ?? null,
    layoutKind: arch.layoutKind ?? null,
    cylinderCount: arch.cylinderCount ?? null,
    aspirationKind: arch.aspirationKind ?? null,
    displacementLiters: geom.displacementLiters ?? null,
    derivedDisplacementLiters,
    derivedDisplacementCubicCentimeters,
    displacementErrorLiters,
    displacementErrorPercent,
    boreStrokeRatio,
    strokeGeometryKind,
    specificPowerKilowattsPerLiter,
    specificTorqueNewtonMetersPerLiter,
    catalogTelemetryStatus: CATALOG_TELEMETRY_STATUS.AVAILABLE,
    catalogTelemetryReason: 'linked-catalog-entry',
  }
}

export const STOCK_ENGINE_CATALOG_STROKE_GEOMETRY_KINDS = STROKE_GEOMETRY_KINDS
export const STOCK_ENGINE_CATALOG_TELEMETRY_STATUS = CATALOG_TELEMETRY_STATUS