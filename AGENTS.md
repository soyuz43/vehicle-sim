# AGENTS.md

## 1. Repository Identity & Scope
- **Project**: `vehicle-sim` – A fidelity-first Three.js vehicle simulation learning lab.
- **Runtime**: Browser-based Vite + Three.js application.
- **Language**: JavaScript ES Modules.
- **Core Philosophy**: "Simulation is the source of truth; Rendering is the visualization."
- **Scope Boundary**: This is a physics sandbox, **not** a game.
  - **DO NOT** implement: Timers, checkpoints, lap systems, scoring, AI racers, menus, or arcade objectives.
  - **DO** implement: Deterministic physics, per-wheel state, contact patches, force accumulation, and telemetry.

## 2. Environment & Tooling Constraints (Critical)
*Failure to adhere to these causes significant friction in this specific Windows/MINGW64 sandbox.*

- **OS**: Windows (MINGW64/PowerShell).
- **Line Endings**: All source files use **LF**.
  - *Action*: When using text replacement scripts, ensure anchors match LF. Do not assume CRLF.
- **Patch Strategy**:
  - If `apply_patch` fails on an existing file, switch immediately to a simple, exact text replacement strategy (e.g., repository-local Node scripts or PowerShell here-strings).
  - Prefer replacing one complete, clearly anchored block at a time.
  - Before writing, verify the old text occurs exactly once.
  - After writing, immediately run `npm run build` or a targeted syntax/build check when editing JavaScript structure.
  - Do not perform broad line-index rewrites unless explicitly recovering a file and comparing against `git diff`.
  - **Do not** retry `apply_patch` more than once on the same file.
- **Search Tools**:
  - **PREFER**: `rg` (ripgrep).
  - **AVOID**: `grep`. It frequently fails with permission/mapping errors in this sandbox.
- **Git Commands**:
  - **DO NOT** use custom aliases (`bet`, `yeet`, `slay`). They are not available in this shell context.
  - **USE**: Raw commands (`git add`, `git commit`, `git push`, `gh pr create`).
- **Build Validation**:
  - Always run `npm run build` before reporting completion.
  - Ignore the existing Vite chunk-size warning unless it blocks compilation.

### 2.1 Command Construction & Repository Inspection Rules

These rules exist to maximize the reliability of automated repository inspection. Incorrect shell commands can produce false negatives, wasted context, or incorrect conclusions. Accuracy is more important than minimizing command count.

#### General Command Policy
- Prefer simple, explicit, portable commands.
- Use commands known to work in this repository's Windows PowerShell execution environment.
- Prefer `rg` for source inspection.
- Do not rely on interactive shell state, aliases, shell functions, or user-specific scripts.
- If a command fails, report the failure and correct the command before drawing conclusions.
- Never convert a command failure into a source-code conclusion.

#### Ripgrep Usage
When using `rg`:
- Search explicit paths instead of relying on custom file types.
- Prefer broad searches followed by narrowing.
- Prefer glob filtering (`-g "*.js"`) over custom type definitions.
- Search executable source before documentation unless documentation was explicitly requested.
- Use case-insensitive searches only when appropriate.
- Prefer searching known project roots instead of the entire repository.

Avoid:
- Custom `--type-add` definitions.
- Complex quoting or shell-specific syntax that is easily misparsed.
- Commands that are difficult to verify visually.

#### Interpreting Search Results
Distinguish carefully between these outcomes:
- Matching results were found.
- No matches were found for the requested search pattern.
- The command failed.
- The search scope was incomplete.

These are not equivalent. A search that returns no matches for one pattern does **not** establish that the underlying concept is absent. A failed command establishes nothing about the repository.

#### Progressive Search Strategy
1. Begin with broad terminology.
2. Narrow toward exact identifiers when evidence appears.
3. Read only the files necessary to answer the request.
4. Stop once sufficient evidence has been collected. Do not continue issuing increasingly similar searches after the relevant implementation has already been located.

#### Repository Inspection Discipline
- Respect user-specified scope limits.
- Prefer evidence over inference.
- Report uncertainty explicitly.
- Identify the files that were inspected.
- State whether conclusions are confirmed, probable, or unknown.
- Do not silently expand repository scope.

