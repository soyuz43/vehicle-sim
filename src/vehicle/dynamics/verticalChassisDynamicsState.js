// src/vehicle/dynamics/verticalChassisDynamicsState.js

// Real 3-DOF sprung-mass vertical dynamics: heave, pitch, and roll on the four
// suspension corners, integrated with semi-implicit (symplectic) Euler for
// spring-damper stiffness stability at the fixed 1/60 s step.
//
// This is a genuine rigid-body vertical dynamics seam. It replaces:
//   - quasi-static load transfer (updateLoadTransferState): dynamic load
//     transfer now emerges from body pitch under longitudinal acceleration and
//     body roll under lateral acceleration, instead of being read from the
//     prior-step planar acceleration.
//   - the visual-only chassis attitude (chassisAttitudeState): heave/pitch/roll
//     are now solved ODE state, not a smoothed estimate of wheel offsets.
//
// Honest limitations (documented seams, not fake realism):
//   - Linear suspension: no nonlinear bump stops, anti-roll bars, or linkage
//     kinematics.
//   - Sprung mass only: unsprung mass and tire radial compliance are omitted
//     (verticalDynamicsSprungMassFraction01 defaults to 1).
//   - No roll-center geometry: pitch/roll rotate about the CG at com height.
//   - Couples to terrain only through the existing raycast suspension
//     compression already produced by updateSuspensionNormalForceState.

const VERTICAL_DYNAMICS_EPSILON = 1e-6

function sanitizePositiveNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function sanitizeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
}

export function createVerticalChassisDynamicsState(spec = {}) {
  return {
    available: spec.verticalDynamicsEnabled === true,
    heaveMeters: 0,
    heaveVelocityMetersPerSecond: 0,
    heaveAccelerationMetersPerSecondSquared: 0,
    pitchRadians: 0,
    pitchRateRadiansPerSecond: 0,
    pitchAccelerationRadiansPerSecondSquared: 0,
    rollRadians: 0,
    rollRateRadiansPerSecond: 0,
    rollAccelerationRadiansPerSecondSquared: 0,
    sprungMassKg: 0,
    pitchInertiaKgMeterSquared: 0,
    rollInertiaKgMeterSquared: 0,
    integratedWheelCount: 0,
    isFinite: true,
  }
}

export function resetVerticalChassisDynamicsState(state, spec = {}) {
  if (!state) return state
  state.available = spec.verticalDynamicsEnabled === true
  state.heaveMeters = 0
  state.heaveVelocityMetersPerSecond = 0
  state.heaveAccelerationMetersPerSecondSquared = 0
  state.pitchRadians = 0
  state.pitchRateRadiansPerSecond = 0
  state.pitchAccelerationRadiansPerSecondSquared = 0
  state.rollRadians = 0
  state.rollRateRadiansPerSecond = 0
  state.rollAccelerationRadiansPerSecondSquared = 0
  state.sprungMassKg = 0
  state.pitchInertiaKgMeterSquared = 0
  state.rollInertiaKgMeterSquared = 0
  state.integratedWheelCount = 0
  state.isFinite = true
  return state
}

