# Staff Engineer Roadmap: Unified Vehicle/Rocket Physics with Crash Deformation

**Created**: 2026-10-29
**Last source review**: 2026-11-01 (G1 contact identity and fixed-step slice)
**Status**: In progress — generic rigid-body, primitive collision, contact-solver, and G1 vertical-slice foundations are implemented; collision-world integration and vehicle migration remain.

---

## Executive Summary

**Current state (verified against source)**:
- **Car**: Planar chassis motion plus enabled, gated 3-DOF heave/pitch/roll; per-wheel raycast suspension and the existing tire-force model remain the live vehicle path.
- **Rocket**: Uses generic 6-DOF `RigidBody` through a compatibility wrapper, but retains rocket-owned update, ground-contact, stage-separation, and debris paths.
- **Shared physics modules**: `RigidBody`, primitive `Collision`, and PGS `ContactSolver` exist. Collision queries and the contact solver are not called by the production simulation step.
- **Not implemented**: `CollisionWorld`, broad phase, `VehicleRigidBody`, shared body registry, and shared car/rocket crash-deformation state.

**Target**: Preserve current vehicle and rocket behavior while incrementally moving them onto shared rigid-body, collision, and contact infrastructure. Keep tire-ground forces and suspension raycasts separate from chassis/body collision unless a later measured change explicitly replaces them.

This roadmap tracks the **unified-physics effort**. Existing vehicle-model seams are listed separately below; they are not prerequisites unless a migration step depends on them.

### Status Legend

| Status | Meaning |
|--------|---------|
| **Done** | Implemented and verified in the current source/test suite. |
| **Partial** | Some code or tests exist, but the capability is incomplete or not used at runtime. |
| **Not started** | No corresponding production implementation is present. |
| **Decision required** | Record a design choice before implementation; alternatives are not settled. |

Test/build counts are dated verification snapshots, not permanent guarantees. Re-run validation before updating them.

---

## Phase 0: Foundation — Unified Rigid Body Abstraction

**Status: Done for G1.** PR #124 added the generic body, rocket wrapper, and primitive narrow phase. PR #125 added the PGS contact solver. G1 slice two added deterministic contact identity/lifetime and a standalone fixed-step contact scenario. These modules remain standalone in production.

### 0.1 Generic Rigid Body — **Done**

`src/physics/RigidBody.js` provides 6-DOF state, force/impulse operations, diagonal body-frame inertia, and symplectic-Euler integration. `src/rocket/rocketRigidBody.js` is a compatibility wrapper. A differential test compares legacy and generic state vectors exactly over a 60-step scenario. This verifies that scenario, not every possible rocket scenario.

### 0.2 Primitive Narrow Phase — **Partial**

`src/physics/Collision.js` currently handles Sphere–Sphere, Sphere–Box, Sphere–Capsule, Capsule–Capsule, and Box–Box (including oriented box SAT). It returns a single contact. Capsule–Box, Cylinder, ConvexHull, Heightfield, broad phase, and runtime shape assignment are not implemented. Do not describe vehicle or rocket colliders as active until shapes are attached to live bodies and exercised through the runtime.

### 0.3 Contact Solver — **Partial**

`src/physics/ContactSolver.js` implements sequential PGS iterations, warm-start accumulators, Coulomb friction, restitution, and positional correction. Tests cover the solver in isolation; production code does not yet call `solveContacts`.

### 0.4 Runtime Contact Integration — **Done**

The fused `integrateRigidBody` compatibility API delegates to explicit `integrateRigidBodyVelocityPhase` and `integrateRigidBodyPositionPhase` functions. G1 slice two adds a standalone fixed-step scenario that orders forces, velocity integration, contact generation, solving plus positional projection, position integration, and contact-cache commit. The production simulation still does not insert collision generation or the solver between those phases.

Implemented:
1. `FixedStepContactScenario` drives one dynamic primitive against one static primitive through the split-phase API.
2. `ContactCache` keys ordered body pairs and narrow-phase feature IDs, reuses constraints only for persisting contacts, orders active contacts deterministically, and invalidates warm-start accumulators on pair or feature changes.
3. `Collision` exposes deterministic primitive feature IDs for cache identity, with documented primitive-level fallback for single-point capsule pairs.
4. End-to-end tests cover rest within the declared penetration tolerance, separation without impulse, friction, restitution, repeat-run determinism, warm-start persistence, and cache invalidation.

