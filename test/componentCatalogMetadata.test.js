import assert from 'node:assert/strict'
import test from 'node:test'
import { VEHICLE_COMPONENT_CATALOG } from '../src/vehicle/config/componentCatalog.js'

test('big brake description does not claim unmodeled unsprung-mass behavior', () => {
  const brakes = VEHICLE_COMPONENT_CATALOG.brakes.components['brakes-big']
  assert.doesNotMatch(brakes.description, /unsprung/i)
  assert.match(brakes.description, /2000 Nm/)
  assert.match(brakes.description, /20000 N/)
  assert.match(brakes.description, /thermal capacity/i)
})

test('slippery aero description matches its disabled-downforce setting', () => {
  const aero = VEHICLE_COMPONENT_CATALOG.aero.components['aero-slippery']
  assert.match(aero.description, /downforce disabled/i)
  assert.doesNotMatch(aero.description, /mild downforce/i)
})

test('disabled stock aero entries omit unused downforce coefficients', () => {
  for (const componentId of ['aero-stock', 'aero-slippery']) {
    const aero = VEHICLE_COMPONENT_CATALOG.aero.components[componentId]
    assert.equal(aero.spec.aeroDownforceEnabled, false)
    assert.equal(Object.hasOwn(aero.spec, 'aeroDownforceCoefficientNewtonsPerMeterSquared'), false)
  }
})
