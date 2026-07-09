// src/vehicle/createVehicleController.js

import * as THREE from 'three'
import { DEFAULT_VEHICLE_SPEC } from './defaultVehicleSpec.js'
import { createFlatTerrainContactQuery } from '../terrain/createFlatTerrainContactQuery.js'
import {
    createPlanarMotionState,
    integratePlanarPosition,
    integratePlanarVelocityFromLocalAcceleration,
    integrateYawRate,
    resetPlanarMotionState,
    setPlanarLocalVelocity,
} from './dynamics/planarMotion.js'

const GEARS = Object.freeze({
    REVERSE: 'reverse',
    NEUTRAL: 'neutral',
    DRIVE: 'drive',
})

const GEAR_SEQUENCE = Object.freeze([
    GEARS.REVERSE,
    GEARS.NEUTRAL,
    GEARS.DRIVE,
])

const GEAR_LABELS = Object.freeze({
    [GEARS.REVERSE]: 'R',
    [GEARS.NEUTRAL]: 'N',
    [GEARS.DRIVE]: 'D',
})

const GEAR_DIRECTIONS = Object.freeze({
    [GEARS.REVERSE]: -1,
    [GEARS.NEUTRAL]: 0,
    [GEARS.DRIVE]: 1,
})

const DEFAULT_CONTROLLER_PARAMS = {
    turnSpeedRadiansPerSecond: 2.5,
    maxVisualSteeringAngleRadians: Math.PI / 5,
    steeringDeadSpeedMetersPerSecond: 0.1,
    stopEpsilonMetersPerSecond: 0.03,
    maxSimulationDeltaSeconds: 0.1,
}

const CONTACT_EPSILON_METERS = 0.001
const TRACTION_LIMIT_EPSILON_NEWTONS = 0.001
const SLIP_RATIO_SPEED_EPSILON_METERS_PER_SECOND = 0.1
const WHEEL_ANGULAR_SPEED_EPSILON_RADIANS_PER_SECOND = 0.001
const TEMPORARY_ROLLING_CONSTRAINT_CORRECTION_TIME_SECONDS = 1.5

const BRAKE_LIGHT_OFF_COLOR = 0x330000
const BRAKE_LIGHT_ON_COLOR = 0xff1111
const BRAKE_LIGHT_OFF_EMISSIVE = 0x000000
const BRAKE_LIGHT_ON_EMISSIVE = 0xff0000
const BRAKE_LIGHT_ON_EMISSIVE_INTENSITY = 2.4
const BRAKE_LIGHT_OFF_EMISSIVE_INTENSITY = 0

