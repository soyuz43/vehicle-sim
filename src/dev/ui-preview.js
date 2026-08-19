// src/dev/ui-preview.js
/**
 * UI Component Preview — Storybook-style preview page for design system components.
 * Access at /dev/ui-preview.html when running dev server.
 * This is only loaded in development mode.
 */

import { token, initTheme, toggleTheme, getTheme } from '../ui/design-system/theme.js';
import { createPanel } from '../ui/design-system/components/Panel.js';
import { createButton, Button } from '../ui/design-system/components/Button.js';
import { createSlider } from '../ui/design-system/components/Slider.js';
import { createSelect } from '../ui/design-system/components/Select.js';
import { createBadge, Badge } from '../ui/design-system/components/Badge.js';
import { createValueDisplay } from '../ui/design-system/components/ValueDisplay.js';
import { createGauge } from '../ui/design-system/components/Gauge.js';
import { createSparkline } from '../ui/design-system/components/Sparkline.js';
import { createSection } from '../ui/design-system/components/Section.js';
import { createDriverHUD } from '../ui/driver-hud/createDriverHUD.js';
import { createTelemetryPanel } from '../ui/telemetry-panel/createTelemetryPanel.js';
import { createControlPanel } from '../ui/control-panel/createControlPanel.js';
import { createConfigPanel } from '../ui/config-panel/createConfigPanel.js';

