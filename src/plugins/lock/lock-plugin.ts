// src/plugins/lock/lock-plugin.ts
// Plugin to handle blocked dates, no-range-start, and no-range-end for ModoCalendar

import pluginStyles from './styles.css?raw';
import type { CalendarPlugin, CalendarInstance } from '../../core/types';

function injectCSS(root: ShadowRoot | HTMLElement | null): void {
  if (!root) return;
  const id = 'mc-lock-css';
  if (root instanceof ShadowRoot) {
    if (root.querySelector(`#${id}`)) return;
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

function getUTCMidnightTimestamp(d: Date | number | string): number {
  if (typeof d === 'number') {
    const date = new Date(d);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  if (d instanceof Date) {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  if (typeof d === 'string') {
    const [y, m, day] = d.split('-').map(Number);
    return Date.UTC(y, m - 1, day);
  }
  return d as number;
}

function parseYMD(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export interface LockPluginOptions {
  blockedDates?: (string | number)[];
  noRangeStartDates?: (string | number)[];
  noRangeEndDates?: (string | number)[];
}

export function lockPlugin(options: LockPluginOptions = {}): CalendarPlugin {
  return {
    name: 'lock',
    options: options as Record<string, unknown>,

    onShadowReady(calendar: CalendarInstance) {
      injectCSS(calendar.shadowRoot || calendar.shadowHost);
    },

    onInit(calendar: CalendarInstance) {
      // Setters for lock states
      calendar.setBlockedDates = (dates: (string | number)[]) => {
        calendar.blockedDates = dates.map(getUTCMidnightTimestamp);
        calendar.renderCalendar();
        calendar.updateDayClasses();
      };
      calendar.setNoRangeStartDates = (dates: (string | number)[]) => {
        calendar.noRangeStartDates = dates.map(getUTCMidnightTimestamp);
        calendar.renderCalendar();
        calendar.updateDayClasses();
      };
      calendar.setNoRangeEndDates = (dates: (string | number)[]) => {
        calendar.noRangeEndDates = dates.map(getUTCMidnightTimestamp);
        calendar.renderCalendar();
        calendar.updateDayClasses();
      };

      // Override updateDayClasses
      const originalUpdateDayClasses = calendar.updateDayClasses.bind(calendar);
      calendar.updateDayClasses = function (this: CalendarInstance) {
        let fromDate = this.startDate;
        let toDate = this.endDate || (this.startDate && this.hoverDate ? this.hoverDate : null);
        const blocked = (this.blockedDates || []).map(getUTCMidnightTimestamp);
        const noStart = (this.noRangeStartDates || []).map(getUTCMidnightTimestamp);
        const noEnd = (this.noRangeEndDates || []).map(getUTCMidnightTimestamp);

        originalUpdateDayClasses();
        if (!this.dayElements) return;

        // Remove denied classes
        this.dayElements.forEach(({ el }) => el.classList.remove('mc-day--denied'));

        // Limit hover range to not exceed a blocked date
        if (this.mode === 'range' && fromDate && this.hoverDate && !this.endDate) {
          const dir = fromDate < this.hoverDate ? 1 : -1;
          const current = new Date(fromDate);
          let hoverLimit = this.hoverDate;
          while (
            (dir > 0 && current <= this.hoverDate) ||
            (dir < 0 && current >= this.hoverDate)
          ) {
            const t = current.getTime();
            if (blocked.includes(t) && t !== fromDate.getTime()) {
              hoverLimit = new Date(current);
              hoverLimit.setDate(hoverLimit.getDate() - dir);
              break;
            }
            current.setDate(current.getDate() + dir);
          }
          toDate = hoverLimit;
        }

        this.dayElements.forEach(({ el, date }) => {
          const t = getUTCMidnightTimestamp(date);
          if (blocked.includes(t)) el.classList.add('mc-day--blocked');
          if (noStart.includes(t)) el.classList.add('mc-day--no-range-start');
          if (noEnd.includes(t)) el.classList.add('mc-day--no-range-end');
        });

        // Denied hover feedback
        if (this.mode === 'range' && fromDate && toDate && !this.endDate) {
          const fromTime = getUTCMidnightTimestamp(fromDate);
          const toTime = getUTCMidnightTimestamp(toDate);
          const minTime = Math.min(fromTime, toTime);
          const maxTime = Math.max(fromTime, toTime);
          let denied = false;

          const current = new Date(
            Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate()),
          );
          const dir = fromDate < toDate ? 1 : -1;
          while (
            (dir > 0 && current.getTime() <= toTime) ||
            (dir < 0 && current.getTime() >= toTime)
          ) {
            const tt = current.getTime();
            if (blocked.includes(tt) && tt !== fromTime && tt !== toTime) {
              denied = true;
              break;
            }
            current.setUTCDate(current.getUTCDate() + dir);
          }

          if (denied) {
            this.dayElements.forEach(({ el, date }) => {
              const t = getUTCMidnightTimestamp(date);
              if (t >= minTime && t <= maxTime && !blocked.includes(t)) {
                el.classList.add('mc-day--denied');
              }
            });
          }
        }
      };

      // Override selectDate
      const originalSelectDate = calendar.selectDate.bind(calendar);
      calendar.selectDate = function (this: CalendarInstance, selected: Date, monthIndex: number) {
        const t = getUTCMidnightTimestamp(selected);
        const noStart = this.noRangeStartDates || [];
        const noEnd = this.noRangeEndDates || [];

        // Range start on no-start date
        if (this.mode === 'range' && (!this.startDate || (this.startDate && this.endDate))) {
          if (noStart.includes(t)) {
            this.triggerInvalidRangeFeedback();
            return;
          }
        }

        // Range end validation
        if (this.mode === 'range' && this.startDate && !this.endDate) {
          const startT = getUTCMidnightTimestamp(this.startDate);
          if (noEnd.includes(t)) {
            this.triggerInvalidRangeFeedback();
            return;
          }
          if (
            (noStart.includes(startT) && noEnd.includes(t)) ||
            (noEnd.includes(startT) && noStart.includes(t))
          ) {
            this.triggerInvalidRangeFeedback();
            return;
          }
          if (noStart.includes(t) && t < startT) {
            this.triggerInvalidRangeFeedback();
            return;
          }

          // Check blocked in path
          const from = new Date(this.startDate.getFullYear(), this.startDate.getMonth(), this.startDate.getDate());
          const to = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
          const dir = from < to ? 1 : -1;
          const current = new Date(from);
          while ((dir > 0 && current <= to) || (dir < 0 && current >= to)) {
            const tt = getUTCMidnightTimestamp(current);
            if (
              this.blockedDates?.includes(tt) &&
              tt !== getUTCMidnightTimestamp(from) &&
              tt !== getUTCMidnightTimestamp(to)
            ) {
              this.triggerInvalidRangeFeedback();
              return;
            }
            current.setDate(current.getDate() + dir);
          }
        }

        return originalSelectDate(selected, monthIndex);
      };

      // Store initial options
      calendar._lockInitOptions = options as Record<string, unknown>;
      calendar.blockedDates = [];
      calendar.noRangeStartDates = [];
      calendar.noRangeEndDates = [];
    },

    onRender(calendar: CalendarInstance) {
      if (calendar._lockInitOptions) {
        const opts = calendar._lockInitOptions as LockPluginOptions;
        if (opts.blockedDates) {
          calendar.blockedDates = opts.blockedDates.map((d) =>
            typeof d === 'number' ? d : parseYMD(d as string).getTime(),
          );
        }
        if (opts.noRangeStartDates) {
          calendar.noRangeStartDates = opts.noRangeStartDates.map((d) =>
            typeof d === 'number' ? d : parseYMD(d as string).getTime(),
          );
        }
        if (opts.noRangeEndDates) {
          calendar.noRangeEndDates = opts.noRangeEndDates.map((d) =>
            typeof d === 'number' ? d : parseYMD(d as string).getTime(),
          );
        }
        delete calendar._lockInitOptions;
        calendar.updateDayClasses?.();
        return;
      }
      calendar.updateDayClasses?.();
    },
  };
}
