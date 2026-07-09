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

  // Per-wheel brake torque command limits used by the current simple wheel angular dynamics.
  // The service brake is the normal brake pedal path and remains separate from
  // the rear-wheel parking brake path. These are not ABS, brake bias, or a full
  // hydraulic model.
  maxServiceBrakeTorqueNewtonMeters: 1200,
  maxParkingBrakeTorqueNewtonMeters: 1400,
  parkingBrakeActsOnRearWheelsOnly: true,

  // ABS v1 modulates service brake torque only. It does not change parking brake
  // torque, frictionCoefficient, tractionLimitNewtons, traction control, or
  // stability control. This is a staged control foundation, not a full production ABS.
  serviceBrakeAbsEnabled: true,
  serviceBrakeAbsMinGroundSpeedMetersPerSecond: 2.5,
  serviceBrakeAbsSlipRatioTriggerThreshold: 0.18,
  serviceBrakeAbsSlipRatioRecoveryThreshold: 0.08,
  serviceBrakeAbsReleaseRatePerSecond: 10,
  serviceBrakeAbsReapplyRatePerSecond: 4,
  serviceBrakeAbsMinimumModulation01: 0.2,

  // Basic linear/saturated longitudinal tire model coefficient.
  // Tire force is still capped by frictionCoefficient * normalForceNewtons;
  // this is not a Pacejka or combined-slip tire model.
  longitudinalTireStiffnessNewtonsPerSlipRatio: 1600,

  // Longitudinal traction-state thresholds classify/debug wheel behavior only.
  // They do not change tire force, friction, brake torque, ABS, or traction caps.
  tractionSlipRatioWarningThreshold: 0.08,
  tractionSlipRatioSaturationThreshold: 0.18,
  brakeLockGroundSpeedThresholdMetersPerSecond: 0.5,
  brakeLockWheelSurfaceSpeedThresholdMetersPerSecond: 0.25,
  driveSpinSlipRatioThreshold: 0.12,

  // Lateral slip-angle thresholds classify/debug telemetry only.
  // They do not change tire force, frictionCoefficient, tractionLimitNewtons,
  // combined slip, stability control, or any lateral tire-force behavior.
  lateralSlipAngleWarningRadians: 0.08,
  lateralSlipAngleHighRadians: 0.16,
  lateralSlipMinGroundSpeedMetersPerSecond: 0.75,

  // Basic lateral tire force v1 uses a linear/saturated slip-angle response.
  // Force is still capped by frictionCoefficient * normalForceNewtons; this is
  // not Pacejka, a professional tire model, or a full combined-slip curve.
  lateralTireStiffnessNewtonsPerRadian: 6000,
  lateralTireForceSaturationEpsilonNewtons: 0.001,

  // Longitudinal and lateral tire force share a simple friction-circle cap.
  // This respects the existing tractionLimitNewtons only; it does not change
  // frictionCoefficient, combined-slip curve shape, stability control, or ABS.
  combinedTireForceCapEnabled: true,

  // Basic yaw-moment foundation from per-wheel tire forces.
  // This is not a full rigid-body chassis model and still has no suspension or
  // load transfer.
  yawMomentOfInertiaKgMeterSquared: 2800,
  yawRateDampingPerSecond: 1.2,
  maxYawRateRadiansPerSecond: 3.5,

  // Tire pressure currently drives visual/debug state only. It does not change
  // frictionCoefficient, tractionLimitNewtons, tire force, or vehicle dynamics.
  // Future tire-pressure physics may consume these fields explicitly.
  defaultTirePressureKpa: 220,
  minTirePressureKpa: 80,
  maxTirePressureKpa: 340,

  // Legacy placeholder from the pre-lateral-force stage. Basic lateral tire
  // force v1 no longer consumes this field, but it remains defined until that
  // older staging seam is removed explicitly.
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