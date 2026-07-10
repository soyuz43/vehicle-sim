// src/vehicle/defaultVehicleSpec.js

import { EARTH_GRAVITY } from '../simulation/simulationConstants.js'

export const DEFAULT_VEHICLE_SPEC = Object.freeze({
  kind: 'flat-ground-rwd-test-chassis',

  // Core physical properties
  massKg: 1400,

  // Quasi-static load transfer v1 uses prior-step local acceleration to shift
  // per-wheel normal force. Wheelbase and track width are derived from wheel
  // local positions when possible; these spec values are conservative fallbacks.
  // This modifies normal force, not frictionCoefficient, and still has no
  // suspension spring/damper, chassis roll/pitch motion, or full rigid-body suspension.
  centerOfMassHeightMeters: 0.55,
  wheelbaseMeters: 2.9,
  frontTrackWidthMeters: 2.5,
  rearTrackWidthMeters: 2.5,
  minimumNormalForceNewtons: 0,
  loadTransferEnabled: true,

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

  // Service brake bias v1 distributes requested service brake torque by axle.
  // serviceBrakeFrontBias01 is the fraction of total service brake torque sent
  // to the front axle; the rear axle receives 1 - serviceBrakeFrontBias01.
  // This applies only to service brake distribution. Parking brake remains
  // rear-only and ABS still modulates only the service brake path. Brake bias
  // does not directly change frictionCoefficient, normalForceNewtons, or
  // tractionLimitNewtons; the traction limit remains frictionCoefficient *
  // normalForceNewtons. There is no brake heat, fade, wear, hydraulic model,
  // or damage model.
  serviceBrakeFrontBias01: 0.65,

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
  // This is not a full rigid-body chassis model and still has no suspension
  // spring/damper, roll center geometry, or chassis roll/pitch motion.
  yawMomentOfInertiaKgMeterSquared: 2800,
  yawRateDampingPerSecond: 1.2,
  maxYawRateRadiansPerSecond: 3.5,

  // Tire pressure handling v1 changes effective rolling radius, longitudinal
  // and lateral tire stiffness, and rolling resistance before the traction cap.
  // It does not directly change frictionCoefficient, normalForceNewtons, or
  // tractionLimitNewtons; traction limit still remains frictionCoefficient *
  // normalForceNewtons. There is still no tire temperature, wear, damage,
  // puncture, or blowout model.
  recommendedTirePressureKpa: 220,
  defaultTirePressureKpa: 220,
  minTirePressureKpa: 80,
  maxTirePressureKpa: 340,
  minimumEffectiveTirePressureKpa: 120,
  maximumEffectiveTirePressureKpa: 280,
  baseTireRollingRadiusMeters: 0.48,
  minimumEffectiveTireRollingRadiusMeters: 0.44,
  underInflationRollingRadiusLossFraction: 0.06,
  overInflationRollingRadiusGainFraction: 0.02,
  minimumPressureLongitudinalStiffnessMultiplier: 0.72,
  maximumPressureLongitudinalStiffnessMultiplier: 1.04,
  minimumPressureLateralStiffnessMultiplier: 0.68,
  maximumPressureLateralStiffnessMultiplier: 1.06,
  underInflationRollingResistanceCoefficientGain: 0.012,
  overInflationRollingResistanceCoefficientChange: -0.002,
  rollingResistanceDeadSpeedMetersPerSecond: 0.35,
  tirePressureHandlingEnabled: true,

  // Legacy placeholder from the pre-lateral-force stage. Basic lateral tire
  // force v1 no longer consumes this field, but it remains defined until that
  // older staging seam is removed explicitly.
  temporaryLateralVelocityDampingPerSecond: 1.2,

  // Resistance forces. Rolling resistance is now the baseline pressure-neutral
  // coefficient; tire pressure handling adjusts response around this baseline
  // without changing frictionCoefficient or the traction cap directly.
  rollingResistanceCoefficient: 0.015,
  aerodynamicDragEnabled: true,
  dragCoefficient: 0.32,
  frontalAreaSquareMeters: 2.2,
  airDensityKgPerCubicMeter: 1.225,

  // Flat-ground placeholder until terrain surface queries exist.
  defaultSurfaceFrictionCoefficient: 1.0,

  // Canonical gravity source.
  gravityMetersPerSecondSquared:
    EARTH_GRAVITY.standardMetersPerSecondSquared,
})
