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
  VEHICLE_COMPONENT_SLOTS,
  getComponent,
} from './componentCatalog.js'
import { validateVehicleConfiguration } from './createVehicleConfiguration.js'

function mergeComponentSpec(target, component) {
  const specContribution = component?.spec

  if (!specContribution || typeof specContribution !== 'object') return

  for (const key of Object.keys(specContribution)) {
    // 'axleCoupling' is a component-declared archetype value, not a spec
    // field. The slot selection derives 'frontAxleCoupling' and
    // 'rearAxleCoupling' from it below.
    if (key === 'axleCoupling') continue

    const value = specContribution[key]

    if (value !== undefined && value !== null) {
      target[key] = value
    }
  }
}

export function applyVehicleConfiguration(configuration, options = {}) {
  const validation = validateVehicleConfiguration(configuration)
  if (!validation.valid) {
    throw new Error('invalid vehicle configuration: ' + validation.errors.join('; '))
  }

  const specOverride = {}
  let engineId = options?.defaultEngineId ?? null
  let transmissionId = options?.defaultTransmissionId ?? null

  for (const slot of VEHICLE_COMPONENT_SLOTS) {
    const componentId = configuration.slots?.[slot]
    const component = getComponent(slot, componentId)

    if (!component) continue

    // Phase A limitation: the flat physical suspension fields are owned by
    // the front slot, so the rear slot merges no physical fields until
    // per-axle consumption lands.
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
  // selected. 'axleCoupling' itself never reaches the spec: the runtime
  // spec keeps the two derived per-axle fields the axle coupling state
  // has always read.
  const suspensionFrontComponent = getComponent(
    'suspensionFront',
    configuration.slots?.suspensionFront
  )
  const suspensionRearComponent = getComponent(
    'suspensionRear',
    configuration.slots?.suspensionRear
  )
  specOverride.frontAxleCoupling =
    suspensionFrontComponent?.spec?.axleCoupling ?? 'independent'
  specOverride.rearAxleCoupling =
    suspensionRearComponent?.spec?.axleCoupling ?? 'independent'

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
