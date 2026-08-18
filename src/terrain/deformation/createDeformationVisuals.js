// src/terrain/deformation/createDeformationVisuals.js

/**
 * Visual-only mesh update for terrain deformation (Phase 3).
 *
 * Reads the terrain render mesh and a deformation field, then lowers the
 * vertices inside the deformation's active bounds by the bilinear depth offset
 * reported by the field. Because only the active region is touched, the cost is
 * proportional to the area of the ruts, not the full mesh. When deformation
 * fully heals (no active bounds) the touched vertices are restored to their
 * captured base height.
 *
 * Purely visual: this module reads deformation state and writes mesh geometry;
 * it never feeds back into physics or the simulation step.
 */

export function createDeformationVisuals(config = {}) {
  const terrainMesh = config.terrainMesh
  const deformationField = config.deformationField
  if (!terrainMesh || !terrainMesh.geometry) {
    throw new Error('createDeformationVisuals requires a terrainMesh with geometry')
  }
  if (!deformationField || typeof deformationField.getHeightOffsetAtWorldXZ !== 'function') {
    throw new Error('createDeformationVisuals requires a deformationField')
  }

  const geometry = terrainMesh.geometry
  const positionAttribute = geometry.getAttribute('position')
  const vertexCount = positionAttribute.count
  const sizeMeters = sanitizeNumber(terrainMesh.userData?.terrain?.sizeMeters, 320)
  const subdivisions = Math.max(1, Math.round(Math.sqrt(vertexCount)) - 1)
  const spacingMeters = sizeMeters / subdivisions

  // Capture the undeformed heights once; X and Z of a heightfield mesh are fixed.
  const baseHeightMeters = new Float64Array(vertexCount)
  for (let i = 0; i < vertexCount; i += 1) {
    baseHeightMeters[i] = positionAttribute.getY(i)
  }

  let dirtyRestored = false

  function update() {
    const bounds = deformationField.getActiveBounds()

    if (!bounds) {
      if (dirtyRestored) {
        restoreAll()
        dirtyRestored = false
        geometry.computeVertexNormals()
        positionAttribute.needsUpdate = true
      }
      return
    }

    dirtyRestored = true

    const iMin = clampIndex(Math.round((bounds.minXMeters + sizeMeters / 2) / spacingMeters), subdivisions)
    const iMax = clampIndex(Math.round((bounds.maxXMeters + sizeMeters / 2) / spacingMeters), subdivisions)
    const jMin = clampIndex(Math.round((bounds.minZMeters + sizeMeters / 2) / spacingMeters), subdivisions)
    const jMax = clampIndex(Math.round((bounds.maxZMeters + sizeMeters / 2) / spacingMeters), subdivisions)

    for (let j = jMin; j <= jMax; j += 1) {
      for (let i = iMin; i <= iMax; i += 1) {
        const index = j * (subdivisions + 1) + i
        if (index < 0 || index >= vertexCount) continue
        const worldXMeters = positionAttribute.getX(index)
        const worldZMeters = positionAttribute.getZ(index)
        const offsetMeters = deformationField.getHeightOffsetAtWorldXZ(worldXMeters, worldZMeters)
        positionAttribute.setY(index, baseHeightMeters[index] + offsetMeters)
      }
    }

    geometry.computeVertexNormals()
    positionAttribute.needsUpdate = true
  }

  function restoreAll() {
    for (let index = 0; index < vertexCount; index += 1) {
      positionAttribute.setY(index, baseHeightMeters[index])
    }
  }

  function reset() {
    restoreAll()
    dirtyRestored = false
    geometry.computeVertexNormals()
    positionAttribute.needsUpdate = true
  }

  return {
    kind: 'deformation-visuals-v1',
    update,
    reset,
  }
}

function clampIndex(value, maxIndex) {
  if (!Number.isFinite(value)) return 0
  return Math.min(maxIndex, Math.max(0, value))
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}