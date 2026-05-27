// src/plugins/day-info/day-info-plugin.ts
// Minimal per-day metadata: color dots + custom positioned tooltip.
// Use case: surface availability/status hints in each cell without bespoke rendering.

import pluginStyles from './styles.css?raw';
import type { CalendarPlugin, CalendarInstance } from '../../core/types';

export interface DayInfo {
  /** CSS color strings — one mini dot rendered per entry, capped at maxDots. */
  dots?: string[];
  /**
   * Tooltip content.
   * - When a `string`, rendered via `textContent` — safe against XSS.
   * - When a `Node` (HTMLElement, DocumentFragment, etc.), it is cloned and appended.
   *   Use this for HTML: build the node with `document.createElement` or a
   *   `<template>` element. The caller controls exactly what DOM is inserted.
   */
  tooltip?: string | Node;
}

export interface DayInfoPluginOptions {
  /**
   * Called for every rendered day. Return `null`/`undefined` to skip a day.
   * Invoked from inside the `updateDayClasses` hook, so it runs on every redraw.
   * Keep it pure and cheap — for expensive lookups, memoize externally.
   */
  getDayInfo: (date: Date) => DayInfo | null | undefined;
  /** Maximum number of dots rendered per cell. Default 4. Extra entries are ignored. */
  maxDots?: number;
  /** Preferred tooltip placement. Will flip if there isn't enough room. Default 'top'. */
  tooltipPlacement?: 'top' | 'bottom';
}

const STYLE_ID = 'mc-day-info-css';
const TOOLTIP_GAP = 8;
const TOOLTIP_EDGE_PADDING = 8;

function injectCSS(root: ShadowRoot | HTMLElement | null): void {
  if (!root) return;
  if (root instanceof ShadowRoot) {
    if (root.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = pluginStyles;
    root.appendChild(style);
  } else {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = pluginStyles;
      document.head.appendChild(style);
    }
  }
}

