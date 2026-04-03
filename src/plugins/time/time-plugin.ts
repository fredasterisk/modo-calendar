// src/plugins/time/time-plugin.ts
// Time selection plugin for ModoCalendar
// Supports: single, range (arrival/departure), multiple (per-date)
// Picker types: 'blocks' (time slot grid) | 'spinner' (hour:minute wheels)

import pluginStyles from './styles.css?raw';
import type { CalendarPlugin, CalendarInstance, TimeSlot } from '../../core/types';
import type { LockRule, DateEffect } from '../lock/lock-plugin';
import { formatTime, formatDateDisplay } from '../../core/i18n';
import { animateSelect, staggerFadeIn } from '../../core/animations';
import { createSpinner } from './spinner';

function injectCSS(root: ShadowRoot | HTMLElement | null): void {
  if (!root) return;
  const id = 'mc-time-css';
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

function getDateKey(d: Date): number {
  const dt = new Date(d);
  dt.setUTCHours(0, 0, 0, 0);
  return dt.getTime();
}

/** Check if a time label ("HH:MM") is blocked by lock rules for a given date. */
function isTimeBlockedByRules(calendar: CalendarInstance, date: Date, timeLabel: string): boolean {
  const rules = calendar._lockRules as LockRule[] | undefined;
  if (!rules?.length) return false;

  // Lazy-load getDateEffect to avoid circular import at module level
  let getDateEffect: ((rules: LockRule[], date: Date) => DateEffect) | undefined;
  try {
    const lockPlugin = calendar.plugins?.find((p) => p.name === 'lock');
    if (!lockPlugin) return false;
    // Access exported function via dynamic lookup on the instance
    getDateEffect = calendar._getDateEffect as typeof getDateEffect;
  } catch {
    return false;
  }
  if (!getDateEffect) return false;

  const effect = getDateEffect(rules, date);
  if (effect.blockAllTimes) return true;
  if (!effect.blockedTimes.length) return false;

  // Parse the time label (e.g. "08:00")
  const timeMins = _parseTimeToMinutes(timeLabel);
  if (timeMins === null) return false;

  for (const rule of effect.blockedTimes) {
    // Range format: "HH:MM-HH:MM"
    if (rule.includes('-')) {
      const [start, end] = rule.split('-').map(_parseTimeToMinutes);
      if (start !== null && end !== null && timeMins >= start && timeMins < end) return true;
    } else {
      // Exact match: "HH:MM"
      if (_parseTimeToMinutes(rule) === timeMins) return true;
    }
  }
  return false;
}

function _parseTimeToMinutes(t: string): number | null {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export interface TimePluginOptions {
  from?: string;
  to?: string;
  interval?: number;
  pickerType?: 'blocks' | 'spinner';
  minuteStep?: number;
  disabledTimes?: string[];
  isTimeBlocked?: (time: string, dates: Date[]) => boolean;
}

export function timePlugin(options: TimePluginOptions = {}): CalendarPlugin {
  const pickerType = options.pickerType || 'blocks';

  return {
    name: 'timePlugin',
    options: options as Record<string, unknown>,

    onShadowReady(calendar: CalendarInstance) {
      injectCSS(calendar.shadowRoot || calendar.shadowHost);
    },

    onInit(calendar: CalendarInstance) {
      calendar._timePluginState = {
        selectedTimes: {},
        _lastDateClicked: null,
      };
      calendar.selectedTimes = {};

      // Override updateHiddenInput to include time data
      const originalUpdateHiddenInput = calendar.updateHiddenInput.bind(calendar);
      calendar.updateHiddenInput = function () {
        const { selectedDates, selectedTimes, mode } = calendar;
        const times = calendar._timePluginState?.selectedTimes || {};

        if (mode === 'single' && selectedDates.length === 1) {
          const key = getDateKey(selectedDates[0]);
          const block = times[key];
          if (block) {
            const ts = _parseBlockTimestamps(selectedDates[0], block);
            if (calendar.hiddenInput) {
              calendar.hiddenInput.value = JSON.stringify({
                mode: 'single',
                dates: [key],
                time: ts,
              });
            }
            return;
          }
        }

        if (mode === 'range' && selectedDates.length === 2) {
          const startKey = getDateKey(selectedDates[0]);
          const endKey = getDateKey(selectedDates[1]);
          if (calendar.hiddenInput) {
            calendar.hiddenInput.value = JSON.stringify({
              mode: 'range',
              start: startKey,
              end: endKey,
              arrivalTime: times[startKey] || null,
              departureTime: times[endKey] || null,
            });
          }
          return;
        }

        if (mode === 'multiple' && selectedDates.length > 0) {
          const entries: Record<number, string | null> = {};
          selectedDates.forEach((d) => {
            const k = getDateKey(d);
            entries[k] = times[k] || null;
          });
          if (calendar.hiddenInput) {
            calendar.hiddenInput.value = JSON.stringify({
              mode: 'multiple',
              dates: entries,
            });
          }
          return;
        }

        originalUpdateHiddenInput();
      };

      // Override updateButtonLabel to include time
      const originalUpdateButtonLabel = calendar.updateButtonLabel.bind(calendar);
      calendar.updateButtonLabel = function () {
        const activeDate =
          calendar._timePluginState?._lastDateClicked || calendar.selectedDates?.[0];
        if (!activeDate) {
          originalUpdateButtonLabel();
          return;
        }
        const key = getDateKey(activeDate);
        const times = calendar._timePluginState?.selectedTimes || {};
        const block = times[key];
        const labelDiv = calendar.trigger?.querySelector('.dates') as HTMLElement | null;

        if (block && labelDiv) {
          if (calendar.mode === 'range' && calendar.selectedDates.length === 2) {
            const startKey = getDateKey(calendar.selectedDates[0]);
            const endKey = getDateKey(calendar.selectedDates[1]);
            const arrivalTime = times[startKey];
            const departureTime = times[endKey];
            const startLabel = formatDateDisplay(calendar.selectedDates[0], calendar.locale);
            const endLabel = formatDateDisplay(calendar.selectedDates[1], calendar.locale);
            const arr = arrivalTime ? ` · ${arrivalTime}` : '';
            const dep = departureTime ? ` · ${departureTime}` : '';
            labelDiv.textContent = `${startLabel}${arr} → ${endLabel}${dep}`;
          } else {
            const dateLabel = formatDateDisplay(activeDate, calendar.locale);
            labelDiv.textContent = `${dateLabel} · ${block}`;
          }
          return;
        }
        originalUpdateButtonLabel();
      };
    },

    onRender(calendar: CalendarInstance) {
      const container = calendar.container;
      if (!container) return;

      const state = calendar._timePluginState;
      if (!state) return;

      const activeDate = state._lastDateClicked;
      if (!activeDate) {
        const existing = container.querySelector('.mc-time-panel');
        if (existing) existing.remove();
        return;
      }

      const key = getDateKey(activeDate);
      const times = state.selectedTimes || {};

      // Find or create panel
      let panel = container.querySelector('.mc-time-panel') as HTMLElement | null;
      if (!panel) {
        panel = document.createElement('div');
        panel.className = 'mc-time-panel';
        // Insert after days grid
        const daysGrid = container.querySelector('.mc-days');
        if (daysGrid) container.insertBefore(panel, daysGrid.nextSibling);
        else container.appendChild(panel);
      } else {
        const daysGrid = container.querySelector('.mc-days');
        if (daysGrid && daysGrid.nextSibling !== panel) {
          container.insertBefore(panel, daysGrid.nextSibling);
        }
      }
      panel.innerHTML = '';

      // Range mode: show arrival/departure labels
      if (calendar.mode === 'range' && calendar.selectedDates.length === 2) {
        _renderRangeTimePickers(calendar, panel, times);
        return;
      }

      // Single or multiple: one time picker
      if (pickerType === 'spinner') {
        _renderSpinner(calendar, panel, key, times);
      } else {
        _renderBlocks(calendar, panel, key, times, activeDate);
      }
    },
  };
}

// --- Block picker ---

function _renderBlocks(
  calendar: CalendarInstance,
  panel: HTMLElement,
  key: number,
  times: Record<number, string>,
  activeDate: Date,
): void {
  const from = (calendar.plugins?.find((p) => p.name === 'timePlugin')?.options as TimePluginOptions)?.from || '08:00';
  const to = (calendar.plugins?.find((p) => p.name === 'timePlugin')?.options as TimePluginOptions)?.to || '16:00';
  const interval = (calendar.plugins?.find((p) => p.name === 'timePlugin')?.options as TimePluginOptions)?.interval ?? 60;
  const opts = (calendar.plugins?.find((p) => p.name === 'timePlugin')?.options || {}) as TimePluginOptions;
  const disabledTimes = opts.disabledTimes || [];

  const blocksDiv = document.createElement('div');
  blocksDiv.className = 'mc-time-blocks';

  const [fromH, fromM] = from.split(':').map(Number);
  const [toH, toM] = to.split(':').map(Number);
  let cur = new Date(0, 0, 0, fromH, fromM);
  const end = new Date(0, 0, 0, toH, toM);
  const selectedBlock = times[key] || null;

  const buttons: HTMLElement[] = [];

  while (cur < end) {
    const next = new Date(cur.getTime() + interval * 60000);
    if (next > end) break;

    const label = formatTime(cur, calendar.locale);
    const nextLabel = formatTime(next, calendar.locale);
    const blockKey = `${label} - ${nextLabel}`;

    const isBlocked = typeof opts.isTimeBlocked === 'function'
      ? opts.isTimeBlocked(label, [activeDate])
      : disabledTimes.includes(label) || isTimeBlockedByRules(calendar, activeDate, label);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mc-time-block mc-btn';
    if (isBlocked) btn.classList.add('mc-time-block--blocked');
    if (selectedBlock === blockKey) btn.classList.add('mc-time-block--selected');
    btn.textContent = blockKey;
    btn.disabled = !!isBlocked;
    btn.setAttribute('aria-label', blockKey);

    btn.addEventListener('click', () => {
      _selectTime(calendar, key, blockKey, activeDate);
      animateSelect(btn);
      // Update selected state in UI
      blocksDiv.querySelectorAll('.mc-time-block').forEach((b) => b.classList.remove('mc-time-block--selected'));
      btn.classList.add('mc-time-block--selected');
    });

    blocksDiv.appendChild(btn);
    buttons.push(btn);
    cur = next;
  }

  panel.appendChild(blocksDiv);
  staggerFadeIn(buttons, 20);
}

// --- Spinner picker ---

function _renderSpinner(
  calendar: CalendarInstance,
  panel: HTMLElement,
  key: number,
  times: Record<number, string>,
): void {
  const opts = (calendar.plugins?.find((p) => p.name === 'timePlugin')?.options || {}) as TimePluginOptions;
  const minuteStep = opts.minuteStep || 15;
  const existing = times[key];
  let hour = 9;
  let minute = 0;
  if (existing) {
    const m = existing.match(/^(\d{1,2}):(\d{2})/);
    if (m) {
      hour = Number(m[1]);
      minute = Number(m[2]);
    }
  }

  const spinnerWrap = document.createElement('div');
  spinnerWrap.className = 'mc-time-spinner';

  const hourSpinner = createSpinner({
    min: 0,
    max: 23,
    step: 1,
    value: hour,
    label: 'Hours',
    onChange: (v) => {
      hour = v;
      _commitSpinner();
    },
  });

  const sep = document.createElement('span');
  sep.className = 'mc-time-separator';
  sep.textContent = ':';

  const minSpinner = createSpinner({
    min: 0,
    max: 59,
    step: minuteStep,
    value: minute,
    label: 'Minutes',
    onChange: (v) => {
      minute = v;
      _commitSpinner();
    },
  });

  function _commitSpinner(): void {
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const state = calendar._timePluginState;
    if (state) {
      state.selectedTimes[key] = timeStr;
      calendar.selectedTimes = { ...state.selectedTimes };
    }
    calendar.updateButtonLabel();
    calendar.updateHiddenInput();
    calendar.emit('timeSelected', {
      date: new Date(key),
      time: timeStr,
    });
  }

  spinnerWrap.appendChild(hourSpinner);
  spinnerWrap.appendChild(sep);
  spinnerWrap.appendChild(minSpinner);
  panel.appendChild(spinnerWrap);
}

// --- Range mode: arrival + departure ---

function _renderRangeTimePickers(
  calendar: CalendarInstance,
  panel: HTMLElement,
  times: Record<number, string>,
): void {
  const opts = (calendar.plugins?.find((p) => p.name === 'timePlugin')?.options || {}) as TimePluginOptions;
  const pickerType = opts.pickerType || 'blocks';
  const startDate = calendar.selectedDates[0];
  const endDate = calendar.selectedDates[1];
  const startKey = getDateKey(startDate);
  const endKey = getDateKey(endDate);

  const rangeWrap = document.createElement('div');
  rangeWrap.className = 'mc-time-range';

  // Arrival
  const arrivalSection = document.createElement('div');
  arrivalSection.className = 'mc-time-section';
  const arrivalLabel = document.createElement('div');
  arrivalLabel.className = 'mc-time-label';
  arrivalLabel.textContent = `${calendar.locale.strings.arrival} — ${formatDateDisplay(startDate, calendar.locale)}`;
  arrivalSection.appendChild(arrivalLabel);

  const arrivalPanel = document.createElement('div');
  arrivalPanel.className = 'mc-time-section-panel';
  arrivalSection.appendChild(arrivalPanel);

  // Departure
  const departureSection = document.createElement('div');
  departureSection.className = 'mc-time-section';
  const departureLabel = document.createElement('div');
  departureLabel.className = 'mc-time-label';
  departureLabel.textContent = `${calendar.locale.strings.departure} — ${formatDateDisplay(endDate, calendar.locale)}`;
  departureSection.appendChild(departureLabel);

  const departurePanel = document.createElement('div');
  departurePanel.className = 'mc-time-section-panel';
  departureSection.appendChild(departurePanel);

  rangeWrap.appendChild(arrivalSection);
  rangeWrap.appendChild(departureSection);
  panel.appendChild(rangeWrap);

  if (pickerType === 'spinner') {
    _renderSpinnerInto(calendar, arrivalPanel, startKey, times);
    _renderSpinnerInto(calendar, departurePanel, endKey, times);
  } else {
    _renderBlocksInto(calendar, arrivalPanel, startKey, times, startDate);
    _renderBlocksInto(calendar, departurePanel, endKey, times, endDate);
  }
}

function _renderBlocksInto(
  calendar: CalendarInstance,
  target: HTMLElement,
  key: number,
  times: Record<number, string>,
  date: Date,
): void {
  const opts = (calendar.plugins?.find((p) => p.name === 'timePlugin')?.options || {}) as TimePluginOptions;
  const from = opts.from || '08:00';
  const to = opts.to || '16:00';
  const interval = opts.interval ?? 60;
  const disabledTimes = opts.disabledTimes || [];

  const blocksDiv = document.createElement('div');
  blocksDiv.className = 'mc-time-blocks';

  const [fromH, fromM] = from.split(':').map(Number);
  const [toH, toM] = to.split(':').map(Number);
  let cur = new Date(0, 0, 0, fromH, fromM);
  const end = new Date(0, 0, 0, toH, toM);
  const selectedBlock = times[key] || null;

  while (cur < end) {
    const next = new Date(cur.getTime() + interval * 60000);
    if (next > end) break;

    const label = formatTime(cur, calendar.locale);
    const nextLabel = formatTime(next, calendar.locale);
    const blockKey = `${label} - ${nextLabel}`;

    const isBlocked = typeof opts.isTimeBlocked === 'function'
      ? opts.isTimeBlocked(label, [date])
      : disabledTimes.includes(label) || isTimeBlockedByRules(calendar, date, label);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mc-time-block mc-btn';
    if (isBlocked) btn.classList.add('mc-time-block--blocked');
    if (selectedBlock === blockKey) btn.classList.add('mc-time-block--selected');
    btn.textContent = blockKey;
    btn.disabled = !!isBlocked;

    btn.addEventListener('click', () => {
      _selectTime(calendar, key, blockKey, date);
      blocksDiv.querySelectorAll('.mc-time-block').forEach((b) => b.classList.remove('mc-time-block--selected'));
      btn.classList.add('mc-time-block--selected');
      animateSelect(btn);
    });

    blocksDiv.appendChild(btn);
    cur = next;
  }

  target.appendChild(blocksDiv);
}

function _renderSpinnerInto(
  calendar: CalendarInstance,
  target: HTMLElement,
  key: number,
  times: Record<number, string>,
): void {
  const opts = (calendar.plugins?.find((p) => p.name === 'timePlugin')?.options || {}) as TimePluginOptions;
  const minuteStep = opts.minuteStep || 15;
  const existing = times[key];
  let hour = 9;
  let minute = 0;
  if (existing) {
    const m = existing.match(/^(\d{1,2}):(\d{2})/);
    if (m) {
      hour = Number(m[1]);
      minute = Number(m[2]);
    }
  }

  const spinnerWrap = document.createElement('div');
  spinnerWrap.className = 'mc-time-spinner';

  const hourSpinner = createSpinner({
    min: 0, max: 23, step: 1, value: hour, label: 'Hours',
    onChange: (v) => { hour = v; commit(); },
  });
  const sep = document.createElement('span');
  sep.className = 'mc-time-separator';
  sep.textContent = ':';
  const minSpinner = createSpinner({
    min: 0, max: 59, step: minuteStep, value: minute, label: 'Minutes',
    onChange: (v) => { minute = v; commit(); },
  });

  function commit(): void {
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const state = calendar._timePluginState;
    if (state) {
      state.selectedTimes[key] = timeStr;
      calendar.selectedTimes = { ...state.selectedTimes };
    }
    calendar.updateButtonLabel();
    calendar.updateHiddenInput();
    calendar.emit('timeSelected', { date: new Date(key), time: timeStr });
  }

  spinnerWrap.appendChild(hourSpinner);
  spinnerWrap.appendChild(sep);
  spinnerWrap.appendChild(minSpinner);
  target.appendChild(spinnerWrap);
}

// --- Shared helpers ---

function _selectTime(
  calendar: CalendarInstance,
  key: number,
  blockKey: string,
  date: Date,
): void {
  const state = calendar._timePluginState;
  if (!state) return;

  state.selectedTimes[key] = blockKey;
  calendar.selectedTimes = { ...state.selectedTimes };
  state._lastDateClicked = date;

  calendar.updateButtonLabel();
  calendar.updateHiddenInput();
  calendar.emit('timeSelected', { date: new Date(key), time: blockKey });
}

function _parseBlockTimestamps(date: Date, block: string): [number, number] | null {
  const parts = block.split(' - ');
  if (parts.length !== 2) return null;
  const [fromLabel, toLabel] = parts;
  const [fromH, fromMin] = fromLabel.split(':').map(Number);
  const [toH, toMin] = toLabel.split(':').map(Number);
  if ([fromH, fromMin, toH, toMin].some(isNaN)) return null;
  const fromTs = new Date(date.getFullYear(), date.getMonth(), date.getDate(), fromH, fromMin).getTime();
  const toTs = new Date(date.getFullYear(), date.getMonth(), date.getDate(), toH, toMin).getTime();
  return [fromTs, toTs];
}
