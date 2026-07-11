Simulation units:
- 1 world unit = 1 meter.
- Time is measured in seconds.
- Velocity is measured in meters per second.
- Acceleration is measured in meters per second squared.
- Y is vertical.
- Gravity points in negative Y.
- Standard gravity is 9.80665 m/s².


## Simulation Loop

Vehicle simulation advances in fixed `1 / 60` second physics steps while rendering remains driven by `requestAnimationFrame`. Terrain contact, suspension support, tire force, and planar chassis integration remain fixed-step state; rendering only visualizes published snapshots without tying core physics to render frame rate.

## Vehicle Dynamics V2 Readiness / Step Trace

Vehicle Dynamics Step Trace v1 is a telemetry and instrumentation layer only. It keeps one finite, JSON-serializable latest-step record and does not change the fixed timestep, force formulas, braking, ABS, powertrain, load transfer, suspension, aero drag, yaw integration, or vehicle motion.

The trace records the current step dt and compact per-wheel data plus two force-budget stages: `integrationInput`, which is the force and yaw budget consumed by the current fixed step, and `postIntegration`, which retains that same contact/force budget after planar integration for comparison. Each stage summarizes grounded wheels, normal load, traction limit, longitudinal requested/target/relaxed/applied force, lateral force, planar force, yaw moment, aero drag, slope gravity, and force-derived acceleration/G. The Debug HUD shows a compact `Dynamics trace` line using the integration-input stage.

This source-of-truth seam prepares future V2 branches by making update-order and force-source regressions easier to detect without adding a history buffer or storing Three.js objects. True chassis heave, pitch, and roll plus richer combined tire modeling remain future work and are not implemented here.


## Wheel Contact State

Per-wheel contact now uses a deterministic heightfield query and a downward suspension ray rather than a wheel-center-versus-flat-ground shortcut. Every wheel records its suspension mount/axis, ray result, effective physical tire radius, terrain contact point/normal/slope, contact status, current suspension length, and grounded/airborne state. The physical tire radius comes from the existing tire-pressure handling state; rendered tire deformation remains visual-only.

The controller uses small acquire/release slop around maximum droop to avoid one-frame flicker. Airborne wheels receive zero normal force and no traction. The contact query remains an abstraction: `createFlatTerrainContactQuery` continues to support flat compatibility callers, while the normal application path uses the heightfield query.

## Wheel Rotational State

Wheels now carry explicit rotational state used by visual wheel spin. Wheel angular velocity now integrates from simple drive/brake/contact torque, wheel inertia, and a temporary rolling correction. Wheel lock and richer tire curves remain future work.

Each tire includes a high-contrast visual witness mark attached to the rotating wheel assembly. The mark is a debugging aid for inspecting wheel spin, rolling, braking, and skating artifacts; it does not affect physics.


## Brake System Foundation

The normal service brake and the parking brake are now separate command paths. The service brake remains the `S` brake-pedal input and applies service brake torque to all wheels through the existing braking path. The parking brake is a separate hold input on `Space`, defaults to rear wheels only, and contributes its own parking-brake torque component.

Per-wheel telemetry records service brake pressure, parking brake pressure, requested/applied service brake torque, requested/applied parking brake torque, and total brake torque command magnitude. The existing `brakeTorqueNewtonMeters` field remains the signed wheel torque component consumed by net wheel torque. Brake lock tendency telemetry can identify service-brake versus parking-brake source, and service-brake ABS v1 now modulates only the service-brake torque path.

Service brake input continues to drive the brake lights. Parking brake alone is intentionally not treated as the normal brake-light signal in this simulation branch.


## Service Brake ABS v1

Service-brake ABS v1 now modulates service brake torque per wheel when service-brake lock tendency or braking slip indicates imminent lock. Each wheel records ABS state, modulation, release intent, and service brake torque before/after ABS so the debug HUD can show which wheels are releasing, holding, or reapplying brake torque.

ABS applies only to the service brake path. Parking brake torque remains a separate rear-wheel-only command path and is explicitly excluded from ABS modulation. This is a staged controller foundation, not a full production ABS model; it does not change friction, traction limits, tire pressure behavior, brake assist, traction control, stability control, suspension, load transfer, the new lateral tire-force path, or full combined-slip modeling.

