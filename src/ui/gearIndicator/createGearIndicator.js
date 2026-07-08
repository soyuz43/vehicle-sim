// src/ui/gearIndicator/createGearIndicator.js

const GEARS = [
  { gear: 'reverse', label: 'R' },
  { gear: 'neutral', label: 'N' },
  { gear: 'drive', label: 'D' },
]

const WHEEL_PATCHES = [
  { id: 'front-left', label: 'FL' },
  { id: 'front-right', label: 'FR' },
  { id: 'rear-left', label: 'RL' },
  { id: 'rear-right', label: 'RR' },
]

export function createGearIndicator(config = {}) {
  const parent = config.parent ?? document.body

  const root = document.createElement('div')
  root.id = config.id ?? 'gear-indicator'

  const speedSection = document.createElement('div')
  const speedTitle = document.createElement('div')
  speedTitle.textContent = 'SPEED'

  const speedMetersPerSecondNode = document.createElement('div')
  const speedKilometersPerHourNode = document.createElement('div')

  const contactSection = document.createElement('div')
  const contactTitle = document.createElement('div')
  contactTitle.textContent = 'TRACTION PLACEHOLDER'

  const contactGrid = document.createElement('div')
  const wheelPatchNodes = new Map()

  const gearSection = document.createElement('div')
  const gearTitle = document.createElement('div')
  gearTitle.textContent = 'GEAR'

  const gearRow = document.createElement('div')
  const gearNodes = new Map()

  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '20',
    right: '18px',
    bottom: '18px',
    width: '184px',
    padding: '10px 12px',
    fontFamily: 'Consolas, "Courier New", monospace',
    color: '#f0f0f0',
    background: 'rgba(6, 8, 10, 0.78)',
    border: '1px solid rgba(255, 255, 255, 0.22)',
    borderRadius: '8px',
    boxShadow: '0 10px 28px rgba(0, 0, 0, 0.32)',
    pointerEvents: 'none',
    userSelect: 'none',
  })

  Object.assign(speedSection.style, {
    padding: '0 0 8px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
    textAlign: 'right',
  })

  Object.assign(speedTitle.style, createSectionTitleStyle())

  Object.assign(speedMetersPerSecondNode.style, {
    marginTop: '2px',
    fontSize: '23px',
    fontWeight: '700',
    lineHeight: '1.05',
  })

  Object.assign(speedKilometersPerHourNode.style, {
    marginTop: '2px',
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.62)',
  })

  Object.assign(contactSection.style, {
    padding: '8px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
  })

  Object.assign(contactTitle.style, createSectionTitleStyle())

  Object.assign(contactGrid.style, {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px 8px',
    marginTop: '6px',
  })

  for (const wheelPatch of WHEEL_PATCHES) {
    const patch = document.createElement('div')
    const label = document.createElement('div')
    const value = document.createElement('div')

    label.textContent = wheelPatch.label
    value.textContent = '--'

    Object.assign(patch.style, {
      height: '34px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '7px',
      border: '1px solid rgba(255, 255, 255, 0.18)',
      background: 'rgba(255, 255, 255, 0.07)',
      transition: 'background 120ms ease, border-color 120ms ease, color 120ms ease',
    })

    Object.assign(label.style, {
      fontSize: '10px',
      fontWeight: '700',
      lineHeight: '1.1',
    })

    Object.assign(value.style, {
      marginTop: '2px',
      fontSize: '10px',
      lineHeight: '1.1',
      color: 'rgba(255, 255, 255, 0.72)',
    })

    patch.appendChild(label)
    patch.appendChild(value)
    contactGrid.appendChild(patch)

    wheelPatchNodes.set(wheelPatch.id, {
      patch,
      value,
    })
  }

  Object.assign(gearSection.style, {
    padding: '8px 0 0 0',
  })

  Object.assign(gearTitle.style, createSectionTitleStyle())
  gearTitle.style.textAlign = 'center'

  Object.assign(gearRow.style, {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '6px',
  })

  for (const gear of GEARS) {
    const node = document.createElement('div')
    node.textContent = gear.label

    Object.assign(node.style, {
      width: '28px',
      height: '28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '18px',
      fontWeight: '700',
      borderRadius: '6px',
      border: '1px solid rgba(255, 255, 255, 0.22)',
      background: 'rgba(255, 255, 255, 0.08)',
      color: 'rgba(255, 255, 255, 0.42)',
    })

    gearNodes.set(gear.gear, node)
    gearRow.appendChild(node)
  }

  speedSection.appendChild(speedTitle)
  speedSection.appendChild(speedMetersPerSecondNode)
  speedSection.appendChild(speedKilometersPerHourNode)

  contactSection.appendChild(contactTitle)
  contactSection.appendChild(contactGrid)

  gearSection.appendChild(gearTitle)
  gearSection.appendChild(gearRow)

  root.appendChild(speedSection)
  root.appendChild(contactSection)
  root.appendChild(gearSection)
  parent.appendChild(root)

  function update(snapshot = {}) {
    // Expected telemetry fields: gear, gearLabel, speedMetersPerSecond, wheelStates.
    // speedScalar remains a legacy fallback for callers not yet using the driver contract.
    const activeGear = snapshot.gear ?? 'drive'
    const speedMetersPerSecond = Math.abs(resolveSpeedMetersPerSecond(snapshot))

    speedMetersPerSecondNode.textContent = `${formatNumber(speedMetersPerSecond, 1)} m/s`
    speedKilometersPerHourNode.textContent = `${formatNumber(speedMetersPerSecond * 3.6, 1)} km/h`

    updateWheelPatches(snapshot.wheelStates ?? [])
    updateGearNodes(activeGear)
  }

  function updateWheelPatches(wheelStates) {
    for (const wheelPatch of WHEEL_PATCHES) {
      const wheelState = findWheelState(wheelStates, wheelPatch.id)
      const nodes = wheelPatchNodes.get(wheelPatch.id)

      updateWheelPatch(nodes, wheelState)
    }
  }

  function updateWheelPatch(nodes, wheelState) {
    if (!nodes) return

    if (!wheelState) {
      nodes.value.textContent = '--'
      setPatchUnavailableStyle(nodes.patch, nodes.value)
      return
    }

    if (!wheelState.isGrounded) {
      nodes.value.textContent = 'AIR'
      setPatchAirStyle(nodes.patch, nodes.value)
      return
    }

    if (wheelState.isSlipping) {
      nodes.value.textContent = 'SLIP'
      setPatchSlipStyle(nodes.patch, nodes.value)
      return
    }

    nodes.value.textContent = formatKilonewtons(wheelState.tractionLimitNewtons)
    setPatchGroundedStyle(nodes.patch, nodes.value)
  }

  function updateGearNodes(activeGear) {
    for (const [gear, node] of gearNodes) {
      const isActive = gear === activeGear

      node.style.background = isActive
        ? 'rgba(255, 255, 255, 0.92)'
        : 'rgba(255, 255, 255, 0.08)'

      node.style.color = isActive
        ? '#050505'
        : 'rgba(255, 255, 255, 0.42)'

      node.style.transform = isActive
        ? 'scale(1.12)'
        : 'scale(1)'

      node.style.borderColor = isActive
        ? 'rgba(255, 255, 255, 1)'
        : 'rgba(255, 255, 255, 0.22)'
    }
  }

  function destroy() {
    root.remove()
  }

  update({
    gear: config.initialGear ?? 'drive',
    speedMetersPerSecond: 0,
    wheelStates: [],
  })

  return {
    update,
    destroy,
  }
}

