// src/vehicle/createVehicleController.js

import * as THREE from 'three'
import { DEFAULT_VEHICLE_SPEC } from './defaultVehicleSpec.js'
import { createFlatTerrainContactQuery } from '../terrain/createFlatTerrainContactQuery.js'
import {
    createAerodynamicDragState,
    updateAerodynamicDragState,
} from './dynamics/aerodynamicDragState.js'
import {
    createChassisMassPropertiesState,
    updateChassisMassPropertiesState,
} from './dynamics/chassisMassPropertiesState.js'
import {
    createPlanarMotionState,
    integratePlanarPosition,
    integratePlanarVelocityFromWorldAcceleration,
    integrateYawAcceleration,
    resetPlanarMotionState,
    setPlanarLocalVelocity,
} from './dynamics/planarMotion.js'
import {
    calculateTireInflationNormalized01,
    createTirePressureState,
    updateTirePressureState,
} from './dynamics/tireInflationVisualState.js'
import {
    createDynamicsTuningState,
    resetDynamicsTuningState,
    updateDynamicsTuningState,
} from './dynamics/dynamicsTuningState.js'
import {
    createLateralSlipSummary,
    LATERAL_SLIP_STATES,
    resetLateralSlipSummary,
    resetWheelLateralSlipAngleState,
    updateLateralSlipSummary,
    updateWheelLateralSlipAngleState,
} from './dynamics/lateralSlipAngleState.js'
import {
    createLateralTireForceSummary,
    resetLateralTireForceSummary,
    resetWheelLateralTireForceState,
    updateLateralTireForceSummary,
    updateWheelLateralTireForceState,
} from './dynamics/lateralTireForceState.js'
import {
    resetWheelLongitudinalTireForceStepState,
    resetWheelLongitudinalTireForceRelaxationState,
    updateWheelLongitudinalTireForceRelaxationState,
} from './dynamics/longitudinalTireForceRelaxationState.js'
import {
    createRearDifferentialState,
    resetRearDifferentialState,
    resetRearDifferentialStepState,
    setRearDifferentialType as setActiveRearDifferentialType,
    updateRearDifferentialDriveForceSplit,
    updateRearDifferentialWheelSpeedCoupling,
} from './dynamics/rearDifferentialState.js'
import {
    createLoadTransferSummary,
    resetLoadTransferSummary,
    resetWheelLoadTransferState,
    updateLoadTransferState,
} from './dynamics/loadTransferState.js'
import {
    createSuspensionNormalForceSummary,
    resetSuspensionNormalForceSummary,
    resetWheelSuspensionNormalForceState,
    updateSuspensionNormalForceState,
} from './dynamics/suspensionNormalForceState.js'
import {
    createChassisTerrainSupportState,
    resetChassisTerrainSupportState,
    updateChassisTerrainSupportState,
} from './dynamics/chassisTerrainSupportState.js'
import {
    createChassisAttitudeState,
    resetChassisAttitudeState,
    updateChassisAttitudeState,
} from './dynamics/chassisAttitudeState.js'
import {
    updateWheelContactPatchPlanarVelocity,
    updateWheelContactPlaneBasis,
} from './dynamics/contactPlaneBasisState.js'
import {
    calculateWheelRollingResistanceForce,
    createTirePressureHandlingSummary,
    resetTirePressureHandlingSummary,
    resetWheelTirePressureHandlingState,
    updateTirePressureHandlingState,
} from './dynamics/tirePressureHandlingState.js'
import {
    LONGITUDINAL_TRACTION_STATES,
    createTractionStateSummary,
    resetTractionStateSummary,
    updateLongitudinalTractionStateSummary,
    updateWheelLongitudinalTractionState,
} from './dynamics/longitudinalTractionState.js'
import {
    createServiceBrakeAbsSummary,
    resetServiceBrakeAbsSummary,
    resetWheelServiceBrakeAbsState,
    SERVICE_BRAKE_ABS_STATES,
    updateServiceBrakeAbsSummary,
    updateWheelServiceBrakeAbsState,
} from './dynamics/serviceBrakeAbsState.js'
import {
    beginVehicleDynamicsStepTrace,
    captureVehicleDynamicsStepTraceStage,
    createVehicleDynamicsStepTrace,
    resetVehicleDynamicsStepTrace,
    VEHICLE_DYNAMICS_STEP_TRACE_STAGES,
} from './dynamics/vehicleDynamicsStepTrace.js'

import {
    createPowertrainSnapshot,
    createStockEngineCatalogTelemetry,
    selectEngineProfile,
    selectTransmissionProfile,
} from './powertrain/createPowertrainSelection.js'

import {
    computePowertrainKinematics,
} from './powertrain/createPowertrainKinematics.js'

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
    maxVisualSteeringAngleRadians: Math.PI / 5,
    stopEpsilonMetersPerSecond: 0.03,
    maxSimulationDeltaSeconds: 0.1,
}

