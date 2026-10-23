// test/axleCoupling.test.js

// Axle coupling v1 (Session A1).
//
// An axle can be modelled as a rigid beam that carries both of its wheels on
// one shared leaf spring ('rigidAxle') or as two wheels that each resolve
// their own vertical position against the terrain ('independent').
//
// Two harnesses are used on purpose. The simulation already had a
// chassis-level terrain coupling before this feature existed: the chassis
// terrain support state (src/vehicle/dynamics/chassisTerrainSupportState.js)
// sets the chassis height to the MEAN of the terrain under the four wheels.
//   - The "isolated" harness raises the terrain for ONE wheel inside the
//     suspension contact query only, so the chassis support state keeps
//     seeing flat ground. It measures the axle constraint on its own.
//   - The "pipeline" harness raises the real terrain under one wheel, so the
//     chassis support state rises by the mean as well. It measures how the
//     axle constraint composes with that pre-existing behaviour.
//
// Sign conventions used below:
//   - +X is the car's LEFT side and +Z is forward (src/car/createCar.js).
//   - A positive beam roll lifts the +X (left) side, matching the vertical
//     dynamics body attitude convention.

import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'

import { createCar } from '../src/car/createCar.js'
import { createVehicleController } from '../src/vehicle/createVehicleController.js'
import { createHeightfieldTerrainContactQuery } from '../src/terrain/createHeightfieldTerrainContactQuery.js'
import {
    applyAxleCouplingConstraints,
    createAxleCouplingState,
    getAxleCouplingVerticalOffsetMeters,
} from '../src/vehicle/dynamics/axleCouplingState.js'
import { DEFAULT_VEHICLE_SPEC } from '../src/vehicle/defaultVehicleSpec.js'

const DT_SECONDS = 1 / 60
const STEP_HEIGHT_METERS = 0.08
const SPEC = DEFAULT_VEHICLE_SPEC
const STATIC_COMPRESSION_METERS =
    SPEC.suspensionTravelMeters * SPEC.suspensionTargetStaticCompressionRatio01
const WHEEL_RADIUS_METERS = 0.48
const FRONT_LEFT_WHEEL_XZ = Object.freeze({ x: 1.25, z: 1.45 })
const FRONT_RIGHT_WHEEL_XZ = Object.freeze({ x: -1.25, z: 1.45 })
const REAR_LEFT_WHEEL_XZ = Object.freeze({ x: 1.25, z: -1.45 })
const REAR_RIGHT_WHEEL_XZ = Object.freeze({ x: -1.25, z: -1.45 })

function smoothstep01(t) {
    const clamped = Math.min(1, Math.max(0, t))
    return clamped * clamped * (3 - 2 * clamped)
}

// A raised plateau with smooth shoulders. The plateau is wide enough that the
// surface normal under the wheel is exactly vertical, so the measurement is
// not polluted by the step's edge slope.
function plateau01(value, low, high, margin) {
    if (value <= low || value >= high) return 0
    if (value < low + margin) return smoothstep01((value - low) / margin)
    if (value > high - margin) return smoothstep01((high - value) / margin)
    return 1
}

function createFlatTerrainContactQuery() {
    return createHeightfieldTerrainContactQuery({
        surfaceProfile: {
            profileName: 'axle-coupling-flat',
            surfaceKind: 'test-asphalt',
            frictionCoefficient: 1,
            querySurfaceAtWorldPosition(worldXMeters, worldZMeters, target = {}) {
                target.isWithinBounds = true
                target.isInsideTerrainBounds = true
                target.profileName = 'axle-coupling-flat'
                target.surfaceKind = 'test-asphalt'
                target.frictionCoefficient = 1
                target.terrainHeightMeters = 0
                target.groundHeightMeters = 0
                target.normalWorld = target.normalWorld ?? {}
                target.normalWorld.x = 0
                target.normalWorld.y = 1
                target.normalWorld.z = 0
                target.slopeRadians = 0
                target.slopeDegrees = 0
                target.status = 'surface-available'
                return target
            },
        },
    })
}