#### False-Negative Prevention
Before concluding that a feature, identifier, or concept does not exist:
- Perform both a broad conceptual search and an exact identifier search when practical.
- Verify that the search command executed successfully and the intended roots were actually searched.
- Distinguish between: absence of evidence, evidence of absence, command failure, and incomplete search scope.

#### Output Quality
- Present findings before recommendations.
- Separate confirmed observations from inferences.
- Do not overstate confidence.
- Keep output proportional to the requested scope.
- Stop once the requested objective has been satisfied.

### 2.2 Source Editing & Recovery Discipline

#### General Editing Policy
- Make the smallest source edit that satisfies the current objective.
- Prefer replacing one complete, clearly bounded block at a time.
- Prefer function-level or object-literal-level replacements over scattered line-index edits.
- Do not rewrite an entire large file unless explicitly instructed.
- Do not mix unrelated concerns in one edit pass (e.g., do not edit controller physics, HUD formatting, and README wording in the same recovery step).

#### Exact Replacement Safety
- Verify the target text occurs exactly once before replacing it.
- If the target text occurs zero times, stop and inspect the current file instead of guessing.
- If the target text occurs more than once, narrow the anchor before replacing.
- After writing the file, immediately inspect the changed region with `git diff -- <path>`.
- Never assume a replacement succeeded because the command produced no output.
- Never continue implementation on top of a failed or uncertain replacement.

#### JavaScript Structure Safety
- Preserve existing function boundaries unless intentionally changing them.
- Do not duplicate function declarations or leave nested duplicate declarations.
- Do not introduce helper functions inside another function unless the original file already uses that pattern intentionally.
- Preserve module-level helper placement, exported function structure, and file path header comments.
- Keep template literals intact. Do not replace backticks with plain text.
- If a build error points to syntax, fix syntax before doing any feature validation.

#### Build Recovery Priority
If `npm run build` fails after source edits:
1. Stop feature work and README/HUD polish.
2. Inspect the build error and `git diff -- <changed-file>`.
3. Fix the smallest syntax or structure issue first.
4. Rerun `npm run build`. Continue only after the build passes.

#### Structural Corruption Recovery
If source structure appears corrupted (duplicated functions, misplaced braces, broken template literals):
- Pause feature work. Do not commit, push, or continue adding behavior.
- Compare the corrupted file against `HEAD` with `git diff -- <path>`.
- Restore the original function/module boundary before preserving feature edits.
- If the file cannot be repaired confidently, restore it from `HEAD` and reapply only the necessary feature changes in smaller edits.
- After recovery, run: `npm run build`, `git diff --check`, and `git diff -- <path>`.

### 2.3 Windows Shell / PowerShell Discipline

#### Inspection
- Prefer `rg -n "pattern" src/ui src/vehicle src/car` over shell-style path globs such as `src/**/*.js`.
- Prefer `rg --files` or `Get-ChildItem` when enumerating files.
- Do not assume Bash glob expansion exists. If an inspection command fails because of shell syntax, correct the command and rerun it.

#### Reading Source
- Use `Get-Content -Raw <path>` when reading an entire file.
- For partial inspection, use `Get-Content <path> | Select-Object -Skip N -First M`, `Select-Object -Index`, small Node scripts, or `rg -n`.

#### Editing & Temporary Files
- Do not assume `apply_patch` is available. Prefer small, deterministic Node scripts or exact PowerShell text replacements.
- Prefer repository-local temporary scripts (e.g., `_patch.cjs`) when scripting edits. Remove them immediately after successful execution.
- Do not rely on `C:\temp` or `C:\tmp`.

#### Git & Validation
- Run normal Git commands directly. If Git operations are denied by the execution environment, report the exact error and explain the sandbox limitation. Do not silently substitute a different workflow.
- If the environment requires escalation to run builds or tests, request permission and rerun the exact command rather than replacing it with a weaker check.
- Distinguish shell limitations from project defects. Never infer behavior changes solely from command failures caused by the execution environment.

## 3. Inference & Quality-Control Contract

This document is a **quality-control and inference contract**. It records the verified current state of the simulation and the discipline required to reason about it. The project's actual implementation has advanced beyond any linear "next layer" list; treat this file as the baseline every claim about the codebase must reconcile against.

