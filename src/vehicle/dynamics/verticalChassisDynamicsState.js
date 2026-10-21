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
//   - Planar-force coupling v1 adds prior-step pitch/roll moments.
//   - Terrain heave forcing (gated by the same coupling flag) adds the
//     suspension spring force deviation from the authored static ride height,
//     so body heave responds to terrain instead of staying inert.
//   - The heave forcing uses the spring force only. The suspension damper
//     term is a one-step finite difference of compression that spikes at
//     contact transitions, and body damping is already applied through the
//     -Chh * heaveRate term of the same ODE row.

const VERTICAL_DYNAMICS_EPSILON = 1e-6

// Contact resolution noise floor for the terrain heave forcing. The heightfield
// contact query resolves the suspension ray with a finite tolerance
// (INTERSECTION_TOLERANCE_METERS = 1e-5 m), so two interchangeable flat
// surfaces can report slightly different suspension compressions. Deviations
// below this floor contribute no forcing, which keeps the flat contact adapter
// and the flat heightfield contact query interchangeable.
const HEAVE_FORCING_COMPRESSION_NOISE_FLOOR_METERS = 1e-4

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

// Soft-threshold the compression deviation so contact resolution noise does
// not leak into the heave forcing.
function applyCompressionNoiseFloor(deviationMeters) {
  if (!Number.isFinite(deviationMeters)) return 0
  const magnitude = Math.abs(deviationMeters)
  if (magnitude <= HEAVE_FORCING_COMPRESSION_NOISE_FLOOR_METERS) return 0
  return Math.sign(deviationMeters) *
    (magnitude - HEAVE_FORCING_COMPRESSION_NOISE_FLOOR_METERS)
}

// The compression a wheel carries when it sits at its authored rest length on
// flat ground. The authored suspension mount height and the effective rolling
// radius fix that value, so referencing it keeps the terrain heave forcing
// free of a standing offset when tire pressure moves the rolling radius.
function resolveStaticCompressionReferenceMeters(wheelState, spec = {}) {
  const suspensionTravelMeters = sanitizePositiveNumber(
    spec.suspensionTravelMeters,
    0.22
  )
  const nominalStaticCompressionMeters =
    suspensionTravelMeters *
    clamp(sanitizeNumber(spec.suspensionTargetStaticCompressionRatio01, 0.4), 0.01, 1)

  const restLengthMeters = sanitizePositiveNumber(
    wheelState.suspensionRestLengthMeters,
    sanitizePositiveNumber(spec.suspensionRestLengthMeters, 0.35)
  )
  const suspensionMountHeightMeters = wheelState.suspensionMountLocalPosition?.y
  const effectiveRollingRadiusMeters = sanitizePositiveNumber(
    wheelState.effectiveTireRollingRadiusMeters,
    sanitizePositiveNumber(
      wheelState.radius,
      sanitizePositiveNumber(spec.baseTireRollingRadiusMeters, 0.48)
    )
  )

  if (
    !Number.isFinite(suspensionMountHeightMeters) ||
    !Number.isFinite(restLengthMeters) ||
    !Number.isFinite(effectiveRollingRadiusMeters)
  ) {
    return nominalStaticCompressionMeters
  }

  const geometricStaticCompressionMeters =
    restLengthMeters - (suspensionMountHeightMeters - effectiveRollingRadiusMeters)

  return clamp(geometricStaticCompressionMeters, 0, suspensionTravelMeters)
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
    planarForceCouplingActive: false,
    planarForcePitchMomentNewtonMeters: 0,
    planarForceRollMomentNewtonMeters: 0,
    heaveForceCouplingActive: false,
    heaveForcingForceNewtons: 0,
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
  state.planarForceCouplingActive = false
  state.planarForcePitchMomentNewtonMeters = 0
  state.planarForceRollMomentNewtonMeters = 0
  state.heaveForceCouplingActive = false
  state.heaveForcingForceNewtons = 0
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

  // The body cannot sink past suspension droop or float past bottom-out, so
  // the heave displacement is bounded by the suspension travel measured from
  // the static ride height.
  const suspensionTravelMeters = sanitizePositiveNumber(
    spec.suspensionTravelMeters,
    0.22
  )
  const nominalStaticCompressionMeters =
    suspensionTravelMeters *
    clamp(sanitizeNumber(spec.suspensionTargetStaticCompressionRatio01, 0.4), 0.01, 1)

  return {
    sprungMassKg,
    pitchInertiaKgMeterSquared,
    rollInertiaKgMeterSquared,
    centerOfMassHeightMeters,
    maximumHeaveDroopMeters: nominalStaticCompressionMeters,
    maximumHeaveCompressionMeters: Math.max(
      suspensionTravelMeters - nominalStaticCompressionMeters,
      0
    ),
  }
}

