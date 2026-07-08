---
name: vehicle-sim-lab
description: Use for this repository's vehicle-sim work: Three.js vehicle simulation, controller extraction, force-based motion, R/N/D gear selector, units, gravity, fixed timestep, surface friction, per-wheel contact, tire slip, wheel torque state, and fidelity-first simulation architecture. Do not use for arcade gameplay features unless explicitly requested.
---

# vehicle-sim-lab skill

## Activation

Use this skill when task involves any of:
- vehicle-sim repo
- Three.js vehicle movement
- vehicle controller
- vehicle physics
- force-based motion
- gravity/units
- wheel spin
- wheel torque
- steering articulation
- R/N/D gear selector
- throttle/brake semantics
- terrain surface query
- contact patches
- friction coefficient
- tire grip/slip
- fixed timestep
- simulation architecture
- debug HUD telemetry for physics

Do not use this skill for unrelated web/game UI/general app work.

## Project invariant

`vehicle-sim` is a browser-based Three.js vehicle simulation learning lab. It is not currently a finished game. Optimize for staged movement away from arcade control toward explicit simulation.

Primary objective:
- evolve from kinematic arcade movement to physically meaningful vehicle state and vehicle dynamics

Non-objectives unless user explicitly asks:
- checkpoints
- timers
- laps
- scoring
- collectibles
- menus
- racing game layer
- AI racers
- arcade objectives

## Current architecture snapshot

The current codebase has already moved past pure arcade movement. Treat these systems as existing, but verify current source before editing:

- fixed timestep simulation
- explicit unit contract
- R/N/D gear selector
- throttle/brake semantics where `S` is brake, not reverse
- flat terrain contact query
- finite per-wheel contact state
- per-wheel normal force placeholder
- per-wheel traction limit placeholder
- per-wheel longitudinal force requests and applied longitudinal force
- clamp-based longitudinal traction limiting
- explicit wheel rotational state
- per-wheel service brake pressure and brake torque command state
- per-wheel longitudinal slip ratio telemetry
- torque-coupled wheel angular dynamics
- temporary rolling correction torque to keep wheel angular velocity bounded while tire force is still clamp-based
- scalar vehicle acceleration still remains active
- simplified yaw/steering still remains active
- driver-facing gear/contact panel
- developer debug HUD telemetry

Important current limitations:
- tire force is not yet calculated from slip ratio
- clamp-based longitudinal force limiting still remains
- scalar vehicle acceleration still remains active
- no basic linear longitudinal tire model yet
- no ABS
- no parking brake
- no real wheel lock behavior
- no load transfer
- no suspension force model
- no drivetrain inertia model
- no lateral tire force model
- no combined-slip model
- no planar chassis/yaw rigid-body dynamics yet

## Unit contract

Hard constants:
- 1 world unit = 1 meter
- time = seconds
- velocity = m/s
- acceleration = m/s^2
- force = newtons
- mass = kilograms
- torque = N*m
- angle = radians internally
- Y+ = up
- gravity direction = negative Y
- standard gravity = 9.80665 m/s^2
- vehicle local forward = +Z

Rules:
- Unit-bearing identifiers must include unit suffix when practical.
- Do not introduce ambiguous physical parameters.
- Do not mix arbitrary "units" language with meter-based simulation code.
- HUD may display rounded values; simulation constants should retain precision.

## Architectural target

Long-term separation:
- Input layer: keyboard/gamepad to driver commands.
- Vehicle controller/simulation layer: state, forces, contacts, wheels, gear selector, integration.
- Terrain layer: height/surface/contact queries.
- Rendering layer: Three.js meshes visualize state.
- Camera layer: follows vehicle state/rendered transform.
- UI/debug layer: telemetry only.

Do not put new vehicle physics in `src/main.js` except call wiring.
Do not make camera own physics.
Do not make terrain only visual once surface/contact work begins.
Do not use rendered meshes as the long-term primary source of physics truth.
Do not let driver-facing UI mutate simulation state.
Do not let debug HUD calculations become simulation logic.

## Existing/current modules expected

