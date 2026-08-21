// src/ui/design-system/theme.js
/**
 * Theme Management — CSS Custom Property injection + runtime theme switching.
 * Call applyTheme() once at app startup, then use toggleTheme() or setTheme() as needed.
 */

import { tokens, lightThemeOverrides, getToken } from './tokens.js';
import { readStringFromStorage, writeStringToStorage } from './browserStorage.js';

const THEME_ATTR = 'data-ui-theme';
const STORAGE_KEY = 'ui-theme-preference';

/** Current theme state */
let currentTheme = 'dark';
let mediaQueryListener = null;

/**
 * Deep merge two objects (used for theme overrides)
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] ?? {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Get resolved tokens for current theme
 */
export function getResolvedTokens() {
  return currentTheme === 'light'
    ? deepMerge(tokens, lightThemeOverrides)
    : tokens;
}

/**
 * Convert token object to CSS custom properties
 */
function tokensToCssVars(obj, prefix = '--ui') {
  const vars = {};
  const UNITLESS_KEYS = new Set(['lineHeight', 'fontWeight', 'zIndex']);
  function flatten(o, path = '', parentKey = '') {
    for (const [key, value] of Object.entries(o)) {
      const newPath = path ? path + '-' + key : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        flatten(value, newPath, key);
      } else {
        if (UNITLESS_KEYS.has(parentKey)) {
          vars[prefix + '-' + newPath] = String(value);
        } else {
          vars[prefix + '-' + newPath] = typeof value === 'number' ? value + 'px' : value;
        }
      }
    }
  }
  flatten(obj);
  return vars;
}

/**
 * Apply CSS custom properties to :root
 */
function applyCssVars(vars) {
  const root = document.documentElement;
  if (!root || typeof root.style.setProperty !== 'function') return;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

/**
 * Apply theme to document
 */
function applyTheme(theme) {
  currentTheme = theme;
  const resolved = getResolvedTokens();
  const vars = tokensToCssVars(resolved);
  applyCssVars(vars);
  const root = document.documentElement;
  if (root && typeof root.setAttribute === 'function') {
    root.setAttribute(THEME_ATTR, theme);
  }
  writeStringToStorage(STORAGE_KEY, theme);
}

/**
 * Initialize theme from localStorage or system preference
 */
export function initTheme() {
  // Skip if not in a browser environment with proper DOM
  if (typeof document === 'undefined' || typeof document.documentElement === 'undefined' || typeof document.documentElement.style.setProperty !== 'function') {
    return;
  }

  const storedTheme = readStringFromStorage(STORAGE_KEY);
  let theme = storedTheme === 'light' || storedTheme === 'dark'
    ? storedTheme
    : 'dark';
  const systemMediaQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: light)')
    : null;
  if (theme === 'dark' && systemMediaQuery?.matches) {
    theme = 'light';
  }
  applyTheme(theme);

  // Listen for system theme changes (only if user hasn't set explicit preference)
  const preferenceMediaQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: light)')
    : null;
  if (!storedTheme && preferenceMediaQuery?.addEventListener) {
    mediaQueryListener = (e) => applyTheme(e.matches ? 'light' : 'dark');
    preferenceMediaQuery.addEventListener('change', mediaQueryListener);
  }

  // Reduced motion preference
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  if (root && typeof root.style.setProperty === 'function') {
    root.style.setProperty('--ui-reduce-motion', reducedMotion.matches ? '1' : '0');
  }
  reducedMotion.addEventListener('change', (e) => {
    const root = document.documentElement;
    if (root && typeof root.style.setProperty === 'function') {
      root.style.setProperty('--ui-reduce-motion', e.matches ? '1' : '0');
    }
  });
}

/**
 * Toggle between light and dark
 */
export function toggleTheme() {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

/**
 * Set explicit theme
 */
export function setTheme(theme) {
  if (theme !== 'light' && theme !== 'dark') return;
  applyTheme(theme);
}

/**
 * Get current theme
 */
export function getTheme() {
  return currentTheme;
}

/**
 * Get a token value for current theme
 */
export function token(path) {
  return getToken(path, currentTheme);
}

/**
 * Cleanup listeners (for testing or unmount)
 */
export function cleanupTheme() {
  if (mediaQueryListener) {
    window.matchMedia('(prefers-color-scheme: light)').removeEventListener('change', mediaQueryListener);
    mediaQueryListener = null;
  }
}

// Auto-initialize when module loads (safe for ESM) - only in browser with proper DOM
if (typeof document !== 'undefined' && typeof document.documentElement !== 'undefined' && typeof document.documentElement.style.setProperty === 'function') {
  initTheme();
}
