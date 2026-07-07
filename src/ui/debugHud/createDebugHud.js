// src/ui/debugHud/createDebugHud.js

const DEFAULT_CORNER = 'top-left'

export function createDebugHud(config = {}) {
  const parent = config.parent ?? document.body

  const debugHud = document.createElement('div')
  debugHud.id = config.id ?? 'debug-hud'

  const debugHudButtonRow = document.createElement('div')

  const debugHudMoveButton = document.createElement('button')
  debugHudMoveButton.type = 'button'
  debugHudMoveButton.textContent = 'Move panel'

  const debugHudCollapseButton = document.createElement('button')
  debugHudCollapseButton.type = 'button'
  debugHudCollapseButton.textContent = 'Collapse Panel'

  const debugHudText = document.createElement('pre')

  Object.assign(debugHud.style, {
    position: 'fixed',
    zIndex: '10',
    margin: '0',
    padding: '10px 12px',
    minWidth: '260px',
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

  Object.assign(debugHudButtonRow.style, {
    display: 'flex',
    gap: '6px',
    margin: '0 0 8px 0',
    alignItems: 'center',
  })

  const debugHudButtonStyle = {
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

  Object.assign(debugHudMoveButton.style, debugHudButtonStyle)
  Object.assign(debugHudCollapseButton.style, debugHudButtonStyle)

  Object.assign(debugHudText.style, {
    margin: '0',
    whiteSpace: 'pre',
    pointerEvents: 'none',
  })

  debugHudButtonRow.appendChild(debugHudMoveButton)
  debugHudButtonRow.appendChild(debugHudCollapseButton)
  debugHud.appendChild(debugHudButtonRow)
  debugHud.appendChild(debugHudText)
  parent.appendChild(debugHud)

  let corner = config.initialCorner ?? DEFAULT_CORNER
  let collapsed = config.initialCollapsed ?? false

  function setCorner(nextCorner) {
    corner = nextCorner

    debugHud.style.top = ''
    debugHud.style.right = ''
    debugHud.style.bottom = ''
    debugHud.style.left = ''

    if (corner === 'bottom-right') {
      debugHud.style.right = '12px'
      debugHud.style.bottom = '12px'
      debugHudMoveButton.textContent = 'Move panel ↑'
    } else {
      debugHud.style.top = '12px'
      debugHud.style.left = '12px'
      debugHudMoveButton.textContent = 'Move panel ↓'
    }
  }

  function setCollapsed(nextCollapsed) {
    collapsed = nextCollapsed

    debugHudText.style.display = collapsed ? 'none' : 'block'
    debugHudCollapseButton.textContent = collapsed
      ? 'Expand Panel'
      : 'Collapse Panel'

    debugHud.style.minWidth = collapsed ? '0' : '260px'
  }

  function toggleCorner() {
    setCorner(corner === 'top-left' ? 'bottom-right' : 'top-left')
  }

  function toggleCollapsed() {
    setCollapsed(!collapsed)
  }

  function update(snapshot) {
    const forces = snapshot.forces ?? {}

    debugHudText.textContent = [
      'Vehicle Sim Debug',
      '',
      `Camera: ${snapshot.cameraMode ?? 'unknown'}`,
      `Controller: ${snapshot.controllerKind ?? 'unknown'}`,
      `dt: ${formatNumber(snapshot.dt, 4)} s`,
      '',
      `Position XYZ: ${formatVector3(snapshot.position)}`,
      `Speed scalar: ${formatNumber(snapshot.speedScalar)} m/s`,
      `Velocity XYZ: ${formatVector3(snapshot.velocity)} m/s`,
      `Velocity mag: ${formatNumber(vectorMagnitude(snapshot.velocity))} m/s`,
      `Acceleration: ${formatNumber(snapshot.longitudinalAcceleration)} m/s²`,
      '',
      `Drive force: ${formatNumber(forces.driveForceNewtons)} N`,
      `Brake force: ${formatNumber(forces.brakeForceNewtons)} N`,
      `Rolling resistance: ${formatNumber(forces.rollingResistanceForceNewtons)} N`,
      `Aero drag: ${formatNumber(forces.aerodynamicDragForceNewtons)} N`,
      `Net force: ${formatNumber(forces.netLongitudinalForceNewtons)} N`,
      `Traction limit: ${formatNumber(forces.tractionLimitLongitudinalNewtons)} N`,
      `Traction limited: ${forces.isTractionLimited ? 'YES' : 'no'}`,
      '',
      `Terrain size: ${snapshot.terrainSize} x ${snapshot.terrainSize}`,
      `Outside terrain: ${snapshot.outsideTerrain ? 'YES' : 'no'}`,
      '',
      'Controls:',
      'W/S = throttle/brake/reverse',
      'A/D = steer',
      'C = camera',
      'R = reset',
    ].join('\n')
  }

  function destroy() {
    debugHudMoveButton.removeEventListener('click', toggleCorner)
    debugHudCollapseButton.removeEventListener('click', toggleCollapsed)
    debugHud.remove()
  }

  debugHudMoveButton.addEventListener('click', toggleCorner)
  debugHudCollapseButton.addEventListener('click', toggleCollapsed)

  setCorner(corner)
  setCollapsed(collapsed)

  return {
    update,
    setCorner,
    setCollapsed,
    destroy,
  }
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return 'NaN'
  return value.toFixed(digits)
}

function formatVector3(vector, digits = 2) {
  if (!vector) return 'NaN, NaN, NaN'

  return [
    formatNumber(vector.x, digits),
    formatNumber(vector.y, digits),
    formatNumber(vector.z, digits),
  ].join(', ')
}

function vectorMagnitude(vector) {
  if (!vector) return NaN

  const x = vector.x ?? 0
  const y = vector.y ?? 0
  const z = vector.z ?? 0

  return Math.sqrt(x * x + y * y + z * z)
}