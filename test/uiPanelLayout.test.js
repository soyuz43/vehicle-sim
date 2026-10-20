import assert from 'node:assert/strict'
import test from 'node:test'
import { createPanel } from '../src/ui/design-system/components/Panel.js'
import { createSection } from '../src/ui/design-system/components/Section.js'
import { createSlider } from '../src/ui/design-system/components/Slider.js'
import { initResponsive, useMobileBottomSheet } from '../src/ui/design-system/layout/Responsive.js'

function createFakeElement(tagName) {
  const listeners = {}
  const attributes = {}
  const element = {
    tagName: tagName.toLowerCase(),
    style: {},
    children: [],
    parentNode: null,
    textContent: '',
    value: '',
    focus() { globalThis.document.activeElement = this },
    disabled: false,
    dataset: {},
    scrollHeight: 100,
    getBoundingClientRect() { return {} },
    appendChild(child) {
      this.children.push(child)
      child.parentNode = this
      return child
    },
    insertBefore(child, reference) {
      const index = this.children.indexOf(reference)
      this.children.splice(index < 0 ? this.children.length : index, 0, child)
      child.parentNode = this
      return child
    },
    removeChild(child) {
      const index = this.children.indexOf(child)
      if (index >= 0) this.children.splice(index, 1)
      child.parentNode = null
      return child
    },
    remove() {
      this.parentNode?.removeChild(this)
    },
    addEventListener(type, handler) {
      ;(listeners[type] ??= []).push(handler)
    },
    removeEventListener(type, handler) {
      listeners[type] = (listeners[type] ?? []).filter((current) => current !== handler)
    },
    dispatchEvent(event) {
      event.target ??= this
      for (const handler of listeners[event.type] ?? []) handler(event)
      return true
    },
    setAttribute(name, value) {
      attributes[name] = String(value)
    },
    getAttribute(name) {
      return attributes[name] ?? null
    },
    querySelector(selector) {
      if (selector === 'svg') {
        this._svg ??= createFakeElement('svg')
        return this._svg
      }
      for (const child of this.children) {
        if (child.matches(selector)) return child
        const match = child.querySelector(selector)
        if (match) return match
      }
      return null
    },
    querySelectorAll(selector) {
      const matches = []
      for (const child of this.children) {
        if (child.matches(selector)) matches.push(child)
        matches.push(...child.querySelectorAll(selector))
      }
      return matches
    },
    matches(selector) {
      return selector.split(',').some((candidate) => candidate.trim() === this.tagName)
    },
    closest(selector) {
      let current = this
      while (current) {
        if (current.matches(selector)) return current
        current = current.parentNode
      }
      return null
    },
    contains(target) {
      return target === this || this.children.some((child) => child.contains(target))
    },
    set innerHTML(value) {
      this._innerHTML = value
      this.children = []
    },
    get innerHTML() {
      return this._innerHTML ?? ''
    },
    setPointerCapture() {},
    releasePointerCapture() {},
  }
  return element
}

function installFakeDom(initialViewportWidth = 390) {
  const body = createFakeElement('body')
  const documentElement = createFakeElement('html')
  let viewportWidth = initialViewportWidth
  const mediaQueries = []
  globalThis.document = {
    createElement: (tagName) => createFakeElement(tagName),
    body,
    documentElement,
    activeElement: null,
    addEventListener() {},
    removeEventListener() {},
  }
  const storage = {
    getItem: () => null,
    setItem() {},
    removeItem() {},
  }
  globalThis.localStorage = storage
  globalThis.window = {
    localStorage: storage,
    matchMedia(query) {
      const minimumWidth = Number(query.match(/min-width:\s*(\d+)px/)?.[1] ?? 0)
      const listeners = []
      const mediaQuery = {
        media: query,
        get matches() {
          return viewportWidth >= minimumWidth
        },
        addEventListener(type, handler) {
          if (type === 'change') listeners.push(handler)
        },
        removeEventListener(type, handler) {
          const index = listeners.indexOf(handler)
          if (index >= 0) listeners.splice(index, 1)
        },
        notify() {
          for (const handler of [...listeners]) handler({ matches: this.matches })
        },
      }
      mediaQueries.push(mediaQuery)
      return mediaQuery
    },
  }
  return {
    body,
    setViewportWidth(width) {
      viewportWidth = width
      for (const mediaQuery of mediaQueries) mediaQuery.notify()
    },
  }
}

