// src/physics/shapes/Box.js

export function createBox(halfExtentsMeters, worldTransform = null) {
  if (
    !halfExtentsMeters ||
    !Number.isFinite(halfExtentsMeters.x) ||
    !Number.isFinite(halfExtentsMeters.y) ||
    !Number.isFinite(halfExtentsMeters.z) ||
    halfExtentsMeters.x < 0 ||
    halfExtentsMeters.y < 0 ||
    halfExtentsMeters.z < 0
  ) {
    throw new RangeError('Box halfExtentsMeters must be a vector of finite non-negative values')
  }

  return {
    type: 'box',
    halfExtentsMeters,
    worldTransform,
  }
}
