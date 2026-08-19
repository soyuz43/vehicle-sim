// src/ui/design-system/layout/Responsive.js
/**
 * Responsive — Breakpoint utilities and mobile-first responsive helpers.
 */

import { token } from '../theme.js';

/** Current breakpoint state */
let currentBreakpoint = 'xl';
let listeners = [];
let mediaQueryLists = {};

/** Initialize responsive listeners */
export function initResponsive() {
  if (typeof window === 'undefined') return;

  const breakpoints = {
    sm: token('breakpoint.sm'),
    md: token('breakpoint.md'),
    lg: token('breakpoint.lg'),
    xl: token('breakpoint.xl'),
    '2xl': token('breakpoint.2xl'),
  };

  // Create media query lists
  const queries = {
    sm: window.matchMedia(`(min-width: ${breakpoints.sm}px)`),
    md: window.matchMedia(`(min-width: ${breakpoints.md}px)`),
    lg: window.matchMedia(`(min-width: ${breakpoints.lg}px)`),
    xl: window.matchMedia(`(min-width: ${breakpoints.xl}px)`),
    '2xl': window.matchMedia(`(min-width: ${breakpoints['2xl']}px)`),
  };

  function updateBreakpoint() {
    let bp = 'sm';
    if (queries['2xl'].matches) bp = '2xl';
    else if (queries.xl.matches) bp = 'xl';
    else if (queries.lg.matches) bp = 'lg';
    else if (queries.md.matches) bp = 'md';
    else bp = 'sm';

    if (bp !== currentBreakpoint) {
      currentBreakpoint = bp;
      document.documentElement.setAttribute('data-ui-breakpoint', bp);
      listeners.forEach(fn => fn(bp));
    }
  }

  // Initial check
  updateBreakpoint();

  // Listen for changes
  Object.values(queries).forEach(mql => {
    mql.addEventListener('change', updateBreakpoint);
    mediaQueryLists[mql.media] = mql;
  });

  return {
    destroy: () => {
      Object.values(queries).forEach(mql => {
        mql.removeEventListener('change', updateBreakpoint);
      });
    }
  };
}

/** Get current breakpoint */
export function getBreakpoint() {
  return currentBreakpoint;
}

/** Check if current breakpoint is at least the given size */
export function isAtLeast(breakpoint) {
  const order = ['sm', 'md', 'lg', 'xl', '2xl'];
  const currentIdx = order.indexOf(currentBreakpoint);
  const targetIdx = order.indexOf(breakpoint);
  return currentIdx >= targetIdx;
}

/** Check if current breakpoint is at most the given size */
export function isAtMost(breakpoint) {
  const order = ['sm', 'md', 'lg', 'xl', '2xl'];
  const currentIdx = order.indexOf(currentBreakpoint);
  const targetIdx = order.indexOf(breakpoint);
  return currentIdx <= targetIdx;
}

/** Subscribe to breakpoint changes */
export function onBreakpointChange(callback) {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter(fn => fn !== callback);
  };
}

/** Apply styles conditionally based on breakpoint */
export function createResponsiveStyles(stylesByBreakpoint) {
  const styleEl = document.createElement('style');
  let css = '';

  for (const [bp, styles] of Object.entries(stylesByBreakpoint)) {
    const bpValue = token(`breakpoint.${bp}`);
    if (bp === 'sm') {
      // Base styles (mobile-first)
      css += `${styles}\n`;
    } else {
      css += `@media (min-width: ${bpValue}px) { ${styles} }\n`;
    }
  }

  styleEl.textContent = css;
  return styleEl;
}

/** Hook for responsive panel behavior (mobile bottom sheet) */
export function useMobileBottomSheet(panel, options = {}) {
  const { breakpoint = 'md', onOpen, onClose } = options;
  let isMobile = !isAtLeast(breakpoint);
  let wasOpen = false;

  function check() {
    const nowMobile = !isAtLeast(breakpoint);
    if (nowMobile !== isMobile) {
      isMobile = nowMobile;
      if (isMobile) {
        // Switch to bottom sheet mode
        panel.element.style.position = 'fixed';
        panel.element.style.left = '0';
        panel.element.style.right = '0';
        panel.element.style.bottom = '0';
        panel.element.style.top = 'auto';
        panel.element.style.transform = 'translateY(100%)';
        panel.element.style.borderRadius = 'var(--ui-radius-xl) var(--ui-radius-xl) 0 0';
        panel.element.style.boxShadow = 'var(--ui-shadow-xl)';
        panel.element.style.maxWidth = 'none';
        panel.element.style.width = '100%';
        panel.element.style.zIndex = token('zIndex.modal');
        panel.element.style.transition = 'transform var(--ui-transition-slow)';
        // Add drag handle
        if (!panel.element.querySelector('[data-drag-handle]')) {
          const handle = document.createElement('div');
          handle.setAttribute('data-drag-handle', 'true');
          handle.style.width = '40px';
          handle.style.height = '4px';
          handle.style.background = 'var(--ui-color-border-default)';
          handle.style.borderRadius = 'var(--ui-radius-full)';
          handle.style.margin = 'var(--ui-space-sm) auto';
          handle.style.cursor = 'grab';
          panel.element.insertBefore(handle, panel.element.firstChild);
        }
        if (wasOpen) openSheet();
      } else {
        // Restore desktop position
        panel.element.style.transform = '';
        panel.element.style.borderRadius = '';
        panel.element.style.maxWidth = '';
        panel.element.style.width = '';
        panel.element.style.zIndex = token('zIndex.panel');
        const handle = panel.element.querySelector('[data-drag-handle]');
        handle?.remove();
      }
    }
  }

  function openSheet() {
    panel.element.style.transform = 'translateY(0)';
    onOpen?.();
  }

  function closeSheet() {
    if (isMobile) panel.element.style.transform = 'translateY(100%)';
    onClose?.();
  }

  const unsubscribe = onBreakpointChange(check);
  check();

  return {
    open: openSheet,
    close: closeSheet,
    toggle: () => (panel.element.style.transform === 'translateY(0)' ? closeSheet() : openSheet()),
    destroy: unsubscribe,
  };
}

/** Reduced motion preference */
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** High contrast preference */
export function prefersHighContrast() {
  return window.matchMedia('(prefers-contrast: more)').matches;
}