test('sliders without visible values remain interactive and accept accessible names', () => {
  installFakeDom()
  let inputValue = null
  const slider = createSlider({
    id: 'pressure-slider',
    value: 220,
    min: 0,
    max: 340,
    showValue: false,
    ariaLabel: 'Tire pressure (kPa)',
    onInput: (value) => { inputValue = value },
  })
  assert.equal(slider.input.getAttribute('aria-label'), 'Tire pressure (kPa)')
  slider.input.value = '221'
  assert.doesNotThrow(() => slider.input.dispatchEvent({ type: 'input' }))
  assert.equal(inputValue, 221)
  assert.doesNotThrow(() => slider.setValue(220))
  assert.equal(slider.getValue(), 220)
})

test('panels scroll within viewport bounds and collapse accessibly', () => {
  installFakeDom()
  const panel = createPanel({ id: 'layout-test-panel', title: 'Layout Test' })
  const collapseButton = panel.header.children[1].children[0]
  const contentWrapper = panel.element.children[1]
  let prevented = false

  assert.equal(panel.element.style.maxHeight, 'calc(50dvh - var(--ui-space-xl))')
  assert.equal(contentWrapper.style.overflowY, 'auto')
  assert.equal(collapseButton.getAttribute('aria-controls'), 'layout-test-panel-content')
  assert.equal(collapseButton.getAttribute('aria-expanded'), 'true')

  panel.header.dispatchEvent({
    type: 'pointerdown',
    button: 0,
    pointerId: 1,
    target: collapseButton,
    preventDefault() { prevented = true },
  })
  assert.equal(prevented, false)

  collapseButton.dispatchEvent({ type: 'click' })
  assert.equal(panel.isCollapsed(), true)
  assert.equal(collapseButton.getAttribute('aria-expanded'), 'false')
  assert.equal(contentWrapper.getAttribute('aria-hidden'), 'true')
  assert.equal(contentWrapper.inert, true)

  panel.expand()
  assert.equal(collapseButton.getAttribute('aria-expanded'), 'true')
  assert.equal(contentWrapper.inert, false)
  panel.destroy()
})

test('sections keep late-added content visible and expose keyboard state', () => {
  installFakeDom()
  const section = createSection({ id: 'late-content-section', title: 'Late Content' })
  const contentWrapper = section.element.children[1]
  section.content.appendChild(document.createElement('input'))

  assert.equal(section.header.tagName, 'button')
  assert.equal(section.header.getAttribute('aria-controls'), 'late-content-section-content')
  assert.equal(section.header.getAttribute('aria-expanded'), 'true')
  assert.equal(contentWrapper.style.maxHeight, 'none')

  section.header.dispatchEvent({ type: 'click' })
  assert.equal(section.header.getAttribute('aria-expanded'), 'false')
  assert.equal(contentWrapper.inert, true)
  assert.equal(contentWrapper.getAttribute('aria-hidden'), 'true')

  section.header.dispatchEvent({ type: 'click' })
  contentWrapper.dispatchEvent({ type: 'transitionend', propertyName: 'max-height' })
  assert.equal(section.header.getAttribute('aria-expanded'), 'true')
  assert.equal(contentWrapper.inert, false)
  assert.equal(contentWrapper.style.maxHeight, 'none')
  section.destroy()
})

