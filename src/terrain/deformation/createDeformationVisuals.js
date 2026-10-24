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
  const normalAttribute = geometry.getAttribute('normal')
  const indexAttribute = geometry.index

  // Capture the undeformed heights once; X and Z of a heightfield mesh are fixed.
  const baseHeightMeters = new Float64Array(vertexCount)
  for (let i = 0; i < vertexCount; i += 1) {
    baseHeightMeters[i] = positionAttribute.getY(i)
  }

  function update() {
    const bounds = typeof deformationField.consumeChangedBounds === 'function'
      ? deformationField.consumeChangedBounds()
      : deformationField.getActiveBounds()
    if (!bounds) return

    const influenceMarginMeters = deformationField.cellSizeMeters ?? spacingMeters
    const iMin = clampIndex(
      Math.floor((bounds.minXMeters - influenceMarginMeters + sizeMeters / 2) / spacingMeters),
      subdivisions
    )
    const iMax = clampIndex(
      Math.ceil((bounds.maxXMeters + sizeMeters / 2) / spacingMeters),
      subdivisions
    )
    const jMin = clampIndex(
      Math.floor((bounds.minZMeters - influenceMarginMeters + sizeMeters / 2) / spacingMeters),
      subdivisions
    )
    const jMax = clampIndex(
      Math.ceil((bounds.maxZMeters + sizeMeters / 2) / spacingMeters),
      subdivisions
    )
    if (iMin > iMax || jMin > jMax) return

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

    positionAttribute.clearUpdateRanges()
    for (let j = jMin; j <= jMax; j += 1) {
      const firstVertex = j * (subdivisions + 1) + iMin
      positionAttribute.addUpdateRange(
        firstVertex * positionAttribute.itemSize,
        (iMax - iMin + 1) * positionAttribute.itemSize
      )
    }
    positionAttribute.needsUpdate = true

    if (indexAttribute && vertexCount === (subdivisions + 1) ** 2) {
      const normalMinI = Math.max(0, iMin - 1)
      const normalMaxI = Math.min(subdivisions, iMax + 1)
      const normalMinJ = Math.max(0, jMin - 1)
      const normalMaxJ = Math.min(subdivisions, jMax + 1)
      recomputeGridNormals(
        positionAttribute,
        normalAttribute,
        indexAttribute,
        subdivisions,
        normalMinI,
        normalMaxI,
        normalMinJ,
        normalMaxJ
      )
      normalAttribute.clearUpdateRanges()
      for (let j = normalMinJ; j <= normalMaxJ; j += 1) {
        const firstVertex = j * (subdivisions + 1) + normalMinI
        normalAttribute.addUpdateRange(
          firstVertex * normalAttribute.itemSize,
          (normalMaxI - normalMinI + 1) * normalAttribute.itemSize
        )
      }
      normalAttribute.needsUpdate = true
    } else {
      geometry.computeVertexNormals()
      geometry.getAttribute('normal').needsUpdate = true
    }
  }

  function restoreAll() {
    for (let index = 0; index < vertexCount; index += 1) {
      positionAttribute.setY(index, baseHeightMeters[index])
    }
  }

  function reset() {
    restoreAll()
    geometry.computeVertexNormals()
    positionAttribute.clearUpdateRanges()
    positionAttribute.addUpdateRange(0, positionAttribute.array.length)
    positionAttribute.needsUpdate = true
    normalAttribute.clearUpdateRanges()
    normalAttribute.addUpdateRange(0, normalAttribute.array.length)
    normalAttribute.needsUpdate = true
  }

  return {
    kind: 'deformation-visuals-v1',
    update,
    reset,
  }
}

function recomputeGridNormals(
  positionAttribute,
  normalAttribute,
  indexAttribute,
  subdivisions,
  minI,
  maxI,
  minJ,
  maxJ
) {
  const rowLength = subdivisions + 1
  for (let j = minJ; j <= maxJ; j += 1) {
    for (let i = minI; i <= maxI; i += 1) {
      const targetVertex = j * rowLength + i
      let normalX = 0
      let normalY = 0
      let normalZ = 0
      const cellMinI = Math.max(0, i - 1)
      const cellMaxI = Math.min(subdivisions - 1, i)
      const cellMinJ = Math.max(0, j - 1)
      const cellMaxJ = Math.min(subdivisions - 1, j)

      for (let cellJ = cellMinJ; cellJ <= cellMaxJ; cellJ += 1) {
        for (let cellI = cellMinI; cellI <= cellMaxI; cellI += 1) {
          const firstIndex = (cellJ * subdivisions + cellI) * 6
          for (let triangleOffset = 0; triangleOffset < 6; triangleOffset += 3) {
            const vertexA = indexAttribute.getX(firstIndex + triangleOffset)
            const vertexB = indexAttribute.getX(firstIndex + triangleOffset + 1)
            const vertexC = indexAttribute.getX(firstIndex + triangleOffset + 2)
            if (vertexA !== targetVertex && vertexB !== targetVertex && vertexC !== targetVertex) {
              continue
            }

            const cbX = positionAttribute.getX(vertexC) - positionAttribute.getX(vertexB)
            const cbY = positionAttribute.getY(vertexC) - positionAttribute.getY(vertexB)
            const cbZ = positionAttribute.getZ(vertexC) - positionAttribute.getZ(vertexB)
            const abX = positionAttribute.getX(vertexA) - positionAttribute.getX(vertexB)
            const abY = positionAttribute.getY(vertexA) - positionAttribute.getY(vertexB)
            const abZ = positionAttribute.getZ(vertexA) - positionAttribute.getZ(vertexB)
            normalX += cbY * abZ - cbZ * abY
            normalY += cbZ * abX - cbX * abZ
            normalZ += cbX * abY - cbY * abX
          }
        }
      }

      const normalLength = Math.hypot(normalX, normalY, normalZ)
      if (normalLength > 0) {
        normalX /= normalLength
        normalY /= normalLength
        normalZ /= normalLength
      }
      normalAttribute.setXYZ(targetVertex, normalX, normalY, normalZ)
    }
  }
}

function clampIndex(value, maxIndex) {
  if (!Number.isFinite(value)) return 0
  return Math.min(maxIndex, Math.max(0, value))
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}