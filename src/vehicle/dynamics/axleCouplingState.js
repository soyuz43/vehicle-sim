// src/vehicle/dynamics/axleCouplingState.js

// Axle coupling v1 (Session A1).
//
// An axle can be modelled either as two wheels that each resolve their own
// vertical position against the terrain ('independent', the default), or as a
// rigid beam that carries both of its wheels on one shared leaf spring
// ('rigidAxle').
//
// The model solved here:
//   - The axle has ONE suspension length (the leaf's deflection) shared by
//     both wheels, and ONE roll angle (the beam's tilt about the axle's
//     longitudinal axis).
//   - The beam pose is solved in closed form from the two wheels' own terrain
//     contacts. There is no iteration and no extra terrain query: each wheel
//     already owns a raycast result, and a vertical ray's contact point keeps
//     the mount's XZ, so the terrain sample under a wheel does not move when
//     the beam rolls.
//
// Three properties a reader must not mistake for bugs:
//   1. The shared compression is the LEAF's compression, not the individual
//      wheel-path compression. On a one-sided 80 mm bump the near wheel can
//      report +40 mm of compression while physically sitting 80 mm above the
//      flat reference. That is correct: the leaf feels 40 mm, and the wheel
//      still rests on its own terrain contact point.
//   2. The axle's total vertical load is preserved. The shared compression is
//      exactly the mean of the two independent compressions, so the axle's
//      spring load is unchanged and only its distribution moves.
//   3. A coupled axle contributes no terrain roll moment to the vertical
//      dynamics ODE. With equal compressions on both corners the
//      sum(x_i * F_i) terms cancel exactly, which is the physically correct
//      result for a central leaf on a rigid beam.
//
// Known seam, deliberately not fixed here:
//   The vertical dynamics ODE still assembles the body-attitude stiffness and
//   the per-corner load deviation as if every corner owned an independent
//   spring (Krr += k * x^2 per corner, plus a per-corner -k * roll * x load
//   deviation). A coupled axle with one shared leaf should use the axle
//   centre for those terms instead. Fixing that means changing the ODE's
//   stiffness and damping assembly, which is a larger blast radius than this
//   session allows, so it is deferred to a follow-up session. Until then a
//   coupled axle reports equal base normal forces on both corners while the
//   body-roll term still differentiates the reported normal forces.

export const AXLE_COUPLING_MODES = Object.freeze({
    INDEPENDENT: 'independent',
    RIGID_AXLE: 'rigidAxle',
})

const AXLE_LATERAL_SPAN_EPSILON_METERS = 0.000001

export function createAxleCouplingState() {
    return {
        axles: {},
    }
}

export function resetAxleCouplingState(state) {
    if (!state) return state
    state.axles = {}
    return state
}

// Resolves the coupling mode of one axle. Unknown values fall back to
// 'independent' so a bad spec can never change the physics silently.
export function resolveAxleCouplingMode(spec, axle) {
    if (axle === 'front') {
        return resolveCouplingModeValue(spec?.frontAxleCoupling)
    }
    if (axle === 'rear') {
        return resolveCouplingModeValue(spec?.rearAxleCoupling)
    }
    return AXLE_COUPLING_MODES.INDEPENDENT
}

function resolveCouplingModeValue(value) {
    return value === AXLE_COUPLING_MODES.RIGID_AXLE
        ? AXLE_COUPLING_MODES.RIGID_AXLE
        : AXLE_COUPLING_MODES.INDEPENDENT
}

// The vertical offset a wheel inherits from its axle's beam roll. The offset
// is positive when the beam rolls the wheel up, and it is measured about the
// axle centre so a symmetric axle lifts one side and lowers the other.
export function getAxleCouplingVerticalOffsetMeters(
    axleCouplingState,
    wheelState
) {
    const record = axleCouplingState?.axles?.[wheelState?.axle]
    if (!record || record.isCoupled !== true) return 0

    const lateralOffsetMeters =
        resolveMountLateralOffsetMeters(wheelState) -
        record.axleCentreLateralOffsetMeters

    return record.beamRollRadians * lateralOffsetMeters
}

