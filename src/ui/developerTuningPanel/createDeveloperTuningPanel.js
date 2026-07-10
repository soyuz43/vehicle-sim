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

const REAR_DIFFERENTIAL_OPTIONS = Object.freeze([
  Object.freeze({ key: 'open', label: 'Open' }),
  Object.freeze({ key: 'limited-slip', label: 'Limited-slip' }),
  Object.freeze({ key: 'torsen', label: 'Torsen' }),
  Object.freeze({ key: 'locked', label: 'Locked' }),
  Object.freeze({ key: 'welded', label: 'Welded' }),
])

export function createDeveloperTuningPanel(config = {}) {
  const parent = config.parent ?? document.body
  const onDynamicsTuningChange = config.onDynamicsTuningChange ?? (() => {})
  const onRearDifferentialTypeChange =
    config.onRearDifferentialTypeChange ?? (() => {})
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
  const differentialSection = document.createElement('div')
  const differentialLabelRow = document.createElement('div')
  const differentialLabel = document.createElement('span')
  differentialLabel.textContent = 'Rear differential'
  const differentialSelect = document.createElement('select')
  const differentialStatus = document.createElement('div')
  const sliderNodes = new Map()
  const resetButton = document.createElement('button')
  resetButton.type = 'button'
  resetButton.textContent = 'Reset dynamics tuning'

  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '15',
    top: config.top ?? '188px',
    right: config.right ?? '12px',
    width: '258px',
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

  Object.assign(differentialSection.style, {
    margin: '0 0 10px 0',
    padding: '0 0 8px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
  })

  Object.assign(differentialLabelRow.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '4px',
  })

  Object.assign(differentialLabel.style, {
    color: 'rgba(255, 255, 255, 0.78)',
  })

  Object.assign(differentialSelect.style, {
    width: '126px',
    padding: '3px 5px',
    font: 'inherit',
    fontSize: '11px',
    color: '#f3f3f3',
    background: 'rgba(255, 255, 255, 0.12)',
    border: '1px solid rgba(255, 255, 255, 0.25)',
    borderRadius: '5px',
  })

  Object.assign(differentialStatus.style, {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.72)',
  })

  differentialSelect.addEventListener('change', handleRearDifferentialSelectChange)
  differentialLabelRow.appendChild(differentialLabel)
  differentialLabelRow.appendChild(differentialSelect)
  differentialSection.appendChild(differentialLabelRow)
  differentialSection.appendChild(differentialStatus)
  body.appendChild(differentialSection)

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
  let currentRearDifferentialState = normalizeRearDifferentialState(
    config.initialRearDifferentialState
  )

  function update(
    dynamicsTuning = currentDynamicsTuning,
    rearDifferentialState = currentRearDifferentialState
  ) {
    currentDynamicsTuning = normalizeDynamicsTuning(dynamicsTuning)
    currentRearDifferentialState = normalizeRearDifferentialState(
      rearDifferentialState
    )

    for (const [key, nodes] of sliderNodes) {
      const value = currentDynamicsTuning[key]
      nodes.slider.value = String(value)
      nodes.value.textContent = `x${formatNumber(value, 2)}`
    }

    syncRearDifferentialOptions(
      differentialSelect,
      currentRearDifferentialState.rearDifferentialAvailableTypes
    )
    differentialSelect.value = currentRearDifferentialState.rearDifferentialType
    differentialStatus.textContent = formatRearDifferentialTelemetry(
      currentRearDifferentialState
    )
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
    update(currentDynamicsTuning, currentRearDifferentialState)
    onDynamicsTuningChange(getDynamicsTuning())
  }

  function handleRearDifferentialSelectChange() {
    currentRearDifferentialState = normalizeRearDifferentialState({
      ...currentRearDifferentialState,
      rearDifferentialType: differentialSelect.value,
    })
    update(currentDynamicsTuning, currentRearDifferentialState)
    onRearDifferentialTypeChange(currentRearDifferentialState.rearDifferentialType)
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

    differentialSelect.removeEventListener(
      'change',
      handleRearDifferentialSelectChange
    )
    resetButton.removeEventListener('click', handleResetClick)
    collapseButton.removeEventListener('click', handleCollapseClick)
    root.remove()
  }

  resetButton.addEventListener('click', handleResetClick)
  collapseButton.addEventListener('click', handleCollapseClick)

  update(currentDynamicsTuning, currentRearDifferentialState)

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

