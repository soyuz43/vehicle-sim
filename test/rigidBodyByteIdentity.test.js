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