// Harness "pipeline": a real 80 mm plateau under one wheel, visible to every
// terrain query including the chassis terrain support state.
function createSteppedTerrainContactQuery({
    stepHeightMeters = STEP_HEIGHT_METERS,
    targetWheelXZ = FRONT_LEFT_WHEEL_XZ,
} = {}) {
    const heightAt = (worldXMeters, worldZMeters) =>
        stepHeightMeters *
        plateau01(worldXMeters, targetWheelXZ.x - 0.35, targetWheelXZ.x + 0.35, 0.2) *
        plateau01(worldZMeters, targetWheelXZ.z - 0.35, targetWheelXZ.z + 0.35, 0.2)

    return createHeightfieldTerrainContactQuery({
        surfaceProfile: {
            profileName: 'axle-coupling-one-wheel-step',
            surfaceKind: 'test-asphalt',
            frictionCoefficient: 1,
            querySurfaceAtWorldPosition(worldXMeters, worldZMeters, target = {}) {
                const sampleSpacingMeters = 0.02
                const slopeX =
                    (heightAt(worldXMeters + sampleSpacingMeters, worldZMeters) -
                        heightAt(worldXMeters - sampleSpacingMeters, worldZMeters)) /
                    (2 * sampleSpacingMeters)
                const slopeZ =
                    (heightAt(worldXMeters, worldZMeters + sampleSpacingMeters) -
                        heightAt(worldXMeters, worldZMeters - sampleSpacingMeters)) /
                    (2 * sampleSpacingMeters)
                const normal = new THREE.Vector3(-slopeX, 1, -slopeZ).normalize()

                target.isWithinBounds = true
                target.isInsideTerrainBounds = true
                target.profileName = 'axle-coupling-one-wheel-step'
                target.surfaceKind = 'test-asphalt'
                target.frictionCoefficient = 1
                target.terrainHeightMeters = heightAt(worldXMeters, worldZMeters)
                target.groundHeightMeters = heightAt(worldXMeters, worldZMeters)
                target.normalWorld = target.normalWorld ?? {}
                target.normalWorld.x = normal.x
                target.normalWorld.y = normal.y
                target.normalWorld.z = normal.z
                target.slopeRadians = Math.atan(Math.hypot(slopeX, slopeZ))
                target.slopeDegrees = (target.slopeRadians * 180) / Math.PI
                target.status = 'surface-available'
                return target
            },
        },
    })
}

// Harness "isolated": the step exists only in the suspension contact query,
// so the chassis terrain support state keeps seeing flat ground.
//
// The "remove" mode reports no terrain contact for the target wheel, which is
// the contact-loss case: the wheel has no ground under it at all.
function createIsolatedStepContactQuery({
    stepHeightMeters = STEP_HEIGHT_METERS,
    targetWheelXZ = FRONT_LEFT_WHEEL_XZ,
    mode = 'raise',
} = {}) {
    const baseQuery = createFlatTerrainContactQuery()
    const matchToleranceMeters = 0.1

    return {
        kind: 'axle-coupling-isolated-step-query',
        queryAtWorldXZ: (worldXMeters, worldZMeters, target) =>
            baseQuery.queryAtWorldXZ(worldXMeters, worldZMeters, target),
        querySuspensionContact(input, target) {
            baseQuery.querySuspensionContact(input, target)

            const isTargetWheel =
                Math.abs(input.rayOriginWorld.x - targetWheelXZ.x) <
                    matchToleranceMeters &&
                Math.abs(input.rayOriginWorld.z - targetWheelXZ.z) <
                    matchToleranceMeters

            if (!isTargetWheel) return target

            if (mode === 'remove') {
                target.hasContact = false
                target.hasTerrainIntersection = false
                target.status = 'no-intersection'
                target.wheelCenterDistanceAlongSuspensionMeters = 0
                return target
            }

            if (target.hasContact !== true) return target

            target.rayDistanceMeters += stepHeightMeters
            target.terrainRayDistanceMeters = target.rayDistanceMeters
            target.wheelCenterDistanceAlongSuspensionMeters -= stepHeightMeters
            target.contactPointWorld.y += stepHeightMeters
            target.terrainHeightMeters += stepHeightMeters
            return target
        },
    }
}

