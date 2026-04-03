// src/plugins/i18n/i18n-plugin.ts — Runtime locale switching plugin for ModoCalendar

import type { CalendarPlugin, CalendarInstance, CalendarLocale } from '../../core/types';
import { registerLocale, getLocale } from '../../core/i18n';

// --- Types ---

export interface I18nLocaleEntry {
  key?: string;
  locale?: string;
  weekStartsOn?: number;
  placeholder?: string;
  a11y?: Record<string, string | number | ((...args: unknown[]) => string)>;
  format?: (start: string | null, end: string | null, ctx?: I18nFormatContext) => string;
  formatDisplay?: (date: Date, ctx?: I18nFormatContext) => string;
}

export interface I18nPluginOptions {
  locales?: Record<string, string | I18nLocaleEntry>;
  initialLocale?: string;
  fallbackLocale?: string;
  placeholder?: string;
  format?: (start: string | null, end: string | null, ctx?: I18nFormatContext) => string;
  formatDisplay?: (date: Date, ctx?: I18nFormatContext) => string;
  onLocaleChange?: (entry: I18nLocaleEntry, calendar: CalendarInstance) => void;
}

export interface I18nFormatContext {
  calendar: CalendarInstance;
  locale: string;
  entry: I18nLocaleEntry | null;
  key: string | null;
  mode: string | null;
}

// --- Helpers ---

function normalizeWeekday(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return ((Math.round(n) % 7) + 7) % 7;
}

function normalizeLocaleEntry(key: string, source: unknown): I18nLocaleEntry | null {
  if (source == null) return null;
  if (typeof source === 'string') return normalizeLocaleEntry(key, { locale: source });
  if (typeof source !== 'object') return null;

  const src = source as Record<string, unknown>;
  const entry: I18nLocaleEntry = {};

  const entryKey = (typeof src.key === 'string' && src.key.trim()) || key;
  if (entryKey) entry.key = entryKey;

  const locale = typeof src.locale === 'string' ? src.locale.trim()
    : typeof src.code === 'string' ? src.code.trim()
    : null;
  if (locale) entry.locale = locale;

  const weekStart = src.weekStartsOn ?? src.weekStart ?? src.firstDayOfWeek;
  const normalizedWeek = normalizeWeekday(weekStart);
  if (normalizedWeek !== null) entry.weekStartsOn = normalizedWeek;

  if (typeof src.placeholder === 'string' && src.placeholder.trim()) {
    entry.placeholder = src.placeholder.trim();
  }

  if (src.a11y && typeof src.a11y === 'object') {
    entry.a11y = { ...(src.a11y as Record<string, string>) };
  }

  if (typeof src.format === 'function') entry.format = src.format as I18nLocaleEntry['format'];
  if (typeof src.formatDisplay === 'function') entry.formatDisplay = src.formatDisplay as I18nLocaleEntry['formatDisplay'];

  if (!entry.key && entry.locale) entry.key = entry.locale;

  return Object.keys(entry).length ? entry : null;
}

function normalizeLocales(raw: unknown): Record<string, I18nLocaleEntry> | null {
  if (!raw || typeof raw !== 'object') return null;
  const entries: Record<string, I18nLocaleEntry> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = normalizeLocaleEntry(key, value);
    if (entry) entries[entry.key || key] = entry;
  }
  return Object.keys(entries).length ? entries : null;
}

function resolveEntry(
  locales: Record<string, I18nLocaleEntry> | null,
  target: string | null,
  fallback: string | null,
): I18nLocaleEntry | null {
  if (!locales) return null;

  const tryKey = (k: string | null): I18nLocaleEntry | null => {
    if (!k) return null;
    if (locales[k]) return { ...locales[k] };
    const match = Object.entries(locales).find(([, e]) => e.locale === k || e.key === k);
    return match ? { ...match[1] } : null;
  };

  return tryKey(target) || tryKey(fallback) || null;
}

function hasSelection(cal: CalendarInstance): boolean {
  if (cal.mode === 'single') return !!cal.selectedDate;
  if (cal.mode === 'range') return !!cal.startDate || !!cal.endDate;
  if (cal.mode === 'multiple') return (cal.selectedDates?.length ?? 0) > 0;
  return false;
}

function defaultFormatDisplay(date: Date, calendar: CalendarInstance): string {
  const locale = calendar.getResolvedLocale?.() ?? 'fr-FR';
  try {
    return date.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
  } catch {
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }
}

// --- Plugin Factory ---

