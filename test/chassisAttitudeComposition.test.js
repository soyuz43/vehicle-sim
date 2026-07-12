// test/chassisAttitudeComposition.test.js

import assert from "node:assert/strict"
import test from "node:test"
import * as THREE from "three"

import { createCar } from "../src/car/createCar.js"
import { createVehicleController } from "../src/vehicle/createVehicleController.js"
import { createHeightfieldTerrainContactQuery } from "../src/terrain/createHeightfieldTerrainContactQuery.js"

const STEP_SECONDS = 1 / 60
const BODY_Y = 1.36

let terrainHeightMeters = 0

function createFlatProfile() {
  return {
    profileName: "chassis-composition-flat",
    surfaceKind: "flat",
    frictionCoefficient: 1,
    querySurfaceAtWorldPosition(xMeters, zMeters, target = {}) {
      target.isWithinBounds = true
      target.isInsideTerrainBounds = true
      target.profileName = this.profileName
      target.surfaceKind = this.surfaceKind
      target.frictionCoefficient = this.frictionCoefficient
      target.terrainHeightMeters = terrainHeightMeters
      target.groundHeightMeters = terrainHeightMeters
      target.normalWorld = target.normalWorld ?? {}
      target.normalWorld.x = 0
      target.normalWorld.y = 1
      target.normalWorld.z = 0
      target.slopeRadians = 0
      target.slopeDegrees = 0
      target.status = "surface-available"
      return target
    },
  }
}

function settle(controller, steps) {
  for (let i = 0; i < steps; i += 1) controller.update(STEP_SECONDS, {})
}

function readBodyWorldYMeters(car) {
  const body = car.getObjectByName("raised-body-shell")
  const position = new THREE.Vector3()
  body.getWorldPosition(position)
  return position.y
}

test("body world height rides terrain support 1:1 under no suspension asymmetry", () => {
  terrainHeightMeters = 0
  const car = createCar()
  const controller = createVehicleController({
    vehicle: car,
    terrainContactQuery: createHeightfieldTerrainContactQuery({
      surfaceProfile: createFlatProfile(),
    }),
  })

  settle(controller, 240)
  const restBodyWorldY = readBodyWorldYMeters(car)
  const restHeave = controller.getSnapshot().chassisAttitude.heaveOffsetMeters

  // Flat ground, symmetric: heave stays near zero; body sits at
  // terrain height + authored body height.
  assert.ok(Math.abs(restHeave) < 1e-5)
  assert.ok(Math.abs(restBodyWorldY - (0 + BODY_Y)) < 1e-3)

  // Raise the terrain. The body world height is
  // terrainSupportHeight + BODY_Y + heaveOffsetMeters; with no
  // suspension asymmetry heave stays ~0, so the body must follow
  // the terrain 1:1. This locks that heave does NOT cancel
  // terrain motion (the body is not held at constant world height).
  terrainHeightMeters = 0.5
  settle(controller, 240)
  const raisedBodyWorldY = readBodyWorldYMeters(car)
  const raisedHeave = controller.getSnapshot().chassisAttitude.heaveOffsetMeters

  assert.ok(Math.abs(raisedHeave) < 1e-5)
  assert.ok(Math.abs(raisedBodyWorldY - (0.5 + BODY_Y)) < 1e-3)
  assert.ok(Math.abs(raisedBodyWorldY - restBodyWorldY - 0.5) < 1e-3)
})