export function createVehicleController(config = {}) {
    const vehicle = config.vehicle

    if (!vehicle) {
        throw new Error('createVehicleController requires a vehicle object.')
    }

    const spec = {
        ...DEFAULT_VEHICLE_SPEC,
        ...(config.spec ?? {}),
    }

    const params = {
        ...DEFAULT_CONTROLLER_PARAMS,
        ...(config.params ?? {}),
    }

    const terrainContactQuery =
        config.terrainContactQuery ??
        createFlatTerrainContactQuery({
            frictionCoefficient: spec.defaultSurfaceFrictionCoefficient,
        })

    const initialGear = normalizeGear(config.initialGear ?? GEARS.DRIVE)
    const startPosition = (config.startPosition ?? vehicle.position).clone()
    const startRotation = (config.startRotation ?? vehicle.rotation).clone()

    const velocity = ensureVelocityVector(vehicle)
    const planarMotion = createPlanarMotionState({
        yawRadians: startRotation.y,
        worldVelocityMetersPerSecond: velocity,
    })
    const wheelStates = createWheelRuntimeStates(vehicle, spec)
    const brakeLightVisuals = createBrakeLightVisuals(vehicle)

    const state = {
        controllerKind: 'planar-yaw-longitudinal-foundation',
        gear: initialGear,
        speedScalar: 0,
        throttleInput: 0,
        brakeInput: 0,
        steeringInput: 0,
        planarMotion,
        wheelStates,
        forces: createEmptyForceSnapshot(),
    }

    function update(dt, input = {}) {
        const safeDt = sanitizeDeltaTime(dt, params)

        readInput(input)
        updateBrakeLightVisuals(brakeLightVisuals, state.brakeInput)
        updateWheelContactStates()
        updateWheelLoadPlaceholderValues()
        calculatePerWheelLongitudinalForces()
        // Explicit one-step coupling: tire force uses slip measured before this
        // frame's wheel torque integration updates angular velocity.
        updateLongitudinalSlipTelemetry()
        calculatePerWheelLongitudinalTireForces()
        state.forces = calculateLongitudinalForcesFromWheelState()
        updateWheelRotationalStates(safeDt)
        updateYawState(safeDt)
        updatePlanarMotion(safeDt)
        updatePosition(safeDt)
        syncVehicleYawFromPlanarState()
        updateWheelContactStates()
        updateWheelLoadPlaceholderValues()
        updateWheelVisualStates()

        return getSnapshot()
    }

    function reset() {
        state.gear = initialGear
        state.speedScalar = 0
        state.throttleInput = 0
        state.brakeInput = 0
        state.steeringInput = 0
        state.forces = createEmptyForceSnapshot()
        resetPlanarMotionState(state.planarMotion, {
            yawRadians: startRotation.y,
        })

        vehicle.position.copy(startPosition)
        vehicle.rotation.copy(startRotation)
        syncVehicleYawFromPlanarState()

        for (const wheelState of state.wheelStates) {
            resetWheelRotationalState(wheelState)
            wheelState.steeringAngleRadians = 0
            wheelState.normalForceNewtons = 0
            wheelState.tractionLimitNewtons = 0
            wheelState.requestedDriveForceNewtons = 0
            wheelState.requestedBrakeForceNewtons = 0
            wheelState.requestedLongitudinalForceNewtons = 0
            resetWheelLongitudinalTireForceState(wheelState)
            resetWheelLongitudinalSlipState(wheelState)
            wheelState.lateralSlip = 0
            wheelState.frictionCoefficient = spec.defaultSurfaceFrictionCoefficient
            wheelState.surfaceKind = 'flat-asphalt-placeholder'
            wheelState.isGrounded = true
            wheelState.isSlipping = false

            applyWheelVisualState(wheelState)
        }

        updateBrakeLightVisuals(brakeLightVisuals, state.brakeInput)
        updateWheelContactStates()
        updateWheelLoadPlaceholderValues()
        calculatePerWheelLongitudinalForces()
        // Explicit one-step coupling: tire force uses slip measured before this
        // frame's wheel torque integration updates angular velocity.
        updateLongitudinalSlipTelemetry()
        calculatePerWheelLongitudinalTireForces()
        state.forces = calculateLongitudinalForcesFromWheelState()
        updateWheelRotationalStates(0)
        updateYawState(0)
        updatePlanarMotion(0)
        updateWheelVisualStates()

        return getSnapshot()
    }

    function shiftGearDown() {
        return shiftGearBy(-1)
    }

    function shiftGearUp() {
        return shiftGearBy(1)
    }

    function shiftGearBy(offset) {
        const currentIndex = GEAR_SEQUENCE.indexOf(state.gear)
        const safeCurrentIndex =
            currentIndex >= 0 ? currentIndex : GEAR_SEQUENCE.indexOf(GEARS.DRIVE)

        const rawNextIndex = safeCurrentIndex + offset
        const nextIndex =
            ((rawNextIndex % GEAR_SEQUENCE.length) + GEAR_SEQUENCE.length) %
            GEAR_SEQUENCE.length

        state.gear = GEAR_SEQUENCE[nextIndex]

        return getSnapshot()
    }

    function setGear(nextGear) {
        state.gear = normalizeGear(nextGear)

        return getSnapshot()
    }

    function getSnapshot() {
        return {
            controllerKind: state.controllerKind,
            spec,
            params,
            gear: state.gear,
            gearLabel: getGearLabel(state.gear),
            gearDirection: getGearDirection(state.gear),
            speedScalar: state.speedScalar,
            speedMetersPerSecond: state.planarMotion.worldSpeedMetersPerSecond,
            worldVelocityMetersPerSecond:
                state.planarMotion.worldVelocityMetersPerSecond,
            localForwardVelocityMetersPerSecond:
                state.planarMotion.localForwardVelocityMetersPerSecond,
            localLateralVelocityMetersPerSecond:
                state.planarMotion.localLateralVelocityMetersPerSecond,
            signedForwardSpeedMetersPerSecond:
                state.planarMotion.signedForwardSpeedMetersPerSecond,
            lateralSpeedMetersPerSecond:
                state.planarMotion.lateralSpeedMetersPerSecond,
            worldSpeedMetersPerSecond:
                state.planarMotion.worldSpeedMetersPerSecond,
            yawRadians: state.planarMotion.yawRadians,
            yawRateRadiansPerSecond:
                state.planarMotion.yawRateRadiansPerSecond,
            yawAccelerationRadiansPerSecondSquared:
                state.planarMotion.yawAccelerationRadiansPerSecondSquared,
            planarAccelerationWorldMetersPerSecondSquared:
                state.planarMotion.planarAccelerationWorldMetersPerSecondSquared,
            planarAccelerationLocalForwardMetersPerSecondSquared:
                state.planarMotion.planarAccelerationLocalForwardMetersPerSecondSquared,
            planarAccelerationLocalLateralMetersPerSecondSquared:
                state.planarMotion.planarAccelerationLocalLateralMetersPerSecondSquared,
            throttleInput: state.throttleInput,
            brakeInput: state.brakeInput,
            steeringInput: state.steeringInput,
            position: vehicle.position,
            rotation: vehicle.rotation,
            velocity,
            longitudinalAcceleration:
                state.forces.longitudinalAccelerationMetersPerSecondSquared,
            forces: state.forces,
            wheelStates: state.wheelStates,
        }
    }

    function readInput(input) {
        state.throttleInput = Boolean(input.throttle ?? input.forward) ? 1 : 0
        state.brakeInput = Boolean(input.brake ?? input.reverse) ? 1 : 0

        if (input.left && !input.right) {
            state.steeringInput = 1
        } else if (input.right && !input.left) {
            state.steeringInput = -1
        } else {
            state.steeringInput = 0
        }
    }

    function updatePlanarMotion(dt) {
        const oldForwardSpeedMetersPerSecond = state.speedScalar
        const forces = state.forces

        integratePlanarVelocityFromLocalAcceleration(
            state.planarMotion,
            forces.longitudinalAccelerationMetersPerSecondSquared,
            calculateTemporaryLateralVelocityDampingAcceleration(),
            dt
        )

        let nextForwardSpeedMetersPerSecond =
            state.planarMotion.localForwardVelocityMetersPerSecond
        const nextLateralSpeedMetersPerSecond =
            state.planarMotion.localLateralVelocityMetersPerSecond

        if (
            shouldClampToStop(
                oldForwardSpeedMetersPerSecond,
                nextForwardSpeedMetersPerSecond,
                forces
            )
        ) {
            nextForwardSpeedMetersPerSecond = 0
        }

        nextForwardSpeedMetersPerSecond = THREE.MathUtils.clamp(
            nextForwardSpeedMetersPerSecond,
            -spec.maxReverseSpeedMetersPerSecond,
            spec.maxForwardSpeedMetersPerSecond
        )

        if (
            Math.abs(nextForwardSpeedMetersPerSecond) <
                params.stopEpsilonMetersPerSecond &&
            !isDriveTryingToMoveFromStop()
        ) {
            nextForwardSpeedMetersPerSecond = 0
        }

        setPlanarLocalVelocity(
            state.planarMotion,
            nextForwardSpeedMetersPerSecond,
            nextLateralSpeedMetersPerSecond
        )
        syncSpeedScalarFromPlanarState()
    }

    function calculateLongitudinalForcesFromWheelState() {
        const speed = state.speedScalar
        const speedDirection = getSignWithDeadzone(
            speed,
            params.stopEpsilonMetersPerSecond
        )

        const normalForceNewtons = sumWheelForceNewtons(
            'normalForceNewtons'
        )

        const tractionLimitLongitudinalNewtons = sumWheelForceNewtons(
            'tractionLimitNewtons'
        )

        const driveForceNewtons = sumWheelForceNewtons(
            'requestedDriveForceNewtons'
        )

        const brakeForceNewtons = sumWheelForceNewtons(
            'requestedBrakeForceNewtons'
        )

        const requestedTireForceNewtons = sumWheelForceNewtons(
            'requestedLongitudinalForceNewtons'
        )

        const appliedTireForceNewtons = sumWheelForceNewtons(
            'appliedLongitudinalForceNewtons'
        )

        const rollingResistanceForceNewtons =
            calculateRollingResistanceForce(speedDirection, normalForceNewtons)

        const aerodynamicDragForceNewtons =
            calculateAerodynamicDragForce(speed, speedDirection)

        const netLongitudinalForceNewtons =
            appliedTireForceNewtons +
            rollingResistanceForceNewtons +
            aerodynamicDragForceNewtons

        const tractionLimitedWheelCount = countTractionLimitedWheels()

        return {
            normalForceNewtons,
            tractionLimitLongitudinalNewtons,
            driveForceNewtons,
            brakeForceNewtons,
            requestedTireForceNewtons,
            appliedTireForceNewtons,
            rollingResistanceForceNewtons,
            aerodynamicDragForceNewtons,
            netLongitudinalForceNewtons,
            longitudinalAccelerationMetersPerSecondSquared:
                netLongitudinalForceNewtons / spec.massKg,
            isTractionLimited: tractionLimitedWheelCount > 0,
            tractionLimitedWheelCount,
        }
    }

    function calculateRollingResistanceForce(speedDirection, normalForceNewtons) {
        if (speedDirection === 0) return 0

        return (
            -speedDirection *
            spec.rollingResistanceCoefficient *
            normalForceNewtons
        )
    }

    function calculateAerodynamicDragForce(speed, speedDirection) {
        if (speedDirection === 0) return 0

        return (
            -speedDirection *
            0.5 *
            spec.airDensityKgPerCubicMeter *
            spec.dragCoefficient *
            spec.frontalAreaSquareMeters *
            speed *
            speed
        )
    }

    function shouldClampToStop(oldSpeed, nextSpeed, forces) {
        if (!crossedZero(oldSpeed, nextSpeed)) return false

        const tireForceDirection = getSignWithDeadzone(
            forces.appliedTireForceNewtons,
            TRACTION_LIMIT_EPSILON_NEWTONS
        )

        const oldSpeedDirection = getSignWithDeadzone(
            oldSpeed,
            params.stopEpsilonMetersPerSecond
        )

        const tireForceOpposesMotion =
            tireForceDirection !== 0 &&
            oldSpeedDirection !== 0 &&
            tireForceDirection !== oldSpeedDirection

        const resistanceOnly =
            Math.abs(forces.appliedTireForceNewtons) <
            TRACTION_LIMIT_EPSILON_NEWTONS

        return tireForceOpposesMotion || resistanceOnly
    }

    function isDriveTryingToMoveFromStop() {
        return (
            state.throttleInput > 0 &&
            state.brakeInput === 0 &&
            getGearDirection(state.gear) !== 0
        )
    }

    function calculateTemporaryLateralVelocityDampingAcceleration() {
        // Temporary stabilization only: a future lateral tire model should
        // replace this placeholder damping with contact-patch lateral force.
        return (
            -state.planarMotion.localLateralVelocityMetersPerSecond *
            spec.temporaryLateralVelocityDampingPerSecond
        )
    }

    function updateYawState(dt) {
        const speedDirection = getSignWithDeadzone(
            state.planarMotion.localForwardVelocityMetersPerSecond,
            params.steeringDeadSpeedMetersPerSecond
        )

        const yawRateRadiansPerSecond = speedDirection === 0
            ? 0
            : params.turnSpeedRadiansPerSecond *
                state.steeringInput *
                speedDirection

        integrateYawRate(state.planarMotion, yawRateRadiansPerSecond, dt)
    }

    function updatePosition(dt) {
        integratePlanarPosition(vehicle.position, state.planarMotion, dt)
    }

    function syncVehicleYawFromPlanarState() {
        vehicle.rotation.y = state.planarMotion.yawRadians
    }

    function syncSpeedScalarFromPlanarState() {
        state.speedScalar =
            state.planarMotion.localForwardVelocityMetersPerSecond
    }

    function updateWheelContactStates() {
        vehicle.updateMatrixWorld(true)

        for (const wheelState of state.wheelStates) {
            updateWheelContactState(wheelState)
        }
    }

    function updateWheelContactState(wheelState) {
        wheelState.wheelCenterWorldPosition
            .copy(wheelState.localPosition)
            .applyMatrix4(vehicle.matrixWorld)

        terrainContactQuery.queryAtWorldXZ(
            wheelState.wheelCenterWorldPosition.x,
            wheelState.wheelCenterWorldPosition.z,
            wheelState.terrainContactQueryResult
        )

        wheelState.groundHeightMeters =
            wheelState.terrainContactQueryResult.groundHeightMeters

        wheelState.distanceToGroundMeters =
            wheelState.wheelCenterWorldPosition.y - wheelState.groundHeightMeters

        wheelState.tirePenetrationMeters = Math.max(
            0,
            wheelState.radius - wheelState.distanceToGroundMeters
        )

        wheelState.isGrounded =
            wheelState.distanceToGroundMeters <=
            wheelState.radius + CONTACT_EPSILON_METERS

        wheelState.contactPointWorldPosition.set(
            wheelState.wheelCenterWorldPosition.x,
            wheelState.groundHeightMeters,
            wheelState.wheelCenterWorldPosition.z
        )

        wheelState.contactPatchWorldPosition.copy(
            wheelState.contactPointWorldPosition
        )

        wheelState.contactNormalWorld.copy(
            wheelState.terrainContactQueryResult.normalWorld
        )

        wheelState.surfaceKind = wheelState.terrainContactQueryResult.surfaceKind
        wheelState.frictionCoefficient =
            wheelState.terrainContactQueryResult.frictionCoefficient
        wheelState.isInsideTerrainBounds =
            wheelState.terrainContactQueryResult.isInsideTerrainBounds
    }

    function updateWheelLoadPlaceholderValues() {
        const groundedWheelCount = countGroundedWheels()
        const normalForcePerGroundedWheelNewtons =
            groundedWheelCount > 0
                ? spec.massKg * spec.gravityMetersPerSecondSquared /
                    groundedWheelCount
                : 0

        for (const wheelState of state.wheelStates) {
            wheelState.normalForceNewtons = wheelState.isGrounded
                ? normalForcePerGroundedWheelNewtons
                : 0

            wheelState.tractionLimitNewtons = wheelState.isGrounded
                ? wheelState.frictionCoefficient * wheelState.normalForceNewtons
                : 0
        }
    }

    function calculatePerWheelLongitudinalForces() {
        resetWheelForceAndBrakeTorqueRequests()
        updateServiceBrakeTorqueStates()

        const speedDirection = getSignWithDeadzone(
            state.speedScalar,
            params.stopEpsilonMetersPerSecond
        )

        if (state.brakeInput > 0) {
            if (speedDirection !== 0) {
                distributeBrakeForceRequestToWheels(
                    -speedDirection *
                    spec.maxBrakeForceNewtons *
                    state.brakeInput
                )
            }
        } else {
            distributeDriveForceRequestToWheels(
                calculateDriveForceRequestNewtons()
            )
        }
    }

    function resetWheelForceAndBrakeTorqueRequests() {
        for (const wheelState of state.wheelStates) {
            wheelState.requestedDriveForceNewtons = 0
            wheelState.requestedBrakeForceNewtons = 0
            wheelState.requestedLongitudinalForceNewtons = 0
            resetWheelLongitudinalTireForceState(wheelState)
            wheelState.isSlipping = false
            resetWheelLongitudinalSlipState(wheelState)
            wheelState.lateralSlip = 0
            resetWheelServiceBrakeTorqueState(wheelState)
        }
    }

    function updateServiceBrakeTorqueStates() {
        const serviceBrakePressure01 = THREE.MathUtils.clamp(
            state.brakeInput,
            0,
            1
        )

        const requestedBrakeTorqueNewtonMeters =
            spec.maxServiceBrakeTorqueNewtonMeters * serviceBrakePressure01

        // These are non-negative service brake command magnitudes. The current
        // wheel angular dynamics consume them directly; ABS and real wheel lock
        // behavior remain future work.
        for (const wheelState of state.wheelStates) {
            wheelState.serviceBrakePressure01 = serviceBrakePressure01
            wheelState.requestedBrakeTorqueNewtonMeters =
                requestedBrakeTorqueNewtonMeters
            wheelState.appliedBrakeTorqueNewtonMeters =
                requestedBrakeTorqueNewtonMeters
            wheelState.brakeTorqueNewtonMeters =
                wheelState.appliedBrakeTorqueNewtonMeters
        }
    }

    function calculateDriveForceRequestNewtons() {
        const gearDirection = getGearDirection(state.gear)

        if (state.throttleInput <= 0 || gearDirection === 0) return 0

        const speedAlongSelectedGear = state.speedScalar * gearDirection
        const maxGearSpeed = gearDirection > 0
            ? spec.maxForwardSpeedMetersPerSecond
            : spec.maxReverseSpeedMetersPerSecond

        if (speedAlongSelectedGear >= maxGearSpeed) return 0

        const maxDriveForce = gearDirection > 0
            ? spec.maxDriveForceNewtons
            : spec.maxReverseDriveForceNewtons

        return gearDirection * maxDriveForce * state.throttleInput
    }

    function distributeDriveForceRequestToWheels(totalDriveForceNewtons) {
        if (totalDriveForceNewtons === 0) return

        const drivenWheelCount = countDrivenWheels()
        if (drivenWheelCount === 0) return

        const driveForcePerWheelNewtons =
            totalDriveForceNewtons / drivenWheelCount

        for (const wheelState of state.wheelStates) {
            if (!wheelState.driven) continue

            wheelState.requestedDriveForceNewtons = driveForcePerWheelNewtons
            wheelState.requestedLongitudinalForceNewtons +=
                driveForcePerWheelNewtons
        }
    }

    function distributeBrakeForceRequestToWheels(totalBrakeForceNewtons) {
        if (totalBrakeForceNewtons === 0) return
        if (state.wheelStates.length === 0) return

        const brakeForcePerWheelNewtons =
            totalBrakeForceNewtons / state.wheelStates.length

        for (const wheelState of state.wheelStates) {
            wheelState.requestedBrakeForceNewtons = brakeForcePerWheelNewtons
            wheelState.requestedLongitudinalForceNewtons +=
                brakeForcePerWheelNewtons
        }
    }

    function calculatePerWheelLongitudinalTireForces() {
        for (const wheelState of state.wheelStates) {
            calculateWheelLongitudinalTireForce(wheelState)
        }
    }

    function calculateWheelLongitudinalTireForce(wheelState) {
        if (!wheelState.isGrounded || wheelState.tractionLimitNewtons <= 0) {
            resetWheelLongitudinalTireForceState(wheelState)
            return
        }

        // The stored longitudinalSlipRatio is direction-aware for telemetry;
        // tire force needs the vehicle local-forward sign convention.
        const localForwardLongitudinalSlipRatio =
            calculateLocalForwardLongitudinalSlipRatio(wheelState)

        wheelState.linearLongitudinalTireForceNewtons =
            spec.longitudinalTireStiffnessNewtonsPerSlipRatio *
            localForwardLongitudinalSlipRatio
        wheelState.uncappedLongitudinalTireForceNewtons =
            wheelState.linearLongitudinalTireForceNewtons
        wheelState.appliedLongitudinalForceNewtons = THREE.MathUtils.clamp(
            wheelState.linearLongitudinalTireForceNewtons,
            -wheelState.tractionLimitNewtons,
            wheelState.tractionLimitNewtons
        )

        const uncappedForceMagnitudeNewtons = Math.abs(
            wheelState.uncappedLongitudinalTireForceNewtons
        )

        wheelState.longitudinalTireForceSaturationRatio =
            wheelState.tractionLimitNewtons > 0
                ? Math.min(
                    uncappedForceMagnitudeNewtons / wheelState.tractionLimitNewtons,
                    1
                )
                : 0
        wheelState.isLongitudinalTireForceSaturated =
            uncappedForceMagnitudeNewtons >
            wheelState.tractionLimitNewtons + TRACTION_LIMIT_EPSILON_NEWTONS

        // Compatibility alias for the driver panel: this now means the simple
        // longitudinal tire force is friction-saturated, not full tire slip.
        wheelState.isSlipping = wheelState.isLongitudinalTireForceSaturated
    }

    function calculateLocalForwardLongitudinalSlipRatio(wheelState) {
        const groundSpeedAbs = Math.abs(
            wheelState.longitudinalGroundSpeedMetersPerSecond
        )
        const wheelSurfaceSpeedAbs = Math.abs(
            wheelState.wheelSurfaceSpeedMetersPerSecond
        )
        const slipDenominatorMetersPerSecond = Math.max(
            groundSpeedAbs,
            wheelSurfaceSpeedAbs,
            SLIP_RATIO_SPEED_EPSILON_METERS_PER_SECOND
        )

        return (
            wheelState.wheelSurfaceSpeedMetersPerSecond -
            wheelState.longitudinalGroundSpeedMetersPerSecond
        ) / slipDenominatorMetersPerSecond
    }

    function updateWheelRotationalStates(dt) {
        for (const wheelState of state.wheelStates) {
            updateWheelTorqueCoupledRotationalState(wheelState, dt)
        }
    }

    function updateWheelTorqueCoupledRotationalState(wheelState, dt) {
        wheelState.driveTorqueNewtonMeters = calculateWheelDriveTorqueNewtonMeters(wheelState)
        wheelState.brakeTorqueNewtonMeters = calculateWheelBrakeTorqueNewtonMeters(
            wheelState,
            dt
        )
        wheelState.contactReactionTorqueNewtonMeters =
            calculateWheelContactReactionTorqueNewtonMeters(wheelState)
        wheelState.targetRollingAngularVelocityRadiansPerSecond =
            calculateTargetRollingAngularVelocity(wheelState)
        wheelState.rollingConstraintCorrectionTorqueNewtonMeters =
            calculateTemporaryRollingConstraintCorrectionTorqueNewtonMeters(wheelState)

        wheelState.netTorqueNewtonMeters =
            wheelState.driveTorqueNewtonMeters +
            wheelState.brakeTorqueNewtonMeters +
            wheelState.contactReactionTorqueNewtonMeters +
            wheelState.rollingConstraintCorrectionTorqueNewtonMeters

        if (dt <= 0 || !Number.isFinite(wheelState.wheelInertiaKgMeterSquared) ||
            wheelState.wheelInertiaKgMeterSquared <= 0) {
            wheelState.angularAccelerationRadiansPerSecondSquared = 0
            wheelState.rollingSurfaceSpeedMetersPerSecond =
                calculateRollingSurfaceSpeedMetersPerSecond(wheelState)
            return
        }

        wheelState.angularAccelerationRadiansPerSecondSquared =
            wheelState.netTorqueNewtonMeters / wheelState.wheelInertiaKgMeterSquared
        wheelState.angularVelocityRadiansPerSecond +=
            wheelState.angularAccelerationRadiansPerSecondSquared * dt

        if (!Number.isFinite(wheelState.angularVelocityRadiansPerSecond)) {
            wheelState.angularVelocityRadiansPerSecond = 0
            wheelState.angularAccelerationRadiansPerSecondSquared = 0
        }

        wheelState.rollingSurfaceSpeedMetersPerSecond =
            calculateRollingSurfaceSpeedMetersPerSecond(wheelState)
        wheelState.spinAngleRadians +=
            wheelState.angularVelocityRadiansPerSecond * dt
        wheelState.isWheelLocked = false
    }

    function calculateWheelDriveTorqueNewtonMeters(wheelState) {
        if (!Number.isFinite(wheelState.radius) || wheelState.radius <= 0) return 0

        return wheelState.requestedDriveForceNewtons * wheelState.radius
    }

    function calculateWheelBrakeTorqueNewtonMeters(wheelState, dt) {
        const brakeTorqueMagnitudeNewtonMeters =
            wheelState.appliedBrakeTorqueNewtonMeters

        if (brakeTorqueMagnitudeNewtonMeters <= 0 || dt <= 0) return 0

        const angularVelocityDirection = getSignWithDeadzone(
            wheelState.angularVelocityRadiansPerSecond,
            WHEEL_ANGULAR_SPEED_EPSILON_RADIANS_PER_SECOND
        )

        if (angularVelocityDirection === 0) return 0

        const maximumStoppingTorqueNewtonMeters =
            Math.abs(wheelState.angularVelocityRadiansPerSecond) *
            wheelState.wheelInertiaKgMeterSquared /
            dt

        return -angularVelocityDirection * Math.min(
            brakeTorqueMagnitudeNewtonMeters,
            maximumStoppingTorqueNewtonMeters
        )
    }

    function calculateWheelContactReactionTorqueNewtonMeters(wheelState) {
        if (!wheelState.isGrounded) return 0
        if (!Number.isFinite(wheelState.radius) || wheelState.radius <= 0) return 0

        return -wheelState.appliedLongitudinalForceNewtons * wheelState.radius
    }

    function calculateTemporaryRollingConstraintCorrectionTorqueNewtonMeters(wheelState) {
        if (!wheelState.isGrounded) return 0

        const angularVelocityErrorRadiansPerSecond =
            wheelState.targetRollingAngularVelocityRadiansPerSecond -
            wheelState.angularVelocityRadiansPerSecond

        // Temporary numerical damping: tire force now comes from slip ratio, so
        // this correction is intentionally weak and should not be treated as the
        // tire model. Later tire model work can remove or further reduce it.
        return (
            angularVelocityErrorRadiansPerSecond *
            wheelState.wheelInertiaKgMeterSquared /
            TEMPORARY_ROLLING_CONSTRAINT_CORRECTION_TIME_SECONDS
        )
    }

    function calculateTargetRollingAngularVelocity(wheelState) {
        if (!Number.isFinite(wheelState.radius) || wheelState.radius <= 0) return 0

        return state.speedScalar / wheelState.radius
    }

    function calculateRollingSurfaceSpeedMetersPerSecond(wheelState) {
        if (!Number.isFinite(wheelState.radius) || wheelState.radius <= 0) return 0

        return wheelState.angularVelocityRadiansPerSecond * wheelState.radius
    }

    function updateLongitudinalSlipTelemetry() {
        for (const wheelState of state.wheelStates) {
            updateWheelLongitudinalSlipState(wheelState)
        }
    }

    function updateWheelLongitudinalSlipState(wheelState) {
        const longitudinalGroundSpeedMetersPerSecond = state.speedScalar
        const wheelSurfaceSpeedMetersPerSecond =
            calculateRollingSurfaceSpeedMetersPerSecond(wheelState)

        wheelState.longitudinalGroundSpeedMetersPerSecond =
            longitudinalGroundSpeedMetersPerSecond
        wheelState.wheelSurfaceSpeedMetersPerSecond =
            wheelSurfaceSpeedMetersPerSecond

        if (!wheelState.isGrounded) {
            resetWheelLongitudinalSlipRatioFields(wheelState)
            return
        }

        const groundSpeedAbs = Math.abs(longitudinalGroundSpeedMetersPerSecond)
        const wheelSurfaceSpeedAbs = Math.abs(wheelSurfaceSpeedMetersPerSecond)
        const hasLongitudinalSlipSample =
            Math.max(groundSpeedAbs, wheelSurfaceSpeedAbs) >=
            SLIP_RATIO_SPEED_EPSILON_METERS_PER_SECOND

        wheelState.hasLongitudinalSlipSample = hasLongitudinalSlipSample

        if (!hasLongitudinalSlipSample) {
            wheelState.longitudinalSlipRatio = 0
            wheelState.longitudinalSlipRatioAbs = 0
            wheelState.longitudinalSlip = 0
            return
        }

        const slipDenominatorMetersPerSecond = Math.max(
            groundSpeedAbs,
            wheelSurfaceSpeedAbs,
            SLIP_RATIO_SPEED_EPSILON_METERS_PER_SECOND
        )

        const longitudinalDirection = getSlipDirection(
            longitudinalGroundSpeedMetersPerSecond,
            wheelSurfaceSpeedMetersPerSecond
        )

        // Positive slip means wheel surface speed exceeds ground speed in the
        // current longitudinal direction; negative slip means the wheel surface
        // is slower, as in braking or incipient lock. Ground speed is currently
        // approximated from planar local-forward velocity until per-wheel
        // contact patch velocity exists.
        const longitudinalSlipRatio =
            (
                wheelSurfaceSpeedMetersPerSecond -
                longitudinalGroundSpeedMetersPerSecond
            ) * longitudinalDirection / slipDenominatorMetersPerSecond

        wheelState.longitudinalSlipRatio = longitudinalSlipRatio
        wheelState.longitudinalSlipRatioAbs = Math.abs(longitudinalSlipRatio)
        wheelState.longitudinalSlip = longitudinalSlipRatio
    }

    function getSlipDirection(
        longitudinalGroundSpeedMetersPerSecond,
        wheelSurfaceSpeedMetersPerSecond
    ) {
        const groundSpeedDirection = getSignWithDeadzone(
            longitudinalGroundSpeedMetersPerSecond,
            SLIP_RATIO_SPEED_EPSILON_METERS_PER_SECOND
        )

        if (groundSpeedDirection !== 0) return groundSpeedDirection

        const wheelSurfaceSpeedDirection = getSignWithDeadzone(
            wheelSurfaceSpeedMetersPerSecond,
            SLIP_RATIO_SPEED_EPSILON_METERS_PER_SECOND
        )

        return wheelSurfaceSpeedDirection !== 0 ? wheelSurfaceSpeedDirection : 1
    }

    function updateWheelVisualStates() {
        for (const wheelState of state.wheelStates) {
            wheelState.steeringAngleRadians = wheelState.steerable
                ? params.maxVisualSteeringAngleRadians * state.steeringInput
                : 0

            applyWheelVisualState(wheelState)
        }
    }

    function countGroundedWheels() {
        let groundedWheelCount = 0

        for (const wheelState of state.wheelStates) {
            if (wheelState.isGrounded) {
                groundedWheelCount += 1
            }
        }

        return groundedWheelCount
    }

    function countDrivenWheels() {
        let drivenWheelCount = 0

        for (const wheelState of state.wheelStates) {
            if (wheelState.driven) {
                drivenWheelCount += 1
            }
        }

        return drivenWheelCount
    }

    function countTractionLimitedWheels() {
        let tractionLimitedWheelCount = 0

        for (const wheelState of state.wheelStates) {
            if (wheelState.isSlipping) {
                tractionLimitedWheelCount += 1
            }
        }

        return tractionLimitedWheelCount
    }

    function sumWheelForceNewtons(fieldName) {
        let forceNewtons = 0

        for (const wheelState of state.wheelStates) {
            const wheelForceNewtons = wheelState[fieldName]

            if (Number.isFinite(wheelForceNewtons)) {
                forceNewtons += wheelForceNewtons
            }
        }

        return forceNewtons
    }

    updateWheelContactStates()
    updateWheelLoadPlaceholderValues()
    calculatePerWheelLongitudinalForces()
    updateLongitudinalSlipTelemetry()
    calculatePerWheelLongitudinalTireForces()
    state.forces = calculateLongitudinalForcesFromWheelState()
    updateBrakeLightVisuals(brakeLightVisuals, state.brakeInput)
    updateWheelRotationalStates(0)
    updateYawState(0)
    updatePlanarMotion(0)
    syncVehicleYawFromPlanarState()
    updateWheelVisualStates()

    return {
        update,
        reset,
        shiftGearDown,
        shiftGearUp,
        setGear,
        getSnapshot,
    }
}

