// src/car/createTirePressureVisuals.js

import * as THREE from 'three'
import {
  deformAnchoredToroidalTirePositions,
  restoreAnchoredToroidalTireBaseline,
} from './tireDeformationGeometry.js'
import {
  calculateNominalPressureRatio01,
  clamp01,
  computeLoadAwareTireDeformation,
  createTirePressureVisualConfig,
  smoothTirePressureRatio,
  smoothTireVisualLoadRatio,
} from './tirePressureVisualScales.js'

const CONTACT_PATCH_BASE_OPACITY = 0.55
const CONTACT_PATCH_SURFACE_OFFSET_METERS = 0.0125
const GEOMETRY_INPUT_EPSILON = 1e-5
const LOCAL_UP = new THREE.Vector3(0, 1, 0)

// Visual-only tire pressure/contact deformation. It reads per-wheel simulation
// telemetry and mutates only tire geometry plus the contact-patch proxy.
export function createTirePressureVisuals(car, options = {}) {
  const config = createTirePressureVisualConfig(options)
  const wheelMetas = car?.userData?.vehicle?.wheels ?? []
  const wheelVisuals = wheelMetas.map((meta) => createWheelVisual(car, meta))
  const wheelVisualById = new Map(
    wheelVisuals.map((wheelVisual) => [wheelVisual.wheelId, wheelVisual])
  )
  const carWorldMatrixInverse = new THREE.Matrix4()
  const carWorldQuaternion = new THREE.Quaternion()
  const carWorldQuaternionInverse = new THREE.Quaternion()
  const carLocalContactNormal = new THREE.Vector3()
  const carLocalContactPoint = new THREE.Vector3()

  function setTargetFromPressureState(tirePressureState = {}) {
    const pressureKpa = Number(tirePressureState?.tirePressureKpa)
    const pressureRatio01 = Number(tirePressureState?.tireInflationNormalized01)
    const nominalRatio01 = calculateNominalPressureRatio01(tirePressureState)

    for (const wheelVisual of wheelVisuals) {
      setWheelPressureTarget(
        wheelVisual,
        pressureKpa,
        pressureRatio01,
        nominalRatio01
      )
    }
  }

  // Per-wheel state is preferred. Aggregate pressure support remains for the
  // existing public vehicle visual-state API.
  function setTargetFromWheelStates(wheelStates = []) {
    if (!Array.isArray(wheelStates)) return

    for (const wheelState of wheelStates) {
      const wheelVisual = wheelVisualById.get(wheelState?.id)
      if (!wheelVisual) continue

      setWheelPressureTarget(
        wheelVisual,
        Number(wheelState.tirePressureKpa),
        Number(wheelState.tireInflationNormalized01),
        calculateNominalPressureRatio01(wheelState)
      )
      wheelVisual.targetIsGrounded = wheelState.isGrounded === true
      wheelVisual.targetNormalForceNewtons = nonNegative(wheelState.normalForceNewtons)
      wheelVisual.targetReferenceNormalForceNewtons = nonNegative(
        wheelState.staticNormalForceNewtons
      )
      wheelVisual.targetEffectivePhysicalRollingRadiusMeters = positiveOrFallback(
        wheelState.effectiveTireRollingRadiusMeters,
        wheelVisual.targetEffectivePhysicalRollingRadiusMeters
      )
      copyFiniteVector3(
        wheelVisual.targetContactNormalWorld,
        wheelState.contactNormalWorld,
        0,
        1,
        0
      )
      copyFiniteVector3(
        wheelVisual.targetContactPointWorld,
        wheelState.contactPatchWorldPosition ?? wheelState.contactPointWorldPosition,
        wheelVisual.targetContactPointWorld.x,
        wheelVisual.targetContactPointWorld.y,
        wheelVisual.targetContactPointWorld.z
      )
    }
  }

  function update(dtSeconds) {
    car.updateMatrixWorld(true)

    for (const wheelVisual of wheelVisuals) {
      const pressureSmoothing = smoothTirePressureRatio(
        wheelVisual.visualPressureRatio01,
        wheelVisual.targetPressureRatio01,
        dtSeconds,
        config.visualResponseSeconds
      )
      wheelVisual.visualPressureRatio01 = pressureSmoothing.value
      wheelVisual.isVisualPressureSettled = pressureSmoothing.isSettled

      const targetDeformation = computeLoadAwareTireDeformation(
        wheelVisual.visualPressureRatio01,
        wheelVisual.nominalRatio01,
        createLoadInput(wheelVisual),
        config
      )
      const loadSmoothing = wheelVisual.targetIsGrounded
        ? smoothTireVisualLoadRatio(
            wheelVisual.visualNormalizedLoadRatio,
            targetDeformation.normalizedLoadRatio,
            dtSeconds,
            config.loadResponseSeconds,
            config.maximumVisualLoadRatio
          )
        : { value: 0, isSettled: true }
      wheelVisual.visualNormalizedLoadRatio = loadSmoothing.value
      wheelVisual.targetNormalizedLoadRatio =
        targetDeformation.normalizedLoadRatio
      wheelVisual.referenceNormalForceNewtons =
        targetDeformation.referenceNormalForceNewtons
      wheelVisual.isVisualLoadSettled = loadSmoothing.isSettled
      wheelVisual.currentDeformation = computeLoadAwareTireDeformation(
        wheelVisual.visualPressureRatio01,
        wheelVisual.nominalRatio01,
        {
          isGrounded: wheelVisual.targetIsGrounded,
          normalForceNewtons:
            wheelVisual.visualNormalizedLoadRatio *
            targetDeformation.referenceNormalForceNewtons,
          referenceNormalForceNewtons:
            targetDeformation.referenceNormalForceNewtons,
        },
        config
      )

      resolveLocalContactFrame(wheelVisual)
      applyGeometryIfChanged(wheelVisual)
      applyContactPatch(wheelVisual)
      wheelVisual.isGeometrySettled =
        wheelVisual.isVisualPressureSettled && wheelVisual.isVisualLoadSettled
    }
  }

  function resolveLocalContactFrame(wheelVisual) {
    if (!wheelVisual.tireNode) return

    wheelVisual.tireNode.getWorldQuaternion(wheelVisual.tireWorldQuaternion)
    wheelVisual.tireWorldQuaternionInverse
      .copy(wheelVisual.tireWorldQuaternion)
      .invert()
    wheelVisual.localContactNormal
      .copy(wheelVisual.targetContactNormalWorld)
      .applyQuaternion(wheelVisual.tireWorldQuaternionInverse)
      .normalize()
    if (wheelVisual.localContactNormal.lengthSq() <= Number.EPSILON) {
      wheelVisual.localContactNormal.copy(LOCAL_UP)
    }

    wheelVisual.tireWorldMatrixInverse
      .copy(wheelVisual.tireNode.matrixWorld)
      .invert()
    wheelVisual.localContactPoint
      .copy(wheelVisual.targetContactPointWorld)
      .applyMatrix4(wheelVisual.tireWorldMatrixInverse)
  }

  function applyGeometryIfChanged(wheelVisual) {
    if (!wheelVisual.positionAttribute || !wheelVisual.deformationData) return
    if (!geometryInputsChanged(wheelVisual)) return

    const deformation = wheelVisual.currentDeformation
    const result = deformAnchoredToroidalTirePositions({
      baselinePositions: wheelVisual.deformationData.baselinePositions,
      targetPositions: wheelVisual.positionAttribute.array,
      deformationData: wheelVisual.deformationData,
      localContactNormal: wheelVisual.localContactNormal,
      localContactPoint: wheelVisual.localContactPoint,
      isGrounded: deformation.isGrounded,
      pressureOnlyRadialOffsetMeters:
        deformation.pressureOnlyRadialOffsetMeters,
      pressureOnlySidewallBulgeMeters:
        deformation.pressureOnlySidewallBulgeMeters,
      contactFlatteningMeters: deformation.contactFlatteningMeters,
      sidewallBulgeMeters: deformation.sidewallBulgeMeters,
      lowerSidewallCollapseMeters:
        deformation.lowerSidewallCollapseMeters,
    })

    wheelVisual.maximumBeadAnchorDisplacementMeters =
      result.maximumBeadAnchorDisplacementMeters
    wheelVisual.minimumObservedRadialDistanceMeters =
      result.minimumObservedRadialDistanceMeters
    wheelVisual.maximumContactDisplacementMeters =
      result.maximumContactDisplacementMeters
    wheelVisual.minimumRimClearanceMeters =
      result.minimumRimClearanceMeters
    wheelVisual.maximumRadialIntrusionMeters =
      result.maximumRadialIntrusionMeters
    wheelVisual.minimumTerrainFacingRadiusMeters =
      result.minimumTerrainFacingRadiusMeters
    wheelVisual.positionAttribute.needsUpdate = true
    wheelVisual.tireNode.geometry.computeVertexNormals()
    wheelVisual.tireNode.geometry.computeBoundingSphere()
    copyGeometryInputs(wheelVisual)
  }

  function applyContactPatch(wheelVisual) {
    const patch = wheelVisual.contactPatchNode
    if (!patch) return

    const deformation = wheelVisual.currentDeformation
    patch.visible = deformation.isGrounded
    patch.scale.set(
      deformation.contactPatchScale.width,
      1,
      deformation.contactPatchScale.length
    )
    if (patch.material && 'opacity' in patch.material) {
      patch.material.opacity = deformation.isGrounded
        ? THREE.MathUtils.clamp(
            CONTACT_PATCH_BASE_OPACITY +
              deformation.loadResponse01 * 0.14 +
              deformation.visualDeflation01 * 0.14,
            0.36,
            0.82
          )
        : 0
    }

    car.getWorldQuaternion(carWorldQuaternion)
    carWorldQuaternionInverse.copy(carWorldQuaternion).invert()
    carLocalContactNormal
      .copy(wheelVisual.targetContactNormalWorld)
      .applyQuaternion(carWorldQuaternionInverse)
      .normalize()
    if (carLocalContactNormal.lengthSq() <= Number.EPSILON) {
      carLocalContactNormal.copy(LOCAL_UP)
    }
    carWorldMatrixInverse.copy(car.matrixWorld).invert()
    carLocalContactPoint
      .copy(wheelVisual.targetContactPointWorld)
      .applyMatrix4(carWorldMatrixInverse)
      .addScaledVector(carLocalContactNormal, CONTACT_PATCH_SURFACE_OFFSET_METERS)
    patch.position.copy(carLocalContactPoint)
    patch.quaternion.setFromUnitVectors(LOCAL_UP, carLocalContactNormal)
  }

  function reset() {
    for (const wheelVisual of wheelVisuals) {
      wheelVisual.visualPressureRatio01 = wheelVisual.nominalRatio01
      wheelVisual.visualNormalizedLoadRatio = 0
      wheelVisual.targetNormalizedLoadRatio = 0
      wheelVisual.targetIsGrounded = false
      wheelVisual.targetNormalForceNewtons = 0
      wheelVisual.targetReferenceNormalForceNewtons = 0
      wheelVisual.targetEffectivePhysicalRollingRadiusMeters =
        wheelVisual.deformationData?.metadata?.tireOuterRadiusMeters ?? 0
      wheelVisual.referenceNormalForceNewtons = 0
      wheelVisual.targetContactNormalWorld.copy(LOCAL_UP)
      wheelVisual.targetContactPointWorld.set(0, 0, 0)
      wheelVisual.isVisualPressureSettled =
        Math.abs(
          wheelVisual.targetPressureRatio01 - wheelVisual.nominalRatio01
        ) < 0.002
      wheelVisual.isVisualLoadSettled = true
      wheelVisual.isGeometrySettled = wheelVisual.isVisualPressureSettled
      wheelVisual.maximumBeadAnchorDisplacementMeters = 0
      wheelVisual.minimumObservedRadialDistanceMeters =
        wheelVisual.deformationData?.metadata?.innerBeadRadiusMeters ?? 0
      wheelVisual.maximumContactDisplacementMeters = 0
      wheelVisual.minimumRimClearanceMeters = 0
      wheelVisual.maximumRadialIntrusionMeters = 0
      wheelVisual.minimumTerrainFacingRadiusMeters = 0
      wheelVisual.currentDeformation = computeLoadAwareTireDeformation(
        wheelVisual.nominalRatio01,
        wheelVisual.nominalRatio01,
        {
          effectivePhysicalRollingRadiusMeters:
            wheelVisual.targetEffectivePhysicalRollingRadiusMeters,
        },
        config
      )
      resetGeometry(wheelVisual)
      resetContactPatch(wheelVisual)
      clearGeometryInputs(wheelVisual)
    }
  }

  function getSnapshot() {
    return {
      enabled: true,
      responseSeconds: config.visualResponseSeconds,
      loadResponseSeconds: config.loadResponseSeconds,
      wheelVisuals: wheelVisuals.map((wheelVisual) => ({
        wheelId: wheelVisual.wheelId,
        targetPressureKpa: wheelVisual.targetPressureKpa,
        targetPressureRatio01: wheelVisual.targetPressureRatio01,
        visualPressureRatio01: wheelVisual.visualPressureRatio01,
        visualDeflation01: wheelVisual.currentDeformation.visualDeflation01,
        pressureCompliance01:
          wheelVisual.currentDeformation.pressureCompliance01,
        isGrounded: wheelVisual.currentDeformation.isGrounded,
        normalForceNewtons: wheelVisual.targetNormalForceNewtons,
        referenceNormalForceNewtons:
          wheelVisual.referenceNormalForceNewtons,
        targetNormalizedLoadRatio: wheelVisual.targetNormalizedLoadRatio,
        normalizedLoadRatio: wheelVisual.visualNormalizedLoadRatio,
        contactFlatteningMeters:
          wheelVisual.currentDeformation.contactFlatteningMeters,
        sidewallBulgeMeters: wheelVisual.currentDeformation.sidewallBulgeMeters,
        lowerSidewallCollapseMeters:
          wheelVisual.currentDeformation.lowerSidewallCollapseMeters,
        effectivePhysicalRollingRadiusMeters:
          wheelVisual.currentDeformation.effectivePhysicalRollingRadiusMeters,
        visualLoadedRadiusMeters:
          wheelVisual.currentDeformation.visualLoadedRadiusMeters,
        contactPatchScale: { ...wheelVisual.currentDeformation.contactPatchScale },
        maximumBeadAnchorDisplacementMeters:
          wheelVisual.maximumBeadAnchorDisplacementMeters,
        minimumObservedRadialDistanceMeters:
          wheelVisual.minimumObservedRadialDistanceMeters,
        minimumRimClearanceMeters: wheelVisual.minimumRimClearanceMeters,
        maximumRadialIntrusionMeters: wheelVisual.maximumRadialIntrusionMeters,
        maximumContactDisplacementMeters:
          wheelVisual.maximumContactDisplacementMeters,
        rimOuterRadiusMeters:
          wheelVisual.deformationData?.metadata?.rimFlangeRadiusMeters ?? 0,
        beadSeatRadiusMeters:
          wheelVisual.deformationData?.metadata?.beadSeatRadiusMeters ?? 0,
        beadInterfaceGapMeters:
          wheelVisual.deformationData?.metadata?.beadInterfaceGapMeters ?? 0,
        beadInterfaceOverlapMeters:
          wheelVisual.deformationData?.metadata?.beadInterfaceOverlapMeters ?? 0,
        isVisualPressureSettled: wheelVisual.isVisualPressureSettled,
        isGeometrySettled: wheelVisual.isGeometrySettled,
      })),
    }
  }

  return {
    enabled: true,
    setTargetFromPressureState,
    setTargetFromWheelStates,
    update,
    reset,
    getSnapshot,
  }
}