// Only run in development
if (import.meta.env.DEV) {
  // Create preview container
  const preview = document.createElement('div');
  preview.id = 'ui-preview';
  preview.style.position = 'fixed';
  preview.style.top = '0';
  preview.style.left = '0';
  preview.style.width = '100%';
  preview.style.height = '100%';
  preview.style.background = 'var(--ui-color-bg-panel)';
  preview.style.zIndex = '9999';
  preview.style.overflow = 'auto';
  preview.style.padding = 'var(--ui-space-xl)';
  preview.style.fontFamily = 'var(--ui-font-ui)';
  preview.innerHTML = `
    <div style="max-width: 1200px; margin: 0 auto;">
      <header style="margin-bottom: var(--ui-space-2xl); padding-bottom: var(--ui-space-lg); border-bottom: 1px solid var(--ui-color-border-default);">
        <h1 style="font-size: var(--ui-typeScale-3xl); font-weight: var(--ui-fontWeight-bold); margin: 0 0 var(--ui-space-xs);">Design System Preview</h1>
        <p style="color: var(--ui-color-text-secondary); margin: 0;">Interactive component playground — all components use design tokens</p>
      </header>

      <div id="preview-content" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: var(--ui-space-xl);">
        <!-- Sections will be injected here -->
      </div>
    </div>
  `;

  document.body.appendChild(preview);

  // Initialize theme
  initTheme();

  // Theme toggle
  const themeToggle = createButton({
    variant: 'ghost',
    size: 'sm',
    label: 'Toggle Theme',
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`,
    onClick: () => toggleTheme(),
  });
  themeToggle.element.style.position = 'fixed';
  themeToggle.element.style.top = 'var(--ui-space-md)';
  themeToggle.element.style.right = 'var(--ui-space-md)';
  themeToggle.element.style.zIndex = '10000';
  document.body.appendChild(themeToggle.element);

  const content = preview.querySelector('#preview-content');

  // Helper to create section cards
  function createCard(title, description, renderFn) {
    const card = document.createElement('div');
    card.style.background = 'var(--ui-color-bg-panelHover)';
    card.style.border = '1px solid var(--ui-color-border-default)';
    card.style.borderRadius = 'var(--ui-radius-lg)';
    card.style.padding = 'var(--ui-space-lg)';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = 'var(--ui-space-md)';

    const header = document.createElement('div');
    header.innerHTML = `
      <h3 style="font-size: var(--ui-typeScale-lg); font-weight: var(--ui-fontWeight-semibold); margin: 0 0 var(--ui-space-xs);">${title}</h3>
      <p style="font-size: var(--ui-typeScale-sm); color: var(--ui-color-text-secondary); margin: 0;">${description}</p>
    `;
    card.appendChild(header);

    const demo = document.createElement('div');
    demo.style.display = 'flex';
    demo.style.flexDirection = 'column';
    demo.style.gap = 'var(--ui-space-md)';
    renderFn(demo);
    card.appendChild(demo);

    return card;
  }

  // === BUTTONS ===
  content.appendChild(createCard('Buttons', 'All variants and sizes', (demo) => {
    const row1 = document.createElement('div');
    row1.style.display = 'flex';
    row1.style.gap = 'var(--ui-space-sm)';
    row1.style.flexWrap = 'wrap';
    for (const variant of ['primary', 'secondary', 'ghost', 'danger', 'outline']) {
      row1.appendChild(Button[variant]({ label: variant.charAt(0).toUpperCase() + variant.slice(1) }).element);
    }
    demo.appendChild(row1);

    const row2 = document.createElement('div');
    row2.style.display = 'flex';
    row2.style.gap = 'var(--ui-space-sm)';
    row2.style.flexWrap = 'wrap';
    for (const size of ['sm', 'md', 'lg']) {
      row2.appendChild(Button.primary({ label: size, size }).element);
    }
    demo.appendChild(row2);

    const row3 = document.createElement('div');
    row3.style.display = 'flex';
    row3.style.gap = 'var(--ui-space-sm)';
    row3.style.flexWrap = 'wrap';
    row3.appendChild(Button.primary({ label: 'Loading', loading: true }).element);
    row3.appendChild(Button.primary({ label: 'Disabled', disabled: true }).element);
    row3.appendChild(Button.icon('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>', { 'aria-label': 'Check' }).element);
    demo.appendChild(row3);
  }));

  // === SLIDER ===
  content.appendChild(createCard('Slider', 'Range input with value display', (demo) => {
    const slider = createSlider({
      label: 'Drive Torque Multiplier',
      value: 1,
      min: 0.25,
      max: 5,
      step: 0.05,
      unit: '×',
      formatValue: (v) => v.toFixed(2),
    });
    demo.appendChild(slider.element);
  }));

  // === SELECT ===
  content.appendChild(createCard('Select', 'Styled dropdown', (demo) => {
    const select = createSelect({
      label: 'Rear Differential',
      options: [
        { value: 'open', label: 'Open' },
        { value: 'limited-slip', label: 'Limited-Slip' },
        { value: 'torsen', label: 'Torsen' },
        { value: 'locked', label: 'Locked' },
        { value: 'welded', label: 'Welded' },
      ],
      value: 'open',
    });
    demo.appendChild(select.element);
  }));

  // === BADGES ===
  content.appendChild(createCard('Badges', 'Semantic status indicators', (demo) => {
    const row1 = document.createElement('div');
    row1.style.display = 'flex';
    row1.style.gap = 'var(--ui-space-sm)';
    row1.style.flexWrap = 'wrap';
    for (const variant of ['success', 'warning', 'danger', 'info', 'neutral']) {
      row1.appendChild(Badge[variant](variant).element);
    }
    demo.appendChild(row1);

    const row2 = document.createElement('div');
    row2.style.display = 'flex';
    row2.style.gap = 'var(--ui-space-sm)';
    row2.style.flexWrap = 'wrap';
    row2.appendChild(Badge.tractionGrounded('Grounded').element);
    row2.appendChild(Badge.tractionSlip('Slip').element);
    row2.appendChild(Badge.tractionAir('Air').element);
    demo.appendChild(row2);

    const row3 = document.createElement('div');
    row3.style.display = 'flex';
    row3.style.gap = 'var(--ui-space-sm)';
    row3.style.flexWrap = 'wrap';
    for (const size of ['sm', 'md', 'lg']) {
      row3.appendChild(Badge.success(size, { size }).element);
    }
    demo.appendChild(row3);
  }));

  // === VALUE DISPLAY ===
  content.appendChild(createCard('ValueDisplay', 'Formatted numeric readouts', (demo) => {
    const row1 = document.createElement('div');
    row1.style.display = 'flex';
    row1.style.gap = 'var(--ui-space-lg)';
    row1.style.flexWrap = 'wrap';
    row1.appendChild(createValueDisplay({ label: 'Speed', value: 27.5, unit: 'm/s', size: 'xl' }).element);
    row1.appendChild(createValueDisplay({ label: 'RPM', value: 4500, unit: 'rpm', size: 'lg' }).element);
    demo.appendChild(row1);

    const row2 = document.createElement('div');
    row2.style.display = 'flex';
    row2.style.gap = 'var(--ui-space-lg)';
    row2.style.flexWrap = 'wrap';
    row2.appendChild(createValueDisplay({ label: 'Temp', value: 92.3, unit: '°C', size: 'md', trend: 'up', trendValue: 2.1 }).element);
    row2.appendChild(createValueDisplay({ label: 'Pressure', value: 1.8, unit: 'bar', size: 'md', trend: 'down', trendValue: 0.3 }).element);
    demo.appendChild(row2);
  }));

  // === GAUGE ===
  content.appendChild(createCard('Gauge', 'Progress indicators (bar & circular)', (demo) => {
    const row1 = document.createElement('div');
    row1.style.display = 'flex';
    row1.style.gap = 'var(--ui-space-lg)';
    row1.style.flexWrap = 'wrap';
    row1.appendChild(createGauge({ value: 0.65, min: 0, max: 1, type: 'bar', size: 'md', label: 'Throttle' }).element);
    row1.appendChild(createGauge({ value: 0.3, min: 0, max: 1, type: 'bar', size: 'md', label: 'Brake' }).element);
    demo.appendChild(row1);

    const row2 = document.createElement('div');
    row2.style.display = 'flex';
    row2.style.gap = 'var(--ui-space-lg)';
    row2.style.flexWrap = 'wrap';
    row2.appendChild(createGauge({ value: 0.75, min: 0, max: 1, type: 'circular', size: 'md', label: 'RPM' }).element);
    row2.appendChild(createGauge({ value: 0.45, min: 0, max: 1, type: 'circular', size: 'md', label: 'Load' }).element);
    demo.appendChild(row2);
  }));

  // === SPARKLINE ===
  content.appendChild(createCard('Sparkline', 'Mini time-series charts', (demo) => {
    const data = Array.from({ length: 60 }, () => Math.random() * 100);
    const spark = createSparkline({ data, width: 200, height: 50, color: 'var(--ui-color-accent-primary)' });
    demo.appendChild(spark.element);

    // Animate
    let i = 0;
    setInterval(() => {
      spark.push(Math.random() * 100);
    }, 100);
  }));

  // === SECTION ===
  content.appendChild(createCard('Section', 'Collapsible content sections', (demo) => {
    const section = createSection({
      title: 'Engine Parameters',
      badge: { label: 'LIVE', variant: 'success' },
      initiallyCollapsed: false,
    });
    const content2 = section.content;
    content2.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--ui-space-sm); font-size: var(--ui-typeScale-sm);">
        <div><span style="color: var(--ui-color-text-secondary);">RPM</span><br><strong>4,500</strong></div>
        <div><span style="color: var(--ui-color-text-secondary);">Throttle</span><br><strong>75%</strong></div>
        <div><span style="color: var(--ui-color-text-secondary);">Torque</span><br><strong>420 Nm</strong></div>
        <div><span style="color: var(--ui-color-text-secondary);">Power</span><br><strong>198 kW</strong></div>
      </div>
    `;
    demo.appendChild(section.element);
  }));

  // === PANEL ===
  content.appendChild(createCard('Panel', 'Draggable, collapsible floating panel', (demo) => {
    const panel = createPanel({
      title: 'Sample Panel',
      anchor: 'top-right',
      collapsible: true,
      draggable: true,
      width: 300,
    });
    panel.content.innerHTML = `
      <p style="color: var(--ui-color-text-secondary); margin: 0;">This panel can be dragged, collapsed, and docked to any corner.</p>
      <div style="margin-top: var(--ui-space-md); display: flex; gap: var(--ui-space-sm);">
        ${Button.primary({ label: 'Action', size: 'sm' }).element.outerHTML}
        ${Button.ghost({ label: 'Cancel', size: 'sm' }).element.outerHTML}
      </div>
    `;
    // Add to demo but position it inline for preview
    panel.element.style.position = 'relative';
    panel.element.style.zIndex = 'auto';
    panel.element.style.maxWidth = '100%';
    demo.appendChild(panel.element);
  }));

  // === DRIVER HUD ===
  content.appendChild(createCard('DriverHUD', 'Driver-facing instrument cluster', (demo) => {
    const hud = createDriverHUD({ anchor: 'bottom-right', initiallyCollapsed: false });
    hud.element.style.position = 'relative';
    hud.element.style.zIndex = 'auto';
    hud.update({
      gear: 'drive',
      speedMetersPerSecond: 27.5,
      wheelStates: [
        { id: 'front-left', isGrounded: true, isSlipping: false, tractionLimitNewtons: 4500 },
        { id: 'front-right', isGrounded: true, isSlipping: false, tractionLimitNewtons: 4400 },
        { id: 'rear-left', isGrounded: true, isSlipping: true, tractionLimitNewtons: 3200 },
        { id: 'rear-right', isGrounded: true, isSlipping: false, tractionLimitNewtons: 3300 },
      ],
    });
    demo.appendChild(hud.element);
  }));

  // === TELEMETRY PANEL ===
  content.appendChild(createCard('TelemetryPanel', 'Developer telemetry dashboard', (demo) => {
    const tel = createTelemetryPanel({ anchor: 'top-left', initiallyCollapsed: false });
    tel.element.style.position = 'relative';
    tel.element.style.zIndex = 'auto';
    tel.update({
      vehicleSnapshot: {
        speedMetersPerSecond: 27.5,
        localVelocityX: 0, localVelocityY: 0, localVelocityZ: 27.5,
        yawRateRadPerSec: 0.5,
        massKg: 1450,
        gear: 3,
        throttle: 0.75,
        brake: 0,
        absActive: false,
      },
      forces: { totalForceX: 2400, totalForceY: 1800, totalForceZ: 14200, yawMoment: 850, aeroDragForce: 320, aeroDownforce: 800 },
      powertrain: { driveTorqueNm: 380, engineRpm: 4500 },
      powertrainKinematics: { engineRpm: 4500 },
      rearDifferentialState: { rearDifferentialType: 'limited-slip', rearDifferentialLeftShare01: 0.55, rearDifferentialTorqueBiasRatio: 2.5, rearDifferentialWheelSpeedDifferenceAbsRadiansPerSecond: 12.3 },
      wheelStates: [
        { id: 'front-left', normalForceNewtons: 3800, tireForceX: 800, tireForceY: 400, longitudinalSlipRatioAbs: 0.05, lateralSlipAngleDeg: 2.1, suspensionTravelMeters: 0.02, suspensionForceNewtons: 3600, appliedServiceBrakeTorqueNewtonMeters: 0 },
        { id: 'front-right', normalForceNewtons: 3700, tireForceX: 750, tireForceY: -380, longitudinalSlipRatioAbs: 0.04, lateralSlipAngleDeg: 1.9, suspensionTravelMeters: 0.025, suspensionForceNewtons: 3500, appliedServiceBrakeTorqueNewtonMeters: 0 },
        { id: 'rear-left', normalForceNewtons: 3400, tireForceX: 600, tireForceY: 500, longitudinalSlipRatioAbs: 0.08, lateralSlipAngleDeg: 3.2, suspensionTravelMeters: 0.015, suspensionForceNewtons: 3200, appliedServiceBrakeTorqueNewtonMeters: 150 },
        { id: 'rear-right', normalForceNewtons: 3300, tireForceX: 580, tireForceY: -480, longitudinalSlipRatioAbs: 0.07, lateralSlipAngleDeg: 2.8, suspensionTravelMeters: 0.018, suspensionForceNewtons: 3100, appliedServiceBrakeTorqueNewtonMeters: 150 },
      ],
      lateralSlipSummary: { maxAbsLateralSlipAngleDegrees: 3.2 },
      lateralTireForceSummary: {},
      loadTransferSummary: { longitudinalTransferPercent: 12.5 },
      suspensionNormalForceSummary: {},
      chassisAttitude: { heaveMeters: 0.01 },
      slopeGravity: {},
    });
    demo.appendChild(tel.element);
  }));

  // === CONTROL PANEL ===
  content.appendChild(createCard('ControlPanel', 'Unified developer controls', (demo) => {
    const ctrl = createControlPanel({ anchor: 'top-right', initiallyCollapsed: false });
    ctrl.element.style.position = 'relative';
    ctrl.element.style.zIndex = 'auto';
    demo.appendChild(ctrl.element);
  }));

  // === CONFIG PANEL ===
  content.appendChild(createCard('ConfigPanel', 'Session configuration (terrain + vehicle)', (demo) => {
    const cfg = createConfigPanel({ anchor: 'top-left', initiallyCollapsed: false });
    cfg.element.style.position = 'relative';
    cfg.element.style.zIndex = 'auto';
    demo.appendChild(cfg.element);
  }));

  // Token reference table
  content.appendChild(createCard('Design Tokens Reference', 'Key token values (injected as CSS custom properties)', (demo) => {
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.fontSize = 'var(--ui-typeScale-sm)';
    table.innerHTML = `
      <thead>
        <tr style="text-align: left; border-bottom: 1px solid var(--ui-color-border-default);">
          <th style="padding: var(--ui-space-sm); color: var(--ui-color-text-secondary);">Category</th>
          <th style="padding: var(--ui-space-sm); color: var(--ui-color-text-secondary);">Token</th>
          <th style="padding: var(--ui-space-sm); color: var(--ui-color-text-secondary);">Value</th>
        </tr>
      </thead>
      <tbody id="token-table-body"></tbody>
    `;
    demo.appendChild(table);

    const tbody = table.querySelector('#token-table-body');
    const categories = {
      Color: ['--ui-color-bg-panel', '--ui-color-text-primary', '--ui-color-accent-primary', '--ui-color-semantic-success'],
      Spacing: ['--ui-space-xs', '--ui-space-sm', '--ui-space-md', '--ui-space-lg', '--ui-space-xl'],
      Radius: ['--ui-radius-sm', '--ui-radius-md', '--ui-radius-lg', '--ui-radius-full'],
      Shadow: ['--ui-shadow-sm', '--ui-shadow-md', '--ui-shadow-lg', '--ui-shadow-focus'],
      Typography: ['--ui-font-ui', '--ui-font-mono', '--ui-typeScale-base', '--ui-typeScale-xl'],
      ZIndex: ['--ui-zIndex-panel', '--ui-zIndex-modal', '--ui-zIndex-tooltip'],
    };

    for (const [cat, tokens] of Object.entries(categories)) {
      for (let i = 0; i < tokens.length; i++) {
        const tokenName = tokens[i];
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid var(--ui-color-border-subtle)';
        row.innerHTML = `
          <td style="padding: var(--ui-space-xs) var(--ui-space-sm); ${i === 0 ? '' : 'color: var(--ui-color-text-muted);'}">${i === 0 ? cat : ''}</td>
          <td style="padding: var(--ui-space-xs) var(--ui-space-sm); font-family: var(--ui-font-mono);">${tokenName}</td>
          <td style="padding: var(--ui-space-xs) var(--ui-space-sm); font-family: var(--ui-font-mono); color: var(--ui-color-text-secondary);">${getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim() || '(runtime)'}</td>
        `;
        tbody.appendChild(row);
      }
    }
  }));

  // Close preview handler
  const closeBtn = createButton({
    variant: 'danger',
    size: 'sm',
    label: 'Close Preview',
    onClick: () => {
      preview.remove();
      themeToggle.element.remove();
    },
  });
  closeBtn.element.style.position = 'fixed';
  closeBtn.element.style.bottom = 'var(--ui-space-md)';
  closeBtn.element.style.right = 'var(--ui-space-md)';
  closeBtn.element.style.zIndex = '10000';
  document.body.appendChild(closeBtn.element);

  // Keyboard shortcut: Ctrl/Cmd + Shift + P to toggle preview
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      if (document.getElementById('ui-preview')) {
        preview.remove();
        themeToggle.element.remove();
        closeBtn.element.remove();
      } else {
        // Re-create (simplified - would need full re-init)
        location.reload();
      }
    }
  });

  console.log('[UI Preview] Loaded. Press Ctrl+Shift+P to toggle.');
}