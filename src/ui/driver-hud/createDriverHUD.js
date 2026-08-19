// src/ui/driver-hud/createDriverHUD.js
/**
 * DriverHUD — Driver-facing instrument cluster.
 * Replaces createGearIndicator with visual speedometer, traction circles, animated gear display.
 * Uses design system tokens and components for consistency.
 */

import { token } from '../design-system/theme.js';
import { createPanel } from '../design-system/components/Panel.js';
import { createGauge } from '../design-system/components/Gauge.js';
import { createValueDisplay } from '../design-system/components/ValueDisplay.js';
import { createBadge } from '../design-system/components/Badge.js';
import { getIconSvg } from '../design-system/icons.js';
import { createVStack, createHStack } from '../design-system/layout/Stack.js';
import { useMobileBottomSheet } from '../design-system/layout/Responsive.js';

const WHEEL_POSITIONS = [
  { id: 'front-left', label: 'FL', axle: 'front', side: 'left' },
  { id: 'front-right', label: 'FR', axle: 'front', side: 'right' },
  { id: 'rear-left', label: 'RL', axle: 'rear', side: 'left' },
  { id: 'rear-right', label: 'RR', axle: 'rear', side: 'right' },
];

const GEAR_ORDER = ['reverse', 'neutral', 'drive'];
const GEAR_LABELS = { reverse: 'R', neutral: 'N', drive: 'D' };

const DEFAULT_CONFIG = {
  anchor: 'bottom-right',
  initiallyCollapsed: false,
  zIndex: null,
  onPositionChange: null,
};

