// src/effects/tireSlipFeedback/createTireSlipFeedback.js

import * as THREE from 'three'

const DEFAULT_MAX_WHEEL_EFFECTS = 4
const CONTACT_EFFECT_Y_OFFSET_METERS = 0.045
const HAZE_EFFECT_Y_OFFSET_METERS = 0.055

const TRACTION_VISUAL_STATES = Object.freeze({
  NONE: 'none',
  ROLLING: 'rolling',
  SATURATED: 'saturated',
  DRIVE_SPIN: 'drive_spin',
  BRAKE_LOCK_TENDENCY: 'brake_lock_tendency',
})

const CONTACT_HIGHLIGHT_STYLES = Object.freeze({
  [TRACTION_VISUAL_STATES.ROLLING]: Object.freeze({
    color: 0x4ade80,
    opacity: 0.08,
    widthMeters: 0.44,
    lengthMeters: 0.62,
  }),
  [TRACTION_VISUAL_STATES.SATURATED]: Object.freeze({
    color: 0xfacc15,
    opacity: 0.34,
    widthMeters: 0.58,
    lengthMeters: 0.9,
  }),
  [TRACTION_VISUAL_STATES.DRIVE_SPIN]: Object.freeze({
    color: 0xfb923c,
    opacity: 0.52,
    widthMeters: 0.72,
    lengthMeters: 1.28,
  }),
  [TRACTION_VISUAL_STATES.BRAKE_LOCK_TENDENCY]: Object.freeze({
    color: 0x38bdf8,
    opacity: 0.52,
    widthMeters: 0.66,
    lengthMeters: 1.08,
  }),
})

const HAZE_STYLES = Object.freeze({
  [TRACTION_VISUAL_STATES.DRIVE_SPIN]: Object.freeze({
    color: 0xff7a18,
    opacity: 0.18,
    radiusMeters: 0.72,
  }),
  [TRACTION_VISUAL_STATES.BRAKE_LOCK_TENDENCY]: Object.freeze({
    color: 0x7dd3fc,
    opacity: 0.14,
    radiusMeters: 0.62,
  }),
})

export function createTireSlipFeedback(config = {}) {
  const root = new THREE.Group()
  root.name = config.name ?? 'tire-slip-feedback-root'

  const maxWheelEffects = Math.max(
    0,
    Math.floor(config.maxWheelEffects ?? DEFAULT_MAX_WHEEL_EFFECTS)
  )
  const wheelEffects = []
  const visualTelemetry = {
    activeVisualSlipEffectCount: 0,
    driveSpinVisualCount: 0,
    brakeLockVisualCount: 0,
    saturatedVisualCount: 0,
    maxSlipFeedbackIntensity: 0,
  }

  for (let index = 0; index < maxWheelEffects; index += 1) {
    const wheelEffect = createWheelSlipEffect(index)
    wheelEffects.push(wheelEffect)
    root.add(wheelEffect.group)
  }

  function update(snapshot = {}, car = null, dt = 0) {
    const wheelStates = Array.isArray(snapshot.wheelStates)
      ? snapshot.wheelStates
      : []
    const yawRadians = sanitizeNumber(snapshot.yawRadians ?? car?.rotation?.y)

    resetVisualTelemetry(visualTelemetry)

    for (let index = 0; index < wheelEffects.length; index += 1) {
      const wheelEffect = wheelEffects[index]
      const wheelState = wheelStates[index]

      if (!wheelState) {
        hideWheelEffect(wheelEffect)
        continue
      }

      updateWheelSlipEffect(wheelEffect, wheelState, yawRadians, dt)
      updateVisualTelemetry(visualTelemetry, wheelEffect)
    }

    return getSnapshot()
  }

  function reset() {
    resetVisualTelemetry(visualTelemetry)

    for (const wheelEffect of wheelEffects) {
      hideWheelEffect(wheelEffect)
    }
  }

  function getSnapshot() {
    return visualTelemetry
  }

  reset()

  return {
    root,
    update,
    reset,
    getSnapshot,
  }
}

function createWheelSlipEffect(index) {
  const group = new THREE.Group()
  group.name = `tire-slip-feedback-wheel-${index}`

  const highlightMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  })
  const hazeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  })

  const contactHighlight = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    highlightMaterial
  )
  contactHighlight.name = `tire-slip-contact-highlight-${index}`
  contactHighlight.rotation.x = -Math.PI / 2
  contactHighlight.renderOrder = 3

  const haze = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    hazeMaterial
  )
  haze.name = `tire-slip-haze-${index}`
  haze.rotation.x = -Math.PI / 2
  haze.renderOrder = 2

  group.add(haze)
  group.add(contactHighlight)

  return {
    group,
    contactHighlight,
    haze,
    visualState: TRACTION_VISUAL_STATES.NONE,
    intensity01: 0,
    isActive: false,
    contactNormalWorld: new THREE.Vector3(0, 1, 0),
    contactForwardTangentWorld: new THREE.Vector3(0, 0, 1),
    contactPlaneXAxisWorld: new THREE.Vector3(-1, 0, 0),
    contactOrientationMatrix: new THREE.Matrix4(),
  }
}

