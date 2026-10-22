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
- `[`/`]`: Shift forward gear (down / up) on the selected transmission
- Reverse/Neutral/Drive selector: no key binding; set it programmatically with `controller.setGear('reverse' | 'neutral' | 'drive')`
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

### Suspension Archetypes
- **Axle coupling mode per axle**: `frontAxleCoupling` and `rearAxleCoupling` select `independent` (each wheel resolves its own vertical position) or `rigidAxle` (one rigid beam carries both wheels of the axle)
- **Rigid beam**: A coupled axle has one shared leaf, so both of its wheels report the same suspension length, and the axle carries one roll angle about its longitudinal axis
- **Catalog archetype**: `susp-solid-axle-rear` ("Rear Solid Axle (shared leaf)") selects a coupled rear axle with an independent front axle
- **Visual**: A coupled axle is drawn as a beam that spans its two wheel centres, with a leaf pack riding on top of it. The beam follows the published wheel positions and rolls with the simulated beam; an independent axle draws no beam at all
- **Driving effect**: A one-sided bump under one rear wheel lifts that wheel and holds the other one up instead of letting the far wheel stay on its own path, and the rear axle stops contributing a terrain roll moment to the body
- **Lateral load transfer**: A coupled axle is ONE spring at the axle centre, so it takes no lateral load transfer across its own tires. The whole transfer (m * a * h_cg / track) is carried by the other axle, and the body rolls further because a solid axle cannot contribute roll stiffness
- **Not modelled**: progressive leaf rates, inter-leaf friction, anti-roll bars, unsprung mass, per-corner spring rates, and a hanging-beam pose for a fully airborne axle
- **Visual archetype**: `susp-macpherson-strut` ("MacPherson Strut (visual only)") draws a coil-over strut per front corner and leaves the rear axle stock. Its physics are identical to the stock profile - it changes no spring rate, travel, damping, or coupling mode. The catalog entry exists to establish the per-corner visual seam for future archetypes; it does not currently change handling
- **Not modelled (MacPherson)**: roll-center height, camber gain, strut kinematics, anti-roll bars, and unsprung mass. Those need roll-center parameters and a tire model that accepts camber input

Reachable today via the browser console: `__vehicleSim.vehicleController.setSuspension('susp-solid-axle-rear')` or `__vehicleSim.vehicleController.setSuspension('susp-macpherson-strut')`. The Config Panel dropdown lists the archetypes, and its Apply button now applies the selected setup to the running vehicle live.

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

### Vehicle Configuration
- **Catalog slots**: Six slots (chassis, suspension, wheels, drivetrain, brakes, aero) select one component each from the vehicle component catalog. A component owns its spec fields outright, so selecting a component replaces those fields and a field the component does not declare falls back to the default spec
- **Live apply**: The Config Panel's Apply button applies the selected setup to the running controller in place. The controller object itself never changes, so every holder of a controller reference (camera, panels, obstacle interaction, console hook) keeps working
- **Preserved state**: The pose, the velocity, the yaw, the R/N/D gear selector, and the tire pressures survive an apply. A setup change is not a teleport
- **Derived dirty state**: The panel's dirty state is derived from the staged selection and the running selection, not stored as a flag, so it cannot disagree with what the panel shows
- **Reset Vehicle**: The panel's reset control restores the stock catalog setup and applies it live. It does not touch the terrain: a terrain selection is applied by reloading the session, so a staged terrain selection stays staged and the panel keeps reporting it as pending
- **Chassis change**: A new chassis mass and center of mass make the stored vertical dynamics state stale, so the chassis mass properties are re-derived and the heave, pitch, and roll positions and rates are dropped. The vehicle keeps its pose and its velocity
- **Console access**: `__vehicleSim.vehicleController.setVehicleConfiguration({ version: 1, slots: { chassis: 'chassis-suv', suspension: 'susp-stock', wheels: 'tires-stock', drivetrain: 'drivetrain-stock', brakes: 'brakes-stock', aero: 'aero-stock' } })`
- **Cosmetic fields**: The chassis wheelbase, the chassis track widths, and the tire base rolling radius do not change the rendered vehicle, because the car mesh owns the real dimensions. The track width still feeds the vertical-dynamics roll inertia; the wheelbase and the rolling radius are fallbacks that the wheel layout and the wheel geometry normally replace
- **Terrain and vehicle are decoupled**: A terrain selection still reloads the page, and the vehicle selection of that apply is not re-applied after the reload. The vehicle setup is applied live on its own

