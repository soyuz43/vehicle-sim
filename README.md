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

Wheels now carry explicit rotational state used by visual wheel spin. Wheel angular velocity now integrates from simple drive/brake/contact torque, wheel inertia, and a temporary rolling correction. Wheel lock and richer tire curves remain future work.

Each tire includes a high-contrast visual witness mark attached to the rotating wheel assembly. The mark is a debugging aid for inspecting wheel spin, rolling, braking, and skating artifacts; it does not affect physics.


## Brake System Foundation

The normal service brake and the parking brake are now separate command paths. The service brake remains the `S` brake-pedal input and applies service brake torque to all wheels through the existing braking path. The parking brake is a separate hold input on `Space`, defaults to rear wheels only, and contributes its own parking-brake torque component.

Per-wheel telemetry records service brake pressure, parking brake pressure, requested/applied service brake torque, requested/applied parking brake torque, and total brake torque command magnitude. The existing `brakeTorqueNewtonMeters` field remains the signed wheel torque component consumed by net wheel torque. Brake lock tendency telemetry can identify service-brake versus parking-brake source, and service-brake ABS v1 now modulates only the service-brake torque path.

Service brake input continues to drive the brake lights. Parking brake alone is intentionally not treated as the normal brake-light signal in this simulation branch.


## Service Brake ABS v1

Service-brake ABS v1 now modulates service brake torque per wheel when service-brake lock tendency or braking slip indicates imminent lock. Each wheel records ABS state, modulation, release intent, and service brake torque before/after ABS so the debug HUD can show which wheels are releasing, holding, or reapplying brake torque.

ABS applies only to the service brake path. Parking brake torque remains a separate rear-wheel-only command path and is explicitly excluded from ABS modulation. This is a staged controller foundation, not a full production ABS model; it does not change friction, traction limits, tire pressure behavior, brake assist, traction control, stability control, suspension, load transfer, lateral tire forces, or combined slip.

## Longitudinal Slip Ratio Telemetry

Each wheel records longitudinal slip ratio telemetry by comparing wheel surface speed with longitudinal ground speed. Positive slip means wheel surface speed exceeds ground speed in the current longitudinal direction; negative slip means the wheel surface is slower. Current ground speed is approximated from planar local-forward velocity until per-wheel contact patch velocity exists. Slip ratio now feeds the basic longitudinal tire-force model, and the service-brake ABS v1 controller can also read it while richer wheel-lock detection and tire curves remain future work.


## Torque-Coupled Wheel Dynamics

Wheel angular velocity now integrates from simple net torque and wheel inertia. The scalar vehicle acceleration model remains active, while the longitudinal tire force feeding it now comes from the basic linear/saturated slip-ratio model. A weak temporary rolling correction remains as numerical stabilization only; it is not the tire model and should be removed or reduced as tire modeling improves.


## Basic Linear Longitudinal Tire Model

Longitudinal tire force now comes from a simple linear/saturated slip-ratio model. Each wheel computes an uncapped force from longitudinal slip ratio and `longitudinalTireStiffnessNewtonsPerSlipRatio`, then caps applied force by `frictionCoefficient * normalForceNewtons`. This is not Pacejka, combined slip, ABS, load transfer, suspension, or lateral dynamics.


## Planar Chassis Motion

Vehicle heading and world velocity are now separate planar state. The controller tracks world-space planar velocity, vehicle-local forward velocity, vehicle-local lateral velocity, yaw angle, yaw rate, and planar acceleration telemetry. Longitudinal tire force still drives acceleration along the vehicle's forward axis, and `speedScalar` remains a compatibility alias for signed local-forward velocity.

Local lateral velocity can now be measured when the vehicle yaws while moving, but lateral tire forces are not implemented yet. A small `temporaryLateralVelocityDampingPerSecond` placeholder keeps sideways skating bounded; it is not a real lateral tire model. Any sideways motion at this stage is foundation telemetry for later lateral slip angle, lateral tire forces, oversteer/understeer, and combined slip work, not a full drift or grip model.


## Lateral Slip Angle Telemetry

Each wheel now records telemetry-only lateral slip angle by estimating contact-patch velocity from planar chassis velocity and yaw rate, then projecting that velocity into the wheel's current local forward/right axes. Front steerable wheels use current steering angle telemetry, rear wheels use chassis heading, and the vehicle snapshot now exposes a compact aggregate lateral-slip summary for the debug HUD.

