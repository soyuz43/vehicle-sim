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
  2. `rg` confirms no forbidden terms (e.g., "ABS" implementation) exist unless intended.
  3. Manual check: Driving, Braking, Reset, and HUD updates work.
  4. No unintended behavior regression.

## 7. Review Posture
- **Correctness > Features**: A broken realistic system is worse than a working simple one.
- **Flag Fake Physics**: If code claims to be "realistic" but uses hardcoded multipliers, flag it.
- **Seams Over Solutions**: If a request requires a complex system (e.g., ABS) that isn't ready, implement the *interface* (seam) and leave the logic empty/commented.