**Exit gate:** met by the fixed-step contact tests. The solver projects the pre-integration pose, position integration advances once from the post-solve velocity, and the double-correction regression test checks the combined result. Production orchestration and vehicle migration remain later gates.

---

## Phase 1: Collision World and Terrain/Obstacle Contacts

**Status: Not started beyond the Phase 0 narrow-phase and solver modules.**

### 1.1 Collision World and Broad Phase

Define body/collider registration, transform ownership, collision filtering, deterministic pair ordering, and contact-cache lifetime. Benchmark broad-phase candidates against the actual terrain and obstacle workload before choosing a grid size or data structure. The earlier 50 m uniform-grid proposal was an unvalidated estimate, not a requirement.

### 1.2 Terrain Contact

Keep heightfield/raycast queries for suspension and tire contact. Add a separate body-contact query only where needed; do not force the existing terrain into generic convex collision. Specify how terrain height, normal, and deformation revisions reach body contacts.

### 1.3 Obstacle Migration

Represent static obstacles as static colliders and movable obstacles as finite-mass bodies with supported primitive shapes. Preserve `createVehicleObstacleInteraction` until the new path passes equivalent interaction tests; remove or deprecate it only after parity and failure behavior are documented.

**Exit gate:** deterministic broad/narrow-phase contacts for selected primitive and terrain cases; bounded resting contact; filtered non-colliding pairs; no duplicate forces; existing terrain and obstacle regression tests pass.

---

## Phase 2: Car Rigid-Body Migration

**Status: Not started.** The vehicle controller remains authoritative. PR #123 added progressive suspension stops to that system; it did not migrate the car to `RigidBody`.

### 2.1 Vehicle Degrees of Freedom — **Decision required**

Choose one canonical chassis state before coding:
- **Compatibility-first adapter (recommended first step):** map current planar chassis state and gated heave/pitch/roll state to one rigid-body state behind a new, disabled-by-default gate. Preserve current defaults and do not integrate the same degree of freedom in both old and new solvers.
- **Full 6-DOF migration:** allow all translation and orientation axes and accept changes to rollover, airborne, contact, and tuning behavior. This is a model change, not a behavior-preserving refactor.

The old roadmap alternated between a hard planar lock and a soft planar constraint. Those are different models; select and test one. No vehicle rigid-body rollout flag is currently implemented.

### 2.2 Wheel Forces and Contact Patches

Keep the existing per-wheel suspension raycasts and tire-force calculations as force generators for the first adapter. Define coordinate transforms, force application points, and once-per-fixed-step ordering. A capsule collider is a possible body-contact approximation, not a replacement for tire slip, normal-load, or suspension calculations.

### 2.3 Chassis Collider

Start with a catalog-backed box only after verifying vehicle dimensions, local center, orientation, and filtering. Define behavior when a chassis/configuration change is applied at speed. Defer convex hulls until supported and tested.

### 2.4 Parity and Rollout

Compare the gated adapter against the current controller for straight-line acceleration, braking, steering/yaw response, suspension travel, reset, and airborne/recontact. Keep the current path as default until agreed tolerances pass. Document intentional behavior changes rather than claiming byte parity for a changed model.

**Exit gate:** one authoritative chassis transform and velocity; wheel forces applied exactly once; feature-off behavior unchanged; feature-on differences bounded by documented tests and tolerances.

---

## Phase 3: Unified Simulation Loop

**Status: Not started.** The fixed-step runner exists, but the car and rocket currently take mutually exclusive mode-specific steps.

### 3.1 Body Registry and Step Order

Specify ownership and order for force generation, collision detection, velocity solve, position integration, contact-cache update, and visual synchronization. Define which objects are bodies, which are systems, and how debris is created/destroyed without avoidable per-step allocation.

### 3.2 Active Participants and Mode Selection

Separate selected control/visual mode from whether a body participates in physics. Preserve current exclusive car/rocket behavior until a scenario explicitly opts into simultaneous participation; do not accidentally advance hidden entities or freeze a body needed for collision.

**Exit gate:** deterministic fixed-step tests advance a configured set of bodies in stable order; mode changes preserve intended state; car and rocket can coexist in a test world without adding game/menu behavior.

---

## Phase 4: Cross-Entity Interaction Scenarios

**Status: Not started.** These are physics regression scenarios, not gameplay modes.

### 4.1 Car-Rocket and Car-Car Contacts

Add deterministic scenes with declared masses, initial velocities, shape pairs, and expected momentum/penetration bounds. Multiplayer, AI racers, scoring, and race logic are out of scope.

