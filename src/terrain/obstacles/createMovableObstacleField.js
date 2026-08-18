// src/terrain/obstacles/createMovableObstacleField.js

/**
 * Movable obstacle field for the offroad playground (Phase 3).
 *
 * Extends the static obstacle field so a subset of obstacles (lightweight
 * rocks/blocks) become dynamic rigid bodies in the XZ plane with a vertical
 * bounce. Mass and yaw inertia are reused from the static field, which derives
 * them from geometry and real material density, so no physical quantities are
 * invented here.
 *
 * Each fixed step the field integrates obstacle motion (semi-implicit Euler):
 *   - gravity on the vertical axis,
 *   - a ground constraint against the terrain height query (no bounce by
 *     default, so no energy is introduced),
 *   - Coulomb sliding friction with the ground (a = mu * g, exact, no energy
 *     gain) plus a rolling-resistance-derived spin decay,
 *   - finite NaN/Infinity guards that reset a corrupted obstacle to rest.
 *
 * Momentum exchange with the vehicle is performed by a separate interaction
 * module (createVehicleObstacleInteraction) that resolves contacts through the
 * surface profile and calls applyImpulseToObstacle. The field keeps the
 * original force-based applyForceToObstacle/update pair for compatibility and
 * simple kinematic nudges.
 *
 * All sampling reads the obstacle's CURRENT center so the height overlay tracks
 * the moving geometry, and the static (non-movable) obstacles keep their
 * original fixed behaviour.
 */

import { createObstacleField } from './createObstacleField.js'

const GRAVITY_METERS_PER_SECOND_SQUARED = 9.80665
const DEFAULT_EDGE_RAMP_METERS = 0.25
const GROUND_LINEAR_RESTITUTION = 0
const GROUND_ANGULAR_DECAY_PER_SECOND = 1.5
const VELOCITY_EPSILON_METERS_PER_SECOND = 1e-4
const ANGULAR_VELOCITY_EPSILON_RADIANS_PER_SECOND = 1e-3