function normalizeRearDifferentialState(rearDifferentialState = {}) {
  const rearDifferentialAvailableTypes =
    normalizeRearDifferentialAvailableTypes(
      rearDifferentialState.rearDifferentialAvailableTypes
    )
  const rearDifferentialType = rearDifferentialAvailableTypes.includes(
    rearDifferentialState.rearDifferentialType
  )
    ? rearDifferentialState.rearDifferentialType
    : 'open'

  return {
    rearDifferentialAvailableTypes,
    rearDifferentialType,
    rearDifferentialModeLabel:
      rearDifferentialState.rearDifferentialModeLabel ??
      getRearDifferentialLabel(rearDifferentialType),
    rearDifferentialLeftShare01: clamp01(
      rearDifferentialState.rearDifferentialLeftShare01 ?? 0.5
    ),
    rearDifferentialRightShare01: clamp01(
      rearDifferentialState.rearDifferentialRightShare01 ?? 0.5
    ),
    rearDifferentialLeftAngularVelocityRadiansPerSecond: Number.isFinite(
      rearDifferentialState.rearDifferentialLeftAngularVelocityRadiansPerSecond
    )
      ? rearDifferentialState.rearDifferentialLeftAngularVelocityRadiansPerSecond
      : 0,
    rearDifferentialRightAngularVelocityRadiansPerSecond: Number.isFinite(
      rearDifferentialState.rearDifferentialRightAngularVelocityRadiansPerSecond
    )
      ? rearDifferentialState.rearDifferentialRightAngularVelocityRadiansPerSecond
      : 0,
    rearDifferentialWheelSpeedDifferenceRadiansPerSecond: Number.isFinite(
      rearDifferentialState.rearDifferentialWheelSpeedDifferenceRadiansPerSecond
    )
      ? rearDifferentialState.rearDifferentialWheelSpeedDifferenceRadiansPerSecond
      : 0,
    rearDifferentialWheelSpeedDifferenceAbsRadiansPerSecond: Number.isFinite(
      rearDifferentialState.rearDifferentialWheelSpeedDifferenceAbsRadiansPerSecond
    )
      ? rearDifferentialState.rearDifferentialWheelSpeedDifferenceAbsRadiansPerSecond
      : 0,
    rearDifferentialTorqueBiasRatio: Number.isFinite(
      rearDifferentialState.rearDifferentialTorqueBiasRatio
    )
      ? rearDifferentialState.rearDifferentialTorqueBiasRatio
      : 0,
    rearDifferentialCouplingState:
      rearDifferentialState.rearDifferentialCouplingState ?? 'idle',
    rearDifferentialLeftCouplingTorqueNewtonMeters: Number.isFinite(
      rearDifferentialState.rearDifferentialLeftCouplingTorqueNewtonMeters
    )
      ? rearDifferentialState.rearDifferentialLeftCouplingTorqueNewtonMeters
      : 0,
    rearDifferentialRightCouplingTorqueNewtonMeters: Number.isFinite(
      rearDifferentialState.rearDifferentialRightCouplingTorqueNewtonMeters
    )
      ? rearDifferentialState.rearDifferentialRightCouplingTorqueNewtonMeters
      : 0,
    rearDifferentialCommonAngularVelocityRadiansPerSecond: Number.isFinite(
      rearDifferentialState.rearDifferentialCommonAngularVelocityRadiansPerSecond
    )
      ? rearDifferentialState.rearDifferentialCommonAngularVelocityRadiansPerSecond
      : 0,
    rearDifferentialLimitedSlipCouplingFraction01: clamp01(
      rearDifferentialState.rearDifferentialLimitedSlipCouplingFraction01 ?? 0
    ),
    isRearDifferentialBiasing:
      rearDifferentialState.isRearDifferentialBiasing === true,
    isRearDifferentialLockedApproximation:
      rearDifferentialState.isRearDifferentialLockedApproximation === true,
    isRearDifferentialHardSpeedCouplingApplied:
      rearDifferentialState.isRearDifferentialHardSpeedCouplingApplied === true,
  }
}

function normalizeRearDifferentialAvailableTypes(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return REAR_DIFFERENTIAL_OPTIONS.map((option) => option.key)
  }

  const normalizedTypes = value.filter((type) =>
    REAR_DIFFERENTIAL_OPTIONS.some((option) => option.key === type)
  )

  return normalizedTypes.length > 0
    ? [...new Set(normalizedTypes)]
    : REAR_DIFFERENTIAL_OPTIONS.map((option) => option.key)
}

