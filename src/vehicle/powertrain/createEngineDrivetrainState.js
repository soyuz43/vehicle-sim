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

function idleOmegaFromRpm(idleRpm) {
    return sanitizeNonNegative(idleRpm) * (TWO_PI / 60)
}

export function createEngineDrivetrainState({ idleRpm = 800 } = {}) {
    return {
        engineOmegaRadiansPerSecond: idleOmegaFromRpm(idleRpm),
        isClutchLocked: false,
        clutchTorqueNewtonMeters: 0,
        clutchSlipRadiansPerSecond: 0,
        lastNetEngineTorqueNewtonMeters: 0,
    }
}

export function resetEngineDrivetrainState(state, { idleRpm = 800 } = {}) {
    state.engineOmegaRadiansPerSecond = idleOmegaFromRpm(idleRpm)
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
    const omega = Math.abs(sanitizeFinite(engineOmegaRadiansPerSecond))
    const engagement = Math.min(1, Math.max(0, sanitizeFinite(clutchEngagement01, 1)))
    return engagement * (
        sanitizeNonNegative(baseTorqueNewtonMeters) +
        sanitizeNonNegative(torquePerRadiansPerSecond) * omega
    )
}

export function updateEngineAngularVelocity({
    engineOmegaRadiansPerSecond = 0,
    netEngineTorqueNewtonMeters = 0,
    engineInertiaKgMeterSquared = 0.2,
    dtSeconds = 0,
    idleRpm = 800,
    pumpingTorqueNewtonMeters = 0,
} = {}) {
    const inertia = sanitizeNonNegative(engineInertiaKgMeterSquared, 0.2)
    const dt = sanitizeNonNegative(dtSeconds)
    const idleOmega = idleOmegaFromRpm(idleRpm)
    let omega = sanitizeFinite(engineOmegaRadiansPerSecond, idleOmega)

    if (inertia <= 0 || dt <= 0) return omega

    omega += (netEngineTorqueNewtonMeters / inertia) * dt

    // Soft idle floor: the engine cannot stall below idle on its own when
    // the net torque and pumping drag would pull it under.
    if (
        omega < idleOmega &&
        netEngineTorqueNewtonMeters + pumpingTorqueNewtonMeters <= 0
    ) {
        omega = idleOmega
    }

    if (omega < 0) omega = 0

    return omega
}

export function computeClutchTorque({
    engineOmegaRadiansPerSecond = 0,
    transmissionInputOmegaRadiansPerSecond = 0,
    clutchTorqueCapacityNewtonMeters = 400,
    desiredTorqueNewtonMeters = 0,
} = {}) {
    const engineOmega = sanitizeFinite(engineOmegaRadiansPerSecond)
    const transmissionOmega = sanitizeFinite(transmissionInputOmegaRadiansPerSecond)
    const capacity = sanitizeNonNegative(clutchTorqueCapacityNewtonMeters, 400)
    const omegaError = engineOmega - transmissionOmega
    const isLocked = Math.abs(omegaError) < OMEGA_EPSILON_RADIANS_PER_SECOND

    if (isLocked) {
        // Locked: engine and transmission are rigidly coupled for this step.
        // The transmitted torque is whatever is required to keep them locked;
        // the caller resolves this from the engine net torque and the
        // driveline reaction. We return the desired torque uncapped.
        return {
            torqueNewtonMeters: sanitizeFinite(desiredTorqueNewtonMeters),
            isLocked: true,
        }
    }

    // Slipping: transmitted torque is capped at capacity and always opposes
    // the relative slip velocity on the engine side. The desired torque is
    // the torque the clutch would transmit to bring the speeds together;
    // the capacity clamps it.
    const sign = Math.sign(omegaError) || 1
    const slipTorque = sign * Math.min(
        capacity,
        Math.abs(sanitizeFinite(desiredTorqueNewtonMeters))
    )

    return {
        torqueNewtonMeters: slipTorque,
        isLocked: false,
    }
}

export { RPM_PER_RADIAN_PER_SECOND, TWO_PI, OMEGA_EPSILON_RADIANS_PER_SECOND }
