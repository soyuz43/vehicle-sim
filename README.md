# Vehicle Simulation Specification

## Physical Units
- **Distance**: 1 world unit = 1 meter
- **Time**: seconds
- **Gravity**: 9.80665 m/s² in negative Y direction
- **Axes**: Y is vertical, positive upward

## Simulation Architecture

### Fixed Timestep
- Physics runs at fixed 1/60 second intervals
- Rendering operates independently via `requestAnimationFrame`
- Core physics state remains isolated from render frame rate

### Vehicle Control Inputs
- `W`: Throttle
- `S`: Service brake
- `Space`: Parking brake
- `A/D`: Steering
- `[`/`]`: Gear selector (Reverse/Neutral/Drive)
- `C`: Camera cycle
- `R`: Reset

## Core Physics Systems

### Chassis Dynamics
- **Motion**: World-space planar velocity and local velocity tracked separately
- **Rotation**: Yaw angle, rate, and acceleration integrated with per-wheel tire forces
- **Mass Properties**: Exposed as telemetry (mass, center-of-mass, moment of inertia, wheelbase, track width)
- **Load Transfer**: Quasi-static model redistributes normal forces based on prior-step acceleration

### Wheel Systems
- **Contact**: Individual suspension raycasts determine ground contact and normal forces
- **Suspension**: Spring/damper model with terrain-aware contact geometry
- **Rotation**: Angular velocity integrates from applied torques and wheel inertia
- **Slip**: Longitudinal slip ratio calculated from wheel surface vs ground speed

### Tire Modeling
- **Longitudinal Force**: Linear stiffness model capped by friction limit (coefficient × normal force)
- **Lateral Force**: Linear slip angle model with similar friction capping
- **Combined Grip**: Simple friction circle limitation when both forces active
- **Pressure Effects**: Affects rolling radius, stiffness, and rolling resistance (not friction coefficient)

### Braking System
- **Service Brake**: All wheels with configurable front bias (default 65% front)
- **Parking Brake**: Rear wheels only via separate control path
- **ABS**: Modulates service brake torque when lock tendency detected
- **Bias Distribution**: Proportional split applied before individual wheel ABS modulation

### Powertrain
- **Engine Profiles**: Static catalog of piston engine types (I3-I6, V6-V12)
- **Transmission Profiles**: Manual, automatic, DCT, CVT with defined ratios
- **Drive Torque**: Engine curve-based with redline limiting and differential distribution
- **Differentials**: Open, limited-slip, Torsen, locked, and welded modes available

## Advanced Features (Feature-Gated)

### Vertical Dynamics
- 3-DOF heave/pitch/roll solver replacing quasi-static load transfer
- Enabled via `verticalDynamicsEnabled` flag (enabled by default)

### Combined-Slip Modeling  
- Brush/Fiala tire model replacing the simple linear approach and friction-circle combined cap
- Enabled via `combinedSlipTireModelEnabled` flag (disabled by default)

### Enhanced ABS
- Target-slip advanced control algorithm
- Enabled via `advancedAbsEnabled` flag

### Aerodynamics
- Quadratic drag model (default: Cd=0.32, Area=2.2m²)
- Optional downforce component
- Enabled via `aeroDownforceEnabled` flag

### Drivetrain Enhancements
- Engine inertia and RPM integration
- Automatic transmission shifting
- Clutch modeling
- Various feature flags control advanced behaviors

## Terrain Interaction
- Mathematical heightfield queried directly (not triangle mesh collision)
- Stable normal calculation via central differences
- Slope-aware contact geometry maintaining consistent tire radius
- Normal-force-weighted slope gravity component

### Procedural Off-road Terrain
The proving-ground profile is unchanged. Off-road mode with its default configuration and no seed retains the established course; adding a seed selects a repeatable variation of its height, surface-region placement, and generated obstacle layout. The generated heightfield remains a pure world-coordinate sample, so query order does not affect results. Deformation remains a separate runtime layer.

Resizing the course scales the course features proportionally: the jumps, the whoops, and the obstacle dimensions all follow the course extent, and the rock garden bump footprint is expressed in course-scaled metres, so a larger course is a proportionally larger course rather than the 400 m course with empty space appended. The obstacle mass and inertia follow the scaled geometry, and because the movability thresholds are absolute, the obstacles of a larger course stay fixed.

A seeded configuration can be selected through the URL:

```text
?terrain=offroad&seed=granite-run-04&terrainSizeMeters=500&featureScale=1.2&roughnessMeters=0.12&obstacleDensity=2&water=true
```

- `seed`: optional string (1–128 trimmed characters) or safe integer; omitting it preserves the legacy course. The legacy obstacle layout is preserved and proportionally scaled when the terrain size changes, and the extra obstacles that `obstacleDensity` adds are placed by a deterministic rule rather than a random seed.
- `terrainSizeMeters`: square terrain width and depth, centered at the world origin. Programmatic configuration may instead supply matching square `boundsMeters`.
- `featureScale`: positive, unitless scale for the course features.
- `roughnessMeters`: amplitude for the terrain variation, accepted in the range 0 – 2 m. Out-of-range URL values fall back to the 0.05 m default; out-of-range direct configuration throws a `RangeError`.
- `obstacleDensity`: multiplier from 0 to 4 relative to the default obstacle count; explicitly supplied obstacle descriptors take precedence.
- `water=true` enables the water surface for off-road mode; `terrain=offroad-water` also enables it.

Embedded callers can provide these options through `createSimulation({ terrainSelectionConfig: { offroadGenerationConfig: { ... } } })`. Programmatic bounds use `{ minXMeters, maxXMeters, minZMeters, maxZMeters }` and must describe a square centered at the origin. `waterEnabled` is also available as a programmatic boolean on either `offroadProfileConfig` or `offroadGenerationConfig`; `offroadGenerationConfig` takes precedence over `offroadProfileConfig`, and `terrain=offroad-water` always forces the water surface on.

The terrain render grid follows the terrain size. It targets a 1.25 m sample spacing and is clamped to 256–512 subdivisions, so the 320 m proving ground renders at 256 subdivisions, the 400 m off-road course at 320 (1.25 m), a 500 m course at 400 (1.25 m), and a course of 640 m or more at the 512 subdivision cap (1.56 m at 800 m, 1.95 m at 1000 m). The measured mesh generation cost is about 0.22 s at 400 m, 0.26 s at 500 m, and 0.43 s at the 512 subdivision cap.

The same seed and configuration reproduce the same terrain heights, normals, surface kinds, and obstacle descriptors. Invalid direct configuration throws `TypeError` or `RangeError`; malformed URL option values are ignored in favor of defaults. This is finite terrain generation at selection time, not infinite streaming or terrain that regenerates while driving.

## Visualization
- Toroidal tire geometry with pressure/load-responsive deformation
- Independent wheel kinematics following suspension physics
- Visual-only chassis attitude estimation (heave/pitch/roll)
- Slip state visualization overlays

## Validation & Testing
- Multi-rate timestep sensitivity testing (60-480 Hz)
- Regression suite tracking position, velocity, and force consistency
- Known limitations in ABS timing and braking distances noted

## Developer Tools
- Real-time telemetry HUD showing forces, slip, loads, and dynamics
- Live tuning parameters for drive/brake/tire stiffness multipliers
- Comprehensive state tracing for debugging

---
*Last Updated: Wednesday, August 19, 2026*