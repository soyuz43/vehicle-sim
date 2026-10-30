# Staff Engineer Roadmap: Unified Vehicle/Rocket Physics with Crash Deformation

**Generated**: 2026-10-29
**Author**: Analysis of vehicle-sim codebase (340 commits, 121 PRs, ~45k LOC)
**Status**: Proposal — not yet implemented

---

## Executive Summary

**Current State**: Two parallel solvers sharing only fixedTimestepRunner, terrainContactQuery, and gravity.
- **Car**: Planar (x/z/yaw) + gated 3-DOF vertical, per-wheel raycast suspension, tire forces
- **Rocket**: Full 6-DOF (quaternion + inertia tensor), multi-point ring ground contact, stage separation

**Target State**: Single unified rigid-body framework where:
- Car = 4-wheeled rigid body with suspension constraints
- Rocket = multi-body rigid system (stages + debris)
- Both support arbitrary collision + deformation (car-car, car-rocket, rocket-terrain, car-terrain)
- Shared collision pipeline, deformation system, and visual feedback

---

## Phase 0: Foundation — Unified Rigid Body Abstraction (Weeks 1-3)

### 0.1 Create src/physics/RigidBody.js — The Common Denominator

Migration Strategy:
1. Rocket: Replace rocketRigidBody.js to thin wrapper over RigidBody (1:1 mapping)
2. Car: Create VehicleRigidBody extending RigidBody with:
   - suspensionConstraints: 4 (raycast to constraint forces)
   - wheelColliders: 4 (tire contact patches)
   - planarConstraint: true (locks Y-position, X/Z rotation — optional flag)

### 0.2 Unified Collision Detection (src/physics/Collision.js)

Key Decision: Car tires = capsules (radius = tire radius, half-height = section width/2). Rocket = capsule (body) + boxes (fins). Chassis = box or convex hull.

### 0.3 Contact Solver (src/physics/ContactSolver.js)

Integration Point: Called after force accumulation, before integration in fixed step.

---

## Phase 1: Car to Rigid Body Migration (Weeks 3-6)

### 1.1 Replace Planar Motion with Full 6-DOF (Gated)

Critical: Keep verticalDynamicsEnabled as the suspension solver; the rigid body just receives its forces. The 3-DOF vertical dynamics becomes a constraint generator for the rigid body.

### 1.2 Wheel Colliders

### 1.3 Chassis Collider

### 1.4 Suspension as Constraint Forces

Result: Car becomes a rigid body with 4 external force generators (wheels). Yaw/pitch/roll emerge naturally.

---

## Phase 2: Unified Collision Pipeline (Weeks 6-9)

### 2.1 Collision World (src/physics/CollisionWorld.js)

### 2.2 Terrain as Static Collider

### 2.3 Obstacle Integration

- Movable obstacles to RigidBody with mass > 0, colliders: [box/cylinder]
- Static obstacles to staticColliders
- Existing createVehicleObstacleInteraction deprecated, replaced by contact solver

---

## Phase 3: Deformation System (Weeks 9-14)

### 3.1 Deformation Architecture

### 3.2 Deformation Types

| Object | Method | Visual | Physics Feedback |
|--------|--------|--------|------------------|
| **Terrain** | Heightfield displacement (existing) | Mesh vertex update | Changed contact normals/heights |
| **Car Body** | Convex hull vertex displacement | Morph targets / vertex shader | Changed collider shape to new contacts |
| **Car Wheels** | Tire: sidewall bulge (pressure-dependent) | Toroidal mesh deformation | Changed capsule radius/half-height |
| | Rim: permanent bend | Vertex displacement | Changed collider, possible air leak |
| **Rocket Body** | Skin panel denting (thin-shell) | Vertex displacement / normal map | Changed capsule/box dimensions |
| **Rocket Fins** | Bending (cantilever beam) | Vertex displacement | Changed fin aerodynamics (CoP shift) |
| **Rocket Nose** | Crush zone | Progressive shortening | Mass shift, CoM change |

### 3.3 Deformation State (src/physics/DeformationState.js)

### 3.4 Car-Specific Deformation

### 3.5 Rocket-Specific Deformation

---

## Phase 4: Unified Simulation Loop (Weeks 14-17)

### 4.1 Single Fixed Step for All Bodies

### 4.2 Body Registry

### 4.3 Mode Switching Becomes Body Activation

---

## Phase 5: Cross-Entity Interaction Scenarios (Weeks 17-22)

### 5.1 Car-Rocket Collision

### 5.2 Car-Car Collision (Multiplayer / AI Future)

### 5.3 Rocket-Rocket (Stage Separation Gone Wrong)

---

## Phase 6: Visual & Effects Integration (Weeks 22-26)

### 6.1 Deformation Visualization

### 6.2 Audio Integration

### 6.3 Telemetry / HUD

---

## Phase 7: Advanced Features (Weeks 26+)