function createWheelVisual(car, meta) {
  const nodes = meta?.visualNodes ?? {}
  const tireNode = car.getObjectByName(nodes.tire)
  const contactPatchNode = car.getObjectByName(nodes.contactPatch)
  const deformationData =
    tireNode?.geometry?.userData?.anchoredTireDeformation ?? null
  const initialRatio01 = 1

  return {
    wheelId: meta?.id ?? 'unknown',
    tireNode: tireNode ?? null,
    contactPatchNode: contactPatchNode ?? null,
    deformationData,
    positionAttribute: tireNode?.geometry?.getAttribute('position') ?? null,
    targetPressureKpa: 0,
    targetPressureRatio01: initialRatio01,
    visualPressureRatio01: initialRatio01,
    nominalRatio01: initialRatio01,
    hasReceivedPressureTarget: false,
    targetIsGrounded: false,
    targetNormalForceNewtons: 0,
    targetReferenceNormalForceNewtons: 0,
    targetEffectivePhysicalRollingRadiusMeters:
      deformationData?.metadata?.tireOuterRadiusMeters ?? meta?.radius ?? 0.48,
    referenceNormalForceNewtons: 0,
    targetNormalizedLoadRatio: 0,
    visualNormalizedLoadRatio: 0,
    targetContactNormalWorld: new THREE.Vector3(0, 1, 0),
    targetContactPointWorld: new THREE.Vector3(),
    localContactNormal: new THREE.Vector3(0, 1, 0),
    localContactPoint: new THREE.Vector3(0, -(meta?.radius ?? 0.48), 0),
    tireWorldQuaternion: new THREE.Quaternion(),
    tireWorldQuaternionInverse: new THREE.Quaternion(),
    tireWorldMatrixInverse: new THREE.Matrix4(),
    baselineContactPatchPosition: contactPatchNode?.position.clone() ?? null,
    baselineContactPatchQuaternion: contactPatchNode?.quaternion.clone() ?? null,
    isVisualPressureSettled: true,
    isVisualLoadSettled: true,
    isGeometrySettled: true,
    maximumBeadAnchorDisplacementMeters: 0,
    minimumObservedRadialDistanceMeters:
      deformationData?.metadata?.innerBeadRadiusMeters ?? 0,
    maximumContactDisplacementMeters: 0,
    minimumRimClearanceMeters: 0,
    maximumRadialIntrusionMeters: 0,
    minimumTerrainFacingRadiusMeters: 0,
    currentDeformation: computeLoadAwareTireDeformation(1, 1, {
      effectivePhysicalRollingRadiusMeters:
        deformationData?.metadata?.tireOuterRadiusMeters ?? meta?.radius ?? 0.48,
    }),
    lastPressureRatio01: Number.NaN,
    lastLoadRatio: Number.NaN,
    lastGrounded: null,
    lastContactNormalX: Number.NaN,
    lastContactNormalY: Number.NaN,
    lastContactNormalZ: Number.NaN,
    lastContactPointX: Number.NaN,
    lastContactPointY: Number.NaN,
    lastContactPointZ: Number.NaN,
  }
}

