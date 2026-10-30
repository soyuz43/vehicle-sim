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
//   - Suspension rates remain linear away from configurable travel-stop
//     force zones; linkage kinematics are not resolved.
//   - Sprung mass only: unsprung mass and tire radial compliance are omitted
//     (verticalDynamicsSprungMassFraction01 defaults to 1).
//   - Roll-center geometry: the roll axis runs through the front and rear
//     roll centers, and the body rotates about it. A roll center shortens the
//     roll arm (the distance from the center of mass to the roll axis) and
//     takes the part of the lateral load transfer the links carry directly,
//     so less of that transfer is left for the springs to carry as body roll.
//     A vehicle with no roll center keeps the ground-level roll axis and the
//     full center-of-mass roll arm, which is the pre-roll-center behavior.
//     Pitch keeps its own axis: a longitudinal roll center (anti-dive and
//     anti-squat) is not modelled.
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
import {
  resolveAxleRollCenterHeightsMeters,
  resolveRollAxisHeightMeters,
} from './rollCenterGeometry.js'
import {
  computeProgressiveSuspensionStopForceNewtons,
  computeProgressiveSuspensionStopRateNewtonsPerMeter,
} from './suspensionStopForces.js'

const VERTICAL_DYNAMICS_EPSILON = 1e-6
const MAX_CHASSIS_ATTITUDE_RADIANS = (80 * Math.PI) / 180

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

function sanitizeNonNegativeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
}

