// src/vehicle/ui/createCustomizationUI.js

/**
 * Minimal driver/explorer-facing vehicle customization UI (Phase 4).
 *
 * Renders one dropdown per component slot and a "Reset to Default" button. It
 * is physics-exploration only: it never touches the simulation directly. Slot
 * changes are reported through onChange(newConfiguration); the caller (main.js,
 * offroad mode only) rebuilds the vehicle controller from the new configuration.
 * Reset reports through onReset(); the caller rebuilds from the default
 * configuration and reflects it back via setConfiguration.
 *
 * The panel is intentionally created only in offroad modes so the proving-ground
 * path is never affected.
 */

import {
  VEHICLE_COMPONENT_SLOTS,
  VEHICLE_COMPONENT_CATALOG,
} from '../config/componentCatalog.js'
import {
  cloneVehicleConfiguration,
  createDefaultVehicleConfiguration,
  setVehicleConfigurationSlot,
} from '../config/createVehicleConfiguration.js'

const SLOT_LABELS = Object.freeze({
  chassis: 'Chassis',
  suspension: 'Suspension',
  wheels: 'Wheels',
  drivetrain: 'Drivetrain',
  brakes: 'Brakes',
  aero: 'Aero',
})

function slotLabel(slot) {
  return SLOT_LABELS[slot] ?? slot
}

export function createCustomizationUI(config = {}) {
  const initialConfiguration = config.configuration
    ? cloneVehicleConfiguration(config.configuration)
    : createDefaultVehicleConfiguration()
  const onChange = typeof config.onChange === 'function' ? config.onChange : () => {}
  const onReset = typeof config.onReset === 'function' ? config.onReset : () => {}

  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.top = '8px'
  container.style.right = '8px'
  container.style.zIndex = '10'
  container.style.color = '#dddddd'
  container.style.font = '12px monospace'
  container.style.background = 'rgba(0, 0, 0, 0.45)'
  container.style.padding = '6px 8px'
  container.style.borderRadius = '4px'

  let activeConfiguration = cloneVehicleConfiguration(initialConfiguration)
  const slotSelects = {}

  const title = document.createElement('div')
  title.textContent = 'Vehicle Builder'
  title.style.marginBottom = '4px'
  container.appendChild(title)

  for (const slot of VEHICLE_COMPONENT_SLOTS) {
    const slotEntry = VEHICLE_COMPONENT_CATALOG[slot]
    if (!slotEntry) continue

    const row = document.createElement('div')

    const label = document.createElement('label')
    label.textContent = slotLabel(slot) + ': '

    const select = document.createElement('select')

    for (const componentId of Object.keys(slotEntry.components)) {
      const option = document.createElement('option')
      option.value = componentId
      option.textContent = slotEntry.components[componentId].label
      if (componentId === activeConfiguration.slots[slot]) {
        option.selected = true
      }
      select.appendChild(option)
    }

    select.addEventListener('change', () => {
      activeConfiguration = setVehicleConfigurationSlot(activeConfiguration, slot, select.value)
      onChange(cloneVehicleConfiguration(activeConfiguration))
    })

    slotSelects[slot] = select
    label.appendChild(select)
    row.appendChild(label)
    container.appendChild(row)
  }

  const resetButton = document.createElement('button')
  resetButton.textContent = 'Reset to Default'
  resetButton.style.marginTop = '4px'
  resetButton.addEventListener('click', () => {
    onReset()
  })
  container.appendChild(resetButton)

  document.body.appendChild(container)

  function getConfiguration() {
    return cloneVehicleConfiguration(activeConfiguration)
  }

  function setConfiguration(nextConfiguration) {
    activeConfiguration = cloneVehicleConfiguration(nextConfiguration)
    for (const slot of VEHICLE_COMPONENT_SLOTS) {
      const select = slotSelects[slot]
      if (select) {
        select.value = activeConfiguration.slots[slot]
      }
    }
    return cloneVehicleConfiguration(activeConfiguration)
  }

  function destroy() {
    if (container.parentNode) {
      container.parentNode.removeChild(container)
    }
  }

  return {
    container,
    getConfiguration,
    setConfiguration,
    destroy,
    slotSelects,
  }
}