// Reports no ground contact for every wheel, so the whole vehicle is in the
// air.
function createFullyAirborneContactQuery() {
    const baseQuery = createFlatTerrainContactQuery()

    return {
        kind: 'axle-coupling-fully-airborne-query',
        queryAtWorldXZ: (worldXMeters, worldZMeters, target) =>
            baseQuery.queryAtWorldXZ(worldXMeters, worldZMeters, target),
        querySuspensionContact(input, target) {
            baseQuery.querySuspensionContact(input, target)
            target.hasContact = false
            target.hasTerrainIntersection = false
            target.status = 'no-intersection'
            target.wheelCenterDistanceAlongSuspensionMeters = 0
            return target
        },
    }
}

function createController({ spec = {}, terrainContactQuery } = {}) {
    return createVehicleController({
        vehicle: createCar(),
        startPosition: new THREE.Vector3(0, 0, 0),
        terrainContactQuery: terrainContactQuery ?? createFlatTerrainContactQuery(),
        spec,
    })
}

function runStationaryScenario({
    spec = {},
    terrainContactQuery,
    steps = 300,
} = {}) {
    const controller = createController({ spec, terrainContactQuery })
    const samples = []

    for (let step = 0; step < steps; step += 1) {
        controller.update(DT_SECONDS, {})
        const snapshot = controller.getSnapshot()

        samples.push({
            step,
            chassisHeightMeters: snapshot.position.y,
            heaveMeters: snapshot.verticalDynamics.heaveMeters,
            rollRadians: snapshot.verticalDynamics.rollRadians,
            pitchRadians: snapshot.verticalDynamics.pitchRadians,
            terrainRollMomentNewtonMeters:
                snapshot.verticalDynamics.terrainRollMomentNewtonMeters,
            terrainPitchMomentNewtonMeters:
                snapshot.verticalDynamics.terrainPitchMomentNewtonMeters,
            wheels: snapshot.wheelStates.map((wheelState) => ({
                id: wheelState.id,
                axle: wheelState.axle,
                side: wheelState.side,
                isGrounded: wheelState.isGrounded,
                suspensionCompressionMeters: wheelState.suspensionCompressionMeters,
                suspensionCurrentLengthMeters:
                    wheelState.suspensionCurrentLengthMeters,
                suspensionRawLengthMeters: wheelState.suspensionRawLengthMeters,
                baseNormalForceNewtons: wheelState.baseNormalForceNewtons,
                normalForceNewtons: wheelState.normalForceNewtons,
                effectiveTireRollingRadiusMeters:
                    wheelState.effectiveTireRollingRadiusMeters,
                wheelCenterLocalY: wheelState.wheelCenterLocalPosition.y,
                wheelCenterWorldY: wheelState.wheelCenterWorldPosition.y,
                contactPointWorldY: wheelState.contactPointWorldPosition.y,
                contactStatus: wheelState.suspensionContactStatus,
            })),
            axleCoupling: snapshot.axleCoupling,
        })
    }

    return { controller, samples }
}

function wheelSample(sample, wheelId) {
    return sample.wheels.find((wheelState) => wheelState.id === wheelId)
}

function tailAverage(samples, select, count = 60) {
    const tail = samples.slice(-count)
    return (
        tail.reduce((total, sample) => total + select(sample), 0) / tail.length
    )
}

function tailWheelAverage(samples, wheelId, field, count = 60) {
    return tailAverage(
        samples,
        (sample) => wheelSample(sample, wheelId)[field],
        count
    )
}

// The static reference is measured from a flat run rather than taken from the
// travel/ratio product: the tire pressure model shifts the effective rolling
// radius slightly, so the analytic product is not the settled compression.
function measureFlatBaseline() {
    const { samples } = runStationaryScenario({
        terrainContactQuery: createFlatTerrainContactQuery(),
    })
    const sample = samples[samples.length - 1]
    const compressionByWheelId = new Map()
    const radiusByWheelId = new Map()

    for (const wheelState of sample.wheels) {
        compressionByWheelId.set(
            wheelState.id,
            wheelState.suspensionCompressionMeters
        )
        radiusByWheelId.set(
            wheelState.id,
            wheelState.effectiveTireRollingRadiusMeters
        )
    }

    return { compressionByWheelId, radiusByWheelId }
}

