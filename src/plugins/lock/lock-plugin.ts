// src/plugins/lock/lock-plugin.ts
// Flexible date & time blocking engine for ModoCalendar
// Supports: individual dates, ranges, weekdays, recurring weekdays within date ranges,
// noCheckin/noCheckout, and per-rule time blocking.

import pluginStyles from './styles.css?raw';
import type { CalendarPlugin, CalendarInstance } from '../../core/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** A single blocking rule. Rules are evaluated in order; effects accumulate. */
export interface LockRule {
  /** Individual dates to match (YYYY-MM-DD strings or Date objects). */
  dates?: (string | Date)[];
  /** Date range start (inclusive). */
  from?: string | Date;
  /** Date range end (inclusive). */
  to?: string | Date;
  /** Weekdays to match (applied globally or within from/to range). */
  weekdays?: Weekday[];

  // ── Blocking effects ──────────────────────
  /** Fully block the day (unclickable, hatched visual). Default: true if no other effect set. */
  blocked?: boolean;
  /** Prevent starting a range on this day (can still be inside a range). */
  noCheckin?: boolean;
  /** Prevent ending a range on this day (can still be inside a range). */
  noCheckout?: boolean;

  // ── Time blocking ─────────────────────────
  /** Block specific time slots. "HH:MM-HH:MM" ranges or "HH:MM" start times. */
  blockedTimes?: string[];
  /** Block ALL time slots on matching days. */
  blockAllTimes?: boolean;
}

