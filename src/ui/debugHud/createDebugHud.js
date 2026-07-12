// src/ui/debugHud/createDebugHud.js

import { EARTH_GRAVITY } from '../../simulation/simulationConstants.js'

const DEFAULT_CORNER = 'top-left'
const G_FORCE_DISPLAY_CLAMP_G = 20

export function createDebugHud(config = {}) {
  const parent = config.parent ?? document.body

  const debugHud = document.createElement('div')
  debugHud.id = config.id ?? 'debug-hud'

  const debugHudButtonRow = document.createElement('div')

  const debugHudMoveButton = document.createElement('button')
  debugHudMoveButton.type = 'button'
  debugHudMoveButton.textContent = 'Move panel'

  const debugHudCollapseButton = document.createElement('button')
  debugHudCollapseButton.type = 'button'
  debugHudCollapseButton.textContent = 'Collapse Panel'

  const debugHudText = document.createElement('pre')

  Object.assign(debugHud.style, {
    position: 'fixed',
    zIndex: '10',
    margin: '0',
    padding: '10px 12px',
    minWidth: '260px',
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: '12px',
    lineHeight: '1.35',
    color: '#e8e8e8',
    background: 'rgba(0, 0, 0, 0.68)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    borderRadius: '8px',
    pointerEvents: 'auto',
    userSelect: 'none',
  })

  Object.assign(debugHudButtonRow.style, {
    display: 'flex',
    gap: '6px',
    margin: '0 0 8px 0',
    alignItems: 'center',
  })

  const debugHudButtonStyle = {
    padding: '4px 8px',
    font: 'inherit',
    fontSize: '11px',
    color: '#e8e8e8',
    background: 'rgba(255, 255, 255, 0.12)',
    border: '1px solid rgba(255, 255, 255, 0.25)',
    borderRadius: '5px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  Object.assign(debugHudMoveButton.style, debugHudButtonStyle)
  Object.assign(debugHudCollapseButton.style, debugHudButtonStyle)

  Object.assign(debugHudText.style, {
    margin: '0',
    whiteSpace: 'pre',
    pointerEvents: 'none',
  })

  debugHudButtonRow.appendChild(debugHudMoveButton)
  debugHudButtonRow.appendChild(debugHudCollapseButton)
  debugHud.appendChild(debugHudButtonRow)
  debugHud.appendChild(debugHudText)
  parent.appendChild(debugHud)

  let corner = config.initialCorner ?? DEFAULT_CORNER
  let collapsed = config.initialCollapsed ?? false

  function setCorner(nextCorner) {
    corner = nextCorner

    debugHud.style.top = ''
    debugHud.style.right = ''
    debugHud.style.bottom = ''
    debugHud.style.left = ''

    if (corner === 'bottom-right') {
      debugHud.style.right = '12px'
      debugHud.style.bottom = '12px'
      debugHudMoveButton.textContent = 'Move panel ↑'
    } else {
      debugHud.style.top = '12px'
      debugHud.style.left = '12px'
      debugHudMoveButton.textContent = 'Move panel ↓'
    }
  }

  function setCollapsed(nextCollapsed) {
    collapsed = nextCollapsed

    debugHudText.style.display = collapsed ? 'none' : 'block'
    debugHudCollapseButton.textContent = collapsed
      ? 'Expand Panel'
      : 'Collapse Panel'

    debugHud.style.minWidth = collapsed ? '0' : '260px'
  }

  function toggleCorner() {
    setCorner(corner === 'top-left' ? 'bottom-right' : 'top-left')
  }

  function toggleCollapsed() {
    setCollapsed(!collapsed)
  }

  function update(snapshot) {
    const forces = snapshot.forces ?? {}
    const fixedSimulation = snapshot.fixedSimulation ?? {}
    const wheelStates = snapshot.wheelStates ?? []
    const tractionStateSummary = snapshot.tractionStateSummary ?? {}
    const serviceBrakeAbsSummary = snapshot.serviceBrakeAbsSummary ?? {}
    const lateralSlipSummary = snapshot.lateralSlipSummary ?? {}
    const lateralTireForceSummary = snapshot.lateralTireForceSummary ?? {}
    const loadTransferSummary = snapshot.loadTransferSummary ?? {}
    const suspensionNormalForceSummary =
      snapshot.suspensionNormalForceSummary ?? {}
    const chassisTerrainSupport = snapshot.chassisTerrainSupport ?? {}
    const chassisAttitude = snapshot.chassisAttitude ?? {}
    const slopeGravity = snapshot.slopeGravity ?? {}
    const tirePressureHandlingSummary = snapshot.tirePressureHandlingSummary ?? {}
    const tireSlipFeedback = snapshot.tireSlipFeedback ?? {}
    const vehicleDynamicsStepTrace = snapshot.vehicleDynamicsStepTrace ?? {}

    const powertrain = snapshot.powertrain ?? {}
    const powertrainKinematics = snapshot.powertrainKinematics ?? {}
    const rearDifferentialState = snapshot.rearDifferentialState ?? {}
    const wheelAxleVisualKinematics =
      snapshot.wheelAxleVisualKinematics ?? {}
    const stockEngineCatalogTelemetry =
      snapshot.stockEngineCatalogTelemetry ??
      powertrain.engine?.stockEngineCatalogTelemetry ??
      {}

    debugHudText.textContent = [
      'Vehicle Sim Debug',
      '',
      `Camera: ${snapshot.cameraMode ?? 'unknown'}`,
      `Controller: ${snapshot.controllerKind ?? 'unknown'}`,
      `Powertrain: ${formatPowertrainTelemetry(powertrain)}`,
      `Engine catalog: ${formatStockEngineCatalogTelemetry(stockEngineCatalogTelemetry)}`,
      `Powertrain RPM: ${formatPowertrainRpmTelemetry(powertrainKinematics)}`,
      `Tire pressure: ${formatTirePressureTelemetry(snapshot.tirePressureState)}`,
      `Tire visuals: ${formatTirePressureVisualsTelemetry(snapshot.tirePressureVisuals)}`,
      `Pressure handling: ${formatTirePressureHandlingTelemetry(tirePressureHandlingSummary)}`,
      `Pressure stiffness: ${formatTirePressureStiffnessTelemetry(tirePressureHandlingSummary)}`,
      `Dynamics tuning: ${formatDynamicsTuningTelemetry(snapshot.dynamicsTuning)}`,
      `Rear diff: ${formatRearDifferentialTelemetry(rearDifferentialState)}`,
      `Wheel alignment: ${formatWheelAxleVisualKinematicsTelemetry(wheelAxleVisualKinematics)}`,
      `Chassis mass: ${formatChassisMassPropertiesTelemetry(snapshot.chassisMassProperties)}`,
      `Terrain support: ${formatTerrainSupportTelemetry(chassisTerrainSupport)}`,
      `Chassis attitude: ${formatChassisAttitudeTelemetry(chassisAttitude)}`,
      `Slope gravity: ${formatSlopeGravityTelemetry(slopeGravity)}`,
      `Throttle: ${formatNumber(snapshot.throttleInput)}`,
      `Service brake: ${formatNumber(snapshot.brakeInput)}`,
      `Parking brake: ${formatNumber(snapshot.parkingBrakeInput)}`,
      `Steering: ${formatNumber(snapshot.steeringInput)}`,
      `dt: ${formatNumber(snapshot.dt, 4)} s`,
      `Physics steps: ${formatNumber(fixedSimulation.stepsRun, 0)}`,
      `Fixed dt: ${formatNumber(fixedSimulation.fixedTimeStepSeconds, 4)} s`,
      `Accumulator: ${formatNumber(fixedSimulation.accumulatorSeconds, 4)} s`,
      '',
      `Position XYZ: ${formatVector3(snapshot.position)}`,
      `Speed scalar: ${formatNumber(snapshot.speedScalar)} m/s`,
      `World speed: ${formatNumber(snapshot.worldSpeedMetersPerSecond)} m/s`,
      `Local forward velocity: ${formatNumber(snapshot.localForwardVelocityMetersPerSecond)} m/s`,
      `Local lateral velocity: ${formatNumber(snapshot.localLateralVelocityMetersPerSecond)} m/s`,
      `Yaw: ${formatNumber(snapshot.yawRadians, 3)} rad`,
      `Yaw rate: ${formatNumber(snapshot.yawRateRadiansPerSecond, 3)} rad/s`,
      `Yaw accel: ${formatNumber(snapshot.yawAccelerationRadiansPerSecondSquared, 3)} rad/s²`,
      `Velocity XYZ: ${formatVector3(snapshot.velocity)} m/s`,
      `Velocity mag: ${formatNumber(vectorMagnitude(snapshot.velocity))} m/s`,
      `Acceleration: ${formatNumber(snapshot.longitudinalAcceleration)} m/s²`,
      `Local accel forward: ${formatNumber(snapshot.planarAccelerationLocalForwardMetersPerSecondSquared)} m/s²`,
      `Local accel lateral: ${formatNumber(snapshot.planarAccelerationLocalLateralMetersPerSecondSquared)} m/s²`,
      `Planar accel XYZ: ${formatVector3(snapshot.planarAccelerationWorldMetersPerSecondSquared)} m/s²`,
      '',
      `G-force: ${formatGForceTelemetry(snapshot)}`,
      `Dynamics trace: ${formatVehicleDynamicsStepTraceTelemetry(vehicleDynamicsStepTrace)}`,
      `Drive force: ${formatNumber(forces.driveForceNewtons)} N`,
      `Brake force: ${formatNumber(forces.brakeForceNewtons)} N`,
      `Brake torque: ${formatBrakeTorqueTelemetry(wheelStates)}`,
      `Service ABS: ${formatServiceBrakeAbsTelemetry(serviceBrakeAbsSummary)}`,
      `Rolling resistance: ${formatNumber(forces.rollingResistanceForceNewtons)} N`,
      `Aero drag: ${formatAerodynamicDragTelemetry(snapshot.aerodynamicDrag)}`,
      `Net force local: ${formatNumber(forces.netLongitudinalForceNewtons)} fwd / ${formatNumber(forces.netLateralForceNewtons)} lat N`,
      `Traction limit: ${formatNumber(forces.tractionLimitLongitudinalNewtons)} N`,
      `Traction limited: ${forces.isTractionLimited ? 'YES' : 'no'}`,
      `Tire force: ${formatLongitudinalTireForceTelemetry(wheelStates)}`,
      `Long force relax: ${formatLongitudinalTireForceRelaxationTelemetry(wheelStates)}`,
      `Tire saturation: ${formatTireSaturationTelemetry(wheelStates)}`,
      `Lateral tire force: ${formatLateralTireForceTelemetry(lateralTireForceSummary)}`,
      `Combined cap: ${formatCombinedTireForceTelemetry(lateralTireForceSummary)}`,
      `Yaw moment: ${formatYawMomentTelemetry(lateralTireForceSummary)}`,
      `Yaw budget: ${formatYawBudgetTelemetry(snapshot.yawDynamics)}`,
      `Yaw budget wheels: ${formatYawBudgetWheelContributionsTelemetry(snapshot.yawDynamics)}`,
      `Load transfer: ${formatLoadTransferTelemetry(loadTransferSummary)}`,
      `Normal force bias: ${formatLoadTransferBiasTelemetry(loadTransferSummary)}`,
      `Load distribution: ${formatWheelLoadDistributionTelemetry(wheelStates)}`,
      `Suspension: ${formatSuspensionTelemetry(wheelStates)}`,
      `Suspension support: ${formatSuspensionSupportTelemetry(suspensionNormalForceSummary)}`,
      `Suspension wheels: ${formatSuspensionWheelTelemetry(wheelStates)}`,
      `Wheel normal force: ${formatWheelNormalForceTelemetry(loadTransferSummary)}`,
      `Traction state: ${formatTractionStateSummary(tractionStateSummary)}`,
      `Slip visuals: ${formatTireSlipFeedbackTelemetry(tireSlipFeedback)}`,
      '',
      `Grounded wheels: ${countGroundedWheels(wheelStates)} / ${wheelStates.length}`,
      `Wheel contact: ${formatWheelGroundedStates(wheelStates)}`,
      `Wheel angular velocity: ${formatWheelAngularVelocities(wheelStates)} rad/s`,
      `Wheel net torque: ${formatWheelNetTorqueTelemetry(wheelStates)}`,
      `Longitudinal slip ratio: ${formatLongitudinalSlipTelemetry(wheelStates)}`,
      `Lateral slip angle: ${formatLateralSlipTelemetry(lateralSlipSummary)}`,
      `Wheel lock placeholder: ${countLockedWheels(wheelStates)} / ${wheelStates.length}`,
      '',
      `Terrain size: ${snapshot.terrainSize} x ${snapshot.terrainSize}`,
      `Outside terrain: ${snapshot.outsideTerrain ? 'YES' : 'no'}`,
    ].join('\n')
  }

  function destroy() {
    debugHudMoveButton.removeEventListener('click', toggleCorner)
    debugHudCollapseButton.removeEventListener('click', toggleCollapsed)
    debugHud.remove()
  }

  debugHudMoveButton.addEventListener('click', toggleCorner)
  debugHudCollapseButton.addEventListener('click', toggleCollapsed)

  setCorner(corner)
  setCollapsed(collapsed)

  return {
    update,
    setCorner,
    setCollapsed,
    destroy,
  }
}

function formatTirePressureTelemetry(tirePressureState = {}) {
  const tirePressureKpa = Number.isFinite(tirePressureState.tirePressureKpa)
    ? tirePressureState.tirePressureKpa
    : NaN
  const inflationVisualLabel = tirePressureState.inflationVisualLabel ?? 'unknown'

  return `${formatNumber(tirePressureKpa, 0)} kPa / ${inflationVisualLabel}`
}

function formatTirePressureVisualsTelemetry(tirePressureVisuals = {}) {
  if (tirePressureVisuals?.enabled === false) return 'disabled'
  const wheelVisuals = tirePressureVisuals?.wheelVisuals ?? []
  if (wheelVisuals.length === 0) return 'no wheels'

  const first = wheelVisuals[0]
  const status = first.isGeometrySettled ? 'settled' : 'settling'
  const pressure = formatNumber(first.targetPressureKpa ?? 0, 0)
  const load = formatNumber(first.normalizedLoadRatio ?? 0, 2)
  const flattenMillimeters = formatNumber(
    (first.contactFlatteningMeters ?? 0) * 1000,
    1
  )
  const grounded = first.isGrounded ? 'grounded' : 'airborne'

  return `${status} ${pressure} kPa / load ${load} / flatten ${flattenMillimeters} mm / ${grounded}`
}

function formatTirePressureHandlingTelemetry(tirePressureHandlingSummary = {}) {
  return [
    `${tirePressureHandlingSummary.dominantTirePressureState ?? 'nominal'}`,
    `ratio ${formatNumber(tirePressureHandlingSummary.minTirePressureRatio ?? 0)}-${formatNumber(tirePressureHandlingSummary.maxTirePressureRatio ?? 0)}`,
    `radius ${formatNumber(tirePressureHandlingSummary.minEffectiveTireRollingRadiusMeters ?? 0, 3)}-${formatNumber(tirePressureHandlingSummary.maxEffectiveTireRollingRadiusMeters ?? 0, 3)} m`,
  ].join(' / ')
}

function formatTirePressureStiffnessTelemetry(tirePressureHandlingSummary = {}) {
  return [
    `long x${formatNumber(tirePressureHandlingSummary.averagePressureLongitudinalStiffnessMultiplier ?? 0)}`,
    `lat x${formatNumber(tirePressureHandlingSummary.averagePressureLateralStiffnessMultiplier ?? 0)}`,
    `under ${formatNumber(tirePressureHandlingSummary.underInflatedWheelCount ?? 0, 0)}`,
    `over ${formatNumber(tirePressureHandlingSummary.overInflatedWheelCount ?? 0, 0)}`,
    `severe ${formatNumber(tirePressureHandlingSummary.severePressureWheelCount ?? 0, 0)}`,
    `roll ${formatNumber(tirePressureHandlingSummary.totalRollingResistanceForceAbsNewtons ?? 0, 0)} N`,
  ].join(' / ')
}

function formatDynamicsTuningTelemetry(dynamicsTuning = {}) {
  return [
    `drive x${formatNumber(dynamicsTuning.driveTorqueMultiplier)}`,
    `brake x${formatNumber(dynamicsTuning.serviceBrakeTorqueMultiplier)}`,
    `tire x${formatNumber(dynamicsTuning.longitudinalTireStiffnessMultiplier)}`,
  ].join(' / ')
}

function formatRearDifferentialTelemetry(rearDifferentialState = {}) {
  const modeLabel = rearDifferentialState.rearDifferentialModeLabel ?? 'Open'
  const leftPercent = Math.round(
    clampPercent(rearDifferentialState.rearDifferentialLeftShare01) * 100
  )
  const rightPercent = Math.max(0, 100 - leftPercent)
  const absoluteWheelSpeedDifferenceRadiansPerSecond = Math.abs(
    Number.isFinite(
      rearDifferentialState.rearDifferentialWheelSpeedDifferenceAbsRadiansPerSecond
    )
      ? rearDifferentialState.rearDifferentialWheelSpeedDifferenceAbsRadiansPerSecond
      : rearDifferentialState.rearDifferentialWheelSpeedDifferenceRadiansPerSecond ?? 0
  )
  const couplingTorqueNewtonMeters = Math.max(
    Math.abs(
      Number.isFinite(
        rearDifferentialState.rearDifferentialLeftCouplingTorqueNewtonMeters
      )
        ? rearDifferentialState.rearDifferentialLeftCouplingTorqueNewtonMeters
        : 0
    ),
    Math.abs(
      Number.isFinite(
        rearDifferentialState.rearDifferentialRightCouplingTorqueNewtonMeters
      )
        ? rearDifferentialState.rearDifferentialRightCouplingTorqueNewtonMeters
        : 0
    )
  )
  const suffixes = [
    `dOmega ${formatNumber(absoluteWheelSpeedDifferenceRadiansPerSecond, 2)} rad/s`,
  ]

  if (
    rearDifferentialState.rearDifferentialType === 'torsen' &&
    Number.isFinite(rearDifferentialState.rearDifferentialTorqueBiasRatio) &&
    rearDifferentialState.rearDifferentialTorqueBiasRatio > 0
  ) {
    suffixes.push(
      `TBR ${formatNumber(rearDifferentialState.rearDifferentialTorqueBiasRatio, 2)}`
    )
  }

  if (couplingTorqueNewtonMeters > 0.001) {
    suffixes.push(`coupling ${formatNumber(couplingTorqueNewtonMeters, 0)} N*m`)
  }

  if (rearDifferentialState.isRearDifferentialHardSpeedCouplingApplied) {
    suffixes.push('constrained')
  } else if (
    rearDifferentialState.rearDifferentialCouplingState &&
    rearDifferentialState.rearDifferentialCouplingState !== 'idle' &&
    rearDifferentialState.rearDifferentialCouplingState !== 'uncoupled'
  ) {
    suffixes.push(rearDifferentialState.rearDifferentialCouplingState)
  }

  if (rearDifferentialState.isRearDifferentialBiasing) {
    suffixes.push('biasing')
  }

  return `${modeLabel} / L ${leftPercent}% R ${rightPercent}% / ${suffixes.join(' / ')}`
}

function formatWheelAxleVisualKinematicsTelemetry(kinematics = {}) {
  if (!kinematics.representationKind) return 'unavailable'

  const hubErrorMillimeters =
    (kinematics.maximumHubToWheelCenterErrorMeters ?? 0) * 1000
  const shaftErrorMillimeters =
    (kinematics.maximumAxleOrShaftEndpointToHubErrorMeters ?? 0) * 1000
  const status =
    kinematics.isFinite && kinematics.rigidAlignmentIsValid
      ? 'valid'
      : 'INVALID'
  const representation = kinematics.representationKind.startsWith('independent-')
    ? 'independent'
    : kinematics.representationKind

  return `${status} / max hub ${formatNumber(hubErrorMillimeters, 2)} mm / shaft ${formatNumber(shaftErrorMillimeters, 2)} mm / ${representation}`
}

function formatVehicleDynamicsStepTraceTelemetry(trace = {}) {
  const integrationInput = trace.stages?.integrationInput

  if (!integrationInput?.hasSample) return 'unavailable'

  const normalForceSummary = integrationInput.normalForceSummary ?? {}
  const tractionLimitSummary = integrationInput.tractionLimitSummary ?? {}
  const longitudinalTireForceSummary =
    integrationInput.longitudinalTireForceSummary ?? {}
  const lateralTireForceSummary =
    integrationInput.lateralTireForceSummary ?? {}
  const yawMomentSummary = integrationInput.yawMomentSummary ?? {}

  return [
    `input load ${formatNumber(normalForceSummary.totalNewtons, 0)} N`,
    `grip ${formatNumber(tractionLimitSummary.totalNewtons, 0)} N`,
    `long T/R/A ${formatNumber(longitudinalTireForceSummary.targetTotalNewtons, 0)}/${formatNumber(longitudinalTireForceSummary.relaxedTotalNewtons, 0)}/${formatNumber(longitudinalTireForceSummary.appliedTotalNewtons, 0)} N`,
    `lat ${formatNumber(lateralTireForceSummary.appliedTotalNewtons, 0)} N`,
    `yaw ${formatNumber(yawMomentSummary.totalNewtonMeters, 0)} N*m`,
  ].join(' / ')
}

function formatAerodynamicDragTelemetry(aerodynamicDrag = {}) {
  const enabledLabel = aerodynamicDrag.enabled === false ? 'off / ' : ''

  return [
    `${enabledLabel}${formatNumber(aerodynamicDrag.dragForceNewtons, 0)} N`,
    `CdA ${formatNumber(aerodynamicDrag.dragAreaSquareMeters, 2)}`,
    `${formatNumber(aerodynamicDrag.speedMetersPerSecond, 1)} m/s`,
  ].join(' / ')
}

function formatChassisMassPropertiesTelemetry(chassisMassProperties = {}) {
  if (!chassisMassProperties.available) return 'unavailable'

  const frontBiasPercent = Math.round(
    clampPercent(chassisMassProperties.frontStaticWeightBias01) * 100
  )
  const rearBiasPercent = Math.max(0, Math.min(100, 100 - frontBiasPercent))

  return [
    `${formatNumber(chassisMassProperties.massKg, 0)} kg`,
    `CoM ${formatNumber(chassisMassProperties.centerOfMassHeightMeters, 2)} m`,
    `F/R ${frontBiasPercent}/${rearBiasPercent}`,
    `yaw I ${formatNumber(chassisMassProperties.yawMomentOfInertiaKgMeterSquared, 0)} kg*m²`,
  ].join(' / ')
}

function clampPercent(value) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return 'NaN'
  return value.toFixed(digits)
}

