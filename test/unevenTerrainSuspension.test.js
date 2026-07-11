// test/unevenTerrainSuspension.test.js

import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import { createCar } from '../src/car/createCar.js'
import { createTerrain } from '../src/terrain/createTerrain.js'
import { createFlatTerrainContactQuery } from '../src/terrain/createFlatTerrainContactQuery.js'
import {
  createHeightfieldTerrainContactQuery,
} from '../src/terrain/createHeightfieldTerrainContactQuery.js'
import {
  createTerrainSurfaceProfile,
} from '../src/terrain/createTerrainSurfaceProfile.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import {
  updateWheelContactPatchPlanarVelocity,
  updateWheelContactPlaneBasis,
} from '../src/vehicle/dynamics/contactPlaneBasisState.js'
import {
  createPlanarMotionState,
  updatePlanarBasisFromYaw,
} from '../src/vehicle/dynamics/planarMotion.js'
import {
  createSuspensionNormalForceSummary,
  updateSuspensionNormalForceState,
} from '../src/vehicle/dynamics/suspensionNormalForceState.js'

const GRAVITY_METERS_PER_SECOND_SQUARED = 9.80665
const VEHICLE_MASS_KG = 1400
const VEHICLE_WEIGHT_NEWTONS =
  VEHICLE_MASS_KG * GRAVITY_METERS_PER_SECOND_SQUARED
const STEP_SECONDS = 1 / 60

test('proving-ground profile keeps the spawn flat, bounds its features, and returns finite normals', () => {
  const profile = createTerrainSurfaceProfile()
  const spawn = profile.querySurfaceAtWorldPosition(0, 0, {})
  const rise = profile.querySurfaceAtWorldPosition(0, 32, {})
  const leftBump = profile.querySurfaceAtWorldPosition(-1.25, 52, {})
  const dip = profile.querySurfaceAtWorldPosition(0, 98, {})
  const outside = profile.querySurfaceAtWorldPosition(
    profile.halfSizeMeters + 1,
    0,
    {}
  )

  assert.equal(spawn.terrainHeightMeters, 0)
  assert.ok(Math.abs(spawn.normalWorld.x) < 1e-8)
  assert.ok(Math.abs(spawn.normalWorld.y - 1) < 1e-8)
  assert.ok(Math.abs(spawn.normalWorld.z) < 1e-8)
  assert.ok(rise.terrainHeightMeters > 0.1)
  assert.ok(leftBump.terrainHeightMeters > 0.06)
  assert.ok(dip.terrainHeightMeters < -0.08)
  assert.equal(outside.isWithinBounds, false)
  assert.equal(outside.status, 'outside-terrain-bounds')

  const samples = [
    [0, 0],
    [0, 22],
    [0, 32],
    [-1.25, 52],
    [1.25, 61],
    [8, 75],
    [0, 98],
    [0, 126],
  ]

  for (const [xMeters, zMeters] of samples) {
    const sample = profile.querySurfaceAtWorldPosition(xMeters, zMeters, {})
    assert.ok(Number.isFinite(sample.terrainHeightMeters))
    assert.ok(Number.isFinite(sample.normalWorld.x))
    assert.ok(Number.isFinite(sample.normalWorld.y))
    assert.ok(Number.isFinite(sample.normalWorld.z))
    assert.ok(
      Math.abs(vectorLength(sample.normalWorld) - 1) < 1e-8,
      'expected normalized normal at ' + xMeters + ', ' + zMeters
    )
  }
})

test('terrain profile normal agrees with the shared height function and transitions remain continuous', () => {
  const profile = createTerrainSurfaceProfile()
  const xMeters = 7
  const zMeters = 75
  const sampleDistanceMeters = 0.01
  const normal = profile.calculateNormalAtWorldXZ(xMeters, zMeters)
  const heightWestMeters = profile.getHeightAtWorldXZ(
    xMeters - sampleDistanceMeters,
    zMeters
  )
  const heightEastMeters = profile.getHeightAtWorldXZ(
    xMeters + sampleDistanceMeters,
    zMeters
  )
  const heightSouthMeters = profile.getHeightAtWorldXZ(
    xMeters,
    zMeters - sampleDistanceMeters
  )
  const heightNorthMeters = profile.getHeightAtWorldXZ(
    xMeters,
    zMeters + sampleDistanceMeters
  )
  const slopeXMetersPerMeter =
    (heightEastMeters - heightWestMeters) / (sampleDistanceMeters * 2)
  const slopeZMetersPerMeter =
    (heightNorthMeters - heightSouthMeters) / (sampleDistanceMeters * 2)
  const expectedNormal = normalize({
    x: -slopeXMetersPerMeter,
    y: 1,
    z: -slopeZMetersPerMeter,
  })

  assert.ok(vectorDistance(normal, expectedNormal) < 0.01)

  for (const transitionZMeters of [22, 42, 67, 84, 89, 108, 114, 138]) {
    const before = profile.getHeightAtWorldXZ(0, transitionZMeters - 0.001)
    const after = profile.getHeightAtWorldXZ(0, transitionZMeters + 0.001)
    assert.ok(
      Math.abs(after - before) < 0.002,
      'unexpected transition jump near z=' + transitionZMeters
    )
  }
})