function resolveBoundedAttitude(angleRadians, rateRadiansPerSecond) {
  const boundedAngleRadians = clamp(
    sanitizeNumber(angleRadians),
    -MAX_CHASSIS_ATTITUDE_RADIANS,
    MAX_CHASSIS_ATTITUDE_RADIANS
  )
  let boundedRateRadiansPerSecond = sanitizeNumber(rateRadiansPerSecond)

  if (
    boundedAngleRadians >= MAX_CHASSIS_ATTITUDE_RADIANS &&
    boundedRateRadiansPerSecond > 0
  ) {
    boundedRateRadiansPerSecond = 0
  } else if (
    boundedAngleRadians <= -MAX_CHASSIS_ATTITUDE_RADIANS &&
    boundedRateRadiansPerSecond < 0
  ) {
    boundedRateRadiansPerSecond = 0
  }

  return {
    angleRadians: boundedAngleRadians,
    rateRadiansPerSecond: boundedRateRadiansPerSecond,
  }
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

function createAxleLateralTransferAccumulator() {
  return {
    cornerCount: 0,
    minimumElasticDeviationNewtons: Number.POSITIVE_INFINITY,
    maximumElasticDeviationNewtons: Number.NEGATIVE_INFINITY,
    minimumDirectTransferNewtons: Number.POSITIVE_INFINITY,
    maximumDirectTransferNewtons: Number.NEGATIVE_INFINITY,
  }
}

function resolveWheelSpecArms(wheelState, chassisGeometry, target) {
  const axle = wheelState?.axle
  const side = wheelState?.side
  const trackWidthMeters = axle === 'front'
    ? chassisGeometry.frontTrackWidthMeters
    : axle === 'rear'
      ? chassisGeometry.rearTrackWidthMeters
      : 0

  target.xMeters = trackWidthMeters *
    (side === 'left' ? 0.5 : side === 'right' ? -0.5 : 0)
  target.zMeters = axle === 'front'
    ? chassisGeometry.frontAxleCenterZMeters
    : axle === 'rear'
      ? chassisGeometry.rearAxleCenterZMeters
      : 0
  return target
}

// The lateral offset of each axle's centre: the mean of that axle's wheel
// lateral offsets.
//
// EVERY wheel of the axle counts, grounded or not. A coupled axle's spring
// acts at the axle's geometric centre, and that centre does not move
// because one of its corners left the ground. Deriving the centre from the
// grounded corners only would make it jump to the surviving corner the
// moment a wheel went airborne, and the axle's roll arm with it.
function resolveAxleCentreLateralOffsets(wheelStates, chassisGeometry) {
  let frontSumMeters = 0
  let frontWheelCount = 0
  let rearSumMeters = 0
  let rearWheelCount = 0
  const wheelArms = { xMeters: 0, zMeters: 0 }

  for (const wheelState of wheelStates) {
    resolveWheelSpecArms(wheelState, chassisGeometry, wheelArms)
    const lateralMeters = wheelArms.xMeters
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
// Phase B.1: suspension travel and the static-compression target are
// consumed per axle. A wheel reads its own slot spec when the runtime spec
// declares one, and falls back to the flat legacy fields otherwise.
function resolveAxleSuspensionTravelSpec(axle, spec) {
  const nestedSpec = axle === 'front'
    ? spec.suspensionFront
    : axle === 'rear'
      ? spec.suspensionRear
      : undefined
  return nestedSpec ?? spec
}

// Reads the per-axle anti-roll bar stiffness (wheel rate, N/m of relative
// wheel-travel difference). A coupled (rigid) axle does not own a meaningful
// ARB, so callers skip it themselves; here any non-positive value (including
// the stock default of 0) yields a no-op bar.
function resolveAxleAntiRollBarStiffnessNewtonsPerMeter(axle, spec) {
  const axleSpec = resolveAxleSuspensionTravelSpec(axle, spec)
  return sanitizePositiveNumber(
    axleSpec?.antiRollBarStiffnessNewtonsPerMeter,
    0
  )
}

function resolveStaticCompressionReferenceMeters(wheelState, spec = {}) {
  const axleSpec = resolveAxleSuspensionTravelSpec(wheelState?.axle, spec)
  const suspensionTravelMeters = sanitizePositiveNumber(
    axleSpec.suspensionTravelMeters,
    0.22
  )
  const nominalStaticCompressionMeters =
    suspensionTravelMeters *
    clamp(sanitizeNumber(axleSpec.suspensionTargetStaticCompressionRatio01, 0.4), 0.01, 1)

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
    frontRollCenterHeightMeters: 0,
    rearRollCenterHeightMeters: 0,
    rollAxisHeightMeters: 0,
    rollArmMeters: 0,
    directLateralLoadTransferNewtons: 0,
    elasticLateralLoadTransferNewtons: 0,
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
  state.frontRollCenterHeightMeters = 0
  state.rearRollCenterHeightMeters = 0
  state.rollAxisHeightMeters = 0
  state.rollArmMeters = 0
  state.directLateralLoadTransferNewtons = 0
  state.elasticLateralLoadTransferNewtons = 0
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

  // Roll-center geometry. A coupled axle is a rigid beam whose lateral
  // force path runs through its leaf pack, so its roll-center height comes
  // from the spec. An independent axle uses the linkage geometry when the
  // vehicle declares a linkage, and has no roll center otherwise.
  const coupledAxles = {
    front:
      resolveAxleCouplingMode(spec, 'front') ===
      AXLE_COUPLING_MODES.RIGID_AXLE,
    rear:
      resolveAxleCouplingMode(spec, 'rear') ===
      AXLE_COUPLING_MODES.RIGID_AXLE,
  }
  const axleRollCenterHeightsMeters = resolveAxleRollCenterHeightsMeters(
    spec,
    coupledAxles
  )
  const rollAxisHeightMeters = resolveRollAxisHeightMeters(
    axleRollCenterHeightsMeters.front,
    axleRollCenterHeightsMeters.rear,
    chassisGeometry
  )
  // The roll arm is the distance from the center of mass to the roll axis.
  // Without a roll center the roll axis is the ground line and the roll arm
  // is the center-of-mass height, which is the pre-roll-center behavior.
  const rollArmMeters = Math.max(
    centerOfMassHeightMeters - rollAxisHeightMeters,
    0
  )

  let rollInertiaKgMeterSquared = sanitizePositiveNumber(
    spec.verticalDynamicsRollInertiaKgMeterSquared,
    0
  )
  if (rollInertiaKgMeterSquared <= 0) {
    // Beam about the longitudinal CG axis plus the parallel-axis term for the
    // roll axis: the body rotates about the roll axis, so the parallel-axis
    // term is the distance from the center of mass to that axis.
    rollInertiaKgMeterSquared =
      sprungMassKg * (trackWidthMeters ** 2 / 12) +
      sprungMassKg * rollArmMeters ** 2
  }

  // The body cannot sink past suspension droop or float past bottom-out, so
  // the heave displacement is bounded by the suspension travel measured from
  // the static ride height. Phase B.1: travel and the static-compression
  // target are consumed per axle, so each axle's own bound is derived from
  // its slot spec. The body has ONE heave degree of freedom, and the first
  // axle to run out of travel stops it, so the body-level bound is the more
  // restrictive (minimum) of the two axles' bounds.
  const deriveAxleHeaveBounds = (axle) => {
    const axleSpec = resolveAxleSuspensionTravelSpec(axle, spec)
    const axleTravelMeters = sanitizePositiveNumber(
      axleSpec.suspensionTravelMeters,
      0.22
    )
    const axleNominalStaticCompressionMeters =
      axleTravelMeters *
      clamp(sanitizeNumber(axleSpec.suspensionTargetStaticCompressionRatio01, 0.4), 0.01, 1)
    return {
      maximumHeaveDroopMeters: axleNominalStaticCompressionMeters,
      maximumHeaveCompressionMeters: Math.max(
        axleTravelMeters - axleNominalStaticCompressionMeters,
        0
      ),
    }
  }
  const frontHeaveBounds = deriveAxleHeaveBounds('front')
  const rearHeaveBounds = deriveAxleHeaveBounds('rear')
  const maximumHeaveDroopMeters = Math.min(
    frontHeaveBounds.maximumHeaveDroopMeters,
    rearHeaveBounds.maximumHeaveDroopMeters
  )
  const maximumHeaveCompressionMeters = Math.min(
    frontHeaveBounds.maximumHeaveCompressionMeters,
    rearHeaveBounds.maximumHeaveCompressionMeters
  )

  return {
    chassisGeometry,
    sprungMassKg,
    pitchInertiaKgMeterSquared,
    rollInertiaKgMeterSquared,
    centerOfMassHeightMeters,
    coupledAxles,
    frontMassFraction01,
    rearMassFraction01,
    axleRollCenterHeightsMeters,
    rollAxisHeightMeters,
    rollArmMeters,
    maximumHeaveDroopMeters,
    maximumHeaveCompressionMeters,
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
  state.frontRollCenterHeightMeters =
    geometry.axleRollCenterHeightsMeters.front
  state.rearRollCenterHeightMeters =
    geometry.axleRollCenterHeightsMeters.rear
  state.rollAxisHeightMeters = geometry.rollAxisHeightMeters
  state.rollArmMeters = geometry.rollArmMeters

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
  // The lateral inertia moment about the roll axis. The roll arm is the
  // distance from the center of mass to the roll axis, so a roll center
  // shortens the arm: less of the lateral load transfer is left for the
  // springs to carry, and the body rolls less.
  state.planarForceRollMomentNewtonMeters = planarForceCouplingActive
    ? geometry.sprungMassKg *
      localLateralAccelerationMetersPerSecondSquared *
      geometry.rollArmMeters
    : 0
  // Terrain heave forcing rides on the same coupling gate. Both terms answer
  // the same question: does the vertical dynamics state react to the
  // environment the vehicle is driving through?
  state.heaveForceCouplingActive = planarForceCouplingActive

  // A coupled axle carries ONE shared spring at its centre. The axle centre
  // is read from the axle coupling mode in the spec, the same way the axle
  // constraint solve reads it.
  const axleCentreLateralOffsetMeters = resolveAxleCentreLateralOffsets(
    safeWheelStates,
    geometry.chassisGeometry
  )
  const coupledAxles = geometry.coupledAxles

  // The direct (geometric) part of the lateral load transfer: the part the
  // links carry instead of the springs. It is the classic
  // m_axle * a_y * h_rc / track of one axle, and it lands on the tire loads
  // because it never passes through a suspension spring.
  const directLateralLoadTransferByAxleNewtons = { front: 0, rear: 0 }
  if (planarForceCouplingActive) {
    for (const axle of ['front', 'rear']) {
      const rollCenterHeightMeters =
        geometry.axleRollCenterHeightsMeters[axle]
      if (!(rollCenterHeightMeters > 0)) continue
      if (coupledAxles[axle] === true) continue

      const trackWidthMeters =
        axle === 'front'
          ? geometry.chassisGeometry.frontTrackWidthMeters
          : geometry.chassisGeometry.rearTrackWidthMeters
      if (!(trackWidthMeters > 0)) continue

      const axleSprungMassKg =
        geometry.sprungMassKg *
        (axle === 'front'
          ? geometry.frontMassFraction01
          : geometry.rearMassFraction01)

      directLateralLoadTransferByAxleNewtons[axle] =
        (axleSprungMassKg *
          localLateralAccelerationMetersPerSecondSquared *
          rollCenterHeightMeters) /
        trackWidthMeters
    }
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
    const corner = resolveWheelSpecArms(
      wheelState,
      geometry.chassisGeometry,
      { wheelState }
    )
    const xMeters = corner.xMeters
    const zMeters = corner.zMeters
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
    const maximumCompressionMeters = sanitizeNonNegativeNumber(
      wheelState.suspensionMaximumCompressionMeters
    )
    const maximumDroopMeters = sanitizeNonNegativeNumber(
      wheelState.suspensionMaximumDroopMeters
    )
    const bumpStopEngagementMeters = sanitizeNonNegativeNumber(
      wheelState.suspensionBumpStopEngagementMeters
    )
    const bumpStopMaximumForceNewtons = sanitizeNonNegativeNumber(
      wheelState.suspensionBumpStopMaximumForceNewtons
    )
    const reboundStopEngagementMeters = sanitizeNonNegativeNumber(
      wheelState.suspensionReboundStopEngagementMeters
    )
    const reboundStopMaximumForceNewtons = sanitizeNonNegativeNumber(
      wheelState.suspensionReboundStopMaximumForceNewtons
    )
    const currentCompressionMeters = sanitizeNonNegativeNumber(
      wheelState.suspensionCompressionMeters
    )
    const currentDroopMeters = sanitizeNonNegativeNumber(
      wheelState.suspensionDroopMeters
    )
    const bumpStopForceNewtons = computeProgressiveSuspensionStopForceNewtons(
      currentCompressionMeters,
      maximumCompressionMeters,
      bumpStopEngagementMeters,
      bumpStopMaximumForceNewtons
    )
    const reboundStopForceNewtons = computeProgressiveSuspensionStopForceNewtons(
      currentDroopMeters,
      maximumDroopMeters,
      reboundStopEngagementMeters,
      reboundStopMaximumForceNewtons
    )
    const staticBumpStopForceNewtons =
      computeProgressiveSuspensionStopForceNewtons(
        staticCompressionMeters,
        maximumCompressionMeters,
        bumpStopEngagementMeters,
        bumpStopMaximumForceNewtons
      )
    const stopForceDeviationNewtons =
      bumpStopForceNewtons -
      reboundStopForceNewtons -
      staticBumpStopForceNewtons
    const stopTangentRateNewtonsPerMeter =
      computeProgressiveSuspensionStopRateNewtonsPerMeter(
        currentCompressionMeters,
        maximumCompressionMeters,
        bumpStopEngagementMeters,
        bumpStopMaximumForceNewtons
      ) +
      computeProgressiveSuspensionStopRateNewtonsPerMeter(
        currentDroopMeters,
        maximumDroopMeters,
        reboundStopEngagementMeters,
        reboundStopMaximumForceNewtons
      )
    const effectiveSpringRateNewtonsPerMeter =
      springRateNewtonsPerMeter + stopTangentRateNewtonsPerMeter
    const terrainForcingForceNewtons =
      springRateNewtonsPerMeter * terrainCompressionDeviationMeters +
      stopForceDeviationNewtons
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

    Khh += effectiveSpringRateNewtonsPerMeter
    Khp += effectiveSpringRateNewtonsPerMeter * zMeters
    Khr += effectiveSpringRateNewtonsPerMeter * rollArmMeters
    Kpp += effectiveSpringRateNewtonsPerMeter * zMeters * zMeters
    Krr += effectiveSpringRateNewtonsPerMeter * rollArmMeters * rollArmMeters
    Kpr += effectiveSpringRateNewtonsPerMeter * rollArmMeters * zMeters

    // The direct transfer lands on the outside corner and leaves the
    // inside corner. A positive lateral acceleration points toward the
    // vehicle local left (+X), so the outside of that turn is the local right
    // (-X): the right corners gain and the left corners lose.
    //
    // Coupled axles receive no direct lateral transfer here. The rigid beam
    // routes lateral force through its own torsional stiffness and the leaf
    // springs, which this physics does not model. The coupled axle therefore
    // retains zero lateral transfer at the rear (pre-existing limitation,
    // unchanged by RC consumption). Real solid axles transfer load laterally;
    // this is a known simplification. The RC height on a coupled axle still
    // reduces the elastic roll arm and thus body roll.
    corner.directLoadTransferNewtons =
      axle !== null && !isCoupledAxleCorner
        ? -Math.sign(xMeters) * directLateralLoadTransferByAxleNewtons[axle]
        : 0
    corner.axle = axle
    corner.side = wheelState.side
    corner.arbLoadTransferNewtons = 0
    corner.rollArmMeters = rollArmMeters
    corner.springRateNewtonsPerMeter = effectiveSpringRateNewtonsPerMeter
    corner.dampingRateNewtonsPerMeterPerSecond =
      dampingRateNewtonsPerMeterPerSecond
    corner.baseNormalForceNewtons = baseNormalForceNewtons
    cornerData.push(corner)
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

  // Anti-roll bar (ARB) v1: couples the two wheels of one axle through a
  // torsional stiffness that opposes their relative suspension compression.
  // A one-sided deflection twists the bar, which pushes the more-compressed
  // wheel up and the less-compressed wheel down. The bar is a pure couple, so
  // it transfers load directly between the two tires (no net heave) and adds a
  // restoring roll moment that stiffens body roll.
  //
  // A coupled (rigid) axle already ties its wheels to one shared leaf, so an
  // ARB would be redundant and is skipped (the isCoupledAxleCorner guard),
  // exactly like the direct lateral load transfer above.
  //
  // Zero stiffness is a true no-op: F_arb = 0 and the roll-stiffness term is 0,
  // so the stock 5400-step trace stays byte-identical to the pre-ARB baseline.
  for (const axle of ['front', 'rear']) {
    if (coupledAxles[axle] === true) continue
    const stiffnessNewtonsPerMeter =
      resolveAxleAntiRollBarStiffnessNewtonsPerMeter(axle, spec)
    if (stiffnessNewtonsPerMeter <= 0) continue

    const leftCorner = cornerData.find(
      (corner) => corner.axle === axle && corner.side === 'left'
    )
    const rightCorner = cornerData.find(
      (corner) => corner.axle === axle && corner.side === 'right'
    )
    if (!leftCorner || !rightCorner) continue

    const compressionLeftMeters = sanitizeNumber(
      leftCorner.wheelState.suspensionCompressionMeters
    )
    const compressionRightMeters = sanitizeNumber(
      rightCorner.wheelState.suspensionCompressionMeters
    )
    const compressionDeltaMeters =
      compressionLeftMeters - compressionRightMeters
    const arbForceNewtons =
      -stiffnessNewtonsPerMeter * compressionDeltaMeters

    leftCorner.arbLoadTransferNewtons = arbForceNewtons
    rightCorner.arbLoadTransferNewtons = -arbForceNewtons

    // Equivalent roll stiffness: F_arb * track = -k * (deltaComp) * track, and
    // deltaComp ~ roll * track, so the roll-restoring term is -k * track^2 *
    // roll. Folded into Krr so the ODE integrates it consistently with the
    // springs (a pure couple, so it touches roll only, not heave/pitch).
    const trackWidthMeters =
      axle === 'front'
        ? geometry.chassisGeometry.frontTrackWidthMeters
        : geometry.chassisGeometry.rearTrackWidthMeters
    Krr += stiffnessNewtonsPerMeter * trackWidthMeters * trackWidthMeters
  }

  const heave = state.heaveMeters
  const boundedPitch = resolveBoundedAttitude(
    state.pitchRadians,
    state.pitchRateRadiansPerSecond
  )
  const boundedRoll = resolveBoundedAttitude(
    state.rollRadians,
    state.rollRateRadiansPerSecond
  )
  state.pitchRadians = boundedPitch.angleRadians
  state.pitchRateRadiansPerSecond = boundedPitch.rateRadiansPerSecond
  state.rollRadians = boundedRoll.angleRadians
  state.rollRateRadiansPerSecond = boundedRoll.rateRadiansPerSecond
  const pitch = boundedPitch.angleRadians
  const roll = boundedRoll.angleRadians
  const heaveRate = state.heaveVelocityMetersPerSecond
  const pitchRate = boundedPitch.rateRadiansPerSecond
  const rollRate = boundedRoll.rateRadiansPerSecond

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
    const nextPitchRate = sanitizeNumber(pitchRate + pitchAccel * dt)
    const nextRollRate = sanitizeNumber(rollRate + rollAccel * dt)
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
    const boundedNextPitch = resolveBoundedAttitude(
      pitch + nextPitchRate * dt,
      nextPitchRate
    )
    const boundedNextRoll = resolveBoundedAttitude(
      roll + nextRollRate * dt,
      nextRollRate
    )
    state.pitchRadians = boundedNextPitch.angleRadians
    state.pitchRateRadiansPerSecond = boundedNextPitch.rateRadiansPerSecond
    state.rollRadians = boundedNextRoll.angleRadians
    state.rollRateRadiansPerSecond = boundedNextRoll.rateRadiansPerSecond
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

  // Per-axle lateral transfer accounting. The transfer an axle takes is the
  // spread between its two corners: an independent axle gives its outside
  // corner more load and its inside corner less, while a coupled axle gives
  // both corners the same load and takes none.
  const axleLateralTransferState = {
    front: createAxleLateralTransferAccumulator(),
    rear: createAxleLateralTransferAccumulator(),
  }

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
      corner.baseNormalForceNewtons +
        loadDeviationNewtons +
        corner.directLoadTransferNewtons +
        corner.arbLoadTransferNewtons,
      minimumNormalForceNewtons
    )
    const wheelState = corner.wheelState
    wheelState.verticalDynamicsLoadDeviationNewtons = loadDeviationNewtons
    wheelState.verticalDynamicsDirectLoadTransferNewtons =
      corner.directLoadTransferNewtons
    wheelState.verticalDynamicsAntiRollBarLoadTransferNewtons =
      corner.arbLoadTransferNewtons
    wheelState.normalForceNewtons = normalForceNewtons
    wheelState.tractionLimitNewtons =
      sanitizeNumber(wheelState.frictionCoefficient, 0) * normalForceNewtons

    const accumulator =
      corner.axle !== null ? axleLateralTransferState[corner.axle] : null
    if (accumulator) {
      accumulator.cornerCount += 1
      accumulator.minimumElasticDeviationNewtons = Math.min(
        accumulator.minimumElasticDeviationNewtons,
        loadDeviationNewtons
      )
      accumulator.maximumElasticDeviationNewtons = Math.max(
        accumulator.maximumElasticDeviationNewtons,
        loadDeviationNewtons
      )
      accumulator.minimumDirectTransferNewtons = Math.min(
        accumulator.minimumDirectTransferNewtons,
        corner.directLoadTransferNewtons + corner.arbLoadTransferNewtons
      )
      accumulator.maximumDirectTransferNewtons = Math.max(
        accumulator.maximumDirectTransferNewtons,
        corner.directLoadTransferNewtons + corner.arbLoadTransferNewtons
      )
    }
  }

  let totalDirectLateralLoadTransferNewtons = 0
  let totalElasticLateralLoadTransferNewtons = 0
  for (const accumulator of Object.values(axleLateralTransferState)) {
    if (accumulator.cornerCount < 2) continue
    totalDirectLateralLoadTransferNewtons +=
      (accumulator.maximumDirectTransferNewtons -
        accumulator.minimumDirectTransferNewtons) /
      2
    totalElasticLateralLoadTransferNewtons +=
      (accumulator.maximumElasticDeviationNewtons -
        accumulator.minimumElasticDeviationNewtons) /
      2
  }
  state.directLateralLoadTransferNewtons = totalDirectLateralLoadTransferNewtons
  state.elasticLateralLoadTransferNewtons = totalElasticLateralLoadTransferNewtons

  state.integratedWheelCount = cornerData.length
  state.isFinite =
    Number.isFinite(state.heaveMeters) &&
    Number.isFinite(state.pitchRadians) &&
    Number.isFinite(state.rollRadians)
  return state
}