## Advanced Features (Feature-Gated)

### Vertical Dynamics
- 3-DOF heave/pitch/roll solver replacing quasi-static load transfer
- Enabled via `verticalDynamicsEnabled` flag (enabled by default)
- Prior-step acceleration drives pitch/roll and terrain suspension spring force drives heave through `verticalDynamicsForcingEnabled`
- The same per-corner terrain spring force deviation also drives roll and pitch through each corner's moment arm, so uneven terrain rolls and pitches the body
- A coupled axle's spring acts at the axle centre, not at the wheel offsets: it contributes no roll stiffness and no roll moment, and its two corners report the same load deviation

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
- Automatic transmission shifting (only for transmission profiles that support it; manual gearboxes hold their first gear)
- Manual gear shifting with the `[`/`]` keys (only for transmission profiles that support manual selection; the CVT ignores it)
- Clutch modeling
- Various feature flags control advanced behaviors

## Terrain Interaction
- Mathematical heightfield queried directly (not triangle mesh collision)
- Stable normal calculation via central differences
- Slope-aware contact geometry maintaining consistent tire radius
- Normal-force-weighted slope gravity component

### Procedural Off-road Terrain
The proving-ground profile is unchanged. Off-road mode with its default configuration and no seed retains the established course layout and its obstacle layout; the rock garden contributes a real bump field, so the unseeded course heights inside the garden are not the flat patch of the earlier revision. Adding a seed selects a repeatable variation of its height, surface-region placement, and generated obstacle layout. The generated heightfield remains a pure world-coordinate sample, so query order does not affect results. Deformation remains a separate runtime layer.

Resizing the course scales the course features proportionally: the jumps, the whoops, and the obstacle dimensions all follow the course extent, and the rock garden bump footprint is expressed in course-scaled metres, so a larger course is a proportionally larger course rather than the 400 m course with empty space appended. The obstacle mass and inertia follow the scaled geometry, and because the movability thresholds are absolute, the obstacles of a larger course stay fixed.

The off-road surface layout is a route across the course rather than a tiling of it: an asphalt start strip, a gravel corridor, a rock band with a mud pit in the centre and a grass band on the right, then sand and dirt. The ground beside the route, meaning the flanks of the gravel corridor and the verge along the course edge, belongs to no region and reads as dirt, the generic off-road ground, with a friction coefficient of 0.55. Before this, those flanks fell back to the proving-ground tarmac with a friction coefficient of 0.95, so the course had tarmac shoulders that no region described. The mud pit keeps the symmetric width it declares: the first matching region wins, so it is listed before the rock and the grass band that overlap it.

The rock garden is a lattice of course-scaled cells, each holding eight seeded cosine bumps whose centres, radii, and amplitudes vary from cell to cell, so the garden contributes a real per-position bump field rather than a flat patch. The cell size and the bump radii scale with the course and the amplitude is scaled with it as well, so the bump footprint and the bump slope of a resized course both follow the course extent: the height at twice the coordinate of the 400 m course is twice the height, up to the terrain noise, which is a position-based material property and is deliberately not scaled. The bump field raises the 400 m course by up to about 0.32 m inside the garden. The bumps are 8 cm to 20 cm high, which is the size of the feature the course describes and the same order as its other surfaces, and that amplitude is a design value rather than a tuning artefact: the sharpest bump crest in the band excites about 6.8 g of vertical acceleration at 13 m/s before the suspension filters it, and the whoops section of the course is geometrically harsher than the garden.

The garden is a bounded band. On the 400 m course it covers z from -100 m to 0 m and x from -190 m to 10 m, which is the rock band of the course and the western half of the course at that band, and the band scales with the course the way the jumps and the whoops do, so the 800 m course has a band of 200 m in z and 400 m in x. The mask ramps up over a 10 m feather at each band edge and is zero outside the band, so the sand, dirt, and grass regions of the course carry no garden.

