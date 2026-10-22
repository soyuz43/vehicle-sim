// src/ui/config-panel/createConfigPanel.js
/**
 * ConfigPanel — Unified session configuration (terrain + vehicle).
 * Merges terrain selector and vehicle customization into accordion sections.
 * Dirty-state tracking with Apply/Reset actions.
 */

import { token } from '../design-system/theme.js';
import { createPanel } from '../design-system/components/Panel.js';
import { createSection } from '../design-system/components/Section.js';
import { createSelect } from '../design-system/components/Select.js';
import { createButton } from '../design-system/components/Button.js';
import { createVStack, createHStack } from '../design-system/layout/Stack.js';
import { useMobileBottomSheet } from '../design-system/layout/Responsive.js';
import { getIconSvg } from '../design-system/icons.js';

// Import vehicle config types (these are re-exported from vehicle config)
import {
  VEHICLE_COMPONENT_SLOTS,
  VEHICLE_COMPONENT_CATALOG,
} from '../../vehicle/config/componentCatalog.js';
import {
  cloneVehicleConfiguration,
  createDefaultVehicleConfiguration,
  setVehicleConfigurationSlot,
} from '../../vehicle/config/createVehicleConfiguration.js';

const TERRAIN_OPTIONS = [
  { value: 'proving-ground', label: 'Proving Ground' },
  { value: 'offroad', label: 'Offroad Playground' },
];

const SLOT_LABELS = {
  chassis: 'Chassis',
  suspension: 'Suspension',
  wheels: 'Wheels',
  drivetrain: 'Drivetrain',
  brakes: 'Brakes',
  aero: 'Aero',
};

const DEFAULT_CONFIG = {
  anchor: 'top-left',
  initiallyCollapsed: false,
  zIndex: null,
  onPositionChange: null,
  onTerrainChange: null,
  onVehicleChange: null,
  onApply: null,
  onReset: null,
  initialTerrain: 'proving-ground',
  initialVehicleConfig: null,
};

