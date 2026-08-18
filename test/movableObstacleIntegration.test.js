// test/movableObstacleIntegration.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMovableObstacleField } from '../src/terrain/obstacles/createMovableObstacleField.js'
import { createVehicleObstacleInteraction } from '../src/terrain/obstacles/createVehicleObstacleInteraction.js'

const BOX = [{ id: 'box', shape: 'box', centerXMeters: 0, centerZMeters: 0, halfExtentXMeters: 0.5, halfExtentZMeters: 0.5, heightMeters: 0.5, surfaceKind: 'concrete' }]

test('movable obstacle settles on terrain and stays finite', () => {
  const field = createMovableObstacleField({ obstacles: BOX })
  for (let i = 0; i < 200; i += 1) field.stepMovableObstacles(1 / 60, () => 0)
  const o = field.getObstacleById('box')
  assert.ok(Number.isFinite(o.position.x) && Number.isFinite(o.position.y) && Number.isFinite(o.position.z))
  assert.ok(Math.abs(o.position.y) < 1e-6, 'rests on ground at y=0')
  assert.ok(Math.hypot(o.velocity.x, o.velocity.y, o.velocity.z) < 1e-6, 'comes to rest')
})

test('gravity pulls a kicked obstacle down then ground stops it', () => {
  const field = createMovableObstacleField({ obstacles: BOX })
  field.applyImpulseToObstacle('box', 0, -5, 0, 0, 0)
  for (let i = 0; i < 120; i += 1) field.stepMovableObstacles(1 / 60, () => 0)
  const o = field.getObstacleById('box')
  assert.ok(o.position.y >= -1e-6, 'never sinks below ground')
  assert.ok(Number.isFinite(o.position.y))
})

test('Coulomb ground friction brings a sliding obstacle to rest', () => {
  const field = createMovableObstacleField({ obstacles: BOX })
  field.applyImpulseToObstacle('box', 50, 0, 0, 0, 0) // concrete mu 0.85
  const o = field.getObstacleById('box')
  for (let i = 0; i < 600; i += 1) field.stepMovableObstacles(1 / 60, () => 0)
  assert.ok(Math.hypot(o.velocity.x, o.velocity.z) < 1e-3, 'slid to rest')
})

test('impulse about Y follows the lever arm (torque = r x F)', () => {
  const field = createMovableObstacleField({ obstacles: BOX })
  const o = field.getObstacleById('box')
  const inertiaBefore = o.inertiaKgMeterSquared
  field.applyImpulseToObstacle('box', 0, 0, 10, 0.5, 0) // +z impulse at +x lever
  // torqueY = leverX*impulseZ - leverZ*impulseX = 0.5*10 - 0 = 5
  assert.ok(o.angularVelocityYRadiansPerSecond > 0)
  assert.ok(Math.abs(o.angularVelocityYRadiansPerSecond - 5 / inertiaBefore) < 1e-9)
})

test('momentum exchange pushes obstacle forward and reacts on vehicle', () => {
  const field = createMovableObstacleField({ obstacles: BOX })
  field.stepMovableObstacles(1 / 60, () => 0) // settle on ground
  const obstacle = field.getObstacleById('box')

  const vehicleVelocity = { x: 5, y: 0, z: 0 }
  const massProps = { massKg: 1400, yawMomentOfInertiaKgMeterSquared: 2000 }
  const snapshot = {
    position: { x: -2, y: 0, z: 0 },
    worldVelocityMetersPerSecond: vehicleVelocity,
    yawRateRadiansPerSecond: 0,
    chassisMassProperties: massProps,
    wheelStates: [
      { isGrounded: true, isObstacleContact: true, obstacleId: 'box', contactPointWorldPosition: { x: -0.5, y: 0, z: 0 } },
    ],
  }
  let applied = null
  const interaction = createVehicleObstacleInteraction({
    obstacleField: field,
    applyVehiclePlanarImpulse: (ix, iz, iyaw) => { applied = { ix, iz, iyaw } },
    getVehicleMassProperties: () => massProps,
  })
  interaction.step(1 / 60, snapshot)

  assert.ok(obstacle.velocity.x > 0, 'obstacle shoved in +x')
  assert.ok(applied && applied.ix < 0, 'vehicle reaction is -x (pushed back)')
  assert.ok(Number.isFinite(obstacle.velocity.x))
})

