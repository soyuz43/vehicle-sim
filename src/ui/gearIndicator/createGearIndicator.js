// src/ui/gearIndicator/createGearIndicator.js

const GEARS = [
  { gear: 'reverse', label: 'R' },
  { gear: 'neutral', label: 'N' },
  { gear: 'drive', label: 'D' },
]

export function createGearIndicator(config = {}) {
  const parent = config.parent ?? document.body

  const root = document.createElement('div')
  root.id = config.id ?? 'gear-indicator'

  const title = document.createElement('div')
  title.textContent = 'GEAR'

  const gearRow = document.createElement('div')

  const gearNodes = new Map()

  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '20',
    right: '18px',
    bottom: '18px',
    padding: '10px 12px',
    fontFamily: 'Consolas, "Courier New", monospace',
    color: '#f0f0f0',
    background: 'rgba(0, 0, 0, 0.72)',
    border: '1px solid rgba(255, 255, 255, 0.25)',
    borderRadius: '10px',
    pointerEvents: 'none',
    userSelect: 'none',
  })

  Object.assign(title.style, {
    margin: '0 0 6px 0',
    fontSize: '10px',
    letterSpacing: '0.16em',
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.68)',
  })

  Object.assign(gearRow.style, {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    justifyContent: 'center',
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

  root.appendChild(title)
  root.appendChild(gearRow)
  parent.appendChild(root)

  function update(snapshot = {}) {
    const activeGear = snapshot.gear ?? 'drive'

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

  update({ gear: config.initialGear ?? 'drive' })

  return {
    update,
    destroy,
  }
}