export function createConfigPanel(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  let currentTerrain = cfg.initialTerrain;
  let currentVehicleConfig = cfg.initialVehicleConfig
    ? cloneVehicleConfiguration(cfg.initialVehicleConfig)
    : createDefaultVehicleConfiguration();
  // The stock catalog configuration. It is the fixed baseline the Reset All
  // control restores, and it is never overwritten by an apply: an applied
  // configuration is not the baseline, it is the current setup.
  const stockVehicleConfig = createDefaultVehicleConfiguration();
  let isDirty = false;
  // The outcome of the last apply attempt: null (no attempt), 'applied', or
  // 'error'. The host reports the outcome through markApplied() and
  // setApplyError(); a host that reports nothing is treated as a successful
  // apply so the panel does not stay stuck in the dirty state.
  let applyOutcome = null;
  let applyStatus = null;

  // Create main panel
  const panel = createPanel({
    id: 'config-panel',
    title: 'Session Config',
    anchor: cfg.anchor,
    collapsible: true,
    draggable: true,
    initiallyCollapsed: cfg.initiallyCollapsed,
    width: 300,
    minWidth: 280,
    maxWidth: 420,
    zIndex: cfg.zIndex ?? token('zIndex.panel'),
    onPositionChange: cfg.onPositionChange,
  });

  const content = panel.content;
  content.style.padding = 'var(--ui-space-sm)';
  content.style.display = 'flex';
  content.style.flexDirection = 'column';
  content.style.gap = 'var(--ui-space-sm)';

  // === TERRAIN SECTION ===
  const terrainSection = createSection({
    id: 'config-terrain',
    title: 'Terrain',
    badge: { label: 'SESSION', variant: 'info' },
    initiallyCollapsed: false,
  });
  content.appendChild(terrainSection.element);

  const terrainContent = terrainSection.content;
  terrainContent.style.display = 'flex';
  terrainContent.style.flexDirection = 'column';
  terrainContent.style.gap = 'var(--ui-space-sm)';

  const terrainSelect = createSelect({
    id: 'config-terrain',
    label: 'Terrain',
    options: TERRAIN_OPTIONS,
    value: currentTerrain,
    onChange: (val) => {
      currentTerrain = val;
      markDirty();
    },
  });
  terrainContent.appendChild(terrainSelect.element);

  // Terrain description
  const terrainDesc = document.createElement('div');
  terrainDesc.style.fontSize = 'var(--ui-typeScale-xs)';
  terrainDesc.style.color = 'var(--ui-color-text-muted)';
  terrainDesc.style.lineHeight = 'var(--ui-lineHeight-relaxed)';
  updateTerrainDescription(terrainDesc, currentTerrain);
  terrainContent.appendChild(terrainDesc);

  function updateTerrainDescription(el, terrain) {
    const descs = {
      'proving-ground': 'Flat proving ground with consistent surface. Best for baseline testing and regression validation.',
      'offroad': 'Procedural offroad playground with obstacles, varied surfaces, and terrain deformation. Requires offroad mode.',
    };
    el.textContent = descs[terrain] ?? '';
  }

  terrainSelect.select.addEventListener('change', () => {
    updateTerrainDescription(terrainDesc, currentTerrain);
  });

  // === VEHICLE SECTION ===
  const vehicleSection = createSection({
    id: 'config-vehicle',
    title: 'Vehicle',
    badge: { label: 'SETUP', variant: 'info' },
    initiallyCollapsed: false,
  });
  content.appendChild(vehicleSection.element);

  const vehicleContent = vehicleSection.content;
  vehicleContent.style.display = 'flex';
  vehicleContent.style.flexDirection = 'column';
  vehicleContent.style.gap = 'var(--ui-space-sm)';

  // Mode notice
  const modeNotice = document.createElement('div');
  modeNotice.style.fontSize = 'var(--ui-typeScale-xs)';
  modeNotice.style.color = 'var(--ui-color-text-muted)';
  modeNotice.style.padding = 'var(--ui-space-xs) var(--ui-space-sm)';
  modeNotice.style.background = 'var(--ui-color-bg-input)';
  modeNotice.style.borderRadius = 'var(--ui-radius-sm)';
  modeNotice.style.border = '1px solid var(--ui-color-border-subtle)';
  modeNotice.textContent =
    'Selections are staged here. Apply changes the running vehicle ' +
    'immediately: the pose, velocity, gear, and tire pressures are ' +
    'preserved.';
  vehicleContent.appendChild(modeNotice);

  // Slot selectors
  const slotSelects = {};
  for (const slot of VEHICLE_COMPONENT_SLOTS) {
    const slotEntry = VEHICLE_COMPONENT_CATALOG[slot];
    if (!slotEntry) continue;

    const row = createVStack({ gap: 'var(--ui-space-xs)' });

    const label = document.createElement('label');
    label.textContent = SLOT_LABELS[slot] ?? slot;
    label.htmlFor = `config-${slot}-select`;
    label.style.fontSize = 'var(--ui-typeScale-sm)';
    label.style.fontWeight = 'var(--ui-fontWeight-medium)';
    label.style.color = 'var(--ui-color-text-secondary)';
    row.appendChild(label);

    const select = createSelect({
      id: `config-${slot}`,
      options: Object.keys(slotEntry.components).map(key => ({
        value: key,
        label: slotEntry.components[key].label,
      })),
      value: currentVehicleConfig.slots[slot],
      onChange: (val) => {
        currentVehicleConfig = setVehicleConfigurationSlot(currentVehicleConfig, slot, val);
        updateVehicleSetupPreview();
        cfg.onVehicleChange?.(cloneVehicleConfiguration(currentVehicleConfig));
        markDirty();
      },
    });
    slotSelects[slot] = select;
    row.appendChild(select.element);
    vehicleContent.appendChild(row);
  }

  const vehicleSetupPreview = document.createElement('div');
  vehicleSetupPreview.id = 'config-vehicle-preview';
  vehicleSetupPreview.setAttribute('role', 'status');
  vehicleSetupPreview.setAttribute('aria-live', 'polite');
  vehicleSetupPreview.style.fontSize = 'var(--ui-typeScale-xs)';
  vehicleSetupPreview.style.lineHeight = 'var(--ui-lineHeight-relaxed)';
  vehicleSetupPreview.style.color = 'var(--ui-color-text-secondary)';
  vehicleSetupPreview.style.padding = 'var(--ui-space-xs) var(--ui-space-sm)';
  vehicleSetupPreview.style.background = 'var(--ui-color-bg-input)';
  vehicleSetupPreview.style.borderRadius = 'var(--ui-radius-sm)';
  vehicleSetupPreview.style.border = '1px solid var(--ui-color-border-subtle)';
  vehicleContent.appendChild(vehicleSetupPreview);
  updateVehicleSetupPreview();

  // The status line reports one of three states: the staged setup (the
  // panel holds changes that are not applied yet), the applied setup (with
  // the time it was applied), or the failure of the last apply attempt.
  function updateVehicleSetupPreview() {
    const selectedComponents = VEHICLE_COMPONENT_SLOTS.map((slot) => {
      const component = VEHICLE_COMPONENT_CATALOG[slot]?.components[currentVehicleConfig.slots[slot]];
      return component ? `${SLOT_LABELS[slot] ?? slot}: ${component.label}` : null;
    }).filter(Boolean);
    const setupText = selectedComponents.join(' · ');

    if (applyStatus?.kind === 'error') {
      vehicleSetupPreview.textContent = `Apply failed: ${applyStatus.message}`;
      vehicleSetupPreview.style.color = 'var(--ui-color-semantic-danger)';
      return;
    }

    vehicleSetupPreview.style.color = 'var(--ui-color-text-secondary)';

    if (isDirty) {
      vehicleSetupPreview.textContent = `Staged setup — ${setupText}`;
      return;
    }

    if (applyStatus?.kind === 'applied') {
      vehicleSetupPreview.textContent = `Applied at ${applyStatus.time} — ${setupText}`;
      return;
    }

    vehicleSetupPreview.textContent = setupText;
  }

  // === ACTION BAR ===
  const actionBar = createHStack({ gap: 'var(--ui-space-sm)', justify: 'flex-end', align: 'center' });
  actionBar.style.paddingTop = 'var(--ui-space-sm)';
  actionBar.style.borderTop = '1px solid var(--ui-color-border-subtle)';
  actionBar.style.marginTop = 'var(--ui-space-xs)';

  const resetBtn = createButton({
    variant: 'ghost',
    size: 'sm',
    label: 'Reset All',
    icon: getIconSvg('rotateCcw', 12),
    onClick: () => {
      resetToDefaults();
    },
  });

  const applyBtn = createButton({
    variant: 'primary',
    size: 'sm',
    label: 'Apply',
    icon: getIconSvg('check', 12),
    onClick: () => {
      applyChanges();
    },
  });
  applyBtn.element.disabled = !isDirty;
  applyBtn.element.setAttribute('aria-disabled', String(!isDirty));
  applyBtn.element.style.opacity = isDirty ? '1' : '0.5';

  actionBar.appendChild(resetBtn.element);
  actionBar.appendChild(applyBtn.element);
  content.appendChild(actionBar);

  function markDirty() {
    isDirty = true;
    applyBtn.element.disabled = false;
    applyBtn.element.setAttribute('aria-disabled', 'false');
    applyBtn.element.style.opacity = '1';
    // Update panel title to show dirty state
    panel.titleEl.textContent = 'Session Config ●';
    panel.titleEl.style.color = 'var(--ui-color-semantic-warning)';
    // The status line reports the staged setup while the panel is dirty.
    updateVehicleSetupPreview();
  }

  function clearDirty() {
    isDirty = false;
    applyBtn.element.disabled = true;
    applyBtn.element.setAttribute('aria-disabled', 'true');
    applyBtn.element.style.opacity = '0.5';
    panel.titleEl.textContent = 'Session Config';
    panel.titleEl.style.color = '';
  }

  // Reset All restores the stock catalog configuration and applies it live.
  // The vehicle's pose is NOT reset here: the R key owns that. The terrain
  // selection is reset the way it always was, independently of the vehicle
  // setup.
  function resetToDefaults() {
    currentTerrain = 'proving-ground';
    currentVehicleConfig = cloneVehicleConfiguration(stockVehicleConfig);
    terrainSelect.setValue(currentTerrain);
    for (const slot of VEHICLE_COMPONENT_SLOTS) {
      if (slotSelects[slot]) {
        slotSelects[slot].setValue(currentVehicleConfig.slots[slot]);
      }
    }
    updateTerrainDescription(terrainDesc, currentTerrain);
    updateVehicleSetupPreview();
    cfg.onVehicleChange?.(cloneVehicleConfiguration(currentVehicleConfig));
    clearDirty();

    applyOutcome = null;
    applyStatus = null;

    try {
      cfg.onReset?.();
    } catch (error) {
      setApplyError(error);
      return;
    }

    if (applyOutcome === null) {
      markApplied();
    }
  }

  function applyChanges() {
    if (!isDirty) return;

    applyOutcome = null;
    applyStatus = null;

    try {
      cfg.onApply?.({
        terrain: currentTerrain,
        vehicleConfig: cloneVehicleConfiguration(currentVehicleConfig),
      });
    } catch (error) {
      setApplyError(error);
      return;
    }

    // The host reports the outcome through markApplied() and
    // setApplyError(). A host that reports nothing is treated as a
    // successful apply, so the panel still leaves the dirty state.
    if (applyOutcome === null) {
      markApplied();
    }
  }

  // Report a successful apply. The panel leaves the dirty state and shows
  // the time the configuration was applied.
  function markApplied() {
    applyOutcome = 'applied';
    applyStatus = {
      kind: 'applied',
      time: formatAppliedTime(new Date()),
    };
    clearDirty();
    updateVehicleSetupPreview();
  }

  // Report a failed apply. The panel stays dirty and the Apply button stays
  // enabled so the driver can correct the selection and try again.
  function setApplyError(error) {
    applyOutcome = 'error';
    applyStatus = {
      kind: 'error',
      message: error?.message ?? String(error ?? 'unknown error'),
    };
    updateVehicleSetupPreview();
  }

  function formatAppliedTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;
  }

  // Public API for external sync
  function setTerrain(terrain) {
    currentTerrain = terrain;
    terrainSelect.setValue(terrain);
    updateTerrainDescription(terrainDesc, terrain);
  }

  function setVehicleConfig(vConfig) {
    currentVehicleConfig = cloneVehicleConfiguration(vConfig);
    for (const slot of VEHICLE_COMPONENT_SLOTS) {
      if (slotSelects[slot]) {
        slotSelects[slot].setValue(currentVehicleConfig.slots[slot]);
      }
    }
    updateVehicleSetupPreview();
  }

  function getConfig() {
    return {
      terrain: currentTerrain,
      vehicleConfig: cloneVehicleConfiguration(currentVehicleConfig),
    };
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
    update: () => {}, // No live telemetry updates needed
    setTerrain,
    setVehicleConfig,
    getConfig,
    getTerrain: () => currentTerrain,
    getVehicleConfig: () => cloneVehicleConfiguration(currentVehicleConfig),
    isDirty: () => isDirty,
    markApplied,
    setApplyError,
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