function syncRearDifferentialOptions(selectNode, availableTypes) {
  const availableTypeSet = new Set(availableTypes)
  const existingValues = Array.from(selectNode.options).map(
    (option) => option.value
  )

  if (
    existingValues.length === availableTypes.length &&
    existingValues.every((value, index) => value === availableTypes[index])
  ) {
    return
  }

  selectNode.replaceChildren()

  for (const option of REAR_DIFFERENTIAL_OPTIONS) {
    if (!availableTypeSet.has(option.key)) continue

    const optionNode = document.createElement('option')
    optionNode.value = option.key
    optionNode.textContent = option.label
    selectNode.appendChild(optionNode)
  }
}

function formatRearDifferentialTelemetry(rearDifferentialState = {}) {
  const leftPercent = Math.round(
    clamp01(rearDifferentialState.rearDifferentialLeftShare01 ?? 0.5) * 100
  )
  const rightPercent = Math.max(0, 100 - leftPercent)
  const absoluteWheelSpeedDifferenceRadiansPerSecond = Math.abs(
    Number.isFinite(
      rearDifferentialState.rearDifferentialWheelSpeedDifferenceAbsRadiansPerSecond
    )
      ? rearDifferentialState.rearDifferentialWheelSpeedDifferenceAbsRadiansPerSecond
      : rearDifferentialState.rearDifferentialWheelSpeedDifferenceRadiansPerSecond ?? 0
  )
  const couplingTorqueNewtonMeters = Math.max(
    Math.abs(
      Number.isFinite(
        rearDifferentialState.rearDifferentialLeftCouplingTorqueNewtonMeters
      )
        ? rearDifferentialState.rearDifferentialLeftCouplingTorqueNewtonMeters
        : 0
    ),
    Math.abs(
      Number.isFinite(
        rearDifferentialState.rearDifferentialRightCouplingTorqueNewtonMeters
      )
        ? rearDifferentialState.rearDifferentialRightCouplingTorqueNewtonMeters
        : 0
    )
  )
  const suffixes = [
    `dOmega ${formatNumber(absoluteWheelSpeedDifferenceRadiansPerSecond, 2)} rad/s`,
  ]

  if (
    rearDifferentialState.rearDifferentialType === 'torsen' &&
    Number.isFinite(rearDifferentialState.rearDifferentialTorqueBiasRatio) &&
    rearDifferentialState.rearDifferentialTorqueBiasRatio > 0
  ) {
    suffixes.push(
      `TBR ${formatNumber(rearDifferentialState.rearDifferentialTorqueBiasRatio, 2)}`
    )
  }

  if (couplingTorqueNewtonMeters > 0.001) {
    suffixes.push(`coupling ${formatNumber(couplingTorqueNewtonMeters, 0)} N*m`)
  }

  if (rearDifferentialState.isRearDifferentialHardSpeedCouplingApplied) {
    suffixes.push('constrained')
  } else if (
    rearDifferentialState.rearDifferentialCouplingState &&
    rearDifferentialState.rearDifferentialCouplingState !== 'idle' &&
    rearDifferentialState.rearDifferentialCouplingState !== 'uncoupled'
  ) {
    suffixes.push(rearDifferentialState.rearDifferentialCouplingState)
  }

  if (rearDifferentialState.isRearDifferentialBiasing) {
    suffixes.push('biasing')
  }

  const baseLabel =
    rearDifferentialState.rearDifferentialModeLabel ??
    getRearDifferentialLabel(rearDifferentialState.rearDifferentialType)
  const baseTelemetry = `${baseLabel} / L ${leftPercent}% R ${rightPercent}%`

  return `${baseTelemetry} / ${suffixes.join(' / ')}`
}

function getRearDifferentialLabel(rearDifferentialType) {
  return (
    REAR_DIFFERENTIAL_OPTIONS.find((option) => option.key === rearDifferentialType)
      ?.label ?? 'Open'
  )
}

function sanitizeMultiplier(value, sliderDefinition) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) return sliderDefinition.defaultValue

  return Math.min(
    Math.max(numericValue, sliderDefinition.min),
    sliderDefinition.max
  )
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0

  return Math.min(Math.max(value, 0), 1)
}

function formatNumber(value, digits) {
  if (!Number.isFinite(value)) return '--'

  return value.toFixed(digits)
}