function sanitizeDeltaTime(dt, params) {
    if (!Number.isFinite(dt) || dt <= 0) return 0
    return Math.min(dt, params.maxSimulationDeltaSeconds)
}

function ensureVelocityVector(vehicle) {
    const existingVelocity = vehicle.userData.velocity

    if (existingVelocity?.isVector3) {
        return existingVelocity
    }

    vehicle.userData.velocity = new THREE.Vector3()
    return vehicle.userData.velocity
}

function createWheelRuntimeStates(vehicle, spec) {
    const wheelMetadata = vehicle.userData.vehicle?.wheels ?? []

    return wheelMetadata.map((wheel) => {
        const visualNodes = wheel.visualNodes ?? {}

        return {
            id: wheel.id,
            axle: wheel.axle,
            side: wheel.side,
            driven: Boolean(wheel.driven),
            steerable: Boolean(wheel.steerable),
            radius: wheel.radius,
            width: wheel.width,
            localPosition: cloneVector3(wheel.localPosition),
            contactPatchLocal: cloneVector3(wheel.contactPatchLocal),
            wheelCenterWorldPosition: new THREE.Vector3(),
            contactPointWorldPosition: new THREE.Vector3(),
            contactPatchWorldPosition: new THREE.Vector3(),
            contactNormalWorld: new THREE.Vector3(0, 1, 0),
            terrainContactQueryResult: {
                normalWorld: new THREE.Vector3(0, 1, 0),
            },
            groundHeightMeters: 0,
            distanceToGroundMeters: 0,
            tirePenetrationMeters: 0,
            isInsideTerrainBounds: true,
            steeringAngleRadians: 0,
            // Wheel angular dynamics are torque-coupled, while tire forces use a basic
            // linear/saturated longitudinal slip model. Wheel lock behavior remains future work.
            rollingSurfaceSpeedMetersPerSecond: 0,
            targetRollingAngularVelocityRadiansPerSecond: 0,
            angularVelocityRadiansPerSecond: 0,
            angularAccelerationRadiansPerSecondSquared: 0,
            spinAngleRadians: 0,
            wheelInertiaKgMeterSquared: spec.wheelInertiaKgMeterSquared,
            // Service brake torque values are command-state magnitudes only for now.
            serviceBrakePressure01: 0,
            requestedBrakeTorqueNewtonMeters: 0,
            appliedBrakeTorqueNewtonMeters: 0,
            driveTorqueNewtonMeters: 0,
            brakeTorqueNewtonMeters: 0,
            contactReactionTorqueNewtonMeters: 0,
            rollingConstraintCorrectionTorqueNewtonMeters: 0,
            netTorqueNewtonMeters: 0,
            isWheelLocked: false,
            isGrounded: true,
            isSlipping: false,
            surfaceKind: 'flat-asphalt-placeholder',
            frictionCoefficient: spec.defaultSurfaceFrictionCoefficient,
            normalForceNewtons: 0,
            tractionLimitNewtons: 0,
            requestedDriveForceNewtons: 0,
            requestedBrakeForceNewtons: 0,
            requestedLongitudinalForceNewtons: 0,
            uncappedLongitudinalTireForceNewtons: 0,
            linearLongitudinalTireForceNewtons: 0,
            appliedLongitudinalForceNewtons: 0,
            longitudinalTireForceSaturationRatio: 0,
            isLongitudinalTireForceSaturated: false,
            longitudinalGroundSpeedMetersPerSecond: 0,
            wheelSurfaceSpeedMetersPerSecond: 0,
            longitudinalSlipRatio: 0,
            longitudinalSlipRatioAbs: 0,
            hasLongitudinalSlipSample: false,
            longitudinalSlip: 0,
            lateralSlip: 0,
            visual: {
                pivot: visualNodes.pivot
                    ? vehicle.getObjectByName(visualNodes.pivot)
                    : null,
                rollingAssembly: visualNodes.rollingAssembly
                    ? vehicle.getObjectByName(visualNodes.rollingAssembly)
                    : null,
            },
        }
    })
}

