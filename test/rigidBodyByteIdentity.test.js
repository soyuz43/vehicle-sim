import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import {
  addForce,
  addForceAtPoint,
  addTorque,
  applyAngularImpulseInWorldFrame,
  applyImpulse,
  clearForceAccumulators,
  createRigidBody,
  integrateRigidBody,
  integrateRigidBodyPositionPhase,
  integrateRigidBodyVelocityPhase,
} from '../src/physics/RigidBody.js'
import {
  addLegacyRocketForce,
  addLegacyRocketForceAtPoint,
  addLegacyRocketTorque,
  applyLegacyRocketAngularImpulseInWorldFrame,
  applyLegacyRocketImpulse,
  clearLegacyRocketForceAccumulator,
  createLegacyRocketRigidBody,
  integrateLegacyRocketRigidBody,
} from './fixtures/legacyRocketRigidBody.js'

test('generic rigid body preserves legacy rocket state vectors byte-for-byte', () => {
  const legacyBody = createLegacyRocketRigidBody({
    massKg: 23.75,
    inertiaAXKgMeterSquared: 3.125,
    inertiaAYKgMeterSquared: 4.875,
    inertiaAZKgMeterSquared: 2.625,
    positionMeters: [1.25, 2.5, -3.75],
  })
  const genericBody = createRigidBody({
    massKg: 23.75,
    inertiaXKgMeterSquared: 3.125,
    inertiaYKgMeterSquared: 4.875,
    inertiaZKgMeterSquared: 2.625,
    positionMeters: [1.25, 2.5, -3.75],
  })

  for (let stepIndex = 0; stepIndex < 60; stepIndex += 1) {
    clearLegacyRocketForceAccumulator(legacyBody)
    clearForceAccumulators(genericBody)

    const forceNewtons = new THREE.Vector3(
      4.1 + stepIndex * 0.037,
      9.81 - (stepIndex % 7) * 0.23,
      -2.7 + (stepIndex % 11) * 0.19
    )
    const applicationPointWorldMeters = legacyBody.positionMeters.clone().add(
      new THREE.Vector3(0.31 + stepIndex * 0.001, -0.22, 0.14)
    )
    const torqueNewtonMeters = new THREE.Vector3(
      0.01 * (stepIndex + 1),
      -0.013,
      0.007
    )
    addLegacyRocketForce(legacyBody, forceNewtons)
    addForce(genericBody, forceNewtons)
    addLegacyRocketForceAtPoint(legacyBody, forceNewtons, applicationPointWorldMeters)
    addForceAtPoint(genericBody, forceNewtons, applicationPointWorldMeters)
    addLegacyRocketTorque(legacyBody, torqueNewtonMeters)
    addTorque(genericBody, torqueNewtonMeters)

    if (stepIndex === 0 || stepIndex === 17 || stepIndex === 41) {
      const impulseNewtonsSecond = new THREE.Vector3(
        0.37 + stepIndex * 0.01,
        -0.21 + stepIndex * 0.003,
        0.16 - stepIndex * 0.002
      )
      const impulsePointWorldMeters = legacyBody.positionMeters.clone().add(
        new THREE.Vector3(0.08, -0.03, 0.11)
      )
      applyLegacyRocketImpulse(legacyBody, impulseNewtonsSecond, impulsePointWorldMeters)
      applyImpulse(genericBody, impulseNewtonsSecond, impulsePointWorldMeters)
    }

    if (stepIndex === 29) {
      const angularImpulseNewtonMeterSeconds = new THREE.Vector3(0.14, -0.09, 0.06)
      applyLegacyRocketAngularImpulseInWorldFrame(
        legacyBody,
        angularImpulseNewtonMeterSeconds
      )
      applyAngularImpulseInWorldFrame(genericBody, angularImpulseNewtonMeterSeconds)
    }

    integrateLegacyRocketRigidBody(legacyBody, 1 / 60)
    integrateRigidBody(genericBody, 1 / 60)
  }

  assert.deepStrictEqual(legacyBody.positionMeters.toArray(), genericBody.positionMeters.toArray())
  assert.deepStrictEqual(legacyBody.velocityMetersPerSecond.toArray(), genericBody.velocityMetersPerSecond.toArray())
  assert.deepStrictEqual(legacyBody.orientationQuaternion.toArray(), genericBody.orientationQuaternion.toArray())
  assert.deepStrictEqual(
    legacyBody.angularVelocityRadiansPerSecond.toArray(),
    genericBody.angularVelocityRadiansPerSecond.toArray()
  )
})

