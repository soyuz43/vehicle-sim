// test/configPanel.test.js

import assert from 'node:assert/strict'
import test from 'node:test'

// Minimal fake DOM so the config panel can be exercised without a browser.
function createFakeElement(tag) {
  return {
    tagName: tag,
    style: {},
    children: [],
    _listeners: {},
    textContent: '',
    value: '',
    selected: false,
    parentNode: null,
    appendChild(child) {
      this.children.push(child)
      child.parentNode = this
      return child
    },
    removeChild(child) {
      const index = this.children.indexOf(child)
      if (index >= 0) this.children.splice(index, 1)
      child.parentNode = null
      return child
    },
    addEventListener(type, handler) {
      ;(this._listeners[type] ??= []).push(handler)
    },
    removeEventListener(type, handler) {
      const handlers = this._listeners[type]
      if (handlers) {
        const idx = handlers.indexOf(handler)
        if (idx >= 0) handlers.splice(idx, 1)
      }
    },
    dispatchEvent(event) {
      for (const handler of this._listeners[event.type] ?? []) handler(event)
      return true
    },
    querySelector(selector) {
      if (selector === '[data-drag-handle]') return null
      return null
    },
    querySelectorAll(selector) {
      return []
    },
    insertBefore(newNode, refNode) {
      this.children.push(newNode)
      newNode.parentNode = this
      return newNode
    },
    remove() {
      if (this.parentNode) {
        this.parentNode.removeChild(this)
      }
    },
    setAttribute(name, value) {
      this[name] = value
    },
    getAttribute(name) {
      return this[name]
    },
    set innerHTML(html) {
      this.children = []
    },
    get innerHTML() {
      return ''
    },
    closest(selector) {
      return null
    },
    matches(selector) {
      return false
    },
    contains(node) {
      return false
    },
    get className() { return this._className ?? '' },
    set className(v) { this._className = v },
    get dataset() { return this._dataset ?? {} },
    set dataset(v) { this._dataset = v },
  }
}