const DEFAULT_SUSPENSION_DOWN_LOCAL = new THREE.Vector3(0, -1, 0)
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

    const visualBodyHeightMeters = vehicle.userData.vehicle?.body?.centerY
    if (Number.isFinite(visualBodyHeightMeters)) {
        spec.chassisAttitudeVisualBodyHeightMeters = visualBodyHeightMeters
    }

    const engineProfile = selectEngineProfile(config.engineId)
    const transmissionProfile = selectTransmissionProfile(config.transmissionId)

    const terrainContactQuery =
        config.terrainContactQuery ??
        createFlatTerrainContactQuery({
            frictionCoefficient: spec.defaultSurfaceFrictionCoefficient,
        })

    const initialGear = normalizeGear(config.initialGear ?? GEARS.DRIVE)
    const startPosition = (config.startPosition ?? vehicle.position).clone()
    const startRotation = (config.startRotation ?? vehicle.rotation).clone()

    const chassisTerrainSupportState = createChassisTerrainSupportState(
        startPosition.y
    )
    resetChassisTerrainSupportState(
        chassisTerrainSupportState,
        terrainContactQuery,
        startPosition.x,
        startPosition.z,
        spec.chassisTerrainSupportBaselineOffsetMeters
    )
    vehicle.position.y =
        chassisTerrainSupportState.currentChassisSupportHeightMeters

    const velocity = ensureVelocityVector(vehicle)
    const planarMotion = createPlanarMotionState({
        yawRadians: startRotation.y,
        worldVelocityMetersPerSecond: velocity,
    })
    const aerodynamicDragState = createAerodynamicDragState()
    const wheelStates = createWheelRuntimeStates(vehicle, spec)
    const chassisAttitudeState = createChassisAttitudeState(spec)
    const chassisMassPropertiesState = updateChassisMassPropertiesState(
        createChassisMassPropertiesState(),
        spec,
        wheelStates
    )
    const tirePressureState = createTirePressureState(spec)
    const dynamicsTuning = createDynamicsTuningState({
      chassisAttitudeResponseSeconds: spec.chassisAttitudeResponseSeconds,
      chassisAttitudeMaximumHeaveOffsetMeters:
        spec.chassisAttitudeMaximumHeaveOffsetMeters,
      chassisAttitudeMaximumPitchRadians:
        spec.chassisAttitudeMaximumPitchRadians,
      chassisAttitudeMaximumRollRadians:
        spec.chassisAttitudeMaximumRollRadians,
      ...config.dynamicsTuning,
    })

    const chassisAttitudeSpecOverride = { ...spec }
    const lateralSlipSummary = createLateralSlipSummary()
    const lateralTireForceSummary = createLateralTireForceSummary()
    const loadTransferSummary = createLoadTransferSummary()
    const tirePressureHandlingSummary = createTirePressureHandlingSummary()
    const tractionStateSummary = createTractionStateSummary()
    const serviceBrakeAbsSummary = createServiceBrakeAbsSummary()
    const rearDifferentialState = createRearDifferentialState(spec)
    const brakeLightVisuals = createBrakeLightVisuals(vehicle)
    const wheelAxleVisualKinematics =
        vehicle.userData.vehicle?.wheelAxleVisualKinematics ?? null

    const state = {
        controllerKind: 'uneven-terrain-raycast-suspension-v1',
        engineProfile,
        transmissionProfile,
        powertrainKinematics: computePowertrainKinematics({
            engineProfile,
            transmissionProfile,
            gearDirection: getGearDirection(initialGear),
            averageDrivenWheelAngularVelocityRadiansPerSecond: 0,
        }),
        gear: initialGear,
        speedScalar: 0,
        throttleInput: 0,
        brakeInput: 0,
        parkingBrakeInput: 0,
        steeringInput: 0,
        planarMotion,
        aerodynamicDragState,
        chassisMassPropertiesState,
        chassisAttitudeState,
        wheelStates,
        tirePressureState,
        dynamicsTuning,
        lateralSlipSummary,
        lateralTireForceSummary,
        loadTransferSummary,
        suspensionNormalForceSummary: createSuspensionNormalForceSummary(),
        chassisTerrainSupportState,
        slopeGravityState: createSlopeGravityState(),
        tirePressureHandlingSummary,
        tractionStateSummary,
        serviceBrakeAbsSummary,
        rearDifferentialState,
        vehicleDynamicsStepTrace: createVehicleDynamicsStepTrace(wheelStates),
        forces: createEmptyForceSnapshot(),
    }

    function updatePowertrainKinematics() {
        const gearDirection = getGearDirection(state.gear)
        const averageDrivenWheelAngularVelocityRadiansPerSecond =
            computeAverageDrivenWheelAngularVelocityRadiansPerSecond()
        state.powertrainKinematics = computePowertrainKinematics({
            engineProfile: state.engineProfile,
            transmissionProfile: state.transmissionProfile,
            gearDirection,
            averageDrivenWheelAngularVelocityRadiansPerSecond,
        })
    }

    function computeAverageDrivenWheelAngularVelocityRadiansPerSecond() {
        const drivenWheels = state.wheelStates.filter(
            (wheelState) => wheelState.driven
        )

        if (drivenWheels.length > 0) {
            let sumAngularVelocityRadiansPerSecond = 0

            for (const wheelState of drivenWheels) {
                sumAngularVelocityRadiansPerSecond += Number.isFinite(
                    wheelState.angularVelocityRadiansPerSecond
                )
                    ? wheelState.angularVelocityRadiansPerSecond
                    : 0
            }

            return sumAngularVelocityRadiansPerSecond / drivenWheels.length
        }

        // Safe fallback: derive an approximate wheel angular velocity from
        // vehicle forward speed and the base rolling radius when no driven
        // wheel telemetry is available. Telemetry only; no behavior change.
        const rollingRadiusMeters =
            spec.baseTireRollingRadiusMeters > 0
                ? spec.baseTireRollingRadiusMeters
                : 1
        const forwardSpeedMetersPerSecond =
            state.planarMotion?.signedForwardSpeedMetersPerSecond ?? 0

        return Number.isFinite(forwardSpeedMetersPerSecond)
            ? forwardSpeedMetersPerSecond / rollingRadiusMeters
            : 0
    }

    function captureDynamicsStepTraceStage(stageName) {
        captureVehicleDynamicsStepTraceStage(
            state.vehicleDynamicsStepTrace,
            stageName,
            state.wheelStates,
            state.forces,
            spec.gravityMetersPerSecondSquared
        )
    }

    function update(dt, input = {}) {
        const safeDt = sanitizeDeltaTime(dt, params)

        beginVehicleDynamicsStepTrace(
            state.vehicleDynamicsStepTrace,
            safeDt,
            state.wheelStates
        )
        readInput(input)
        updateWheelSteeringAngles()
        updateBrakeLightVisuals(brakeLightVisuals, state.brakeInput)
        updateTerrainSupportAndWheelContactState(safeDt, true)
        updateChassisAttitude(safeDt)
        calculatePerWheelLongitudinalForces(safeDt)
        // Explicit one-step coupling: tire force still uses slip measured before this
        // frame's wheel torque and body-state integration updates velocities.
        updateLateralSlipTelemetry()
        updateLongitudinalSlipTelemetry()
        calculatePerWheelLongitudinalTireForces(safeDt)
        calculatePerWheelLateralTireForces()
        state.forces = calculatePlanarForcesFromWheelState()
        captureDynamicsStepTraceStage(
            VEHICLE_DYNAMICS_STEP_TRACE_STAGES.INTEGRATION_INPUT
        )
        updateLateralTireForceSummaryState()
        updateWheelRotationalStates(safeDt)
        updatePowertrainKinematics()
        updateYawState(safeDt)
        updatePlanarMotion(safeDt)
        updatePosition(safeDt)
        syncVehicleYawFromPlanarState()
        refreshPostIntegrationTelemetry()
        captureDynamicsStepTraceStage(
            VEHICLE_DYNAMICS_STEP_TRACE_STAGES.POST_INTEGRATION
        )
        updateWheelVisualStates()

        return getSnapshot()
    }

    function reset() {
        state.gear = initialGear
        state.speedScalar = 0
        state.throttleInput = 0
        state.brakeInput = 0
        state.parkingBrakeInput = 0
        state.steeringInput = 0
        state.forces = createEmptyForceSnapshot()
        resetVehicleDynamicsStepTrace(
            state.vehicleDynamicsStepTrace,
            state.wheelStates
        )
        resetTractionStateSummary(state.tractionStateSummary)
        resetServiceBrakeAbsSummary(state.serviceBrakeAbsSummary)
        resetRearDifferentialState(state.rearDifferentialState, spec)
        resetLateralSlipSummary(state.lateralSlipSummary)
        resetLateralTireForceSummary(state.lateralTireForceSummary)
        resetLoadTransferSummary(state.loadTransferSummary)
        resetSuspensionNormalForceSummary(state.suspensionNormalForceSummary)
        resetChassisAttitudeState(state.chassisAttitudeState, spec)
        resetSlopeGravityState(state.slopeGravityState)
        resetTirePressureHandlingSummary(state.tirePressureHandlingSummary)
        updateTirePressureState(
            state.tirePressureState,
            spec.defaultTirePressureKpa,
            spec
        )
        applyTirePressureStateToWheels()
        resetPlanarMotionState(state.planarMotion, {
            yawRadians: startRotation.y,
        })

        vehicle.position.copy(startPosition)
        vehicle.rotation.copy(startRotation)
        resetChassisTerrainSupportState(
            state.chassisTerrainSupportState,
            terrainContactQuery,
            startPosition.x,
            startPosition.z,
            spec.chassisTerrainSupportBaselineOffsetMeters
        )
        vehicle.position.y =
            state.chassisTerrainSupportState.currentChassisSupportHeightMeters
        syncVehicleYawFromPlanarState()
        applyChassisAttitudeVisualState()
        wheelAxleVisualKinematics?.reset()

        for (const wheelState of state.wheelStates) {
            resetWheelRotationalState(wheelState, spec)
            wheelState.steeringAngleRadians = 0
            resetWheelSuspensionNormalForceState(wheelState)
            wheelState.requestedDriveForceNewtons = 0
            wheelState.requestedBrakeForceNewtons = 0
            wheelState.requestedLongitudinalForceNewtons = 0
            resetWheelLongitudinalTireForceState(wheelState, spec)
            resetWheelLongitudinalSlipState(wheelState)
            resetWheelLateralSlipAngleState(wheelState)
            resetWheelLateralTireForceState(wheelState)
            resetWheelLoadTransferState(wheelState)
            wheelState.frictionCoefficient = spec.defaultSurfaceFrictionCoefficient
            wheelState.surfaceKind = 'unavailable'
            wheelState.terrainProfileName = 'unavailable'
            wheelState.suspensionContactStatus = 'reset'
            wheelState.isSuspensionContactRetained = false
            wheelState.isWithinSuspensionContactHysteresis = false
            wheelState.isContactTangentBasisValid = false
            wheelState.isGrounded = false
            wheelState.isSlipping = false
            resetWheelLongitudinalTractionState(wheelState)

            applyWheelVisualState(wheelState)
        }

        updateBrakeLightVisuals(brakeLightVisuals, state.brakeInput)
        updateWheelSteeringAngles()
        updateTerrainSupportAndWheelContactState(0, true, true)
        updateChassisAttitude(0)
        calculatePerWheelLongitudinalForces(0)
        updateLateralSlipTelemetry()
        updateLongitudinalSlipTelemetry()
        calculatePerWheelLongitudinalTireForces()
        calculatePerWheelLateralTireForces()
        state.forces = calculatePlanarForcesFromWheelState()
        captureDynamicsStepTraceStage(
            VEHICLE_DYNAMICS_STEP_TRACE_STAGES.INTEGRATION_INPUT
        )
        updateLateralTireForceSummaryState()
        updateWheelRotationalStates(0)
        updatePowertrainKinematics()
        updateYawState(0)
        updatePlanarMotion(0)
        refreshPostIntegrationTelemetry()
        captureDynamicsStepTraceStage(
            VEHICLE_DYNAMICS_STEP_TRACE_STAGES.POST_INTEGRATION
        )
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
            aerodynamicDrag: state.aerodynamicDragState,
            chassisMassProperties: state.chassisMassPropertiesState,
            chassisAttitude: state.chassisAttitudeState,
            chassisTerrainSupport: state.chassisTerrainSupportState,
            suspensionNormalForceSummary: state.suspensionNormalForceSummary,
            slopeGravity: state.slopeGravityState,
            terrainProfileName:
                state.chassisTerrainSupportState.profileName,
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
            parkingBrakeInput: state.parkingBrakeInput,
            serviceBrakeInput: state.brakeInput,
            steeringInput: state.steeringInput,
            position: vehicle.position,
            rotation: vehicle.rotation,
            velocity,
            longitudinalAcceleration:
                state.forces.longitudinalAccelerationMetersPerSecondSquared,
            forces: state.forces,
            wheelStates: state.wheelStates,
            wheelAxleVisualKinematics:
                wheelAxleVisualKinematics?.getSnapshot() ?? null,
            tirePressureState: state.tirePressureState,
            tirePressureKpa: state.tirePressureState.tirePressureKpa,
            tireInflationNormalized01:
                state.tirePressureState.tireInflationNormalized01,
            visualTireDeflectionRatio:
                state.tirePressureState.visualTireDeflectionRatio,
            visualContactPatchScale:
                state.tirePressureState.visualContactPatchScale,
            dynamicsTuning: state.dynamicsTuning,
            rearDifferentialType:
                state.rearDifferentialState.rearDifferentialType,
            rearDifferentialModeLabel:
                state.rearDifferentialState.rearDifferentialModeLabel,
            rearDifferentialInputDriveForceNewtons:
                state.rearDifferentialState.rearDifferentialInputDriveForceNewtons,
            rearDifferentialLeftOutputDriveForceNewtons:
                state.rearDifferentialState.rearDifferentialLeftOutputDriveForceNewtons,
            rearDifferentialRightOutputDriveForceNewtons:
                state.rearDifferentialState.rearDifferentialRightOutputDriveForceNewtons,
            rearDifferentialLeftShare01:
                state.rearDifferentialState.rearDifferentialLeftShare01,
            rearDifferentialRightShare01:
                state.rearDifferentialState.rearDifferentialRightShare01,
            rearDifferentialLeftAngularVelocityRadiansPerSecond:
                state.rearDifferentialState.rearDifferentialLeftAngularVelocityRadiansPerSecond,
            rearDifferentialRightAngularVelocityRadiansPerSecond:
                state.rearDifferentialState.rearDifferentialRightAngularVelocityRadiansPerSecond,
            rearDifferentialWheelSpeedDifferenceRadiansPerSecond:
                state.rearDifferentialState.rearDifferentialWheelSpeedDifferenceRadiansPerSecond,
            rearDifferentialWheelSpeedDifferenceAbsRadiansPerSecond:
                state.rearDifferentialState.rearDifferentialWheelSpeedDifferenceAbsRadiansPerSecond,
            rearDifferentialTorqueBiasRatio:
                state.rearDifferentialState.rearDifferentialTorqueBiasRatio,
            rearDifferentialCouplingState:
                state.rearDifferentialState.rearDifferentialCouplingState,
            rearDifferentialLeftCouplingTorqueNewtonMeters:
                state.rearDifferentialState.rearDifferentialLeftCouplingTorqueNewtonMeters,
            rearDifferentialRightCouplingTorqueNewtonMeters:
                state.rearDifferentialState.rearDifferentialRightCouplingTorqueNewtonMeters,
            rearDifferentialLeftCouplingAngularImpulseNewtonMeterSeconds:
                state.rearDifferentialState.rearDifferentialLeftCouplingAngularImpulseNewtonMeterSeconds,
            rearDifferentialRightCouplingAngularImpulseNewtonMeterSeconds:
                state.rearDifferentialState.rearDifferentialRightCouplingAngularImpulseNewtonMeterSeconds,
            rearDifferentialCommonAngularVelocityRadiansPerSecond:
                state.rearDifferentialState.rearDifferentialCommonAngularVelocityRadiansPerSecond,
            rearDifferentialLimitedSlipCouplingFraction01:
                state.rearDifferentialState.rearDifferentialLimitedSlipCouplingFraction01,
            isRearDifferentialBiasing:
                state.rearDifferentialState.isRearDifferentialBiasing,
            isRearDifferentialLockedApproximation:
                state.rearDifferentialState.isRearDifferentialLockedApproximation,
            isRearDifferentialHardSpeedCouplingApplied:
                state.rearDifferentialState.isRearDifferentialHardSpeedCouplingApplied,
            rearDifferentialState: state.rearDifferentialState,
            tractionStateSummary: state.tractionStateSummary,
            serviceBrakeAbsSummary: state.serviceBrakeAbsSummary,
            lateralSlipSummary: state.lateralSlipSummary,
            lateralTireForceSummary: state.lateralTireForceSummary,
            yawDynamics: {
                yawMomentNewtonMeters: state.forces.yawMomentNewtonMeters,
                yawMomentOfInertiaKilogramSquareMeters:
                    state.chassisMassPropertiesState.yawMomentOfInertiaKgMeterSquared,
                yawAccelerationRadiansPerSecondSquared:
                    state.planarMotion.yawAccelerationRadiansPerSecondSquared,
                yawVelocityRadiansPerSecond: state.planarMotion.yawRateRadiansPerSecond,
                yawAngleRadians: state.planarMotion.yawRadians,
                netLongitudinalYawMomentNewtonMeters:
                    state.forces.netLongitudinalYawMomentNewtonMeters,
                netLateralYawMomentNewtonMeters:
                    state.forces.netLateralYawMomentNewtonMeters,
                perWheelYawMomentContributions: state.wheelStates.map(
                    (wheelState) => ({
                        axle: wheelState.axle,
                        side: wheelState.side,
                        yawMomentContributionNewtonMeters:
                            wheelState.yawMomentContributionNewtonMeters ?? 0,
                    })
                ),
            },
            loadTransferSummary: state.loadTransferSummary,
            tirePressureHandlingSummary: state.tirePressureHandlingSummary,
            vehicleDynamicsStepTrace: state.vehicleDynamicsStepTrace,
            engineProfile: state.engineProfile,
            transmissionProfile: state.transmissionProfile,
            powertrain: createPowertrainSnapshot(
                state.engineProfile,
                state.transmissionProfile
            ),
            powertrainKinematics: state.powertrainKinematics,
            stockEngineCatalogTelemetry: createStockEngineCatalogTelemetry(
                state.engineProfile
            ),
        }
    }

    function setDynamicsTuning(nextDynamicsTuning = {}) {
        updateDynamicsTuningState(state.dynamicsTuning, {
            ...state.dynamicsTuning,
            ...nextDynamicsTuning,
        })

        return getDynamicsTuning()
    }

    function resetDynamicsTuning() {
        resetDynamicsTuningState(state.dynamicsTuning)

        return getDynamicsTuning()
    }

    function getDynamicsTuning() {
        return state.dynamicsTuning
    }

    function setRearDifferentialType(nextRearDifferentialType) {
        setActiveRearDifferentialType(
            state.rearDifferentialState,
            spec,
            nextRearDifferentialType
        )
        resetRearDifferentialState(state.rearDifferentialState, spec)
        refreshPostIntegrationTelemetry()

        return getRearDifferentialState()
    }

    function getRearDifferentialState() {
        return state.rearDifferentialState
    }

    function setTirePressureKpa(nextTirePressureKpa) {
        updateTirePressureState(
            state.tirePressureState,
            nextTirePressureKpa,
            spec
        )
        applyTirePressureStateToWheels()
        syncAggregateTirePressureStateFromWheels()
        updateWheelTirePressureHandlingState()
        applyTireInflationVisualState()
        refreshPostIntegrationTelemetry()

        return getTirePressureState()
    }

    function setWheelTirePressureKpa(wheelId, nextTirePressureKpa) {
        const wheelState = state.wheelStates.find((candidateWheelState) => (
            candidateWheelState.id === wheelId
        ))

        if (!wheelState) {
            throw new Error(`Unknown wheel id: ${wheelId}`)
        }

        updateTirePressureState(wheelState, nextTirePressureKpa, spec)
        syncAggregateTirePressureStateFromWheels()
        updateWheelTirePressureHandlingState()
        applyTireInflationVisualState()
        refreshPostIntegrationTelemetry()

        return getSnapshot()
    }

    function resetTirePressure() {
        return setTirePressureKpa(spec.defaultTirePressureKpa)
    }

    function getTirePressureState() {
        return state.tirePressureState
    }

    function readInput(input) {
        state.throttleInput = Boolean(input.throttle ?? input.forward) ? 1 : 0
        state.brakeInput = Boolean(input.brake ?? input.reverse) ? 1 : 0
        state.parkingBrakeInput = Boolean(input.parkingBrake) ? 1 : 0

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
        const safeMassKg = Number.isFinite(spec.massKg) && spec.massKg > 0
            ? spec.massKg
            : 1

        integratePlanarVelocityFromWorldAcceleration(
            state.planarMotion,
            forces.netForceWorldXNewtons / safeMassKg,
            forces.netForceWorldZNewtons / safeMassKg,
            dt
        )

        let nextForwardSpeedMetersPerSecond =
            state.planarMotion.localForwardVelocityMetersPerSecond
        let nextLateralSpeedMetersPerSecond =
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
            Math.abs(nextLateralSpeedMetersPerSecond) <
                params.stopEpsilonMetersPerSecond &&
            !isDriveTryingToMoveFromStop()
        ) {
            nextForwardSpeedMetersPerSecond = 0
            nextLateralSpeedMetersPerSecond = 0
        }

        setPlanarLocalVelocity(
            state.planarMotion,
            nextForwardSpeedMetersPerSecond,
            nextLateralSpeedMetersPerSecond
        )
        syncSpeedScalarFromPlanarState()
    }

    function calculatePlanarForcesFromWheelState() {
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

        let totalLongitudinalTireForceNewtons = 0
        let totalLateralTireForceNewtons = 0
        let totalTireForceWorldXNewtons = 0
        let totalTireForceWorldZNewtons = 0
        let totalRollingResistanceForceNewtons = 0
        let rollingResistanceForceWorldXNewtons = 0
        let rollingResistanceForceWorldZNewtons = 0
        let yawMomentNewtonMeters = 0
        let netLongitudinalYawMomentNewtonMeters = 0
        let netLateralYawMomentNewtonMeters = 0

        state.tirePressureHandlingSummary.totalRollingResistanceForceAbsNewtons = 0

        for (const wheelState of state.wheelStates) {
            if (!wheelState.isGrounded) {
                wheelState.rollingResistanceForceNewtons = 0
                wheelState.yawMomentContributionNewtonMeters = 0
                wheelState.planarTireForceWorldXNewtons = 0
                wheelState.planarTireForceWorldZNewtons = 0
                wheelState.planarTireForceLocalForwardNewtons = 0
                wheelState.planarTireForceLocalRightNewtons = 0
                continue
            }

            updateWheelPlanarTireForceComponents(wheelState)

            const localForwardForceNewtons =
                wheelState.planarTireForceLocalForwardNewtons
            const localRightForceNewtons =
                wheelState.planarTireForceLocalRightNewtons
            totalLongitudinalTireForceNewtons +=
                wheelState.appliedLongitudinalForceNewtons
            totalLateralTireForceNewtons +=
                wheelState.appliedLateralTireForceNewtons
            totalTireForceWorldXNewtons +=
                wheelState.planarTireForceWorldXNewtons
            totalTireForceWorldZNewtons +=
                wheelState.planarTireForceWorldZNewtons

            const forceApplicationPointLocal =
                wheelState.contactPatchLocal ?? wheelState.localPosition
            const wheelOffsetRightMeters = Number.isFinite(
                forceApplicationPointLocal?.x
            )
                ? forceApplicationPointLocal.x
                : 0
            const wheelOffsetForwardMeters = Number.isFinite(
                forceApplicationPointLocal?.z
            )
                ? forceApplicationPointLocal.z
                : 0
            // The chassis remains planar: yaw uses this same horizontal X/Z
            // tire-force projection and the authored horizontal lever arm.
            const wheelYawMomentContributionNewtonMeters =
                wheelOffsetForwardMeters * localRightForceNewtons -
                wheelOffsetRightMeters * localForwardForceNewtons

            yawMomentNewtonMeters += wheelYawMomentContributionNewtonMeters
            netLateralYawMomentNewtonMeters +=
                wheelOffsetForwardMeters * localRightForceNewtons
            netLongitudinalYawMomentNewtonMeters +=
                -wheelOffsetRightMeters * localForwardForceNewtons
            wheelState.yawMomentContributionNewtonMeters =
                wheelYawMomentContributionNewtonMeters

            const wheelRollingResistanceForceNewtons =
                calculateWheelRollingResistanceForce(
                    wheelState,
                    wheelState.wheelLocalForwardVelocityMetersPerSecond,
                    spec
                )
            const rollingResistanceDirectionWorld =
                wheelState.isContactTangentBasisValid
                    ? wheelState.contactForwardTangentWorld
                    : state.planarMotion.forwardWorld
            const wheelRollingResistanceForceWorldXNewtons =
                wheelRollingResistanceForceNewtons *
                rollingResistanceDirectionWorld.x
            const wheelRollingResistanceForceWorldZNewtons =
                wheelRollingResistanceForceNewtons *
                rollingResistanceDirectionWorld.z

            totalRollingResistanceForceNewtons +=
                wheelRollingResistanceForceNewtons
            rollingResistanceForceWorldXNewtons +=
                wheelRollingResistanceForceWorldXNewtons
            rollingResistanceForceWorldZNewtons +=
                wheelRollingResistanceForceWorldZNewtons
            state.tirePressureHandlingSummary.totalRollingResistanceForceAbsNewtons +=
                Math.abs(wheelRollingResistanceForceNewtons)
        }

        updateAerodynamicDragState(
            state.aerodynamicDragState,
            spec,
            state.planarMotion.worldVelocityMetersPerSecond,
            spec.massKg
        )
        updateSlopeGravityState()

        const aerodynamicDragForceNewtons =
            state.aerodynamicDragState.dragForceNewtons
        const aerodynamicDragForceWorldXNewtons =
            state.aerodynamicDragState.dragForceWorldXNewtons
        const aerodynamicDragForceWorldZNewtons =
            state.aerodynamicDragState.dragForceWorldZNewtons
        const aerodynamicDragForceLocalForwardNewtons =
            aerodynamicDragForceWorldXNewtons *
                state.planarMotion.forwardWorld.x +
            aerodynamicDragForceWorldZNewtons *
                state.planarMotion.forwardWorld.z
        const aerodynamicDragForceLocalLateralNewtons =
            aerodynamicDragForceWorldXNewtons *
                state.planarMotion.rightWorld.x +
            aerodynamicDragForceWorldZNewtons *
                state.planarMotion.rightWorld.z
        const rollingResistanceForceLocalForwardNewtons =
            rollingResistanceForceWorldXNewtons *
                state.planarMotion.forwardWorld.x +
            rollingResistanceForceWorldZNewtons *
                state.planarMotion.forwardWorld.z
        const rollingResistanceForceLocalLateralNewtons =
            rollingResistanceForceWorldXNewtons *
                state.planarMotion.rightWorld.x +
            rollingResistanceForceWorldZNewtons *
                state.planarMotion.rightWorld.z
        const slopeGravityForceWorldXNewtons =
            state.slopeGravityState.slopeGravityForceWorld.x
        const slopeGravityForceWorldZNewtons =
            state.slopeGravityState.slopeGravityForceWorld.z
        const slopeGravityForceLocalForwardNewtons =
            slopeGravityForceWorldXNewtons * state.planarMotion.forwardWorld.x +
            slopeGravityForceWorldZNewtons * state.planarMotion.forwardWorld.z
        const slopeGravityForceLocalLateralNewtons =
            slopeGravityForceWorldXNewtons * state.planarMotion.rightWorld.x +
            slopeGravityForceWorldZNewtons * state.planarMotion.rightWorld.z

        const totalTireForceLocalForwardNewtons =
            totalTireForceWorldXNewtons * state.planarMotion.forwardWorld.x +
            totalTireForceWorldZNewtons * state.planarMotion.forwardWorld.z
        const totalTireForceLocalRightNewtons =
            totalTireForceWorldXNewtons * state.planarMotion.rightWorld.x +
            totalTireForceWorldZNewtons * state.planarMotion.rightWorld.z
        const netLongitudinalForceNewtons =
            totalTireForceLocalForwardNewtons +
            rollingResistanceForceLocalForwardNewtons +
            aerodynamicDragForceLocalForwardNewtons +
            slopeGravityForceLocalForwardNewtons
        const netLateralForceNewtons =
            totalTireForceLocalRightNewtons +
            rollingResistanceForceLocalLateralNewtons +
            aerodynamicDragForceLocalLateralNewtons +
            slopeGravityForceLocalLateralNewtons
        const netForceWorldXNewtons =
            totalTireForceWorldXNewtons +
            rollingResistanceForceWorldXNewtons +
            aerodynamicDragForceWorldXNewtons +
            slopeGravityForceWorldXNewtons
        const netForceWorldZNewtons =
            totalTireForceWorldZNewtons +
            rollingResistanceForceWorldZNewtons +
            aerodynamicDragForceWorldZNewtons +
            slopeGravityForceWorldZNewtons
        const safeMassKg = Number.isFinite(spec.massKg) && spec.massKg > 0
            ? spec.massKg
            : 1
        const yawAccelerationRadiansPerSecondSquared =
            spec.yawMomentOfInertiaKgMeterSquared > 0
                ? yawMomentNewtonMeters /
                    spec.yawMomentOfInertiaKgMeterSquared
                : 0
        const tractionLimitedWheelCount = countTractionLimitedWheels()

        return {
            normalForceNewtons,
            tractionLimitLongitudinalNewtons,
            driveForceNewtons,
            brakeForceNewtons,
            requestedTireForceNewtons,
            appliedTireForceNewtons: totalLongitudinalTireForceNewtons,
            totalLongitudinalTireForceNewtons,
            totalLateralTireForceNewtons,
            totalTireForceWorldXNewtons,
            totalTireForceWorldZNewtons,
            rollingResistanceForceNewtons: totalRollingResistanceForceNewtons,
            rollingResistanceForceWorldXNewtons,
            rollingResistanceForceWorldZNewtons,
            aerodynamicDragForceNewtons,
            aerodynamicDragForceWorldXNewtons,
            aerodynamicDragForceWorldZNewtons,
            aerodynamicDragForceLocalForwardNewtons,
            aerodynamicDragForceLocalLateralNewtons,
            slopeGravityForceNewtons:
                state.slopeGravityState.slopeGravityForceNewtons,
            slopeGravityForceWorldXNewtons,
            slopeGravityForceWorldZNewtons,
            slopeGravityForceLocalForwardNewtons,
            slopeGravityForceLocalLateralNewtons,
            netLongitudinalForceNewtons,
            netLateralForceNewtons,
            netForceWorldXNewtons,
            netForceWorldZNewtons,
            longitudinalAccelerationMetersPerSecondSquared:
                netLongitudinalForceNewtons / safeMassKg,
            lateralAccelerationMetersPerSecondSquared:
                netLateralForceNewtons / safeMassKg,
            yawMomentNewtonMeters,
            yawAccelerationRadiansPerSecondSquared,
            netLongitudinalYawMomentNewtonMeters,
            netLateralYawMomentNewtonMeters,
            isTractionLimited: tractionLimitedWheelCount > 0,
            tractionLimitedWheelCount,
        }
    }

    function updateWheelPlanarTireForceComponents(wheelState) {
        const longitudinalForceNewtons = Number.isFinite(
            wheelState.appliedLongitudinalForceNewtons
        )
            ? wheelState.appliedLongitudinalForceNewtons
            : 0
        const lateralForceNewtons = Number.isFinite(
            wheelState.appliedLateralTireForceNewtons
        )
            ? wheelState.appliedLateralTireForceNewtons
            : 0

        if (wheelState.isContactTangentBasisValid) {
            wheelState.tireForceWorld
                .copy(wheelState.contactForwardTangentWorld)
                .multiplyScalar(longitudinalForceNewtons)
                .addScaledVector(
                    wheelState.contactLateralTangentWorld,
                    lateralForceNewtons
                )
        } else {
            const steeringAngleRadians = Number.isFinite(
                wheelState.steeringAngleRadians
            )
                ? wheelState.steeringAngleRadians
                : 0
            const steeringSin = Math.sin(steeringAngleRadians)
            const steeringCos = Math.cos(steeringAngleRadians)
            const localForwardForceNewtons =
                longitudinalForceNewtons * steeringCos -
                lateralForceNewtons * steeringSin
            const localRightForceNewtons =
                longitudinalForceNewtons * steeringSin +
                lateralForceNewtons * steeringCos

            wheelState.tireForceWorld
                .copy(state.planarMotion.forwardWorld)
                .multiplyScalar(localForwardForceNewtons)
                .addScaledVector(
                    state.planarMotion.rightWorld,
                    localRightForceNewtons
                )
        }

        wheelState.planarTireForceWorldXNewtons =
            wheelState.tireForceWorld.x
        wheelState.planarTireForceWorldZNewtons =
            wheelState.tireForceWorld.z
        wheelState.planarTireForceLocalForwardNewtons =
            wheelState.planarTireForceWorldXNewtons *
                state.planarMotion.forwardWorld.x +
            wheelState.planarTireForceWorldZNewtons *
                state.planarMotion.forwardWorld.z
        wheelState.planarTireForceLocalRightNewtons =
            wheelState.planarTireForceWorldXNewtons *
                state.planarMotion.rightWorld.x +
            wheelState.planarTireForceWorldZNewtons *
                state.planarMotion.rightWorld.z
    }

    function updateSlopeGravityState() {
        const slopeGravityState = state.slopeGravityState
        resetSlopeGravityState(slopeGravityState)
        slopeGravityState.enabled = spec.slopeGravityEnabled !== false

        if (!slopeGravityState.enabled) return

        let totalSupportNormalForceNewtons = 0

        for (const wheelState of state.wheelStates) {
            const normalForceNewtons = Number.isFinite(
                wheelState.normalForceNewtons
            ) && wheelState.normalForceNewtons > 0
                ? wheelState.normalForceNewtons
                : 0

            if (
                !wheelState.isGrounded ||
                normalForceNewtons <= 0 ||
                !wheelState.contactNormalWorld?.isVector3 ||
                wheelState.contactNormalWorld.lengthSq() <= Number.EPSILON
            ) {
                continue
            }

            slopeGravityState.supportNormalWorld.addScaledVector(
                wheelState.contactNormalWorld,
                normalForceNewtons
            )
            totalSupportNormalForceNewtons += normalForceNewtons
        }

        if (totalSupportNormalForceNewtons <= 0 ||
            slopeGravityState.supportNormalWorld.lengthSq() <= Number.EPSILON) {
            slopeGravityState.supportNormalWorld.set(0, 1, 0)
            return
        }

        const gravityMetersPerSecondSquared = Number.isFinite(
            spec.gravityMetersPerSecondSquared
        ) && spec.gravityMetersPerSecondSquared > 0
            ? spec.gravityMetersPerSecondSquared
            : 9.80665
        const massKg = Number.isFinite(spec.massKg) && spec.massKg > 0
            ? spec.massKg
            : 1

        slopeGravityState.isSupported = true
        slopeGravityState.supportNormalWorld.normalize()
        slopeGravityState.supportSlopeDegrees = Math.acos(
            THREE.MathUtils.clamp(slopeGravityState.supportNormalWorld.y, -1, 1)
        ) * (180 / Math.PI)
        slopeGravityState.gravityTangentWorld
            .set(0, -gravityMetersPerSecondSquared, 0)
            .addScaledVector(
                slopeGravityState.supportNormalWorld,
                gravityMetersPerSecondSquared *
                    slopeGravityState.supportNormalWorld.y
            )
        slopeGravityState.slopeGravityForceWorld
            .copy(slopeGravityState.gravityTangentWorld)
            .multiplyScalar(massKg)
        slopeGravityState.slopeGravityForceWorld.y = 0
        slopeGravityState.slopeGravityForceNewtons = Math.hypot(
            slopeGravityState.slopeGravityForceWorld.x,
            slopeGravityState.slopeGravityForceWorld.z
        )
    }


    function getWheelRollingRadiusMeters(wheelState) {
        const effectiveTireRollingRadiusMeters = Number.isFinite(
            wheelState.effectiveTireRollingRadiusMeters
        )
            ? wheelState.effectiveTireRollingRadiusMeters
            : wheelState.radius

        if (
            Number.isFinite(effectiveTireRollingRadiusMeters) &&
            effectiveTireRollingRadiusMeters > 0
        ) {
            return effectiveTireRollingRadiusMeters
        }

        return Number.isFinite(wheelState.radius) && wheelState.radius > 0
            ? wheelState.radius
            : spec.baseTireRollingRadiusMeters
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


    function updateYawState(dt) {
        integrateYawAcceleration(
            state.planarMotion,
            state.forces.yawAccelerationRadiansPerSecondSquared,
            spec.yawRateDampingPerSecond,
            spec.maxYawRateRadiansPerSecond,
            dt
        )
    }
    function updatePosition(dt) {
        integratePlanarPosition(vehicle.position, state.planarMotion, dt)
    }

    function syncVehicleYawFromPlanarState() {
        vehicle.rotation.y = state.planarMotion.yawRadians
    }

    function updateChassisAttitude(dtSeconds) {
        chassisAttitudeSpecOverride.chassisAttitudeResponseSeconds =
            state.dynamicsTuning.chassisAttitudeResponseSeconds
        chassisAttitudeSpecOverride.chassisAttitudeMaximumHeaveOffsetMeters =
            state.dynamicsTuning.chassisAttitudeMaximumHeaveOffsetMeters
        chassisAttitudeSpecOverride.chassisAttitudeMaximumPitchRadians =
            state.dynamicsTuning.chassisAttitudeMaximumPitchRadians
        chassisAttitudeSpecOverride.chassisAttitudeMaximumRollRadians =
            state.dynamicsTuning.chassisAttitudeMaximumRollRadians
        updateChassisAttitudeState(
            state.chassisAttitudeState,
            state.wheelStates,
            chassisAttitudeSpecOverride,
            dtSeconds
        )
    }

    function applyChassisAttitudeVisualState() {
        vehicle.userData.vehicle?.setChassisAttitudeVisualState?.(
            state.chassisAttitudeState
        )
    }

    function syncSpeedScalarFromPlanarState() {
        state.speedScalar =
            state.planarMotion.localForwardVelocityMetersPerSecond
    }

    function applyTirePressureStateToWheels() {
        for (const wheelState of state.wheelStates) {
            updateTirePressureState(
                wheelState,
                state.tirePressureState.tirePressureKpa,
                spec
            )
        }
    }

    function syncAggregateTirePressureStateFromWheels() {
        let totalTirePressureKpa = 0
        let sampledWheelCount = 0

        for (const wheelState of state.wheelStates) {
            if (!Number.isFinite(wheelState.tirePressureKpa)) {
                continue
            }

            totalTirePressureKpa += wheelState.tirePressureKpa
            sampledWheelCount += 1
        }

        const nextTirePressureKpa =
            sampledWheelCount > 0
                ? totalTirePressureKpa / sampledWheelCount
                : spec.defaultTirePressureKpa

        updateTirePressureState(
            state.tirePressureState,
            nextTirePressureKpa,
            spec
        )
    }

    function applyTireInflationVisualState() {
        vehicle.userData.vehicle?.setTireInflationVisualState?.(
            state.tirePressureState,
            state.wheelStates
        )
    }

    function updateTerrainSupportAndWheelContactState(
        dtSeconds,
        advancePersistentState = true,
        snapSupportHeightToTarget = false
    ) {
        updateChassisTerrainSupportHeight(
            dtSeconds,
            advancePersistentState,
            snapSupportHeightToTarget
        )
        // Pressure owns the physical effective radius. It must update before
        // suspension contact so the ray geometry never falls back to the
        // authored visual radius.
        updateWheelTirePressureHandlingState()
        updateWheelContactStates(advancePersistentState)

        if (!advancePersistentState) {
            updateWheelContactPlaneBases()
            return
        }

        updateSuspensionNormalForceState(
            state.wheelStates,
            spec,
            dtSeconds,
            state.suspensionNormalForceSummary
        )
        updateWheelSuspensionContactLimitStatuses()
        updateWheelLoadTransferState()
        updateWheelContactPlaneBases()
    }

    function updateWheelSuspensionContactLimitStatuses() {
        for (const wheelState of state.wheelStates) {
            if (!wheelState.isGrounded ||
                wheelState.isWithinSuspensionContactHysteresis) {
                continue
            }

            if (wheelState.isSuspensionAtCompressionLimit) {
                wheelState.suspensionContactStatus =
                    'grounded-at-compression-limit'
            } else if (wheelState.isSuspensionAtDroopLimit) {
                wheelState.suspensionContactStatus = 'grounded-at-droop-limit'
            } else {
                wheelState.suspensionContactStatus = 'grounded'
            }
        }
    }

    function updateChassisTerrainSupportHeight(
        dtSeconds,
        advancePersistentState,
        snapSupportHeightToTarget
    ) {
        updateChassisTerrainSupportState(state.chassisTerrainSupportState, {
            terrainContactQuery,
            worldXMeters: vehicle.position.x,
            worldZMeters: vehicle.position.z,
            baselineOffsetMeters:
                spec.chassisTerrainSupportBaselineOffsetMeters,
            responseSeconds:
                spec.chassisTerrainSupportHeightResponseSeconds,
            dtSeconds,
            advancePersistentState,
            snapToTarget: snapSupportHeightToTarget,
        })

        if (advancePersistentState) {
            vehicle.position.y =
                state.chassisTerrainSupportState.currentChassisSupportHeightMeters
        }
    }

    function updateWheelContactStates(advanceContactHysteresis = true) {
        vehicle.updateMatrixWorld(true)

        for (const wheelState of state.wheelStates) {
            updateWheelContactState(wheelState, advanceContactHysteresis)
        }
    }

    function updateWheelContactState(wheelState, advanceContactHysteresis) {
        const suspensionMountLocalPosition =
            wheelState.suspensionMountLocalPosition ?? wheelState.localPosition
        const suspensionAxisDownLocal =
            wheelState.suspensionAxisDownLocal ?? DEFAULT_SUSPENSION_DOWN_LOCAL

        wheelState.suspensionMountWorld
            .copy(suspensionMountLocalPosition)
            .applyMatrix4(vehicle.matrixWorld)
        wheelState.suspensionAxisDownWorld
            .copy(suspensionAxisDownLocal)
            .transformDirection(vehicle.matrixWorld)

        if (wheelState.suspensionAxisDownWorld.lengthSq() <= Number.EPSILON) {
            wheelState.suspensionAxisDownWorld.copy(DEFAULT_SUSPENSION_DOWN_LOCAL)
        }
        wheelState.suspensionAxisDownWorld.normalize()

        const effectiveWheelRadiusMeters = getWheelRollingRadiusMeters(wheelState)
        const suspensionContactQueryResult =
            wheelState.suspensionContactQueryResult

        if (typeof terrainContactQuery.querySuspensionContact === 'function') {
            terrainContactQuery.querySuspensionContact(
                {
                    rayOriginWorld: wheelState.suspensionMountWorld,
                    suspensionDownDirectionWorld:
                        wheelState.suspensionAxisDownWorld,
                    maximumRayDistanceMeters:
                        resolveMaximumSuspensionRayDistanceMeters(),
                    wheelRadiusMeters: effectiveWheelRadiusMeters,
                    minimumNormalAlignmentCosine:
                        resolveMinimumSuspensionNormalAlignmentCosine(),
                },
                suspensionContactQueryResult
            )
        } else {
            queryFlatSuspensionContact(
                wheelState,
                effectiveWheelRadiusMeters,
                suspensionContactQueryResult
            )
        }

        const suspensionMinimumLengthMeters =
            resolveSuspensionMinimumLengthMeters()
        const suspensionMaximumLengthMeters =
            resolveSuspensionMaximumLengthMeters()
        const wheelCenterDistanceAlongSuspensionMeters = Number.isFinite(
            suspensionContactQueryResult.wheelCenterDistanceAlongSuspensionMeters
        )
            ? suspensionContactQueryResult.wheelCenterDistanceAlongSuspensionMeters
            : Number.POSITIVE_INFINITY
        const wasSuspensionContactRetained =
            wheelState.isSuspensionContactRetained === true
        const contactSlopMeters = wasSuspensionContactRetained
            ? resolveSuspensionContactReleaseSlopMeters()
            : resolveSuspensionContactAcquireSlopMeters()
        const hasValidSuspensionContact =
            suspensionContactQueryResult.hasContact === true &&
            wheelCenterDistanceAlongSuspensionMeters >= 0 &&
            wheelCenterDistanceAlongSuspensionMeters <=
                suspensionMaximumLengthMeters + contactSlopMeters
        const isWithinContactHysteresis =
            hasValidSuspensionContact &&
            wheelCenterDistanceAlongSuspensionMeters >
                suspensionMaximumLengthMeters

        wheelState.isGrounded = hasValidSuspensionContact
        wheelState.isWithinSuspensionContactHysteresis =
            isWithinContactHysteresis
        if (advanceContactHysteresis) {
            wheelState.isSuspensionContactRetained = hasValidSuspensionContact
        }

        wheelState.suspensionRawLengthMeters = Number.isFinite(
            wheelCenterDistanceAlongSuspensionMeters
        )
            ? wheelCenterDistanceAlongSuspensionMeters
            : suspensionMaximumLengthMeters
        wheelState.suspensionCurrentLengthMeters = hasValidSuspensionContact
            ? THREE.MathUtils.clamp(
                wheelCenterDistanceAlongSuspensionMeters,
                suspensionMinimumLengthMeters,
                suspensionMaximumLengthMeters
            )
            : suspensionMaximumLengthMeters

        wheelState.wheelCenterLocalPosition
            .copy(suspensionMountLocalPosition)
            .addScaledVector(
                suspensionAxisDownLocal,
                wheelState.suspensionCurrentLengthMeters
            )
        wheelState.wheelCenterWorldPosition
            .copy(wheelState.suspensionMountWorld)
            .addScaledVector(
                wheelState.suspensionAxisDownWorld,
                wheelState.suspensionCurrentLengthMeters
            )

        copySuspensionContactResultToWheelState(
            wheelState,
            suspensionContactQueryResult,
            effectiveWheelRadiusMeters,
            hasValidSuspensionContact
        )

        if (hasValidSuspensionContact) {
            wheelState.suspensionContactStatus = isWithinContactHysteresis
                ? 'within-contact-hysteresis'
                : wheelState.isSuspensionAtCompressionLimit
                    ? 'grounded-at-compression-limit'
                    : 'grounded'
        } else if (
            suspensionContactQueryResult.hasTerrainIntersection === true &&
            wheelCenterDistanceAlongSuspensionMeters >
                suspensionMaximumLengthMeters + contactSlopMeters
        ) {
            wheelState.suspensionContactStatus = 'beyond-suspension-droop'
        } else {
            wheelState.suspensionContactStatus =
                suspensionContactQueryResult.status ?? 'no-intersection'
        }
    }

    function copySuspensionContactResultToWheelState(
        wheelState,
        result,
        effectiveWheelRadiusMeters,
        isGrounded
    ) {
        const hasSurfaceIntersection = result.hasTerrainIntersection === true ||
            result.hasContact === true
        const hasFiniteContactPoint =
            Number.isFinite(result.contactPointWorld?.x) &&
            Number.isFinite(result.contactPointWorld?.y) &&
            Number.isFinite(result.contactPointWorld?.z)

        if (hasSurfaceIntersection && hasFiniteContactPoint) {
            wheelState.contactPointWorldPosition.copy(result.contactPointWorld)
            wheelState.contactPatchWorldPosition.copy(result.contactPointWorld)
        } else {
            wheelState.contactPointWorldPosition
                .copy(wheelState.wheelCenterWorldPosition)
                .addScaledVector(
                    wheelState.suspensionAxisDownWorld,
                    effectiveWheelRadiusMeters
                )
            wheelState.contactPatchWorldPosition.copy(
                wheelState.contactPointWorldPosition
            )
        }

        if (
            Number.isFinite(result.contactNormalWorld?.x) &&
            Number.isFinite(result.contactNormalWorld?.y) &&
            Number.isFinite(result.contactNormalWorld?.z)
        ) {
            wheelState.contactNormalWorld.copy(result.contactNormalWorld)
        } else {
            wheelState.contactNormalWorld.set(0, 1, 0)
        }
        if (wheelState.contactNormalWorld.lengthSq() <= Number.EPSILON) {
            wheelState.contactNormalWorld.set(0, 1, 0)
        }
        wheelState.contactNormalWorld.normalize()

        wheelState.groundHeightMeters = Number.isFinite(result.terrainHeightMeters)
            ? result.terrainHeightMeters
            : wheelState.contactPointWorldPosition.y
        wheelState.terrainHeightMeters = wheelState.groundHeightMeters
        wheelState.distanceToGroundMeters =
            wheelState.wheelCenterWorldPosition.y -
            wheelState.contactPointWorldPosition.y
        wheelState.centerToContactOffsetWorld
            .copy(wheelState.wheelCenterWorldPosition)
            .sub(wheelState.contactPointWorldPosition)
        wheelState.centerToContactPlaneDistanceMeters =
            wheelState.contactNormalWorld.dot(
                wheelState.centerToContactOffsetWorld
            )
        wheelState.tirePenetrationMeters = Math.max(
            0,
            effectiveWheelRadiusMeters -
                wheelState.centerToContactPlaneDistanceMeters
        )
        wheelState.surfaceKind = result.surfaceKind ?? 'unavailable'
        wheelState.frictionCoefficient = Number.isFinite(
            result.frictionCoefficient
        )
            ? result.frictionCoefficient
            : spec.defaultSurfaceFrictionCoefficient
        wheelState.isInsideTerrainBounds = result.isInsideTerrainBounds === true
        wheelState.terrainProfileName = result.profileName ?? 'unavailable'
        wheelState.contactSlopeDegrees = Number.isFinite(result.slopeDegrees)
            ? result.slopeDegrees
            : 0
        wheelState.suspensionNormalAlignmentCosine = Number.isFinite(
            result.normalAlignmentCosine
        )
            ? result.normalAlignmentCosine
            : 0
        wheelState.isGrounded = isGrounded
    }

    function queryFlatSuspensionContact(
        wheelState,
        effectiveWheelRadiusMeters,
        target
    ) {
        terrainContactQuery.queryAtWorldXZ(
            wheelState.suspensionMountWorld.x,
            wheelState.suspensionMountWorld.z,
            wheelState.terrainContactQueryResult
        )
        const surfaceResult = wheelState.terrainContactQueryResult
        const rayDownY = wheelState.suspensionAxisDownWorld.y

        target.isInsideTerrainBounds =
            surfaceResult.isInsideTerrainBounds === true
        target.isWithinBounds = target.isInsideTerrainBounds
        target.hasContact = false
        target.hasTerrainIntersection = false
        target.status = target.isInsideTerrainBounds
            ? 'no-intersection'
            : 'outside-terrain-bounds'
        target.surfaceKind = surfaceResult.surfaceKind
        target.frictionCoefficient = surfaceResult.frictionCoefficient
        target.profileName = surfaceResult.profileName ?? 'flat-fallback'
        target.terrainHeightMeters = surfaceResult.groundHeightMeters
        target.slopeDegrees = 0
        target.contactNormalWorld.copy(surfaceResult.normalWorld)
        target.rayOriginWorld.copy(wheelState.suspensionMountWorld)
        target.suspensionDownDirectionWorld.copy(
            wheelState.suspensionAxisDownWorld
        )

        if (!target.isInsideTerrainBounds || rayDownY >= -Number.EPSILON) {
            return target
        }

        const rayDistanceMeters =
            (surfaceResult.groundHeightMeters -
                wheelState.suspensionMountWorld.y) /
            rayDownY
        const normalAlignmentCosine = -wheelState.suspensionAxisDownWorld.dot(
            target.contactNormalWorld
        )

        if (
            !Number.isFinite(rayDistanceMeters) ||
            rayDistanceMeters < 0 ||
            !Number.isFinite(normalAlignmentCosine) ||
            normalAlignmentCosine <
                resolveMinimumSuspensionNormalAlignmentCosine()
        ) {
            target.status = 'surface-too-steep'
            return target
        }

        target.rayDistanceMeters = rayDistanceMeters
        target.terrainRayDistanceMeters = rayDistanceMeters
        target.normalAlignmentCosine = normalAlignmentCosine
        target.centerToContactDistanceAlongSuspensionMeters =
            effectiveWheelRadiusMeters / normalAlignmentCosine
        target.wheelCenterDistanceAlongSuspensionMeters =
            target.rayDistanceMeters -
            target.centerToContactDistanceAlongSuspensionMeters
        target.contactPointWorld
            .copy(wheelState.suspensionMountWorld)
            .addScaledVector(
                wheelState.suspensionAxisDownWorld,
                rayDistanceMeters
            )
        target.contactPointWorld.y = surfaceResult.groundHeightMeters
        target.hasTerrainIntersection = true
        target.hasContact = true
        target.status = 'surface-intersection'

        return target
    }

    function updateWheelContactPlaneBases() {
        for (const wheelState of state.wheelStates) {
            updateWheelContactPlaneBasis(wheelState, state.planarMotion)
            updateWheelContactPatchPlanarVelocity(wheelState, state.planarMotion)
        }
    }

    function updateWheelLoadTransferState() {
        // Quasi-static load transfer reads prior-step planar acceleration. The
        // suspension module owns only normalized base support; this module owns
        // the final normal force after acceleration-driven redistribution.
        updateLoadTransferState(
            state.wheelStates,
            state.planarMotion,
            spec,
            state.loadTransferSummary
        )
    }

    function resolveSuspensionMaximumLengthMeters() {
        const restLengthMeters = Number.isFinite(spec.suspensionRestLengthMeters) &&
            spec.suspensionRestLengthMeters > 0
            ? spec.suspensionRestLengthMeters
            : 0.35
        return Number.isFinite(spec.suspensionMaximumLengthMeters) &&
            spec.suspensionMaximumLengthMeters > 0
            ? spec.suspensionMaximumLengthMeters
            : restLengthMeters
    }

    function resolveSuspensionMinimumLengthMeters() {
        const maximumLengthMeters = resolveSuspensionMaximumLengthMeters()
        const travelMeters = Number.isFinite(spec.suspensionTravelMeters) &&
            spec.suspensionTravelMeters > 0
            ? spec.suspensionTravelMeters
            : 0.22
        const configuredMinimumLengthMeters = Number.isFinite(
            spec.suspensionMinimumLengthMeters
        ) && spec.suspensionMinimumLengthMeters > 0
            ? spec.suspensionMinimumLengthMeters
            : maximumLengthMeters - travelMeters

        return THREE.MathUtils.clamp(
            configuredMinimumLengthMeters,
            Number.EPSILON,
            maximumLengthMeters - Number.EPSILON
        )
    }

    function resolveMaximumSuspensionRayDistanceMeters() {
        const maximumLengthMeters = resolveSuspensionMaximumLengthMeters()
        const configuredRayDistanceMeters = Number.isFinite(
            spec.maximumSuspensionRayDistanceMeters
        ) && spec.maximumSuspensionRayDistanceMeters > 0
            ? spec.maximumSuspensionRayDistanceMeters
            : maximumLengthMeters + spec.baseTireRollingRadiusMeters + 0.2

        return Math.max(configuredRayDistanceMeters, maximumLengthMeters)
    }

    function resolveMinimumSuspensionNormalAlignmentCosine() {
        return THREE.MathUtils.clamp(
            Number.isFinite(spec.minimumSuspensionNormalAlignmentCosine)
                ? spec.minimumSuspensionNormalAlignmentCosine
                : 0.25,
            0.01,
            0.99
        )
    }

    function resolveSuspensionContactAcquireSlopMeters() {
        return Math.max(
            0,
            Number.isFinite(spec.suspensionContactAcquireSlopMeters)
                ? spec.suspensionContactAcquireSlopMeters
                : 0.004
        )
    }

    function resolveSuspensionContactReleaseSlopMeters() {
        return Math.max(
            resolveSuspensionContactAcquireSlopMeters(),
            Number.isFinite(spec.suspensionContactReleaseSlopMeters)
                ? spec.suspensionContactReleaseSlopMeters
                : 0.012
        )
    }

    function updateWheelTirePressureHandlingState() {
        updateTirePressureHandlingState(
            state.wheelStates,
            spec,
            state.tirePressureHandlingSummary
        )
    }

    function refreshPostIntegrationTelemetry() {
        // Keep the contact/normal state that supplied this step's integration
        // input. Re-querying after X/Z integration would make the published
        // grounded flag disagree with the normal forces and tire forces that
        // were actually integrated. The next fixed step owns the next contact
        // sample; this pass only refreshes non-integrating traction telemetry.
        updateLongitudinalTractionStates()
    }

    function calculatePerWheelLongitudinalForces(dt) {
        resetWheelForceAndBrakeTorqueRequests()
        resetRearDifferentialStepState(state.rearDifferentialState, spec)
        updateBrakeTorqueStates(dt)

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
            resetWheelLongitudinalTireForceStepState(wheelState, spec)
            resetWheelLateralTireForceState(wheelState)
            wheelState.isSlipping = false
            resetWheelBrakeTorqueState(wheelState)
        }
    }

    function updateBrakeTorqueStates(dt) {
        const serviceBrakePressure01 = THREE.MathUtils.clamp(
            state.brakeInput,
            0,
            1
        )
        const parkingBrakePressure01 = THREE.MathUtils.clamp(
            state.parkingBrakeInput,
            0,
            1
        )

        const requestedServiceBrakeTorqueNewtonMeters =
            spec.maxServiceBrakeTorqueNewtonMeters *
            state.dynamicsTuning.serviceBrakeTorqueMultiplier *
            serviceBrakePressure01
        const requestedParkingBrakeTorqueNewtonMeters =
            spec.maxParkingBrakeTorqueNewtonMeters *
            parkingBrakePressure01

        // One-step explicit control approximation: service-brake ABS uses slip
        // and service-brake lock telemetry from the prior fixed step when
        // modulating this step's service brake torque command.
        // Service brake bias v1 splits torque by axle using serviceBrakeFrontBias01.
        // Parking brake torque remains rear-only and unaffected by service brake bias.
        const serviceBrakeFrontBias01 = spec.serviceBrakeFrontBias01 ?? 0.65
        const frontWheelCount = state.wheelStates.filter(w => w.axle === 'front').length
        const rearWheelCount = state.wheelStates.filter(w => w.axle === 'rear').length
        const totalServiceBrakeTorqueNewtonMeters = requestedServiceBrakeTorqueNewtonMeters
        const frontServiceBrakeTorquePerWheelNewtonMeters =
            frontWheelCount > 0
                ? totalServiceBrakeTorqueNewtonMeters * serviceBrakeFrontBias01 / frontWheelCount
                : 0
        const rearServiceBrakeTorquePerWheelNewtonMeters =
            rearWheelCount > 0
                ? totalServiceBrakeTorqueNewtonMeters * (1 - serviceBrakeFrontBias01) / rearWheelCount
                : 0

        for (const wheelState of state.wheelStates) {
            const parkingBrakeAppliesToWheel =
                !spec.parkingBrakeActsOnRearWheelsOnly ||
                wheelState.axle === 'rear'
            const requestedParkingBrakeTorquePerWheelNewtonMeters =
                parkingBrakeAppliesToWheel
                    ? requestedParkingBrakeTorqueNewtonMeters
                    : 0

            const requestedServiceBrakeTorquePerWheelNewtonMeters =
                wheelState.axle === 'front'
                    ? frontServiceBrakeTorquePerWheelNewtonMeters
                    : rearServiceBrakeTorquePerWheelNewtonMeters

            wheelState.serviceBrakePressure01 = serviceBrakePressure01
            wheelState.parkingBrakePressure01 = parkingBrakePressure01
            wheelState.serviceBrakeFrontBiasShare01 = serviceBrakeFrontBias01
            wheelState.requestedServiceBrakeTorqueNewtonMeters =
                requestedServiceBrakeTorquePerWheelNewtonMeters
            wheelState.requestedParkingBrakeTorqueNewtonMeters =
                requestedParkingBrakeTorquePerWheelNewtonMeters

            updateWheelServiceBrakeAbsState(
                wheelState,
                spec,
                serviceBrakePressure01,
                requestedServiceBrakeTorquePerWheelNewtonMeters,
                dt
            )

            const appliedServiceBrakeTorqueNewtonMeters =
                wheelState.serviceBrakeTorqueAfterAbsNewtonMeters
            const appliedParkingBrakeTorqueNewtonMeters =
                requestedParkingBrakeTorquePerWheelNewtonMeters
            const totalBrakeTorqueNewtonMeters =
                appliedServiceBrakeTorqueNewtonMeters +
                appliedParkingBrakeTorqueNewtonMeters

            wheelState.appliedServiceBrakeTorqueNewtonMeters =
                appliedServiceBrakeTorqueNewtonMeters
            wheelState.appliedParkingBrakeTorqueNewtonMeters =
                appliedParkingBrakeTorqueNewtonMeters
            wheelState.totalBrakeTorqueNewtonMeters =
                totalBrakeTorqueNewtonMeters
            wheelState.requestedBrakeTorqueNewtonMeters =
                requestedServiceBrakeTorquePerWheelNewtonMeters +
                requestedParkingBrakeTorquePerWheelNewtonMeters
            wheelState.appliedBrakeTorqueNewtonMeters =
                totalBrakeTorqueNewtonMeters
            wheelState.isServiceBraking =
                appliedServiceBrakeTorqueNewtonMeters > 0
            wheelState.isParkingBraking =
                appliedParkingBrakeTorqueNewtonMeters > 0
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

        return (
            gearDirection *
            maxDriveForce *
            state.dynamicsTuning.driveTorqueMultiplier *
            state.throttleInput
        )
    }

    function distributeDriveForceRequestToWheels(totalDriveForceNewtons) {
        const drivenWheelStates = state.wheelStates.filter(
            (wheelState) => wheelState.driven
        )
        const drivenRearWheelStates = drivenWheelStates.filter(
            (wheelState) => wheelState.axle === 'rear'
        )

        if (
            drivenWheelStates.length === 2 &&
            drivenRearWheelStates.length === 2
        ) {
            updateRearDifferentialDriveForceSplit(
                state.rearDifferentialState,
                drivenRearWheelStates,
                totalDriveForceNewtons,
                spec
            )

            for (const wheelState of drivenRearWheelStates) {
                const outputDriveForceNewtons =
                    wheelState.side === 'left'
                        ? state.rearDifferentialState.rearDifferentialLeftOutputDriveForceNewtons
                        : state.rearDifferentialState.rearDifferentialRightOutputDriveForceNewtons

                wheelState.requestedDriveForceNewtons = outputDriveForceNewtons
                wheelState.requestedLongitudinalForceNewtons +=
                    outputDriveForceNewtons
            }

            return
        }

        distributeDriveForceRequestEquallyAcrossDrivenWheels(
            totalDriveForceNewtons
        )
        resetRearDifferentialState(state.rearDifferentialState, spec)
        state.rearDifferentialState.rearDifferentialInputDriveForceNewtons =
            Number.isFinite(totalDriveForceNewtons)
                ? totalDriveForceNewtons
                : 0
    }

    function distributeDriveForceRequestEquallyAcrossDrivenWheels(
        totalDriveForceNewtons
    ) {
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

        // Service brake bias v1: split brake force by axle.
        const serviceBrakeFrontBias01 = spec.serviceBrakeFrontBias01 ?? 0.65
        const frontWheelCount = state.wheelStates.filter(w => w.axle === 'front').length
        const rearWheelCount = state.wheelStates.filter(w => w.axle === 'rear').length
        const frontBrakeForcePerWheelNewtons =
            frontWheelCount > 0
                ? totalBrakeForceNewtons * serviceBrakeFrontBias01 / frontWheelCount
                : 0
        const rearBrakeForcePerWheelNewtons =
            rearWheelCount > 0
                ? totalBrakeForceNewtons * (1 - serviceBrakeFrontBias01) / rearWheelCount
                : 0

        for (const wheelState of state.wheelStates) {
            const brakeForcePerWheelNewtons =
                wheelState.axle === 'front'
                    ? frontBrakeForcePerWheelNewtons
                    : rearBrakeForcePerWheelNewtons
            wheelState.requestedBrakeForceNewtons = brakeForcePerWheelNewtons
            wheelState.requestedLongitudinalForceNewtons +=
                brakeForcePerWheelNewtons
        }
    }

    function calculatePerWheelLongitudinalTireForces(dt, options = {}) {
        for (const wheelState of state.wheelStates) {
            calculateWheelLongitudinalTireForce(wheelState, dt, options)
        }
    }

    function calculatePerWheelLateralTireForces() {
        for (const wheelState of state.wheelStates) {
            calculateWheelLateralTireForce(wheelState)
        }
    }

    function calculateWheelLongitudinalTireForce(
        wheelState,
        dt,
        options = {}
    ) {
        if (!wheelState.isGrounded || wheelState.tractionLimitNewtons <= 0) {
            resetWheelLongitudinalTireForceState(wheelState, spec)
            return
        }

        const advanceRelaxationState = options.advanceRelaxationState !== false

        // The stored longitudinalSlipRatio is direction-aware for telemetry;
        // tire force needs the vehicle local-forward sign convention.
        const localForwardLongitudinalSlipRatio =
            calculateLocalForwardLongitudinalSlipRatio(wheelState)

        const linearLongitudinalTireForceNewtons =
            wheelState.pressureAdjustedLongitudinalTireStiffnessNewtonsPerSlipRatio *
            state.dynamicsTuning.longitudinalTireStiffnessMultiplier *
            localForwardLongitudinalSlipRatio

        wheelState.linearLongitudinalTireForceNewtons =
            constrainBrakingLongitudinalTireForceDirection(
                wheelState,
                linearLongitudinalTireForceNewtons
            )
        wheelState.uncappedLongitudinalTireForceNewtons =
            wheelState.linearLongitudinalTireForceNewtons
        wheelState.targetLongitudinalTireForceNewtons = THREE.MathUtils.clamp(
            wheelState.linearLongitudinalTireForceNewtons,
            -wheelState.tractionLimitNewtons,
            wheelState.tractionLimitNewtons
        )

        updateWheelLongitudinalTireForceRelaxationState(
            wheelState,
            spec,
            dt,
            advanceRelaxationState
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
    }

    function calculateWheelLateralTireForce(wheelState) {
        updateWheelLateralTireForceState(wheelState, spec)

        // Compatibility alias for the driver panel: this now means the wheel is
        // saturating in the longitudinal axis, lateral axis, or combined cap.
        wheelState.isSlipping =
            wheelState.isLongitudinalTireForceSaturated ||
            wheelState.isLateralTireForceSaturated ||
            wheelState.isCombinedTireForceSaturated
    }

    function constrainBrakingLongitudinalTireForceDirection(
        wheelState,
        longitudinalTireForceNewtons
    ) {
        if (!wheelState.isServiceBraking && !wheelState.isParkingBraking) {
            return longitudinalTireForceNewtons
        }

        const localForwardGroundSpeedDirection = getSignWithDeadzone(
            wheelState.longitudinalGroundSpeedMetersPerSecond,
            SLIP_RATIO_SPEED_EPSILON_METERS_PER_SECOND
        )

        if (localForwardGroundSpeedDirection === 0) {
            return longitudinalTireForceNewtons
        }

        // The current simple wheel rotational model can overshoot through zero
        // wheel speed under heavy braking. Until the slip model is upgraded, do
        // not let a braked wheel reverse-propel the chassis; braking tire force
        // must continue to oppose the wheel contact-patch ground motion.
        return (
            -localForwardGroundSpeedDirection *
            Math.abs(longitudinalTireForceNewtons)
        )
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
            resetWheelDifferentialCouplingState(wheelState)
            updateWheelTorqueCoupledRotationalState(wheelState, dt)
        }

        const drivenRearWheelStates = state.wheelStates.filter(
            (wheelState) => wheelState.driven && wheelState.axle === 'rear'
        )

        if (drivenRearWheelStates.length === 2) {
            updateRearDifferentialWheelSpeedCoupling(
                state.rearDifferentialState,
                drivenRearWheelStates,
                dt,
                spec
            )
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
        const rollingRadiusMeters = getWheelRollingRadiusMeters(wheelState)

        if (!Number.isFinite(rollingRadiusMeters) || rollingRadiusMeters <= 0) return 0

        return wheelState.requestedDriveForceNewtons * rollingRadiusMeters
    }

    function calculateWheelBrakeTorqueNewtonMeters(wheelState, dt) {
        const brakeTorqueMagnitudeNewtonMeters = Number.isFinite(
            wheelState.totalBrakeTorqueNewtonMeters
        )
            ? wheelState.totalBrakeTorqueNewtonMeters
            : wheelState.appliedBrakeTorqueNewtonMeters

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

        const rollingRadiusMeters = getWheelRollingRadiusMeters(wheelState)

        if (!Number.isFinite(rollingRadiusMeters) || rollingRadiusMeters <= 0) return 0

        return -wheelState.appliedLongitudinalForceNewtons * rollingRadiusMeters
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
        const rollingRadiusMeters = getWheelRollingRadiusMeters(wheelState)

        if (!Number.isFinite(rollingRadiusMeters) || rollingRadiusMeters <= 0) return 0

        const wheelGroundForwardSpeedMetersPerSecond = Number.isFinite(
            wheelState.wheelLocalForwardVelocityMetersPerSecond
        )
            ? wheelState.wheelLocalForwardVelocityMetersPerSecond
            : state.speedScalar

        return wheelGroundForwardSpeedMetersPerSecond / rollingRadiusMeters
    }

    function calculateRollingSurfaceSpeedMetersPerSecond(wheelState) {
        const rollingRadiusMeters = getWheelRollingRadiusMeters(wheelState)

        if (!Number.isFinite(rollingRadiusMeters) || rollingRadiusMeters <= 0) return 0

        return wheelState.angularVelocityRadiansPerSecond * rollingRadiusMeters
    }

    function updateLongitudinalSlipTelemetry() {
        for (const wheelState of state.wheelStates) {
            updateWheelLongitudinalSlipState(wheelState)
        }
    }

    function updateWheelLongitudinalSlipState(wheelState) {
        const longitudinalGroundSpeedMetersPerSecond = Number.isFinite(
            wheelState.wheelLocalForwardVelocityMetersPerSecond
        )
            ? wheelState.wheelLocalForwardVelocityMetersPerSecond
            : state.speedScalar
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
        // is slower, as in braking or incipient lock. Ground speed now uses the
        // wheel contact-patch forward velocity telemetry so steering and yaw do
        // not collapse every wheel onto the chassis centerline speed.
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

    function updateLateralSlipTelemetry() {
        for (const wheelState of state.wheelStates) {
            updateWheelLateralSlipAngleState(
                wheelState,
                state.planarMotion,
                spec
            )
        }

        updateLateralSlipSummary(state.lateralSlipSummary, state.wheelStates)
    }

    function updateLateralTireForceSummaryState() {
        updateLateralTireForceSummary(
            state.lateralTireForceSummary,
            state.wheelStates
        )
        state.lateralTireForceSummary.totalLateralTireForceNewtons =
            state.forces.totalLateralTireForceNewtons
        state.lateralTireForceSummary.yawMomentNewtonMeters =
            state.forces.yawMomentNewtonMeters
        state.lateralTireForceSummary.yawAccelerationRadiansPerSecondSquared =
            state.forces.yawAccelerationRadiansPerSecondSquared
    }

    function updateLongitudinalTractionStates() {
        for (const wheelState of state.wheelStates) {
            updateWheelLongitudinalTractionState(wheelState, spec)
        }

        updateLongitudinalTractionStateSummary(
            state.tractionStateSummary,
            state.wheelStates
        )
        updateServiceBrakeAbsSummary(
            state.serviceBrakeAbsSummary,
            state.wheelStates
        )
    }

    function updateWheelSteeringAngles() {
        for (const wheelState of state.wheelStates) {
            wheelState.steeringAngleRadians = wheelState.steerable
                ? params.maxVisualSteeringAngleRadians * state.steeringInput
                : 0
        }
    }

    function updateWheelVisualStates() {
        applyChassisAttitudeVisualState()

        for (const wheelState of state.wheelStates) {
            applyWheelVisualState(wheelState)
        }

        wheelAxleVisualKinematics?.updateFromWheelStates(state.wheelStates)
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

    applyTirePressureStateToWheels()
    applyTireInflationVisualState()
    updateWheelSteeringAngles()
    updateTerrainSupportAndWheelContactState(0, true, true)
    updateChassisAttitude(0)
    calculatePerWheelLongitudinalForces(0)
    updateLateralSlipTelemetry()
    updateLongitudinalSlipTelemetry()
    calculatePerWheelLongitudinalTireForces()
    calculatePerWheelLateralTireForces()
    state.forces = calculatePlanarForcesFromWheelState()
    captureDynamicsStepTraceStage(
        VEHICLE_DYNAMICS_STEP_TRACE_STAGES.INTEGRATION_INPUT
    )
    updateLateralTireForceSummaryState()
    updateBrakeLightVisuals(brakeLightVisuals, state.brakeInput)
    updateWheelRotationalStates(0)
    updateYawState(0)
    updatePlanarMotion(0)
    syncVehicleYawFromPlanarState()
    refreshPostIntegrationTelemetry()
    captureDynamicsStepTraceStage(
        VEHICLE_DYNAMICS_STEP_TRACE_STAGES.POST_INTEGRATION
    )
    updateWheelVisualStates()

    return {
        update,
        reset,
        shiftGearDown,
        shiftGearUp,
        setGear,
        setDynamicsTuning,
        resetDynamicsTuning,
        getDynamicsTuning,
        setRearDifferentialType,
        getRearDifferentialState,
        setTirePressureKpa,
        setWheelTirePressureKpa,
        resetTirePressure,
        getTirePressureState,
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
            wheelId: wheel.id,
            axle: wheel.axle,
            side: wheel.side,
            driven: Boolean(wheel.driven),
            steerable: Boolean(wheel.steerable),
            radius: wheel.radius,
            width: wheel.width,
            localPosition: cloneVector3(wheel.localPosition),
            contactPatchLocal: cloneVector3(wheel.contactPatchLocal),
            suspensionMountLocalPosition: cloneVector3(
                wheel.suspensionMountLocal ?? wheel.localPosition
            ),
            suspensionAxisDownLocal: cloneVector3(
                wheel.suspensionAxisDownLocal ?? DEFAULT_SUSPENSION_DOWN_LOCAL
            ),
            wheelCenterLocalPosition: cloneVector3(wheel.localPosition),
            suspensionMountWorld: new THREE.Vector3(),
            suspensionAxisDownWorld: new THREE.Vector3(0, -1, 0),
            wheelCenterWorldPosition: new THREE.Vector3(),
            contactPointWorldPosition: new THREE.Vector3(),
            contactPatchWorldPosition: new THREE.Vector3(),
            contactNormalWorld: new THREE.Vector3(0, 1, 0),
            centerToContactOffsetWorld: new THREE.Vector3(),
            wheelForwardWorld: new THREE.Vector3(0, 0, 1),
            contactForwardTangentWorld: new THREE.Vector3(0, 0, 1),
            contactLateralTangentWorld: new THREE.Vector3(1, 0, 0),
            contactPatchVelocityWorld: new THREE.Vector3(),
            tireForceWorld: new THREE.Vector3(),
            planarTireForceWorldXNewtons: 0,
            planarTireForceWorldZNewtons: 0,
            planarTireForceLocalForwardNewtons: 0,
            planarTireForceLocalRightNewtons: 0,
            terrainContactQueryResult: {
                normalWorld: new THREE.Vector3(0, 1, 0),
            },
            suspensionContactQueryResult: {
                rayOriginWorld: new THREE.Vector3(),
                suspensionDownDirectionWorld: new THREE.Vector3(0, -1, 0),
                contactPointWorld: new THREE.Vector3(),
                contactNormalWorld: new THREE.Vector3(0, 1, 0),
                isInsideTerrainBounds: true,
                isWithinBounds: true,
                hasContact: false,
                hasTerrainIntersection: false,
                status: 'initializing',
                profileName: 'unavailable',
                surfaceKind: 'unavailable',
                frictionCoefficient: spec.defaultSurfaceFrictionCoefficient,
                terrainHeightMeters: 0,
                slopeDegrees: 0,
                normalAlignmentCosine: 1,
                rayDistanceMeters: 0,
                terrainRayDistanceMeters: 0,
                centerToContactDistanceAlongSuspensionMeters: 0,
                wheelCenterDistanceAlongSuspensionMeters: 0,
            },
            groundHeightMeters: 0,
            terrainHeightMeters: 0,
            distanceToGroundMeters: 0,
            centerToContactPlaneDistanceMeters: 0,
            tirePenetrationMeters: 0,
            isInsideTerrainBounds: true,
            terrainProfileName: 'unavailable',
            contactSlopeDegrees: 0,
            suspensionNormalAlignmentCosine: 0,
            suspensionRawLengthMeters: 0,
            suspensionContactStatus: 'initializing',
            isSuspensionContactRetained: false,
            isWithinSuspensionContactHysteresis: false,
            isContactTangentBasisValid: false,
            steeringAngleRadians: 0,
            // Wheel angular dynamics are torque-coupled, while tire forces use a basic
            // linear/saturated longitudinal slip model. Wheel lock behavior remains future work.
            rollingSurfaceSpeedMetersPerSecond: 0,
            targetRollingAngularVelocityRadiansPerSecond: 0,
            angularVelocityRadiansPerSecond: 0,
            angularAccelerationRadiansPerSecondSquared: 0,
            spinAngleRadians: 0,
            wheelInertiaKgMeterSquared: spec.wheelInertiaKgMeterSquared,
            // Service/parking brake fields are command magnitudes. The existing
            // brakeTorqueNewtonMeters field remains the signed wheel torque component.
            serviceBrakePressure01: 0,
            parkingBrakePressure01: 0,
            requestedServiceBrakeTorqueNewtonMeters: 0,
            requestedParkingBrakeTorqueNewtonMeters: 0,
            appliedServiceBrakeTorqueNewtonMeters: 0,
            serviceBrakeFrontBiasShare01: 0,
            appliedParkingBrakeTorqueNewtonMeters: 0,
            serviceBrakeAbsState: SERVICE_BRAKE_ABS_STATES.INACTIVE,
            serviceBrakeAbsActive: false,
            serviceBrakeAbsModulation01: 1,
            serviceBrakeAbsReleaseCommand01: 0,
            serviceBrakeAbsCycleCount: 0,
            serviceBrakeAbsReason: 'initial inactive state',
            serviceBrakeTorqueBeforeAbsNewtonMeters: 0,
            serviceBrakeTorqueAfterAbsNewtonMeters: 0,
            totalBrakeTorqueNewtonMeters: 0,
            requestedBrakeTorqueNewtonMeters: 0,
            appliedBrakeTorqueNewtonMeters: 0,
            driveTorqueNewtonMeters: 0,
            brakeTorqueNewtonMeters: 0,
            isServiceBraking: false,
            isParkingBraking: false,
            contactReactionTorqueNewtonMeters: 0,
            rollingConstraintCorrectionTorqueNewtonMeters: 0,
            differentialCouplingTorqueNewtonMeters: 0,
            differentialCouplingAngularImpulseNewtonMeterSeconds: 0,
            netTorqueNewtonMeters: 0,
            yawMomentContributionNewtonMeters: 0,
            isWheelLocked: false,
            longitudinalTractionState: LONGITUDINAL_TRACTION_STATES.STOPPED,
            longitudinalTractionStateReason: 'initial resting state',
            isLongitudinalTractionSaturated: false,
            isDriveWheelSpinning: false,
            isBrakeLockTendency: false,
            brakeLockTendencySource: 'none',
            isServiceBrakeLockTendency: false,
            isParkingBrakeLockTendency: false,
            isWheelStopped: true,
            isWheelAirborne: false,
            tractionStateSeverity01: 0,
            isGrounded: true,
            isSlipping: false,
            surfaceKind: 'flat-asphalt-placeholder',
            frictionCoefficient: spec.defaultSurfaceFrictionCoefficient,
            staticNormalForceNewtons: 0,
            longitudinalLoadTransferNormalForceDeltaNewtons: 0,
            lateralLoadTransferNormalForceDeltaNewtons: 0,
            dynamicNormalForceNewtons: 0,
            loadTransferNormalForceDeltaNewtons: 0,
            normalForceNewtons: 0,
            tractionLimitNewtons: 0,
            requestedDriveForceNewtons: 0,
            requestedBrakeForceNewtons: 0,
            requestedLongitudinalForceNewtons: 0,
            uncappedLongitudinalTireForceNewtons: 0,
            linearLongitudinalTireForceNewtons: 0,
            appliedLongitudinalForceNewtons: 0,
            targetLongitudinalTireForceNewtons: 0,
            relaxedLongitudinalTireForceNewtons: 0,
            longitudinalTireForceRelaxationAlpha: 0,
            longitudinalTireForceRelaxationLengthMeters:
                spec.longitudinalTireForceRelaxationLengthMeters,
            longitudinalTireForceSaturationRatio: 0,
            isLongitudinalTireForceSaturated: false,
            isLongitudinalTireForceRelaxing: false,
            longitudinalGroundSpeedMetersPerSecond: 0,
            wheelSurfaceSpeedMetersPerSecond: 0,
            longitudinalSlipRatio: 0,
            longitudinalSlipRatioAbs: 0,
            hasLongitudinalSlipSample: false,
            longitudinalSlip: 0,
            lateralSlipAngleRadians: 0,
            lateralSlipAngleDegrees: 0,
            lateralSlipAngleAbsRadians: 0,
            hasLateralSlipAngleSample: false,
            wheelLocalForwardVelocityMetersPerSecond: 0,
            wheelLocalLateralVelocityMetersPerSecond: 0,
            lateralSlipState: LATERAL_SLIP_STATES.UNAVAILABLE,
            lateralSlipStateReason: 'initial unavailable state',
            isLateralSlipAngleHigh: false,
            lateralSlip: 0,
            uncappedLateralTireForceNewtons: 0,
            linearLateralTireForceNewtons: 0,
            appliedLateralTireForceNewtons: 0,
            lateralTireForceSaturationRatio: 0,
            isLateralTireForceSaturated: false,
            preCombinedAppliedLongitudinalForceNewtons: 0,
            preCombinedAppliedLateralForceNewtons: 0,
            combinedTireForceMagnitudeNewtons: 0,
            combinedTireForceLimitNewtons: 0,
            combinedTireForceScale01: 1,
            combinedTireForceSaturationRatio: 0,
            isCombinedTireForceSaturated: false,
            tirePressureKpa: spec.defaultTirePressureKpa,
            defaultTirePressureKpa: spec.defaultTirePressureKpa,
            minTirePressureKpa: spec.minTirePressureKpa,
            maxTirePressureKpa: spec.maxTirePressureKpa,
            tireInflationNormalized01:
                calculateTireInflationNormalized01(
                    spec.defaultTirePressureKpa,
                    spec
                ),
            visualTireDeflectionRatio: 0,
            visualContactPatchScale: {
                width: 1,
                length: 1,
            },
            calculationTirePressureKpa: spec.defaultTirePressureKpa,
            tirePressureRatio:
                spec.recommendedTirePressureKpa > 0
                    ? spec.defaultTirePressureKpa / spec.recommendedTirePressureKpa
                    : 1,
            tirePressureState: 'nominal',
            tirePressureStateReason: 'initial nominal pressure state',
            effectiveTireRollingRadiusMeters: wheel.radius,
            tirePressureLongitudinalStiffnessMultiplier: 1,
            tirePressureLateralStiffnessMultiplier: 1,
            pressureAdjustedLongitudinalTireStiffnessNewtonsPerSlipRatio:
                spec.longitudinalTireStiffnessNewtonsPerSlipRatio,
            pressureAdjustedLateralTireStiffnessNewtonsPerRadian:
                spec.lateralTireStiffnessNewtonsPerRadian,
            rollingResistanceCoefficient: spec.rollingResistanceCoefficient,
            rollingResistanceForceNewtons: 0,
            isUnderInflated: false,
            isOverInflated: false,
            visual: {
                pivot: visualNodes.pivot
                    ? vehicle.getObjectByName(visualNodes.pivot)
                    : null,
                rollingAssembly: visualNodes.rollingAssembly
                    ? vehicle.getObjectByName(visualNodes.rollingAssembly)
                    : null,
                contactPatch: visualNodes.contactPatch
                    ? vehicle.getObjectByName(visualNodes.contactPatch)
                    : null,
            },
        }
    })
}

function resetWheelRotationalState(wheelState, spec) {
    wheelState.rollingSurfaceSpeedMetersPerSecond = 0
    wheelState.targetRollingAngularVelocityRadiansPerSecond = 0
    wheelState.angularVelocityRadiansPerSecond = 0
    wheelState.angularAccelerationRadiansPerSecondSquared = 0
    wheelState.spinAngleRadians = 0
    resetWheelLongitudinalTireForceState(wheelState, spec)
    resetWheelLongitudinalSlipState(wheelState)
    resetWheelLateralSlipAngleState(wheelState)
    resetWheelLateralTireForceState(wheelState)
    resetWheelLoadTransferState(wheelState)
    resetWheelTirePressureHandlingState(wheelState, spec)
    resetWheelBrakeTorqueState(wheelState)
    resetWheelDifferentialCouplingState(wheelState)
    resetWheelServiceBrakeAbsState(wheelState)
    wheelState.driveTorqueNewtonMeters = 0
    wheelState.brakeTorqueNewtonMeters = 0
    wheelState.contactReactionTorqueNewtonMeters = 0
    wheelState.rollingConstraintCorrectionTorqueNewtonMeters = 0
    wheelState.netTorqueNewtonMeters = 0
    wheelState.isWheelLocked = false
    resetWheelLongitudinalTractionState(wheelState)
}

function resetWheelLongitudinalTireForceState(wheelState, spec = {}) {
    resetWheelLongitudinalTireForceRelaxationState(wheelState, spec)
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

function resetWheelBrakeTorqueState(wheelState) {
    wheelState.serviceBrakePressure01 = 0
    wheelState.parkingBrakePressure01 = 0
    wheelState.requestedServiceBrakeTorqueNewtonMeters = 0
    wheelState.requestedParkingBrakeTorqueNewtonMeters = 0
    wheelState.appliedServiceBrakeTorqueNewtonMeters = 0
    wheelState.appliedParkingBrakeTorqueNewtonMeters = 0
    wheelState.serviceBrakeTorqueBeforeAbsNewtonMeters = 0
    wheelState.serviceBrakeTorqueAfterAbsNewtonMeters = 0
    wheelState.totalBrakeTorqueNewtonMeters = 0
    wheelState.requestedBrakeTorqueNewtonMeters = 0
    wheelState.appliedBrakeTorqueNewtonMeters = 0
    wheelState.brakeTorqueNewtonMeters = 0
    wheelState.serviceBrakeFrontBiasShare01 = 0
    wheelState.isServiceBraking = false
    wheelState.isParkingBraking = false
}

function resetWheelDifferentialCouplingState(wheelState) {
    wheelState.differentialCouplingTorqueNewtonMeters = 0
    wheelState.differentialCouplingAngularImpulseNewtonMeterSeconds = 0
}

function resetWheelLongitudinalTractionState(wheelState) {
    wheelState.longitudinalTractionState =
        LONGITUDINAL_TRACTION_STATES.STOPPED
    wheelState.longitudinalTractionStateReason = 'reset resting state'
    wheelState.isLongitudinalTractionSaturated = false
    wheelState.isDriveWheelSpinning = false
    wheelState.isBrakeLockTendency = false
    wheelState.brakeLockTendencySource = 'none'
    wheelState.isServiceBrakeLockTendency = false
    wheelState.isParkingBrakeLockTendency = false
    wheelState.isWheelStopped = true
    wheelState.isWheelAirborne = false
    wheelState.tractionStateSeverity01 = 0
}

function applyWheelVisualState(wheelState) {
    if (wheelState.visual.pivot) {
        if (wheelState.wheelCenterLocalPosition?.isVector3) {
            wheelState.visual.pivot.position.copy(
                wheelState.wheelCenterLocalPosition
            )
        }

        if (wheelState.steerable) {
            wheelState.visual.pivot.rotation.y =
                wheelState.steeringAngleRadians
        }
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

function createSlopeGravityState() {
    return {
        enabled: false,
        isSupported: false,
        supportSlopeDegrees: 0,
        supportNormalWorld: new THREE.Vector3(0, 1, 0),
        gravityTangentWorld: new THREE.Vector3(),
        slopeGravityForceWorld: new THREE.Vector3(),
        slopeGravityForceNewtons: 0,
    }
}

function resetSlopeGravityState(slopeGravityState) {
    slopeGravityState.enabled = false
    slopeGravityState.isSupported = false
    slopeGravityState.supportSlopeDegrees = 0
    slopeGravityState.supportNormalWorld.set(0, 1, 0)
    slopeGravityState.gravityTangentWorld.set(0, 0, 0)
    slopeGravityState.slopeGravityForceWorld.set(0, 0, 0)
    slopeGravityState.slopeGravityForceNewtons = 0

    return slopeGravityState
}

function createEmptyForceSnapshot() {
    return {
        normalForceNewtons: 0,
        tractionLimitLongitudinalNewtons: 0,
        driveForceNewtons: 0,
        brakeForceNewtons: 0,
        requestedTireForceNewtons: 0,
        appliedTireForceNewtons: 0,
        totalLongitudinalTireForceNewtons: 0,
        totalLateralTireForceNewtons: 0,
        totalTireForceWorldXNewtons: 0,
        totalTireForceWorldZNewtons: 0,
        rollingResistanceForceNewtons: 0,
        rollingResistanceForceWorldXNewtons: 0,
        rollingResistanceForceWorldZNewtons: 0,
        aerodynamicDragForceNewtons: 0,
        aerodynamicDragForceWorldXNewtons: 0,
        aerodynamicDragForceWorldZNewtons: 0,
        aerodynamicDragForceLocalForwardNewtons: 0,
        aerodynamicDragForceLocalLateralNewtons: 0,
        slopeGravityForceNewtons: 0,
        slopeGravityForceWorldXNewtons: 0,
        slopeGravityForceWorldZNewtons: 0,
        slopeGravityForceLocalForwardNewtons: 0,
        slopeGravityForceLocalLateralNewtons: 0,
        netLongitudinalForceNewtons: 0,
        netLateralForceNewtons: 0,
        netForceWorldXNewtons: 0,
        netForceWorldZNewtons: 0,
        longitudinalAccelerationMetersPerSecondSquared: 0,
        lateralAccelerationMetersPerSecondSquared: 0,
        yawMomentNewtonMeters: 0,
        yawAccelerationRadiansPerSecondSquared: 0,
        netLongitudinalYawMomentNewtonMeters: 0,
        netLateralYawMomentNewtonMeters: 0,
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