function createLoadInput(wheelVisual) {
  return {
    isGrounded: wheelVisual.targetIsGrounded,
    normalForceNewtons: wheelVisual.targetNormalForceNewtons,
    referenceNormalForceNewtons: wheelVisual.targetReferenceNormalForceNewtons,
    effectivePhysicalRollingRadiusMeters:
      wheelVisual.targetEffectivePhysicalRollingRadiusMeters,
  }
}

function setWheelPressureTarget(wheelVisual, pressureKpa, ratio01, nominalRatio01) {
  const hasPressureRatio = Number.isFinite(ratio01)
  const nextRatio01 = hasPressureRatio ? clamp01(ratio01) : null
  const nextNominalRatio01 = Number.isFinite(nominalRatio01)
    ? clamp01(nominalRatio01)
    : null

  if (Number.isFinite(pressureKpa)) wheelVisual.targetPressureKpa = pressureKpa
  if (nextNominalRatio01 !== null) wheelVisual.nominalRatio01 = nextNominalRatio01
  if (nextRatio01 !== null) {
    if (!wheelVisual.hasReceivedPressureTarget) {
      wheelVisual.visualPressureRatio01 = nextRatio01
      wheelVisual.hasReceivedPressureTarget = true
    }
    wheelVisual.targetPressureRatio01 = nextRatio01
  }
}

