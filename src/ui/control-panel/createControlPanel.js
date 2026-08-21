// src/ui/control-panel/createControlPanel.js
/**
 * ControlPanel — Unified developer controls for tire inflation, tuning, and dynamics.
 * Composes from design system Panel, Section, Slider, Select, Button components.
 */

import { token } from '../design-system/theme.js';
import { createPanel } from '../design-system/components/Panel.js';
import { createSection } from '../design-system/components/Section.js';
import { createSlider } from '../design-system/components/Slider.js';
import { createSelect } from '../design-system/components/Select.js';
import { createButton } from '../design-system/components/Button.js';
import { createValueDisplay } from '../design-system/components/ValueDisplay.js';
import { createVStack, createHStack } from '../design-system/layout/Stack.js';
import { useMobileBottomSheet } from '../design-system/layout/Responsive.js';
import { readJsonFromStorage, writeJsonToStorage } from '../design-system/browserStorage.js';

const SLIDER_DEFINITIONS = [
  { key: 'driveTorqueMultiplier', label: 'Drive Torque', defaultValue: 1, min: 0.25, max: 5, step: 0.05 },
  { key: 'serviceBrakeTorqueMultiplier', label: 'Brake Torque', defaultValue: 1, min: 0.25, max: 5, step: 0.05 },
  { key: 'longitudinalTireStiffnessMultiplier', label: 'Tire Stiffness', defaultValue: 1, min: 0.25, max: 4, step: 0.05 },
];

const REAR_DIFF_OPTIONS = [
  { key: 'open', label: 'Open' },
  { key: 'limited-slip', label: 'Limited-Slip' },
  { key: 'torsen', label: 'Torsen' },
  { key: 'locked', label: 'Locked' },
  { key: 'welded', label: 'Welded' },
];

const DEFAULT_CONFIG = {
  anchor: 'top-right',
  initiallyCollapsed: false,
  zIndex: null,
  onPositionChange: null,
  onTirePressureChange: null,
  onDynamicsTuningChange: null,
  onRearDifferentialChange: null,
  onReset: null,
  tirePressure: { kpa: 220, min: 0, max: 340 },
};

