// src/ui/design-system/layout/Stack.js
/**
 * Stack — Layout primitives for vertical/horizontal stacking with consistent spacing.
 */

import { token } from '../theme.js';

/** Create a vertical stack */
export function createVStack(config = {}) {
  const { gap = 'var(--ui-space-md)', align = 'stretch', className = '' } = config;
  const root = document.createElement('div');
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.gap = gap;
  root.style.alignItems = align;
  if (className) root.className = className;
  return root;
}

/** Create a horizontal stack */
export function createHStack(config = {}) {
  const { gap = 'var(--ui-space-md)', align = 'center', justify = 'flex-start', wrap = false, className = '' } = config;
  const root = document.createElement('div');
  root.style.display = 'flex';
  root.style.flexDirection = 'row';
  root.style.gap = gap;
  root.style.alignItems = align;
  root.style.justifyContent = justify;
  if (wrap) root.style.flexWrap = 'wrap';
  if (className) root.className = className;
  return root;
}

/** Create a grid layout */
export function createGrid(config = {}) {
  const { columns = '1fr', gap = 'var(--ui-space-md)', className = '' } = config;
  const root = document.createElement('div');
  root.style.display = 'grid';
  root.style.gridTemplateColumns = columns;
  root.style.gap = gap;
  if (className) root.className = className;
  return root;
}

/** Spacer — flexible space filler */
export function createSpacer(flex = 1) {
  const spacer = document.createElement('div');
  spacer.style.flex = flex;
  return spacer;
}

/** Divider — visual separator */
export function createDivider(config = {}) {
  const { orientation = 'horizontal', className = '' } = config;
  const divider = document.createElement('div');
  divider.style.border = 'none';
  divider.style.borderTop = orientation === 'horizontal' ? '1px solid var(--ui-color-border-subtle)' : 'none';
  divider.style.borderLeft = orientation === 'vertical' ? '1px solid var(--ui-color-border-subtle)' : 'none';
  divider.style.height = orientation === 'horizontal' ? '0' : '100%';
  divider.style.width = orientation === 'vertical' ? '0' : '100%';
  if (className) divider.className = className;
  return divider;
}

/** Container — max-width centered wrapper */
export function createContainer(config = {}) {
  const { maxWidth = 'var(--ui-panel-maxWidth)', padding = 'var(--ui-space-lg)', className = '' } = config;
  const container = document.createElement('div');
  container.style.maxWidth = maxWidth;
  container.style.margin = '0 auto';
  container.style.padding = `0 ${padding}`;
  container.style.width = '100%';
  container.style.boxSizing = 'border-box';
  if (className) container.className = className;
  return container;
}