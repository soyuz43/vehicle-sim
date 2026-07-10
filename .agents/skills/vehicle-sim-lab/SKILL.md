---
name: vehicle-sim-lab
description: Use for all work in the vehicle-sim repository: Three.js vehicle rendering, fixed-step vehicle dynamics, per-wheel contact and tire state, force and torque integration, braking and ABS, tire pressure, suspension/load transfer, planar motion and yaw, rear differential behavior, powertrain telemetry, visual tire deformation, and fidelity-first simulation architecture. Do not use for unrelated application work or arcade game features unless explicitly requested.
---

# vehicle-sim-lab skill

## Activation

Use this skill whenever the task involves the `vehicle-sim` repository or any of these areas:

- Three.js vehicle rendering
- vehicle controller or vehicle state
- fixed-timestep simulation
- units, gravity, axes, or integration
- throttle, brake, steering, parking brake, or R/N/D selector behavior
- per-wheel contact, normal load, friction, or traction limits
- wheel angular velocity, torque, slip ratio, or spin visualization
- longitudinal or lateral tire forces
- combined tire-force limiting
- tire-force relaxation
- service-brake bias or ABS
- suspension normal-force state
- quasi-static load transfer
- planar chassis velocity, acceleration, or yaw
- tire pressure physics or tire inflation UI
- tire visual deformation
- aerodynamic drag
- engine/transmission profile telemetry
- rear differential drive split or wheel-speed coupling
- developer tuning controls
- debug HUD or vehicle telemetry
- vehicle-sim tests, validation, Git workflow, or documentation

Do not use this skill for unrelated web applications, general Three.js questions, or arcade/racing-game features unless the user explicitly connects them to this repository.

## Project invariant

`vehicle-sim` is a browser-based Three.js vehicle-simulation learning laboratory. It is not currently a finished game.

Primary objective:

- evolve toward explicit, inspectable, physically meaningful vehicle state and dynamics
- keep each physics stage understandable and testable
- preserve clear boundaries between simulation, rendering, UI, terrain, and camera systems
- prefer honest approximations over hidden arcade behavior or overstated realism

Non-objectives unless explicitly requested:

- checkpoints
- laps
- timers
- scoring
- collectibles
- menus
- progression systems
- AI racers
- racing-game objectives
- broad content production
- cinematic polish that obscures simulation state

Do not optimize new work around making the project feel like an arcade racer. Optimize for staged fidelity, clear telemetry, finite state, and reviewable implementation.

## Source-of-truth rule

The current source code is authoritative.

This document is a high-value architectural guide, but it can lag behind an active branch. Before editing:

1. Read `AGENTS.md`.
2. Read this skill.
3. Run `git status --short --branch`.
4. Inspect the current branch and relevant diff.
5. Verify every claimed integration seam in current source.
6. Distinguish merged `main` behavior from uncommitted or branch-local behavior.

Never assume a feature exists only because it appears in this document, README text, a branch name, or a previous agent report.

At the time this document was refreshed, the reported active branch was:

`codex/rear-differential-wheel-speed-coupling-v1`

The source tree contains `src/vehicle/dynamics/rearDifferentialState.js`. Before relying on direct wheel-speed coupling, verify whether the branch implementation has been committed and whether it is present on the current branch or merged into `main`.

## Current repository shape

Expected current source tree:

- `src/main.js`
- `src/style.css`
- `src/car/`
  - `createCar.js`
  - `createTirePressureVisuals.js`
  - `tirePressureVisualScales.js`
- `src/controls/`
  - `CameraManager.js`
  - `cameraControls.js`
- `src/effects/tireSlipFeedback/`
  - `createTireSlipFeedback.js`
- `src/simulation/`
  - `createFixedTimestepRunner.js`
  - `simulationConstants.js`
- `src/terrain/`
  - `createTerrain.js`
  - `createFlatTerrainContactQuery.js`
  - `obstacles/` reserved or currently empty
- `src/ui/debugHud/`
  - `createDebugHud.js`
- `src/ui/developerTuningPanel/`
  - `createDeveloperTuningPanel.js`
- `src/ui/gearIndicator/`
  - `createGearIndicator.js`
- `src/ui/tireInflationPanel/`
  - `createTireInflationPanel.js`
- `src/ui/playerHud/` reserved or currently empty
- `src/vehicle/`
  - `createVehicleController.js`
  - `defaultVehicleSpec.js`
  - `dynamics/`
    - `aerodynamicDragState.js`
    - `chassisMassPropertiesState.js`
    - `dynamicsTuningState.js`
    - `lateralSlipAngleState.js`
    - `lateralTireForceState.js`
    - `loadTransferState.js`
    - `longitudinalTireForceRelaxationState.js`
    - `longitudinalTractionState.js`
    - `planarMotion.js`
    - `rearDifferentialState.js`
    - `serviceBrakeAbsState.js`
    - `suspensionNormalForceState.js`
    - `tireInflationVisualState.js`
    - `tirePressureHandlingState.js`
    - `vehicleDynamicsStepTrace.js`
  - `powertrain/`
    - `createEngineProfiles.js`
    - `createPowertrainKinematics.js`
    - `createPowertrainSelection.js`
    - `createStockEngineCatalog.js`
    - `createTransmissionProfiles.js`

