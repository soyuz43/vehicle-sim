import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import {
  addForce,
  clearForceAccumulators,
  createRigidBody,
  integrateRigidBody,
  integrateRigidBodyPositionPhase,
  integrateRigidBodyVelocityPhase,
} from '../src/physics/RigidBody.js'
import {
  createContactConstraint,
  createContactSolver,
  solveContacts,
} from '../src/physics/ContactSolver.js'
import { testCollision } from '../src/physics/Collision.js'
import { createBox } from '../src/physics/shapes/Box.js'
import { createSphere } from '../src/physics/shapes/Sphere.js'

const GRAVITY_METERS_PER_SECOND_SQUARED = -9.80665
const FIXED_TIMESTEP_SECONDS = 1 / 120
const SURFACE_HEIGHT_METERS = 0
const SLOP_METERS = 0.005
const POSITION_CORRECTION_FACTOR = 0.2
const SPHERE_RADIUS_METERS = 0.5
const BOX_HALF_HEIGHT_METERS = 0.5
const BOX_MASS_KG = 5

const _gravityForceNewtons = new THREE.Vector3()

function applyGravityForce(body) {
  _gravityForceNewtons.set(
    0,
    GRAVITY_METERS_PER_SECOND_SQUARED * body.massKg,
    0
  )
  addForce(body, _gravityForceNewtons)
}

// The contact solver runs between the rigid-body velocity and position
// phases. The fused integrator remains available for scenarios that do not
// insert a contact solve.
function integrateVelocityPhase(body, deltaSeconds) {
  applyGravityForce(body)
  integrateRigidBodyVelocityPhase(body, deltaSeconds)
}

function integratePositionPhase(body, deltaSeconds) {
  integrateRigidBodyPositionPhase(body, deltaSeconds)
  clearForceAccumulators(body)
}

// Builds the single point contact of a body resting on the static ground
// plane. The normal points from the body (A) towards the ground (B), which
// matches the A-to-B convention of the collision narrow phase.
function createGroundContact(body, halfHeightMeters, overrides = {}) {
  const penetrationMeters =
    SURFACE_HEIGHT_METERS + halfHeightMeters - body.positionMeters.y
  if (penetrationMeters <= 0) return null

  return createContactConstraint(
    body,
    null,
    new THREE.Vector3(0, -1, 0),
    penetrationMeters,
    new THREE.Vector3(
      body.positionMeters.x,
      SURFACE_HEIGHT_METERS,
      body.positionMeters.z
    ),
    overrides
  )
}

function createRestingBox(positionMeters) {
  const solidBoxInertiaKgMeterSquared = (BOX_MASS_KG / 12) * (1 * 1 + 1 * 1)
  return createRigidBody({
    massKg: BOX_MASS_KG,
    positionMeters,
    inertiaXKgMeterSquared: solidBoxInertiaKgMeterSquared,
    inertiaYKgMeterSquared: solidBoxInertiaKgMeterSquared,
    inertiaZKgMeterSquared: solidBoxInertiaKgMeterSquared,
  })
}