test('terrain renderer samples exactly the same profile as the query source', () => {
  const profile = createTerrainSurfaceProfile()
  const terrain = createTerrain({
    surfaceProfile: profile,
    subdivisions: 32,
  })
  const positions = terrain.geometry.getAttribute('position')

  for (let index = 0; index < positions.count; index += 7) {
    const xMeters = positions.getX(index)
    const zMeters = positions.getZ(index)
    const renderedHeightMeters = positions.getY(index)
    const queriedHeightMeters = profile.getHeightAtWorldXZ(xMeters, zMeters)

    assert.ok(Math.abs(renderedHeightMeters - queriedHeightMeters) < 1e-7)
  }

  assert.equal(terrain.userData.terrain.halfSizeMeters, profile.halfSizeMeters)
  assert.equal(
    terrain.userData.terrain.surfaceProfile,
    profile,
    'renderer must retain the query profile identity'
  )
})

test('heightfield suspension ray uses finite slope-radius correction and rejects shallow normal alignment', () => {
  const inclinedProfile = createPlaneProfile({ slopeZMetersPerMeter: 0.2 })
  const query = createHeightfieldTerrainContactQuery({
    surfaceProfile: inclinedProfile,
  })
  const result = query.querySuspensionContact(
    {
      rayOriginWorld: new THREE.Vector3(0, 2, 0),
      suspensionDownDirectionWorld: new THREE.Vector3(0, -1, 0),
      maximumRayDistanceMeters: 3,
      wheelRadiusMeters: 0.48,
      minimumNormalAlignmentCosine: 0.2,
    },
    {}
  )

  const expectedAlignmentCosine = 1 / Math.sqrt(1.04)
  assert.equal(result.status, 'surface-intersection')
  assert.ok(Math.abs(result.normalAlignmentCosine - expectedAlignmentCosine) < 1e-8)
  assert.ok(
    Math.abs(
      result.centerToContactDistanceAlongSuspensionMeters -
        0.48 / expectedAlignmentCosine
    ) < 1e-8
  )
  assert.ok(Number.isFinite(result.wheelCenterDistanceAlongSuspensionMeters))

  const wheelCenterWorld = new THREE.Vector3(0, 2, 0).addScaledVector(
    new THREE.Vector3(0, -1, 0),
    result.wheelCenterDistanceAlongSuspensionMeters
  )
  const centerPlaneDistanceMeters = result.contactNormalWorld.dot(
    wheelCenterWorld.sub(result.contactPointWorld)
  )
  assert.ok(Math.abs(centerPlaneDistanceMeters - 0.48) < 1e-4)

  const steepQuery = createHeightfieldTerrainContactQuery({
    surfaceProfile: createPlaneProfile({ slopeZMetersPerMeter: 8 }),
  })
  const steepResult = steepQuery.querySuspensionContact(
    {
      rayOriginWorld: new THREE.Vector3(0, 2, 0),
      suspensionDownDirectionWorld: new THREE.Vector3(0, -1, 0),
      maximumRayDistanceMeters: 3,
      wheelRadiusMeters: 0.48,
      minimumNormalAlignmentCosine: 0.25,
    },
    {}
  )

  assert.equal(steepResult.hasContact, false)
  assert.equal(steepResult.status, 'surface-too-steep')

  const invalidResult = query.querySuspensionContact({}, {})
  assert.equal(invalidResult.hasContact, false)
  assert.equal(invalidResult.status, 'invalid-query')
  assert.ok(Number.isFinite(invalidResult.contactPointWorld.x))
  assert.ok(Number.isFinite(invalidResult.contactNormalWorld.y))
})

