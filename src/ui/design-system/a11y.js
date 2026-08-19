// src/ui/design-system/a11y.js
/**
 * Accessibility utilities — ARIA helpers, focus management, keyboard navigation.
 */

import { token } from './theme.js';

/** Generate unique IDs for ARIA relationships */
let idCounter = 0;
export function generateId(prefix = 'ui') {
  return `${prefix}-${++idCounter}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Set up focus trap for modal/dialog */
export function createFocusTrap(container) {
  let focusableElements = [];
  let firstFocusable = null;
  let lastFocusable = null;

  function updateFocusableElements() {
    focusableElements = Array.from(container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(el => !el.disabled && el.offsetParent !== null);
    firstFocusable = focusableElements[0];
    lastFocusable = focusableElements[focusableElements.length - 1];
  }

  function handleTab(e) {
    if (e.key !== 'Tab') return;
    updateFocusableElements();
    if (focusableElements.length === 0) return;

    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable?.focus();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable?.focus();
      }
    }
  }

  function activate() {
    updateFocusableElements();
    container.addEventListener('keydown', handleTab);
    firstFocusable?.focus();
  }

  function deactivate() {
    container.removeEventListener('keydown', handleTab);
  }

  return { activate, deactivate, updateFocusableElements };
}

/** Announce to screen readers via live region */
let liveRegion = null;
function getLiveRegion() {
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.className = 'ui-sr-only';
    document.body.appendChild(liveRegion);
  }
  return liveRegion;
}

export function announce(message, priority = 'polite') {
  const region = getLiveRegion();
  region.setAttribute('aria-live', priority);
  region.textContent = '';
  // Force reflow
  region.offsetHeight;
  region.textContent = message;
}

/** Keyboard navigation helpers */
export const Key = {
  Enter: 'Enter',
  Space: ' ',
  Escape: 'Escape',
  Tab: 'Tab',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Home: 'Home',
  End: 'End',
};

export function isActivationKey(event) {
  return event.key === Key.Enter || event.key === Key.Space;
}

export function isNavigationKey(event) {
  return [Key.ArrowUp, Key.ArrowDown, Key.ArrowLeft, Key.ArrowRight, Key.Home, Key.End].includes(event.key);
}

/** Focus visible styles (polyfill for :focus-visible) */
export function applyFocusVisibleStyles(element) {
  element.addEventListener('focus', () => {
    if (element.matches(':focus-visible')) {
      element.style.outline = '2px solid var(--ui-color-accent-primary)';
      element.style.outlineOffset = '2px';
    }
  });
  element.addEventListener('blur', () => {
    element.style.outline = '';
    element.style.outlineOffset = '';
  });
}

/** Skip link for main content */
export function createSkipLink(targetId = 'main-content') {
  const link = document.createElement('a');
  link.href = `#${targetId}`;
  link.textContent = 'Skip to main content';
  link.className = 'ui-sr-only';
  link.style.position = 'absolute';
  link.style.top = '-100%';
  link.style.left = '0';
  link.style.padding = 'var(--ui-space-md)';
  link.style.background = 'var(--ui-color-accent-primary)';
  link.style.color = 'var(--ui-color-text-inverse)';
  link.style.zIndex = token('zIndex.tooltip');
  link.style.transition = 'top var(--ui-transition-fast)';
  link.addEventListener('focus', () => { link.style.top = '0'; });
  link.addEventListener('blur', () => { link.style.top = '-100%'; });
  return link;
}

/** Reduced motion checker */
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** High contrast checker */
export function prefersHighContrast() {
  return window.matchMedia('(prefers-contrast: more)').matches;
}

/** Add keyboard support to custom elements */
export function addKeyboardSupport(element, handlers) {
  element.addEventListener('keydown', (e) => {
    const handler = handlers[e.key];
    if (handler) handler(e);
  });
}

/** ARIA attribute helpers */
export const Aria = {
  /** Set expanded state */
  setExpanded: (element, expanded) => {
    element.setAttribute('aria-expanded', expanded);
  },
  /** Set selected state */
  setSelected: (element, selected) => {
    element.setAttribute('aria-selected', selected);
  },
  /** Set disabled state */
  setDisabled: (element, disabled) => {
    element.setAttribute('aria-disabled', disabled);
    if (disabled) element.setAttribute('tabindex', '-1');
    else element.removeAttribute('tabindex');
  },
  /** Set hidden state */
  setHidden: (element, hidden) => {
    element.setAttribute('aria-hidden', hidden);
  },
  /** Set controls relationship */
  setControls: (element, controlledId) => {
    element.setAttribute('aria-controls', controlledId);
  },
  /** Set labelledby relationship */
  setLabelledBy: (element, labelId) => {
    element.setAttribute('aria-labelledby', labelId);
  },
  /** Set describedby relationship */
  setDescribedBy: (element, descId) => {
    element.setAttribute('aria-describedby', descId);
  },
  /** Set live region */
  setLive: (element, politeness = 'polite') => {
    element.setAttribute('aria-live', politeness);
  },
  /** Set current value for range widgets */
  setValueNow: (element, value) => {
    element.setAttribute('aria-valuenow', value);
  },
  setValueMin: (element, min) => {
    element.setAttribute('aria-valuemin', min);
  },
  setValueMax: (element, max) => {
    element.setAttribute('aria-valuemax', max);
  },
  setValueText: (element, text) => {
    element.setAttribute('aria-valuetext', text);
  },
};

/** Create a visually hidden element for screen readers */
export function createSrOnly(text) {
  const el = document.createElement('span');
  el.className = 'ui-sr-only';
  el.textContent = text;
  return el;
}