## Service Brake Bias v1

Service brake torque is now distributed using a front-biased axle split.
The `serviceBrakeFrontBias01` spec value (default 0.65) controls the
fraction of total requested service brake torque sent to the front axle;
the rear axle receives the remainder.

Brake bias applies only to the service brake path. Parking brake remains
rear-only and is unaffected by service brake bias. ABS still modulates
only the service brake path.

Brake bias does not directly change `frictionCoefficient`,
`normalForceNewtons`, or `tractionLimitNewtons`; the traction limit
remains `frictionCoefficient * normalForceNewtons`. There is no hydraulic
brake model, brake heat, fade, wear, or damage model.


## Longitudinal Slip Ratio Telemetry

Each wheel records longitudinal slip ratio telemetry by comparing wheel surface speed with contact-plane longitudinal ground speed. Positive slip means wheel surface speed exceeds ground speed in the current longitudinal direction; negative slip means the wheel surface is slower. Ground speed is projected from the planar contact-patch velocity into the current terrain/steering tangent basis. Slip ratio now feeds the basic longitudinal tire-force model, and the service-brake ABS v1 controller can also read it while richer wheel-lock detection and tire curves remain future work.


## Torque-Coupled Wheel Dynamics

Wheel angular velocity now integrates from simple net torque and wheel inertia. The wheel torque path remains staged, while the body now receives world-space planar force and yaw moment from the per-wheel tire-force pipeline. A weak temporary rolling correction remains as numerical stabilization only; it is not the tire model and should be removed or reduced as tire modeling improves.


## Basic Linear Longitudinal Tire Model

Longitudinal tire force now comes from a simple linear/saturated slip-ratio model. Each wheel computes an uncapped force from longitudinal slip ratio and `longitudinalTireStiffnessNewtonsPerSlipRatio`, then caps applied force by `frictionCoefficient * normalForceNewtons`. Longitudinal and lateral components now also share a basic combined friction cap, and traction limits follow each wheel's suspension-produced normal force. This remains a staged foundation: it is not Pacejka, not a professional tire model, not a full combined-slip curve, and not a full rigid-body chassis or suspension model.


## Planar Chassis Motion

Vehicle heading and world velocity are now separate planar state. The controller tracks world-space planar velocity, vehicle-local forward velocity, vehicle-local lateral velocity, yaw angle, yaw rate, yaw acceleration, and planar acceleration telemetry. Per-wheel tire forces now sum into world-space planar body force, while `speedScalar` remains a compatibility alias for signed local-forward velocity.

Turning generates lateral tire force and yaw moment from per-wheel contact/slip state instead of relying on the earlier simplified steering-yaw shortcut. Contact-plane tire forces may include a slope-induced Y component, but only their consistent X/Z projection enters this planar integrator and yaw budget. Suspension-derived base support is normalized before prior-step-acceleration load-transfer deltas produce final wheel normal force. This is still a staged chassis foundation, not a full rigid-body vehicle model: there is no dynamic chassis heave, pitch or roll dynamics, roll-center geometry, or visual chassis roll or pitch simulation.


## Aerodynamic Drag Foundation v1

Aerodynamic drag is now an explicit part of vehicle motion. The controller uses horizontal world velocity and the standard quadratic drag equation, `0.5 * airDensityKgPerCubicMeter * dragCoefficient * frontalAreaSquareMeters * speedMetersPerSecond^2`, then applies the resulting force directly opposite that horizontal velocity. Default values are enabled, `1.225 kg/m^3` air density, `0.32` drag coefficient, and `2.2 m^2` frontal area (`CdA 0.70`). The Debug HUD reports compact drag magnitude, CdA, and horizontal speed telemetry.

This v1 foundation adds no downforce, lift, wind, drafting, damage, or heat model. Tire force formulas and caps, service and parking brakes, ABS, brake bias, tire pressure and visuals, load transfer, lateral dynamics, steering/yaw, powertrain RPM and engine catalog data, terrain, rendering architecture, and fixed timestep behavior are otherwise unchanged.

## Chassis Mass Properties Foundation v1

