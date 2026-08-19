// src/ui/design-system/components/Button.js
/**
 * Button — Styled button component with variants, sizes, and states.
 */

import { token } from '../theme.js';

const VARIANTS = {
  primary: {
    background: 'var(--ui-color-accent-primary)',
    backgroundHover: 'var(--ui-color-accent-primaryHover)',
    backgroundActive: 'var(--ui-color-accent-primaryActive)',
    color: 'var(--ui-color-text-inverse)',
    border: '1px solid transparent',
  },
  secondary: {
    background: 'var(--ui-color-bg-input)',
    backgroundHover: 'var(--ui-color-bg-inputHover)',
    backgroundActive: 'var(--ui-color-bg-inputFocus)',
    color: 'var(--ui-color-text-primary)',
    border: '1px solid var(--ui-color-border-default)',
  },
  ghost: {
    background: 'transparent',
    backgroundHover: 'var(--ui-color-bg-inputHover)',
    backgroundActive: 'var(--ui-color-bg-inputFocus)',
    color: 'var(--ui-color-text-secondary)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'var(--ui-color-semantic-danger)',
    backgroundHover: 'var(--ui-color-semantic-dangerBorder)',
    backgroundActive: 'var(--ui-color-semantic-danger)',
    color: 'var(--ui-color-text-inverse)',
    border: '1px solid transparent',
  },
  outline: {
    background: 'transparent',
    backgroundHover: 'var(--ui-color-bg-inputHover)',
    backgroundActive: 'var(--ui-color-bg-inputFocus)',
    color: 'var(--ui-color-text-primary)',
    border: '1px solid var(--ui-color-border-default)',
  },
};

const SIZES = {
  sm: { height: 'var(--ui-control-heightSm)', paddingX: 'var(--ui-control-paddingXSm)', fontSize: 'var(--ui-typeScale-xs)', gap: 'var(--ui-space-xs)' },
  md: { height: 'var(--ui-control-height)', paddingX: 'var(--ui-control-paddingX)', fontSize: 'var(--ui-typeScale-sm)', gap: 'var(--ui-space-sm)' },
  lg: { height: 'var(--ui-control-heightLg)', paddingX: 'var(--ui-control-paddingXLg)', fontSize: 'var(--ui-typeScale-base)', gap: 'var(--ui-space-sm)' },
};

const DEFAULT_CONFIG = {
  variant: 'secondary',
  size: 'md',
  disabled: false,
  loading: false,
  fullWidth: false,
  icon: null,
  iconOnly: false,
  'aria-label': null,
  type: 'button',
  onClick: null,
};

