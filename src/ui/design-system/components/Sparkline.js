// src/ui/design-system/components/Sparkline.js
/**
 * Sparkline — Mini time-series chart (canvas-based, no dependencies).
 */

import { token } from '../theme.js';

const DEFAULT_CONFIG = {
  id: 'sparkline',
  data: [], // array of numbers
  maxPoints: 60,
  width: 120,
  height: 32,
  color: 'var(--ui-color-accent-primary)',
  fillColor: 'var(--ui-color-accent-primaryBg)',
  showMinMax: false,
  showCurrent: true,
  smooth: true,
};

export function createSparkline(config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let data = [...cfg.data].slice(-cfg.maxPoints);

  const canvas = document.createElement('canvas');
  canvas.width = cfg.width * 2; // 2x for HiDPI
  canvas.height = cfg.height * 2;
  canvas.style.width = `${cfg.width}px`;
  canvas.style.height = `${cfg.height}px`;
  canvas.style.display = 'block';
  canvas.id = cfg.id;

  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  function render() {
    ctx.clearRect(0, 0, cfg.width, cfg.height);
    if (data.length < 2) return;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = 2;
    const w = cfg.width - padding * 2;
    const h = cfg.height - padding * 2;

    // Fill area
    ctx.beginPath();
    ctx.moveTo(padding, cfg.height - padding);
    for (let i = 0; i < data.length; i++) {
      const x = padding + (i / (data.length - 1)) * w;
      const y = cfg.height - padding - ((data[i] - min) / range) * h;
      if (cfg.smooth && i > 0 && i < data.length - 1) {
        const prevX = padding + ((i - 1) / (data.length - 1)) * w;
        const nextX = padding + ((i + 1) / (data.length - 1)) * w;
        const cpX = (prevX + x) / 2;
        ctx.quadraticCurveTo(cpX, y, x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.lineTo(padding + w, cfg.height - padding);
    ctx.closePath();
    ctx.fillStyle = cfg.fillColor;
    ctx.fill();

    // Stroke line
    ctx.beginPath();
    ctx.moveTo(padding, cfg.height - padding - ((data[0] - min) / range) * h);
    for (let i = 1; i < data.length; i++) {
      const x = padding + (i / (data.length - 1)) * w;
      const y = cfg.height - padding - ((data[i] - min) / range) * h;
      if (cfg.smooth && i < data.length - 1) {
        const nextX = padding + ((i + 1) / (data.length - 1)) * w;
        const cpX = (x + nextX) / 2;
        ctx.quadraticCurveTo(cpX, y, nextX, cfg.height - padding - ((data[i + 1] - min) / range) * h);
        i++;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = cfg.color;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Current value dot
    if (cfg.showCurrent && data.length > 0) {
      const last = data[data.length - 1];
      const x = padding + w;
      const y = cfg.height - padding - ((last - min) / range) * h;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = cfg.color;
      ctx.fill();
      ctx.strokeStyle = 'var(--ui-color-bg-panel)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  render();

  return {
    element: canvas,
    push: (value) => {
      data.push(Number(value));
      if (data.length > cfg.maxPoints) data.shift();
      render();
    },
    setData: (newData) => {
      data = [...newData].slice(-cfg.maxPoints);
      render();
    },
    getData: () => [...data],
    setColor: (color) => { cfg.color = color; cfg.fillColor = color.replace(')', ', 0.15)').replace('rgb', 'rgba'); render(); },
    destroy: () => canvas.remove(),
  };
}