export function createMovableObstacleField(config = {}) {
  const staticField = createObstacleField(config)
  const staticObstacles = staticField.getObstacles()
  const edgeRampMeters = sanitizeNonNegativeNumber(
    config.edgeRampMeters,
    DEFAULT_EDGE_RAMP_METERS
  )

  const initialStates = staticObstacles.map((obstacle) => ({
    id: obstacle.id,
    shape: obstacle.shape,
    surfaceKind: obstacle.surfaceKind,
    frictionCoefficient: obstacle.frictionCoefficient,
    rollingResistanceCoefficient: obstacle.rollingResistanceCoefficient,
    massKg: obstacle.massKg,
    inertiaKgMeterSquared: obstacle.inertiaKgMeterSquared,
    radiusMeters: obstacle.radiusMeters,
    heightMeters: obstacle.heightMeters,
    halfExtentXMeters: obstacle.halfExtentXMeters,
    halfExtentZMeters: obstacle.halfExtentZMeters,
    isMovable: shouldObstacleBeMovable(obstacle),
    initialCenterXMeters: obstacle.centerXMeters,
    initialCenterZMeters: obstacle.centerZMeters,
  }))

  // Live runtime state per obstacle (reused across steps, never reallocated).
  const runtimeStates = initialStates.map((descriptor) => ({
    ...descriptor,
    position: { x: descriptor.initialCenterXMeters, y: 0, z: descriptor.initialCenterZMeters },
    velocity: { x: 0, y: 0, z: 0 },
    angularVelocityYRadiansPerSecond: 0,
    orientationYawRadians: 0,
  }))

  const runtimeById = new Map()
  for (const state of runtimeStates) {
    runtimeById.set(state.id, state)
  }

  // Sample the highest obstacle LOCAL height (above its base) at (x,z),
  // including the moving positions of movable obstacles. Returns the same
  // contract as the static field plus obstacleId for contact attribution.
  function sampleTopSurfaceAtWorldXZ(worldXMeters, worldZMeters) {
    const staticResult = staticField.sampleTopSurfaceAtWorldXZ(
      worldXMeters,
      worldZMeters
    )

    let best = null
    for (const obstacle of runtimeStates) {
      if (!obstacle.isMovable) continue
      const localHeightMeters = obstacleLocalHeightMeters(
        obstacle,
        worldXMeters,
        worldZMeters,
        edgeRampMeters
      )
      if (
        localHeightMeters > 0 &&
        (best === null || localHeightMeters > best.localHeightMeters)
      ) {
        best = {
          localHeightMeters,
          surfaceKind: obstacle.surfaceKind,
          frictionCoefficient: obstacle.frictionCoefficient,
          obstacleId: obstacle.id,
          shape: obstacle.shape,
        }
      }
    }

    if (best && (!staticResult || best.localHeightMeters > staticResult.localHeightMeters)) {
      return best
    }
    return staticResult
  }

  function getObstacleById(obstacleId) {
    return runtimeById.get(obstacleId) ?? null
  }

  // Force-based impulse accumulation (compatibility + kinematic nudges).
  function applyForceToObstacle(obstacleId, force, contactPoint, deltaTimeSeconds) {
    const obstacle = runtimeById.get(obstacleId)
    if (!obstacle || !obstacle.isMovable) return
    const dt = sanitizeNonNegativeNumber(deltaTimeSeconds, 0)
    const massKg = obstacle.massKg > 0 ? obstacle.massKg : 1

    obstacle.velocity.x += (force.x / massKg) * dt
    obstacle.velocity.y += (force.y / massKg) * dt
    obstacle.velocity.z += (force.z / massKg) * dt

    if (contactPoint) {
      const leverX = contactPoint.x - obstacle.position.x
      const leverZ = contactPoint.z - obstacle.position.z
      const torqueY = force.x * leverZ - force.z * leverX
      obstacle.angularVelocityYRadiansPerSecond +=
        (torqueY / obstacle.inertiaKgMeterSquared) * dt
    }
  }

  // Impulse-based momentum application for collision resolution. The impulse is
  // applied to linear velocity and to yaw spin via the vertical lever torque.
  function applyImpulseToObstacle(
    obstacleId,
    impulseXNewtonsSecond,
    impulseYNewtonsSecond,
    impulseZNewtonsSecond,
    contactPointXMeters,
    contactPointZMeters
  ) {
    const obstacle = runtimeById.get(obstacleId)
    if (!obstacle || !obstacle.isMovable) return

    const massKg = obstacle.massKg > 0 ? obstacle.massKg : 1
    obstacle.velocity.x += impulseXNewtonsSecond / massKg
    obstacle.velocity.y += impulseYNewtonsSecond / massKg
    obstacle.velocity.z += impulseZNewtonsSecond / massKg

    const leverX = contactPointXMeters - obstacle.position.x
    const leverZ = contactPointZMeters - obstacle.position.z
    const torqueYNewtonsMeterSecond =
      leverX * impulseZNewtonsSecond - leverZ * impulseXNewtonsSecond
    obstacle.angularVelocityYRadiansPerSecond +=
      torqueYNewtonsMeterSecond / obstacle.inertiaKgMeterSquared
  }

  // Deterministic integration of all movable obstacles against the ground.
  // terrainHeightFn is optional (tests may omit it); when present it returns
  // the world terrain height under a world XZ position.
  function stepMovableObstacles(deltaTimeSeconds, terrainHeightFn) {
    const dt = sanitizeNonNegativeNumber(deltaTimeSeconds, 0)
    if (dt <= 0) return

    for (const obstacle of runtimeStates) {
      if (!obstacle.isMovable) continue

      // Semi-implicit Euler: update velocity, then position.
      obstacle.velocity.y -= GRAVITY_METERS_PER_SECOND_SQUARED * dt

      obstacle.position.x += obstacle.velocity.x * dt
      obstacle.position.y += obstacle.velocity.y * dt
      obstacle.position.z += obstacle.velocity.z * dt
      obstacle.orientationYawRadians += obstacle.angularVelocityYRadiansPerSecond * dt

      // Ground constraint + friction (only when a terrain query is available).
      const groundYMeters =
        typeof terrainHeightFn === 'function'
          ? terrainHeightFn(obstacle.position.x, obstacle.position.z)
          : null

      if (Number.isFinite(groundYMeters)) {
        const penetrationMeters = groundYMeters - obstacle.position.y
        if (penetrationMeters > 0) {
          obstacle.position.y = groundYMeters
          if (obstacle.velocity.y < 0) {
            obstacle.velocity.y = -obstacle.velocity.y * GROUND_LINEAR_RESTITUTION
          }
          applyGroundFriction(obstacle, dt)
        }
      }

      sanitizeObstacleState(obstacle)
    }
  }

  // Exact Coulomb sliding friction with the ground plus gentle spin decay.
  function applyGroundFriction(obstacle, dt) {
    const speedMetersPerSecond = Math.hypot(obstacle.velocity.x, obstacle.velocity.z)
    if (speedMetersPerSecond > VELOCITY_EPSILON_METERS_PER_SECOND) {
      const mu = sanitizeNonNegativeNumber(obstacle.frictionCoefficient, 0)
      const decelMetersPerSecondSquared = mu * GRAVITY_METERS_PER_SECOND_SQUARED * dt
      const nextSpeed = Math.max(0, speedMetersPerSecond - decelMetersPerSecondSquared)
      const scale = nextSpeed / speedMetersPerSecond
      obstacle.velocity.x *= scale
      obstacle.velocity.z *= scale
    }

    if (
      Math.abs(obstacle.angularVelocityYRadiansPerSecond) >
      ANGULAR_VELOCITY_EPSILON_RADIANS_PER_SECOND
    ) {
      const decay = Math.max(0, 1 - GROUND_ANGULAR_DECAY_PER_SECOND * dt)
      obstacle.angularVelocityYRadiansPerSecond *= decay
    } else {
      obstacle.angularVelocityYRadiansPerSecond = 0
    }
  }

  // Backwards-compatible alias (no terrain constraint when called directly).
  function update(deltaTimeSeconds) {
    stepMovableObstacles(deltaTimeSeconds, null)
  }

  function reset() {
    for (const obstacle of runtimeStates) {
      obstacle.position.x = obstacle.initialCenterXMeters
      obstacle.position.y = 0
      obstacle.position.z = obstacle.initialCenterZMeters
      obstacle.velocity.x = 0
      obstacle.velocity.y = 0
      obstacle.velocity.z = 0
      obstacle.angularVelocityYRadiansPerSecond = 0
      obstacle.orientationYawRadians = 0
    }
  }

  function getObstacles() {
    return runtimeStates
  }

  return {
    kind: 'movable-obstacle-field-v2',
    edgeRampMeters,
    sampleTopSurfaceAtWorldXZ,
    getObstacleById,
    applyForceToObstacle,
    applyImpulseToObstacle,
    stepMovableObstacles,
    update,
    reset,
    getObstacles,
  }
}