Likely modules:
- `src/main.js`: app wiring, scene, renderer, input, animation loop.
- `src/car/createCar.js`: visual car/chassis mesh group and metadata.
- `src/vehicle/createVehicleController.js`: vehicle controller/simulation behavior.
- `src/vehicle/defaultVehicleSpec.js`: physical vehicle spec values.
- `src/simulation/createFixedTimestepRunner.js`: fixed timestep runner.
- `src/simulation/simulationConstants.js`: unit/gravity/axis constants.
- `src/terrain/createTerrain.js`: terrain mesh and metadata.
- `src/terrain/createFlatTerrainContactQuery.js`: flat terrain contact/surface query placeholder.
- `src/ui/debugHud/createDebugHud.js`: physics/debug telemetry.
- `src/ui/gearIndicator/createGearIndicator.js`: driver-facing gear/contact display.
- `src/controls/CameraManager.js`: camera mode orchestration.
- `src/controls/cameraControls.js`: camera behavior.

## Preferred staged roadmap

Completed or current foundation stages:
- input semantics
- fixed timestep
- flat terrain contact query
- finite per-wheel contact state
- per-wheel longitudinal force pipeline
- clamp-based traction limiting
- explicit wheel rotational state
- per-wheel service brake pressure/torque command state
- longitudinal slip ratio telemetry
- torque-coupled wheel angular dynamics

Next major physics stage:
- basic linear longitudinal tire model

Later stages:
- wheel lock detection
- ABS v1
- parking brake
- terrain surface zones and surface-dependent friction
- combined longitudinal surface/tire tuning
- planar chassis velocity and yaw-rate dynamics
- lateral slip angle
- lateral tire forces
- combined slip
- dynamic load transfer
- raycast/spherecast suspension

## Stage A: input semantics

Expected controls:
- W = throttle
- S = brake
- A/D = steering
- bracket keys = R/N/D selector
- R remains reset
- C remains camera
- S must not mean reverse
- Reverse motion requires gear=reverse and throttle

## Stage B: fixed timestep

Expected structure:
- render loop variable
- simulation loop fixed
- accumulator
- max frame clamp
- physics step likely 1/60 or 1/120
- avoid unstable catch-up spirals

## Stage C: terrain surface query

Current terrain may be flat but should expose query semantics.

Surface examples for future zones:
- asphalt mu ~ 1.0
- dirt mu ~ 0.55
- gravel mu ~ 0.45
- ice mu ~ 0.08

Start with zones before complex geometry.

## Stage D: per-wheel contact state

Each wheel state should include or preserve:
- id
- axle
- side
- driven
- steerable
- local position
- world position
- contact patch local/world
- isGrounded
- surfaceKind
- frictionCoefficient
- normalForceNewtons
- tractionLimitNewtons
- requestedDriveForceNewtons
- requestedBrakeForceNewtons
- requestedLongitudinalForceNewtons
- appliedLongitudinalForceNewtons
- angularVelocityRadiansPerSecond
- angularAccelerationRadiansPerSecondSquared
- spinAngleRadians
- steeringAngleRadians
- rollingSurfaceSpeedMetersPerSecond
- targetRollingAngularVelocityRadiansPerSecond
- wheelSurfaceSpeedMetersPerSecond
- longitudinalGroundSpeedMetersPerSecond
- longitudinalSlipRatio
- longitudinalSlipRatioAbs
- hasLongitudinalSlipSample
- serviceBrakePressure01
- requestedBrakeTorqueNewtonMeters
- appliedBrakeTorqueNewtonMeters
- driveTorqueNewtonMeters
- brakeTorqueNewtonMeters
- contactReactionTorqueNewtonMeters
- rollingConstraintCorrectionTorqueNewtonMeters
- netTorqueNewtonMeters
- isSlipping
- isWheelLocked

Future wheel fields may include:
- requestedLateralForceNewtons
- appliedLateralForceNewtons
- lateralSlipAngleRadians
- lateralSlip
- combinedSlipRatio
- suspensionCompressionMeters
- springForceNewtons
- damperForceNewtons

## Stage E: current longitudinal force pipeline

Current force pipeline:
- driver input requests drive/brake force
- gear selector decides direction
- drive force is distributed to driven wheels
- brake force is distributed to wheels
- each wheel applies clamp-based traction limiting using current contact state
- summed applied longitudinal force feeds the scalar vehicle acceleration model

