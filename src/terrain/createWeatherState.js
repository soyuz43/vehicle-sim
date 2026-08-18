// src/terrain/createWeatherState.js

/**
 * Weather state for the offroad playground.
 *
 * Manages weather conditions that affect grip through the existing 
 * SURFACE_CONDITION_MODIFIERS system. Weather conditions include:
 * - Clear (dry conditions)
 * - Rain (wet conditions)
 * - Snow (icy conditions)
 * 
 * The weather state applies a condition modifier to the catalog friction
 * in the contact path, using the existing multipliers.
 */

import { SURFACE_CONDITION_MODIFIERS } from './createSurfaceMaterialCatalog.js'

export const WEATHER_CONDITIONS = Object.freeze({
  CLEAR: 'clear',
  RAIN: 'rain',
  SNOW: 'snow'
})

export function createWeatherState(config = {}) {
  const initialCondition = config.initialCondition ?? WEATHER_CONDITIONS.CLEAR
  
  let currentCondition = initialCondition
  
  function setCondition(condition) {
    if (WEATHER_CONDITIONS[condition.toUpperCase()] !== undefined) {
      currentCondition = condition.toLowerCase()
    }
  }
  
  function getCondition() {
    return currentCondition
  }
  
  function getSurfaceConditionModifier() {
    // Map weather conditions to surface condition modifiers
    switch (currentCondition) {
      case WEATHER_CONDITIONS.RAIN:
        return 'WET'
      case WEATHER_CONDITIONS.SNOW:
        return 'ICY'
      default: // CLEAR or unknown
        return 'DRY'
    }
  }
  
  function applyWeatherEffectToMaterial(material) {
    const modifierName = getSurfaceConditionModifier()
    const modifier = SURFACE_CONDITION_MODIFIERS[modifierName]
    
    if (!modifier) return material
    
    return {
      ...material,
      frictionCoefficient: material.frictionCoefficient * modifier.frictionMultiplier,
      dampingCoefficient: material.dampingCoefficient * modifier.dampingMultiplier,
      rollingResistanceCoefficient: material.rollingResistanceCoefficient * modifier.rollingResistanceMultiplier,
    }
  }
  
  return {
    kind: 'weather-state-v1',
    setCondition,
    getCondition,
    getSurfaceConditionModifier,
    applyWeatherEffectToMaterial,
  }
}