const FLAT_BASELINE = measureFlatBaseline()

function compressionDeviationMillimeters(samples, wheelId) {
    const baseline = FLAT_BASELINE.compressionByWheelId.get(wheelId) ?? 0
    return (
        (tailWheelAverage(samples, wheelId, 'suspensionCompressionMeters') -
            baseline) *
        1000
    )
}

function axleNormalForceTotalNewtons(samples, axle) {
    return tailAverage(samples, (sample) =>
        sample.wheels
            .filter((wheelState) => wheelState.axle === axle)
            .reduce(
                (total, wheelState) => total + wheelState.normalForceNewtons,
                0
            )
    )
}

function axleBaseNormalForceTotalNewtons(samples, axle) {
    return tailAverage(samples, (sample) =>
        sample.wheels
            .filter((wheelState) => wheelState.axle === axle)
            .reduce(
                (total, wheelState) => total + wheelState.baseNormalForceNewtons,
                0
            )
    )
}

// A canonical text trace of a driving run. It is used to compare two runs
// field by field without depending on object identity.
function buildDrivingTrace(spec) {
    const controller = createController({ spec })
    const lines = []

    for (let step = 0; step < 5400; step += 1) {
        const input = step < 3600 ? { throttle: true } : { brake: true }
        const snapshot = controller.update(DT_SECONDS, input)
        const vd = snapshot.verticalDynamics

        const wheelFields = []
        for (const wheelState of snapshot.wheelStates) {
            wheelFields.push(
                wheelState.id,
                wheelState.isGrounded ? 1 : 0,
                wheelState.suspensionCurrentLengthMeters.toFixed(9),
                wheelState.suspensionRawLengthMeters.toFixed(9),
                wheelState.suspensionCompressionMeters.toFixed(9),
                wheelState.baseNormalForceNewtons.toFixed(9),
                wheelState.normalForceNewtons.toFixed(9),
                wheelState.wheelCenterLocalPosition.x.toFixed(9),
                wheelState.wheelCenterLocalPosition.y.toFixed(9),
                wheelState.wheelCenterLocalPosition.z.toFixed(9),
                wheelState.wheelCenterWorldPosition.x.toFixed(9),
                wheelState.wheelCenterWorldPosition.y.toFixed(9),
                wheelState.wheelCenterWorldPosition.z.toFixed(9),
                wheelState.contactPointWorldPosition.y.toFixed(9),
                wheelState.distanceToGroundMeters.toFixed(9),
                wheelState.tirePenetrationMeters.toFixed(9),
                wheelState.suspensionContactStatus
            )
        }

        lines.push(
            [
                step,
                snapshot.position.x.toFixed(9),
                snapshot.position.y.toFixed(9),
                snapshot.position.z.toFixed(9),
                snapshot.yawRadians.toFixed(9),
                vd.heaveMeters.toFixed(9),
                vd.rollRadians.toFixed(9),
                vd.pitchRadians.toFixed(9),
                vd.terrainRollMomentNewtonMeters.toFixed(9),
                vd.terrainPitchMomentNewtonMeters.toFixed(9),
                ...wheelFields,
            ].join('|')
        )
    }

    return lines.join('\n')
}