function deriveVerticalDynamicsGeometry(wheelStates, spec) {
  const safeWheelStates = Array.isArray(wheelStates) ? wheelStates : []
  const massKg = sanitizePositiveNumber(spec.massKg, 1400)
  const wheelbaseMeters = sanitizePositiveNumber(spec.wheelbaseMeters, 2.9)
  const frontTrackWidthMeters = sanitizePositiveNumber(
    spec.frontTrackWidthMeters,
    spec.rearTrackWidthMeters || 2.5
  )
  const rearTrackWidthMeters = sanitizePositiveNumber(
    spec.rearTrackWidthMeters,
    spec.frontTrackWidthMeters || 2.5
  )
  const trackWidthMeters = (frontTrackWidthMeters + rearTrackWidthMeters) / 2
  const centerOfMassHeightMeters = sanitizePositiveNumber(
    spec.centerOfMassHeightMeters,
    0.55
  )
  const sprungMassFraction01 = clamp(
    sanitizeNumber(spec.verticalDynamicsSprungMassFraction01, 1),
    0.01,
    1
  )
  const sprungMassKg = massKg * sprungMassFraction01

  // Pitch inertia: two-point mass model about the CG using actual front/rear
  // wheel longitudinal offsets when available, else the wheelbase split.
  let frontZ = 0
  let rearZ = 0
  let frontCount = 0
  let rearCount = 0
  for (const wheelState of safeWheelStates) {
    const z = sanitizeNumber(wheelState?.localPosition?.z)
    if (wheelState?.axle === 'front') {
      frontZ += z
      frontCount += 1
    } else if (wheelState?.axle === 'rear') {
      rearZ += z
      rearCount += 1
    }
  }
  const meanFrontZ = frontCount > 0 ? frontZ / frontCount : wheelbaseMeters / 2
  const meanRearZ = rearCount > 0 ? rearZ / rearCount : -wheelbaseMeters / 2
  const distanceCgToFrontAxleMeters = Math.max(
    meanFrontZ,
    VERTICAL_DYNAMICS_EPSILON
  )
  const distanceCgToRearAxleMeters = Math.max(
    -meanRearZ,
    VERTICAL_DYNAMICS_EPSILON
  )
  const frontMassFraction01 =
    distanceCgToRearAxleMeters /
    (distanceCgToFrontAxleMeters + distanceCgToRearAxleMeters)
  const rearMassFraction01 = 1 - frontMassFraction01

  let pitchInertiaKgMeterSquared = sanitizePositiveNumber(
    spec.verticalDynamicsPitchInertiaKgMeterSquared,
    0
  )
  if (pitchInertiaKgMeterSquared <= 0) {
    pitchInertiaKgMeterSquared =
      sprungMassKg *
      (frontMassFraction01 * distanceCgToFrontAxleMeters ** 2 +
        rearMassFraction01 * distanceCgToRearAxleMeters ** 2)
  }

  let rollInertiaKgMeterSquared = sanitizePositiveNumber(
    spec.verticalDynamicsRollInertiaKgMeterSquared,
    0
  )
  if (rollInertiaKgMeterSquared <= 0) {
    // Beam about the longitudinal CG axis plus the parallel-axis term for the
    // center-of-mass height.
    rollInertiaKgMeterSquared =
      sprungMassKg * (trackWidthMeters ** 2 / 12) +
      sprungMassKg * centerOfMassHeightMeters ** 2
  }

  return {
    sprungMassKg,
    pitchInertiaKgMeterSquared,
    rollInertiaKgMeterSquared,
  }
}

