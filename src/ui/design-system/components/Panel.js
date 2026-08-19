// src/ui/design-system/components/Panel.js
/**
 * Panel — Base panel component with header, collapse, drag-to-move, and dock/undock.
 * Composable: pass children as DOM nodes or use as wrapper for other components.
 */

import { token } from '../theme.js';

const DEFAULT_CONFIG = {
  id: 'panel',
  title: 'Panel',
  anchor: 'top-right',
  collapsible: true,
  draggable: true,
  initiallyCollapsed: false,
  width: null,
  minWidth: null,
  maxWidth: null,
  zIndex: null,
  onCollapseChange: null,
  onPositionChange: null,
  onClose: null,
};

const ANCHORS = {
  'top-left': { top: 'var(--ui-space-md)', left: 'var(--ui-space-md)', right: 'auto', bottom: 'auto', transform: 'none' },
  'top-right': { top: 'var(--ui-space-md)', right: 'var(--ui-space-md)', left: 'auto', bottom: 'auto', transform: 'none' },
  'bottom-left': { bottom: 'var(--ui-space-md)', left: 'var(--ui-space-md)', top: 'auto', right: 'auto', transform: 'none' },
  'bottom-right': { bottom: 'var(--ui-space-md)', right: 'var(--ui-space-md)', top: 'auto', left: 'auto', transform: 'none' },
  'top-center': { top: 'var(--ui-space-md)', left: '50%', right: 'auto', bottom: 'auto', transform: 'translateX(-50%)' },
  'bottom-center': { bottom: 'var(--ui-space-md)', left: '50%', right: 'auto', top: 'auto', transform: 'translateX(-50%)' },
};

