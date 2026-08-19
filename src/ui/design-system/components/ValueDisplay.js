// src/ui/design-system/components/ValueDisplay.js
/**
 * ValueDisplay — Formatted numeric display with unit, trend, and precision control.
 */

import { token } from '../theme.js';

const DEFAULT_CONFIG = {
  id: 'value-display',
  value: 0,
  unit: '',
  precision: 1,
  format: (v, p) => Number.isFinite(v) ? v.toFixed(p) : '--',
  trend: null, // 'up' | 'down' | null
  trendValue: null,
  label: '',
  size: 'md', // sm | md | lg | xl
  monospace: true,
  align: 'right', // left | center | right
  onClick: null,
};

const SIZE_STYLES = {
  sm: { valueSize: 'var(--ui-typeScale-base)', labelSize: 'var(--ui-typeScale-xs)', unitSize: 'var(--ui-typeScale-xs)', gap: '2px' },
  md: { valueSize: 'var(--ui-typeScale-xl)', labelSize: 'var(--ui-typeScale-sm)', unitSize: 'var(--ui-typeScale-sm)', gap: '4px' },
  lg: { valueSize: 'var(--ui-typeScale-2xl)', labelSize: 'var(--ui-typeScale-base)', unitSize: 'var(--ui-typeScale-base)', gap: '6px' },
  xl: { valueSize: 'var(--ui-typeScale-3xl)', labelSize: 'var(--ui-typeScale-lg)', unitSize: 'var(--ui-typeScale-lg)', gap: '8px' },
};

export function createValueDisplay(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const size = SIZE_STYLES[cfg.size] ?? SIZE_STYLES.md;

  const root = document.createElement('div');
  root.id = cfg.id;
  root.style.display = 'inline-flex';
  root.style.flexDirection = 'column';
  root.style.alignItems = cfg.align === 'left' ? 'flex-start' : cfg.align === 'center' ? 'center' : 'flex-end';
  root.style.gap = '2px';

  // Label
  if (cfg.label) {
    const labelEl = document.createElement('div');
    labelEl.textContent = cfg.label;
    labelEl.style.fontSize = size.labelSize;
    labelEl.style.fontWeight = 'var(--ui-fontWeight-medium)';
    labelEl.style.color = 'var(--ui-color-text-secondary)';
    labelEl.style.fontFamily = 'var(--ui-font-ui)';
    root.appendChild(labelEl);
  }

  // Value row
  const valueRow = document.createElement('div');
  valueRow.style.display = 'inline-flex';
  valueRow.style.alignItems = 'baseline';
  valueRow.style.gap = `${size.gap}px`;

  const valueEl = document.createElement('span');
  valueEl.textContent = cfg.format(cfg.value, cfg.precision);
  valueEl.style.fontSize = size.valueSize;
  valueEl.style.fontWeight = 'var(--ui-fontWeight-bold)';
  valueEl.style.color = 'var(--ui-color-text-primary)';
  valueEl.style.fontFamily = cfg.monospace ? 'var(--ui-font-mono)' : 'var(--ui-font-display)';
  valueEl.style.lineHeight = '1';
  valueEl.setAttribute('aria-live', 'polite');
  valueRow.appendChild(valueEl);

  if (cfg.unit) {
    const unitEl = document.createElement('span');
    unitEl.textContent = cfg.unit;
    unitEl.style.fontSize = size.unitSize;
    unitEl.style.fontWeight = 'var(--ui-fontWeight-medium)';
    unitEl.style.color = 'var(--ui-color-text-muted)';
    unitEl.style.fontFamily = 'var(--ui-font-ui)';
    valueRow.appendChild(unitEl);
  }

  // Trend indicator
  if (cfg.trend) {
    const trendEl = document.createElement('span');
    trendEl.style.display = 'inline-flex';
    trendEl.style.alignItems = 'center';
    trendEl.style.fontSize = size.unitSize;
    trendEl.style.fontWeight = 'var(--ui-fontWeight-bold)';
    trendEl.style.lineHeight = '1';
    if (cfg.trend === 'up') {
      trendEl.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>';
      trendEl.style.color = 'var(--ui-color-semantic-success)';
    } else if (cfg.trend === 'down') {
      trendEl.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>';
      trendEl.style.color = 'var(--ui-color-semantic-danger)';
    }
    if (cfg.trendValue !== null && cfg.trendValue !== undefined) {
      const trendVal = document.createElement('span');
      trendVal.textContent = cfg.format(Math.abs(cfg.trendValue), cfg.precision);
      trendVal.style.marginLeft = '2px';
      trendVal.style.fontFamily = cfg.monospace ? 'var(--ui-font-mono)' : 'var(--ui-font-display)';
      trendEl.appendChild(trendVal);
    }
    valueRow.appendChild(trendEl);
  }

  root.appendChild(valueRow);

  if (cfg.onClick) {
    root.style.cursor = 'pointer';
    root.addEventListener('click', cfg.onClick);
  }

  return {
    element: root,
    setValue: (val) => { cfg.value = val; valueEl.textContent = cfg.format(val, cfg.precision); },
    setTrend: (trend, trendVal) => {
      cfg.trend = trend;
      cfg.trendValue = trendVal;
      // Re-render would be needed for full implementation
    },
    setLabel: (text) => {
      const labelEl = root.querySelector('div:first-child');
      if (labelEl && labelEl !== valueRow) labelEl.textContent = text;
    },
    destroy: () => root.remove(),
  };
}