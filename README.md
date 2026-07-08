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