test('exchange does not increase system kinetic energy (e=0)', () => {
  const field = createMovableObstacleField({ obstacles: BOX })
  field.stepMovableObstacles(1 / 60, () => 0)
  const obstacle = field.getObstacleById('box')

  const massProps = { massKg: 1400, yawMomentOfInertiaKgMeterSquared: 2000 }
  let vehicleVx = 5
  let vehicleYaw = 0
  const applyV = (ix, iz, iyaw) => { vehicleVx += ix / 1400; vehicleYaw += iyaw / 2000 }

  const snapshot = () => ({
    position: { x: -2, y: 0, z: 0 },
    worldVelocityMetersPerSecond: { x: vehicleVx, y: 0, z: 0 },
    yawRateRadiansPerSecond: vehicleYaw,
    chassisMassProperties: massProps,
    wheelStates: [
      { isGrounded: true, isObstacleContact: true, obstacleId: 'box', contactPointWorldPosition: { x: -0.5, y: 0, z: 0 } },
    ],
  })

  const ke = () =>
    0.5 * 1400 * vehicleVx * vehicleVx +
    0.5 * 2000 * vehicleYaw * vehicleYaw +
    0.5 * obstacle.massKg * obstacle.velocity.x * obstacle.velocity.x +
    0.5 * obstacle.inertiaKgMeterSquared * obstacle.angularVelocityYRadiansPerSecond ** 2

  const interaction = createVehicleObstacleInteraction({
    obstacleField: field,
    applyVehiclePlanarImpulse: applyV,
    getVehicleMassProperties: () => massProps,
  })

  const keBefore = ke()
  interaction.step(1 / 60, snapshot())
  const keAfter = ke()
  assert.ok(keAfter <= keBefore + 1e-6, 'kinetic energy does not increase')
})

test('no impulse when the contact is separating', () => {
  const field = createMovableObstacleField({ obstacles: BOX })
  const massProps = { massKg: 1400, yawMomentOfInertiaKgMeterSquared: 2000 }
  let applied = null
  const interaction = createVehicleObstacleInteraction({
    obstacleField: field,
    applyVehiclePlanarImpulse: (ix, iz) => { applied = { ix, iz } },
    getVehicleMassProperties: () => massProps,
  })
  const snapshot = {
    position: { x: -2, y: 0, z: 0 },
    worldVelocityMetersPerSecond: { x: -5, y: 0, z: 0 },
    yawRateRadiansPerSecond: 0,
    chassisMassProperties: massProps,
    wheelStates: [
      { isGrounded: true, isObstacleContact: true, obstacleId: 'box', contactPointWorldPosition: { x: -0.5, y: 0, z: 0 } },
    ],
  }
  interaction.step(1 / 60, snapshot)
  assert.ok(applied === null, 'no impulse when separating')
})

test('repeated impacts stay finite and bounded (stability)', () => {
  const field = createMovableObstacleField({ obstacles: BOX })
  const massProps = { massKg: 1400, yawMomentOfInertiaKgMeterSquared: 2000 }
  const interaction = createVehicleObstacleInteraction({
    obstacleField: field,
    applyVehiclePlanarImpulse: () => {},
    getVehicleMassProperties: () => massProps,
  })
  for (let i = 0; i < 2000; i += 1) {
    field.stepMovableObstacles(1 / 60, () => 0)
    const snapshot = {
      position: { x: -2, y: 0, z: 0 },
      worldVelocityMetersPerSecond: { x: 8, y: 0, z: 0 },
      yawRateRadiansPerSecond: 0,
      chassisMassProperties: massProps,
      wheelStates: [
        { isGrounded: true, isObstacleContact: true, obstacleId: 'box', contactPointWorldPosition: { x: -0.5, y: 0, z: 0 } },
      ],
    }
    interaction.step(1 / 60, snapshot)
  }
  const o = field.getObstacleById('box')
  assert.ok(Number.isFinite(o.position.x) && Number.isFinite(o.position.y) && Number.isFinite(o.position.z))
  assert.ok(Number.isFinite(o.velocity.x) && Number.isFinite(o.velocity.z))
  assert.ok(Math.abs(o.position.y) < 1, 'never tunnels below ground')
  assert.ok(Math.hypot(o.velocity.x, o.velocity.y, o.velocity.z) < 1000, 'no energy blow-up')
})