// src/car/createTirePressureVisuals.js

import * as THREE from 'three'
import {
  createTirePressureVisualConfig,
  calculateNominalPressureRatio01,
  computeTirePressureVisualScales,
  smoothTirePressureRatio,
} from './tirePressureVisualScales.js'

// Visual-only tire pressure deformation layer.
//
// The simulation remains the source of truth: this helper only reads the
// existing tire pressure state and eases the *visual* tire shape toward it.
// It never changes wheel radius, contact radius, normal force, friction,
// traction limit, or vehicle motion.
export function createTirePressureVisuals(car, options = {}) {
  const config = createTirePressureVisualConfig(options)
  const vehicleMeta = car?.userData?.vehicle ?? {}
  const wheelMetas = Array.isArray(vehicleMeta.wheels) ? vehicleMeta.wheels : []

  const wheelVisuals = wheelMetas.map((meta) => {
    const visualNodes = meta?.visualNodes ?? {}
    const tireNode = car.getObjectByName(visualNodes.tire)
    const contactPatchNode = car.getObjectByName(visualNodes.contactPatch)
    const baselineRadiusMeters = Number.isFinite(meta?.radius) ? meta.radius : 0.48

    return {
      wheelId: meta?.id ?? 'unknown',
      tireNode: tireNode ?? null,
      contactPatchNode: contactPatchNode ?? null,
      baselineRadiusMeters,
      baselineTirePositionY: tireNode ? tireNode.position.y : 0,
      targetPressureKpa: Number.isFinite(meta?.defaultTirePressureKpa)
        ? meta.defaultTirePressureKpa
        : 0,
      targetPressureRatio01: 1,
      visualPressureRatio01: 1,
      isVisualPressureSettled: true,
      nominalRatio01: 1,
    }
  })

  function setTargetFromPressureState(tirePressureState = {}) {
    if (!tirePressureState || typeof tirePressureState !== 'object') return

    const pressureKpa = Number(tirePressureState.tirePressureKpa)
    const ratio01 = Number(tirePressureState.tireInflationNormalized01)
    const nominalRatio01 = calculateNominalPressureRatio01(tirePressureState)

    for (const wheelVisual of wheelVisuals) {
      if (Number.isFinite(pressureKpa)) {
        wheelVisual.targetPressureKpa = pressureKpa
      }
      if (Number.isFinite(ratio01)) {
        wheelVisual.targetPressureRatio01 = ratio01
      }
      if (Number.isFinite(nominalRatio01)) {
        wheelVisual.nominalRatio01 = nominalRatio01
      }
    }
  }

  function applyScalesToWheel(wheelVisual, scales, contactPatchOpacity) {
    if (wheelVisual.tireNode) {
      // Local Y axis of the tire mesh is its width (axle direction after the
      // z-rotation), local X/Z are the radial directions. Scaling radius keeps
      // the bottom of the tire on the ground by dropping the mesh symmetrically.
      wheelVisual.tireNode.scale.set(
        scales.radiusScale,
        scales.widthScale,
        scales.radiusScale
      )
      wheelVisual.tireNode.position.y =
        wheelVisual.baselineTirePositionY +
        (scales.radiusScale - 1) * wheelVisual.baselineRadiusMeters
    }

    if (wheelVisual.contactPatchNode) {
      wheelVisual.contactPatchNode.scale.set(
        scales.contactPatchScale.width,
        1,
        scales.contactPatchScale.length
      )
      const material = wheelVisual.contactPatchNode.material
      if (material && 'opacity' in material) {
        material.opacity = THREE.MathUtils.clamp(contactPatchOpacity, 0, 1)
      }
    }
  }

  function update(dtSeconds) {
    for (const wheelVisual of wheelVisuals) {
      const smoothed = smoothTirePressureRatio(
        wheelVisual.visualPressureRatio01,
        wheelVisual.targetPressureRatio01,
        dtSeconds,
        config.visualResponseSeconds
      )
      wheelVisual.visualPressureRatio01 = smoothed.value
      wheelVisual.isVisualPressureSettled = smoothed.isSettled

      const scales = computeTirePressureVisualScales(
        wheelVisual.visualPressureRatio01,
        wheelVisual.nominalRatio01,
        config
      )
      const contactPatchOpacity = THREE.MathUtils.clamp(
        0.55 + scales.visualTireDeflectionRatio * 0.55,
        0.36,
        0.78
      )
      applyScalesToWheel(wheelVisual, scales, contactPatchOpacity)
    }
  }

  function reset() {
    for (const wheelVisual of wheelVisuals) {
      wheelVisual.visualPressureRatio01 = clamp01(wheelVisual.targetPressureRatio01)
      wheelVisual.isVisualPressureSettled = true

      const scales = computeTirePressureVisualScales(
        wheelVisual.visualPressureRatio01,
        wheelVisual.nominalRatio01,
        config
      )
      const contactPatchOpacity = THREE.MathUtils.clamp(
        0.55 + scales.visualTireDeflectionRatio * 0.55,
        0.36,
        0.78
      )
      applyScalesToWheel(wheelVisual, scales, contactPatchOpacity)
    }
  }

  function getSnapshot() {
    return {
      enabled: true,
      responseSeconds: config.visualResponseSeconds,
      wheelVisuals: wheelVisuals.map((wheelVisual) => {
        const scales = computeTirePressureVisualScales(
          wheelVisual.visualPressureRatio01,
          wheelVisual.nominalRatio01,
          config
        )
        return {
          wheelId: wheelVisual.wheelId,
          targetPressureKpa: wheelVisual.targetPressureKpa,
          targetPressureRatio01: wheelVisual.targetPressureRatio01,
          visualPressureRatio01: wheelVisual.visualPressureRatio01,
          visualDeflation01: scales.visualDeflation01,
          radiusScale: scales.radiusScale,
          widthScale: scales.widthScale,
          sidewallBulgeScale: scales.sidewallBulgeScale,
          contactPatchScale: {
            width: scales.contactPatchScale.width,
            length: scales.contactPatchScale.length,
          },
          isVisualPressureSettled: wheelVisual.isVisualPressureSettled,
        }
      }),
    }
  }

  return {
    enabled: true,
    setTargetFromPressureState,
    update,
    reset,
    getSnapshot,
  }
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 1
  return Math.min(Math.max(value, 0), 1)
}