test('contact-plane tangent basis is orthonormal, right-handed, and steering-aware', () => {
  const planarMotion = createPlanarMotionState({ yawRadians: 0.35 })
  updatePlanarBasisFromYaw(planarMotion)
  planarMotion.worldVelocityMetersPerSecond.set(4, 0, 8)
  const contactNormalWorld = new THREE.Vector3(0.08, 0.98, -0.17).normalize()
  const wheelState = {
    isGrounded: true,
    steerable: true,
    steeringAngleRadians: 0.22,
    contactNormalWorld,
    wheelForwardWorld: new THREE.Vector3(),
    contactForwardTangentWorld: new THREE.Vector3(),
    contactLateralTangentWorld: new THREE.Vector3(),
    contactPatchVelocityWorld: new THREE.Vector3(),
    contactPatchLocal: new THREE.Vector3(-1.25, 0, 1.45),
  }

  updateWheelContactPlaneBasis(wheelState, planarMotion)
  updateWheelContactPatchPlanarVelocity(wheelState, planarMotion)

  assert.equal(wheelState.isContactTangentBasisValid, true)
  assert.ok(Math.abs(wheelState.contactForwardTangentWorld.dot(contactNormalWorld)) < 1e-8)
  assert.ok(Math.abs(wheelState.contactLateralTangentWorld.dot(contactNormalWorld)) < 1e-8)
  assert.ok(
    Math.abs(
      wheelState.contactForwardTangentWorld.dot(
        wheelState.contactLateralTangentWorld
      )
    ) < 1e-8
  )
  assert.ok(
    Math.abs(wheelState.contactForwardTangentWorld.length() - 1) < 1e-8
  )
  assert.ok(
    Math.abs(wheelState.contactLateralTangentWorld.length() - 1) < 1e-8
  )

  const handedness = new THREE.Vector3()
    .crossVectors(
      wheelState.contactForwardTangentWorld,
      wheelState.contactLateralTangentWorld
    )
    .dot(contactNormalWorld)
  assert.ok(handedness > 0.999)
  assert.ok(Number.isFinite(wheelState.contactPatchVelocityWorld.x))
})

test('geometry-driven springs normalize base support to vehicle weight while preserving compression and damper signs', () => {
  const wheelStates = createSuspensionWheelStates()
  const summary = createSuspensionNormalForceSummary()
  const spec = createSuspensionSpec()

  updateSuspensionNormalForceState(wheelStates, spec, 0, summary)
  assert.ok(
    Math.abs(summary.totalBaseNormalForceNewtons - VEHICLE_WEIGHT_NEWTONS) <
      1e-6
  )
  assert.ok(
    wheelStates.every((wheelState) => wheelState.springForceNewtons > 0)
  )
  assert.ok(
    wheelStates.every((wheelState) => wheelState.damperForceNewtons === 0)
  )

  const nominalBaseNormalForceNewtons = wheelStates[0].baseNormalForceNewtons
  wheelStates[0].suspensionCurrentLengthMeters = 0.2
  updateSuspensionNormalForceState(wheelStates, spec, 0.02, summary)
  assert.ok(wheelStates[0].suspensionCompressionMeters > 0.08)
  assert.ok(wheelStates[0].damperForceNewtons > 0)
  assert.ok(wheelStates[0].baseNormalForceNewtons > nominalBaseNormalForceNewtons)
  assert.ok(
    Math.abs(summary.totalBaseNormalForceNewtons - VEHICLE_WEIGHT_NEWTONS) <
      1e-6
  )

  wheelStates[0].suspensionCurrentLengthMeters = 0.31
  updateSuspensionNormalForceState(wheelStates, spec, 0.02, summary)
  assert.ok(wheelStates[0].damperForceNewtons < 0)
  assert.ok(wheelStates[0].rawSuspensionNormalForceNewtons >= 0)
  assert.ok(wheelStates.every((wheelState) => Number.isFinite(wheelState.normalForceNewtons)))

  wheelStates[0].isGrounded = false
  updateSuspensionNormalForceState(wheelStates, spec, 0.02, summary)
  assert.equal(wheelStates[0].normalForceNewtons, 0)
  assert.equal(wheelStates[0].baseNormalForceNewtons, 0)
  assert.equal(wheelStates[0].hasSuspensionCompressionSample, false)
})