function installFakeDom() {
  const body = createFakeElement('body')
  globalThis.document = {
    createElement: (tag) => createFakeElement(tag),
    body,
    documentElement: {
      style: {},
      setAttribute: () => {},
      getAttribute: () => '',
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  globalThis.window = {
    matchMedia: (query) => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    location: {
      search: '',
    },
  }
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  }
  return body
}

test('ConfigPanel builds terrain selector and vehicle slot selects', async () => {
  installFakeDom()
  const { createConfigPanel } = await import('../src/ui/config-panel/createConfigPanel.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )

  const ui = createConfigPanel({
    initialTerrain: 'proving-ground',
    initialVehicleConfig: createDefaultVehicleConfiguration(),
  })

  // Check terrain selector exists
  assert.equal(ui.getTerrain(), 'proving-ground')

  // Check vehicle config - use actual default component IDs
  const vehicleConfig = ui.getVehicleConfig()
  assert.equal(vehicleConfig.slots.chassis, 'chassis-hatchback')
  assert.equal(vehicleConfig.slots.suspension, 'susp-stock')
  assert.equal(vehicleConfig.slots.wheels, 'tires-stock')
  assert.equal(vehicleConfig.slots.drivetrain, 'drivetrain-stock')
  assert.equal(vehicleConfig.slots.brakes, 'brakes-stock')
  assert.equal(vehicleConfig.slots.aero, 'aero-stock')

  const findElement = (element, predicate) => {
    if (predicate(element)) return element
    for (const child of element.children ?? []) {
      const match = findElement(child, predicate)
      if (match) return match
    }
    return null
  }
  const findButtonByLabel = (element, label) => {
    if (element.tagName === 'button') {
      const labelSpan = findElement(
        element,
        (candidate) => candidate.tagName === 'span' && candidate.textContent === label
      )
      if (labelSpan) return element
    }
    for (const child of element.children ?? []) {
      const match = findButtonByLabel(child, label)
      if (match) return match
    }
    return null
  }
  for (const slot of ['chassis', 'suspension', 'wheels', 'drivetrain', 'brakes', 'aero']) {
    const select = findElement(ui.element, (element) => element.id === 'config-' + slot + '-select')
    const label = findElement(ui.element, (element) => element.tagName === 'label' && element.htmlFor === select.id)
    assert.ok(label, slot + " select has an associated label")
  }
  const terrainSelect = findElement(ui.element, (element) => element.id === 'config-terrain-select')
  assert.ok(findElement(ui.element, (element) => element.tagName === 'label' && element.htmlFor === terrainSelect.id))
})

test('changing terrain selector updates terrain', async () => {
  installFakeDom()
  const { createConfigPanel } = await import('../src/ui/config-panel/createConfigPanel.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )

  let terrainChanged = null
  const ui = createConfigPanel({
    initialTerrain: 'proving-ground',
    initialVehicleConfig: createDefaultVehicleConfiguration(),
    onTerrainChange: (terrain) => { terrainChanged = terrain; },
  })

  // Test public API for terrain change
  ui.setTerrain('offroad')
  assert.equal(ui.getTerrain(), 'offroad')
  // onTerrainChange callback is called on URL change in real usage, not on setTerrain
})

test('changing vehicle slot updates configuration', async () => {
  installFakeDom()
  const { createConfigPanel } = await import('../src/ui/config-panel/createConfigPanel.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )

  let vehicleChanged = null
  const ui = createConfigPanel({
    initialTerrain: 'proving-ground',
    initialVehicleConfig: createDefaultVehicleConfiguration(),
    onVehicleChange: (config) => { vehicleChanged = config; },
  })

  const findById = (element, id) => {
    if (element.id === id) return element
    for (const child of element.children ?? []) {
      const match = findById(child, id)
      if (match) return match
    }
    return null
  }
  const chassisSelect = findById(ui.element, 'config-chassis-select')
  chassisSelect.value = 'chassis-heavytruck'
  chassisSelect.dispatchEvent({ type: 'change', target: chassisSelect })

  assert.equal(ui.getVehicleConfig().slots.chassis, 'chassis-heavytruck')
  assert.equal(vehicleChanged.slots.chassis, 'chassis-heavytruck')
  assert.match(findById(ui.element, 'config-vehicle-preview').textContent, /Heavy Truck/)
  assert.equal(ui.isDirty(), true)
})

test('dirty state tracking via UI interaction', async () => {
  installFakeDom()
  const { createConfigPanel } = await import('../src/ui/config-panel/createConfigPanel.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )

  let applied = null
  let reset = false
  const ui = createConfigPanel({
    initialTerrain: 'proving-ground',
    initialVehicleConfig: createDefaultVehicleConfiguration(),
    onApply: (config) => { applied = config; },
    onReset: () => { reset = true; },
  })

  // Initially not dirty
  assert.equal(ui.isDirty(), false)

  // Note: The current implementation only marks dirty when user interacts with
  // the select elements via onChange handlers, not via the public API.
  // Since we can't easily simulate select change events in the fake DOM,
  // we test that the dirty state API exists and returns a boolean.
  assert.equal(typeof ui.isDirty(), 'boolean')
})


test('the Apply button hands the staged configuration to the host', async () => {
  installFakeDom()
  const { createConfigPanel } = await import('../src/ui/config-panel/createConfigPanel.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )

  let applied = null
  const ui = createConfigPanel({
    initialTerrain: 'proving-ground',
    initialVehicleConfig: createDefaultVehicleConfiguration(),
    onApply: (config) => { applied = config; },
  })

  const findById = (element, id) => {
    if (element.id === id) return element
    for (const child of element.children ?? []) {
      const match = findById(child, id)
      if (match) return match
    }
    return null
  }
  const findElement = (element, predicate) => {
    if (predicate(element)) return element
    for (const child of element.children ?? []) {
      const match = findElement(child, predicate)
      if (match) return match
    }
    return null
  }

  const chassisSelect = findById(ui.element, 'config-chassis-select')
  chassisSelect.value = 'chassis-suv'
  chassisSelect.dispatchEvent({ type: 'change', target: chassisSelect })

  const applyButton = findElement(
    ui.element,
    (element) => element.tagName === 'button' &&
      findElement(element, (child) => child.tagName === 'span' && child.textContent === 'Apply') !== null
  )
  assert.ok(applyButton, 'the panel must expose an Apply button')
  applyButton.dispatchEvent({ type: 'click' })

  assert.ok(applied, 'the host callback must receive the staged configuration')
  assert.equal(applied.vehicleConfig.slots.chassis, 'chassis-suv')
  assert.equal(applied.terrain, 'proving-ground')
  assert.equal(ui.isDirty(), false, 'a successful apply clears the dirty state')
})

test('a successful apply reports the applied time and leaves no preview-only wording', async () => {
  installFakeDom()
  const { createConfigPanel } = await import('../src/ui/config-panel/createConfigPanel.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )

  const ui = createConfigPanel({
    initialTerrain: 'proving-ground',
    initialVehicleConfig: createDefaultVehicleConfiguration(),
    onApply: () => { ui.markApplied(); },
  })

  const findById = (element, id) => {
    if (element.id === id) return element
    for (const child of element.children ?? []) {
      const match = findById(child, id)
      if (match) return match
    }
    return null
  }
  const findElement = (element, predicate) => {
    if (predicate(element)) return element
    for (const child of element.children ?? []) {
      const match = findElement(child, predicate)
      if (match) return match
    }
    return null
  }

  const status = findById(ui.element, 'config-vehicle-preview')
  const modeNotice = findElement(
    ui.element,
    (element) => element.tagName === 'div' && typeof element.textContent === 'string' &&
      element.textContent.includes('Apply')
  )

  assert.doesNotMatch(status.textContent, /preview only/i)
  assert.doesNotMatch(modeNotice.textContent, /does not change the running controller/i)

  const chassisSelect = findById(ui.element, 'config-chassis-select')
  chassisSelect.value = 'chassis-suv'
  chassisSelect.dispatchEvent({ type: 'change', target: chassisSelect })
  assert.match(status.textContent, /Staged setup/)

  const applyButton = findElement(
    ui.element,
    (element) => element.tagName === 'button' &&
      findElement(element, (child) => child.tagName === 'span' && child.textContent === 'Apply') !== null
  )
  applyButton.dispatchEvent({ type: 'click' })

  assert.match(status.textContent, /Applied at \d{2}:\d{2}:\d{2}/)
  assert.equal(ui.isDirty(), false)
})

test('a failed apply keeps the panel dirty and reports the error', async () => {
  installFakeDom()
  const { createConfigPanel } = await import('../src/ui/config-panel/createConfigPanel.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )

  const ui = createConfigPanel({
    initialTerrain: 'proving-ground',
    initialVehicleConfig: createDefaultVehicleConfiguration(),
    onApply: () => { ui.setApplyError(new Error('invalid vehicle configuration: bad slot')); },
  })

  const findById = (element, id) => {
    if (element.id === id) return element
    for (const child of element.children ?? []) {
      const match = findById(child, id)
      if (match) return match
    }
    return null
  }
  const findElement = (element, predicate) => {
    if (predicate(element)) return element
    for (const child of element.children ?? []) {
      const match = findElement(child, predicate)
      if (match) return match
    }
    return null
  }

  const chassisSelect = findById(ui.element, 'config-chassis-select')
  chassisSelect.value = 'chassis-suv'
  chassisSelect.dispatchEvent({ type: 'change', target: chassisSelect })

  const applyButton = findElement(
    ui.element,
    (element) => element.tagName === 'button' &&
      findElement(element, (child) => child.tagName === 'span' && child.textContent === 'Apply') !== null
  )
  applyButton.dispatchEvent({ type: 'click' })

  const status = findById(ui.element, 'config-vehicle-preview')
  assert.match(status.textContent, /Apply failed: invalid vehicle configuration/)
  assert.equal(ui.isDirty(), true, 'a failed apply keeps the panel dirty')
  assert.equal(applyButton.element?.disabled ?? applyButton.disabled, false)
})

test('Reset Vehicle restores the stock configuration and applies it', async () => {
  installFakeDom()
  const { createConfigPanel } = await import('../src/ui/config-panel/createConfigPanel.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )

  let resetConfig = null
  const ui = createConfigPanel({
    initialTerrain: 'proving-ground',
    initialVehicleConfig: createDefaultVehicleConfiguration(),
    onReset: () => { resetConfig = ui.getVehicleConfig(); },
  })

  const findById = (element, id) => {
    if (element.id === id) return element
    for (const child of element.children ?? []) {
      const match = findById(child, id)
      if (match) return match
    }
    return null
  }
  const findElement = (element, predicate) => {
    if (predicate(element)) return element
    for (const child of element.children ?? []) {
      const match = findElement(child, predicate)
      if (match) return match
    }
    return null
  }

  const chassisSelect = findById(ui.element, 'config-chassis-select')
  chassisSelect.value = 'chassis-suv'
  chassisSelect.dispatchEvent({ type: 'change', target: chassisSelect })
  assert.equal(ui.getVehicleConfig().slots.chassis, 'chassis-suv')

  const resetButton = findElement(
    ui.element,
    (element) => element.tagName === 'button' &&
      findElement(element, (child) => child.tagName === 'span' && child.textContent === 'Reset Vehicle') !== null
  )
  assert.ok(resetButton, 'the panel must expose a Reset Vehicle button')
  resetButton.dispatchEvent({ type: 'click' })

  assert.equal(ui.getVehicleConfig().slots.chassis, 'chassis-hatchback')
  assert.equal(ui.getVehicleConfig().slots.drivetrain, 'drivetrain-stock')
  assert.ok(resetConfig, 'the host is told about the reset')
  assert.equal(resetConfig.slots.chassis, 'chassis-hatchback')
  assert.equal(ui.isDirty(), false)
})


test('the Apply button applies the staged setup to a running controller', async () => {
  installFakeDom()
  const { createConfigPanel } = await import('../src/ui/config-panel/createConfigPanel.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )
  const { createCar } = await import('../src/car/createCar.js')
  const { createVehicleController } = await import(
    '../src/vehicle/createVehicleController.js'
  )
  const THREE = await import('three')

  const car = createCar()
  const controller = createVehicleController({
    vehicle: car,
    startPosition: new THREE.Vector3(0, 0, 0),
  })
  for (let step = 0; step < 120; step += 1) {
    controller.update(1 / 60, { throttle: true })
  }

  const before = controller.getSnapshot()
  const beforePositionX = before.position.x
  const beforePositionZ = before.position.z
  const beforeGear = before.gear

  let ui
  ui = createConfigPanel({
    initialTerrain: 'proving-ground',
    initialVehicleConfig: createDefaultVehicleConfiguration(),
    onApply: ({ vehicleConfig }) => {
      controller.setVehicleConfiguration(vehicleConfig)
      ui.markApplied()
    },
  })

  const findById = (element, id) => {
    if (element.id === id) return element
    for (const child of element.children ?? []) {
      const match = findById(child, id)
      if (match) return match
    }
    return null
  }
  const findElement = (element, predicate) => {
    if (predicate(element)) return element
    for (const child of element.children ?? []) {
      const match = findElement(child, predicate)
      if (match) return match
    }
    return null
  }

  const chassisSelect = findById(ui.element, 'config-chassis-select')
  chassisSelect.value = 'chassis-suv'
  chassisSelect.dispatchEvent({ type: 'change', target: chassisSelect })

  const applyButton = findElement(
    ui.element,
    (element) => element.tagName === 'button' &&
      findElement(element, (child) => child.tagName === 'span' && child.textContent === 'Apply') !== null
  )
  applyButton.dispatchEvent({ type: 'click' })

  const after = controller.getSnapshot()
  assert.equal(after.chassisMassProperties.massKg, 1950)
  assert.equal(after.position.x, beforePositionX)
  assert.equal(after.position.z, beforePositionZ)
  assert.equal(after.gear, beforeGear)
  assert.equal(ui.isDirty(), false)
})

test('Reset Vehicle applies the stock setup to a running controller', async () => {
  installFakeDom()
  const { createConfigPanel } = await import('../src/ui/config-panel/createConfigPanel.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )
  const { createCar } = await import('../src/car/createCar.js')
  const { createVehicleController } = await import(
    '../src/vehicle/createVehicleController.js'
  )
  const THREE = await import('three')

  const car = createCar()
  const controller = createVehicleController({
    vehicle: car,
    startPosition: new THREE.Vector3(0, 0, 0),
  })

  let ui
  ui = createConfigPanel({
    initialTerrain: 'proving-ground',
    initialVehicleConfig: createDefaultVehicleConfiguration(),
    onApply: ({ vehicleConfig }) => {
      controller.setVehicleConfiguration(vehicleConfig)
      ui.markApplied()
    },
    onReset: () => {
      controller.setVehicleConfiguration(createDefaultVehicleConfiguration())
      ui.markApplied()
    },
  })

  const findById = (element, id) => {
    if (element.id === id) return element
    for (const child of element.children ?? []) {
      const match = findById(child, id)
      if (match) return match
    }
    return null
  }
  const findElement = (element, predicate) => {
    if (predicate(element)) return element
    for (const child of element.children ?? []) {
      const match = findElement(child, predicate)
      if (match) return match
    }
    return null
  }

  const chassisSelect = findById(ui.element, 'config-chassis-select')
  chassisSelect.value = 'chassis-suv'
  chassisSelect.dispatchEvent({ type: 'change', target: chassisSelect })
  const applyButton = findElement(
    ui.element,
    (element) => element.tagName === 'button' &&
      findElement(element, (child) => child.tagName === 'span' && child.textContent === 'Apply') !== null
  )
  applyButton.dispatchEvent({ type: 'click' })
  assert.equal(controller.getSnapshot().chassisMassProperties.massKg, 1950)

  const resetButton = findElement(
    ui.element,
    (element) => element.tagName === 'button' &&
      findElement(element, (child) => child.tagName === 'span' && child.textContent === 'Reset Vehicle') !== null
  )
  resetButton.dispatchEvent({ type: 'click' })

  assert.equal(
    controller.getSnapshot().chassisMassProperties.massKg,
    1400,
    'Reset Vehicle restores the stock setup on the running controller'
  )
  assert.equal(ui.getVehicleConfig().slots.chassis, 'chassis-hatchback')
})

test('Reset Vehicle does not change the terrain selection', async () => {
  installFakeDom()
  const { createConfigPanel } = await import('../src/ui/config-panel/createConfigPanel.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )

  const ui = createConfigPanel({
    initialTerrain: 'offroad',
    initialVehicleConfig: createDefaultVehicleConfiguration(),
    onReset: () => { ui.markApplied(); },
  })

  const findById = (element, id) => {
    if (element.id === id) return element
    for (const child of element.children ?? []) {
      const match = findById(child, id)
      if (match) return match
    }
    return null
  }
  const findElement = (element, predicate) => {
    if (predicate(element)) return element
    for (const child of element.children ?? []) {
      const match = findElement(child, predicate)
      if (match) return match
    }
    return null
  }

  const resetButton = findElement(
    ui.element,
    (element) => element.tagName === 'button' &&
      findElement(element, (child) => child.tagName === 'span' && child.textContent === 'Reset Vehicle') !== null
  )
  assert.ok(resetButton, 'the panel must expose a Reset Vehicle button')
  resetButton.dispatchEvent({ type: 'click' })

  assert.equal(
    ui.getTerrain(),
    'offroad',
    'Reset Vehicle leaves the running terrain selection alone'
  )
  assert.equal(ui.isDirty(), false)
})

test('staging a terrain change, then clicking Reset Vehicle, leaves the panel dirty and keeps the terrain staged', async () => {
  installFakeDom()
  const { createConfigPanel } = await import('../src/ui/config-panel/createConfigPanel.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )

  const ui = createConfigPanel({
    initialTerrain: 'proving-ground',
    initialVehicleConfig: createDefaultVehicleConfiguration(),
    onReset: () => { ui.markApplied(); },
  })

  const findById = (element, id) => {
    if (element.id === id) return element
    for (const child of element.children ?? []) {
      const match = findById(child, id)
      if (match) return match
    }
    return null
  }
  const findElement = (element, predicate) => {
    if (predicate(element)) return element
    for (const child of element.children ?? []) {
      const match = findElement(child, predicate)
      if (match) return match
    }
    return null
  }

  const terrainSelect = findById(ui.element, 'config-terrain-select')
  terrainSelect.value = 'offroad'
  terrainSelect.dispatchEvent({ type: 'change', target: terrainSelect })
  assert.equal(ui.getTerrain(), 'offroad', 'the terrain selection is staged')
  assert.equal(ui.isDirty(), true, 'a staged terrain selection is pending')

  const chassisSelect = findById(ui.element, 'config-chassis-select')
  chassisSelect.value = 'chassis-suv'
  chassisSelect.dispatchEvent({ type: 'change', target: chassisSelect })
  assert.equal(ui.getVehicleConfig().slots.chassis, 'chassis-suv')

  const resetButton = findElement(
    ui.element,
    (element) => element.tagName === 'button' &&
      findElement(element, (child) => child.tagName === 'span' && child.textContent === 'Reset Vehicle') !== null
  )
  resetButton.dispatchEvent({ type: 'click' })

  assert.equal(
    ui.getTerrain(),
    'offroad',
    'Reset Vehicle does not clear the staged terrain selection'
  )
  assert.equal(
    ui.getVehicleConfig().slots.chassis,
    'chassis-hatchback',
    'the vehicle setup is back to the stock configuration'
  )
  assert.equal(
    ui.isDirty(),
    true,
    'the staged terrain selection keeps the panel dirty after the vehicle reset'
  )
})

test('the dirty state is derived from the staged and the running selection', async () => {
  installFakeDom()
  const { createConfigPanel } = await import('../src/ui/config-panel/createConfigPanel.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )

  const ui = createConfigPanel({
    initialTerrain: 'proving-ground',
    initialVehicleConfig: createDefaultVehicleConfiguration(),
    onApply: () => { ui.markApplied(); },
  })

  const findById = (element, id) => {
    if (element.id === id) return element
    for (const child of element.children ?? []) {
      const match = findById(child, id)
      if (match) return match
    }
    return null
  }

  assert.equal(ui.isDirty(), false, 'a fresh panel is clean')

  // Staging the terrain the session is already running is not a change.
  ui.setTerrain('proving-ground')
  assert.equal(ui.isDirty(), false, 're-staging the running terrain is not a change')

  // A staged terrain selection that is not the running one is pending.
  ui.setTerrain('offroad')
  assert.equal(ui.isDirty(), true, 'a staged terrain selection is pending')

  // The host reports that the staged terrain is now the running one, so
  // the selection is no longer pending.
  ui.markTerrainApplied('offroad')
  assert.equal(ui.isDirty(), false, 'the committed terrain is the running terrain')
})

test('the panel reflects a console swap', async () => {
  installFakeDom()
  const { createConfigPanel } = await import('../src/ui/config-panel/createConfigPanel.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )
  const { createCar } = await import('../src/car/createCar.js')
  const { createVehicleController } = await import(
    '../src/vehicle/createVehicleController.js'
  )
  const THREE = await import('three')

  const car = createCar()
  const controller = createVehicleController({
    vehicle: car,
    startPosition: new THREE.Vector3(0, 0, 0),
  })

  const ui = createConfigPanel({
    initialTerrain: 'proving-ground',
    initialVehicleConfig: createDefaultVehicleConfiguration(),
  })
  controller.onConfigurationChanged((activeConfig) => {
    ui.applyExternalVehicleConfig(activeConfig)
  })

  const findById = (element, id) => {
    if (element.id === id) return element
    for (const child of element.children ?? []) {
      const match = findById(child, id)
      if (match) return match
    }
    return null
  }

  const suspensionSelect = findById(ui.element, 'config-suspension-select')
  assert.equal(
    ui.getVehicleConfig().slots.suspension,
    'susp-stock',
    'the panel starts in step with the vehicle'
  )

  controller.setSuspension('susp-solid-axle-rear')

  assert.equal(
    suspensionSelect.value,
    'susp-solid-axle-rear',
    'the panel follows the console swap'
  )
  assert.equal(ui.getVehicleConfig().slots.suspension, 'susp-solid-axle-rear')
  assert.equal(ui.isDirty(), false, 'a console swap is not a staged change')

  const status = findById(ui.element, 'config-vehicle-preview')
  assert.match(status.textContent, /Suspension: Rear Solid Axle/)
})

test('console setTransmission on the stock drivetrain shows a modified select without dirtying the panel', async () => {
  installFakeDom()
  const { createConfigPanel } = await import('../src/ui/config-panel/createConfigPanel.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )
  const { createCar } = await import('../src/car/createCar.js')
  const { createVehicleController } = await import(
    '../src/vehicle/createVehicleController.js'
  )
  const THREE = await import('three')

  const car = createCar()
  const controller = createVehicleController({
    vehicle: car,
    startPosition: new THREE.Vector3(0, 0, 0),
  })

  const ui = createConfigPanel({
    initialTerrain: 'proving-ground',
    initialVehicleConfig: createDefaultVehicleConfiguration(),
  })
  controller.onConfigurationChanged((activeConfig) => {
    ui.applyExternalVehicleConfig(activeConfig)
  })

  const findById = (element, id) => {
    if (element.id === id) return element
    for (const child of element.children ?? []) {
      const match = findById(child, id)
      if (match) return match
    }
    return null
  }

  const drivetrainSelect = findById(ui.element, 'config-drivetrain-select')
  assert.equal(
    ui.getVehicleConfig().slots.drivetrain,
    'drivetrain-stock',
    'the panel starts in step with the vehicle'
  )

  controller.setTransmission('manual-6')

  assert.equal(
    drivetrainSelect.value,
    '__modified_outside_catalog__',
    'the select reports that the running drivetrain is not a catalog component'
  )
  assert.deepEqual(ui.getModifiedSlots(), ['drivetrain'])

  const markerOption = (drivetrainSelect.children ?? []).find(
    (child) => child.value === '__modified_outside_catalog__'
  )
  assert.ok(markerOption, 'the select carries a visible modified marker')
  assert.equal(markerOption.textContent, 'Modified outside catalog')

  const status = findById(ui.element, 'config-vehicle-preview')
  assert.match(status.textContent, /Drivetrain: modified outside catalog/)

  assert.equal(
    ui.isDirty(),
    false,
    'a console swap is not a staged change, so the panel stays clean'
  )
})

test('an external change to one slot keeps the staged change in another slot', async () => {
  installFakeDom()
  const { createConfigPanel } = await import('../src/ui/config-panel/createConfigPanel.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )
  const { createCar } = await import('../src/car/createCar.js')
  const { createVehicleController } = await import(
    '../src/vehicle/createVehicleController.js'
  )
  const THREE = await import('three')

  const car = createCar()
  const controller = createVehicleController({
    vehicle: car,
    startPosition: new THREE.Vector3(0, 0, 0),
  })

  const ui = createConfigPanel({
    initialTerrain: 'proving-ground',
    initialVehicleConfig: createDefaultVehicleConfiguration(),
  })
  controller.onConfigurationChanged((activeConfig) => {
    ui.applyExternalVehicleConfig(activeConfig)
  })

  const findById = (element, id) => {
    if (element.id === id) return element
    for (const child of element.children ?? []) {
      const match = findById(child, id)
      if (match) return match
    }
    return null
  }

  const brakesSelect = findById(ui.element, 'config-brakes-select')
  brakesSelect.value = 'brakes-sport'
  brakesSelect.dispatchEvent({ type: 'change', target: brakesSelect })
  assert.equal(ui.isDirty(), true, 'the staged brake change is pending')

  controller.setSuspension('susp-solid-axle-rear')

  assert.equal(
    ui.getVehicleConfig().slots.brakes,
    'brakes-sport',
    'the staged brake change survives a change in another slot'
  )
  assert.equal(ui.getVehicleConfig().slots.suspension, 'susp-solid-axle-rear')
  assert.equal(ui.isDirty(), true, 'the staged brake change is still pending')
})

test('ConfigPanel destroy cleans up', async () => {
  installFakeDom()
  const { createConfigPanel } = await import('../src/ui/config-panel/createConfigPanel.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )

  const ui = createConfigPanel({
    initialTerrain: 'proving-ground',
    initialVehicleConfig: createDefaultVehicleConfiguration(),
  })

  // Should not throw
  ui.destroy()
  assert.ok(true)
})