function geometryInputsChanged(wheelVisual) {
  const deformation = wheelVisual.currentDeformation
  if (
    Math.abs(wheelVisual.lastPressureRatio01 - wheelVisual.visualPressureRatio01) >
      GEOMETRY_INPUT_EPSILON ||
    Math.abs(wheelVisual.lastLoadRatio - wheelVisual.visualNormalizedLoadRatio) >
      GEOMETRY_INPUT_EPSILON ||
    wheelVisual.lastGrounded !== deformation.isGrounded
  ) {
    return true
  }
  if (
    !deformation.isGrounded ||
    (deformation.contactFlatteningMeters <= GEOMETRY_INPUT_EPSILON &&
      deformation.sidewallBulgeMeters <= GEOMETRY_INPUT_EPSILON)
  ) {
    return false
  }

  return (
    Math.abs(wheelVisual.lastContactNormalX - wheelVisual.localContactNormal.x) >
      GEOMETRY_INPUT_EPSILON ||
    Math.abs(wheelVisual.lastContactNormalY - wheelVisual.localContactNormal.y) >
      GEOMETRY_INPUT_EPSILON ||
    Math.abs(wheelVisual.lastContactNormalZ - wheelVisual.localContactNormal.z) >
      GEOMETRY_INPUT_EPSILON ||
    Math.abs(wheelVisual.lastContactPointX - wheelVisual.localContactPoint.x) >
      GEOMETRY_INPUT_EPSILON ||
    Math.abs(wheelVisual.lastContactPointY - wheelVisual.localContactPoint.y) >
      GEOMETRY_INPUT_EPSILON ||
    Math.abs(wheelVisual.lastContactPointZ - wheelVisual.localContactPoint.z) >
      GEOMETRY_INPUT_EPSILON
  )
}