function formatVector3(vector, digits = 2) {
  if (!vector) return 'NaN, NaN, NaN'

  return [
    formatNumber(vector.x, digits),
    formatNumber(vector.y, digits),
    formatNumber(vector.z, digits),
  ].join(', ')
}

function countGroundedWheels(wheelStates) {
  let groundedWheelCount = 0

  for (const wheelState of wheelStates) {
    if (wheelState.isGrounded) {
      groundedWheelCount += 1
    }
  }

  return groundedWheelCount
}

function formatWheelGroundedStates(wheelStates) {
  if (wheelStates.length === 0) return 'none'

  return wheelStates
    .map((wheelState) =>
      `${formatWheelId(wheelState)}:${wheelState.isGrounded ? 'G' : 'air'}`
    )
    .join(' ')
}

function formatWheelAngularVelocities(wheelStates) {
  if (wheelStates.length === 0) return 'none'

  return wheelStates
    .map((wheelState) => {
      const angularVelocityRadiansPerSecond =
        wheelState.angularVelocityRadiansPerSecond

      return `${formatWheelId(wheelState)}:${formatNumber(angularVelocityRadiansPerSecond)}`
    })
    .join(' ')
}

function formatLongitudinalTireForceTelemetry(wheelStates) {
  if (wheelStates.length === 0) return 'none'

  let maxUncappedLongitudinalTireForceNewtonsAbs = 0
  let maxAppliedLongitudinalTireForceNewtonsAbs = 0
  let saturatedWheelCount = 0

  for (const wheelState of wheelStates) {
    const uncappedLongitudinalTireForceNewtons = Number.isFinite(
      wheelState.uncappedLongitudinalTireForceNewtons
    )
      ? wheelState.uncappedLongitudinalTireForceNewtons
      : 0

    const appliedLongitudinalForceNewtons = Number.isFinite(
      wheelState.appliedLongitudinalForceNewtons
    )
      ? wheelState.appliedLongitudinalForceNewtons
      : 0

    maxUncappedLongitudinalTireForceNewtonsAbs = Math.max(
      maxUncappedLongitudinalTireForceNewtonsAbs,
      Math.abs(uncappedLongitudinalTireForceNewtons)
    )

    maxAppliedLongitudinalTireForceNewtonsAbs = Math.max(
      maxAppliedLongitudinalTireForceNewtonsAbs,
      Math.abs(appliedLongitudinalForceNewtons)
    )

    if (wheelState.isLongitudinalTireForceSaturated) {
      saturatedWheelCount += 1
    }
  }

  return [
    `u ${formatNumber(maxUncappedLongitudinalTireForceNewtonsAbs, 0)}`,
    `a ${formatNumber(maxAppliedLongitudinalTireForceNewtonsAbs, 0)} N`,
    `sat ${saturatedWheelCount}`,
  ].join(' / ')
}

