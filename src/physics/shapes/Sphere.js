// src/physics/shapes/Sphere.js

export function createSphere(radius, worldTransform = null) {
  if (!Number.isFinite(radius) || radius < 0) {
    throw new RangeError('Sphere radius must be a finite non-negative number')
  }

  return {
    type: 'sphere',
    radius,
    worldTransform,
  }
}
