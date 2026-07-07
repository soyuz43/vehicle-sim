---
name: vehicle-sim-lab
description: Use for this repository's vehicle-sim work: Three.js vehicle simulation, controller extraction, force-based motion, R/N/D gear selector, units, gravity, fixed timestep, surface friction, per-wheel contact, tire slip, and fidelity-first simulation architecture. Do not use for arcade gameplay features unless explicitly requested.
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

## Existing/current modules expected

Likely modules:
- `src/main.js`: app wiring, scene, renderer, input, animation loop.
- `src/car/createCar.js`: visual car/chassis mesh group and metadata.
- `src/vehicle/createVehicleController.js`: vehicle controller/simulation behavior.
- `src/vehicle/defaultVehicleSpec.js`: physical vehicle spec values.
- `src/simulation/simulationConstants.js`: unit/gravity/axis constants.
- `src/terrain/createTerrain.js`: terrain mesh and metadata.
- `src/ui/debugHud/createDebugHud.js`: physics/debug telemetry.
- `src/ui/gearIndicator/createGearIndicator.js`: driver-facing gear display, if present.
- `src/controls/CameraManager.js`: camera mode orchestration.
- `src/controls/cameraControls.js`: camera behavior.

## Preferred staged roadmap

Stage A: input semantics
- W = throttle
- S = brake
- A/D = steering
- bracket keys = R/N/D selector
- R remains reset
- C remains camera
- S must not mean reverse
- Reverse motion requires gear=reverse and throttle

Stage B: fixed timestep
- render loop variable
- simulation loop fixed
- accumulator
- max frame clamp
- physics step likely 1/60 or 1/120
- avoid unstable catch-up spirals

Stage C: terrain surface query
- flat terrain can return surface metadata
- surface examples:
  - asphalt mu ~ 1.0
  - dirt mu ~ 0.55
  - gravel mu ~ 0.45
  - ice mu ~ 0.08
- start with zones before complex geometry

Stage D: per-wheel contact state
Each wheel state should eventually include:
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
- requestedLongitudinalForceNewtons
- appliedLongitudinalForceNewtons
- requestedLateralForceNewtons
- appliedLateralForceNewtons
- angularVelocityRadiansPerSecond
- spinAngleRadians
- steeringAngleRadians
- longitudinalSlip
- lateralSlip
- isSlipping

Stage E: simplified tire grip
Start with:
- normal force per wheel = mass * gravity / 4
- traction limit = mu * normal force
- requested force can exceed traction limit
- applied force clamps to traction limit
- slip flag when requested exceeds available
Then later:
- longitudinal slip ratio
- lateral slip angle
- combined slip
- dynamic load transfer
- surface-dependent grip curves

Stage F: suspension/weight transfer
Do only after fixed timestep + contact state + surface query.
Avoid fake suspension presented as real.

## Force-based motion rules

Preferred conceptual model:
- driver input requests forces
- gear selector decides drive force direction
- tire/contact model limits force
- net force changes velocity
- velocity changes position

Do not regress to:
- `speed += arbitraryAcceleration * dt`
- direct arcade friction only
- `S` as reverse throttle
- steering that ignores direction unless intentionally designed

Acceptable transitional simplification:
- flat-ground longitudinal force model
- scalar speed along vehicle forward axis
- yaw steering still simplified
- even normal force distribution
- flat-asphalt placeholder surface
- visual wheel spin from speed/radius

Name transitional systems honestly:
- `flat-ground-force-longitudinal`
- `flat-asphalt-placeholder`
- `defaultSurfaceFrictionCoefficient`
- `tractionLimitLongitudinalNewtons`

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
- Drive + W => forward drive force
- Drive + S => brake
- Drive + S at stop => no reverse motion
- Neutral + W => no drive force
- Neutral + S => brake if moving
- Reverse + W => reverse drive force
- Reverse + S => brake

## UI rules

Separate UI concepts:
- Debug HUD = developer physics telemetry.
- Gear indicator = driver-facing gear state.
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

Gear indicator should show:
- R N D
- active gear highlighted
- always visible
- not inside debug panel

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

User workflow:
- `new <branch>`
- edit
- `bet`
- `yeet`
- `gh pr create`
- merge
- `slay`

If asked for workflow:
- use user aliases
- branch command must be `new <branch-name>`
- do not suggest raw `git add`, `git commit -m`, or `git push` unless asked
- PR body format:
  Summary:
  - bullets
  Changes:
  - bullets
  Bugs:
  - None or severity bullets

## Validation

Before saying a branch is ready:
- run or request `npm run build`
- inspect `gs`
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

## Known source-document context

A previous source document described the repo as a browser-based Three.js learning project and recommended a fidelity-first vehicle simulation lab direction. It emphasized future systems such as drivetrain torque, four-wheel contact, friction coefficients, tire slip, and different terrain surfaces. It also stated the core design principle: simulation state should become the source of truth while rendering visualizes that state. Treat that as project intent, but verify current code because the document may lag behind recent branches.

