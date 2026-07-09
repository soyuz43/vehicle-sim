// src/vehicle/defaultVehicleSpec.js

import { EARTH_GRAVITY } from '../simulation/simulationConstants.js'

export const DEFAULT_VEHICLE_SPEC = Object.freeze({
  kind: 'flat-ground-rwd-test-chassis',

  // Core physical properties
  massKg: 1400,

  // Speed limits are still controller-level guards for now.
  maxForwardSpeedMetersPerSecond: 60,
  maxReverseSpeedMetersPerSecond: 12,

  // Longitudinal driver request budgets. Tire force now comes from slip ratio;
  // these requests remain command telemetry and torque inputs, not direct body force.
  maxDriveForceNewtons: 6500,
  maxReverseDriveForceNewtons: 2500,
  maxBrakeForceNewtons: 12000,

  // Wheel inertia used by the current simple wheel angular dynamics.
  // This is not drivetrain inertia or a full rotating assembly model.
  wheelInertiaKgMeterSquared: 1.2,

  // Per-wheel service brake torque used by the current simple wheel angular dynamics.
  // ABS and real lockup behavior remain future work.
  maxServiceBrakeTorqueNewtonMeters: 1200,

  // Basic linear/saturated longitudinal tire model coefficient.
  // Tire force is still capped by frictionCoefficient * normalForceNewtons;
  // this is not a Pacejka or combined-slip tire model.
  longitudinalTireStiffnessNewtonsPerSlipRatio: 1600,

  // Temporary planar stabilization until lateral tire forces exist.
  // This damps local lateral velocity only; it is not a lateral tire model.
  temporaryLateralVelocityDampingPerSecond: 1.2,

  // Resistance forces.
  rollingResistanceCoefficient: 0.015,
  dragCoefficient: 0.35,
  frontalAreaSquareMeters: 2.2,
  airDensityKgPerCubicMeter: 1.225,

  // Flat-ground placeholder until terrain surface queries exist.
  defaultSurfaceFrictionCoefficient: 1.0,

  // Canonical gravity source.
  gravityMetersPerSecondSquared:
    EARTH_GRAVITY.standardMetersPerSecondSquared,
})