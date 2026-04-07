// src/core/calendar.ts — ModoCalendar core engine (TypeScript rewrite)

import calendarStyles from './styles.css?inline';
import themeStyles from './theme.css?inline';
import type {
  CalendarOptions,
  CalendarPlugin,
  CalendarMode,
  CalendarLocale,
  CalendarInstance,
  CalendarClassNames,
  DayElement,
  CalendarEventName,
  CalendarEventMap,
  HiddenInputValue,
  StatusMessageState,
  StatusMessageType,
} from './types';
import { EventEmitter } from './events';
import { getLocale, getOrderedDayNames, formatDateDisplay, getMonthName } from './i18n';
import { animateSlide, animateOpen, animateClose, animateSelect, animateShake, staggerFadeIn, shouldAnimate } from './animations';
import { attachGestures } from './gestures';
import { installReactiveState } from './state';

function parseYMDToDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function parseDateOption(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof d === 'string') return parseYMDToDate(d);
  return null;
}

export class ModoCalendar extends EventEmitter implements CalendarInstance {
  static instances: ModoCalendar[] = [];
  static globalPlugins: CalendarPlugin[] = [];

  static use(plugin: CalendarPlugin): void {
    this.globalPlugins.push(plugin);
  }

  static parseYMD(str: string): Date {
    return parseYMDToDate(str);
  }

  // Instance properties
  options: CalendarOptions;
  mode: CalendarMode;
  date: Date;
  months: number;
  startDate: Date | null = null;
  endDate: Date | null = null;
  selectedDate: Date | null = null;
  selectedDates: Date[] = [];
  hoverDate: Date | null = null;
  focusedDate: Date | null = null;
  trigger: HTMLElement | null = null;
  shadowHost: HTMLElement | null = null;
  shadowRoot: ShadowRoot | null = null;
  container: HTMLElement | null = null;
  hiddenInput: HTMLInputElement | null = null;
  dayElements: DayElement[] = [];
  plugins: CalendarPlugin[] = [];
  locale: CalendarLocale;
  minDate: Date | null;
  maxDate: Date | null;
  classNames: Partial<CalendarClassNames>;

  _initialLabelValue: string | null = null;
  _timePluginState: { selectedTimes: Record<number, string>; selectedTimePairs: Record<number, { arrival: string | null; departure: string | null }>; _lastDateClicked: Date | null } = {
    selectedTimes: {},
    selectedTimePairs: {},
    _lastDateClicked: null,
  };
  _forceTimePluginRender = false;
  _lockInitOptions?: Record<string, unknown>;
  _hoverRaf = 0;
  _cleanupGestures: (() => void) | null = null;
  _useShadow: boolean;
  _batchStart?: () => void;
  _batchEnd?: () => void;

  // Status messages
  showStatusMessages: boolean;
  _statusMessageState: StatusMessageState | null = null;
  _statusAutoHideTimer: ReturnType<typeof setTimeout> | null = null;
  _initialized = false;

  // Plugin-injected
  blockedDates?: number[];
  noRangeStartDates?: number[];
  noRangeEndDates?: number[];
  selectedTimes?: Record<number, string>;
  monthOffsets?: number[];
  strictRange2Months?: boolean;

  // Hook chain for plugin method overrides
  _hookRegistry: Map<string, { original: (...args: any[]) => any; entries: Array<{ wrapper: (original: (...args: any[]) => any) => (...args: any[]) => any }> }> = new Map();

  [key: string]: unknown;

  constructor(options: CalendarOptions = {}) {
    super();

    this.options = {
      trigger: options.trigger || null,
      mode: options.mode || 'range',
      inline: options.inline || false,
      shadow: options.shadow !== false, // default true
      format:
        options.format ||
        ((start, end) => (start && end ? `${start} - ${end}` : start || options.placeholder || '')),
      ...options,
    };

    this._useShadow = this.options.shadow !== false;
    this.date = new Date();
    this.mode = (this.options.mode || 'range') as CalendarMode;
    this.months = (this.options.months as number) || 1;
    this.locale = getLocale(this.options.locale);
    this.minDate = parseDateOption(this.options.minDate);
    this.maxDate = parseDateOption(this.options.maxDate);
    this.classNames = this.options.classNames || {};
    this.showStatusMessages = this.options.showStatusMessages !== false;

    if (this.mode === 'multiple') this.selectedDates = [];

    // Register plugins (global + instance)
    const allPlugins = [
      ...(ModoCalendar.globalPlugins || []),
      ...(this.options.plugins || []),
    ];
    allPlugins.forEach((p) => this.addPlugin(p));

    ModoCalendar.instances.push(this);

    if (this.options.inline || this.options.trigger) {
      this._attachToTrigger(this.options.trigger as string | HTMLElement | null);
    }

    const monthsPluginInstance = this.plugins.find((p) => p.name === 'months');
    this.strictRange2Months = (monthsPluginInstance?.options as Record<string, unknown> | undefined)?.strictRange2Months as boolean | undefined;

    // Install Proxy-based reactive state — auto-syncs UI on property changes
    return installReactiveState(this);
  }

  // --- Plugin API ---

  addPlugin(plugin: CalendarPlugin): void {
    this.plugins.push(plugin);
    plugin.onInit?.(this);
  }

  /** Merge a BEM class with an optional user-supplied classNames override. */
  _cls(bemClass: string, slot?: keyof CalendarClassNames): string {
    const extra = slot ? this.classNames[slot] : undefined;
    return extra ? `${bemClass} ${extra}` : bemClass;
  }

