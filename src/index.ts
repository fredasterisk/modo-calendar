// src/index.ts — ModoCalendar entry point

// Core
export { ModoCalendar } from './core/calendar';
export type {
  CalendarMode,
  CalendarLocale,
  CalendarClassNames,
  CalendarOptions,
  CalendarPlugin,
  CalendarInstance,
  CalendarEventMap,
  CalendarEventName,
  DayElement,
  TimeSlot,
  HiddenInputValue,
  HiddenInputValueSingle,
  HiddenInputValueRange,
  HiddenInputValueMultiple,
} from './core/types';

// i18n
export { localeFR, localeEN, registerLocale, getLocale } from './core/i18n';

// Plugins
export { lockPlugin } from './plugins/lock/lock-plugin';
export type { LockPluginOptions } from './plugins/lock/lock-plugin';

export { monthsPlugin } from './plugins/months/months-plugin';
export type { MonthsPluginOptions } from './plugins/months/months-plugin';

export { timePlugin } from './plugins/time/time-plugin';
export type { TimePluginOptions } from './plugins/time/time-plugin';

export { dropdownPlugin } from './plugins/dropdown/dropdown-plugin';
export type { DropdownPluginOptions } from './plugins/dropdown/dropdown-plugin';

export { presetsPlugin, presetRanges } from './plugins/presets/presets-plugin';
export type { PresetsPluginOptions, PresetRange } from './plugins/presets/presets-plugin';