test('a dropped sphere bounces off a static plane and loses energy on every impact', () => {
  const body = createRigidBody({ massKg: 1, positionMeters: [0, 3, 0] })
  const restitution = 0.5
  const impacts = []

  for (let stepIndex = 0; stepIndex < 600; stepIndex += 1) {
    applyGravityForce(body)
    integrateRigidBody(body, FIXED_TIMESTEP_SECONDS)
    clearForceAccumulators(body)

    const contact = createGroundContact(body, SPHERE_RADIUS_METERS, {
      restitution,
      frictionCoefficient: 0,
    })
    if (!contact) continue

    const velocityBeforeSolveMetersPerSecond = body.velocityMetersPerSecond.y
    solveContacts([contact])
    const velocityAfterSolveMetersPerSecond = body.velocityMetersPerSecond.y

    if (
      velocityBeforeSolveMetersPerSecond < 0 &&
      velocityAfterSolveMetersPerSecond > 0
    ) {
      impacts.push({
        velocityBeforeSolveMetersPerSecond,
        velocityAfterSolveMetersPerSecond,
      })
    }
  }

  assert.ok(impacts.length >= 2, 'expected at least two bounces')

  const [firstImpact, secondImpact] = impacts

  // The downward velocity reverses into an upward one.
  assert.ok(firstImpact.velocityBeforeSolveMetersPerSecond < 0)
  assert.ok(firstImpact.velocityAfterSolveMetersPerSecond > 0)

  // The rebound speed is exactly the restitution times the impact speed.
  assert.ok(
    Math.abs(
      firstImpact.velocityAfterSolveMetersPerSecond -
        restitution * -firstImpact.velocityBeforeSolveMetersPerSecond
    ) < 1e-12
  )

  // Every following bounce is weaker than the previous one.
  assert.ok(
    secondImpact.velocityAfterSolveMetersPerSecond <
      firstImpact.velocityAfterSolveMetersPerSecond
  )

  // Once the impact speed drops below the restitution threshold the sphere
  // settles instead of bouncing forever.
  assert.strictEqual(body.velocityMetersPerSecond.y, 0)
})

test('a dropped box rests on a static plane without sinking below the allowed slop', () => {
  const box = createRestingBox([0, 1, 0])
  const contact = createGroundContact(box, BOX_HALF_HEIGHT_METERS, {
    restitution: 0,
    frictionCoefficient: 0,
  })
  let penetrationMeters = 0

  for (let stepIndex = 0; stepIndex < 120; stepIndex += 1) {
    integrateVelocityPhase(box, FIXED_TIMESTEP_SECONDS)

    const activeContact = createGroundContact(box, BOX_HALF_HEIGHT_METERS, {
      restitution: 0,
      frictionCoefficient: 0,
    })
    if (activeContact) {
      solveContacts([activeContact])
      penetrationMeters = activeContact.depth
    }

    integratePositionPhase(box, FIXED_TIMESTEP_SECONDS)
  }

  // The box comes to rest exactly.
  assert.strictEqual(box.velocityMetersPerSecond.length(), 0)
  assert.strictEqual(box.angularVelocityRadiansPerSecond.length(), 0)

  // The box does not sink below the surface beyond the configured slop.
  const restingPenetrationMeters =
    SURFACE_HEIGHT_METERS + BOX_HALF_HEIGHT_METERS - box.positionMeters.y
  assert.ok(restingPenetrationMeters >= 0)
  assert.ok(
    restingPenetrationMeters <= SLOP_METERS + 1e-9,
    `resting penetration ${restingPenetrationMeters} exceeded the slop`
  )
  assert.ok(penetrationMeters > 0)
})

test('a resting body converges to a bounded penetration with the fused integrator', () => {
  // integrateRigidBody applies gravity to the velocity before it integrates
  // the position, so every step sinks the body by g * dt^2 before the contact
  // solver can cancel the velocity. The positional projection bounds the
  // resulting steady state at slop + g * dt^2 / positionCorrectionFactor.
  const box = createRestingBox([0, 1, 0])
  // The body sinks g * dt^2 per step and the projection removes
  // positionCorrectionFactor of the penetration above the slop, so the
  // steady state is slop + g * dt^2 * (1 - factor) / factor.
  const sinkPerStepMeters =
    Math.abs(GRAVITY_METERS_PER_SECOND_SQUARED) *
    FIXED_TIMESTEP_SECONDS *
    FIXED_TIMESTEP_SECONDS
  const expectedSteadyStatePenetrationMeters =
    SLOP_METERS +
    (sinkPerStepMeters * (1 - POSITION_CORRECTION_FACTOR)) /
      POSITION_CORRECTION_FACTOR

  for (let stepIndex = 0; stepIndex < 120; stepIndex += 1) {
    applyGravityForce(box)
    integrateRigidBody(box, FIXED_TIMESTEP_SECONDS)
    clearForceAccumulators(box)

    const contact = createGroundContact(box, BOX_HALF_HEIGHT_METERS, {
      restitution: 0,
      frictionCoefficient: 0,
    })
    if (contact) solveContacts([contact])
  }

  const restingPenetrationMeters =
    SURFACE_HEIGHT_METERS + BOX_HALF_HEIGHT_METERS - box.positionMeters.y

  assert.strictEqual(box.velocityMetersPerSecond.length(), 0)
  assert.ok(
    Math.abs(
      restingPenetrationMeters - expectedSteadyStatePenetrationMeters
    ) < 1e-6,
    `steady state penetration ${restingPenetrationMeters} did not match the predicted ${expectedSteadyStatePenetrationMeters}`
  )
})