export function createPanel(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const panelWidth = cfg.width ?? token('panel.defaultWidth');
  const panelMinWidth = cfg.minWidth ?? token('panel.minWidth');
  const panelMaxWidth = cfg.maxWidth ?? token('panel.maxWidth');
  const panelZIndex = cfg.zIndex ?? token('zIndex.panel');

  const root = document.createElement('div');
  root.id = cfg.id;
  root.dataset.panelId = cfg.id;
  Object.assign(root.style, {
    position: 'fixed',
    zIndex: panelZIndex,
    width: `${panelWidth}px`,
    minWidth: `${panelMinWidth}px`,
    maxWidth: `${panelMaxWidth}px`,
    background: 'var(--ui-color-bg-panel)',
    border: '1px solid var(--ui-color-border-default)',
    borderRadius: 'var(--ui-radius-lg)',
    boxShadow: 'var(--ui-shadow-lg)',
    fontFamily: 'var(--ui-font-ui)',
    fontSize: 'var(--ui-typeScale-base)',
    lineHeight: 'var(--ui-lineHeight-normal)',
    color: 'var(--ui-color-text-primary)',
    overflow: 'hidden',
    transition: 'box-shadow var(--ui-transition-base), transform var(--ui-transition-base)',
    pointerEvents: 'auto',
    userSelect: 'none',
    contain: 'layout style paint',
  });

  const anchorStyle = ANCHORS[cfg.anchor] ?? ANCHORS['top-right'];
  Object.assign(root.style, anchorStyle);

  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 'var(--ui-panel-headerHeight)',
    padding: 'var(--ui-space-sm) var(--ui-space-md)',
    background: 'var(--ui-color-bg-panel)',
    borderBottom: '1px solid var(--ui-color-border-subtle)',
    cursor: cfg.draggable ? 'grab' : 'default',
    flexShrink: 0,
  });

  const titleEl = document.createElement('div');
  titleEl.textContent = cfg.title;
  Object.assign(titleEl.style, {
    fontSize: 'var(--ui-typeScale-sm)',
    fontWeight: 'var(--ui-fontWeight-semibold)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--ui-color-text-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: '1',
    minWidth: '0',
    lineHeight: 'var(--ui-lineHeight-normal)',
  });

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = 'var(--ui-space-xs)';

  let collapsed = cfg.initiallyCollapsed;

  let collapseBtn = null;
  if (cfg.collapsible) {
    collapseBtn = createIconButton({
      'aria-label': 'Collapse panel',
      title: 'Collapse',
      icon: collapsed ? 'chevron-down' : 'chevron-up',
      onClick: () => toggleCollapse(),
    });
    actions.appendChild(collapseBtn);
  }

  if (cfg.onClose) {
    const closeBtn = createIconButton({
      'aria-label': 'Close panel',
      title: 'Close',
      icon: 'x',
      onClick: () => cfg.onClose?.(),
    });
    actions.appendChild(closeBtn);
  }

  header.appendChild(titleEl);
  header.appendChild(actions);

  const contentWrapper = document.createElement('div');
  Object.assign(contentWrapper.style, {
    overflow: 'hidden',
    transition: `max-height var(--ui-panel-collapseAnimation), opacity var(--ui-panel-collapseAnimation)`,
    maxHeight: collapsed ? '0' : 'none',
    opacity: collapsed ? '0' : '1',
  });

  const content = document.createElement('div');
  content.style.padding = 'var(--ui-space-md)';
  contentWrapper.appendChild(content);

  root.appendChild(header);
  root.appendChild(contentWrapper);

  let dragData = null;
  if (cfg.draggable) {
    header.addEventListener('pointerdown', onDragStart);
  }

  function onDragStart(e) {
    if (e.target !== header && !titleEl.contains(e.target) && e.button !== 0) return;
    e.preventDefault();
    header.style.cursor = 'grabbing';
    dragData = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: parseFloat(root.style.left) || 0,
      startTop: parseFloat(root.style.top) || 0,
      startRight: parseFloat(root.style.right) || 0,
      startBottom: parseFloat(root.style.bottom) || 0,
      anchor: cfg.anchor,
    };
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);
    root.setPointerCapture(e.pointerId);
  }

  function onDragMove(e) {
    if (!dragData) return;
    const dx = e.clientX - dragData.startX;
    const dy = e.clientY - dragData.startY;

    const anchor = dragData.anchor;
    if (anchor.includes('left')) {
      const newLeft = dragData.startLeft + dx;
      root.style.left = `${newLeft}px`;
      root.style.right = 'auto';
    } else if (anchor.includes('right')) {
      const newRight = dragData.startRight - dx;
      root.style.right = `${newRight}px`;
      root.style.left = 'auto';
    }

    if (anchor.includes('top')) {
      const newTop = dragData.startTop + dy;
      root.style.top = `${newTop}px`;
      root.style.bottom = 'auto';
    } else if (anchor.includes('bottom')) {
      const newBottom = dragData.startBottom - dy;
      root.style.bottom = `${newBottom}px`;
      root.style.top = 'auto';
    }

    cfg.onPositionChange?.({ left: root.style.left, top: root.style.top, right: root.style.right, bottom: root.style.bottom });
  }

  function onDragEnd(e) {
    if (!dragData) return;
    header.style.cursor = 'grab';
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);
    root.releasePointerCapture(e.pointerId);
    dragData = null;
  }

  function toggleCollapse() {
    collapsed = !collapsed;
    contentWrapper.style.maxHeight = collapsed ? '0' : 'none';
    contentWrapper.style.opacity = collapsed ? '0' : '1';
    if (collapseBtn) {
      collapseBtn.setAttribute('aria-label', collapsed ? 'Expand panel' : 'Collapse panel');
      collapseBtn.title = collapsed ? 'Expand' : 'Collapse';
      collapseBtn.querySelector('svg').innerHTML = collapsed
        ? '<polyline points="6 9 12 15 18 9"></polyline>'
        : '<polyline points="18 15 12 9 6 15"></polyline>';
    }
    cfg.onCollapseChange?.(collapsed);
  }

  function setCollapsed(next) {
    if (next !== collapsed) toggleCollapse();
  }

  function isCollapsed() {
    return collapsed;
  }

  document.body.appendChild(root);
  return {
    element: root,
    content,
    header,
    titleEl,
    collapse: setCollapsed,
    expand: () => setCollapsed(false),
    toggle: toggleCollapse,
    isCollapsed,
    setTitle: (text) => { titleEl.textContent = text; },
    destroy: () => {
      if (cfg.draggable) header.removeEventListener('pointerdown', onDragStart);
      root.remove();
    },
  };
}

function createIconButton({ 'aria-label': ariaLabel, title, icon, onClick }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', ariaLabel);
  btn.title = title;
  btn.innerHTML = getIconSvg(icon);
  Object.assign(btn.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: 'var(--ui-color-text-secondary)',
    borderRadius: 'var(--ui-radius-sm)',
    cursor: 'pointer',
    transition: 'background var(--ui-transition-fast), color var(--ui-transition-fast)',
    flexShrink: 0,
  });
  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'var(--ui-color-bg-inputHover)';
    btn.style.color = 'var(--ui-color-text-primary)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'transparent';
    btn.style.color = 'var(--ui-color-text-secondary)';
  });
  btn.addEventListener('click', onClick);
  return btn;
}

function getIconSvg(name) {
  const icons = {
    'chevron-up': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>',
    'chevron-down': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>',
    'x': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    'gear': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>',
  };
  return icons[name] ?? icons['x'];
}