Chassis mass properties are now surfaced as explicit finite telemetry derived from the existing vehicle specification and wheel layout. The snapshot reports mass, center-of-mass height and offset, static front/rear weight bias, wheelbase, front/rear track width, and yaw moment of inertia. Existing flat spec fields such as `massKg`, `centerOfMassHeightMeters`, `wheelbaseMeters`, `frontTrackWidthMeters`, `rearTrackWidthMeters`, and `yawMomentOfInertiaKgMeterSquared` remain the source data rather than being duplicated into a separate tuning model.

Center of mass and yaw inertia are foundation data for yaw, load transfer, and suspension work. The suspension normal-force foundation reads the existing mass and gravity inputs without changing mass-property behavior. Full chassis heave, pitch and roll dynamics, jumps, collision response, surface friction zones, aero downforce, and damage remain outside the current model.

## Lateral Slip Angle Telemetry

Each wheel continues to record lateral slip angle by estimating contact-patch velocity from planar chassis velocity and yaw rate, then projecting that velocity into the wheel's current local forward/right axes. Front steerable wheels use current steering angle telemetry, rear wheels use chassis heading, and the vehicle snapshot exposes a compact aggregate lateral-slip summary for the debug HUD.

That telemetry now feeds the first basic lateral tire-force branch. Straight-line driving should stay near zero lateral slip angle, while turning can now produce meaningful per-wheel slip-angle, lateral-force, and yaw telemetry for future tire-curve, understeer, and oversteer work.

## Basic Lateral Tire Force v1

Each grounded wheel now converts lateral slip angle into a basic linear lateral tire force using `-lateralTireStiffnessNewtonsPerRadian * lateralSlipAngleRadians`. The force is capped by each wheel's existing `frictionCoefficient * normalForceNewtons`, and longitudinal plus lateral components then share a simple combined friction cap so a wheel cannot exceed its current traction limit when both components are active.

The vehicle body now receives summed world-space planar tire force and a basic yaw moment from per-wheel tire forces applied at wheel offsets. This is an inspectable v1 foundation, not Pacejka, not a professional tire model, not a full combined-slip model, and not a full suspension geometry, stability control, traction control, or drift model.

## Quasi-Static Load Transfer v1

Each grounded wheel derives normalized geometric spring/damper base support before longitudinal and lateral load-transfer deltas driven by prior-step local acceleration are applied. Positive forward acceleration shifts load rearward, braking shifts load forward, and lateral acceleration shifts load to the outside wheels under the project's local-axis convention.

The suspension normal-force foundation supplies the normalized base support; load transfer then owns the final redistributed normal force without double-counting static weight. `tractionLimitNewtons` remains `frictionCoefficient * normalForceNewtons`, so available grip changes only through the resulting normal force. Friction coefficient and tire pressure semantics remain unchanged.

The debug HUD now also prints a compact per-wheel load distribution line (e.g. `Load distribution: FL 27% FR 27% RL 23% RR 23% | F/R 54/46`). This is telemetry only: it reads the existing per-wheel `normalForceNewtons` and renders finite, clamped percentages plus a front/rear split. It does not change load transfer, normal force, traction limits, or any other physics.

## Uneven Terrain Contact + Quasi-Static Raycast Suspension v1

The terrain is a deterministic mathematical proving-ground profile shared by rendering and physics. The rendered mesh samples that profile once at construction; simulation queries the same height function directly and never treats rendered triangles as the source of truth. Surface normals use stable central differences of that same height function with a `0.05 m` sample distance.

The default lane runs in the vehicle's initial `+Z` direction:

- Flat spawn and acceleration area through approximately `z = 16 m`.
- Broad smooth rise from `z = 22–42 m`.
- Alternating narrow left/right wheel bumps around `z = 52 m` and `z = 61 m`.
- Bounded cross-slope from `z = 67–84 m`.
- Shallow dip from `z = 89–108 m`.
- Low-amplitude washboard from `z = 114–138 m`.

All features use bounded cosine blends with no intended launch ramps or vertical discontinuities. Hold `W` from the flat spawn to reach the lane; `A`/`D` can be used to inspect different wheel paths.

