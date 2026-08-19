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
  - If `apply_patch` fails on an existing file, switch immediately to a simple, exact text replacement strategy.
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
- Basic longitudinal (slip-ratio) and lateral (slip-angle) tire-force models joined by a simple friction-circle combined cap, with a feature-gated brush/Fiala combined-slip tire seam.
- Quasi-static longitudinal and lateral load transfer redistributing normal force, with a feature-gated 3-DOF sprung-mass heave/pitch/roll vertical-dynamics seam.
- Planar chassis motion: world/local velocity, yaw, yaw rate, summed planar force and yaw moment.
- Aerodynamic drag (quadratic), optional feature-gated downforce/lift load, chassis mass properties, and a chassis-attitude foundation.
- Rear differential models (open, limited-slip, torsen, locked, welded), powertrain profiles, active drive torque v1 with predictive redline cap, and feature-gated automatic gear selection, clutch engagement, engine braking, and engine rotational integration.
- Service brake bias, ABS v1, feature-gated wheel-lock detection/advanced ABS, traction control, and electronic stability control.
- Tire pressure handling and visual deformation, a developer tuning panel, step-trace instrumentation, and a multi-rate timestep-sensitivity regression suite.

### 3.2 Documented Unfinished Seams
The genuine next-layer gaps, self-identified in source comments and `README.md`. Any "future work" claim must map to one of these or be evidenced in code:
- Pacejka/professional tire model: the default model remains a staged brush/Fiala-style model, not a full validated tire library.
- True multibody chassis dynamics beyond the gated 3-DOF vertical seam (roll centers, landing impulses, nonlinear bump stops, anti-roll bars, detailed pitch/roll coupling).
- Full production ABS/TC/ESC behavior: currently feature-gated staged seams, not a complete hydraulic/production stability-control system.
- Drift models and rich tire audio/visual effects (squeal, smoke, persistent skid marks).
- Powertrain depth: torque converter, detailed shift actuation, full manual shift control, driveline compliance, launch control.
- Aero depth: wind and drafting are not modeled; downforce/lift is a first-order speed-squared vertical load.
- Timestep sensitivity: documented long-brake stopping-distance and stop-time spread across 60 to 480 Hz.

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
- **Trace execution before relocating ownership**: Before moving or centralizing a mechanism (e.g., moving tire force calculation from the wheel module to the chassis module), identify:
  1. Where it currently executes.
  2. What inputs are available at that exact stage.
  3. Which ordering, accumulation, or clamping semantics depend on that location.
  4. Whether the proposed destination has enough information to preserve those semantics.
  *(Centralized configuration does not imply centralized execution.)*
- **Prefer the smallest live improvement**: Do not introduce an unused schema, loader, config file, or abstraction merely because it fits a "cleaner" future architecture. Prefer the smallest change that is consumed by live code immediately, removes an existing ambiguity, preserves current behavior by default, and leaves later generalization possible.
- **Check proposed designs for internal contradictions**: Before recommending an architecture, test it for incompatible claims, such as:
  - `enabled: false` alongside a separate `mode: "active"` flag.
  - A module described as independent while it imports from the module it's supposed to replace.
  - A behavior-preserving refactor that accidentally changes return shapes, object keys, or execution order.
- **Use precise strength of claim**: Do not overstate what source inspection or one test establishes. For example:
  - Passing one test establishes it works for that case, not arbitrary-order independence.
  - A live read with no repository writes is an undeclared override channel, not necessarily dead code.
  - When uncertain, state the narrower claim and identify what evidence would justify the stronger one.
- **Preserve executed semantics during refactoring**: Treat current production physics behavior as a reproducible historical baseline. Do not silently "fix", consolidate, or reinterpret behavior while exposing it through configuration unless the task explicitly requires it.
- **Validate environment-specific assumptions**: Do not infer compatibility from general platform knowledge alone. For file formats, module loading, or shell behavior, inspect the repository's actual runtime and tooling.

### 3.5 Sim-Design Self-Check
Before finalizing a design report or large PR, quickly ask:
1. Which of my conclusions are direct source facts, and which are recommendations?
2. Did I move execution merely because I centralized configuration?
3. Did I create any contradictory configuration states (e.g., mutually exclusive flags)?
4. Did I claim behavioral preservation while changing observable shape or order?
5. Did I add an abstraction that live runtime would not yet consume?
6. Did I decide a question that actually requires the user's explicit intent?
7. Is the first proposed PR the smallest behavior-preserving precursor?

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
- **Memory Management**:
  - Avoid per-frame allocations in hot loops (e.g., `updateWheelState`).
  - Reuse `THREE.Vector3` objects stored in state.

## 5. Code Style & Module Structure
- **Orchestration**: `src/main.js` is for wiring only. It should not contain physics logic.
- **Modularity**: Prefer professional, comprehensive, but narrowly scoped single-responsibility modules (e.g., `createFixedTimestepRunner.js`, `createFlatTerrainContactQuery.js`).
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
  2. `node --test "test/*.test.js"` passes (note: `node --test test/` fails here because the directory is not treated as a glob; `npm test` is not currently defined).
  3. `rg` confirms no prohibited feature implementation was introduced. Future-work mentions in README, AGENTS.md, skill docs, or comments are allowed; executable-code matches must be inspected and explained.
  4. Manual check: Driving, Braking, Reset, and HUD updates work.
  5. No unintended behavior regression.

## 7. Review Posture
- **Correctness > Features**: A broken realistic system is worse than a working simple one.
- **Flag Fake Physics**: If code claims to be "realistic" but uses hardcoded multipliers to mask instability, flag it.
- **Seams Over Solutions**: If a request requires a complex system (e.g., advanced ABS) that isn't ready, implement the *interface* (seam) and leave the logic empty/commented. Flag it honestly rather than hacking a half-baked solution.