function updateWheelSlipEffect(wheelEffect, wheelState, yawRadians, dt) {
  const visualState = selectWheelVisualState(wheelState)
  const intensity01 = calculateSlipFeedbackIntensity(wheelState, visualState)

  wheelEffect.visualState = visualState
  wheelEffect.intensity01 = intensity01
  wheelEffect.isActive =
    visualState !== TRACTION_VISUAL_STATES.NONE && intensity01 > 0

  if (!wheelEffect.isActive) {
    hideWheelEffect(wheelEffect)
    return
  }

  const contactPosition = wheelState.contactPointWorldPosition ??
    wheelState.contactPatchWorldPosition ??
    wheelState.wheelCenterWorldPosition

  if (!hasFinitePosition(contactPosition)) {
    hideWheelEffect(wheelEffect)
    return
  }

  const highlightStyle = CONTACT_HIGHLIGHT_STYLES[visualState]
  const hazeStyle = HAZE_STYLES[visualState]
  resolveContactFrame(wheelEffect, wheelState, yawRadians)

  wheelEffect.group.visible = true
  wheelEffect.contactHighlight.visible = Boolean(highlightStyle)
  wheelEffect.haze.visible = Boolean(hazeStyle)

  wheelEffect.contactHighlight.position
    .copy(contactPosition)
    .addScaledVector(
      wheelEffect.contactNormalWorld,
      CONTACT_EFFECT_Y_OFFSET_METERS
    )
  applyContactPlaneOrientation(wheelEffect.contactHighlight, wheelEffect)
  wheelEffect.contactHighlight.scale.set(
    highlightStyle.widthMeters * (0.65 + intensity01 * 0.45),
    highlightStyle.lengthMeters * (0.65 + intensity01 * 0.6),
    1
  )
  wheelEffect.contactHighlight.material.color.setHex(highlightStyle.color)
  wheelEffect.contactHighlight.material.opacity =
    highlightStyle.opacity * intensity01

  if (hazeStyle) {
    const pulse = calculateVisualPulse(dt, intensity01)

    wheelEffect.haze.position
      .copy(contactPosition)
      .addScaledVector(
        wheelEffect.contactNormalWorld,
        HAZE_EFFECT_Y_OFFSET_METERS
      )
    applyContactPlaneOrientation(wheelEffect.haze, wheelEffect)
    wheelEffect.haze.scale.setScalar(
      hazeStyle.radiusMeters * (0.6 + intensity01 * 0.7 + pulse)
    )
    wheelEffect.haze.material.color.setHex(hazeStyle.color)
    wheelEffect.haze.material.opacity = hazeStyle.opacity * intensity01
  }
}

function resolveContactFrame(wheelEffect, wheelState, yawRadians) {
  wheelEffect.contactNormalWorld.set(
    Number.isFinite(wheelState.contactNormalWorld?.x)
      ? wheelState.contactNormalWorld.x
      : 0,
    Number.isFinite(wheelState.contactNormalWorld?.y)
      ? wheelState.contactNormalWorld.y
      : 1,
    Number.isFinite(wheelState.contactNormalWorld?.z)
      ? wheelState.contactNormalWorld.z
      : 0
  )
  if (wheelEffect.contactNormalWorld.lengthSq() <= Number.EPSILON) {
    wheelEffect.contactNormalWorld.set(0, 1, 0)
  }
  wheelEffect.contactNormalWorld.normalize()

  wheelEffect.contactForwardTangentWorld.set(
    Number.isFinite(wheelState.contactForwardTangentWorld?.x)
      ? wheelState.contactForwardTangentWorld.x
      : Math.sin(yawRadians),
    Number.isFinite(wheelState.contactForwardTangentWorld?.y)
      ? wheelState.contactForwardTangentWorld.y
      : 0,
    Number.isFinite(wheelState.contactForwardTangentWorld?.z)
      ? wheelState.contactForwardTangentWorld.z
      : Math.cos(yawRadians)
  )
  wheelEffect.contactForwardTangentWorld.addScaledVector(
    wheelEffect.contactNormalWorld,
    -wheelEffect.contactForwardTangentWorld.dot(
      wheelEffect.contactNormalWorld
    )
  )

  if (wheelEffect.contactForwardTangentWorld.lengthSq() <= Number.EPSILON) {
    wheelEffect.contactForwardTangentWorld.set(
      Math.sin(yawRadians),
      0,
      Math.cos(yawRadians)
    )
    wheelEffect.contactForwardTangentWorld.addScaledVector(
      wheelEffect.contactNormalWorld,
      -wheelEffect.contactForwardTangentWorld.dot(
        wheelEffect.contactNormalWorld
      )
    )
  }

  if (wheelEffect.contactForwardTangentWorld.lengthSq() <= Number.EPSILON) {
    wheelEffect.contactForwardTangentWorld.set(0, 0, 1)
  }
  wheelEffect.contactForwardTangentWorld.normalize()
  wheelEffect.contactPlaneXAxisWorld
    .crossVectors(
      wheelEffect.contactForwardTangentWorld,
      wheelEffect.contactNormalWorld
    )
    .normalize()

  if (wheelEffect.contactPlaneXAxisWorld.lengthSq() <= Number.EPSILON) {
    wheelEffect.contactPlaneXAxisWorld.set(-1, 0, 0)
  }
}