test('split integration phases preserve fused rigid-body state vectors byte-for-byte', () => {
  const createBody = () =>
    createRigidBody({
      massKg: 23.75,
      inertiaXKgMeterSquared: 3.125,
      inertiaYKgMeterSquared: 4.875,
      inertiaZKgMeterSquared: 2.625,
      positionMeters: [1.25, 2.5, -3.75],
    })
  const fusedBody = createBody()
  const splitBody = createBody()

  for (let stepIndex = 0; stepIndex < 60; stepIndex += 1) {
    clearForceAccumulators(fusedBody)
    clearForceAccumulators(splitBody)

    const forceNewtons = new THREE.Vector3(
      4.1 + stepIndex * 0.037,
      9.81 - (stepIndex % 7) * 0.23,
      -2.7 + (stepIndex % 11) * 0.19
    )
    const applicationPointWorldMeters = new THREE.Vector3(
      1.56 + stepIndex * 0.001,
      2.28,
      -3.61
    )
    const torqueNewtonMeters = new THREE.Vector3(
      0.01 * (stepIndex + 1),
      -0.013,
      0.007
    )
    addForce(fusedBody, forceNewtons)
    addForce(splitBody, forceNewtons)
    addForceAtPoint(fusedBody, forceNewtons, applicationPointWorldMeters)
    addForceAtPoint(splitBody, forceNewtons, applicationPointWorldMeters)
    addTorque(fusedBody, torqueNewtonMeters)
    addTorque(splitBody, torqueNewtonMeters)

    if (stepIndex === 0 || stepIndex === 17 || stepIndex === 41) {
      const impulseNewtonsSecond = new THREE.Vector3(
        0.37 + stepIndex * 0.01,
        -0.21 + stepIndex * 0.003,
        0.16 - stepIndex * 0.002
      )
      const impulsePointWorldMeters = new THREE.Vector3(
        1.33 + stepIndex * 0.001,
        2.47,
        -3.64
      )
      applyImpulse(fusedBody, impulseNewtonsSecond, impulsePointWorldMeters)
      applyImpulse(splitBody, impulseNewtonsSecond, impulsePointWorldMeters)
    }

    if (stepIndex === 29) {
      const angularImpulseNewtonMeterSeconds = new THREE.Vector3(0.14, -0.09, 0.06)
      applyAngularImpulseInWorldFrame(fusedBody, angularImpulseNewtonMeterSeconds)
      applyAngularImpulseInWorldFrame(splitBody, angularImpulseNewtonMeterSeconds)
    }

    integrateRigidBody(fusedBody, 1 / 60)
    integrateRigidBodyVelocityPhase(splitBody, 1 / 60)
    integrateRigidBodyPositionPhase(splitBody, 1 / 60)
  }

  assert.deepStrictEqual(splitBody.positionMeters.toArray(), fusedBody.positionMeters.toArray())
  assert.deepStrictEqual(
    splitBody.velocityMetersPerSecond.toArray(),
    fusedBody.velocityMetersPerSecond.toArray()
  )
  assert.deepStrictEqual(
    splitBody.orientationQuaternion.toArray(),
    fusedBody.orientationQuaternion.toArray()
  )
  assert.deepStrictEqual(
    splitBody.angularVelocityRadiansPerSecond.toArray(),
    fusedBody.angularVelocityRadiansPerSecond.toArray()
  )
  assert.deepStrictEqual(
    splitBody.linearAccelerationMetersPerSecondSquared.toArray(),
    fusedBody.linearAccelerationMetersPerSecondSquared.toArray()
  )
  assert.deepStrictEqual(
    splitBody.angularAccelerationRadiansPerSecondSquared.toArray(),
    fusedBody.angularAccelerationRadiansPerSecondSquared.toArray()
  )
  assert.strictEqual(splitBody.isFinite, fusedBody.isFinite)
})

test('velocity and position integration phases own distinct body state', () => {
  const body = createRigidBody({
    massKg: 2,
    positionMeters: [1, 2, 3],
    inertiaXKgMeterSquared: 2,
    inertiaYKgMeterSquared: 3,
    inertiaZKgMeterSquared: 4,
  })
  addForce(body, new THREE.Vector3(4, -6, 8))
  addTorque(body, new THREE.Vector3(0.2, -0.3, 0.4))

  const initialPositionMeters = body.positionMeters.toArray()
  const initialOrientation = body.orientationQuaternion.toArray()

  integrateRigidBodyVelocityPhase(body, 1 / 60)

  assert.deepStrictEqual(body.positionMeters.toArray(), initialPositionMeters)
  assert.deepStrictEqual(body.orientationQuaternion.toArray(), initialOrientation)
  const velocityAfterVelocityPhase = body.velocityMetersPerSecond.toArray()
  const angularVelocityAfterVelocityPhase =
    body.angularVelocityRadiansPerSecond.toArray()
  const forceAfterVelocityPhase = body.forceAccumulatorNewtons.toArray()
  const torqueAfterVelocityPhase = body.torqueAccumulatorNewtonMeters.toArray()

  integrateRigidBodyPositionPhase(body, 1 / 60)

  assert.notDeepStrictEqual(body.positionMeters.toArray(), initialPositionMeters)
  assert.deepStrictEqual(
    body.velocityMetersPerSecond.toArray(),
    velocityAfterVelocityPhase
  )
  assert.deepStrictEqual(
    body.angularVelocityRadiansPerSecond.toArray(),
    angularVelocityAfterVelocityPhase
  )
  assert.deepStrictEqual(
    body.forceAccumulatorNewtons.toArray(),
    forceAfterVelocityPhase
  )
  assert.deepStrictEqual(
    body.torqueAccumulatorNewtonMeters.toArray(),
    torqueAfterVelocityPhase
  )
})
