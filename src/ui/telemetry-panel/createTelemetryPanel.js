// src/ui/telemetry-panel/createTelemetryPanel.js
/**
 * TelemetryPanel — Developer-facing telemetry dashboard.
 * Replaces createDebugHud with collapsible sections, sparklines, gauges, search/filter.
 * Uses design system for consistent styling and accessibility.
 */

import { token } from '../design-system/theme.js';
import { createPanel } from '../design-system/components/Panel.js';
import { createSection } from '../design-system/components/Section.js';
import { createValueDisplay } from '../design-system/components/ValueDisplay.js';
import { createGauge } from '../design-system/components/Gauge.js';
import { createSparkline } from '../design-system/components/Sparkline.js';
import { createBadge } from '../design-system/components/Badge.js';
import { createButton } from '../design-system/components/Button.js';
import { createVStack, createHStack } from '../design-system/layout/Stack.js';
import { useMobileBottomSheet } from '../design-system/layout/Responsive.js';

const SECTIONS = [
  { id: 'chassis', title: 'Chassis', icon: 'database' },
  { id: 'powertrain', title: 'Powertrain', icon: 'gear' },
  { id: 'tires', title: 'Tires', icon: 'tire' },
  { id: 'brakes', title: 'Brakes', icon: 'alertTriangle' },
  { id: 'aero', title: 'Aero', icon: 'activity' },
  { id: 'suspension', title: 'Suspension', icon: 'trendingUp' },
];

const DEFAULT_CONFIG = {
  anchor: 'top-left',
  initiallyCollapsed: false,
  zIndex: null,
  onPositionChange: null,
  persistState: true,
  storageKey: 'telemetry-panel-state',
};

