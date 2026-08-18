// src/vehicle/config/componentCatalog.js

/**
 * Component catalog for Phase 4 vehicle customization.
 *
 * Each vehicle is modeled as a composition of physically meaningful components
 * selected per slot. A component contributes a set of SI-unit spec fields (and,
 * for the drivetrain, controller-level engine/transmission identifiers) that
 * are merged into the vehicle controller spec by applyVehicleConfiguration.js.
 *
 * All numeric parameters are real SI units (kg, m, s, N, Nm). Where a value is
 * an approximation rather than a measured datum, the description notes it. The
 * default component in every slot intentionally reproduces DEFAULT_VEHICLE_SPEC
 * exactly so that the offroad playground starts at the same vehicle as the
 * proving-ground path and reset-to-default restores the identical baseline.
 */

export const VEHICLE_COMPONENT_SLOTS = Object.freeze([
  'chassis',
  'suspension',
  'wheels',
  'drivetrain',
  'brakes',
  'aero',
])

const CHASSIS_COMPONENTS = Object.freeze({
  'chassis-hatchback': {
    id: 'chassis-hatchback',
    label: 'Hatchback (stock)',
    description:
      'Baseline 1400 kg unibody. Matches the default proving-ground mass and ' +
      'inertia. Wheelbase/track are spec fallbacks for load transfer.',
    spec: {
      massKg: 1400,
      centerOfMassHeightMeters: 0.55,
      wheelbaseMeters: 2.9,
      frontTrackWidthMeters: 2.5,
      rearTrackWidthMeters: 2.5,
      yawMomentOfInertiaKgMeterSquared: 2800,
    },
  },
  'chassis-lightroadster': {
    id: 'chassis-lightroadster',
    label: 'Light Roadster',
    description:
      'Lightweight 1180 kg roadster with a lower center of mass; approximate ' +
      'polar inertia scales with the reduced mass for snappier yaw response.',
    spec: {
      massKg: 1180,
      centerOfMassHeightMeters: 0.48,
      wheelbaseMeters: 2.6,
      frontTrackWidthMeters: 2.3,
      rearTrackWidthMeters: 2.3,
      yawMomentOfInertiaKgMeterSquared: 2200,
    },
  },
  'chassis-suv': {
    id: 'chassis-suv',
    label: 'SUV',
    description:
      'Heavy 1950 kg body-on-frame SUV with raised center of mass and wider ' +
      'track; approximate polar inertia reflects the larger footprint.',
    spec: {
      massKg: 1950,
      centerOfMassHeightMeters: 0.72,
      wheelbaseMeters: 3.0,
      frontTrackWidthMeters: 2.6,
      rearTrackWidthMeters: 2.6,
      yawMomentOfInertiaKgMeterSquared: 3800,
    },
  },
  'chassis-heavytruck': {
    id: 'chassis-heavytruck',
    label: 'Heavy Truck',
    description:
      '3200 kg ladder-frame truck with a high center of mass; approximate polar ' +
      'inertia is dominated by the long wheelbase for slow yaw response.',
    spec: {
      massKg: 3200,
      centerOfMassHeightMeters: 0.92,
      wheelbaseMeters: 4.2,
      frontTrackWidthMeters: 2.7,
      rearTrackWidthMeters: 2.7,
      yawMomentOfInertiaKgMeterSquared: 6400,
    },
  },
})

const SUSPENSION_COMPONENTS = Object.freeze({
  'susp-stock': {
    id: 'susp-stock',
    label: 'Sport Touring (stock)',
    description:
      'Baseline raycast suspension. Rest length and travel match the default ' +
      'spec; static compression and damping are the validated baseline and the ' +
      'support baseline offset is zero.',
    spec: {
      suspensionRestLengthMeters: 0.35,
      suspensionMaximumLengthMeters: 0.35,
      suspensionMinimumLengthMeters: 0.13,
      suspensionTravelMeters: 0.22,
      suspensionTargetStaticCompressionRatio01: 0.4,
      suspensionDampingRatio: 0.35,
      chassisTerrainSupportBaselineOffsetMeters: 0,
    },
  },
  'susp-lowered': {
    id: 'susp-lowered',
    label: 'Lowered',
    description:
      'Negative support baseline offset lowers body ride height; shorter rest ' +
      'length, stiffer damping, and more static compression keep travel within ' +
      'the raycast bounds.',
    spec: {
      suspensionRestLengthMeters: 0.3,
      suspensionMaximumLengthMeters: 0.3,
      suspensionMinimumLengthMeters: 0.11,
      suspensionTravelMeters: 0.19,
      suspensionTargetStaticCompressionRatio01: 0.45,
      suspensionDampingRatio: 0.5,
      chassisTerrainSupportBaselineOffsetMeters: -0.06,
    },
  },
  'susp-lifted': {
    id: 'susp-lifted',
    label: 'Lifted',
    description:
      'Positive support baseline offset raises body ride height; longer rest ' +
      'length, softer damping, and less static compression trade body control ' +
      'for ground clearance.',
    spec: {
      suspensionRestLengthMeters: 0.42,
      suspensionMaximumLengthMeters: 0.42,
      suspensionMinimumLengthMeters: 0.16,
      suspensionTravelMeters: 0.26,
      suspensionTargetStaticCompressionRatio01: 0.32,
      suspensionDampingRatio: 0.3,
      chassisTerrainSupportBaselineOffsetMeters: 0.07,
    },
  },
  'susp-stiff': {
    id: 'susp-stiff',
    label: 'Stiff Track',
    description:
      'Reduced travel and static compression with high damping ratio reduce ' +
      'body motion; support baseline offset stays at zero so ride height is ' +
      'unchanged from stock.',
    spec: {
      suspensionRestLengthMeters: 0.35,
      suspensionMaximumLengthMeters: 0.35,
      suspensionMinimumLengthMeters: 0.19,
      suspensionTravelMeters: 0.16,
      suspensionTargetStaticCompressionRatio01: 0.25,
      suspensionDampingRatio: 0.8,
      chassisTerrainSupportBaselineOffsetMeters: 0,
    },
  },
})