test('flat terrain adapter remains compatible with nonzero ground-height support', () => {
  const controller = createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createFlatTerrainContactQuery({
      groundHeightMeters: 0.25,
    }),
  })
  const snapshot = controller.getSnapshot()

  assert.equal(
    snapshot.chassisTerrainSupport.supportTerrainHeightMeters,
    0.25
  )
  assert.equal(snapshot.position.y, 0.25)
  assert.equal(snapshot.chassisTerrainSupport.profileName, 'flat-terrain-contact-query')
  assert.ok(snapshot.wheelStates.every((wheelState) => wheelState.isGrounded))
  assert.equal(snapshot.forces.slopeGravityForceNewtons, 0)
})

test('flat controller baseline has four finite contacts, weight-conserving support, and articulated visual pivots', () => {
  const controller = createVehicleController({
    vehicle: createCar(),
  })
  const snapshot = controller.getSnapshot()
  const totalNormalForceNewtons = sumWheelField(
    snapshot.wheelStates,
    'normalForceNewtons'
  )

  assert.deepEqual(
    snapshot.wheelStates.map((wheelState) => wheelState.isGrounded),
    [true, true, true, true]
  )
  assert.ok(
    Math.abs(totalNormalForceNewtons - VEHICLE_WEIGHT_NEWTONS) < 0.1
  )
  assert.ok(
    snapshot.wheelStates.every(
      (wheelState) =>
        wheelState.suspensionCurrentLengthMeters >=
          wheelState.suspensionMinimumLengthMeters &&
        wheelState.suspensionCurrentLengthMeters <=
          wheelState.suspensionMaximumLengthMeters &&
        Number.isFinite(wheelState.springForceNewtons) &&
        Number.isFinite(wheelState.damperForceNewtons)
    )
  )
  assert.ok(
    snapshot.wheelStates.every(
      (wheelState) =>
        Math.abs(
          wheelState.visual.pivot.position.y -
            wheelState.wheelCenterLocalPosition.y
        ) < 1e-9
    )
  )
  assert.equal(snapshot.forces.slopeGravityForceNewtons, 0)
})

test('alternating proving bumps respond per wheel without shared contact state', () => {
  const profile = createTerrainSurfaceProfile()
  const query = createHeightfieldTerrainContactQuery({ surfaceProfile: profile })
  const car = createCar()
  car.position.z = 50.55
  const controller = createVehicleController({
    vehicle: car,
    terrainContactQuery: query,
  })
  const snapshot = controller.getSnapshot()
  const frontLeft = findWheel(snapshot, 'front-left')
  const frontRight = findWheel(snapshot, 'front-right')
  const rearLeft = findWheel(snapshot, 'rear-left')

  assert.ok(frontLeft.suspensionCompressionMeters > frontRight.suspensionCompressionMeters)
  assert.ok(frontLeft.suspensionCompressionMeters > rearLeft.suspensionCompressionMeters)
  assert.notEqual(
    frontLeft.contactPointWorldPosition,
    frontRight.contactPointWorldPosition
  )
  assert.notEqual(frontLeft.contactNormalWorld, frontRight.contactNormalWorld)
  assert.ok(
    snapshot.wheelStates.every((wheelState) =>
      Number.isFinite(wheelState.suspensionCurrentLengthMeters)
    )
  )
})

test('deep dip transitions airborne and recontact without a damper spike; ABS stays inactive while airborne', () => {
  const mutableTerrain = { deepDipEnabled: false }
  const profile = createPlaneProfile({
    heightAtWorldXZ: (xMeters) =>
      mutableTerrain.deepDipEnabled && xMeters < -0.5 ? -0.55 : 0,
  })
  const controller = createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createHeightfieldTerrainContactQuery({
      surfaceProfile: profile,
    }),
  })

  mutableTerrain.deepDipEnabled = true
  let snapshot = controller.update(STEP_SECONDS, { brake: true })
  const airborneWheel = findWheel(snapshot, 'front-left')

  assert.equal(airborneWheel.isGrounded, false)
  assert.equal(airborneWheel.normalForceNewtons, 0)
  assert.equal(airborneWheel.serviceBrakeAbsActive, false)
  assert.equal(airborneWheel.suspensionContactStatus, 'beyond-suspension-droop')

  snapshot = controller.update(0, { brake: true })
  assert.ok(Number.isFinite(findWheel(snapshot, 'front-left').damperForceNewtons))

  mutableTerrain.deepDipEnabled = false
  snapshot = controller.update(STEP_SECONDS, {})
  const recontactedWheel = findWheel(snapshot, 'front-left')

  assert.equal(recontactedWheel.isGrounded, true)
  assert.ok(Math.abs(recontactedWheel.damperForceNewtons) < 1e-6)
  assert.ok(recontactedWheel.normalForceNewtons > 0)

  mutableTerrain.deepDipEnabled = true
  const resetSnapshot = controller.reset()
  const resetAirborneWheel = findWheel(resetSnapshot, 'front-left')
  assert.equal(resetAirborneWheel.isGrounded, false)
  assert.equal(resetAirborneWheel.hasSuspensionCompressionSample, false)
  assert.equal(
    resetSnapshot.chassisTerrainSupport.currentChassisSupportHeightMeters,
    0
  )
})

