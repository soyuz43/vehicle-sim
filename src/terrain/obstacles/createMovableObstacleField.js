// src/terrain/obstacles/createMovableObstacleField.js

/**
 * Movable obstacle field for the offroad playground.
 *
 * Extends the static obstacle field to allow obstacles to move in response
 * to vehicle contact. Reuses the mass/inertia already computed in the static
 * obstacle field. When the vehicle contacts a movable obstacle, exchange
 * momentum realistically (impulse or penalty-based), and integrate obstacle
 * motion under gravity + ground constraint.
 */

import { createObstacleField } from './createObstacleField.js'

export function createMovableObstacleField(config = {}) {
  const staticField = createObstacleField(config)
  const obstacles = staticField.getObstacles()
  
  // Initialize physics state for each movable obstacle
  const movableObstacles = obstacles.map(obstacle => {
    // Only certain obstacles should be movable (e.g., not massive rocks)
    const isMovable = shouldObstacleBeMovable(obstacle)
    
    return {
      ...obstacle,
      isMovable,
      position: {
        x: obstacle.centerXMeters,
        y: 0, // Will be set based on terrain height
        z: obstacle.centerZMeters
      },
      velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: 0,
      orientation: 0 // Yaw rotation in radians
    }
  })
  
  // Sample the top surface at (x,z), including movable obstacles
  function sampleTopSurfaceAtWorldXZ(worldXMeters, worldZMeters) {
    // First check static obstacles (unchanged behavior)
    const staticResult = staticField.sampleTopSurfaceAtWorldXZ(worldXMeters, worldZMeters)
    
    // Then check movable obstacles
    let bestMovable = null
    for (const obstacle of movableObstacles) {
      if (!obstacle.isMovable) continue
      
      // For now, we'll use the same logic as static obstacles
      // In a full implementation, we would account for the obstacle's current position
      const dx = worldXMeters - obstacle.position.x
      const dz = worldZMeters - obstacle.position.z
      
      let localHeightMeters = 0
      if (obstacle.shape === 'dome') {
        const r = Math.hypot(dx, dz)
        if (r < obstacle.radiusMeters) {
          localHeightMeters = Math.sqrt(
            Math.max(0, obstacle.radiusMeters * obstacle.radiusMeters - r * r)
          )
        }
      } else if (obstacle.shape === 'cylinder') {
        const r = Math.hypot(dx, dz)
        if (r < obstacle.radiusMeters) {
          localHeightMeters = obstacle.heightMeters
        }
      } else { // box
        const ax = Math.abs(dx)
        const az = Math.abs(dz)
        if (ax < obstacle.halfExtentXMeters && az < obstacle.halfExtentZMeters) {
          localHeightMeters = obstacle.heightMeters
        }
      }
      
      if (localHeightMeters > 0 && 
          (bestMovable === null || localHeightMeters > bestMovable.localHeightMeters)) {
        bestMovable = {
          localHeightMeters,
          surfaceKind: obstacle.surfaceKind,
          frictionCoefficient: obstacle.frictionCoefficient,
          obstacleId: obstacle.id,
          shape: obstacle.shape,
        }
      }
    }
    
    // Return the higher of the static and movable obstacles
    if (bestMovable && (!staticResult || bestMovable.localHeightMeters > staticResult.localHeightMeters)) {
      return bestMovable
    }
    
    return staticResult
  }
  
  // Apply force to a movable obstacle
  function applyForceToObstacle(obstacleId, force, contactPoint, deltaTimeSeconds) {
    const obstacle = movableObstacles.find(o => o.id === obstacleId)
    if (!obstacle || !obstacle.isMovable) return
    
    // F = ma, so a = F/m
    const acceleration = {
      x: force.x / obstacle.massKg,
      y: force.y / obstacle.massKg,
      z: force.z / obstacle.massKg
    }
    
    // Update velocity: v = v0 + a*t
    obstacle.velocity.x += acceleration.x * deltaTimeSeconds
    obstacle.velocity.y += acceleration.y * deltaTimeSeconds
    obstacle.velocity.z += acceleration.z * deltaTimeSeconds
    
    // Apply angular acceleration (torque = I * alpha, so alpha = torque/I)
    // Simplified 2D rotation around Y axis
    if (contactPoint) {
      // Calculate torque as cross product of force and lever arm
      const leverX = contactPoint.x - obstacle.position.x
      const leverZ = contactPoint.z - obstacle.position.z
      const torque = force.x * leverZ - force.z * leverX // Y component of cross product
      const angularAcceleration = torque / obstacle.inertiaKgMeterSquared
      obstacle.angularVelocity += angularAcceleration * deltaTimeSeconds
    }
  }
  
  // Update obstacle positions based on velocity
  function update(deltaTimeSeconds) {
    for (const obstacle of movableObstacles) {
      if (!obstacle.isMovable) continue
      
      // Update position: x = x0 + v*t
      obstacle.position.x += obstacle.velocity.x * deltaTimeSeconds
      obstacle.position.y += obstacle.velocity.y * deltaTimeSeconds
      obstacle.position.z += obstacle.velocity.z * deltaTimeSeconds
      
      // Update orientation
      obstacle.orientation += obstacle.angularVelocity * deltaTimeSeconds
      
      // Apply gravity
      obstacle.velocity.y -= 9.80665 * deltaTimeSeconds
      
      // Simple ground constraint (in a real implementation, this would be more complex)
      // For now, we'll just stop vertical movement when below ground
      if (obstacle.position.y < 0) {
        obstacle.position.y = 0
        obstacle.velocity.y = 0
      }
      
      // Apply damping to prevent infinite motion
      const dampingFactor = 0.98
      obstacle.velocity.x *= dampingFactor
      obstacle.velocity.z *= dampingFactor
      obstacle.angularVelocity *= dampingFactor
    }
  }
  
  function getObstacles() {
    return movableObstacles
  }
  
  return {
    kind: 'movable-obstacle-field-v1',
    sampleTopSurfaceAtWorldXZ,
    applyForceToObstacle,
    update,
    getObstacles,
  }
}

function shouldObstacleBeMovable(obstacle) {
  // For now, make smaller obstacles movable
  // In a full implementation, this could be based on mass, size, or explicit configuration
  if (obstacle.shape === 'dome') {
    return obstacle.radiusMeters <= 0.7
  }
  if (obstacle.shape === 'cylinder') {
    return obstacle.radiusMeters <= 0.6 && obstacle.heightMeters <= 0.6
  }
  if (obstacle.shape === 'box') {
    return obstacle.halfExtentXMeters <= 0.7 && obstacle.halfExtentZMeters <= 0.7 && obstacle.heightMeters <= 0.6
  }
  return false
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}