export function dayInfoPlugin(options: DayInfoPluginOptions): CalendarPlugin {
  const maxDots = typeof options.maxDots === 'number' && options.maxDots > 0 ? options.maxDots : 4;
  const preferredPlacement: 'top' | 'bottom' = options.tooltipPlacement === 'bottom' ? 'bottom' : 'top';

  if (typeof options.getDayInfo !== 'function') {
    console.warn('[ModoCalendar:dayInfoPlugin] getDayInfo must be a function. Plugin will be a no-op.');
  }

  let _ac: AbortController | null = null;
  let _tooltipEl: HTMLElement | null = null;
  // Per-cell tooltip content (string or Node). Keyed by the cell element so it
  // gets garbage-collected automatically when the cell is removed from the DOM.
  const _tooltipContent = new WeakMap<HTMLElement, string | Node>();

  function ensureTooltip(calendar: CalendarInstance): HTMLElement | null {
    const root = calendar.shadowRoot || calendar.shadowHost;
    if (!root) return null;
    if (_tooltipEl && _tooltipEl.isConnected) return _tooltipEl;
    const el = document.createElement('div');
    el.className = 'mc-day-tooltip';
    el.setAttribute('role', 'tooltip');
    el.setAttribute('aria-hidden', 'true');
    el.dataset.placement = preferredPlacement;
    root.appendChild(el);
    _tooltipEl = el;
    return el;
  }

  function showTooltip(calendar: CalendarInstance, cell: HTMLElement): void {
    const content = _tooltipContent.get(cell);
    if (content == null) return;
    const tip = ensureTooltip(calendar);
    if (!tip) return;
    // Clear previous content
    while (tip.firstChild) tip.removeChild(tip.firstChild);
    if (typeof content === 'string') {
      tip.textContent = content;
    } else {
      tip.appendChild(content.cloneNode(true));
    }
    tip.dataset.placement = preferredPlacement;
    // Force layout to measure
    tip.style.visibility = 'hidden';
    tip.classList.add('mc-day-tooltip--visible');
    const cellRect = cell.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Vertical: prefer placement; flip if not enough room
    let placement = preferredPlacement;
    const roomAbove = cellRect.top - TOOLTIP_GAP;
    const roomBelow = vh - cellRect.bottom - TOOLTIP_GAP;
    if (placement === 'top' && tipRect.height > roomAbove && roomBelow >= tipRect.height) placement = 'bottom';
    else if (placement === 'bottom' && tipRect.height > roomBelow && roomAbove >= tipRect.height) placement = 'top';
    tip.dataset.placement = placement;

    const top = placement === 'top'
      ? cellRect.top - tipRect.height - TOOLTIP_GAP
      : cellRect.bottom + TOOLTIP_GAP;

    // Horizontal: center on cell, clamp to viewport
    let left = cellRect.left + cellRect.width / 2 - tipRect.width / 2;
    const minLeft = TOOLTIP_EDGE_PADDING;
    const maxLeft = vw - tipRect.width - TOOLTIP_EDGE_PADDING;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;

    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
    tip.style.visibility = '';
    tip.setAttribute('aria-hidden', 'false');
  }

  function hideTooltip(): void {
    if (!_tooltipEl) return;
    _tooltipEl.classList.remove('mc-day-tooltip--visible');
    _tooltipEl.setAttribute('aria-hidden', 'true');
  }

  return {
    name: 'dayInfo',
    options: options as unknown as Record<string, unknown>,

    onShadowReady(calendar: CalendarInstance) {
      injectCSS(calendar.shadowRoot || calendar.shadowHost);
      ensureTooltip(calendar);
    },

    onInit(calendar: CalendarInstance) {
      calendar._addHook('updateDayClasses', (original) => {
        return function (this: CalendarInstance) {
          original();
          if (!this.dayElements || typeof options.getDayInfo !== 'function') return;

          for (const { el, date } of this.dayElements) {
            // Clear previous decorations
            el.querySelector('.mc-day-dots')?.remove();

            const info = options.getDayInfo(date);
            if (!info) {
              el.removeAttribute('data-mc-tooltip');
              continue;
            }

            if (info.dots && info.dots.length > 0) {
              const wrap = document.createElement('span');
              wrap.className = 'mc-day-dots';
              wrap.setAttribute('aria-hidden', 'true');
              for (const color of info.dots.slice(0, maxDots)) {
                const dot = document.createElement('span');
                dot.className = 'mc-day-dot';
                dot.style.background = color;
                wrap.appendChild(dot);
              }
              el.appendChild(wrap);
            }

            if (info.tooltip != null) {
              _tooltipContent.set(el, info.tooltip);
              el.setAttribute('data-mc-tooltip', '');
            } else {
              _tooltipContent.delete(el);
              el.removeAttribute('data-mc-tooltip');
            }
          }
        };
      });
    },

    onRender(calendar: CalendarInstance) {
      calendar.updateDayClasses?.();

      // Re-wire delegated listeners on the container (survives child re-renders).
      _ac?.abort();
      _ac = new AbortController();
      const signal = _ac.signal;
      const container = calendar.container;
      if (!container) return;

      const onEnter = (e: Event) => {
        const cell = (e.target as HTMLElement).closest('.mc-day') as HTMLElement | null;
        if (!cell || !cell.hasAttribute('data-mc-tooltip')) return;
        showTooltip(calendar, cell);
      };

      const onLeave = (e: Event) => {
        const related = (e as MouseEvent).relatedTarget as HTMLElement | null;
        if (related && related.closest && related.closest('.mc-day')?.hasAttribute('data-mc-tooltip')) return;
        hideTooltip();
      };

      // Use mouseover/mouseout (bubbling) for delegation
      container.addEventListener('mouseover', onEnter, { signal });
      container.addEventListener('mouseout', onLeave, { signal });
      container.addEventListener('focusin', onEnter, { signal });
      container.addEventListener('focusout', () => hideTooltip(), { signal });

      // Hide tooltip when scrolling/resizing (it would otherwise float at stale coords)
      window.addEventListener('scroll', hideTooltip, { signal, capture: true });
      window.addEventListener('resize', hideTooltip, { signal });
    },

    onCalendarClose() {
      hideTooltip();
    },

    onDestroy() {
      _ac?.abort();
      _ac = null;
      _tooltipEl?.remove();
      _tooltipEl = null;
    },
  };
}
