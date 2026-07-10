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

ABS applies only to the service brake path. Parking brake torque remains a separate rear-wheel-only command path and is explicitly excluded from ABS modulation. This is a staged controller foundation, not a full production ABS model; it does not change friction, traction limits, tire pressure behavior, brake assist, traction control, stability control, suspension, load transfer, the new lateral tire-force path, or full combined-slip modeling.

## Service Brake Bias v1

Service brake torque is now distributed using a front-biased axle split.
The `serviceBrakeFrontBias01` spec value (default 0.65) controls the
fraction of total requested service brake torque sent to the front axle;
the rear axle receives the remainder.

Brake bias applies only to the service brake path. Parking brake remains
rear-only and is unaffected by service brake bias. ABS still modulates
only the service brake path.

Brake bias does not directly change `frictionCoefficient`,
`normalForceNewtons`, or `tractionLimitNewtons`; the traction limit
remains `frictionCoefficient * normalForceNewtons`. There is no hydraulic
brake model, brake heat, fade, wear, or damage model.


## Longitudinal Slip Ratio Telemetry

Each wheel records longitudinal slip ratio telemetry by comparing wheel surface speed with longitudinal ground speed. Positive slip means wheel surface speed exceeds ground speed in the current longitudinal direction; negative slip means the wheel surface is slower. Current ground speed is approximated from planar local-forward velocity until per-wheel contact patch velocity exists. Slip ratio now feeds the basic longitudinal tire-force model, and the service-brake ABS v1 controller can also read it while richer wheel-lock detection and tire curves remain future work.


## Torque-Coupled Wheel Dynamics

Wheel angular velocity now integrates from simple net torque and wheel inertia. The wheel torque path remains staged, while the body now receives world-space planar force and yaw moment from the per-wheel tire-force pipeline. A weak temporary rolling correction remains as numerical stabilization only; it is not the tire model and should be removed or reduced as tire modeling improves.


## Basic Linear Longitudinal Tire Model

Longitudinal tire force now comes from a simple linear/saturated slip-ratio model. Each wheel computes an uncapped force from longitudinal slip ratio and `longitudinalTireStiffnessNewtonsPerSlipRatio`, then caps applied force by `frictionCoefficient * normalForceNewtons`. Longitudinal and lateral components now also share a basic combined friction cap, and traction limits now follow each wheel's dynamic normal force through quasi-static load transfer. This remains a staged foundation: it is not Pacejka, not a professional tire model, not a full combined-slip curve, and not suspension or a full rigid-body chassis model.


## Planar Chassis Motion

Vehicle heading and world velocity are now separate planar state. The controller tracks world-space planar velocity, vehicle-local forward velocity, vehicle-local lateral velocity, yaw angle, yaw rate, yaw acceleration, and planar acceleration telemetry. Per-wheel tire forces now sum into world-space planar body force, while `speedScalar` remains a compatibility alias for signed local-forward velocity.

Turning now generates actual lateral tire force and yaw moment from the existing per-wheel contact and slip state instead of relying on the earlier simplified steering-yaw shortcut. Quasi-static load transfer now also shifts per-wheel normal force from prior-step local acceleration so acceleration, braking, and cornering can change available traction without changing friction coefficient. This is still a staged chassis foundation, not a full rigid-body vehicle model: there is still no suspension, no spring/damper motion, no roll-center geometry, and no visual chassis roll or pitch simulation.


## Lateral Slip Angle Telemetry

Each wheel continues to record lateral slip angle by estimating contact-patch velocity from planar chassis velocity and yaw rate, then projecting that velocity into the wheel's current local forward/right axes. Front steerable wheels use current steering angle telemetry, rear wheels use chassis heading, and the vehicle snapshot exposes a compact aggregate lateral-slip summary for the debug HUD.

That telemetry now feeds the first basic lateral tire-force branch. Straight-line driving should stay near zero lateral slip angle, while turning can now produce meaningful per-wheel slip-angle, lateral-force, and yaw telemetry for future tire-curve, understeer, and oversteer work.

