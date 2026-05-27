// src/core/types.ts — Core type definitions for ModoCalendar

export type CalendarMode = 'single' | 'range' | 'multiple';

// Status message types
export type StatusMessageType = 'info' | 'warning' | 'error';

export interface StatusMessageState {
  type: StatusMessageType;
  text: string;
  autoHideDelay?: number; // ms, 0 = no auto-hide
}

export interface CalendarLocale {
  code: string;
  monthNames: string[];
  monthNamesShort: string[];
  dayNames: string[];
  dayNamesShort: string[];
  dayNamesMin: string[];
  firstDayOfWeek: number; // 0=Sun, 1=Mon
  strings: {
    placeholder: string;
    noDateSelected: string;
    today: string;
    clear: string;
    close: string;
    arrival: string;
    departure: string;
    time: string;
  };
}

export interface TimeSlot {
  from: string; // "HH:MM"
  to: string;   // "HH:MM"
  label: string; // "08:00 - 09:30"
}

/** Custom classes to merge on top of BEM mc- classes (e.g. Tailwind utilities). */
export interface CalendarClassNames {
  // Layout
  calendar?: string;
  header?: string;
  monthLabel?: string;
  nav?: string;
  navButton?: string;
  // Day grid
  daysGrid?: string;
  dayHeaders?: string;
  dayHeader?: string;
  day?: string;
  dayText?: string;
  dayEmpty?: string;
  // Day states
  dayToday?: string;
  dayDisabled?: string;
  dayPast?: string;
  daySelected?: string;
  dayInRange?: string;
  dayRangeStart?: string;
  dayRangeEnd?: string;
  dayFocused?: string;
  // Multi-select
  multiList?: string;
  multiEmpty?: string;
  removeButton?: string;
  // Misc
  bottomSheet?: string;
}

export interface CalendarOptions {
  trigger?: string | HTMLElement | null;
  mode?: CalendarMode;
  inline?: boolean | string;
  shadow?: boolean;
  format?: (start: string | null, end: string | null) => string;
  placeholder?: string;
  name?: string;
  hiddenInput?: HTMLInputElement;
  locale?: string | Partial<CalendarLocale>;
  minDate?: Date | string | null;
  maxDate?: Date | string | null;
  classNames?: Partial<CalendarClassNames>;
  plugins?: CalendarPlugin[];
  onTimeSelected?: (data: { date: Date; time: string }) => void;

  // Status messages
  showStatusMessages?: boolean;

  // Custom CSS injected into the shadow root (or document.head in light DOM) AFTER the core
  // and plugin styles, so consumers can override anything without rebuilding the library.
  customCSS?: string | string[];

  // Range validation
  minRangeNights?: number;
  maxRangeNights?: number;
  // When set, range mode collapses to single-click: clicking a date selects a fixed-width
  // range of N consecutive days (rangeSize === N). minRangeNights/maxRangeNights are ignored.
  rangeSize?: number;

  // Multiple selection validation
  minMultipleDates?: number;
  maxMultipleDates?: number;

  [key: string]: unknown;
}

export interface CalendarPlugin {
  name: string;
  options?: Record<string, unknown>;
  onInit?: (calendar: CalendarInstance) => void;
  onShadowReady?: (calendar: CalendarInstance) => void;
  onRender?: (calendar: CalendarInstance) => void;
  onDateSelected?: (date: Date, calendar: CalendarInstance) => void;
  onCalendarOpen?: (calendar: CalendarInstance) => void;
  onCalendarClose?: (calendar: CalendarInstance) => void;
  onDestroy?: (calendar: CalendarInstance) => void;
}

export interface DayElement {
  el: HTMLElement;
  date: Date;
  monthIndex: number;
}

export type CalendarEventMap = {
  'dateSelected': { date: Date; mode: CalendarMode };
  'dateDeselected': { date: Date; mode: CalendarMode };
  'rangeSelected': { start: Date; end: Date };
  'rangeCleared': void;
  'timeSelected': { date: Date; time: string; from?: number; to?: number };
  'monthChanged': { date: Date; direction: 'prev' | 'next' | 'jump' };
  'calendarOpen': void;
  'calendarClose': void;
  'modeChanged': { mode: CalendarMode };
  'stateChanged': { key: string; value: unknown };
  'statusMessage': StatusMessageState;
  'statusCleared': void;
  'invalidSelection': { type: StatusMessageType; reason: string };
  'localeChanged': { locale: string };
};

