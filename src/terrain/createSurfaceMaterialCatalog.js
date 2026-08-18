// src/terrain/createSurfaceMaterialCatalog.js

/**
 * Surface Material Catalog
 *
 * Defines physical properties for different terrain surface types.
 * All values use SI units (meters, kilograms, seconds, Newtons).
 *
 * These properties are used by:
 * - Tire friction models (frictionCoefficient)
 * - Suspension damping interaction (dampingCoefficient)
 * - Rolling resistance (rollingResistanceCoefficient)
 * - Surface deformation (deformabilityCoefficient)
 * - Thermal interaction (thermalConductivity)
 */

export const SURFACE_MATERIAL_KINDS = Object.freeze({
  ASPHALT: 'asphalt',
  GRAVEL: 'gravel',
  MUD: 'mud',
  GRASS: 'grass',
  ROCK: 'rock',
  ICE: 'ice',
  SAND: 'sand',
  SNOW: 'snow',
  DIRT: 'dirt',
  CONCRETE: 'concrete',
})

const BASE_SURFACE_MATERIALS = Object.freeze({
  [SURFACE_MATERIAL_KINDS.ASPHALT]: {
    kind: SURFACE_MATERIAL_KINDS.ASPHALT,
    displayName: 'Asphalt',
    frictionCoefficient: 0.95,
    dampingCoefficient: 0.02,
    rollingResistanceCoefficient: 0.012,
    deformabilityCoefficient: 0.01,
    thermalConductivity: 0.9,
    roughnessRmsMeters: 0.001,
    combinedGripMultiplier: 1.0,
    lateralGripMultiplier: 1.0,
    longitudinalGripMultiplier: 1.0,
    visualColor: 0x333333,
    visualRoughness: 0.85,
    visualMetalness: 0.05,
  },
  [SURFACE_MATERIAL_KINDS.GRAVEL]: {
    kind: SURFACE_MATERIAL_KINDS.GRAVEL,
    displayName: 'Gravel',
    frictionCoefficient: 0.55,
    dampingCoefficient: 0.15,
    rollingResistanceCoefficient: 0.04,
    deformabilityCoefficient: 0.15,
    thermalConductivity: 0.5,
    roughnessRmsMeters: 0.015,
    combinedGripMultiplier: 0.85,
    lateralGripMultiplier: 0.8,
    longitudinalGripMultiplier: 0.9,
    visualColor: 0x887755,
    visualRoughness: 0.95,
    visualMetalness: 0.02,
  },
  [SURFACE_MATERIAL_KINDS.MUD]: {
    kind: SURFACE_MATERIAL_KINDS.MUD,
    displayName: 'Mud',
    frictionCoefficient: 0.25,
    dampingCoefficient: 0.4,
    rollingResistanceCoefficient: 0.12,
    deformabilityCoefficient: 0.5,
    thermalConductivity: 0.6,
    roughnessRmsMeters: 0.005,
    combinedGripMultiplier: 0.4,
    lateralGripMultiplier: 0.3,
    longitudinalGripMultiplier: 0.5,
    visualColor: 0x4a3728,
    visualRoughness: 0.9,
    visualMetalness: 0.01,
  },
  [SURFACE_MATERIAL_KINDS.GRASS]: {
    kind: SURFACE_MATERIAL_KINDS.GRASS,
    displayName: 'Grass',
    frictionCoefficient: 0.55,
    dampingCoefficient: 0.08,
    rollingResistanceCoefficient: 0.025,
    deformabilityCoefficient: 0.1,
    thermalConductivity: 0.4,
    roughnessRmsMeters: 0.008,
    combinedGripMultiplier: 0.75,
    lateralGripMultiplier: 0.7,
    longitudinalGripMultiplier: 0.8,
    visualColor: 0x2d5a1a,
    visualRoughness: 0.88,
    visualMetalness: 0.02,
  },
  [SURFACE_MATERIAL_KINDS.ROCK]: {
    kind: SURFACE_MATERIAL_KINDS.ROCK,
    displayName: 'Rock',
    frictionCoefficient: 0.85,
    dampingCoefficient: 0.005,
    rollingResistanceCoefficient: 0.01,
    deformabilityCoefficient: 0.002,
    thermalConductivity: 2.5,
    roughnessRmsMeters: 0.005,
    combinedGripMultiplier: 1.1,
    lateralGripMultiplier: 1.15,
    longitudinalGripMultiplier: 1.05,
    visualColor: 0x555555,
    visualRoughness: 0.75,
    visualMetalness: 0.1,
  },
  [SURFACE_MATERIAL_KINDS.ICE]: {
    kind: SURFACE_MATERIAL_KINDS.ICE,
    displayName: 'Ice',
    frictionCoefficient: 0.1,
    dampingCoefficient: 0.001,
    rollingResistanceCoefficient: 0.005,
    deformabilityCoefficient: 0.001,
    thermalConductivity: 2.2,
    roughnessRmsMeters: 0.0001,
    combinedGripMultiplier: 0.15,
    lateralGripMultiplier: 0.1,
    longitudinalGripMultiplier: 0.2,
    visualColor: 0xcceeff,
    visualRoughness: 0.1,
    visualMetalness: 0.3,
  },
  [SURFACE_MATERIAL_KINDS.SAND]: {
    kind: SURFACE_MATERIAL_KINDS.SAND,
    displayName: 'Sand',
    frictionCoefficient: 0.4,
    dampingCoefficient: 0.25,
    rollingResistanceCoefficient: 0.08,
    deformabilityCoefficient: 0.4,
    thermalConductivity: 0.3,
    roughnessRmsMeters: 0.003,
    combinedGripMultiplier: 0.6,
    lateralGripMultiplier: 0.5,
    longitudinalGripMultiplier: 0.7,
    visualColor: 0xe8d5b7,
    visualRoughness: 0.92,
    visualMetalness: 0.01,
  },
  [SURFACE_MATERIAL_KINDS.SNOW]: {
    kind: SURFACE_MATERIAL_KINDS.SNOW,
    displayName: 'Snow',
    frictionCoefficient: 0.2,
    dampingCoefficient: 0.2,
    rollingResistanceCoefficient: 0.06,
    deformabilityCoefficient: 0.35,
    thermalConductivity: 0.15,
    roughnessRmsMeters: 0.002,
    combinedGripMultiplier: 0.35,
    lateralGripMultiplier: 0.3,
    longitudinalGripMultiplier: 0.4,
    visualColor: 0xffffff,
    visualRoughness: 0.85,
    visualMetalness: 0.02,
  },
  [SURFACE_MATERIAL_KINDS.DIRT]: {
    kind: SURFACE_MATERIAL_KINDS.DIRT,
    displayName: 'Dirt',
    frictionCoefficient: 0.55,
    dampingCoefficient: 0.1,
    rollingResistanceCoefficient: 0.03,
    deformabilityCoefficient: 0.12,
    thermalConductivity: 0.45,
    roughnessRmsMeters: 0.01,
    combinedGripMultiplier: 0.8,
    lateralGripMultiplier: 0.75,
    longitudinalGripMultiplier: 0.85,
    visualColor: 0x6b4a2a,
    visualRoughness: 0.9,
    visualMetalness: 0.02,
  },
  [SURFACE_MATERIAL_KINDS.CONCRETE]: {
    kind: SURFACE_MATERIAL_KINDS.CONCRETE,
    displayName: 'Concrete',
    frictionCoefficient: 0.85,
    dampingCoefficient: 0.01,
    rollingResistanceCoefficient: 0.01,
    deformabilityCoefficient: 0.005,
    thermalConductivity: 1.4,
    roughnessRmsMeters: 0.002,
    combinedGripMultiplier: 1.0,
    lateralGripMultiplier: 1.05,
    longitudinalGripMultiplier: 1.0,
    visualColor: 0x888888,
    visualRoughness: 0.7,
    visualMetalness: 0.05,
  },
})