### 3.1 Verified Current State (Inference Baseline)
Confirmed present against `src/` and the passing test suite. This is the reference for "does the sim already do X?":
- Fixed-timestep physics (1/60 s) decoupled from render (`src/simulation/createFixedTimestepRunner.js`, `src/main.js`).
- Deterministic heightfield terrain plus per-wheel suspension raycast contact with hysteresis (`src/terrain/*`, `src/vehicle/createVehicleController.js`).
- Torque-coupled wheel rotational dynamics (angular velocity, inertia, net torque).
- Basic longitudinal (slip-ratio) and lateral (slip-angle) tire-force models joined by a simple friction-circle combined cap, with a feature-gated brush/Fiala combined-slip tire seam (default `combinedSlipTireModelEnabled: false` at `src/vehicle/defaultVehicleSpec.js`; includes a kinetic-friction floor and test-suite validation).
- Quasi-static longitudinal and lateral load transfer redistributing normal force, with a feature-gated 3-DOF sprung-mass heave/pitch/roll vertical-dynamics seam (currently ENABLED by default: `verticalDynamicsEnabled: true`). Forcing terms are gated separately by `verticalDynamicsForcingEnabled`.
- **Anti-Roll Bars (ARBs)**: Modeled as per-axle wheel-rate friction elements (`antiRollBarStiffnessNewtonsPerMeter`). Applies equal/opposite load transfer to left/right wheels and folds into the vertical dynamics roll stiffness matrix (`Krr`). Correctly no-ops on coupled/rigid axles.
- Planar chassis motion: world/local velocity, yaw, yaw rate, summed planar force and yaw moment.
- Aerodynamic drag (quadratic), optional feature-gated downforce/lift load, chassis mass properties, and a chassis-attitude foundation.
- Rear differential models (open, limited-slip, torsen, locked, welded), powertrain profiles, and active drive torque with predictive redline cap.
- **Advanced Powertrain (Gated)**: Integrated engine flywheel ODE and friction-element clutch with torque capacity (gated by `engineDrivetrainModelEnabled: false` to preserve byte-identical baseline). Includes throttle pedal ramping (`throttleResponseTimeSeconds`) to smooth binary inputs.
- Feature-gated automatic gear selection, clutch engagement, and engine braking.
- Service brake bias, ABS v1, feature-gated wheel-lock detection/advanced ABS, traction control, and electronic stability control.
- **7-Slot Vehicle Configuration**: `chassis`, `suspensionFront`, `suspensionRear`, `wheels`, `drivetrain`, `brakes`, `aero`. Supports nested per-axle specs with flat compatibility aliases.
- **Visuals & Live Apply**: Catalog-driven body visuals with live swapping and geometry disposal. Per-axle suspension visual routing (e.g., MacPherson control arm gating vs. generic independent).
- Tire pressure handling and visual deformation, a developer tuning panel, step-trace instrumentation, and a multi-rate timestep-sensitivity regression suite.
- Config Panel session state: the panel's dirty state is DERIVED from the staged selection and the running selection, never a stored flag. The panel's reset control is "Reset Vehicle" and restores the vehicle setup only; a staged terrain selection stays staged.
- Config Panel live apply: the applied setup is applied and RECORDED in `localStorage` before a terrain change reloads the session.
- Controller configuration reporting: the controller DERIVES the catalog configuration it is effectively running and reports every configuration change through `onConfigurationChanged`.
- Apply-at-speed reporting: a chassis change above 30 km/h drops the vertical dynamics state, and the apply reports that consequence.
- Roll-center consumption: the vertical dynamics derives a roll-center height per axle, shortens the elastic roll arm, and applies the direct part of the lateral load transfer straight to the per-corner normal force.
- **Rocket Prototype (MVR)**: a separate `src/rocket/` subsystem with six-degree-of-freedom rocket dynamics built on the generic `src/physics/RigidBody.js` primitive through a thin `rocketRigidBody.js` compatibility wrapper, reached through a vehicle-mode exclusive mode switch (`simulation.mode`, `'car'` or `'rocket'`). The vehicle solver is NOT extended to 6-DOF: it has planar motion plus a gated heave/pitch/roll seam, no orientation quaternion, no angular rate, and no inertia-tensor integration. The rocket reuses the shared gravity constant, the fixed-timestep runner, the terrain contact query, and the simulation constants. Its airframe is statically stable because the centre of pressure (the fin level, structural y = 3 m) sits BELOW the centre of mass (structural y = 8.06 m). A centre of pressure above the centre of mass is destabilising, not stabilising.
- **Generic rigid-body contract**: `src/physics/RigidBody.js` is the foundational 6-DOF primitive. It uses Symplectic Euler integration, assumes a diagonal inertia tensor expressed in the body frame, and stores position at the center of mass. It intentionally omits the Euler gyroscopic term (`omega x (I * omega)`). Its reusable `THREE.Vector3` and `THREE.Quaternion` scratch objects remain at module scope. Every body also carries a `contactId`: an explicit identity from `config.contactId`, otherwise a generated `rigid-body-N` id that survives `resetRigidBody` unless a new id is supplied. That id is the stable half of a contact-cache key.
- **Narrow-phase collision contract**: `src/physics/Collision.js` dispatches deterministic Sphere, Capsule, and Box narrow-phase tests using analytical primitive math and the 15-axis OBB Separating Axis Theorem. It returns a single-contact record with an A-to-B normal, penetration depth, and world-space point; shape dimensions use explicit SI suffixes (`radiusMeters`, `halfHeightMeters`, and `halfExtentsMeters`). The capsule-box pair and multi-point manifolds are not implemented. Every contact record also carries a `featureId`: a stable string naming the primitive support feature that was selected (for example `sphere-box:outside:face:y+` or `box-box:face:a:1:+`). The id describes the geometry, not the body order, and deliberately excludes the continuously moving contact point, which is what makes it usable as a persistent-contact identity.
- **Contact solver contract**: `src/physics/ContactSolver.js` resolves contact constraints with Projected Gauss-Seidel (sequential impulses), warm-starting, Coulomb friction, restitution, and a direct positional projection. It depends on `src/physics/RigidBody.js` for the impulse application and consumes the A-to-B normals produced by `src/physics/Collision.js`. See section 3.6.
- **Contact cache contract**: `src/physics/ContactCache.js` owns contact-constraint lifetime across frames. It keys a constraint by the ordered body pair plus the narrow-phase `featureId`, reuses the constraint object (and therefore its warm-start impulses) for a persisting contact, evicts contacts that were not generated in a step, and returns the active set in deterministic contact-key order. See section 3.7.
- **Collision world contract**: `src/physics/CollisionWorld.js` registers rigid bodies with primitive colliders and bitmask filters, generates deterministic O(N²) collision pairs, feeds contacts through the contact cache and solver, and preserves the velocity-solve-position step ordering. It is physics infrastructure only and is not yet consumed by the vehicle or rocket runtime. See section 3.8.
- **Fixed-step contact scenario**: `src/physics/FixedStepContactScenario.js` is a standalone vertical slice that orders one fixed step as: clear and apply forces, integrate velocity, generate the contact, solve and project, integrate position once, commit the contact cache. It exercises the split integration phases, but it is NOT wired into the production runtime; the vehicle and rocket simulations still step through the fused `integrateRigidBody` path.

