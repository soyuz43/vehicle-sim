// src/ui/design-system/tokens.js
/**
 * Design Tokens — Single source of truth for all visual design decisions.
 * Import these tokens in components instead of hardcoding values.
 * All values are CSS-compatible strings or numbers.
 */

export const tokens = {
  /** Color palette — semantic and functional colors */
  color: {
    /** Background layers */
    bg: {
      panel: 'rgba(10, 12, 16, 0.88)',
      panelHover: 'rgba(18, 20, 26, 0.94)',
      panelPressed: 'rgba(6, 8, 10, 0.96)',
      overlay: 'rgba(0, 0, 0, 0.55)',
      input: 'rgba(255, 255, 255, 0.06)',
      inputHover: 'rgba(255, 255, 255, 0.10)',
      inputFocus: 'rgba(255, 255, 255, 0.14)',
    },

    /** Border colors */
    border: {
      subtle: 'rgba(255, 255, 255, 0.10)',
      default: 'rgba(255, 255, 255, 0.18)',
      emphasis: 'rgba(255, 255, 255, 0.28)',
      focus: 'rgba(96, 165, 250, 0.60)',
      error: 'rgba(248, 113, 113, 0.60)',
    },

    /** Text colors */
    text: {
      primary: '#f0f0f0',
      secondary: 'rgba(240, 240, 240, 0.72)',
      muted: 'rgba(240, 240, 240, 0.44)',
      inverse: '#0a0a0a',
      link: '#93c5fd',
      linkHover: '#bfdbfe',
    },

    /** Semantic status colors */
    semantic: {
      success: '#4ade80',
      successBg: 'rgba(74, 222, 128, 0.16)',
      successBorder: 'rgba(74, 222, 128, 0.35)',
      warning: '#fbbf24',
      warningBg: 'rgba(251, 191, 36, 0.16)',
      warningBorder: 'rgba(251, 191, 36, 0.35)',
      danger: '#f87171',
      dangerBg: 'rgba(248, 113, 113, 0.16)',
      dangerBorder: 'rgba(248, 113, 113, 0.35)',
      info: '#60a5fa',
      infoBg: 'rgba(96, 165, 250, 0.16)',
      infoBorder: 'rgba(96, 165, 250, 0.35)',
    },

    /** Accent/brand colors */
    accent: {
      primary: '#60a5fa',
      primaryHover: '#93c5fd',
      primaryActive: '#3b82f6',
      primaryBg: 'rgba(96, 165, 250, 0.14)',
    },

    /** Traction state colors (driver HUD specific) */
    traction: {
      grounded: '#4ade80',
      groundedBg: 'rgba(74, 222, 128, 0.18)',
      groundedBorder: 'rgba(134, 239, 172, 0.60)',
      slip: '#f87171',
      slipBg: 'rgba(248, 113, 113, 0.22)',
      slipBorder: 'rgba(252, 165, 165, 0.80)',
      air: 'rgba(255, 255, 255, 0.35)',
      airBg: 'rgba(255, 255, 255, 0.03)',
      airBorder: 'rgba(255, 255, 255, 0.12)',
      unavailable: 'rgba(255, 255, 255, 0.28)',
    },

    /** Gear indicator colors */
    gear: {
      activeBg: 'rgba(255, 255, 255, 0.94)',
      activeText: '#050505',
      activeBorder: 'rgba(255, 255, 255, 1)',
      inactiveBg: 'rgba(255, 255, 255, 0.08)',
      inactiveText: 'rgba(255, 255, 255, 0.42)',
      inactiveBorder: 'rgba(255, 255, 255, 0.22)',
    },
  },

  /** Spacing scale (pixels) */
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    '2xl': 32,
    '3xl': 48,
  },

  /** Border radius scale */
  radius: {
    none: 0,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },

  /** Box shadows */
  shadow: {
    none: 'none',
    xs: '0 1px 2px rgba(0, 0, 0, 0.24)',
    sm: '0 4px 8px rgba(0, 0, 0, 0.28)',
    md: '0 8px 20px rgba(0, 0, 0, 0.32)',
    lg: '0 12px 32px rgba(0, 0, 0, 0.35)',
    xl: '0 20px 48px rgba(0, 0, 0, 0.40)',
    inset: 'inset 0 1px 2px rgba(0, 0, 0, 0.24)',
    focus: '0 0 0 2px rgba(96, 165, 250, 0.45)',
  },

  /** Z-index layers — systematic, no magic numbers */
  zIndex: {
    base: 0,
    dropdown: 50,
    panel: 100,
    overlay: 200,
    modal: 300,
    toast: 400,
    tooltip: 500,
    debug: 1000,
  },

  /** Typography */
  font: {
    /** UI font — for all interface text, labels, buttons */
    ui: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    /** Monospace font — for numeric readouts, code, telemetry values */
    mono: 'ui-monospace, "SF Mono", "Fira Code", Consolas, "Courier New", monospace',
    /** Display font — for large headlines, speed numbers */
    display: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },

  /** Type scale (pixels) */
  typeScale: {
    xs: 10,
    sm: 11,
    base: 12,
    lg: 14,
    xl: 18,
    '2xl': 24,
    '3xl': 32,
    '4xl': 40,
    '5xl': 56,
  },

  /** Font weights */
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },

  /** Line heights */
  lineHeight: {
    tight: '1.1',
    snug: '1.25',
    normal: '1.45',
    relaxed: '1.6',
  },

  /** Transition durations and easings */
  transition: {
    fast: '80ms ease',
    base: '120ms ease',
    slow: '200ms ease',
    slower: '300ms ease',
    spring: '250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  },

  /** Breakpoints (pixels) — mobile-first */
  breakpoint: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536,
  },

  /** Panel default dimensions */
  panel: {
    minWidth: 240,
    maxWidth: 420,
    defaultWidth: 280,
    headerHeight: 36,
    collapseAnimation: '180ms ease',
  },

  /** Form control dimensions */
  control: {
    height: 32,
    heightSm: 24,
    heightLg: 40,
    paddingX: 10,
    paddingXSm: 8,
    paddingXLg: 14,
  },
};