const WHEELS_COMPONENTS = Object.freeze({
  'tires-stock': {
    id: 'tires-stock',
    label: 'Touring Tires (stock)',
    description:
      'Baseline 0.48 m rolling radius, 1.2 kg m^2 wheel inertia, neutral ' +
      'rolling resistance, and the default lateral cornering stiffness.',
    spec: {
      baseTireRollingRadiusMeters: 0.48,
      wheelInertiaKgMeterSquared: 1.2,
      rollingResistanceCoefficient: 0.015,
      lateralTireStiffnessNewtonsPerRadian: 6000,
    },
  },
  'tires-slicks': {
    id: 'tires-slicks',
    label: 'Track Slicks',
    description:
      'Higher lateral cornering stiffness and slightly lower rolling ' +
      'resistance; larger radius and lighter wheel reduce rotational inertia.',
    spec: {
      baseTireRollingRadiusMeters: 0.49,
      wheelInertiaKgMeterSquared: 1.1,
      rollingResistanceCoefficient: 0.012,
      lateralTireStiffnessNewtonsPerRadian: 9000,
    },
  },
  'tires-allterrain': {
    id: 'tires-allterrain',
    label: 'All-Terrain',
    description:
      'Taller, heavier tire with higher rolling resistance; reduced lateral ' +
      'stiffness reflects the compliant sidewall offroad use case.',
    spec: {
      baseTireRollingRadiusMeters: 0.5,
      wheelInertiaKgMeterSquared: 1.4,
      rollingResistanceCoefficient: 0.025,
      lateralTireStiffnessNewtonsPerRadian: 5200,
    },
  },
  'tires-lowprofile': {
    id: 'tires-lowprofile',
    label: 'Low-Profile',
    description:
      'Smaller radius and lighter wheel for quicker spin-up; higher lateral ' +
      'stiffness from the short sidewall, modest rolling resistance.',
    spec: {
      baseTireRollingRadiusMeters: 0.44,
      wheelInertiaKgMeterSquared: 1.0,
      rollingResistanceCoefficient: 0.014,
      lateralTireStiffnessNewtonsPerRadian: 7000,
    },
  },
})

const DRIVETRAIN_COMPONENTS = Object.freeze({
  'drivetrain-stock': {
    id: 'drivetrain-stock',
    label: 'Inline-4 + Auto (stock)',
    description:
      'Default inline-4 engine, automatic-6 transmission, and an open rear ' +
      'differential. Matches the validated baseline powertrain.',
    engineId: 'inline-4',
    transmissionId: 'automatic-6',
    spec: {
      rearDifferentialType: 'open',
    },
  },
  'drivetrain-sport': {
    id: 'drivetrain-sport',
    label: 'V8 + 6-Speed (LSD)',
    description:
      'Larger V8 torque curve with a manual-6 gearbox and a limited-slip rear ' +
      'differential for improved traction at the driven axle.',
    engineId: 'v8',
    transmissionId: 'manual-6',
    spec: {
      rearDifferentialType: 'limited-slip',
    },
  },
  'drivetrain-eco': {
    id: 'drivetrain-eco',
    label: 'Inline-3 + CVT (Eco)',
    description:
      'Small inline-3 with a CVT for efficiency; open differential keeps the ' +
      'baseline torque-split behavior.',
    engineId: 'inline-3',
    transmissionId: 'cvt',
    spec: {
      rearDifferentialType: 'open',
    },
  },
  'drivetrain-rally': {
    id: 'drivetrain-rally',
    label: 'V6 + 6-Speed (Locked)',
    description:
      'V6 torque with a manual-6 gearbox and a locked rear differential for ' +
      'maximum driven-axle coupling offroad.',
    engineId: 'v6',
    transmissionId: 'manual-6',
    spec: {
      rearDifferentialType: 'locked',
    },
  },
})