export function createTelemetryPanel(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Load persisted collapse state
  let persistedState = {};
  if (cfg.persistState) {
    try {
      const stored = localStorage.getItem(cfg.storageKey);
      if (stored) persistedState = JSON.parse(stored);
    } catch (_) {}
  }

  // Create main panel
  const panel = createPanel({
    id: 'telemetry-panel',
    title: 'Telemetry',
    anchor: cfg.anchor,
    collapsible: true,
    draggable: true,
    initiallyCollapsed: cfg.initiallyCollapsed,
    width: 360,
    minWidth: 320,
    maxWidth: 500,
    zIndex: cfg.zIndex ?? token('zIndex.debug'),
    onPositionChange: cfg.onPositionChange,
    onCollapseChange: (collapsed) => {
      if (cfg.persistState) persistState({ collapsed });
    },
  });

  const content = panel.content;
  content.style.padding = 'var(--ui-space-sm)';
  content.style.display = 'flex';
  content.style.flexDirection = 'column';
  content.style.gap = 'var(--ui-space-sm)';
  content.style.maxHeight = 'calc(100vh - 100px)';
  content.style.overflowY = 'auto';

  // Search/filter bar
  const searchRow = createHStack({ gap: 'var(--ui-space-sm)', align: 'center' });
  searchRow.style.padding = 'var(--ui-space-xs) 0';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Filter telemetry...';
  searchInput.setAttribute('aria-label', 'Filter telemetry');
  Object.assign(searchInput.style, {
    flex: '1',
    height: '28px',
    padding: '0 var(--ui-space-sm)',
    fontFamily: 'var(--ui-font-ui)',
    fontSize: 'var(--ui-typeScale-sm)',
    color: 'var(--ui-color-text-primary)',
    background: 'var(--ui-color-bg-input)',
    border: '1px solid var(--ui-color-border-default)',
    borderRadius: 'var(--ui-radius-sm)',
    outline: 'none',
    transition: 'border-color var(--ui-transition-fast), box-shadow var(--ui-transition-fast)',
  });
  searchInput.addEventListener('focus', () => {
    searchInput.style.borderColor = 'var(--ui-color-border-focus)';
    searchInput.style.boxShadow = 'var(--ui-shadow-focus)';
  });
  searchInput.addEventListener('blur', () => {
    searchInput.style.borderColor = 'var(--ui-color-border-default)';
    searchInput.style.boxShadow = 'none';
  });

  const clearBtn = createButton({
    variant: 'ghost',
    size: 'sm',
    label: 'Clear',
    icon: getIconSvg('x', 12),
    onClick: () => { searchInput.value = ''; searchInput.dispatchEvent(new Event('input')); },
  });

  searchRow.appendChild(searchInput);
  searchRow.appendChild(clearBtn.element);
  content.appendChild(searchRow);

  // Sections container
  const sectionsContainer = createVStack({ gap: 'var(--ui-space-sm)' });
  content.appendChild(sectionsContainer);

  // Create sections
  const sections = new Map();
  const sparklines = new Map();
  const gauges = new Map();
  const valueDisplays = new Map();
  let searchFilter = '';

  for (const sectionDef of SECTIONS) {
    const section = createSection({
      id: `telemetry-${sectionDef.id}`,
      title: sectionDef.title,
      initiallyCollapsed: persistedState[sectionDef.id] ?? false,
      onToggle: (collapsed) => {
        if (cfg.persistState) persistState({ [sectionDef.id]: collapsed });
      },
    });

    sections.set(sectionDef.id, section);
    sectionsContainer.appendChild(section.element);

    // Add content to section based on type
    populateSection(section, sectionDef.id);
  }

  function populateSection(section, sectionId) {
    const { content: sectionContent } = section;

    switch (sectionId) {
      case 'chassis':
        addChassisTelemetry(sectionContent);
        break;
      case 'powertrain':
        addPowertrainTelemetry(sectionContent);
        break;
      case 'tires':
        addTiresTelemetry(sectionContent);
        break;
      case 'brakes':
        addBrakesTelemetry(sectionContent);
        break;
      case 'aero':
        addAeroTelemetry(sectionContent);
        break;
      case 'suspension':
        addSuspensionTelemetry(sectionContent);
        break;
    }
  }

  function addChassisTelemetry(container) {
    const grid = createVStack({ gap: 'var(--ui-space-xs)' });

    // Speed
    const speedVD = createValueDisplay({
      label: 'Speed',
      value: 0,
      unit: 'm/s',
      precision: 2,
      size: 'md',
      format: (v) => v.toFixed(2),
    });
    valueDisplays.set('speed', speedVD);
    grid.appendChild(speedVD.element);

    // Velocity components
    const velRow = createHStack({ gap: 'var(--ui-space-md)', justify: 'space-between' });
    const vxVD = createValueDisplay({ label: 'Vx', value: 0, unit: 'm/s', precision: 2, size: 'sm' });
    const vyVD = createValueDisplay({ label: 'Vy', value: 0, unit: 'm/s', precision: 2, size: 'sm' });
    const vzVD = createValueDisplay({ label: 'Vz', value: 0, unit: 'm/s', precision: 2, size: 'sm' });
    valueDisplays.set('vx', vxVD); valueDisplays.set('vy', vyVD); valueDisplays.set('vz', vzVD);
    velRow.appendChild(vxVD.element); velRow.appendChild(vyVD.element); velRow.appendChild(vzVD.element);
    grid.appendChild(velRow);

    // Yaw
    const yawVD = createValueDisplay({ label: 'Yaw Rate', value: 0, unit: '°/s', precision: 1, size: 'sm' });
    valueDisplays.set('yawRate', yawVD);
    grid.appendChild(yawVD.element);

    // Forces
    const forceRow = createHStack({ gap: 'var(--ui-space-md)', justify: 'space-between' });
    const fxVD = createValueDisplay({ label: 'Fx', value: 0, unit: 'N', precision: 0, size: 'sm' });
    const fyVD = createValueDisplay({ label: 'Fy', value: 0, unit: 'N', precision: 0, size: 'sm' });
    const fzVD = createValueDisplay({ label: 'Fz', value: 0, unit: 'N', precision: 0, size: 'sm' });
    valueDisplays.set('fx', fxVD); valueDisplays.set('fy', fyVD); valueDisplays.set('fz', fzVD);
    forceRow.appendChild(fxVD.element); forceRow.appendChild(fyVD.element); forceRow.appendChild(fzVD.element);
    grid.appendChild(forceRow);

    // Yaw moment
    const yawMomentVD = createValueDisplay({ label: 'Yaw Moment', value: 0, unit: 'Nm', precision: 0, size: 'sm' });
    valueDisplays.set('yawMoment', yawMomentVD);
    grid.appendChild(yawMomentVD.element);

    // Mass properties
    const massVD = createValueDisplay({ label: 'Mass', value: 0, unit: 'kg', precision: 1, size: 'sm' });
    valueDisplays.set('mass', massVD);
    grid.appendChild(massVD.element);

    container.appendChild(grid);
  }

  function addPowertrainTelemetry(container) {
    const grid = createVStack({ gap: 'var(--ui-space-xs)' });

    // Engine RPM
    const rpmVD = createValueDisplay({ label: 'Engine RPM', value: 0, unit: 'rpm', precision: 0, size: 'lg' });
    valueDisplays.set('engineRpm', rpmVD);
    grid.appendChild(rpmVD.element);

    // RPM gauge
    const rpmGauge = createGauge({
      value: 0, min: 0, max: 8000, type: 'bar', size: 'md', showValue: false,
      segments: [
        { threshold: 0.7, color: 'var(--ui-color-semantic-success)' },
        { threshold: 0.9, color: 'var(--ui-color-semantic-warning)' },
        { threshold: 1, color: 'var(--ui-color-semantic-danger)' },
      ],
    });
    rpmGauge.element.style.width = '100%';
    gauges.set('rpm', rpmGauge);
    grid.appendChild(rpmGauge.element);

    // Gear
    const gearVD = createValueDisplay({ label: 'Gear', value: 1, unit: '', precision: 0, size: 'md', format: (v) => GEAR_LABELS[v] ?? v });
    valueDisplays.set('gear', gearVD);
    grid.appendChild(gearVD.element);

    // Throttle / Brake
    const pedalRow = createHStack({ gap: 'var(--ui-space-md)', justify: 'space-between' });
    const throttleVD = createValueDisplay({ label: 'Throttle', value: 0, unit: '%', precision: 0, size: 'sm', format: (v) => Math.round(v * 100) });
    const brakeVD = createValueDisplay({ label: 'Brake', value: 0, unit: '%', precision: 0, size: 'sm', format: (v) => Math.round(v * 100) });
    valueDisplays.set('throttle', throttleVD); valueDisplays.set('brake', brakeVD);
    pedalRow.appendChild(throttleVD.element); pedalRow.appendChild(brakeVD.element);
    grid.appendChild(pedalRow);

    // Drive torque
    const driveTorqueVD = createValueDisplay({ label: 'Drive Torque', value: 0, unit: 'Nm', precision: 0, size: 'sm' });
    valueDisplays.set('driveTorque', driveTorqueVD);
    grid.appendChild(driveTorqueVD.element);

    // Diff info
    const diffVD = createValueDisplay({ label: 'Diff', value: '', unit: '', precision: 0, size: 'sm', format: (v) => v });
    valueDisplays.set('diff', diffVD);
    grid.appendChild(diffVD.element);

    container.appendChild(grid);
  }

  function addTiresTelemetry(container) {
    const grid = createVStack({ gap: 'var(--ui-space-sm)' });

    // Slip summary
    const slipTitle = document.createElement('div');
    slipTitle.textContent = 'Slip Summary';
    slipTitle.style.fontSize = 'var(--ui-typeScale-xs)';
    slipTitle.style.fontWeight = 'var(--ui-fontWeight-semibold)';
    slipTitle.style.color = 'var(--ui-color-text-secondary)';
    grid.appendChild(slipTitle);

    const slipRow = createHStack({ gap: 'var(--ui-space-sm)', justify: 'space-between' });
    const longSlipVD = createValueDisplay({ label: 'Long Slip', value: 0, unit: '', precision: 3, size: 'sm' });
    const latSlipVD = createValueDisplay({ label: 'Lat Slip', value: 0, unit: '°', precision: 1, size: 'sm' });
    valueDisplays.set('longSlip', longSlipVD); valueDisplays.set('latSlip', latSlipVD);
    slipRow.appendChild(longSlipVD.element); slipRow.appendChild(latSlipVD.element);
    grid.appendChild(slipRow);

    // Per-wheel slip
    const wheelSlipGrid = createVStack({ gap: 'var(--ui-space-xs)' });
    for (const wheel of ['front-left', 'front-right', 'rear-left', 'rear-right']) {
      const ws = createValueDisplay({
        label: wheel.toUpperCase(),
        value: 0,
        unit: '',
        precision: 3,
        size: 'sm',
      });
      valueDisplays.set(`slip-${wheel}`, ws);
      wheelSlipGrid.appendChild(ws.element);
    }
    grid.appendChild(wheelSlipGrid);

    // Tire forces
    const forceTitle = document.createElement('div');
    forceTitle.textContent = 'Tire Forces (N)';
    forceTitle.style.fontSize = 'var(--ui-typeScale-xs)';
    forceTitle.style.fontWeight = 'var(--ui-fontWeight-semibold)';
    forceTitle.style.color = 'var(--ui-color-text-secondary)';
    grid.appendChild(forceTitle);

    const forceRow = createHStack({ gap: 'var(--ui-space-md)', justify: 'space-between' });
    const fxVD = createValueDisplay({ label: 'Fx', value: 0, unit: 'N', precision: 0, size: 'sm' });
    const fyVD = createValueDisplay({ label: 'Fy', value: 0, unit: 'N', precision: 0, size: 'sm' });
    valueDisplays.set('tireFx', fxVD); valueDisplays.set('tireFy', fyVD);
    forceRow.appendChild(fxVD.element); forceRow.appendChild(fyVD.element);
    grid.appendChild(forceRow);

    // Load transfer
    const loadVD = createValueDisplay({ label: 'Load Transfer', value: 0, unit: '%', precision: 1, size: 'sm' });
    valueDisplays.set('loadTransfer', loadVD);
    grid.appendChild(loadVD.element);

    // Normal forces per wheel
    const nfGrid = createVStack({ gap: 'var(--ui-space-xs)' });
    for (const wheel of ['front-left', 'front-right', 'rear-left', 'rear-right']) {
      const nf = createValueDisplay({
        label: `Fz ${wheel.toUpperCase()}`,
        value: 0,
        unit: 'N',
        precision: 0,
        size: 'sm',
      });
      valueDisplays.set(`fz-${wheel}`, nf);
      nfGrid.appendChild(nf.element);
    }
    grid.appendChild(nfGrid);

    container.appendChild(grid);
  }

  function addBrakesTelemetry(container) {
    const grid = createVStack({ gap: 'var(--ui-space-xs)' });

    const brakePressVD = createValueDisplay({ label: 'Brake Pressure', value: 0, unit: '%', precision: 0, size: 'sm', format: (v) => Math.round(v * 100) });
    valueDisplays.set('brakePressure', brakePressVD);
    grid.appendChild(brakePressVD.element);

    const biasVD = createValueDisplay({ label: 'Brake Bias (F/R)', value: '', unit: '', precision: 0, size: 'sm', format: (v) => v });
    valueDisplays.set('brakeBias', biasVD);
    grid.appendChild(biasVD.element);

    const absVD = createValueDisplay({ label: 'ABS Active', value: false, unit: '', precision: 0, size: 'sm', format: (v) => v ? 'YES' : 'NO' });
    valueDisplays.set('absActive', absVD);
    grid.appendChild(absVD.element);

    // Per-wheel brake torque
    const btGrid = createVStack({ gap: 'var(--ui-space-xs)' });
    for (const wheel of ['front-left', 'front-right', 'rear-left', 'rear-right']) {
      const bt = createValueDisplay({
        label: `BT ${wheel.toUpperCase()}`,
        value: 0,
        unit: 'Nm',
        precision: 0,
        size: 'sm',
      });
      valueDisplays.set(`bt-${wheel}`, bt);
      btGrid.appendChild(bt.element);
    }
    grid.appendChild(btGrid);

    container.appendChild(grid);
  }

  function addAeroTelemetry(container) {
    const grid = createVStack({ gap: 'var(--ui-space-xs)' });

    const dragVD = createValueDisplay({ label: 'Drag Force', value: 0, unit: 'N', precision: 0, size: 'sm' });
    valueDisplays.set('drag', dragVD);
    grid.appendChild(dragVD.element);

    const downforceVD = createValueDisplay({ label: 'Downforce', value: 0, unit: 'N', precision: 0, size: 'sm' });
    valueDisplays.set('downforce', downforceVD);
    grid.appendChild(downforceVD.element);

    const liftVD = createValueDisplay({ label: 'Lift', value: 0, unit: 'N', precision: 0, size: 'sm' });
    valueDisplays.set('lift', liftVD);
    grid.appendChild(liftVD.element);

    container.appendChild(grid);
  }

  function addSuspensionTelemetry(container) {
    const grid = createVStack({ gap: 'var(--ui-space-xs)' });

    // Ride height
    const rhVD = createValueDisplay({ label: 'Ride Height', value: 0, unit: 'm', precision: 3, size: 'sm' });
    valueDisplays.set('rideHeight', rhVD);
    grid.appendChild(rhVD.element);

    // Per-wheel travel
    const travelGrid = createVStack({ gap: 'var(--ui-space-xs)' });
    for (const wheel of ['front-left', 'front-right', 'rear-left', 'rear-right']) {
      const tr = createValueDisplay({
        label: `Travel ${wheel.toUpperCase()}`,
        value: 0,
        unit: 'm',
        precision: 3,
        size: 'sm',
      });
      valueDisplays.set(`travel-${wheel}`, tr);
      travelGrid.appendChild(tr.element);
    }
    grid.appendChild(travelGrid);

    // Spring forces
    const sfGrid = createVStack({ gap: 'var(--ui-space-xs)' });
    for (const wheel of ['front-left', 'front-right', 'rear-left', 'rear-right']) {
      const sf = createValueDisplay({
        label: `Spring ${wheel.toUpperCase()}`,
        value: 0,
        unit: 'N',
        precision: 0,
        size: 'sm',
      });
      valueDisplays.set(`spring-${wheel}`, sf);
      sfGrid.appendChild(sf.element);
    }
    grid.appendChild(sfGrid);

    container.appendChild(grid);
  }

  function persistState(partial) {
    persistedState = { ...persistedState, ...partial };
    try {
      localStorage.setItem(cfg.storageKey, JSON.stringify(persistedState));
    } catch (_) {}
  }

  // Search filter
  searchInput.addEventListener('input', (e) => {
    searchFilter = e.target.value.toLowerCase();
    applySearchFilter();
  });

  function applySearchFilter() {
    if (!searchFilter) {
      // Show all
      for (const section of sections.values()) {
        section.element.style.display = '';
      }
      return;
    }

    // Simple filter: check if section title or any value display label matches
    for (const [id, section] of sections) {
      const titleMatch = id.includes(searchFilter) || section.title.toLowerCase().includes(searchFilter);
      let valueMatch = false;
      if (!titleMatch) {
        // Check value display labels in this section
        for (const [key, vd] of valueDisplays) {
          if (key.includes(id) || key.includes(searchFilter)) {
            valueMatch = true;
            break;
          }
        }
      }
      section.element.style.display = (titleMatch || valueMatch) ? '' : 'none';
    }
  }

  // Update function
  function update(snapshot = {}) {
    const vehicle = snapshot.vehicleSnapshot ?? snapshot;
    const forces = snapshot.forces ?? {};
    const powertrain = snapshot.powertrain ?? {};
    const powertrainKin = snapshot.powertrainKinematics ?? {};
    const rearDiff = snapshot.rearDifferentialState ?? {};
    const wheelStates = snapshot.wheelStates ?? [];
    const lateralSlip = snapshot.lateralSlipSummary ?? {};
    const lateralForce = snapshot.lateralTireForceSummary ?? {};
    const loadTransfer = snapshot.loadTransferSummary ?? {};
    const suspNormal = snapshot.suspensionNormalForceSummary ?? {};
    const chassisAttitude = snapshot.chassisAttitude ?? {};
    const slopeGravity = snapshot.slopeGravity ?? {};

    // Chassis
    valueDisplays.get('speed')?.setValue(vehicle.speedMetersPerSecond ?? 0);
    valueDisplays.get('vx')?.setValue(vehicle.localVelocityX ?? 0);
    valueDisplays.get('vy')?.setValue(vehicle.localVelocityY ?? 0);
    valueDisplays.get('vz')?.setValue(vehicle.localVelocityZ ?? 0);
    valueDisplays.get('yawRate')?.setValue((vehicle.yawRateRadPerSec ?? 0) * 180 / Math.PI);
    valueDisplays.get('fx')?.setValue(forces.totalForceX ?? 0);
    valueDisplays.get('fy')?.setValue(forces.totalForceY ?? 0);
    valueDisplays.get('fz')?.setValue(forces.totalForceZ ?? 0);
    valueDisplays.get('yawMoment')?.setValue(forces.yawMoment ?? 0);
    valueDisplays.get('mass')?.setValue(vehicle.massKg ?? 0);

    // Powertrain
    const engineRpm = powertrainKin.engineRpm ?? powertrain.engineRpm ?? 0;
    valueDisplays.get('engineRpm')?.setValue(engineRpm);
    gauges.get('rpm')?.setValue(engineRpm);
    valueDisplays.get('gear')?.setValue(vehicle.gear ?? 1);
    valueDisplays.get('throttle')?.setValue(vehicle.throttle ?? 0);
    valueDisplays.get('brake')?.setValue(vehicle.brake ?? 0);
    valueDisplays.get('driveTorque')?.setValue(powertrain.driveTorqueNm ?? 0);
    valueDisplays.get('diff')?.setValue(
      `${rearDiff.rearDifferentialType ?? 'open'} L${Math.round((rearDiff.rearDifferentialLeftShare01 ?? 0.5) * 100)}% R${Math.round((1 - (rearDiff.rearDifferentialLeftShare01 ?? 0.5)) * 100)}%`
    );

    // Tires
    let maxLongSlip = 0, maxLatSlip = 0;
    for (const ws of wheelStates) {
      if (ws.longitudinalSlipRatioAbs > maxLongSlip) maxLongSlip = ws.longitudinalSlipRatioAbs;
      if (ws.lateralSlipAngleDeg > maxLatSlip) maxLatSlip = ws.lateralSlipAngleDeg;
    }
    valueDisplays.get('longSlip')?.setValue(maxLongSlip);
    valueDisplays.get('latSlip')?.setValue(maxLatSlip);

    for (const ws of wheelStates) {
      valueDisplays.get(`slip-${ws.id}`)?.setValue(ws.longitudinalSlipRatioAbs ?? 0);
    }

    let totalFx = 0, totalFy = 0;
    for (const ws of wheelStates) {
      totalFx += ws.tireForceX ?? 0;
      totalFy += ws.tireForceY ?? 0;
    }
    valueDisplays.get('tireFx')?.setValue(totalFx);
    valueDisplays.get('tireFy')?.setValue(totalFy);

    valueDisplays.get('loadTransfer')?.setValue(loadTransfer.longitudinalTransferPercent ?? 0);

    for (const ws of wheelStates) {
      valueDisplays.get(`fz-${ws.id}`)?.setValue(ws.normalForceNewtons ?? 0);
    }

    // Brakes
    valueDisplays.get('brakePressure')?.setValue(vehicle.brake ?? 0);
    valueDisplays.get('brakeBias')?.setValue(`${Math.round((vehicle.brakeBiasFront ?? 0.65) * 100)}% / ${Math.round((1 - (vehicle.brakeBiasFront ?? 0.65)) * 100)}%`);
    valueDisplays.get('absActive')?.setValue(vehicle.absActive === true);

    for (const ws of wheelStates) {
      valueDisplays.get(`bt-${ws.id}`)?.setValue(ws.appliedServiceBrakeTorqueNewtonMeters ?? 0);
    }

    // Aero
    valueDisplays.get('drag')?.setValue(forces.aeroDragForce ?? 0);
    valueDisplays.get('downforce')?.setValue(forces.aeroDownforce ?? 0);
    valueDisplays.get('lift')?.setValue(forces.aeroLift ?? 0);

    // Suspension
    valueDisplays.get('rideHeight')?.setValue(chassisAttitude.heaveMeters ?? 0);
    for (const ws of wheelStates) {
      valueDisplays.get(`travel-${ws.id}`)?.setValue(ws.suspensionTravelMeters ?? 0);
      valueDisplays.get(`spring-${ws.id}`)?.setValue(ws.suspensionForceNewtons ?? 0);
    }
  }

  // Initial render
  update({});

  // Mobile bottom sheet
  let mobileSheet = null;
  if (typeof window !== 'undefined') {
    mobileSheet = useMobileBottomSheet(panel, { breakpoint: 'lg' });
  }

  // Public API
  return {
    element: panel.element,
    panel,
    update,
    collapse: () => panel.collapse(true),
    expand: () => panel.collapse(false),
    toggle: panel.toggle,
    isCollapsed: panel.isCollapsed,
    setSearchFilter: (filter) => { searchInput.value = filter; searchFilter = filter; applySearchFilter(); },
    destroy: () => {
      panel.destroy();
      mobileSheet?.destroy?.();
    },
  };
}

// Gear labels map
const GEAR_LABELS = { reverse: 'R', neutral: 'N', drive: 'D', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8' };