function formatLongitudinalTireForceRelaxationTelemetry(wheelStates) {
  if (wheelStates.length === 0) return 'unavailable'

  const wheelRelaxationTelemetry = []

  for (const wheelState of wheelStates) {
    const relaxationAlpha = Number.isFinite(
      wheelState.longitudinalTireForceRelaxationAlpha
    )
      ? wheelState.longitudinalTireForceRelaxationAlpha
      : null

    if (relaxationAlpha === null) return 'unavailable'

    wheelRelaxationTelemetry.push(
      `${formatWheelId(wheelState)} ${formatNumber(relaxationAlpha * 100, 0)}%`
    )
  }

  return wheelRelaxationTelemetry.join(' ')
}

function formatTireSlipFeedbackTelemetry(tireSlipFeedback = {}) {
  return [
    `active ${formatNumber(tireSlipFeedback.activeVisualSlipEffectCount ?? 0, 0)}`,
    `spin ${formatNumber(tireSlipFeedback.driveSpinVisualCount ?? 0, 0)}`,
    `brake-lock ${formatNumber(tireSlipFeedback.brakeLockVisualCount ?? 0, 0)}`,
    `sat ${formatNumber(tireSlipFeedback.saturatedVisualCount ?? 0, 0)}`,
    `intensity ${formatNumber(tireSlipFeedback.maxSlipFeedbackIntensity ?? 0, 2)}`,
  ].join(' / ')
}