const BRAKES_COMPONENTS = Object.freeze({
  'brakes-stock': {
    id: 'brakes-stock',
    label: 'Ventilated Discs (stock)',
    description:
      'Baseline 1200 Nm service brake torque and 12000 N brake force budget. ' +
      'Matches the default spec.',
    spec: {
      maxServiceBrakeTorqueNewtonMeters: 1200,
      maxBrakeForceNewtons: 12000,
    },
  },
  'brakes-eco': {
    id: 'brakes-eco',
    label: 'Drum (Weak)',
    description:
      'Smaller 800 Nm service brake torque and 8000 N budget for reduced ' +
      'deceleration authority; useful to contrast brake-limited vs grip-limited stops.',
    spec: {
      maxServiceBrakeTorqueNewtonMeters: 800,
      maxBrakeForceNewtons: 8000,
    },
  },
  'brakes-sport': {
    id: 'brakes-sport',
    label: 'Sport Discs',
    description:
      'Larger 1600 Nm service brake torque and 16000 N budget for stronger ' +
      'deceleration authority.',
    spec: {
      maxServiceBrakeTorqueNewtonMeters: 1600,
      maxBrakeForceNewtons: 16000,
    },
  },
  'brakes-big': {
    id: 'brakes-big',
    label: 'Big Brake Kit',
    description:
      '2000 Nm service brake torque and 20000 N budget; heaviest decel ' +
      'authority, at the cost of added unsprung mass behavior via torque.',
    spec: {
      maxServiceBrakeTorqueNewtonMeters: 2000,
      maxBrakeForceNewtons: 20000,
    },
  },
})

const AERO_COMPONENTS = Object.freeze({
  'aero-stock': {
    id: 'aero-stock',
    label: 'Standard Body (stock)',
    description:
      'Baseline drag coefficient and frontal area with downforce disabled. ' +
      'Matches the default spec.',
    spec: {
      dragCoefficient: 0.32,
      frontalAreaSquareMeters: 2.2,
      aeroDownforceEnabled: false,
      aeroDownforceCoefficientNewtonsPerMeterSquared: 3.0,
      aeroLiftCoefficientNewtonsPerMeterSquared: 0,
    },
  },
  'aero-slippery': {
    id: 'aero-slippery',
    label: 'Slippery',
    description:
      'Reduced drag coefficient and frontal area with mild downforce for ' +
      'lower high-speed resistance.',
    spec: {
      dragCoefficient: 0.27,
      frontalAreaSquareMeters: 1.9,
      aeroDownforceEnabled: false,
      aeroDownforceCoefficientNewtonsPerMeterSquared: 5.0,
      aeroLiftCoefficientNewtonsPerMeterSquared: 0,
    },
  },
  'aero-downforce': {
    id: 'aero-downforce',
    label: 'Downforce Wing',
    description:
      'Higher drag from the rear wing but strong speed-squared downforce that ' +
      'adds vertical tire load at speed (enables the gated aero seam).',
    spec: {
      dragCoefficient: 0.34,
      frontalAreaSquareMeters: 2.3,
      aeroDownforceEnabled: true,
      aeroDownforceCoefficientNewtonsPerMeterSquared: 12.0,
      aeroLiftCoefficientNewtonsPerMeterSquared: 0,
    },
  },
  'aero-brick': {
    id: 'aero-brick',
    label: 'Boxy',
    description:
      'High drag coefficient and frontal area with no downforce; the highest ' +
      'high-speed resistance case.',
    spec: {
      dragCoefficient: 0.45,
      frontalAreaSquareMeters: 2.6,
      aeroDownforceEnabled: false,
      aeroDownforceCoefficientNewtonsPerMeterSquared: 0,
      aeroLiftCoefficientNewtonsPerMeterSquared: 0,
    },
  },
})

export const VEHICLE_COMPONENT_CATALOG = Object.freeze({
  chassis: {
    defaultComponentId: 'chassis-hatchback',
    components: CHASSIS_COMPONENTS,
  },
  suspension: {
    defaultComponentId: 'susp-stock',
    components: SUSPENSION_COMPONENTS,
  },
  wheels: {
    defaultComponentId: 'tires-stock',
    components: WHEELS_COMPONENTS,
  },
  drivetrain: {
    defaultComponentId: 'drivetrain-stock',
    components: DRIVETRAIN_COMPONENTS,
  },
  brakes: {
    defaultComponentId: 'brakes-stock',
    components: BRAKES_COMPONENTS,
  },
  aero: {
    defaultComponentId: 'aero-stock',
    components: AERO_COMPONENTS,
  },
})

export function getComponentSlot(slot) {
  return VEHICLE_COMPONENT_CATALOG[slot] ?? null
}

export function getComponent(slot, componentId) {
  const slotEntry = getComponentSlot(slot)
  if (!slotEntry) return null
  return slotEntry.components[componentId] ?? null
}

export function getDefaultComponentId(slot) {
  const slotEntry = getComponentSlot(slot)
  return slotEntry ? slotEntry.defaultComponentId : null
}