export function createControlPanel(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Persisted state
  let dynamicsValues = { ...SLIDER_DEFINITIONS.reduce((acc, s) => ({ ...acc, [s.key]: s.defaultValue }), {}) };
  let diffType = 'open';
  let tirePressureKpa = cfg.tirePressure.kpa;

  const parsed = readJsonFromStorage('control-panel-state');
  if (parsed) {
    dynamicsValues = { ...dynamicsValues, ...parsed.dynamics };
    diffType = parsed.diffType ?? diffType;
    tirePressureKpa = parsed.tirePressureKpa ?? tirePressureKpa;
  }

  function persistState() {
    writeJsonToStorage('control-panel-state', {
      dynamics: dynamicsValues,
      diffType,
      tirePressureKpa,
    });
  }

  // Create main panel
  const panel = createPanel({
    id: 'control-panel',
    title: 'Controls',
    anchor: cfg.anchor,
    collapsible: true,
    draggable: true,
    initiallyCollapsed: cfg.initiallyCollapsed,
    width: 280,
    minWidth: 260,
    maxWidth: 360,
    zIndex: cfg.zIndex ?? token('zIndex.panel'),
    onPositionChange: cfg.onPositionChange,
  });

  const content = panel.content;
  content.style.padding = 'var(--ui-space-sm)';
  content.style.display = 'flex';
  content.style.flexDirection = 'column';
  content.style.gap = 'var(--ui-space-sm)';
  content.style.maxHeight = 'calc(100vh - 100px)';
  content.style.overflowY = 'auto';

  // === TIRE PRESSURE SECTION ===
  const tireSection = createSection({
    id: 'control-tire',
    title: 'Tire Pressure',
    badge: { label: 'DEV', variant: 'info' },
    initiallyCollapsed: false,
  });
  content.appendChild(tireSection.element);

  const tireContent = tireSection.content;
  tireContent.style.display = 'flex';
  tireContent.style.flexDirection = 'column';
  tireContent.style.gap = 'var(--ui-space-sm)';

  // Pressure display
  const pressureRow = createHStack({ gap: 'var(--ui-space-md)', justify: 'space-between', align: 'center' });
  const pressureVD = createValueDisplay({
    value: tirePressureKpa,
    unit: 'kPa',
    precision: 0,
    size: 'lg',
    label: '',
    format: (v) => v.toFixed(0),
  });
  pressureVD.element.style.flex = '1';
  const psiVD = createValueDisplay({
    value: tirePressureKpa * 0.1450377377,
    unit: 'psi',
    precision: 1,
    size: 'sm',
    label: '',
    format: (v) => v.toFixed(1),
  });
  psiVD.element.style.color = 'var(--ui-color-text-secondary)';
  pressureRow.appendChild(pressureVD.element);
  pressureRow.appendChild(psiVD.element);
  tireContent.appendChild(pressureRow);

  // Pressure slider
  const pressureSlider = createSlider({
    label: '',
    value: tirePressureKpa,
    min: cfg.tirePressure.min,
    max: cfg.tirePressure.max,
    step: 1,
    unit: 'kPa',
    formatValue: (v) => v.toFixed(0),
    showValue: false,
    onInput: (val) => {
      tirePressureKpa = val;
      pressureVD.setValue(val);
      psiVD.setValue(val * 0.1450377377);
      cfg.onTirePressureKpaChange?.(val);
    },
    onChange: (val) => {
      persistState();
    },
  });
  tireContent.appendChild(pressureSlider.element);

  // Visual state
  const visualState = document.createElement('div');
  visualState.style.fontSize = 'var(--ui-typeScale-xs)';
  visualState.style.color = 'var(--ui-color-text-muted)';
  visualState.style.fontFamily = 'var(--ui-font-mono)';
  updateVisualState(visualState, tirePressureKpa);
  tireContent.appendChild(visualState);

  function updateVisualState(el, kpa) {
    const ratio = (kpa - cfg.tirePressure.min) / (cfg.tirePressure.max - cfg.tirePressure.min);
    let label = 'normal-visual';
    if (ratio < 0.2) label = 'very-low';
    else if (ratio < 0.4) label = 'low';
    else if (ratio > 0.8) label = 'high';
    else if (ratio > 0.6) label = 'firm';
    const width = 0.8 + ratio * 0.4;
    const length = 0.9 + ratio * 0.2;
    el.textContent = `${label} / patch ${width.toFixed(2)} x ${length.toFixed(2)}`;
  }

  // Reset button
  const resetTireBtn = createButton({
    variant: 'outline',
    size: 'sm',
    label: 'Reset Pressure',
    fullWidth: true,
    onClick: () => {
      tirePressureKpa = cfg.tirePressure.kpa;
      pressureSlider.setValue(tirePressureKpa);
      pressureVD.setValue(tirePressureKpa);
      psiVD.setValue(tirePressureKpa * 0.1450377377);
      updateVisualState(visualState, tirePressureKpa);
      cfg.onTirePressureKpaChange?.(tirePressureKpa);
      cfg.onReset?.();
      persistState();
    },
  });
  tireContent.appendChild(resetTireBtn.element);

  // === DYNAMICS TUNING SECTION ===
  const dynamicsSection = createSection({
    id: 'control-dynamics',
    title: 'Dynamics Tuning',
    badge: { label: 'DEV', variant: 'info' },
    initiallyCollapsed: false,
  });
  content.appendChild(dynamicsSection.element);

  const dynContent = dynamicsSection.content;
  dynContent.style.display = 'flex';
  dynContent.style.flexDirection = 'column';
  dynContent.style.gap = 'var(--ui-space-sm)';

  // Rear differential selector
  const diffRow = createHStack({ gap: 'var(--ui-space-sm)', align: 'center' });
  const diffLabel = document.createElement('label');
  diffLabel.textContent = 'Rear Diff';
  diffLabel.style.fontSize = 'var(--ui-typeScale-sm)';
  diffLabel.style.fontWeight = 'var(--ui-fontWeight-medium)';
  diffLabel.style.color = 'var(--ui-color-text-secondary)';
  diffLabel.style.flex = '0 0 80px';

  const diffSelect = createSelect({
    options: REAR_DIFF_OPTIONS,
    value: diffType,
    onChange: (val) => {
      diffType = val;
      cfg.onRearDifferentialChange?.(val);
      persistState();
    },
  });
  diffSelect.element.style.flex = '1';
  diffRow.appendChild(diffLabel);
  diffRow.appendChild(diffSelect.element);
  dynContent.appendChild(diffRow);

  // Sliders
  const sliders = new Map();
  for (const def of SLIDER_DEFINITIONS) {
    const slider = createSlider({
      label: def.label,
      value: dynamicsValues[def.key],
      min: def.min,
      max: def.max,
      step: def.step,
      unit: '×',
      formatValue: (v) => v.toFixed(2),
      onInput: (val) => {
        dynamicsValues[def.key] = val;
        cfg.onDynamicsTuningChange?.({ ...dynamicsValues });
      },
      onChange: (val) => {
        dynamicsValues[def.key] = val;
        persistState();
      },
    });
    sliders.set(def.key, slider);
    dynContent.appendChild(slider.element);
  }

  // Diff telemetry display
  const diffTelemetry = document.createElement('div');
  diffTelemetry.style.fontSize = 'var(--ui-typeScale-xs)';
  diffTelemetry.style.color = 'var(--ui-color-text-muted)';
  diffTelemetry.style.fontFamily = 'var(--ui-font-mono)';
  diffTelemetry.style.paddingTop = 'var(--ui-space-xs)';
  diffTelemetry.style.borderTop = '1px solid var(--ui-color-border-subtle)';
  dynContent.appendChild(diffTelemetry);

  // Reset dynamics button
  const resetDynBtn = createButton({
    variant: 'outline',
    size: 'sm',
    label: 'Reset Dynamics',
    fullWidth: true,
    onClick: () => {
      for (const def of SLIDER_DEFINITIONS) {
        dynamicsValues[def.key] = def.defaultValue;
        sliders.get(def.key)?.setValue(def.defaultValue);
      }
      diffType = 'open';
      diffSelect.setValue('open');
      cfg.onDynamicsTuningChange?.({ ...dynamicsValues });
      cfg.onRearDifferentialChange?.('open');
      cfg.onReset?.();
      persistState();
    },
  });
  dynContent.appendChild(resetDynBtn.element);

  // === LIVE DIFF TELEMETRY (updated externally) ===
  function updateDiffTelemetry(state) {
    if (!state) return;
    const left = Math.round((state.rearDifferentialLeftShare01 ?? 0.5) * 100);
    const right = 100 - left;
    const dOmega = Math.abs(state.rearDifferentialWheelSpeedDifferenceAbsRadiansPerSecond ?? 0).toFixed(2);
    let parts = [`L ${left}% R ${right}%`, `dΩ ${dOmega} rad/s`];
    if (state.rearDifferentialType === 'torsen' && state.rearDifferentialTorqueBiasRatio > 0) {
      parts.push(`TBR ${state.rearDifferentialTorqueBiasRatio.toFixed(2)}`);
    }
    if (state.rearDifferentialCouplingState && state.rearDifferentialCouplingState !== 'idle') {
      parts.push(state.rearDifferentialCouplingState);
    }
    diffTelemetry.textContent = parts.join(' / ');
  }

  // Mobile bottom sheet
  let mobileSheet = null;
  if (typeof window !== 'undefined') {
    mobileSheet = useMobileBottomSheet(panel, { breakpoint: 'lg' });
  }

  // Public API
  return {
    element: panel.element,
    panel,
    update: (snapshot) => {
      // Update diff telemetry from snapshot
      if (snapshot.rearDifferentialState) {
        updateDiffTelemetry(snapshot.rearDifferentialState);
      }
    },
    setTirePressure: (kpa) => {
      tirePressureKpa = kpa;
      pressureSlider.setValue(kpa);
      pressureVD.setValue(kpa);
      psiVD.setValue(kpa * 0.1450377377);
      updateVisualState(visualState, kpa);
    },
    getTirePressure: () => tirePressureKpa,
    setDynamicsValues: (values) => {
      dynamicsValues = { ...dynamicsValues, ...values };
      for (const [key, val] of Object.entries(values)) {
        sliders.get(key)?.setValue(val);
      }
    },
    getDynamicsValues: () => ({ ...dynamicsValues }),
    setDiffType: (type) => {
      diffType = type;
      diffSelect.setValue(type);
    },
    getDiffType: () => diffType,
    collapse: () => panel.collapse(true),
    expand: () => panel.collapse(false),
    toggle: panel.toggle,
    isCollapsed: panel.isCollapsed,
    destroy: () => {
      panel.destroy();
      mobileSheet?.destroy?.();
    },
  };
}