function formatServiceBrakeAbsTelemetry(serviceBrakeAbsSummary = {}) {
  return [
    serviceBrakeAbsSummary.dominantState ?? 'inactive',
    `active ${formatNumber(serviceBrakeAbsSummary.activeWheelCount ?? 0, 0)}`,
    `rel ${formatNumber(serviceBrakeAbsSummary.releasingWheelCount ?? 0, 0)}`,
    `hold ${formatNumber(serviceBrakeAbsSummary.holdingWheelCount ?? 0, 0)}`,
    `reapply ${formatNumber(serviceBrakeAbsSummary.reapplyingWheelCount ?? 0, 0)}`,
    `min ${formatNumber(serviceBrakeAbsSummary.minModulation01 ?? 1, 2)}`,
  ].join(' / ')
}

function formatTractionStateSummary(tractionStateSummary = {}) {
  return [
    tractionStateSummary.dominantLongitudinalTractionState ?? 'unknown',
    `spin ${formatNumber(tractionStateSummary.driveSpinningWheelCount, 0)}`,
    `brake-lock ${formatNumber(tractionStateSummary.brakeLockTendencyWheelCount, 0)}`,
    `svc-lock ${formatNumber(tractionStateSummary.serviceBrakeLockTendencyWheelCount, 0)}`,
    `park-lock ${formatNumber(tractionStateSummary.parkingBrakeLockTendencyWheelCount, 0)}`,
    `sat ${formatNumber(tractionStateSummary.saturatedWheelCount, 0)}`,
    `slip ${formatNumber(tractionStateSummary.maxAbsLongitudinalSlipRatio, 3)}`,
    `cap ${formatNumber(tractionStateSummary.maxLongitudinalTireForceSaturationRatio, 2)}`,
  ].join(' / ')
}