Treat empty or reserved directories as seams, not implemented systems.

## Current architecture snapshot

The project has moved substantially beyond the older scalar arcade prototype.

Treat these systems as existing unless current source disproves them:

- fixed `1 / 60` second simulation stepping
- variable render loop using `requestAnimationFrame`
- explicit meter/second/newton/kilogram/radian unit contract
- R/N/D selector
- throttle and brake semantics where `S` brakes rather than commanding reverse
- flat terrain and a terrain-contact query abstraction
- finite per-wheel contact state
- explicit per-wheel normal force
- suspension normal-force foundation
- quasi-static longitudinal and lateral load transfer
- planar world/local chassis velocity and acceleration
- yaw angle, yaw rate, yaw acceleration, and tire-force yaw moment
- explicit per-wheel rotational state
- longitudinal slip-ratio state
- slip-ratio-based basic longitudinal tire-force calculation
- longitudinal tire-force saturation by available traction
- persistent longitudinal tire-force relaxation
- lateral slip-angle state
- basic linear lateral tire-force calculation
- a simple combined longitudinal/lateral tire-force cap
- force-based planar chassis integration
- service-brake pressure and torque
- service-brake bias
- ABS state and service-brake modulation
- rear-only parking brake
- brake-light visualization
- aerodynamic drag
- chassis mass-property telemetry
- per-wheel tire-pressure state
- tire-pressure effects on rolling radius, tire stiffness, and rolling resistance
- visual tire-pressure deformation
- tire-slip visual feedback
- engine and transmission profile catalogs
- powertrain selection and RPM/ratio telemetry
- rear differential type selection and drive-force splitting
- developer tuning controls
- detailed debug HUD telemetry
- vehicle dynamics step tracing
- focused Node-native regression tests for critical state behavior

Important architectural qualification:

- the project contains real force and torque state, but it is still an intentionally simplified simulation
- many subsystems are v1 approximations, not professional production tire, suspension, driveline, or chassis models
- powertrain profiles and RPM telemetry are not necessarily the source of actual propulsion torque
- the terrain is still a flat placeholder unless current source says otherwise
- tire visuals are currently separate from physical tire state and must remain visual-only
- some branch-local differential wheel-speed behavior may not yet be merged into `main`

## Unit and axis contract

Hard conventions:

- 1 world unit = 1 meter
- time = seconds
- velocity = meters per second
- acceleration = meters per second squared
- force = newtons
- mass = kilograms
- torque = newton-meters
- angular velocity = radians per second
- angular acceleration = radians per second squared
- angles = radians internally
- Y+ = world up
- gravity points in negative Y
- standard gravity = `9.80665 m/s^2`
- vehicle local right = +X
- vehicle local up = +Y
- vehicle local forward = +Z
- the wheel rolling axis is local X unless current wheel metadata says otherwise

Rules:

- include unit suffixes in identifiers when practical
- do not introduce ambiguous names such as `force`, `speed`, or `radius` when a unit-bearing name is appropriate
- do not silently mix degrees and radians
- do not silently mix world-space and vehicle-local vectors
- do not describe meter-based state as arbitrary “units”
- HUD output may round values; simulation state should retain finite precision
- sanitize invalid external/config values, but do not hide a broken physics path by indiscriminately replacing meaningful state with zero

## Architectural ownership

Long-term and current ownership boundaries:

### `src/main.js`

Owns application wiring:

- scene setup
- renderer setup
- input collection
- controller construction
- fixed-step runner construction
- UI construction
- render-loop orchestration
- snapshot distribution
- reset wiring
- camera/effect updates

Do not put substantive new vehicle physics in `src/main.js`.

### `src/car/createCar.js`

Owns visual vehicle construction and visual metadata:

- chassis and body meshes
- wheel visual hierarchy
- tire, hub, rolling assembly, steering pivot, and witness meshes
- brake-light meshes
- names and metadata used to resolve visual nodes
- creation/attachment of the tire-pressure visual helper

It is not the primary source of vehicle physics truth.

### `src/vehicle/createVehicleController.js`

Owns vehicle simulation orchestration:

- controller state
- input interpretation
- fixed-step update order
- per-wheel state
- force and torque requests
- contact updates
- suspension/load transfer
- tire state updates
- braking and ABS
- differential integration
- wheel rotational integration
- planar force/yaw integration
- reset semantics
- controller APIs
- snapshots and telemetry

Keep this file as orchestration plus narrow local helpers. Prefer a focused dynamics module when logic becomes independently meaningful or testable.

### `src/vehicle/defaultVehicleSpec.js`

Owns default physical and model parameters.

Do not duplicate spec values in UI, rendering, or helper modules unless a visual-only default is explicitly separate and documented.

### `src/vehicle/dynamics/*`

Own focused state machines and calculations.

Modules should:

- have narrow responsibility
- expose explicit creator/reset/update/calculation functions
- return or mutate finite state predictably
- separate transient step outputs from persistent history
- avoid UI or scene ownership
- be independently testable when practical

### `src/vehicle/powertrain/*`

