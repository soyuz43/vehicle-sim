# AGENTS.md

## Repository identity

- Repository: vehicle-sim.
- Runtime: browser-based Vite + Three.js app.
- Language: JavaScript ES modules.
- Project type: vehicle simulation learning lab, not a finished game.
- Direction: fidelity-first vehicle simulation sandbox.
- Do not steer work toward timers, checkpoints, lap systems, collectibles, scoring, AI racers, menus, or arcade-game objectives unless explicitly requested.

## Current architectural direction

- Simulation should gradually become the source of truth.
- Rendering should visualize simulation state.
- Camera may read rendered transforms or simulation state, but should not own vehicle physics.
- Input should represent driver controls: throttle, brake, steering, gear selector.
- Terrain should eventually provide surface/contact information, not only visuals.
- Future systems should support:
  - explicit units
  - fixed timestep
  - vehicle mass
  - force accumulation
  - drivetrain force
  - per-wheel state
  - per-wheel contact patches
  - surface friction coefficients
  - longitudinal slip
  - lateral slip
  - traction limits
  - suspension and weight transfer later

## Hard simulation conventions

- 1 world unit = 1 meter.
- Time unit = second.
- Velocity = meters per second.
- Acceleration = meters per second squared.
- Force = newtons.
- Mass = kilograms.
- Torque = newton-meters.
- Y axis is vertical/up.
- Gravity points negative Y.
- Standard gravity is 9.80665 m/s^2.
- Vehicle local forward is positive Z unless code explicitly changes it.

## Current branch progression

Expected high-level progression:
1. visual chassis and debug HUD
2. extracted vehicle controller and units/gravity constants
3. force-based flat-ground longitudinal motion
4. simple R/N/D gear selector
5. fixed timestep
6. surface queries
7. per-wheel contact state
8. simplified tire grip/slip
9. lateral dynamics
10. suspension/weight transfer

## Code style

- Preserve file path comments at the top of source files, e.g. `// src/main.js`.
- Prefer focused modules over expanding `src/main.js`.
- Avoid turning `main.js` into a simulation junk drawer.
- Prefer clear names with physical units in identifiers:
  - `massKg`
  - `speedMetersPerSecond`
  - `forceNewtons`
  - `gravityMetersPerSecondSquared`
  - `angleRadians`
- Do not hide unit-bearing values behind vague names like `value`, `amount`, `power`, or `speed` when a precise physical quantity is known.
- Avoid per-frame allocations in hot update loops when practical.
- Use scratch vectors or persistent state for repeated vector math.
- Do not add dependencies without asking first.

## Git/workflow expectations

- User workflow is normally:
  - `new <branch>`
  - edit
  - `bet`
  - `yeet`
  - `gh pr create`
  - merge
  - `slay`
- Do not suggest `git add`, `git commit -m`, or `git push` unless explicitly asked; use the user's aliases/workflow.
- Before PR work, expect `npm run build` to pass.
- Generated source dumps, diff files, and temporary text snapshots should not be treated as application source.

## Testing/build commands

- Install dependencies: `npm install`
- Dev server: `npm run dev`
- Production build: `npm run build`
- Preview build: `npm run preview`
- No test framework is currently established unless package scripts later show one.

## Design prohibitions unless explicitly requested

- Do not add gameplay objectives.
- Do not add timers/checkpoints/laps/scoring.
- Do not add full transmission/RPM/clutch/gear-ratio simulation yet.
- Do not jump directly to complex suspension or rock-crawling terrain before fixed timestep, contact state, and surface queries exist.
- Do not treat the visual car mesh as proof that physical vehicle dynamics are implemented.
- Do not overstate realism in comments, README, PR text, or summaries.

## Review posture

- Prioritize correctness, behavior changes, physical meaning, and architecture seams.
- Flag fake physics when it is presented as real physics.
- Placeholder systems are allowed if named honestly as placeholders.
- Prefer minimal, staged PRs with clear conceptual boundaries.

