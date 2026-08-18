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
- Enabled via `verticalDynamicsEnabled` flag

### Combined-Slip Modeling  
- Brush/Fiala tire model replacing simple linear approach
- Enabled via `combinedSlipTireModelEnabled` flag

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