test('coupled axle roll and wheel offsets use spec track arms', () => {
    const scenarios = [
        {
            label: 'stock hatchback',
            trackWidthMeters: 2.5,
            spec: { ...SPEC, rearAxleCoupling: 'rigidAxle' },
        },
        {
            label: 'heavy truck',
            trackWidthMeters: 2.7,
            spec: {
                ...SPEC,
                wheelbaseMeters: 4.2,
                frontTrackWidthMeters: 2.7,
                rearTrackWidthMeters: 2.7,
                rearAxleCoupling: 'rigidAxle',
            },
        },
    ]

    for (const scenario of scenarios) {
        const leftWheelState = {
            axle: 'rear',
            side: 'left',
            isGrounded: true,
            suspensionMountLocalPosition: { x: 1.25, y: 0.8, z: -1.45 },
            suspensionMountWorld: { y: 1 },
            suspensionAxisDownWorld: { y: -1 },
            suspensionCurrentLengthMeters: 0.5,
        }
        const rightWheelState = {
            axle: 'rear',
            side: 'right',
            isGrounded: true,
            suspensionMountLocalPosition: { x: -1.25, y: 0.8, z: -1.45 },
            suspensionMountWorld: { y: 1 },
            suspensionAxisDownWorld: { y: -1 },
            suspensionCurrentLengthMeters: 0.58,
        }
        const axleCouplingState = createAxleCouplingState()
        const wheelHeightDifferenceMeters =
            leftWheelState.suspensionMountWorld.y -
            leftWheelState.suspensionCurrentLengthMeters -
            rightWheelState.suspensionMountWorld.y +
            rightWheelState.suspensionCurrentLengthMeters

        applyAxleCouplingConstraints({
            axleCouplingState,
            wheelStates: [leftWheelState, rightWheelState],
            spec: scenario.spec,
            suspensionLimits: {
                front: { minimumLengthMeters: 0.1, maximumLengthMeters: 1 },
                rear: { minimumLengthMeters: 0.1, maximumLengthMeters: 1 },
            },
        })

        const axleRecord = axleCouplingState.axles.rear
        const expectedRollRadians =
            wheelHeightDifferenceMeters / scenario.trackWidthMeters

        assert.equal(axleRecord.isCoupled, true, scenario.label)
        assert.equal(
            axleRecord.beamRollRadians,
            expectedRollRadians,
            scenario.label + ': spec-track roll must match exactly'
        )
        assert.equal(
            axleRecord.leftWheelLateralArmMeters,
            scenario.trackWidthMeters / 2,
            scenario.label + ': left arm must be +track/2'
        )
        assert.equal(
            axleRecord.rightWheelLateralArmMeters,
            -scenario.trackWidthMeters / 2,
            scenario.label + ': right arm must be -track/2'
        )
        assert.equal(
            getAxleCouplingVerticalOffsetMeters(
                axleCouplingState,
                leftWheelState
            ),
            axleRecord.beamRollRadians * (scenario.trackWidthMeters / 2)
        )
        assert.equal(
            getAxleCouplingVerticalOffsetMeters(
                axleCouplingState,
                rightWheelState
            ),
            axleRecord.beamRollRadians * (-scenario.trackWidthMeters / 2)
        )
        if (scenario.label === 'heavy truck') {
            assert.ok(
                Math.abs(
                    axleRecord.beamRollRadians -
                    wheelHeightDifferenceMeters / 2.5
                ) > 1e-3,
                'truck roll must not use the fixed mesh track'
            )
        }
    }
})

test('invalid axle-side metadata does not activate a rigid beam', () => {
    const axleCouplingState = createAxleCouplingState()
    const wheelStates = [
        { axle: 'rear', side: 'center', isGrounded: true },
        { axle: 'rear', side: 'right', isGrounded: true },
    ]

    applyAxleCouplingConstraints({
        axleCouplingState,
        wheelStates,
        spec: { rearAxleCoupling: 'rigidAxle', rearTrackWidthMeters: 2.7 },
    })

    assert.equal(axleCouplingState.axles.rear.isCoupled, false)
    assert.equal(axleCouplingState.axles.rear.beamRollRadians, 0)
    assert.equal(
        getAxleCouplingVerticalOffsetMeters(
            axleCouplingState,
            wheelStates[1]
        ),
        0
    )
})

test('the shipped spec keeps both axles independent', () => {
    assert.equal(SPEC.frontAxleCoupling, 'independent')
    assert.equal(SPEC.rearAxleCoupling, 'independent')
})