### 4.2 Rocket and Debris Contacts

Test stage separation and debris contact only after each body is registered in the shared world. State how detached components inherit linear and angular velocity; measure resulting conservation error.

**Exit gate:** each scenario is reproducible from a fixed initial state and passes explicit bounds for momentum change, penetration, and finite state.

---

## Phase 5: Deformation System

**Status: Not started for crash damage.** Terrain deformation already exists in its own subsystem; tire-pressure visual deformation is not crash damage and does not imply a shared deformation model.

### 5.1 Deformation Contract

Before implementation, define per-object damage state, persistence/reset behavior, impact inputs, bounded update rate, and the boundary between visual damage and collision-shape changes. Define whether damage affects mass/inertia; do not change either implicitly.

### 5.2 First Demonstrator

Start with one bounded car-body visual deformation driven by a reproducible impact test. Add collider feedback only after shape updates are deterministic and contact-cache invalidation is specified.

### 5.3 Rocket Demonstrator

Choose one damage-driven test (for example, fin bending separate from commanded aerodynamic fin control, or nose shortening), define structural limits and aerodynamic/mass consequences, then test independently. Do not imply arbitrary skin-panel, crush, or fracture simulation from a visual dent.

**Exit gate:** repeatable impact produces bounded visual damage; reset restores baseline; if physics feedback is enabled, collision and mass-property updates are separately tested.

---

## Phase 6: Visual and Telemetry Integration

**Status: Not started for unified collisions/damage.** Limit this phase to physics-backed visualization and developer telemetry.

### 6.1 Deformation Visualization

Render the deformation state produced by Phase 5; verify reset, geometry disposal, and collider/visual revision synchronization.

### 6.2 Physics Audio

Add only event-driven impact or tire cues tied to measured contact/slip state. Do not add objectives, timers, or game-facing progression.

### 6.3 Telemetry

Expose contact count, penetration, impulses, solver iterations, and deformation state in developer telemetry. Keep raw physics values out of the driver-facing panel unless intentionally translated into driver-relevant status.

**Exit gate:** visuals represent the latest completed physics step and do not mutate simulation state; telemetry agrees with solver records in a deterministic test.

---

## Phase 7: Deferred Research Topics

**Status: Parking lot.** These are not committed milestones and must not block Phases 0–6. Re-scope each only when a concrete experiment justifies it.

| Topic | Possible experiment | Prerequisite |
|-------|---------------------|--------------|
| Soft-body tires | Compare FEM/XPBD against current tire model | Validated tire/contact baseline and a defined use case |
| Fracture and debris | Spawn bounded rigid debris from a failure criterion | Stable body registry and collision world |
| Fire/smoke/fluid | Visualize a defined fuel/thermal event | Physics event/state model; not a generic fluid-simulation commitment |
| Occupant kinematics | Ragdoll/crash-test dummy metrics | Defined measurement question and safety/validity scope |
| Deterministic replay | Replay fixed-step inputs and configuration | Determinism contract across all participating systems |
| Multi-body rocket | Booster/interstage collision tests | Shared registry, contact pipeline, and separation-state tests |

## Existing Vehicle Model: Baseline and Open Seams

This is context for the vehicle model that the unified-physics work must preserve or deliberately replace. It is separate from the phase numbering above. Defaults below were checked against `src/vehicle/defaultVehicleSpec.js` on 2026-10-31; source wins if this table later drifts.

### Verified Project Snapshot (2026-10-31)

- `npm test`: 852 tests pass.
- `npm run build`: succeeds; Vite reports the existing >500 kB chunk-size warning.
- Fixed 1/60 s timestep remains decoupled from rendering.
- The generic rigid body and rocket wrapper are merged; primitive collision and PGS solver tests pass, but neither collision query nor solver is wired into runtime stepping.
- Car remains planar plus gated 3-DOF vertical dynamics. Rocket is 6-DOF through the generic body wrapper but retains rocket-specific update/contact code.

### Vehicle Flag Defaults

| Default | Flags |
|---------|-------|
| ON | `verticalDynamicsEnabled`, `verticalDynamicsForcingEnabled`, `powertrainDriveTorqueEnabled`, `automaticTransmissionEnabled`, `serviceBrakeAbsEnabled` (legacy slip-ratio ABS), `longitudinalTireForceRelaxationEnabled` |
| OFF | `combinedSlipTireModelEnabled`, `engineDrivetrainModelEnabled`, `clutchModelEnabled`, `engineBrakingEnabled`, `aeroDownforceEnabled`, `tireThermalModelEnabled`, `advancedAbsEnabled`, `tractionControlEnabled`, `electronicStabilityControlEnabled`, `wheelLockModelEnabled` |

