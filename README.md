Simulation units:
- 1 world unit = 1 meter.
- Time is measured in seconds.
- Velocity is measured in meters per second.
- Acceleration is measured in meters per second squared.
- Y is vertical.
- Gravity points in negative Y.
- Standard gravity is 9.80665 m/s².


## Simulation Loop

Vehicle simulation advances in fixed `1 / 60` second physics steps while rendering remains driven by `requestAnimationFrame`. This prepares the simulation layer for later wheel contact, suspension, and tire-force work without tying physics integration directly to render frame rate.


## Wheel Contact State

The simulation tracks finite per-wheel contact state against the current flat terrain placeholder. Each wheel records ground distance, tire penetration, contact point, contact normal, surface kind, and friction metadata as preparation for later suspension, surface friction, and tire slip work.

The bottom-right driver panel shows speed, the R/N/D selector, and compact per-wheel contact/placeholder available-traction status.


## Wheel Rotational State

Wheels now carry explicit rotational state used by visual wheel spin. Wheel angular velocity now integrates from simple drive/brake/contact torque, wheel inertia, and a temporary rolling correction. Wheel lock, ABS, and tire curves remain future work.

Each tire includes a high-contrast visual witness mark attached to the rotating wheel assembly. The mark is a debugging aid for inspecting wheel spin, rolling, braking, and skating artifacts; it does not affect physics.


## Service Brake Torque State

Each wheel records service brake pressure and brake torque command state. Brake torque now contributes to wheel angular dynamics, while current vehicle braking still uses the existing per-wheel longitudinal force pipeline and scalar acceleration model. This state prepares later wheel lock, ABS, and tire curves.


## Longitudinal Slip Ratio Telemetry

Each wheel records longitudinal slip ratio telemetry by comparing wheel surface speed with longitudinal ground speed. Positive slip means wheel surface speed exceeds ground speed in the current longitudinal direction; negative slip means the wheel surface is slower. Current ground speed is approximated from planar local-forward velocity until per-wheel contact patch velocity exists. Slip ratio now feeds the basic longitudinal tire-force model, and future branches can use it for wheel lock detection, ABS, and more complete tire curves.


## Torque-Coupled Wheel Dynamics

Wheel angular velocity now integrates from simple net torque and wheel inertia. The scalar vehicle acceleration model remains active, while the longitudinal tire force feeding it now comes from the basic linear/saturated slip-ratio model. A weak temporary rolling correction remains as numerical stabilization only; it is not the tire model and should be removed or reduced as tire modeling improves.


## Basic Linear Longitudinal Tire Model

Longitudinal tire force now comes from a simple linear/saturated slip-ratio model. Each wheel computes an uncapped force from longitudinal slip ratio and `longitudinalTireStiffnessNewtonsPerSlipRatio`, then caps applied force by `frictionCoefficient * normalForceNewtons`. This is not Pacejka, combined slip, ABS, load transfer, suspension, or lateral dynamics.


## Planar Chassis Motion

Vehicle heading and world velocity are now separate planar state. The controller tracks world-space planar velocity, vehicle-local forward velocity, vehicle-local lateral velocity, yaw angle, yaw rate, and planar acceleration telemetry. Longitudinal tire force still drives acceleration along the vehicle's forward axis, and `speedScalar` remains a compatibility alias for signed local-forward velocity.

Local lateral velocity can now be measured when the vehicle yaws while moving, but lateral tire forces are not implemented yet. A small `temporaryLateralVelocityDampingPerSecond` placeholder keeps sideways skating bounded; it is not a real lateral tire model. Any sideways motion at this stage is foundation telemetry for later lateral slip angle, lateral tire forces, oversteer/understeer, and combined slip work, not a full drift or grip model.


## Dynamics Sanity Telemetry

The developer debug HUD includes compact local acceleration, tire-force saturation, service brake torque, yaw-rate, slip-ratio, and planar velocity telemetry for checking longitudinal, braking, and yaw sign conventions. These diagnostics do not add ABS, parking brake, load transfer, suspension, lateral tire forces, or player-facing tuning controls.


## Tire Inflation Visualization

A developer-only tire inflation panel exposes visual tire pressure state in kPa. The current tire pressure setting changes contact-patch presentation only: underinflated values make the visual patch wider/longer, and overinflated values make it smaller. This is a visual/debug foundation, not tire-pressure physics.

Tire pressure does not alter `frictionCoefficient`, `tractionLimitNewtons`, longitudinal tire force, tire stiffness, rolling resistance, wheel inertia, or vehicle dynamics in this branch. Friction remains a tire/surface/material definition in code/data, not a magic live UI control. Future tire-pressure physics may explicitly affect tire stiffness, effective rolling radius, contact patch behavior, rolling resistance, heat, or deformation.


## Longitudinal Force Pipeline

Longitudinal drive and brake inputs still create per-wheel request and torque command telemetry. Applied longitudinal force now comes from each wheel's capped slip-ratio tire force instead of directly clamping the driver force request. The summed applied wheel force still feeds the existing scalar longitudinal acceleration model. This establishes extension points for later brake bias, ABS, parking brake requests, richer tire models, and load transfer without implementing those systems yet.


## Controls

- `W` applies throttle.
- `S` applies brake.
- `A` / `D` steer.
- `[` shifts the selector down: Drive → Neutral → Reverse.
- `]` shifts the selector up: Reverse → Neutral → Drive.
- `C` cycles camera mode.
- `R` resets the vehicle.

The current drivetrain model uses a simple Reverse / Neutral / Drive selector. It does not yet simulate engine RPM, gear ratios, clutch behavior, torque converter behavior, or multi-speed transmission logic.