Each wheel ray starts at an authored suspension mount and follows the current chassis down axis. For a terrain normal `n` and ray-down direction `d`, contact uses the finite alignment `max(epsilon, -dot(d, n))`; the tire center offset along the suspension axis is `effectiveRollingRadiusMeters / alignment`. This keeps the pressure-adjusted physical radius consistent on a slope without treating visual torus deformation as collision geometry.

Spring support is explicit and quasi-static:

- `springForceNewtons = springRateNewtonsPerMeter * compressionMeters`.
- Positive compression velocity adds compression damping; rebound damping is signed negative and cannot make raw terrain normal force negative.
- Raw grounded-wheel spring/damper support is normalized to current vehicle weight before existing longitudinal/lateral load-transfer deltas are applied.
- Load transfer therefore remains the single owner of final `normalForceNewtons`; it redistributes support rather than adding a second full vehicle weight.

The chassis remains planar. It has a terrain-following support height derived from terrain beneath the reference point plus the authored baseline offset, with a bounded response time. There is no vertical velocity, heave, pitch, roll, free-fall, landing impulse, jump physics, suspension linkage solver, or rigid wheel-to-body constraint solver.

Grounded tire speeds and tire forces use a contact-plane tangent basis: intended wheel forward is projected onto the terrain plane, lateral is `normal × forward`, and the planar chassis consumes only the resulting X/Z force components. Yaw uses the same horizontal wheel force/lever convention. A normal-force-weighted support normal also supplies a bounded horizontal slope-gravity term, so a supported vehicle rolls downhill and resists uphill without adding gravity twice. Slope gravity is zero on level terrain and while fully unsupported.

The Debug HUD reports terrain profile/support height/slope, slope-gravity force, per-wheel ray/contact status, travel, compression, spring/damper/base/final load, and normal-force conservation diagnostics. The driver-facing R/N/D panel remains compact.

Current limitations are intentional: this is not full suspension simulation, full raycast vehicle physics, full rigid-body terrain interaction, arbitrary mesh collision, dynamic chassis heave, pitch, roll, jumps, landing impulses, anti-roll bars, or full suspension geometry.

## Suspension Normal Force Foundation v1

The former normal-force telemetry foundation is now the support stage of Uneven Terrain Contact + Quasi-Static Raycast Suspension v1. Its persistent compression history is updated once per fixed step. Post-integration telemetry retains the contact and force state used by that step rather than re-sampling terrain or advancing spring/damper or tire-force-relaxation history a second time.

## G-Force HUD v1

The debug HUD now prints a compact G-force line derived from existing planar acceleration telemetry: `G-force: long +0.42g / lat -0.08g / total 0.43g`. It converts the existing local forward/lateral planar accelerations (`planarAccelerationLocalForwardMetersPerSecondSquared`, `planarAccelerationLocalLateralMetersPerSecondSquared`) into G units with the shared `EARTH_GRAVITY.standardMetersPerSecondSquared` constant, clamps and sanitizes each axis, and reports the vector magnitude as the total. Missing or non-finite telemetry falls back to `G-force: unavailable`.

This is telemetry only. It reads simulation state; it does not create new physics state, and it does not change forces, braking, steering, powertrain, tire pressure, tire visuals, load transfer, or vehicle motion, nor does it alter the fixed timestep.
## Yaw Moment Budget Telemetry v1

The debug HUD now prints a compact yaw budget line (`Yaw budget: +420 N*m / I 2100 / accel +0.20 rad/s² / rate +0.34 rad/s`) plus an optional per-wheel contribution line. It exposes the existing yaw moment, yaw moment of inertia, yaw acceleration, and yaw rate from the vehicle snapshot, and it decomposes the total yaw moment into longitudinal-force and lateral-force components plus the per-wheel contributions already computed in the force pipeline.

This is telemetry only. It reads simulation state; it does not change the yaw force integration, yaw damping, vehicle motion, tire force formulas, friction, normal force, traction limits, braking, load transfer, tire pressure, aero drag, or mass-property behavior, nor does it add suspension, pitch/roll simulation, drift assist, stability control, traction control, or collision response.

## Dynamics Sanity Telemetry

