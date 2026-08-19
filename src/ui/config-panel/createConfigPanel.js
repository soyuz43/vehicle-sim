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
  availableInMode: 'offroad', // 'proving-ground' | 'offroad' | 'both'
};

export function createConfigPanel(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  let currentTerrain = cfg.initialTerrain;
  let currentVehicleConfig = cfg.initialVehicleConfig
    ? cloneVehicleConfiguration(cfg.initialVehicleConfig)
    : createDefaultVehicleConfiguration();
  let defaultVehicleConfig = createDefaultVehicleConfiguration();
  let isDirty = false;

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
  content.style.maxHeight = 'calc(100vh - 100px)';
  content.style.overflowY = 'auto';

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
    badge: { label: 'OFFROAD', variant: 'warning' },
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
  modeNotice.innerHTML = `${getIconSvg('info', 12)} Vehicle changes only apply in <strong>Offroad</strong> mode. Proving ground uses fixed spec.`;
  vehicleContent.appendChild(modeNotice);

  // Slot selectors
  const slotSelects = {};
  for (const slot of VEHICLE_COMPONENT_SLOTS) {
    const slotEntry = VEHICLE_COMPONENT_CATALOG[slot];
    if (!slotEntry) continue;

    const row = createVStack({ gap: 'var(--ui-space-xs)' });

    const label = document.createElement('label');
    label.textContent = SLOT_LABELS[slot] ?? slot;
    label.htmlFor = `config-${slot}`;
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
        markDirty();
      },
    });
    slotSelects[slot] = select;
    row.appendChild(select.element);
    vehicleContent.appendChild(row);
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
  applyBtn.element.style.opacity = isDirty ? '1' : '0.5';
  applyBtn.element.style.pointerEvents = isDirty ? 'auto' : 'none';

  actionBar.appendChild(resetBtn.element);
  actionBar.appendChild(applyBtn.element);
  content.appendChild(actionBar);

  function markDirty() {
    isDirty = true;
    applyBtn.element.style.opacity = '1';
    applyBtn.element.style.pointerEvents = 'auto';
    // Update panel title to show dirty state
    panel.titleEl.textContent = 'Session Config ●';
    panel.titleEl.style.color = 'var(--ui-color-semantic-warning)';
  }

  function clearDirty() {
    isDirty = false;
    applyBtn.element.style.opacity = '0.5';
    applyBtn.element.style.pointerEvents = 'none';
    panel.titleEl.textContent = 'Session Config';
    panel.titleEl.style.color = '';
  }

  function resetToDefaults() {
    currentTerrain = 'proving-ground';
    currentVehicleConfig = cloneVehicleConfiguration(defaultVehicleConfig);
    terrainSelect.setValue(currentTerrain);
    for (const slot of VEHICLE_COMPONENT_SLOTS) {
      if (slotSelects[slot]) {
        slotSelects[slot].setValue(currentVehicleConfig.slots[slot]);
      }
    }
    updateTerrainDescription(terrainDesc, currentTerrain);
    clearDirty();
    cfg.onReset?.();
  }

  function applyChanges() {
    if (!isDirty) return;
    cfg.onApply?.({
      terrain: currentTerrain,
      vehicleConfig: cloneVehicleConfiguration(currentVehicleConfig),
    });
    // Update defaults to current for future resets
    defaultVehicleConfig = cloneVehicleConfiguration(currentVehicleConfig);
    clearDirty();
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