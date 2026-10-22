// test/manualShiftInput.test.js
//
// Driver-requested forward gear shifting.
//
// Covers the manual shift seam added to the vehicle controller: the [ and ]
// keys request a forward gear of the selected transmission profile, subject to
// the profile's manual-selection capability, a shift cooldown, and (on a
// transmission that can also auto-shift) a temporary manual override.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { createFlatTerrainContactQuery } from '../src/terrain/createFlatTerrainContactQuery.js'
import {
  profileSupportsManualSelection,
} from '../src/vehicle/powertrain/createPowertrainSelection.js'
import {
  TRANSMISSION_PROFILE_BY_ID,
} from '../src/vehicle/powertrain/createTransmissionProfiles.js'

const DT = 1 / 60

function makeController(transmissionId, specOverrides = {}) {
  return createVehicleController({
    vehicle: createCar(),
    terrainContactQuery: createFlatTerrainContactQuery({ frictionCoefficient: 1.0 }),
    transmissionId,
    spec: specOverrides,
  })
}

test('the controller exposes the shift API and no longer exposes the stale one', () => {
  const controller = makeController('manual-6')
  assert.equal(typeof controller.requestShiftUp, 'function')
  assert.equal(typeof controller.requestShiftDown, 'function')
  assert.equal(typeof controller.setTransmission, 'function')
  assert.equal(
    controller.shiftGearUp,
    undefined,
    'the orphaned R/N/D cycling shift API must be removed'
  )
  assert.equal(controller.shiftGearDown, undefined)
})

test('the main.js key handler calls the shift API that actually exists', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  assert.match(
    source,
    /event\.key === '\['\)\s*vehicleController\.requestShiftDown\(\)/,
    'the [ key must call requestShiftDown()'
  )
  assert.match(
    source,
    /event\.key === '\]'\)\s*vehicleController\.requestShiftUp\(\)/,
    'the ] key must call requestShiftUp()'
  )
  assert.doesNotMatch(
    source,
    /vehicleController\.shift(?:Up|Down)\(\)/,
    'the main.js handler must not call the non-existent shiftUp/shiftDown'
  )
})

test('profileSupportsManualSelection reflects the shipped profile catalog', () => {
  for (const profile of Object.values(TRANSMISSION_PROFILE_BY_ID)) {
    assert.equal(
      profileSupportsManualSelection(profile),
      profile.supportsManualSelection !== false,
      'unexpected capability for ' + profile.transmissionId
    )
  }

  assert.equal(
    profileSupportsManualSelection(TRANSMISSION_PROFILE_BY_ID['cvt']),
    false,
    'the CVT must declare that it does not accept manual selection'
  )
  assert.equal(profileSupportsManualSelection(TRANSMISSION_PROFILE_BY_ID['manual-6']), true)
  assert.equal(profileSupportsManualSelection(TRANSMISSION_PROFILE_BY_ID['automatic-6']), true)
  assert.equal(profileSupportsManualSelection(TRANSMISSION_PROFILE_BY_ID['dct-7']), true)

  // A profile that does not declare the flag is treated as capable so an
  // incomplete profile cannot silently disable manual shifting.
  assert.equal(profileSupportsManualSelection({ supportsManualSelection: false }), false)
  assert.equal(profileSupportsManualSelection({}), true)
  assert.equal(profileSupportsManualSelection(undefined), true)
})

test('a manual transmission profile holds its first gear without any shift input', () => {
  const controller = makeController('manual-6')
  for (let i = 0; i < 300; i += 1) controller.update(DT, { throttle: true })
  const snap = controller.getSnapshot()

  assert.equal(snap.selectedForwardGearIndex, 0)
  assert.equal(snap.shiftMode, 'manual')
  assert.equal(snap.forwardGearLabel, '1')
})