The developer debug HUD includes compact local/world acceleration, tire-force saturation, lateral tire-force, combined-cap, service/parking brake torque, service-brake ABS state, yaw-rate, yaw-acceleration, yaw-moment, longitudinal slip-ratio, lateral slip-angle, planar velocity, load-transfer, and tire-pressure handling telemetry for checking longitudinal, lateral, braking, yaw, normal-force, and pressure-response sign conventions. These diagnostics do not add brake assist, suspension, traction control, stability control, or player-facing tuning controls.


## Load-Aware Anchored Toroidal Tire Deformation v1

Each tire now renders as an independently mutable toroidal shell rather than a solid cylinder. The shell preserves the existing `0.48 m` outside radius and approximately `0.38 m` width, while its inner bead band is fixed outside the rigid hub/rim exclusion radius. That fixed baseline prevents pressure or load visuals from expanding through or covering the hub.

The visual layer reads each wheel's existing pressure, grounded state, final `normalForceNewtons`, `staticNormalForceNewtons`, contact point, and contact normal. Pressure sets bounded visual compliance: a low-pressure tire deforms more under the same load, nominal pressure is subtler, and high pressure deforms less. A grounded wheel gains a smooth local tread flattening and lower-sidewall bulge near its contact plane; airborne wheels retain only the small symmetric pressure shape change and have no load flattening.

The contact plane is transformed from world space into the tire's current local space every render update. Consequently the flattened region stays ground-relative while the rolling assembly spins forward or backward, and it remains correct through steering and vehicle yaw. The separate contact-patch proxy remains a visual aid only; its width, length, opacity, and visibility now reflect the same bounded pressure/load/contact inputs.

All vertex updates are derived from immutable baseline positions, use precomputed bead/sidewall/tread influence weights, clamp the hub-clearance radius, and refresh normals/bounds only when visual inputs change. Reset restores exact baseline geometry and proxy state without changing controller, wheel, or pressure-physics state.

This remains visual-only. It does not change physical rolling radius, wheel angular velocity, slip, tire stiffness, tire forces, normal force, traction limit, braking, ABS, differential behavior, suspension integration, or vehicle motion. It is not a soft-body, finite-element, tire-temperature, wear, puncture, bead-unseating, rim-damage, terrain-deformation, or tread simulation.
## Tire Pressure Handling v1

Tire pressure now also affects tire mechanics before the traction cap. Each wheel derives a conservative effective rolling radius, a pressure-adjusted longitudinal tire stiffness, a pressure-adjusted lateral tire stiffness, and a pressure-aware rolling resistance coefficient from its current pressure state. Underinflated tires therefore roll on a slightly smaller effective radius, build longitudinal and lateral force more softly, and add more rolling resistance; mild overinflation can sharpen stiffness slightly within conservative caps.

Tire pressure still does not directly alter `frictionCoefficient`, `normalForceNewtons`, or `tractionLimitNewtons`. Traction limit still comes only from `frictionCoefficient * normalForceNewtons`, so pressure changes response and drag before saturation rather than acting as a hidden grip slider. There is still no tire temperature, wear, damage, puncture, blowout, visual chassis roll/pitch, or Pacejka tire model here.


## Developer Dynamics Tuning

A developer dynamics tuning panel exposes live multipliers for drive torque, service brake torque, and longitudinal tire stiffness. This is for calibration, debugging, and deliberately provoking wheel spin, braking changes, or softer/stiffer tire response. The defaults are all `1.0`, which preserves the current baseline behavior.

The panel does not expose UI controls for friction coefficient, surface friction, available-traction caps, tire pressure, player progression, or upgrades. Friction remains a tire/surface/material definition in code/data.


## Longitudinal Traction State

Each wheel now exposes longitudinal traction classification telemetry derived from contact state, slip ratio, tire-force saturation, drive torque, service/parking brake torque, wheel surface speed, and local ground speed. Wheels can classify as `airborne`, `stopped`, `rolling`, `saturated`, `drive_spin`, or `brake_lock_tendency`, and the debug HUD shows a compact aggregate summary including service-brake and parking-brake lock-tendency counts.

