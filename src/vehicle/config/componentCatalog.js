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
  'suspensionFront',
  'suspensionRear',
  'wheels',
  'drivetrain',
  'brakes',
  'aero',
])

// The spec fields a suspension component owns on the vehicle spec.
//
// Selecting a suspension component REPLACES these fields on the vehicle
// spec. A component therefore has to declare every field it owns, so
// swapping back to a component that does not use a value clears a value a
// previously selected component set.
//
// The axle coupling mode is NOT on this list. Each archetype declares its
// mechanism as 'axleCoupling', and the slot selection DERIVES the runtime
// spec fields 'frontAxleCoupling' and 'rearAxleCoupling' from it: the
// front slot's archetype determines 'frontAxleCoupling' and the rear
// slot's archetype determines 'rearAxleCoupling'. Each slot's nested
// suspension spec is consumed by its axle; the flat physical fields remain
// front-slot aliases for legacy consumers.
//
// The camber fields carry live physics: the static camber and the
// archetype's camber gain per meter of suspension travel, both read by the
// camber state and the camber thrust term.
//
// 'solidAxleRollCenterHeightMeters' is the roll-center height of a
// coupled (solid) axle. It is a leaf-pack property, so it is declared here
// instead of derived from a linkage, and it is what shortens the elastic
// roll arm of a car with a solid axle.
//
// 'suspensionVisualKind' is the one field in this list that carries NO
// physics. It selects which archetype-specific geometry the renderer
// draws for the suspension, and no force model reads it. It is owned by
// the slot all the same, so swapping back to a component that draws no
// archetype geometry clears a visual kind a previously selected
// component set.
export const SUSPENSION_OWNED_SPEC_FIELDS = Object.freeze([
  'suspensionRestLengthMeters',
  'suspensionMaximumLengthMeters',
  'suspensionMinimumLengthMeters',
  'suspensionTravelMeters',
  'suspensionTargetStaticCompressionRatio01',
  'suspensionDampingRatio',
  'suspensionBumpStopEngagementMeters',
  'suspensionBumpStopMaximumForceNewtons',
  'suspensionReboundStopEngagementMeters',
  'suspensionReboundStopMaximumForceNewtons',
  'chassisTerrainSupportBaselineOffsetMeters',
  'suspensionVisualKind',
  'camberStaticRadians',
  'camberGainRadiansPerMeterCompression',
  'suspensionLinkage',
  'solidAxleRollCenterHeightMeters',
  'antiRollBarStiffnessNewtonsPerMeter',
])

// The coupling mode each suspension slot derives onto the runtime spec.
// 'axleCoupling' is a component-declared value, not a spec field: the
// archetype states what kind of mechanism it is, and the slot it is
// installed in decides which axle's coupling mode that produces.
export const SUSPENSION_FRONT_OWNED_SPEC_FIELDS = Object.freeze([
  ...SUSPENSION_OWNED_SPEC_FIELDS,
  'frontAxleCoupling',
])

export const SUSPENSION_REAR_OWNED_SPEC_FIELDS = Object.freeze([
  ...SUSPENSION_OWNED_SPEC_FIELDS,
  'rearAxleCoupling',
])

// The spec fields the chassis component owns.
//
// Selecting a chassis component REPLACES these fields on the vehicle spec.
// All of them are live physics properties: the mass, center-of-mass height
// and polar inertia feed the planar and vertical dynamics directly, and the
// wheelbase and the track widths are the authoritative chassis geometry that
// the load transfer, the chassis mass properties and the vertical dynamics
// all read (see resolveChassisGeometry). The rendered body mesh also reads
// the chassis geometry and the visual-only 'bodyVisualKind' so the drawn
// vehicle follows the selected chassis archetype.
export const CHASSIS_OWNED_SPEC_FIELDS = Object.freeze([
  'massKg',
  'centerOfMassHeightMeters',
  'wheelbaseMeters',
  'frontTrackWidthMeters',
  'rearTrackWidthMeters',
  'yawMomentOfInertiaKgMeterSquared',
  'bodyVisualKind',
])

