// src/rocket/rocketRigidBody.js

import {
  addForce,
  addForceAtPoint,
  addTorque,
  applyAngularImpulseInWorldFrame,
  applyImpulse,
  clearForceAccumulators,
  createRigidBody,
  getForwardVectorWorld,
  getLocalVectorToWorld,
  getRightVectorWorld,
  getUpVectorWorld,
  getWorldVectorToLocal,
  integrateRigidBody,
  isFiniteBody,
  resetRigidBody,
  setMassAndInertia,
} from '../physics/RigidBody.js'

function mapRocketRigidBodyConfig(config = {}) {
  return {
    ...config,
    inertiaXKgMeterSquared: config.inertiaAXKgMeterSquared,
    inertiaYKgMeterSquared: config.inertiaAYKgMeterSquared,
    inertiaZKgMeterSquared: config.inertiaAZKgMeterSquared,
  }
}

export function createRocketRigidBody(config = {}) {
  return createRigidBody(mapRocketRigidBodyConfig(config))
}

export function resetRocketRigidBody(body, config = {}) {
  return resetRigidBody(body, mapRocketRigidBodyConfig(config))
}

export {
  addForce as addRocketForce,
  addForceAtPoint as addRocketForceAtPoint,
  addTorque as addRocketTorque,
  applyAngularImpulseInWorldFrame as applyRocketAngularImpulseInWorldFrame,
  applyImpulse as applyRocketImpulse,
  clearForceAccumulators as clearRocketForceAccumulator,
  getForwardVectorWorld as getRocketForwardVectorWorld,
  getLocalVectorToWorld as getRocketLocalVectorToWorld,
  getRightVectorWorld as getRocketRightVectorWorld,
  getUpVectorWorld as getRocketUpVectorWorld,
  getWorldVectorToLocal as getRocketWorldVectorToLocal,
  integrateRigidBody as integrateRocketRigidBody,
  isFiniteBody,
  setMassAndInertia as setRocketMassAndInertia,
}
