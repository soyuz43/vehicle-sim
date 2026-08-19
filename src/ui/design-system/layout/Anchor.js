// src/ui/design-system/layout/Anchor.js
/**
 * Anchor — Position management for floating panels.
 * Provides consistent anchoring with responsive behavior.
 */

import { token } from '../theme.js';

/** Anchor position presets with CSS custom properties */
export const anchors = {
  'top-left': {
    top: 'var(--ui-space-md)',
    left: 'var(--ui-space-md)',
    right: 'auto',
    bottom: 'auto',
    transform: 'none',
  },
  'top-right': {
    top: 'var(--ui-space-md)',
    right: 'var(--ui-space-md)',
    left: 'auto',
    bottom: 'auto',
    transform: 'none',
  },
  'bottom-left': {
    bottom: 'var(--ui-space-md)',
    left: 'var(--ui-space-md)',
    top: 'auto',
    right: 'auto',
    transform: 'none',
  },
  'bottom-right': {
    bottom: 'var(--ui-space-md)',
    right: 'var(--ui-space-md)',
    top: 'auto',
    left: 'auto',
    transform: 'none',
  },
  'top-center': {
    top: 'var(--ui-space-md)',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    transform: 'translateX(-50%)',
  },
  'bottom-center': {
    bottom: 'var(--ui-space-md)',
    left: '50%',
    right: 'auto',
    top: 'auto',
    transform: 'translateX(-50%)',
  },
  'center': {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    transform: 'translate(-50%, -50%)',
  },
};

/** Apply anchor styles to an element */
export function applyAnchor(element, anchorName) {
  const anchor = anchors[anchorName] ?? anchors['top-right'];
  Object.assign(element.style, {
    position: 'fixed',
    ...anchor,
  });
  return anchor;
}

/** Get anchor configuration */
export function getAnchor(anchorName) {
  return anchors[anchorName] ?? anchors['top-right'];
}

/** Panel stack manager — manages multiple panels at same anchor */
export class PanelStack {
  constructor(anchorName = 'top-right', gap = 'var(--ui-space-md)') {
    this.anchorName = anchorName;
    this.gap = gap;
    this.panels = [];
    this.container = null;
    this._initContainer();
  }

  _initContainer() {
    this.container = document.createElement('div');
    this.container.style.position = 'fixed';
    this.container.style.display = 'flex';
    this.container.style.flexDirection = this._isVertical() ? 'column' : 'row';
    this.container.style.gap = this.gap;
    this.container.style.pointerEvents = 'none';
    this.container.style.zIndex = token('zIndex.panel');
    applyAnchor(this.container, this.anchorName);
    document.body.appendChild(this.container);
  }

  _isVertical() {
    return this.anchorName.includes('left') || this.anchorName.includes('right') || this.anchorName === 'center';
  }

  addPanel(panel) {
    if (!panel.element) return;
    panel.element.style.pointerEvents = 'auto';
    this.panels.push(panel);
    this.container.appendChild(panel.element);
    this._reflow();
    return panel;
  }

  removePanel(panel) {
    const idx = this.panels.indexOf(panel);
    if (idx >= 0) {
      this.panels.splice(idx, 1);
      panel.element.remove();
      this._reflow();
    }
  }

  _reflow() {
    // Panels auto-stack via flexbox
  }

  setAnchor(anchorName) {
    this.anchorName = anchorName;
    applyAnchor(this.container, anchorName);
    this.container.style.flexDirection = this._isVertical() ? 'column' : 'row';
  }

  destroy() {
    for (const panel of this.panels) {
      panel.element.remove();
    }
    this.container.remove();
    this.panels = [];
  }
}

/** Create a panel stack */
export function createPanelStack(anchorName, gap) {
  return new PanelStack(anchorName, gap);
}