import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { createRigidBody } from '../src/physics/RigidBody.js'
import { createBox } from '../src/physics/shapes/Box.js'
import { createSphere } from '../src/physics/shapes/Sphere.js'
import {
  createFixedStepContactScenario,
} from '../src/physics/FixedStepContactScenario.js'

const GRAVITY_METERS_PER_SECOND_SQUARED = -9.80665
const FIXED_TIMESTEP_SECONDS = 1 / 120
const SPHERE_RADIUS_METERS = 0.5
const GROUND_TOP_HEIGHT_METERS = 0
const GROUND_BOX_CENTER_Y_METERS = -1
const SPHERE_MASS_KG = 1
const SOLID_SPHERE_INERTIA_KG_METER_SQUARED = 0.1
const SOLVER_SLOP_METERS = 0.005
const POSITION_CORRECTION_FACTOR = 0.2

// The solver's 5 mm slop is the designed allowable resting overlap. The 1 nm
// guard covers floating-point accumulation while remaining far below any
// physically meaningful penetration.
const RESTING_PENETRATION_TOLERANCE_METERS = SOLVER_SLOP_METERS + 1e-9
// A metre-scale double-precision pose comparison needs only a sub-picometre
// guard; this catches a second projection correction while tolerating roundoff.
const POSE_TOLERANCE_METERS = 1e-12
// Gravity cancellation at rest should leave a velocity many orders below any
// visible motion; 1 nm/s is a conservative numerical guard.
const RESTING_VELOCITY_TOLERANCE_METERS_PER_SECOND = 1e-9
// The restitution assertion compares against the solver's computed target
// velocity. The same 1 nm/s guard isolates only arithmetic roundoff.
const RESTITUTION_VELOCITY_TOLERANCE_METERS_PER_SECOND = 1e-9
// Accumulated impulses are in N*s. This guard covers arithmetic roundoff in
// the Coulomb projection without allowing a meaningful cone violation.
const FRICTION_CONE_TOLERANCE_NEWTON_SECONDS = 1e-12

const _groundHalfExtentsMeters = new THREE.Vector3(5, 1, 5)

function createGroundBody(contactId = 'static-ground') {
  return {
    contactId,
    positionMeters: new THREE.Vector3(0, GROUND_BOX_CENTER_Y_METERS, 0),
    orientationQuaternion: new THREE.Quaternion(),
  }
}

function createSphereScenario(overrides = {}) {
  const dynamicBody = createRigidBody({
    contactId: overrides.contactId ?? 'dynamic-sphere',
    massKg: SPHERE_MASS_KG,
    inertiaXKgMeterSquared: SOLID_SPHERE_INERTIA_KG_METER_SQUARED,
    inertiaYKgMeterSquared: SOLID_SPHERE_INERTIA_KG_METER_SQUARED,
    inertiaZKgMeterSquared: SOLID_SPHERE_INERTIA_KG_METER_SQUARED,
    positionMeters: [
      overrides.positionXMeters ?? 0,
      overrides.positionYMeters ?? SPHERE_RADIUS_METERS,
      overrides.positionZMeters ?? 0,
    ],
  })
  dynamicBody.velocityMetersPerSecond.set(
    overrides.velocityXMetersPerSecond ?? 0,
    overrides.velocityYMetersPerSecond ?? 0,
    overrides.velocityZMetersPerSecond ?? 0
  )

  return createFixedStepContactScenario({
    dynamicBody,
    dynamicShape: createSphere(SPHERE_RADIUS_METERS),
    staticBody: createGroundBody(overrides.staticContactId),
    staticShape: createBox(_groundHalfExtentsMeters),
    fixedTimeStepSeconds: FIXED_TIMESTEP_SECONDS,
    gravityMetersPerSecondSquared:
      overrides.gravityMetersPerSecondSquared ??
      GRAVITY_METERS_PER_SECOND_SQUARED,
    restitution: overrides.restitution ?? 0,
    frictionCoefficient: overrides.frictionCoefficient ?? 0,
  })
}

test('projection and position integration do not double-correct penetration', () => {
  const initialCenterY = 0.49
  const initialPenetrationMeters = SPHERE_RADIUS_METERS - initialCenterY
  const expectedProjectionMeters =
    (initialPenetrationMeters - SOLVER_SLOP_METERS) * POSITION_CORRECTION_FACTOR
  const expectedCenterY = initialCenterY + expectedProjectionMeters
  const scenario = createSphereScenario({
    positionYMeters: initialCenterY,
    gravityMetersPerSecondSquared: 0,
  })

  const result = scenario.step()

  assert.strictEqual(result.collisionGenerated, true)
  assert.strictEqual(result.solvedContactCount, 1)
  assert.ok(
    Math.abs(scenario.dynamicBody.positionMeters.y - expectedCenterY) <=
      POSE_TOLERANCE_METERS,
    `expected projection-only pose ${expectedCenterY}, got ${scenario.dynamicBody.positionMeters.y}`
  )
  assert.ok(
    Math.abs(scenario.dynamicBody.velocityMetersPerSecond.y) <=
      RESTING_VELOCITY_TOLERANCE_METERS_PER_SECOND
  )
})

