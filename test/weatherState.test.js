// test/weatherState.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWeatherState, WEATHER_CONDITIONS } from '../src/terrain/createWeatherState.js'
import { DEFAULT_SURFACE_MATERIAL_CATALOG, getSurfaceMaterial } from '../src/terrain/createSurfaceMaterialCatalog.js'

test('weather state initializes with clear condition', () => {
  const weather = createWeatherState()
  assert.equal(weather.getCondition(), WEATHER_CONDITIONS.CLEAR)
})

test('weather state can change conditions', () => {
  const weather = createWeatherState()
  weather.setCondition(WEATHER_CONDITIONS.RAIN)
  assert.equal(weather.getCondition(), WEATHER_CONDITIONS.RAIN)
})

test('weather state maps conditions to surface modifiers correctly', () => {
  const weather = createWeatherState()
  
  weather.setCondition(WEATHER_CONDITIONS.CLEAR)
  assert.equal(weather.getSurfaceConditionModifier(), 'DRY')
  
  weather.setCondition(WEATHER_CONDITIONS.RAIN)
  assert.equal(weather.getSurfaceConditionModifier(), 'WET')
  
  weather.setCondition(WEATHER_CONDITIONS.SNOW)
  assert.equal(weather.getSurfaceConditionModifier(), 'ICY')
})

test('weather state applies effects to materials correctly', () => {
  const weather = createWeatherState()
  const asphalt = getSurfaceMaterial(DEFAULT_SURFACE_MATERIAL_CATALOG, 'asphalt')
  
  // Test clear weather (no change)
  weather.setCondition(WEATHER_CONDITIONS.CLEAR)
  const dryAsphalt = weather.applyWeatherEffectToMaterial(asphalt)
  assert.equal(dryAsphalt.frictionCoefficient, asphalt.frictionCoefficient)
  
  // Test rainy weather (reduced friction)
  weather.setCondition(WEATHER_CONDITIONS.RAIN)
  const wetAsphalt = weather.applyWeatherEffectToMaterial(asphalt)
  assert.ok(wetAsphalt.frictionCoefficient < asphalt.frictionCoefficient)
  assert.ok(Math.abs(wetAsphalt.frictionCoefficient - asphalt.frictionCoefficient * 0.6) < 1e-9)
})
