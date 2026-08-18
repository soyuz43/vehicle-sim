// test/vehicleCustomizationUI.test.js

import assert from 'node:assert/strict'
import test from 'node:test'

// Minimal fake DOM so the customization UI can be exercised without a browser.
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
    dispatchEvent(event) {
      for (const handler of this._listeners[event.type] ?? []) handler(event)
      return true
    },
  }
}

function installFakeDom() {
  const body = createFakeElement('body')
  globalThis.document = {
    createElement: (tag) => createFakeElement(tag),
    body,
  }
  return body
}

test('UI builds one select per slot and reflects the initial configuration', async () => {
  installFakeDom()
  const { createCustomizationUI } = await import('../src/vehicle/ui/createCustomizationUI.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )

  const ui = createCustomizationUI({
    configuration: createDefaultVehicleConfiguration(),
  })

  assert.ok(ui.slotSelects.chassis)
  assert.ok(ui.slotSelects.suspension)
  assert.ok(ui.slotSelects.wheels)
  assert.ok(ui.slotSelects.drivetrain)
  assert.ok(ui.slotSelects.brakes)
  assert.ok(ui.slotSelects.aero)
  assert.equal(ui.getConfiguration().slots.chassis, 'chassis-hatchback')
})

test('changing a slot select reports the new configuration via onChange', async () => {
  installFakeDom()
  const { createCustomizationUI } = await import('../src/vehicle/ui/createCustomizationUI.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )

  let reported = null
  const ui = createCustomizationUI({
    configuration: createDefaultVehicleConfiguration(),
    onChange: (next) => {
      reported = next
    },
  })

  ui.slotSelects.chassis.value = 'chassis-heavytruck'
  ui.slotSelects.chassis.dispatchEvent({ type: 'change' })

  assert.ok(reported != null)
  assert.equal(reported.slots.chassis, 'chassis-heavytruck')
  assert.equal(ui.getConfiguration().slots.chassis, 'chassis-heavytruck')
})

test('reset-to-default reports onReset and restores the default selection', async () => {
  installFakeDom()
  const { createCustomizationUI } = await import('../src/vehicle/ui/createCustomizationUI.js')
  const { createDefaultVehicleConfiguration } = await import(
    '../src/vehicle/config/createVehicleConfiguration.js'
  )

  let resetCalled = false
  const ui = createCustomizationUI({
    configuration: createDefaultVehicleConfiguration(),
    onReset: () => {
      resetCalled = true
    },
  })

  // Customize first.
  ui.slotSelects.chassis.value = 'chassis-heavytruck'
  ui.slotSelects.chassis.dispatchEvent({ type: 'change' })
  assert.equal(ui.getConfiguration().slots.chassis, 'chassis-heavytruck')

  // Simulate the reset wiring used by main.js (offroad mode).
  const defaultConfiguration = createDefaultVehicleConfiguration()
  assert.equal(resetCalled, false)
  ui.container.children
    .find((child) => child.textContent === 'Reset to Default')
    .dispatchEvent({ type: 'click' })
  assert.equal(resetCalled, true)
  ui.setConfiguration(defaultConfiguration)

  assert.equal(ui.getConfiguration().slots.chassis, 'chassis-hatchback')
  assert.equal(ui.slotSelects.chassis.value, 'chassis-hatchback')
})