## Basic Lateral Tire Force v1

Each grounded wheel now converts lateral slip angle into a basic linear lateral tire force using `-lateralTireStiffnessNewtonsPerRadian * lateralSlipAngleRadians`. The force is capped by each wheel's existing `frictionCoefficient * normalForceNewtons`, and longitudinal plus lateral components then share a simple combined friction cap so a wheel cannot exceed its current traction limit when both components are active.

The vehicle body now receives summed world-space planar tire force and a basic yaw moment from per-wheel tire forces applied at wheel offsets. This is an inspectable v1 foundation, not Pacejka, not a professional tire model, not a full combined-slip model, and not suspension, stability control, traction control, or drift physics.

## Quasi-Static Load Transfer v1

Each grounded wheel now derives dynamic `normalForceNewtons` from a quasi-static baseline plus longitudinal and lateral load-transfer deltas driven by prior-step local acceleration. Positive forward acceleration shifts load rearward, braking shifts load forward, and lateral acceleration shifts load to the outside wheels under the project's local-axis convention.

`tractionLimitNewtons` still remains `frictionCoefficient * normalForceNewtons`, so this branch changes available grip only by changing normal force. Friction coefficient stays unchanged, while tire pressure handling now changes effective rolling radius, tire stiffness response, and rolling resistance without directly changing `frictionCoefficient`, `normalForceNewtons`, or `tractionLimitNewtons`. There is still no suspension spring/damper model, roll center, or visual chassis roll/pitch motion.


## Dynamics Sanity Telemetry

The developer debug HUD includes compact local/world acceleration, tire-force saturation, lateral tire-force, combined-cap, service/parking brake torque, service-brake ABS state, yaw-rate, yaw-acceleration, yaw-moment, longitudinal slip-ratio, lateral slip-angle, planar velocity, load-transfer, and tire-pressure handling telemetry for checking longitudinal, lateral, braking, yaw, normal-force, and pressure-response sign conventions. These diagnostics do not add brake assist, suspension, traction control, stability control, or player-facing tuning controls.


## Tire Inflation Visualization

A developer-only tire inflation panel still exposes tire pressure state in kPa and continues to drive the visible contact-patch presentation. Underinflated values still look softer and broader, while overinflated values still look tighter and smaller. That visual/debug layer remains separate from friction coefficient, load transfer, and traction-limit definition.

## Tire Pressure Visual Deformation

Tire pressure now also drives the tire mesh itself, not just the contact-patch marker. Lower pressure visibly flattens and softens each tire: the radial (radius) scale decreases, the tire widens and bulges slightly along the axle, and the contact-patch marker enlarges and flattens. Higher pressure keeps the change subtle and returns the tire toward its normal inflated shape. Overinflation is intentionally conservative so it never looks cartoonish.

The deformation is visual feedback only. A dedicated visual layer (src/car/createTirePressureVisuals.js, with pure mapping helpers in src/car/tirePressureVisualScales.js) reads the existing tire pressure state and eases the visual pressure ratio toward the target over roughly visualResponseSeconds (default 2.0 s) using exponential smoothing. The mesh scale never feeds back into physics: it does not change wheel radius, contact radius, normal force, friction coefficient, traction limit, rolling resistance, drive/brake force, or vehicle motion.

Key invariants:
- Tire visuals visualize simulation state; they do not drive it.
- No sound, puncture, leak, damage, heat, wear, blowout, or compressor system exists yet.
- Pressure-to-traction behavior is unchanged (see Tire Pressure Handling v1).
- A compact Debug HUD line reports the visual state, e.g. "Tire visuals: settled 220 kPa / 1.00 ratio (normal)" or "Tire visuals: settling 120 kPa / 0.72 ratio (flat)".

Future work may add hiss/inflation sounds or more detailed tire carcass visuals, but none are implemented in this layer yet.

