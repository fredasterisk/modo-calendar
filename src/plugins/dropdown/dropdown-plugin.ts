// src/plugins/dropdown/dropdown-plugin.ts
// Month/Year dropdown picker plugin for ModoCalendar (ShadCN captionLayout="dropdown" style)

import type { CalendarPlugin, CalendarInstance } from '../../core/types';
import { getMonthName } from '../../core/i18n';

const dropdownCSS = `
.mc-dropdown-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.mc-dropdown-select {
  appearance: none;
  -webkit-appearance: none;
  border: 1px solid var(--mc-border, #e2e8f0);
  border-radius: 0.5rem;
  background: var(--mc-bg, #fff);
  color: var(--mc-fg, #0f172a);
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0.25rem 1.5rem 0.25rem 0.5rem;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.375rem center;
  transition: border-color var(--mc-transition, 150ms ease);
}
.mc-dropdown-select:hover {
  border-color: var(--mc-accent, #2563eb);
}
.mc-dropdown-select:focus-visible {
  outline: 2px solid var(--mc-accent, #2563eb);
  outline-offset: 2px;
}
`;

function injectCSS(root: ShadowRoot | HTMLElement | null): void {
  if (!root) return;
  const id = 'mc-dropdown-css';
  if (root instanceof ShadowRoot) {
    if (root.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = dropdownCSS;
    root.appendChild(style);
  } else {
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = dropdownCSS;
      document.head.appendChild(style);
    }
  }
}

export interface DropdownPluginOptions {
  yearRange?: [number, number];
}

export function dropdownPlugin(options: DropdownPluginOptions = {}): CalendarPlugin {
  const currentYear = new Date().getFullYear();
  const [yearStart, yearEnd] = options.yearRange || [currentYear - 10, currentYear + 10];

  return {
    name: 'dropdown',
    options: options as Record<string, unknown>,

    onShadowReady(calendar: CalendarInstance) {
      injectCSS(calendar.shadowRoot || calendar.shadowHost);
    },

    onRender(calendar: CalendarInstance) {
      if (!calendar.container) return;

      // Replace all mc-month-label elements with dropdowns
      const labels = calendar.container.querySelectorAll('.mc-month-label');
      labels.forEach((labelEl) => {
        const text = labelEl.textContent || '';
        const parent = labelEl.parentElement;
        if (!parent || labelEl.classList.contains('mc-dropdown-header')) return;

        // Parse current month/year from label text
        const match = text.match(/^(.+?)\s+(\d{4})$/);
        if (!match) return;
        const displayedYear = Number(match[2]);

        // Find which month index this corresponds to
        let displayedMonth = -1;
        for (let m = 0; m < 12; m++) {
          const testDate = new Date(displayedYear, m, 1);
          const testName = getMonthName(testDate, calendar.locale);
          if (testName === match[1].trim()) {
            displayedMonth = m;
            break;
          }
        }
        if (displayedMonth === -1) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'mc-dropdown-header';
        wrapper.setAttribute('aria-live', 'polite');

        // Month select
        const monthSelect = document.createElement('select');
        monthSelect.className = 'mc-dropdown-select';
        monthSelect.setAttribute('aria-label', 'Select month');
        for (let m = 0; m < 12; m++) {
          const opt = document.createElement('option');
          opt.value = String(m);
          opt.textContent = getMonthName(new Date(displayedYear, m, 1), calendar.locale);
          if (m === displayedMonth) opt.selected = true;
          monthSelect.appendChild(opt);
        }

        // Year select
        const yearSelect = document.createElement('select');
        yearSelect.className = 'mc-dropdown-select';
        yearSelect.setAttribute('aria-label', 'Select year');
        for (let y = yearStart; y <= yearEnd; y++) {
          const opt = document.createElement('option');
          opt.value = String(y);
          opt.textContent = String(y);
          if (y === displayedYear) opt.selected = true;
          yearSelect.appendChild(opt);
        }

        const handleChange = () => {
          const newMonth = Number(monthSelect.value);
          const newYear = Number(yearSelect.value);
          // Calculate offset from calendar.date
          const baseMonth = calendar.date.getMonth();
          const baseYear = calendar.date.getFullYear();
          const offset = (newYear - baseYear) * 12 + (newMonth - baseMonth);

          // If months plugin, adjust offsets; otherwise set navigationOffset
          if (calendar.monthOffsets) {
            // Find which column this dropdown belongs to
            const col = (labelEl as HTMLElement).closest('.mc-month-col');
            const cols = Array.from(calendar.container!.querySelectorAll('.mc-month-col'));
            const colIdx = col ? cols.indexOf(col) : 0;
            calendar.monthOffsets[colIdx] = offset - colIdx;
          } else {
            calendar.navigationOffset = offset;
          }
          calendar.renderCalendar();
          calendar.updateDayClasses();
          calendar.emit('monthChanged', { date: new Date(newYear, newMonth, 1), direction: 'jump' });
        };

        monthSelect.addEventListener('change', handleChange);
        yearSelect.addEventListener('change', handleChange);

        wrapper.appendChild(monthSelect);
        wrapper.appendChild(yearSelect);

        labelEl.replaceWith(wrapper);
      });
    },
  };
}