| Feature | Description |
|---------|-------------|
| **Soft-body tires** | FEM or XPBD for tire carcass (replaces capsule) |
| **Fracture & debris** | Voronoi fracture on exceed strain; debris = new rigid bodies |
| **Fire/smoke/fluid** | Fuel leak to particle fluid; battery thermal runaway |
| **Occupant kinematics** | Crash test dummy (ragdoll) for injury metrics |
| **Replay system** | Deterministic replay from seed + input log |
| **Multi-body rocket** | Booster separation, interstage collision |

---


## Consolidated Baseline & Seam Inventory (merged from production roadmap)

This section consolidates the verified `roadmap_production_complete_20261025.md` so the unified physics effort retains the car baseline context it builds upon.

### Verified Baseline (2026-10-25)
- 806/806 tests pass; clean `vite build`; 338 commits / 121 PRs
- Fixed 1/60 s timestep decoupled from render
- Magic Formula tire path and engine-drivetrain ODE are genuinely implemented behind their flags, not stubbed

### Flag Defaults
| Default | Flags |
|---------|-------|
| ON | `verticalDynamicsEnabled`, `powertrainDriveTorqueEnabled`, `automaticTransmissionEnabled`, `serviceBrakeAbsEnabled` (legacy slip-ratio ABS), `longitudinalTireForceRelaxationEnabled` |
| OFF (staged seams) | `combinedSlipTireModelEnabled`, `engineDrivetrainModelEnabled`, `clutchModelEnabled`, `engineBrakingEnabled`, `aeroDownforceEnabled`, `tireThermalModelEnabled`, `advancedAbsEnabled`, `tractionControlEnabled`, `electronicStabilityControlEnabled`, `wheelLockModelEnabled` |

### Seam Inventory
| Flag / gap | Default | What "complete" requires |
|---|---|---|
| `combinedSlipTireModelEnabled` | false | Validate Magic Formula vs baseline; promote to default |
| `tireThermalModelEnabled` | false | Feed mu(temp, wear) back into tire model |
| `wheelLockModelEnabled` | false | Enable true omega→0 lock |
| `engineDrivetrainModelEnabled` | false | Promote engine + friction clutch to default |
| `clutchModelEnabled` / `engineBrakingEnabled` | false | Real slip-coupling + launch control |
| `advancedAbsEnabled` / `tractionControlEnabled` / `electronicStabilityControlEnabled` | false | Production selective-brake + engine-cut control |
| `aeroDownforceEnabled` | false | Wind, drafting, ride-height/pitch coupling |
| Roll-center per-axle + anti-dive/squat | — | Per-axle overrides + longitudinal roll center |
| Solid-axle lateral transfer | — | Leaf torsional stiffness / beam articulation |
| Multibody beyond 3-DOF | — | Landing impulses, nonlinear bump stops |
| Timestep sensitivity | — | Sub-step or certify minimum rate |

### Recommended Incremental Sequence
P0 → P1 → P4 → P3 → P2 → P5 → P6 (lock baseline → tire model → driver assists → powertrain → vertical/contact → aero/effects → determinism)

### Two Readings of "Production-Complete"
- **Reading A (recommended):** Keep car planar + gated 3-DOF vertical; flip seams one at a time with `flag=false` byte-identity regression tests as the hard gate.
- **Reading B:** Full 6-DOF vehicle rigid body (mirroring the rocket solver). Defer behind `vehicleSixDofEnabled` so the car controller never silently changes shape.

### Verification Evidence (Appendix A)
| Claim | Evidence |
|-------|----------|
| Flag defaults | `src/vehicle/defaultVehicleSpec.js` L67,174,191,209,215,234,240,246,267,281,290,298,306,329,374 |
| Magic Formula implemented | `src/vehicle/tireModelLibrary.js` L5-58 |
| Engine-drivetrain implemented | `src/vehicle/createEngineDrivetrainState.js` L1-50 |
| Combined-slip harness | `src/vehicle/combinedSlipTireForceState.js` L101 |
| Wheel-lock gated | `src/vehicle/VehicleController.js` L3785,3792,3825; `isWheelLocked` L4550 |
| Anti-dive not modelled | `src/vehicle/componentCatalog.js` L379, L427 |
| No per-axle roll-center override | only `solidAxleRollCenterHeightMeters` (`defaultVehicleSpec.js` L104) |
| Timestep spread | `test/timestepSensitivityRegression.test.js` L9-10 |
| Rocket 6-DOF reference | `src/rocket/rocketRigidBody.js` |


## Technical Decisions & Tradeoffs

| Decision | Options | Recommendation | Rationale |
|----------|---------|----------------|-----------|
| **Integration scheme** | Symplectic Euler vs RK4 vs XPBD | **Symplectic Euler** (current) | Deterministic, stable at 60Hz, matches existing |
| **Collision narrow phase** | GJK/EPA vs SAT vs custom | **SAT for primitives, GJK for convex** | SAT fast for boxes/cylinders; GJK general |
| **Contact solver** | PGS vs TGS vs Direct | **PGS with warm-start** | Proven, deterministic, handles friction well |
| **Deformation representation** | Vertex displacement vs FEM vs Voxel | **Vertex displacement + plastic strain** | GPU-friendly, matches Three.js, good enough |
| **Car planar constraint** | Hard lock (Y, pitch, roll) vs soft (stiff springs) | **Soft constraint (configurable stiffness)** | Allows rollover, airborne, smooth transition |
| **Terrain collision** | Heightfield special-case vs voxel | **Heightfield special-case** | Infinite detail, existing investment |
| **Broad phase** | Uniform grid vs BVH vs Sweep-Prune | **Uniform grid (50m cells)** | Simple, cache-friendly, scales to 1200m |