// The spec fields the wheels component owns.
//
// The rolling resistance and the lateral cornering stiffness are read live
// every step. The wheel inertia is copied into the per-wheel runtime states
// when the wheel state is built, so it has to be re-synced on a swap. The
// base rolling radius is a fallback only: the rendered wheel owns the real
// tire radius, so this value does not change the drawn tire.
export const WHEELS_OWNED_SPEC_FIELDS = Object.freeze([
  'baseTireRollingRadiusMeters',
  'wheelInertiaKgMeterSquared',
  'rollingResistanceCoefficient',
  'lateralTireStiffnessNewtonsPerRadian',
])

// The spec fields the drivetrain component owns.
//
// The engine and the transmission are controller-level profiles rather than
// spec fields, so they are applied through their own profile APIs.
export const DRIVETRAIN_OWNED_SPEC_FIELDS = Object.freeze([
  'rearDifferentialType',
  'throttleResponseTimeSeconds',
  'throttleReleaseTimeSeconds',
])

// The spec fields the brakes component owns.
export const BRAKES_OWNED_SPEC_FIELDS = Object.freeze([
  'maxServiceBrakeTorqueNewtonMeters',
  'maxBrakeForceNewtons',
])

// The spec fields the aero component owns.
export const AERO_OWNED_SPEC_FIELDS = Object.freeze([
  'dragCoefficient',
  'frontalAreaSquareMeters',
  'aeroDownforceEnabled',
  'aeroDownforceCoefficientNewtonsPerMeterSquared',
  'aeroLiftCoefficientNewtonsPerMeterSquared',
])

