import calendarStyles from './styles.css?inline';
const LAZY_PLUGIN_FLAG = Symbol.for('nova-calendar.lazyPlugin');
const PLUGIN_REQUEST_FLAG = Symbol.for('nova-calendar.pluginRequest');
const MS_IN_DAY = 86400000;
let CALENDAR_ID_COUNTER = 0;

const DEFAULT_A11Y_OPTIONS = {
	calendarLabel: 'Sélecteur de dates',
	calendarRoleDescription: 'Sélecteur de dates',
	dayRoleDescription: 'Jour du calendrier',
	instructions:
		'Utilisez Tab ou Entrée pour sélectionner une date. Appuyez sur Esc pour fermer.',
	previousMonthLabel: 'Mois précédent',
	nextMonthLabel: 'Mois suivant',
	monthHeadingLevel: 2,
	monthLabelFormatter: null,
	dayLabelFormatter: null,
	weekdayLabelFormatter: null,
};

const rotateWeekdays = (items, startIndex = 0) => {
	if (!Array.isArray(items) || !items.length) return items || [];
	const normalized = Number.isFinite(startIndex)
		? ((Math.round(startIndex) % items.length) + items.length) % items.length
		: 0;
	if (normalized === 0) return items;
	return [...items.slice(normalized), ...items.slice(0, normalized)];
};

const DEFAULT_FORMAT = (start, end) => {
	if (start && end) return `${start} – ${end}`;
	if (start) return start;
	return '';
};

const DEFAULT_OPTIONS = {
	trigger: null,
	mode: 'single',
	inline: false,
	appendTo: null,
	placeholder: 'Sélectionnez une date',
	labelSelector: null,
	date: null,
	startDate: null,
	endDate: null,
	selectedDate: null,
	selectedDates: [],
	format: DEFAULT_FORMAT,
	plugins: [],
	name: '',
	minRangeNights: 0,
	maxRangeNights: 0,
	minMultipleDates: 0,
	maxMultipleDates: 0,
	blockCounter: false,
	blockCounterLabel: '',
	strictRange2Months: false,
	triggerInvalidRangeFeedback: null,
	showStatusMessages: true,
	dropdownAlign: 'left',
	tooltip: false,
	singleTooltip: false,
	multipleTooltip: false,
	timeTooltip: false,
	applyAction: null,
	mobileBreakpoint: 768,
	theme: null,
	locale: undefined,
	a11y: undefined,
	weekStartsOn: 1,
};

const ALLOWED_MODES = new Set(['single', 'range', 'multiple']);
const ALLOWED_ALIGNMENTS = new Set(['left', 'center', 'right']);

export class NovaCalendar {
	static instances = [];
	static globalPlugins = [];
	static pluginLoaders = new Map();

	static use(plugin) {
		if (plugin) this.globalPlugins.push(plugin);
	}

	static registerPluginLoader(name, loader) {
		if (typeof name !== 'string' || !name.trim()) return;
		if (typeof loader !== 'function') return;
		this.pluginLoaders.set(name.trim(), loader);
	}

	static lazyPlugin(loader) {
		if (typeof loader !== 'function') {
			throw new TypeError(
				'NovaCalendar.lazyPlugin requiert une fonction de chargement.'
			);
		}
		return {
			[LAZY_PLUGIN_FLAG]: true,
			loader,
		};
	}

	static requestPlugin(name, options) {
		if (typeof name !== 'string' || !name.trim()) {
			throw new TypeError(
				'NovaCalendar.requestPlugin requiert un nom de plugin.'
			);
		}
		return {
			[PLUGIN_REQUEST_FLAG]: true,
			name: name.trim(),
			options,
		};
	}

	static _resolvePluginRequest(name, options, calendarInstance) {
		const loader = this.pluginLoaders.get(name);
		if (!loader) {
			console.warn(`NovaCalendar: plugin "${name}" introuvable.`);
			return null;
		}
		try {
			return loader(options, calendarInstance);
		} catch (error) {
			console.error(
				`NovaCalendar: erreur lors du chargement du plugin "${name}".`,
				error
			);
			return null;
		}
	}

	constructor(options = {}) {
		const merged = { ...DEFAULT_OPTIONS, ...options };
		if (typeof merged.format !== 'function') merged.format = DEFAULT_FORMAT;
		this.options = merged;
		this.locale = this.resolveLocale(merged.locale);
		this.a11y = this.normalizeA11yOptions(merged.a11y);
		this._instanceId = ++CALENDAR_ID_COUNTER;
		this._ids = this.buildA11yDomIds(this._instanceId);
		this._focusedDate = null;
		this._desiredFocusDate = null;
		this._shouldMoveFocusOnRender = false;
		this.weekStartsOn = this.normalizeWeekday(merged.weekStartsOn, 1);
		this.labelSelectorConfig = this.normalizeLabelSelector(
			merged.labelSelector
		);

		const requestedMode = String(merged.mode || 'single').toLowerCase();
		this.mode = ALLOWED_MODES.has(requestedMode) ? requestedMode : 'single';

		this.tooltipConfigs = this.normalizeTooltipOptions(merged);

		const baseDate = this.parseDate(merged.date) || new Date();
		this.date = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);

		this.inlineHostOption = merged.inline;
		this.inline =
			merged.inline === true ||
			typeof merged.inline === 'string' ||
			merged.inline instanceof HTMLElement;

		this._themeMode = this.normalizeThemePreference(merged.theme) || 'auto';

		const alignOption = merged.dropdownAlign ?? merged.align ?? 'left';
		const requestedAlign =
			typeof alignOption === 'string' ? alignOption.toLowerCase() : 'left';
		this.dropdownAlign = ALLOWED_ALIGNMENTS.has(requestedAlign)
			? requestedAlign
			: 'left';

		const breakpointValue = Number(merged.mobileBreakpoint);
		this.mobileBreakpoint =
			Number.isFinite(breakpointValue) && breakpointValue > 0
				? breakpointValue
				: 768;

		this.minRangeNights = Math.max(0, Number(merged.minRangeNights) || 0);
		this.maxRangeNights = Math.max(0, Number(merged.maxRangeNights) || 0);
		if (this.maxRangeNights && this.maxRangeNights < this.minRangeNights) {
			this.maxRangeNights = this.minRangeNights;
		}

		this.minMultipleDates = Math.max(0, Number(merged.minMultipleDates) || 0);
		this.maxMultipleDates = Math.max(0, Number(merged.maxMultipleDates) || 0);
		if (
			this.maxMultipleDates &&
			this.maxMultipleDates < this.minMultipleDates
		) {
			this.maxMultipleDates = this.minMultipleDates;
		}

		this.blockCounterEnabled = !!merged.blockCounter;
		if (
			typeof merged.blockCounter === 'string' &&
			merged.blockCounter.trim().length > 0
		) {
			this.blockCounterCustomLabel = merged.blockCounter.trim();
		} else if (
			typeof merged.blockCounterLabel === 'string' &&
			merged.blockCounterLabel.trim().length > 0
		) {
			this.blockCounterCustomLabel = merged.blockCounterLabel.trim();
		} else {
			this.blockCounterCustomLabel = '';
		}

		this.triggerInvalidRangeFeedback =
			typeof merged.triggerInvalidRangeFeedback === 'function'
				? merged.triggerInvalidRangeFeedback
				: null;

		this.showStatusMessages = merged.showStatusMessages !== false;

		this.strictRange2Months = !!merged.strictRange2Months;

		this.wrapper = null;
		this.shadowRoot = null;
		this.container = null;
		this.appendTarget = null;
		this.trigger = null;
		this.hiddenInput =
			merged.hiddenInput instanceof HTMLElement ? merged.hiddenInput : null;
		this._hiddenInputSelector =
			typeof merged.hiddenInput === 'string' && merged.hiddenInput.trim()
				? merged.hiddenInput.trim()
				: '';
		this._ownsHiddenInput = false;
		this._initialLabelValue = merged.placeholder || '';
		this._labelElement = null;
		this.isOpen = false;
		this.keepOpenOnSelection = !!merged.keepOpenOnSelection;
		this.applyActionConfig = this.normalizeApplyActionOptions(
			merged.applyAction
		);
		this._calendarApplyButton = null;
		this._calendarActionsContainer = null;
		this._calendarClearButton = null;
		this._instructionsElement = null;
		this._weekdayMetadataCache = null;
		this._keyboardNavigationLocked = false;

		this.dayElements = [];
		this.monthOffsets = [];
		this._hoverTooltipEl = null;
		this._hoverHideTimeout = null;
		this._touchTooltipStickyTarget = null;
		this._lastPointerType = null;
		this._pointerEventsSupported =
			typeof window !== 'undefined' && 'PointerEvent' in window;
		this._mobileLayoutApplied = false;
		this._mobileBackdropClickHandler = null;

		this.hoverDate = null;
		this.startDate =
			this.mode === 'range'
				? this.normalizeDate(this.parseDate(merged.startDate))
				: null;
		this.endDate =
			this.mode === 'range'
				? this.normalizeDate(this.parseDate(merged.endDate))
				: null;
		this.selectedDate =
			this.mode === 'single'
				? this.normalizeDate(
						this.parseDate(
							merged.selectedDate ?? merged.startDate ?? merged.date
						)
				  )
				: null;
		this.selectedDates =
			this.mode === 'multiple'
				? Array.isArray(merged.selectedDates)
					? merged.selectedDates
							.map((value) => this.normalizeDate(this.parseDate(value)))
							.filter(Boolean)
					: []
				: [];

		this._blockCounterCoreState = {
			active: false,
			count: 0,
			min: 0,
			max: 0,
			label: '',
		};
		this._blockCounterOverrideState = null;

		this._statusMessageState = null;
		this._statusMessageOverride = null;
		this._statusContainer = null;
		this._statusMessageText = null;
		this._statusAutoHideTimeout = null;
		this._statusAutoHideTicket = null;

		this._timePluginState = null;
		this._errorFeedbackTimeout = null;

		this.multipleSelectionMeetsMinimum = true;
		this.multipleSelectionWithinMaximum = true;

		this._outsideClickHandler = null;
		this._triggerClickHandler = null;
		this._boundRepositionHandler = null;
		this._shadowKeydownHandler = null;

		this._initialized = false;

		this.plugins = [];

		const pluginCandidates = [];
		if (Array.isArray(NovaCalendar.globalPlugins)) {
			pluginCandidates.push(...NovaCalendar.globalPlugins);
		}
		if (Array.isArray(merged.plugins)) {
			pluginCandidates.push(...merged.plugins);
		}
		pluginCandidates.forEach((plugin) => this.addPlugin(plugin));

		NovaCalendar.instances.push(this);