// Pass 2 of the wheel contact update: solves the axle beam constraints.
// This is a no-op for every axle whose coupling mode is 'independent'.
export function applyAxleCouplingConstraints({
    axleCouplingState,
    wheelStates = [],
    spec = {},
    suspensionMinimumLengthMeters = 0,
    suspensionMaximumLengthMeters = 0,
} = {}) {
    if (!axleCouplingState) return axleCouplingState

    for (let index = 0; index < wheelStates.length; index += 1) {
        const wheelState = wheelStates[index]
        const axle = wheelState?.axle
        if (!axle) continue
        // Each axle is solved once. Only the first wheel of an axle drives the
        // solve, so the second wheel cannot re-solve the beam from the
        // already-shared lengths.
        if (hasEarlierWheelOnAxle(wheelStates, index, axle)) continue

        const record = ensureAxleCouplingRecord(axleCouplingState, axle)
        const couplingMode = resolveAxleCouplingMode(spec, axle)
        record.couplingMode = couplingMode

        const partnerWheelState = findAxlePartnerWheel(wheelStates, index, axle)
        if (couplingMode !== AXLE_COUPLING_MODES.RIGID_AXLE || !partnerWheelState) {
            record.isCoupled = false
            record.beamRollRadians = 0
            record.sharedSuspensionLengthMeters = null
            record.supportedWheelCount = 0
            continue
        }

        record.isCoupled = true
        solveRigidAxleBeam(record, wheelState, partnerWheelState, {
            minimumLengthMeters: suspensionMinimumLengthMeters,
            maximumLengthMeters: suspensionMaximumLengthMeters,
        })
    }

    return axleCouplingState
}

function solveRigidAxleBeam(
    record,
    wheelState,
    partnerWheelState,
    limits
) {
    const wheelLateralMeters = resolveMountLateralOffsetMeters(wheelState)
    const partnerLateralMeters = resolveMountLateralOffsetMeters(partnerWheelState)
    // The axle centre is the midpoint of the two wheels' lateral offsets, and
    // the beam roll is measured about it.
    const axleCentreLateralOffsetMeters =
        (wheelLateralMeters + partnerLateralMeters) * 0.5
    record.axleCentreLateralOffsetMeters = axleCentreLateralOffsetMeters
    const offsetMeters = wheelLateralMeters - axleCentreLateralOffsetMeters
    const partnerOffsetMeters = partnerLateralMeters - axleCentreLateralOffsetMeters

    const isGrounded = wheelState.isGrounded === true
    const isPartnerGrounded = partnerWheelState.isGrounded === true
    record.supportedWheelCount =
        (isGrounded ? 1 : 0) + (isPartnerGrounded ? 1 : 0)

    if (!isGrounded && !isPartnerGrounded) {
        // Both wheels are in the air. A rigid beam has nothing to react
        // against, so there is no constraint to enforce and the wheels keep
        // their own droop lengths.
        record.beamRollRadians = 0
        record.sharedSuspensionLengthMeters = null
        return
    }

    const wheelHeightMeters = resolveWheelCentreWorldHeightMeters(wheelState)
    const partnerHeightMeters =
        resolveWheelCentreWorldHeightMeters(partnerWheelState)

    let beamRollRadians = 0
    let beamCentreHeightMeters = 0

    if (isGrounded && isPartnerGrounded) {
        // Both wheels reach the ground: the beam rests on the two contact
        // points, which fixes the beam's roll and its centre height.
        const lateralSpanMeters = offsetMeters - partnerOffsetMeters
        beamRollRadians =
            Math.abs(lateralSpanMeters) > AXLE_LATERAL_SPAN_EPSILON_METERS
                ? (wheelHeightMeters - partnerHeightMeters) / lateralSpanMeters
                : 0
        beamCentreHeightMeters = (wheelHeightMeters + partnerHeightMeters) * 0.5
    } else {
        // Only one wheel reaches the ground, so the beam rests on that wheel.
        // The beam's roll is indeterminate without a leaf roll spring, so the
        // beam is kept level (roll = 0) instead of persisting a previous
        // roll. That keeps the solve stateless and symmetric.
        beamCentreHeightMeters = isGrounded ? wheelHeightMeters : partnerHeightMeters
    }

    const mountHeightMeters =
        (resolveMountWorldHeightMeters(wheelState) +
            resolveMountWorldHeightMeters(partnerWheelState)) *
        0.5

    let sharedLengthMeters = mountHeightMeters - beamCentreHeightMeters
    sharedLengthMeters = clamp(
        sharedLengthMeters,
        limits.minimumLengthMeters,
        limits.maximumLengthMeters
    )
    beamCentreHeightMeters = mountHeightMeters - sharedLengthMeters
    beamRollRadians = clampBeamRollToTravelLimits(
        beamRollRadians,
        wheelState,
        partnerWheelState,
        offsetMeters,
        partnerOffsetMeters,
        beamCentreHeightMeters,
        limits
    )

    record.beamRollRadians = beamRollRadians
    record.sharedSuspensionLengthMeters = sharedLengthMeters

    // The shared length is the leaf's length. Both wheels report it so the
    // suspension force path sees one compression for the axle.
    wheelState.suspensionCurrentLengthMeters = sharedLengthMeters
    partnerWheelState.suspensionCurrentLengthMeters = sharedLengthMeters
}