function formatTireSaturationTelemetry(wheelStates) {
  if (wheelStates.length === 0) return 'none'

  let maxLongitudinalTireForceSaturationRatio = 0
  let saturatedWheelCount = 0

  for (const wheelState of wheelStates) {
    const longitudinalTireForceSaturationRatio = Number.isFinite(
      wheelState.longitudinalTireForceSaturationRatio
    )
      ? wheelState.longitudinalTireForceSaturationRatio
      : 0

    maxLongitudinalTireForceSaturationRatio = Math.max(
      maxLongitudinalTireForceSaturationRatio,
      longitudinalTireForceSaturationRatio
    )

    if (wheelState.isLongitudinalTireForceSaturated) {
      saturatedWheelCount += 1
    }
  }

  return `max ${formatNumber(maxLongitudinalTireForceSaturationRatio, 2)} / sat ${saturatedWheelCount}`
}

function formatLateralTireForceTelemetry(lateralTireForceSummary = {}) {
  return [
    `max ${formatNumber(lateralTireForceSummary.maxAbsLateralTireForceNewtons ?? 0, 0)} N`,
    `total ${formatNumber(lateralTireForceSummary.totalLateralTireForceNewtons ?? 0, 0)} N`,
    `sat ${formatNumber(lateralTireForceSummary.lateralTireForceSaturatedWheelCount ?? 0, 0)}`,
  ].join(' / ')
}

function formatCombinedTireForceTelemetry(lateralTireForceSummary = {}) {
  return [
    `sat ${formatNumber(lateralTireForceSummary.combinedTireForceSaturatedWheelCount ?? 0, 0)}`,
    `max ${formatNumber(lateralTireForceSummary.maxCombinedTireForceSaturationRatio ?? 0, 2)}`,
  ].join(' / ')
}

function formatYawBudgetTelemetry(yawDynamics = {}) {
  const moment = Number(yawDynamics.yawMomentNewtonMeters)
  const inertia = Number(yawDynamics.yawMomentOfInertiaKilogramSquareMeters)
  const accel = Number(yawDynamics.yawAccelerationRadiansPerSecondSquared)
  const rate = Number(yawDynamics.yawVelocityRadiansPerSecond)

  const hasMoment = Number.isFinite(moment)
  const hasInertia = Number.isFinite(inertia)
  const hasAccel = Number.isFinite(accel)
  const hasRate = Number.isFinite(rate)

  if (!hasMoment && !hasInertia && !hasAccel && !hasRate) return 'unavailable'

  const signed = (value) => (value >= 0 ? '+' : '') + formatNumber(value, 2)
  const parts = []
  if (hasMoment) parts.push(signed(moment) + ' N*m')
  if (hasInertia) parts.push('I ' + formatNumber(inertia, 0))
  if (hasAccel) parts.push('accel ' + signed(accel) + ' rad/s²')
  if (hasRate) parts.push('rate ' + signed(rate) + ' rad/s')
  return parts.join(' / ')
}

function formatYawBudgetWheelContributionsTelemetry(yawDynamics = {}) {
  const contributions = yawDynamics.perWheelYawMomentContributions
  if (!Array.isArray(contributions) || contributions.length === 0) return 'unavailable'

  const parts = []
  for (const contribution of contributions) {
    const value = Number(contribution.yawMomentContributionNewtonMeters)
    if (!Number.isFinite(value)) continue
    parts.push(
      formatWheelId(contribution) +
        ' ' +
        (value >= 0 ? '+' : '') +
        formatNumber(value, 0)
    )
  }

  return parts.length > 0 ? parts.join(' ') : 'unavailable'
}

