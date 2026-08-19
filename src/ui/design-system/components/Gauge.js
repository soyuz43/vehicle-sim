// src/ui/design-system/components/Gauge.js
/**
 * Gauge — Horizontal or circular progress gauge for telemetry.
 */

import { token } from '../theme.js';

const DEFAULT_CONFIG = {
  id: 'gauge',
  value: 0, // 0-1
  min: 0,
  max: 1,
  type: 'bar', // 'bar' | 'circular'
  size: 'md', // sm | md | lg
  showValue: true,
  formatValue: (v) => Math.round(v * 100) + '%',
  segments: null, // [{ threshold: 0.5, color: 'danger' }, ...] for color changes
  label: '',
  unit: '',
  animated: true,
};

const SIZE_STYLES = {
  bar: {
    sm: { height: '6px', radius: 'var(--ui-radius-full)', valueSize: 'var(--ui-typeScale-xs)' },
    md: { height: '10px', radius: 'var(--ui-radius-full)', valueSize: 'var(--ui-typeScale-sm)' },
    lg: { height: '14px', radius: 'var(--ui-radius-full)', valueSize: 'var(--ui-typeScale-base)' },
  },
  circular: {
    sm: { size: '40px', stroke: '4px', valueSize: 'var(--ui-typeScale-sm)' },
    md: { size: '56px', stroke: '5px', valueSize: 'var(--ui-typeScale-base)' },
    lg: { size: '72px', stroke: '6px', valueSize: 'var(--ui-typeScale-xl)' },
  },
};

function getColorForValue(value, segments) {
  if (!segments || segments.length === 0) return 'var(--ui-color-accent-primary)';
  for (const seg of segments) {
    if (value <= seg.threshold) return seg.color;
  }
  return segments[segments.length - 1].color;
}

export function createGauge(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const clampedValue = Math.max(cfg.min, Math.min(cfg.max, cfg.value));
  const normalized = (clampedValue - cfg.min) / (cfg.max - cfg.min);

  const root = document.createElement('div');
  root.id = cfg.id;
  root.style.display = 'inline-flex';
  root.style.flexDirection = 'column';
  root.style.alignItems = 'center';
  root.style.gap = 'var(--ui-space-xs)';

  let gaugeEl, fillEl, valueEl;

  if (cfg.type === 'bar') {
    const size = SIZE_STYLES.bar[cfg.size] ?? SIZE_STYLES.bar.md;

    const track = document.createElement('div');
    track.style.width = '100%';
    track.style.maxWidth = '200px';
    track.style.height = size.height;
    track.style.background = 'var(--ui-color-border-default)';
    track.style.borderRadius = size.radius;
    track.style.overflow = 'hidden';
    track.style.position = 'relative';

    fillEl = document.createElement('div');
    fillEl.style.height = '100%';
    fillEl.style.width = `${normalized * 100}%`;
    fillEl.style.background = getColorForValue(normalized, cfg.segments);
    fillEl.style.borderRadius = size.radius;
    fillEl.style.transition = cfg.animated ? 'width var(--ui-transition-slow), background var(--ui-transition-base)' : 'none';
    fillEl.style.transformOrigin = 'left center';

    track.appendChild(fillEl);
    gaugeEl = track;

    if (cfg.showValue) {
      valueEl = document.createElement('div');
      valueEl.textContent = cfg.formatValue(normalized);
      valueEl.style.fontSize = size.valueSize;
      valueEl.style.fontWeight = 'var(--ui-fontWeight-semibold)';
      valueEl.style.color = 'var(--ui-color-text-primary)';
      valueEl.style.fontFamily = 'var(--ui-font-mono)';
      valueEl.style.textAlign = 'right';
      valueEl.style.width = '100%';
      valueEl.style.maxWidth = '200px';
      root.appendChild(track);
      root.appendChild(valueEl);
    } else {
      root.appendChild(track);
    }
  } else {
    const size = SIZE_STYLES.circular[cfg.size] ?? SIZE_STYLES.circular.md;
    const radius = (parseFloat(size.size) - parseFloat(size.stroke)) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - normalized);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', size.size);
    svg.setAttribute('height', size.size);
    svg.style.transform = 'rotate(-90deg)';

    const trackCircle = document.createElementNS(svgNS, 'circle');
    trackCircle.setAttribute('cx', parseFloat(size.size) / 2);
    trackCircle.setAttribute('cy', parseFloat(size.size) / 2);
    trackCircle.setAttribute('r', radius);
    trackCircle.setAttribute('fill', 'none');
    trackCircle.setAttribute('stroke', 'var(--ui-color-border-default)');
    trackCircle.setAttribute('stroke-width', size.stroke);
    svg.appendChild(trackCircle);

    fillEl = document.createElementNS(svgNS, 'circle');
    fillEl.setAttribute('cx', parseFloat(size.size) / 2);
    fillEl.setAttribute('cy', parseFloat(size.size) / 2);
    fillEl.setAttribute('r', radius);
    fillEl.setAttribute('fill', 'none');
    fillEl.setAttribute('stroke', getColorForValue(normalized, cfg.segments));
    fillEl.setAttribute('stroke-width', size.stroke);
    fillEl.setAttribute('stroke-linecap', 'round');
    fillEl.setAttribute('stroke-dasharray', circumference);
    fillEl.setAttribute('stroke-dashoffset', offset);
    fillEl.style.transition = cfg.animated ? 'stroke-dashoffset var(--ui-transition-slow), stroke var(--ui-transition-base)' : 'none';
    svg.appendChild(fillEl);

    gaugeEl = svg;

    if (cfg.showValue) {
      valueEl = document.createElement('div');
      valueEl.textContent = cfg.formatValue(normalized);
      valueEl.style.fontSize = size.valueSize;
      valueEl.style.fontWeight = 'var(--ui-fontWeight-bold)';
      valueEl.style.color = 'var(--ui-color-text-primary)';
      valueEl.style.fontFamily = 'var(--ui-font-mono)';
      root.appendChild(svg);
      root.appendChild(valueEl);
    } else {
      root.appendChild(svg);
    }
  }

  if (cfg.label) {
    const labelEl = document.createElement('div');
    labelEl.textContent = cfg.label;
    labelEl.style.fontSize = 'var(--ui-typeScale-sm)';
    labelEl.style.fontWeight = 'var(--ui-fontWeight-medium)';
    labelEl.style.color = 'var(--ui-color-text-secondary)';
    labelEl.style.fontFamily = 'var(--ui-font-ui)';
    root.appendChild(labelEl);
  }

  return {
    element: root,
    setValue: (val) => {
      const clamped = Math.max(cfg.min, Math.min(cfg.max, val));
      const norm = (clamped - cfg.min) / (cfg.max - cfg.min);
      const color = getColorForValue(norm, cfg.segments);
      if (cfg.type === 'bar') {
        fillEl.style.width = `${norm * 100}%`;
        fillEl.style.background = color;
      } else {
        const size = SIZE_STYLES.circular[cfg.size] ?? SIZE_STYLES.circular.md;
        const radius = (parseFloat(size.size) - parseFloat(size.stroke)) / 2;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference * (1 - norm);
        fillEl.setAttribute('stroke-dashoffset', offset);
        fillEl.setAttribute('stroke', color);
      }
      if (valueEl) valueEl.textContent = cfg.formatValue(norm);
    },
    setSegments: (segments) => { cfg.segments = segments; },
    destroy: () => root.remove(),
  };
}