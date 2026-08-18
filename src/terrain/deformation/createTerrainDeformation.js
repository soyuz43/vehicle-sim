// src/terrain/deformation/createTerrainDeformation.js

/**
 * Deterministic terrain deformation for the offroad playground (Phase 3).
 *
 * Tracks wheel-induced compression (ruts) of soft surfaces as a sparse grid of
 * depressions keyed by cell index. Only cells that actually deform are stored,
 * so memory and per-step cost stay bounded regardless of playground size. The
 * grid is queried bilinearly so the same offset feeds both the surface profile
 * (physics contact) and the mesh (visuals), keeping them in agreement.
 *
 * Coefficients come from the surface material catalog (deformabilityCoefficient)
 * plus a normal-load term and a motion term (ruts deepen when loaded and
 * moving). Depths ease toward a target each step (settling) and the target
 * slowly recovers toward zero when unloaded (healing). All behaviour is
 * deterministic and allocation-free in the hot query/accrue/step paths.
 *
 * This module never touches the default proving-ground profile: it is only
 * wired into the obstacle-aware profile used by offroad modes.
 */

import {
  DEFAULT_SURFACE_MATERIAL_CATALOG,
  resolveSurfaceProperties,
} from '../createSurfaceMaterialCatalog.js'

const DEFAULT_MIN_X_METERS = -160
const DEFAULT_MAX_X_METERS = 160
const DEFAULT_MIN_Z_METERS = -160
const DEFAULT_MAX_Z_METERS = 160
const DEFAULT_CELL_SIZE_METERS = 2
const DEFAULT_MAX_DEPTH_METERS = 0.25
const DEFAULT_SETTLE_RATE_PER_SECOND = 5
const DEFAULT_RECOVERY_RATE_PER_SECOND = 0.12
const DEFAULT_REFERENCE_LOAD_NEWTONS = 4000
const DEFAULT_MOTION_REFERENCE_SPEED_METERS_PER_SECOND = 6
const DEFORMABILITY_EPSILON = 1e-4
const DEPTH_EPSILON_METERS = 1e-4

