// src/rocket/createRocketPanel.js

import { createPanel } from '../ui/design-system/components/Panel.js'
import { createValueDisplay } from '../ui/design-system/components/ValueDisplay.js'
import { createHStack, createVStack } from '../ui/design-system/layout/Stack.js'

// Driver-facing rocket readout.
//
// The panel shows what the vehicle on the pad is doing, not why: altitude,
// speed, remaining mass, thrust, tilt, and how many stages have separated.
// The physics reasons live in the developer tooling, not here.

const MODE_HINT_TEXT =
  'SPACE / T ignite  |  X separate stage  |  F arm fins  |  W A S D steer  |  M car  |  R reset'

export function createRocketPanel(config = {}) {
  const panel = createPanel({
    id: 'rocket-panel',
    title: 'Rocket',
    anchor: config.anchor ?? 'bottom-center',
    collapsible: true,
    draggable: true,
    initiallyCollapsed: false,
    width: 320,
    minWidth: 280,
    maxWidth: 420,
  })

  const content = panel.content
  content.style.padding = 'var(--ui-space-sm)'
  content.style.display = 'flex'
  content.style.flexDirection = 'column'
  content.style.gap = 'var(--ui-space-sm)'

  const topRow = createHStack({ gap: 'var(--ui-space-md)', justify: 'space-between' })
  const bottomRow = createHStack({ gap: 'var(--ui-space-md)', justify: 'space-between' })

  const altitudeDisplay = createValueDisplay({
    id: 'rocket-altitude',
    label: 'Altitude',
    value: 0,
    unit: 'm',
    size: 'lg',
    precision: 1,
    format: (value) => (Number.isFinite(value) ? value.toFixed(1) : '--'),
  })
  const verticalSpeedDisplay = createValueDisplay({
    id: 'rocket-vertical-speed',
    label: 'Vertical Speed',
    value: 0,
    unit: 'm/s',
    size: 'lg',
    precision: 1,
    format: (value) => (Number.isFinite(value) ? value.toFixed(1) : '--'),
  })
  const speedDisplay = createValueDisplay({
    id: 'rocket-speed',
    label: 'Speed',
    value: 0,
    unit: 'm/s',
    size: 'md',
    precision: 1,
    format: (value) => (Number.isFinite(value) ? value.toFixed(1) : '--'),
  })
  const massDisplay = createValueDisplay({
    id: 'rocket-mass',
    label: 'Mass',
    value: 0,
    unit: 'kg',
    size: 'md',
    precision: 0,
    format: (value) => (Number.isFinite(value) ? value.toFixed(0) : '--'),
  })
  const thrustDisplay = createValueDisplay({
    id: 'rocket-thrust',
    label: 'Thrust',
    value: 0,
    unit: 'N',
    size: 'md',
    precision: 0,
    format: (value) => (Number.isFinite(value) ? value.toFixed(0) : '--'),
  })
  const tiltDisplay = createValueDisplay({
    id: 'rocket-tilt',
    label: 'Tilt',
    value: 0,
    unit: 'deg',
    size: 'md',
    precision: 1,
    format: (value) => (Number.isFinite(value) ? value.toFixed(1) : '--'),
  })
  const stageDisplay = createValueDisplay({
    id: 'rocket-stages',
    label: 'Stages',
    value: 0,
    unit: 'sep',
    size: 'md',
    precision: 0,
    format: (value) => (Number.isFinite(value) ? value.toFixed(0) : '--'),
  })

  topRow.appendChild(altitudeDisplay.element)
  topRow.appendChild(verticalSpeedDisplay.element)
  bottomRow.appendChild(speedDisplay.element)
  bottomRow.appendChild(massDisplay.element)
  bottomRow.appendChild(thrustDisplay.element)
  bottomRow.appendChild(tiltDisplay.element)
  bottomRow.appendChild(stageDisplay.element)
  content.appendChild(topRow)
  content.appendChild(bottomRow)

  const hint = document.createElement('div')
  hint.textContent = MODE_HINT_TEXT
  hint.style.fontSize = 'var(--ui-typeScale-xs)'
  hint.style.color = 'var(--ui-color-text-muted)'
  hint.style.fontFamily = 'var(--ui-font-mono)'
  content.appendChild(hint)

  const stateText = document.createElement('div')
  stateText.textContent = 'Motor off'
  stateText.style.fontSize = 'var(--ui-typeScale-xs)'
  stateText.style.color = 'var(--ui-color-text-secondary)'
  stateText.style.fontFamily = 'var(--ui-font-mono)'
  content.appendChild(stateText)

  function update(telemetry) {
    if (!telemetry) return

    altitudeDisplay.setValue(telemetry.altitudeMeters)
    verticalSpeedDisplay.setValue(telemetry.verticalSpeedMetersPerSecond)
    speedDisplay.setValue(telemetry.speedMetersPerSecond)
    massDisplay.setValue(telemetry.massKg)
    thrustDisplay.setValue(telemetry.thrustNewtons)
    tiltDisplay.setValue((telemetry.attitudeErrorRadians * 180) / Math.PI)
    stageDisplay.setValue(telemetry.debrisCount)

    const motorText = telemetry.motorIgnited ? 'Motor burning' : 'Motor off'
    const finText = telemetry.finsEnabled ? 'Fins armed' : 'Fins disarmed'
    stateText.textContent = `${motorText} | ${finText}`
    stateText.style.color = telemetry.motorIgnited
      ? 'var(--ui-color-semantic-warning)'
      : 'var(--ui-color-text-secondary)'
  }

  return {
    element: panel.element,
    panel,
    update,
    collapse: () => panel.collapse(true),
    expand: () => panel.collapse(false),
    toggle: panel.toggle,
    isCollapsed: panel.isCollapsed,
    destroy: () => panel.destroy(),
  }
}