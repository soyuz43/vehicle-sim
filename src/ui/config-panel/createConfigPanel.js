// src/ui/config-panel/createConfigPanel.js
/**
 * ConfigPanel — Unified session configuration (terrain + vehicle).
 * Merges terrain selector and vehicle customization into accordion sections.
 * Dirty-state tracking with Apply/Reset actions. The dirty state is derived
 * from the staged selection and the running selection, never a stored flag.
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
  areVehicleConfigurationsEqual,
  cloneVehicleConfiguration,
  createDefaultVehicleConfiguration,
  setVehicleConfigurationSlot,
} from '../../vehicle/config/createVehicleConfiguration.js';

const TERRAIN_OPTIONS = [
  { value: 'proving-ground', label: 'Proving Ground' },
  { value: 'offroad', label: 'Offroad Playground' },
];

// The value of the synthetic option that marks a slot whose running state
// does not match any catalog component. A console swap can produce such a
// state: a manual gearbox on the stock inline-4, for example.
const MODIFIED_OPTION_VALUE = '__modified_outside_catalog__';

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
  onVehicleChange: null,
  onApply: null,
  onReset: null,
  initialTerrain: 'proving-ground',
  initialVehicleConfig: null,
};

export function createConfigPanel(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // The stock catalog configuration. It is the fixed baseline the Reset
  // Vehicle control restores, and it is never overwritten by an apply: an
  // applied configuration is not the baseline, it is the current setup.
  const stockVehicleConfig = createDefaultVehicleConfiguration();
  // The configuration the running vehicle actually carries. The host reports
  // it through markApplied(); it starts as the configuration the panel was
  // built with, which is the one the controller was created with.
  let appliedVehicleConfig = cfg.initialVehicleConfig
    ? cloneVehicleConfiguration(cfg.initialVehicleConfig)
    : createDefaultVehicleConfiguration();
  // The configuration staged for the next apply.
  let currentVehicleConfig = cloneVehicleConfiguration(appliedVehicleConfig);
  // The terrain the session is running on. A terrain selection is applied by
  // reloading the page, so this only changes when the host reports that a
  // different terrain is running. It is tracked as state rather than derived
  // from the URL so the panel stays correct if a live terrain swap lands.
  const initialTerrain = cfg.initialTerrain;
  let runningTerrain = initialTerrain;
  // The terrain staged for the next apply.
  let currentTerrain = initialTerrain;
  // The slots whose running state does not match any catalog component. The
  // panel reports them instead of claiming a component the vehicle is not
  // running.
  const modifiedSlots = new Set();
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
      refreshDirtyState();
      updateVehicleSetupPreview();
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

  // A terrain selection is applied by reloading the session, so the terrain
  // section says so instead of implying a live swap.
  const terrainApplyNote = document.createElement('div');
  terrainApplyNote.style.fontSize = 'var(--ui-typeScale-xs)';
  terrainApplyNote.style.color = 'var(--ui-color-text-muted)';
  terrainApplyNote.textContent =
    'A terrain change is applied on Apply and reloads the session.';
  terrainContent.appendChild(terrainApplyNote);

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
        if (val === MODIFIED_OPTION_VALUE) {
          // The modified marker is a report, not a selection. The panel
          // keeps showing it until the driver picks a real component.
          slotSelects[slot]?.setValue(MODIFIED_OPTION_VALUE);
          return;
        }
        currentVehicleConfig = setVehicleConfigurationSlot(currentVehicleConfig, slot, val);
        setSlotModifiedState(slot, false);
        updateVehicleSetupPreview();
        cfg.onVehicleChange?.(cloneVehicleConfiguration(currentVehicleConfig));
        refreshDirtyState();
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
      if (modifiedSlots.has(slot)) {
        return `${SLOT_LABELS[slot] ?? slot}: modified outside catalog`;
      }
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

    if (computeIsDirty()) {
      vehicleSetupPreview.textContent = `Staged setup — ${setupText}`;
      return;
    }

    if (applyStatus?.kind === 'applied') {
      const appliedText = `Applied at ${applyStatus.time} — ${setupText}`;

      if (applyStatus.warning) {
        // The warning names a consequence of the apply the driver should
        // know about, so it is shown in the warning color rather than
        // buried in the setup summary.
        vehicleSetupPreview.textContent = `${appliedText} — ${applyStatus.warning}`;
        vehicleSetupPreview.style.color = 'var(--ui-color-semantic-warning)';
        return;
      }

      vehicleSetupPreview.textContent = appliedText;
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
    label: 'Reset Vehicle',
    icon: getIconSvg('rotateCcw', 12),
    onClick: () => {
      resetVehicleToDefaults();
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
  const initiallyDirty = computeIsDirty();
  applyBtn.element.disabled = !initiallyDirty;
  applyBtn.element.setAttribute('aria-disabled', String(!initiallyDirty));
  applyBtn.element.style.opacity = initiallyDirty ? '1' : '0.5';

  actionBar.appendChild(resetBtn.element);
  actionBar.appendChild(applyBtn.element);
  content.appendChild(actionBar);

  // The dirty state is DERIVED from the staged state and the running state,
  // so it can never disagree with what the panel shows. A staged terrain
  // selection keeps the panel dirty even when the vehicle setup already
  // matches the running setup, because the terrain is still pending.
  function computeIsDirty() {
    return (
      !areVehicleConfigurationsEqual(currentVehicleConfig, appliedVehicleConfig) ||
      currentTerrain !== runningTerrain
    );
  }

  // Recompute the dirty state and repaint the Apply button and the title.
  function refreshDirtyState() {
    const dirty = computeIsDirty();
    applyBtn.element.disabled = !dirty;
    applyBtn.element.setAttribute('aria-disabled', String(!dirty));
    applyBtn.element.style.opacity = dirty ? '1' : '0.5';
    panel.titleEl.textContent = dirty ? 'Session Config ●' : 'Session Config';
    panel.titleEl.style.color = dirty ? 'var(--ui-color-semantic-warning)' : '';
  }

  // Reset Vehicle restores the stock catalog configuration and applies it
  // live. The vehicle's pose is NOT reset here: the R key owns that.
  //
  // The terrain is deliberately NOT touched. A terrain selection is applied
  // by reloading the session, so a staged terrain selection stays staged:
  // the panel keeps reporting it as pending instead of claiming a terrain
  // the simulation is not running. The dirty state is derived, so the panel
  // stays dirty while that terrain selection is outstanding.
  function resetVehicleToDefaults() {
    currentVehicleConfig = cloneVehicleConfiguration(stockVehicleConfig);
    for (const slot of VEHICLE_COMPONENT_SLOTS) {
      if (slotSelects[slot]) {
        slotSelects[slot].setValue(currentVehicleConfig.slots[slot]);
      }
    }
    updateVehicleSetupPreview();
    cfg.onVehicleChange?.(cloneVehicleConfiguration(currentVehicleConfig));

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
    if (!computeIsDirty()) return;

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

  // Report a successful apply. The host passes the configuration that
  // actually landed on the vehicle; without it the panel assumes the staged
  // configuration was applied. The host may also pass a warning that names
  // a consequence of the apply the driver should know about.
  //
  // The panel leaves the dirty state and shows the time the configuration
  // was applied.
  function markApplied(options = {}) {
    const { vehicleConfig = null, warning = null } = options ?? {};
    appliedVehicleConfig = cloneVehicleConfiguration(
      vehicleConfig ?? currentVehicleConfig
    );
    applyOutcome = 'applied';
    applyStatus = {
      kind: 'applied',
      time: formatAppliedTime(new Date()),
      warning,
    };
    refreshDirtyState();
    updateVehicleSetupPreview();
  }

  // Report that a different terrain is now running. A terrain selection is
  // applied by reloading the session, so the host reports the committed
  // terrain once the new session URL is written.
  function markTerrainApplied(terrain) {
    if (typeof terrain !== 'string' || terrain.length === 0) return;
    runningTerrain = terrain;
    refreshDirtyState();
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
    refreshDirtyState();
    updateVehicleSetupPreview();
  }

  function formatAppliedTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;
  }

  // The synthetic marker option marks a slot whose running state does not
  // match any catalog component.
  function findModifiedOption(select) {
    for (const child of select.children ?? []) {
      if (child.value === MODIFIED_OPTION_VALUE) return child;
    }
    return null;
  }

  function setSlotModifiedState(slot, modified) {
    if (modified) {
      modifiedSlots.add(slot);
    } else {
      modifiedSlots.delete(slot);
    }

    const select = slotSelects[slot]?.select;
    if (!select) return;

    const existing = findModifiedOption(select);

    if (modified) {
      if (!existing) {
        const option = document.createElement('option');
        option.value = MODIFIED_OPTION_VALUE;
        option.textContent = 'Modified outside catalog';
        select.appendChild(option);
      }
      select.value = MODIFIED_OPTION_VALUE;
      return;
    }

    if (existing) {
      select.value = currentVehicleConfig.slots[slot];
      select.removeChild(existing);
    }
  }

  // Adopt a configuration the host read from the running vehicle.
  //
  // The vehicle can be reconfigured outside the panel: the browser console
  // and the control panel both reach the controller directly. The panel must
  // not keep reporting a setup the vehicle is not running.
  //
  // An external change is not a staged change, so the panel does not become
  // dirty. A slot the vehicle changed supersedes the panel's staged value
  // for that slot; a slot the vehicle did not change keeps whatever the
  // driver staged for it.
  //
  // A slot the vehicle reports as null is running a state no catalog
  // component describes. The panel keeps the last known catalog selection
  // so the configuration stays well formed, and marks the slot as modified.
  function applyExternalVehicleConfig(externalConfig) {
    const externalSlots = externalConfig?.slots ?? {};

    for (const slot of VEHICLE_COMPONENT_SLOTS) {
      if (!Object.prototype.hasOwnProperty.call(externalSlots, slot)) continue;

      const externalValue = externalSlots[slot] ?? null;

      if (externalValue === null) {
        setSlotModifiedState(slot, true);
        continue;
      }

      if (!VEHICLE_COMPONENT_CATALOG[slot]?.components[externalValue]) continue;

      if (modifiedSlots.has(slot)) {
        setSlotModifiedState(slot, false);
      }

      if (appliedVehicleConfig.slots[slot] === externalValue) continue;

      currentVehicleConfig = setVehicleConfigurationSlot(
        currentVehicleConfig,
        slot,
        externalValue
      );
      appliedVehicleConfig = setVehicleConfigurationSlot(
        appliedVehicleConfig,
        slot,
        externalValue
      );
      slotSelects[slot]?.setValue(externalValue);
    }

    refreshDirtyState();
    updateVehicleSetupPreview();
  }

  // Public API for external sync.
  //
  // setTerrain and setVehicleConfig STAGE a selection: they change what the
  // next apply applies, not what is running. The running state is reported
  // back by the host through markApplied() and markTerrainApplied().
  function setTerrain(terrain) {
    currentTerrain = terrain;
    terrainSelect.setValue(terrain);
    updateTerrainDescription(terrainDesc, terrain);
    refreshDirtyState();
  }

  function setVehicleConfig(vConfig) {
    currentVehicleConfig = cloneVehicleConfiguration(vConfig);
    for (const slot of VEHICLE_COMPONENT_SLOTS) {
      if (slotSelects[slot]) {
        slotSelects[slot].setValue(currentVehicleConfig.slots[slot]);
      }
    }
    updateVehicleSetupPreview();
    refreshDirtyState();
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
    applyExternalVehicleConfig,
    getModifiedSlots: () => [...modifiedSlots],
    getConfig,
    getTerrain: () => currentTerrain,
    getVehicleConfig: () => cloneVehicleConfiguration(currentVehicleConfig),
    isDirty: () => computeIsDirty(),
    markApplied,
    markTerrainApplied,
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