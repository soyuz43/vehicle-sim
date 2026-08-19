// src/ui/design-system/components/Badge.js
/**
 * Badge — Semantic status indicator (dot + label, or pill).
 */

import { token } from '../theme.js';

const VARIANTS = {
  success: { bg: 'var(--ui-color-semantic-successBg)', border: 'var(--ui-color-semantic-successBorder)', text: 'var(--ui-color-semantic-success)', dot: 'var(--ui-color-semantic-success)' },
  warning: { bg: 'var(--ui-color-semantic-warningBg)', border: 'var(--ui-color-semantic-warningBorder)', text: 'var(--ui-color-semantic-warning)', dot: 'var(--ui-color-semantic-warning)' },
  danger: { bg: 'var(--ui-color-semantic-dangerBg)', border: 'var(--ui-color-semantic-dangerBorder)', text: 'var(--ui-color-semantic-danger)', dot: 'var(--ui-color-semantic-danger)' },
  info: { bg: 'var(--ui-color-semantic-infoBg)', border: 'var(--ui-color-semantic-infoBorder)', text: 'var(--ui-color-semantic-info)', dot: 'var(--ui-color-semantic-info)' },
  neutral: { bg: 'var(--ui-color-bg-input)', border: 'var(--ui-color-border-default)', text: 'var(--ui-color-text-secondary)', dot: 'var(--ui-color-text-muted)' },
  traction: {
    grounded: { bg: 'var(--ui-color-traction-groundedBg)', border: 'var(--ui-color-traction-groundedBorder)', text: 'var(--ui-color-traction-grounded)', dot: 'var(--ui-color-traction-grounded)' },
    slip: { bg: 'var(--ui-color-traction-slipBg)', border: 'var(--ui-color-traction-slipBorder)', text: 'var(--ui-color-traction-slip)', dot: 'var(--ui-color-traction-slip)' },
    air: { bg: 'var(--ui-color-traction-airBg)', border: 'var(--ui-color-traction-airBorder)', text: 'var(--ui-color-traction-air)', dot: 'var(--ui-color-traction-air)' },
    unavailable: { bg: 'var(--ui-color-bg-input)', border: 'var(--ui-color-border-subtle)', text: 'var(--ui-color-traction-unavailable)', dot: 'var(--ui-color-text-muted)' },
  },
};

const SIZES = {
  sm: { fontSize: 'var(--ui-typeScale-xs)', paddingX: '6px', paddingY: '2px', gap: '4px', dotSize: '6px' },
  md: { fontSize: 'var(--ui-typeScale-sm)', paddingX: '8px', paddingY: '3px', gap: '6px', dotSize: '8px' },
  lg: { fontSize: 'var(--ui-typeScale-base)', paddingX: '10px', paddingY: '4px', gap: '8px', dotSize: '10px' },
};

const DEFAULT_CONFIG = {
  variant: 'neutral',
  size: 'md',
  label: '',
  showDot: true,
  pill: false, // pill style (no dot, rounded full)
  onClick: null,
};

export function createBadge(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const variantConfig = VARIANTS[cfg.variant] ?? VARIANTS.neutral;
  const sizeConfig = SIZES[cfg.size] ?? SIZES.md;

  const root = document.createElement(cfg.onClick ? 'button' : 'span');
  root.style.display = 'inline-flex';
  root.style.alignItems = 'center';
  root.style.gap = `${sizeConfig.gap}px`;
  root.style.padding = `${sizeConfig.paddingY}px ${sizeConfig.paddingX}px`;
  root.style.fontFamily = 'var(--ui-font-ui)';
  root.style.fontSize = sizeConfig.fontSize;
  root.style.fontWeight = 'var(--ui-fontWeight-medium)';
  root.style.lineHeight = '1';
  root.style.color = variantConfig.text;
  root.style.background = variantConfig.bg;
  root.style.border = cfg.pill ? 'none' : `1px solid ${variantConfig.border}`;
  root.style.borderRadius = cfg.pill ? 'var(--ui-radius-full)' : 'var(--ui-radius-md)';
  root.style.whiteSpace = 'nowrap';
  root.style.userSelect = 'none';

  if (cfg.onClick) {
    root.type = 'button';
    root.style.cursor = 'pointer';
    root.style.transition = 'background var(--ui-transition-fast), border-color var(--ui-transition-fast)';
    root.addEventListener('click', cfg.onClick);
  }

  if (cfg.showDot && !cfg.pill) {
    const dot = document.createElement('span');
    dot.style.width = sizeConfig.dotSize;
    dot.style.height = sizeConfig.dotSize;
    dot.style.borderRadius = 'var(--ui-radius-full)';
    dot.style.background = variantConfig.dot;
    dot.style.flexShrink = '0';
    root.appendChild(dot);
  }

  const label = document.createElement('span');
  label.textContent = cfg.label;
  root.appendChild(label);

  return {
    element: root,
    setLabel: (text) => { label.textContent = text; },
    setVariant: (variant) => {
      const v = VARIANTS[variant] ?? VARIANTS.neutral;
      root.style.color = v.text;
      root.style.background = v.bg;
      if (!cfg.pill) root.style.borderColor = v.border;
      const dot = root.querySelector('span:first-child');
      if (dot && dot !== label) dot.style.background = v.dot;
    },
    destroy: () => root.remove(),
  };
}

/** Convenience creators */
export const Badge = {
  success: (label, config) => createBadge({ ...config, variant: 'success', label }),
  warning: (label, config) => createBadge({ ...config, variant: 'warning', label }),
  danger: (label, config) => createBadge({ ...config, variant: 'danger', label }),
  info: (label, config) => createBadge({ ...config, variant: 'info', label }),
  tractionGrounded: (label, config) => createBadge({ ...config, variant: 'traction.grounded', label }),
  tractionSlip: (label, config) => createBadge({ ...config, variant: 'traction.slip', label }),
  tractionAir: (label, config) => createBadge({ ...config, variant: 'traction.air', label }),
};