		if (typeof document !== 'undefined') {
			this.init();
		}
	}

	normalizeThemePreference(value) {
		if (value === undefined || value === null) return 'auto';
		if (typeof value !== 'string') return null;
		const normalized = value.trim().toLowerCase();
		if (!normalized) return 'auto';
		if (normalized === 'dark' || normalized === 'light') return normalized;
		if (
			normalized === 'auto' ||
			normalized === 'system' ||
			normalized === 'default'
		)
			return 'auto';
		return null;
	}

	getResolvedLocale() {
		return this.locale || 'fr-FR';
	}

	setLocale(locale, options = {}) {
		const resolved = this.resolveLocale(locale);
		if (!resolved || resolved === this.locale) return this.locale;
		this.locale = resolved;
		this._weekdayMetadataCache = null;
		if (options.reRender === false) return this.locale;
		this.renderCalendar();
		this.updateDayClasses();
		return this.locale;
	}

	formatDateLocalized(value, options = {}) {
		if (!(value instanceof Date)) return '';
		const locale = this.getResolvedLocale();
		try {
			return value.toLocaleDateString(locale, options);
		} catch (error) {
			return value.toLocaleDateString('fr-FR', options);
		}
	}

	formatTimeLocalized(value, options = {}) {
		if (!(value instanceof Date)) return '';
		const locale = this.getResolvedLocale();
		try {
			return value.toLocaleTimeString(locale, options);
		} catch (error) {
			return value.toLocaleTimeString('fr-FR', options);
		}
	}

	normalizeWeekday(value, fallback = 0) {
		const candidate = Number(value);
		if (Number.isFinite(candidate)) {
			const normalized = Math.round(candidate) % 7;
			return normalized < 0 ? normalized + 7 : normalized;
		}
		const fallbackCandidate = Number(fallback);
		if (Number.isFinite(fallbackCandidate)) {
			const normalized = Math.round(fallbackCandidate) % 7;
			return normalized < 0 ? normalized + 7 : normalized;
		}
		return 0;
	}

	setWeekStartsOn(value, options = {}) {
		const normalized = this.normalizeWeekday(value, this.weekStartsOn);
		if (normalized === this.weekStartsOn) return this.weekStartsOn;
		this.weekStartsOn = normalized;
		this._weekdayMetadataCache = null;
		if (options.reRender === false) return this.weekStartsOn;
		this.renderCalendar();
		return this.weekStartsOn;
	}

	shouldIgnoreOutsideClose(event, pathOverride = null) {
		const hasElementInterface = typeof Element !== 'undefined';
		const target = event?.target;
		const matchesIgnore = (node) => {
			if (!hasElementInterface || !(node instanceof Element)) return false;
			const attribute = node.getAttribute?.('data-novacalendar-ignore');
			if (typeof attribute === 'string') {
				return attribute.toLowerCase() === 'outside-close';
			}
			return false;
		};
		if (hasElementInterface && target && typeof target.closest === 'function') {
			const closest = target.closest(
				'[data-novacalendar-ignore="outside-close"]'
			);
			if (closest) return true;
		}
		const path = pathOverride || event?.composedPath?.() || event?.path || [];
		for (const node of path) {
			if (matchesIgnore(node)) {
				return true;
			}
		}
		return false;
	}

	resolveLocale(value) {
		if (typeof value === 'string' && value.trim()) {
			const normalized = value.trim();
			if (normalized.toLowerCase() !== 'default') {
				return normalized;
			}
		}
		if (typeof navigator !== 'undefined' && navigator.language) {
			return navigator.language;
		}
		return 'fr-FR';
	}

	normalizeA11yOptions(rawOptions) {
		const base = { ...DEFAULT_A11Y_OPTIONS };
		if (!rawOptions || typeof rawOptions !== 'object') return base;
		const normalized = { ...base };
		Object.entries(rawOptions).forEach(([key, value]) => {
			if (value === undefined || value === null) return;
			if (typeof base[key] === 'string') {
				if (typeof value === 'string' && value.trim()) {
					normalized[key] = value.trim();
				}
				return;
			}
			if (key === 'monthHeadingLevel') {
				const level = Number(value);
				if (Number.isFinite(level) && level >= 1 && level <= 6) {
					normalized.monthHeadingLevel = level;
				}
				return;
			}
			if (key.endsWith('Formatter') && typeof value === 'function') {
				normalized[key] = value;
			}
		});
		return normalized;
	}

	buildA11yDomIds(counter) {
		const idBase = `nova-calendar-${counter}`;
		return {
			wrapper: `${idBase}-host`,
			container: `${idBase}-dialog`,
			grid: `${idBase}-grid`,
			monthLabel: `${idBase}-month-label`,
			instructions: `${idBase}-instructions`,
		};
	}

	supportsPointerEvents() {
		return !!this._pointerEventsSupported;
	}

	isTouchLikePointer(pointerType) {
		return pointerType === 'touch' || pointerType === 'pen';
	}

	resolvePointerType(event) {
		if (!event) return null;
		const { pointerType } = event;
		if (typeof pointerType === 'string' && pointerType) {
			return pointerType.toLowerCase();
		}
		if (typeof pointerType === 'number') {
			switch (pointerType) {
				case 2:
					return 'touch';
				case 3:
					return 'pen';
				case 4:
					return 'mouse';
			}
		}
		if (typeof event.type === 'string') {
			if (event.type.startsWith('mouse') || event.type === 'mouseenter')
				return 'mouse';
			if (event.type.startsWith('touch')) return 'touch';
			if (event.type.startsWith('pen')) return 'pen';
		}
		return null;
	}

	updatePointerTypeFromEvent(event) {
		const pointerType = this.resolvePointerType(event);
		if (pointerType) this._lastPointerType = pointerType;
		return pointerType;
	}

	getEffectivePointerType(event, fallback = 'mouse') {
		return (
			this.updatePointerTypeFromEvent(event) ||
			this._lastPointerType ||
			fallback
		);
	}

	parseDate(value) {
		if (!value && value !== 0) return null;
		if (value instanceof Date) return new Date(value.getTime());
		if (typeof value === 'number') {
			const fromNumber = new Date(value);
			return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
		}
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	normalizeDate(value) {
		if (!(value instanceof Date)) return null;
		return new Date(value.getFullYear(), value.getMonth(), value.getDate());
	}

	normalizeTooltipOptions(options) {
		const formatWithLocale = (date, opts) =>
			this.formatDateLocalized(date, opts);
		const formatDateDefault = (date) =>
			formatWithLocale(date, {
				day: 'numeric',
				month: 'long',
				year: 'numeric',
			});
		const resolveRequested = (value) =>
			typeof value === 'string' ? value.trim().toLowerCase() : '';
		const normalizeRange = (value, fallbackEnabled = false) => {
			if (value === false) return null;
			if (value === undefined && !fallbackEnabled) return null;
			const baseConfig = {
				type: 'range',
				enabled: true,
				showDate: true,
				showCount: true,
				countMode: 'nights',
				offsetX: 0,
				offsetY: 0,
				render: null,
				formatDate: formatDateDefault,
				countFormatter: null,
				extraClass: '',
			};
			if (value === true || value === undefined) return baseConfig;
			if (typeof value === 'function') return { ...baseConfig, render: value };
			if (typeof value !== 'object' || value === null) return null;
			if (value.enabled === false) return null;
			const requestedCountMode = resolveRequested(value.countMode);
			return {
				...baseConfig,
				showDate: value.showDate !== false,
				showCount: value.showCount !== false,
				countMode:
					requestedCountMode === 'days'
						? 'days'
						: requestedCountMode === 'nights'
						? 'nights'
						: baseConfig.countMode,
				offsetX: Number.isFinite(value.offsetX)
					? Number(value.offsetX)
					: baseConfig.offsetX,
				offsetY: Number.isFinite(value.offsetY)
					? Number(value.offsetY)
					: baseConfig.offsetY,
				render:
					typeof value.render === 'function' ? value.render : baseConfig.render,
				formatDate:
					typeof value.formatDate === 'function'
						? value.formatDate
						: baseConfig.formatDate,
				countFormatter:
					typeof value.countFormatter === 'function'
						? value.countFormatter
						: baseConfig.countFormatter,
				extraClass:
					typeof value.extraClass === 'string' && value.extraClass.trim()
						? value.extraClass.trim()
						: baseConfig.extraClass,
			};
		};
		const normalizeMultiple = (value, fallbackEnabled = false) => {
			if (value === false) return null;
			if (value === undefined && !fallbackEnabled) return null;
			const baseConfig = {
				type: 'multiple',
				enabled: true,
				showDate: true,
				showCount: true,
				showRemaining: true,
				offsetX: 0,
				offsetY: 0,
				render: null,
				formatDate: formatDateDefault,
				countFormatter: null,
				remainingFormatter: null,
				extraClass: '',
			};
			if (value === true || value === undefined) return baseConfig;
			if (typeof value === 'function') return { ...baseConfig, render: value };
			if (typeof value !== 'object' || value === null) return null;
			if (value.enabled === false) return null;
			return {
				...baseConfig,
				showDate: value.showDate !== false,
				showCount: value.showCount !== false,
				showRemaining: value.showRemaining !== false,
				offsetX: Number.isFinite(value.offsetX)
					? Number(value.offsetX)
					: baseConfig.offsetX,
				offsetY: Number.isFinite(value.offsetY)
					? Number(value.offsetY)
					: baseConfig.offsetY,
				render:
					typeof value.render === 'function' ? value.render : baseConfig.render,
				formatDate:
					typeof value.formatDate === 'function'
						? value.formatDate
						: baseConfig.formatDate,
				countFormatter:
					typeof value.countFormatter === 'function'
						? value.countFormatter
						: baseConfig.countFormatter,
				remainingFormatter:
					typeof value.remainingFormatter === 'function'
						? value.remainingFormatter
						: baseConfig.remainingFormatter,
				extraClass:
					typeof value.extraClass === 'string' && value.extraClass.trim()
						? value.extraClass.trim()
						: baseConfig.extraClass,
			};
		};
		const normalizeSingle = (value, fallbackEnabled = false) => {
			if (value === false) return null;
			if (value === undefined && !fallbackEnabled) return null;
			const baseConfig = {
				type: 'single',
				enabled: true,
				showDate: true,
				offsetX: 0,
				offsetY: 0,
				render: null,
				formatDate: formatDateDefault,
				extraClass: '',
			};
			if (value === true || value === undefined) return baseConfig;
			if (typeof value === 'function') return { ...baseConfig, render: value };
			if (typeof value !== 'object' || value === null) return null;
			if (value.enabled === false) return null;
			return {
				...baseConfig,
				showDate: value.showDate !== false,
				offsetX: Number.isFinite(value.offsetX)
					? Number(value.offsetX)
					: baseConfig.offsetX,
				offsetY: Number.isFinite(value.offsetY)
					? Number(value.offsetY)
					: baseConfig.offsetY,
				render:
					typeof value.render === 'function' ? value.render : baseConfig.render,
				formatDate:
					typeof value.formatDate === 'function'
						? value.formatDate
						: baseConfig.formatDate,
				extraClass:
					typeof value.extraClass === 'string' && value.extraClass.trim()
						? value.extraClass.trim()
						: baseConfig.extraClass,
			};
		};
		const normalizeTime = (value, fallbackEnabled = false) => {
			if (value === false) return null;
			if (value === undefined && !fallbackEnabled) return null;
			const baseConfig = {
				type: 'time',
				enabled: true,
				showDate: true,
				showBlock: true,
				offsetX: 0,
				offsetY: 0,
				render: null,
				formatDate: formatDateDefault,
				formatBlock: (blockLabel) => blockLabel,
				extraClass: '',
			};
			if (value === true || value === undefined) return baseConfig;
			if (typeof value === 'function') return { ...baseConfig, render: value };
			if (typeof value !== 'object' || value === null) return null;
			if (value.enabled === false) return null;
			return {
				...baseConfig,
				showDate: value.showDate !== false,
				showBlock: value.showBlock !== false,
				offsetX: Number.isFinite(value.offsetX)
					? Number(value.offsetX)
					: baseConfig.offsetX,
				offsetY: Number.isFinite(value.offsetY)
					? Number(value.offsetY)
					: baseConfig.offsetY,
				render:
					typeof value.render === 'function' ? value.render : baseConfig.render,
				formatDate:
					typeof value.formatDate === 'function'
						? value.formatDate
						: baseConfig.formatDate,
				formatBlock:
					typeof value.formatBlock === 'function'
						? value.formatBlock
						: baseConfig.formatBlock,
				extraClass:
					typeof value.extraClass === 'string' && value.extraClass.trim()
						? value.extraClass.trim()
						: baseConfig.extraClass,
			};
		};
		const result = { range: null, multiple: null, single: null, time: null };
		const tooltipOption = options.tooltip;
		const fallbackAllEnabled = tooltipOption === true;
		const tooltipObject =
			tooltipOption && typeof tooltipOption === 'object' ? tooltipOption : null;
		if (Object.prototype.hasOwnProperty.call(options, 'rangeTooltip')) {
			console.warn(
				'NovaCalendar: l\'option "rangeTooltip" est obsolète. Utilisez `tooltip.range` à la place.'
			);
		}
		result.range = normalizeRange(
			tooltipObject?.range,
			fallbackAllEnabled && this.mode === 'range'
		);
		result.multiple = normalizeMultiple(
			tooltipObject?.multiple ?? options.multipleTooltip,
			fallbackAllEnabled && this.mode === 'multiple'
		);
		result.single = normalizeSingle(
			tooltipObject?.single ?? options.singleTooltip,
			fallbackAllEnabled && this.mode === 'single'
		);
		const timeOption =
			tooltipObject?.time ??
			options.timeTooltip ??
			(fallbackAllEnabled ? true : undefined);
		result.time = normalizeTime(timeOption, fallbackAllEnabled);
		return result;
	}

	normalizeApplyActionOptions(option) {
		const base = {
			calendar: false,
			time: false,
			label: 'Appliquer',
			calendarLabel: '',
			timeLabel: '',
			close: true,
			clear: false,
			clearLabel: 'Effacer',
			clearClose: false,
			timeClear: false,
		};
		if (option === false || option == null) return base;
		if (option === true) {
			return {
				...base,
				calendar: true,
				time: true,
				clear: true,
				timeClear: true,
			};
		}
		if (typeof option === 'string') {
			const text = option.trim().toLowerCase();
			if (text === 'calendar') return { ...base, calendar: true, clear: true };
			if (text === 'time') return { ...base, time: true, timeClear: true };
			if (text === 'both' || text === 'all') {
				return {
					...base,
					calendar: true,
					time: true,
					clear: true,
					timeClear: true,
				};
			}
			const label = option.trim();
			return label ? { ...base, label } : base;
		}
		if (typeof option !== 'object') return base;
		const config = { ...base };
		if (option.calendar === true) config.calendar = true;
		if (option.calendar === false) config.calendar = false;
		if (option.time === true) config.time = true;
		if (option.time === false) config.time = false;
		if (typeof option.label === 'string' && option.label.trim()) {
			config.label = option.label.trim();
		}
		if (
			typeof option.calendarLabel === 'string' &&
			option.calendarLabel.trim()
		) {
			config.calendarLabel = option.calendarLabel.trim();
		}
		if (typeof option.timeLabel === 'string' && option.timeLabel.trim()) {
			config.timeLabel = option.timeLabel.trim();
		}
		if (option.close === false) config.close = false;
		const hasExplicitClear = Object.prototype.hasOwnProperty.call(
			option,
			'clear'
		);
		if (hasExplicitClear) {
			config.clear = option.clear !== false;
		} else if (config.calendar) {
			config.clear = true;
		}
		if (typeof option.clearLabel === 'string' && option.clearLabel.trim()) {
			config.clearLabel = option.clearLabel.trim();
		}
		if (option.clearClose === true) config.clearClose = true;
		if (option.clearClose === false) config.clearClose = false;
		const hasExplicitTimeClear = Object.prototype.hasOwnProperty.call(
			option,
			'timeClear'
		);
		let timeClearValue = config.clear;
		if (hasExplicitTimeClear) {
			timeClearValue = option.timeClear !== false;
		} else if (!hasExplicitClear && config.time && !config.calendar) {
			timeClearValue = true;
		}
		config.timeClear = timeClearValue;
		return config;
	}

	normalizeLabelSelector(selector) {
		if (typeof selector !== 'string' || !selector.trim()) {
			return null;
		}
		const trimmed = selector.trim();
		if (trimmed.startsWith('#')) {
			const idValue = trimmed.slice(1).trim();
			if (!idValue || !/^[-_a-zA-Z0-9]+$/.test(idValue)) {
				console.warn(
					'NovaCalendar: `labelSelector` doit être un identifiant simple (ex: "#mon-id"). '
				);
				return null;
			}
			return {
				type: 'id',
				token: idValue,
				selector: `#${idValue}`,
				raw: trimmed,
			};
		}
		if (trimmed.startsWith('.')) {
			const classTokens = trimmed
				.split('.')
				.filter(Boolean)
				.map((token) => token.trim())
				.filter(Boolean);
			if (
				!classTokens.length ||
				classTokens.some((token) => !/^[-_a-zA-Z0-9]+$/.test(token))
			) {
				console.warn(
					'NovaCalendar: `labelSelector` doit être une classe simple (ex: ".dates-label"). '
				);
				return null;
			}
			return {
				type: 'class',
				selector: classTokens.map((token) => `.${token}`).join(''),
				raw: trimmed,
			};
		}
		console.warn(
			'NovaCalendar: `labelSelector` doit commencer par "." ou "#". '
		);
		return null;
	}

	ensureLabelElement(placeholder) {
		if (typeof document === 'undefined') return null;
		const config = this.labelSelectorConfig;
		const placeholderText =
			typeof placeholder === 'string'
				? placeholder
				: this.options.placeholder || '';
		let element = null;
		if (config) {
			if (config.type === 'id' && config.token) {
				element = document.getElementById(config.token);
				if (!element && this.trigger && config.selector) {
					element = this.trigger.querySelector(config.selector);
				}
			} else if (config.type === 'class' && this.trigger && config.selector) {
				element = this.trigger.querySelector(config.selector);
			}
			if (!element) {
				console.warn(
					`NovaCalendar: aucun élément trouvé avec le sélecteur \
					\`${config.raw}\`. Utilisation du label par défaut.`
				);
			}
		}

		if (!element && this.trigger) {
			element = this.trigger.querySelector('.dates');
		}

		if (!element && this.trigger) {
			const span = document.createElement('span');
			span.className = 'dates';
			if (placeholderText) span.textContent = placeholderText;
			this.trigger.appendChild(span);
			element = span;
		}

		if (element && placeholderText) {
			const existingText = element.textContent?.trim() || '';
			if (!existingText) {
				element.textContent = placeholderText;
			}
		}

		if (element instanceof HTMLElement) {
			this._labelElement = element;
			return element;
		}
		return null;
	}

	getLabelElement() {
		if (this._labelElement instanceof HTMLElement) {
			if (typeof document === 'undefined') return this._labelElement;
			if (document.documentElement?.contains?.(this._labelElement)) {
				return this._labelElement;
			}
		}
		return this.ensureLabelElement();
	}

	getApplyActionLabel(target = 'calendar') {
		const config = this.applyActionConfig || {};
		const rawLabel =
			target === 'time'
				? config.timeLabel || config.label
				: config.calendarLabel || config.label;
		if (typeof rawLabel === 'string' && rawLabel.trim()) {
			return rawLabel.trim();
		}
		return 'Appliquer';
	}

	getClearActionLabel() {
		const config = this.applyActionConfig || {};
		const rawLabel = config.clearLabel;
		if (typeof rawLabel === 'string' && rawLabel.trim()) {
			return rawLabel.trim();
		}
		return 'Effacer';
	}

	isSelectionReadyForApply() {
		if (this.mode === 'single') {
			return this.selectedDate instanceof Date;
		}
		if (this.mode === 'range') {
			return this.startDate instanceof Date && this.endDate instanceof Date;
		}
		if (this.mode === 'multiple') {
			const count = Array.isArray(this.selectedDates)
				? this.selectedDates.filter((value) => value instanceof Date).length
				: 0;
			const minRequired = Math.max(0, Number(this.minMultipleDates) || 0);
			return count >= minRequired;
		}
		return true;
	}

	isApplyActionDisabled(target = 'calendar') {
		let disabled = false;
		if (target === 'calendar') {
			if (!this.isSelectionReadyForApply()) disabled = true;
			if (!disabled && this.mode === 'multiple') {
				const meetsMin = this.multipleSelectionMeetsMinimum !== false;
				const withinMax = this.multipleSelectionWithinMaximum !== false;
				if (!meetsMin || !withinMax) disabled = true;
			}
		}
		if (disabled) return true;
		if (!Array.isArray(this.plugins)) return false;
		for (const plugin of this.plugins) {
			if (plugin && typeof plugin.isApplyActionDisabled === 'function') {
				try {
					if (plugin.isApplyActionDisabled(this, target)) return true;
				} catch (error) {
					/* ignore plugin errors when evaluating disabled state */
				}
			}
		}
		return false;
	}

	hasCalendarSelection() {
		if (this.mode === 'single') {
			return this.selectedDate instanceof Date;
		}
		if (this.mode === 'range') {
			return this.startDate instanceof Date || this.endDate instanceof Date;
		}
		if (this.mode === 'multiple') {
			return Array.isArray(this.selectedDates) && this.selectedDates.length > 0;
		}
		return false;
	}

	syncSelectionStateOnClose() {
		try {
			this.updateButtonLabel?.();
		} catch (error) {
			/* ignore label update errors when closing */
		}
		const selectionValid = !this.isApplyActionDisabled('calendar');
		if (!selectionValid && this.hiddenInput) {
			this.hiddenInput.value = '';
		}
		return selectionValid;
	}

	updateApplyActionState(target = 'calendar') {
		const shouldUpdateApply =
			(target === 'calendar' || target === 'all') &&
			this._calendarApplyButton instanceof HTMLButtonElement;
		if (shouldUpdateApply) {
			const disabled = this.isApplyActionDisabled('calendar');
			this.setApplyButtonVisualState(this._calendarApplyButton, disabled);
		}
		const shouldUpdateClear =
			(target === 'calendar' || target === 'clear' || target === 'all') &&
			this._calendarClearButton instanceof HTMLButtonElement;
		if (shouldUpdateClear) {
			const disabled = !this.hasCalendarSelection();
			this.setClearButtonVisualState(this._calendarClearButton, disabled);
		}
	}

	setApplyButtonVisualState(button, disabled) {
		if (!(button instanceof HTMLButtonElement)) return;
		button.disabled = false;
		if (disabled) {
			button.classList.add('is-disabled');
			button.setAttribute('aria-disabled', 'true');
			return;
		}
		button.classList.remove('is-disabled');
		button.removeAttribute('aria-disabled');
	}

	setClearButtonVisualState(button, disabled) {
		if (!(button instanceof HTMLButtonElement)) return;
		button.disabled = false;
		if (disabled) {
			button.classList.add('is-disabled');
			button.setAttribute('aria-disabled', 'true');
			return;
		}
		button.classList.remove('is-disabled');
		button.removeAttribute('aria-disabled');
	}

	handleApplyAction(context = {}) {
		const source =
			typeof context.source === 'string' && context.source.trim()
				? context.source.trim()
				: 'calendar';
		const target = source === 'time' ? 'time' : 'calendar';
		const applyContext =
			typeof context === 'object' && context
				? { ...context, source }
				: { source };
		const triggerRejectionFeedback = () => {
			if (typeof this.notifyInvalidSelection === 'function') {
				this.notifyInvalidSelection('error');
			} else {
				this.triggerInvalidRangeFeedback?.();
			}
			if (Array.isArray(this.plugins)) {
				for (const plugin of this.plugins) {
					if (plugin && typeof plugin.onApplyActionRejected === 'function') {
						try {
							plugin.onApplyActionRejected(this, target, applyContext);
						} catch (error) {
							/* ignore plugin rejection errors */
						}
					}
				}
			}
			this.updateApplyActionState('calendar');
		};
		if (this.isApplyActionDisabled(target)) {
			triggerRejectionFeedback();
			return false;
		}
		try {
			this.updateHiddenInput?.();
		} catch (error) {
			/* ignore update errors during apply */
		}
		try {
			this.updateButtonLabel?.();
		} catch (error) {
			/* ignore label update errors during apply */
		}
		if (Array.isArray(this.plugins)) {
			for (const plugin of this.plugins) {
				if (plugin && typeof plugin.onBeforeApplyAction === 'function') {
					try {
						const result = plugin.onBeforeApplyAction(
							this,
							source,
							applyContext
						);
						if (result === false) {
							triggerRejectionFeedback();
							return false;
						}
					} catch (error) {
						/* ignore plugin validation errors */
					}
				}
			}
		}
		if (target === 'calendar' && !this.isSelectionReadyForApply()) {
			triggerRejectionFeedback();
			return false;
		}
		if (Array.isArray(this.plugins)) {
			for (const plugin of this.plugins) {
				if (typeof plugin?.onApplyAction === 'function') {
					try {
						plugin.onApplyAction(this, source, applyContext);
					} catch (error) {
						/* ignore plugin apply errors */
					}
				}
			}
		}
		const config = this.applyActionConfig || {};
		const shouldCloseConfig = config.close !== false;
		const shouldClose =
			context.close === undefined ? shouldCloseConfig : !!context.close;
		if (!this.inline && shouldClose) {
			this.hideCalendar();
		}
		this.updateApplyActionState('calendar');
		return true;
	}

	handleClearAction(context = {}) {
		if (!this.hasCalendarSelection()) {
			this.updateApplyActionState('calendar');
			return;
		}
		this.resetSelection();
		const config = this.applyActionConfig || {};
		const shouldCloseConfig = config.clearClose === true;
		const shouldClose =
			context.close === undefined ? shouldCloseConfig : !!context.close;
		if (!this.inline && shouldClose) {
			this.hideCalendar();
		}
	}

	renderCalendarApplyAction() {
		if (!this.container) return;
		const config = this.applyActionConfig || {};
		if (!config.calendar && !config.clear) return;
		const actions = document.createElement('div');
		actions.className = 'nova-calendar-actions';
		if (config.clear) {
			const clearBtn = document.createElement('button');
			clearBtn.type = 'button';
			clearBtn.className = 'nova-calendar-clear-btn';
			clearBtn.textContent = this.getClearActionLabel();
			clearBtn.addEventListener('click', () => {
				this.handleClearAction({ source: 'calendar' });
			});
			actions.appendChild(clearBtn);
			this._calendarClearButton = clearBtn;
			this.setClearButtonVisualState(clearBtn, !this.hasCalendarSelection());
		}
		if (config.calendar) {
			const applyBtn = document.createElement('button');
			applyBtn.type = 'button';
			applyBtn.className = 'nova-calendar-apply-btn';
			applyBtn.textContent = this.getApplyActionLabel('calendar');
			this.setApplyButtonVisualState(
				applyBtn,
				this.isApplyActionDisabled('calendar')
			);
			applyBtn.addEventListener('click', () => {
				this.handleApplyAction({ source: 'calendar' });
			});
			actions.appendChild(applyBtn);
			this._calendarApplyButton = applyBtn;
		}
		if (!actions.childElementCount) return;
		this.container.appendChild(actions);
		this._calendarActionsContainer = actions;
	}

	getTooltipConfig(type) {
		if (!this.tooltipConfigs) return null;
		switch (type) {
			case 'range':
				return this.tooltipConfigs.range;
			case 'multiple':
				return this.tooltipConfigs.multiple;
			case 'single':
				return this.tooltipConfigs.single;
			case 'time':
				return this.tooltipConfigs.time;
			default:
				return null;
		}
	}

	ensureTooltipElement(type) {
		const config = this.getTooltipConfig(type);
		if (!this.container || !config) return null;
		let tooltip = this._hoverTooltipEl;
		if (!tooltip || !tooltip.isConnected) {
			tooltip = document.createElement('div');
			tooltip.className = 'nova-hover-tooltip';
			this._hoverTooltipEl = tooltip;
		}
		if (tooltip.parentNode !== this.container) {
			this.container.appendChild(tooltip);
		}
		return tooltip;
	}

	buildRangeTooltipContext(date, targetEl) {
		if (!(date instanceof Date)) return null;
		const config = this.getTooltipConfig('range');
		if (!config) return null;
		const start = this.startDate || null;
		const end = this.endDate || null;
		const hover = this.hoverDate || null;
		const selectionComplete = !!(start && end);
		let rangeStart = null;
		let rangeEnd = null;
		if (selectionComplete) {
			const startTime = start.getTime();
			const endTime = end.getTime();
			rangeStart = startTime <= endTime ? start : end;
			rangeEnd = startTime <= endTime ? end : start;
		} else if (start) {
			const startTime = start.getTime();
			const targetTime = date.getTime();
			rangeStart = targetTime >= startTime ? start : date;
			rangeEnd = targetTime >= startTime ? date : start;
		} else if (end) {
			const endTime = end.getTime();
			const targetTime = date.getTime();
			rangeStart = targetTime <= endTime ? date : end;
			rangeEnd = targetTime <= endTime ? end : date;
		}
		let nights = null;
		let days = null;
		if (rangeStart && rangeEnd) {
			const diff = Math.abs(rangeEnd.getTime() - rangeStart.getTime());
			const count = Math.round(diff / MS_IN_DAY);
			nights = count;
			days = count + 1;
		}
		const context = {
			calendar: this,
			date,
			targetEl,
			startDate: start,
			endDate: end,
			hoverDate: hover,
			selectionComplete,
			rangeStart,
			rangeEnd,
			nights,
			days,
			countMode: config.countMode || 'nights',
		};
		context.countValue =
			context.countMode === 'days' ? context.days : context.nights;
		const buildDefaultDateLabel = () =>
			this.formatDateLocalized(date, {
				day: 'numeric',
				month: 'long',
				year: 'numeric',
			});
		try {
			context.dateLabel = config.formatDate
				? config.formatDate(date, context)
				: buildDefaultDateLabel();
		} catch (error) {
			console.error('NovaCalendar: tooltip.range.formatDate a échoué.', error);
			context.dateLabel = buildDefaultDateLabel();
		}
		return context;
	}

	defaultRangeTooltipContent(context) {
		const config = this.getTooltipConfig('range');
		if (!config) return '';
		const parts = [];
		if (
			config.showCount &&
			Number.isFinite(context?.countValue) &&
			context.countValue >= 0
		) {
			let countLabel = '';
			if (typeof config.countFormatter === 'function') {
				try {
					countLabel = config.countFormatter(context.countValue, context);
				} catch (error) {
					console.error(
						'NovaCalendar: tooltip.range.countFormatter a échoué.',
						error
					);
				}
			}
			if (!countLabel) {
				countLabel = this.defaultRangeTooltipCountText(
					context.countValue,
					context
				);
			}
			if (countLabel) {
				parts.push(
					`<div class="nova-hover-tooltip-primary">${countLabel}</div>`
				);
			}
		}
		if (config.showDate && context?.dateLabel) {
			parts.push(
				`<div class="nova-hover-tooltip-secondary">${context.dateLabel}</div>`
			);
		}
		return parts.join('');
	}

	defaultRangeTooltipCountText(count, context) {
		if (!Number.isFinite(count)) return '';
		const mode = context?.countMode === 'days' ? 'days' : 'nights';
		let plural;
		if (count > 1) plural = mode === 'days' ? 'jours' : 'nuits';
		else plural = mode === 'days' ? 'jour' : 'nuit';
		return `${count} ${plural}`;
	}

	buildMultipleTooltipContext(date, targetEl) {
		if (!(date instanceof Date)) return null;
		const config = this.getTooltipConfig('multiple');
		if (!config) return null;
		const selectedDates = Array.isArray(this.selectedDates)
			? this.selectedDates
			: [];
		const selectedCount = selectedDates.length;
		const minRequired = Math.max(0, Number(this.minMultipleDates) || 0);
		const maxAllowed = Math.max(0, Number(this.maxMultipleDates) || 0);
		const remaining = Math.max(0, minRequired - selectedCount);
		const isSelected = selectedDates.some(
			(selected) => selected?.getTime?.() === date.getTime()
		);
		const maxReached = maxAllowed > 0 && selectedCount >= maxAllowed;
		const context = {
			calendar: this,
			date,
			targetEl,
			selectedCount,
			remaining,
			minRequired,
			maxAllowed,
			maxReached,
			isSelected,
			selectedDates,
		};
		const buildMultipleDateLabel = () =>
			this.formatDateLocalized(date, {
				day: 'numeric',
				month: 'long',
				year: 'numeric',
			});
		try {
			context.dateLabel = config.formatDate
				? config.formatDate(date, context)
				: buildMultipleDateLabel();
		} catch (error) {
			console.error(
				'NovaCalendar: multipleTooltip.formatDate a échoué.',
				error
			);
			context.dateLabel = buildMultipleDateLabel();
		}
		return context;
	}

	buildSingleTooltipContext(date, targetEl) {
		if (!(date instanceof Date)) return null;
		const config = this.getTooltipConfig('single');
		if (!config) return null;
		const context = { calendar: this, date, targetEl };
		const buildSingleDateLabel = () =>
			this.formatDateLocalized(date, {
				day: 'numeric',
				month: 'long',
				year: 'numeric',
			});
		try {
			context.dateLabel = config.formatDate
				? config.formatDate(date, context)
				: buildSingleDateLabel();
		} catch (error) {
			console.error('NovaCalendar: singleTooltip.formatDate a échoué.', error);
			context.dateLabel = buildSingleDateLabel();
		}
		return context;
	}

	buildTimeTooltipContext(params = {}) {
		const config = this.getTooltipConfig('time');
		if (!config) return null;
		const date = params.date instanceof Date ? params.date : null;
		if (!date) return null;
		const blockLabel =
			typeof params.blockLabel === 'string' ? params.blockLabel : '';
		const displayBlockLabel =
			typeof params.displayBlockLabel === 'string'
				? params.displayBlockLabel
				: blockLabel;
		const context = {
			calendar: this,
			date,
			blockLabel,
			blockRawLabel: blockLabel,
			blockDisplayLabel: displayBlockLabel,
			targetEl: params.targetEl || null,
			isSelected: !!params.isSelected,
			blocksCount: Number.isFinite(params.blocksCount)
				? Number(params.blocksCount)
				: 0,
			minBlocks: Number.isFinite(params.minBlocks)
				? Number(params.minBlocks)
				: 0,
			maxBlocks: Number.isFinite(params.maxBlocks)
				? Number(params.maxBlocks)
				: 0,
		};
		context.rangeRole =
			typeof params.rangeRole === 'string' ? params.rangeRole : null;
		context.rangeLabel =
			typeof params.rangeLabel === 'string' ? params.rangeLabel : null;
		context.remainingMin = Math.max(0, context.minBlocks - context.blocksCount);
		context.maxReached =
			context.maxBlocks > 0 && context.blocksCount >= context.maxBlocks;
		const buildTimeDateLabel = () =>
			this.formatDateLocalized(date, {
				day: 'numeric',
				month: 'long',
				year: 'numeric',
			});
		try {
			context.dateLabel = config.formatDate
				? config.formatDate(date, context)
				: buildTimeDateLabel();
		} catch (error) {
			console.error('NovaCalendar: timeTooltip.formatDate a échoué.', error);
			context.dateLabel = buildTimeDateLabel();
		}
		try {
			context.blockLabelFormatted = config.formatBlock
				? config.formatBlock(blockLabel, context)
				: displayBlockLabel;
		} catch (error) {
			console.error('NovaCalendar: timeTooltip.formatBlock a échoué.', error);
			context.blockLabelFormatted = displayBlockLabel;
		}
		return context;
	}

	defaultMultipleTooltipContent(context) {
		const config = this.getTooltipConfig('multiple');
		if (!config) return '';
		const parts = [];
		const pluralize = (value, single, plural) => (value > 1 ? plural : single);
		if (
			config.showRemaining &&
			context?.minRequired > 0 &&
			context?.remaining > 0
		) {
			let remainingLabel = '';
			if (typeof config.remainingFormatter === 'function') {
				try {
					remainingLabel = config.remainingFormatter(
						context.remaining,
						context
					);
				} catch (error) {
					console.error(
						'NovaCalendar: multipleTooltip.remainingFormatter a échoué.',
						error
					);
				}
			}
			if (!remainingLabel) {
				remainingLabel = `Encore ${context.remaining} ${pluralize(
					context.remaining,
					'date',
					'dates'
				)} à sélectionner`;
			}
			parts.push(
				`<div class="nova-hover-tooltip-primary">${remainingLabel}</div>`
			);
		} else if (
			config.showCount &&
			Number.isFinite(context?.selectedCount) &&
			context.selectedCount > 0
		) {
			let countLabel = '';
			if (typeof config.countFormatter === 'function') {
				try {
					countLabel = config.countFormatter(context.selectedCount, context);
				} catch (error) {
					console.error(
						'NovaCalendar: multipleTooltip.countFormatter a échoué.',
						error
					);
				}
			}
			if (!countLabel) {
				const baseText = `${context.selectedCount} ${pluralize(
					context.selectedCount,
					'date',
					'dates'
				)} sélectionnée${context.selectedCount > 1 ? 's' : ''}`;
				countLabel =
					context.maxAllowed > 0
						? `${context.selectedCount}/${context.maxAllowed} ${pluralize(
								context.selectedCount,
								'date',
								'dates'
						  )} sélectionnée${context.selectedCount > 1 ? 's' : ''}`
						: baseText;
			}
			parts.push(`<div class="nova-hover-tooltip-primary">${countLabel}</div>`);
			if (context.maxReached && context.maxAllowed > 0) {
				parts.push(
					`<div class="nova-hover-tooltip-secondary">Maximum de ${context.maxAllowed} dates atteint</div>`
				);
			}
		}
		if (config.showDate && context?.dateLabel) {
			parts.push(
				`<div class="nova-hover-tooltip-secondary">${context.dateLabel}</div>`
			);
		}
		return parts.join('');
	}

	defaultSingleTooltipContent(context) {
		const config = this.getTooltipConfig('single');
		if (!config) return '';
		if (!config.showDate || !context?.dateLabel) return '';
		return `<div class="nova-hover-tooltip-primary">${context.dateLabel}</div>`;
	}

	defaultTimeTooltipContent(context) {
		const config = this.getTooltipConfig('time');
		if (!config) return '';
		const parts = [];
		if (config.showBlock && context?.blockLabelFormatted) {
			parts.push(
				`<div class="nova-hover-tooltip-primary">${context.blockLabelFormatted}</div>`
			);
		}
		if (context?.rangeLabel) {
			parts.push(
				`<div class="nova-hover-tooltip-secondary">${context.rangeLabel}</div>`
			);
		}
		if (config.showDate && context?.dateLabel) {
			parts.push(
				`<div class="nova-hover-tooltip-secondary">${context.dateLabel}</div>`
			);
		}
		if (context?.remainingMin > 0) {
			parts.push(
				`<div class="nova-hover-tooltip-secondary">Encore ${
					context.remainingMin
				} créneau${context.remainingMin > 1 ? 'x' : ''} requis</div>`
			);
		}
		return parts.join('');
	}

	updateTooltip(type, targetEl, context) {
		const config = this.getTooltipConfig(type);
		if (!config || !config.enabled) {
			this.hideHoverTooltip(true);
			return;
		}
		const tooltip = this.ensureTooltipElement(type);
		if (!tooltip || !context) {
			this.hideHoverTooltip(true);
			return;
		}
		let customContent = '';
		if (typeof config.render === 'function') {
			try {
				customContent = config.render(context);
			} catch (error) {
				console.error('NovaCalendar: tooltip.render a échoué.', error);
				customContent = '';
			}
		}
		let applied = false;
		if (
			customContent &&
			typeof customContent === 'object' &&
			customContent.nodeType
		) {
			tooltip.innerHTML = '';
			tooltip.appendChild(customContent);
			applied = true;
		} else if (
			typeof customContent === 'string' &&
			customContent.trim().length > 0
		) {
			tooltip.innerHTML = customContent;
			applied = true;
		}
		if (!applied) {
			let fallback = '';
			switch (type) {
				case 'range':
					fallback = this.defaultRangeTooltipContent(context);
					break;
				case 'multiple':
					fallback = this.defaultMultipleTooltipContent(context);
					break;
				case 'single':
					fallback = this.defaultSingleTooltipContent(context);
					break;
				case 'time':
					fallback = this.defaultTimeTooltipContent(context);
					break;
				default:
					fallback = '';
			}
			if (!fallback) {
				this.hideHoverTooltip(true);
				return;
			}
			tooltip.innerHTML = fallback;
		}
		const extraClass = config.extraClass ? ` ${config.extraClass}` : '';
		const baseClass = `nova-hover-tooltip nova-tooltip-${type}`;
		tooltip.className = `${baseClass}${extraClass}`;
		const containerRect = this.container?.getBoundingClientRect?.();
		const targetRect = targetEl?.getBoundingClientRect?.();
		if (!containerRect || !targetRect) {
			this.hideHoverTooltip(true);
			return;
		}
		const tooltipRect = tooltip.getBoundingClientRect?.();
		const tooltipWidth = tooltipRect?.width || tooltip.offsetWidth || 0;
		const tooltipHeight = tooltipRect?.height || tooltip.offsetHeight || 0;
		const containerWidth =
			containerRect.width || this.container.offsetWidth || 0;
		const containerHeight =
			containerRect.height || this.container.offsetHeight || 0;
		const offsetX = Number(config.offsetX) || 0;
		const offsetY = Number(config.offsetY) || 0;
		let left =
			targetRect.left - containerRect.left + targetRect.width / 2 + offsetX;
		let top = targetRect.top - containerRect.top + offsetY;
		let position = 'above';
		const spaceAbove = targetRect.top - containerRect.top;
		if (tooltipHeight && spaceAbove < tooltipHeight + 16) {
			position = 'below';
			top = targetRect.top - containerRect.top + targetRect.height + offsetY;
		}
		if (containerWidth && tooltipWidth) {
			const halfWidth = tooltipWidth / 2;
			const minLeft = halfWidth + 8;
			const maxLeft = containerWidth - halfWidth - 8;
			if (maxLeft >= minLeft) {
				left = Math.min(Math.max(left, minLeft), maxLeft);
			} else {
				left = containerWidth / 2;
			}
		}
		if (position === 'above' && tooltipHeight) {
			const minTop = tooltipHeight + 8;
			if (top < minTop) top = minTop;
		} else if (position === 'below' && tooltipHeight && containerHeight) {
			const maxTop = containerHeight - tooltipHeight - 8;
			if (top > maxTop) top = Math.max(maxTop, tooltipHeight + 8);
		}
		tooltip.dataset.position = position;
		tooltip.style.left = `${left}px`;
		tooltip.style.top = `${top}px`;
		tooltip.classList.add('visible');
	}

	showDayTooltip(date, targetEl) {
		if (!(date instanceof Date)) {
			this.hideHoverTooltip(true);
			return;
		}
		switch (this.mode) {
			case 'range': {
				const context = this.buildRangeTooltipContext(date, targetEl);
				this.updateTooltip('range', targetEl, context);
				break;
			}
			case 'multiple': {
				const context = this.buildMultipleTooltipContext(date, targetEl);
				this.updateTooltip('multiple', targetEl, context);
				break;
			}
			case 'single': {
				const context = this.buildSingleTooltipContext(date, targetEl);
				this.updateTooltip('single', targetEl, context);
				break;
			}
			default:
				this.hideHoverTooltip(true);
		}
	}

	showTimeBlockTooltip(params) {
		const context = this.buildTimeTooltipContext(params);
		const targetEl = params?.targetEl || null;
		this.updateTooltip('time', targetEl, context);
	}

	hideHoverTooltip(force = false) {
		if (this._hoverHideTimeout) {
			clearTimeout(this._hoverHideTimeout);
			this._hoverHideTimeout = null;
		}
		this._touchTooltipStickyTarget = null;
		const tooltip = this._hoverTooltipEl;
		if (!tooltip) return;
		tooltip.classList.remove('visible');
		if (force) {
			tooltip.innerHTML = '';
		}
	}

	requestHideHoverTooltip(delay = 0, force = false) {
		if (this._hoverHideTimeout) {
			clearTimeout(this._hoverHideTimeout);
			this._hoverHideTimeout = null;
		}
		const duration = Number(delay);
		if (!Number.isFinite(duration) || duration <= 0) {
			this.hideHoverTooltip(force);
			return;
		}
		this._hoverHideTimeout = setTimeout(() => {
			this._hoverHideTimeout = null;
			this.hideHoverTooltip(force);
		}, duration);
	}

	showTouchTooltipFeedback(date, fallbackTarget) {
		if (!(date instanceof Date)) {
			this._touchTooltipStickyTarget = null;
			this.requestHideHoverTooltip(0, true);
			return;
		}
		let target =
			fallbackTarget instanceof HTMLElement && fallbackTarget.isConnected
				? fallbackTarget
				: this.getDayElementByDate(date);
		if (!(target instanceof HTMLElement)) {
			this._touchTooltipStickyTarget = null;
			this.requestHideHoverTooltip(1200, true);
			return;
		}
		this._touchTooltipStickyTarget = target;
		this.showDayTooltip(date, target);
	}

	init() {
		if (this._initialized || typeof document === 'undefined') return;
		this._initialized = true;

		this.resolveTrigger();
		this.build();

		this.plugins.forEach((plugin) => {
			plugin.onShadowReady?.(this);
		});

		this.renderCalendar();
		this.updateDayClasses();
		this.updateButtonLabel();
		this.updateHiddenInput();

		if (!this.inline) {
			this._outsideClickHandler = (event) => {
				const path = event.composedPath?.() || event.path || [];
				if (this.shouldIgnoreOutsideClose(event, path)) {
					return;
				}
				if (!path.includes(this.wrapper) && !path.includes(this.trigger)) {
					this.hideCalendar();
				}
			};
			window.addEventListener('click', this._outsideClickHandler, true);
		}
	}

	resolveTrigger() {
		const triggerOption = this.options.trigger;
		let element = null;
		if (triggerOption instanceof HTMLElement) {
			element = triggerOption;
		} else if (typeof triggerOption === 'string') {
			element = document.querySelector(triggerOption);
		}
		this.trigger = element;
	}

	resolveAppendTarget() {
		const parentOption = this.options.appendTo;
		if (parentOption instanceof HTMLElement) return parentOption;
		if (typeof parentOption === 'string') {
			const element = document.querySelector(parentOption);
			if (element) return element;
		}
		return document.body;
	}

	resolveHiddenInputMountPoint() {
		if (typeof document === 'undefined') return null;
		if (
			this.hiddenInput instanceof HTMLElement &&
			this.hiddenInput.parentNode
		) {
			return this.hiddenInput.parentNode;
		}
		if (this._hiddenInputSelector) {
			const existing = document.querySelector(this._hiddenInputSelector);
			if (existing?.parentNode instanceof HTMLElement) {
				return existing.parentNode;
			}
		}
		if (this.trigger?.parentNode instanceof HTMLElement) {
			return this.trigger.parentNode;
		}
		if (this.wrapper?.parentNode instanceof HTMLElement) {
			return this.wrapper.parentNode;
		}
		return document.body || null;
	}

	setupHiddenInput() {
		if (typeof document === 'undefined') return;
		let input = null;
		if (this.hiddenInput instanceof HTMLElement) {
			input = this.hiddenInput;
		} else if (this._hiddenInputSelector) {
			const resolved = document.querySelector(this._hiddenInputSelector);
			if (resolved instanceof HTMLInputElement) {
				input = resolved;
				this.hiddenInput = resolved;
				this._hiddenInputSelector = '';
			} else if (resolved) {
				console.warn(
					'NovaCalendar: `hiddenInput` doit correspondre à un <input type="hidden">.'
				);
			}
		}
		if (!input) {
			const option = this.options.hiddenInput;
			if (option instanceof HTMLElement) {
				if (option instanceof HTMLInputElement) {
					input = option;
					this.hiddenInput = input;
				} else {
					console.warn(
						'NovaCalendar: `hiddenInput` doit être un élément <input>.'
					);
				}
			} else if (typeof option === 'string' && option.trim()) {
				const resolved = document.querySelector(option.trim());
				if (resolved instanceof HTMLInputElement) {
					input = resolved;
					this.hiddenInput = resolved;
					this._hiddenInputSelector = '';
				} else if (resolved) {
					console.warn(
						'NovaCalendar: `hiddenInput` doit correspondre à un <input type="hidden">.'
					);
				}
			}
		}
		if (!input) {
			input = document.createElement('input');
			input.type = 'hidden';
			input.classList.add('nova-calendar-hidden-input');
			this.hiddenInput = input;
			this._ownsHiddenInput = true;
		}
		if (!(input instanceof HTMLInputElement)) {
			console.warn(
				'NovaCalendar: `hiddenInput` doit être un élément <input type="hidden">.'
			);
			return;
		}
		if (input.type !== 'hidden') {
			input.type = 'hidden';
		}
		const desiredName =
			typeof this.options.name === 'string' && this.options.name.trim()
				? this.options.name.trim()
				: '';
		if (desiredName) {
			input.name = desiredName;
		} else if (!input.name && this._ownsHiddenInput) {
			input.name = 'nova-calendar-value';
		}
		if (this._ownsHiddenInput && !input.dataset.novaCalendar) {
			input.dataset.novaCalendar = 'value';
		}
		this.hiddenInput = input;
		const mountTarget = this.resolveHiddenInputMountPoint();
		if (!mountTarget) return;
		if (!input.isConnected) {
			let reference = null;
			if (this.trigger?.parentNode === mountTarget) {
				reference = this.trigger.nextSibling;
			} else if (this.wrapper?.parentNode === mountTarget) {
				reference = this.wrapper.nextSibling;
			}
			if (reference) mountTarget.insertBefore(input, reference);
			else mountTarget.appendChild(input);
		}
	}

	shouldUseMobileLayout() {
		if (this.inline) return false;
		if (typeof window === 'undefined') return false;
		const viewportWidth =
			window.innerWidth ||
			(document.documentElement && document.documentElement.clientWidth) ||
			0;
		if (!viewportWidth) return false;
		if (!Number.isFinite(this.mobileBreakpoint) || this.mobileBreakpoint <= 0)
			return false;
		return viewportWidth <= this.mobileBreakpoint;
	}

	updateHostStateClasses(applyMobileOverride) {
		if (!this.wrapper) return false;
		const host = this.wrapper;
		host.classList.toggle('nova-calendar-inline', !!this.inline);
		host.classList.toggle('nova-calendar-dropdown', !this.inline);
		host.classList.toggle('nova-calendar-open', !!this.isOpen);
		const hasTimePlugin =
			Array.isArray(this.plugins) &&
			this.plugins.some((plugin) => plugin?.name === 'timePlugin');
		host.classList.toggle('nova-calendar-has-time', hasTimePlugin);
		const shouldApplyMobile =
			applyMobileOverride !== undefined
				? !!applyMobileOverride
				: !this.inline && this.isOpen && this.shouldUseMobileLayout();
		host.classList.toggle('nova-calendar-mobile', shouldApplyMobile);
		this.updateMobileLayoutStyles(shouldApplyMobile);
		return shouldApplyMobile;
	}

	updateMobileLayoutStyles(shouldApply) {
		if (!this.wrapper) return;
		if (shouldApply) {
			if (this._mobileLayoutApplied) return;
			this.wrapper.style.left = '';
			this.wrapper.style.right = '';
			this.wrapper.style.top = '';
			this.wrapper.style.bottom = '';
			this.wrapper.style.position = '';
			this.wrapper.style.width = '';
			this.wrapper.style.height = '';
			this.wrapper.style.transform = '';
			this.wrapper.style.zIndex = '';
			this._mobileLayoutApplied = true;
			return;
		}
		if (!this._mobileLayoutApplied) return;
		this.wrapper.style.left = '';
		this.wrapper.style.right = '';
		this.wrapper.style.top = '';
		this.wrapper.style.bottom = '';
		this.wrapper.style.position = '';
		this.wrapper.style.width = '';
		this.wrapper.style.height = '';
		this.wrapper.style.transform = '';
		this.wrapper.style.zIndex = '';
		this._mobileLayoutApplied = false;
	}

	applyMobileLayoutStyles() {
		this.updateMobileLayoutStyles(true);
	}

	clearMobileLayoutStyles() {
		this.updateMobileLayoutStyles(false);
	}

	build() {
		this.appendTarget = null;
		let hostTarget = null;
		if (this.inline) {
			if (typeof this.inlineHostOption === 'string') {
				hostTarget = document.querySelector(this.inlineHostOption);
			} else if (this.inlineHostOption instanceof HTMLElement) {
				hostTarget = this.inlineHostOption;
			} else if (this.trigger instanceof HTMLElement) {
				hostTarget = this.trigger;
			}
			if (!hostTarget) {
				throw new Error('Inline NovaCalendar requires a host element.');
			}
		} else {
			hostTarget = document.createElement('div');
			const appendTarget = this.resolveAppendTarget();
			this.appendTarget = appendTarget;
			appendTarget.appendChild(hostTarget);
		}

		let effectiveHost = hostTarget;
		const resolveShadowRoot = (host) => {
			if (!host) return null;
			if (host.shadowRoot) return host.shadowRoot;
			if (typeof host.attachShadow !== 'function') return null;
			try {
				return host.attachShadow({ mode: 'open' });
			} catch (error) {
				return null;
			}
		};
		const createInlineFallbackHost = () => {
			if (!this.inline) return null;
			const parent =
				effectiveHost?.parentNode instanceof HTMLElement
					? effectiveHost.parentNode
					: null;
			if (!parent) return null;
			const fallback = document.createElement('div');
			fallback.className = 'nova-calendar-inline-host';
			parent.insertBefore(fallback, effectiveHost.nextSibling);
			return fallback;
		};

		let shadowRoot = resolveShadowRoot(effectiveHost);
		if (!shadowRoot && this.inline) {
			const fallbackHost = createInlineFallbackHost();
			if (fallbackHost) {
				effectiveHost = fallbackHost;
				shadowRoot = resolveShadowRoot(effectiveHost);
			}
		}
		if (!shadowRoot) {
			throw new Error(
				'NovaCalendar: impossible de créer un hôte Shadow DOM pour le calendrier.'
			);
		}

		this.wrapper = effectiveHost;
		if (this.wrapper) {
			if (this.wrapper.id) {
				this._ids.wrapper = this.wrapper.id;
			} else if (this._ids?.wrapper) {
				this.wrapper.id = this._ids.wrapper;
			}
		}
		this.wrapper.classList.add('nova-calendar-host');
		this.updateHostStateClasses();
		this.applyThemeMode();

		this.shadowRoot = shadowRoot;

		if (!this.shadowRoot.getElementById('nova-calendar-styles')) {
			const style = document.createElement('style');
			style.id = 'nova-calendar-styles';
			style.textContent = calendarStyles;
			this.shadowRoot.appendChild(style);
		}

		let container = this.shadowRoot.querySelector('.nova-calendar');
		if (!container) {
			container = document.createElement('div');
			container.className = 'nova-calendar';
			this.shadowRoot.appendChild(container);
		}
		this.container = container;
		if (this._ids?.container) {
			this.container.id = this._ids.container;
		}
		const containerRole = this.inline ? 'group' : 'dialog';
		this.container.setAttribute('role', containerRole);
		if (!this.inline) {
			this.container.setAttribute('aria-modal', this.isOpen ? 'true' : 'false');
		} else {
			this.container.removeAttribute('aria-modal');
		}
		this.container.setAttribute(
			'aria-roledescription',
			this.a11y.calendarRoleDescription
		);
		this.container.setAttribute('aria-label', this.getCalendarLabel());
		if (this._ids?.monthLabel) {
			this.container.setAttribute('aria-labelledby', this._ids.monthLabel);
		}
		this.container.innerHTML = '';
		if (!this._shadowKeydownHandler) {
			this._shadowKeydownHandler = (event) => this.handleShadowKeydown(event);
			this.shadowRoot.addEventListener('keydown', this._shadowKeydownHandler);
		}

		if (!this.inline && !this._mobileBackdropClickHandler) {
			this._mobileBackdropClickHandler = (event) => {
				if (!this.wrapper?.classList.contains('nova-calendar-mobile')) return;
				const path =
					typeof event.composedPath === 'function'
						? event.composedPath()
						: event.path || [];
				if (this.shadowRoot) {
					if (path.length && path.includes(this.shadowRoot)) return;
					if (
						!path.length &&
						event.target &&
						this.shadowRoot.contains(event.target)
					)
						return;
				}
				this.hideCalendar();
			};
			this.wrapper.addEventListener('click', this._mobileBackdropClickHandler, {
				capture: true,
			});
		}

		if (!this._statusContainer) {
			this._statusContainer = document.createElement('div');
			this._statusContainer.className = 'nova-calendar-status';
			this._statusContainer.setAttribute('role', 'status');
			this._statusContainer.setAttribute('aria-live', 'polite');

			const messageSpan = document.createElement('span');
			messageSpan.className = 'message';
			this._statusContainer.appendChild(messageSpan);
			this._statusMessageText = messageSpan;
		}

		const statusInsertBefore = this.container
			? this.container.nextSibling
			: null;
		this.shadowRoot.insertBefore(this._statusContainer, statusInsertBefore);
		this._statusContainer.hidden = true;

		if (!this.inline) {
			this.buildTrigger();
			this.container.style.display = 'none';
		} else {
			this.container.style.display = 'block';
			if (!this.trigger) {
				this.trigger = this.wrapper;
			}
		}

		this.setupHiddenInput();
	}

	applyThemeMode() {
		const host = this.wrapper;
		if (!host) return;
		switch (this._themeMode) {
			case 'dark':
				host.setAttribute('data-theme', 'dark');
				break;
			case 'light':
				host.setAttribute('data-theme', 'light');
				break;
			default:
				host.removeAttribute('data-theme');
		}
	}

	buildTrigger() {
		const placeholder = this.options.placeholder || '';
		if (!this.trigger) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'nova-calendar-trigger';
			this.trigger = button;
			this.resolveAppendTarget().appendChild(button);
		}
		if (!this.inline) {
			this.trigger.setAttribute('aria-haspopup', 'dialog');
			this.trigger.setAttribute(
				'aria-expanded',
				this.isOpen ? 'true' : 'false'
			);
			if (this._ids?.wrapper) {
				this.trigger.setAttribute('aria-controls', this._ids.wrapper);
			}
		} else {
			this.trigger.removeAttribute('aria-haspopup');
			this.trigger.removeAttribute('aria-expanded');
			this.trigger.removeAttribute('aria-controls');
		}
		const labelEl = this.ensureLabelElement(placeholder);
		let initialValue = '';
		if (labelEl) {
			initialValue = labelEl.textContent?.trim() || placeholder;
			if (!labelEl.textContent?.trim()) {
				labelEl.textContent = initialValue;
			}
		} else {
			initialValue =
				this.trigger?.textContent?.trim() ||
				placeholder ||
				this._initialLabelValue;
		}
		this._initialLabelValue = initialValue || placeholder;

		if (this._triggerClickHandler) {
			this.trigger.removeEventListener('click', this._triggerClickHandler);
		}

		this._triggerClickHandler = (event) => {
			event.stopPropagation();
			this.toggleCalendar();
		};
		this.trigger.addEventListener('click', this._triggerClickHandler);
	}

	toggleCalendar() {
		if (this.inline) return;
		if (this.isOpen) this.hideCalendar();
		else this.showCalendar();
	}

	toggleTheme(mode) {
		let target = mode;
		if (target === undefined) {
			target = this._themeMode === 'dark' ? 'light' : 'dark';
		}
		const normalized = this.normalizeThemePreference(target);
		if (normalized === null) {
			console.warn(
				'NovaCalendar: toggleTheme accepte "dark", "light" ou "auto"/"system".'
			);
			return this._themeMode;
		}
		this._themeMode = normalized;
		this.applyThemeMode();
		return this._themeMode;
	}

	positionCalendar() {
		if (
			this.inline ||
			!this.wrapper ||
			!this.container ||
			!this.trigger ||
			typeof window === 'undefined' ||
			typeof document === 'undefined'
		)
			return;

		const applyMobileLayout =
			!this.inline && this.isOpen && this.shouldUseMobileLayout();
		const mobileActive = this.updateHostStateClasses(applyMobileLayout);
		if (mobileActive) {
			return;
		}

		const triggerRect = this.trigger.getBoundingClientRect?.();
		const containerRect = this.container.getBoundingClientRect?.();
		if (!triggerRect || !containerRect) return;

		let pageLeft = triggerRect.left;
		switch (this.dropdownAlign) {
			case 'center':
				pageLeft =
					triggerRect.left + triggerRect.width / 2 - containerRect.width / 2;
				break;
			case 'right':
				pageLeft = triggerRect.right - containerRect.width;
				break;
			default:
				pageLeft = triggerRect.left;
		}

		const viewportWidth =
			window.innerWidth || document.documentElement.clientWidth || 0;
		const maxPageLeft = viewportWidth - containerRect.width;
		if (Number.isFinite(maxPageLeft)) {
			const clampedMax = Math.max(0, maxPageLeft);
			if (pageLeft < 0 || pageLeft > clampedMax) {
				pageLeft = Math.min(Math.max(pageLeft, 0), clampedMax);
			}
		}

		const pageTop = triggerRect.bottom;
		const parent = this.appendTarget || this.wrapper.parentElement;
		const isBodyParent =
			!parent ||
			parent === document.body ||
			parent === document.documentElement;

		if (isBodyParent) {
			this.wrapper.style.position = 'fixed';
			this.wrapper.style.left = `${pageLeft}px`;
			this.wrapper.style.top = `${pageTop}px`;
			this.wrapper.style.zIndex = this.wrapper.style.zIndex || '9999';
			return;
		}

		const parentRect = parent.getBoundingClientRect?.();
		if (!parentRect) return;

		let relativeLeft = pageLeft - parentRect.left;
		const maxRelativeLeft = parentRect.width - containerRect.width;
		if (Number.isFinite(maxRelativeLeft)) {
			const clampedMax = Math.max(0, maxRelativeLeft);
			relativeLeft = Math.min(Math.max(relativeLeft, 0), clampedMax);
		}

		const relativeTop = pageTop - parentRect.top;
		const parentPosition = window.getComputedStyle(parent).position;
		if (parentPosition === 'static') {
			parent.style.position = 'relative';
		}

		this.wrapper.style.position = 'absolute';
		this.wrapper.style.left = `${relativeLeft}px`;
		this.wrapper.style.top = `${relativeTop}px`;
		this.wrapper.style.zIndex = this.wrapper.style.zIndex || '9999';
	}

	showCalendar() {
		if (!this.container || this.inline) return;
		NovaCalendar.instances.forEach((instance) => {
			if (instance !== this) instance.hideCalendar();
		});
		this.container.style.display = 'block';
		this.isOpen = true;
		if (this.trigger && !this.inline) {
			this.trigger.setAttribute('aria-expanded', 'true');
		}
		if (!this.inline) {
			this.container.setAttribute('aria-modal', 'true');
		}
		this.updateHostStateClasses();
		if (!this._boundRepositionHandler) {
			this._boundRepositionHandler = () => this.positionCalendar();
		}
		window.addEventListener('resize', this._boundRepositionHandler, true);
		window.addEventListener('scroll', this._boundRepositionHandler, true);
		this.setFocusIntent(this.getDefaultFocusDate(), true);
		this.renderCalendar();
		this.positionCalendar();
		this.renderStatusMessage();
	}

	hideCalendar() {
		if (!this.container || this.inline) return;
		this.syncSelectionStateOnClose();
		this.hideHoverTooltip(true);
		this.container.style.display = 'none';
		this.isOpen = false;
		if (this.trigger && !this.inline) {
			this.trigger.setAttribute('aria-expanded', 'false');
		}
		if (!this.inline) {
			this.container.setAttribute('aria-modal', 'false');
		}
		this.updateHostStateClasses(false);
		if (this._boundRepositionHandler) {
			window.removeEventListener('resize', this._boundRepositionHandler, true);
			window.removeEventListener('scroll', this._boundRepositionHandler, true);
		}
		this.renderStatusMessage();
		if (this.trigger && typeof this.trigger.focus === 'function') {
			this.trigger.focus();
		}
	}

	destroy() {
		if (this._outsideClickHandler) {
			window.removeEventListener('click', this._outsideClickHandler, true);
			this._outsideClickHandler = null;
		}
		if (this._triggerClickHandler && this.trigger) {
			this.trigger.removeEventListener('click', this._triggerClickHandler);
		}
		if (typeof window !== 'undefined' && this._boundRepositionHandler) {
			window.removeEventListener('resize', this._boundRepositionHandler, true);
			window.removeEventListener('scroll', this._boundRepositionHandler, true);
		}
		this._boundRepositionHandler = null;
		if (this._shadowKeydownHandler && this.shadowRoot) {
			this.shadowRoot.removeEventListener(
				'keydown',
				this._shadowKeydownHandler
			);
			this._shadowKeydownHandler = null;
		}
		if (this._errorFeedbackTimeout) {
			clearTimeout(this._errorFeedbackTimeout);
			this._errorFeedbackTimeout = null;
		}
		if (this._statusAutoHideTimeout) {
			clearTimeout(this._statusAutoHideTimeout);
			this._statusAutoHideTimeout = null;
			this._statusAutoHideTicket = null;
		}
		if (this._hoverTooltipEl?.parentNode) {
			this._hoverTooltipEl.parentNode.removeChild(this._hoverTooltipEl);
		}
		this._hoverTooltipEl = null;
		if (this._hoverHideTimeout) {
			clearTimeout(this._hoverHideTimeout);
			this._hoverHideTimeout = null;
		}
		this._lastPointerType = null;
		if (this._mobileBackdropClickHandler && this.wrapper) {
			this.wrapper.removeEventListener(
				'click',
				this._mobileBackdropClickHandler,
				{ capture: true }
			);
			this._mobileBackdropClickHandler = null;
		}
		this.clearMobileLayoutStyles();
		this.plugins.forEach((plugin) => plugin.onDestroy?.(this));
		this.plugins = [];
		if (this.container) this.container.innerHTML = '';
		if (!this.inline && this.wrapper?.parentNode) {
			this.wrapper.parentNode.removeChild(this.wrapper);
		}
		const index = NovaCalendar.instances.indexOf(this);
		if (index !== -1) NovaCalendar.instances.splice(index, 1);
		this._calendarApplyButton = null;
		this._calendarClearButton = null;
		this._calendarActionsContainer = null;
		this._labelElement = null;
	}

	renderCalendar() {
		if (!this.container) return;
		this.updateHostStateClasses();
		this.hideHoverTooltip(true);
		this.container.innerHTML = '';
		this._calendarApplyButton = null;
		this._calendarActionsContainer = null;
		this._calendarClearButton = null;
		this.dayElements = [];
		this._instructionsElement = null;

		let handledByPlugin = false;
		this.plugins.forEach((plugin) => {
			if (typeof plugin.onRender === 'function') {
				const beforeHTML = this.container.innerHTML;
				plugin.onRender(this);
				if (this.container.innerHTML !== beforeHTML) {
					handledByPlugin = true;
				}
			}
		});

		if (!handledByPlugin) {
			const header = document.createElement('div');
			header.className = 'header';
			header.setAttribute('role', 'heading');
			header.setAttribute('aria-level', `${this.a11y.monthHeadingLevel}`);
			const headingLabel = document.createElement('span');
			headingLabel.className = 'month-label';
			if (this._ids?.monthLabel) {
				headingLabel.id = this._ids.monthLabel;
			}
			headingLabel.textContent = this.getMonthHeadingLabel(this.date);
			header.appendChild(headingLabel);

			const controls = document.createElement('span');
			controls.className = 'month-controls';
			const prevBtn = document.createElement('button');
			prevBtn.type = 'button';
			prevBtn.className = 'prev-month';
			const prevLabel = this.getPreviousMonthLabel();
			prevBtn.setAttribute('aria-label', prevLabel);
			prevBtn.title = prevLabel;
			prevBtn.textContent = '‹';
			prevBtn.addEventListener('click', (event) => {
				event.stopPropagation();
				this.date = new Date(
					this.date.getFullYear(),
					this.date.getMonth() - 1,
					1
				);
				this.setFocusIntent(
					new Date(this.date.getFullYear(), this.date.getMonth(), 1),
					true
				);
				this.renderCalendar();
				this.updateDayClasses();
			});
			controls.appendChild(prevBtn);

			const nextBtn = document.createElement('button');
			nextBtn.type = 'button';
			nextBtn.className = 'next-month';
			const nextLabel = this.getNextMonthLabel();
			nextBtn.setAttribute('aria-label', nextLabel);
			nextBtn.title = nextLabel;
			nextBtn.textContent = '›';
			nextBtn.addEventListener('click', (event) => {
				event.stopPropagation();
				this.date = new Date(
					this.date.getFullYear(),
					this.date.getMonth() + 1,
					1
				);
				this.setFocusIntent(
					new Date(this.date.getFullYear(), this.date.getMonth(), 1),
					true
				);
				this.renderCalendar();
				this.updateDayClasses();
			});
			controls.appendChild(nextBtn);
			header.appendChild(controls);
			this.container.appendChild(header);

			const instructions = this.buildInstructionsElement();
			if (instructions) {
				this.container.appendChild(instructions);
				this._instructionsElement = instructions;
			}

			const weekdayMeta = this.getWeekdayMetadata();
			const weekdays = this.buildWeekdays(weekdayMeta);
			this.container.appendChild(weekdays);
			const days = this.generateDays(this.date, 0);
			this.container.appendChild(days);
			days.querySelectorAll('.day').forEach((dayEl) => {
				const dayDate = dayEl._date;
				if (!dayDate) return;
				this.dayElements.push({ el: dayEl, date: dayDate, monthIndex: 0 });
			});
		}

		this.renderCalendarApplyAction();
		this.updateApplyActionState('calendar');

		this.updateDayClasses();
		this.updateCoreBlockCounter();
		this.renderBlockCounter();
		this.renderStatusMessage();
		if (!this.inline && this.isOpen) this.positionCalendar();
	}

	buildWeekdays(metadata = []) {
		const container = document.createElement('div');
		container.className = 'weekdays';
		container.setAttribute('role', 'row');
		const weekdays = metadata.length ? metadata : this.getWeekdayMetadata();
		weekdays.forEach((item, index) => {
			const span = document.createElement('span');
			span.setAttribute('role', 'columnheader');
			span.setAttribute(
				'aria-label',
				this.getAccessibleWeekdayLabel(item, index)
			);
			span.textContent = item.shortLabel;
			container.appendChild(span);
		});
		return container;
	}

	generateDays(date, monthIndex = 0) {
		const daysContainer = document.createElement('div');
		daysContainer.className = 'days';
		if (this._ids?.grid) {
			daysContainer.id = this._ids.grid;
		}
		daysContainer.setAttribute('role', 'grid');
		daysContainer.setAttribute(
			'aria-multiselectable',
			this.mode === 'single' ? 'false' : 'true'
		);
		if (this._ids?.monthLabel) {
			daysContainer.setAttribute('aria-labelledby', this._ids.monthLabel);
		}
		if (this._instructionsElement?.id) {
			daysContainer.setAttribute(
				'aria-describedby',
				this._instructionsElement.id
			);
		} else if (this._ids?.instructions) {
			daysContainer.setAttribute('aria-describedby', this._ids.instructions);
		}
		daysContainer.dataset.monthIndex = `${monthIndex}`;

		const pointerEventsSupported = this.supportsPointerEvents();
		const getPointerType = (event, fallback = 'mouse') =>
			this.getEffectivePointerType(event, fallback);

		const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
		const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
		const firstWeekday = (firstDay.getDay() + 6) % 7;

		for (let i = 0; i < firstWeekday; i += 1) {
			const filler = document.createElement('div');
			filler.className = 'day empty';
			filler.setAttribute('role', 'presentation');
			filler.setAttribute('aria-hidden', 'true');
			daysContainer.appendChild(filler);
		}

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		for (let dayNum = 1; dayNum <= lastDay.getDate(); dayNum += 1) {
			const day = document.createElement('div');
			day.className = 'day';
			const currentDate = new Date(date.getFullYear(), date.getMonth(), dayNum);
			day._date = currentDate;
			day.dataset.date = this.formatDate(currentDate);
			if (currentDate < today) day.classList.add('before-today');
			day.setAttribute('role', 'gridcell');
			day.setAttribute('tabindex', '-1');
			day.setAttribute('aria-selected', 'false');
			day.setAttribute('aria-roledescription', this.a11y.dayRoleDescription);
			day.dataset.dateStamp = `${currentDate.getTime()}`;

			const dayLabel = document.createElement('span');
			dayLabel.className = 'day-text';
			dayLabel.textContent = String(dayNum);
			day.appendChild(dayLabel);

			day.addEventListener('mousedown', (event) => event.stopPropagation());
			day.addEventListener('click', (event) => event.stopPropagation());

			day.addEventListener('click', (event) => {
				const pointerType = this.getEffectivePointerType(event);
				const selectionMeta = {
					pointerType,
					targetEl: day,
				};
				if (this.mode === 'multiple' && !this.selectedDates) {
					this.selectedDates = [];
				}
				if (this.plugins?.some((plugin) => plugin.name === 'timePlugin')) {
					this._timePluginState = this._timePluginState || {};
					this._timePluginState._lastDateClicked = currentDate;
				}
				this.selectDate(currentDate, monthIndex, selectionMeta);
			});

			day.addEventListener('focus', () => {
				this._focusedDate = currentDate;
			});

			day.addEventListener('keydown', (event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					day.click();
				}
			});

			const handleHoverStart = (event) => {
				const pointerType = this.updatePointerTypeFromEvent(event);
				if (!this.isTouchLikePointer(pointerType)) {
					this._touchTooltipStickyTarget = null;
				}
				if (this._hoverHideTimeout) {
					clearTimeout(this._hoverHideTimeout);
					this._hoverHideTimeout = null;
				}
				if (this.mode === 'range' && this.startDate && !this.endDate) {
					this.hoverDate = currentDate;
					this.updateDayClasses();
				}
				this.showDayTooltip(currentDate, day);
			};

			const handleHoverMove = (event) => {
				const pointerType = this.updatePointerTypeFromEvent(event);
				if (!this.isTouchLikePointer(pointerType)) {
					this._touchTooltipStickyTarget = null;
				}
				this.showDayTooltip(currentDate, day);
			};

			const handleHoverEnd = (event) => {
				const pointerType = getPointerType(event);
				if (this.isTouchLikePointer(pointerType)) {
					if (
						event?.type === 'touchcancel' ||
						event?.type === 'pointercancel'
					) {
						this.hideHoverTooltip(true);
					}
					return;
				}
				if (this._touchTooltipStickyTarget === day) {
					return;
				}
				this.hideHoverTooltip();
			};

			const handlePointerUp = (event) => {
				const pointerType = getPointerType(event);
				if (this.isTouchLikePointer(pointerType)) {
					return;
				}
			};

			if (pointerEventsSupported) {
				const handlePointerDown = (event) => {
					event.stopPropagation();
					const pointerType = this.updatePointerTypeFromEvent(event);
					if (this.isTouchLikePointer(pointerType)) {
						handleHoverStart(event);
					}
				};
				day.addEventListener('pointerdown', handlePointerDown);
				day.addEventListener('pointerenter', handleHoverStart);
				day.addEventListener('pointermove', handleHoverMove);
				day.addEventListener('pointerleave', handleHoverEnd);
				day.addEventListener('pointercancel', handleHoverEnd);
				day.addEventListener('pointerup', handlePointerUp);
			} else {
				day.addEventListener('touchstart', (event) => {
					event.stopPropagation();
					handleHoverStart(event);
				});
				day.addEventListener('touchmove', handleHoverMove);
				day.addEventListener('touchend', (event) => {
					handleHoverEnd(event);
					event.stopPropagation();
				});
				day.addEventListener('touchcancel', handleHoverEnd);
				day.addEventListener('mouseover', handleHoverStart);
				day.addEventListener('mousemove', handleHoverMove);
				day.addEventListener('mouseleave', handleHoverEnd);
			}

			daysContainer.appendChild(day);
			if (Array.isArray(this.plugins)) {
				this.plugins.forEach((plugin) =>
					plugin?.onDayElementCreated?.(day, currentDate, this)
				);
			}
		}

		return daysContainer;
	}

	selectDate(selected, monthIndex = 0, meta = {}) {
		if (!(selected instanceof Date)) return;
		const normalized = this.normalizeDate(selected);
		if (!normalized) return;
		const pointerType = meta?.pointerType || null;
		const pointerTarget = meta?.targetEl || null;
		const isTouchPointer = this.isTouchLikePointer(pointerType);
		if (!isTouchPointer) {
			this.hideHoverTooltip();
		}
		const emitTouchTooltip = (dateForTooltip = normalized) => {
			if (!isTouchPointer) return;
			this.showTouchTooltipFeedback(dateForTooltip, pointerTarget);
		};

		if (this.mode === 'single') {
			const keepOpen = this.shouldKeepCalendarOpenAfterSelection(
				normalized,
				monthIndex
			);
			const isSame = this.selectedDate?.getTime() === normalized.getTime();
			if (isSame) {
				const reopenTimePanel =
					this._timePluginState?._panelPlacement === 'replace' ||
					this.plugins?.some(
						(plugin) =>
							plugin?.name === 'timePlugin' &&
							plugin?.options?.panelPlacement?.toLowerCase?.() === 'replace'
					);
				if (reopenTimePanel) {
					this.plugins.forEach((plugin) =>
						plugin.onDateSelected?.(normalized, this, monthIndex)
					);
				}
				if (!keepOpen && !this.inline && this.selectedDate) this.hideCalendar();
				return;
			}
			this.selectedDate = normalized;
			this.startDate = this.selectedDate;
			this.endDate = null;
			if (keepOpen) {
				this.setFocusIntent(normalized, false);
				this.renderCalendar();
			}
			this.updateButtonLabel();
			this.updateDayClasses();
			this.updateHiddenInput();
			this.updateApplyActionState('calendar');
			if (!keepOpen && !this.inline && this.selectedDate) this.hideCalendar();
			this.plugins.forEach((plugin) =>
				plugin.onDateSelected?.(normalized, this, monthIndex)
			);
			emitTouchTooltip();
			return;
		}

		if (this.mode === 'multiple') {
			this.selectedDates = this.selectedDates || [];
			const index = this.selectedDates.findIndex(
				(date) => date.getTime() === normalized.getTime()
			);
			if (index !== -1) {
				this.selectedDates.splice(index, 1);
			} else {
				if (
					this.maxMultipleDates > 0 &&
					this.selectedDates.length >= this.maxMultipleDates
				) {
					this.notifyInvalidSelection('warning');
					this.setStatusMessage({
						type: 'warning',
						text: `Maximum de ${this.maxMultipleDates} dates atteintes.`,
					});
					return;
				}
				this.selectedDates.push(normalized);
			}
			this.updateButtonLabel();
			this.updateDayClasses();
			this.updateHiddenInput();
			this.updateApplyActionState('calendar');
			this.plugins.forEach((plugin) =>
				plugin.onDateSelected?.(normalized, this, monthIndex)
			);
			emitTouchTooltip();
			return;
		}

		if (this.mode === 'range') {
			if (!this.startDate || (this.startDate && this.endDate)) {
				this.startDate = normalized;
				this.endDate = null;
				this.hoverDate = null;
				this.updateDayClasses();
				this.updateHiddenInput();
				this.updateApplyActionState('calendar');
				this.updateButtonLabel();
				this.clearStatusMessage();
				this.plugins.forEach((plugin) =>
					plugin.onDateSelected?.(normalized, this, monthIndex)
				);
				emitTouchTooltip(this.startDate);
				return;
			}

			if (normalized.getTime() === this.startDate.getTime()) {
				this.startDate = null;
				this.endDate = null;
				this.hoverDate = null;
				this.updateDayClasses();
				this.updateHiddenInput();
				this.updateButtonLabel();
				this.updateApplyActionState('calendar');
				this.clearStatusMessage();
				return;
			}

			if (this.strictRange2Months && this.startDate) {
				const monthDiff = Math.abs(
					(normalized.getFullYear() - this.startDate.getFullYear()) * 12 +
						(normalized.getMonth() - this.startDate.getMonth())
				);
				if (monthDiff > 1) {
					this.notifyInvalidSelection('error');
					this.setStatusMessage({
						type: 'error',
						text: 'La sélection doit rester dans une fenêtre de deux mois.',
					});
					this.hideHoverTooltip(true);
					return;
				}
			}

			const minRange = this.minRangeNights;
			const maxRange = this.maxRangeNights;
			if (minRange > 0 || maxRange > 0) {
				const diffDays = Math.abs(
					(normalized.getTime() - this.startDate.getTime()) / 86400000
				);
				if (minRange > 0 && diffDays < minRange) {
					this.notifyInvalidSelection('error');
					this.setStatusMessage({
						type: 'error',
						text: `Minimum de ${minRange} nuits requis.`,
					});
					this.hideHoverTooltip(true);
					return;
				}
				if (maxRange > 0 && diffDays > maxRange) {
					this.notifyInvalidSelection('error');
					this.setStatusMessage({
						type: 'error',
						text: `La sélection dépasse le maximum de ${maxRange} nuits.`,
					});
					this.hideHoverTooltip(true);
					return;
				}
			}

			this.endDate = normalized;
			this.hoverDate = null;
			const keepOpen = this.shouldKeepCalendarOpenAfterSelection(
				normalized,
				monthIndex
			);
			if (keepOpen) {
				this.setFocusIntent(normalized, false);
				this.renderCalendar();
			}
			this.updateButtonLabel();
			this.updateDayClasses();
			this.updateHiddenInput();
			this.updateApplyActionState('calendar');
			if (!keepOpen && !this.inline) this.hideCalendar();
			this.plugins.forEach((plugin) =>
				plugin.onDateSelected?.(normalized, this, monthIndex)
			);
			emitTouchTooltip(this.endDate);
		}
	}

	shouldKeepCalendarOpenAfterSelection(date, monthIndex) {
		if (this.keepOpenOnSelection) return true;
		if (!Array.isArray(this.plugins)) return false;
		return this.plugins.some((plugin) => {
			if (!plugin) return false;
			if (plugin.keepOpenOnSelection === true) return true;
			if (typeof plugin.shouldKeepCalendarOpenAfterSelection === 'function') {
				try {
					return !!plugin.shouldKeepCalendarOpenAfterSelection(
						date,
						this,
						monthIndex
					);
				} catch (error) {
					return false;
				}
			}
			return plugin.name === 'timePlugin';
		});
	}

	setFocusIntent(date, shouldMoveFocus = false) {
		const normalized = this.normalizeDate(date);
		this._desiredFocusDate = normalized;
		if (shouldMoveFocus) {
			this._shouldMoveFocusOnRender = true;
		}
	}

	setKeyboardNavigationLock(locked) {
		this._keyboardNavigationLocked = !!locked;
		this.updateDayAccessibilityState();
	}

	getDefaultFocusDate() {
		if (this.mode === 'single' && this.selectedDate) return this.selectedDate;
		if (this.mode === 'range') {
			if (this.endDate) return this.endDate;
			if (this.startDate) return this.startDate;
		}
		if (this.mode === 'multiple' && this.selectedDates?.length) {
			return this.selectedDates[0];
		}
		return new Date(this.date.getFullYear(), this.date.getMonth(), 1);
	}

	getCalendarLabel() {
		if (this.a11y?.calendarLabel) return this.a11y.calendarLabel;
		return 'Sélecteur de dates';
	}

	getWeekdayMetadata() {
		const locale = this.getResolvedLocale();
		const start = this.normalizeWeekday(this.weekStartsOn, 0);
		if (
			this._weekdayMetadataCache &&
			this._weekdayMetadataCache.locale === locale &&
			this._weekdayMetadataCache.weekStartsOn === start
		) {
			return this._weekdayMetadataCache.items;
		}
		const baseDate = new Date(Date.UTC(2023, 0, 1));
		const weekdayItems = [];
		for (let offset = 0; offset < 7; offset += 1) {
			const current = new Date(baseDate);
			current.setUTCDate(baseDate.getUTCDate() + offset);
			weekdayItems.push({
				shortLabel: this.formatWeekday(current, 'short'),
				longLabel: this.formatWeekday(current, 'long'),
				weekdayIndex: offset,
			});
		}
		const rotated = rotateWeekdays(weekdayItems, start);
		this._weekdayMetadataCache = {
			locale,
			weekStartsOn: start,
			items: rotated,
		};
		return rotated;
	}

	formatWeekday(date, format = 'short') {
		try {
			return new Intl.DateTimeFormat(this.getResolvedLocale() || undefined, {
				weekday: format === 'long' ? 'long' : 'short',
			}).format(date);
		} catch (error) {
			return this.formatDateLocalized(date, {
				weekday: format === 'long' ? 'long' : 'short',
			});
		}
	}

	getMonthHeadingLabel(date) {
		const target = date instanceof Date ? date : this.date;
		if (typeof this.a11y.monthLabelFormatter === 'function') {
			try {
				const custom = this.a11y.monthLabelFormatter(target, this);
				if (typeof custom === 'string' && custom.trim()) return custom.trim();
			} catch (error) {
				console.error('NovaCalendar: monthLabelFormatter a échoué.', error);
			}
		}
		try {
			return new Intl.DateTimeFormat(this.locale || undefined, {
				month: 'long',
				year: 'numeric',
			}).format(target);
		} catch (error) {
			return `${target.toLocaleString('default', {
				month: 'long',
			})} ${target.getFullYear()}`;
		}
	}

	getPreviousMonthLabel() {
		return this.a11y?.previousMonthLabel || 'Mois précédent';
	}

	getNextMonthLabel() {
		return this.a11y?.nextMonthLabel || 'Mois suivant';
	}

	getInstructionsText() {
		return (
			this.a11y?.instructions ||
			'Utilisez Tab ou Entrée pour sélectionner une date. Appuyez sur Esc pour fermer.'
		);
	}

	buildInstructionsElement() {
		const text = this.getInstructionsText();
		if (!text) return null;
		const paragraph = document.createElement('p');
		paragraph.className = 'nova-visually-hidden nova-calendar-instructions';
		if (this._ids?.instructions) {
			paragraph.id = this._ids.instructions;
		}
		paragraph.textContent = text;
		return paragraph;
	}

	getAccessibleWeekdayLabel(item, index) {
		if (typeof this.a11y.weekdayLabelFormatter === 'function') {
			try {
				const result = this.a11y.weekdayLabelFormatter(item, index, this);
				if (typeof result === 'string' && result.trim()) {
					return result.trim();
				}
			} catch (error) {
				console.error('NovaCalendar: weekdayLabelFormatter a échoué.', error);
			}
		}
		return item.longLabel;
	}

	updateDayClasses() {
		if (!this.dayElements) return;
		const fromDate = this.startDate;
		const toDate =
			this.endDate ||
			(this.startDate && this.hoverDate ? this.hoverDate : null);

		this.dayElements.forEach(({ el, date }) => {
			if (!date) return;
			el.className = 'day';
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			if (date.getTime() < today.getTime()) el.classList.add('before-today');

			if (
				this.mode === 'single' &&
				this.selectedDate &&
				date.getTime() === this.selectedDate.getTime()
			) {
				el.classList.add('selected');
			}

			if (
				this.mode === 'multiple' &&
				this.selectedDates?.find((d) => d.getTime() === date.getTime())
			) {
				el.classList.add('selected');
			}

			if (this.mode === 'range') {
				if (fromDate && toDate) {
					const fromTime = fromDate.getTime();
					const toTime = toDate.getTime();
					const dateTime = date.getTime();
					const minTime = Math.min(fromTime, toTime);
					const maxTime = Math.max(fromTime, toTime);
					if (dateTime === minTime) el.classList.add('selected', 'range-start');
					else if (dateTime === maxTime)
						el.classList.add('selected', 'range-end');
					else if (dateTime > minTime && dateTime < maxTime)
						el.classList.add('in-range');
				}
				if (
					!toDate &&
					this.hoverDate &&
					fromDate &&
					this.hoverDate.getTime() > fromDate.getTime() &&
					date.getTime() === this.hoverDate.getTime()
				) {
					el.classList.add('range-end');
				}
				if (
					!toDate &&
					this.hoverDate &&
					fromDate &&
					this.hoverDate.getTime() < fromDate.getTime() &&
					date.getTime() === this.hoverDate.getTime()
				) {
					el.classList.add('range-start');
				}
				if (fromDate && !toDate && date.getTime() === fromDate.getTime()) {
					if (this.hoverDate && this.hoverDate.getTime() < fromDate.getTime()) {
						el.classList.add('selected', 'range-end');
					} else {
						el.classList.add('selected', 'range-start');
					}
				}
			}
		});

		this.updateDayAccessibilityState();
	}

	updateDayAccessibilityState() {
		if (!Array.isArray(this.dayElements) || !this.dayElements.length) return;
		const focusTargetDate = this._desiredFocusDate || this._focusedDate || null;
		const shouldMoveFocus = this._shouldMoveFocusOnRender;
		let focusElement = null;
		this.dayElements.forEach(({ el, date }) => {
			if (!(el instanceof HTMLElement) || !(date instanceof Date)) return;
			const disabled = this.isDayElementDisabled(el);
			const selected = el.classList.contains('selected');
			const inRange = el.classList.contains('in-range');
			const today = this.isToday(date);
			const ariaLabel = this.getDayAriaLabel(date, {
				isDisabled: disabled,
				isSelected: selected,
				isInRange: inRange,
				isToday: today,
			});
			if (ariaLabel) {
				el.setAttribute('aria-label', ariaLabel);
			}
			el.setAttribute('aria-selected', selected ? 'true' : 'false');
			if (today) el.setAttribute('aria-current', 'date');
			else el.removeAttribute('aria-current');
			if (disabled) {
				el.setAttribute('aria-disabled', 'true');
				el.setAttribute('tabindex', '-1');
			} else if (!this._keyboardNavigationLocked) {
				el.removeAttribute('aria-disabled');
				el.setAttribute('tabindex', '0');
			}
			if (focusTargetDate && date.getTime() === focusTargetDate.getTime()) {
				focusElement = el;
			}
		});
		if (focusElement) {
			this.applyFocusElement(focusElement, shouldMoveFocus);
		}
		this._desiredFocusDate = null;
		this._shouldMoveFocusOnRender = false;
	}

	isDayElementDisabled(el) {
		if (!(el instanceof HTMLElement)) return false;
		return (
			el.classList.contains('before-today') ||
			el.classList.contains('denied') ||
			el.classList.contains('blocked') ||
			el.dataset.disabled === 'true'
		);
	}

	isToday(date) {
		if (!(date instanceof Date)) return false;
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const candidate = new Date(
			date.getFullYear(),
			date.getMonth(),
			date.getDate()
		);
		return candidate.getTime() === today.getTime();
	}

	getDayAriaLabel(date, context = {}) {
		if (!(date instanceof Date)) return '';
		if (typeof this.a11y.dayLabelFormatter === 'function') {
			try {
				const custom = this.a11y.dayLabelFormatter(date, context, this);
				if (typeof custom === 'string' && custom.trim()) return custom.trim();
			} catch (error) {
				console.error('NovaCalendar: dayLabelFormatter a échoué.', error);
			}
		}
		let baseLabel;
		try {
			baseLabel = new Intl.DateTimeFormat(this.locale || undefined, {
				weekday: 'long',
				day: 'numeric',
				month: 'long',
				year: 'numeric',
			}).format(date);
		} catch (error) {
			baseLabel = date.toDateString();
		}
		const states = [];
		if (context.isSelected) states.push('sélectionné');
		else if (context.isInRange) states.push('dans la sélection');
		if (context.isToday) states.push("aujourd'hui");
		if (context.isDisabled) states.push('indisponible');
		return states.length ? `${baseLabel}, ${states.join(', ')}` : baseLabel;
	}

	applyFocusElement(element, shouldMoveFocus) {
		if (!(element instanceof HTMLElement)) return;
		if (this._keyboardNavigationLocked) return;
		if (shouldMoveFocus && typeof element.focus === 'function') {
			const focusElement = () => {
				try {
					element.focus({ preventScroll: true });
				} catch (error) {
					element.focus();
				}
			};
			if (typeof requestAnimationFrame === 'function') {
				requestAnimationFrame(focusElement);
			} else {
				focusElement();
			}
		}
	}

	getDayElementByDate(date) {
		if (!Array.isArray(this.dayElements) || !this.dayElements.length)
			return null;
		const normalized = this.normalizeDate(date);
		if (!normalized) return null;
		const entry = this.dayElements.find(({ date: stored }) => {
			if (!(stored instanceof Date)) return false;
			return stored.getTime() === normalized.getTime();
		});
		return entry?.el instanceof HTMLElement ? entry.el : null;
	}

	focusDate(date, options = {}) {
		const normalized = this.normalizeDate(date);
		if (!normalized) return false;
		const targetElement = this.getDayElementByDate(normalized);
		if (targetElement) {
			if (!this._keyboardNavigationLocked && options?.focus !== false) {
				this.applyFocusElement(targetElement, true);
			}
			return true;
		}
		this.setFocusIntent(normalized, !!options?.focus);
		return false;
	}

	getFocusableElements() {
		if (!this.shadowRoot) return [];
		const selectors = [
			'button:not([disabled])',
			'[href]',
			'input:not([disabled])',
			'select:not([disabled])',
			'textarea:not([disabled])',
			'[tabindex]:not([tabindex="-1"])',
		];
		const elements = Array.from(
			this.shadowRoot.querySelectorAll(selectors.join(','))
		);
		return elements.filter((el) => {
			if (!(el instanceof HTMLElement)) return false;
			if (el.hasAttribute('disabled')) return false;
			if (el.getAttribute('tabindex') === '-1') return false;
			return true;
		});
	}

	handleShadowKeydown(event) {
		if (!event || !this.isOpen || this.inline) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			this.hideCalendar();
			return;
		}
		if (event.key !== 'Tab') return;
		const focusables = this.getFocusableElements();
		if (!focusables.length) return;
		const active = this.shadowRoot.activeElement;
		const currentIndex = focusables.indexOf(active);
		const lastIndex = focusables.length - 1;
		if (event.shiftKey) {
			if (currentIndex <= 0) {
				event.preventDefault();
				focusables[lastIndex]?.focus();
			}
		} else if (currentIndex === lastIndex) {
			event.preventDefault();
			focusables[0]?.focus();
		}
	}

	getBlockCounterLabel(fallback = '') {
		if (!this.blockCounterEnabled) return '';
		if (this.blockCounterCustomLabel) return this.blockCounterCustomLabel;
		if (typeof fallback === 'string' && fallback.trim().length > 0) {
			return fallback;
		}
		return 'Sélections';
	}

	setBlockCounterOverride(state) {
		if (!this.blockCounterEnabled) return;
		if (!state || !state.active) {
			this._blockCounterOverrideState = null;
			this.renderBlockCounter();
			return;
		}
		const label =
			typeof state.label === 'string' && state.label.trim().length > 0
				? state.label.trim()
				: this.getBlockCounterLabel();
		this._blockCounterOverrideState = {
			...state,
			label,
		};
		this.renderBlockCounter();
	}

	clearBlockCounterOverride() {
		this.setBlockCounterOverride(null);
	}

	updateCoreBlockCounter() {
		if (!this.blockCounterEnabled) return;
		let state = { active: false, count: 0, min: 0, max: 0, label: '' };
		if (this.mode === 'range') {
			const hasStart = !!this.startDate;
			const hasEnd = !!this.endDate;
			let diffNights = 0;
			if (hasStart && hasEnd) {
				diffNights = Math.abs(
					(this.endDate.getTime() - this.startDate.getTime()) / 86400000
				);
			}
			state = {
				active: hasStart || hasEnd,
				count: diffNights,
				min: this.minRangeNights,
				max: this.maxRangeNights,
				label: this.getBlockCounterLabel('Nuits sélectionnées'),
			};
		} else if (this.mode === 'multiple') {
			const count = this.selectedDates?.length || 0;
			state = {
				active:
					count > 0 || this.minMultipleDates > 0 || this.maxMultipleDates > 0,
				count,
				min: this.minMultipleDates,
				max: this.maxMultipleDates,
				label: this.getBlockCounterLabel('Dates sélectionnées'),
			};
		}
		this._blockCounterCoreState = state;
		this.renderBlockCounter();
	}

	renderBlockCounter() {
		if (!this.blockCounterEnabled || !this.container) return;
		const override =
			this._blockCounterOverrideState && this._blockCounterOverrideState.active
				? this._blockCounterOverrideState
				: null;
		const base =
			override ||
			(this._blockCounterCoreState?.active
				? this._blockCounterCoreState
				: null);
		const existing = this.container.querySelector('.nova-calendar-counter');
		if (!base) {
			if (existing) existing.remove();
			return;
		}

		let counter = existing;
		if (!counter) {
			counter = document.createElement('div');
			counter.className = 'nova-calendar-counter';
		}

		const anchor = this.container.querySelector('.nova-time-blocks');
		if (anchor) {
			if (anchor.nextSibling !== counter) {
				anchor.insertAdjacentElement('afterend', counter);
			}
		} else if (counter.parentNode !== this.container) {
			this.container.appendChild(counter);
		}

		const label = base.label || this.getBlockCounterLabel();
		const hasMax = Number.isFinite(base.max) && base.max > 0;
		const countText = hasMax ? `${base.count}/${base.max}` : `${base.count}`;
		counter.textContent = `${label}: ${countText}`;
		const unmet = base.min > 0 && base.count < base.min;
		const maxed = hasMax && base.count >= base.max && base.count > 0;
		counter.classList.toggle('unmet', unmet);
		counter.classList.toggle('maxed', maxed);
	}

	normalizeStatusState(state) {
		if (!state) return null;
		const text =
			typeof state.text === 'string'
				? state.text.trim()
				: String(state.text || '');
		if (!text) return null;
		const allowed = ['error', 'warning', 'info'];
		const type = allowed.includes(state.type) ? state.type : 'info';
		const autoHideDelay = Number.isFinite(Number(state.autoHideDelay))
			? Number(state.autoHideDelay)
			: undefined;
		return autoHideDelay !== undefined
			? { active: true, type, text, autoHideDelay }
			: { active: true, type, text };
	}

	setStatusMessage(state) {
		if (!this.showStatusMessages) {
			this._statusMessageState = null;
			return;
		}
		this._statusMessageState = this.normalizeStatusState(state);
		this.renderStatusMessage();
	}

	shouldDisplayStatusMessage() {
		if (!this.showStatusMessages) return false;
		if (this.inline) return true;
		return !!this.isOpen;
	}

	clearStatusMessage() {
		this._statusMessageState = null;
		if (!this.showStatusMessages) return;
		this.renderStatusMessage();
	}

	setStatusMessageOverride(state) {
		if (!this.showStatusMessages) {
			this._statusMessageOverride = null;
			return;
		}
		this._statusMessageOverride = this.normalizeStatusState(state);
		this.renderStatusMessage();
	}

	clearStatusMessageOverride() {
		this._statusMessageOverride = null;
		if (!this.showStatusMessages) return;
		this.renderStatusMessage();
	}

	triggerErrorFeedback() {
		if (!this.container) return;
		const className = 'nova-error-feedback';
		this.container.classList.remove(className);
		// Force reflow to restart the animation when triggered rapidly
		void this.container.offsetWidth;
		this.container.classList.add(className);
		if (this._errorFeedbackTimeout) {
			clearTimeout(this._errorFeedbackTimeout);
		}
		this._errorFeedbackTimeout = setTimeout(() => {
			if (this.container) this.container.classList.remove(className);
			this._errorFeedbackTimeout = null;
		}, 600);
	}

	notifyInvalidSelection(type = 'error') {
		try {
			this.triggerInvalidRangeFeedback?.();
		} catch (error) {
			console.error(
				'NovaCalendar: triggerInvalidRangeFeedback a échoué.',
				error
			);
		}
		if (type === 'error' || type === 'warning') {
			this.triggerErrorFeedback();
		}
	}

	scheduleStatusAutoHide(status) {
		if (this._statusAutoHideTimeout) {
			clearTimeout(this._statusAutoHideTimeout);
			this._statusAutoHideTimeout = null;
		}
		if (!status) {
			this._statusAutoHideTicket = null;
			return;
		}
		const rawDelay = Number(status?.autoHideDelay);
		const delay = Number.isFinite(rawDelay) && rawDelay > 0 ? rawDelay : 4500;
		if (delay <= 0) {
			this._statusAutoHideTicket = null;
			return;
		}
		const ticket = Symbol('status');
		this._statusAutoHideTicket = ticket;
		this._statusAutoHideTimeout = setTimeout(() => {
			if (this._statusAutoHideTicket !== ticket) return;
			this._statusAutoHideTimeout = null;
			this._statusAutoHideTicket = null;
			if (status === this._statusMessageOverride)
				this.clearStatusMessageOverride();
			else this.clearStatusMessage();
		}, delay);
	}

	renderStatusMessage() {
		if (!this.shadowRoot || !this._statusContainer) return;
		if (!this.showStatusMessages) {
			this._statusContainer.hidden = true;
			this.scheduleStatusAutoHide(null);
			return;
		}
		if (!this.shouldDisplayStatusMessage()) {
			this._statusContainer.className = 'nova-calendar-status';
			this._statusContainer.hidden = true;
			if (this._statusMessageText) this._statusMessageText.textContent = '';
			this.scheduleStatusAutoHide(null);
			return;
		}
		let status = null;
		if (this._statusMessageOverride && this._statusMessageOverride.active) {
			status = this._statusMessageOverride;
		} else if (this._statusMessageState && this._statusMessageState.active) {
			status = this._statusMessageState;
		}

		if (!status) {
			this._statusContainer.className = 'nova-calendar-status';
			this._statusContainer.hidden = true;
			if (this._statusMessageText) this._statusMessageText.textContent = '';
			if (this.container)
				this.container.classList.remove('nova-error-feedback');
			this.scheduleStatusAutoHide(null);
			return;
		}

		const statusInsertBefore = this.container
			? this.container.nextSibling
			: null;
		this.shadowRoot.insertBefore(this._statusContainer, statusInsertBefore);
		this._statusContainer.hidden = false;
		if (this._statusMessageText)
			this._statusMessageText.textContent = status.text;
		this._statusContainer.className = `nova-calendar-status ${status.type}`;
		if (status.type === 'error') this.triggerErrorFeedback();
		this.scheduleStatusAutoHide(status);
	}

	updateButtonLabel() {
		let text = this.options.placeholder || '';
		const minMultiple = this.minMultipleDates;
		const maxMultiple = this.maxMultipleDates;
		const selectedCount = this.selectedDates?.length || 0;
		let statusState = null;
		let hasValidSelection = false;
		const hasTimePlugin = Array.isArray(this.plugins)
			? this.plugins.some((plugin) => plugin?.name === 'timePlugin')
			: false;
		const computeTimeSelectionValid = () => {
			if (!hasTimePlugin) return true;
			const state = this._timePluginState || null;
			return state?.minBlocksMet !== false && state?.maxBlocksReached !== true;
		};

		if (this.mode === 'multiple') {
			const meetsMultipleMinimum =
				minMultiple > 0 ? selectedCount >= minMultiple : true;
			const meetsMultipleMaximum =
				maxMultiple > 0 ? selectedCount <= maxMultiple : true;
			const maxReached = maxMultiple > 0 && selectedCount >= maxMultiple;

			if (selectedCount > 0 && meetsMultipleMinimum && meetsMultipleMaximum) {
				const datesText = [...this.selectedDates]
					.sort((a, b) => a - b)
					.map((d) => this.formatDisplay(d))
					.join(', ');
				text = maxReached
					? `${datesText} · ${selectedCount}/${maxMultiple} dates max`
					: datesText;
				if (maxReached) {
					statusState = {
						type: 'warning',
						text: `Maximum de ${maxMultiple} dates atteintes.`,
					};
				}
				hasValidSelection = true;
			} else if (selectedCount > 0) {
				if (!meetsMultipleMinimum && minMultiple > 0) {
					statusState = {
						type: 'warning',
						text: `Sélectionnez au moins ${minMultiple} dates (actuellement ${selectedCount}).`,
					};
				} else if (!meetsMultipleMaximum && maxMultiple > 0) {
					statusState = {
						type: 'warning',
						text: `Maximum de ${maxMultiple} dates atteintes.`,
					};
				}
			}

			if (this.container) {
				this.container.classList.toggle(
					'nova-selection-minimum-unmet',
					selectedCount > 0 && !meetsMultipleMinimum
				);
				this.container.classList.toggle(
					'nova-selection-maximum-reached',
					selectedCount > 0 && maxReached
				);
			}

			if (!statusState && minMultiple > 0 && selectedCount === 0) {
				statusState = {
					type: 'info',
					text: `Sélectionnez au moins ${minMultiple} dates.`,
				};
			}
		} else if (this.mode === 'range') {
			if (this.startDate && this.endDate) {
				const first =
					this.startDate.getTime() <= this.endDate.getTime()
						? this.startDate
						: this.endDate;
				const last =
					this.startDate.getTime() <= this.endDate.getTime()
						? this.endDate
						: this.startDate;
				text = this.options.format(
					this.formatDisplay(first),
					this.formatDisplay(last)
				);
				hasValidSelection = true;
			}
		} else if (this.mode === 'single') {
			if (this.selectedDate) {
				text = this.options.format(this.formatDisplay(this.selectedDate), null);
				hasValidSelection = true;
			}
		}

		if (this.mode === 'multiple') this.setStatusMessage(statusState);
		else if (this.mode === 'range' && this.startDate && this.endDate)
			this.clearStatusMessage();
		else if (this.mode !== 'multiple' && this.mode !== 'range')
			this.clearStatusMessage();

		this.updateCoreBlockCounter();
		this.updateHiddenInput();

		const timeSelectionValid = computeTimeSelectionValid();
		const shouldDisplaySelection = hasValidSelection;
		const labelEl = this.getLabelElement();
		if (labelEl) {
			labelEl.textContent = shouldDisplaySelection
				? text
				: this._initialLabelValue || '';
			if (shouldDisplaySelection) {
				labelEl.classList.toggle(
					'nova-time-selection-incomplete',
					!timeSelectionValid
				);
			} else {
				labelEl.classList.remove('nova-time-selection-incomplete');
			}
		}
	}

	formatDisplay(date) {
		return date
			? this.formatDateLocalized(date, { day: '2-digit', month: 'short' })
			: '';
	}

	formatDate(date) {
		const year = date.getFullYear();
		const month = (date.getMonth() + 1).toString().padStart(2, '0');
		const day = date.getDate().toString().padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	addPlugin(plugin) {
		if (!plugin) return;

		if (plugin && plugin[PLUGIN_REQUEST_FLAG]) {
			const resolved = this.constructor._resolvePluginRequest(
				plugin.name,
				plugin.options,
				this
			);
			if (resolved) this.addPlugin(resolved);
			return;
		}

		if (plugin && plugin[LAZY_PLUGIN_FLAG]) {
			let loaded;
			try {
				loaded = plugin.loader(this);
			} catch (error) {
				console.error('NovaCalendar: impossible de charger le plugin.', error);
				return;
			}
			if (!loaded) return;
			if (typeof loaded.then === 'function') {
				loaded
					.then((resolved) => this.addPlugin(resolved))
					.catch((error) =>
						console.error(
							'NovaCalendar: le chargement asynchrone du plugin a échoué.',
							error
						)
					);
				return;
			}
			this.addPlugin(loaded);
			return;
		}

		if (typeof plugin.then === 'function') {
			plugin
				.then((resolved) => this.addPlugin(resolved))
				.catch((error) =>
					console.error(
						'NovaCalendar: le chargement asynchrone du plugin a échoué.',
						error
					)
				);
			return;
		}

		if (!this.plugins.includes(plugin)) {
			this.plugins.push(plugin);
			this.updateHostStateClasses();
			plugin.onInit?.(this);
			if (this._initialized) {
				plugin.onShadowReady?.(this);
				this.renderCalendar();
				this.updateDayClasses();
			}
		}
	}

	updateHiddenInput() {
		if (!this.hiddenInput) return;
		let value = '';
		if (this.mode === 'single') {
			value = this.selectedDate
				? { mode: 'single', dates: [this.selectedDate.getTime()] }
				: '';
		} else if (this.mode === 'range') {
			const start =
				this.startDate instanceof Date ? this.startDate.getTime() : null;
			const end = this.endDate instanceof Date ? this.endDate.getTime() : null;
			const hasStart = Number.isFinite(start);
			const hasEnd = Number.isFinite(end);
			if (hasStart && hasEnd) {
				value = { mode: 'range', dates: [start, end] };
			} else {
				value = '';
			}
		} else if (this.mode === 'multiple') {
			const arr =
				this.selectedDates?.length > 0
					? [...this.selectedDates]
							.sort((a, b) => a - b)
							.map((d) => d.getTime())
					: [];
			const meetsMinimum =
				this.minMultipleDates > 0 ? arr.length >= this.minMultipleDates : true;
			const meetsMaximum =
				this.maxMultipleDates > 0 ? arr.length <= this.maxMultipleDates : true;
			this.multipleSelectionMeetsMinimum =
				arr.length > 0 ? meetsMinimum : this.minMultipleDates === 0;
			this.multipleSelectionWithinMaximum = meetsMaximum;
			value =
				arr.length && meetsMinimum && meetsMaximum
					? { mode: 'multiple', dates: arr }
					: '';
		}
		this.hiddenInput.value = value ? JSON.stringify(value) : '';
		this.updateApplyActionState('calendar');
	}

	setDate(value) {
		if (this.mode !== 'single') return;
		const normalized = this.normalizeDate(this.parseDate(value));
		this.selectedDate = normalized;
		this.startDate = normalized;
		this.endDate = null;
		this.hoverDate = null;
		if (!this._initialized) return;
		this.updateButtonLabel();
		this.renderCalendar();
		this.updateHiddenInput();
		this.updateApplyActionState('calendar');
	}

	setRange(start, end) {
		if (this.mode !== 'range') return;
		const startDate = this.normalizeDate(this.parseDate(start));
		const endDate = this.normalizeDate(this.parseDate(end));
		this.startDate = startDate;
		this.endDate = endDate;
		this.hoverDate = null;
		if (!this._initialized) return;
		if (this.strictRange2Months && startDate && endDate) {
			const monthDiff = Math.abs(
				(endDate.getFullYear() - startDate.getFullYear()) * 12 +
					(endDate.getMonth() - startDate.getMonth())
			);
			if (monthDiff > 1) {
				this.notifyInvalidSelection('error');
				this.setStatusMessage({
					type: 'error',
					text: 'La sélection doit rester dans une fenêtre de deux mois.',
				});
				return;
			}
		}
		this.renderCalendar();
		this.updateDayClasses();
		this.updateButtonLabel();
		this.updateHiddenInput();
		this.updateApplyActionState('calendar');
	}

	setMultipleDates(values) {
		if (this.mode !== 'multiple') return;
		const array = Array.isArray(values) ? values : [values];
		const seen = new Set();
		this.selectedDates = array
			.map((value) => this.normalizeDate(this.parseDate(value)))
			.filter((date) => {
				if (!date) return false;
				const key = date.getTime();
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			});
		this.selectedDates.sort((a, b) => a - b);
		if (!this._initialized) return;
		this.renderCalendar();
		this.updateDayClasses();
		this.updateButtonLabel();
		this.updateHiddenInput();
		this.updateApplyActionState('calendar');
	}

	resetSelection() {
		this.selectedDate = null;
		this.startDate = null;
		this.endDate = null;
		this.hoverDate = null;
		this.selectedDates = [];
		const notifyPlugins = () => {
			if (!Array.isArray(this.plugins)) return;
			for (const plugin of this.plugins) {
				if (typeof plugin?.onSelectionCleared === 'function') {
					try {
						plugin.onSelectionCleared(this);
					} catch (error) {
						/* ignore plugin errors during clear */
					}
				}
			}
		};
		notifyPlugins();
		if (!this._initialized) return;
		this.renderCalendar();
		this.updateDayClasses();
		this.updateButtonLabel();
		this.updateHiddenInput();
		this.updateApplyActionState('calendar');
	}
}