test('a manual transmission profile shifts the forward gear on request', () => {
  const controller = makeController('manual-6', { manualShiftCooldownSeconds: 0 })
  controller.update(DT, { throttle: true })

  controller.requestShiftUp()
  assert.equal(controller.getSnapshot().selectedForwardGearIndex, 1)
  controller.update(DT, { throttle: true })
  assert.equal(controller.getSnapshot().selectedForwardGearIndex, 1)

  controller.requestShiftUp()
  controller.update(DT, { throttle: true })
  assert.equal(controller.getSnapshot().selectedForwardGearIndex, 2)

  controller.requestShiftDown()
  controller.update(DT, { throttle: true })
  assert.equal(controller.getSnapshot().selectedForwardGearIndex, 1)
})

test('a manual gear selection is not overridden by the automatic selector', () => {
  const controller = makeController('manual-6', { manualShiftCooldownSeconds: 0 })
  for (let i = 0; i < 120; i += 1) controller.update(DT, { throttle: true })

  controller.requestShiftUp()
  const seen = new Set()
  for (let i = 0; i < 300; i += 1) {
    controller.update(DT, { throttle: true })
    seen.add(controller.getSnapshot().selectedForwardGearIndex)
  }

  assert.deepEqual(
    [...seen],
    [1],
    'the manual selection must persist instead of being re-selected each step'
  )
})

test('a manual gear selection changes the applied drive ratio', () => {
  const controller = makeController('manual-6', { manualShiftCooldownSeconds: 0 })
  controller.update(DT, { throttle: true })

  const firstGear = controller.getSnapshot()
  assert.equal(firstGear.selectedForwardGearIndex, 0)
  assert.ok(
    Math.abs(firstGear.effectiveDriveRatio - 3.55 * 3.73) < 1e-6,
    'first gear ratio, got ' + firstGear.effectiveDriveRatio
  )

  controller.requestShiftUp()
  controller.update(DT, { throttle: true })

  const secondGear = controller.getSnapshot()
  assert.equal(secondGear.selectedForwardGearIndex, 1)
  assert.ok(
    Math.abs(secondGear.effectiveDriveRatio - 2.16 * 3.73) < 1e-6,
    'the applied drive ratio must follow the selected gear, got ' +
      secondGear.effectiveDriveRatio
  )
  assert.ok(
    secondGear.effectiveDriveRatio < firstGear.effectiveDriveRatio,
    'a higher gear must apply a lower drive ratio'
  )
})

test('shifting up past the top gear is clamped instead of wrapping', () => {
  const controller = makeController('manual-6', { manualShiftCooldownSeconds: 0 })
  for (let i = 0; i < 6; i += 1) {
    controller.requestShiftUp()
    controller.update(DT, { throttle: true })
  }
  assert.equal(
    controller.getSnapshot().selectedForwardGearIndex,
    5,
    'manual-6 has six forward gears, so the top index is 5'
  )

  controller.requestShiftDown()
  controller.update(DT, { throttle: true })
  assert.equal(controller.getSnapshot().selectedForwardGearIndex, 4)
})

test('a CVT ignores manual shift input', () => {
  const controller = makeController('cvt', { manualShiftCooldownSeconds: 0.1 })
  controller.update(DT, { throttle: true })
  const before = controller.getSnapshot()

  controller.requestShiftUp()
  controller.requestShiftDown()
  controller.update(DT, { throttle: true })

  const after = controller.getSnapshot()
  assert.equal(after.selectedForwardGearIndex, before.selectedForwardGearIndex)
  assert.equal(after.forwardGearLabel, 'CVT')
  assert.equal(after.shiftMode, before.shiftMode)
  assert.equal(
    after.manualShiftCooldownRemainingSeconds,
    before.manualShiftCooldownRemainingSeconds,
    'a rejected request must not consume the shift cooldown'
  )
})

test('a manual shift on an automatic profile is not immediately reverted', () => {
  const controller = makeController('automatic-6', { manualShiftCooldownSeconds: 0 })
  for (let i = 0; i < 160; i += 1) controller.update(DT, { throttle: true })

  const automaticIndex = controller.getSnapshot().selectedForwardGearIndex
  assert.ok(automaticIndex > 0, 'expected the automatic profile to have upshifted')

  controller.requestShiftDown()
  const requestedIndex = controller.getSnapshot().selectedForwardGearIndex
  assert.equal(requestedIndex, automaticIndex - 1)

  controller.update(DT, { throttle: true })
  assert.equal(
    controller.getSnapshot().selectedForwardGearIndex,
    requestedIndex,
    'the automatic selector must not overwrite a manual selection on the next step'
  )
  assert.equal(controller.getSnapshot().shiftMode, 'manual')
})