export function createTerrainDeformation(config = {}) {
  const minXMeters = sanitizeNumber(config.minXMeters, DEFAULT_MIN_X_METERS)
  const maxXMeters = sanitizeNumber(config.maxXMeters, DEFAULT_MAX_X_METERS)
  const minZMeters = sanitizeNumber(config.minZMeters, DEFAULT_MIN_Z_METERS)
  const maxZMeters = sanitizeNumber(config.maxZMeters, DEFAULT_MAX_Z_METERS)
  const cellSizeMeters = sanitizePositiveNumber(config.cellSizeMeters, DEFAULT_CELL_SIZE_METERS)
  const maxDepthMeters = sanitizePositiveNumber(config.maxDepthMeters, DEFAULT_MAX_DEPTH_METERS)
  const settleRatePerSecond = sanitizePositiveNumber(config.settleRatePerSecond, DEFAULT_SETTLE_RATE_PER_SECOND)
  const recoveryRatePerSecond = sanitizePositiveNumber(config.recoveryRatePerSecond, DEFAULT_RECOVERY_RATE_PER_SECOND)
  const referenceLoadNewtons = sanitizePositiveNumber(config.referenceLoadNewtons, DEFAULT_REFERENCE_LOAD_NEWTONS)
  const motionReferenceSpeedMetersPerSecond = sanitizePositiveNumber(
    config.motionReferenceSpeedMetersPerSecond,
    DEFAULT_MOTION_REFERENCE_SPEED_METERS_PER_SECOND
  )
  const surfaceMaterialCatalog = config.surfaceMaterialCatalog ?? DEFAULT_SURFACE_MATERIAL_CATALOG

  const columns = Math.max(1, Math.ceil((maxXMeters - minXMeters) / cellSizeMeters))
  const rows = Math.max(1, Math.ceil((maxZMeters - minZMeters) / cellSizeMeters))

  // Sparse cell storage: key -> { depthMeters, targetDepthMeters, loadedThisStep }.
  const cells = new Map()
  let dirty = false
  let activeBounds = null

  function cellKey(col, row) {
    return row * columns + col
  }

  function depthAt(col, row) {
    if (col < 0 || row < 0 || col >= columns || row >= rows) return 0
    const cell = cells.get(cellKey(col, row))
    return cell ? cell.depthMeters : 0
  }

  function columnOf(worldXMeters) {
    return Math.floor((worldXMeters - minXMeters) / cellSizeMeters)
  }

  function rowOf(worldZMeters) {
    return Math.floor((worldZMeters - minZMeters) / cellSizeMeters)
  }

  // Negative offset (depression) added to terrain height. Bilinear over the 4
  // surrounding cell depths. Allocation-free.
  function getHeightOffsetAtWorldXZ(worldXMeters, worldZMeters) {
    const gx = (worldXMeters - minXMeters) / cellSizeMeters
    const gz = (worldZMeters - minZMeters) / cellSizeMeters
    const col = Math.floor(gx)
    const row = Math.floor(gz)
    const fx = gx - col
    const fz = gz - row

    const c00 = depthAt(col, row)
    const c10 = depthAt(col + 1, row)
    const c01 = depthAt(col, row + 1)
    const c11 = depthAt(col + 1, row + 1)

    const top = c00 * (1 - fx) + c10 * fx
    const bottom = c01 * (1 - fx) + c11 * fx
    const depthMeters = top * (1 - fz) + bottom * fz

    return depthMeters === 0 ? 0 : -depthMeters
  }

  // Accumulate rut targets from grounded wheel contacts on deformable surfaces.
  function accrueFromWheelContacts(wheelStates, vehicleSpeedMetersPerSecond) {
    if (!Array.isArray(wheelStates)) return
    const speedMetersPerSecond = sanitizeNonNegativeNumber(vehicleSpeedMetersPerSecond)
    const motionBase01 = clamp01(speedMetersPerSecond / motionReferenceSpeedMetersPerSecond)

    for (const wheelState of wheelStates) {
      if (!wheelState) continue
      if (!wheelState.isGrounded) continue

      const deformability = resolveSurfaceDeformability(wheelState.surfaceKind)
      if (deformability <= DEFORMABILITY_EPSILON) continue

      const contact = wheelState.contactPointWorldPosition
      if (!hasFiniteXZ(contact)) continue

      const loadNewtons = sanitizeNonNegativeNumber(wheelState.suspensionNormalForceNewtons)
      const loadFactor01 = clamp01(loadNewtons / referenceLoadNewtons)

      const isSlipDriven =
        wheelState.isDriveWheelSpinning === true ||
        wheelState.isBrakeLockTendency === true ||
        wheelState.isLongitudinalTractionSaturated === true

      const motion01 = isSlipDriven ? 1 : motionBase01
      let targetDepthMeters =
        deformability * maxDepthMeters * (0.35 + 0.65 * motion01) * loadFactor01
      targetDepthMeters = clamp(targetDepthMeters, 0, maxDepthMeters)
      if (targetDepthMeters <= DEPTH_EPSILON_METERS) continue

      const col = columnOf(contact.x)
      const row = rowOf(contact.z)
      const cell = ensureCell(col, row)
      if (targetDepthMeters > cell.targetDepthMeters) {
        cell.targetDepthMeters = targetDepthMeters
      }
      cell.loadedThisStep = true
    }
  }

  function ensureCell(col, row) {
    const key = cellKey(col, row)
    let cell = cells.get(key)
    if (!cell) {
      cell = { depthMeters: 0, targetDepthMeters: 0, loadedThisStep: false }
      cells.set(key, cell)
    }
    return cell
  }

  // Ease depths toward target, heal unloaded targets, prune empties, refresh
  // active bounds and the dirty flag.
  function step(deltaTimeSeconds) {
    const dt = sanitizeNonNegativeNumber(deltaTimeSeconds, 0)
    if (cells.size === 0) {
      if (activeBounds !== null) activeBounds = null
      dirty = false
      return
    }

    const settleFactor = dt > 0 ? Math.min(1, settleRatePerSecond * dt) : 0
    const recoveryDepth = dt > 0 ? recoveryRatePerSecond * dt * maxDepthMeters : 0

    let minCol = columns
    let maxCol = -1
    let minRow = rows
    let maxRow = -1
    let changedThisStep = false

    for (const [key, cell] of cells) {
      if (!cell.loadedThisStep) {
        cell.targetDepthMeters = Math.max(0, cell.targetDepthMeters - recoveryDepth)
      }
      cell.loadedThisStep = false

      const previousDepth = cell.depthMeters
      cell.depthMeters += (cell.targetDepthMeters - cell.depthMeters) * settleFactor

      if (cell.depthMeters < DEPTH_EPSILON_METERS && cell.targetDepthMeters < DEPTH_EPSILON_METERS) {
        cells.delete(key)
        continue
      }
      if (Math.abs(cell.depthMeters - previousDepth) > DEPTH_EPSILON_METERS) {
        changedThisStep = true
      }

      const col = key % columns
      const row = Math.floor(key / columns)
      if (col < minCol) minCol = col
      if (col > maxCol) maxCol = col
      if (row < minRow) minRow = row
      if (row > maxRow) maxRow = row
    }

    if (cells.size === 0) {
      activeBounds = null
    } else {
      activeBounds = {
        minXMeters: minXMeters + minCol * cellSizeMeters,
        maxXMeters: minXMeters + (maxCol + 1) * cellSizeMeters,
        minZMeters: minZMeters + minRow * cellSizeMeters,
        maxZMeters: minZMeters + (maxRow + 1) * cellSizeMeters,
      }
    }

    dirty = changedThisStep || cells.size > 0
  }

  // Single entry point used by the main loop: accrue then advance one step.
  function update(deltaTimeSeconds, wheelStates, vehicleSpeedMetersPerSecond) {
    accrueFromWheelContacts(wheelStates, vehicleSpeedMetersPerSecond)
    step(deltaTimeSeconds)
    return getSnapshot()
  }

  function resolveSurfaceDeformability(surfaceKind) {
    const properties = resolveSurfaceProperties(surfaceMaterialCatalog, surfaceKind)
    return sanitizeNonRateProperty(properties.deformabilityCoefficient)
  }

  function reset() {
    cells.clear()
    dirty = false
    activeBounds = null
  }

  function getActiveBounds() {
    return activeBounds
  }

  function getSnapshot() {
    let totalDepressionMeters = 0
    let maxDepthMetersResult = 0
    for (const cell of cells.values()) {
      totalDepressionMeters += cell.depthMeters
      if (cell.depthMeters > maxDepthMetersResult) {
        maxDepthMetersResult = cell.depthMeters
      }
    }
    return {
      activeCellCount: cells.size,
      maxDepthMeters: maxDepthMetersResult,
      totalDepressionMeters,
      dirty,
      activeBounds,
    }
  }

  return {
    kind: 'terrain-deformation-v1',
    cellSizeMeters,
    maxDepthMeters,
    bounds: { minXMeters, maxXMeters, minZMeters, maxZMeters, columns, rows },
    getHeightOffsetAtWorldXZ,
    accrueFromWheelContacts,
    step,
    update,
    reset,
    getActiveBounds,
    getSnapshot,
  }
}

function sanitizeNonRateProperty(value) {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function hasFiniteXZ(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.z)
}

function sanitizeNonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function sanitizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, sanitizeNumber(value)))
}

function clamp01(value) {
  return clamp(sanitizeNumber(value), 0, 1)
}