function createSectionTitleStyle() {
  return {
    margin: '0',
    fontSize: '10px',
    letterSpacing: '0.08em',
    color: 'rgba(255, 255, 255, 0.62)',
  }
}

function resolveSpeedMetersPerSecond(snapshot) {
  const speedMetersPerSecond =
    snapshot.speedMetersPerSecond ?? snapshot.speedScalar ?? 0

  return Number.isFinite(speedMetersPerSecond) ? speedMetersPerSecond : 0
}

function findWheelState(wheelStates, wheelId) {
  for (const wheelState of wheelStates) {
    if (wheelState.id === wheelId) return wheelState
  }

  return null
}

function setPatchGroundedStyle(patch, value) {
  patch.style.background = 'rgba(74, 222, 128, 0.22)'
  patch.style.borderColor = 'rgba(134, 239, 172, 0.72)'
  patch.style.color = '#eafff0'
  value.style.color = 'rgba(234, 255, 240, 0.86)'
}

function setPatchAirStyle(patch, value) {
  patch.style.background = 'rgba(255, 255, 255, 0.03)'
  patch.style.borderColor = 'rgba(255, 255, 255, 0.18)'
  patch.style.color = 'rgba(255, 255, 255, 0.42)'
  value.style.color = 'rgba(255, 255, 255, 0.46)'
}

function setPatchSlipStyle(patch, value) {
  patch.style.background = 'rgba(248, 113, 113, 0.28)'
  patch.style.borderColor = 'rgba(252, 165, 165, 0.92)'
  patch.style.color = '#fff1f1'
  value.style.color = '#ffd7d7'
}

function setPatchUnavailableStyle(patch, value) {
  patch.style.background = 'rgba(255, 255, 255, 0.04)'
  patch.style.borderColor = 'rgba(255, 255, 255, 0.12)'
  patch.style.color = 'rgba(255, 255, 255, 0.34)'
  value.style.color = 'rgba(255, 255, 255, 0.34)'
}

function formatKilonewtons(forceNewtons) {
  if (!Number.isFinite(forceNewtons)) return '--'

  return `${formatNumber(forceNewtons / 1000, 1)}kN`
}

function formatNumber(value, digits) {
  if (!Number.isFinite(value)) return '--'

  return value.toFixed(digits)
}