const CHASSIS_COMPONENTS = Object.freeze({
  'chassis-hatchback': {
    id: 'chassis-hatchback',
    label: 'Hatchback (stock)',
    description:
      'Baseline 1400 kg unibody. Matches the default proving-ground mass and ' +
      'inertia.' +
      ' The wheelbase, front track, rear track, mass, center-of-mass height ' +
      'and yaw inertia are live physics properties: the load transfer, the ' +
      'chassis mass properties and the vertical dynamics all honor them.' +
      ' Visual note: the rendered body mesh follows this hatchback geometry.',

    spec: {
      massKg: 1400,
      centerOfMassHeightMeters: 0.55,
      wheelbaseMeters: 2.9,
      frontTrackWidthMeters: 2.5,
      rearTrackWidthMeters: 2.5,
      yawMomentOfInertiaKgMeterSquared: 2800,
      bodyVisualKind: 'hatchback',
    },
  },
  'chassis-lightroadster': {
    id: 'chassis-lightroadster',
    label: 'Light Roadster',
    description:
      'Lightweight 1180 kg roadster with a lower center of mass; approximate ' +
      'polar inertia scales with the reduced mass for snappier yaw response.' +
      ' The wheelbase, front track, rear track, mass, center-of-mass height ' +
      'and yaw inertia are live physics properties: the load transfer, the ' +
      'chassis mass properties and the vertical dynamics all honor them.' +
      ' Visual note: the rendered body mesh follows this roadster geometry.',

    spec: {
      massKg: 1180,
      centerOfMassHeightMeters: 0.48,
      wheelbaseMeters: 2.6,
      frontTrackWidthMeters: 2.3,
      rearTrackWidthMeters: 2.3,
      yawMomentOfInertiaKgMeterSquared: 2200,
      bodyVisualKind: 'roadster',
    },
  },
  'chassis-suv': {
    id: 'chassis-suv',
    label: 'SUV',
    description:
      'Heavy 1950 kg SUV with raised center of mass and wider track; ' +
      'approximate polar inertia reflects the larger footprint.' +
      ' The wheelbase, front track, rear track, mass, center-of-mass height ' +
      'and yaw inertia are live physics properties: the load transfer, the ' +
      'chassis mass properties and the vertical dynamics all honor them.' +
      ' Visual note: the rendered body mesh follows this SUV geometry.',

    spec: {
      massKg: 1950,
      centerOfMassHeightMeters: 0.72,
      wheelbaseMeters: 3.0,
      frontTrackWidthMeters: 2.6,
      rearTrackWidthMeters: 2.6,
      yawMomentOfInertiaKgMeterSquared: 3800,
      bodyVisualKind: 'suv',
    },
  },
  'chassis-heavytruck': {
    id: 'chassis-heavytruck',
    label: 'Heavy Truck',
    description:
      '3200 kg truck with a high center of mass; approximate polar inertia ' +
      'is dominated by the long wheelbase for slow yaw response.' +
      ' The wheelbase, front track, rear track, mass, center-of-mass height ' +
      'and yaw inertia are live physics properties: the load transfer, the ' +
      'chassis mass properties and the vertical dynamics all honor them.' +
      ' Visual note: the rendered body mesh follows this truck geometry.',

    spec: {
      massKg: 3200,
      centerOfMassHeightMeters: 0.92,
      wheelbaseMeters: 4.2,
      frontTrackWidthMeters: 2.7,
      rearTrackWidthMeters: 2.7,
      yawMomentOfInertiaKgMeterSquared: 6400,
      bodyVisualKind: 'truck',
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
      suspensionBumpStopEngagementMeters: 0.05,
      suspensionBumpStopMaximumForceNewtons: 10000,
      suspensionReboundStopEngagementMeters: 0.04,
      suspensionReboundStopMaximumForceNewtons: 5000,
      chassisTerrainSupportBaselineOffsetMeters: 0,
      axleCoupling: 'independent',
      suspensionVisualKind: 'independent',
      camberStaticRadians: 0,
      camberGainRadiansPerMeterCompression: 0,
      antiRollBarStiffnessNewtonsPerMeter: 0,
      solidAxleRollCenterHeightMeters: 0,
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
      suspensionBumpStopEngagementMeters: 0.05,
      suspensionBumpStopMaximumForceNewtons: 10000,
      suspensionReboundStopEngagementMeters: 0.04,
      suspensionReboundStopMaximumForceNewtons: 5000,
      chassisTerrainSupportBaselineOffsetMeters: -0.06,
      axleCoupling: 'independent',
      suspensionVisualKind: 'none',
      camberStaticRadians: 0,
      camberGainRadiansPerMeterCompression: 0,
      antiRollBarStiffnessNewtonsPerMeter: 0,
      solidAxleRollCenterHeightMeters: 0,
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
      suspensionBumpStopEngagementMeters: 0.05,
      suspensionBumpStopMaximumForceNewtons: 10000,
      suspensionReboundStopEngagementMeters: 0.04,
      suspensionReboundStopMaximumForceNewtons: 5000,
      chassisTerrainSupportBaselineOffsetMeters: 0.07,
      axleCoupling: 'independent',
      suspensionVisualKind: 'none',
      camberStaticRadians: 0,
      camberGainRadiansPerMeterCompression: 0,
      antiRollBarStiffnessNewtonsPerMeter: 0,
      solidAxleRollCenterHeightMeters: 0,
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
      suspensionBumpStopEngagementMeters: 0.05,
      suspensionBumpStopMaximumForceNewtons: 10000,
      suspensionReboundStopEngagementMeters: 0.04,
      suspensionReboundStopMaximumForceNewtons: 5000,
      chassisTerrainSupportBaselineOffsetMeters: 0,
      axleCoupling: 'independent',
      suspensionVisualKind: 'none',
      camberStaticRadians: 0,
      camberGainRadiansPerMeterCompression: 0,
      antiRollBarStiffnessNewtonsPerMeter: 0,
      solidAxleRollCenterHeightMeters: 0,
    },
  },
  'susp-solid-axle': {
    id: 'susp-solid-axle',
    label: 'Solid Axle (shared leaf)',
    description:
      'A rigid beam axle carried on one shared leaf. Selecting it for the ' +
      'rear slot couples the rear axle; selecting it for the front slot ' +
      'couples the front axle instead, and the other axle stays ' +
      'independent. Both wheels on the coupled axle report the same ' +
      'suspension length, so a one-sided bump lifts one wheel and holds ' +
      'the other up instead of letting it droop. The shared leaf uses the ' +
      'stock linear spring rate; there is no progressive leaf model, no ' +
      'anti-roll bar, no unsprung-mass model, and no per-corner spring ' +
      'rates. The leaf pack gives the coupled axle a 0.25 m roll-center ' +
      'height, so the roll axis sits above the ground and the body rolls ' +
      'less than it would over a ground-level roll axis. The rigid beam ' +
      'still takes no lateral load transfer across its own tires: the ' +
      'beam articulation and the leaf torsional stiffness that would ' +
      'produce it are not modelled.',
    spec: {
      suspensionRestLengthMeters: 0.35,
      suspensionMaximumLengthMeters: 0.35,
      suspensionMinimumLengthMeters: 0.13,
      suspensionTravelMeters: 0.22,
      suspensionTargetStaticCompressionRatio01: 0.4,
      suspensionDampingRatio: 0.35,
      suspensionBumpStopEngagementMeters: 0.05,
      suspensionBumpStopMaximumForceNewtons: 10000,
      suspensionReboundStopEngagementMeters: 0.04,
      suspensionReboundStopMaximumForceNewtons: 5000,
      chassisTerrainSupportBaselineOffsetMeters: 0,
      axleCoupling: 'rigidAxle',
      suspensionVisualKind: 'none',
      camberStaticRadians: 0,
      camberGainRadiansPerMeterCompression: 0,
      antiRollBarStiffnessNewtonsPerMeter: 0,
      solidAxleRollCenterHeightMeters: 0.25,
    },
  },
  'susp-macpherson-strut': {
    id: 'susp-macpherson-strut',
    label: 'MacPherson Strut (camber gain)',
    description:
      'The front axle uses MacPherson struts; the rear axle stays ' +
      'independent. Physics: the same independent suspension model as ' +
      'stock - this entry changes no spring rate, travel, damping, or ' +
      'coupling mode - plus a positive camber gain derived from the ' +
      'front-view strut linkage, about +0.52 deg per 100 mm of wheel ' +
      'travel. The linear camber-gain coefficient is zeroed so the ' +
      'geometry owns the camber curve. ' +
      'A compressed strut wheel gains positive camber, so the tire gives ' +
      'up a little lateral force in a corner and this entry does change ' +
      'handling. The camber gain applies to every wheel of the archetype: ' +
      'the camber model has no per-axle camber gain. Visual: a coil-over ' +
      'strut per front corner. The camber gain is modelled, and the same ' +
      'linkage also supplies the roll-center height the vertical dynamics ' +
      'consumes, so the body rolls less than the stock setup. The ' +
      'roll-center parameters of a real strut - scrub, anti-dive, and the ' +
      'sprung mass path - are still not modelled, and the derived height ' +
      'comes from the schematic front-view linkage rather than from a ' +
      'dimensioned car.',
    spec: {
      suspensionRestLengthMeters: 0.35,
      suspensionMaximumLengthMeters: 0.35,
      suspensionMinimumLengthMeters: 0.13,
      suspensionTravelMeters: 0.22,
      suspensionTargetStaticCompressionRatio01: 0.4,
      suspensionDampingRatio: 0.35,
      suspensionBumpStopEngagementMeters: 0.05,
      suspensionBumpStopMaximumForceNewtons: 10000,
      suspensionReboundStopEngagementMeters: 0.04,
      suspensionReboundStopMaximumForceNewtons: 5000,
      chassisTerrainSupportBaselineOffsetMeters: 0,
      axleCoupling: 'independent',
      suspensionVisualKind: 'macphersonStrut',
      camberStaticRadians: 0,
      camberGainRadiansPerMeterCompression: 0,
      antiRollBarStiffnessNewtonsPerMeter: 0,
      solidAxleRollCenterHeightMeters: 0,
      suspensionLinkage: {
        kind: 'macpherson-strut',
        leftSide: {
          strut: {
            upperMount: { xMeters: 0.71, yMeters: 0.945 },
          },
          lowerArm: {
            innerPivot: { xMeters: 0.05, yMeters: 0.18 },
            outerJoint: { xMeters: 0.7, yMeters: 0.1 },
          },
        },
      },
    },
  },
  'susp-double-wishbone': {
    id: 'susp-double-wishbone',
    label: 'Double Wishbone (SLA)',
    description:
      'The suspension keeps the stock spring rate, travel, damping and ' +
      'independent coupling, and adds the double wishbone\'s defining ' +
      'behavior: a negative camber gain derived from the front-view A-arm ' +
      'linkage, about -1.64 deg per 100 mm of wheel travel. A compressed ' +
      'wishbone wheel gains negative camber, so the tire keeps a little ' +
      'more lateral force in a corner than the stock setup, and more than ' +
      'the MacPherson strut, which gains positive camber instead. The ' +
      'camber comes from the linkage solver, not a tuned coefficient: the ' +
      'linear camber-gain coefficient is zeroed so the geometry owns the ' +
      'camber curve. Visual: schematic A-arms use invented symmetric ' +
      '+/-0.15 m fore-aft inner-pivot spacing because linkage physics is ' +
      'front-view only. A visual-only hub carrier bridges the ball joints ' +
      'to the wheel hub. Caster and anti-dive are not modelled. The ' +
      'wishbone linkage also supplies the roll-center height the vertical ' +
      'dynamics consumes, so the body rolls less than the stock setup. The ' +
      'roll-center parameters of a real car - jacking forces, scrub, and ' +
      'the sprung mass path - are still not modelled, and the derived ' +
      'height comes from the schematic front-view linkage rather than from ' +
      'a dimensioned car.',
    spec: {
      suspensionRestLengthMeters: 0.35,
      suspensionMaximumLengthMeters: 0.35,
      suspensionMinimumLengthMeters: 0.13,
      suspensionTravelMeters: 0.22,
      suspensionTargetStaticCompressionRatio01: 0.4,
      suspensionDampingRatio: 0.35,
      suspensionBumpStopEngagementMeters: 0.05,
      suspensionBumpStopMaximumForceNewtons: 10000,
      suspensionReboundStopEngagementMeters: 0.04,
      suspensionReboundStopMaximumForceNewtons: 5000,
      chassisTerrainSupportBaselineOffsetMeters: 0,
      axleCoupling: 'independent',
      suspensionVisualKind: 'doubleWishbone',
      camberStaticRadians: 0,
      camberGainRadiansPerMeterCompression: 0,
      antiRollBarStiffnessNewtonsPerMeter: 0,
      solidAxleRollCenterHeightMeters: 0,
      suspensionLinkage: {
        kind: 'double-wishbone',
        leftSide: {
          upperArm: {
            innerPivot: { xMeters: 0.18, yMeters: 0.45 },
            outerJoint: { xMeters: 0.65, yMeters: 0.46 },
          },
          lowerArm: {
            innerPivot: { xMeters: 0.21, yMeters: 0.2 },
            outerJoint: { xMeters: 0.7, yMeters: 0.17 },
          },
        },
      },
    },
  },
})

