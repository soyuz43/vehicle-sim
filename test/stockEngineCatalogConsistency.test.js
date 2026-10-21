import assert from 'node:assert/strict'
import test from 'node:test'
import { ENGINE_PROFILE_BY_ID } from '../src/vehicle/powertrain/createEngineProfiles.js'
import { findStockEngineCatalogEntryByLinkedProfileId } from '../src/vehicle/powertrain/createStockEngineCatalog.js'

test('V6 and V8 stock seeds match profile displacement and turbo aspiration', () => {
  for (const profileId of ['v6', 'v8']) {
    const profile = ENGINE_PROFILE_BY_ID[profileId]
    const seed = findStockEngineCatalogEntryByLinkedProfileId(profileId)
    const profileDisplacementLiters = Number(profile.displayName.match(/(\d+(?:\.\d+)?)L/i)?.[1])

    assert.ok(seed, 'expected stock seed for ' + profileId)
    assert.ok(Number.isFinite(profileDisplacementLiters))
    assert.equal(Number(seed.geometry.displacementLiters.toFixed(1)), profileDisplacementLiters)
    assert.equal(seed.geometry.displacementLiters, seed.geometry.displacementCubicCentimeters / 1000)
    assert.equal(profile.aspirationKind, 'turbocharged')
    assert.equal(seed.architecture.aspirationKind, profile.aspirationKind)
    assert.match(seed.reference.displayName, /twin.?turbo|biturbo/i)
  }
})