test('slope gravity is zero on flat terrain, points downhill on a rise, and never injects vertical motion', () => {
  const flatController = createVehicleController({ vehicle: createCar() })
  assert.equal(flatController.getSnapshot().forces.slopeGravityForceNewtons, 0)

  const unsupportedController = createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createHeightfieldTerrainContactQuery({
      surfaceProfile: createPlaneProfile({
        heightAtWorldXZ: (xMeters) =>
          Math.abs(xMeters) < 0.25 ? 0 : -0.55,
      }),
    }),
  })
  const unsupportedSnapshot = unsupportedController.getSnapshot()
  assert.ok(
    unsupportedSnapshot.wheelStates.every((wheelState) => !wheelState.isGrounded)
  )
  assert.equal(unsupportedSnapshot.forces.slopeGravityForceNewtons, 0)

  const uphillController = createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createHeightfieldTerrainContactQuery({
      surfaceProfile: createPlaneProfile({ slopeZMetersPerMeter: 0.1 }),
    }),
  })
  const uphillSnapshot = uphillController.getSnapshot()
  assert.ok(uphillSnapshot.forces.slopeGravityForceWorldZNewtons < 0)
  assert.ok(uphillSnapshot.forces.slopeGravityForceNewtons > 0)

  const downhillController = createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createHeightfieldTerrainContactQuery({
      surfaceProfile: createPlaneProfile({ slopeZMetersPerMeter: -0.1 }),
    }),
  })
  const downhillSnapshot = downhillController.getSnapshot()
  assert.ok(downhillSnapshot.forces.slopeGravityForceWorldZNewtons > 0)

  let movingSnapshot = uphillController.getSnapshot()
  for (let index = 0; index < 4; index += 1) {
    movingSnapshot = uphillController.update(STEP_SECONDS, { throttle: true })
  }
  assert.equal(movingSnapshot.worldVelocityMetersPerSecond.y, 0)
  assert.ok(
    movingSnapshot.wheelStates.every((wheelState) =>
      Number.isFinite(wheelState.tireForceWorld.y)
    )
  )
})

test('contact-plane tire force projection preserves flat behavior and keeps sloped force horizontal input explicit', () => {
  const flatAdapterController = createVehicleController({ vehicle: createCar() })
  const flatHeightfieldController = createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createHeightfieldTerrainContactQuery({
      surfaceProfile: createTerrainSurfaceProfile({ profileName: 'flat' }),
    }),
  })

  let flatAdapterSnapshot = flatAdapterController.getSnapshot()
  let flatHeightfieldSnapshot = flatHeightfieldController.getSnapshot()
  for (let index = 0; index < 8; index += 1) {
    flatAdapterSnapshot = flatAdapterController.update(STEP_SECONDS, {
      throttle: true,
    })
    flatHeightfieldSnapshot = flatHeightfieldController.update(STEP_SECONDS, {
      throttle: true,
    })
  }

  assert.ok(
    Math.abs(
      flatAdapterSnapshot.forces.netForceWorldZNewtons -
        flatHeightfieldSnapshot.forces.netForceWorldZNewtons
    ) < 1e-9
  )
  assert.ok(
    Math.abs(
      flatAdapterSnapshot.position.z - flatHeightfieldSnapshot.position.z
    ) < 1e-9
  )

  const slopeController = createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createHeightfieldTerrainContactQuery({
      surfaceProfile: createPlaneProfile({ slopeZMetersPerMeter: 0.03 }),
    }),
  })
  let slopeSnapshot = slopeController.getSnapshot()
  for (let index = 0; index < 8; index += 1) {
    slopeSnapshot = slopeController.update(STEP_SECONDS, { throttle: true })
  }

  assert.equal(slopeSnapshot.worldVelocityMetersPerSecond.y, 0)
  assert.ok(slopeSnapshot.wheelStates.every((wheelState) => wheelState.isGrounded))
  assert.ok(
    slopeSnapshot.wheelStates.some(
      (wheelState) => Math.abs(wheelState.tireForceWorld.y) > 1e-5
    )
  )

  for (const wheelState of slopeSnapshot.wheelStates) {
    assert.equal(
      wheelState.planarTireForceWorldXNewtons,
      wheelState.tireForceWorld.x
    )
    assert.equal(
      wheelState.planarTireForceWorldZNewtons,
      wheelState.tireForceWorld.z
    )
    assert.ok(
      wheelState.combinedTireForceMagnitudeNewtons <=
        wheelState.combinedTireForceLimitNewtons + 1e-8
    )
  }
})