export function updateVerticalChassisDynamics(
  state,
  wheelStates,
  spec = {},
  dtSeconds = 0,
  planarMotion = null
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

  const groundedWheelCount = safeWheelStates.filter(
    (wheelState) => wheelState.isGrounded === true
  ).length
  const terrainCouplingEnabled =
    spec.verticalDynamicsPlanarForceCouplingEnabled === true
  const planarForceCouplingActive =
    terrainCouplingEnabled && groundedWheelCount > 0
  const localForwardAccelerationMetersPerSecondSquared = sanitizeNumber(
    planarMotion?.planarAccelerationLocalForwardMetersPerSecondSquared
  )
  const localLateralAccelerationMetersPerSecondSquared = sanitizeNumber(
    planarMotion?.planarAccelerationLocalLateralMetersPerSecondSquared
  )
  state.planarForceCouplingActive = planarForceCouplingActive
  state.planarForcePitchMomentNewtonMeters = planarForceCouplingActive
    ? geometry.sprungMassKg *
      localForwardAccelerationMetersPerSecondSquared *
      geometry.centerOfMassHeightMeters
    : 0
  state.planarForceRollMomentNewtonMeters = planarForceCouplingActive
    ? geometry.sprungMassKg *
      localLateralAccelerationMetersPerSecondSquared *
      geometry.centerOfMassHeightMeters
    : 0
  // Terrain heave forcing rides on the same coupling gate. Both terms answer
  // the same question: does the vertical dynamics state react to the
  // environment the vehicle is driving through?
  state.heaveForceCouplingActive = planarForceCouplingActive

  // Assemble symmetric stiffness (K) and damping (C) sums over grounded wheels.
  let Khh = 0
  let Khp = 0
  let Khr = 0
  let Kpp = 0
  let Krr = 0
  let Kpr = 0
  const cornerData = []
  let heaveForcingForceNewtons = 0
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

    // Terrain heave forcing: the spring force this corner carries beyond the
    // authored static ride height. The compression is produced by the existing
    // raycast suspension path; nothing here re-derives the contact state.
    const staticCompressionMeters = resolveStaticCompressionReferenceMeters(
      wheelState,
      spec
    )
    const terrainCompressionDeviationMeters =
      applyCompressionNoiseFloor(
        sanitizeNumber(wheelState.suspensionCompressionMeters) -
          staticCompressionMeters
      )
    heaveForcingForceNewtons +=
      springRateNewtonsPerMeter * terrainCompressionDeviationMeters

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
  // The terrain forcing term is the vertical force the suspension applies
  // beyond the static support, which is what drives body heave over terrain.
  state.heaveForcingForceNewtons = planarForceCouplingActive
    ? heaveForcingForceNewtons
    : 0
  const forceHeave =
    -Khh * heave - Khp * pitch - Khr * roll -
    Chh * heaveRate - Chp * pitchRate - Chr * rollRate +
    state.heaveForcingForceNewtons
  const momentPitch =
    -Khp * heave - Kpp * pitch - Kpr * roll -
    Chp * heaveRate - Cpp * pitchRate - Cpr * rollRate +
    state.planarForcePitchMomentNewtonMeters
  const momentRoll =
    -Khr * heave - Kpr * pitch - Krr * roll -
    Chr * heaveRate - Cpr * pitchRate - Crr * rollRate +
    state.planarForceRollMomentNewtonMeters

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
    // Without ground support the suspension cannot act on the body: the
    // stiffness and damping sums are empty, so the heave row has no restoring
    // force and no damping and would drift with a stale velocity. This model
    // has no ballistic-flight or landing-impulse support, so an unsupported
    // heave holds its last value instead. The hold only applies while the
    // terrain coupling is active; with the coupling off the heave stays inert
    // exactly as before.
    state.heaveVelocityMetersPerSecond =
      terrainCouplingEnabled && groundedWheelCount === 0
        ? 0
        : nextHeaveRate
    state.pitchRateRadiansPerSecond = nextPitchRate
    state.rollRateRadiansPerSecond = nextRollRate
    const unconstrainedHeaveMeters = heave + nextHeaveRate * dt
    const clampedHeaveMeters = clamp(
      unconstrainedHeaveMeters,
      -geometry.maximumHeaveDroopMeters,
      geometry.maximumHeaveCompressionMeters
    )
    state.heaveMeters = clampedHeaveMeters
    state.pitchRadians = pitch + nextPitchRate * dt
    state.rollRadians = roll + nextRollRate * dt
    if (clampedHeaveMeters !== unconstrainedHeaveMeters) {
      // The body hit a suspension travel bound. Remove only the velocity
      // component that would push it further past the bound, so the body does
      // not stick to the limit.
      if (
        clampedHeaveMeters >= geometry.maximumHeaveCompressionMeters &&
        state.heaveVelocityMetersPerSecond > 0
      ) {
        state.heaveVelocityMetersPerSecond = 0
      }
      if (
        clampedHeaveMeters <= -geometry.maximumHeaveDroopMeters &&
        state.heaveVelocityMetersPerSecond < 0
      ) {
        state.heaveVelocityMetersPerSecond = 0
      }
    }
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
