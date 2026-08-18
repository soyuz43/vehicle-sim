// src/vehicle/config/createVehicleConfiguration.js

/**
 * Vehicle configuration schema for Phase 4 customization.
 *
 * A configuration is a selection of one component per slot (see
 * componentCatalog.js). This module owns the canonical default configuration,
 * validation, cloning, equality, and reset-to-default behavior. It contains no
 * physics: applyVehicleConfiguration.js turns a configuration into the spec
 * override and powertrain identifiers consumed by the vehicle controller.
 *
 * The default configuration reproduces DEFAULT_VEHICLE_SPEC exactly so that the
 * offroad playground starts identical to the proving-ground path and the
 * reset-to-default control restores that baseline.
 */

import {
  VEHICLE_COMPONENT_SLOTS,
  VEHICLE_COMPONENT_CATALOG,
  getComponent,
  getDefaultComponentId,
} from './componentCatalog.js'

export const VEHICLE_CONFIGURATION_VERSION = 1

export function createDefaultVehicleConfiguration() {
  const slots = {}

  for (const slot of VEHICLE_COMPONENT_SLOTS) {
    slots[slot] = getDefaultComponentId(slot)
  }

  return {
    version: VEHICLE_CONFIGURATION_VERSION,
    slots,
  }
}

export function cloneVehicleConfiguration(configuration) {
  if (!configuration || typeof configuration !== 'object') {
    return createDefaultVehicleConfiguration()
  }

  return {
    version: VEHICLE_CONFIGURATION_VERSION,
    slots: { ...(configuration.slots ?? {}) },
  }
}

export function validateVehicleConfiguration(configuration) {
  const errors = []

  if (!configuration || typeof configuration !== 'object') {
    return {
      valid: false,
      errors: ['configuration must be an object with a slots map'],
    }
  }

  const slots = configuration.slots ?? {}

  for (const slot of VEHICLE_COMPONENT_SLOTS) {
    const selectedId = slots[slot]
    const slotEntry = VEHICLE_COMPONENT_CATALOG[slot]

    if (typeof selectedId !== 'string') {
      errors.push('slot "' + slot + '" is missing a component id')
      continue
    }

    if (!slotEntry || !slotEntry.components[selectedId]) {
      errors.push('slot "' + slot + '" has unknown component id "' + selectedId + '"')
    }
  }

  for (const slot of Object.keys(slots)) {
    if (!VEHICLE_COMPONENT_SLOTS.includes(slot)) {
      errors.push('unknown configuration slot "' + slot + '"')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function areVehicleConfigurationsEqual(left, right) {
  if (!left || !right) return left === right
  if (!left.slots || !right.slots) return false

  for (const slot of VEHICLE_COMPONENT_SLOTS) {
    if (left.slots[slot] !== right.slots[slot]) return false
  }

  return true
}

export function setVehicleConfigurationSlot(configuration, slot, componentId) {
  const existing = cloneVehicleConfiguration(configuration)
  const slotEntry = VEHICLE_COMPONENT_CATALOG[slot]

  if (!slotEntry) {
    throw new Error('unknown configuration slot: ' + String(slot))
  }

  if (!slotEntry.components[componentId]) {
    throw new Error('unknown component id "' + String(componentId) + '" for slot "' + slot + '"')
  }

  existing.slots[slot] = componentId
  return existing
}

export function getVehicleConfigurationSlot(configuration, slot) {
  return configuration?.slots?.[slot] ?? null
}

export function resetVehicleConfigurationToDefault(configuration) {
  void configuration
  return createDefaultVehicleConfiguration()
}

export function isDefaultVehicleConfiguration(configuration) {
  return areVehicleConfigurationsEqual(configuration, createDefaultVehicleConfiguration())
}