function copyGeometryInputs(wheelVisual) {
  wheelVisual.lastPressureRatio01 = wheelVisual.visualPressureRatio01
  wheelVisual.lastLoadRatio = wheelVisual.visualNormalizedLoadRatio
  wheelVisual.lastGrounded = wheelVisual.currentDeformation.isGrounded
  wheelVisual.lastContactNormalX = wheelVisual.localContactNormal.x
  wheelVisual.lastContactNormalY = wheelVisual.localContactNormal.y
  wheelVisual.lastContactNormalZ = wheelVisual.localContactNormal.z
  wheelVisual.lastContactPointX = wheelVisual.localContactPoint.x
  wheelVisual.lastContactPointY = wheelVisual.localContactPoint.y
  wheelVisual.lastContactPointZ = wheelVisual.localContactPoint.z
}

function clearGeometryInputs(wheelVisual) {
  wheelVisual.lastPressureRatio01 = Number.NaN
  wheelVisual.lastLoadRatio = Number.NaN
  wheelVisual.lastGrounded = null
  wheelVisual.lastContactNormalX = Number.NaN
  wheelVisual.lastContactNormalY = Number.NaN
  wheelVisual.lastContactNormalZ = Number.NaN
  wheelVisual.lastContactPointX = Number.NaN
  wheelVisual.lastContactPointY = Number.NaN
  wheelVisual.lastContactPointZ = Number.NaN
}