---

## Migration Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **Breaks existing car physics** | Gate behind fullRigidBodyEnabled: false default; byte-identity regression tests |
| **Performance regression** | Profile each phase; broad phase culling; limit contact iterations |
| **Rocket stability lost** | Rocket uses same RigidBody -> 1:1 behavior preservation |
| **Deformation explodes** | Energy threshold gating; max vertices displaced per frame; LOD |
| **Visual/physics desync** | Single source of truth: physics updates collider -> visual reads collider |

---

## File Structure (Target)

`
src/
physics/
    RigidBody.js              # Core (NEW)
    Collision.js              # Narrow phase (NEW)
    ContactSolver.js          # PGS solver (NEW)
    CollisionWorld.js         # Broad + narrow + step (NEW)
    DeformationState.js       # Deformation tracking (NEW)
    BroadPhase.js             # Uniform grid (NEW)
    shapes/
        Sphere.js
        Capsule.js
        Box.js
        Cylinder.js
        ConvexHull.js
        Heightfield.js
vehicle/
    VehicleRigidBody.js       # Extends RigidBody (NEW)
    deformation/
        createVehicleDeformation.js (NEW)
        vehicleDeformationVisuals.js (NEW)
    dynamics/
        suspensionConstraint.js  # Suspension to force application (REFACTOR)
rocket/
    deformation/
        createRocketDeformation.js (NEW)
        rocketDeformationVisuals.js (NEW)
    rocketRigidBody.js        # to thin wrapper over RigidBody (REFACTOR)
terrain/
    HeightfieldCollider.js    # Implements physics/shapes/Heightfield.js (NEW)
simulation/
    UnifiedSimulation.js      # Single step for all bodies (REFACTOR)
`

---

## Milestone Gates (Definition of Done)

| Milestone | Gate Criteria |
|-----------|---------------|
| **M0: RigidBody parity** | Rocket on RigidBody passes all 12 existing rocket tests byte-identical |
| **M1: Car on RigidBody** | Car on VehicleRigidBody (gated) passes all 93 vehicle tests; verticalDynamicsEnabled still works |
| **M2: Unified collision** | Car-rocket collision in same step produces plausible impulses; no interpenetration |
| **M3: Terrain collision** | Both car and rocket collide with terrain via CollisionWorld; suspension still works |
| **M4: Deformation MVP** | Car hitting wall at 50 km/h -> visible dent + updated collider; rocket landing -> fin bend |
| **M5: Full integration** | Single stepSimulation runs car + rocket + debris; mode switch = body activation |
| **M6: Production** | All tests pass; 60Hz sustained with 10 bodies + deformation; visual sync < 1 frame |

---

## Staff Engineer Notes

1. Dont unify prematurely. Phase 0-1 are infrastructure — no user-visible change. Gate everything.
2. Preserve the seams. verticalDynamicsEnabled, combinedSlipTireModelEnabled, engineDrivetrainModelEnabled remain valid configuration knobs.
3. Terrain is special. Dont force it into generic collision. Keep queryRay for suspension; add queryCollider for body contacts.
4. Deformation is visual-first, physics-second. Start with vertex displacement on impact; physics feedback (collider shape change) is Phase 3.5+.
5. Test determinism at each gate. The byte-identity trace is your most valuable asset — protect it.
6. Rocket is the stress test. 6-DOF + high velocity + stage separation exercises every edge case. If it works for rocket, car is easy.

---

## Estimated Timeline

| Phase | Weeks | Cumulative |
|-------|-------|------------|
| 0: Unified RigidBody | 3 | 3 |
| 1: Car Migration | 4 | 7 |
| 2: Collision Pipeline | 4 | 11 |
| 3: Deformation System | 6 | 17 |
| 4: Unified Loop | 4 | 21 |
| 5: Cross-Entity | 6 | 27 |
| 6: Visual/Effects | 5 | 32 |
| **Total** | **~32 weeks** | **~8 months** |

**Parallelizable**: Phase 3 (deformation) can start after M1; Phase 6 (visuals) can parallel Phase 4-5.

---

## First PR Scope (Week 1)

> **PR: feat(physics): introduce RigidBody abstraction and migrate rocket**
> - src/physics/RigidBody.js (new)
> - src/rocket/rocketRigidBody.js to wrapper
> - All 12 rocket tests pass byte-identical
> - AGENTS.md updated with new physics module contract

This establishes the foundation without touching the car. Zero risk to existing vehicle physics.

---

## Bottom Line

The architecture wants this unification. The cars per-wheel forces are already constraint forces; the rockets contact ring is already a multi-point collider. The fixed timestep runner is the universal clock. Youre not adding collision — youre **revealing the unified rigid body that was always implicit**.