// Keeps both wheel drops inside the suspension travel limits. The clamp is
// defensive: with both wheels grounded the solved roll already satisfies the
// limits, and with one wheel grounded the roll is zero.
function clampBeamRollToTravelLimits(
    beamRollRadians,
    wheelState,
    partnerWheelState,
    offsetMeters,
    partnerOffsetMeters,
    beamCentreHeightMeters,
    limits
) {
    let minimumRollRadians = -Number.POSITIVE_INFINITY
    let maximumRollRadians = Number.POSITIVE_INFINITY

    for (const corner of [
        { wheelState, offsetMeters },
        { wheelState: partnerWheelState, offsetMeters: partnerOffsetMeters },
    ]) {
        const offset = corner.offsetMeters
        if (Math.abs(offset) <= AXLE_LATERAL_SPAN_EPSILON_METERS) continue

        const mountHeightMeters = resolveMountWorldHeightMeters(corner.wheelState)
        const lowerBound =
            (mountHeightMeters -
                limits.maximumLengthMeters -
                beamCentreHeightMeters) /
            offset
        const upperBound =
            (mountHeightMeters -
                limits.minimumLengthMeters -
                beamCentreHeightMeters) /
            offset

        if (offset > 0) {
            minimumRollRadians = Math.max(minimumRollRadians, lowerBound)
            maximumRollRadians = Math.min(maximumRollRadians, upperBound)
        } else {
            minimumRollRadians = Math.max(minimumRollRadians, upperBound)
            maximumRollRadians = Math.min(maximumRollRadians, lowerBound)
        }
    }

    if (
        !Number.isFinite(minimumRollRadians) ||
        !Number.isFinite(maximumRollRadians) ||
        minimumRollRadians > maximumRollRadians
    ) {
        return beamRollRadians
    }

    return clamp(beamRollRadians, minimumRollRadians, maximumRollRadians)
}

function ensureAxleCouplingRecord(axleCouplingState, axle) {
    let record = axleCouplingState.axles[axle]
    if (record) return record

    record = {
        axle,
        couplingMode: AXLE_COUPLING_MODES.INDEPENDENT,
        isCoupled: false,
        beamRollRadians: 0,
        axleCentreLateralOffsetMeters: 0,
        sharedSuspensionLengthMeters: null,
        supportedWheelCount: 0,
    }
    axleCouplingState.axles[axle] = record
    return record
}

function hasEarlierWheelOnAxle(wheelStates, index, axle) {
    for (let earlier = 0; earlier < index; earlier += 1) {
        if (wheelStates[earlier]?.axle === axle) return true
    }
    return false
}

function findAxlePartnerWheel(wheelStates, index, axle) {
    for (let other = 0; other < wheelStates.length; other += 1) {
        if (other === index) continue
        if (wheelStates[other]?.axle === axle) return wheelStates[other]
    }
    return null
}

function resolveMountLateralOffsetMeters(wheelState) {
    const mountLocalPosition = wheelState?.suspensionMountLocalPosition
    return Number.isFinite(mountLocalPosition?.x) ? mountLocalPosition.x : 0
}

function resolveMountWorldHeightMeters(wheelState) {
    return Number.isFinite(wheelState?.suspensionMountWorld?.y)
        ? wheelState.suspensionMountWorld.y
        : 0
}

function resolveWheelCentreWorldHeightMeters(wheelState) {
    const mountHeightMeters = resolveMountWorldHeightMeters(wheelState)
    const axisDownY = Number.isFinite(wheelState?.suspensionAxisDownWorld?.y)
        ? wheelState.suspensionAxisDownWorld.y
        : -1
    const lengthMeters = Number.isFinite(wheelState?.suspensionCurrentLengthMeters)
        ? wheelState.suspensionCurrentLengthMeters
        : 0

    return mountHeightMeters + axisDownY * lengthMeters
}

function clamp(value, minimum, maximum) {
    if (!Number.isFinite(value)) return minimum
    return Math.min(maximum, Math.max(minimum, value))
}