function resetWheelRotationalState(wheelState) {
    wheelState.rollingSurfaceSpeedMetersPerSecond = 0
    wheelState.targetRollingAngularVelocityRadiansPerSecond = 0
    wheelState.angularVelocityRadiansPerSecond = 0
    wheelState.angularAccelerationRadiansPerSecondSquared = 0
    wheelState.spinAngleRadians = 0
    resetWheelLongitudinalTireForceState(wheelState)
    resetWheelLongitudinalSlipState(wheelState)
    resetWheelServiceBrakeTorqueState(wheelState)
    wheelState.driveTorqueNewtonMeters = 0
    wheelState.brakeTorqueNewtonMeters = 0
    wheelState.contactReactionTorqueNewtonMeters = 0
    wheelState.rollingConstraintCorrectionTorqueNewtonMeters = 0
    wheelState.netTorqueNewtonMeters = 0
    wheelState.isWheelLocked = false
}

function resetWheelLongitudinalTireForceState(wheelState) {
    wheelState.uncappedLongitudinalTireForceNewtons = 0
    wheelState.linearLongitudinalTireForceNewtons = 0
    wheelState.appliedLongitudinalForceNewtons = 0
    wheelState.longitudinalTireForceSaturationRatio = 0
    wheelState.isLongitudinalTireForceSaturated = false
    wheelState.isSlipping = false
}