Owns engine/transmission catalogs, selection, and kinematic telemetry.

Do not assume catalog torque values currently drive the vehicle unless the controller demonstrably consumes them for propulsion.

### `src/terrain/*`

Owns terrain mesh metadata and terrain/contact query semantics.

Rendering and contact queries may currently share flat-terrain data, but future terrain physics should flow through the query abstraction rather than direct mesh assumptions.

### `src/ui/*`

Owns display and explicit user-facing control callbacks.

UI may call controller methods through explicit APIs. UI must not become the source of physics calculations or mutate internal simulation state directly.

### `src/controls/*`

Owns camera behavior only.

The camera may read vehicle transforms and telemetry. It must not own vehicle physics.

### `src/effects/*`

Owns visual effects derived from snapshots.

Effects must not feed back into simulation state.

## Fixed-step and render-loop rules

Expected simulation structure:

- render loop is variable-rate
- fixed simulation step is normally `1 / 60` second
- frame delta is clamped
- an accumulator runs zero or more fixed physics steps per render frame
- catch-up steps are bounded to prevent spirals
- rendering interpolates or visualizes authoritative simulation state
- render-side easing may use render delta when it is explicitly visual-only

Do not:

- integrate core vehicle physics directly from raw render delta
- move controller physics into camera or UI updates
- assume a render frame always contains a physics step
- interpret “physics steps this frame = 0” as proof that simulation is stopped
- make persistent simulation state depend on whether a particular render frame executed a fixed step

When debugging, distinguish:

- current render-frame telemetry
- latest completed fixed-step telemetry
- cumulative or persistent state

## Current fixed-step conceptual pipeline

Verify the exact call order in current source before modifying it. The intended high-level flow is approximately:

1. sanitize fixed `dt`
2. read driver input
3. begin/reset transient step trace and per-step requests
4. update wheel contact state
5. update chassis mass/suspension/load-transfer state
6. update tire-pressure handling state
7. build drive and brake requests
8. update service-brake pressure and ABS
9. distribute drive force through the rear differential
10. calculate external wheel torques
11. integrate wheel rotational state
12. apply rear wheel-speed coupling if the active branch implements it
13. update wheel surface speed and longitudinal slip
14. calculate target longitudinal tire force
15. advance persistent longitudinal force relaxation
16. calculate lateral slip angle and lateral tire force
17. apply combined tire-force cap
18. sum world-space tire forces, drag, rolling resistance, and yaw moments
19. capture integration-input trace
20. integrate planar velocity, position, yaw rate, and yaw
21. refresh post-integration contact/telemetry where intended
22. update visual transforms from authoritative simulation state
23. publish snapshot

Do not rely on this list for line-level edits. Confirm the real source order.

## State-lifetime rule

Every field must be classified as one of:

- immutable configuration
- persistent simulation state
- persistent filtered/relaxed history
- transient per-step input/request state
- transient derived output
- render-only visual state
- snapshot/telemetry state

Never clear persistent history in a generic per-step reset.

Critical known regression lesson:

- `relaxedLongitudinalTireForceNewtons` is persistent relaxation memory
- a previous implementation cleared it at the beginning of every fixed step
- the system then produced nonzero target tire force but zero or ineffective relaxed/applied force
- the wheels spun while the chassis did not move
- explicit vehicle reset must clear relaxation history
- ordinary per-step request reset must not clear relaxation history

Apply the same discipline to:

- ABS modulation history
- suspension state
- tire-pressure smoothing
- differential coupling state
- yaw/velocity state
- any future filters, relaxation lengths, or integrators

Separate:

- full reset functions
- transient-step reset functions
- telemetry refresh functions

Do not use a full reset helper as a convenient per-frame initializer.

## Input and selector semantics

Expected controls:

- `W` = throttle
- `S` = service brake
- `A` / `D` = steering
- `Space` = parking brake
- `BracketLeft` = selector down
- `BracketRight` = selector up
- `R` = vehicle reset
- `C` = camera mode

Selector semantics:

- Reverse = `-1`
- Neutral = `0`
- Drive = `1`

Expected behavior:

- Drive + W requests forward propulsion
- Drive + S brakes and does not become reverse throttle
- Neutral + W produces no drive request
- Neutral + S brakes a moving vehicle
- Reverse + W requests reverse propulsion
- Reverse + S brakes
- parking brake remains rear-only
- bracket changes should be edge-triggered; ignore repeat unless current design explicitly differs

Current throttle and brake inputs may be binary `0/1`. Do not silently add pedal ramps or analog semantics unless requested.

## Terrain and contact state

Current terrain is a flat placeholder with a contact-query abstraction.

Expected current surface metadata includes:

- surface kind similar to `flat-asphalt-placeholder`
- finite ground height
- finite contact normal
- finite friction coefficient
- terrain bounds/size

Per-wheel contact state should include or preserve concepts such as:

- wheel id
- axle
- side
- driven
- steerable
- wheel local position
- wheel world position
- contact point/patch
- contact normal
- ground distance
- penetration/compression
- `isGrounded`
- surface kind
- friction coefficient
- normal force
- traction limit

Current traction limit invariant:

`tractionLimitNewtons = frictionCoefficient * normalForceNewtons`

Tire pressure does not directly rewrite:

- `frictionCoefficient`
- `normalForceNewtons`
- `tractionLimitNewtons`

Any change in traction limit from pressure should occur only through a separately justified physical effect, not a hidden direct multiplier.

Do not add surface-friction sliders that bypass terrain/tire definitions unless explicitly requested.

## Chassis mass, suspension, and load transfer

Current source includes:

- chassis mass-property telemetry
- mass and center-of-mass values derived from the vehicle spec
- wheelbase and track-width data
- yaw moment of inertia telemetry
- suspension normal-force state
- quasi-static longitudinal and lateral load transfer

Expected invariants:

- total static rest normal force remains approximately `massKg * gravity`
- load transfer redistributes load; it does not create total load
- normal force remains finite and nonnegative
- unloaded/airborne wheels do not receive fake traction
- load transfer must not be counted twice between the suspension and load-transfer modules
- suspension and load-transfer state should remain separate from visual wheel deformation

Current suspension is a normal-force foundation, not full rigid-body heave/pitch/roll suspension geometry.

Do not claim or add without request:

- dynamic chassis heave
- pitch and roll bodies
- anti-roll bars
- damper temperature
- bump stops
- wheel travel geometry
- terrain impact/jump dynamics
- suspension damage

## Planar chassis and yaw dynamics

Current motion is planar rather than the older scalar-only speed model.

Expected state includes:

- world planar velocity
- local forward/lateral velocity
- world planar acceleration
- local forward/lateral acceleration
- yaw angle
- yaw rate
- yaw acceleration
- summed force in local and world axes
- yaw moments from per-wheel forces

Vehicle position and yaw should integrate from authoritative motion state.

Do not regress to:

- directly changing position from throttle
- `speed += arbitraryAcceleration * dt`
- steering by rotating the visual car independently of yaw dynamics
- deriving wheel spin ad hoc from chassis speed when explicit wheel angular state exists

The model is still planar:

- no full 6-DOF chassis body
- no roll/pitch integration
- no vertical chassis dynamics
- no collision impulse solver

## Wheel rotational dynamics

Each wheel should preserve explicit rotational concepts such as:

- wheel inertia
- angular velocity
- angular acceleration
- spin angle
- drive torque
- service-brake torque
- parking-brake torque
- contact reaction torque
- rolling/resistance torque where present
- differential coupling torque or impulse where present
- net torque
- wheel surface speed
- longitudinal ground speed
- longitudinal slip ratio

Visual rolling assembly rotation must read from authoritative `spinAngleRadians` or equivalent state.

Do not:

- animate wheels independently from the controller
- overwrite angular velocity from ground speed unless the active model explicitly imposes a constraint
- apply differential coupling twice
- silently copy one locked wheel’s speed onto the other without preserving angular momentum
- treat visual mesh rotation as physical wheel state

## Longitudinal tire-force model

The project now has a basic slip-ratio-based longitudinal tire-force path.

Expected conceptual flow:

- drive/brake torque changes wheel angular velocity
- wheel surface speed is compared with contact-patch longitudinal ground speed
- longitudinal slip ratio is calculated
- a basic linear tire stiffness produces an uncapped/target force
- force is saturated by available traction
- longitudinal force relaxation advances applied force over distance/time
- applied per-wheel force contributes to chassis force

Expected fields include concepts such as:

- `longitudinalSlipRatio`
- `longitudinalSlipRatioAbs`
- `hasLongitudinalSlipSample`
- `uncappedLongitudinalTireForceNewtons`
- `targetLongitudinalTireForceNewtons`
- `relaxedLongitudinalTireForceNewtons`
- `appliedLongitudinalForceNewtons`
- saturation ratio/state
- relaxation alpha/length/speed state

This is not Pacejka and not a professional nonlinear tire model.

Critical invariants:

- finite positive `dt` plus nonzero target should produce nonzero relaxed/applied force
- relaxation history persists across ordinary fixed steps
- explicit reset clears relaxation history
- airborne or zero-traction wheels produce no tire force
- applied force must be the force consumed by chassis integration
- post-step telemetry must not overwrite or misrepresent the integration-input force budget

## Lateral slip and tire force

Current source includes:

- per-wheel lateral slip-angle calculation
- basic linear lateral tire stiffness
- per-wheel lateral tire force
- yaw moment contribution
- lateral force summary telemetry
- combined longitudinal/lateral force limiting

Expected basic relation is conceptually:

`lateralForce = -lateralStiffness * lateralSlipAngle`

with saturation by the wheel’s current traction limit.

This is a v1 linear tire model, not:

- Pacejka
- brush tire model
- full combined-slip tire ellipse
- camber thrust
- aligning torque
- transient carcass dynamics
- tire temperature or wear

Keep straight-line slip near zero, turning values finite, and yaw-force signs consistent.

## Combined tire-force cap

Longitudinal and lateral force share a simple per-wheel traction budget.

Expected invariant:

`combinedTireForceMagnitudeNewtons <= tractionLimitNewtons + epsilon`

Do not:

- separately clamp longitudinal and lateral force to the full limit and then sum them without a combined cap
- apply the cap before required target/relaxation calculations in a way that corrupts state meaning
- mix refreshed traction limits with stale applied-force snapshots
- let rolling resistance silently violate a documented tire-force invariant; document whether it is inside or outside the tire-force cap

## Brakes, parking brake, and ABS

Current source includes `serviceBrakeAbsState.js` and controller brake state.

Expected behavior:

- service brake applies through explicit per-wheel pressure/torque state
- front/rear service-brake bias is explicit
- ABS modulates service-brake behavior only
- parking brake is rear-only
- parking brake is not modulated by ABS
- braking should not reverse-propel the chassis
- a stopped wheel should not numerically oscillate through zero because of excessive brake torque
- wheel-lock/ABS fields remain finite
- brake lights reflect braking state without owning brake logic

Do not mix parking-brake torque into service-brake pressure telemetry.

## Tire-pressure simulation state

Current physical tire-pressure handling affects:

- effective rolling radius
- longitudinal tire stiffness
- lateral tire stiffness
- rolling resistance

Current pressure boundaries include concepts such as:

- recommended/default pressure around 220 kPa
- minimum and maximum UI/state bounds
- clamped effective-pressure envelope
- underinflation and overinflation state labels
- per-wheel pressure state
- aggregate pressure summary

Important invariants:

- pressure can differ per wheel
- aggregate pressure state is derived from wheel state, not a replacement for it
- effective rolling radius remains finite and bounded
- pressure-adjusted stiffness remains finite and bounded
- rolling resistance remains finite and cannot propel the car from rest
- pressure does not directly change surface friction
- pressure does not directly change normal force
- pressure does not directly create “magic grip”
- service brake, parking brake, ABS, load transfer, and combined-cap behavior remain compatible

APIs currently include or are expected to include:

- `setTirePressureKpa`
- `setWheelTirePressureKpa`
- `resetTirePressure`
- `getTirePressureState`

Preserve aggregate-control compatibility while retaining per-wheel truth.

## Current tire visual deformation

Current visual tire-pressure behavior is separate from physical handling.

Current known structure:

- `createCar.js` creates tire and hub as separate children of a wheel rolling assembly
- wheel pivot handles steering
- rolling assembly handles spin
- the current tire mesh was created with `THREE.CylinderGeometry`
- `createTirePressureVisuals.js` reads pressure state and eases visual pressure
- `tirePressureVisualScales.js` computes pressure-only radius/width/contact-patch scales
- the tire node is scaled as a whole
- a separate contact-patch proxy mesh is scaled/faded
- the visual helper runs from the render loop
- the visual helper is explicitly visual-only

Known visual limitation:

- whole-node width/radius scaling can expand the tire inward and cover/intersect the rigid hub
- pressure-only whole-object scaling does not model a fixed bead, sidewall compliance, or load-localized contact patch
- the current tire is visually closer to a deformable cylinder than an anchored pneumatic torus

Do not claim that load-aware anchored toroidal deformation exists unless current source proves it.

Likely next visual stage:

- toroidal or purpose-built tire geometry
- fixed bead/rim attachment
- deformation derived from immutable baseline vertices
- pressure-dependent compliance
- normal-load-dependent lower-tread flattening
- localized sidewall bulge
- ground-relative contact direction that does not rotate with wheel spin
- independent per-wheel visual inputs
- no effect on physical tire radius, force, friction, contact, or motion

Visual deformation must never mutate simulation truth.

## Aerodynamic drag

Current source includes aerodynamic-drag state.

Expected behavior:

- finite air density
- drag coefficient
- frontal area or CdA
- drag opposes horizontal velocity
- drag is zero or negligible at zero speed
- no sign error that accelerates the car
- no downforce, lift, wind, drafting, heat, or aerodynamic damage unless explicitly added

Keep drag state separate from tire-force caps.

## Powertrain profiles and telemetry

Current source includes:

- engine profile catalog
- transmission profile catalog
- safe profile selection
- stock engine catalog metadata
- powertrain kinematic/RPM calculations
- R/N/D-compatible transmission telemetry
- snapshots/HUD output

Critical honesty rule:

- powertrain profile torque curves and displayed RPM are telemetry/kinematic data unless the controller demonstrably uses them to calculate propulsion torque
- current actual propulsion may still be based on a simpler maximum drive-force request
- do not claim a full engine, clutch, torque converter, gearbox inertia, driveshaft, or driveline model exists

Do not silently connect profile torque to vehicle propulsion as part of unrelated work.

## Rear differential state

Current source includes rear differential selection and drive-request splitting in `rearDifferentialState.js`.

Expected selectable labels/modes:

- open
- limited-slip
- Torsen
- locked
- welded

Merged rear-differential-models v1 behavior established a rear drive-force split seam:

- open preserves an equal baseline split
- limited-slip applies bounded bias based on wheel support/speed state
- Torsen applies a bounded support-based torque-bias approximation
- locked and welded were initially drive-split approximations with distinct labels
- developer UI exposes differential selection
- debug telemetry exposes compact split state

Branch-sensitive wheel-speed coupling:

If current source on `codex/rear-differential-wheel-speed-coupling-v1` contains direct coupling, preserve these intended semantics:

- open: no direct left/right wheel-speed coupling
- Torsen: torque-bias behavior; do not hard-lock wheel speed
- limited-slip: bounded clutch-like coupling opposing speed difference
- locked: rigid or near-rigid momentum-preserving rear wheel-speed constraint
- welded: same mechanical coupling approximation as locked, with distinct identity
- internal coupling torque/impulse must be equal and opposite
- coupling must not create or destroy combined rear-wheel angular momentum apart from external torques
- limited-slip coupling must not overshoot and reverse the speed difference due solely to the coupling step
- locked/welded behavior must account for unequal wheel inertia if supported
- reset must clear coupling telemetry/state appropriately
- ordinary per-step reset must not erase intentionally persistent coupling state

Before editing differential behavior, trace:

- drive-force distribution
- drive torque
- brake torque
- contact-reaction torque
- wheel angular integration
- coupling application
- slip calculation
- tire-force calculation
- chassis integration
- snapshot publication

Do not add without request:

- center differential
- transfer case
- driveshaft elasticity
- axle-shaft torsion
- drivetrain windup
- clutch packs with heat/wear
- differential damage
- torque vectoring controller
- stability or traction control

## Vehicle dynamics step trace

`vehicleDynamicsStepTrace.js` exists to make update order and force budgets inspectable.

Expected trace concepts include:

- step `dt`
- compact per-wheel state
- integration-input force/yaw budget
- post-integration or refreshed telemetry stage
- target, relaxed, and applied longitudinal force summaries
- force ranges and finite-state summaries

Rules:

- tracing must not mutate physics
- integration-input values must reflect what integration actually consumed
- post-integration refresh must not rewrite history in a misleading way
- trace state should distinguish current-step inputs from later telemetry refresh
- do not use trace output as an alternate source of simulation truth

## UI boundaries

### Debug HUD

Developer-facing and allowed to show:

- controller kind
- fixed-step state
- throttle/brake/parking-brake/steering input
- selector state
- position and yaw
- world/local velocity
- acceleration
- net forces
- aerodynamic drag
- rolling resistance
- normal loads
- traction limits
- load transfer
- suspension telemetry
- slip ratio and lateral slip angle
- target/relaxed/applied tire forces
- wheel angular velocity and net torque
- service-brake/ABS state
- tire pressure and pressure handling
- differential split/coupling state
- powertrain telemetry
- dynamics step trace

### Developer tuning panel

May expose explicit controller APIs for:

- approved dynamics multipliers
- rear differential selection
- narrowly justified live tuning values

Do not let panel values bypass state sanitization or silently create a second spec system.

### Gear indicator / driver-facing UI

May show compact:

- R/N/D state
- speed
- wheel contact indicators
- small driver-relevant status badges

Should not show:

- raw torque internals
- raw relaxation state
- full ABS internals
- detailed differential coupling diagnostics
- developer-only trace information

### Tire inflation panel

May adjust pressure through controller APIs and display:

- kPa
- psi
- current range/state
- compact visual status

It must not mutate friction, normal force, or traction limits directly.

### Reserved `playerHud`

Treat as unimplemented unless source exists. Do not invent behavior because the directory exists.

## Rendering boundaries

Simulation state is authoritative. Rendering visualizes it.

Rules:

- steering visuals read steering state
- wheel spin reads spin-angle state
- body transform reads planar position/yaw
- brake lights read brake state
- tire-slip effects read snapshots
- tire deformation reads pressure/load/contact snapshots only
- camera follows visualized/authoritative state
- no rendered mesh becomes a hidden physics integrator
- avoid querying deformed visual tire geometry as physical contact truth

## Snapshot and serialization rules

Controller snapshots should be:

- finite
- compact enough for render/UI use
- serializable when intended
- explicit about units
- stable enough for tests
- free of unnecessary mutable Three.js scene objects where a data value is sufficient

UI and effects should consume snapshots rather than reach into private controller closure state.

When exposing a new system, include enough telemetry to validate behavior but avoid dumping entire internal graphs into every snapshot.

## Current important limitations

Do not overclaim the current model.

Still absent or intentionally simplified unless current source proves otherwise:

- professional nonlinear tire model
- Pacejka
- brush model
- tire aligning torque
- camber thrust
- full combined-slip physics
- tire carcass temperature
- tire wear
- punctures/blowouts
- bead unseating
- rim damage
- full suspension geometry
- heave/pitch/roll chassis dynamics
- anti-roll bars
- collision response
- terrain heightfields or deformable terrain
- surface zones beyond the flat placeholder
- full engine torque-to-wheel driveline
- clutch
- torque converter physics
- multi-speed automatic shifting logic
- manual clutch/shifter
- driveshaft/axle compliance
- center differential
- transfer case
- traction control
- stability control
- torque vectoring
- downforce/lift/wind/drafting
- damage model
- sound model tied to true powertrain load
- particle simulation beyond simple visual feedback

## Implementation strategy

When adding a feature:

1. inspect the actual current path
2. identify state ownership
3. classify field lifetimes
4. identify the exact integration point
5. state the existing behavior before editing
6. make the smallest coherent change
7. preserve unrelated systems
8. add focused telemetry
9. add deterministic regression coverage
10. validate runtime behavior
11. review the final diff for accidental scope expansion

Prefer:

- pure calculation helpers
- narrow state modules
- explicit update/reset APIs
- finite clamps with documented meaning
- independent Node tests for non-Three calculations
- small controller wiring changes
- honest names such as `basic`, `v1`, `approximation`, or `foundation`

Avoid:

- broad rewrites
- speculative architecture
- hidden side effects
- duplicate state systems
- changes based only on README claims
- “fixes” that simply raise grip, force, stiffness, or mass
- disabling a model to hide a bug
- unrelated UI or visual work in a physics branch
- physics changes in a visual-only branch

## Code-generation style

When editing:

- preserve `// path/to/file.js` as the first line of source files
- keep imports explicit
- use repository formatting conventions
- avoid placeholders and ellipses in delivered code
- prefer exact, reviewable changes
- avoid unnecessary abstractions
- avoid new dependencies
- preserve public APIs unless a deliberate migration is required
- keep visual and physics state clearly separated
- use descriptive unit-bearing identifiers
- retain existing comments that describe active invariants
- update stale comments when behavior changes

When adding modules:

- choose a narrow responsibility
- expose creator/reset/update/calculation functions as appropriate
- do not make UI imports part of a dynamics module
- avoid direct DOM access in vehicle dynamics
- avoid scene mutation in pure state modules
- make calculations Node-testable when practical

## Performance rules

Hot paths include:

- fixed-step controller updates
- per-wheel loops
- render-loop visual updates
- geometry deformation loops
- HUD updates

Rules:

- avoid obvious per-frame/per-step allocations
- reuse `THREE.Vector3`, matrices, and scratch objects
- avoid `map`, `filter`, object spread, or temporary arrays in hot loops when a simple loop is clear
- do not prematurely obscure code for micro-optimization
- derive deformable geometry from immutable baseline data rather than accumulating edits
- only flag buffer attributes for update when necessary
- update normals/bounds only when geometry actually changes
- keep snapshots compact
- clamp `dt`
- keep all runtime values finite

## Testing rules

Use existing Node-native tests. Do not add a test framework unless explicitly requested.

Inspect:

- `test/`
- `tests/`
- `package.json`
- existing `node --test` usage

Important regression targets:

### Core motion

- Drive + throttle produces nonzero applied force and forward movement
- Reverse + throttle produces opposite-direction movement
- Neutral + throttle produces no drive force
- braking slows without reverse propulsion
- reset restores finite baseline state

### Longitudinal relaxation

- nonzero target plus positive `dt` produces nonzero relaxed/applied force
- repeated steps advance rather than restart relaxation
- explicit reset clears history
- airborne/zero-traction state clears or suppresses output correctly

### Combined force

- combined magnitude does not exceed traction limit plus epsilon
- straight-line and turning state remain finite
- no stale-force/fresh-limit mismatch

### Tire pressure

- nominal baseline
- underinflated acceleration
- underinflated turning
- overinflated bounds
- mixed per-wheel pressures
- rolling resistance near zero speed
- service brake/ABS compatibility
- parking-brake compatibility
- friction/normal-force boundary
- no NaN/Infinity

### Differential

- open split/coupling semantics
- Torsen bias without hard speed lock
- limited-slip bounded coupling and momentum preservation
- locked/welded speed equality and momentum preservation when coupling is implemented
- reset behavior
- reverse angular velocity
- unequal wheel inertia where supported

### Visual tire work

When pure geometry helpers exist, test:

- finite vertices
- bead-anchor invariance
- hub clearance
- lower-vs-upper deformation
- pressure response
- load response
- airborne behavior
- ground-relative direction
- per-wheel independence
- reset/no cumulative drift

## Browser/manual validation

Behavior-changing work should be checked in the browser when practical.

Minimum general pass:

- application loads without console errors
- Drive works
- Reverse works
- Neutral blocks propulsion
- service brake works
- parking brake works
- steering works
- reset works
- camera modes still work
- wheel spin remains finite
- tire force remains finite
- position/yaw remain finite
- HUD updates
- driver-facing UI remains compact
- no new visual clipping or disappearing meshes

For differential work:

- inspect open, limited-slip, Torsen, locked, and welded modes
- verify split/coupling telemetry
- test forward and reverse
- test braking and throttle release
- watch for wheel-speed explosion, sign inversion, or double coupling

For tire visual work:

- minimum, nominal, and maximum pressure
- stationary under load
- accelerating
- braking
- turning
- airborne if available
- hub clearance
- contact patch orientation while the wheel spins
- distinct per-wheel pressure visuals
- clean reset

## Build and validation checklist

Before saying work is ready:

- `git status --short --branch`
- `git diff --check`
- `git diff --stat`
- inspect `git diff`
- `npm run build`
- run all relevant Node-native tests
- run focused `rg` checks for the changed system
- inspect generated/untracked files
- verify the intended new module/test is staged when committing
- manually test browser behavior when runtime behavior changed
- report exact validation results
- report any command blocked by sandbox/approval