The garden band and the rock surface region are different systems with different extents, and the band deliberately covers the route line through z from -100 m to 0 m (PR #86). The band reaches 20 m east of the rock surface region, so it also covers the mud corridor up to x = 10 m, which is 5 m short of the east wall of the mud pit. The tabletop jump at z = -80 m and the step-up jump at z = -20 m therefore sit inside the garden band. Measured on the 400 m course, the garden contributes 0.000 m to the route line at the tabletop, so the jump face is deterministic there. Off the route line the contribution is not a single figure: it reaches up to about 0.30 m within 5 m of the route line and about 0.32 m at the band maximum, of which 0.21 m at x = -3.25 m and z = -73.5 m is one example. A driver who wants a fully deterministic jump face should stay on the route line, because an off-line approach to a jump face feels rockier by up to that 0.30 m. The step-up jump shows the same pattern: 0.000 m on the route line and up to 0.14 m off it, at x = -8 m and z = -26 m.

A seeded configuration can be selected through the URL:

```text
?terrain=offroad&seed=granite-run-04&terrainSizeMeters=500&featureScale=1.2&roughnessMeters=0.12&obstacleDensity=2&water=true
```

- `seed`: optional string (1–128 trimmed characters) or safe integer; omitting it preserves the legacy course layout and its obstacle layout, but not the earlier flat rock garden, which now carries a real bump field. The legacy obstacle layout is preserved and proportionally scaled when the terrain size changes, and the extra obstacles that `obstacleDensity` adds are placed by a deterministic rule rather than a random seed.
- `terrainSizeMeters`: square terrain width and depth, centered at the world origin. Programmatic configuration may instead supply matching square `boundsMeters`.
- `featureScale`: positive, unitless scale for the course features.
- `roughnessMeters`: amplitude for the terrain variation, accepted in the range 0 – 2 m. Out-of-range URL values fall back to the 0.05 m default; out-of-range direct configuration throws a `RangeError`.
- `obstacleDensity`: multiplier from 0 to 4 relative to the default obstacle count; explicitly supplied obstacle descriptors take precedence.
- `water=true` enables the water surface for off-road mode; `terrain=offroad-water` also enables it.

Embedded callers can provide these options through `createSimulation({ terrainSelectionConfig: { offroadGenerationConfig: { ... } } })`. Programmatic bounds use `{ minXMeters, maxXMeters, minZMeters, maxZMeters }` and must describe a square centered at the origin. `waterEnabled` is also available as a programmatic boolean on either `offroadProfileConfig` or `offroadGenerationConfig`; `offroadGenerationConfig` takes precedence over `offroadProfileConfig`, and `terrain=offroad-water` always forces the water surface on.

The terrain render grid follows the terrain size. It targets a 1.25 m sample spacing and is clamped to 256–512 subdivisions, so the 320 m proving ground renders at 256 subdivisions, the 400 m off-road course at 320 (1.25 m), a 500 m course at 400 (1.25 m), and a course of 640 m or more at the 512 subdivision cap (1.56 m at 800 m, 1.95 m at 1000 m). The measured mesh generation cost is 0.167 s at 400 m, 0.173 s at 500 m, and 0.308 s at the 512 subdivision cap.

The off-road obstacles are rendered as discrete primitive meshes on the terrain. The ground mesh carries the terrain only, so the obstacle footprint is no longer duplicated in the ground grid, and the physics contact query keeps sampling the obstacle-aware profile, so wheel contact on an obstacle is unchanged. A wheel contact inside an obstacle footprint raises the emissive of that obstacle mesh, and the highlight follows the obstacle to its live position while it is pushed.

The same seed and configuration reproduce the same terrain heights, normals, surface kinds, and obstacle descriptors. Invalid direct configuration throws `TypeError` or `RangeError`; malformed URL option values are ignored in favor of defaults. This is finite terrain generation at selection time, not infinite streaming or terrain that regenerates while driving.

## Visualization
- Toroidal tire geometry with pressure/load-responsive deformation
- Independent wheel kinematics following suspension physics
- Solid axle beam and leaf pack that follow the wheels of a coupled axle
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
- Swap transmissions live from the browser console: `__vehicleSim.vehicleController.setTransmission('manual-6')` (also: manual-4, manual-5, manual-6-granny, automatic-6, automatic-8, dct-7, dct-8, cvt).
- Swap suspension profiles live from the browser console: `__vehicleSim.vehicleController.setSuspension('susp-solid-axle-rear')` (also: susp-stock, susp-lowered, susp-lifted, susp-stiff, susp-macpherson-strut). The swap replaces the suspension spec fields and keeps the vehicle's position, velocity, gear, and transmission.

---
*Last Updated: Wednesday, August 19, 2026*