## Tire Pressure Handling v1

Tire pressure now also affects tire mechanics before the traction cap. Each wheel derives a conservative effective rolling radius, a pressure-adjusted longitudinal tire stiffness, a pressure-adjusted lateral tire stiffness, and a pressure-aware rolling resistance coefficient from its current pressure state. Underinflated tires therefore roll on a slightly smaller effective radius, build longitudinal and lateral force more softly, and add more rolling resistance; mild overinflation can sharpen stiffness slightly within conservative caps.

Tire pressure still does not directly alter `frictionCoefficient`, `normalForceNewtons`, or `tractionLimitNewtons`. Traction limit still comes only from `frictionCoefficient * normalForceNewtons`, so pressure changes response and drag before saturation rather than acting as a hidden grip slider. There is still no tire temperature, wear, damage, puncture, or blowout model, and there is still no suspension, visual chassis roll/pitch, or Pacejka tire model here.


## Developer Dynamics Tuning

A developer dynamics tuning panel exposes live multipliers for drive torque, service brake torque, and longitudinal tire stiffness. This is for calibration, debugging, and deliberately provoking wheel spin, braking changes, or softer/stiffer tire response. The defaults are all `1.0`, which preserves the current baseline behavior.

The panel does not expose UI controls for friction coefficient, surface friction, available-traction caps, tire pressure, player progression, or upgrades. Friction remains a tire/surface/material definition in code/data.


## Longitudinal Traction State

Each wheel now exposes longitudinal traction classification telemetry derived from contact state, slip ratio, tire-force saturation, drive torque, service/parking brake torque, wheel surface speed, and local ground speed. Wheels can classify as `airborne`, `stopped`, `rolling`, `saturated`, `drive_spin`, or `brake_lock_tendency`, and the debug HUD shows a compact aggregate summary including service-brake and parking-brake lock-tendency counts.

This traction-state layer remains a telemetry/debug foundation. It classifies wheel behavior and now feeds service-brake ABS v1, but it does not implement brake assist, smoke, tire squeal, skid marks, full combined-slip modeling, suspension, or stability systems. It does not change friction, tire pressure behavior, lateral tire-force calculation, or longitudinal tire-force calculation beyond the ABS controller reading the telemetry.


## Tire Slip Visual Feedback

A separate tire slip feedback overlay reads longitudinal traction state telemetry and shows simple ground-oriented visual markers for rolling, saturation, drive spin, and brake-lock tendency. These visuals are independent from tire inflation contact-patch scaling, and they do not rotate with tire tread or affect wheel physics.

The feedback is visual/debug only. It does not change tire force, friction, traction limits, tire pressure behavior, ABS, service/parking brake commands, suspension, combined slip, or lateral dynamics. Tire squeal audio, richer smoke, and persistent skid marks remain future work.


## Longitudinal Force Pipeline

Longitudinal drive and brake inputs still create per-wheel request and torque command telemetry. Applied wheel force now comes from each wheel's capped slip-ratio longitudinal tire force plus the new slip-angle lateral tire force, with both components respecting the existing traction limit through a simple combined cap. Quasi-static load transfer updates per-wheel normal force before those traction limits are consumed, so acceleration, braking, and cornering can redistribute available grip while friction coefficient remains unchanged. This preserves clear seams for richer tire curves, friction-ellipse work, and suspension without pretending those systems already exist. Service brake bias is now implemented separately (see Service Brake Bias v1).


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
## Powertrain Profile Foundation

This is a static data and telemetry foundation for future engine RPM, gear ratios, torque curves, and engine braking. It does NOT yet change vehicle behavior.

The simulation now carries a selected piston-engine profile and a selected transmission profile as plain data. Both are exposed through the vehicle snapshot and the Debug HUD so the chosen powertrain can be represented and inspected, but neither profile feeds any physics integration yet.