test('the independent model leaves the far wheel untouched by a one-sided step', () => {
    const { samples } = runStationaryScenario({
        terrainContactQuery: createIsolatedStepContactQuery(),
    })

    assert.ok(
        Math.abs(compressionDeviationMillimeters(samples, 'front-left') - 80) < 1,
        'the near wheel must absorb the whole 80 mm step'
    )
    assert.ok(
        Math.abs(compressionDeviationMillimeters(samples, 'front-right')) < 0.01,
        'the far wheel must not gain any compression'
    )
})

test('a coupled axle shares the one-sided step with the far wheel', () => {
    const { samples } = runStationaryScenario({
        spec: { frontAxleCoupling: 'rigidAxle' },
        terrainContactQuery: createIsolatedStepContactQuery(),
    })

    const nearDeviation = compressionDeviationMillimeters(samples, 'front-left')
    const farDeviation = compressionDeviationMillimeters(samples, 'front-right')

    assert.ok(
        Math.abs(nearDeviation - 40) < 1,
        `the near wheel must take half of the step; got ${nearDeviation.toFixed(3)} mm`
    )
    assert.ok(
        Math.abs(farDeviation - 40) < 1,
        `the far wheel must take the other half; got ${farDeviation.toFixed(3)} mm`
    )
    assert.ok(
        Math.abs(
            tailWheelAverage(samples, 'front-left', 'suspensionCompressionMeters') -
                tailWheelAverage(samples, 'front-right', 'suspensionCompressionMeters')
        ) < 1e-9,
        'both corners of a coupled axle must report the same compression'
    )
})

test('a coupled axle shares the one-sided step in the full pipeline too', () => {
    const { samples } = runStationaryScenario({
        spec: { frontAxleCoupling: 'rigidAxle' },
        terrainContactQuery: createSteppedTerrainContactQuery(),
    })

    const nearDeviation = compressionDeviationMillimeters(samples, 'front-left')
    const farDeviation = compressionDeviationMillimeters(samples, 'front-right')

    // The chassis terrain support state raises the body by the mean of the
    // terrain under the four wheels, so it consumes 20 mm of the 80 mm step
    // before the axle constraint sees the remaining 60 mm.
    assert.ok(
        Math.abs(nearDeviation - 20) < 1,
        `the near wheel must take half of the remaining step; got ${nearDeviation.toFixed(3)} mm`
    )
    assert.ok(
        Math.abs(farDeviation - 20) < 1,
        `the far wheel must take the other half; got ${farDeviation.toFixed(3)} mm`
    )
})

test('a coupled axle contributes no terrain roll moment to the vertical dynamics', () => {
    const independent = runStationaryScenario({
        terrainContactQuery: createIsolatedStepContactQuery(),
    })
    const coupled = runStationaryScenario({
        spec: { frontAxleCoupling: 'rigidAxle' },
        terrainContactQuery: createIsolatedStepContactQuery(),
    })

    const independentRollMoment = tailAverage(
        independent.samples,
        (sample) => sample.terrainRollMomentNewtonMeters
    )
    const coupledRollMoment = tailAverage(
        coupled.samples,
        (sample) => sample.terrainRollMomentNewtonMeters
    )

    assert.ok(
        Math.abs(independentRollMoment) > 1000,
        'the independent axle must produce a real terrain roll moment'
    )
    assert.ok(
        Math.abs(coupledRollMoment) < 1,
        `a coupled axle must cancel the terrain roll moment; got ${coupledRollMoment.toFixed(6)} N*m`
    )
})

