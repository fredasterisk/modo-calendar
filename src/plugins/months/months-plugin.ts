// src/plugins/months/months-plugin.ts
// Multi-month display plugin for ModoCalendar

import pluginStyles from './styles.css?raw';
import type { CalendarPlugin, CalendarInstance } from '../../core/types';
import { getMonthName } from '../../core/i18n';
import { staggerFadeIn } from '../../core/animations';

function injectCSS(root: ShadowRoot | HTMLElement | null): void {
  if (!root) return;
  const id = 'mc-months-css';
  if (root instanceof ShadowRoot) {
    if (root.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = pluginStyles;
    root.appendChild(style);
  } else {
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = pluginStyles;
      document.head.appendChild(style);
    }
  }
}

export interface MonthsPluginOptions {
  months?: number;
  strictRange2Months?: boolean;
}

export function monthsPlugin(options: MonthsPluginOptions = {}): CalendarPlugin {
  let _ac: AbortController | null = null;

  return {
    name: 'months',
    options: options as Record<string, unknown>,

    onShadowReady(calendar: CalendarInstance) {
      injectCSS(calendar.shadowRoot || calendar.shadowHost);
    },

    onInit(calendar: CalendarInstance) {
      calendar.months = typeof options.months === 'number' && options.months >= 2 ? options.months : 2;
    },

    onDestroy() {
      _ac?.abort();
      _ac = null;
    },

    onRender(calendar: CalendarInstance) {
      if (!calendar.months || calendar.months < 2) calendar.months = 2;
      if (!calendar.container) return;

      // Abort previous listeners before re-rendering
      _ac?.abort();
      _ac = new AbortController();
      const signal = _ac.signal;

      calendar.container.innerHTML = '';

      if (!calendar.monthOffsets || calendar.monthOffsets.length !== calendar.months) {
        calendar.monthOffsets = Array(calendar.months).fill(0) as number[];
      }

      const baseDate = new Date(calendar.date);
      calendar.dayElements = [];

      const monthsWrapper = document.createElement('div');
      monthsWrapper.className = 'mc-months-wrapper';
      calendar.container.appendChild(monthsWrapper);

      for (let i = 0; i < calendar.months; i++) {
        const offset = calendar.monthOffsets[i] || 0;
        const monthDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + i + offset, 1);
        const monthName = getMonthName(monthDate, calendar.locale);
        const year = monthDate.getFullYear();

        const monthCol = document.createElement('div');
        monthCol.className = 'mc-month-col';
        monthsWrapper.appendChild(monthCol);

        // Header
        const header = document.createElement('div');
        header.className = 'mc-header';

        const label = document.createElement('span');
        label.className = 'mc-month-label';
        label.textContent = `${monthName} ${year}`;
        label.setAttribute('aria-live', 'polite');

        const nav = document.createElement('span');
        nav.className = 'mc-nav';

        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'mc-nav-btn mc-nav-prev';
        prevBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
        prevBtn.dataset.month = String(i);
        prevBtn.setAttribute('aria-label', 'Previous month');

        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'mc-nav-btn mc-nav-next';
        nextBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
        nextBtn.dataset.month = String(i);
        nextBtn.setAttribute('aria-label', 'Next month');

        prevBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = Number((e.currentTarget as HTMLElement).dataset.month);
          if (idx === 0 && (calendar.monthOffsets![0] || 0) <= 0) return;

          if (idx > 0) {
            const prevMonthDate = new Date(
              baseDate.getFullYear(),
              baseDate.getMonth() + idx - 1 + (calendar.monthOffsets![idx - 1] || 0),
              1,
            );
            const newMonthDate = new Date(
              baseDate.getFullYear(),
              baseDate.getMonth() + idx + (calendar.monthOffsets![idx] || 0) - 1,
              1,
            );
            if (newMonthDate <= prevMonthDate) return;
          }

          calendar.monthOffsets![idx] = (calendar.monthOffsets![idx] || 0) - 1;
          _cascadeOffsets(calendar, idx, baseDate);
          calendar.renderCalendar();
          calendar.updateDayClasses();
          calendar.emit('monthChanged', { date: new Date(monthDate), direction: 'prev' });
        }, { signal });

        nextBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = Number((e.currentTarget as HTMLElement).dataset.month);

          if (idx > 0) {
            const prevMonthDate = new Date(
              baseDate.getFullYear(),
              baseDate.getMonth() + idx - 1 + (calendar.monthOffsets![idx - 1] || 0),
              1,
            );
            const newMonthDate = new Date(
              baseDate.getFullYear(),
              baseDate.getMonth() + idx + (calendar.monthOffsets![idx] || 0) + 1,
              1,
            );
            if (newMonthDate <= prevMonthDate) return;
          }

          calendar.monthOffsets![idx] = (calendar.monthOffsets![idx] || 0) + 1;
          _cascadeOffsets(calendar, idx, baseDate);
          calendar.renderCalendar();
          calendar.updateDayClasses();
          calendar.emit('monthChanged', { date: new Date(monthDate), direction: 'next' });
        }, { signal });

        nav.appendChild(prevBtn);
        nav.appendChild(nextBtn);
        header.appendChild(label);
        header.appendChild(nav);
        monthCol.appendChild(header);

        // Day grid
        const days = calendar.generateDays(monthDate, i);
        monthCol.appendChild(days);

        days.querySelectorAll('.mc-day').forEach((dayEl) => {
          const el = dayEl as HTMLElement & { _date?: Date };
          calendar.dayElements.push({ el, date: el._date!, monthIndex: i });
        });
      }

      // Multi-select list
      if (calendar.mode === 'multiple') {
        _renderMonthsMultiList(calendar);
      }
    },
  };
}