function resetGeometry(wheelVisual) {
  if (!wheelVisual.positionAttribute || !wheelVisual.deformationData) return
  restoreAnchoredToroidalTireBaseline(
    wheelVisual.deformationData.baselinePositions,
    wheelVisual.positionAttribute.array
  )
  wheelVisual.positionAttribute.needsUpdate = true
  wheelVisual.tireNode.scale.set(1, 1, 1)
  wheelVisual.tireNode.geometry.computeVertexNormals()
  wheelVisual.tireNode.geometry.computeBoundingSphere()
}

function resetContactPatch(wheelVisual) {
  const patch = wheelVisual.contactPatchNode
  if (!patch) return
  patch.scale.set(1, 1, 1)
  patch.visible = true
  if (wheelVisual.baselineContactPatchPosition) {
    patch.position.copy(wheelVisual.baselineContactPatchPosition)
  }
  if (wheelVisual.baselineContactPatchQuaternion) {
    patch.quaternion.copy(wheelVisual.baselineContactPatchQuaternion)
  }
  if (patch.material && 'opacity' in patch.material) {
    patch.material.opacity = CONTACT_PATCH_BASE_OPACITY
  }
}

function copyFiniteVector3(target, source, fallbackX, fallbackY, fallbackZ) {
  target.set(
    Number.isFinite(source?.x) ? source.x : fallbackX,
    Number.isFinite(source?.y) ? source.y : fallbackY,
    Number.isFinite(source?.z) ? source.z : fallbackZ
  )
}

function nonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function positiveOrFallback(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}