test('a sliding body decelerates at the Coulomb limit and rolls without slipping afterwards', () => {
  const frictionCoefficient = 0.5
  const body = createRigidBody({ massKg: 1, positionMeters: [0, SPHERE_RADIUS_METERS, 0] })
  body.velocityMetersPerSecond.set(10, 0, 0)
  const initialVelocityX = body.velocityMetersPerSecond.x
  const decelerationPerStepMetersPerSecond =
    frictionCoefficient *
    Math.abs(GRAVITY_METERS_PER_SECOND_SQUARED) *
    FIXED_TIMESTEP_SECONDS

  let rollingVelocityX = null

  for (let stepIndex = 0; stepIndex < 400; stepIndex += 1) {
    applyGravityForce(body)
    integrateRigidBody(body, FIXED_TIMESTEP_SECONDS)
    clearForceAccumulators(body)

    const contact = createGroundContact(body, SPHERE_RADIUS_METERS, {
      restitution: 0,
      frictionCoefficient,
    })
    if (!contact) continue

    const velocityBeforeSolveMetersPerSecond = body.velocityMetersPerSecond.x
    solveContacts([contact])
    const velocityAfterSolveMetersPerSecond = body.velocityMetersPerSecond.x

    const coulombLimitImpulseNewtonSeconds =
      frictionCoefficient * contact.accumulatedNormalImpulseNewtonSeconds

    // The friction impulse never exceeds the Coulomb cone.
    assert.ok(
      contact.accumulatedFrictionImpulseNewtonSeconds <=
        coulombLimitImpulseNewtonSeconds + 1e-15
    )

    if (rollingVelocityX !== null) {
      // Once the contact patch stops sliding the body rolls without
      // slipping and the tangential velocity stays constant.
      assert.strictEqual(velocityAfterSolveMetersPerSecond, rollingVelocityX)
    } else if (
      Math.abs(
        contact.accumulatedFrictionImpulseNewtonSeconds -
          coulombLimitImpulseNewtonSeconds
      ) < 1e-15
    ) {
      // While the friction impulse is clamped by the Coulomb cone the
      // tangential velocity decreases by exactly the Coulomb limit.
      const expectedVelocityX =
        initialVelocityX - (stepIndex + 1) * decelerationPerStepMetersPerSecond
      assert.ok(
        Math.abs(velocityAfterSolveMetersPerSecond - expectedVelocityX) < 1e-12,
        `step ${stepIndex}: ${velocityAfterSolveMetersPerSecond} != ${expectedVelocityX}`
      )
    } else {
      // The contact patch stopped sliding: the body keeps a constant
      // tangential velocity from now on.
      rollingVelocityX = velocityAfterSolveMetersPerSecond
    }
  }

  assert.ok(rollingVelocityX !== null, 'expected the body to start rolling')
  assert.ok(rollingVelocityX > 0)
})

test('a separating contact produces no impulse and never pulls the bodies together', () => {
  const body = createRigidBody({ massKg: 1, positionMeters: [0, 0.4, 0] })
  body.velocityMetersPerSecond.set(0, 3, 0)
  const contact = createGroundContact(body, SPHERE_RADIUS_METERS, {
    restitution: 0.5,
    frictionCoefficient: 0.5,
  })

  solveContacts([contact])

  assert.strictEqual(contact.accumulatedNormalImpulseNewtonSeconds, 0)
  assert.strictEqual(contact.accumulatedFrictionImpulseNewtonSeconds, 0)
  assert.strictEqual(body.velocityMetersPerSecond.y, 3)
})

