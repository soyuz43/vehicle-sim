// src/vehicle/config/applyVehicleConfiguration.js

/**
 * Applies a Phase 4 vehicle configuration to the controller input.
 *
 * Each selected component may contribute SI-unit spec fields (merged into the
 * controller spec override) and, for the drivetrain slot, controller-level
 * engine/transmission identifiers. The merged override is spread over
 * DEFAULT_VEHICLE_SPEC by createVehicleController, so the existing suspension,
 * wheel, drivetrain, brake, and aero models consume the changes without new
 * force models. Determinism is preserved: identical configuration + identical
 * inputs produce identical results because the controller reads the resulting
 * spec each step.
 */

import {
  SUSPENSION_OWNED_SPEC_FIELDS,
  VEHICLE_COMPONENT_SLOTS,
  getComponent,
} from './componentCatalog.js'
import { DEFAULT_VEHICLE_SPEC } from '../defaultVehicleSpec.js'
import { validateVehicleConfiguration } from './createVehicleConfiguration.js'

function mergeComponentSpec(target, component) {
  const specContribution = component?.spec

  if (!specContribution || typeof specContribution !== 'object') return

  for (const key of Object.keys(specContribution)) {
    // 'axleCoupling' is a component-declared archetype value, not a flat
    // runtime field. The slot selection derives 'frontAxleCoupling' and
    // 'rearAxleCoupling' from it below, while the nested slot spec keeps
    // the declaration for Phase B.1 consumers.
    if (key === 'axleCoupling') continue

    const value = specContribution[key]

    if (value !== undefined && value !== null) {
      target[key] = value
    }
  }
}

// Phase B.1 nested suspension shape.
//
// Each slot owns a complete suspension spec object. A component declares
// every field it uses, but the effective runtime shape must be complete: a
// field the component does not declare falls back to DEFAULT_VEHICLE_SPEC,
// exactly like the flat apply path. The declared 'axleCoupling' is preserved
// because it is the component's archetype declaration; the flat runtime spec
// keeps the derived 'frontAxleCoupling'/'rearAxleCoupling' fields.
export function buildSuspensionSlotSpec(component) {
  const specContribution = component?.spec ?? {}
  const nested = {}

  for (const field of SUSPENSION_OWNED_SPEC_FIELDS) {
    const value = specContribution[field]
    nested[field] = value === undefined || value === null
      ? DEFAULT_VEHICLE_SPEC[field]
      : value
  }

  nested.axleCoupling = specContribution.axleCoupling ?? 'independent'

  return nested
}

export function applyVehicleConfiguration(configuration, options = {}) {
  const validation = validateVehicleConfiguration(configuration)
  if (!validation.valid) {
    throw new Error('invalid vehicle configuration: ' + validation.errors.join('; '))
  }

  const specOverride = {}
  let engineId = options?.defaultEngineId ?? null
  let transmissionId = options?.defaultTransmissionId ?? null
  let suspensionFrontComponent = null
  let suspensionRearComponent = null

  for (const slot of VEHICLE_COMPONENT_SLOTS) {
    const componentId = configuration.slots?.[slot]
    const component = getComponent(slot, componentId)

    if (!component) continue

    if (slot === 'suspensionFront') {
      suspensionFrontComponent = component
    } else if (slot === 'suspensionRear') {
      suspensionRearComponent = component
    }

    // Phase A limitation: the flat physical suspension fields are owned by
    // the front slot, so the rear slot merges no physical fields until
    // per-axle consumption lands. The nested slot specs below carry each
    // slot's full archetype so Session 2 can consume them per axle.
    if (slot !== 'suspensionRear') {
      mergeComponentSpec(specOverride, component)
    }

    if (slot === 'drivetrain') {
      if (typeof component.engineId === 'string') {
        engineId = component.engineId
      }
      if (typeof component.transmissionId === 'string') {
        transmissionId = component.transmissionId
      }
    }
  }

  // The axle coupling modes are derived from the archetype each slot
  // selected. The flat runtime spec keeps the two derived per-axle fields
  // the axle coupling state has always read.
  specOverride.frontAxleCoupling =
    suspensionFrontComponent?.spec?.axleCoupling ?? 'independent'
  specOverride.rearAxleCoupling =
    suspensionRearComponent?.spec?.axleCoupling ?? 'independent'

  // Phase B.1 nested suspension specs. Each slot owns its full archetype,
  // while the flat physical fields above remain aliases to the front slot
  // until the physics consumers migrate.
  specOverride.suspensionFront =
    buildSuspensionSlotSpec(suspensionFrontComponent)
  specOverride.suspensionRear =
    buildSuspensionSlotSpec(suspensionRearComponent)

  // The leaf-pack roll-center height belongs to the axle that is actually
  // coupled: a rigid front slot contributes the front archetype's height, a
  // rigid rear slot the rear archetype's height. A fully independent
  // suspension keeps the merged (front) value, which is zero for every
  // independent archetype, so the stock behavior is unchanged.
  if (specOverride.frontAxleCoupling === 'rigidAxle') {
    specOverride.solidAxleRollCenterHeightMeters =
      suspensionFrontComponent?.spec?.solidAxleRollCenterHeightMeters ?? 0
  } else if (specOverride.rearAxleCoupling === 'rigidAxle') {
    specOverride.solidAxleRollCenterHeightMeters =
      suspensionRearComponent?.spec?.solidAxleRollCenterHeightMeters ?? 0
  }

  return {
    spec: specOverride,
    engineId,
    transmissionId,
  }
}

export function createControllerConfig(configuration, context = {}) {
  const vehicle = context.vehicle
  const terrainContactQuery = context.terrainContactQuery

  if (!vehicle) {
    throw new Error('createControllerConfig requires a vehicle object')
  }

  const applied = applyVehicleConfiguration(configuration, {
    defaultEngineId: context.defaultEngineId,
    defaultTransmissionId: context.defaultTransmissionId,
  })

  const controllerConfig = {
    vehicle,
    spec: applied.spec,
    engineId: applied.engineId,
    transmissionId: applied.transmissionId,
  }

  if (terrainContactQuery) {
    controllerConfig.terrainContactQuery = terrainContactQuery
  }

  if (context.startPosition) {
    controllerConfig.startPosition = context.startPosition
  }

  if (context.startRotation) {
    controllerConfig.startRotation = context.startRotation
  }

  return controllerConfig
}