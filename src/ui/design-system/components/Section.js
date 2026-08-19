// src/ui/design-system/components/Section.js
/**
 * Section — Collapsible content section with title, optional badge, and animated toggle.
 */

import { token } from '../theme.js';
import { createButton } from './Button.js';

const DEFAULT_CONFIG = {
  id: 'section',
  title: 'Section',
  badge: null, // { label, variant }
  initiallyCollapsed: false,
  onToggle: null,
  content: null, // DOM node or array of nodes
};

export function createSection(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const root = document.createElement('div');
  root.id = cfg.id;
  root.style.width = '100%';
  root.style.border = '1px solid var(--ui-color-border-subtle)';
  root.style.borderRadius = 'var(--ui-radius-md)';
  root.style.background = 'var(--ui-color-bg-panel)';
  root.style.overflow = 'hidden';

  // Header
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.padding = 'var(--ui-space-sm) var(--ui-space-md)';
  header.style.background = 'var(--ui-color-bg-panel)';
  header.style.borderBottom = '1px solid var(--ui-color-border-subtle)';
  header.style.cursor = 'pointer';
  header.style.transition = 'background var(--ui-transition-fast)';

  header.addEventListener('mouseenter', () => { header.style.background = 'var(--ui-color-bg-panelHover)'; });
  header.addEventListener('mouseleave', () => { header.style.background = 'var(--ui-color-bg-panel)'; });

  const titleRow = document.createElement('div');
  titleRow.style.display = 'flex';
  titleRow.style.alignItems = 'center';
  titleRow.style.gap = 'var(--ui-space-sm)';

  const title = document.createElement('span');
  title.textContent = cfg.title;
  title.style.fontSize = 'var(--ui-typeScale-sm)';
  title.style.fontWeight = 'var(--ui-fontWeight-semibold)';
  title.style.color = 'var(--ui-color-text-primary)';
  title.style.fontFamily = 'var(--ui-font-ui)';
  titleRow.appendChild(title);

  if (cfg.badge) {
    const badge = document.createElement('span');
    badge.textContent = cfg.badge.label;
    badge.style.fontSize = 'var(--ui-typeScale-xs)';
    badge.style.fontWeight = 'var(--ui-fontWeight-medium)';
    badge.style.padding = '1px 6px';
    badge.style.borderRadius = 'var(--ui-radius-full)';
    const variant = cfg.badge.variant || 'neutral';
    const colors = {
      success: { bg: 'var(--ui-color-semantic-successBg)', text: 'var(--ui-color-semantic-success)' },
      warning: { bg: 'var(--ui-color-semantic-warningBg)', text: 'var(--ui-color-semantic-warning)' },
      danger: { bg: 'var(--ui-color-semantic-dangerBg)', text: 'var(--ui-color-semantic-danger)' },
      info: { bg: 'var(--ui-color-semantic-infoBg)', text: 'var(--ui-color-semantic-info)' },
      neutral: { bg: 'var(--ui-color-bg-input)', text: 'var(--ui-color-text-secondary)' },
    };
    const c = colors[variant] || colors.neutral;
    badge.style.background = c.bg;
    badge.style.color = c.text;
    titleRow.appendChild(badge);
  }

  const chevron = document.createElement('span');
  chevron.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  chevron.style.color = 'var(--ui-color-text-muted)';
  chevron.style.transition = 'transform var(--ui-transition-base)';
  chevron.style.flexShrink = '0';

  header.appendChild(titleRow);
  header.appendChild(chevron);

  // Content wrapper
  const contentWrapper = document.createElement('div');
  contentWrapper.style.overflow = 'hidden';
  contentWrapper.style.transition = 'max-height var(--ui-transition-slow), opacity var(--ui-transition-base)';

  const content = document.createElement('div');
  content.style.padding = 'var(--ui-space-md)';
  if (cfg.content) {
    if (Array.isArray(cfg.content)) {
      for (const node of cfg.content) content.appendChild(node);
    } else {
      content.appendChild(cfg.content);
    }
  }
  contentWrapper.appendChild(content);

  root.appendChild(header);
  root.appendChild(contentWrapper);

  let collapsed = cfg.initiallyCollapsed;
  if (collapsed) {
    contentWrapper.style.maxHeight = '0';
    contentWrapper.style.opacity = '0';
    chevron.style.transform = 'rotate(-90deg)';
  } else {
    contentWrapper.style.maxHeight = content.scrollHeight + 'px';
    contentWrapper.style.opacity = '1';
  }

  function toggle() {
    collapsed = !collapsed;
    if (collapsed) {
      contentWrapper.style.maxHeight = '0';
      contentWrapper.style.opacity = '0';
      chevron.style.transform = 'rotate(-90deg)';
    } else {
      contentWrapper.style.maxHeight = content.scrollHeight + 'px';
      contentWrapper.style.opacity = '1';
      chevron.style.transform = 'rotate(0deg)';
    }
    cfg.onToggle?.(collapsed);
  }

  header.addEventListener('click', toggle);

  return {
    element: root,
    content,
    header,
    title,
    toggle,
    collapse: () => { if (!collapsed) toggle(); },
    expand: () => { if (collapsed) toggle(); },
    isCollapsed: () => collapsed,
    setContent: (node) => {
      content.innerHTML = '';
      if (Array.isArray(node)) {
        for (const n of node) content.appendChild(n);
      } else {
        content.appendChild(node);
      }
      if (!collapsed) contentWrapper.style.maxHeight = content.scrollHeight + 'px';
    },
    setBadge: (badge) => {
      // Re-render badge would need more complex implementation
    },
    destroy: () => {
      header.removeEventListener('click', toggle);
      root.remove();
    },
  };
}