test('a manual override on an automatic profile expires and automatic selection resumes', () => {
  const controller = makeController('automatic-6', {
    manualShiftCooldownSeconds: 0,
    manualShiftOverrideTimeoutSeconds: 0.5,
  })
  controller.update(DT, {})

  for (let i = 0; i < 3; i += 1) {
    controller.requestShiftUp()
    controller.update(DT, {})
  }
  assert.equal(controller.getSnapshot().selectedForwardGearIndex, 3)
  assert.equal(controller.getSnapshot().shiftMode, 'manual')

  const stepsToExpire = Math.ceil(0.5 / DT) + 2
  for (let i = 0; i < stepsToExpire; i += 1) controller.update(DT, {})

  const snap = controller.getSnapshot()
  assert.equal(snap.shiftMode, 'auto')
  assert.equal(
    snap.selectedForwardGearIndex,
    0,
    'automatic selection should have resumed (at standstill it selects first gear)'
  )
})

test('the shift cooldown collapses rapid repeat presses into a single shift', () => {
  const controller = makeController('manual-6', { manualShiftCooldownSeconds: 0.1 })
  controller.update(DT, { throttle: true })

  controller.requestShiftUp()
  assert.equal(controller.getSnapshot().selectedForwardGearIndex, 1)

  controller.requestShiftUp()
  assert.equal(
    controller.getSnapshot().selectedForwardGearIndex,
    1,
    'a second press inside the cooldown window must be ignored'
  )

  const stepsToCooldown = Math.ceil(0.1 / DT) + 1
  for (let i = 0; i < stepsToCooldown; i += 1) controller.update(DT, { throttle: true })

  controller.requestShiftUp()
  assert.equal(controller.getSnapshot().selectedForwardGearIndex, 2)
})

test('manual shift input works when automatic transmission is disabled', () => {
  const controller = makeController('manual-6', {
    automaticTransmissionEnabled: false,
    manualShiftCooldownSeconds: 0,
  })
  for (let i = 0; i < 60; i += 1) controller.update(DT, { throttle: true })
  assert.equal(controller.getSnapshot().selectedForwardGearIndex, 0)

  controller.requestShiftUp()
  controller.update(DT, { throttle: true })
  assert.equal(controller.getSnapshot().selectedForwardGearIndex, 1)
})

test('a shift request does not change the reverse/neutral/drive selector', () => {
  const controller = makeController('manual-6', { manualShiftCooldownSeconds: 0 })
  controller.update(DT, { throttle: true })
  assert.equal(controller.getSnapshot().gear, 'drive')

  controller.requestShiftUp()
  controller.requestShiftDown()
  assert.equal(controller.getSnapshot().gear, 'drive')
})

test('reset clears the manual gear selection', () => {
  const controller = makeController('manual-6', { manualShiftCooldownSeconds: 0 })
  controller.update(DT, { throttle: true })
  controller.requestShiftUp()
  controller.update(DT, { throttle: true })
  assert.equal(controller.getSnapshot().selectedForwardGearIndex, 1)

  controller.reset()
  const snap = controller.getSnapshot()
  assert.equal(snap.selectedForwardGearIndex, 0)
  assert.equal(
    snap.shiftMode,
    'manual',
    'a manual gearbox has no automatic selection, so it stays in manual mode'
  )
})

test('the snapshot reports the engaged forward gear label', () => {
  const controller = makeController('manual-6', { manualShiftCooldownSeconds: 0 })
  controller.update(DT, { throttle: true })
  assert.equal(controller.getSnapshot().forwardGearLabel, '1')

  controller.requestShiftUp()
  controller.update(DT, { throttle: true })
  assert.equal(controller.getSnapshot().forwardGearLabel, '2')
})
