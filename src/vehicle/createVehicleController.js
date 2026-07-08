// src/vehicle/createVehicleController.js

import * as THREE from 'three'
import { DEFAULT_VEHICLE_SPEC } from './defaultVehicleSpec.js'
import { createFlatTerrainContactQuery } from '../terrain/createFlatTerrainContactQuery.js'

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

const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1)
const CONTACT_EPSILON_METERS = 0.001
const TRACTION_LIMIT_EPSILON_NEWTONS = 0.001

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
    const wheelStates = createWheelRuntimeStates(vehicle, spec)
    const brakeLightVisuals = createBrakeLightVisuals(vehicle)

    const state = {
        controllerKind: 'flat-ground-force-longitudinal',
        gear: initialGear,
        speedScalar: 0,
        throttleInput: 0,
        brakeInput: 0,
        steeringInput: 0,
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
        state.forces = calculateLongitudinalForcesFromWheelState()
        updateLongitudinalMotion(safeDt)
        updateSteering(safeDt)
        updatePosition(safeDt)
        updateVelocityVector()
        updateWheelVisualStates(safeDt)

        return getSnapshot()
    }

    function reset() {
        state.gear = initialGear
        state.speedScalar = 0
        state.throttleInput = 0
        state.brakeInput = 0
        state.steeringInput = 0
        state.forces = createEmptyForceSnapshot()

        vehicle.position.copy(startPosition)
        vehicle.rotation.copy(startRotation)
        velocity.set(0, 0, 0)

        for (const wheelState of state.wheelStates) {
            wheelState.angularVelocityRadiansPerSecond = 0
            wheelState.spinAngleRadians = 0
            wheelState.steeringAngleRadians = 0
            wheelState.normalForceNewtons = 0
            wheelState.tractionLimitNewtons = 0
            wheelState.requestedDriveForceNewtons = 0
            wheelState.requestedBrakeForceNewtons = 0
            wheelState.requestedLongitudinalForceNewtons = 0
            wheelState.appliedLongitudinalForceNewtons = 0
            wheelState.longitudinalSlip = 0
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
        state.forces = calculateLongitudinalForcesFromWheelState()
        updateWheelVisualStates(0)

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

    function updateLongitudinalMotion(dt) {
        const oldSpeed = state.speedScalar
        const forces = state.forces

        let nextSpeed =
            oldSpeed +
            forces.longitudinalAccelerationMetersPerSecondSquared * dt

        if (shouldClampToStop(oldSpeed, nextSpeed, forces)) {
            nextSpeed = 0
        }

        nextSpeed = THREE.MathUtils.clamp(
            nextSpeed,
            -spec.maxReverseSpeedMetersPerSecond,
            spec.maxForwardSpeedMetersPerSecond
        )

        if (
            Math.abs(nextSpeed) < params.stopEpsilonMetersPerSecond &&
            !isDriveTryingToMoveFromStop()
        ) {
            nextSpeed = 0
        }

        state.speedScalar = nextSpeed
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

    function updateSteering(dt) {
        const speedDirection = getSignWithDeadzone(
            state.speedScalar,
            params.steeringDeadSpeedMetersPerSecond
        )

        if (speedDirection === 0) return

        vehicle.rotation.y +=
            params.turnSpeedRadiansPerSecond *
            state.steeringInput *
            speedDirection *
            dt
    }

    function updatePosition(dt) {
        vehicle.translateZ(state.speedScalar * dt)
    }

    function updateVelocityVector() {
        velocity.copy(LOCAL_FORWARD)
        velocity.applyQuaternion(vehicle.quaternion)
        velocity.multiplyScalar(state.speedScalar)
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
        resetWheelLongitudinalForceRequests()

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

        applyWheelTractionLimits()
    }

    function resetWheelLongitudinalForceRequests() {
        for (const wheelState of state.wheelStates) {
            wheelState.requestedDriveForceNewtons = 0
            wheelState.requestedBrakeForceNewtons = 0
            wheelState.requestedLongitudinalForceNewtons = 0
            wheelState.appliedLongitudinalForceNewtons = 0
            wheelState.isSlipping = false
            wheelState.longitudinalSlip = 0
            wheelState.lateralSlip = 0
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

    function applyWheelTractionLimits() {
        for (const wheelState of state.wheelStates) {
            if (wheelState.tractionLimitNewtons <= 0) {
                wheelState.appliedLongitudinalForceNewtons = 0
                wheelState.isSlipping =
                    Math.abs(wheelState.requestedLongitudinalForceNewtons) >
                    TRACTION_LIMIT_EPSILON_NEWTONS
                wheelState.longitudinalSlip = 0
                continue
            }

            wheelState.appliedLongitudinalForceNewtons = THREE.MathUtils.clamp(
                wheelState.requestedLongitudinalForceNewtons,
                -wheelState.tractionLimitNewtons,
                wheelState.tractionLimitNewtons
            )

            // Placeholder traction-limit indicator until tire slip curves
            // replace clamp-based limiting in a later branch.
            wheelState.isSlipping =
                Math.abs(wheelState.requestedLongitudinalForceNewtons) >
                wheelState.tractionLimitNewtons + TRACTION_LIMIT_EPSILON_NEWTONS

            wheelState.longitudinalSlip = wheelState.isSlipping ? 1 : 0
        }
    }

    function updateWheelVisualStates(dt) {
        for (const wheelState of state.wheelStates) {
            wheelState.angularVelocityRadiansPerSecond =
                wheelState.radius > 0
                    ? state.speedScalar / wheelState.radius
                    : 0

            wheelState.spinAngleRadians +=
                wheelState.angularVelocityRadiansPerSecond * dt

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
    state.forces = calculateLongitudinalForcesFromWheelState()
    updateBrakeLightVisuals(brakeLightVisuals, state.brakeInput)
    updateWheelVisualStates(0)

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
            spinAngleRadians: 0,
            angularVelocityRadiansPerSecond: 0,
            isGrounded: true,
            isSlipping: false,
            surfaceKind: 'flat-asphalt-placeholder',
            frictionCoefficient: spec.defaultSurfaceFrictionCoefficient,
            normalForceNewtons: 0,
            tractionLimitNewtons: 0,
            requestedDriveForceNewtons: 0,
            requestedBrakeForceNewtons: 0,
            requestedLongitudinalForceNewtons: 0,
            appliedLongitudinalForceNewtons: 0,
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