export function updateVerticalChassisDynamics(
  state,
  wheelStates,
  spec = {},
  dtSeconds = 0
) {
  if (!state) return state
  if (spec.verticalDynamicsEnabled !== true) {
    state.available = false
    return state
  }

  const safeWheelStates = Array.isArray(wheelStates) ? wheelStates : []
  const geometry = deriveVerticalDynamicsGeometry(safeWheelStates, spec)
  const minimumNormalForceNewtons = sanitizeNumber(
    spec.minimumNormalForceNewtons,
    0
  )
  state.sprungMassKg = geometry.sprungMassKg
  state.pitchInertiaKgMeterSquared = geometry.pitchInertiaKgMeterSquared
  state.rollInertiaKgMeterSquared = geometry.rollInertiaKgMeterSquared

  // Assemble symmetric stiffness (K) and damping (C) sums over grounded wheels.
  let Khh = 0
  let Khp = 0
  let Khr = 0
  let Kpp = 0
  let Krr = 0
  let Kpr = 0
  const cornerData = []
  for (const wheelState of safeWheelStates) {
    if (!wheelState.isGrounded) {
      // An airborne wheel cannot push the body: zero its normal force and skip.
      wheelState.verticalDynamicsLoadDeviationNewtons = 0
      wheelState.normalForceNewtons = 0
      wheelState.tractionLimitNewtons = 0
      continue
    }
    const xMeters = sanitizeNumber(wheelState.localPosition?.x)
    const zMeters = sanitizeNumber(wheelState.localPosition?.z)
    const springRateNewtonsPerMeter = sanitizePositiveNumber(
      wheelState.suspensionSpringRateNewtonsPerMeter,
      sanitizePositiveNumber(spec.suspensionSpringRateNewtonsPerMeter, 1)
    )
    const compressionDamping = sanitizePositiveNumber(
      wheelState.suspensionCompressionDampingNewtonsPerMeterPerSecond,
      0
    )
    const reboundDamping = sanitizePositiveNumber(
      wheelState.suspensionReboundDampingNewtonsPerMeterPerSecond,
      0
    )
    const dampingRateNewtonsPerMeterPerSecond =
      (compressionDamping + reboundDamping) / 2
    const baseNormalForceNewtons = sanitizeNumber(
      wheelState.baseNormalForceNewtons,
      wheelState.normalForceNewtons
    )

    Khh += springRateNewtonsPerMeter
    Khp += springRateNewtonsPerMeter * zMeters
    Khr += springRateNewtonsPerMeter * xMeters
    Kpp += springRateNewtonsPerMeter * zMeters * zMeters
    Krr += springRateNewtonsPerMeter * xMeters * xMeters
    Kpr += springRateNewtonsPerMeter * xMeters * zMeters

    cornerData.push({
      wheelState,
      xMeters,
      zMeters,
      springRateNewtonsPerMeter,
      dampingRateNewtonsPerMeterPerSecond,
      baseNormalForceNewtons,
    })
  }

  let Chh = 0
  let Chp = 0
  let Chr = 0
  let Cpp = 0
  let Crr = 0
  let Cpr = 0
  for (const corner of cornerData) {
    const c = corner.dampingRateNewtonsPerMeterPerSecond
    Chh += c
    Chp += c * corner.zMeters
    Chr += c * corner.xMeters
    Cpp += c * corner.zMeters * corner.zMeters
    Crr += c * corner.xMeters * corner.xMeters
    Cpr += c * corner.xMeters * corner.zMeters
  }

  const heave = state.heaveMeters
  const pitch = state.pitchRadians
  const roll = state.rollRadians
  const heaveRate = state.heaveVelocityMetersPerSecond
  const pitchRate = state.pitchRateRadiansPerSecond
  const rollRate = state.rollRateRadiansPerSecond

  // Net deviation force/moment on the body (spring + damper). Gravity is
  // already balanced by the static base support, so it does not appear here.
  const forceHeave =
    -Khh * heave - Khp * pitch - Khr * roll -
    Chh * heaveRate - Chp * pitchRate - Chr * rollRate
  const momentPitch =
    -Khp * heave - Kpp * pitch - Kpr * roll -
    Chp * heaveRate - Cpp * pitchRate - Cpr * rollRate
  const momentRoll =
    -Khr * heave - Kpr * pitch - Krr * roll -
    Chr * heaveRate - Cpr * pitchRate - Crr * rollRate

  const heaveAccel =
    geometry.sprungMassKg > 0 ? forceHeave / geometry.sprungMassKg : 0
  const pitchAccel =
    geometry.pitchInertiaKgMeterSquared > 0
      ? momentPitch / geometry.pitchInertiaKgMeterSquared
      : 0
  const rollAccel =
    geometry.rollInertiaKgMeterSquared > 0
      ? momentRoll / geometry.rollInertiaKgMeterSquared
      : 0

  state.heaveAccelerationMetersPerSecondSquared = heaveAccel
  state.pitchAccelerationRadiansPerSecondSquared = pitchAccel
  state.rollAccelerationRadiansPerSecondSquared = rollAccel

  const dt = sanitizeNumber(dtSeconds, 0)
  if (dt > 0) {
    // Semi-implicit (symplectic) Euler: advance velocities, then positions.
    const nextHeaveRate = heaveRate + heaveAccel * dt
    const nextPitchRate = pitchRate + pitchAccel * dt
    const nextRollRate = rollRate + rollAccel * dt
    state.heaveVelocityMetersPerSecond = nextHeaveRate
    state.pitchRateRadiansPerSecond = nextPitchRate
    state.rollRateRadiansPerSecond = nextRollRate
    state.heaveMeters = heave + nextHeaveRate * dt
    state.pitchRadians = pitch + nextPitchRate * dt
    state.rollRadians = roll + nextRollRate * dt
  }

  // Apply the solved body attitude to each grounded corner to recover the
  // dynamic normal force (base support plus the spring/damper deviation).
  const finalHeave = state.heaveMeters
  const finalPitch = state.pitchRadians
  const finalRoll = state.rollRadians
  const finalHeaveRate = state.heaveVelocityMetersPerSecond
  const finalPitchRate = state.pitchRateRadiansPerSecond
  const finalRollRate = state.rollRateRadiansPerSecond

  for (const corner of cornerData) {
    const uMeters =
      finalHeave +
      finalPitch * corner.zMeters +
      finalRoll * corner.xMeters
    const uRateMetersPerSecond =
      finalHeaveRate +
      finalPitchRate * corner.zMeters +
      finalRollRate * corner.xMeters
    const loadDeviationNewtons =
      -corner.springRateNewtonsPerMeter * uMeters -
      corner.dampingRateNewtonsPerMeterPerSecond * uRateMetersPerSecond
    const normalForceNewtons = Math.max(
      corner.baseNormalForceNewtons + loadDeviationNewtons,
      minimumNormalForceNewtons
    )
    const wheelState = corner.wheelState
    wheelState.verticalDynamicsLoadDeviationNewtons = loadDeviationNewtons
    wheelState.normalForceNewtons = normalForceNewtons
    wheelState.tractionLimitNewtons =
      sanitizeNumber(wheelState.frictionCoefficient, 0) * normalForceNewtons
  }

  state.integratedWheelCount = cornerData.length
  state.isFinite =
    Number.isFinite(state.heaveMeters) &&
    Number.isFinite(state.pitchRadians) &&
    Number.isFinite(state.rollRadians)
  return state
}
