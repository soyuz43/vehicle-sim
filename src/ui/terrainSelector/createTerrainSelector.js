// src/ui/terrainSelector/createTerrainSelector.js

/**
 * Minimal terrain selector UI (driver/explorer-facing only).
 *
 * Renders a small dropdown that lets the user switch the active terrain via the
 * ?terrain=<name> URL parameter and reloads. This keeps the startup selection
 * model simple and avoids swapping the live simulation graph at runtime, which
 * would risk the deterministic fixed-step architecture. No physics is touched.
 */

export function createTerrainSelector(config = {}) {
  const selection = config.selection
  if (!selection) {
    throw new Error('createTerrainSelector requires a terrain selection object')
  }

  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.top = '8px'
  container.style.left = '8px'
  container.style.zIndex = '10'
  container.style.color = '#dddddd'
  container.style.font = '12px monospace'
  container.style.background = 'rgba(0, 0, 0, 0.45)'
  container.style.padding = '4px 6px'
  container.style.borderRadius = '4px'

  const label = document.createElement('label')
  label.textContent = 'Terrain: '

  const select = document.createElement('select')
  const options = [
    { value: 'proving-ground', text: 'Proving Ground' },
    { value: 'offroad', text: 'Offroad Playground' },
  ]
  for (const option of options) {
    const optionElement = document.createElement('option')
    optionElement.value = option.value
    optionElement.textContent = option.text
    if (option.value === selection.name) optionElement.selected = true
    select.appendChild(optionElement)
  }

  select.addEventListener('change', () => {
    const search = globalThis.location?.search
    const params = new URLSearchParams(typeof search === 'string' ? search : '')
    params.set('terrain', select.value)
    if (globalThis.location) {
      globalThis.location.search = params.toString()
    }
  })

  label.appendChild(select)
  container.appendChild(label)
  document.body.appendChild(container)

  return { container, select }
}
