// src/vehicle/config/describeVehicleApplyWarning.js

/**
 * Describe the consequence of applying a vehicle configuration while the
 * vehicle is moving.
 *
 * A chassis change drops the stored heave, pitch, and roll state: the new
 * mass and center of mass make that state stale, so it is dropped instead
 * of carrying momentum the new body does not have. The body re-levels over
 * the frames after the apply, and at speed that discontinuity is felt.
 *
 * The warning is INFORMATION, not a gate. The apply always proceeds; the
 * warning names the consequence that already happened, so the driver is not
 * left to discover it.
 *
 * The comparison is against the configuration the vehicle is actually
 * running, not against the stock configuration. Applying the chassis the
 * vehicle already has changes nothing, so there is nothing to warn about.
 *
 * The threshold is a UX call, not a physical one: it is the speed above
 * which the driver is told. It is never lower than 30 km/h.
 */

// The speed above which a chassis swap is reported: 30 km/h.
export const APPLY_AT_SPEED_WARNING_THRESHOLD_METERS_PER_SECOND = 30 / 3.6

// The warning an apply carries when it drops the vertical dynamics state
// while the vehicle is moving. Returns null when there is nothing to
// report.
export function describeVehicleApplyWarning({
  pendingVehicleConfig = null,
  appliedVehicleConfig = null,
  speedMetersPerSecond = 0,
} = {}) {
  if (!pendingVehicleConfig || !appliedVehicleConfig) return null

  const pendingChassis = pendingVehicleConfig.slots?.chassis ?? null
  const appliedChassis = appliedVehicleConfig.slots?.chassis ?? null

  // The chassis is the only slot that drops the vertical dynamics state.
  // Applying the chassis the vehicle already has is a no-op.
  if (pendingChassis === appliedChassis) return null

  const speed = Number.isFinite(speedMetersPerSecond) ? speedMetersPerSecond : 0
  if (speed <= APPLY_AT_SPEED_WARNING_THRESHOLD_METERS_PER_SECOND) return null

  const speedKilometersPerHour = Math.round(speed * 3.6)

  return (
    `Applied at ${speedKilometersPerHour} km/h. The heave, pitch, and roll ` +
    'state was dropped; the body re-levels over the next few frames.'
  )
}