export type CalendarEventName = keyof CalendarEventMap;

export interface HiddenInputValueSingle {
  mode: 'single';
  dates: [number];
  time?: [number, number];
}

export interface HiddenInputValueRange {
  mode: 'range';
  dates: [number] | [number, number];
  time?: {
    start?: [number, number];
    end?: [number, number];
  };
}

export interface HiddenInputValueMultiple {
  mode: 'multiple';
  dates: number[];
  times?: Record<number, string | null>;
  timePairs?: Record<number, { arrival: string | null; departure: string | null }>;
}

export type HiddenInputValue =
  | HiddenInputValueSingle
  | HiddenInputValueRange
  | HiddenInputValueMultiple;

// Interface for the calendar instance (used by plugins)
export interface CalendarInstance {
  options: CalendarOptions;
  mode: CalendarMode;
  date: Date;
  months: number;
  startDate: Date | null;
  endDate: Date | null;
  selectedDate: Date | null;
  selectedDates: Date[];
  hoverDate: Date | null;
  focusedDate: Date | null;
  trigger: HTMLElement | null;
  shadowHost: HTMLElement | null;
  shadowRoot: ShadowRoot | null;
  container: HTMLElement | null;
  hiddenInput: HTMLInputElement | null;
  dayElements: DayElement[];
  plugins: CalendarPlugin[];
  locale: CalendarLocale;
  classNames: Partial<CalendarClassNames>;

  // Methods
  on<K extends CalendarEventName>(event: K, fn: (data: CalendarEventMap[K]) => void): void;
  off<K extends CalendarEventName>(event: K, fn: (data: CalendarEventMap[K]) => void): void;
  emit<K extends CalendarEventName>(event: K, data: CalendarEventMap[K]): void;
  addPlugin(plugin: CalendarPlugin): void;
  _cls(bemClass: string, slot?: keyof CalendarClassNames): string;
  showCalendar(): void;
  hideCalendar(): void;
  renderCalendar(): void;
  updateDayClasses(): void;
  updateButtonLabel(): void;
  updateHiddenInput(): void;
  selectDate(date: Date, monthIndex: number): void;
  setRange(start: string, end?: string): void;
  clearSelection(): void;
  getSelection(): { mode: CalendarMode; dates: Date[]; start: Date | null; end: Date | null };
  generateDays(date: Date, monthIndex: number): HTMLElement;
  formatDisplay(date: Date): string;
  formatDate(date: Date): string;
  getDateRangeArray(start: Date, end: Date): Date[];
  triggerInvalidRangeFeedback(): void;
  destroy(): void;

  // Status message API
  setStatusMessage(state: StatusMessageState): void;
  clearStatusMessage(): void;
  triggerErrorFeedback(): void;
  notifyInvalidSelection(reason: string, type?: StatusMessageType): void;

  // Locale API
  setLocale(code: string, opts?: { reRender?: boolean }): void;
  setWeekStartsOn(day: number, opts?: { reRender?: boolean }): void;
  getResolvedLocale(): string;
  getLabelElement(): HTMLElement | null;

  // Hook chain system for plugin method overrides
  _hookRegistry: Map<string, { original: (...args: any[]) => any; entries: Array<{ wrapper: (original: (...args: any[]) => any) => (...args: any[]) => any }> }>;
  _addHook(method: string, wrapper: (original: (...args: any[]) => any) => (...args: any[]) => any): () => void;

  // Plugin-injected state (optional)
  blockedDates?: number[];
  noRangeStartDates?: number[];
  noRangeEndDates?: number[];
  selectedTimes?: Record<number, string>;
  monthOffsets?: number[];
  strictRange2Months?: boolean;
  showStatusMessages?: boolean;
  _statusMessageState?: StatusMessageState | null;
  _statusAutoHideTimer?: ReturnType<typeof setTimeout> | null;
  _initialized?: boolean;
  _timePluginState?: {
    selectedTimes: Record<number, string>;
    selectedTimePairs: Record<number, { arrival: string | null; departure: string | null }>;
    _lastDateClicked: Date | null;
  };
  _forceTimePluginRender?: boolean;
  _initialLabelValue?: string | null;
  _lockInitOptions?: Record<string, unknown>;
  navigationOffset?: number;
  _batchStart?: () => void;
  _batchEnd?: () => void;
  [key: string]: unknown;
}
