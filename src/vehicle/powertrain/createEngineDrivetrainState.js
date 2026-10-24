// src/vehicle/powertrain/createEngineDrivetrainState.js

// Slice 2 engine-inertia + clutch-slip powertrain state.
//
// The engine is an integrated angular-velocity state driven by the torque
// curve at its own omega, clutch reaction torque, and speed-proportional
// pumping drag. The clutch is a friction element with a torque capacity:
// when locked, engine and transmission speeds match; when slipping, the
// transmitted torque is capped at capacity and always opposes the relative
// slip velocity on the engine side.
//
// Honesty policy: this is a first-order drivetrain model, not a full
// combustion/thermodynamic simulation. The idle controller is a soft floor,
// not an ECU model. The clutch does not model heat, wear, or actuation delay.

const RPM_PER_RADIAN_PER_SECOND = 60 / (Math.PI * 2)
const TWO_PI = Math.PI * 2
const OMEGA_EPSILON_RADIANS_PER_SECOND = 1

function sanitizeFinite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback
}

function sanitizeNonNegative(value, fallback = 0) {
    return Number.isFinite(value) && value >= 0 ? value : fallback
}

function idleOmegaRadiansPerSecondFromRpm(idleRpm) {
    return sanitizeNonNegative(idleRpm) * (TWO_PI / 60)
}

export function createEngineDrivetrainState({ idleRpm = 800 } = {}) {
    return {
        engineOmegaRadiansPerSecond: idleOmegaRadiansPerSecondFromRpm(idleRpm),
        isClutchLocked: false,
        clutchTorqueNewtonMeters: 0,
        clutchSlipRadiansPerSecond: 0,
        lastNetEngineTorqueNewtonMeters: 0,
    }
}

export function resetEngineDrivetrainState(state, { idleRpm = 800 } = {}) {
    state.engineOmegaRadiansPerSecond = idleOmegaRadiansPerSecondFromRpm(idleRpm)
    state.isClutchLocked = false
    state.clutchTorqueNewtonMeters = 0
    state.clutchSlipRadiansPerSecond = 0
    state.lastNetEngineTorqueNewtonMeters = 0
    return state
}

export function computePumpingTorqueNewtonMeters({
    engineOmegaRadiansPerSecond = 0,
    baseTorqueNewtonMeters = 15,
    torquePerRadiansPerSecond = 0.5,
    clutchEngagement01 = 1,
} = {}) {
    const absoluteEngineOmegaRadiansPerSecond = Math.abs(
        sanitizeFinite(engineOmegaRadiansPerSecond)
    )
    const safeClutchEngagement01 = Math.min(
        1,
        Math.max(0, sanitizeFinite(clutchEngagement01, 1))
    )
    return safeClutchEngagement01 * (
        sanitizeNonNegative(baseTorqueNewtonMeters) +
        sanitizeNonNegative(torquePerRadiansPerSecond) *
            absoluteEngineOmegaRadiansPerSecond
    )
}

export function updateEngineAngularVelocity({
    engineOmegaRadiansPerSecond = 0,
    netEngineTorqueNewtonMeters = 0,
    engineInertiaKgMeterSquared = 0.2,
    dtSeconds = 0,
    idleRpm = 800,
} = {}) {
    const safeEngineInertiaKgMeterSquared = sanitizeNonNegative(
        engineInertiaKgMeterSquared,
        0.2
    )
    const safeDtSeconds = sanitizeNonNegative(dtSeconds)
    const idleOmegaRadiansPerSecond = idleOmegaRadiansPerSecondFromRpm(idleRpm)
    let updatedEngineOmegaRadiansPerSecond = sanitizeFinite(
        engineOmegaRadiansPerSecond,
        idleOmegaRadiansPerSecond
    )

    if (safeEngineInertiaKgMeterSquared <= 0 || safeDtSeconds <= 0) {
        return updatedEngineOmegaRadiansPerSecond
    }

    updatedEngineOmegaRadiansPerSecond +=
        (netEngineTorqueNewtonMeters / safeEngineInertiaKgMeterSquared) * safeDtSeconds

    if (
        updatedEngineOmegaRadiansPerSecond < idleOmegaRadiansPerSecond &&
        netEngineTorqueNewtonMeters <= 0
    ) {
        updatedEngineOmegaRadiansPerSecond = idleOmegaRadiansPerSecond
    }

    if (updatedEngineOmegaRadiansPerSecond < 0) {
        updatedEngineOmegaRadiansPerSecond = 0
    }

    return updatedEngineOmegaRadiansPerSecond
}

export function computeClutchTorque({
    engineOmegaRadiansPerSecond = 0,
    transmissionInputOmegaRadiansPerSecond = 0,
    clutchTorqueCapacityNewtonMeters = 400,
    desiredTorqueNewtonMeters = 0,
    result = undefined,
} = {}) {
    const safeEngineOmegaRadiansPerSecond = sanitizeFinite(
        engineOmegaRadiansPerSecond
    )
    const safeTransmissionInputOmegaRadiansPerSecond = sanitizeFinite(
        transmissionInputOmegaRadiansPerSecond
    )
    const safeClutchTorqueCapacityNewtonMeters = sanitizeNonNegative(
        clutchTorqueCapacityNewtonMeters,
        400
    )
    const omegaDifferenceRadiansPerSecond =
        safeEngineOmegaRadiansPerSecond - safeTransmissionInputOmegaRadiansPerSecond
    const safeDesiredTorqueNewtonMeters = sanitizeFinite(desiredTorqueNewtonMeters)
    const canRemainLocked =
        Math.abs(omegaDifferenceRadiansPerSecond) < OMEGA_EPSILON_RADIANS_PER_SECOND &&
        Math.abs(safeDesiredTorqueNewtonMeters) <= safeClutchTorqueCapacityNewtonMeters
    const clutchResult = result ?? { torqueNewtonMeters: 0, isLocked: false }

    if (canRemainLocked) {
        clutchResult.torqueNewtonMeters = safeDesiredTorqueNewtonMeters
        clutchResult.isLocked = true
        return clutchResult
    }

    const slipDirection =
        Math.sign(omegaDifferenceRadiansPerSecond) ||
        Math.sign(safeDesiredTorqueNewtonMeters) ||
        1
    clutchResult.torqueNewtonMeters = slipDirection * Math.min(
        safeClutchTorqueCapacityNewtonMeters,
        Math.abs(safeDesiredTorqueNewtonMeters)
    )
    clutchResult.isLocked = false

    return clutchResult
}

export { RPM_PER_RADIAN_PER_SECOND, TWO_PI, OMEGA_EPSILON_RADIANS_PER_SECOND }