### 3.2 Documented Unfinished Seams
The genuine next-layer gaps, self-identified in source comments and `README.md`. Any "future work" claim must map to one of these or be evidenced in code:
- Pacejka/professional tire model: the default model remains a staged brush/Fiala-style model, not a full validated tire library.
- GJK/EPA and ConvexHull collision support: the narrow phase currently supports only the explicit Sphere, Capsule, and Box pairs documented above.
- True multibody chassis dynamics beyond the gated 3-DOF vertical seam (landing impulses, nonlinear bump stops, detailed pitch/roll coupling).
- Roll-center depth: the roll-center height is consumed per-axle (front/rear from linkage geometry or solid-axle declaration). Longitudinal roll center (anti-dive/anti-squat) is not modelled.
- Solid axle lateral transfer: a coupled axle still takes no lateral load transfer across its own tires. The beam articulation and leaf torsional stiffness that would produce it are not modelled.
- Full production ABS/TC/ESC behavior: currently feature-gated staged seams, not a complete hydraulic/production stability-control system.
- Drift models and rich tire audio/visual effects (squeal, smoke, persistent skid marks).
- Powertrain depth: torque converter (fluid coupling), detailed shift actuation, driveline compliance, launch control.
- Aero depth: wind and drafting are not modeled; downforce/lift is a first-order speed-squared vertical load.
- Timestep sensitivity: documented long-brake stopping-distance and stop-time spread across 60 to 480 Hz.
- Contact solver depth: the solver resolves single-point contact and friction constraints only. Joints, hinges, suspension constraints, multi-point manifolds, and continuous collision detection (tunnelling) are not implemented.
- Contact-cache integration: the contact cache and the fixed-step scenario are standalone. The production simulation does not insert contact generation or solving between the split integration phases, so no runtime contact loop consumes persistent-contact state yet.
- Feature-id granularity: an id encodes the support feature only as far as each pair can expose it. The sphere-box outside case resolves to a face, edge, or vertex id; the sphere-box inside case and the box-box face case resolve to a face id; the box-box edge case resolves to an edge id; the sphere-sphere and capsule pairs fall back to a primitive-level id because the single-point narrow-phase API does not expose segment or cap parameter metadata.