function resetWheelLongitudinalSlipState(wheelState) {
    wheelState.longitudinalGroundSpeedMetersPerSecond = 0
    wheelState.wheelSurfaceSpeedMetersPerSecond = 0
    resetWheelLongitudinalSlipRatioFields(wheelState)
}

function resetWheelLongitudinalSlipRatioFields(wheelState) {
    wheelState.longitudinalSlipRatio = 0
    wheelState.longitudinalSlipRatioAbs = 0
    wheelState.hasLongitudinalSlipSample = false
    wheelState.longitudinalSlip = 0
}

function resetWheelServiceBrakeTorqueState(wheelState) {
    wheelState.serviceBrakePressure01 = 0
    wheelState.requestedBrakeTorqueNewtonMeters = 0
    wheelState.appliedBrakeTorqueNewtonMeters = 0
    wheelState.brakeTorqueNewtonMeters = 0
}

function applyWheelVisualState(wheelState) {
    if (wheelState.visual.pivot && wheelState.steerable) {
        wheelState.visual.pivot.rotation.y =
            wheelState.steeringAngleRadians
    }

    if (wheelState.visual.rollingAssembly) {
        wheelState.visual.rollingAssembly.rotation.x =
            wheelState.spinAngleRadians
    }
}

function createBrakeLightVisuals(vehicle) {
  const brakeLightNodes =
    vehicle.userData.vehicle?.lighting?.brakeLightNodes ?? []

  return brakeLightNodes
    .map((nodeName) => vehicle.getObjectByName(nodeName))
    .filter((node) => node?.isMesh && node.material)
}

