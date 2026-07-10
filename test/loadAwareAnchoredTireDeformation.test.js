// test/loadAwareAnchoredTireDeformation.test.js

import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import { createCar } from '../src/car/createCar.js'
import {
  createAnchoredToroidalTireGeometryData,
  deformAnchoredToroidalTirePositions,
  restoreAnchoredToroidalTireBaseline,
} from '../src/car/tireDeformationGeometry.js'
import {
  computeLoadAwareTireDeformation,
  createTirePressureVisualConfig,
  smoothTirePressureRatio,
  smoothTireVisualLoadRatio,
} from '../src/car/tirePressureVisualScales.js'

const CONFIG = createTirePressureVisualConfig()
const NOMINAL_RATIO01 = (220 - 80) / (340 - 80)
const GEOMETRY_OPTIONS = Object.freeze({
  outerRadiusMeters: 0.48,
  widthMeters: 0.38,
  hubRadiusMeters: 0.48 * 0.42,
})

test('nominal unloaded shell remains at baseline with finite positions', () => {
  const data = createAnchoredToroidalTireGeometryData(GEOMETRY_OPTIONS)
  const positions = new Float32Array(data.baselinePositions)
  const deformation = computeLoadAwareTireDeformation(
    NOMINAL_RATIO01,
    NOMINAL_RATIO01,
    { isGrounded: false },
    CONFIG
  )

  deform(data, positions, deformation, false)

  assert.deepEqual(positions, data.baselinePositions)
  assertFinitePositions(positions)
})

test('bead anchors remain fixed and shell preserves hub clearance at extreme inputs', () => {
  const data = createAnchoredToroidalTireGeometryData(GEOMETRY_OPTIONS)
  const scenarios = [
    { ratio01: 0, grounded: true, normalForceNewtons: 7000 },
    { ratio01: 1, grounded: true, normalForceNewtons: 7000 },
    { ratio01: 0, grounded: false, normalForceNewtons: 0 },
  ]

  for (const scenario of scenarios) {
    const positions = new Float32Array(data.baselinePositions)
    const deformation = computeLoadAwareTireDeformation(
      scenario.ratio01,
      NOMINAL_RATIO01,
      {
        isGrounded: scenario.grounded,
        normalForceNewtons: scenario.normalForceNewtons,
        referenceNormalForceNewtons: 3432,
      },
      CONFIG
    )
    const result = deform(data, positions, deformation, scenario.grounded)

    assert.ok(result.maximumBeadAnchorDisplacementMeters <= 1e-7)
    assert.ok(
      result.minimumObservedRadialDistanceMeters >=
        data.metadata.hubExclusionRadiusMeters - 1e-7
    )
    assertFinitePositions(positions)
  }
})

test('grounded lower tread deforms more than upper tread with bounded sidewall bulge', () => {
  const data = createAnchoredToroidalTireGeometryData(GEOMETRY_OPTIONS)
  const positions = new Float32Array(data.baselinePositions)
  const deformation = computeLoadAwareTireDeformation(
    0,
    NOMINAL_RATIO01,
    {
      isGrounded: true,
      normalForceNewtons: 5000,
      referenceNormalForceNewtons: 3432,
    },
    CONFIG
  )

  deform(data, positions, deformation, true)

  let maximumLowerTreadDropMeters = 0
  let maximumUpperTreadDropMeters = 0
  let maximumLowerSidewallBulgeMeters = 0
  let maximumNeighborDisplacementDifferenceMeters = 0
  const verticesPerRing = data.metadata.tubularSegments + 1

  for (let index = 0; index < data.treadWeights.length; index += 1) {
    const positionIndex = index * 3
    const deltaY = positions[positionIndex + 1] - data.baselinePositions[positionIndex + 1]

    if (data.treadWeights[index] > 0.5) {
      if (data.baselinePositions[positionIndex + 1] < 0) {
        maximumLowerTreadDropMeters = Math.max(
          maximumLowerTreadDropMeters,
          -deltaY
        )
      } else {
        maximumUpperTreadDropMeters = Math.max(
          maximumUpperTreadDropMeters,
          -deltaY
        )
      }
    }

    if (
      data.sidewallWeights[index] > 0.2 &&
      data.baselinePositions[positionIndex + 1] < 0
    ) {
      const axialSign = Math.sign(data.baselinePositions[positionIndex] || 1)
      maximumLowerSidewallBulgeMeters = Math.max(
        maximumLowerSidewallBulgeMeters,
        axialSign * (positions[positionIndex] - data.baselinePositions[positionIndex])
      )
    }

    if (index % verticesPerRing !== data.metadata.tubularSegments) {
      const nextPositionIndex = positionIndex + 3
      const currentDisplacement = displacementAt(data.baselinePositions, positions, index)
      const nextDisplacement = displacementAt(data.baselinePositions, positions, index + 1)
      maximumNeighborDisplacementDifferenceMeters = Math.max(
        maximumNeighborDisplacementDifferenceMeters,
        Math.abs(currentDisplacement - nextDisplacement)
      )
      assert.ok(Number.isFinite(nextPositionIndex))
    }
  }

  assert.ok(maximumLowerTreadDropMeters > 0.001)
  assert.ok(maximumLowerTreadDropMeters > maximumUpperTreadDropMeters)
  assert.ok(maximumLowerSidewallBulgeMeters > 0)
  assert.ok(maximumLowerSidewallBulgeMeters <= 0.05)
  assert.ok(maximumNeighborDisplacementDifferenceMeters < 0.05)
})

