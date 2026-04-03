// src/plugins/presets/presets-plugin.ts
// Quick-select date range presets for ModoCalendar (ShadCN-style sidebar presets)

import type { CalendarPlugin, CalendarInstance } from '../../core/types';

const presetsCSS = `
.mc-presets-layout {
  display: flex;
}
.mc-presets {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding-right: 1rem;
  margin-right: 1rem;
  border-right: 1px solid var(--mc-border, #e2e8f0);
  min-width: 130px;
  flex-shrink: 0;
}
.mc-presets-content {
  flex: 1;
  min-width: 0;
}
.mc-preset-btn {
  text-align: left;
  padding: 0.375rem 0.75rem;
  border: none;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--mc-fg, #0f172a);
  font-family: var(--mc-font, inherit);
  font-size: 0.8125rem;
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--mc-transition, 150ms ease), color var(--mc-transition, 150ms ease);
}
.mc-preset-btn:hover {
  background: var(--mc-muted, #f1f5f9);
}
.mc-preset-btn--active {
  background: var(--mc-accent, #2563eb) !important;
  color: var(--mc-accent-fg, #fff);
}
.mc-preset-btn:focus-visible {
  outline: 2px solid var(--mc-accent, #2563eb);
  outline-offset: 2px;
}
@media (max-width: 639px) {
  .mc-presets-layout {
    flex-direction: column;
  }
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

      // Don't duplicate
      if (calendar.container.querySelector('.mc-presets')) return;

      // Wrap existing calendar content in a content div, then wrap both in a flex layout
      const layoutWrapper = document.createElement('div');
      layoutWrapper.className = 'mc-presets-layout';

      const sidebar = document.createElement('div');
      sidebar.className = 'mc-presets';
      sidebar.setAttribute('role', 'listbox');
      sidebar.setAttribute('aria-label', 'Date presets');

      // Move all existing children into a content wrapper
      const contentWrapper = document.createElement('div');
      contentWrapper.className = 'mc-presets-content';
      while (calendar.container.firstChild) {
        contentWrapper.appendChild(calendar.container.firstChild);
      }

      options.presets.forEach((preset) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mc-preset-btn';
        btn.textContent = preset.label;
        btn.setAttribute('role', 'option');

        // Check if this preset is currently active
        const [pStart, pEnd] = preset.dates();
        if (
          calendar.startDate && calendar.endDate &&
          _sameDay(calendar.startDate, pStart) &&
          _sameDay(calendar.endDate, pEnd)
        ) {
          btn.classList.add('mc-preset-btn--active');
          btn.setAttribute('aria-selected', 'true');
        }

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const [start, end] = preset.dates();

          // Navigate calendar to the start month so user can see the range
          calendar.date = new Date(start.getFullYear(), start.getMonth(), 1);

          // Reset month offsets so consecutive months display from the preset's start
          if (calendar.monthOffsets) {
            for (let i = 0; i < calendar.monthOffsets.length; i++) {
              calendar.monthOffsets[i] = 0;
            }
          }

          // Set range using the proper range API
          calendar.startDate = start;
          calendar.endDate = end;
          calendar.hoverDate = null;
          calendar.updateButtonLabel();
          calendar.renderCalendar();
          calendar.updateDayClasses();
          calendar.updateHiddenInput();
          calendar.emit('rangeSelected', { start, end });
        });

        sidebar.appendChild(btn);
      });

      layoutWrapper.appendChild(sidebar);
      layoutWrapper.appendChild(contentWrapper);
      calendar.container.appendChild(layoutWrapper);
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
        d.setHours(0, 0, 0, 0);
        return [d, new Date(d)];
      },
    };
  },
  tomorrow(): PresetRange {
    return {
      label: 'Demain',
      dates: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(0, 0, 0, 0);
        return [d, new Date(d)];
      },
    };
  },
  next7Days(): PresetRange {
    return {
      label: '7 prochains jours',
      dates: () => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return [start, end];
      },
    };
  },
  next30Days(): PresetRange {
    return {
      label: '30 prochains jours',
      dates: () => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 29);
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
  nextMonth(): PresetRange {
    return {
      label: 'Mois prochain',
      dates: () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
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
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return [start, end];
      },
    };
  },
  thisWeekend(): PresetRange {
    return {
      label: 'Ce weekend',
      dates: () => {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const daysUntilSat = ((6 - dayOfWeek) + 7) % 7 || 7;
        const start = new Date(now);
        start.setDate(now.getDate() + daysUntilSat);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 1);
        return [start, end];
      },
    };
  },
  // Legacy aliases (backward-compat)
  last7Days(): PresetRange {
    return { ...presetRanges.next7Days(), label: '7 prochains jours' };
  },
  last30Days(): PresetRange {
    return { ...presetRanges.next30Days(), label: '30 prochains jours' };
  },
};