// Local height of an obstacle top above its current base at (x,z). Mirrors the
// static field geometry but uses the obstacle's live center position so the
// overlay follows the moving body.
function obstacleLocalHeightMeters(obstacle, worldXMeters, worldZMeters, edgeRampMeters) {
  const dx = worldXMeters - obstacle.position.x
  const dz = worldZMeters - obstacle.position.z

  if (obstacle.shape === 'dome') {
    const r = Math.hypot(dx, dz)
    if (r >= obstacle.radiusMeters) return 0
    return Math.sqrt(
      Math.max(0, obstacle.radiusMeters * obstacle.radiusMeters - r * r)
    )
  }

  if (obstacle.shape === 'cylinder') {
    const r = Math.hypot(dx, dz)
    if (r >= obstacle.radiusMeters) return 0
    const distanceInside = obstacle.radiusMeters - r
    return obstacle.heightMeters * rampScale(distanceInside, edgeRampMeters)
  }

  const ax = Math.abs(dx)
  const az = Math.abs(dz)
  if (ax >= obstacle.halfExtentXMeters || az >= obstacle.halfExtentZMeters) {
    return 0
  }
  const distanceInside = Math.min(
    obstacle.halfExtentXMeters - ax,
    obstacle.halfExtentZMeters - az
  )
  return obstacle.heightMeters * rampScale(distanceInside, edgeRampMeters)
}

function rampScale(distanceInsideMeters, edgeRampMeters) {
  const ramp = sanitizeNonNegativeNumber(edgeRampMeters, 0)
  if (ramp <= 0) return 1
  return Math.min(1, distanceInsideMeters / ramp)
}

function shouldObstacleBeMovable(obstacle) {
  // Lightweight obstacles become dynamic; massive rocks stay fixed. Thresholds
  // are size-based (the static field already derives mass from geometry).
  if (obstacle.shape === 'dome') {
    return obstacle.radiusMeters <= 0.7
  }
  if (obstacle.shape === 'cylinder') {
    return obstacle.radiusMeters <= 0.6 && obstacle.heightMeters <= 0.6
  }
  if (obstacle.shape === 'box') {
    return (
      obstacle.halfExtentXMeters <= 0.7 &&
      obstacle.halfExtentZMeters <= 0.7 &&
      obstacle.heightMeters <= 0.6
    )
  }
  return false
}

function sanitizeObstacleState(obstacle) {
  if (!Number.isFinite(obstacle.position.x)) obstacle.position.x = obstacle.initialCenterXMeters
  if (!Number.isFinite(obstacle.position.y)) obstacle.position.y = 0
  if (!Number.isFinite(obstacle.position.z)) obstacle.position.z = obstacle.initialCenterZMeters
  if (!Number.isFinite(obstacle.velocity.x)) obstacle.velocity.x = 0
  if (!Number.isFinite(obstacle.velocity.y)) obstacle.velocity.y = 0
  if (!Number.isFinite(obstacle.velocity.z)) obstacle.velocity.z = 0
  if (!Number.isFinite(obstacle.angularVelocityYRadiansPerSecond)) {
    obstacle.angularVelocityYRadiansPerSecond = 0
  }
  if (!Number.isFinite(obstacle.orientationYawRadians)) {
    obstacle.orientationYawRadians = 0
  }
}

function sanitizeNonNegativeNumber(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}