function formatYawMomentTelemetry(lateralTireForceSummary = {}) {
  return [
    `${formatNumber(lateralTireForceSummary.yawMomentNewtonMeters ?? 0, 0)} N*m`,
    `${formatNumber(lateralTireForceSummary.yawAccelerationRadiansPerSecondSquared ?? 0, 3)} rad/s²`,
  ].join(' / ')
}

function formatLoadTransferTelemetry(loadTransferSummary = {}) {
  return [
    `long ${formatNumber(loadTransferSummary.totalLongitudinalTransferAbsNewtons ?? 0, 0)} N`,
    `lat ${formatNumber(loadTransferSummary.totalLateralTransferAbsNewtons ?? 0, 0)} N`,
    `unloaded ${formatNumber(loadTransferSummary.unloadedWheelCount ?? 0, 0)}`,
  ].join(' / ')
}

function formatLoadTransferBiasTelemetry(loadTransferSummary = {}) {
  return [
    `front ${formatNumber(loadTransferSummary.frontAxleNormalForceNewtons ?? 0, 0)} N`,
    `rear ${formatNumber(loadTransferSummary.rearAxleNormalForceNewtons ?? 0, 0)} N`,
    `left ${formatNumber(loadTransferSummary.leftSideNormalForceNewtons ?? 0, 0)} N`,
    `right ${formatNumber(loadTransferSummary.rightSideNormalForceNewtons ?? 0, 0)} N`,
  ].join(' / ')
}

function formatWheelNormalForceTelemetry(loadTransferSummary = {}) {
  return [
    `max ${formatNumber(loadTransferSummary.maxWheelNormalForceNewtons ?? 0, 0)} N`,
    `min ${formatNumber(loadTransferSummary.minGroundedWheelNormalForceNewtons ?? 0, 0)} N`,
    `total ${formatNumber(loadTransferSummary.totalDynamicNormalForceNewtons ?? 0, 0)} N`,
  ].join(' / ')
}

function formatWheelLoadDistributionTelemetry(wheelStates = []) {
  if (!Array.isArray(wheelStates) || wheelStates.length === 0) return 'unavailable'

  let totalNormalForceNewtons = 0
  for (const wheelState of wheelStates) {
    const normalForceNewtons = Number(wheelState.normalForceNewtons)
    if (Number.isFinite(normalForceNewtons) && normalForceNewtons > 0) {
      totalNormalForceNewtons += normalForceNewtons
    }
  }

  if (!Number.isFinite(totalNormalForceNewtons) || totalNormalForceNewtons <= 0) {
    return 'unavailable'
  }

  const perWheelParts = []
  let frontNormalForceNewtons = 0
  for (const wheelState of wheelStates) {
    const normalForceNewtons = Number(wheelState.normalForceNewtons)
    const safeNormalForce = Number.isFinite(normalForceNewtons) && normalForceNewtons > 0
      ? normalForceNewtons
      : 0
    const percent = Math.min(Math.max((safeNormalForce / totalNormalForceNewtons) * 100, 0), 100)
    perWheelParts.push(formatWheelId(wheelState) + ' ' + Math.round(percent) + '%')
    if (wheelState.axle === 'front') {
      frontNormalForceNewtons += safeNormalForce
    }
  }

  const frontPercent = Math.min(Math.max(Math.round((frontNormalForceNewtons / totalNormalForceNewtons) * 100), 0), 100)
  const rearPercent = 100 - frontPercent

  return perWheelParts.join(' ') + ' | F/R ' + frontPercent + '/' + rearPercent
}

function formatSuspensionTelemetry(wheelStates = []) {
  if (!Array.isArray(wheelStates) || wheelStates.length === 0) {
    return 'unavailable'
  }

  const perWheelParts = []
  let totalNormalForceNewtons = 0

  for (const wheelState of wheelStates) {
    const compressionRatio01 = Number(wheelState.suspensionCompressionRatio01)
    const normalForceNewtons = Number(wheelState.normalForceNewtons)

    if (
      !Number.isFinite(compressionRatio01) ||
      !Number.isFinite(normalForceNewtons) ||
      normalForceNewtons < 0
    ) {
      return 'unavailable'
    }

    perWheelParts.push(
      `${formatWheelId(wheelState)} ${Math.round(clampPercent(compressionRatio01) * 100)}%`
    )
    totalNormalForceNewtons += normalForceNewtons
  }

  if (!Number.isFinite(totalNormalForceNewtons)) return 'unavailable'

  return `${perWheelParts.join(' ')} | normal ${formatNumber(totalNormalForceNewtons / 1000, 1)} kN`
}

function formatTerrainSupportTelemetry(chassisTerrainSupport = {}) {
  const profileName = chassisTerrainSupport.profileName ?? 'unavailable'
  const terrainHeightMeters = Number(chassisTerrainSupport.supportTerrainHeightMeters)
  const supportHeightMeters = Number(
    chassisTerrainSupport.currentChassisSupportHeightMeters
  )
  const slopeDegrees = Number(chassisTerrainSupport.supportSlopeDegrees)
  const boundsLabel = chassisTerrainSupport.isWithinTerrainBounds === false
    ? 'outside'
    : 'in-bounds'

  return [
    profileName,
    `terrain ${formatNumber(terrainHeightMeters, 2)} m`,
    `Y ${formatNumber(supportHeightMeters, 2)} m`,
    `slope ${formatNumber(slopeDegrees, 1)} deg`,
    boundsLabel,
  ].join(' / ')
}

function formatChassisAttitudeTelemetry(chassisAttitude = {}) {
  const heaveOffsetMeters = Number(chassisAttitude.heaveOffsetMeters)
  const pitchDegrees = radiansToDegrees(Number(chassisAttitude.pitchRadians))
  const rollDegrees = radiansToDegrees(Number(chassisAttitude.rollRadians))
  const groundedSupportCount = Number(chassisAttitude.groundedSupportCount)
  const modeLabel = chassisAttitude.supportPlaneModeLabel ?? 'unavailable'

  return [
    `heave ${formatNumber(heaveOffsetMeters, 3)} m`,
    `pitch ${formatNumber(pitchDegrees, 2)} deg`,
    `roll ${formatNumber(rollDegrees, 2)} deg`,
    `support ${formatNumber(groundedSupportCount, 0)}`,
    modeLabel,
  ].join(' / ')
}