function _cascadeOffsets(calendar: CalendarInstance, idx: number, baseDate: Date): void {
  for (let j = idx + 1; j < calendar.months; j++) {
    const prevMonthDate = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth() + j - 1 + (calendar.monthOffsets![j - 1] || 0),
      1,
    );
    const nextMonthDate = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth() + j + (calendar.monthOffsets![j] || 0),
      1,
    );
    if (nextMonthDate <= prevMonthDate) {
      calendar.monthOffsets![j] =
        prevMonthDate.getMonth() -
        baseDate.getMonth() +
        1 +
        (prevMonthDate.getFullYear() - baseDate.getFullYear()) * 12 -
        j;
    }
  }
}

function _renderMonthsMultiList(calendar: CalendarInstance): void {
  if (!calendar.container) return;

  let multiList = calendar.container.querySelector('.mc-multi-list');
  if (!multiList) {
    multiList = document.createElement('div');
    multiList.className = 'mc-multi-list';
    calendar.container.appendChild(multiList);
  }
  multiList.innerHTML = '';

  let filteredDates = [...(calendar.selectedDates || [])];

  const timePlugin = calendar.plugins?.find((p) => p.name === 'timePlugin');
  if (timePlugin && calendar.hiddenInput?.value) {
    try {
      const val = JSON.parse(calendar.hiddenInput.value || '{}');
      if (val.times) {
        const getDateKey = (d: Date) => {
          const dt = new Date(d);
          dt.setUTCHours(0, 0, 0, 0);
          return dt.getTime();
        };
        filteredDates = filteredDates.filter(
          (d) => val.times[getDateKey(d)]?.length > 0,
        );
      }
    } catch { /* ignore */ }
  }

  if (
    timePlugin &&
    calendar._timePluginState?._lastDateClicked
  ) {
    const getDateKey = (d: Date) => {
      const dt = new Date(d);
      dt.setUTCHours(0, 0, 0, 0);
      return dt.getTime();
    };
    const lastKey = getDateKey(calendar._timePluginState._lastDateClicked);
    // Only re-add if the date is still in selectedDates (avoid phantom after deletion)
    const stillSelected = calendar.selectedDates.some((d) => getDateKey(d) === lastKey);
    if (stillSelected && !filteredDates.some((d) => getDateKey(d) === lastKey)) {
      filteredDates.push(calendar._timePluginState._lastDateClicked);
    }
  }

  if (filteredDates.length > 0) {
    const activeDate = calendar._timePluginState?._lastDateClicked || null;
    filteredDates.sort((a, b) => a.getTime() - b.getTime()).forEach((date) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mc-btn mc-remove-date';
      btn.dataset.key = String(calendar._dateKey(date));
      if (activeDate && calendar._dateKey(activeDate) === calendar._dateKey(date)) {
        btn.classList.add('mc-remove-date--active');
      }
      calendar._setChipLabel(btn, calendar._multiChipLabel(date));
      btn.onclick = () => calendar._removeSelectedDate(date);
      multiList!.appendChild(btn);
    });

    staggerFadeIn(Array.from(multiList.querySelectorAll('.mc-remove-date')) as HTMLElement[]);
  } else {
    const empty = document.createElement('div');
    empty.className = 'mc-multi-empty';
    empty.textContent = calendar.locale.strings.noDateSelected;
    multiList.appendChild(empty);
  }
}