export function createButton(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const variant = VARIANTS[cfg.variant] ?? VARIANTS.secondary;
  const size = SIZES[cfg.size] ?? SIZES.md;

  const btn = document.createElement('button');
  btn.type = cfg.type;
  if (cfg['aria-label']) btn.setAttribute('aria-label', cfg['aria-label']);
  if (cfg.disabled) btn.disabled = true;
  if (cfg.loading) btn.setAttribute('aria-busy', 'true');

  const content = document.createElement('span');
  content.style.display = 'flex';
  content.style.alignItems = 'center';
  content.style.justifyContent = 'center';
  content.style.gap = size.gap;
  content.style.width = '100%';

  if (cfg.icon && !cfg.iconOnly) {
    const iconEl = document.createElement('span');
    iconEl.style.display = 'flex';
    iconEl.style.alignItems = 'center';
    iconEl.style.justifyContent = 'center';
    iconEl.style.flexShrink = '0';
    if (typeof cfg.icon === 'string' && cfg.icon.startsWith('<svg')) {
      iconEl.innerHTML = cfg.icon;
    } else {
      iconEl.textContent = cfg.icon;
    }
    content.appendChild(iconEl);
  }

  if (!cfg.iconOnly) {
    const label = document.createElement('span');
    label.textContent = cfg.children ?? cfg.label ?? '';
    label.style.whiteSpace = 'nowrap';
    content.appendChild(label);
  }

  if (cfg.iconRight && !cfg.iconOnly) {
    const iconEl = document.createElement('span');
    iconEl.style.display = 'flex';
    iconEl.style.alignItems = 'center';
    iconEl.style.justifyContent = 'center';
    iconEl.style.flexShrink = '0';
    if (typeof cfg.iconRight === 'string' && cfg.iconRight.startsWith('<svg')) {
      iconEl.innerHTML = cfg.iconRight;
    } else {
      iconEl.textContent = cfg.iconRight;
    }
    content.appendChild(iconEl);
  }

  if (cfg.loading) {
    const spinner = document.createElement('span');
    spinner.innerHTML = '<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" style=\"animation: spin 0.8s linear infinite;\"><circle cx=\"12\" cy=\"12\" r=\"10\" stroke-opacity=\"0.25\"></circle><path d=\"M12 2a10 10 0 0 1 10 10\" stroke-opacity=\"1\"></path><style>@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style></svg>';
    content.prepend(spinner);
  }

  btn.appendChild(content);

  Object.assign(btn.style, {
    display: cfg.fullWidth ? 'flex' : 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: size.height,
    padding: '0 ' + size.paddingX,
    fontFamily: 'var(--ui-font-ui)',
    fontSize: size.fontSize,
    fontWeight: 'var(--ui-fontWeight-medium)',
    lineHeight: '1',
    color: variant.color,
    background: variant.background,
    border: variant.border,
    borderRadius: 'var(--ui-radius-md)',
    cursor: cfg.disabled || cfg.loading ? 'not-allowed' : 'pointer',
    opacity: cfg.disabled ? 0.5 : 1,
    transition: 'background var(--ui-transition-fast), border-color var(--ui-transition-fast), color var(--ui-transition-fast), opacity var(--ui-transition-fast), transform var(--ui-transition-fast)',
    outline: 'none',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  });

  btn.addEventListener('focus-visible', () => {
    btn.style.boxShadow = 'var(--ui-shadow-focus)';
  });
  btn.addEventListener('blur', () => {
    btn.style.boxShadow = 'none';
  });

  if (!cfg.disabled) {
    btn.addEventListener('mouseenter', () => {
      if (!cfg.disabled && !cfg.loading) btn.style.background = variant.backgroundHover;
    });
    btn.addEventListener('mouseleave', () => {
      if (!cfg.disabled && !cfg.loading) btn.style.background = variant.background;
    });
    btn.addEventListener('mousedown', () => {
      if (!cfg.disabled && !cfg.loading) {
        btn.style.background = variant.backgroundActive;
        btn.style.transform = 'scale(0.98)';
      }
    });
    btn.addEventListener('mouseup', () => {
      if (!cfg.disabled && !cfg.loading) {
        btn.style.background = variant.backgroundHover;
        btn.style.transform = 'scale(1)';
      }
    });
  }

  if (cfg.onClick) {
    btn.addEventListener('click', (e) => {
      if (!cfg.disabled && !cfg.loading) cfg.onClick(e);
    });
  }

  return {
    element: btn,
    setDisabled: (disabled) => {
      cfg.disabled = disabled;
      btn.disabled = disabled;
      btn.style.opacity = disabled ? 0.5 : 1;
      btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
    },
    setLoading: (loading) => {
      cfg.loading = loading;
      if (loading) {
        btn.setAttribute('aria-busy', 'true');
        btn.style.opacity = 0.7;
        btn.style.cursor = 'not-allowed';
      } else {
        btn.removeAttribute('aria-busy');
        btn.style.opacity = cfg.disabled ? 0.5 : 1;
        btn.style.cursor = cfg.disabled ? 'not-allowed' : 'pointer';
      }
    },
    setLabel: (label) => {
      const labelEl = btn.querySelector('span:not(:has(svg))');
      if (labelEl) labelEl.textContent = label;
    },
    destroy: () => btn.remove(),
  };
}

export const Button = {
  primary: (config) => createButton({ ...config, variant: 'primary' }),
  secondary: (config) => createButton({ ...config, variant: 'secondary' }),
  ghost: (config) => createButton({ ...config, variant: 'ghost' }),
  danger: (config) => createButton({ ...config, variant: 'danger' }),
  outline: (config) => createButton({ ...config, variant: 'outline' }),
  icon: (icon, config) => createButton({ ...config, icon, iconOnly: true, size: config?.size ?? 'md' }),
};