function applyContactPlaneOrientation(mesh, wheelEffect) {
  wheelEffect.contactOrientationMatrix.makeBasis(
    wheelEffect.contactPlaneXAxisWorld,
    wheelEffect.contactForwardTangentWorld,
    wheelEffect.contactNormalWorld
  )
  mesh.quaternion.setFromRotationMatrix(wheelEffect.contactOrientationMatrix)
}

function hideWheelEffect(wheelEffect) {
  wheelEffect.group.visible = false
  wheelEffect.contactHighlight.visible = false
  wheelEffect.haze.visible = false
  wheelEffect.contactHighlight.material.opacity = 0
  wheelEffect.haze.material.opacity = 0
  wheelEffect.visualState = TRACTION_VISUAL_STATES.NONE
  wheelEffect.intensity01 = 0
  wheelEffect.isActive = false
}

function selectWheelVisualState(wheelState) {
  if (!wheelState.isGrounded || wheelState.isWheelAirborne) {
    return TRACTION_VISUAL_STATES.NONE
  }

  if (wheelState.isDriveWheelSpinning) {
    return TRACTION_VISUAL_STATES.DRIVE_SPIN
  }

  if (wheelState.isBrakeLockTendency) {
    return TRACTION_VISUAL_STATES.BRAKE_LOCK_TENDENCY
  }

  if (wheelState.isLongitudinalTractionSaturated) {
    return TRACTION_VISUAL_STATES.SATURATED
  }

  if (wheelState.longitudinalTractionState === 'rolling') {
    return TRACTION_VISUAL_STATES.ROLLING
  }

  return TRACTION_VISUAL_STATES.NONE
}

function calculateSlipFeedbackIntensity(wheelState, visualState) {
  if (visualState === TRACTION_VISUAL_STATES.NONE) return 0

  const severity01 = clamp01(wheelState.tractionStateSeverity01)
  const slipRatio01 = clamp01(
    sanitizeNumber(wheelState.longitudinalSlipRatioAbs) / 0.5
  )
  const saturation01 = clamp01(
    sanitizeNumber(wheelState.longitudinalTireForceSaturationRatio)
  )

  if (visualState === TRACTION_VISUAL_STATES.ROLLING) {
    return Math.min(0.18, Math.max(severity01, saturation01) * 0.18)
  }

  if (visualState === TRACTION_VISUAL_STATES.SATURATED) {
    return Math.max(0.35, severity01, saturation01)
  }

  return Math.max(0.45, severity01, slipRatio01, saturation01)
}

function calculateVisualPulse(dt, intensity01) {
  const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0

  return Math.min(0.18, safeDt * 4) * intensity01
}

function updateVisualTelemetry(visualTelemetry, wheelEffect) {
  if (!wheelEffect.isActive) return

  visualTelemetry.activeVisualSlipEffectCount += 1
  visualTelemetry.maxSlipFeedbackIntensity = Math.max(
    visualTelemetry.maxSlipFeedbackIntensity,
    wheelEffect.intensity01
  )

  if (wheelEffect.visualState === TRACTION_VISUAL_STATES.DRIVE_SPIN) {
    visualTelemetry.driveSpinVisualCount += 1
  } else if (
    wheelEffect.visualState === TRACTION_VISUAL_STATES.BRAKE_LOCK_TENDENCY
  ) {
    visualTelemetry.brakeLockVisualCount += 1
  } else if (wheelEffect.visualState === TRACTION_VISUAL_STATES.SATURATED) {
    visualTelemetry.saturatedVisualCount += 1
  }
}

function resetVisualTelemetry(visualTelemetry) {
  visualTelemetry.activeVisualSlipEffectCount = 0
  visualTelemetry.driveSpinVisualCount = 0
  visualTelemetry.brakeLockVisualCount = 0
  visualTelemetry.saturatedVisualCount = 0
  visualTelemetry.maxSlipFeedbackIntensity = 0
}

function hasFinitePosition(position) {
  return (
    position &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    Number.isFinite(position.z)
  )
}

function sanitizeNumber(value) {
  return Number.isFinite(value) ? value : 0
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0

  return Math.min(Math.max(value, 0), 1)
}