This traction-state layer remains a telemetry/debug foundation. It classifies wheel behavior and now feeds service-brake ABS v1, but it does not implement brake assist, smoke, tire squeal, skid marks, full combined-slip modeling, suspension, or stability systems. It does not change friction, tire pressure behavior, lateral tire-force calculation, or longitudinal tire-force calculation beyond the ABS controller reading the telemetry.


## Tire Slip Visual Feedback

A separate tire slip feedback overlay reads longitudinal traction state telemetry and shows simple ground-oriented visual markers for rolling, saturation, drive spin, and brake-lock tendency. These visuals are independent from tire inflation contact-patch scaling, and they do not rotate with tire tread or affect wheel physics.

The feedback is visual/debug only. It does not change tire force, friction, traction limits, tire pressure behavior, ABS, service/parking brake commands, suspension, combined slip, or lateral dynamics. Tire squeal audio, richer smoke, and persistent skid marks remain future work.


## Longitudinal Force Pipeline

Longitudinal drive and brake inputs still create per-wheel request and torque command telemetry. Applied wheel force comes from each wheel's capped slip-ratio longitudinal tire force plus the slip-angle lateral tire force, with both components respecting the existing traction limit through a simple combined cap. The suspension stage creates normalized geometric base support; quasi-static load transfer then redistributes that supported load using prior-step acceleration, so acceleration, braking, and cornering can change available grip while friction coefficient remains unchanged. This preserves clear seams for richer tire curves, friction-ellipse work, and full suspension geometry. Service brake bias is implemented separately (see Service Brake Bias v1).


## Longitudinal Tire Force Relaxation v1

Longitudinal tire force now has a small relaxation layer that eases each wheel's applied force toward the existing traction-limited target instead of snapping immediately. The traction cap itself is unchanged: it still comes from `frictionCoefficient * normalForceNewtons`, and this branch does not add a Pacejka model, tire heat, tire wear, tire damage, or any lateral force relaxation.

The relaxation layer is intentionally narrow. It only smooths longitudinal force buildup and keeps the existing longitudinal tire-force calculation, slip-ratio formula, stiffness formula, braking logic, ABS, parking brake, powertrain RPM, and suspension/load-transfer behavior intact.

## Controls

- `W` applies throttle.
- `S` applies the service brake.
- `Space` holds the parking brake.
- `A` / `D` steer.
- `[` shifts the selector down: Drive → Neutral → Reverse.
- `]` shifts the selector up: Reverse → Neutral → Drive.
- `C` cycles camera mode.
- `R` resets the vehicle.

The current drivetrain model uses a simple Reverse / Neutral / Drive selector. It does not yet simulate engine RPM, gear ratios, clutch behavior, torque converter behavior, or multi-speed transmission logic.
## Rear Differential Models v1

Rear Differential Models v1 adds a small rear-axle differential layer for the existing rear-wheel-drive axle only. Supported modes are `open`, `limited-slip`, `torsen`, `locked`, and `welded`.

Mode scope in this branch:
- `open` preserves the old equal left/right rear drive split behavior and applies no direct rear wheel-speed coupling torque.
- `limited-slip` keeps the simplified drive-bias behavior and now adds a bounded clutch-style rear wheel-speed coupling torque that reduces left/right speed difference without overshoot.
- `torsen` remains a simplified torque-biasing approximation bounded by a torque-bias ratio and current rear-wheel support/traction telemetry. It does not directly lock rear wheel speeds.
- `locked` and `welded` keep their support-weighted drive-split approximation and now apply a momentum-preserving rigid rear wheel-speed coupling projection so the rear wheel angular velocities match at the end of the rotational update.

This branch models the rear axle only. It does not add axle elasticity, driveline windup, transfer cases, center differentials, front differentials, AWD/4WD conversion, clutch packs, heat, wear, damage, or a full mechanical gear model.

Braking, ABS, powertrain RPM telemetry, traction-limit definition, tire stiffness, slip ratio, and tire-force relaxation remain unchanged by the differential modes. Terrain contact, suspension support, load transfer, and rendering follow their documented current implementations.
## Powertrain Profile Foundation

This is a static data and telemetry foundation for future engine RPM, gear ratios, torque curves, and engine braking. It does NOT yet change vehicle behavior.

