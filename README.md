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


## Service Brake Torque State

Each wheel records service brake pressure and brake torque command state. Brake torque now contributes to wheel angular dynamics, while current vehicle braking still uses the existing per-wheel longitudinal force pipeline and scalar acceleration model. This state prepares later wheel lock, ABS, and tire curves.


## Longitudinal Slip Ratio Telemetry

Each wheel records longitudinal slip ratio telemetry by comparing wheel surface speed with longitudinal ground speed. Positive slip means wheel surface speed exceeds ground speed in the current longitudinal direction; negative slip means the wheel surface is slower. The current contact patch velocity is approximated from scalar vehicle speed until planar chassis dynamics exist. Slip ratio is not yet used to compute tire forces; future branches can use it for wheel lock detection, ABS, and tire curves.


## Torque-Coupled Wheel Dynamics

Wheel angular velocity now integrates from simple net torque and wheel inertia. The scalar vehicle acceleration model still uses the existing force pipeline, and clamp-based traction limiting remains in place. A temporary rolling constraint correction limits runaway wheel spin while tire force is still clamp-based; a future basic linear longitudinal tire model should remove or reduce that correction and derive tire force from slip.


## Longitudinal Force Pipeline

Longitudinal drive and brake requests are generated per wheel, then each wheel independently applies the current clamp-based placeholder traction limit. The summed applied wheel force still feeds the existing scalar longitudinal acceleration model. This establishes extension points for later brake bias, ABS, parking brake requests, tire slip models, and load transfer without implementing those systems yet.


## Controls

- `W` applies throttle.
- `S` applies brake.
- `A` / `D` steer.
- `[` shifts the selector down: Drive → Neutral → Reverse.
- `]` shifts the selector up: Reverse → Neutral → Drive.
- `C` cycles camera mode.
- `R` resets the vehicle.

The current drivetrain model uses a simple Reverse / Neutral / Drive selector. It does not yet simulate engine RPM, gear ratios, clutch behavior, torque converter behavior, or multi-speed transmission logic.