// src/ui/tireInflationPanel/createTireInflationPanel.js

const DEFAULT_TIRE_PRESSURE_STATE = Object.freeze({
  tirePressureKpa: 220,
  defaultTirePressureKpa: 220,
  minTirePressureKpa: 80,
  maxTirePressureKpa: 340,
  tireInflationNormalized01: 0.54,
  visualTireDeflectionRatio: 0,
  visualContactPatchScale: Object.freeze({
    width: 1,
    length: 1,
  }),
  inflationVisualLabel: 'normal-visual',
})

export function createTireInflationPanel(config = {}) {
  const parent = config.parent ?? document.body
  const onTirePressureKpaChange = config.onTirePressureKpaChange ?? (() => {})
  const onReset = config.onReset ?? (() => {})

  const root = document.createElement('div')
  root.id = config.id ?? 'tire-inflation-panel'

  const header = document.createElement('div')
  const title = document.createElement('div')
  title.textContent = 'Developer Tire Inflation'

  const collapseButton = document.createElement('button')
  collapseButton.type = 'button'
  collapseButton.textContent = 'Collapse'

  const body = document.createElement('div')
  const valueRow = document.createElement('div')
  const pressureValue = document.createElement('div')
  const pressurePsiValue = document.createElement('div')
  const slider = document.createElement('input')
  const visualState = document.createElement('div')
  const resetButton = document.createElement('button')

  slider.type = 'range'
  slider.step = '1'
  resetButton.type = 'button'
  resetButton.textContent = 'Reset Pressure'

  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '15',
    top: '12px',
    right: '12px',
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

  Object.assign(valueRow.style, {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '6px',
  })

  Object.assign(pressureValue.style, {
    fontSize: '20px',
    fontWeight: '700',
  })

  Object.assign(pressurePsiValue.style, {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.62)',
  })

  Object.assign(slider.style, {
    width: '100%',
    margin: '2px 0 6px 0',
  })

  Object.assign(visualState.style, {
    color: 'rgba(255, 255, 255, 0.68)',
  })

  header.appendChild(title)
  header.appendChild(collapseButton)
  valueRow.appendChild(pressureValue)
  valueRow.appendChild(pressurePsiValue)
  body.appendChild(valueRow)
  body.appendChild(slider)
  body.appendChild(visualState)
  body.appendChild(resetButton)
  root.appendChild(header)
  root.appendChild(body)
  parent.appendChild(root)

  let collapsed = false
  let currentTirePressureState = normalizeTirePressureState(
    config.initialTirePressureState
  )

  function update(tirePressureState = currentTirePressureState) {
    currentTirePressureState = normalizeTirePressureState(tirePressureState)

    slider.min = String(currentTirePressureState.minTirePressureKpa)
    slider.max = String(currentTirePressureState.maxTirePressureKpa)
    slider.value = String(currentTirePressureState.tirePressureKpa)

    pressureValue.textContent = `${formatNumber(currentTirePressureState.tirePressureKpa, 0)} kPa`
    pressurePsiValue.textContent = `${formatNumber(kpaToPsi(currentTirePressureState.tirePressureKpa), 1)} psi`
    visualState.textContent = formatVisualState(currentTirePressureState)
  }

  function setCollapsed(nextCollapsed) {
    collapsed = nextCollapsed
    body.style.display = collapsed ? 'none' : 'block'
    collapseButton.textContent = collapsed ? 'Expand' : 'Collapse'
  }

  function handleSliderInput() {
    onTirePressureKpaChange(Number(slider.value))
  }

  function handleResetClick() {
    onReset()
  }

  function handleCollapseClick() {
    setCollapsed(!collapsed)
  }

  function destroy() {
    slider.removeEventListener('input', handleSliderInput)
    resetButton.removeEventListener('click', handleResetClick)
    collapseButton.removeEventListener('click', handleCollapseClick)
    root.remove()
  }

  slider.addEventListener('input', handleSliderInput)
  resetButton.addEventListener('click', handleResetClick)
  collapseButton.addEventListener('click', handleCollapseClick)

  update(currentTirePressureState)

  return {
    update,
    setCollapsed,
    destroy,
  }
}

function normalizeTirePressureState(tirePressureState = {}) {
  return {
    ...DEFAULT_TIRE_PRESSURE_STATE,
    ...tirePressureState,
    visualContactPatchScale: {
      ...DEFAULT_TIRE_PRESSURE_STATE.visualContactPatchScale,
      ...(tirePressureState.visualContactPatchScale ?? {}),
    },
  }
}

function formatVisualState(tirePressureState) {
  const widthScale = tirePressureState.visualContactPatchScale.width
  const lengthScale = tirePressureState.visualContactPatchScale.length

  return [
    tirePressureState.inflationVisualLabel ?? 'normal-visual',
    `patch ${formatNumber(widthScale, 2)} x ${formatNumber(lengthScale, 2)}`,
  ].join(' / ')
}

function kpaToPsi(tirePressureKpa) {
  return tirePressureKpa * 0.1450377377
}

function formatNumber(value, digits) {
  if (!Number.isFinite(value)) return '--'

  return value.toFixed(digits)
}