### 3.3 Inference Discipline (Core Contract)
When analyzing or describing this repository, you MUST:
- **Separate claim types**: state Facts (evidence-backed), Observations (directly visible), Inferences (reasoned conclusions), Assumptions (unverified), and Recommendations distinctly. Never present an assumption as a fact.
- **Verify against source before asserting**: search the codebase (prefer `rg`) and confirm the search ran successfully. Distinguish absence-of-evidence, evidence-of-absence, command failure, and incomplete scope.
- **Current Code Wins**: source is authoritative over this file, `README.md`, and any older roadmap text. When they disagree, inspect the actual implementation and report the discrepancy.
- **State confidence**: label conclusions as confirmed, probable, or unknown, and identify the files you inspected.
- **No silent scope expansion**: respect the user's stated scope; stop once sufficient evidence is collected.

### 3.4 Practical Inference & Design Constraints
When performing reconnaissance, review, or simulation design work, apply these negative constraints to prevent hallucinated architecture or broken physics:

- **Do not collapse source evidence and proposed design**: Keep what the code *actually does* separate from what you *think it should do*. Do not present a design recommendation as though the repository already requires it.
- **Trace execution before relocating ownership**: Before moving or centralizing a mechanism, identify where it currently executes, what inputs are available, which ordering semantics depend on that location, and whether the proposed destination has enough information.
- **Prefer the smallest live improvement**: Do not introduce an unused schema, loader, config file, or abstraction merely because it fits a "cleaner" future architecture.
- **Check proposed designs for internal contradictions**: Before recommending an architecture, test it for incompatible claims (e.g., `enabled: false` alongside `mode: "active"`).
- **Use precise strength of claim**: Do not overstate what source inspection or one test establishes.
- **Preserve executed semantics during refactoring**: Treat current production physics behavior as a reproducible historical baseline. Do not silently "fix", consolidate, or reinterpret behavior while exposing it through configuration unless the task explicitly requires it.
- **Validate environment-specific assumptions**: Do not infer compatibility from general platform knowledge alone. Inspect the repository's actual runtime and tooling.

### 3.5 Sim-Design Self-Check
Before finalizing a design report or large PR, quickly ask:
1. Which of my conclusions are direct source facts, and which are recommendations?
2. Did I move execution merely because I centralized configuration?
3. Did I create any contradictory configuration states (e.g., mutually exclusive flags)?
4. Did I claim behavioral preservation while changing observable shape or order?
5. Did I add an abstraction that live runtime would not yet consume?
6. Did I decide a question that actually requires the user's explicit intent?
7. Is the first proposed PR the smallest behavior-preserving precursor?

### 3.6 Contact Solver Contract (`src/physics/ContactSolver.js`)

Phase 0.3 of the unified physics migration. The solver is the impulse-resolution stage that sits between the collision narrow phase and the rigid-body integrator.

**Inputs**: an array of contact constraints. Each entry carries the two bodies, the contact geometry, and the solver-owned warm-start accumulators:

```javascript
{
  bodyA: RigidBody,
  bodyB: RigidBody | null,        // null means static / infinite mass
  normal: THREE.Vector3,          // points from A to B
  depth: number,                  // penetration depth in meters
  point: THREE.Vector3,           // world-space contact point
  restitution: number | undefined,
  frictionCoefficient: number | undefined,
  // Solver-owned warm-start accumulators:
  accumulatedNormalImpulseNewtonSeconds: number,
  accumulatedFrictionImpulseNewtonSeconds: number, // magnitude in N*s
  accumulatedFrictionImpulseTangent1NewtonSeconds: number,
  accumulatedFrictionImpulseTangent2NewtonSeconds: number,
}
```

`createContactConstraint(...)` builds a correctly initialised entry. The narrow phase only returns `normal`, `depth`, and `point`, so the caller must attach the bodies and the accumulators before solving. The same constraint object must be reused for a contact that persists across frames, otherwise the warm-start state is lost and the contact restarts from a cold solve.

**Sign convention**: `normal` points from A to B, the same convention as the narrow phase. The solver measures the relative velocity of B with respect to A at the contact point, `vn = normal . (vB + wB x rB - vA - wA x rA)`. `vn < 0` means the bodies approach, `vn > 0` means they separate. The normal constraint drives `vn` up to a target that is never negative.

**Algorithm**: Projected Gauss-Seidel (sequential impulses).

1. Prepare: cache the restitution target (derived from the pre-solve approach velocity and only applied above `restitutionVelocityThresholdMetersPerSecond`) plus the effective mass of the normal and of the two tangent directions.
2. Warm start: re-apply the impulses accumulated during the previous frame and retain them in the accumulators. Later normal and friction iterations can reduce an over-applied accumulated impulse as constraints converge.
3. Velocity iterations (default 10): per contact, the normal impulse is clamped so the accumulated normal impulse stays `>= 0` (a contact pushes, it never pulls), and the friction impulse is clamped to the Coulomb cone `|jt| <= mu * jn`. A zero friction limit removes any previously applied friction rather than leaving it in place.
4. Positional correction (default 1 pass): derive the remaining penetration from the body transforms changed by earlier passes, then reduce the part deeper than `slopMeters` by `positionCorrectionFactor`. The correction reuses the effective-mass formulation of the velocity constraint, so it also produces the matching rotation of both bodies.

**Effect**: the solver writes velocity changes directly into `velocityMetersPerSecond` and `angularVelocityRadiansPerSecond`, and adjusts `positionMeters` and `orientationQuaternion` directly. It never touches the force accumulators, so it composes with the symplectic Euler integration of `integrateRigidBody`.

**Determinism**: the tangent basis is derived from the normal with a fixed axis-selection rule, contacts are processed in array order, and no `THREE.Vector3` or `THREE.Quaternion` is allocated in the solve path (module-scope scratch objects only). Re-running the same scenario produces bit-identical results.

**Integration order**: `integrateRigidBody` remains the fused compatibility API and now delegates to explicit `integrateRigidBodyVelocityPhase` and `integrateRigidBodyPositionPhase` functions. The solver is designed to run between those two phases. Production still uses the fused path until a runtime contact loop consumes the split API. The split path keeps the contact impulse from being baked into the position update; its resting penetration is bounded by the solver's slop and positional-projection settings.

**Not implemented**: joints, hinges, suspension constraints, multi-point manifolds, and continuous collision detection.

### 3.7 Contact Cache Contract (`src/physics/ContactCache.js`)

The cache is the persistent-contact state layer between the narrow phase and the solver. It exists so a contact that persists across frames keeps its constraint object, and therefore its warm-start accumulators, instead of restarting from a cold solve every frame.

**Identity**: a contact key is the ordered triple (bodyAId, bodyBId, featureId), serialized as JSON. The order is part of the identity because the solver's normal points from body A to body B, so reversing the pair would reverse the normal and invalidate the previous impulse sign. A pair whose two body identities are equal is rejected.

