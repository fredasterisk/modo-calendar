// src/plugins/time/time-plugin.ts
// Time selection plugin for ModoCalendar
// Supports: single, range (arrival/departure), multiple (per-date)
// Picker types: 'blocks' (time slot grid) | 'spinner' (hour:minute wheels)

import pluginStyles from './styles.css?raw';
import type { CalendarPlugin, CalendarInstance, TimeSlot } from '../../core/types';
import { formatTime, formatDateDisplay } from '../../core/i18n';

/** Minimal effect shape returned by lock plugin's getDateEffect (runtime duck-typing). */
interface LockDateEffect {
  blocked: boolean;
  blockAllTimes: boolean;
  blockedTimes: string[];
}
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

/** Resolve lock rules from the calendar instance (if lock plugin is loaded). */
function _getLockRules(calendar: CalendarInstance): unknown[] {
  const direct = calendar._lockRules as unknown[] | undefined;
  if (direct?.length) return direct;

  const lockOpts = calendar.plugins?.find((p) => p.name === 'lock')?.options as
    { rules?: unknown[] } | undefined;
  return lockOpts?.rules || [];
}

/** Check if a time slot starting at given minutes is blocked by lock rules for a given date. */
function isTimeBlockedByRules(calendar: CalendarInstance, date: Date, _timeLabel: string, rawHour?: number, rawMinute?: number): boolean {
  const rules = _getLockRules(calendar);
  if (!rules.length) return false;

  // Use lock plugin's getDateEffect exposed at runtime
  const getEffect = calendar._getDateEffect as ((rules: unknown[], date: Date) => LockDateEffect) | undefined;
  if (!getEffect) return false;

  const effect = getEffect(rules, date);
  if (effect.blockAllTimes) return true;
  if (!effect.blockedTimes.length) return false;

  // Use raw hour/minute if provided (avoids locale formatting issues)
  const timeMins = (rawHour !== undefined && rawMinute !== undefined)
    ? rawHour * 60 + rawMinute
    : _parseTimeToMinutes(_timeLabel);
  if (timeMins === null) return false;

  for (const range of effect.blockedTimes) {
    if (range.includes('-')) {
      const [start, end] = range.split('-').map(_parseTimeToMinutes);
      if (start !== null && end !== null && timeMins >= start && timeMins < end) return true;
    } else {
      if (_parseTimeToMinutes(range) === timeMins) return true;
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
  arrivalDeparture?: boolean;
  /** Hide the calendar grid and header to render only the time picker for a fixed date. Requires `date`. */
  hideCalendar?: boolean;
  /** Fixed date for time-only flows. Accepts a Date instance or a "YYYY-MM-DD" string. Required when `hideCalendar` is true. */
  date?: string | Date;
}

function _parseFixedDate(d: string | Date | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  if (typeof d === 'string') {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const fallback = new Date(d);
    return isNaN(fallback.getTime()) ? null : fallback;
  }
  return null;
}

export function timePlugin(options: TimePluginOptions = {}): CalendarPlugin {
  const pickerType = options.pickerType || 'blocks';
  let _ac: AbortController | null = null;

  // Validate options
  if (options.from && !/^\d{1,2}:\d{2}$/.test(options.from)) {
    console.warn(`[ModoCalendar:timePlugin] Invalid 'from' format "${options.from}". Expected "HH:MM".`);
  }
  if (options.to && !/^\d{1,2}:\d{2}$/.test(options.to)) {
    console.warn(`[ModoCalendar:timePlugin] Invalid 'to' format "${options.to}". Expected "HH:MM".`);
  }
  if (options.interval !== undefined && (options.interval <= 0 || !Number.isFinite(options.interval))) {
    console.warn(`[ModoCalendar:timePlugin] Invalid 'interval' value ${options.interval}. Must be a positive number.`);
  }
  if (options.minuteStep !== undefined && (options.minuteStep <= 0 || options.minuteStep > 60)) {
    console.warn(`[ModoCalendar:timePlugin] Invalid 'minuteStep' value ${options.minuteStep}. Must be between 1 and 60.`);
  }

  return {
    name: 'timePlugin',
    options: options as Record<string, unknown>,

    onShadowReady(calendar: CalendarInstance) {
      injectCSS(calendar.shadowRoot || calendar.shadowHost);
    },

    onInit(calendar: CalendarInstance) {
      calendar._timePluginState = {
        selectedTimes: {},
        selectedTimePairs: {},
        _lastDateClicked: null,
      };
      calendar.selectedTimes = {};

      // Time-only mode: seed the fixed date so the time picker renders immediately.
      if (options.hideCalendar) {
        const fixed = _parseFixedDate(options.date);
        if (!fixed) {
          console.warn(
            `[ModoCalendar:timePlugin] hideCalendar=true requires a valid 'date' option (Date instance or "YYYY-MM-DD" string). Falling back to interactive calendar.`,
          );
        } else {
          calendar.date = new Date(fixed);
          calendar.selectedDate = fixed;
          calendar.startDate = fixed;
          if (calendar.mode === 'multiple') {
            if (!calendar.selectedDates.some((d) => d.getTime() === fixed.getTime())) {
              calendar.selectedDates.push(fixed);
            }
          } else if (calendar.mode === 'single') {
            // Push so the updateHiddenInput hook (which expects selectedDates.length === 1) serializes time data.
            calendar.selectedDates = [fixed];
          }
          calendar._timePluginState._lastDateClicked = fixed;
        }
      }

      // Hook: updateHiddenInput — include time data
      const unhookHiddenInput = calendar._addHook('updateHiddenInput', (original) => {
        return function () {
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

          if (mode === 'range' && calendar.startDate && calendar.endDate) {
            const startKey = getDateKey(calendar.startDate);
            const endKey = getDateKey(calendar.endDate);
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
            const dateKeys = selectedDates.map((d) => getDateKey(d));
            if (options.arrivalDeparture) {
              const pairs = calendar._timePluginState?.selectedTimePairs || {};
              const timePairs: Record<number, { arrival: string | null; departure: string | null }> = {};
              dateKeys.forEach((k) => {
                timePairs[k] = pairs[k] || { arrival: null, departure: null };
              });
              if (calendar.hiddenInput) {
                calendar.hiddenInput.value = JSON.stringify({
                  mode: 'multiple',
                  dates: dateKeys,
                  timePairs,
                });
              }
            } else {
              const timesMap: Record<number, string | null> = {};
              dateKeys.forEach((k) => {
                timesMap[k] = times[k] || null;
              });
              if (calendar.hiddenInput) {
                calendar.hiddenInput.value = JSON.stringify({
                  mode: 'multiple',
                  dates: dateKeys,
                  times: timesMap,
                });
              }
            }
            return;
          }

          original();
        };
      });

      // Hook: updateButtonLabel — append time info
      const unhookButtonLabel = calendar._addHook('updateButtonLabel', (original) => {
        return function () {
          const activeDate =
            calendar._timePluginState?._lastDateClicked || calendar.startDate || calendar.selectedDates?.[0];
          if (!activeDate) {
            original();
            return;
          }
          const times = calendar._timePluginState?.selectedTimes || {};
          const labelDiv = calendar.trigger?.querySelector('.dates') as HTMLElement | null;
          if (!labelDiv) { original(); return; }

          // Multiple mode: show all dates with their times
          if (calendar.mode === 'multiple' && calendar.selectedDates.length > 0) {
            if (options.arrivalDeparture) {
              const pairs = calendar._timePluginState?.selectedTimePairs || {};
              const anyPair = calendar.selectedDates.some((d) => {
                const p = pairs[getDateKey(d)];
                return p && (p.arrival || p.departure);
              });
              if (anyPair) {
                const parts = [...calendar.selectedDates]
                  .sort((a, b) => a.getTime() - b.getTime())
                  .map((d) => {
                    const k = getDateKey(d);
                    const p = pairs[k];
                    const dl = formatDateDisplay(d, calendar.locale);
                    if (p && (p.arrival || p.departure)) {
                      const arr = p.arrival || '–';
                      const dep = p.departure || '–';
                      return `${dl} (${arr} → ${dep})`;
                    }
                    return dl;
                  });
                labelDiv.textContent = parts.join(', ');
                return;
              }
            } else {
              const anyTime = calendar.selectedDates.some((d) => times[getDateKey(d)]);
              if (anyTime) {
                const parts = [...calendar.selectedDates]
                  .sort((a, b) => a.getTime() - b.getTime())
                  .map((d) => {
                    const k = getDateKey(d);
                    const t = times[k];
                    const dl = formatDateDisplay(d, calendar.locale);
                    return t ? `${dl} · ${t}` : dl;
                  });
                labelDiv.textContent = parts.join(', ');
                return;
              }
            }
            original();
            return;
          }

          const key = getDateKey(activeDate);
          const block = times[key];

          if (block) {
            if (calendar.mode === 'range' && calendar.startDate && calendar.endDate) {
              const startKey = getDateKey(calendar.startDate);
              const endKey = getDateKey(calendar.endDate);
              const arrivalTime = times[startKey];
              const departureTime = times[endKey];
              const startLabel = formatDateDisplay(calendar.startDate, calendar.locale);
              const endLabel = formatDateDisplay(calendar.endDate, calendar.locale);
              const arr = arrivalTime ? ` · ${arrivalTime}` : '';
              const dep = departureTime ? ` · ${departureTime}` : '';
              labelDiv.textContent = `${startLabel}${arr} → ${endLabel}${dep}`;
            } else {
              const dateLabel = formatDateDisplay(activeDate, calendar.locale);
              labelDiv.textContent = `${dateLabel} · ${block}`;
            }
            return;
          }
          original();
        };
      });
    },

    onDestroy() {
      _ac?.abort();
      _ac = null;
    },

    onRender(calendar: CalendarInstance) {
      // Abort previous listeners before re-rendering time panel
      _ac?.abort();
      _ac = new AbortController();

      const container = calendar.container;
      if (!container) return;

      // Time-only mode: tag the container so CSS hides the calendar grid + header.
      if (options.hideCalendar) {
        container.classList.add('mc-time-only');
      }

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

      const signal = _ac!.signal;

      // Range mode: show arrival/departure labels
      if (calendar.mode === 'range' && calendar.startDate && calendar.endDate) {
        _renderRangeTimePickers(calendar, panel, times, signal);
        return;
      }

      // Multiple + arrivalDeparture: show arrival/departure per date
      if (calendar.mode === 'multiple' && options.arrivalDeparture) {
        _renderMultiDateArrivalDeparture(calendar, panel, activeDate, signal);
        return;
      }

      // Single or multiple: one time picker
      if (pickerType === 'spinner') {
        _renderSpinner(calendar, panel, key, times, activeDate, signal);
      } else {
        _renderBlocks(calendar, panel, key, times, activeDate, signal);
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
  signal: AbortSignal,
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

    const curH = cur.getHours();
    const curM = cur.getMinutes();
    const label = formatTime(cur, calendar.locale);
    const nextLabel = formatTime(next, calendar.locale);
    const blockKey = `${label} - ${nextLabel}`;

    const isBlocked = typeof opts.isTimeBlocked === 'function'
      ? opts.isTimeBlocked(label, [activeDate])
      : disabledTimes.includes(label) || isTimeBlockedByRules(calendar, activeDate, label, curH, curM);

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
    }, { signal });

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
  date: Date,
  signal: AbortSignal,
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

  function _isTimeBlocked(h: number, m: number): boolean {
    const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (typeof opts.isTimeBlocked === 'function') return opts.isTimeBlocked(label, [date]);
    return isTimeBlockedByRules(calendar, date, label, h, m);
  }

  const spinnerWrap = document.createElement('div');
  spinnerWrap.className = 'mc-time-spinner';

  const hourSpinner = createSpinner({
    min: 0,
    max: 23,
    step: 1,
    value: hour,
    label: 'Hours',
    isBlocked: (h) => _isTimeBlocked(h, minute),
    onChange: (v) => {
      hour = v;
      _commitSpinner();
    },
    signal,
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
    isBlocked: (m) => _isTimeBlocked(hour, m),
    onChange: (v) => {
      minute = v;
      _commitSpinner();
    },
    signal,
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
    _refreshMultiChips(calendar);
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
  signal: AbortSignal,
): void {
  const opts = (calendar.plugins?.find((p) => p.name === 'timePlugin')?.options || {}) as TimePluginOptions;
  const pickerType = opts.pickerType || 'blocks';
  const startDate = calendar.startDate!;
  const endDate = calendar.endDate!;
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
    _renderSpinnerInto(calendar, arrivalPanel, startKey, times, startDate, signal);
    _renderSpinnerInto(calendar, departurePanel, endKey, times, endDate, signal);
  } else {
    _renderBlocksInto(calendar, arrivalPanel, startKey, times, startDate, signal);
    _renderBlocksInto(calendar, departurePanel, endKey, times, endDate, signal);
  }
}

function _renderBlocksInto(
  calendar: CalendarInstance,
  target: HTMLElement,
  key: number,
  times: Record<number, string>,
  date: Date,
  signal: AbortSignal,
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

    const curH = cur.getHours();
    const curM = cur.getMinutes();
    const label = formatTime(cur, calendar.locale);
    const nextLabel = formatTime(next, calendar.locale);
    const blockKey = `${label} - ${nextLabel}`;

    const isBlocked = typeof opts.isTimeBlocked === 'function'
      ? opts.isTimeBlocked(label, [date])
      : disabledTimes.includes(label) || isTimeBlockedByRules(calendar, date, label, curH, curM);

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
    }, { signal });

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
  date: Date,
  signal: AbortSignal,
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

  function _isTimeBlocked(h: number, m: number): boolean {
    const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (typeof opts.isTimeBlocked === 'function') return opts.isTimeBlocked(label, [date]);
    return isTimeBlockedByRules(calendar, date, label, h, m);
  }

  const spinnerWrap = document.createElement('div');
  spinnerWrap.className = 'mc-time-spinner';

  const hourSpinner = createSpinner({
    min: 0, max: 23, step: 1, value: hour, label: 'Hours',
    isBlocked: (h) => _isTimeBlocked(h, minute),
    onChange: (v) => { hour = v; commit(); },
    signal,
  });
  const sep = document.createElement('span');
  sep.className = 'mc-time-separator';
  sep.textContent = ':';
  const minSpinner = createSpinner({
    min: 0, max: 59, step: minuteStep, value: minute, label: 'Minutes',
    isBlocked: (m) => _isTimeBlocked(hour, m),
    onChange: (v) => { minute = v; commit(); },
    signal,
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
    _refreshMultiChips(calendar);
    calendar.emit('timeSelected', { date: new Date(key), time: timeStr });
  }

  spinnerWrap.appendChild(hourSpinner);
  spinnerWrap.appendChild(sep);
  spinnerWrap.appendChild(minSpinner);
  target.appendChild(spinnerWrap);
}

// --- Multiple + arrival/departure per date ---

function _renderMultiDateArrivalDeparture(
  calendar: CalendarInstance,
  panel: HTMLElement,
  activeDate: Date,
  signal: AbortSignal,
): void {
  const opts = (calendar.plugins?.find((p) => p.name === 'timePlugin')?.options || {}) as TimePluginOptions;
  const pickerType = opts.pickerType || 'blocks';
  const key = getDateKey(activeDate);
  const state = calendar._timePluginState;
  if (!state) return;

  if (!state.selectedTimePairs[key]) {
    state.selectedTimePairs[key] = { arrival: null, departure: null };
  }
  const pair = state.selectedTimePairs[key];

  // Build a virtual "times" record for each slot so we can reuse _renderBlocksInto / _renderSpinnerInto
  const arrivalTimes: Record<number, string> = {};
  const departureTimes: Record<number, string> = {};
  if (pair.arrival) arrivalTimes[key] = pair.arrival;
  if (pair.departure) departureTimes[key] = pair.departure;

  const rangeWrap = document.createElement('div');
  rangeWrap.className = 'mc-time-range';

  // Arrival section
  const arrivalSection = document.createElement('div');
  arrivalSection.className = 'mc-time-section';
  const arrivalLabel = document.createElement('div');
  arrivalLabel.className = 'mc-time-label';
  arrivalLabel.textContent = `${calendar.locale.strings.arrival} — ${formatDateDisplay(activeDate, calendar.locale)}`;
  arrivalSection.appendChild(arrivalLabel);

  const arrivalPanel = document.createElement('div');
  arrivalPanel.className = 'mc-time-section-panel';
  arrivalSection.appendChild(arrivalPanel);

  // Departure section
  const departureSection = document.createElement('div');
  departureSection.className = 'mc-time-section';
  const departureLabel = document.createElement('div');
  departureLabel.className = 'mc-time-label';
  departureLabel.textContent = `${calendar.locale.strings.departure} — ${formatDateDisplay(activeDate, calendar.locale)}`;
  departureSection.appendChild(departureLabel);

  const departurePanel = document.createElement('div');
  departurePanel.className = 'mc-time-section-panel';
  departureSection.appendChild(departurePanel);

  rangeWrap.appendChild(arrivalSection);
  rangeWrap.appendChild(departureSection);
  panel.appendChild(rangeWrap);

  if (pickerType === 'spinner') {
    _renderSpinnerIntoPair(calendar, arrivalPanel, key, arrivalTimes, activeDate, 'arrival', signal);
    _renderSpinnerIntoPair(calendar, departurePanel, key, departureTimes, activeDate, 'departure', signal);
  } else {
    _renderBlocksIntoPair(calendar, arrivalPanel, key, arrivalTimes, activeDate, 'arrival', signal);
    _renderBlocksIntoPair(calendar, departurePanel, key, departureTimes, activeDate, 'departure', signal);
  }
}

function _renderBlocksIntoPair(
  calendar: CalendarInstance,
  target: HTMLElement,
  key: number,
  times: Record<number, string>,
  date: Date,
  slot: 'arrival' | 'departure',
  signal: AbortSignal,
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

    const curH = cur.getHours();
    const curM = cur.getMinutes();
    const label = formatTime(cur, calendar.locale);
    const nextLabel = formatTime(next, calendar.locale);
    const blockKey = `${label} - ${nextLabel}`;

    const isBlocked = typeof opts.isTimeBlocked === 'function'
      ? opts.isTimeBlocked(label, [date])
      : disabledTimes.includes(label) || isTimeBlockedByRules(calendar, date, label, curH, curM);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mc-time-block mc-btn';
    if (isBlocked) btn.classList.add('mc-time-block--blocked');
    if (selectedBlock === blockKey) btn.classList.add('mc-time-block--selected');
    btn.textContent = blockKey;
    btn.disabled = !!isBlocked;

    btn.addEventListener('click', () => {
      _selectTimePair(calendar, key, blockKey, date, slot);
      blocksDiv.querySelectorAll('.mc-time-block').forEach((b) => b.classList.remove('mc-time-block--selected'));
      btn.classList.add('mc-time-block--selected');
      animateSelect(btn);
    }, { signal });

    blocksDiv.appendChild(btn);
    cur = next;
  }

  target.appendChild(blocksDiv);
}

function _renderSpinnerIntoPair(
  calendar: CalendarInstance,
  target: HTMLElement,
  key: number,
  times: Record<number, string>,
  date: Date,
  slot: 'arrival' | 'departure',
  signal: AbortSignal,
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

  function _isTimeBlocked(h: number, m: number): boolean {
    const label = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (typeof opts.isTimeBlocked === 'function') return opts.isTimeBlocked(label, [date]);
    return isTimeBlockedByRules(calendar, date, label, h, m);
  }

  const spinnerWrap = document.createElement('div');
  spinnerWrap.className = 'mc-time-spinner';

  const hourSpinner = createSpinner({
    min: 0, max: 23, step: 1, value: hour, label: 'Hours',
    isBlocked: (h) => _isTimeBlocked(h, minute),
    onChange: (v) => { hour = v; commit(); },
    signal,
  });
  const sep = document.createElement('span');
  sep.className = 'mc-time-separator';
  sep.textContent = ':';
  const minSpinner = createSpinner({
    min: 0, max: 59, step: minuteStep, value: minute, label: 'Minutes',
    isBlocked: (m) => _isTimeBlocked(hour, m),
    onChange: (v) => { minute = v; commit(); },
    signal,
  });

  function commit(): void {
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    _selectTimePair(calendar, key, timeStr, date, slot);
  }

  spinnerWrap.appendChild(hourSpinner);
  spinnerWrap.appendChild(sep);
  spinnerWrap.appendChild(minSpinner);
  target.appendChild(spinnerWrap);
}

function _selectTimePair(
  calendar: CalendarInstance,
  key: number,
  time: string,
  date: Date,
  slot: 'arrival' | 'departure',
): void {
  const state = calendar._timePluginState;
  if (!state) return;

  if (!state.selectedTimePairs[key]) {
    state.selectedTimePairs[key] = { arrival: null, departure: null };
  }
  state.selectedTimePairs[key][slot] = time;

  calendar.updateButtonLabel();
  calendar.updateHiddenInput();
  _refreshMultiChips(calendar);
  calendar.emit('timeSelected', { date: new Date(key), time });
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
  _refreshMultiChips(calendar);
  calendar.emit('timeSelected', { date: new Date(key), time: blockKey });
}

/** Re-label .mc-remove-date chips with their selected time (multiple mode). */
function _refreshMultiChips(calendar: CalendarInstance): void {
  if (calendar.mode !== 'multiple') return;
  const state = calendar._timePluginState;
  if (!state || !calendar.container) return;

  const useArrivalDeparture = (calendar.plugins?.find((p) => p.name === 'timePlugin')?.options as TimePluginOptions)?.arrivalDeparture;

  const chips = calendar.container.querySelectorAll<HTMLElement>('.mc-remove-date');
  chips.forEach((chip) => {
    const k = chip.dataset.key;
    if (!k) return;
    const keyNum = Number(k);
    // Rebuild label: find matching date to format it
    const dateObj = calendar.selectedDates.find((d) => {
      const dt = new Date(d);
      dt.setUTCHours(0, 0, 0, 0);
      return dt.getTime() === keyNum;
    });
    if (!dateObj) return;
    let label = formatDateDisplay(dateObj, calendar.locale);

    if (useArrivalDeparture) {
      const pair = state.selectedTimePairs[keyNum];
      if (pair && (pair.arrival || pair.departure)) {
        const arr = pair.arrival || '–';
        const dep = pair.departure || '–';
        label += ` (${arr} → ${dep})`;
      }
    } else {
      const time = state.selectedTimes[keyNum];
      if (time) label += ` · ${time}`;
    }

    chip.textContent = label;
    chip.setAttribute('aria-label', `Remove ${label}`);
  });
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
