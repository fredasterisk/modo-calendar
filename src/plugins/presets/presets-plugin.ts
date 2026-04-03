// src/plugins/presets/presets-plugin.ts
// Quick-select date range presets for ModoCalendar (ShadCN-style sidebar presets)

import type { CalendarPlugin, CalendarInstance } from '../../core/types';

const presetsCSS = `
.mc-presets {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding-right: 1rem;
  margin-right: 1rem;
  border-right: 1px solid var(--mc-border, #e2e8f0);
  min-width: 120px;
}
.mc-preset-btn {
  text-align: left;
  padding: 0.375rem 0.75rem;
  border: none;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--mc-fg, #0f172a);
  font-size: 0.8125rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--mc-transition, 150ms ease);
}
.mc-preset-btn:hover {
  background: var(--mc-muted, #f1f5f9);
}
.mc-preset-btn--active {
  background: var(--mc-accent, #2563eb);
  color: var(--mc-accent-fg, #fff);
}
.mc-preset-btn:focus-visible {
  outline: 2px solid var(--mc-accent, #2563eb);
  outline-offset: 2px;
}
.mc-calendar--with-presets {
  display: flex;
}
.mc-calendar--with-presets > .mc-months-wrapper,
.mc-calendar--with-presets > .mc-days,
.mc-calendar--with-presets > .mc-header {
  flex: 1;
}
@media (max-width: 639px) {
  .mc-presets {
    flex-direction: row;
    flex-wrap: wrap;
    border-right: none;
    border-bottom: 1px solid var(--mc-border, #e2e8f0);
    padding-right: 0;
    margin-right: 0;
    padding-bottom: 0.75rem;
    margin-bottom: 0.75rem;
    min-width: auto;
  }
  .mc-calendar--with-presets {
    flex-direction: column;
  }
}
`;

export interface PresetRange {
  label: string;
  dates: () => [Date, Date];
}

export interface PresetsPluginOptions {
  presets: PresetRange[];
}

function injectCSS(root: ShadowRoot | HTMLElement | null): void {
  if (!root) return;
  const id = 'mc-presets-css';
  if (root instanceof ShadowRoot) {
    if (root.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = presetsCSS;
    root.appendChild(style);
  } else {
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = presetsCSS;
      document.head.appendChild(style);
    }
  }
}

export function presetsPlugin(options: PresetsPluginOptions): CalendarPlugin {
  return {
    name: 'presets',
    options: options as unknown as Record<string, unknown>,

    onShadowReady(calendar: CalendarInstance) {
      injectCSS(calendar.shadowRoot || calendar.shadowHost);
    },

    onRender(calendar: CalendarInstance) {
      if (!calendar.container || calendar.mode !== 'range') return;

      // Add flex layout class
      calendar.container.classList.add('mc-calendar--with-presets');

      // Don't duplicate
      if (calendar.container.querySelector('.mc-presets')) return;

      const sidebar = document.createElement('div');
      sidebar.className = 'mc-presets';
      sidebar.setAttribute('role', 'listbox');
      sidebar.setAttribute('aria-label', 'Date presets');

      options.presets.forEach((preset) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mc-preset-btn';
        btn.textContent = preset.label;
        btn.setAttribute('role', 'option');

        // Check if this preset is currently active
        const [pStart, pEnd] = preset.dates();
        if (
          calendar.selectedDates.length === 2 &&
          _sameDay(calendar.selectedDates[0], pStart) &&
          _sameDay(calendar.selectedDates[1], pEnd)
        ) {
          btn.classList.add('mc-preset-btn--active');
          btn.setAttribute('aria-selected', 'true');
        }

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const [start, end] = preset.dates();
          calendar.selectedDates = [start, end];
          calendar.updateButtonLabel();
          calendar.renderCalendar();
          calendar.updateDayClasses();
          calendar.updateHiddenInput();
          calendar.emit('rangeSelected', { start, end });
        });

        sidebar.appendChild(btn);
      });

      calendar.container.prepend(sidebar);
    },
  };
}

function _sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Helper: common preset factories
export const presetRanges = {
  today(): PresetRange {
    return {
      label: "Aujourd'hui",
      dates: () => {
        const d = new Date();
        return [d, d];
      },
    };
  },
  last7Days(): PresetRange {
    return {
      label: '7 derniers jours',
      dates: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 6);
        return [start, end];
      },
    };
  },
  last30Days(): PresetRange {
    return {
      label: '30 derniers jours',
      dates: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 29);
        return [start, end];
      },
    };
  },
  thisMonth(): PresetRange {
    return {
      label: 'Ce mois',
      dates: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return [start, end];
      },
    };
  },
  nextWeek(): PresetRange {
    return {
      label: 'Semaine prochaine',
      dates: () => {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const daysUntilMonday = ((8 - dayOfWeek) % 7) || 7;
        const start = new Date(now);
        start.setDate(now.getDate() + daysUntilMonday);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return [start, end];
      },
    };
  },
};
