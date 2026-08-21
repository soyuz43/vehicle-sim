import assert from 'node:assert/strict'
import test from 'node:test'
import {
  readJsonFromStorage,
  readStringFromStorage,
  writeJsonToStorage,
  writeStringToStorage,
} from '../src/ui/design-system/browserStorage.js'

function withStorage(storage, run) {
  const previousStorage = globalThis.localStorage
  const previousWarn = console.warn
  globalThis.localStorage = storage
  console.warn = () => {}

  try {
    return run()
  } finally {
    globalThis.localStorage = previousStorage
    console.warn = previousWarn
  }
}

test('browser storage reads and writes strings', () => {
  withStorage({ getItem: () => 'dark', setItem: () => {} }, () => {
    assert.equal(readStringFromStorage('theme'), 'dark')
    assert.equal(writeStringToStorage('theme', 'light'), true)
  })
})

test('browser storage parses JSON values', () => {
  withStorage({ getItem: () => '{"enabled":true}' }, () => {
    assert.deepEqual(readJsonFromStorage('panel'), { enabled: true })
  })
})

test('malformed stored JSON is isolated and reports a warning', () => {
  const warnings = []
  const previousWarn = console.warn
  console.warn = (message, error) => warnings.push({ message, error })
  globalThis.localStorage = { getItem: () => '{broken' }

  try {
    assert.equal(readJsonFromStorage('panel'), null)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0].message, /JSON parse/)
  } finally {
    globalThis.localStorage = undefined
    console.warn = previousWarn
  }
})

test('storage write failures are isolated and report a warning', () => {
  const warnings = []
  const previousWarn = console.warn
  console.warn = (message, error) => warnings.push({ message, error })
  globalThis.localStorage = {
    setItem: () => {
      throw new Error('storage unavailable')
    },
  }

  try {
    assert.equal(writeStringToStorage('panel', 'value'), false)
    assert.equal(writeJsonToStorage('panel', { enabled: true }), false)
    assert.equal(warnings.length, 2)
    assert.match(warnings[0].message, /write/)
  } finally {
    globalThis.localStorage = undefined
    console.warn = previousWarn
  }
})