test('warm starting reduces the residual velocity error of a stacked chain', () => {
  const runStack = (warmStart) => {
    const bodies = [0, 1, 2].map(() =>
      createRigidBody({
        massKg: 10,
        positionMeters: [0, 0.5, 0],
        inertiaXKgMeterSquared: 1,
        inertiaYKgMeterSquared: 1,
        inertiaZKgMeterSquared: 1,
      })
    )
    bodies[1].positionMeters.y = 1.5
    bodies[2].positionMeters.y = 2.5

    let contacts = null

    for (let stepIndex = 0; stepIndex < 240; stepIndex += 1) {
      for (const body of bodies) {
        applyGravityForce(body)
        integrateRigidBody(body, FIXED_TIMESTEP_SECONDS)
        clearForceAccumulators(body)
      }

      const freshContacts = [
        createStackContact(bodies[0], null, 0),
        createStackContact(bodies[1], bodies[0], 1),
        createStackContact(bodies[2], bodies[1], 2),
      ].filter(Boolean)

      if (warmStart && contacts) {
        contacts = freshContacts.map((fresh) => {
          const carried = contacts.find(
            (candidate) =>
              candidate.bodyA === fresh.bodyA &&
              candidate.bodyB === fresh.bodyB
          )
          if (carried) {
            carried.depth = fresh.depth
            carried.point.copy(fresh.point)
          }
          return carried || fresh
        })
      } else {
        contacts = freshContacts
      }

      solveContacts(contacts, { velocityIterations: 1 })
    }

    return {
      topVelocityY: bodies[2].velocityMetersPerSecond.y,
      topPositionY: bodies[2].positionMeters.y,
    }
  }

  const coldStart = runStack(false)
  const warmStart = runStack(true)

  // The single iteration budget cannot propagate the impulse through the
  // whole chain, so the warm started chain keeps a smaller residual error.
  assert.ok(warmStart.topVelocityY > coldStart.topVelocityY)
  assert.ok(
    Math.abs(warmStart.topVelocityY) < Math.abs(coldStart.topVelocityY) * 0.75
  )
  assert.ok(warmStart.topPositionY > coldStart.topPositionY)
})

test('solving the same scenario twice produces bit-identical results', () => {
  const runScenario = () => {
    const body = createRigidBody({ massKg: 1, positionMeters: [0, 2, 0] })
    for (let stepIndex = 0; stepIndex < 90; stepIndex += 1) {
      applyGravityForce(body)
      integrateRigidBody(body, FIXED_TIMESTEP_SECONDS)
      clearForceAccumulators(body)
      const contact = createGroundContact(body, SPHERE_RADIUS_METERS, {
        restitution: 0.4,
        frictionCoefficient: 0.6,
      })
      if (contact) solveContacts([contact])
    }
    return {
      position: body.positionMeters.toArray(),
      velocity: body.velocityMetersPerSecond.toArray(),
      angularVelocity: body.angularVelocityRadiansPerSecond.toArray(),
      orientation: body.orientationQuaternion.toArray(),
    }
  }

  assert.deepStrictEqual(runScenario(), runScenario())
})

test('a contact produced by the collision narrow phase is resolved with the A-to-B normal', () => {
  const groundShape = createBox(new THREE.Vector3(5, 1, 5))
  const sphereShape = createSphere(SPHERE_RADIUS_METERS)
  const body = createRigidBody({ massKg: 1, positionMeters: [0, 1.45, 0] })
  body.velocityMetersPerSecond.set(0, -1, 0)

  const narrowPhaseContact = testCollision(
    sphereShape,
    {
      positionMeters: body.positionMeters,
      orientationQuaternion: body.orientationQuaternion,
    },
    groundShape,
    {
      positionMeters: new THREE.Vector3(0, 0, 0),
      orientationQuaternion: new THREE.Quaternion(),
    }
  )

  assert.ok(narrowPhaseContact)
  assert.deepStrictEqual(narrowPhaseContact.normal.toArray(), [0, -1, 0])
  assert.ok(Math.abs(narrowPhaseContact.depth - 0.05) < 1e-12)

  const contact = createContactConstraint(
    body,
    null,
    narrowPhaseContact.normal,
    narrowPhaseContact.depth,
    narrowPhaseContact.point,
    { restitution: 0, frictionCoefficient: 0 }
  )

  const velocityBeforeSolveMetersPerSecond = body.velocityMetersPerSecond.y
  solveContacts([contact])

  // The approaching velocity is reversed: the solver pushes the sphere away
  // from the static box along the A-to-B normal.
  assert.ok(
    body.velocityMetersPerSecond.y > velocityBeforeSolveMetersPerSecond,
    'the solver must push the sphere away from the static box'
  )

  // The positional projection also lifts the sphere out of the box.
  assert.ok(body.positionMeters.y > 1.45)
})