function formatSlopeGravityTelemetry(slopeGravity = {}) {
  const forceWorld = slopeGravity.slopeGravityForceWorld ?? {}
  const forceNewtons = Number(slopeGravity.slopeGravityForceNewtons)

  if (slopeGravity.isSupported !== true) return 'unsupported / 0 N'

  return [
    `${formatNumber(forceNewtons / 1000, 2)} kN`,
    `X ${formatNumber(forceWorld.x, 0)} N`,
    `Z ${formatNumber(forceWorld.z, 0)} N`,
    `support slope ${formatNumber(slopeGravity.supportSlopeDegrees, 1)} deg`,
  ].join(' / ')
}

function formatSuspensionSupportTelemetry(summary = {}) {
  const groundedWheelCount = Number(summary.groundedWheelCount)
  const rawForceNewtons = Number(summary.totalRawSuspensionNormalForceNewtons)
  const baseForceNewtons = Number(summary.totalBaseNormalForceNewtons)
  const referenceWeightNewtons = Number(summary.vehicleWeightReferenceNewtons)
  const conservationErrorNewtons = Number(
    summary.normalForceConservationErrorNewtons
  )

  return [
    `${formatNumber(groundedWheelCount, 0)} grounded`,
    `raw ${formatNumber(rawForceNewtons / 1000, 1)} kN`,
    `base ${formatNumber(baseForceNewtons / 1000, 1)} kN`,
    `weight ${formatNumber(referenceWeightNewtons / 1000, 1)} kN`,
    `error ${formatNumber(conservationErrorNewtons, 1)} N`,
  ].join(' / ')
}

function formatSuspensionWheelTelemetry(wheelStates = []) {
  if (!Array.isArray(wheelStates) || wheelStates.length === 0) {
    return 'unavailable'
  }

  const parts = []
  for (const wheelState of wheelStates) {
    if (!wheelState.isGrounded) {
      parts.push(`${formatWheelId(wheelState)} airborne`)
      continue
    }

    parts.push(
      `${formatWheelId(wheelState)} len ${formatNumber(wheelState.suspensionCurrentLengthMeters, 3)} m ` +
      `comp ${formatNumber((wheelState.suspensionCompressionMeters ?? 0) * 1000, 0)} mm ` +
      `spr ${formatNumber((wheelState.springForceNewtons ?? 0) / 1000, 1)} kN ` +
      `dmp ${formatNumber((wheelState.damperForceNewtons ?? 0) / 1000, 1)} kN`
    )
  }

  return parts.join(' | ')
}

function formatGForceTelemetry(snapshot = {}) {
  const localForward = Number(snapshot.planarAccelerationLocalForwardMetersPerSecondSquared)
  const localLateral = Number(snapshot.planarAccelerationLocalLateralMetersPerSecondSquared)
  const worldAcceleration = snapshot.planarAccelerationWorldMetersPerSecondSquared

  const hasForward = Number.isFinite(localForward)
  const hasLateral = Number.isFinite(localLateral)
  const hasWorld =
    worldAcceleration &&
    Number.isFinite(worldAcceleration.x) &&
    Number.isFinite(worldAcceleration.y) &&
    Number.isFinite(worldAcceleration.z)

  if (!hasForward && !hasLateral && !hasWorld) return 'unavailable'

  const g = EARTH_GRAVITY.standardMetersPerSecondSquared
  const clampG = (value) =>
    Math.min(Math.max(value, -G_FORCE_DISPLAY_CLAMP_G), G_FORCE_DISPLAY_CLAMP_G)

  const forwardG = hasForward ? clampG(localForward / g) : 0
  const lateralG = hasLateral ? clampG(localLateral / g) : 0
  const totalG = Math.hypot(forwardG, lateralG)

  const signed = (value) => (value >= 0 ? '+' : '') + formatNumber(value, 2)

  return 'long ' + signed(forwardG) + 'g' + ' / lat ' + signed(lateralG) + 'g' + ' / total ' + formatNumber(totalG, 2) + 'g'
}

function formatWheelNetTorqueTelemetry(wheelStates) {
  if (wheelStates.length === 0) return 'none'

  let maxNetTorqueNewtonMetersAbs = 0

  for (const wheelState of wheelStates) {
    const netTorqueNewtonMeters = Number.isFinite(wheelState.netTorqueNewtonMeters)
      ? wheelState.netTorqueNewtonMeters
      : 0

    maxNetTorqueNewtonMetersAbs = Math.max(
      maxNetTorqueNewtonMetersAbs,
      Math.abs(netTorqueNewtonMeters)
    )
  }

  return `max ${formatNumber(maxNetTorqueNewtonMetersAbs, 0)} N*m`
}

function countLockedWheels(wheelStates) {
  let lockedWheelCount = 0

  for (const wheelState of wheelStates) {
    if (wheelState.isWheelLocked) {
      lockedWheelCount += 1
    }
  }

  return lockedWheelCount
}

function formatPowertrainTelemetry(powertrain = {}) {
  const engine = powertrain.engine
  const transmission = powertrain.transmission

  if (!engine || !transmission) return 'unavailable'

  return `${engine.displayName} / ${transmission.displayName}`
}

function formatPowertrainRpmTelemetry(kinematics = {}) {
  if (!kinematics || !Number.isFinite(kinematics.estimatedEngineRpm)) {
    return 'unavailable'
  }

  const rpm = Math.round(kinematics.estimatedEngineRpm)
  const rpmState = kinematics.engineRpmState ?? 'unavailable'
  const connectionState = kinematics.powertrainConnectionState ?? 'disconnected'

  if (connectionState === 'disconnected') {
    return `${rpm} rpm ${rpmState} / ${connectionState}`
  }

  const gearLabel = kinematics.selectedForwardGearLabel ?? ''
  const transmissionRatio = Number.isFinite(kinematics.transmissionRatio)
    ? kinematics.transmissionRatio.toFixed(2)
    : '?'
  const finalDriveRatio = Number.isFinite(kinematics.finalDriveRatio)
    ? kinematics.finalDriveRatio.toFixed(2)
    : '?'

  return `${rpm} rpm ${gearLabel} ratio ${transmissionRatio} final ${finalDriveRatio}`
}