test('a coupled axle preserves the axle total normal force', () => {
    const independent = runStationaryScenario({
        terrainContactQuery: createIsolatedStepContactQuery(),
    })
    const coupled = runStationaryScenario({
        spec: { frontAxleCoupling: 'rigidAxle' },
        terrainContactQuery: createIsolatedStepContactQuery(),
    })

    const independentBaseTotal = axleBaseNormalForceTotalNewtons(
        independent.samples,
        'front'
    )
    const coupledBaseTotal = axleBaseNormalForceTotalNewtons(coupled.samples, 'front')

    assert.ok(
        Math.abs(independentBaseTotal - coupledBaseTotal) < 1e-6,
        'the shared compression is the mean of the two, so the axle base load must be identical'
    )

    const independentTotal = axleNormalForceTotalNewtons(independent.samples, 'front')
    const coupledTotal = axleNormalForceTotalNewtons(coupled.samples, 'front')

    assert.ok(
        Math.abs(independentTotal - coupledTotal) < 10,
        `the axle total normal force must be preserved; independent ${independentTotal.toFixed(3)} N vs coupled ${coupledTotal.toFixed(3)} N`
    )

    const independentNear = tailWheelAverage(
        independent.samples,
        'front-left',
        'normalForceNewtons'
    )
    const independentFar = tailWheelAverage(
        independent.samples,
        'front-right',
        'normalForceNewtons'
    )
    const coupledNear = tailWheelAverage(coupled.samples, 'front-left', 'normalForceNewtons')
    const coupledFar = tailWheelAverage(coupled.samples, 'front-right', 'normalForceNewtons')

    assert.ok(
        independentNear > independentFar + 500,
        'the independent axle must load the near wheel much harder'
    )
    assert.ok(
        Math.abs(coupledNear - coupledFar) < 10,
        'the coupled axle must split the axle load evenly between its corners'
    )
})

test('the coupling mode is applied per axle', () => {
    const frontCoupled = runStationaryScenario({
        spec: { frontAxleCoupling: 'rigidAxle', rearAxleCoupling: 'independent' },
        terrainContactQuery: createIsolatedStepContactQuery(),
    })
    const rearCoupled = runStationaryScenario({
        spec: { frontAxleCoupling: 'independent', rearAxleCoupling: 'rigidAxle' },
        terrainContactQuery: createIsolatedStepContactQuery({
            targetWheelXZ: REAR_LEFT_WHEEL_XZ,
        }),
    })

    const frontCoupledFront = compressionDeviationMillimeters(
        frontCoupled.samples,
        'front-left'
    )
    const frontCoupledRear = compressionDeviationMillimeters(
        frontCoupled.samples,
        'rear-left'
    )
    assert.ok(Math.abs(frontCoupledFront - 40) < 1, 'the front axle must be coupled')
    assert.ok(
        Math.abs(frontCoupledRear) < 0.01,
        'the rear axle must stay independent'
    )

    const rearCoupledRear = compressionDeviationMillimeters(
        rearCoupled.samples,
        'rear-left'
    )
    const rearCoupledFront = compressionDeviationMillimeters(
        rearCoupled.samples,
        'front-left'
    )
    assert.ok(Math.abs(rearCoupledRear - 40) < 1, 'the rear axle must be coupled')
    assert.ok(
        Math.abs(rearCoupledFront) < 0.01,
        'the front axle must stay independent'
    )
})

test('a coupled wheel still resolves to its own terrain contact', () => {
    const { samples } = runStationaryScenario({
        spec: { frontAxleCoupling: 'rigidAxle' },
        terrainContactQuery: createIsolatedStepContactQuery(),
    })
    const sample = samples[samples.length - 1]

    const near = wheelSample(sample, 'front-left')
    const far = wheelSample(sample, 'front-right')

    // The near wheel sits on the raised step, the far wheel on the flat road.
    // The distance from the wheel centre to its contact point is the
    // effective rolling radius, up to the heightfield query's own intersection
    // tolerance (1e-5 m).
    const contactToleranceMeters = 2e-5
    assert.ok(
        Math.abs(
            near.wheelCenterWorldY -
                (near.contactPointWorldY + near.effectiveTireRollingRadiusMeters)
        ) < contactToleranceMeters,
        'the near wheel centre must sit one wheel radius above its own contact point'
    )
    assert.ok(
        Math.abs(
            far.wheelCenterWorldY -
                (far.contactPointWorldY + far.effectiveTireRollingRadiusMeters)
        ) < contactToleranceMeters,
        'the far wheel centre must sit one wheel radius above its own contact point'
    )
    assert.ok(
        near.wheelCenterLocalY > far.wheelCenterLocalY,
        'the near wheel must be mounted higher than the far wheel'
    )
})

