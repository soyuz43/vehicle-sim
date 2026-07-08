// src/vehicle/defaultVehicleSpec.js

import { EARTH_GRAVITY } from '../simulation/simulationConstants.js'

export const DEFAULT_VEHICLE_SPEC = Object.freeze({
  kind: 'flat-ground-rwd-test-chassis',

  // Core physical properties
  massKg: 1400,

  // Speed limits are still controller-level guards for now.
  maxForwardSpeedMetersPerSecond: 60,
  maxReverseSpeedMetersPerSecond: 12,

  // Longitudinal tire/drive/brake force budgets.
  maxDriveForceNewtons: 6500,
  maxReverseDriveForceNewtons: 2500,
  maxBrakeForceNewtons: 12000,

  // Foundation value for later torque-based wheel dynamics.
  // Current longitudinal motion is still force-based and does not tune behavior from this value.
  wheelInertiaKgMeterSquared: 1.2,

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