// src/simulation/simulationConstants.js

export const SIMULATION_UNITS = Object.freeze({
  worldUnit: 'meter',
  worldUnitSymbol: 'm',
  metersPerWorldUnit: 1,
  worldUnitsPerMeter: 1,
})

export const SIMULATION_AXES = Object.freeze({
  right: Object.freeze({ x: 1, y: 0, z: 0 }),
  up: Object.freeze({ x: 0, y: 1, z: 0 }),
  forward: Object.freeze({ x: 0, y: 0, z: 1 }),
})

export const EARTH_GRAVITY = Object.freeze({
  standardMetersPerSecondSquared: 9.80665,
  worldUnitsPerSecondSquared:
    9.80665 * SIMULATION_UNITS.worldUnitsPerMeter,
  directionWorld: Object.freeze({ x: 0, y: -1, z: 0 }),
})

export const GRAVITY_Y_WORLD_UNITS_PER_SECOND_SQUARED =
  -EARTH_GRAVITY.worldUnitsPerSecondSquared