  /**
   * Register a method override via the hook chain.
   * The wrapper receives the current implementation and returns the new one.
   * Returns an unhook function that removes this wrapper from the chain.
   */
  _addHook(method: string, wrapper: (original: (...args: any[]) => any) => (...args: any[]) => any): () => void {
    if (!this._hookRegistry.has(method)) {
      this._hookRegistry.set(method, {
        original: (this as any)[method].bind(this),
        entries: [],
      });
    }
    const reg = this._hookRegistry.get(method)!;
    const entry = { wrapper };
    reg.entries.push(entry);
    this._rebuildHook(method);
    return () => {
      const idx = reg.entries.indexOf(entry);
      if (idx >= 0) {
        reg.entries.splice(idx, 1);
        this._rebuildHook(method);
      }
    };
  }

  private _rebuildHook(method: string): void {
    const reg = this._hookRegistry.get(method);
    if (!reg) return;
    let current = reg.original;
    for (const entry of reg.entries) {
      current = entry.wrapper(current);
    }
    (this as any)[method] = current;
  }

  // --- Lifecycle ---

  private _attachToTrigger(selector: string | HTMLElement | null): void {
    const isInline = typeof this.options.inline === 'string';
    const btn =
      selector && !isInline
        ? typeof selector === 'string'
          ? document.querySelector<HTMLElement>(selector)
          : selector
        : null;
    const inlineContainer = isInline
      ? document.querySelector<HTMLElement>(this.options.inline as string)
      : null;

    if (isInline && !inlineContainer) return;
    if (!btn && !this.options.inline) return;

    this.trigger = btn;

    // Create host element
    this.shadowHost = document.createElement('div');
    this.shadowHost.className = 'mc-host';
    (isInline && inlineContainer ? inlineContainer : document.body).appendChild(this.shadowHost);

    // Shadow DOM or light DOM based on option
    if (this._useShadow) {
      this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open' });
      const styleEl = document.createElement('style');
      styleEl.textContent = themeStyles + '\n' + calendarStyles;
      this.shadowRoot.appendChild(styleEl);
    } else {
      // Light DOM mode — inject styles into document head once
      this.shadowRoot = null;
      if (!document.getElementById('mc-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'mc-styles';
        styleEl.textContent = themeStyles + '\n' + calendarStyles;
        document.head.appendChild(styleEl);
      }
    }

    // Main container
    this.container = document.createElement('div');
    this.container.className = this._cls('mc-calendar', 'calendar');
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.setAttribute('aria-label', this.locale.strings.placeholder);

    const root = this.shadowRoot || this.shadowHost;
    root.appendChild(this.container);

    // Notify plugins of shadow/DOM ready
    this.plugins.forEach((p) => p.onShadowReady?.(this));

    // Hidden input for form integration
    if (this.options.hiddenInput) {
      this.hiddenInput = this.options.hiddenInput;
    } else {
      this.hiddenInput = document.createElement('input');
      this.hiddenInput.type = 'hidden';
      this.hiddenInput.className = 'mc-hidden-input';
      this.hiddenInput.name =
        (this.trigger && (this.trigger as HTMLElement).id) ? (this.trigger as HTMLElement).id
        : this.options.name || 'modo-calendar';
      if (this.trigger?.parentNode) {
        this.trigger.parentNode.insertBefore(this.hiddenInput, this.trigger.nextSibling);
      } else {
        document.body.appendChild(this.hiddenInput);
      }
    }

    // Popup vs inline
    if (!this.options.inline) {
      this.container.style.display = 'none';
      btn?.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        this.showCalendar();
      });
      document.addEventListener('click', (e: MouseEvent) => {
        const path = e.composedPath ? e.composedPath() : [];
        if (
          !(path.includes(this.container!) || path.includes(this.shadowHost!) || e.target === btn)
        ) {
          this.hideCalendar();
        }
      });
    } else {
      this.container.style.display = 'block';
      this.shadowHost.style.position = 'static';
    }

    // Keyboard navigation on container
    this._setupKeyboardNav();

    // Touch gestures
    this._cleanupGestures = attachGestures(this.container, {
      onSwipeLeft: () => this._navigateMonth('next'),
      onSwipeRight: () => this._navigateMonth('prev'),
    });

    this.renderCalendar();
    this.updateHiddenInput();

    // Capture initial label
    const labelEl = this.trigger?.querySelector('.dates') ??
      this.container.querySelector('.dates');
    if (labelEl) this._initialLabelValue = labelEl.textContent;