test('mobile panels have reachable launchers and restore their desktop anchors', () => {
  const dom = installFakeDom()
  const responsive = initResponsive()
  const firstPanel = createPanel({ id: 'first-panel', title: 'First', anchor: 'top-left' })
  const secondPanel = createPanel({ id: 'second-panel', title: 'Second', anchor: 'bottom-right' })
  const firstSheet = useMobileBottomSheet(firstPanel, { breakpoint: 'lg' })
  const secondSheet = useMobileBottomSheet(secondPanel, { breakpoint: 'lg' })
  const navigation = dom.body.children.find((element) => element.id === 'ui-mobile-panel-navigation')
  const [firstButton, secondButton] = navigation.children

  assert.equal(navigation.style.display, 'flex')
  assert.equal(firstPanel.element.style.transform.startsWith('translateY(calc(100%'), true)
  assert.equal(firstPanel.isDraggable(), false)
  assert.equal(firstPanel.element.inert, true)
  assert.equal(firstPanel.element.getAttribute('aria-hidden'), 'true')
  assert.equal(firstButton.getAttribute('aria-controls'), 'first-panel')
  assert.equal(firstButton.style.minHeight, '44px')

  firstButton.dispatchEvent({ type: 'click' })
  assert.equal(firstPanel.element.style.transform, 'translateY(0)')
  assert.equal(firstPanel.element.inert, false)
  assert.equal(firstPanel.element.getAttribute('aria-hidden'), 'false')
  assert.equal(firstButton.getAttribute('aria-expanded'), 'true')
  assert.equal(document.activeElement, firstPanel.header.children[1].children[0])

  secondButton.dispatchEvent({ type: 'click' })
  assert.equal(firstPanel.element.style.transform.startsWith('translateY(calc(100%'), true)
  assert.equal(secondPanel.element.style.transform, 'translateY(0)')
  assert.equal(firstButton.getAttribute('aria-expanded'), 'false')
  assert.equal(firstPanel.element.inert, true)
  assert.equal(secondPanel.element.inert, false)
  assert.equal(secondButton.getAttribute('aria-expanded'), 'true')

  dom.setViewportWidth(1024)
  assert.equal(navigation.style.display, 'none')
  assert.equal(firstPanel.element.style.transform, 'none')
  assert.equal(firstPanel.element.style.left, 'var(--ui-space-md)')
  assert.equal(secondPanel.element.style.right, 'var(--ui-space-md)')
  assert.equal(firstPanel.isDraggable(), true)
  assert.equal(firstPanel.element.inert, false)
  assert.equal(firstPanel.element.getAttribute('aria-hidden'), 'false')

  dom.setViewportWidth(844)
  assert.equal(navigation.style.display, 'flex')
  assert.equal(firstPanel.element.style.left, 'var(--ui-space-sm)')

  firstSheet.destroy()
  secondSheet.destroy()
  firstPanel.destroy()
  secondPanel.destroy()
  responsive.destroy()
  assert.equal(dom.body.children.includes(navigation), false)
})

test('rear differential select exposes valid option values', async () => {
  installFakeDom()
  const responsive = initResponsive()
  const { createControlPanel } = await import('../src/ui/control-panel/createControlPanel.js')
  let selectedDifferential = null
  const panel = createControlPanel({
    onRearDifferentialChange: (value) => { selectedDifferential = value; },
  })
  const findById = (element, id) => {
    if (element.id === id) return element
    for (const child of element.children ?? []) {
      const match = findById(child, id)
      if (match) return match
    }
    return null
  }
  const differentialSelect = findById(panel.element, 'rear-differential-select')

  assert.ok(differentialSelect.children.some((option) => option.value === 'torsen'))
  differentialSelect.value = 'torsen'
  differentialSelect.dispatchEvent({ type: 'change', target: differentialSelect })
  assert.equal(selectedDifferential, 'torsen')

  panel.destroy()
  responsive.destroy()
})