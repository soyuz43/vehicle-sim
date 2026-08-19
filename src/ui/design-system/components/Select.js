// src/ui/design-system/components/Select.js
/**
 * Select — Styled select dropdown component.
 */

import { token } from '../theme.js';

const DEFAULT_CONFIG = {
  id: 'select',
  label: '',
  options: [],
  value: '',
  placeholder: 'Select...',
  disabled: false,
  required: false,
  onChange: null,
};

export function createSelect(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const root = document.createElement('div');
  root.id = cfg.id;
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.gap = 'var(--ui-space-xs)';
  root.style.width = '100%';

  if (cfg.label) {
    const label = document.createElement('label');
    label.htmlFor = cfg.id + '-select';
    label.textContent = cfg.label;
    label.style.fontSize = 'var(--ui-typeScale-sm)';
    label.style.fontWeight = 'var(--ui-fontWeight-medium)';
    label.style.color = 'var(--ui-color-text-secondary)';
    root.appendChild(label);
  }

  const select = document.createElement('select');
  select.id = cfg.id + '-select';
  select.disabled = cfg.disabled;
  select.required = cfg.required;

  if (cfg.placeholder) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = cfg.placeholder;
    placeholder.disabled = true;
    placeholder.hidden = true;
    select.appendChild(placeholder);
  }

  for (const opt of cfg.options) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    option.disabled = opt.disabled ?? false;
    if (opt.value === cfg.value) option.selected = true;
    select.appendChild(option);
  }

  const chevronSvg = 'data:image/svg+xml,%3Csvg width=%2714%27 height=%2714%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%239ca3af%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpolyline points=%276 9 12 15 18 9%27%3E%3C/polyline%3E%3C/svg%3E';
  Object.assign(select.style, {
    width: '100%',
    height: 'var(--ui-control-height)',
    padding: '0 var(--ui-control-paddingX)',
    fontFamily: 'var(--ui-font-ui)',
    fontSize: 'var(--ui-typeScale-sm)',
    lineHeight: 'var(--ui-control-height)',
    color: 'var(--ui-color-text-primary)',
    background: 'var(--ui-color-bg-input)',
    border: '1px solid var(--ui-color-border-default)',
    borderRadius: 'var(--ui-radius-md)',
    appearance: 'none',
    backgroundImage: 'url("' + chevronSvg + '")',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right var(--ui-space-md) center',
    backgroundSize: '14px 14px',
    paddingRight: 'calc(var(--ui-control-paddingX) + 20px)',
    cursor: cfg.disabled ? 'not-allowed' : 'pointer',
    transition: 'border-color var(--ui-transition-fast), background var(--ui-transition-fast), box-shadow var(--ui-transition-fast)',
  });

  select.addEventListener('mouseenter', () => {
    if (!cfg.disabled) select.style.borderColor = 'var(--ui-color-border-emphasis)';
  });
  select.addEventListener('mouseleave', () => {
    if (!cfg.disabled) select.style.borderColor = 'var(--ui-color-border-default)';
  });
  select.addEventListener('focus', () => {
    select.style.borderColor = 'var(--ui-color-border-focus)';
    select.style.boxShadow = 'var(--ui-shadow-focus)';
  });
  select.addEventListener('blur', () => {
    select.style.borderColor = 'var(--ui-color-border-default)';
    select.style.boxShadow = 'none';
  });

  select.addEventListener('change', (e) => {
    cfg.onChange?.(e.target.value, e);
  });

  root.appendChild(select);

  return {
    element: root,
    select,
    getValue: () => select.value,
    setValue: (val) => { select.value = val; },
    setOptions: (options) => {
      const currentVal = select.value;
      select.innerHTML = '';
      if (cfg.placeholder) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = cfg.placeholder;
        placeholder.disabled = true;
        placeholder.hidden = true;
        select.appendChild(placeholder);
      }
      for (const opt of options) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        option.disabled = opt.disabled ?? false;
        select.appendChild(option);
      }
      select.value = currentVal;
    },
    setDisabled: (disabled) => {
      cfg.disabled = disabled;
      select.disabled = disabled;
      select.style.cursor = disabled ? 'not-allowed' : 'pointer';
      root.style.opacity = disabled ? 0.6 : 1;
    },
    destroy: () => root.remove(),
  };
}