/** Light theme overrides — merges with base tokens */
export const lightThemeOverrides = {
  color: {
    bg: {
      panel: 'rgba(255, 255, 255, 0.92)',
      panelHover: 'rgba(248, 250, 252, 0.96)',
      panelPressed: 'rgba(241, 245, 249, 0.98)',
      overlay: 'rgba(0, 0, 0, 0.35)',
      input: 'rgba(0, 0, 0, 0.04)',
      inputHover: 'rgba(0, 0, 0, 0.07)',
      inputFocus: 'rgba(0, 0, 0, 0.10)',
    },
    border: {
      subtle: 'rgba(0, 0, 0, 0.07)',
      default: 'rgba(0, 0, 0, 0.14)',
      emphasis: 'rgba(0, 0, 0, 0.22)',
      focus: 'rgba(59, 130, 246, 0.60)',
      error: 'rgba(239, 68, 68, 0.60)',
    },
    text: {
      primary: '#0f172a',
      secondary: 'rgba(15, 23, 42, 0.72)',
      muted: 'rgba(15, 23, 42, 0.48)',
      inverse: '#ffffff',
      link: '#2563eb',
      linkHover: '#1d4ed8',
    },
    semantic: {
      success: '#16a34a',
      successBg: 'rgba(22, 163, 74, 0.12)',
      successBorder: 'rgba(22, 163, 74, 0.30)',
      warning: '#ca8a04',
      warningBg: 'rgba(202, 138, 4, 0.12)',
      warningBorder: 'rgba(202, 138, 4, 0.30)',
      danger: '#dc2626',
      dangerBg: 'rgba(220, 38, 38, 0.12)',
      dangerBorder: 'rgba(220, 38, 38, 0.30)',
      info: '#2563eb',
      infoBg: 'rgba(37, 99, 235, 0.12)',
      infoBorder: 'rgba(37, 99, 235, 0.30)',
    },
    accent: {
      primary: '#2563eb',
      primaryHover: '#3b82f6',
      primaryActive: '#1d4ed8',
      primaryBg: 'rgba(37, 99, 235, 0.12)',
    },
    traction: {
      grounded: '#16a34a',
      groundedBg: 'rgba(22, 163, 74, 0.14)',
      groundedBorder: 'rgba(22, 163, 74, 0.35)',
      slip: '#dc2626',
      slipBg: 'rgba(220, 38, 38, 0.16)',
      slipBorder: 'rgba(220, 38, 38, 0.40)',
      air: 'rgba(15, 23, 42, 0.35)',
      airBg: 'rgba(15, 23, 42, 0.04)',
      airBorder: 'rgba(15, 23, 42, 0.10)',
      unavailable: 'rgba(15, 23, 42, 0.28)',
    },
    gear: {
      activeBg: 'rgba(0, 0, 0, 0.88)',
      activeText: '#ffffff',
      activeBorder: 'rgba(0, 0, 0, 1)',
      inactiveBg: 'rgba(0, 0, 0, 0.06)',
      inactiveText: 'rgba(15, 23, 42, 0.42)',
      inactiveBorder: 'rgba(15, 23, 42, 0.14)',
    },
  },
};

/** Helper to get a token value with dot-notation path */
export function getToken(path, theme = 'dark') {
  const keys = path.split('.');
  let obj = theme === 'light' ? { ...tokens, ...lightThemeOverrides } : tokens;
  for (const key of keys) {
    if (obj && typeof obj === 'object' && key in obj) {
      obj = obj[key];
    } else {
      return undefined;
    }
  }
  return obj;
}

/** Convert token value to CSS custom property format */
export function tokenToCssVar(path, theme = 'dark') {
  const value = getToken(path, theme);
  if (typeof value === 'number') return value + 'px';
  return value;
}