The combined-slip default preset is `brushFiala`. Optional parameterized Pacejka-style curves exist, but are not a validated professional tire library. The engine/drivetrain ODE and several driver-assist seams exist behind flags; their existence does not mean they are production defaults.

### Separate Vehicle-Model Seams

| Seam | Current status | What a separate completion effort would require |
|------|----------------|-----------------------------------------------|
| Combined-slip tire model | Disabled by default; brush/Fiala baseline | Validate optional curves against measured/accepted targets before any default change |
| Tire thermal feedback | Disabled | Feed validated temperature/wear friction changes into tire forces |
| Wheel-lock model | Disabled | Validate true wheel-lock behavior and interaction with ABS |
| Engine/friction-clutch model | Disabled | Validate flywheel/clutch behavior and define launch/shift scope |
| ABS/TC/ESC advanced behavior | Disabled | Validate staged control seams; do not imply production hydraulic behavior |
| Downforce/lift | Disabled | Validate load coupling; wind/drafting remain separate gaps |
| Roll-center depth | Per-axle roll-center height is consumed; longitudinal anti-dive/squat is not modeled | Define longitudinal geometry and tests if required |
| Solid-axle lateral transfer | Not modeled across the coupled axle | Model beam articulation/leaf torsional behavior if required |
| Beyond 3-DOF sprung mass | Not modeled | Define landing impulses and nonlinear suspension coupling |
| Timestep sensitivity | Regression spread is documented | Decide acceptable sensitivity or adopt/validate sub-stepping |

Do not make these unrelated seams blockers for rigid-body plumbing. When a migration depends on one, link that specific dependency and its test rather than reopening the whole vehicle roadmap.

---

## Technical Decisions and Open Questions

| Area | Current evidence | Decision / next action |
|------|------------------|------------------------|
| Integration | Generic body uses symplectic Euler; contact solver requires a velocity/position boundary | Keep the integrator unless evidence requires change; resolve and test solver ordering before runtime use |
| Narrow phase | Analytical Sphere/Capsule/Box tests; OBB SAT for Box–Box; single contact | Extend only for required pairs. Decide on GJK/EPA when a convex-hull use case exists |
| Contact solver | PGS with warm-start, friction, restitution, and positional projection is implemented in isolation | Keep PGS for the first vertical slice; test stability and convergence in runtime before tuning or replacing it |
| Vehicle degrees of freedom | Current car is planar plus gated heave/pitch/roll; roadmap previously proposed both hard and soft planar constraints | Record one canonical-state design. Prefer a gated compatibility adapter first; full 6-DOF is a separately tested behavior change |
| Terrain | Suspension uses terrain queries; no generic heightfield collider exists | Preserve the query path and add the smallest body-contact query that satisfies tests |
| Broad phase | No implementation or measured workload comparison | Benchmark uniform grid, sweep/prune, or other candidates before selecting; do not assume 50 m cells |
| Deformation | No shared crash-damage model | Build one bounded visual demonstrator before selecting a general representation or changing collider/mass state |

---

## Migration Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Car behavior changes during migration | Keep the legacy path as default; gate the adapter; compare named scenarios and record tolerated differences |
| Duplicate or missing forces | Assign one owner and one fixed-step phase to each force source; test wheel-force application exactly once |
| Contact jitter or stale warm starts | Give contacts stable identities, deterministic order, explicit invalidation, and resting-contact regression tests |
| Rocket behavior drifts | Keep the legacy differential test and full rocket suite passing as body/integrator changes land |
| Collision performance degrades | Measure candidate pairs, active contacts, solver time, and frame cost on a declared test workload before choosing a broad phase |
| Visual/physics desync | Version collision and visual geometry updates; verify reset/disposal and that rendering never mutates physics state |
| Damage causes unbounded physics changes | Bound deformation; make collider and mass-property feedback separately gated and tested |

---

## File Structure: Current and Candidate

**Present foundation**:

```text
src/physics/
  RigidBody.js
  Collision.js
  ContactSolver.js
  shapes/Box.js
  shapes/Capsule.js
  shapes/Sphere.js
src/rocket/rocketRigidBody.js  # compatibility wrapper
```

**Candidate additions, only when their phase consumes them**:

```text
src/physics/
  CollisionWorld.js           # body/collider lifecycle and contact generation
  BroadPhase.js               # selected only after workload comparison
  DeformationState.js         # shared only when a real consumer exists
src/vehicle/
  VehicleRigidBody.js         # or adapter module; design pending
src/simulation/
  UnifiedSimulation.js        # body registry and ordered fixed step
src/terrain/
  HeightfieldBodyContact.js   # if tests require a separate terrain body query
```

Do not add shape types, loaders, schemas, or modules before a live consumer and tests require them.

---

## Milestone Gates (Definition of Done)

| Gate | Status | Completion criteria |
|------|--------|---------------------|
| **G0: Generic body parity** | **Done** | Rocket wrapper uses generic body; legacy differential test compares exact state vectors for its 60-step scenario; full suite passes |
| **G1: Runtime contact vertical slice** | **Done** | Fixed-step test runs collision generation, persistent constraints, solver, and integration; resting/separating/friction/restitution cases pass declared tolerances and deterministic replay |
| **G2: Collision world** | **Not started** | Stable pair generation and filtering; selected static/dynamic shapes and terrain/obstacle cases pass; warm-start cache survives only valid contacts |
| **G3: Gated car adapter** | **Not started** | One chassis state; existing wheel forces applied once; baseline scenarios and documented feature-on tolerances pass |
| **G4: Unified step and registry** | **Not started** | Configured car, rocket, and debris bodies step in deterministic order; mode changes and activation semantics have explicit tests |
| **G5: Cross-entity scenarios** | **Not started** | Car/rocket, car/car, and rocket/debris scenes meet declared momentum, penetration, and finite-state bounds |
| **G6: Deformation MVP** | **Not started** | Reproducible bounded damage, reset, and separately verified collider/mass feedback where enabled |
| **G7: Release/performance gate** | **Not started** | Full tests and build pass; at a recorded machine and declared body/contact load, p95 fixed-step time stays below 16.67 ms; contact count, solver settings, and visual-sync lag (target: at most one rendered frame) are reported |

For every new numeric threshold, record its physical units and rationale when the test is introduced. “Plausible,” “no interpenetration,” and “production” are not acceptance criteria by themselves.

---

## Working Rules for This Roadmap

1. Work one gate at a time; a phase is not complete because its module exists.
2. Each implementation PR states the source behavior changed, tests added/run, feature-flag defaults, and any known behavior difference.
3. Preserve the vehicle’s existing tire and suspension model unless a task explicitly migrates it.
4. Keep terrain suspension queries separate from rigid-body contacts unless a validated replacement is ready.
5. Test determinism and contact lifecycle at the same stage as integration, not as late cleanup.
6. Treat Phase 7 as a research backlog, not a promised feature set. Game systems remain out of scope.

---

## Recommended Execution Order

1. **G0 is complete.** Keep its differential test as a regression gate.
2. **G1 is complete.** Keep its fixed-step contact scenario and lifecycle tests as regression gates.
3. **Complete G2:** add collision-world lifecycle, terrain/body contacts, and obstacle migration behind tests. G2 has not started.
4. **Complete G3:** choose the vehicle DOF contract, then add the gated car adapter while preserving the old default.
5. **Complete G4–G5:** unify body stepping, then prove cross-entity contacts.
6. **Complete G6–G7:** build one deformation demonstrator, integrate telemetry/visuals, and measure release performance.

Calendar estimates are intentionally omitted: the remaining work depends on unresolved solver-order and vehicle-DOF decisions, and no capacity assumption is recorded. Re-estimate after G1 with measured implementation scope.

---

## Merged Work and Verification Snapshot

- **PR #123:** Progressive suspension stops in the existing vehicle path; useful vehicle-model work, not a unified-rigid-body milestone.
- **PR #124:** Generic `RigidBody`, rocket compatibility wrapper, primitive narrow phase, and legacy differential test. This fulfills the original first-PR scope.
- **PR #125:** PGS contact solver and isolated solver tests. Runtime wiring remains open.
- **Verified 2026-10-31:** `npm test` passes 852/852; `npm run build` succeeds with the Vite chunk-size warning.

---

## Bottom Line

The rigid-body foundation, primitive collision tests, PGS solver, and split integration-phase seam are implemented—not merely proposed. The key remaining step is to connect contact generation and solving to the split fixed-step phases with persistent contact state. After that, proceed through the collision world, a gated car adapter, unified stepping, cross-entity scenarios, and only then deformation. No end-to-end unified car/rocket collision or crash-deformation system exists yet.