**Lifecycle**:
1. `beginStep()` opens a step and clears the pending containers.
2. `acquire(contact)` validates the candidate and returns the constraint for that key. It creates a constraint when the key is new, and reuses the active constraint when the key AND both body references match. A duplicate key inside one step is an error.
3. `commit()` publishes the pending set as the active set and retires the previous active set.
4. `update(contacts)` runs the whole cycle for a caller that does not need the individual phases.

**Warm start**: a reused constraint keeps its `accumulatedNormalImpulseNewtonSeconds` and friction accumulators, and its `ageSteps` counter increments. A change of body pair or of feature id produces a NEW constraint with zeroed accumulators, so a warm start can never leak across an incompatible contact.

**Eviction**: a contact that was not acquired during a step is dropped from the active set when that step commits.

**Determinism**: active contacts are returned in sorted contact-key order, so the order the solver sees never depends on Map insertion order.

**Allocation discipline**: the two `Map`s and the duplicate-key `Set` are created once per cache and reused for its lifetime. `commit()` swaps the pending map with the active map and clears the retired one. The sorted key list and the JSON key-parts array are reused scratch buffers. The returned active-contact array is freshly allocated because callers retain it as a snapshot.

**Not implemented**: multi-contact manifolds (the narrow phase emits one contact per pair, so the cache holds at most one constraint per body pair in practice), sleeping and islands, breakable contacts, and any coupling to the production runtime.

### 3.8 Collision World Contract (`src/physics/CollisionWorld.js`)

The world is the registration and step-orchestration layer for primitive rigid-body collision. It consumes the existing `RigidBody`, narrow-phase shapes, `Collision`, `ContactCache`, and `ContactSolver`; it does not replace or bypass any of those contracts.

**Registration and identity**:

1. `registerBody(body, colliders, filterGroup, filterMask)` validates the body and collider payloads, accepts `body.isStatic === true` as an infinite-mass collider (and allows such raw static bodies to omit force/torque accumulators and `massKg`), and stores a single registration record for the body. A body registered twice is an error.
2. The colliders supplied to `registerBody` are shared references. Their local transforms are copied into a registration-local transform cache; users must not mutate the registration payload, especially before `step`.
3. `removeBody(body)` removes a registration, including its collider records. It intentionally does not reuse the slot. A subsequent registration receives the next integer in the strictly monotonic sequence, so body order remains stable across registration and removal.
4. Every registered body receives `body.collisionWorldId`. These integer identities determine collision-pair order; the body-level `contactId` remains the stable cache identity required by the contact-cache contract.
5. `world.contactCache` is an inspection/debug API.

**Colliders**: each registered collider is an entry such as `{ shape: createSphere(...), positionMeters: [...], orientationQuaternion: [...], ... }`. The module does not create or expose shape classes; it validates the registration and clones local transforms. Supported narrow-phase primitives are the Sphere, Capsule, and Box pairs documented in section 3.1. Terrain colliders are out of scope for this phase.

**Collision filtering**: each registration has a `filterGroup` and a `filterMask` represented as signed 32-bit integers. A pair collides when `(groupA & maskB) !== 0 && (groupB & maskA) !== 0`. Zero means no collision and is therefore rejected at registration. There is intentionally no all-bits wildcard; passing `0xffffffff` is the conventional wildcard.

**Step order** (`world.step(dtSeconds)`): clear every dynamic body's force and torque accumulators; apply gravity through `world.applyGravity`; run velocity integration; generate broad-phase pairs; run the narrow phase for every filtered pair, updating the world transform before `Collision.testCollision`; acquire every contact through the cache; solve contacts with `solveContacts`; run position integration; then commit the contact cache. The world deliberately preserves the velocity-solve-position ordering required by the split integration contract.

**Broad phase**: `world.step` uses a deterministic O(N²) naive pair loop. This is the Phase 1 / Gate 2 baseline, intentionally retained so spatial partitioning can later be benchmarked against real workloads. The pair pool is allocated when the first body registers and is reused for the lifetime of the world. The step clears it by resetting its length, and sorts the generated pairs by `(min bodyId, max bodyId)`. Static-static pairs and non-colliding filter pairs are skipped. The implementation performs no hot-loop allocation, including no `THREE.Vector3` or matrix allocation.

