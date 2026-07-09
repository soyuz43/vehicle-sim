// src/ui/debugHud/createDebugHud.js

const DEFAULT_CORNER = 'top-left'

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
    const tireSlipFeedback = snapshot.tireSlipFeedback ?? {}

    debugHudText.textContent = [
      'Vehicle Sim Debug',
      '',
      `Camera: ${snapshot.cameraMode ?? 'unknown'}`,
      `Controller: ${snapshot.controllerKind ?? 'unknown'}`,
      `Tire pressure: ${formatTirePressureTelemetry(snapshot.tirePressureState)}`,
      `Dynamics tuning: ${formatDynamicsTuningTelemetry(snapshot.dynamicsTuning)}`,
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
      `Velocity XYZ: ${formatVector3(snapshot.velocity)} m/s`,
      `Velocity mag: ${formatNumber(vectorMagnitude(snapshot.velocity))} m/s`,
      `Acceleration: ${formatNumber(snapshot.longitudinalAcceleration)} m/s²`,
      `Local accel forward: ${formatNumber(snapshot.planarAccelerationLocalForwardMetersPerSecondSquared)} m/s²`,
      `Local accel lateral: ${formatNumber(snapshot.planarAccelerationLocalLateralMetersPerSecondSquared)} m/s²`,
      `Planar accel XYZ: ${formatVector3(snapshot.planarAccelerationWorldMetersPerSecondSquared)} m/s²`,
      '',
      `Drive force: ${formatNumber(forces.driveForceNewtons)} N`,
      `Brake force: ${formatNumber(forces.brakeForceNewtons)} N`,
      `Brake torque: ${formatBrakeTorqueTelemetry(wheelStates)}`,
      `Service ABS: ${formatServiceBrakeAbsTelemetry(serviceBrakeAbsSummary)}`,
      `Rolling resistance: ${formatNumber(forces.rollingResistanceForceNewtons)} N`,
      `Aero drag: ${formatNumber(forces.aerodynamicDragForceNewtons)} N`,
      `Net force: ${formatNumber(forces.netLongitudinalForceNewtons)} N`,
      `Traction limit: ${formatNumber(forces.tractionLimitLongitudinalNewtons)} N`,
      `Traction limited: ${forces.isTractionLimited ? 'YES' : 'no'}`,
      `Tire force: ${formatLongitudinalTireForceTelemetry(wheelStates)}`,
      `Tire saturation: ${formatTireSaturationTelemetry(wheelStates)}`,
      `Traction state: ${formatTractionStateSummary(tractionStateSummary)}`,
      `Slip visuals: ${formatTireSlipFeedbackTelemetry(tireSlipFeedback)}`,
      '',
      `Grounded wheels: ${countGroundedWheels(wheelStates)} / ${wheelStates.length}`,
      `Wheel contact: ${formatWheelGroundedStates(wheelStates)}`,
      `Wheel angular velocity: ${formatWheelAngularVelocities(wheelStates)} rad/s`,
      `Wheel net torque: ${formatWheelNetTorqueTelemetry(wheelStates)}`,
      `Longitudinal slip ratio: ${formatLongitudinalSlipTelemetry(wheelStates)}`,
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

function formatDynamicsTuningTelemetry(dynamicsTuning = {}) {
  return [
    `drive x${formatNumber(dynamicsTuning.driveTorqueMultiplier)}`,
    `brake x${formatNumber(dynamicsTuning.serviceBrakeTorqueMultiplier)}`,
    `tire x${formatNumber(dynamicsTuning.longitudinalTireStiffnessMultiplier)}`,
  ].join(' / ')
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

function formatBrakeTorqueTelemetry(wheelStates) {
  if (wheelStates.length === 0) return 'none'

  let maxServiceBrakePressure01 = 0
  let maxParkingBrakePressure01 = 0
  let maxServiceBrakeTorqueNewtonMeters = 0
  let maxParkingBrakeTorqueNewtonMeters = 0
  let maxTotalBrakeTorqueNewtonMeters = 0

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
  }

  return [
    `svc ${formatNumber(maxServiceBrakePressure01)} p / ${formatNumber(maxServiceBrakeTorqueNewtonMeters, 0)} N*m`,
    `park ${formatNumber(maxParkingBrakePressure01)} p / ${formatNumber(maxParkingBrakeTorqueNewtonMeters, 0)} N*m`,
    `total ${formatNumber(maxTotalBrakeTorqueNewtonMeters, 0)} N*m`,
  ].join(' / ')
}

function formatWheelId(wheelState) {
  const axle = wheelState.axle === 'front' ? 'F' : 'R'
  const side = wheelState.side === 'left' ? 'L' : 'R'

  return `${axle}${side}`
}

function vectorMagnitude(vector) {
  if (!vector) return NaN

  const x = vector.x ?? 0
  const y = vector.y ?? 0
  const z = vector.z ?? 0

  return Math.sqrt(x * x + y * y + z * z)
}