test('pressure-adjusted physical radius changes only that wheel contact length and remains finite', () => {
  const controller = createVehicleController({ vehicle: createCar() })
  const nominalSnapshot = controller.getSnapshot()
  const nominalFrontLeft = findWheel(nominalSnapshot, 'front-left')
  const nominalFrontRight = findWheel(nominalSnapshot, 'front-right')
  const nominalFrontLeftRadiusMeters =
    nominalFrontLeft.effectiveTireRollingRadiusMeters
  const nominalFrontLeftLengthMeters =
    nominalFrontLeft.suspensionCurrentLengthMeters
  const nominalFrontRightLengthMeters =
    nominalFrontRight.suspensionCurrentLengthMeters

  controller.setWheelTirePressureKpa('front-left', 80)
  const lowPressureSnapshot = controller.update(STEP_SECONDS, {})
  const lowPressureFrontLeft = findWheel(lowPressureSnapshot, 'front-left')
  const lowPressureFrontRight = findWheel(lowPressureSnapshot, 'front-right')

  assert.ok(
    lowPressureFrontLeft.effectiveTireRollingRadiusMeters <
      nominalFrontLeftRadiusMeters
  )
  assert.ok(
    lowPressureFrontLeft.suspensionCurrentLengthMeters >
      nominalFrontLeftLengthMeters
  )
  assert.ok(
    Math.abs(
      lowPressureFrontRight.suspensionCurrentLengthMeters -
        nominalFrontRightLengthMeters
    ) < 1e-5
  )
  assert.ok(Number.isFinite(lowPressureFrontLeft.normalForceNewtons))
})

test('a deterministic proving-lane traverse remains finite through every terrain feature', () => {
  const controller = createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createHeightfieldTerrainContactQuery({
      surfaceProfile: createTerrainSurfaceProfile(),
    }),
  })

  let snapshot = controller.getSnapshot()
  let minimumGroundedWheelCount = snapshot.wheelStates.length
  let maximumSlopeDegrees = 0
  let maximumCompressionMeters = 0
  let stepCount = 0

  while (snapshot.position.z < 150 && stepCount < 900) {
    snapshot = controller.update(STEP_SECONDS, { throttle: true })
    let groundedWheelCount = 0

    for (const wheelState of snapshot.wheelStates) {
      if (wheelState.isGrounded) groundedWheelCount += 1
      maximumCompressionMeters = Math.max(
        maximumCompressionMeters,
        Math.abs(wheelState.suspensionCompressionMeters)
      )
      assert.ok(Number.isFinite(wheelState.suspensionCurrentLengthMeters))
      assert.ok(Number.isFinite(wheelState.normalForceNewtons))
      assert.ok(Number.isFinite(wheelState.angularVelocityRadiansPerSecond))
    }

    minimumGroundedWheelCount = Math.min(
      minimumGroundedWheelCount,
      groundedWheelCount
    )
    maximumSlopeDegrees = Math.max(
      maximumSlopeDegrees,
      snapshot.chassisTerrainSupport.supportSlopeDegrees
    )
    stepCount += 1
  }

  assert.ok(snapshot.position.z >= 150)
  assert.equal(minimumGroundedWheelCount, 4)
  assert.ok(maximumSlopeDegrees > 0.1)
  assert.ok(maximumCompressionMeters <= 0.22 + 1e-8)
})

