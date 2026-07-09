// src/ui/developerTuningPanel/createDeveloperTuningPanel.js

const SLIDER_DEFINITIONS = Object.freeze([
  Object.freeze({
    key: 'driveTorqueMultiplier',
    label: 'Drive torque',
    defaultValue: 1,
    min: 0.25,
    max: 5,
    step: 0.05,
  }),
  Object.freeze({
    key: 'serviceBrakeTorqueMultiplier',
    label: 'Brake torque',
    defaultValue: 1,
    min: 0.25,
    max: 5,
    step: 0.05,
  }),
  Object.freeze({
    key: 'longitudinalTireStiffnessMultiplier',
    label: 'Tire stiffness',
    defaultValue: 1,
    min: 0.25,
    max: 4,
    step: 0.05,
  }),
])

export function createDeveloperTuningPanel(config = {}) {
  const parent = config.parent ?? document.body
  const onDynamicsTuningChange = config.onDynamicsTuningChange ?? (() => {})
  const onReset = config.onReset ?? (() => {})

  const root = document.createElement('div')
  root.id = config.id ?? 'developer-dynamics-tuning-panel'

  const header = document.createElement('div')
  const title = document.createElement('div')
  title.textContent = 'Developer Dynamics Tuning'

  const collapseButton = document.createElement('button')
  collapseButton.type = 'button'
  collapseButton.textContent = 'Collapse'

  const body = document.createElement('div')
  const sliderNodes = new Map()
  const resetButton = document.createElement('button')
  resetButton.type = 'button'
  resetButton.textContent = 'Reset dynamics tuning'

  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '15',
    top: config.top ?? '188px',
    right: config.right ?? '12px',
    width: '238px',
    padding: '10px 12px',
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: '12px',
    lineHeight: '1.35',
    color: '#e8e8e8',
    background: 'rgba(0, 0, 0, 0.68)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    borderRadius: '8px',
    pointerEvents: 'auto',
    userSelect: 'none',
  })

  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '8px',
  })

  Object.assign(title.style, {
    fontSize: '12px',
    fontWeight: '700',
    color: '#f3f3f3',
  })

  const buttonStyle = {
    padding: '4px 8px',
    font: 'inherit',
    fontSize: '11px',
    color: '#e8e8e8',
    background: 'rgba(255, 255, 255, 0.12)',
    border: '1px solid rgba(255, 255, 255, 0.25)',
    borderRadius: '5px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  Object.assign(collapseButton.style, buttonStyle)
  Object.assign(resetButton.style, buttonStyle, {
    marginTop: '8px',
    width: '100%',
  })

  for (const sliderDefinition of SLIDER_DEFINITIONS) {
    const row = document.createElement('label')
    const labelRow = document.createElement('div')
    const label = document.createElement('span')
    const value = document.createElement('span')
    const slider = document.createElement('input')

    label.textContent = sliderDefinition.label
    slider.type = 'range'
    slider.min = String(sliderDefinition.min)
    slider.max = String(sliderDefinition.max)
    slider.step = String(sliderDefinition.step)

    Object.assign(row.style, {
      display: 'block',
      margin: '0 0 8px 0',
    })

    Object.assign(labelRow.style, {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: '8px',
      marginBottom: '3px',
    })

    Object.assign(label.style, {
      color: 'rgba(255, 255, 255, 0.78)',
    })

    Object.assign(value.style, {
      fontWeight: '700',
      color: '#f3f3f3',
    })

    Object.assign(slider.style, {
      width: '100%',
      margin: '0',
    })

    slider.addEventListener('input', handleSliderInput)

    labelRow.appendChild(label)
    labelRow.appendChild(value)
    row.appendChild(labelRow)
    row.appendChild(slider)
    body.appendChild(row)

    sliderNodes.set(sliderDefinition.key, {
      definition: sliderDefinition,
      slider,
      value,
    })
  }

  header.appendChild(title)
  header.appendChild(collapseButton)
  body.appendChild(resetButton)
  root.appendChild(header)
  root.appendChild(body)
  parent.appendChild(root)

  let collapsed = false
  let currentDynamicsTuning = normalizeDynamicsTuning(
    config.initialDynamicsTuning
  )

  function update(dynamicsTuning = currentDynamicsTuning) {
    currentDynamicsTuning = normalizeDynamicsTuning(dynamicsTuning)

    for (const [key, nodes] of sliderNodes) {
      const value = currentDynamicsTuning[key]
      nodes.slider.value = String(value)
      nodes.value.textContent = `x${formatNumber(value, 2)}`
    }
  }

  function setCollapsed(nextCollapsed) {
    collapsed = nextCollapsed
    body.style.display = collapsed ? 'none' : 'block'
    collapseButton.textContent = collapsed ? 'Expand' : 'Collapse'
  }

  function getDynamicsTuning() {
    return { ...currentDynamicsTuning }
  }

  function handleSliderInput() {
    const nextDynamicsTuning = {}

    for (const [key, nodes] of sliderNodes) {
      nextDynamicsTuning[key] = Number(nodes.slider.value)
    }

    currentDynamicsTuning = normalizeDynamicsTuning(nextDynamicsTuning)
    update(currentDynamicsTuning)
    onDynamicsTuningChange(getDynamicsTuning())
  }

  function handleResetClick() {
    onReset()
  }

  function handleCollapseClick() {
    setCollapsed(!collapsed)
  }

  function destroy() {
    for (const nodes of sliderNodes.values()) {
      nodes.slider.removeEventListener('input', handleSliderInput)
    }

    resetButton.removeEventListener('click', handleResetClick)
    collapseButton.removeEventListener('click', handleCollapseClick)
    root.remove()
  }

  resetButton.addEventListener('click', handleResetClick)
  collapseButton.addEventListener('click', handleCollapseClick)

  update(currentDynamicsTuning)

  return {
    update,
    setCollapsed,
    getDynamicsTuning,
    destroy,
  }
}

function normalizeDynamicsTuning(dynamicsTuning = {}) {
  const normalizedDynamicsTuning = {}

  for (const sliderDefinition of SLIDER_DEFINITIONS) {
    normalizedDynamicsTuning[sliderDefinition.key] = sanitizeMultiplier(
      dynamicsTuning[sliderDefinition.key],
      sliderDefinition
    )
  }

  return normalizedDynamicsTuning
}

function sanitizeMultiplier(value, sliderDefinition) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) return sliderDefinition.defaultValue

  return Math.min(
    Math.max(numericValue, sliderDefinition.min),
    sliderDefinition.max
  )
}

function formatNumber(value, digits) {
  if (!Number.isFinite(value)) return '--'

  return value.toFixed(digits)
}