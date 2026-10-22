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
//   - Terrain roll and pitch forcing (same gate) apply that same per-corner
//     terrain force at the corner's moment arm, so the body rolls and pitches
//     over uneven terrain instead of staying inert in those two axes.
//   - The heave forcing uses the spring force only. The suspension damper
//     term is a one-step finite difference of compression that spikes at
//     contact transitions, and body damping is already applied through the
//     -Chh * heaveRate term of the same ODE row.
//   - A coupled axle (the axle coupling state's 'rigidAxle' mode) is ONE
//     spring at the axle centre, not two springs at the wheel offsets. Its
//     corners therefore contribute no roll stiffness and no roll moment: a
//     solid axle cannot take lateral load transfer across its own tires, so
//     the whole transfer has to be taken by the other axle.

import {
  AXLE_COUPLING_MODES,
  resolveAxleCouplingMode,
} from './axleCouplingState.js'
import { resolveChassisGeometry } from './resolveChassisGeometry.js'

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

// The lateral offset of each axle's centre: the mean of that axle's wheel
// lateral offsets.
//
// EVERY wheel of the axle counts, grounded or not. A coupled axle's spring
// acts at the axle's geometric centre, and that centre does not move
// because one of its corners left the ground. Deriving the centre from the
// grounded corners only would make it jump to the surviving corner the
// moment a wheel went airborne, and the axle's roll arm with it.
function resolveAxleCentreLateralOffsets(wheelStates) {
  let frontSumMeters = 0
  let frontWheelCount = 0
  let rearSumMeters = 0
  let rearWheelCount = 0

  for (const wheelState of wheelStates) {
    const lateralMeters = sanitizeNumber(wheelState?.localPosition?.x)
    if (wheelState?.axle === 'front') {
      frontSumMeters += lateralMeters
      frontWheelCount += 1
    } else if (wheelState?.axle === 'rear') {
      rearSumMeters += lateralMeters
      rearWheelCount += 1
    }
  }

  return {
    front: frontWheelCount > 0 ? frontSumMeters / frontWheelCount : 0,
    rear: rearWheelCount > 0 ? rearSumMeters / rearWheelCount : 0,
  }
}

// The compression a wheel carries when it sits at its authored rest length on
// flat ground. The authored suspension mount height and the effective rolling
// radius fix that value, so referencing it keeps the terrain heave forcing
// free of a standing offset when tire pressure moves the rolling radius.
//
// The chassis terrain support baseline offset raises or lowers the body, and
// with it the suspension mount, relative to the authored geometry. The
// reference has to move with it. Leaving the offset out makes the ride-height
// offset read as a standing terrain compression: the heave forcing integrates
// it into a constant body heave, and that heave then biases every corner's
// load by springRate * offset. The resulting static normal-force error is
// totalSpringRate * offset, so a lowered car ends up carrying only a fraction
// of its weight.
function resolveStaticCompressionReferenceMeters(wheelState, spec = {}) {
  const suspensionTravelMeters = sanitizePositiveNumber(
    spec.suspensionTravelMeters,
    0.22
  )
  const nominalStaticCompressionMeters =
    suspensionTravelMeters *
    clamp(sanitizeNumber(spec.suspensionTargetStaticCompressionRatio01, 0.4), 0.01, 1)

  // A positive offset raises the body, which shortens the geometric
  // compression the wheel carries at rest.
  const chassisSupportBaselineOffsetMeters = sanitizeNumber(
    spec.chassisTerrainSupportBaselineOffsetMeters,
    0
  )

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
    return clamp(
      nominalStaticCompressionMeters - chassisSupportBaselineOffsetMeters,
      0,
      suspensionTravelMeters
    )
  }

  const geometricStaticCompressionMeters =
    restLengthMeters -
    (suspensionMountHeightMeters - effectiveRollingRadiusMeters) -
    chassisSupportBaselineOffsetMeters

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
    terrainRollMomentNewtonMeters: 0,
    terrainPitchMomentNewtonMeters: 0,
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
  state.terrainRollMomentNewtonMeters = 0
  state.terrainPitchMomentNewtonMeters = 0
  state.integratedWheelCount = 0
  state.isFinite = true
  return state
}

