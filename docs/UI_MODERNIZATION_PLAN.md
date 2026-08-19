# UI Modernization Plan: Wiring Fix Report

## Current Issue: White Screen on npm run dev

**Error**: Uncaught Error: createVehicleController requires a vehicle object

---

## Root Cause Analysis

### Primary Bug (Blocking) - Line 137-141 in src/main.js

`javascript
// CURRENT (BROKEN)
const vehicleController = createVehicleController({
  config: controllerConfig,
  terrainContactQuery,
  terrainSurfaceProfile,
})
`

**Problem**: createVehicleController(config) expects config.vehicle directly, but the call wraps controllerConfig inside a config property. So config.vehicle is undefined (it is actually at config.config.vehicle).

**Evidence**:
- createControllerConfig returns { vehicle, spec, engineId, transmissionId, terrainContactQuery?, startPosition?, startRotation? }
- createVehicleController reads const vehicle = config.vehicle (line 203 in createVehicleController.js)

**Fix**: Pass controllerConfig directly:
`javascript
// FIXED
const vehicleController = createVehicleController(controllerConfig)
`
The controllerConfig already contains terrainContactQuery and terrainSurfaceProfile from the createControllerConfig call.

---

### Secondary Bug - Line 125-127 in src/main.js

`javascript
// CURRENT
const car = createCar({
  config: initialVehicleConfig,
})
`

**Problem**: createCar() has signature export function createCar() - it accepts zero parameters. The config object is completely ignored.

**Impact**:
- Currently benign because the hardcoded visual car dimensions match the default hatchback chassis config
- Will become a bug if user selects a different chassis (SUV, truck, light roadster) via the ConfigPanel - the visual will not match the physics

---

## Other Potential Issues to Check

| # | Area | Issue | Severity | Notes |
|---|------|-------|----------|-------|
| 3 | createCar visual/physics mismatch | Visual car dimensions are hardcoded to hatchback spec; physics uses component catalog | Medium | ConfigPanel allows chassis selection but visual will not update |
| 4 | createWaterVisuals | Referenced at line 112 but not imported (defined locally at line 404) | Low | Works but inconsistent with other imports |
| 5 | terrainSelection.name | Used in ConfigPanel but need to verify it exists on the object | Low | Check createTerrainSelection return value |
| 6 | ConfigPanel onApply | Vehicle config changes would require controller rebuild - not implemented | Medium | Console logs only; no live vehicle config hot-swap |
| 7 | ControlPanel callbacks | vehicleController.setTirePressureKpa?.() etc. - optional chaining means silent failures if methods missing | Low | Methods exist but optional chaining hides bugs |

---

## Verification Checklist for Fix

After applying the primary fix, verify:
- [ ] npm run build passes
- [ ] No white screen on npm run dev
- [ ] Vehicle loads and responds to input (WASD)
- [ ] All 4 UI panels render: Driver HUD, Telemetry, Control Panel, Config Panel
- [ ] Control Panel sliders affect vehicle behavior
- [ ] Config Panel terrain switch works (page reload)
- [ ] No console errors

---

## Root Cause Analysis

This appears to be a refactoring artifact - likely from when createVehicleController accepted a different parameter structure, or from copying code that used a config wrapper pattern. The controllerConfig object returned by createControllerConfig was designed to be passed directly to createVehicleController.

---

## Recommended Fix Order

1. Fix primary bug (Line 137-141): Change createVehicleController({ config: controllerConfig, ... }) to createVehicleController(controllerConfig)
2. Fix secondary bug (Line 125-127): Remove the config argument from createCar() call, or update createCar to accept config for visual customization
3. Test with npm run dev
4. Address ConfigPanel vehicle config hot-swap (future enhancement)
