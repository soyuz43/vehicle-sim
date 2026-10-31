// src/physics/shapes/Sphere.js

export function createSphere(radiusMeters, worldTransform = null) {
  if (!Number.isFinite(radiusMeters) || radiusMeters < 0) {
    throw new RangeError('Sphere radius must be a finite non-negative number')
  }

  return {
    type: 'sphere',
    radiusMeters,
    worldTransform,
  }
}
