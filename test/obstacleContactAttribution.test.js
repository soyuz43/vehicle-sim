// test/obstacleContactAttribution.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createTerrainSurfaceProfile } from '../src/terrain/createTerrainSurfaceProfile.js'
import { createObstacleField } from '../src/terrain/obstacles/createObstacleField.js'
import { createObstacleAwareSurfaceProfile } from '../src/terrain/createObstacleAwareSurfaceProfile.js'
import { createHeightfieldTerrainContactQuery } from '../src/terrain/createHeightfieldTerrainContactQuery.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { createCar } from '../src/car/createCar.js'

test('obstacle-aware profile attributes obstacleId to contacts', () => {
  const base = createTerrainSurfaceProfile({ profileName: 'flat' })
  const field = createObstacleField({
    obstacles: [{ id: 'd', shape: 'dome', centerXMeters: 0, centerZMeters: 0, radiusMeters: 1, surfaceKind: 'rock' }],
  })
  const profile = createObstacleAwareSurfaceProfile({ baseProfile: base, obstacleField: field })

  const onObstacle = profile.querySurfaceAtWorldPosition(0, 0)
  assert.equal(onObstacle.obstacleId, 'd')
  assert.equal(onObstacle.isObstacleContact, true)

  const offObstacle = profile.querySurfaceAtWorldPosition(20, 20)
  assert.equal(offObstacle.obstacleId, null)
  assert.equal(offObstacle.isObstacleContact, false)
})

test('contact query propagates obstacleId to the wheel contact result', () => {
  const base = createTerrainSurfaceProfile({ profileName: 'flat' })
  const field = createObstacleField({
    obstacles: [{ id: 'd', shape: 'dome', centerXMeters: 0, centerZMeters: 0, radiusMeters: 1, surfaceKind: 'rock' }],
  })
  const profile = createObstacleAwareSurfaceProfile({ baseProfile: base, obstacleField: field })
  const query = createHeightfieldTerrainContactQuery({ surfaceProfile: profile })

  const target = query.querySuspensionContact({
    rayOriginWorld: new THREE.Vector3(0, 1.5, 0),
    suspensionDownDirectionWorld: new THREE.Vector3(0, -1, 0),
    maximumRayDistanceMeters: 1.5,
    wheelRadiusMeters: 0.35,
  })
  assert.equal(target.obstacleId, 'd')
  assert.equal(target.isObstacleContact, true)
})

test('controller exposes external planar impulse reaction (linear + yaw)', () => {
  const car = createCar()
  const profile = createTerrainSurfaceProfile({ profileName: 'flat' })
  const query = createHeightfieldTerrainContactQuery({ surfaceProfile: profile })
  const controller = createVehicleController({ vehicle: car, terrainContactQuery: query })
  controller.reset()

  const snap = controller.getSnapshot()
  const massKg = snap.chassisMassProperties.massKg
  const yawInertia = snap.chassisMassProperties.yawMomentOfInertiaKgMeterSquared
  const v0x = snap.worldVelocityMetersPerSecond.x
  const yaw0 = snap.yawRateRadiansPerSecond

  controller.applyExternalPlanarImpulseNewtonsSecond(100, 0, 50)

  const snap2 = controller.getSnapshot()
  assert.ok(Math.abs(snap2.worldVelocityMetersPerSecond.x - (v0x + 100 / massKg)) < 1e-9)
  assert.ok(Math.abs(snap2.yawRateRadiansPerSecond - (yaw0 + 50 / yawInertia)) < 1e-9)
})

test('wheel contact state carries obstacleId and isObstacleContact fields', () => {
  const car = createCar()
  const profile = createTerrainSurfaceProfile({ profileName: 'flat' })
  const query = createHeightfieldTerrainContactQuery({ surfaceProfile: profile })
  const controller = createVehicleController({ vehicle: car, terrainContactQuery: query })
  controller.reset()
  const snap = controller.getSnapshot()
  const wheel = snap.wheelStates[0]
  assert.ok('obstacleId' in wheel)
  assert.ok('isObstacleContact' in wheel)
  assert.equal(wheel.obstacleId, null)
  assert.equal(wheel.isObstacleContact, false)
})