export function createSurfaceMaterialCatalog(overrides = {}) {
  const catalog = {}
  for (const [kind, baseMaterial] of Object.entries(BASE_SURFACE_MATERIALS)) {
    const override = overrides[kind] || {}
    catalog[kind] = Object.freeze({ ...baseMaterial, ...override, kind })
  }
  return Object.freeze(catalog)
}

export function getSurfaceMaterial(catalog, kind) {
  if (!kind || !catalog[kind]) {
    return catalog[SURFACE_MATERIAL_KINDS.ASPHALT]
  }
  return catalog[kind]
}

export function resolveSurfaceFrictionCoefficient(catalog, kind) {
  const material = getSurfaceMaterial(catalog, kind)
  return material.frictionCoefficient
}

export function resolveSurfaceProperties(catalog, kind) {
  const material = getSurfaceMaterial(catalog, kind)
  return {
    frictionCoefficient: material.frictionCoefficient,
    dampingCoefficient: material.dampingCoefficient,
    rollingResistanceCoefficient: material.rollingResistanceCoefficient,
    deformabilityCoefficient: material.deformabilityCoefficient,
    thermalConductivity: material.thermalConductivity,
    roughnessRmsMeters: material.roughnessRmsMeters,
    combinedGripMultiplier: material.combinedGripMultiplier,
    lateralGripMultiplier: material.lateralGripMultiplier,
    longitudinalGripMultiplier: material.longitudinalGripMultiplier,
  }
}

export const DEFAULT_SURFACE_MATERIAL_CATALOG = Object.freeze(
  createSurfaceMaterialCatalog()
)

export const SURFACE_CONDITION_MODIFIERS = Object.freeze({
  DRY: { frictionMultiplier: 1.0, dampingMultiplier: 1.0, rollingResistanceMultiplier: 1.0 },
  WET: { frictionMultiplier: 0.6, dampingMultiplier: 1.2, rollingResistanceMultiplier: 1.1 },
  ICY: { frictionMultiplier: 0.15, dampingMultiplier: 0.5, rollingResistanceMultiplier: 0.8 },
  DUSTY: { frictionMultiplier: 0.7, dampingMultiplier: 1.1, rollingResistanceMultiplier: 1.05 },
  LOOSE: { frictionMultiplier: 0.8, dampingMultiplier: 1.5, rollingResistanceMultiplier: 1.3 },
  PACKED: { frictionMultiplier: 1.1, dampingMultiplier: 0.8, rollingResistanceMultiplier: 0.9 },
})

export function applySurfaceCondition(material, conditionName) {
  const modifier = SURFACE_CONDITION_MODIFIERS[conditionName?.toUpperCase()]
  if (!modifier) return material
  return {
    ...material,
    frictionCoefficient: material.frictionCoefficient * modifier.frictionMultiplier,
    dampingCoefficient: material.dampingCoefficient * modifier.dampingMultiplier,
    rollingResistanceCoefficient: material.rollingResistanceCoefficient * modifier.rollingResistanceMultiplier,
  }
}
