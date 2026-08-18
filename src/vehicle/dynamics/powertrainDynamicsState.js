// src/vehicle/dynamics/powertrainDynamicsState.js

// Phase 4 powertrain-depth seam: automatic gear selection, clutch engagement,
// engine rotational inertia, and engine braking.
//
// These are intentionally isolated, pure-ish functions so the controller can
// enable/disable each behavior behind a feature flag. The default
// (fixed-representative-ratio, no engine braking, no clutch slip) behavior is
// preserved when the flags are off.
//
// Honesty policy: this is a first-order drivetrain model, not a full
// engine/transmission simulator. Engine speed is coupled to the wheels through a
// scalar clutch factor; there is no torque-converter, no detailed shift
// actuation, and engine braking is a simple speed-proportional retarding torque.

const TWO_PI = Math.PI * 2
const RPM_PER_RADIAN_PER_SECOND = 60 / TWO_PI

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function sanitizeNonNegativeNumber(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function sanitizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

// ---------------------------------------------------------------------------
// Automatic gear selection: pick the highest forward gear whose implied engine
// RPM sits inside the usable band [downshiftRpm, redlineRpm]. At launch / very
// low speed this naturally selects first gear (highest RPM); as speed rises it
// upshifts to keep RPM below redline while avoiding lug (RPM below downshift).
export function selectForwardGearIndexForSpeed({
  wheelAngularVelocityRadiansPerSecond = 0,
  transmissionProfile,
  downshiftRpm = 1500,
  upshiftRpm = 5000,
  redlineRpm = 6500,
}) {
  const ratios = transmissionProfile?.forwardGearRatios
  if (!Array.isArray(ratios) || ratios.length === 0) return 0

  const finalDrive = sanitizePositiveNumber(
    transmissionProfile?.finalDriveRatio,
    1
  )
  const wheelRps = Math.abs(sanitizeNumber(wheelAngularVelocityRadiansPerSecond))
  const redline = redlineRpm > 0 ? redlineRpm : Infinity
  const downshift = sanitizeNonNegativeNumber(downshiftRpm)

  // Search from highest gear down to find first gear in [downshift, redline] band
  for (let gearIndex = ratios.length - 1; gearIndex >= 0; gearIndex -= 1) {
    const impliedRpm =
      wheelRps * RPM_PER_RADIAN_PER_SECOND * ratios[gearIndex] * finalDrive
    if (impliedRpm >= downshift && impliedRpm <= redline) {
      return gearIndex
    }
  }

  // No gear in band: check if we are at low speed (first gear below downshift)
  // or high speed (top gear above redline)
  const firstGearRpm = wheelRps * RPM_PER_RADIAN_PER_SECOND * ratios[0] * finalDrive
  if (firstGearRpm < downshift) {
    return 0 // At/near standstill: start in first gear
  }
  return ratios.length - 1 // At high speed: stay in top gear
}

export function computeSelectedGearForwardRatio(transmissionProfile, gearIndex = 0) {
  const ratios = transmissionProfile?.forwardGearRatios
  if (!Array.isArray(ratios) || ratios.length === 0) return 1
  const index = Math.max(0, Math.min(gearIndex, ratios.length - 1))
  const ratio = Number(ratios[index])
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1
}

// ---------------------------------------------------------------------------
// Clutch engagement: a scalar [0,1] that ramps toward the commanded state.
// Disengaged (0) at/near standstill or on clutch command; engaged (1) when
// launching / driving. When slipping (not fully engaged) less torque transmits.
// ---------------------------------------------------------------------------
export function computeClutchEngagement01({
  clutchEngagement01,
  commandedEngaged,
  engageRatePerSecond = 4,
  disengageRatePerSecond = 8,
  dt = 0,
}) {
  const current = clamp01(sanitizeNumber(clutchEngagement01))
  const target = commandedEngaged ? 1 : 0
  const rate = (target > current ? engageRatePerSecond : disengageRatePerSecond) *
    Math.max(dt, 0)
  let next = current + Math.sign(target - current) * Math.min(rate, Math.abs(target - current))
  next = clamp01(next)
  return next
}

// ---------------------------------------------------------------------------
// Engine braking: retarding torque the engine/transmission applies to the
// driveline when the throttle is closed and the clutch is engaged. Modeled as a
// speed-proportional friction plus a constant base term, scaled by clutch
// engagement (a disengaged clutch transmits no engine braking).
// ---------------------------------------------------------------------------
export function computeEngineBrakingTorqueNewtonMeters({
  engineProfile,
  engineAngularVelocityRadiansPerSecond = 0,
  clutchEngagement01 = 1,
}) {
  const baseTorque = sanitizeNonNegativeNumber(
    engineProfile?.engineBrakingBaseTorqueNewtonMeters
  )
  const perRadiansPerSecond = sanitizeNonNegativeNumber(
    engineProfile?.engineBrakingTorquePerRadPerSecond
  )
  const omega = Math.abs(sanitizeNumber(engineAngularVelocityRadiansPerSecond))
  return clamp01(clutchEngagement01) * (baseTorque + perRadiansPerSecond * omega)
}

// ---------------------------------------------------------------------------
// Engine rotational integration: integrate engine angular velocity from net
// torque using engine rotational inertia. The engine speed is the source of
// drive torque and the basis for engine-braking magnitude.
// ---------------------------------------------------------------------------
export function updateEngineAngularVelocity({
  engineAngularVelocityRadiansPerSecond = 0,
  netEngineTorqueNewtonMeters = 0,
  engineInertiaKgMeterSquared = 0,
  dt = 0,
  idleRpm = 0,
}) {
  const idleOmega = (sanitizeNonNegativeNumber(idleRpm) / RPM_PER_RADIAN_PER_SECOND) * (TWO_PI / 60)
  const inertia = sanitizePositiveNumber(engineInertiaKgMeterSquared)
  let omega = sanitizeNumber(engineAngularVelocityRadiansPerSecond)

  if (inertia <= 0 || dt <= 0) {
    // No inertia model: engine speed follows idle when not driven (caller
    // couples it to wheels separately). Return unchanged.
    return omega
  }

  omega += (netEngineTorqueNewtonMeters / inertia) * dt
  // Engine cannot run below idle on its own; this is a soft floor only.
  if (omega < 0) omega = 0
  return omega
}

export { RPM_PER_RADIAN_PER_SECOND, TWO_PI }