export function createDriverHUD(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Create main panel using design system
  const panel = createPanel({
    id: 'driver-hud',
    title: 'Driver HUD',
    anchor: cfg.anchor,
    collapsible: true,
    draggable: true,
    initiallyCollapsed: cfg.initiallyCollapsed,
    width: 220,
    minWidth: 200,
    maxWidth: 280,
    zIndex: cfg.zIndex ?? token('zIndex.panel'),
    onPositionChange: cfg.onPositionChange,
  });

  const content = panel.content;
  content.style.padding = 'var(--ui-space-md)';
  content.style.display = 'flex';
  content.style.flexDirection = 'column';
  content.style.gap = 'var(--ui-space-md)';

  // === SPEED SECTION ===
  const speedSection = createVStack({ gap: 'var(--ui-space-xs)', align: 'center' });

  const speedLabel = document.createElement('div');
  speedLabel.textContent = 'SPEED';
  speedLabel.style.fontSize = 'var(--ui-typeScale-xs)';
  speedLabel.style.fontWeight = 'var(--ui-fontWeight-semibold)';
  speedLabel.style.letterSpacing = '0.08em';
  speedLabel.style.color = 'var(--ui-color-text-muted)';
  speedLabel.style.textTransform = 'uppercase';
  speedSection.appendChild(speedLabel);

  // Speed value (large, prominent)
  const speedDisplay = createValueDisplay({
    value: 0,
    unit: 'm/s',
    precision: 1,
    size: 'xl',
    monospace: true,
    label: '',
    format: (v) => v.toFixed(1),
  });
  speedSection.appendChild(speedDisplay.element);

  // km/h sub-display
  const kmhDisplay = createValueDisplay({
    value: 0,
    unit: 'km/h',
    precision: 1,
    size: 'sm',
    monospace: true,
    label: '',
    format: (v) => v.toFixed(1),
  });
  kmhDisplay.element.style.color = 'var(--ui-color-text-secondary)';
  speedSection.appendChild(kmhDisplay.element);

  // Speed gauge (horizontal bar)
  const speedGauge = createGauge({
    value: 0,
    min: 0,
    max: 60, // 60 m/s = 216 km/h
    type: 'bar',
    size: 'md',
    showValue: false,
    segments: [
      { threshold: 0.33, color: 'var(--ui-color-semantic-success)' },
      { threshold: 0.66, color: 'var(--ui-color-semantic-warning)' },
      { threshold: 1, color: 'var(--ui-color-semantic-danger)' },
    ],
  });
  speedGauge.element.style.width = '100%';
  speedSection.appendChild(speedGauge.element);

  content.appendChild(speedSection);

  // === DIVIDER ===
  const divider = document.createElement('div');
  divider.style.height = '1px';
  divider.style.background = 'var(--ui-color-border-subtle)';
  divider.style.margin = 'var(--ui-space-xs) 0';
  content.appendChild(divider);

  // === TRACTION SECTION ===
  const tractionSection = createVStack({ gap: 'var(--ui-space-sm)' });

  const tractionTitleRow = createHStack({ justify: 'space-between', align: 'center' });
  const tractionLabel = document.createElement('div');
  tractionLabel.textContent = 'TRACTION';
  tractionLabel.style.fontSize = 'var(--ui-typeScale-xs)';
  tractionLabel.style.fontWeight = 'var(--ui-fontWeight-semibold)';
  tractionLabel.style.letterSpacing = '0.08em';
  tractionLabel.style.color = 'var(--ui-color-text-muted)';
  tractionLabel.style.textTransform = 'uppercase';
  tractionTitleRow.appendChild(tractionLabel);
  tractionSection.appendChild(tractionTitleRow);

  // Traction grid (2x2)
  const tractionGrid = createHStack({ gap: 'var(--ui-space-sm)', wrap: true });
  tractionGrid.style.justifyContent = 'center';

  const tractionPatches = new Map();

  for (const wheel of WHEEL_POSITIONS) {
    const patchContainer = createVStack({ gap: '2px', align: 'center' });

    // Visual patch (circle with state)
    const patch = document.createElement('div');
    patch.style.width = '48px';
    patch.style.height = '48px';
    patch.style.borderRadius = 'var(--ui-radius-full)';
    patch.style.display = 'flex';
    patch.style.alignItems = 'center';
    patch.style.justifyContent = 'center';
    patch.style.border = '2px solid var(--ui-color-border-default)';
    patch.style.background = 'var(--ui-color-bg-input)';
    patch.style.transition = 'background var(--ui-transition-base), border-color var(--ui-transition-base), transform var(--ui-transition-fast)';
    patch.style.position = 'relative';

    // Inner icon/value
    const patchValue = document.createElement('span');
    patchValue.style.fontSize = 'var(--ui-typeScale-xs)';
    patchValue.style.fontWeight = 'var(--ui-fontWeight-bold)';
    patchValue.style.fontFamily = 'var(--ui-font-mono)';
    patchValue.style.color = 'var(--ui-color-text-primary)';
    patchValue.textContent = '--';
    patch.appendChild(patchValue);

    // Wheel label
    const label = document.createElement('div');
    label.textContent = wheel.label;
    label.style.fontSize = 'var(--ui-typeScale-xs)';
    label.style.fontWeight = 'var(--ui-fontWeight-medium)';
    label.style.color = 'var(--ui-color-text-secondary)';

    patchContainer.appendChild(patch);
    patchContainer.appendChild(label);
    tractionGrid.appendChild(patchContainer);

    tractionPatches.set(wheel.id, { patch, patchValue, label, wheel });
  }

  tractionSection.appendChild(tractionGrid);
  content.appendChild(tractionSection);

  // === DIVIDER ===
  const divider2 = document.createElement('div');
  divider2.style.height = '1px';
  divider2.style.background = 'var(--ui-color-border-subtle)';
  divider2.style.margin = 'var(--ui-space-xs) 0';
  content.appendChild(divider2);

  // === GEAR SECTION ===
  const gearSection = createVStack({ gap: 'var(--ui-space-sm)', align: 'center' });

  const gearLabel = document.createElement('div');
  gearLabel.textContent = 'GEAR';
  gearLabel.style.fontSize = 'var(--ui-typeScale-xs)';
  gearLabel.style.fontWeight = 'var(--ui-fontWeight-semibold)';
  gearLabel.style.letterSpacing = '0.08em';
  gearLabel.style.color = 'var(--ui-color-text-muted)';
  gearLabel.style.textTransform = 'uppercase';
  gearSection.appendChild(gearLabel);

  // Gear selector row
  const gearRow = createHStack({ gap: 'var(--ui-space-sm)', align: 'center' });
  const gearButtons = new Map();

  for (const gear of GEAR_ORDER) {
    const isActive = gear === 'drive';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = GEAR_LABELS[gear];
    btn.dataset.gear = gear;
    Object.assign(btn.style, {
      width: '44px',
      height: '44px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 'var(--ui-typeScale-xl)',
      fontWeight: 'var(--ui-fontWeight-bold)',
      fontFamily: 'var(--ui-font-display)',
      borderRadius: 'var(--ui-radius-md)',
      border: isActive ? '2px solid var(--ui-color-gear-activeBorder)' : '1px solid var(--ui-color-gear-inactiveBorder)',
      background: isActive ? 'var(--ui-color-gear-activeBg)' : 'var(--ui-color-gear-inactiveBg)',
      color: isActive ? 'var(--ui-color-gear-activeText)' : 'var(--ui-color-gear-inactiveText)',
      cursor: 'default',
      transition: 'all var(--ui-transition-base)',
      transform: isActive ? 'scale(1.12)' : 'scale(1)',
      boxShadow: isActive ? 'var(--ui-shadow-md)' : 'none',
    });
    gearRow.appendChild(btn);
    gearButtons.set(gear, btn);
  }

  gearSection.appendChild(gearRow);
  content.appendChild(gearSection);

  // === Mobile bottom sheet behavior ===
  let mobileSheet = null;
  if (typeof window !== 'undefined') {
    mobileSheet = useMobileBottomSheet(panel, {
      breakpoint: 'md',
      onOpen: () => { panel.element.style.pointerEvents = 'auto'; },
      onClose: () => { panel.element.style.pointerEvents = 'auto'; },
    });
  }

  // === Update function ===
  function update(snapshot = {}) {
    const activeGear = snapshot.gear ?? 'drive';
    const speedMps = Math.abs(resolveSpeedMps(snapshot));

    // Speed displays
    speedDisplay.setValue(speedMps);
    kmhDisplay.setValue(speedMps * 3.6);

    // Speed gauge (clamp to max)
    speedGauge.setValue(Math.min(speedMps, 60));

    // Traction patches
    const wheelStates = snapshot.wheelStates ?? [];
    updateTractionPatches(wheelStates);

    // Gear buttons
    updateGearButtons(activeGear);
  }

  function updateTractionPatches(wheelStates) {
    for (const [id, patchData] of tractionPatches) {
      const wheelState = wheelStates.find(ws => ws.id === id);
      updateTractionPatch(patchData, wheelState);
    }
  }

  function updateTractionPatch(patchData, wheelState) {
    const { patch, patchValue, label } = patchData;

    if (!wheelState) {
      setPatchState(patch, patchValue, 'unavailable', '--');
      return;
    }

    if (!wheelState.isGrounded) {
      setPatchState(patch, patchValue, 'air', 'AIR');
      return;
    }

    if (wheelState.isSlipping) {
      setPatchState(patch, patchValue, 'slip', 'SLIP');
      return;
    }

    // Grounded - show traction limit in kN
    const tractionKnn = wheelState.tractionLimitNewtons ? wheelState.tractionLimitNewtons / 1000 : 0;
    setPatchState(patch, patchValue, 'grounded', `${tractionKnn.toFixed(1)}kN`);
  }

  function setPatchState(patch, valueEl, state, text) {
    valueEl.textContent = text;

    const states = {
      grounded: {
        bg: 'var(--ui-color-traction-groundedBg)',
        border: 'var(--ui-color-traction-groundedBorder)',
        color: 'var(--ui-color-traction-grounded)',
        transform: 'scale(1)',
      },
      slip: {
        bg: 'var(--ui-color-traction-slipBg)',
        border: 'var(--ui-color-traction-slipBorder)',
        color: 'var(--ui-color-traction-slip)',
        transform: 'scale(1.05)',
      },
      air: {
        bg: 'var(--ui-color-traction-airBg)',
        border: 'var(--ui-color-traction-airBorder)',
        color: 'var(--ui-color-traction-air)',
        transform: 'scale(1)',
      },
      unavailable: {
        bg: 'var(--ui-color-bg-input)',
        border: 'var(--ui-color-border-subtle)',
        color: 'var(--ui-color-traction-unavailable)',
        transform: 'scale(1)',
      },
    };

    const s = states[state] || states.unavailable;
    patch.style.background = s.bg;
    patch.style.borderColor = s.border;
    patch.style.transform = s.transform;
    valueEl.style.color = s.color;
  }

  function updateGearButtons(activeGear) {
    for (const [gear, btn] of gearButtons) {
      const isActive = gear === activeGear;
      btn.style.background = isActive ? 'var(--ui-color-gear-activeBg)' : 'var(--ui-color-gear-inactiveBg)';
      btn.style.color = isActive ? 'var(--ui-color-gear-activeText)' : 'var(--ui-color-gear-inactiveText)';
      btn.style.borderColor = isActive ? 'var(--ui-color-gear-activeBorder)' : 'var(--ui-color-gear-inactiveBorder)';
      btn.style.transform = isActive ? 'scale(1.12)' : 'scale(1)';
      btn.style.boxShadow = isActive ? 'var(--ui-shadow-md)' : 'none';
      btn.setAttribute('aria-pressed', isActive);
    }
  }

  function resolveSpeedMps(snapshot) {
    const speedMps = snapshot.speedMetersPerSecond ?? snapshot.speedScalar ?? 0;
    return Number.isFinite(speedMps) ? speedMps : 0;
  }

  // Initial render
  update({
    gear: cfg.initialGear ?? 'drive',
    speedMetersPerSecond: 0,
    wheelStates: [],
  });

  // Public API
  return {
    element: panel.element,
    panel,
    update,
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