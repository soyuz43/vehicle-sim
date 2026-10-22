// src/vehicle/config/deriveActiveVehicleConfiguration.js

/**
 * Derive the active catalog selection from a running vehicle state.
 *
 * The vehicle controller can be reconfigured from outside the catalog API:
 * the browser console, the control panel, and a future live terrain swap all
 * reach the controller directly. The controller therefore does not always
 * know which catalog component it is running, and a stored selection would
 * go stale as soon as something else changed the vehicle.
 *
 * This module answers the question from the EFFECTIVE state instead: the
 * spec fields the slot owns, plus the engine profile id, the transmission
 * profile id, and the rear differential type for the drivetrain slot.
 *
 * The matching rule is the rule the apply path uses. Selecting a component
 * REPLACES the spec fields it owns, and a field the component does not
 * declare falls back to DEFAULT_VEHICLE_SPEC. The rear differential is the
 * one field with a second home: the differential state wins for the
 * physics, and the spec field only shadows it for the snapshot.
 *
 * A slot whose effective state matches no catalog component is reported as
 * null. That is an honest answer, not a failure: the vehicle is running a
 * combination the catalog does not describe, for example a manual gearbox
 * on the stock inline-4.
 */

import {
  AERO_OWNED_SPEC_FIELDS,
  BRAKES_OWNED_SPEC_FIELDS,
  CHASSIS_OWNED_SPEC_FIELDS,
  DRIVETRAIN_OWNED_SPEC_FIELDS,
  SUSPENSION_OWNED_SPEC_FIELDS,
  VEHICLE_COMPONENT_CATALOG,
  VEHICLE_COMPONENT_SLOTS,
  WHEELS_OWNED_SPEC_FIELDS,
} from './componentCatalog.js'
import { VEHICLE_CONFIGURATION_VERSION } from './createVehicleConfiguration.js'
import { DEFAULT_VEHICLE_SPEC } from '../defaultVehicleSpec.js'

const SLOT_OWNED_SPEC_FIELDS = Object.freeze({
  chassis: CHASSIS_OWNED_SPEC_FIELDS,
  suspension: SUSPENSION_OWNED_SPEC_FIELDS,
  wheels: WHEELS_OWNED_SPEC_FIELDS,
  drivetrain: DRIVETRAIN_OWNED_SPEC_FIELDS,
  brakes: BRAKES_OWNED_SPEC_FIELDS,
  aero: AERO_OWNED_SPEC_FIELDS,
})

// Derive the catalog configuration the vehicle is effectively running.
//
// The returned slots map each catalog slot to the component id that matches
// the effective state, or to null when no component matches.
export function deriveActiveVehicleConfiguration(effectiveState = {}) {
  const state = {
    spec: effectiveState.spec ?? {},
    engineProfileId: effectiveState.engineProfileId ?? null,
    transmissionProfileId: effectiveState.transmissionProfileId ?? null,
    rearDifferentialType: effectiveState.rearDifferentialType ?? null,
  }

  const slots = {}

  for (const slot of VEHICLE_COMPONENT_SLOTS) {
    slots[slot] = findActiveComponentId(slot, state)
  }

  return {
    version: VEHICLE_CONFIGURATION_VERSION,
    slots,
  }
}

function findActiveComponentId(slot, effectiveState) {
  const catalogEntry = VEHICLE_COMPONENT_CATALOG[slot]
  if (!catalogEntry) return null

  const matches = []

  for (const [componentId, component] of Object.entries(catalogEntry.components)) {
    if (componentMatchesEffectiveState(slot, component, effectiveState)) {
      matches.push(componentId)
    }
  }

  // Exactly one match is the normal case: the catalog components of a slot
  // have distinct effective values. No match means the vehicle is running a
  // state the catalog does not describe, and more than one match means the
  // effective state cannot tell the components apart. Both are reported as
  // null, because a component id the state does not identify would be a lie.
  if (matches.length !== 1) return null

  return matches[0]
}

function componentMatchesEffectiveState(slot, component, effectiveState) {
  const ownedFields = SLOT_OWNED_SPEC_FIELDS[slot] ?? []

  for (const field of ownedFields) {
    const declared = component.spec?.[field]
    const expected =
      declared === undefined || declared === null
        ? DEFAULT_VEHICLE_SPEC[field]
        : declared

    if (effectiveSpecValue(field, effectiveState) !== expected) {
      return false
    }
  }

  if (slot === 'drivetrain') {
    if (effectiveState.engineProfileId !== component.engineId) return false
    if (effectiveState.transmissionProfileId !== component.transmissionId) {
      return false
    }
  }

  return true
}

// The effective value of a spec field.
//
// The rear differential is the exception: the differential state wins for
// the physics, so the state value is the effective one and the spec field
// is only a shadow kept for the snapshot.
function effectiveSpecValue(field, effectiveState) {
  if (field === 'rearDifferentialType') {
    return (
      effectiveState.rearDifferentialType ??
      effectiveState.spec.rearDifferentialType
    )
  }

  return effectiveState.spec[field]
}