**Gravity**: `applyGravity` applies a shared `gravityMetersPerSecondSquared` value downward in world Y to every dynamic body. Bodies marked `body.isStatic = true` are skipped, as is force clearing for those bodies, so raw static bodies without force accumulators are supported. Per-body or mixed gravity vectors are not supported.

**Determinism**: registration order, the shared pair pool, the sort key, and the contact cache keying establish deterministic contact ordering. Narrow-phase feature ids provide stable contact identities across steps, enabling warm starts.

**Not implemented**: broad-phase spatial partitioning; multi-contact manifolds; sleeping, islands, or solver event callbacks; terrain or height-field colliders; and integration with the production vehicle, rocket, or fixed-step contact scenario runtimes.


## 4. Hard Simulation Conventions
- **Units**:
  - Distance: Meters (`m`)
  - Time: Seconds (`s`)
  - Mass: Kilograms (`kg`)
  - Force: Newtons (`N`)
  - Torque: Newton-Meters (`Nm`)
  - Velocity: `m/s`
  - Acceleration: `m/s²`
- **Coordinate System**:
  - Y-Up.
  - Gravity: `-9.80665 m/s²` (Standard Earth Gravity).
  - Vehicle Forward: Positive Z (unless explicitly overridden).
- **Naming Convention**:
  - Identifiers **must** include units if the value is physical.
    - ✅ `speedMetersPerSecond`, `torqueNewtonMeters`, `massKg`
    - ❌ `speed`, `power`, `value`, `amount`
  - The rule applies to **parameters and local variables** as well as to properties.
    - ✅ `appendOutsideAxis(outsideAxes, coordinateMeters, halfExtentMeters, ...)`
    - ❌ `appendOutsideAxis(outsideAxes, coordinate, halfExtentMeters, ...)`
- **Memory Management**:
  - Avoid per-frame allocations in hot loops (e.g., `updateWheelState`).
  - Reuse `THREE.Vector3` objects stored in state.
  - Reuse containers instead of reallocating them per tick: the contact cache keeps two `Map`s and one `Set` for its lifetime and swaps/clears them between steps, the fixed-step scenario reuses one contact array, and the narrow phase reuses module-scope scratch buffers and constant axis labels.
  - A value RETURNED to a caller (an active-contact array, a step result, a state snapshot) is an API boundary rather than a hot-loop allocation, so it may be freshly allocated.

## 5. Code Style & Module Structure
- **Orchestration**: `src/main.js` is for wiring only. It should not contain physics logic.
- **Modularity**: Prefer professional, comprehensive, but narrowly scoped single-responsibility modules.
- **Comments**:
  - Preserve file path headers: `// src/vehicle/createVehicleController.js`
  - **Honesty Policy**: Clearly label placeholders.
    - ✅ `// Placeholder: Until tire slip curves are implemented, we clamp force.`
    - ❌ `// Realistic tire grip model.`
- **UI Separation**:
  - **Debug HUD**: Developer telemetry only (forces, slips, accumulator).
  - **Driver Panel**: Driver-facing info only (Speed, Gear, Contact Status). Do not clutter with raw Newton values.

## 6. Git & PR Workflow
- **Branching**: Create descriptive feature branches (e.g., `per-wheel-brake-torque-foundation`).
- **Commit Messages**: Imperative, concise (e.g., "Add per-wheel brake torque foundation").
- **PR Body Structure**:
  ```markdown
  Summary:
  - [What changed]
  - [Why it matters]

  Changes:
  - [List key files and architectural shifts]

  Bugs:
  - None (or list fixes)
  ```
- **Validation Checklist** (Before Pushing):
  1. `npm run build` passes.
  2. `npm test` passes.
  3. `rg` confirms no prohibited feature implementation was introduced.
  4. Manual check: Driving, Braking, Reset, and HUD updates work.
  5. No unintended behavior regression.

## 7. Review Posture
- **Correctness > Features**: A broken realistic system is worse than a working simple one.
- **Flag Fake Physics**: If code claims to be "realistic" but uses hardcoded multipliers to mask instability, flag it.
- **Seams Over Solutions**: If a request requires a complex system that isn't ready, implement the *interface* (seam) and leave the logic empty/commented. Flag it honestly rather than hacking a half-baked solution.
