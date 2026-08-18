// src/terrain/obstacles/createVehicleObstacleInteraction.js

/**
 * Deterministic momentum exchange between the vehicle and movable obstacles.
 *
 * Each fixed step this module:
 *   1. advances movable-obstacle integration (gravity, ground, friction) via
 *      the obstacle field,
 *   2. resolves the contact each grounded wheel makes with a movable obstacle
 *      (identified through obstacleId carried on the wheel contact state),
 *   3. applies a normal-direction collision impulse to the obstacle and the
 *      equal/opposite reaction to the vehicle.
 *
 * The impulse is the standard rigid-body contact impulse for a planar body
 * with yaw inertia. Restitution defaults to 0, so every resolved contact can
 * only reduce the relative approach speed: no energy is introduced and impacts
 * remain stable across repeated frames. Tangential (friction) coupling between
 * the vehicle and the obstacle is intentionally omitted and is flagged as a
 * seam; the existing tire/obstacle surface friction still drives the vehicle
 * along the contact, so the push behaviour is physically plausible.
 *
 * Math is performed with scalars (no per-call allocation) so the hot loop
 * stays allocation-free and deterministic.
 */

const DEFAULT_RESTITUTION = 0
const DEFAULT_MIN_COLLISION_IMPULSE_NEWTONS_SECOND = 12