test('terrain and suspension output remain deterministic for identical inputs', () => {
  const profile = createTerrainSurfaceProfile()
  const createController = () => {
    const car = createCar()
    return createVehicleController({
      vehicle: car,
      terrainContactQuery: createHeightfieldTerrainContactQuery({
        surfaceProfile: profile,
      }),
    })
  }
  const controllerA = createController()
  const controllerB = createController()
  const inputSequence = [
    { throttle: true },
    { throttle: true, left: true },
    { throttle: true, left: true },
    { brake: true },
    {},
  ]

  let snapshotA = controllerA.getSnapshot()
  let snapshotB = controllerB.getSnapshot()
  for (const input of inputSequence) {
    snapshotA = controllerA.update(STEP_SECONDS, input)
    snapshotB = controllerB.update(STEP_SECONDS, input)
  }

  assert.equal(snapshotA.position.x, snapshotB.position.x)
  assert.equal(snapshotA.position.y, snapshotB.position.y)
  assert.equal(snapshotA.position.z, snapshotB.position.z)
  assert.equal(
    snapshotA.forces.slopeGravityForceWorldZNewtons,
    snapshotB.forces.slopeGravityForceWorldZNewtons
  )
  assert.deepEqual(
    snapshotA.wheelStates.map((wheelState) => ({
      grounded: wheelState.isGrounded,
      length: wheelState.suspensionCurrentLengthMeters,
      compression: wheelState.suspensionCompressionMeters,
      normal: wheelState.normalForceNewtons,
    })),
    snapshotB.wheelStates.map((wheelState) => ({
      grounded: wheelState.isGrounded,
      length: wheelState.suspensionCurrentLengthMeters,
      compression: wheelState.suspensionCompressionMeters,
      normal: wheelState.normalForceNewtons,
    }))
  )
})

test('post-integration telemetry preserves the force-step contact and relaxation budget', () => {
  const controller = createVehicleController({ vehicle: createCar() })
  let snapshot = controller.getSnapshot()

  for (let index = 0; index < 3; index += 1) {
    snapshot = controller.update(STEP_SECONDS, { throttle: true })
  }

  const trace = snapshot.vehicleDynamicsStepTrace
  const integrationInput = trace.stages.integrationInput
  const postIntegration = trace.stages.postIntegration

  assert.ok(
    trace.updateOrder.includes(
      'post-integration-traction-telemetry-without-contact-or-force-refresh'
    )
  )
  assert.equal(
    postIntegration.longitudinalTireForceSummary.appliedTotalNewtons,
    integrationInput.longitudinalTireForceSummary.appliedTotalNewtons
  )
  assert.equal(
    postIntegration.normalForceSummary.totalNewtons,
    integrationInput.normalForceSummary.totalNewtons
  )

  for (let index = 0; index < snapshot.wheelStates.length; index += 1) {
    const wheelState = snapshot.wheelStates[index]
    const integrationWheel = integrationInput.wheels[index]
    const postWheel = postIntegration.wheels[index]

    assert.equal(
      postWheel.suspensionCompressionMeters,
      integrationWheel.suspensionCompressionMeters
    )
    assert.equal(
      postWheel.appliedLongitudinalForceNewtons,
      integrationWheel.appliedLongitudinalForceNewtons
    )
    assert.equal(wheelState.isGrounded, integrationWheel.isGrounded)
  }
})

test('contact hysteresis retains a shallow droop only after contact is already established', () => {
  const mutableTerrain = { depthMeters: 0 }
  const profile = createPlaneProfile({
    heightAtWorldXZ: (xMeters) =>
      xMeters < -0.5 ? -mutableTerrain.depthMeters : 0,
  })
  const controller = createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createHeightfieldTerrainContactQuery({
      surfaceProfile: profile,
    }),
  })

  mutableTerrain.depthMeters = 0.55
  let snapshot = controller.update(STEP_SECONDS, {})
  assert.equal(findWheel(snapshot, 'front-left').isGrounded, false)

  mutableTerrain.depthMeters = 0.095
  snapshot = controller.update(STEP_SECONDS, {})
  assert.equal(
    findWheel(snapshot, 'front-left').isGrounded,
    false,
    'acquire threshold must not hide an out-of-droop wheel'
  )

  mutableTerrain.depthMeters = 0
  snapshot = controller.update(STEP_SECONDS, {})
  assert.equal(findWheel(snapshot, 'front-left').isGrounded, true)

  mutableTerrain.depthMeters = 0.095
  snapshot = controller.update(STEP_SECONDS, {})
  const retainedWheel = findWheel(snapshot, 'front-left')
  assert.equal(retainedWheel.isGrounded, true)
  assert.equal(
    retainedWheel.suspensionContactStatus,
    'within-contact-hysteresis'
  )
})

