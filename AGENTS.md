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

### 2.2 Source Editing & Recovery Discipline

These rules exist to prevent automated edits from corrupting source structure. Correctness and recoverability are more important than preserving every partial edit.

#### General Editing Policy

- Make the smallest source edit that satisfies the current objective.
- Prefer replacing one complete, clearly bounded block at a time.
- Prefer function-level or object-literal-level replacements over scattered line-index edits.
- Do not rewrite an entire large file unless explicitly instructed.
- Do not move helper functions across module or factory-function boundaries unless the diff clearly requires it.
- Do not mix unrelated concerns in one edit pass. For example, do not edit controller physics, HUD formatting, and README wording in the same recovery step.

#### Exact Replacement Safety

When using PowerShell, Python, or any script-based text replacement:

- Verify the target text occurs exactly once before replacing it.
- If the target text occurs zero times, stop and inspect the current file instead of guessing.
- If the target text occurs more than once, narrow the anchor before replacing.
- After writing the file, immediately inspect the changed region with `git diff -- <path>`.
- Never assume a replacement succeeded because the command produced no output.
- Never continue implementation on top of a failed or uncertain replacement.

#### JavaScript Structure Safety

When editing JavaScript source:

- Preserve existing function boundaries unless intentionally changing them.
- Do not duplicate function declarations.
- Do not leave nested duplicate declarations such as `function x() { function x() {`.
- Do not introduce helper functions inside another function unless the original file already uses that pattern intentionally.
- Preserve module-level helper placement.
- Preserve exported function structure.
- Preserve file path header comments.
- Keep template literals intact. Do not replace backticks with plain text.
- If a build error points to syntax, fix syntax before doing any feature validation.

#### Line-Index Editing

Line-index editing is fragile and should be avoided.

- Do not use line numbers as the primary edit mechanism unless no reliable text anchor exists.
- If line-index editing is used, first print the surrounding lines and confirm the target manually.
- After a line-index edit, immediately run `git diff -- <path>` and inspect the resulting hunk.
- Do not perform multiple line-index edits in different regions before checking the diff.
- If line numbers shift during editing, stop and re-read the target region.

#### Build Recovery Priority

If `npm run build` fails after source edits:

1. Stop feature work.
2. Stop README/HUD polish.
3. Inspect the build error.
4. Inspect `git diff -- <changed-file>`.
5. Fix the smallest syntax or structure issue first.
6. Rerun `npm run build`.
7. Continue only after the build passes.

Do not run behavior validation while the project does not build.

#### Structural Corruption Recovery

If source structure appears corrupted, such as duplicated functions, misplaced braces, broken template literals, or helper functions moved outside their intended scope:

- Pause feature work.
- Do not commit.
- Do not push.
- Do not continue adding behavior.
- Compare the corrupted file against `HEAD` with `git diff -- <path>`.
- Restore the original function/module boundary before preserving feature edits.
- If the file cannot be repaired confidently, restore that file from `HEAD` and reapply only the necessary feature changes in smaller edits.
- After recovery, run:
  - `npm run build`
  - `git diff --check`
  - `git diff -- <path>`

#### Recovery Reporting

After recovering from source corruption, report:

- what was corrupted
- what file or region was restored
- what feature edits were preserved or discarded
- whether `npm run build` passes
- whether `git diff --check` passes
- whether implementation may continue

Do not claim the feature is complete merely because syntax was recovered.

## 2.3 PowerShell / Windows Command Discipline

When running commands in Windows PowerShell or PowerShell 7:

- Prefer `rg -n "pattern" src/ui src/vehicle src/car` over shell-style path globs like `src/ui/*.js`.
- For ripgrep file filtering, use `-g "*.js"` instead of relying on shell glob expansion.
- Do not treat a failed inspection command as evidence about the code. Correct the command and rerun it.
- Use `Get-Content -Raw <path>` when reading a whole file.
- Use `Get-Content <path> | Select-Object -Index (start..end)` only for read-only inspection snippets, not for editing.
- For multi-line Node or validation scripts, prefer writing a temporary script outside the repo, such as under `C:\temp`, then run it and delete it if needed.
- Do not leave temporary scripts, recovery scripts, or generated inspection files in the repository.
- If `git fetch` fails only because the sandbox cannot write `.git/FETCH_HEAD`, verify refs with `git rev-parse main origin/main HEAD` and report the sandbox limitation accurately.


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
- **No Premature Physics**: Do not implement the next realism layer until its prerequisites exist. If a system already exists in `src/vehicle`, preserve and extend it according to the current code rather than treating older roadmap text as authoritative.
- **No Gameplay Creep**: No laps, scores, or AI.
- **No "Magic" Numbers**: Do not tune mass, drag, or friction to "feel good" if it breaks physical consistency. Tune for realism first.
- **No Dependency Bloat**: Use only Three.js and standard JS APIs. Ask before adding any new package.
- **Current Code Wins**: Roadmap text may lag behind implementation. Verify current source before deciding whether a system exists or is prohibited.

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
  2. `rg` confirms no prohibited feature implementation was introduced. Future-work mentions in README, AGENTS.md, skill docs, or comments are allowed; executable-code matches must be inspected and explained.
  3. Manual check: Driving, Braking, Reset, and HUD updates work.
  4. No unintended behavior regression.

## 7. Review Posture
- **Correctness > Features**: A broken realistic system is worse than a working simple one.
- **Flag Fake Physics**: If code claims to be "realistic" but uses hardcoded multipliers, flag it.
- **Seams Over Solutions**: If a request requires a complex system (e.g., ABS) that isn't ready, implement the *interface* (seam) and leave the logic empty/commented.