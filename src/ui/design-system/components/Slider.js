// src/ui/design-system/components/Slider.js
/**
 * Slider — Styled range input with label, value display, and optional marks.
 */

import { token } from '../theme.js';

const DEFAULT_CONFIG = {
  id: 'slider',
  label: '',
  value: 0,
  min: 0,
  max: 100,
  step: 1,
  unit: '',
  formatValue: (v) => v.toString(),
  showValue: true,
  marks: null,
  disabled: false,
  onChange: null,
  onInput: null,
};

export function createSlider(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const root = document.createElement('div');
  root.id = cfg.id;
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.gap = 'var(--ui-space-xs)';
  root.style.width = '100%';

  if (cfg.label) {
    const labelRow = document.createElement('div');
    labelRow.style.display = 'flex';
    labelRow.style.alignItems = 'center';
    labelRow.style.justifyContent = 'space-between';
    labelRow.style.gap = 'var(--ui-space-sm)';

    const label = document.createElement('label');
    label.htmlFor = cfg.id + '-input';
    label.textContent = cfg.label;
    label.style.fontSize = 'var(--ui-typeScale-sm)';
    label.style.fontWeight = 'var(--ui-fontWeight-medium)';
    label.style.color = 'var(--ui-color-text-secondary)';
    label.style.flex = '1';

    labelRow.appendChild(label);

    if (cfg.showValue) {
      const valueDisplay = document.createElement('span');
      valueDisplay.id = cfg.id + '-value';
      valueDisplay.setAttribute('aria-live', 'polite');
      valueDisplay.textContent = cfg.formatValue(cfg.value) + (cfg.unit ? ' ' + cfg.unit : '');
      valueDisplay.style.fontSize = 'var(--ui-typeScale-sm)';
      valueDisplay.style.fontWeight = 'var(--ui-fontWeight-semibold)';
      valueDisplay.style.color = 'var(--ui-color-text-primary)';
      valueDisplay.style.fontFamily = 'var(--ui-font-mono)';
      valueDisplay.style.minWidth = '3.5ch';
      valueDisplay.style.textAlign = 'right';
      labelRow.appendChild(valueDisplay);
      cfg._valueDisplay = valueDisplay;
    }

    root.appendChild(labelRow);
  }

  const input = document.createElement('input');
  input.type = 'range';
  input.id = cfg.id + '-input';
  input.min = String(cfg.min);
  input.max = String(cfg.max);
  input.step = String(cfg.step);
  input.value = String(cfg.value);
  input.disabled = cfg.disabled;
  Object.assign(input.style, {
    width: '100%',
    height: '20px',
    appearance: 'none',
    background: 'transparent',
    cursor: cfg.disabled ? 'not-allowed' : 'pointer',
    accentColor: 'var(--ui-color-accent-primary)',
  });

  const styleEl = document.createElement('style');
  styleEl.textContent = '#' + cfg.id + '-input::-webkit-slider-runnable-track { height: 6px; background: var(--ui-color-border-default); border-radius: var(--ui-radius-full); border: none; } #' + cfg.id + '-input::-webkit-slider-thumb { appearance: none; width: 18px; height: 18px; margin-top: -6px; background: var(--ui-color-accent-primary); border-radius: var(--ui-radius-full); box-shadow: var(--ui-shadow-sm); transition: transform var(--ui-transition-fast), background var(--ui-transition-fast); } #' + cfg.id + '-input::-webkit-slider-thumb:hover { transform: scale(1.15); background: var(--ui-color-accent-primaryHover); } #' + cfg.id + '-input::-moz-range-track { height: 6px; background: var(--ui-color-border-default); border-radius: var(--ui-radius-full); border: none; } #' + cfg.id + '-input::-moz-range-thumb { width: 18px; height: 18px; background: var(--ui-color-accent-primary); border-radius: var(--ui-radius-full); border: none; box-shadow: var(--ui-shadow-sm); } #' + cfg.id + '-input:disabled::-webkit-slider-thumb, #' + cfg.id + '-input:disabled::-moz-range-thumb { background: var(--ui-color-text-muted); transform: none; } #' + cfg.id + '-input:focus-visible { outline: none; } #' + cfg.id + '-input:focus-visible::-webkit-slider-thumb { box-shadow: var(--ui-shadow-focus), var(--ui-shadow-sm); }';
  root.appendChild(styleEl);

  root.appendChild(input);

  if (cfg.marks && cfg.marks.length > 0) {
    const marksContainer = document.createElement('div');
    marksContainer.style.display = 'flex';
    marksContainer.style.justifyContent = 'space-between';
    marksContainer.style.marginTop = 'var(--ui-space-xs)';
    marksContainer.style.fontSize = 'var(--ui-typeScale-xs)';
    marksContainer.style.color = 'var(--ui-color-text-muted)';
    marksContainer.style.fontFamily = 'var(--ui-font-mono)';

    for (const mark of cfg.marks) {
      const markEl = document.createElement('span');
      markEl.textContent = mark.label ?? mark.value;
      marksContainer.appendChild(markEl);
    }
    root.appendChild(marksContainer);
  }

  function handleInput(e) {
    const val = Number(e.target.value);
    cfg._valueDisplay.textContent = cfg.formatValue(val) + (cfg.unit ? ' ' + cfg.unit : '');
    cfg.onInput?.(val, e);
  }

  function handleChange(e) {
    const val = Number(e.target.value);
    cfg.onChange?.(val, e);
  }

  input.addEventListener('input', handleInput);
  input.addEventListener('change', handleChange);

  return {
    element: root,
    input,
    getValue: () => Number(input.value),
    setValue: (val) => {
      const clamped = Math.max(cfg.min, Math.min(cfg.max, val));
      input.value = String(clamped);
      cfg._valueDisplay.textContent = cfg.formatValue(clamped) + (cfg.unit ? ' ' + cfg.unit : '');
    },
    setDisabled: (disabled) => {
      cfg.disabled = disabled;
      input.disabled = disabled;
      input.style.cursor = disabled ? 'not-allowed' : 'pointer';
      root.style.opacity = disabled ? 0.6 : 1;
    },
    setRange: (min, max) => {
      cfg.min = min;
      cfg.max = max;
      input.min = String(min);
      input.max = String(max);
    },
    destroy: () => {
      input.removeEventListener('input', handleInput);
      input.removeEventListener('change', handleChange);
      root.remove();
    },
  };
}