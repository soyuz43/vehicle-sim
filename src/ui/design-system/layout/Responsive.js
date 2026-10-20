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

const MOBILE_PANEL_NAV_HEIGHT = 56;
const PANEL_POSITION_STYLE_PROPERTIES = [
  'position', 'top', 'right', 'bottom', 'left', 'transform', 'width', 'maxWidth',
  'maxHeight', 'zIndex', 'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius',
  'borderBottomLeftRadius', 'borderBottomRightRadius', 'boxShadow', 'transition',
];

let mobilePanelNavigation = null;
let mobilePanelEntries = [];
let activeMobilePanelEntry = null;

function getMobilePanelNavigation() {
  if (mobilePanelNavigation || typeof document === 'undefined') return mobilePanelNavigation;

  const navigation = document.createElement('nav');
  navigation.id = 'ui-mobile-panel-navigation';
  navigation.setAttribute('aria-label', 'Simulation panels');
  Object.assign(navigation.style, {
    position: 'fixed',
    display: 'none',
    alignItems: 'stretch',
    gap: 'var(--ui-space-xs)',
    left: 'var(--ui-space-sm)',
    right: 'var(--ui-space-sm)',
    bottom: 'max(var(--ui-space-sm), env(safe-area-inset-bottom, 0px))',
    padding: 'var(--ui-space-xs)',
    background: 'var(--ui-color-bg-panel)',
    border: '1px solid var(--ui-color-border-default)',
    borderRadius: 'var(--ui-radius-lg)',
    boxShadow: 'var(--ui-shadow-lg)',
    zIndex: token('zIndex.debug'),
  });
  document.body.appendChild(navigation);
  mobilePanelNavigation = navigation;
  return navigation;
}

function setActiveMobilePanel(entry) {
  if (activeMobilePanelEntry === entry) {
    entry.sheet.close();
    entry.button.setAttribute('aria-expanded', 'false');
    activeMobilePanelEntry = null;
    return;
  }

  if (activeMobilePanelEntry) {
    activeMobilePanelEntry.sheet.close();
    activeMobilePanelEntry.button.setAttribute('aria-expanded', 'false');
  }

  activeMobilePanelEntry = entry;
  entry.sheet.open();
  entry.button.setAttribute('aria-expanded', 'true');
}

function closeActiveMobilePanel() {
  if (!activeMobilePanelEntry) return;
  activeMobilePanelEntry.sheet.close();
  activeMobilePanelEntry.button.setAttribute('aria-expanded', 'false');
  activeMobilePanelEntry = null;
}

function registerMobilePanel(panel, sheet) {
  const navigation = getMobilePanelNavigation();
  if (!navigation) return () => {};

  const label = panel.titleEl?.textContent ?? panel.element.id;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-controls', panel.element.id);
  button.setAttribute('aria-expanded', 'false');
  Object.assign(button.style, {
    flex: '1 1 0',
    minWidth: '0',
    minHeight: '44px',
    padding: 'var(--ui-space-xs) var(--ui-space-sm)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: 'var(--ui-color-text-primary)',
    background: 'var(--ui-color-bg-input)',
    border: '1px solid var(--ui-color-border-default)',
    borderRadius: 'var(--ui-radius-md)',
    font: 'inherit',
    cursor: 'pointer',
  });
  const entry = { button, panel, sheet };
  button.addEventListener('click', () => setActiveMobilePanel(entry));
  navigation.appendChild(button);
  mobilePanelEntries.push(entry);

  return () => {
    if (activeMobilePanelEntry === entry) closeActiveMobilePanel();
    button.remove();
    mobilePanelEntries = mobilePanelEntries.filter((item) => item !== entry);
    if (mobilePanelEntries.length === 0) {
      mobilePanelNavigation.remove();
      mobilePanelNavigation = null;
    }
  };
}

/** Hook for responsive panel behavior (mobile bottom sheet) */
export function useMobileBottomSheet(panel, options = {}) {
  const { breakpoint = 'md', onOpen, onClose } = options;
  const desktopStyles = {};
  const desktopContentPaddingBottom = panel.content.style.paddingBottom;
  const wasDraggable = panel.isDraggable?.() ?? false;
  let isMobile = false;
  let isOpen = false;

  function saveDesktopStyles() {
    for (const property of PANEL_POSITION_STYLE_PROPERTIES) {
      desktopStyles[property] = panel.element.style[property];
    }
  }

  function enterMobileMode() {
    saveDesktopStyles();
    isMobile = true;
    panel.setDraggable?.(false);
    Object.assign(panel.element.style, {
      position: 'fixed',
      left: 'var(--ui-space-sm)',
      right: 'var(--ui-space-sm)',
      top: 'auto',
      bottom: `calc(${MOBILE_PANEL_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
      transform: `translateY(calc(100% + ${MOBILE_PANEL_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px)))`,
      borderRadius: 'var(--ui-radius-xl)',
      boxShadow: 'var(--ui-shadow-xl)',
      maxWidth: 'none',
      maxHeight: 'calc(100vh - 80px)',
      width: 'auto',
      zIndex: token('zIndex.modal'),
      transition: 'transform var(--ui-transition-slow)',
    });
    panel.element.style.maxHeight = 'calc(100dvh - 80px)';
    panel.content.style.paddingBottom = `calc(var(--ui-space-xl) + ${MOBILE_PANEL_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`;
    panel.element.inert = true;
    panel.element.setAttribute('aria-hidden', 'true');
    isOpen = false;
  }

  function leaveMobileMode() {
    isMobile = false;
    isOpen = false;
    Object.assign(panel.element.style, desktopStyles);
    panel.content.style.paddingBottom = desktopContentPaddingBottom;
    panel.element.inert = false;
    panel.element.setAttribute('aria-hidden', 'false');
    panel.setDraggable?.(wasDraggable);
  }

  function check() {
    const nowMobile = !isAtLeast(breakpoint);
    if (nowMobile !== isMobile) {
      if (nowMobile) enterMobileMode();
      else {
        closeActiveMobilePanel();
        leaveMobileMode();
      }
    }
    if (mobilePanelNavigation) mobilePanelNavigation.style.display = nowMobile ? 'flex' : 'none';
  }

  function openSheet() {
    if (!isMobile) return;
    isOpen = true;
    panel.element.inert = false;
    panel.element.setAttribute('aria-hidden', 'false');
    panel.element.style.transform = 'translateY(0)';
    panel.header?.querySelector('button')?.focus();
    onOpen?.();
  }

  function closeSheet() {
    if (isMobile) {
      panel.element.style.transform = `translateY(calc(100% + ${MOBILE_PANEL_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px)))`;
      panel.element.inert = true;
      panel.element.setAttribute('aria-hidden', 'true');
    }
    isOpen = false;
    onClose?.();
  }

  const unsubscribe = onBreakpointChange(check);
  check();
  const unregisterPanel = registerMobilePanel(panel, { open: openSheet, close: closeSheet });
  if (mobilePanelNavigation) mobilePanelNavigation.style.display = isMobile ? 'flex' : 'none';

  return {
    open: openSheet,
    close: closeSheet,
    toggle: () => (isOpen ? closeSheet() : openSheet()),
    destroy: () => {
      closeSheet();
      unsubscribe();
      unregisterPanel();
    },
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