function updateBrakeLightVisuals(brakeLightVisuals, brakeInput) {
  const isBraking = brakeInput > 0

  for (const brakeLight of brakeLightVisuals) {
    brakeLight.material.color.setHex(
      isBraking ? BRAKE_LIGHT_ON_COLOR : BRAKE_LIGHT_OFF_COLOR
    )

    brakeLight.material.emissive.setHex(
      isBraking ? BRAKE_LIGHT_ON_EMISSIVE : BRAKE_LIGHT_OFF_EMISSIVE
    )

    brakeLight.material.emissiveIntensity = isBraking
      ? BRAKE_LIGHT_ON_EMISSIVE_INTENSITY
      : BRAKE_LIGHT_OFF_EMISSIVE_INTENSITY
  }
}

function cloneVector3(value) {
    if (value?.isVector3) return value.clone()

    return new THREE.Vector3(
        value?.x ?? 0,
        value?.y ?? 0,
        value?.z ?? 0
    )
}

function createEmptyForceSnapshot() {
    return {
        normalForceNewtons: 0,
        tractionLimitLongitudinalNewtons: 0,
        driveForceNewtons: 0,
        brakeForceNewtons: 0,
        requestedTireForceNewtons: 0,
        appliedTireForceNewtons: 0,
        rollingResistanceForceNewtons: 0,
        aerodynamicDragForceNewtons: 0,
        netLongitudinalForceNewtons: 0,
        longitudinalAccelerationMetersPerSecondSquared: 0,
        isTractionLimited: false,
        tractionLimitedWheelCount: 0,
    }
}

function normalizeGear(gear) {
    if (GEAR_SEQUENCE.includes(gear)) return gear
    return GEARS.DRIVE
}

function getGearLabel(gear) {
    return GEAR_LABELS[gear] ?? '?'
}

function getGearDirection(gear) {
    return GEAR_DIRECTIONS[gear] ?? 0
}

function getSignWithDeadzone(value, deadzone) {
    if (Math.abs(value) <= deadzone) return 0
    return Math.sign(value)
}

function crossedZero(before, after) {
    return (
        (before > 0 && after < 0) ||
        (before < 0 && after > 0)
    )
}