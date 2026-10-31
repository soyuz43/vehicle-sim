// src/physics/shapes/Capsule.js

export function createCapsule(radiusMeters, halfHeightMeters, worldTransform = null) {
  if (!Number.isFinite(radiusMeters) || radiusMeters < 0) {
    throw new RangeError('Capsule radius must be a finite non-negative number')
  }
  if (!Number.isFinite(halfHeightMeters) || halfHeightMeters < 0) {
    throw new RangeError('Capsule halfHeightMeters must be a finite non-negative number')
  }

  return {
    type: 'capsule',
    radiusMeters,
    halfHeightMeters,
    worldTransform,
  }
}