Current clamp rule:
- tractionLimitNewtons = frictionCoefficient * normalForceNewtons
- appliedLongitudinalForceNewtons clamps requestedLongitudinalForceNewtons to +/- tractionLimitNewtons
- isSlipping currently means traction-limited, not a full tire model

Do not overclaim this as realistic tire behavior.

## Stage F: current wheel rotational dynamics

Current wheel rotation:
- wheel angular velocity is explicit simulation state
- wheel angular acceleration is explicit simulation state
- visual wheel spin reads from spinAngleRadians
- drive, brake, contact reaction, and temporary rolling correction torques contribute to net wheel torque
- net torque integrates wheel angular velocity through wheelInertiaKgMeterSquared
- longitudinal slip ratio is measured from wheel surface speed versus scalar longitudinal ground speed

Current bridge/limitation:
- scalar vehicle acceleration still comes from the existing clamp-based force pipeline
- slip ratio does not yet produce tire force
- a temporary rolling correction torque may remain to keep wheel spin bounded until the tire model consumes slip ratio

Do not remove or hide this limitation unless implementing the tire model branch.

## Stage G: next target — basic linear longitudinal tire model

Next major feature branch should likely be:

`basic-linear-longitudinal-tire-model`

Goal:
- replace direct requested-force clamp behavior with a simple slip-ratio-based longitudinal tire force model
- keep scalar vehicle acceleration for now
- keep model simple and reviewable

Expected basic model:
- consume longitudinalSlipRatio
- compute tire force from longitudinal stiffness and slip ratio
- cap force by +/- frictionCoefficient * normalForceNewtons
- expose requested/uncapped/capped force clearly
- preserve per-wheel telemetry
- document that this is a simple linear/saturated tire model, not Pacejka

Do not include in the same branch:
- ABS
- parking brake
- load transfer
- suspension
- lateral forces
- combined slip
- full drivetrain simulation
- planar chassis/yaw dynamics

## Stage H: later brake and ABS work

After the basic longitudinal tire model:
- wheel lock detection can use slip ratio and wheel angular velocity
- ABS can modulate service brake pressure/torque
- parking brake can inject rear-wheel brake torque
- brake bias can distribute service brake torque front/rear
- tire curves can be made more nonlinear

Do not implement ABS before slip-ratio-based tire force exists unless explicitly requested.

## Stage I: later chassis and lateral dynamics

Later professional-sim direction:
- replace scalar speed with planar velocity vector
- track local forward/lateral velocity
- track yaw rate
- compute per-wheel contact patch velocity
- compute lateral slip angle
- compute lateral tire forces
- integrate yaw torque
- add combined slip

Do not mix this with longitudinal tire model work unless user explicitly asks.

## Force-based motion rules

Preferred conceptual model:
- driver input requests throttle/brake/steering
- gear selector decides drive direction
- wheel torque and tire/contact model decide available force
- net force changes velocity
- velocity changes position
- wheel angular velocity and spin visualize rotational state

Do not regress to:
- `speed += arbitraryAcceleration * dt`
- direct arcade friction only
- `S` as reverse throttle
- steering that ignores direction unless intentionally designed
- visual wheel spin computed ad hoc from speed/radius outside wheel rotational state

Acceptable current transitional simplifications:
- scalar speed along vehicle forward axis
- scalar vehicle acceleration model
- simplified yaw steering
- even normal force distribution
- flat-asphalt placeholder surface
- clamp-based longitudinal force limiting
- temporary rolling correction torque
- slip ratio telemetry only

Name transitional systems honestly:
- `flat-ground-force-longitudinal`
- `flat-asphalt-placeholder`
- `defaultSurfaceFrictionCoefficient`
- `tractionLimitLongitudinalNewtons`
- `rollingConstraintCorrectionTorqueNewtonMeters`
- `longitudinalSlipRatio`
- `clamp-based traction limiting`

## Gear selector model

Current desired selector:
- gears: reverse, neutral, drive
- labels: R, N, D
- directions: reverse=-1, neutral=0, drive=1
- no RPM
- no gear ratios
- no clutch
- no torque converter
- no automatic transmission logic
- no multi-speed shifting yet