export function i18nPlugin(options: I18nPluginOptions = {}): CalendarPlugin & {
  setLocale: (target: string, opts?: { calendar?: CalendarInstance; suppressRender?: boolean }) => string | null;
  getActiveLocale: () => I18nLocaleEntry | null;
  getAvailableLocales: () => string[];
} {
  const locales = normalizeLocales(options.locales);
  const initialLocale = options.initialLocale ?? options.fallbackLocale ?? (locales ? Object.keys(locales)[0] : null);
  const fallbackLocale = options.fallbackLocale ?? initialLocale;

  let _calendar: CalendarInstance | null = null;
  let _currentKey: string | null = null;
  let _currentEntry: I18nLocaleEntry | null = null;
  let _basePlaceholder = '';
  let _defaultFormat: CalendarInstance['options']['format'] | null = null;
  let _defaultFormatDisplay: ((date: Date) => string) | null = null;

  function applyEntry(calendar: CalendarInstance, entry: I18nLocaleEntry, suppressRender = false): void {
    if (entry.locale) {
      calendar.setLocale(entry.locale, { reRender: false });
    }
    if (typeof entry.weekStartsOn === 'number') {
      calendar.setWeekStartsOn(entry.weekStartsOn, { reRender: false });
    }

    // Placeholder
    const placeholder = entry.placeholder || options.placeholder || _basePlaceholder;
    if (placeholder) {
      calendar.options.placeholder = placeholder;
      calendar._initialLabelValue = placeholder;
      if (calendar._initialized && !hasSelection(calendar)) {
        const labelEl = calendar.getLabelElement?.();
        if (labelEl) labelEl.textContent = placeholder;
      }
    }

    // Format functions
    const ctx = (): I18nFormatContext => ({
      calendar,
      locale: calendar.getResolvedLocale?.() ?? 'fr-FR',
      entry,
      key: _currentKey,
      mode: calendar.mode,
    });

    const formatFn = entry.format || options.format || _defaultFormat || ((s: string | null, e: string | null) => s && e ? `${s} – ${e}` : s || '');
    calendar.options.format = (start, end) => formatFn(start, end, ctx());

    const displayFn = entry.formatDisplay || options.formatDisplay || null;
    if (displayFn) {
      calendar.formatDisplay = (date: Date) => displayFn(date, ctx());
    } else if (_defaultFormatDisplay) {
      calendar.formatDisplay = _defaultFormatDisplay;
    }

    if (!suppressRender && calendar._initialized) {
      calendar.renderCalendar();
      calendar.updateDayClasses();
    }
  }

  const plugin = {
    name: 'i18n',
    options: options as Record<string, unknown>,

    onInit(calendar: CalendarInstance): void {
      _calendar = calendar;
      _basePlaceholder = calendar.options.placeholder || '';
      _defaultFormat = typeof calendar.options.format === 'function' ? calendar.options.format : null;
      _defaultFormatDisplay = typeof calendar.formatDisplay === 'function' ? calendar.formatDisplay : null;

      if (initialLocale) {
        const entry = resolveEntry(locales, initialLocale, fallbackLocale);
        if (entry) {
          _currentKey = entry.key || entry.locale || initialLocale;
          _currentEntry = entry;
          applyEntry(calendar, entry, true);
        }
      }
    },

    onDestroy(): void {
      if (!_calendar) return;
      if (_basePlaceholder) _calendar.options.placeholder = _basePlaceholder;
      if (_defaultFormat) _calendar.options.format = _defaultFormat;
      if (_defaultFormatDisplay) _calendar.formatDisplay = _defaultFormatDisplay;
      _calendar = null;
    },

    setLocale(target: string, opts: { calendar?: CalendarInstance; suppressRender?: boolean } = {}): string | null {
      const cal = opts.calendar || _calendar;
      if (!cal) return null;

      const entry = resolveEntry(locales, target, fallbackLocale);
      if (!entry) return null;

      _currentKey = entry.key || entry.locale || target;
      _currentEntry = entry;
      applyEntry(cal, entry, opts.suppressRender);

      if (typeof options.onLocaleChange === 'function') {
        try { options.onLocaleChange(entry, cal); } catch { /* ignore */ }
      }

      return _currentKey;
    },

    getActiveLocale(): I18nLocaleEntry | null {
      return _currentEntry ? { ..._currentEntry } : null;
    },

    getAvailableLocales(): string[] {
      if (locales) return Object.keys(locales);
      return [];
    },
  };

  return plugin;
}
