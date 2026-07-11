// src/vehicle/defaultVehicleSpec.js

import { EARTH_GRAVITY } from '../simulation/simulationConstants.js'

const DEFAULT_VEHICLE_MASS_KG = 1400

export const DEFAULT_VEHICLE_SPEC = Object.freeze({
  kind: 'terrain-following-rwd-test-chassis',

  // Core physical properties
  massKg: DEFAULT_VEHICLE_MASS_KG,

  // Quasi-static load transfer v1 uses prior-step local acceleration to provide
  // each wheel's requested normal load. Wheelbase and track width are derived
  // from wheel local positions when possible; these values are fallbacks.
  centerOfMassHeightMeters: 0.55,
  wheelbaseMeters: 2.9,
  frontTrackWidthMeters: 2.5,
  rearTrackWidthMeters: 2.5,
  minimumNormalForceNewtons: 0,
  loadTransferEnabled: true,

  // Raycast suspension contact v1 derives spring rate from static load, wheel
  // count, travel, and target static compression. Spring/damper support is
  // normalized before quasi-static load transfer; it has no dynamic chassis
  // heave, pitch, roll, landing impulse, or suspension-geometry solver.
  suspensionEnabled: true,
  // Rest length is the fully extended wheel-center distance below the authored
  // suspension mount. Minimum length and travel bound this raycast v1 model;
  // they do not add a rigid suspension linkage or body heave simulation.
  suspensionRestLengthMeters: 0.35,
  suspensionMinimumLengthMeters: 0.13,
  suspensionMaximumLengthMeters: 0.35,
  suspensionTravelMeters: 0.22,
  suspensionTargetStaticCompressionRatio01: 0.4,
  suspensionDampingRatio: 0.35,
  suspensionContactAcquireSlopMeters: 0.004,
  suspensionContactReleaseSlopMeters: 0.012,
  minimumSuspensionNormalAlignmentCosine: 0.25,
  maximumSuspensionRayDistanceMeters: 1.3,
  maximumSuspensionNormalForceNewtons:
    DEFAULT_VEHICLE_MASS_KG * EARTH_GRAVITY.standardMetersPerSecondSquared,

  // Chassis terrain following is a bounded quasi-static support-height
  // approximation. It deliberately does not create vertical velocity, heave,
  // pitch, roll, gravity fall, landing impulses, or jump behavior.
  chassisTerrainSupportBaselineOffsetMeters: 0,
  chassisTerrainSupportHeightResponseSeconds: 0.1,
  slopeGravityEnabled: true,

  // Speed limits are still controller-level guards for now.
  maxForwardSpeedMetersPerSecond: 60,
  maxReverseSpeedMetersPerSecond: 12,

  // Rear differential models v1 only affect how the existing rear driven axle
  // splits total drive request between left and right. They do not change the
  // powertrain, braking, tire model, traction limit, or wheel-speed equations.
  rearDifferentialType: 'open',
  rearDifferentialAvailableTypes: [
    'open',
    'limited-slip',
    'torsen',
    'locked',
    'welded',
  ],
  limitedSlipDifferentialLockFactor01: 0.35,
  limitedSlipDifferentialPreloadTorqueNewtonMeters: 80,
  limitedSlipDifferentialCouplingGainNewtonMetersPerRadianPerSecond: 600,
  limitedSlipDifferentialMaxCouplingTorqueNewtonMeters: 1800,
  torsenDifferentialTorqueBiasRatio: 3,
  lockedDifferentialLockFactor01: 1,
  differentialSlipSpeedEpsilonRadiansPerSecond: 0.5,
  rearDifferentialHardCouplingEpsilonRadiansPerSecond: 0.001,

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

  // Longitudinal tire force relaxation v1 eases the applied longitudinal force
  // toward the existing traction-limited target. It does not change slip
  // ratio, stiffness, frictionCoefficient, or tractionLimitNewtons semantics.
  longitudinalTireForceRelaxationEnabled: true,
  longitudinalTireForceRelaxationLengthMeters: 0.35,
  minimumLongitudinalTireForceRelaxationSpeedMetersPerSecond: 1,

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
  // This is not a full rigid-body chassis or suspension geometry model and has
  // no roll centers, vertical chassis dynamics, or chassis roll/pitch motion.
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
  minTirePressureKpa: 0,
  maxTirePressureKpa: 340,
  // Public pressure can be zero. This positive floor is calculation-only
  // telemetry for paths that require a strictly positive internal value.
  minimumCalculationTirePressureKpa: 20,
  minimumEffectiveTirePressureKpa: 0,
  maximumEffectiveTirePressureKpa: 280,
  baseTireRollingRadiusMeters: 0.48,
  minimumEffectiveTireRollingRadiusMeters: 0.39,
  underInflationRollingRadiusLossFraction: 0.1875,
  overInflationRollingRadiusGainFraction: 0.02,
  minimumPressureLongitudinalStiffnessMultiplier: 0.46,
  maximumPressureLongitudinalStiffnessMultiplier: 1.04,
  minimumPressureLateralStiffnessMultiplier: 0.48,
  maximumPressureLateralStiffnessMultiplier: 1.06,
  underInflationRollingResistanceCoefficientGain: 0.05,
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

  // Fallback friction for compatibility queries or unavailable terrain metadata.
  defaultSurfaceFrictionCoefficient: 1.0,

  // Canonical gravity source.
  gravityMetersPerSecondSquared:
    EARTH_GRAVITY.standardMetersPerSecondSquared,
})
