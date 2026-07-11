// src/vehicle/dynamics/chassisTerrainSupportState.js

import * as THREE from 'three'

const DEFAULT_RESPONSE_SECONDS = 0.1

export function createChassisTerrainSupportState(initialHeightMeters = 0) {
  return {
    currentChassisSupportHeightMeters: sanitizeNumber(initialHeightMeters),
    targetChassisSupportHeightMeters: sanitizeNumber(initialHeightMeters),
    supportTerrainHeightMeters: 0,
    supportHeightResponseSeconds: DEFAULT_RESPONSE_SECONDS,
    isWithinTerrainBounds: true,
    hasSupportSurface: false,
    profileName: 'unavailable',
    surfaceKind: 'unavailable',
    supportSlopeDegrees: 0,
    supportNormalWorld: new THREE.Vector3(0, 1, 0),
    terrainQueryResult: {
      normalWorld: new THREE.Vector3(0, 1, 0),
    },
  }
}

export function resetChassisTerrainSupportState(
  state,
  terrainContactQuery,
  worldXMeters,
  worldZMeters,
  baselineOffsetMeters = 0
) {
  updateChassisTerrainSupportState(state, {
    terrainContactQuery,
    worldXMeters,
    worldZMeters,
    baselineOffsetMeters,
    responseSeconds: 0,
    dtSeconds: 0,
    advancePersistentState: true,
    snapToTarget: true,
  })

  return state
}

export function updateChassisTerrainSupportState(
  state,
  {
    terrainContactQuery,
    worldXMeters,
    worldZMeters,
    baselineOffsetMeters = 0,
    responseSeconds = DEFAULT_RESPONSE_SECONDS,
    dtSeconds = 0,
    advancePersistentState = true,
    snapToTarget = false,
  } = {}
) {
  const safeBaselineOffsetMeters = sanitizeNumber(baselineOffsetMeters)
  const safeResponseSeconds = sanitizeNonNegativeNumber(
    responseSeconds,
    DEFAULT_RESPONSE_SECONDS
  )
  const safeDtSeconds = sanitizeNonNegativeNumber(dtSeconds)
  const queryResult = state.terrainQueryResult

  state.supportHeightResponseSeconds = safeResponseSeconds
  state.hasSupportSurface = false

  if (typeof terrainContactQuery?.queryAtWorldXZ !== 'function') {
    state.isWithinTerrainBounds = false
    state.profileName = 'unavailable'
    state.surfaceKind = 'unavailable'
    state.supportSlopeDegrees = 0
    state.supportNormalWorld.set(0, 1, 0)
    return state
  }

  terrainContactQuery.queryAtWorldXZ(
    sanitizeNumber(worldXMeters),
    sanitizeNumber(worldZMeters),
    queryResult
  )

  state.isWithinTerrainBounds = queryResult.isInsideTerrainBounds === true
  state.profileName = queryResult.profileName ?? 'unavailable'
  state.surfaceKind = queryResult.surfaceKind ?? 'unavailable'
  state.supportSlopeDegrees = sanitizeNonNegativeNumber(
    queryResult.slopeDegrees
  )
  copyFiniteNormal(
    state.supportNormalWorld,
    queryResult.normalWorld,
    0,
    1,
    0
  )

  if (!state.isWithinTerrainBounds) {
    return state
  }

  const terrainHeightMeters = sanitizeNumber(
    Number.isFinite(queryResult.terrainHeightMeters)
      ? queryResult.terrainHeightMeters
      : queryResult.groundHeightMeters
  )
  const targetChassisSupportHeightMeters =
    terrainHeightMeters + safeBaselineOffsetMeters

  state.hasSupportSurface = true
  state.supportTerrainHeightMeters = terrainHeightMeters
  state.targetChassisSupportHeightMeters =
    targetChassisSupportHeightMeters

  if (!advancePersistentState) {
    return state
  }

  if (snapToTarget || safeResponseSeconds <= Number.EPSILON) {
    state.currentChassisSupportHeightMeters =
      targetChassisSupportHeightMeters
    return state
  }

  if (safeDtSeconds <= 0) {
    return state
  }

  const responseAlpha = 1 - Math.exp(-safeDtSeconds / safeResponseSeconds)
  state.currentChassisSupportHeightMeters =
    sanitizeNumber(
      state.currentChassisSupportHeightMeters +
        (targetChassisSupportHeightMeters -
          state.currentChassisSupportHeightMeters) *
          responseAlpha,
      targetChassisSupportHeightMeters
    )

  return state
}

function copyFiniteNormal(target, source, fallbackX, fallbackY, fallbackZ) {
  target.set(
    Number.isFinite(source?.x) ? source.x : fallbackX,
    Number.isFinite(source?.y) ? source.y : fallbackY,
    Number.isFinite(source?.z) ? source.z : fallbackZ
  )

  if (target.lengthSq() <= Number.EPSILON) {
    target.set(fallbackX, fallbackY, fallbackZ)
  }

  target.normalize()
}

function sanitizeNonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}