export function createVehicleObstacleInteraction(config = {}) {
  const obstacleField = config.obstacleField
  const terrainHeightFn = config.terrainHeightFn ?? null
  const applyVehiclePlanarImpulse = config.applyVehiclePlanarImpulse ?? null
  const getVehicleMassProperties = config.getVehicleMassProperties ?? null
  const emitEffect = config.emitEffect ?? null
  const restitution = sanitizeNonNegativeNumber(config.restitution, DEFAULT_RESTITUTION)
  const minCollisionImpulseNewtonsSecond = sanitizeNonNegativeNumber(
    config.minCollisionImpulseForDebrisNewtonsSecond,
    DEFAULT_MIN_COLLISION_IMPULSE_NEWTONS_SECOND
  )

  const telemetry = {
    stepCount: 0,
    resolvedCollisionCount: 0,
    lastStepTotalImpulseNewtonsSecond: 0,
    lastStepMaxImpulseNewtonsSecond: 0,
    activeDebrisEvents: 0,
  }

  if (!obstacleField || typeof obstacleField.stepMovableObstacles !== 'function') {
    throw new Error('createVehicleObstacleInteraction requires an obstacleField')
  }

  function step(deltaTimeSeconds, vehicleSnapshot = {}) {
    const dt = sanitizeNonNegativeNumber(deltaTimeSeconds, 0)
    telemetry.stepCount += 1
    telemetry.resolvedCollisionCount = 0
    telemetry.lastStepTotalImpulseNewtonsSecond = 0
    telemetry.lastStepMaxImpulseNewtonsSecond = 0
    telemetry.activeDebrisEvents = 0

    // 1. Advance obstacle dynamics against the terrain.
    if (typeof terrainHeightFn === 'function') {
      obstacleField.stepMovableObstacles(dt, terrainHeightFn)
    }

    if (dt <= 0) return getSnapshot()

    const wheelStates = Array.isArray(vehicleSnapshot.wheelStates)
      ? vehicleSnapshot.wheelStates
      : []

    const massProperties = typeof getVehicleMassProperties === 'function'
      ? getVehicleMassProperties()
      : (vehicleSnapshot.chassisMassProperties ?? null)
    const vehicleMassKg = massProperties?.massKg > 0 ? massProperties.massKg : 0
    const vehicleYawInertiaKgMeterSquared =
      massProperties?.yawMomentOfInertiaKgMeterSquared > 0
        ? massProperties.yawMomentOfInertiaKgMeterSquared
        : 0

    const vehiclePosition = vehicleSnapshot.position
    const worldVelocity = vehicleSnapshot.worldVelocityMetersPerSecond
    const yawRate = sanitizeNumber(vehicleSnapshot.yawRateRadiansPerSecond)

    for (let index = 0; index < wheelStates.length; index += 1) {
      const wheelState = wheelStates[index]
      if (!wheelState) continue
      if (!wheelState.isGrounded) continue
      if (!wheelState.isObstacleContact) continue
      const obstacleId = wheelState.obstacleId
      if (obstacleId === null || obstacleId === undefined) continue

      const obstacle = obstacleField.getObstacleById(obstacleId)
      if (!obstacle || !obstacle.isMovable) continue

      const contact = wheelState.contactPointWorldPosition
      if (!hasFiniteXZ(contact)) continue

      resolveContact(
        obstacle,
        contact,
        vehiclePosition,
        worldVelocity,
        yawRate,
        vehicleMassKg,
        vehicleYawInertiaKgMeterSquared
      )
    }

    return getSnapshot()
  }

  function resolveContact(
    obstacle,
    contact,
    vehiclePosition,
    worldVelocity,
    yawRate,
    vehicleMassKg,
    vehicleYawInertiaKgMeterSquared
  ) {
    const dx = contact.x - obstacle.position.x
    const dz = contact.z - obstacle.position.z

    // Obstacle outward contact normal (planar for boxes/cylinders; spherical
    // for domes). Only exchange when the contact has a meaningful horizontal
    // direction (side contact), not when riding on top of a dome.
    let nx = 0
    let nz = 0
    if (obstacle.shape === 'dome') {
      const r = Math.hypot(dx, dz)
      if (r >= obstacle.radiusMeters || r <= 1e-4) return
      const localHeightMeters = Math.sqrt(
        Math.max(0, obstacle.radiusMeters * obstacle.radiusMeters - r * r)
      )
      const inv = 1 / Math.hypot(dx, localHeightMeters, dz)
      nx = dx * inv
      nz = dz * inv
      if (r / obstacle.radiusMeters < 0.5) return
    } else {
      const r = Math.hypot(dx, dz)
      if (r < 1e-4) return
      nx = dx / r
      nz = dz / r
    }

    // Vehicle velocity at the contact point (planar rigid-body): v + w x r.
    let vVehX = 0
    let vVehZ = 0
    if (hasFiniteXZ(worldVelocity)) {
      vVehX = worldVelocity.x
      vVehZ = worldVelocity.z
    }
    let rx = 0
    let rz = 0
    if (hasFiniteXZ(vehiclePosition)) {
      rx = contact.x - vehiclePosition.x
      rz = contact.z - vehiclePosition.z
      vVehX += yawRate * rz
      vVehZ += -yawRate * rx
    }

    // Obstacle velocity at the contact point.
    const vObsX = obstacle.velocity.x + obstacle.angularVelocityYRadiansPerSecond * dz
    const vObsZ = obstacle.velocity.z + -obstacle.angularVelocityYRadiansPerSecond * dx

    const vRelN = (vVehX - vObsX) * nx + (vVehZ - vObsZ) * nz
    if (vRelN >= 0) return // separating or resting; no impulse needed

    const invMassVeh = vehicleMassKg > 0 ? 1 / vehicleMassKg : 0
    const invMassObs = obstacle.massKg > 0 ? 1 / obstacle.massKg : 0
    const crossVehY = rz * nx - rx * nz
    const crossObsY = dz * nx - dx * nz
    const termVeh = vehicleYawInertiaKgMeterSquared > 0
      ? (crossVehY * crossVehY) / vehicleYawInertiaKgMeterSquared
      : 0
    const termObs = obstacle.inertiaKgMeterSquared > 0
      ? (crossObsY * crossObsY) / obstacle.inertiaKgMeterSquared
      : 0
    const denom = invMassVeh + invMassObs + termVeh + termObs
    if (denom <= 0) return

    const impulseMagnitudeNewtonsSecond = (-(1 + restitution) * vRelN) / denom
    if (!Number.isFinite(impulseMagnitudeNewtonsSecond)) return

    const jx = impulseMagnitudeNewtonsSecond * nx
    const jz = impulseMagnitudeNewtonsSecond * nz

    // n points from the obstacle center toward the contact (outward). The
    // obstacle receives the impulse -j*n (pushed away from the vehicle); the
    // vehicle receives the equal/opposite +j*n. This is the physically correct
    // pairing: a vehicle driving into the near face shoves the obstacle forward.
    obstacleField.applyImpulseToObstacle(
      obstacle.id,
      -jx,
      0,
      -jz,
      contact.x,
      contact.z
    )

    // Equal/opposite reaction on the vehicle (linear + yaw torque).
    if (typeof applyVehiclePlanarImpulse === 'function' && vehicleMassKg > 0) {
      const yawTorqueNewtonsMeterSecond = rx * jz - rz * jx
      applyVehiclePlanarImpulse(jx, jz, yawTorqueNewtonsMeterSecond, 0)
    }

    telemetry.resolvedCollisionCount += 1
    telemetry.lastStepTotalImpulseNewtonsSecond += impulseMagnitudeNewtonsSecond
    telemetry.lastStepMaxImpulseNewtonsSecond = Math.max(
      telemetry.lastStepMaxImpulseNewtonsSecond,
      impulseMagnitudeNewtonsSecond
    )

    if (
      impulseMagnitudeNewtonsSecond >= minCollisionImpulseNewtonsSecond &&
      typeof emitEffect === 'function'
    ) {
      emitEffect({
        kind: 'debris',
        x: contact.x,
        y: hasFiniteNumber(contact.y) ? contact.y : 0,
        z: contact.z,
      })
      telemetry.activeDebrisEvents += 1
    }
  }

  function getSnapshot() {
    return telemetry
  }

  function reset() {
    telemetry.stepCount = 0
    telemetry.resolvedCollisionCount = 0
    telemetry.lastStepTotalImpulseNewtonsSecond = 0
    telemetry.lastStepMaxImpulseNewtonsSecond = 0
    telemetry.activeDebrisEvents = 0
  }

  return {
    kind: 'vehicle-obstacle-interaction-v1',
    step,
    getSnapshot,
    reset,
  }
}

function hasFiniteXZ(value) {
  return (
    value &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.z)
  )
}

function hasFiniteNumber(value) {
  return Number.isFinite(value)
}

function sanitizeNonNegativeNumber(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function sanitizeNumber(value) {
  return Number.isFinite(value) ? value : 0
}