test('pressure and load response remain ordered while airborne contact flattening is zero', () => {
  const loadInput = {
    isGrounded: true,
    normalForceNewtons: 3432,
    referenceNormalForceNewtons: 3432,
  }
  const lowPressure = computeLoadAwareTireDeformation(0, NOMINAL_RATIO01, loadInput, CONFIG)
  const nominalPressure = computeLoadAwareTireDeformation(
    NOMINAL_RATIO01,
    NOMINAL_RATIO01,
    loadInput,
    CONFIG
  )
  const highPressure = computeLoadAwareTireDeformation(1, NOMINAL_RATIO01, loadInput, CONFIG)
  const lightLoad = computeLoadAwareTireDeformation(
    0,
    NOMINAL_RATIO01,
    { ...loadInput, normalForceNewtons: 600 },
    CONFIG
  )
  const airborne = computeLoadAwareTireDeformation(
    0,
    NOMINAL_RATIO01,
    { ...loadInput, isGrounded: false },
    CONFIG
  )

  assert.ok(lowPressure.contactFlatteningMeters > nominalPressure.contactFlatteningMeters)
  assert.ok(nominalPressure.contactFlatteningMeters > highPressure.contactFlatteningMeters)
  assert.ok(lowPressure.contactFlatteningMeters > lightLoad.contactFlatteningMeters)
  assert.equal(airborne.contactFlatteningMeters, 0)
  assert.equal(airborne.sidewallBulgeMeters, 0)
})

test('local ground direction controls the flattened region independently of wheel spin orientation', () => {
  const data = createAnchoredToroidalTireGeometryData(GEOMETRY_OPTIONS)
  const deformation = computeLoadAwareTireDeformation(
    0,
    NOMINAL_RATIO01,
    {
      isGrounded: true,
      normalForceNewtons: 5000,
      referenceNormalForceNewtons: 3432,
    },
    CONFIG
  )
  const initialPositions = new Float32Array(data.baselinePositions)
  const spunPositions = new Float32Array(data.baselinePositions)
  const spunGroundNormal = new THREE.Vector3(0, 1, 0)
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)

  deform(data, initialPositions, deformation, true, { x: 0, y: 1, z: 0 })
  deform(data, spunPositions, deformation, true, spunGroundNormal)

  assert.ok(maximumContactRegionAlignment(data, initialPositions, { x: 0, y: 1, z: 0 }) > 0.45)
  assert.ok(maximumContactRegionAlignment(data, spunPositions, spunGroundNormal) > 0.45)
  assert.notDeepEqual(spunPositions, initialPositions)
})

test('per-wheel geometry stays independent, repeated updates have no drift, and reset restores baseline', () => {
  const leftData = createAnchoredToroidalTireGeometryData(GEOMETRY_OPTIONS)
  const rightData = createAnchoredToroidalTireGeometryData(GEOMETRY_OPTIONS)
  const leftPositions = new Float32Array(leftData.baselinePositions)
  const rightPositions = new Float32Array(rightData.baselinePositions)
  const lowPressure = computeLoadAwareTireDeformation(
    0,
    NOMINAL_RATIO01,
    { isGrounded: true, normalForceNewtons: 5000, referenceNormalForceNewtons: 3432 },
    CONFIG
  )
  const highPressure = computeLoadAwareTireDeformation(
    1,
    NOMINAL_RATIO01,
    { isGrounded: true, normalForceNewtons: 5000, referenceNormalForceNewtons: 3432 },
    CONFIG
  )

  deform(leftData, leftPositions, lowPressure, true)
  deform(rightData, rightPositions, highPressure, true)
  const firstLeftPositions = new Float32Array(leftPositions)
  deform(leftData, leftPositions, lowPressure, true)

  assert.notDeepEqual(leftPositions, rightPositions)
  assert.deepEqual(leftPositions, firstLeftPositions)
  assert.deepEqual(rightData.baselinePositions, createAnchoredToroidalTireGeometryData(GEOMETRY_OPTIONS).baselinePositions)
  assert.equal(restoreAnchoredToroidalTireBaseline(leftData.baselinePositions, leftPositions), true)
  assert.deepEqual(leftPositions, leftData.baselinePositions)
})