function deriveVerticalDynamicsGeometry(wheelStates, spec) {
  const safeWheelStates = Array.isArray(wheelStates) ? wheelStates : []
  const massKg = sanitizePositiveNumber(spec.massKg, 1400)
  // The spec owns the chassis geometry. The rendered mesh is a fixed
  // hatchback shape, so reading the geometry from the wheel layout made the
  // vertical dynamics disagree with the load transfer and the chassis mass
  // properties for every non-stock chassis.
  const chassisGeometry = resolveChassisGeometry(safeWheelStates, spec)
  const frontTrackWidthMeters = chassisGeometry.frontTrackWidthMeters
  const rearTrackWidthMeters = chassisGeometry.rearTrackWidthMeters
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

  // Pitch inertia: two-point mass model about the CG using the axle
  // stations of the resolved chassis geometry. The axle stations come from the
  // spec wheelbase, not from the rendered mesh, so the CG split matches the
  // load-transfer and mass-property geometry.
  const meanFrontZ = chassisGeometry.frontAxleCenterZMeters
  const meanRearZ = chassisGeometry.rearAxleCenterZMeters
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
  const verticalForcingEnabled =
    spec.verticalDynamicsForcingEnabled === true
  const planarForceCouplingActive =
    verticalForcingEnabled && groundedWheelCount > 0
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

  // A coupled axle carries ONE shared spring at its centre. The axle centre
  // is read from the axle coupling mode in the spec, the same way the axle
  // constraint solve reads it.
  const axleCentreLateralOffsetMeters = resolveAxleCentreLateralOffsets(
    safeWheelStates
  )
  const coupledAxles = {
    front:
      resolveAxleCouplingMode(spec, 'front') === AXLE_COUPLING_MODES.RIGID_AXLE,
    rear:
      resolveAxleCouplingMode(spec, 'rear') === AXLE_COUPLING_MODES.RIGID_AXLE,
  }

  // Assemble symmetric stiffness (K) and damping (C) sums over grounded wheels.
  let Khh = 0
  let Khp = 0
  let Khr = 0
  let Kpp = 0
  let Krr = 0
  let Kpr = 0
  const cornerData = []
  let heaveForcingForceNewtons = 0
  let terrainRollMomentNewtonMeters = 0
  let terrainPitchMomentNewtonMeters = 0
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
    const axle = wheelState.axle ?? null
    const isCoupledAxleCorner =
      axle !== null && coupledAxles[axle] === true
    // A coupled axle's spring and damper act at the axle centre, so the
    // corner's ROLL ARM is the axle centre's lateral offset instead of
    // the corner's own offset. Every lateral term of the stiffness and
    // damping assembly has to use the same arm: the matrix is the Hessian
    // of one potential, so a roll arm that appears in the roll stiffness
    // but not in the heave-roll and pitch-roll cross terms would make the
    // assembly inconsistent rather than merely different.
    const rollArmMeters = isCoupledAxleCorner
      ? axleCentreLateralOffsetMeters[axle]
      : xMeters
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
    // The terrain force this corner applies to the body beyond the
    // authored static ride height. It is the same per-corner term the heave
    // forcing uses, and it also acts at the corner's moment arm about the
    // roll and pitch axes.
    const terrainForcingForceNewtons =
      springRateNewtonsPerMeter * terrainCompressionDeviationMeters
    heaveForcingForceNewtons += terrainForcingForceNewtons

    // The moment rows use the generalized force convention
    // momentRoll = sum(x_i * F_i) and momentPitch = sum(z_i * F_i), where
    // F_i is the upward force the terrain applies to the body through that
    // corner. That matches the stiffness and damping terms of the same rows
    // (for example -Krr * roll = sum(x_i * (-k_i * roll * x_i))).
    // +X is the car's left side and +Z is forward, so a terrain rise under
    // the left corners lifts the left side of the body, and a terrain rise
    // under the front corners lifts the nose.
    terrainRollMomentNewtonMeters += xMeters * terrainForcingForceNewtons
    terrainPitchMomentNewtonMeters += zMeters * terrainForcingForceNewtons

    Khh += springRateNewtonsPerMeter
    Khp += springRateNewtonsPerMeter * zMeters
    Khr += springRateNewtonsPerMeter * rollArmMeters
    Kpp += springRateNewtonsPerMeter * zMeters * zMeters
    Krr += springRateNewtonsPerMeter * rollArmMeters * rollArmMeters
    Kpr += springRateNewtonsPerMeter * rollArmMeters * zMeters

    cornerData.push({
      wheelState,
      xMeters,
      zMeters,
      rollArmMeters,
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
    Chr += c * corner.rollArmMeters
    Cpp += c * corner.zMeters * corner.zMeters
    Crr += c * corner.rollArmMeters * corner.rollArmMeters
    Cpr += c * corner.rollArmMeters * corner.zMeters
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
  state.terrainRollMomentNewtonMeters = planarForceCouplingActive
    ? terrainRollMomentNewtonMeters
    : 0
  state.terrainPitchMomentNewtonMeters = planarForceCouplingActive
    ? terrainPitchMomentNewtonMeters
    : 0
  const forceHeave =
    -Khh * heave - Khp * pitch - Khr * roll -
    Chh * heaveRate - Chp * pitchRate - Chr * rollRate +
    state.heaveForcingForceNewtons
  const momentPitch =
    -Khp * heave - Kpp * pitch - Kpr * roll -
    Chp * heaveRate - Cpp * pitchRate - Cpr * rollRate +
    state.planarForcePitchMomentNewtonMeters +
    state.terrainPitchMomentNewtonMeters
  const momentRoll =
    -Khr * heave - Kpr * pitch - Krr * roll -
    Chr * heaveRate - Cpr * pitchRate - Crr * rollRate +
    state.planarForceRollMomentNewtonMeters +
    state.terrainRollMomentNewtonMeters

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
      verticalForcingEnabled && groundedWheelCount === 0
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
  //
  // The two terms are complementary, not a duplicate of the same physics:
  //   - `baseNormalForceNewtons` is the raycast suspension support. It sees
  //     the terrain and the unsprung wheel position, but not the solved body
  //     attitude: the heave/pitch/roll state is never applied to the physics
  //     transform, only to the visual chassis root.
  //   - the deviation below is the sprung-body reaction to the same body
  //     displacement: the part of the suspension force that the body itself
  //     absorbs while it heaves, pitches, and rolls.
  // The sum therefore reproduces the classic steady-state load transfer
  // m * a * h_cg / track (lateral) and m * a * h_cg / wheelbase
  // (longitudinal); see test/verticalDynamicsLoadTransferTargets.test.js.
  const finalHeave = state.heaveMeters
  const finalPitch = state.pitchRadians
  const finalRoll = state.rollRadians
  const finalHeaveRate = state.heaveVelocityMetersPerSecond
  const finalPitchRate = state.pitchRateRadiansPerSecond
  const finalRollRate = state.rollRateRadiansPerSecond

  for (const corner of cornerData) {
    // The corner's vertical displacement of the BODY. A coupled axle's
    // corner moves with the axle centre, so its roll arm is the axle
    // centre: both corners of a coupled axle see the SAME displacement
    // and therefore the SAME load deviation. That is the physically
    // correct signature of a central leaf on a rigid beam.
    const uMeters =
      finalHeave +
      finalPitch * corner.zMeters +
      finalRoll * corner.rollArmMeters
    const uRateMetersPerSecond =
      finalHeaveRate +
      finalPitchRate * corner.zMeters +
      finalRollRate * corner.rollArmMeters
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