The current Vite build may emit a large-chunk warning. Treat it as a warning unless the task specifically addresses bundling.

## Windows and Codex execution notes

The repository is commonly used on Windows with Git Bash and PowerShell.

Known environment behavior:

- Node child processes may fail with `spawn EPERM` inside a restricted Codex sandbox
- `node --test` may require one-time approval to run outside the sandbox
- do not rewrite a valid test merely because the sandbox blocked process creation
- report the restriction and rerun with explicit approval when appropriate
- stale Vite dependency state may require stopping the server, removing `node_modules/.vite`, and starting Vite with `--force`
- PowerShell does not provide Unix `head`/`tail` semantics reliably in all environments; use `Select-Object` there
- Git Bash commands should remain Git Bash compatible when the user requests a shell block

Do not request or assume permanent permission to commit, push, merge, or execute unrestricted commands.

## Git and branch rules

Before branch work:

1. read repo instructions
2. inspect status
3. verify the current branch
4. fetch the relevant remote ref when requested/appropriate
5. verify `main`, `origin/main`, and `HEAD` before branching
6. do not discard unrelated user changes
7. stop if branch state conflicts with the task

Preferred branch prefix:

- `codex/` unless the user specifies another name

Do not commit, push, publish, open a PR, merge, or delete branches unless the user explicitly requests it.

When explicitly asked to publish:

- plain Git commands are acceptable
- GitHub CLI is acceptable
- if the installed OpenAI GitHub/`yeet` skill is available and the user explicitly asks to use it, read and follow that skill
- do not invoke a user shell alias named `yeet`
- distinguish the installed skill from local aliases/scripts
- expect approval prompts for commit/push/merge operations
- never grant or request blanket permanent permission on the user’s behalf

After merge/cleanup, prove synchronization:

- current branch is `main`
- worktree is clean
- `HEAD`, `main`, and `origin/main` resolve to the same commit
- merged feature branch is absent locally if deletion was requested
- remote branch is absent after fetch/prune if deletion was requested
- report the merge commit or final head

## Documentation rules

README and skill updates must reflect implemented behavior, not planned behavior.

When documenting:

- label approximations honestly
- state what remains telemetry-only
- state what remains visual-only
- state what is branch-local
- avoid claiming professional fidelity
- list explicit non-goals when a subsystem could be misunderstood
- update outdated roadmap sections when a “future” feature now exists
- do not duplicate large implementation details in several documents without reason

This skill should be refreshed after major architecture changes.

## Common failure patterns

### Wheels spin but chassis does not move

Check, in order:

- throttle and gear direction
- requested drive force
- wheel drive torque
- wheel angular velocity
- wheel grounding
- normal force
- traction limit
- slip ratio
- target longitudinal tire force
- relaxed longitudinal tire force
- applied longitudinal tire force
- integration-input force trace
- net chassis force
- velocity/position integration

A nonzero target with zero relaxed/applied force points to relaxation state, `dt`, reset order, or integration order.

### Tire force silently becomes zero

Check:

- early return for airborne/zero traction
- sanitization
- invalid stiffness
- invalid effective radius
- zero relaxation alpha
- persistent state reset
- force overwritten during telemetry refresh
- combined-cap ordering

### Braking reverse-propels the vehicle

Check:

- brake torque overshoot
- zero-crossing clamp
- rolling resistance sign
- stale ground-speed sign
- service vs parking brake mixing

### Visual tire covers the hub

Current likely cause:

- whole-object width/radius scaling around tire center
- no fixed bead boundary
- cylindrical rather than toroidal visual geometry
- pressure-only deformation with no load-localized region

Do not “fix” by shrinking the hub or hiding clipping.

### Differential creates energy

Check:

- internal coupling torques are equal and opposite
- momentum before/after coupling
- unequal wheel inertias
- overshoot clamp
- coupling applied only once
- locked/welded common speed is inertia-weighted
- Torsen was not accidentally hard-locked

### HUD disagrees with behavior

Check:

- whether HUD reads integration-input or post-refresh state
- whether snapshot contains mutable references
- whether a trace stage is stale
- whether render-frame step count is being mistaken for cumulative state

## Near-term roadmap

Verify branch status before treating this as prescriptive.

Likely immediate sequence:

1. finish, validate, publish, and merge rear differential wheel-speed coupling if still branch-local
2. replace current pressure-only whole-cylinder tire visual with load-aware anchored toroidal deformation
3. continue improving terrain/contact semantics and non-flat contact direction
4. refine tire curves and transient behavior only after current invariants remain covered
5. connect powertrain torque to propulsion in a dedicated driveline stage, not as a side effect
6. expand suspension/chassis dynamics in isolated stages
7. add traction/stability control only after the underlying tire and driveline signals are trustworthy

Do not combine several roadmap items into one branch unless explicitly requested.

## Final operating principle

For every vehicle-sim task:

- inspect first
- verify current source
- preserve state ownership
- classify lifetimes
- change one coherent seam
- keep values finite
- expose enough telemetry to prove behavior
- add focused regression coverage
- validate in build and browser
- document the approximation honestly
- do not publish without explicit authorization