test('visual reset restores baseline geometry and all helper outputs remain finite', () => {
  const car = createCar()
  const tirePressureVisuals = car.userData.vehicle.tirePressureVisuals
  tirePressureVisuals.setTargetFromWheelStates(createWheelVisualInputs(80, 5000))
  tirePressureVisuals.update(1 / 30)

  tirePressureVisuals.reset()

  for (const wheel of car.userData.vehicle.wheels) {
    const tire = car.getObjectByName(wheel.visualNodes.tire)
    const deformationData = tire.geometry.userData.anchoredTireDeformation
    assert.deepEqual(tire.geometry.getAttribute('position').array, deformationData.baselinePositions)
  }
  assert.doesNotThrow(() => JSON.stringify(tirePressureVisuals.getSnapshot()))

  const invalidPositions = new Float32Array(
    createAnchoredToroidalTireGeometryData(GEOMETRY_OPTIONS).baselinePositions
  )
  const invalidData = createAnchoredToroidalTireGeometryData(GEOMETRY_OPTIONS)
  deformAnchoredToroidalTirePositions({
    baselinePositions: invalidData.baselinePositions,
    targetPositions: invalidPositions,
    deformationData: invalidData,
    localContactNormal: { x: Number.NaN, y: Number.NaN, z: Number.NaN },
    localContactPoint: { x: Number.NaN, y: Number.NaN, z: Number.NaN },
    isGrounded: true,
    pressureOnlyRadialOffsetMeters: Number.NaN,
    pressureOnlySidewallBulgeMeters: Number.NaN,
    contactFlatteningMeters: Number.NaN,
    sidewallBulgeMeters: Number.NaN,
  })
  assertFinitePositions(invalidPositions)
  assert.equal(smoothTirePressureRatio(0.5, 0.2, 0, 2).value, 0.5)
  assert.equal(smoothTireVisualLoadRatio(1, 2, 0, 0.14, 2.2).value, 1)
})

function deform(data, positions, deformation, isGrounded, localContactNormal = { x: 0, y: 1, z: 0 }) {
  const normal = new THREE.Vector3(
    localContactNormal.x,
    localContactNormal.y,
    localContactNormal.z
  ).normalize()

  return deformAnchoredToroidalTirePositions({
    baselinePositions: data.baselinePositions,
    targetPositions: positions,
    deformationData: data,
    localContactNormal: normal,
    localContactPoint: normal.clone().multiplyScalar(-data.metadata.outerRadiusMeters),
    isGrounded,
    pressureOnlyRadialOffsetMeters: deformation.pressureOnlyRadialOffsetMeters,
    pressureOnlySidewallBulgeMeters: deformation.pressureOnlySidewallBulgeMeters,
    contactFlatteningMeters: deformation.contactFlatteningMeters,
    sidewallBulgeMeters: deformation.sidewallBulgeMeters,
  })
}

function maximumContactRegionAlignment(data, positions, groundNormal) {
  const down = new THREE.Vector3(
    -groundNormal.x,
    -groundNormal.y,
    -groundNormal.z
  ).normalize()
  let bestAlignment = -1
  let bestDisplacementMeters = 0

  for (let index = 0; index < data.treadWeights.length; index += 1) {
    const displacementMeters = displacementAt(data.baselinePositions, positions, index)
    if (displacementMeters <= bestDisplacementMeters) continue

    const positionIndex = index * 3
    const direction = new THREE.Vector3(
      data.baselinePositions[positionIndex],
      data.baselinePositions[positionIndex + 1],
      data.baselinePositions[positionIndex + 2]
    ).normalize()
    bestDisplacementMeters = displacementMeters
    bestAlignment = direction.dot(down)
  }

  return bestAlignment
}

function displacementAt(baselinePositions, positions, index) {
  const offset = index * 3
  return Math.hypot(
    positions[offset] - baselinePositions[offset],
    positions[offset + 1] - baselinePositions[offset + 1],
    positions[offset + 2] - baselinePositions[offset + 2]
  )
}

function assertFinitePositions(positions) {
  for (const value of positions) assert.ok(Number.isFinite(value))
}

function createWheelVisualInputs(tirePressureKpa, normalForceNewtons) {
  return [
    ['front-left', -1.25, 1.45],
    ['front-right', 1.25, 1.45],
    ['rear-left', -1.25, -1.45],
    ['rear-right', 1.25, -1.45],
  ].map(([id, x, z]) => ({
    id,
    tirePressureKpa,
    minTirePressureKpa: 80,
    maxTirePressureKpa: 340,
    defaultTirePressureKpa: 220,
    tireInflationNormalized01: (tirePressureKpa - 80) / 260,
    isGrounded: true,
    normalForceNewtons,
    staticNormalForceNewtons: 3432,
    contactNormalWorld: new THREE.Vector3(0, 1, 0),
    contactPatchWorldPosition: new THREE.Vector3(x, 0, z),
  }))
}
