// src/physics/shapes/Box.js

export function createBox(halfExtents, worldTransform = null) {
  if (
    !halfExtents ||
    !Number.isFinite(halfExtents.x) ||
    !Number.isFinite(halfExtents.y) ||
    !Number.isFinite(halfExtents.z) ||
    halfExtents.x < 0 ||
    halfExtents.y < 0 ||
    halfExtents.z < 0
  ) {
    throw new RangeError('Box halfExtents must be a vector of finite non-negative values')
  }

  return {
    type: 'box',
    halfExtents,
    worldTransform,
  }
}