This branch measures lateral slip during steering and turning only. It does not apply lateral tire forces, yaw moments from lateral tire forces, combined slip, suspension, load transfer, stability control, traction control, drift behavior, smoke, squeal, particles, or friction/grip/traction-limit sliders. Straight-line driving should stay near zero lateral slip angle, while turning can now produce meaningful telemetry for future lateral tire-force, understeer, and oversteer work.


## Dynamics Sanity Telemetry

The developer debug HUD includes compact local acceleration, tire-force saturation, service/parking brake torque, service-brake ABS state, yaw-rate, longitudinal slip-ratio, lateral slip-angle, and planar velocity telemetry for checking longitudinal, braking, and yaw sign conventions. These diagnostics do not add brake assist, load transfer, suspension, lateral tire forces, combined slip, or player-facing tuning controls.


## Tire Inflation Visualization

A developer-only tire inflation panel exposes visual tire pressure state in kPa. The current tire pressure setting changes contact-patch presentation only: underinflated values make the visual patch wider/longer, and overinflated values make it smaller. This is a visual/debug foundation, not tire-pressure physics.

Tire pressure does not alter `frictionCoefficient`, `tractionLimitNewtons`, longitudinal tire force, tire stiffness, rolling resistance, wheel inertia, or vehicle dynamics in this branch. Friction remains a tire/surface/material definition in code/data, not a magic live UI control. Future tire-pressure physics may explicitly affect tire stiffness, effective rolling radius, contact patch behavior, rolling resistance, heat, or deformation.


## Developer Dynamics Tuning

A developer dynamics tuning panel exposes live multipliers for drive torque, service brake torque, and longitudinal tire stiffness. This is for calibration, debugging, and deliberately provoking wheel spin, braking changes, or softer/stiffer tire response. The defaults are all `1.0`, which preserves the current baseline behavior.

The panel does not expose UI controls for friction coefficient, surface friction, available-traction caps, tire pressure, player progression, or upgrades. Friction remains a tire/surface/material definition in code/data.


## Longitudinal Traction State

Each wheel now exposes longitudinal traction classification telemetry derived from contact state, slip ratio, tire-force saturation, drive torque, service/parking brake torque, wheel surface speed, and local ground speed. Wheels can classify as `airborne`, `stopped`, `rolling`, `saturated`, `drive_spin`, or `brake_lock_tendency`, and the debug HUD shows a compact aggregate summary including service-brake and parking-brake lock-tendency counts.

This traction-state layer remains a telemetry/debug foundation. It classifies wheel behavior and now feeds service-brake ABS v1, but it does not implement brake assist, smoke, tire squeal, skid marks, lateral tire forces, combined slip, suspension, or load transfer. It does not change friction, tire pressure behavior, traction limits, or tire-force calculation beyond the ABS controller reading the telemetry.


## Tire Slip Visual Feedback

A separate tire slip feedback overlay reads longitudinal traction state telemetry and shows simple ground-oriented visual markers for rolling, saturation, drive spin, and brake-lock tendency. These visuals are independent from tire inflation contact-patch scaling, and they do not rotate with tire tread or affect wheel physics.

The feedback is visual/debug only. It does not change tire force, friction, traction limits, tire pressure behavior, ABS, service/parking brake commands, suspension, load transfer, combined slip, or lateral dynamics. Tire squeal audio, richer smoke, and persistent skid marks remain future work.


## Longitudinal Force Pipeline

Longitudinal drive and brake inputs still create per-wheel request and torque command telemetry. Applied longitudinal force now comes from each wheel's capped slip-ratio tire force instead of directly clamping the driver force request. The summed applied wheel force still feeds the existing scalar longitudinal acceleration model. This establishes extension points for later brake bias, ABS, richer tire models, and load transfer without implementing those systems yet.


## Controls

- `W` applies throttle.
- `S` applies the service brake.
- `Space` holds the parking brake.
- `A` / `D` steer.
- `[` shifts the selector down: Drive → Neutral → Reverse.
- `]` shifts the selector up: Reverse → Neutral → Drive.
- `C` cycles camera mode.
- `R` resets the vehicle.

The current drivetrain model uses a simple Reverse / Neutral / Drive selector. It does not yet simulate engine RPM, gear ratios, clutch behavior, torque converter behavior, or multi-speed transmission logic.