const WHEELS_COMPONENTS = Object.freeze({
  'tires-stock': {
    id: 'tires-stock',
    label: 'Touring Tires (stock)',
    description:
      'Baseline 0.48 m rolling radius, 1.2 kg m^2 wheel inertia, neutral ' +
      'rolling resistance, and the default lateral cornering stiffness.' +
      ' Radius note: cosmetic in the current mesh-driven model - the ' +
      'rendered tire keeps its fixed 0.48 m radius, so this value is a ' +
      'fallback only.',

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
      'resistance; larger radius and lighter wheel reduce rotational inertia.' +
      ' Radius note: cosmetic in the current mesh-driven model - the ' +
      'rendered tire keeps its fixed 0.48 m radius, so this value is a ' +
      'fallback only.',

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
      'stiffness reflects the compliant sidewall offroad use case.' +
      ' Radius note: cosmetic in the current mesh-driven model - the ' +
      'rendered tire keeps its fixed 0.48 m radius, so this value is a ' +
      'fallback only.',

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
      'stiffness from the short sidewall, modest rolling resistance.' +
      ' Radius note: cosmetic in the current mesh-driven model - the ' +
      'rendered tire keeps its fixed 0.48 m radius, so this value is a ' +
      'fallback only.',

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
      throttleResponseTimeSeconds: 0.3,
      throttleReleaseTimeSeconds: 0.15,
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
      'Bigger discs provide 2000 Nm service brake torque and a 20000 N budget, ' +
      'with higher thermal capacity for sustained braking.',
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
      aeroLiftCoefficientNewtonsPerMeterSquared: 0,
    },
  },
  'aero-slippery': {
    id: 'aero-slippery',
    label: 'Slippery',
    description:
      'Reduced drag coefficient and frontal area, with downforce disabled for ' +
      'lower high-speed resistance.',
    spec: {
      dragCoefficient: 0.27,
      frontalAreaSquareMeters: 1.9,
      aeroDownforceEnabled: false,
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
  suspensionFront: {
    defaultComponentId: 'susp-stock',
    components: SUSPENSION_COMPONENTS,
  },
  suspensionRear: {
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