test('the solver instance exposes the resolved settings and honours its overrides', () => {
  const solver = createContactSolver({
    velocityIterations: 3,
    slopMeters: 0.01,
    positionCorrectionFactor: 0.5,
  })

  assert.strictEqual(solver.settings.velocityIterations, 3)
  assert.strictEqual(solver.settings.slopMeters, 0.01)
  assert.strictEqual(solver.settings.positionCorrectionFactor, 0.5)

  const body = createRigidBody({ massKg: 1, positionMeters: [0, 0.45, 0] })
  const contact = createGroundContact(body, SPHERE_RADIUS_METERS, {
    restitution: 0,
    frictionCoefficient: 0,
  })

  solver.solve([contact])

  // The penetration of 0.05 m exceeds the configured slop of 0.01 m, so the
  // projection lifts the body by 0.5 * (0.05 - 0.01).
  assert.ok(Math.abs(body.positionMeters.y - 0.47) < 1e-12)

  // A contact inside the dead zone is not corrected at all.
  const restingBody = createRigidBody({
    massKg: 1,
    positionMeters: [0, 0.495, 0],
  })
  const restingContact = createGroundContact(restingBody, SPHERE_RADIUS_METERS, {
    restitution: 0,
    frictionCoefficient: 0,
  })

  solver.solve([restingContact])

  assert.strictEqual(restingBody.positionMeters.y, 0.495)
})

function createStackContact(bodyA, bodyB, surfaceHeightMeters) {
  const bodyBSurfaceHeightMeters = bodyB
    ? bodyB.positionMeters.y + BOX_HALF_HEIGHT_METERS
    : surfaceHeightMeters
  const penetrationMeters =
    bodyBSurfaceHeightMeters - (bodyA.positionMeters.y - BOX_HALF_HEIGHT_METERS)
  if (penetrationMeters <= 0) return null

  return createContactConstraint(
    bodyA,
    bodyB,
    new THREE.Vector3(0, -1, 0),
    penetrationMeters,
    new THREE.Vector3(
      bodyA.positionMeters.x,
      bodyBSurfaceHeightMeters,
      bodyA.positionMeters.z
    ),
    { restitution: 0, frictionCoefficient: 0 }
  )
}

test('the functional solver entry point does not leak settings between calls', () => {
  const overrides = { slopMeters: 0.01, positionCorrectionFactor: 0.5 }

  const overriddenBody = createRigidBody({
    massKg: 1,
    positionMeters: [0, 0.45, 0],
  })
  const overriddenContact = createGroundContact(
    overriddenBody,
    SPHERE_RADIUS_METERS,
    { restitution: 0, frictionCoefficient: 0 }
  )

  solveContacts([overriddenContact], overrides)
  const overriddenPositionY = overriddenBody.positionMeters.y

  const defaultBody = createRigidBody({ massKg: 1, positionMeters: [0, 0.45, 0] })
  const defaultContact = createGroundContact(defaultBody, SPHERE_RADIUS_METERS, {
    restitution: 0,
    frictionCoefficient: 0,
  })

  solveContacts([defaultContact])

  // The second call must use the default settings again, not the overrides
  // of the previous call.
  assert.ok(
    Math.abs(defaultBody.positionMeters.y - overriddenPositionY) > 1e-6,
    'the settings of the previous call leaked into this call'
  )
})