test('a coupled axle holds a wheel that lost its ground contact', () => {
    const independent = runStationaryScenario({
        terrainContactQuery: createIsolatedStepContactQuery({ mode: 'remove' }),
    })
    const coupled = runStationaryScenario({
        spec: { frontAxleCoupling: 'rigidAxle' },
        terrainContactQuery: createIsolatedStepContactQuery({ mode: 'remove' }),
    })

    const independentSample = independent.samples[independent.samples.length - 1]
    const coupledSample = coupled.samples[coupled.samples.length - 1]

    const independentAirborne = wheelSample(independentSample, 'front-left')
    const coupledAirborne = wheelSample(coupledSample, 'front-left')
    const coupledGrounded = wheelSample(coupledSample, 'front-right')

    assert.equal(independentAirborne.isGrounded, false)
    assert.equal(coupledAirborne.isGrounded, false)
    assert.ok(
        coupledGrounded.normalForceNewtons > 0,
        'the grounded wheel of a rigid axle must still carry load'
    )
    assert.ok(
        coupledAirborne.wheelCenterLocalY > independentAirborne.wheelCenterLocalY + 0.05,
        'the beam must hold the airborne wheel near the grounded wheel instead of letting it droop'
    )
    assert.ok(
        Math.abs(coupledAirborne.wheelCenterLocalY - coupledGrounded.wheelCenterLocalY) < 1e-6,
        'a level beam must hold the airborne wheel at the grounded wheel height'
    )
})

test('a coupled axle with both wheels airborne enforces no constraint', () => {
    const { samples } = runStationaryScenario({
        spec: { frontAxleCoupling: 'rigidAxle' },
        terrainContactQuery: createFullyAirborneContactQuery(),
    })
    const sample = samples[samples.length - 1]

    for (const wheelId of ['front-left', 'front-right']) {
        const wheelState = wheelSample(sample, wheelId)
        assert.equal(wheelState.isGrounded, false)
        assert.equal(wheelState.suspensionCompressionMeters, 0)
        assert.equal(wheelState.normalForceNewtons, 0)
    }

    assert.equal(sample.axleCoupling.axles.front.supportedWheelCount, 0)
    assert.equal(sample.axleCoupling.axles.front.sharedSuspensionLengthMeters, null)
    assert.equal(sample.axleCoupling.axles.front.beamRollRadians, 0)
    assert.equal(sample.heaveMeters, 0)
})

test('the independent mode is unchanged by the axle coupling feature', () => {
    const defaultTrace = buildDrivingTrace({})
    const explicitTrace = buildDrivingTrace({
        frontAxleCoupling: 'independent',
        rearAxleCoupling: 'independent',
    })

    assert.equal(
        explicitTrace,
        defaultTrace,
        'the explicit independent mode must reproduce the default trace exactly'
    )
    assert.equal(defaultTrace.split('\n').length, 5400)
})

test('the independent mode reports no coupled axle and keeps every wheel on its own path', () => {
    const { samples } = runStationaryScenario({
        spec: { frontAxleCoupling: 'independent', rearAxleCoupling: 'independent' },
        terrainContactQuery: createIsolatedStepContactQuery(),
    })
    const sample = samples[samples.length - 1]

    for (const axle of ['front', 'rear']) {
        assert.equal(sample.axleCoupling.axles[axle].isCoupled, false)
        assert.equal(sample.axleCoupling.axles[axle].beamRollRadians, 0)
        assert.equal(sample.axleCoupling.axles[axle].sharedSuspensionLengthMeters, null)
    }

    for (const wheelState of sample.wheels) {
        if (!wheelState.isGrounded) continue
        assert.ok(
            Math.abs(
                wheelState.suspensionCurrentLengthMeters -
                    wheelState.suspensionRawLengthMeters
            ) < 1e-9,
            'an independent wheel must keep its own raycast length'
        )
    }
})

test('the coupled scenario is deterministic across identical runs', () => {
    const spec = { frontAxleCoupling: 'rigidAxle' }
    const first = buildDrivingTrace(spec)
    const second = buildDrivingTrace(spec)

    assert.equal(second, first, 'two identical coupled runs must match exactly')
})