    this._initialized = true;
  }

  showCalendar(): void {
    if (this.options.inline || !this.container || !this.trigger) return;

    // Close other instances
    ModoCalendar.instances.forEach((i) => {
      if (i !== this) i.hideCalendar();
    });

    const rect = this.trigger.getBoundingClientRect();
    const host = this.shadowHost!;

    // Check if should show as bottom sheet (mobile)
    const isMobile = window.innerWidth < 640;

    if (isMobile) {
      host.style.position = 'fixed';
      host.style.left = '0';
      host.style.right = '0';
      host.style.bottom = '0';
      host.style.top = 'auto';
      this.container.classList.add('mc-bottom-sheet');
      if (this.classNames.bottomSheet) this.container.classList.add(...this.classNames.bottomSheet.split(' '));
    } else {
      host.style.position = 'absolute';
      host.style.left = rect.left + window.scrollX + 'px';
      host.style.top = rect.bottom + window.scrollY + 'px';
      this.container.classList.remove('mc-bottom-sheet');
    }

    animateOpen(this.container);
    this.plugins?.forEach((p) => p.onCalendarOpen?.(this));
    this.emit('calendarOpen', undefined as never);

    // Focus first day for keyboard nav
    requestAnimationFrame(() => {
      const firstDay = (this.shadowRoot || this.container)?.querySelector('.mc-day:not(.mc-day--disabled)') as HTMLElement | null;
      firstDay?.focus();
    });
  }

  hideCalendar(): void {
    if (this.options.inline || !this.container) return;
    cancelAnimationFrame(this._hoverRaf);

    animateClose(this.container);
    this.plugins?.forEach((p) => p.onCalendarClose?.(this));
    this.emit('calendarClose', undefined as never);
  }

  destroy(): void {
    cancelAnimationFrame(this._hoverRaf);
    this._cleanupGestures?.();
    this.plugins.forEach((p) => p.onDestroy?.(this));
    this.removeAllListeners();
    this.shadowHost?.remove();
    this.hiddenInput?.remove();
    const idx = ModoCalendar.instances.indexOf(this);
    if (idx > -1) ModoCalendar.instances.splice(idx, 1);
  }

  // --- Navigation ---

  private _navigateMonth(direction: 'prev' | 'next'): void {
    const delta = direction === 'prev' ? -1 : 1;
    this.date = new Date(this.date.getFullYear(), this.date.getMonth() + delta, 1);
    this.renderCalendar();
    this.updateDayClasses();
    this.emit('monthChanged', { date: new Date(this.date), direction });

    // Animate slide
    if (this.container) {
      const daysGrid = (this.shadowRoot || this.container)?.querySelector('.mc-days') as HTMLElement;
      if (daysGrid) animateSlide(daysGrid, direction === 'prev' ? 'right' : 'left');
    }
  }

  // --- Rendering ---

  renderCalendar(): void {
    if (!this.container) return;
    this.container.innerHTML = '';
    let rendered = false;

    // Let months plugin render if present
    this.plugins?.forEach((p) => {
      if (typeof p.onRender === 'function') {
        const before = this.container!.innerHTML;
        p.onRender(this);
        if (p.name === 'months' && this.container!.innerHTML !== before) rendered = true;
      }
    });

    if (!rendered) {
      // Single-month header
      const header = document.createElement('div');
      header.className = this._cls('mc-header', 'header');

      const monthLabel = document.createElement('span');
      monthLabel.className = this._cls('mc-month-label', 'monthLabel');
      monthLabel.textContent = `${getMonthName(this.date, this.locale)} ${this.date.getFullYear()}`;
      monthLabel.setAttribute('aria-live', 'polite');

      const navGroup = document.createElement('span');
      navGroup.className = this._cls('mc-nav', 'nav');

      const prevBtn = document.createElement('button');
      prevBtn.className = this._cls('mc-nav-btn mc-nav-prev', 'navButton');
      prevBtn.type = 'button';
      prevBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
      prevBtn.setAttribute('aria-label', 'Previous month');
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._navigateMonth('prev');
      });

      const nextBtn = document.createElement('button');
      nextBtn.className = this._cls('mc-nav-btn mc-nav-next', 'navButton');
      nextBtn.type = 'button';
      nextBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
      nextBtn.setAttribute('aria-label', 'Next month');
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._navigateMonth('next');
      });

      navGroup.appendChild(prevBtn);
      navGroup.appendChild(nextBtn);
      header.appendChild(monthLabel);
      header.appendChild(navGroup);
      this.container.appendChild(header);

      // Day grid
      const days = this.generateDays(this.date, 0);
      this.container.appendChild(days);

      // Collect day elements
      this.dayElements = [];
      days.querySelectorAll('.mc-day').forEach((dayEl) => {
        const el = dayEl as HTMLElement & { _date?: Date };
        this.dayElements.push({ el, date: el._date!, monthIndex: 0 });
      });

      // Multi-list for multiple mode
      if (this.mode === 'multiple') {
        this._renderMultiList();
      }
    }

    // Non-months plugins render
    this.plugins?.forEach((p) => {
      if (p.name !== 'months' && typeof p.onRender === 'function') p.onRender(this);
    });
  }

  generateDays(date: Date, monthIndex: number): HTMLElement {
    const daysContainer = document.createElement('div');
    daysContainer.className = this._cls('mc-days', 'daysGrid');
    daysContainer.setAttribute('role', 'grid');

    // Day headers
    const orderedDays = getOrderedDayNames(this.locale);
    const headerRow = document.createElement('div');
    headerRow.className = this._cls('mc-day-headers', 'dayHeaders');
    headerRow.setAttribute('role', 'row');
    orderedDays.forEach((d) => {
      const dh = document.createElement('div');
      dh.className = this._cls('mc-day-header', 'dayHeader');
      dh.setAttribute('role', 'columnheader');
      dh.textContent = d;
      headerRow.appendChild(dh);
    });
    daysContainer.appendChild(headerRow);

    // Calculate grid
    const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const firstDayOfWeek = this.locale.firstDayOfWeek;
    let startDay = firstOfMonth.getDay() - firstDayOfWeek;
    if (startDay < 0) startDay += 7;

    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const prevMonthDays = new Date(date.getFullYear(), date.getMonth(), 0).getDate();
    const today = toMidnight(new Date());

    // Previous month outside days
    for (let i = startDay - 1; i >= 0; i--) {
      const outsideDay = document.createElement('div');
      outsideDay.className = 'mc-day-outside';
      const outsideText = document.createElement('span');
      outsideText.className = 'mc-day-text';
      outsideText.textContent = String(prevMonthDays - i);
      outsideDay.appendChild(outsideText);
      daysContainer.appendChild(outsideDay);
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
      const currentDate = new Date(date.getFullYear(), date.getMonth(), d);
      const day = document.createElement('div') as unknown as HTMLElement & { _date: Date };
      day.className = this._cls('mc-day', 'day');
      day.setAttribute('role', 'gridcell');
      day.setAttribute('tabindex', '-1');

      // Accessible label
      const ariaLabel = formatDateDisplay(currentDate, this.locale);
      day.setAttribute('aria-label', ariaLabel);

      const dayText = document.createElement('span');
      dayText.className = this._cls('mc-day-text', 'dayText');
      dayText.textContent = String(d);
      day.appendChild(dayText);

      day._date = currentDate;
      day.dataset.monthIndex = String(monthIndex);

      // Today marker
      if (isSameDay(currentDate, today)) {
        day.classList.add('mc-day--today');
        if (this.classNames.dayToday) day.classList.add(...this.classNames.dayToday.split(' '));
        day.setAttribute('aria-current', 'date');
      }

      // Past date
      if (currentDate < today) {
        day.classList.add('mc-day--disabled', 'mc-day--past');
        if (this.classNames.dayDisabled) day.classList.add(...this.classNames.dayDisabled.split(' '));
        if (this.classNames.dayPast) day.classList.add(...this.classNames.dayPast.split(' '));
        day.setAttribute('aria-disabled', 'true');
      }

      // Min/max constraints
      if (this.minDate && currentDate < toMidnight(this.minDate)) {
        day.classList.add('mc-day--disabled');
        if (this.classNames.dayDisabled) day.classList.add(...this.classNames.dayDisabled.split(' '));
        day.setAttribute('aria-disabled', 'true');
      }
      if (this.maxDate && currentDate > toMidnight(this.maxDate)) {
        day.classList.add('mc-day--disabled');
        if (this.classNames.dayDisabled) day.classList.add(...this.classNames.dayDisabled.split(' '));
        day.setAttribute('aria-disabled', 'true');
      }

      daysContainer.appendChild(day);
    }

    // Next month outside days — fill remaining cells to complete the grid
    const totalCells = startDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
      const outsideDay = document.createElement('div');
      outsideDay.className = 'mc-day-outside';
      const outsideText = document.createElement('span');
      outsideText.className = 'mc-day-text';
      outsideText.textContent = String(i);
      outsideDay.appendChild(outsideText);
      daysContainer.appendChild(outsideDay);
    }

    // Event delegation — single handler on grid
    daysContainer.addEventListener('click', (e) => {
      const dayEl = (e.target as HTMLElement).closest('.mc-day') as (HTMLElement & { _date?: Date }) | null;
      if (!dayEl || dayEl.classList.contains('mc-day--disabled') || !dayEl._date) return;
      e.stopPropagation();

      this._timePluginState = this._timePluginState || { selectedTimes: {}, _lastDateClicked: null };
      this._timePluginState._lastDateClicked = dayEl._date;
      this.selectDate(dayEl._date, Number(dayEl.dataset.monthIndex || 0));

      // Animate selection
      animateSelect(dayEl);
    });

    // Hover delegation with rAF throttling
    daysContainer.addEventListener('mouseover', (e) => {
      const dayEl = (e.target as HTMLElement).closest('.mc-day') as (HTMLElement & { _date?: Date }) | null;
      if (!dayEl?._date || !this.startDate || this.endDate) return;

      cancelAnimationFrame(this._hoverRaf);
      this._hoverRaf = requestAnimationFrame(() => {
        this.hoverDate = dayEl._date!;
        this.updateDayClasses();
      });
    });

    return daysContainer;
  }

  private _renderMultiList(): void {
    if (!this.container) return;

    let multiList = this.container.querySelector('.mc-multi-list');
    if (!multiList) {
      multiList = document.createElement('div');
      multiList.className = this._cls('mc-multi-list', 'multiList');
      this.container.appendChild(multiList);
    }
    multiList.innerHTML = '';

    let filteredDates = [...(this.selectedDates || [])];

    // Filter by time plugin if present
    const timePlugin = this.plugins.find((p) => p.name === 'timePlugin');
    if (timePlugin && this.hiddenInput?.value) {
      try {
        const val = JSON.parse(this.hiddenInput.value || '{}');
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

    if (timePlugin && filteredDates.length !== this.selectedDates.length) {
      this.selectedDates = filteredDates;
    }

    if (filteredDates.length > 0) {
      const sorted = filteredDates.sort((a, b) => a.getTime() - b.getTime());
      sorted.forEach((date) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = this._cls('mc-btn mc-remove-date', 'removeButton');
        const dtKey = new Date(date);
        dtKey.setUTCHours(0, 0, 0, 0);
        btn.dataset.key = String(dtKey.getTime());
        let label = formatDateDisplay(date, this.locale);
        // Append selected time if available from time plugin state
        if (this._timePluginState) {
          const pair = this._timePluginState.selectedTimePairs?.[dtKey.getTime()];
          if (pair && (pair.arrival || pair.departure)) {
            const arr = pair.arrival || '–';
            const dep = pair.departure || '–';
            label += ` (${arr} → ${dep})`;
          } else {
            const time = this._timePluginState.selectedTimes[dtKey.getTime()];
            if (time) label += ` · ${time}`;
          }
        }
        btn.textContent = label;
        btn.setAttribute('aria-label', `Remove ${label}`);
        btn.onclick = () => {
          const idx = this.selectedDates.findIndex((d) => d.getTime() === date.getTime());
          if (idx > -1) this.selectedDates.splice(idx, 1);
          this.updateButtonLabel();
          this.renderCalendar();
          this.updateDayClasses();
          this.updateHiddenInput();
          this.emit('dateDeselected', { date, mode: this.mode });
        };
        multiList!.appendChild(btn);
      });

      // Stagger animate the buttons
      staggerFadeIn(Array.from(multiList.querySelectorAll('.mc-remove-date')) as HTMLElement[]);
    } else {
      const empty = document.createElement('div');
      empty.className = this._cls('mc-multi-empty', 'multiEmpty');
      empty.textContent = this.locale.strings.noDateSelected;
      multiList.appendChild(empty);
    }
  }

  // --- Selection ---

  selectDate(selected: Date, monthIndex: number): void {
    this._batchStart?.();
    try {
      this._selectDateInner(selected, monthIndex);
    } finally {
      this._batchEnd?.();
    }
  }

  private _selectDateInner(selected: Date, monthIndex: number): void {
    const selectedTime = selected.getTime();

    if (this.mode === 'single') {
      this.selectedDate = selected;
      this.startDate = selected;
      this.updateButtonLabel();
      this.updateDayClasses();
      this.updateHiddenInput();
      this.plugins?.forEach((p) => p.onDateSelected?.(selected, this));
      this.emit('dateSelected', { date: selected, mode: this.mode });
      this.renderCalendar();
      return;
    }

    if (this.mode === 'multiple') {
      const hasTimePlugin = this.plugins?.some((p) => p.name === 'timePlugin');

      if (hasTimePlugin) {
        // Still toggle the date in selectedDates
        const idx = this.selectedDates.findIndex((d) => d.getTime() === selectedTime);
        if (idx === -1) {
          if (!this._validateMultipleSelection()) return;
          this.selectedDates.push(selected);
          this.emit('dateSelected', { date: selected, mode: this.mode });
        } else {
          this.selectedDates.splice(idx, 1);
          this.emit('dateDeselected', { date: selected, mode: this.mode });
        }

        this._forceTimePluginRender = true;
        this.updateButtonLabel();
        this.renderCalendar();
        this.updateDayClasses();
        this.updateHiddenInput();
        return;
      }

      const idx = this.selectedDates.findIndex((d) => d.getTime() === selectedTime);
      if (idx === -1) {
        if (!this._validateMultipleSelection()) return;
        this.selectedDates.push(selected);
        this.emit('dateSelected', { date: selected, mode: this.mode });
      } else {
        this.selectedDates.splice(idx, 1);
        this.emit('dateDeselected', { date: selected, mode: this.mode });
      }
      this.updateButtonLabel();
      this.renderCalendar();
      this.updateDayClasses();
      this.updateHiddenInput();
      return;
    }

    // Range mode
    const today = toMidnight(new Date());
    const isBeforeToday = selected < today;

    if (this.mode === 'range' && this.months === 2 && this.strictRange2Months) {
      if (!this.startDate || (this.startDate && this.endDate)) {
        if (monthIndex !== 0) {
          this.triggerInvalidRangeFeedback();
          return;
        }
      } else if (this.startDate && !this.endDate) {
        if (monthIndex !== 1) {
          this.triggerInvalidRangeFeedback();
          return;
        }
      }
    }

    if (!this.startDate || (this.startDate && this.endDate)) {
      this.startDate = selected;
      this.endDate = null;
      this.hoverDate = null;
      this.updateDayClasses();
      this.updateHiddenInput();
      this.emit('dateSelected', { date: selected, mode: this.mode });
    } else if (!isBeforeToday) {
      if (selected.getTime() === this.startDate.getTime()) {
        // Deselect
        this.startDate = null;
        this.endDate = null;
        this.hoverDate = null;
        this.updateDayClasses();
        this.updateHiddenInput();
        this.updateButtonLabel();
        this.emit('rangeCleared', undefined as never);

        const labelEl = this.trigger?.querySelector('.dates') ??
          this.container?.querySelector('.dates');
        if (labelEl) labelEl.textContent = this._initialLabelValue || '';
        return;
      }

      this.endDate = selected;
      this.hoverDate = null;

      // Validate range constraints
      const rangeStart = this.startDate.getTime() <= selected.getTime() ? this.startDate : selected;
      const rangeEnd = this.startDate.getTime() > selected.getTime() ? this.startDate : selected;
      if (!this._validateRangeSelection(rangeStart, rangeEnd)) {
        this.endDate = null;
        this.updateDayClasses();
        return;
      }

      // Normalize: earlier date is always startDate (arrival), later is endDate (departure)
      this.startDate = rangeStart;
      this.endDate = rangeEnd;

      this.updateButtonLabel();
      this.updateDayClasses();
      this.updateHiddenInput();
      this.emit('rangeSelected', { start: rangeStart, end: rangeEnd });

      // If time plugin is present, re-render to show time pickers instead of closing
      const hasTimePlugin = this.plugins?.some((p) => p.name === 'timePlugin');
      if (hasTimePlugin) {
        this.renderCalendar();
      } else if (!this.options.inline && this.container) {
        animateClose(this.container);
      }
      return;
    } else {
      this.startDate = selected;
      this.endDate = null;
      this.hoverDate = null;
      this.updateDayClasses();
      this.updateHiddenInput();
      this.emit('dateSelected', { date: selected, mode: this.mode });
    }

    this.plugins?.forEach((p) => p.onDateSelected?.(selected, this));
  }

  setRange(start: string, end?: string): void {
    this._batchStart?.();
    this.startDate = parseYMDToDate(start);
    this.endDate = end ? parseYMDToDate(end) : null;
    this.hoverDate = null;
    this.updateButtonLabel();
    this.renderCalendar();
    this.updateDayClasses();
    if (this.startDate && this.endDate) {
      this.emit('rangeSelected', { start: this.startDate, end: this.endDate });
    }
    this._batchEnd?.();
  }

  clearSelection(): void {
    this._batchStart?.();
    this.startDate = null;
    this.endDate = null;
    this.selectedDate = null;
    this.selectedDates = [];
    this.hoverDate = null;
    this.updateButtonLabel();
    this.updateDayClasses();
    this.updateHiddenInput();
    this.renderCalendar();
    this.emit('rangeCleared', undefined as never);
    this._batchEnd?.();
  }

  getSelection(): { mode: CalendarMode; dates: Date[]; start: Date | null; end: Date | null } {
    if (this.mode === 'single') {
      return { mode: this.mode, dates: this.selectedDate ? [this.selectedDate] : [], start: this.selectedDate, end: null };
    }
    if (this.mode === 'multiple') {
      return { mode: this.mode, dates: [...this.selectedDates], start: null, end: null };
    }
    // range
    const dates = this.startDate && this.endDate ? this.getDateRangeArray(this.startDate, this.endDate) : this.startDate ? [this.startDate] : [];
    return { mode: this.mode, dates, start: this.startDate, end: this.endDate };
  }

  // --- Day Classes ---

  updateDayClasses(): void {
    if (!this.dayElements) return;

    const fromDate = this.startDate;
    const toDate = this.endDate || (this.startDate && this.hoverDate ? this.hoverDate : null);
    const today = toMidnight(new Date());

    this.dayElements.forEach(({ el, date }) => {
      // Reset classes but keep structural ones
      const isToday = isSameDay(date, today);
      const isPast = date < today;
      const isDisabledMin = this.minDate ? date < toMidnight(this.minDate) : false;
      const isDisabledMax = this.maxDate ? date > toMidnight(this.maxDate) : false;
      const isDisabled = isPast || isDisabledMin || isDisabledMax;

      el.className = this._cls('mc-day', 'day');
      if (isToday) {
        el.classList.add('mc-day--today');
        if (this.classNames.dayToday) el.classList.add(...this.classNames.dayToday.split(' '));
        el.setAttribute('aria-current', 'date');
      }
      if (isDisabled) {
        el.classList.add('mc-day--disabled');
        if (this.classNames.dayDisabled) el.classList.add(...this.classNames.dayDisabled.split(' '));
        if (isPast) {
          el.classList.add('mc-day--past');
          if (this.classNames.dayPast) el.classList.add(...this.classNames.dayPast.split(' '));
        }
        el.setAttribute('aria-disabled', 'true');
      } else {
        el.removeAttribute('aria-disabled');
      }

      // Single mode
      if (this.mode === 'single' && this.selectedDate && isSameDay(date, this.selectedDate)) {
        el.classList.add('mc-day--selected');
        if (this.classNames.daySelected) el.classList.add(...this.classNames.daySelected.split(' '));
        el.setAttribute('aria-selected', 'true');
      } else {
        el.removeAttribute('aria-selected');
      }

      // Multiple mode
      if (this.mode === 'multiple' && this.selectedDates?.some((d) => isSameDay(d, date))) {
        el.classList.add('mc-day--selected');
        if (this.classNames.daySelected) el.classList.add(...this.classNames.daySelected.split(' '));
        el.setAttribute('aria-selected', 'true');
      }

      // Range mode
      if (this.mode === 'range' && fromDate && toDate) {
        const fromTime = toMidnight(fromDate).getTime();
        const toTime = toMidnight(toDate).getTime();
        const dateTime = toMidnight(date).getTime();
        const minTime = Math.min(fromTime, toTime);
        const maxTime = Math.max(fromTime, toTime);

        if (dateTime === minTime) {
          el.classList.add('mc-day--selected', 'mc-day--range-start');
          if (this.classNames.daySelected) el.classList.add(...this.classNames.daySelected.split(' '));
          if (this.classNames.dayRangeStart) el.classList.add(...this.classNames.dayRangeStart.split(' '));
          el.setAttribute('aria-selected', 'true');
        } else if (dateTime === maxTime) {
          el.classList.add('mc-day--selected', 'mc-day--range-end');
          if (this.classNames.daySelected) el.classList.add(...this.classNames.daySelected.split(' '));
          if (this.classNames.dayRangeEnd) el.classList.add(...this.classNames.dayRangeEnd.split(' '));
          el.setAttribute('aria-selected', 'true');
        } else if (dateTime > minTime && dateTime < maxTime) {
          el.classList.add('mc-day--in-range');
          if (this.classNames.dayInRange) el.classList.add(...this.classNames.dayInRange.split(' '));
        }
      }

      // Hover endpoint hints
      if (this.mode === 'range' && !toDate && this.hoverDate && fromDate) {
        const hoverTime = this.hoverDate.getTime();
        const fromTime = fromDate.getTime();
        const dateTime = date.getTime();

        if (dateTime === hoverTime && hoverTime > fromTime) {
          el.classList.add('mc-day--range-end');
          if (this.classNames.dayRangeEnd) el.classList.add(...this.classNames.dayRangeEnd.split(' '));
        } else if (dateTime === hoverTime && hoverTime < fromTime) {
          el.classList.add('mc-day--range-start');
          if (this.classNames.dayRangeStart) el.classList.add(...this.classNames.dayRangeStart.split(' '));
        }

        if (dateTime === fromTime) {
          if (hoverTime < fromTime) {
            el.classList.add('mc-day--selected', 'mc-day--range-end');
            if (this.classNames.daySelected) el.classList.add(...this.classNames.daySelected.split(' '));
            if (this.classNames.dayRangeEnd) el.classList.add(...this.classNames.dayRangeEnd.split(' '));
          } else {
            el.classList.add('mc-day--selected', 'mc-day--range-start');
            if (this.classNames.daySelected) el.classList.add(...this.classNames.daySelected.split(' '));
            if (this.classNames.dayRangeStart) el.classList.add(...this.classNames.dayRangeStart.split(' '));
          }
        }
      }

      // Focus ring
      if (this.focusedDate && isSameDay(date, this.focusedDate)) {
        el.classList.add('mc-day--focused');
        if (this.classNames.dayFocused) el.classList.add(...this.classNames.dayFocused.split(' '));
        el.setAttribute('tabindex', '0');
      } else {
        el.setAttribute('tabindex', '-1');
      }
    });
  }

  // --- Keyboard Navigation ---

  private _setupKeyboardNav(): void {
    if (!this.container) return;

    const root = this.shadowRoot || this.container;
    root.addEventListener('keydown', (e: Event) => {
      const ke = e as KeyboardEvent;
      const key = ke.key;

      // Escape to close
      if (key === 'Escape' && !this.options.inline) {
        this.hideCalendar();
        this.trigger?.focus();
        ke.preventDefault();
        return;
      }

      // Focus trap: keep Tab/Shift+Tab within the calendar popup
      if (key === 'Tab' && !this.options.inline && this.container) {
        const focusable = this.container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"]), select, input',
        );
        if (focusable.length) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const active = (this.shadowRoot || document).activeElement as HTMLElement | null;
          if (ke.shiftKey && active === first) {
            ke.preventDefault();
            last.focus();
          } else if (!ke.shiftKey && active === last) {
            ke.preventDefault();
            first.focus();
          }
        }
      }

      // Arrow navigation
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', ' '].includes(key)) {
        ke.preventDefault();
        this._handleDayGridKey(key);
      }
    });
  }

  private _handleDayGridKey(key: string): void {
    if (!this.focusedDate) {
      // Start from today or first visible day
      this.focusedDate = toMidnight(new Date());
      this.updateDayClasses();
      this._scrollToFocused();
      return;
    }

    let newDate = new Date(this.focusedDate);

    switch (key) {
      case 'ArrowRight':
        newDate.setDate(newDate.getDate() + 1);
        break;
      case 'ArrowLeft':
        newDate.setDate(newDate.getDate() - 1);
        break;
      case 'ArrowDown':
        newDate.setDate(newDate.getDate() + 7);
        break;
      case 'ArrowUp':
        newDate.setDate(newDate.getDate() - 7);
        break;
      case 'Home':
        newDate = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
        break;
      case 'End':
        newDate = new Date(newDate.getFullYear(), newDate.getMonth() + 1, 0);
        break;
      case 'PageDown':
        newDate = new Date(newDate.getFullYear(), newDate.getMonth() + 1, newDate.getDate());
        break;
      case 'PageUp':
        newDate = new Date(newDate.getFullYear(), newDate.getMonth() - 1, newDate.getDate());
        break;
      case 'Enter':
      case ' ':
        if (!this.focusedDate) return;
        const today = toMidnight(new Date());
        if (this.focusedDate >= today) {
          this.selectDate(this.focusedDate, 0);
        }
        return;
    }

    // Check if we navigated to a different month
    if (newDate.getMonth() !== this.date.getMonth() || newDate.getFullYear() !== this.date.getFullYear()) {
      this.date = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
      this.focusedDate = newDate;
      this.renderCalendar();
      this.updateDayClasses();
      this.emit('monthChanged', { date: new Date(this.date), direction: newDate > this.focusedDate ? 'next' : 'prev' });
    } else {
      this.focusedDate = newDate;
      this.updateDayClasses();
    }

    this._scrollToFocused();
  }

  private _scrollToFocused(): void {
    requestAnimationFrame(() => {
      const root = this.shadowRoot || this.container;
      const focused = root?.querySelector('.mc-day--focused') as HTMLElement | null;
      focused?.focus();
    });
  }

  // --- Label & Hidden Input ---

  updateButtonLabel(): void {
    const btn = this.trigger;
    let text = this.options.placeholder || this.locale.strings.placeholder;

    if (this.mode === 'multiple' && this.selectedDates?.length > 0) {
      text = [...this.selectedDates]
        .sort((a, b) => a.getTime() - b.getTime())
        .map((d) => this.formatDisplay(d))
        .join(', ');
    } else if (this.startDate && this.endDate) {
      const d1 = this.startDate;
      const d2 = this.endDate;
      const first = d1.getTime() <= d2.getTime() ? d1 : d2;
      const last = d1.getTime() > d2.getTime() ? d1 : d2;
      text = this.options.format!(this.formatDisplay(first), this.formatDisplay(last));
    } else if (this.startDate) {
      text = this.options.format!(this.formatDisplay(this.startDate), null);
    }

    const labelEl = btn?.querySelector('.dates') ?? this.container?.querySelector('.dates');
    if (labelEl) {
      if (!this.startDate && !this.endDate && (!this.selectedDates || this.selectedDates.length === 0)) {
        labelEl.textContent = this._initialLabelValue || '';
      } else {
        labelEl.textContent = text;
      }
    }

    this.updateHiddenInput();
  }

  updateHiddenInput(): void {
    if (!this.hiddenInput) return;

    let value: HiddenInputValue | '' = '';

    if (this.mode === 'single') {
      value = this.selectedDate
        ? { mode: 'single', dates: [this.selectedDate.getTime()] }
        : '';
    } else if (this.mode === 'range') {
      const t1 = this.startDate?.getTime() ?? null;
      const t2 = this.endDate?.getTime() ?? null;
      if (t1 && t2) value = { mode: 'range', dates: [t1, t2] };
      else if (t1) value = { mode: 'range', dates: [t1] };
      else value = '';
    } else if (this.mode === 'multiple') {
      const arr = this.selectedDates?.length > 0
        ? [...this.selectedDates].sort((a, b) => a.getTime() - b.getTime()).map((d) => d.getTime())
        : [];
      value = arr.length ? { mode: 'multiple', dates: arr } : '';
    }

    this.hiddenInput.value = value ? JSON.stringify(value) : '';
  }

  // --- Utilities ---

  triggerInvalidRangeFeedback(): void {
    this.triggerErrorFeedback();
  }

  formatDisplay(date: Date): string {
    return formatDateDisplay(date, this.locale);
  }

  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getDateRangeArray(startDate: Date, endDate: Date): Date[] {
    const range: Date[] = [];
    const dir = startDate < endDate ? 1 : -1;
    const current = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const endMidnight = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    while ((dir > 0 && current <= endMidnight) || (dir < 0 && current >= endMidnight)) {
      range.push(new Date(current));
      current.setDate(current.getDate() + dir);
      // Re-normalize to midnight to guard against DST hour drift
      current.setHours(0, 0, 0, 0);
    }
    return range;
  }

  // --- Status Message API ---

  setStatusMessage(state: StatusMessageState): void {
    if (!this.showStatusMessages) {
      this._statusMessageState = null;
      return;
    }
    this._statusMessageState = state;
    this._renderStatusMessage();
    this.emit('statusMessage', state);

    // Auto-hide
    if (this._statusAutoHideTimer) clearTimeout(this._statusAutoHideTimer);
    const delay = state.autoHideDelay ?? 4000;
    if (delay > 0) {
      this._statusAutoHideTimer = setTimeout(() => this.clearStatusMessage(), delay);
    }
  }

  clearStatusMessage(): void {
    if (this._statusAutoHideTimer) {
      clearTimeout(this._statusAutoHideTimer);
      this._statusAutoHideTimer = null;
    }
    this._statusMessageState = null;
    this._removeStatusElement();
    this.emit('statusCleared', undefined as never);
  }

  private _renderStatusMessage(): void {
    if (!this.container) return;
    this._removeStatusElement();

    const state = this._statusMessageState;
    if (!state) return;

    const root = this.shadowRoot || this.container;
    const statusEl = document.createElement('div');
    statusEl.className = `mc-status mc-status--${state.type}`;
    statusEl.setAttribute('role', state.type === 'error' ? 'alert' : 'status');
    statusEl.setAttribute('aria-live', state.type === 'error' ? 'assertive' : 'polite');

    // Icon
    const iconSvg = this._getStatusIcon(state.type);
    const iconEl = document.createElement('span');
    iconEl.className = 'mc-status__icon';
    iconEl.innerHTML = iconSvg;
    statusEl.appendChild(iconEl);

    // Text
    const textEl = document.createElement('span');
    textEl.className = 'mc-status__text';
    textEl.textContent = state.text;
    statusEl.appendChild(textEl);

    this.container.appendChild(statusEl);
  }

  private _removeStatusElement(): void {
    const root = this.shadowRoot || this.container;
    root?.querySelector('.mc-status')?.remove();
  }

  private _getStatusIcon(type: StatusMessageType): string {
    switch (type) {
      case 'info':
        return '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
      case 'warning':
        return '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
      case 'error':
        return '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>';
    }
  }

  // --- Error Feedback ---

  triggerErrorFeedback(): void {
    if (!this.container) return;
    this.container.classList.remove('mc-error-feedback');
    // Force reflow to restart animation
    void this.container.offsetWidth;
    this.container.classList.add('mc-error-feedback');
    setTimeout(() => this.container?.classList.remove('mc-error-feedback'), 600);
  }

  notifyInvalidSelection(reason: string, type: StatusMessageType = 'error'): void {
    if (type === 'error' || type === 'warning') {
      this.triggerErrorFeedback();
    }
    this.setStatusMessage({ type, text: reason, autoHideDelay: 4000 });
    this.emit('invalidSelection', { type, reason });
  }

  // --- Locale API ---

  setLocale(code: string, opts: { reRender?: boolean } = {}): void {
    this.locale = getLocale(code);
    this.emit('localeChanged', { locale: code });
    if (opts.reRender !== false && this._initialized) {
      this.renderCalendar();
      this.updateDayClasses();
    }
  }

  setWeekStartsOn(day: number, opts: { reRender?: boolean } = {}): void {
    const normalized = ((Math.round(day) % 7) + 7) % 7;
    this.locale = { ...this.locale, firstDayOfWeek: normalized };
    if (opts.reRender !== false && this._initialized) {
      this.renderCalendar();
      this.updateDayClasses();
    }
  }

  getResolvedLocale(): string {
    return this.locale.code;
  }

  getLabelElement(): HTMLElement | null {
    return (this.trigger?.querySelector('.dates') ??
      this.container?.querySelector('.dates')) as HTMLElement | null;
  }

  // --- Range/Multiple Validation ---

  private _validateRangeSelection(start: Date, end: Date): boolean {
    const minNights = this.options.minRangeNights;
    const maxNights = this.options.maxRangeNights;
    if (minNights == null && maxNights == null) return true;

    const nights = Math.round(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    if (minNights != null && nights < minNights) {
      this.notifyInvalidSelection(
        this.locale.code.startsWith('fr')
          ? `Minimum ${minNights} nuit${minNights > 1 ? 's' : ''} requise${minNights > 1 ? 's' : ''}`
          : `Minimum ${minNights} night${minNights > 1 ? 's' : ''} required`,
        'warning',
      );
      return false;
    }

    if (maxNights != null && nights > maxNights) {
      this.notifyInvalidSelection(
        this.locale.code.startsWith('fr')
          ? `Maximum ${maxNights} nuit${maxNights > 1 ? 's' : ''} autorisée${maxNights > 1 ? 's' : ''}`
          : `Maximum ${maxNights} night${maxNights > 1 ? 's' : ''} allowed`,
        'warning',
      );
      return false;
    }

    return true;
  }

  private _validateMultipleSelection(): boolean {
    const max = this.options.maxMultipleDates;
    if (max == null) return true;

    if (this.selectedDates.length >= max) {
      this.notifyInvalidSelection(
        this.locale.code.startsWith('fr')
          ? `Maximum ${max} date${max > 1 ? 's' : ''} autorisée${max > 1 ? 's' : ''}`
          : `Maximum ${max} date${max > 1 ? 's' : ''} allowed`,
        'warning',
      );
      return false;
    }
    return true;
  }
}