Engine scope (v1):
- Common piston car families only: inline-3, inline-4, inline-5, inline-6, V6, V8, V10, V12.
- Explicitly excluded: W engines, H engines, flat/boxer engines, rotary/Wankel, electric motors, hybrid systems, turbine engines, and motorcycle-only oddities.
- No full combustion simulation, no active engine RPM.

Transmission scope (v1):
- Simple static profile types only: manual-4, manual-5, manual-6, manual-6-granny, automatic-6, automatic-8, dct-7, dct-8, cvt.
- These are data profiles only. They do not drive gear selection, shift scheduling, torque-converter behavior, clutch behavior, or any gear-ratio force multiplication.

Default selection:
- Engine: inline-4 gasoline turbo (2.0L I4 Turbo).
- Transmission: 6-speed automatic, which fits the current Reverse / Neutral / Drive selector model (no manual shift controls yet).

Profile data is immutable and frozen. Unknown engine or transmission ids fall back to the safe defaults, so the simulation state always stays finite and serializable.

What this foundation does NOT do yet:
- No engine braking.
- No active engine RPM.
- No clutch, shift scheduling, or automatic shift logic.
- No torque-converter behavior, differential behavior, or gear-ratio force multiplication.
- No change to acceleration, braking, tire forces, friction, normal force, traction limits, ABS, parking brake, load transfer, tire pressure handling, steering, yaw, or surface contact.
- No UI selection menus or tuning sliders.
### Stock Engine Catalog Seed Data

Stock engine catalog seed data now attaches source-derived stock-ish metadata to the existing piston engine profiles. The catalog is local, manual, and static for now. It adds catalog snapshots and derived validation/display telemetry, but it does not change engine or vehicle behavior.

Catalog scope in this branch:
- Eight source-derived seed records: inline-3, inline-4, inline-5, inline-6, V6, V8, V10, and V12.
- Catalog schema fields for reference, architecture, geometry, stock performance, and source metadata.
- Derived telemetry such as displacement cross-check, bore/stroke ratio, stroke geometry classification, and specific output metrics when the source data provides them.
- Debug HUD visibility for the selected stock engine catalog entry.

What the catalog does NOT do:
- No online fetching, remote catalog loading, local file import, or catalog browser UI.
- No torque-curve generation from displacement, bore, stroke, compression ratio, or cylinder count.
- No change to acceleration, RPM behavior, shifting, drive torque, engine braking, friction, normal force, traction limits, tire forces, or vehicle motion.
- No detailed cam profile, valve timing, intake, exhaust, ECU, turbo sizing, fueling, aftermarket package, or tuning-part modeling.

The schema is intentionally shaped so future work can add more local records, imported catalog data, or user-supplied records without replacing the current engine profile system.
### Engine RPM Telemetry

Engine RPM is now derived as inert telemetry from the selected powertrain profiles, the current R/N/D selector, and driven-wheel rotational speed. It is telemetry only and does not change vehicle behavior.

The estimated engine RPM is computed from the average driven-wheel angular velocity multiplied by the effective drive ratio (selected transmission ratio times final drive ratio). RPM is clamped between idle RPM and redline RPM when the powertrain is connected:

- Neutral reports a disconnected powertrain state and idle RPM.
- Reverse uses the reverse gear ratio and final drive ratio.
- Drive uses one representative forward ratio for telemetry only (the first forward gear ratio for fixed transmissions). No automatic shifting or speed-based gear selection is performed.
- CVT uses a fixed representative ratio (the midpoint of cvtMinRatio and cvtMaxRatio) for telemetry only. No active CVT ratio changes are applied.

The telemetry also reports the powertrain connection state (disconnected / forward_connected / reverse_connected) and the engine RPM state (idle / coupled / redline_clamped / unavailable).

This RPM telemetry does not yet affect acceleration, drive torque, engine braking, shifting, or vehicle motion. No clutch, torque converter, automatic shift scheduling, manual shift controls, differential, or drivetrain physics model exists yet.
