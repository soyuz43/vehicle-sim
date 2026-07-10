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
  - If `apply_patch` fails on an existing file, **switch immediately** to PowerShell text replacement (`[System.IO.File]::ReadAllText` → `.Replace()` → `WriteAllText`).
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
- Prefer glob filtering over custom type definitions.
- Search executable source before documentation unless documentation was explicitly requested.
- Use case-insensitive searches only when appropriate.
- Prefer searching known project roots instead of the entire repository.

Avoid:

- Custom `--type-add` definitions.
- Custom `--type` filters.
- Complex quoting.
- Shell-specific syntax that is easily misparsed.
- Commands that are difficult to verify visually.

#### Interpreting Search Results

Distinguish carefully between these outcomes:

- Matching results were found.
- No matches were found for the requested search pattern.
- The command failed.
- The search scope was incomplete.

These are not equivalent.

A search that returns no matches for one pattern does **not** establish that the underlying concept is absent.

A failed command establishes nothing about the repository.

#### Progressive Search Strategy

When investigating a concept:

1. Begin with broad terminology.
2. Narrow toward exact identifiers when evidence appears.
3. Read only the files necessary to answer the request.
4. Stop once sufficient evidence has been collected.

Do not continue issuing increasingly similar searches after the relevant implementation has already been located.

#### Repository Inspection Discipline

When performing read-only analysis:

- Respect user-specified scope limits.
- Prefer evidence over inference.
- Report uncertainty explicitly.
- Identify the files that were inspected.
- State whether conclusions are confirmed, probable, or unknown.
- Do not silently expand repository scope.

#### False-Negative Prevention

Before concluding that a feature, identifier, or concept does not exist:

- Perform both a broad conceptual search and an exact identifier search when practical.
- Verify that the search command executed successfully.
- Verify that the intended search roots were actually searched.
- Distinguish between:
  - absence of evidence,
  - evidence of absence,
  - command failure,
  - incomplete search scope.

Do not state that a feature is absent unless the performed search actually justifies that conclusion.

#### Output Quality

For repository reconnaissance:

- Present findings before recommendations.
- Separate confirmed observations from inferences.
- Do not overstate confidence.
- Keep output proportional to the requested scope.
- Stop once the requested objective has been satisfied rather than maximizing repository traversal.

## 3. Architectural Direction & Staging
We build in strict layers. Do not implement Layer N+1 until Layer N is stable.

### Current Progression Roadmap
1.  [x] Visual chassis & Debug HUD
2.  [x] Extracted Vehicle Controller & Units/Gravity
3.  [x] Force-based flat-ground longitudinal motion
4.  [x] Simple R/N/D Gear Selector
5.  [x] Fixed Timestep Simulation Loop
6.  [x] Surface Queries (Flat Terrain)
7.  [x] Per-Wheel Contact State (Finite Grounded/Airborne)
8.  [x] Per-Wheel Longitudinal Force Pipeline
9.  [x] Wheel Rotational State Foundation (Visual Sync)
10. [x] Per-Wheel Brake Torque Foundation (Telemetry/Seams)
11. [ ] **Next**: Torque-Based Wheel Dynamics (Slip Ratio, Lockup)
12. [ ] Lateral Dynamics & Tire Curves
13. [ ] Suspension & Weight Transfer

### Design Prohibitions (Unless Explicitly Requested)
- **No Premature Physics**: Do not implement ABS, Parking Brake, Brake Bias, or Load Transfer before the underlying torque/slip models exist. Create *seams* for them, but do not implement the logic.
- **No Gameplay Creep**: No laps, scores, or AI.
- **No "Magic" Numbers**: Do not tune mass, drag, or friction to "feel good" if it breaks physical consistency. Tune for realism first.
- **No Dependency Bloat**: Use only Three.js and standard JS APIs. Ask before adding any new package.

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
- **Modularity**: Prefer narrow, single-responsibility modules (e.g., `createFixedTimestepRunner.js`, `createFlatTerrainContactQuery.js`).
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
  2. `rg` confirms no prohibited feature implementation was introduced. Future-work mentions in README, AGENTS.md, skill docs, or comments are allowed; executable-code matches must be inspected and explained.
  3. Manual check: Driving, Braking, Reset, and HUD updates work.
  4. No unintended behavior regression.

## 7. Review Posture
- **Correctness > Features**: A broken realistic system is worse than a working simple one.
- **Flag Fake Physics**: If code claims to be "realistic" but uses hardcoded multipliers, flag it.
- **Seams Over Solutions**: If a request requires a complex system (e.g., ABS) that isn't ready, implement the *interface* (seam) and leave the logic empty/commented.