test('service and parking brake commands remain finite on uneven contact without propelling a resting vehicle', () => {
  const profile = createTerrainSurfaceProfile()
  const car = createCar()
  car.position.z = 50.55
  const controller = createVehicleController({
    vehicle: car,
    terrainContactQuery: createHeightfieldTerrainContactQuery({
      surfaceProfile: profile,
    }),
  })

  let snapshot = controller.update(STEP_SECONDS, { brake: true })
  assert.ok(Number.isFinite(snapshot.signedForwardSpeedMetersPerSecond))
  assert.equal(snapshot.signedForwardSpeedMetersPerSecond, 0)
  assert.ok(
    snapshot.wheelStates.every((wheelState) =>
      Number.isFinite(wheelState.appliedServiceBrakeTorqueNewtonMeters)
    )
  )

  snapshot = controller.update(STEP_SECONDS, { parkingBrake: true })
  for (const wheelState of snapshot.wheelStates) {
    if (wheelState.axle === 'front') {
      assert.equal(wheelState.appliedParkingBrakeTorqueNewtonMeters, 0)
    } else {
      assert.ok(wheelState.appliedParkingBrakeTorqueNewtonMeters > 0)
    }
  }
})

function createPlaneProfile({
  slopeXMetersPerMeter = 0,
  slopeZMetersPerMeter = 0,
  heightAtWorldXZ = null,
} = {}) {
  const normal = normalize({
    x: -slopeXMetersPerMeter,
    y: 1,
    z: -slopeZMetersPerMeter,
  })

  return {
    profileName: 'test-plane-profile',
    surfaceKind: 'test-asphalt',
    frictionCoefficient: 1,
    querySurfaceAtWorldPosition(xMeters, zMeters, target = {}) {
      const heightMeters = heightAtWorldXZ
        ? heightAtWorldXZ(xMeters, zMeters)
        : slopeXMetersPerMeter * xMeters +
          slopeZMetersPerMeter * zMeters

      target.isWithinBounds = true
      target.isInsideTerrainBounds = true
      target.profileName = 'test-plane-profile'
      target.surfaceKind = 'test-asphalt'
      target.frictionCoefficient = 1
      target.terrainHeightMeters = heightMeters
      target.groundHeightMeters = heightMeters
      target.normalWorld = target.normalWorld ?? {}
      target.normalWorld.x = normal.x
      target.normalWorld.y = normal.y
      target.normalWorld.z = normal.z
      target.slopeRadians = Math.acos(normal.y)
      target.slopeDegrees = target.slopeRadians * (180 / Math.PI)
      target.status = 'surface-available'

      return target
    },
  }
}

function createSuspensionWheelStates() {
  return [
    createSuspensionWheelState('front-left'),
    createSuspensionWheelState('front-right'),
    createSuspensionWheelState('rear-left'),
    createSuspensionWheelState('rear-right'),
  ]
}

function createSuspensionWheelState(id) {
  return {
    id,
    isGrounded: true,
    frictionCoefficient: 1,
    suspensionCurrentLengthMeters: 0.262,
    previousSuspensionCompressionMeters: 0,
    suspensionCompressionMeters: 0,
    hasSuspensionCompressionSample: false,
  }
}

function createSuspensionSpec() {
  return {
    massKg: VEHICLE_MASS_KG,
    gravityMetersPerSecondSquared: GRAVITY_METERS_PER_SECOND_SQUARED,
    suspensionEnabled: true,
    suspensionRestLengthMeters: 0.35,
    suspensionMinimumLengthMeters: 0.13,
    suspensionMaximumLengthMeters: 0.35,
    suspensionTravelMeters: 0.22,
    suspensionTargetStaticCompressionRatio01: 0.4,
    suspensionDampingRatio: 0.35,
    maximumSuspensionNormalForceNewtons: VEHICLE_WEIGHT_NEWTONS,
  }
}

function findWheel(snapshot, id) {
  const wheelState = snapshot.wheelStates.find(
    (candidateWheelState) => candidateWheelState.id === id
  )
  assert.ok(wheelState, 'expected wheel ' + id)
  return wheelState
}

function sumWheelField(wheelStates, fieldName) {
  return wheelStates.reduce(
    (total, wheelState) => total + Number(wheelState[fieldName] ?? 0),
    0
  )
}

function normalize(vector) {
  const length = vectorLength(vector)

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  }
}

function vectorLength(vector) {
  return Math.hypot(vector.x, vector.y, vector.z)
}

function vectorDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}
