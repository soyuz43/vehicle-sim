// test/linkageCamberSolver.test.js
//
// Unit tests for the 2D front-view linkage camber solver.
//
// The solver replaces the linear camber-gain coefficient for the
// double-wishbone and MacPherson-strut archetypes: camber emerges from the
// actual A-arm / strut pivot geometry instead of a tuned scalar.
//
// The probe slopes the physics targets were derived from:
//   double-wishbone:  -1.64 deg / 100 mm of wheel travel
//   macpherson-strut: +0.52 deg / 100 mm of wheel travel (compression side)
//
// The MacPherson strut has a fixed top mount, so its camber-vs-travel curve is
// mildly nonlinear (the rebound side is steeper than the bump side). The probe
// value is the small-signal / compression-slope, which the tests assert.

import assert from 'node:assert/strict'
import test from 'node:test'

import { solveLinkageCamber } from '../src/vehicle/dynamics/linkageCamberSolver.js'

const DEGREES_PER_RADIAN = 180 / Math.PI

// Camber gain in degrees of camber per 100 mm of wheel travel.
function camberGainDegreesPer100mm(linkageSpec, travelMeters) {
  const staticCamberRadians = solveLinkageCamber({
    wheelTravelMeters: 0,
    linkageSpec,
  })
  const displacedCamberRadians = solveLinkageCamber({
    wheelTravelMeters: travelMeters,
    linkageSpec,
  })
  const deltaDegrees =
    (displacedCamberRadians - staticCamberRadians) * DEGREES_PER_RADIAN

  // travelMeters is in meters; divide by ten to express per 100 mm.
  return deltaDegrees / (Math.abs(travelMeters) * 10)
}

// Realistic front-view pivot geometry that reproduces the probe slopes.
// Points are (xMeters, yMeters): x is the lateral offset from the
// centerline, y is the height above ground at design ride.
const WISHBONE_LINKAGE = {
  kind: 'double-wishbone',
  leftSide: {
    upperArm: {
      innerPivot: { xMeters: 0.18, yMeters: 0.45 },
      outerJoint: { xMeters: 0.65, yMeters: 0.46 },
    },
    lowerArm: {
      innerPivot: { xMeters: 0.21, yMeters: 0.2 },
      outerJoint: { xMeters: 0.7, yMeters: 0.17 },
    },
  },
}

const MACPHERSON_LINKAGE = {
  kind: 'macpherson-strut',
  leftSide: {
    strut: {
      upperMount: { xMeters: 0.71, yMeters: 0.945 },
    },
    lowerArm: {
      innerPivot: { xMeters: 0.05, yMeters: 0.18 },
      outerJoint: { xMeters: 0.7, yMeters: 0.1 },
    },
  },
}

test('double wishbone gains negative camber at +50mm within 5% of -1.64 deg/100mm', () => {
  const gain = camberGainDegreesPer100mm(WISHBONE_LINKAGE, 0.05)

  assert.ok(
    Math.abs(gain + 1.64) <= 1.64 * 0.05,
    'wishbone bump gain must be ~ -1.64 deg/100mm, got ' + gain
  )
})

test('double wishbone gains positive camber at -50mm (antisymmetric)', () => {
  const gain = camberGainDegreesPer100mm(WISHBONE_LINKAGE, -0.05)

  assert.ok(
    Math.abs(gain - 1.64) <= 1.64 * 0.05,
    'wishbone rebound gain must be ~ +1.64 deg/100mm, got ' + gain
  )
})

test('macpherson strut gains positive camber at +50mm within 5% of +0.52 deg/100mm', () => {
  const gain = camberGainDegreesPer100mm(MACPHERSON_LINKAGE, 0.05)

  assert.ok(
    Math.abs(gain - 0.52) <= 0.52 * 0.05,
    'macpherson bump gain must be ~ +0.52 deg/100mm, got ' + gain
  )
})

test('solver output is deterministic for identical inputs', () => {
  const input = { wheelTravelMeters: 0.03, linkageSpec: WISHBONE_LINKAGE }
  const first = solveLinkageCamber(input)
  const second = solveLinkageCamber(input)

  assert.equal(first, second)
})

test('invalid input returns the static camber without throwing', () => {
  assert.equal(
    solveLinkageCamber({ wheelTravelMeters: 0.05, linkageSpec: null }),
    0
  )
  assert.equal(solveLinkageCamber({ wheelTravelMeters: 0.05 }), 0)

  // A wishbone spec missing the upper arm pivots cannot close the linkage.
  const partialWishbone = {
    kind: 'double-wishbone',
    leftSide: {
      lowerArm: {
        innerPivot: { xMeters: 0.21, yMeters: 0.2 },
        outerJoint: { xMeters: 0.7, yMeters: 0.17 },
      },
    },
  }
  assert.equal(
    solveLinkageCamber({ wheelTravelMeters: 0.05, linkageSpec: partialWishbone }),
    0
  )

  // A macpherson spec missing the strut mount cannot close the linkage.
  const partialMacpherson = {
    kind: 'macpherson-strut',
    leftSide: {
      lowerArm: {
        innerPivot: { xMeters: 0.05, yMeters: 0.18 },
        outerJoint: { xMeters: 0.7, yMeters: 0.1 },
      },
    },
  }
  assert.equal(
    solveLinkageCamber({ wheelTravelMeters: 0.05, linkageSpec: partialMacpherson }),
    0
  )

  // A declared static camber is preserved when the linkage cannot be solved.
  assert.equal(
    solveLinkageCamber({
      wheelTravelMeters: 0.05,
      linkageSpec: partialWishbone,
      staticCamberRadians: 0.1,
    }),
    0.1
  )
})

test('solver output is continuous and finite across +/-50mm travel', () => {
  for (const linkageSpec of [WISHBONE_LINKAGE, MACPHERSON_LINKAGE]) {
    let previousCamberRadians = null

    for (let travelMeters = -0.05; travelMeters <= 0.05001; travelMeters += 0.005) {
      const camberRadians = solveLinkageCamber({
        wheelTravelMeters: travelMeters,
        linkageSpec,
      })

      assert.ok(
        Number.isFinite(camberRadians),
        'camber must stay finite at travel ' + travelMeters
      )
      if (previousCamberRadians !== null) {
        assert.ok(
          Math.abs(camberRadians - previousCamberRadians) < 0.02,
          'no branch discontinuity near travel ' + travelMeters
        )
      }
      previousCamberRadians = camberRadians
    }
  }
})

test('compression tilts the left wishbone top inward (negative camber)', () => {
  const staticCamberRadians = solveLinkageCamber({
    wheelTravelMeters: 0,
    linkageSpec: WISHBONE_LINKAGE,
  })
  const bumpCamberRadians = solveLinkageCamber({
    wheelTravelMeters: 0.05,
    linkageSpec: WISHBONE_LINKAGE,
  })

  assert.ok(
    bumpCamberRadians < staticCamberRadians,
    'compression must increase (more negative) camber on the left wishbone'
  )
})

test('an unknown linkage kind returns the static camber', () => {
  const unknown = {
    kind: 'solid-axle',
    leftSide: {
      lowerArm: {
        innerPivot: { xMeters: 0.2, yMeters: 0.2 },
        outerJoint: { xMeters: 0.7, yMeters: 0.15 },
      },
    },
  }

  assert.equal(
    solveLinkageCamber({ wheelTravelMeters: 0.05, linkageSpec: unknown }),
    0
  )
})