The simulation now carries a selected piston-engine profile and a selected transmission profile as plain data. Both are exposed through the vehicle snapshot and the Debug HUD so the chosen powertrain can be represented and inspected, but neither profile feeds any physics integration yet.

Engine scope (v1):
- Common piston car families only: inline-3, inline-4, inline-5, inline-6, V6, V8, V10, V12.
- Explicitly excluded: W engines, H engines, flat/boxer engines, rotary/Wankel, electric motors, hybrid systems, turbine engines, and motorcycle-only oddities.
- No full combustion simulation, no active engine RPM.

Transmission scope (v1):
- Simple static profile types only: manual-4, manual-5, manual-6, manual-6-granny, automatic-6, automatic-8, dct-7, dct-8, cvt.
- These are data profiles only. They do not drive gear selection, shift scheduling, torque-converter behavior, clutch behavior, or any gear-ratio force multiplication.

Default selection:
- Engine: inline-4 gasoline turbo (2.0L I4 Turbo).
- Transmission: 6-speed automatic, which fits the current Reverse / Neutral / Drive selector model (no manual shift controls yet).

Profile data is immutable and frozen. Unknown engine or transmission ids fall back to the safe defaults, so the simulation state always stays finite and serializable.

What this foundation does NOT do yet:
- No engine braking.
- No active engine RPM.
- No clutch, shift scheduling, or automatic shift logic.
- No torque-converter behavior, differential behavior, or gear-ratio force multiplication.
- No change to acceleration, braking, tire forces, friction, normal force, traction limits, ABS, parking brake, load transfer, tire pressure handling, steering, yaw, or surface contact.
- No UI selection menus or tuning sliders.
### Stock Engine Catalog Seed Data

Stock engine catalog seed data now attaches source-derived stock-ish metadata to the existing piston engine profiles. The catalog is local, manual, and static for now. It adds catalog snapshots and derived validation/display telemetry, but it does not change engine or vehicle behavior.

Catalog scope in this branch:
- Eight source-derived seed records: inline-3, inline-4, inline-5, inline-6, V6, V8, V10, and V12.
- Catalog schema fields for reference, architecture, geometry, stock performance, and source metadata.
- Derived telemetry such as displacement cross-check, bore/stroke ratio, stroke geometry classification, and specific output metrics when the source data provides them.
- Debug HUD visibility for the selected stock engine catalog entry.

What the catalog does NOT do:
- No online fetching, remote catalog loading, local file import, or catalog browser UI.
- No torque-curve generation from displacement, bore, stroke, compression ratio, or cylinder count.
- No change to acceleration, RPM behavior, shifting, drive torque, engine braking, friction, normal force, traction limits, tire forces, or vehicle motion.
- No detailed cam profile, valve timing, intake, exhaust, ECU, turbo sizing, fueling, aftermarket package, or tuning-part modeling.

The schema is intentionally shaped so future work can add more local records, imported catalog data, or user-supplied records without replacing the current engine profile system.
### Engine RPM Telemetry

Engine RPM is now derived as inert telemetry from the selected powertrain profiles, the current R/N/D selector, and driven-wheel rotational speed. It is telemetry only and does not change vehicle behavior.

The estimated engine RPM is computed from the average driven-wheel angular velocity multiplied by the effective drive ratio (selected transmission ratio times final drive ratio). RPM is clamped between idle RPM and redline RPM when the powertrain is connected:

- Neutral reports a disconnected powertrain state and idle RPM.
- Reverse uses the reverse gear ratio and final drive ratio.
- Drive uses one representative forward ratio for telemetry only (the first forward gear ratio for fixed transmissions). No automatic shifting or speed-based gear selection is performed.
- CVT uses a fixed representative ratio (the midpoint of cvtMinRatio and cvtMaxRatio) for telemetry only. No active CVT ratio changes are applied.

The telemetry also reports the powertrain connection state (disconnected / forward_connected / reverse_connected) and the engine RPM state (idle / coupled / redline_clamped / unavailable).

This RPM telemetry does not yet affect acceleration, drive torque, engine braking, shifting, or vehicle motion. No clutch, torque converter, automatic shift scheduling, manual shift controls, differential, or drivetrain physics model exists yet.