test('a resting sphere remains within the declared penetration tolerance', () => {
  const scenario = createSphereScenario({
    positionYMeters: 0.49,
    restitution: 0,
    frictionCoefficient: 0,
  })

  for (let stepIndex = 0; stepIndex < 240; stepIndex += 1) {
    scenario.step()
  }

  const restingPenetrationMeters =
    GROUND_TOP_HEIGHT_METERS +
    SPHERE_RADIUS_METERS -
    scenario.dynamicBody.positionMeters.y
  assert.ok(restingPenetrationMeters >= 0)
  assert.ok(
    restingPenetrationMeters <= RESTING_PENETRATION_TOLERANCE_METERS,
    `resting penetration ${restingPenetrationMeters} m exceeded ${RESTING_PENETRATION_TOLERANCE_METERS} m`
  )
  assert.ok(
    Math.abs(scenario.dynamicBody.velocityMetersPerSecond.y) <=
      RESTING_VELOCITY_TOLERANCE_METERS_PER_SECOND
  )
})

test('a separating contact receives no normal impulse', () => {
  const scenario = createSphereScenario({
    positionYMeters: 0.49,
    velocityYMetersPerSecond: 1,
    gravityMetersPerSecondSquared: 0,
  })
  const initialVelocityY = scenario.dynamicBody.velocityMetersPerSecond.y

  const result = scenario.step()

  assert.strictEqual(result.collisionGenerated, true)
  assert.strictEqual(result.activeContacts.length, 1)
  assert.strictEqual(
    result.activeContacts[0].accumulatedNormalImpulseNewtonSeconds,
    0
  )
  assert.strictEqual(
    scenario.dynamicBody.velocityMetersPerSecond.y,
    initialVelocityY
  )
})

test('friction reduces sliding speed and stays inside the Coulomb cone', () => {
  const frictionCoefficient = 0.5
  const initialVelocityX = 2
  const scenario = createSphereScenario({
    positionYMeters: 0.495,
    velocityXMetersPerSecond: initialVelocityX,
    frictionCoefficient,
  })

  const result = scenario.step()
  const contact = result.activeContacts[0]

  assert.strictEqual(result.collisionGenerated, true)
  assert.ok(scenario.dynamicBody.velocityMetersPerSecond.x < initialVelocityX)
  assert.ok(scenario.dynamicBody.angularVelocityRadiansPerSecond.z < 0)
  assert.ok(contact.accumulatedFrictionImpulseNewtonSeconds > 0)
  assert.ok(
    contact.accumulatedFrictionImpulseNewtonSeconds <=
      frictionCoefficient * contact.accumulatedNormalImpulseNewtonSeconds +
        FRICTION_CONE_TOLERANCE_NEWTON_SECONDS
  )
})

test('restitution reverses a fast impact while losing energy', () => {
  const restitution = 0.5
  const scenario = createSphereScenario({
    positionYMeters: 0.51,
    velocityYMetersPerSecond: -2,
    restitution,
  })

  scenario.step()
  const preSolveVelocityY =
    scenario.dynamicBody.velocityMetersPerSecond.y +
    GRAVITY_METERS_PER_SECOND_SQUARED * FIXED_TIMESTEP_SECONDS
  const expectedBounceVelocityY = -restitution * preSolveVelocityY
  const result = scenario.step()

  assert.strictEqual(result.collisionGenerated, true)
  assert.ok(scenario.dynamicBody.velocityMetersPerSecond.y > 0)
  assert.ok(scenario.dynamicBody.velocityMetersPerSecond.y < -preSolveVelocityY)
  assert.ok(
    Math.abs(
      scenario.dynamicBody.velocityMetersPerSecond.y - expectedBounceVelocityY
    ) <= RESTITUTION_VELOCITY_TOLERANCE_METERS_PER_SECOND,
    `expected bounce velocity ${expectedBounceVelocityY} m/s, got ${scenario.dynamicBody.velocityMetersPerSecond.y} m/s`
  )
})

test('repeat runs produce bit-identical snapshots', () => {
  const runScenario = () => {
    const scenario = createSphereScenario({
      positionYMeters: 0.51,
      velocityXMetersPerSecond: 0.25,
      velocityYMetersPerSecond: -2,
      restitution: 0.35,
      frictionCoefficient: 0.4,
    })
    const snapshots = []
    for (let stepIndex = 0; stepIndex < 180; stepIndex += 1) {
      scenario.step()
      snapshots.push(scenario.getStateSnapshot())
    }
    return snapshots
  }

  assert.deepStrictEqual(runScenario(), runScenario())
})

test('a persisting contact retains its constraint object and warm-start impulse', () => {
  const scenario = createSphereScenario({
    positionYMeters: 0.495,
    restitution: 0,
    frictionCoefficient: 0,
  })

  const firstStep = scenario.step()
  const firstConstraint = firstStep.activeContacts[0]
  assert.strictEqual(firstConstraint.ageSteps, 1)
  assert.ok(firstConstraint.accumulatedNormalImpulseNewtonSeconds > 0)

  const secondStep = scenario.step()
  const secondConstraint = secondStep.activeContacts[0]
  assert.strictEqual(secondConstraint, firstConstraint)
  assert.strictEqual(secondConstraint.ageSteps, 2)
  assert.ok(secondConstraint.accumulatedNormalImpulseNewtonSeconds > 0)
})