/** Backward-compatible flat options + new rules API */
export interface LockPluginOptions {
  /** Preferred: rules-based API */
  rules?: LockRule[];
  // Legacy flat API (mapped to rules internally)
  blockedDates?: (string | number)[];
  noRangeStartDates?: (string | number)[];
  noRangeEndDates?: (string | number)[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toMidnight(d: Date | string | number): number {
  if (typeof d === 'string') {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day, 0, 0, 0, 0).getTime();
  }
  if (typeof d === 'number') {
    const dt = new Date(d);
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0).getTime();
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

function getWeekdayKey(d: Date): Weekday {
  return (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as Weekday[])[d.getDay()];
}

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

// ─── Rule matching engine ────────────────────────────────────────────────────

export interface DateEffect {
  blocked: boolean;
  noCheckin: boolean;
  noCheckout: boolean;
  blockedTimes: string[];
  blockAllTimes: boolean;
}

function emptyEffect(): DateEffect {
  return { blocked: false, noCheckin: false, noCheckout: false, blockedTimes: [], blockAllTimes: false };
}

/** Check if a date matches a single rule's date/range/weekday selectors. */
function ruleMatchesDate(rule: LockRule, date: Date): boolean {
  const t = toMidnight(date);
  const wd = getWeekdayKey(date);

  const hasDates = rule.dates && rule.dates.length > 0;
  const hasRange = rule.from !== undefined || rule.to !== undefined;
  const hasWeekdays = rule.weekdays && rule.weekdays.length > 0;

  // If the rule has no selectors at all, it matches nothing
  if (!hasDates && !hasRange && !hasWeekdays) return false;

  // Exact dates list
  if (hasDates) {
    if (rule.dates!.some((d) => toMidnight(d) === t)) return true;
    if (!hasRange && !hasWeekdays) return false;
  }

  // Date range + optional weekday filter
  if (hasRange) {
    const fromT = rule.from ? toMidnight(rule.from) : -Infinity;
    const toT = rule.to ? toMidnight(rule.to) : Infinity;
    if (t < fromT || t > toT) return false;
    if (hasWeekdays) return rule.weekdays!.includes(wd);
    return true;
  }

  // Weekdays only (global, no range constraint)
  if (hasWeekdays) return rule.weekdays!.includes(wd);

  return false;
}

/** Compute the combined effect of all matching rules on a given date. Results are cached per rules array. */
let _effectCache: WeakMap<LockRule[], Map<number, DateEffect>> = new WeakMap();

function getDateEffect(rules: LockRule[], date: Date): DateEffect {
  let cache = _effectCache.get(rules);
  if (!cache) {
    cache = new Map();
    _effectCache.set(rules, cache);
  }
  const key = toMidnight(date);
  const cached = cache.get(key);
  if (cached) return cached;

  const effect = emptyEffect();
  for (const rule of rules) {
    if (!ruleMatchesDate(rule, date)) continue;
    const hasEffect = rule.blocked !== undefined || rule.noCheckin !== undefined ||
      rule.noCheckout !== undefined || rule.blockedTimes !== undefined ||
      rule.blockAllTimes !== undefined;

    if (!hasEffect || rule.blocked) effect.blocked = true;
    if (rule.noCheckin) effect.noCheckin = true;
    if (rule.noCheckout) effect.noCheckout = true;
    if (rule.blockAllTimes) effect.blockAllTimes = true;
    if (rule.blockedTimes) effect.blockedTimes.push(...rule.blockedTimes);
  }
  cache.set(key, effect);
  return effect;
}

// ─── Legacy conversion ───────────────────────────────────────────────────────

function legacyToRules(options: LockPluginOptions): LockRule[] {
  const rules: LockRule[] = [];
  if (options.blockedDates?.length) {
    rules.push({
      dates: options.blockedDates.map((d) => typeof d === 'number' ? new Date(d) : d as string),
      blocked: true,
    });
  }
  if (options.noRangeStartDates?.length) {
    rules.push({
      dates: options.noRangeStartDates.map((d) => typeof d === 'number' ? new Date(d) : d as string),
      blocked: false,
      noCheckin: true,
    });
  }
  if (options.noRangeEndDates?.length) {
    rules.push({
      dates: options.noRangeEndDates.map((d) => typeof d === 'number' ? new Date(d) : d as string),
      blocked: false,
      noCheckout: true,
    });
  }
  return rules;
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export function lockPlugin(options: LockPluginOptions = {}): CalendarPlugin {
  // Validate rule date strings
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  for (const rule of (options.rules || [])) {
    if (rule.dates) {
      for (const d of rule.dates) {
        if (typeof d === 'string' && !datePattern.test(d)) {
          console.warn(`[ModoCalendar:lockPlugin] Invalid date format "${d}" in rule. Expected "YYYY-MM-DD".`);
        }
      }
    }
    if (rule.from && typeof rule.from === 'string' && !datePattern.test(rule.from)) {
      console.warn(`[ModoCalendar:lockPlugin] Invalid 'from' date "${rule.from}". Expected "YYYY-MM-DD".`);
    }
    if (rule.to && typeof rule.to === 'string' && !datePattern.test(rule.to)) {
      console.warn(`[ModoCalendar:lockPlugin] Invalid 'to' date "${rule.to}". Expected "YYYY-MM-DD".`);
    }
  }

  const rules: LockRule[] = [
    ...legacyToRules(options),
    ...(options.rules || []),
  ];

  return {
    name: 'lock',
    options: options as Record<string, unknown>,

    onShadowReady(calendar: CalendarInstance) {
      injectCSS(calendar.shadowRoot || calendar.shadowHost);
    },

    onInit(calendar: CalendarInstance) {
      // Store rules on instance for time plugin & external access
      calendar._lockRules = rules;
      calendar._getDateEffect = (r: LockRule[], d: Date) => getDateEffect(r, d);

      // Runtime API
      calendar.setLockRules = (newRules: LockRule[]) => {
        calendar._lockRules = newRules;
        calendar.renderCalendar();
        calendar.updateDayClasses();
      };

      // Backward-compatible setters
      calendar.setBlockedDates = (dates: (string | number)[]) => {
        _replaceLegacyRule(calendar, 'blocked', {
          dates: dates.map((d) => typeof d === 'number' ? new Date(d) : d as string),
          blocked: true,
        });
      };
      calendar.setNoRangeStartDates = (dates: (string | number)[]) => {
        _replaceLegacyRule(calendar, 'noStart', {
          dates: dates.map((d) => typeof d === 'number' ? new Date(d) : d as string),
          blocked: false,
          noCheckin: true,
        });
      };
      calendar.setNoRangeEndDates = (dates: (string | number)[]) => {
        _replaceLegacyRule(calendar, 'noEnd', {
          dates: dates.map((d) => typeof d === 'number' ? new Date(d) : d as string),
          blocked: false,
          noCheckout: true,
        });
      };

      // Hook: updateDayClasses — add lock classes after core classes
      const unhookUpdateDayClasses = calendar._addHook('updateDayClasses', (original) => {
        return function (this: CalendarInstance) {
          const lockRules = (this._lockRules || []) as LockRule[];
          let fromDate = this.startDate;
          let toDate = this.endDate || (this.startDate && this.hoverDate ? this.hoverDate : null);

          original();
          if (!this.dayElements) return;

        // Remove previous lock classes
        this.dayElements.forEach(({ el }) => {
          el.classList.remove('mc-day--denied', 'mc-day--blocked', 'mc-day--no-range-start', 'mc-day--no-range-end', 'mc-day--lock-cont-left', 'mc-day--lock-cont-right', 'mc-day--lock-cont-top', 'mc-day--lock-cont-bottom');
          el.removeAttribute('aria-disabled');
        });

        // Limit hover range — stop at first blocked date in path
        if (this.mode === 'range' && fromDate && this.hoverDate && !this.endDate) {
          const dir = fromDate < this.hoverDate ? 1 : -1;
          const current = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
          let hoverLimit = this.hoverDate;
          while (
            (dir > 0 && current <= this.hoverDate) ||
            (dir < 0 && current >= this.hoverDate)
          ) {
            if (toMidnight(current) !== toMidnight(fromDate)) {
              const eff = getDateEffect(lockRules, current);
              if (eff.blocked) {
                hoverLimit = new Date(current);
                hoverLimit.setDate(hoverLimit.getDate() - dir);
                break;
              }
            }
            current.setDate(current.getDate() + dir);
          }
          toDate = hoverLimit;
        }

        // Apply classes
        this.dayElements.forEach(({ el, date }) => {
          const eff = getDateEffect(lockRules, date);
          if (eff.blocked) {
            el.classList.add('mc-day--blocked');
            el.setAttribute('aria-disabled', 'true');
          }
          if (eff.noCheckin) el.classList.add('mc-day--no-range-start');
          if (eff.noCheckout) el.classList.add('mc-day--no-range-end');
        });

        // Consecutive locked days: flatten touching corners (horizontal + vertical)
        // Applies to blocked, no-range-start, and no-range-end days
        const ws = this.locale?.firstDayOfWeek ?? 0;
        const lockedTimes = new Set<number>();
        for (const { el, date } of this.dayElements) {
          if (el.classList.contains('mc-day--blocked') || el.classList.contains('mc-day--no-range-start') || el.classList.contains('mc-day--no-range-end')) {
            lockedTimes.add(toMidnight(date));
          }
        }
        const ONE_DAY = 86400000;
        const SEVEN_DAYS = 7 * ONE_DAY;
        for (const { el, date } of this.dayElements) {
          const isLocked = el.classList.contains('mc-day--blocked') || el.classList.contains('mc-day--no-range-start') || el.classList.contains('mc-day--no-range-end');
          if (!isLocked) continue;
          const t = toMidnight(date);
          const dow = date.getDay();
          // Horizontal left
          if (dow !== ws && lockedTimes.has(t - ONE_DAY)) {
            el.classList.add('mc-day--lock-cont-left');
          }
          // Horizontal right
          const lastDow = (ws + 6) % 7;
          if (dow !== lastDow && lockedTimes.has(t + ONE_DAY)) {
            el.classList.add('mc-day--lock-cont-right');
          }
          // Vertical top (same column, previous row)
          if (lockedTimes.has(t - SEVEN_DAYS)) {
            el.classList.add('mc-day--lock-cont-top');
          }
          // Vertical bottom (same column, next row)
          if (lockedTimes.has(t + SEVEN_DAYS)) {
            el.classList.add('mc-day--lock-cont-bottom');
          }
        }

        // Denied hover feedback
        if (this.mode === 'range' && fromDate && toDate && !this.endDate) {
          const fromTime = toMidnight(fromDate);
          const toTime = toMidnight(toDate);
          const minTime = Math.min(fromTime, toTime);
          const maxTime = Math.max(fromTime, toTime);
          let denied = false;

          const current = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
          const dir = fromDate < toDate ? 1 : -1;
          while (
            (dir > 0 && toMidnight(current) <= toTime) ||
            (dir < 0 && toMidnight(current) >= toTime)
          ) {
            const ct = toMidnight(current);
            if (ct !== fromTime && ct !== toTime) {
              if (getDateEffect(lockRules, current).blocked) {
                denied = true;
                break;
              }
            }
            current.setDate(current.getDate() + dir);
          }

          if (denied) {
            this.dayElements.forEach(({ el, date }) => {
              const t = toMidnight(date);
              if (t >= minTime && t <= maxTime && !getDateEffect(lockRules, date).blocked) {
                el.classList.add('mc-day--denied');
              }
            });
          }
        }
        };
      });

      // Hook: selectDate — block selections on locked dates
      const unhookSelectDate = calendar._addHook('selectDate', (original) => {
        return function (this: CalendarInstance, selected: Date, monthIndex: number) {
          const lockRules = (this._lockRules || []) as LockRule[];
          const eff = getDateEffect(lockRules, selected);

        // Allow deselecting the current start date (click same date again)
        if (
          this.mode === 'range' &&
          this.startDate && !this.endDate &&
          selected.getTime() === this.startDate.getTime()
        ) {
          return original(selected, monthIndex);
        }

        // Fully blocked: reject in all modes
        if (eff.blocked) {
          this.triggerInvalidRangeFeedback?.();
          return;
        }

        // Range mode: checkin/checkout enforcement
        if (this.mode === 'range') {
          const isStart = !this.startDate || (this.startDate && this.endDate);
          const isEnd = this.startDate && !this.endDate;

          if (isStart && eff.noCheckin) {
            this.notifyInvalidSelection?.('Cette date ne permet pas de check-in', 'warning');
            this.triggerInvalidRangeFeedback?.();
            return;
          }

          if (isEnd) {
            if (eff.noCheckout) {
              this.notifyInvalidSelection?.('Cette date ne permet pas de check-out', 'warning');
              this.triggerInvalidRangeFeedback?.();
              return;
            }

            // Check path for blocked dates
            const from = new Date(this.startDate!.getFullYear(), this.startDate!.getMonth(), this.startDate!.getDate());
            const to = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
            const dir = from < to ? 1 : -1;
            const cur = new Date(from);
            while ((dir > 0 && cur <= to) || (dir < 0 && cur >= to)) {
              const ct = toMidnight(cur);
              if (ct !== toMidnight(from) && ct !== toMidnight(to)) {
                if (getDateEffect(lockRules, cur).blocked) {
                  this.triggerInvalidRangeFeedback?.();
                  return;
                }
              }
              cur.setDate(cur.getDate() + dir);
            }
          }
        }

        return original(selected, monthIndex);
        };
      });
    },

    onRender(calendar: CalendarInstance) {
      calendar.updateDayClasses?.();
    },
  };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function _replaceLegacyRule(
  calendar: CalendarInstance,
  tag: string,
  rule: LockRule,
): void {
  const current = (calendar._lockRules || []) as (LockRule & { _legacy?: string })[];
  const filtered = current.filter((r) => r._legacy !== tag);
  const tagged = rule as LockRule & { _legacy?: string };
  tagged._legacy = tag;
  filtered.unshift(tagged);
  calendar._lockRules = filtered;
  calendar.renderCalendar();
  calendar.updateDayClasses();
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export { getDateEffect, ruleMatchesDate };
