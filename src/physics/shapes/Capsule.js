// src/physics/shapes/Capsule.js

export function createCapsule(radius, halfHeight, worldTransform = null) {
  if (!Number.isFinite(radius) || radius < 0) {
    throw new RangeError('Capsule radius must be a finite non-negative number')
  }
  if (!Number.isFinite(halfHeight) || halfHeight < 0) {
    throw new RangeError('Capsule halfHeight must be a finite non-negative number')
  }

  return {
    type: 'capsule',
    radius,
    halfHeight,
    worldTransform,
  }
}
