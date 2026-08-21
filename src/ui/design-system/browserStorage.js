// src/ui/design-system/browserStorage.js

function warnStorageFailure(operation, key, error) {
  console.warn(`Browser storage ${operation} failed for "${key}".`, error)
}

export function readStringFromStorage(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch (error) {
    warnStorageFailure('read', key, error)
    return null
  }
}

export function writeStringToStorage(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value)
    return true
  } catch (error) {
    warnStorageFailure('write', key, error)
    return false
  }
}

export function readJsonFromStorage(key) {
  const storedValue = readStringFromStorage(key)
  if (storedValue === null) {
    return null
  }

  try {
    return JSON.parse(storedValue)
  } catch (error) {
    warnStorageFailure('JSON parse', key, error)
    return null
  }
}

export function writeJsonToStorage(key, value) {
  try {
    return writeStringToStorage(key, JSON.stringify(value))
  } catch (error) {
    warnStorageFailure('JSON serialize', key, error)
    return false
  }
}