Controls:
- `BracketLeft` shifts selector down
- `BracketRight` shifts selector up
- selector should wrap if user requested wrap behavior
- bracket key shifting should be edge-triggered; ignore `keydown` repeat

Expected behavior:
- Drive + W => forward drive request
- Drive + S => brake
- Drive + S at stop => no reverse motion
- Neutral + W => no drive force
- Neutral + S => brake if moving
- Reverse + W => reverse drive request
- Reverse + S => brake

## UI rules

Separate UI concepts:
- Debug HUD = developer physics telemetry.
- Gear/contact indicator = driver-facing gear/contact state.
- Controls text belongs in README, not permanent debug HUD, unless user asks.

Debug HUD may show:
- controller kind
- throttle
- brake
- steering
- dt
- position
- speed
- velocity
- acceleration
- drive force
- brake force
- rolling resistance
- aero drag
- net force
- traction limit
- traction limited
- terrain status
- wheel contact summary
- wheel angular velocity
- wheel net torque
- service brake pressure/torque
- longitudinal slip ratio

Driver-facing gear/contact indicator may show:
- R N D
- active gear highlighted
- speed
- compact wheel contact status
- compact traction/contact placeholders
- surface/contact badges when implemented

Driver-facing gear/contact indicator should not show:
- raw torque internals
- raw slip-ratio numbers
- ABS internals
- developer-only integration details

## Code-generation style

When editing code:
- preserve `// path/to/file.js` first-line comments
- prefer full-file replacements when user asks
- otherwise provide exact anchors and replacements
- do not use placeholders or ellipses in code
- keep imports explicit
- avoid unnecessary abstractions
- avoid dependencies
- avoid hidden behavior changes

When adding new modules:
- keep module responsibility narrow
- export creator functions or constants
- prefer data snapshots for HUD/UI
- do not let UI mutate simulation state except through explicit controller methods

## Performance rules

Hot-loop rules:
- avoid per-frame allocations where easy
- reuse `THREE.Vector3` instances
- be careful with `map/filter` inside per-frame loops if the loop becomes hot
- okay to prioritize clarity for early prototype, but do not create obvious garbage in animation loop
- clamp dt
- fixed timestep should be introduced before deeper physics

## Git/PR rules

Human workflow may use:
- `new <branch>`
- edit
- `bet`
- `yeet`
- `gh pr create`
- merge
- `slay`

Codex workflow should use plain commands:
- do not tell Codex to use `bet`, `yeet`, `slay`, or user shell aliases
- prefer branch names prefixed with `codex/` unless user requests otherwise
- use plain `git status`, `git switch -c`, `git add`, `git commit`, `git push`, and `gh pr create`
- prefer `rg` over `grep`
- do not rely on interactive shell aliases/scripts

PR body format:
Summary:
- bullets

Changes:
- bullets

Bugs:
- None or severity bullets

## Validation

Before saying a branch is ready:
- run or request `npm run build`
- run `git diff --check`
- run `git status --short --branch`
- run `git diff --stat`
- use `rg` source checks relevant to the branch
- use focused Node sanity checks when controller state changes
- verify expected behavior manually in browser when behavior changed
- state exact behavior to test

For R/N/D gear selector, test:
- D: W accelerates forward
- D: S brakes and does not reverse after stop
- N: W does not accelerate
- N: S brakes if moving
- R: W accelerates backward
- R: S brakes
- brackets shift as specified
- holding brackets does not spam if repeat ignored
- gear indicator updates immediately

For wheel/contact/force branches, test:
- driving works
- braking works
- reverse works
- neutral works
- reset works
- brake lights respond
- driver HUD updates
- debug HUD updates
- wheel contact states remain finite
- wheel angular values remain finite
- no obvious visual wheel-spin explosion
- no unintended driver-panel clutter

## Known source-document context

A previous source document described the repo as a browser-based Three.js learning project and recommended a fidelity-first vehicle simulation lab direction. It emphasized future systems such as drivetrain torque, four-wheel contact, friction coefficients, tire slip, and different terrain surfaces. It also stated the core design principle: simulation state should become the source of truth while rendering visualizes that state. Treat that as project intent, but verify current code because the document may lag behind recent branches.