function formatStockEngineCatalogTelemetry(stockEngineCatalogTelemetry = {}) {
  if (
    stockEngineCatalogTelemetry.catalogTelemetryStatus !== 'available' ||
    typeof stockEngineCatalogTelemetry.stockEngineDisplayName !== 'string'
  ) {
    return 'unavailable'
  }

  const displacementCubicCentimeters = Number.isFinite(
    stockEngineCatalogTelemetry.stockEngineCatalog?.geometry
      ?.displacementCubicCentimeters
  )
    ? Math.round(
        stockEngineCatalogTelemetry.stockEngineCatalog.geometry
          .displacementCubicCentimeters
      )
    : Math.round(
        Number.isFinite(
          stockEngineCatalogTelemetry.derivedDisplacementCubicCentimeters
        )
          ? stockEngineCatalogTelemetry.derivedDisplacementCubicCentimeters
          : 0
      )

  return `${stockEngineCatalogTelemetry.stockEngineDisplayName} / ${displacementCubicCentimeters}cc ${stockEngineCatalogTelemetry.strokeGeometryKind ?? 'unknown'}`
}

function formatLongitudinalSlipTelemetry(wheelStates) {
  if (wheelStates.length === 0) return 'none'

  let maxLongitudinalSlipRatioAbs = 0

  for (const wheelState of wheelStates) {
    const longitudinalSlipRatioAbs = Number.isFinite(wheelState.longitudinalSlipRatioAbs)
      ? wheelState.longitudinalSlipRatioAbs
      : 0

    maxLongitudinalSlipRatioAbs = Math.max(
      maxLongitudinalSlipRatioAbs,
      longitudinalSlipRatioAbs
    )
  }

  return `max ${formatNumber(maxLongitudinalSlipRatioAbs, 3)}`
}

function formatLateralSlipTelemetry(lateralSlipSummary = {}) {
  return [
    lateralSlipSummary.dominantLateralSlipState ?? 'unavailable',
    `max ${formatNumber(lateralSlipSummary.maxAbsLateralSlipAngleDegrees ?? 0, 1)} deg`,
    `high ${formatNumber(lateralSlipSummary.highLateralSlipWheelCount ?? 0, 0)}`,
    `warn ${formatNumber(lateralSlipSummary.lateralSlipWarningWheelCount ?? 0, 0)}`,
    `sampled ${formatNumber(lateralSlipSummary.sampledLateralSlipWheelCount ?? 0, 0)}`,
    `front ${formatNumber(lateralSlipSummary.frontAxleMaxAbsLateralSlipAngleDegrees ?? 0, 1)}`,
    `rear ${formatNumber(lateralSlipSummary.rearAxleMaxAbsLateralSlipAngleDegrees ?? 0, 1)}`,
  ].join(' / ')
}

function formatBrakeTorqueTelemetry(wheelStates) {
  if (wheelStates.length === 0) return 'none'

  let maxServiceBrakePressure01 = 0
  let maxParkingBrakePressure01 = 0
  let maxServiceBrakeTorqueNewtonMeters = 0
  let maxParkingBrakeTorqueNewtonMeters = 0
  let maxTotalBrakeTorqueNewtonMeters = 0
  let frontServiceBrakeTorqueSumNewtonMeters = 0
  let rearServiceBrakeTorqueSumNewtonMeters = 0
  let frontWheelCount = 0
  let rearWheelCount = 0

  for (const wheelState of wheelStates) {
    const serviceBrakePressure01 = Number.isFinite(wheelState.serviceBrakePressure01)
      ? wheelState.serviceBrakePressure01
      : 0
    const parkingBrakePressure01 = Number.isFinite(wheelState.parkingBrakePressure01)
      ? wheelState.parkingBrakePressure01
      : 0
    const serviceBrakeTorqueNewtonMeters = Number.isFinite(
      wheelState.appliedServiceBrakeTorqueNewtonMeters
    )
      ? wheelState.appliedServiceBrakeTorqueNewtonMeters
      : 0
    const parkingBrakeTorqueNewtonMeters = Number.isFinite(
      wheelState.appliedParkingBrakeTorqueNewtonMeters
    )
      ? wheelState.appliedParkingBrakeTorqueNewtonMeters
      : 0
    const totalBrakeTorqueNewtonMeters = Number.isFinite(
      wheelState.totalBrakeTorqueNewtonMeters
    )
      ? wheelState.totalBrakeTorqueNewtonMeters
      : wheelState.appliedBrakeTorqueNewtonMeters ?? 0

    maxServiceBrakePressure01 = Math.max(
      maxServiceBrakePressure01,
      serviceBrakePressure01
    )
    maxParkingBrakePressure01 = Math.max(
      maxParkingBrakePressure01,
      parkingBrakePressure01
    )
    maxServiceBrakeTorqueNewtonMeters = Math.max(
      maxServiceBrakeTorqueNewtonMeters,
      serviceBrakeTorqueNewtonMeters
    )
    maxParkingBrakeTorqueNewtonMeters = Math.max(
      maxParkingBrakeTorqueNewtonMeters,
      parkingBrakeTorqueNewtonMeters
    )
    maxTotalBrakeTorqueNewtonMeters = Math.max(
      maxTotalBrakeTorqueNewtonMeters,
      totalBrakeTorqueNewtonMeters
    )

    if (wheelState.axle === 'front') {
      frontServiceBrakeTorqueSumNewtonMeters += serviceBrakeTorqueNewtonMeters
      frontWheelCount++
    } else {
      rearServiceBrakeTorqueSumNewtonMeters += serviceBrakeTorqueNewtonMeters
      rearWheelCount++
    }
  }

  return [
    `svc ${formatNumber(maxServiceBrakePressure01)} p / ${formatNumber(maxServiceBrakeTorqueNewtonMeters, 0)} N*m`,
    `bias F${formatNumber(frontServiceBrakeTorqueSumNewtonMeters, 0)} R${formatNumber(rearServiceBrakeTorqueSumNewtonMeters, 0)} N*m`,
    `park ${formatNumber(maxParkingBrakePressure01)} p / ${formatNumber(maxParkingBrakeTorqueNewtonMeters, 0)} N*m`,
    `total ${formatNumber(maxTotalBrakeTorqueNewtonMeters, 0)} N*m`,
  ].join(' / ')
}

function formatWheelId(wheelState) {
  const axle = wheelState.axle === 'front' ? 'F' : 'R'
  const side = wheelState.side === 'left' ? 'L' : 'R'

  return `${axle}${side}`
}

function radiansToDegrees(radians) {
  return Number.isFinite(radians) ? radians * (180 / Math.PI) : NaN
}

function vectorMagnitude(vector) {
  if (!vector) return NaN

  const x = vector.x ?? 0
  const y = vector.y ?? 0
  const z = vector.z ?? 0

  return Math.sqrt(x * x + y * y + z * z)
}
