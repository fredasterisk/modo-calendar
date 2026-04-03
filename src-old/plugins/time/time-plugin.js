import pluginStyles from './styles.css?raw';

function injectCSS(shadowRoot) {
	if (!shadowRoot) return;
	if (shadowRoot.getElementById('time-plugin-css')) return;
	const style = document.createElement('style');
	style.id = 'time-plugin-css';
	style.textContent = pluginStyles;
	shadowRoot.appendChild(style);
}

function cloneDate(value) {
	if (!(value instanceof Date)) return null;
	return new Date(value.getTime());
}

function getDateKey(date) {
	if (!date) return null;
	const dt = cloneDate(date) || new Date(date);
	if (Number.isNaN(dt.getTime())) return null;
	dt.setHours(0, 0, 0, 0);
	return dt.getTime();
}

function ensureBlockArray(value) {
	if (!value) return [];
	const arr = Array.isArray(value) ? [...value] : [value];
	return arr.filter(Boolean).sort((a, b) => a.localeCompare(b));
}

const WEEKDAY_LOOKUP = {
	sunday: 0,
	sun: 0,
	dimanche: 0,
	dim: 0,
	monday: 1,
	mon: 1,
	lundi: 1,
	lun: 1,
	tuesday: 2,
	tue: 2,
	tues: 2,
	mardi: 2,
	mar: 2,
	wednesday: 3,
	wed: 3,
	mercredi: 3,
	mer: 3,
	thursday: 4,
	thu: 4,
	thurs: 4,
	jeudi: 4,
	jeu: 4,
	friday: 5,
	fri: 5,
	vendredi: 5,
	ven: 5,
	saturday: 6,
	sat: 6,
	samedi: 6,
	sam: 6,
};

const MONTH_LOOKUP = {
	january: 1,
	jan: 1,
	janvier: 1,
	janv: 1,
	february: 2,
	feb: 2,
	febr: 2,
	fevrier: 2,
	fevr: 2,
	fev: 2,
	march: 3,
	mar: 3,
	mars: 3,
	april: 4,
	apr: 4,
	avril: 4,
	avr: 4,
	may: 5,
	mai: 5,
	june: 6,
	jun: 6,
	juin: 6,
	july: 7,
	jul: 7,
	juillet: 7,
	august: 8,
	aug: 8,
	aout: 8,
	september: 9,
	sept: 9,
	septembre: 9,
	october: 10,
	oct: 10,
	octobre: 10,
	november: 11,
	nov: 11,
	novembre: 11,
	december: 12,
	dec: 12,
	decembre: 12,
};

function normalizeMonthToken(token) {
	if (typeof token !== 'string') return null;
	let text = token.trim().toLowerCase();
	if (!text) return null;
	text = text.replace(/\.+$/, '');
	try {
		text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
	} catch (error) {
		/* normalize not supported, ignore */
	}
	return MONTH_LOOKUP[text] ?? null;
}

function parseOrdinalNumber(value) {
	if (typeof value !== 'string') return Number(value);
	const digits = value.replace(/[^0-9-]/g, '');
	if (!digits) return Number.NaN;
	return Number(digits);
}

function minutesToLabel(minutes) {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function parseTimeValue(value) {
	if (value == null) return null;
	if (typeof value === 'number' && Number.isFinite(value)) {
		if (value >= 0 && value < 24) {
			let hours = Math.floor(value);
			let minutes = Math.round((value - hours) * 60);
			if (minutes === 60) {
				hours += 1;
				minutes = 0;
			}
			if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
			return hours * 60 + minutes;
		}
		if (Number.isInteger(value) && value >= 0 && value < 24 * 60) {
			return value;
		}
		return null;
	}
	const raw = String(value).trim();
	if (!raw) return null;
	const numeric = Number(raw);
	if (!Number.isNaN(numeric) && /^-?\d+(\.\d+)?$/.test(raw)) {
		return parseTimeValue(numeric);
	}
	let text = raw.toLowerCase();
	text = text.replace(/h/g, ':');
	text = text.replace(/\s/g, '');
	if (!text.includes(':')) text = `${text}:00`;
	if (/:$/.test(text)) text = `${text}00`;
	const shortMinute = text.match(/^(\d{1,2}):(\d)$/);
	if (shortMinute) text = `${shortMinute[1]}:0${shortMinute[2]}`;
	const match = text.match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
	if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
	return hours * 60 + minutes;
}

function createSingleMatcher(value) {
	const minutes = parseTimeValue(value);
	if (minutes === null) return null;
	return {
		kind: 'single',
		startMinutes: minutes,
		label: minutesToLabel(minutes),
	};
}

function createRangeMatcher(from, to) {
	const start = parseTimeValue(from);
	const end = parseTimeValue(to);
	if (start === null || end === null) return null;
	if (end <= start) return null;
	return {
		kind: 'range',
		startMinutes: start,
		endMinutes: end,
	};
}

function normalizeTimeMatcher(value) {
	if (value == null) return null;
	if (Array.isArray(value) && value.length === 2) {
		return createRangeMatcher(value[0], value[1]);
	}
	if (typeof value === 'object' && value) {
		const start = value.start ?? value.from ?? value.begin ?? value.debut;
		const end = value.end ?? value.to ?? value.finish ?? value.fin;
		if (start != null && end != null) return createRangeMatcher(start, end);
		if (start != null) return createSingleMatcher(start);
	}
	const str = String(value).trim();
	if (!str) return null;
	const normalized = str
		.replace(/[–—]/g, '-')
		.replace(/\s+à\s+/gi, ' - ')
		.replace(/\s*-\s*/g, ' - ');
	const parts = normalized
		.split(' - ')
		.map((part) => part.trim())
		.filter(Boolean);
	if (parts.length === 1) return createSingleMatcher(parts[0]);
	if (parts.length >= 2) return createRangeMatcher(parts[0], parts[1]);
	return null;
}

function normalizeTimesCollection(value) {
	if (value == null) return null;
	const values = Array.isArray(value) ? value : [value];
	let hasEntry = false;
	const matchers = [];
	for (let i = 0; i < values.length; i += 1) {
		const item = values[i];
		if (item == null) continue;
		hasEntry = true;
		if (typeof item === 'string' && item.trim().toLowerCase() === 'all') {
			return null;
		}
		const matcher = normalizeTimeMatcher(item);
		if (matcher) matchers.push(matcher);
	}
	if (!hasEntry) return null;
	return matchers.length ? matchers : [];
}

function parseDatePartsFromString(value) {
	if (typeof value !== 'string') return null;
	let text = value.trim();
	if (!text) return null;
	if (text.includes('T')) text = text.split('T')[0];
	let match = text.match(/^\s*(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s*$/);
	if (match) {
		return [Number(match[1]), Number(match[2]), Number(match[3])];
	}
	match = text.match(/^\s*(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s*$/);
	if (match) {
		return [Number(match[3]), Number(match[2]), Number(match[1])];
	}
	const tokens = text
		.replace(/[,\u202f\u00a0]/g, ' ')
		.split(/\s+/)
		.filter(Boolean);
	if (tokens.length === 3) {
		const monthSecond = normalizeMonthToken(tokens[1]);
		if (monthSecond) {
			const day = parseOrdinalNumber(tokens[0]);
			const year = parseOrdinalNumber(tokens[2]);
			if (!Number.isNaN(day) && !Number.isNaN(year)) {
				return [year, monthSecond, day];
			}
		}
		const monthFirst = normalizeMonthToken(tokens[0]);
		if (monthFirst) {
			const day = parseOrdinalNumber(tokens[1]);
			const year = parseOrdinalNumber(tokens[2]);
			if (!Number.isNaN(day) && !Number.isNaN(year)) {
				return [year, monthFirst, day];
			}
		}
	}
	const parsed = new Date(text);
	if (!Number.isNaN(parsed.getTime())) {
		return [parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate()];
	}
	return null;
}

function hasDateScope(entry) {
	return (
		entry.date != null ||
		entry.dates != null ||
		entry.from != null ||
		entry.to != null ||
		entry.start != null ||
		entry.end != null ||
		entry.range != null ||
		entry.between != null ||
		entry.after != null ||
		entry.before != null ||
		entry.until != null ||
		entry.since != null
	);
}

function hasWeekdayScope(entry) {
	return (
		entry.weekday != null ||
		entry.weekdays != null ||
		entry.day != null ||
		entry.days != null
	);
}

function normalizeDateValue(value) {
	if (value == null) return null;
	if (value instanceof Date) return getDateKey(value);
	if (typeof value === 'number' && Number.isFinite(value)) {
		return getDateKey(new Date(value));
	}
	if (Array.isArray(value) && value.length >= 3) {
		const year = Number(value[0]);
		const month = Number(value[1]) - 1;
		const day = Number(value[2]);
		if ([year, month, day].some((part) => Number.isNaN(part))) return null;
		return getDateKey(new Date(year, month, day));
	}
	if (typeof value === 'object' && value) {
		const year = Number(value.year ?? value.annee ?? value.y);
		let month = value.month ?? value.mois ?? value.m;
		if (typeof month === 'string') {
			const mapped = normalizeMonthToken(month);
			month = mapped ?? Number(month);
		} else {
			month = Number(month ?? 0);
		}
		const day = Number(value.day ?? value.jour ?? value.d);
		if (
			Number.isInteger(year) &&
			Number.isInteger(month) &&
			Number.isInteger(day) &&
			month >= 1 &&
			month <= 12 &&
			day >= 1 &&
			day <= 31
		) {
			return getDateKey(new Date(year, month - 1, day));
		}
	}
	if (typeof value === 'string') {
		const parts = parseDatePartsFromString(value);
		if (!parts) return null;
		const [year, month, day] = parts;
		if (
			!Number.isInteger(year) ||
			!Number.isInteger(month) ||
			!Number.isInteger(day)
		)
			return null;
		return getDateKey(new Date(year, month - 1, day));
	}
	return null;
}

function normalizeDateCollection(input) {
	if (input == null) return null;
	const values = Array.isArray(input) ? input : [input];
	const set = new Set();
	values.forEach((value) => {
		const key = normalizeDateValue(value);
		if (key !== null) set.add(key);
	});
	return set.size ? set : null;
}

function normalizeDateRange(source) {
	if (!source) return null;
	if (Array.isArray(source)) {
		const fromKey = normalizeDateValue(source[0]);
		const toKey = normalizeDateValue(source[1]);
		if (fromKey === null && toKey === null) return null;
		const range = { from: fromKey, to: toKey };
		if (range.from !== null && range.to !== null && range.from > range.to) {
			const temp = range.from;
			range.from = range.to;
			range.to = temp;
		}
		return range;
	}
	if (typeof source !== 'object') return null;
	let fromValue =
		source.from ??
		source.start ??
		source.after ??
		(Array.isArray(source.between) && source.between.length
			? source.between[0]
			: null);
	let toValue =
		source.to ??
		source.end ??
		source.before ??
		source.until ??
		(Array.isArray(source.between) && source.between.length > 1
			? source.between[1]
			: null);
	const nested = source.range;
	if (nested) {
		const nestedRange = nested === source ? null : normalizeDateRange(nested);
		if (nestedRange) {
			if (fromValue == null) fromValue = nestedRange.from;
			if (toValue == null) toValue = nestedRange.to;
		}
	}
	const fromKey = normalizeDateValue(fromValue);
	const toKey = normalizeDateValue(toValue);
	if (fromKey === null && toKey === null) return null;
	const range = { from: fromKey, to: toKey };
	if (range.from !== null && range.to !== null && range.from > range.to) {
		const temp = range.from;
		range.from = range.to;
		range.to = temp;
	}
	return range;
}

function normalizeWeekdayValue(value) {
	if (typeof value !== 'string') return null;
	let text = value.trim().toLowerCase();
	if (!text) return null;
	if (text.endsWith('s') && WEEKDAY_LOOKUP[text.slice(0, -1)] != null) {
		text = text.slice(0, -1);
	}
	return WEEKDAY_LOOKUP[text] ?? null;
}

function normalizeWeekdays(value) {
	if (value == null) return null;
	const values = Array.isArray(value) ? value : [value];
	const set = new Set();
	values.forEach((item) => {
		if (item == null) return;
		if (
			typeof item === 'number' &&
			Number.isInteger(item) &&
			item >= 0 &&
			item <= 6
		) {
			set.add(item);
			return;
		}
		const mapped = normalizeWeekdayValue(item);
		if (mapped !== null) set.add(mapped);
	});
	return set.size ? set : null;
}

function processDisabledRuleObject(entry, config) {
	const timeSource =
		entry.times ??
		entry.time ??
		entry.blocks ??
		entry.block ??
		entry.slots ??
		entry.slot ??
		null;
	const hasTimeInput =
		entry.times !== undefined ||
		entry.time !== undefined ||
		entry.blocks !== undefined ||
		entry.block !== undefined ||
		entry.slots !== undefined ||
		entry.slot !== undefined;
	const times = normalizeTimesCollection(timeSource);
	const scoped = hasDateScope(entry) || hasWeekdayScope(entry);
	if (!scoped) {
		if (!hasTimeInput) return;
		if (times === null) {
			config.blockAllGlobally = true;
			return;
		}
		if (Array.isArray(times) && times.length) {
			times.forEach((matcher) => {
				if (matcher.kind === 'range') {
					config.globalRanges.push({
						startMinutes: matcher.startMinutes,
						endMinutes: matcher.endMinutes,
					});
					return;
				}
				config.globalSingles.add(matcher.label);
			});
		}
		return;
	}
	if (Array.isArray(times) && times.length === 0 && hasTimeInput) return;
	const rule = {
		matchers: times === null ? null : times,
		dateKeys: normalizeDateCollection(entry.dates ?? entry.date),
		range: normalizeDateRange(entry),
		weekdays: normalizeWeekdays(
			entry.weekdays ?? entry.weekday ?? entry.days ?? entry.day
		),
	};
	if (!rule.dateKeys && !rule.range && !rule.weekdays) return;
	config.rules.push(rule);
}

function buildDisabledRules(disabledTimes) {
	const config = {
		blockAllGlobally: false,
		globalSingles: new Set(),
		globalRanges: [],
		rules: [],
	};
	if (!Array.isArray(disabledTimes)) return config;
	disabledTimes.forEach((entry) => {
		if (entry == null) return;
		if (typeof entry === 'string' || typeof entry === 'number') {
			const matcher = normalizeTimeMatcher(entry);
			if (!matcher) return;
			if (matcher.kind === 'range') {
				config.globalRanges.push({
					startMinutes: matcher.startMinutes,
					endMinutes: matcher.endMinutes,
				});
				return;
			}
			config.globalSingles.add(matcher.label);
			return;
		}
		if (Array.isArray(entry)) {
			if (entry.length === 2) {
				const matcher = createRangeMatcher(entry[0], entry[1]);
				if (!matcher) return;
				config.globalRanges.push({
					startMinutes: matcher.startMinutes,
					endMinutes: matcher.endMinutes,
				});
			}
			return;
		}
		if (typeof entry === 'object') {
			processDisabledRuleObject(entry, config);
		}
	});
	return config;
}

function ruleMatchesDate(rule, date, dateKey) {
	if (rule.dateKeys && !rule.dateKeys.has(dateKey)) return false;
	if (rule.range) {
		if (rule.range.from !== null && dateKey < rule.range.from) return false;
		if (rule.range.to !== null && dateKey > rule.range.to) return false;
	}
	if (rule.weekdays && !rule.weekdays.has(date.getDay())) return false;
	return true;
}

function ruleMatchesTime(rule, slotStartMinutes, slotEndMinutes) {
	if (!rule.matchers) return true;
	for (let i = 0; i < rule.matchers.length; i += 1) {
		const matcher = rule.matchers[i];
		if (matcher.kind === 'single') {
			if (slotStartMinutes === matcher.startMinutes) return true;
			continue;
		}
		if (
			slotStartMinutes >= matcher.startMinutes &&
			slotEndMinutes <= matcher.endMinutes
		)
			return true;
	}
	return false;
}

function isTimeSlotBlocked(
	config,
	date,
	slotStartMinutes,
	slotEndMinutes,
	startLabel
) {
	if (!config) return false;
	if (config.blockAllGlobally) return true;
	if (config.globalSingles.has(startLabel)) return true;
	for (let i = 0; i < config.globalRanges.length; i += 1) {
		const range = config.globalRanges[i];
		if (
			slotStartMinutes >= range.startMinutes &&
			slotEndMinutes <= range.endMinutes
		)
			return true;
	}
	if (!(date instanceof Date)) return false;
	const dateKey = getDateKey(date);
	if (dateKey === null) return false;
	for (let i = 0; i < config.rules.length; i += 1) {
		const rule = config.rules[i];
		if (!ruleMatchesDate(rule, date, dateKey)) continue;
		if (ruleMatchesTime(rule, slotStartMinutes, slotEndMinutes)) return true;
	}
	return false;
}

function blockLabelToRange(dateObj, blockKey) {
	const [fromLabel, toLabel] = blockKey.split(' - ');
	const [fromHour, fromMinute] = fromLabel.split(':').map(Number);
	const [toHour, toMinute] = toLabel.split(':').map(Number);
	const fromTimestamp = new Date(
		dateObj.getFullYear(),
		dateObj.getMonth(),
		dateObj.getDate(),
		fromHour,
		fromMinute
	).getTime();
	const toTimestamp = new Date(
		dateObj.getFullYear(),
		dateObj.getMonth(),
		dateObj.getDate(),
		toHour,
		toMinute
	).getTime();
	return [fromTimestamp, toTimestamp];
}

function splitBlockTimes(blockLabel) {
	if (typeof blockLabel !== 'string') {
		return { start: '', end: '' };
	}
	const parts = blockLabel.split(' - ').map((part) => part.trim());
	if (parts.length === 1) {
		return { start: parts[0] || '', end: '' };
	}
	return { start: parts[0] || '', end: parts[1] || '' };
}

function normalizeDisplayRole(role) {
	if (role === 'end') return 'end';
	return 'start';
}

function formatBlockDisplayLabel(blockLabel, role, showEnd) {
	if (typeof blockLabel !== 'string' || !blockLabel) return '';
	if (showEnd || !blockLabel.includes(' - ')) return blockLabel;
	const { start, end } = splitBlockTimes(blockLabel);
	return normalizeDisplayRole(role) === 'end'
		? end || start || blockLabel
		: start || end || blockLabel;
}

function formatDateForLabel(dateObj, formatter, ctx) {
	if (!(dateObj instanceof Date)) return '';
	if (typeof formatter === 'function') {
		try {
			const formatted = formatter(dateObj, ctx || {});
			if (typeof formatted === 'string' && formatted.trim()) {
				return formatted.trim();
			}
		} catch (error) {
			/* ignored: fallback to default locale formatting */
		}
	}
	const options = { day: '2-digit', month: 'long', year: 'numeric' };
	const calendar = ctx?.calendar;
	if (calendar?.formatDateLocalized) {
		return calendar.formatDateLocalized(dateObj, options);
	}
	const locale = calendar?.getResolvedLocale?.() || 'fr-FR';
	try {
		return dateObj.toLocaleDateString(locale, options);
	} catch (error) {
		return dateObj.toLocaleDateString('fr-FR', options);
	}
}

function resolveRangeLabels(options = {}) {
	const provided = options.rangeLabels || {};
	return {
		start:
			typeof provided.start === 'string' && provided.start.trim()
				? provided.start.trim()
				: 'Arrivée',
		end:
			typeof provided.end === 'string' && provided.end.trim()
				? provided.end.trim()
				: 'Départ',
	};
}

const ROLE_SEPARATOR = '::';

function buildContextKey(dateKey, role) {
	const base = dateKey == null ? '' : String(dateKey);
	if (!role) return base;
	return `${base}${ROLE_SEPARATOR}${role}`;
}

function splitContextKey(compositeKey) {
	const str = compositeKey == null ? '' : String(compositeKey);
	const index = str.indexOf(ROLE_SEPARATOR);
	if (index === -1) return { dateKey: str, role: null };
	return {
		dateKey: str.slice(0, index),
		role: str.slice(index + ROLE_SEPARATOR.length) || null,
	};
}

function extractDateFromKey(compositeKey) {
	const { dateKey } = splitContextKey(compositeKey);
	const numeric = Number(dateKey);
	return Number.isFinite(numeric) ? numeric : null;
}

function findDateByKey(dates, targetKey) {
	if (!Array.isArray(dates)) return null;
	if (!Number.isFinite(targetKey)) return null;
	return (
		dates.find((candidate) => {
			if (!(candidate instanceof Date)) return false;
			return getDateKey(candidate) === targetKey;
		}) || null
	);
}

function getState(calendar) {
	const state = calendar._timePluginState || {};
	state.selectedTimes = state.selectedTimes || {};
	calendar._timePluginState = state;
	return state;
}

function setApplyButtonVisualState(button, disabled) {
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

export function timePlugin(options = {}) {
	const hasExplicitMin =
		Number.isFinite(options.minBlocks) && options.minBlocks >= 0;
	const hasExplicitMax = Number.isFinite(options.maxBlocks);
	const minBlocks = hasExplicitMin
		? Math.max(0, Math.floor(options.minBlocks))
		: 1;
	const maxBlocks = hasExplicitMax
		? Math.max(0, Math.floor(options.maxBlocks))
		: minBlocks;
	const allowMultipleBlocks = maxBlocks === 0 || maxBlocks > 1;
	const defaultRangeFocus =
		options.defaultRangeFocus === 'end' ? 'end' : 'start';
	const rangeLabels = resolveRangeLabels(options);
	const multipleModeOption =
		typeof options.multipleMode === 'string'
			? options.multipleMode.toLowerCase()
			: '';
	const MULTIPLE_MODE_DUAL = 'dual';
	const multipleMode =
		multipleModeOption === 'dual' ||
		multipleModeOption === 'range' ||
		multipleModeOption === 'split' ||
		multipleModeOption === 'start-end' ||
		multipleModeOption === 'arrival-depart'
			? MULTIPLE_MODE_DUAL
			: 'single';
	const multipleLabels = resolveRangeLabels({
		rangeLabels: options.multipleLabels || options.rangeLabels || {},
	});
	const defaultMultipleRole =
		multipleMode === MULTIPLE_MODE_DUAL && options.defaultMultipleRole === 'end'
			? 'end'
			: 'start';
	const customDateLabelFormatter =
		typeof options.formatDateLabel === 'function'
			? options.formatDateLabel
			: typeof options.formatDate === 'function'
			? options.formatDate
			: null;
	const placementOption =
		typeof options.panelPlacement === 'string'
			? options.panelPlacement.toLowerCase().trim()
			: '';
	const ALLOWED_PLACEMENTS = new Set(['below', 'replace', 'left', 'right']);
	const panelPlacement = ALLOWED_PLACEMENTS.has(placementOption)
		? placementOption
		: 'below';
	const replaceAutoReturnEnabled =
		panelPlacement === 'replace' && !allowMultipleBlocks
			? options.replaceAutoReturn !== false
			: false;
	const backButtonLabel =
		typeof options.replaceBackLabel === 'string' &&
		options.replaceBackLabel.trim()
			? options.replaceBackLabel.trim()
			: 'Retour';
	const applyButtonLabel =
		typeof options.replaceApplyLabel === 'string' &&
		options.replaceApplyLabel.trim()
			? options.replaceApplyLabel.trim()
			: 'Appliquer';
	const isTimeApplyEnabled = (calendarInstance) =>
		calendarInstance?.applyActionConfig?.time === true;
	const shouldRenderApplyButton = (calendarInstance) =>
		isTimeApplyEnabled(calendarInstance);
	const shouldAutoReturnAfterSelection = (calendarInstance) => {
		if (!replaceAutoReturnEnabled) return false;
		if (isTimeApplyEnabled(calendarInstance)) return false;
		return true;
	};
	const showEndTimeInLabels = options.showEndTime === true;
	const disabledTimeRules = buildDisabledRules(options.disabledTimes);

	const applyTimeBlockCounter = (calendar, context, rawBlocks) => {
		if (
			!calendar?.blockCounterEnabled ||
			typeof calendar.setBlockCounterOverride !== 'function'
		)
			return;
		const activeDate = context?.date || null;
		if (!activeDate) {
			calendar.clearBlockCounterOverride?.();
			return;
		}
		const blocks = ensureBlockArray(rawBlocks);
		const shouldDisplay = blocks.length > 0 || minBlocks > 0 || maxBlocks > 0;
		if (!shouldDisplay) {
			calendar.clearBlockCounterOverride?.();
			return;
		}
		const baseLabel =
			calendar.getBlockCounterLabel?.('Créneaux sélectionnés') ||
			'Créneaux sélectionnés';
		const suffix = context?.label ? ` (${context.label})` : '';
		calendar.setBlockCounterOverride({
			active: true,
			count: blocks.length,
			min: minBlocks,
			max: maxBlocks,
			label: `${baseLabel}${suffix}`,
		});
	};

	const updateTimeStatusMessage = (calendar, blocksLength, context) => {
		if (typeof calendar?.setStatusMessageOverride !== 'function') return;
		const suffix = context?.label ? ` (${context.label})` : '';
		const enforceMinMessaging = minBlocks > 1;
		const enforceMaxMessaging = maxBlocks > 1;
		if (enforceMinMessaging && blocksLength === 0) {
			calendar.setStatusMessageOverride({
				type: 'info',
				text: `Sélectionnez au moins ${minBlocks} créneaux${suffix}.`,
			});
			return;
		}
		if (enforceMinMessaging && blocksLength > 0 && blocksLength < minBlocks) {
			calendar.setStatusMessageOverride({
				type: 'warning',
				text: `Encore ${minBlocks - blocksLength} créneau${
					minBlocks - blocksLength > 1 ? 'x' : ''
				} requis${suffix}.`,
			});
			return;
		}
		if (enforceMaxMessaging && blocksLength >= maxBlocks) {
			calendar.setStatusMessageOverride({
				type: 'warning',
				text: `Maximum de ${maxBlocks} créneaux atteint${suffix}.`,
			});
			return;
		}
		calendar.clearStatusMessageOverride?.();
	};

	const buildApplyRejectionMessage = (calendarInstance) => {
		const state = getState(calendarInstance);
		if (!state) return '';
		const minBlocksMet = state.minBlocksMet !== false;
		const maxReached = state.maxBlocksReached === true;
		const minDatesRequirement = Number(calendarInstance?.minMultipleDates) || 0;
		const selectedDatesCount = Array.isArray(calendarInstance?.selectedDates)
			? calendarInstance.selectedDates.filter((value) => value instanceof Date)
					.length
			: 0;
		if (
			calendarInstance?.mode === 'multiple' &&
			minDatesRequirement > 0 &&
			selectedDatesCount < minDatesRequirement
		) {
			const remaining = Math.max(0, minDatesRequirement - selectedDatesCount);
			if (remaining > 0) {
				return `Sélectionnez encore ${remaining} date${
					remaining > 1 ? 's' : ''
				} pour valider.`;
			}
			return `Sélectionnez au moins ${minDatesRequirement} date${
				minDatesRequirement > 1 ? 's' : ''
			}.`;
		}
		if (!minBlocksMet) {
			if (minBlocks > 1) {
				return `Sélectionnez au moins ${minBlocks} créneaux.`;
			}
			return 'Sélectionnez au moins un créneau horaire.';
		}
		if (maxReached && maxBlocks > 0) {
			return `Maximum de ${maxBlocks} créneaux atteint.`;
		}
		return '';
	};

	const resolveActiveContext = (calendar) => {
		const state = getState(calendar);
		const mode = calendar.mode;
		if (mode === 'range') {
			const start = cloneDate(calendar.startDate);
			const end = cloneDate(calendar.endDate);
			const startKey = getDateKey(start);
			const endKey = getDateKey(end);
			const desired =
				state.activeRangeTarget === 'end' || state.activeRangeTarget === 'start'
					? state.activeRangeTarget
					: defaultRangeFocus;
			const last = cloneDate(state._lastDateClicked);
			const lastKey = getDateKey(last);
			const build = (role, date) => ({
				role,
				date: date ? cloneDate(date) : null,
				key: getDateKey(date),
				label: role ? rangeLabels[role] || role : null,
			});
			if (desired === 'start' && start) return build('start', start);
			if (desired === 'end' && end) return build('end', end);
			if (lastKey !== null) {
				if (startKey !== null && lastKey === startKey)
					return build('start', start);
				if (endKey !== null && lastKey === endKey) return build('end', end);
			}
			if (end) return build('end', end);
			if (start) return build('start', start);
			return { role: null, date: null, key: null, label: null };
		}
		if (mode === 'multiple') {
			const rawSelected = Array.isArray(calendar.selectedDates)
				? calendar.selectedDates.filter((value) => value instanceof Date)
				: [];
			if (!rawSelected.length) {
				state._activeMultipleDateKey = null;
				state._activeMultipleRole =
					multipleMode === MULTIPLE_MODE_DUAL ? defaultMultipleRole : null;
				state._lastDateClicked = null;
				calendar._timePluginState = state;
				return { role: null, date: null, key: null, label: null };
			}
			const sortedDates = rawSelected.slice().sort((a, b) => {
				const aKey = getDateKey(a);
				const bKey = getDateKey(b);
				if (aKey !== null && bKey !== null && aKey !== bKey) {
					return aKey - bKey;
				}
				return a - b;
			});
			const dateKeys = sortedDates
				.map((date) => getDateKey(date))
				.filter((key) => key !== null);
			let activeDateKey = Number.isFinite(state._activeMultipleDateKey)
				? state._activeMultipleDateKey
				: null;
			if (!dateKeys.includes(activeDateKey)) {
				activeDateKey = dateKeys[0] ?? null;
				state._activeMultipleDateKey = activeDateKey;
			}
			let activeDate = findDateByKey(sortedDates, activeDateKey);
			if (!activeDate) activeDate = sortedDates[0] || null;
			let role = null;
			if (multipleMode === MULTIPLE_MODE_DUAL) {
				role = state._activeMultipleRole === 'end' ? 'end' : 'start';
				state._activeMultipleRole = role;
			} else if (state._activeMultipleRole) {
				state._activeMultipleRole = null;
			}
			const label = role ? multipleLabels[role] || role : null;
			const key =
				activeDateKey !== null ? buildContextKey(activeDateKey, role) : null;
			state._lastDateClicked = activeDate ? cloneDate(activeDate) : null;
			calendar._timePluginState = state;
			return {
				role,
				date: activeDate ? cloneDate(activeDate) : null,
				key,
				label,
			};
		}
		let activeDate =
			state._lastDateClicked ||
			calendar.selectedDate ||
			(Array.isArray(calendar.selectedDates) && calendar.selectedDates[0]) ||
			null;
		if (activeDate && !(activeDate instanceof Date)) {
			activeDate = new Date(activeDate);
		}
		return {
			role: 'single',
			date: activeDate ? cloneDate(activeDate) : null,
			key: getDateKey(activeDate),
			label: null,
		};
	};

	const pruneSelectedTimes = (calendar) => {
		const state = getState(calendar);
		const map = state.selectedTimes || {};
		const allowed = new Set();
		let changed = false;
		if (calendar.mode === 'range') {
			const startKey = getDateKey(calendar.startDate);
			const endKey = getDateKey(calendar.endDate);
			if (startKey !== null) allowed.add(String(startKey));
			if (endKey !== null) allowed.add(String(endKey));
		} else if (calendar.mode === 'multiple') {
			const selectedDates = Array.isArray(calendar.selectedDates)
				? calendar.selectedDates.filter((value) => value instanceof Date)
				: [];
			const dateKeys = [];
			selectedDates.forEach((date) => {
				const key = getDateKey(date);
				if (key === null) return;
				dateKeys.push(key);
				if (multipleMode === MULTIPLE_MODE_DUAL) {
					allowed.add(buildContextKey(key, 'start'));
					allowed.add(buildContextKey(key, 'end'));
				} else {
					allowed.add(buildContextKey(key, null));
				}
			});
			const hasActive = Number.isFinite(state._activeMultipleDateKey)
				? dateKeys.includes(state._activeMultipleDateKey)
				: false;
			if (!hasActive) {
				state._activeMultipleDateKey = dateKeys.length ? dateKeys[0] : null;
				changed = true;
			}
			if (!dateKeys.length) {
				const nextRole =
					multipleMode === MULTIPLE_MODE_DUAL ? defaultMultipleRole : null;
				if (state._activeMultipleRole !== nextRole) {
					state._activeMultipleRole = nextRole;
					changed = true;
				}
				if (state._lastDateClicked) {
					state._lastDateClicked = null;
					changed = true;
				}
			} else {
				const activeDate = findDateByKey(
					selectedDates,
					state._activeMultipleDateKey
				);
				const previousTime =
					state._lastDateClicked instanceof Date
						? state._lastDateClicked.getTime()
						: null;
				const nextTime =
					activeDate instanceof Date ? activeDate.getTime() : null;
				if (previousTime !== nextTime) {
					state._lastDateClicked = activeDate ? cloneDate(activeDate) : null;
					changed = true;
				}
				if (multipleMode === MULTIPLE_MODE_DUAL) {
					if (
						state._activeMultipleRole !== 'start' &&
						state._activeMultipleRole !== 'end'
					) {
						state._activeMultipleRole = defaultMultipleRole;
						changed = true;
					}
				} else if (state._activeMultipleRole) {
					state._activeMultipleRole = null;
					changed = true;
				}
			}
		} else {
			const context = resolveActiveContext(calendar);
			if (context.key !== null) allowed.add(String(context.key));
		}
		Object.keys(map).forEach((key) => {
			if (!allowed.has(key)) {
				delete map[key];
				changed = true;
			}
		});
		if (calendar.mode === 'range') {
			const startKey = getDateKey(calendar.startDate);
			const endKey = getDateKey(calendar.endDate);
			const startAllowed = startKey !== null && allowed.has(String(startKey));
			const endAllowed = endKey !== null && allowed.has(String(endKey));
			if (state.activeRangeTarget === 'start' && !startAllowed && endAllowed) {
				state.activeRangeTarget = 'end';
				state._lastDateClicked =
					endKey !== null ? cloneDate(calendar.endDate) : null;
				changed = true;
			} else if (
				state.activeRangeTarget === 'end' &&
				!endAllowed &&
				startAllowed
			) {
				state.activeRangeTarget = 'start';
				state._lastDateClicked =
					startKey !== null ? cloneDate(calendar.startDate) : null;
				changed = true;
			} else if (!startAllowed && !endAllowed) {
				state.activeRangeTarget = defaultRangeFocus;
				state._lastDateClicked = null;
				changed = true;
			}
		}
		if (changed) {
			state.selectedTimes = { ...map };
			calendar._timePluginState = state;
		}
		return state.selectedTimes;
	};

	const buildTimesPayload = (map, keys) => {
		const result = {};
		keys.forEach((key) => {
			const blocks = ensureBlockArray(map[key]);
			if (!blocks.length) return;
			const { dateKey, role } = splitContextKey(key);
			const numericKey = Number(dateKey);
			if (!Number.isFinite(numericKey)) return;
			const dateObj = new Date(numericKey);
			if (Number.isNaN(dateObj.getTime())) return;
			const blockRanges = blocks.map((block) =>
				blockLabelToRange(dateObj, block)
			);
			if (role) {
				if (!result[dateKey] || Array.isArray(result[dateKey])) {
					result[dateKey] = {};
				}
				if (!Array.isArray(result[dateKey][role])) result[dateKey][role] = [];
				result[dateKey][role].push(...blockRanges);
			} else {
				if (!Array.isArray(result[dateKey])) result[dateKey] = [];
				result[dateKey].push(...blockRanges);
			}
		});
		return result;
	};

	const getRelevantKeys = (calendar) => {
		if (calendar.mode === 'range') {
			const keys = [];
			const startKey = getDateKey(calendar.startDate);
			const endKey = getDateKey(calendar.endDate);
			if (startKey !== null) keys.push(String(startKey));
			if (endKey !== null && endKey !== startKey) keys.push(String(endKey));
			return keys;
		}
		if (calendar.mode === 'multiple') {
			const keys = [];
			const selectedDates = Array.isArray(calendar.selectedDates)
				? calendar.selectedDates.filter((value) => value instanceof Date)
				: [];
			selectedDates.forEach((date) => {
				const dateKey = getDateKey(date);
				if (dateKey === null) return;
				if (multipleMode === MULTIPLE_MODE_DUAL) {
					keys.push(buildContextKey(dateKey, 'start'));
					keys.push(buildContextKey(dateKey, 'end'));
				} else {
					keys.push(buildContextKey(dateKey, null));
				}
			});
			return keys;
		}
		const context = resolveActiveContext(calendar);
		return context.key !== null ? [String(context.key)] : [];
	};

	const ensureLayoutContainers = (calendar) => {
		const container = calendar?.container;
		if (!container) return null;
		const layoutClass = 'nova-time-layout';
		let layout = container.querySelector(`.${layoutClass}`);
		if (!layout) {
			layout = document.createElement('div');
			layout.className = layoutClass;
			const calendarPane = document.createElement('div');
			calendarPane.className = 'nova-time-calendar-pane';
			while (container.firstChild) {
				const child = container.firstChild;
				container.removeChild(child);
				if (
					child instanceof HTMLElement &&
					child.classList.contains('nova-time-blocks')
				)
					continue;
				calendarPane.appendChild(child);
			}
			layout.appendChild(calendarPane);
			container.appendChild(layout);
		}
		let calendarPane = layout.querySelector('.nova-time-calendar-pane');
		if (!calendarPane) {
			calendarPane = document.createElement('div');
			calendarPane.className = 'nova-time-calendar-pane';
			layout.insertBefore(calendarPane, layout.firstChild || null);
		}
		let timePane = layout.querySelector('.nova-time-panel-container');
		if (!timePane) {
			timePane = document.createElement('div');
			timePane.className = 'nova-time-panel-container';
			layout.appendChild(timePane);
		}
		return { layout, calendarPane, timePane };
	};

	const applyPlacementClasses = (layout, calendarPane, timePane, placement) => {
		layout.classList.remove(
			'nova-time-placement-below',
			'nova-time-placement-left',
			'nova-time-placement-right',
			'nova-time-placement-replace'
		);
		layout.classList.add(`nova-time-placement-${placement}`);
		if (placement === 'left') {
			if (timePane.nextSibling !== calendarPane)
				layout.insertBefore(timePane, calendarPane);
		} else {
			if (calendarPane.nextSibling !== timePane)
				layout.insertBefore(timePane, calendarPane.nextSibling);
		}
	};

	return {
		name: 'timePlugin',
		options,
		keepOpenOnSelection: true,
		onShadowReady(calendarInstance) {
			injectCSS(calendarInstance.shadowRoot);
		},
		onInit(calendar) {
			calendar.keepOpenOnSelection = true;
			const state = getState(calendar);
			state._lastDateClicked = state._lastDateClicked || null;
			state.minBlocksMet = false;
			state.maxBlocksReached = false;
			if (calendar.mode === 'range') {
				if (
					state.activeRangeTarget !== 'start' &&
					state.activeRangeTarget !== 'end'
				) {
					state.activeRangeTarget = defaultRangeFocus;
				}
				if (!state._lastDateClicked) {
					if (state.activeRangeTarget === 'end' && calendar.endDate) {
						state._lastDateClicked = cloneDate(calendar.endDate);
					} else if (calendar.startDate) {
						state._lastDateClicked = cloneDate(calendar.startDate);
					} else if (calendar.endDate) {
						state._lastDateClicked = cloneDate(calendar.endDate);
					}
				}
			} else if (calendar.mode === 'multiple') {
				state._activeMultipleDateKey = Number.isFinite(
					state._activeMultipleDateKey
				)
					? state._activeMultipleDateKey
					: null;
				if (multipleMode === MULTIPLE_MODE_DUAL) {
					if (
						state._activeMultipleRole !== 'start' &&
						state._activeMultipleRole !== 'end'
					) {
						state._activeMultipleRole = defaultMultipleRole;
					}
				} else if (state._activeMultipleRole) {
					state._activeMultipleRole = null;
				}
			} else if (calendar.selectedDate && !state._lastDateClicked) {
				state._lastDateClicked = cloneDate(calendar.selectedDate);
			}
			state._panelView =
				panelPlacement === 'replace'
					? state._panelView === 'time'
						? 'time'
						: 'calendar'
					: 'time';
			state._panelPlacement = panelPlacement;
			calendar._timePluginState = state;
			pruneSelectedTimes(calendar);

			const originalUpdateHiddenInput =
				calendar.updateHiddenInput?.bind(calendar) || (() => {});
			calendar.updateHiddenInput = function () {
				const syncApplyState = () => {
					calendar.updateApplyActionState?.('calendar');
					const localState = getState(calendar);
					const updateClearState = localState?._updateTimeClearButtonState;
					if (typeof updateClearState === 'function') {
						try {
							updateClearState();
						} catch (error) {
							/* ignore clear state errors */
						}
					}
				};
				if (!calendar.hiddenInput) {
					syncApplyState();
					return;
				}
				pruneSelectedTimes(calendar);
				const localState = getState(calendar);
				const selectedTimesMap = localState.selectedTimes || {};
				const relevantKeys = getRelevantKeys(calendar);
				originalUpdateHiddenInput();
				if (!relevantKeys.length) {
					localState.minBlocksMet = minBlocks === 0;
					localState.maxBlocksReached = false;
					calendar._timePluginState = localState;
					syncApplyState();
					return;
				}
				let allMinSatisfied = true;
				let anyBlocks = false;
				let anyMaxExceeded = false;
				relevantKeys.forEach((key) => {
					const blocks = ensureBlockArray(selectedTimesMap[key]);
					if (blocks.length > 0) anyBlocks = true;
					if (minBlocks > 0 && blocks.length < minBlocks)
						allMinSatisfied = false;
					if (maxBlocks > 0 && blocks.length > maxBlocks) anyMaxExceeded = true;
				});
				localState.minBlocksMet =
					minBlocks === 0 ? true : allMinSatisfied && anyBlocks;
				localState.maxBlocksReached = anyMaxExceeded;
				calendar._timePluginState = localState;
				if (!allMinSatisfied || anyMaxExceeded) {
					calendar.hiddenInput.value = '';
					syncApplyState();
					return;
				}
				const timesPayload = buildTimesPayload(selectedTimesMap, relevantKeys);
				if (!Object.keys(timesPayload).length) {
					syncApplyState();
					return;
				}
				let basePayload = null;
				try {
					basePayload = calendar.hiddenInput.value
						? JSON.parse(calendar.hiddenInput.value)
						: null;
				} catch (error) {
					basePayload = null;
				}
				const payload =
					basePayload && typeof basePayload === 'object'
						? basePayload
						: { mode: calendar.mode };
				payload.times = timesPayload;
				if (calendar.mode === 'range') {
					payload.range = {
						start: getDateKey(calendar.startDate),
						end: getDateKey(calendar.endDate),
					};
				}
				const numericKeys = [];
				relevantKeys.forEach((key) => {
					const numeric = extractDateFromKey(key);
					if (numeric !== null) numericKeys.push(numeric);
				});
				const uniqueKeys = [...new Set(numericKeys)];
				if (!Array.isArray(payload.dates)) {
					payload.dates = [...uniqueKeys];
				} else {
					const merged = new Set([...payload.dates, ...uniqueKeys]);
					payload.dates = [...merged];
				}
				calendar.hiddenInput.value = JSON.stringify(payload);
				syncApplyState();
			};

			calendar.getTimeSummaryForDate = function (date, summaryOptions = {}) {
				if (!(date instanceof Date)) return '';
				pruneSelectedTimes(calendar);
				const opts = {
					joiner: ', ',
					roleSeparator: ' | ',
					includeRoleLabels: true,
					includeEmptyLabel: false,
					role: null,
					...summaryOptions,
				};
				const dateKey = getDateKey(date);
				if (dateKey === null) return '';
				const localState = getState(calendar);
				const activeContext = resolveActiveContext(calendar);
				const map = localState.selectedTimes || {};
				const buildTextFromKey = (key, roleForDisplay = null) => {
					const blocks = ensureBlockArray(map[key]);
					if (!blocks.length)
						return opts.includeEmptyLabel && minBlocks > 0
							? `${minBlocks} créneaux min`
							: '';
					const effectiveRole = roleForDisplay || opts.role || 'start';
					const normalizedRole = normalizeDisplayRole(effectiveRole);
					const formattedBlocks = blocks.map((block) =>
						formatBlockDisplayLabel(block, normalizedRole, showEndTimeInLabels)
					);
					return formattedBlocks.join(opts.joiner);
				};
				const applyRoleSummaries = (roles, labels) => {
					const roleFilter =
						typeof opts.role === 'string' && roles.includes(opts.role)
							? opts.role
							: null;
					const parts = [];
					roles
						.filter((role) => !roleFilter || role === roleFilter)
						.forEach((role) => {
							const key = buildContextKey(dateKey, role);
							const text = buildTextFromKey(key, role);
							if (!text) return;
							if (opts.includeRoleLabels === false) {
								parts.push(text);
								return;
							}
							const roleLabel = labels[role] || role;
							parts.push(`${roleLabel} · ${text}`);
						});
					return parts.join(opts.roleSeparator).trim();
				};
				if (calendar.mode === 'range') {
					return applyRoleSummaries(['start', 'end'], rangeLabels);
				}
				if (
					calendar.mode === 'multiple' &&
					multipleMode === MULTIPLE_MODE_DUAL
				) {
					return applyRoleSummaries(['start', 'end'], multipleLabels);
				}
				const key =
					calendar.mode === 'multiple'
						? buildContextKey(dateKey, null)
						: opts.role
						? buildContextKey(dateKey, opts.role)
						: buildContextKey(dateKey, null);
				const roleForDisplay = normalizeDisplayRole(
					opts.role || activeContext.role
				);
				return buildTextFromKey(key, roleForDisplay).trim();
			};

			const originalUpdateButtonLabel =
				calendar.updateButtonLabel?.bind(calendar) || (() => {});
			calendar.updateButtonLabel = function () {
				pruneSelectedTimes(calendar);
				const context = resolveActiveContext(calendar);
				const localState = getState(calendar);
				const timeSelectionValid =
					localState.minBlocksMet !== false &&
					localState.maxBlocksReached !== true;
				const selectedTimesMap = localState.selectedTimes || {};
				const blocks =
					context.key !== null
						? ensureBlockArray(selectedTimesMap[context.key])
						: [];
				const unmet =
					minBlocks > 0 && blocks.length > 0 && blocks.length < minBlocks;
				const maxReached = maxBlocks > 1 && blocks.length >= maxBlocks;
				if (calendar.container) {
					calendar.container.classList.toggle('nova-time-minimum-unmet', unmet);
					calendar.container.classList.toggle(
						'nova-time-maximum-reached',
						maxReached && blocks.length > 0
					);
				}
				if (context.date) {
					applyTimeBlockCounter(calendar, context, blocks);
					updateTimeStatusMessage(calendar, blocks.length, context);
				} else {
					calendar.clearBlockCounterOverride?.();
					calendar.clearStatusMessageOverride?.();
				}
				const formatCtxBase = {
					calendar,
					mode: calendar.mode,
				};
				if (calendar.mode === 'single') {
					const labelDiv = calendar.getLabelElement?.() || null;
					if (labelDiv && context.date && timeSelectionValid) {
						if (blocks.length > 1) {
							const countLabel =
								maxBlocks > 0
									? `${blocks.length}/${maxBlocks}`
									: `${blocks.length}`;
							labelDiv.textContent = `${formatDateForLabel(
								context.date,
								customDateLabelFormatter,
								{ ...formatCtxBase, context }
							)} · ${countLabel} créneaux`;
							return;
						}
						if (blocks.length === 1) {
							const maxSuffix =
								maxBlocks > 0 && maxReached
									? ` · ${blocks.length}/${maxBlocks} créneaux max`
									: '';
							const displayBlock =
								formatBlockDisplayLabel(
									blocks[0],
									context.role,
									showEndTimeInLabels
								) || blocks[0];
							labelDiv.textContent = `${formatDateForLabel(
								context.date,
								customDateLabelFormatter,
								{ ...formatCtxBase, context }
							)} · ${displayBlock}${maxSuffix}`;
							return;
						}
						// No label update when blocks missing; placeholder stays via core handler.
					}
					originalUpdateButtonLabel();
					return;
				}
				originalUpdateButtonLabel();
				if (calendar.mode === 'range') {
					const labelEl = calendar.getLabelElement?.() || null;
					if (!labelEl) return;
					if (!timeSelectionValid) return;
					const startDate =
						calendar.startDate instanceof Date ? calendar.startDate : null;
					const endDate =
						calendar.endDate instanceof Date ? calendar.endDate : null;
					const startKey = getDateKey(startDate);
					const endKey = getDateKey(endDate);
					const startBlocks =
						startKey !== null
							? ensureBlockArray(selectedTimesMap[String(startKey)])
							: [];
					const endBlocks =
						endKey !== null
							? ensureBlockArray(selectedTimesMap[String(endKey)])
							: [];
					if (!startBlocks.length && !endBlocks.length) return;
					const buildDateTime = (role, date, blocks, indexResolver) => {
						if (!(date instanceof Date)) return '';
						const dateLabel = formatDateForLabel(
							date,
							customDateLabelFormatter,
							{
								...formatCtxBase,
								context: {
									role,
									date,
									label: rangeLabels[role] || role,
								},
							}
						);
						const blockLabel =
							typeof indexResolver === 'function'
								? indexResolver(blocks)
								: null;
						if (!blockLabel) return dateLabel;
						const displayLabel = formatBlockDisplayLabel(
							blockLabel,
							role,
							showEndTimeInLabels
						);
						const timeFragment = displayLabel || blockLabel;
						return [dateLabel, timeFragment].filter(Boolean).join(' ');
					};
					const startText = buildDateTime(
						'start',
						startDate,
						startBlocks,
						(blocks) => (blocks.length ? blocks[0] : null)
					);
					const endText = buildDateTime('end', endDate, endBlocks, (blocks) =>
						blocks.length ? blocks[blocks.length - 1] : null
					);
					const combined = [startText, endText].filter(Boolean);
					if (combined.length) labelEl.textContent = combined.join(' - ');
					return;
				}
				if (calendar.mode === 'multiple') {
					const labelEl = calendar.getLabelElement?.() || null;
					if (!labelEl) return;
					if (!timeSelectionValid) return;
					const selectedDates = Array.isArray(calendar.selectedDates)
						? calendar.selectedDates.filter((value) => value instanceof Date)
						: [];
					if (!selectedDates.length) return;
					const meetsMinimum =
						calendar.minMultipleDates > 0
							? selectedDates.length >= calendar.minMultipleDates
							: true;
					if (!meetsMinimum) return;
					const pieces = selectedDates
						.slice()
						.sort((a, b) => a - b)
						.map((date) => {
							const base =
								typeof calendar.formatDisplay === 'function'
									? calendar.formatDisplay(date)
									: calendar.formatDateLocalized?.(date, {
											day: '2-digit',
											month: 'short',
									  }) ||
									  date.toLocaleDateString('fr-FR', {
											day: '2-digit',
											month: 'short',
									  });
							const summary =
								typeof calendar.getTimeSummaryForDate === 'function'
									? calendar.getTimeSummaryForDate(date, {
											includeEmptyLabel: true,
									  })
									: '';
							return summary ? `${base} · ${summary}` : base;
						})
						.filter(Boolean);
					if (!pieces.length) return;
					let text = pieces.join(', ');
					const maxCap = calendar.maxMultipleDates || 0;
					if (maxCap > 0 && selectedDates.length >= maxCap) {
						text = `${text} · ${selectedDates.length}/${maxCap} dates max`;
					}
					labelEl.textContent = text;
				}
			};
			calendar.updateApplyActionState?.('calendar');
		},
		onDateSelected(selectedDate, calendar) {
			if (!(selectedDate instanceof Date)) return;
			const state = getState(calendar);
			state._lastDateClicked = cloneDate(selectedDate);
			if (calendar.mode === 'range') {
				const startKey = getDateKey(calendar.startDate);
				const endKey = getDateKey(calendar.endDate);
				const selectedKey = getDateKey(selectedDate);
				if (selectedKey !== null && selectedKey === endKey) {
					state.activeRangeTarget = 'end';
				} else if (selectedKey !== null && selectedKey === startKey) {
					state.activeRangeTarget = 'start';
				}
			} else if (calendar.mode === 'multiple') {
				const selectedKey = getDateKey(selectedDate);
				state._activeMultipleDateKey = selectedKey;
				if (multipleMode === MULTIPLE_MODE_DUAL) {
					if (
						state._activeMultipleRole !== 'end' &&
						state._activeMultipleRole !== 'start'
					) {
						state._activeMultipleRole = defaultMultipleRole;
					}
				} else if (state._activeMultipleRole) {
					state._activeMultipleRole = null;
				}
			}
			if (panelPlacement === 'replace') {
				state._panelView = 'time';
			}
			calendar._timePluginState = state;
			const rerender =
				typeof state._renderBlocks === 'function' ? state._renderBlocks : null;
			if (rerender) rerender(true);
			calendar.updateApplyActionState?.('calendar');
		},
		onRender(calendar) {
			const schedule = (fn) => {
				if (typeof queueMicrotask === 'function') {
					queueMicrotask(fn);
					return;
				}
				Promise.resolve()
					.then(fn)
					.catch(() => {});
			};
			const resolveCalendarLabel = () => {
				const labelEl = calendar.getLabelElement?.();
				const labelText = labelEl?.textContent?.trim();
				if (labelText) return labelText;
				if (typeof calendar._initialLabelValue === 'string') {
					const trimmed = calendar._initialLabelValue.trim();
					if (trimmed) return trimmed;
				}
				if (typeof calendar.options?.placeholder === 'string') {
					const trimmed = calendar.options.placeholder.trim();
					if (trimmed) return trimmed;
				}
				return '';
			};
			const renderState = getState(calendar);

			const renderBlocks = (allowRetry = true) => {
				const container = calendar.container;
				if (!container) return;
				if (!container.childElementCount) {
					if (allowRetry) schedule(() => renderBlocks(false));
					return;
				}
				const layoutParts = ensureLayoutContainers(calendar);
				if (!layoutParts) return;
				const { layout, calendarPane, timePane } = layoutParts;
				applyPlacementClasses(layout, calendarPane, timePane, panelPlacement);
				layout.dataset.placement = panelPlacement;
				timePane.dataset.placement = panelPlacement;
				layout.classList.toggle(
					'nova-time-has-multi',
					!!calendarPane.querySelector('.nova-months-wrapper')
				);
				const requestReposition = () => {
					if (calendar.inline) return;
					if (!calendar.isOpen) return;
					if (!['left', 'right'].includes(panelPlacement)) return;
					const raf =
						typeof requestAnimationFrame === 'function'
							? requestAnimationFrame
							: (cb) => setTimeout(cb, 16);
					raf(() => {
						schedule(() => {
							try {
								calendar.positionCalendar?.();
							} catch (error) {
								/* ignore reposition errors */
							}
						});
					});
				};

				const daysNode = calendarPane.querySelector('.days');
				if (!daysNode) {
					if (allowRetry) schedule(() => renderBlocks(false));
					return;
				}

				const selectedTimesMap = pruneSelectedTimes(calendar);
				const context = resolveActiveContext(calendar);
				const activeDate = context.date;
				const activeKey = context.key;
				const layoutState = getState(calendar);
				const viewMode =
					panelPlacement === 'replace' && layoutState._panelView !== 'time'
						? 'calendar'
						: 'time';
				const shouldShowPanel =
					!!activeDate &&
					activeKey !== null &&
					(panelPlacement !== 'replace' || viewMode === 'time');

				layout.classList.toggle(
					'nova-time-view-time',
					shouldShowPanel || panelPlacement !== 'replace'
				);
				layout.classList.toggle(
					'nova-time-view-calendar',
					panelPlacement === 'replace' &&
						(!shouldShowPanel || viewMode !== 'time')
				);
				if (panelPlacement === 'replace') {
					timePane.hidden = !shouldShowPanel;
					timePane.setAttribute(
						'aria-hidden',
						shouldShowPanel ? 'false' : 'true'
					);
					calendarPane.setAttribute(
						'aria-hidden',
						viewMode === 'time' ? 'true' : 'false'
					);
				} else {
					timePane.hidden = false;
					timePane.removeAttribute('aria-hidden');
					calendarPane.removeAttribute('aria-hidden');
				}

				if (!shouldShowPanel) {
					calendar.clearBlockCounterOverride?.();
					calendar.clearStatusMessageOverride?.();
					calendar.hideHoverTooltip?.(true);
					if (calendar.inline) {
						timePane.innerHTML = '';
						const placeholderWrapper = document.createElement('div');
						placeholderWrapper.className = 'nova-time-inline-placeholder';
						const labelText = resolveCalendarLabel();
						if (labelText) {
							const labelDiv = document.createElement('div');
							labelDiv.className = 'nova-time-inline-placeholder-label';
							labelDiv.textContent = labelText;
							placeholderWrapper.appendChild(labelDiv);
						}
						timePane.appendChild(placeholderWrapper);
					} else {
						timePane.innerHTML = '';
					}
					const state = getState(calendar);
					if (state) {
						state._timeApplyButton = null;
						state._updateTimeApplyButtonState = null;
						calendar._timePluginState = state;
					}
					requestReposition();
					return;
				}

				timePane.innerHTML = '';
				if (panelPlacement === 'replace') {
					const header = document.createElement('div');
					header.className = 'nova-time-panel-header';
					const backBtn = document.createElement('button');
					backBtn.type = 'button';
					backBtn.className = 'nova-time-back-btn';
					backBtn.textContent = backButtonLabel;
					backBtn.addEventListener('click', () => {
						const state = getState(calendar);
						state._panelView = 'calendar';
						calendar._timePluginState = state;
						calendar.renderCalendar();
						calendar.updateButtonLabel?.();
						calendar.updateHiddenInput?.();
						calendar.updateApplyActionState?.('calendar');
					});
					header.appendChild(backBtn);
					timePane.appendChild(header);
				}

				const timeBlockDiv = document.createElement('div');
				timeBlockDiv.className = 'nova-time-blocks';
				timePane.appendChild(timeBlockDiv);

				if (calendar.mode === 'multiple') {
					const selectedDateEntries = Array.isArray(calendar.selectedDates)
						? calendar.selectedDates
								.filter((value) => value instanceof Date)
								.map((date) => ({ date, key: getDateKey(date) }))
								.filter(({ key }) => Number.isFinite(key))
								.sort((a, b) => {
									if (a.key !== b.key) return a.key - b.key;
									return a.date - b.date;
								})
						: [];
					if (selectedDateEntries.length) {
						const datesToggle = document.createElement('div');
						datesToggle.className = 'nova-time-multiple-toggle';
						selectedDateEntries.forEach(({ date, key }) => {
							const btn = document.createElement('button');
							btn.type = 'button';
							btn.className = 'nova-time-multiple-toggle-btn';
							const dateKey = key;
							if (context.date && dateKey === getDateKey(context.date)) {
								btn.classList.add('active');
							}
							btn.textContent = formatDateForLabel(
								date,
								customDateLabelFormatter,
								{
									calendar,
									mode: calendar.mode,
									role: context.role,
									dateKey,
								}
							);
							btn.addEventListener('click', () => {
								const state = getState(calendar);
								state._activeMultipleDateKey = dateKey;
								state._lastDateClicked = cloneDate(date);
								if (multipleMode === MULTIPLE_MODE_DUAL) {
									if (
										state._activeMultipleRole !== 'start' &&
										state._activeMultipleRole !== 'end'
									) {
										state._activeMultipleRole = defaultMultipleRole;
									}
								} else {
									state._activeMultipleRole = null;
								}
								calendar._timePluginState = state;
								renderBlocks(false);
								calendar.updateButtonLabel?.();
								calendar.updateHiddenInput?.();
								calendar.updateApplyActionState?.('calendar');
								requestReposition();
							});
							datesToggle.appendChild(btn);
						});
						timeBlockDiv.appendChild(datesToggle);
						if (multipleMode === MULTIPLE_MODE_DUAL) {
							const roleToggle = document.createElement('div');
							roleToggle.className = 'nova-time-range-toggle';
							['start', 'end'].forEach((role) => {
								const btn = document.createElement('button');
								btn.type = 'button';
								btn.className = 'nova-time-range-toggle-btn';
								const label = multipleLabels[role] || role;
								if (context.role === role) btn.classList.add('active');
								if (!context.date) {
									btn.disabled = true;
									btn.classList.add('disabled');
									btn.textContent = label;
								} else {
									btn.textContent = label;
									btn.addEventListener('click', () => {
										const state = getState(calendar);
										state._activeMultipleRole = role;
										state._lastDateClicked = cloneDate(context.date);
										calendar._timePluginState = state;
										renderBlocks(false);
										calendar.updateButtonLabel?.();
										calendar.updateHiddenInput?.();
										calendar.updateApplyActionState?.('calendar');
									});
								}
								roleToggle.appendChild(btn);
							});
							timeBlockDiv.appendChild(roleToggle);
						}
					}
				}

				if (calendar.mode === 'range') {
					const toggle = document.createElement('div');
					toggle.className = 'nova-time-range-toggle';
					const startDate = cloneDate(calendar.startDate);
					const endDate = cloneDate(calendar.endDate);
					const activeRole = context.role;
					const addToggleButton = (role, date) => {
						const btn = document.createElement('button');
						btn.type = 'button';
						btn.className = 'nova-time-range-toggle-btn';
						const label = rangeLabels[role] || role;
						if (role === activeRole) btn.classList.add('active');
						if (!date) {
							btn.disabled = true;
							btn.classList.add('disabled');
							btn.textContent = label;
						} else {
							const formattedDate = formatDateForLabel(
								date,
								customDateLabelFormatter,
								{ calendar, mode: calendar.mode, role }
							);
							btn.textContent = label;
							btn.title = formattedDate;
							btn.setAttribute(
								'aria-label',
								`${label}${formattedDate ? ` – ${formattedDate}` : ''}`
							);
							btn.addEventListener('click', () => {
								const state = getState(calendar);
								state.activeRangeTarget = role;
								state._lastDateClicked = cloneDate(date);
								calendar._timePluginState = state;
								renderBlocks(false);
								calendar.updateButtonLabel?.();
								calendar.updateHiddenInput?.();
								calendar.updateApplyActionState?.('calendar');
							});
						}
						toggle.appendChild(btn);
					};
					addToggleButton('start', startDate);
					addToggleButton('end', endDate);
					timeBlockDiv.appendChild(toggle);
				}

				const dateHeading = document.createElement('div');
				dateHeading.className = 'nova-time-active-date';
				let headingText = '';
				if (calendar.inline) {
					const labelText = resolveCalendarLabel();
					const headingParts = [];
					if (context.label) headingParts.push(context.label);
					if (labelText) headingParts.push(labelText);
					headingText = headingParts.join(' · ');
				} else {
					const activeDateLabel = formatDateForLabel(
						activeDate,
						customDateLabelFormatter,
						{ calendar, mode: calendar.mode, role: context.role }
					);
					const headingParts = [];
					if (context.label) headingParts.push(context.label);
					if (activeDateLabel) headingParts.push(activeDateLabel);
					headingText = headingParts.join(' · ');
				}
				if (headingText) {
					dateHeading.textContent = headingText;
					timeBlockDiv.appendChild(dateHeading);
				}

				const listWrapper = document.createElement('div');
				listWrapper.className = 'nova-time-blocks-list';
				timeBlockDiv.appendChild(listWrapper);

				const actionConfig = calendar.applyActionConfig || {};
				const actionsState = getState(calendar);
				const displayApplyButton = shouldRenderApplyButton(calendar);
				const hasTimeClearProp = Object.prototype.hasOwnProperty.call(
					actionConfig,
					'timeClear'
				);
				const displayClearButton = !!(
					actionConfig &&
					actionConfig.time !== false &&
					((hasTimeClearProp && actionConfig.timeClear === true) ||
						(!hasTimeClearProp && actionConfig.clear === true))
				);
				const shouldRenderActions = displayApplyButton || displayClearButton;
				let actionsFooter = null;
				let updateTimeApplyButtonState = () => {};
				let updateTimeClearButtonState = () => {};
				if (shouldRenderActions) {
					actionsFooter = document.createElement('div');
					actionsFooter.className = 'nova-time-actions';
				}
				if (displayClearButton && actionsFooter) {
					const clearBtn = document.createElement('button');
					clearBtn.type = 'button';
					clearBtn.className = 'nova-time-clear-btn';
					clearBtn.textContent =
						calendar.getClearActionLabel?.() ||
						actionConfig.clearLabel ||
						'Effacer';
					const applyClearVisualState = (disabled) => {
						if (typeof calendar.setClearButtonVisualState === 'function') {
							calendar.setClearButtonVisualState(clearBtn, disabled);
						} else {
							clearBtn.disabled = false;
							if (disabled) {
								clearBtn.classList.add('is-disabled');
								clearBtn.setAttribute('aria-disabled', 'true');
							} else {
								clearBtn.classList.remove('is-disabled');
								clearBtn.removeAttribute('aria-disabled');
							}
						}
					};
					updateTimeClearButtonState = () => {
						const hasSelection =
							typeof calendar.hasCalendarSelection === 'function'
								? calendar.hasCalendarSelection()
								: false;
						applyClearVisualState(!hasSelection);
					};
					updateTimeClearButtonState();
					clearBtn.addEventListener('click', () => {
						if (
							typeof calendar.hasCalendarSelection === 'function' &&
							!calendar.hasCalendarSelection()
						) {
							return;
						}
						if (typeof calendar.handleClearAction === 'function') {
							calendar.handleClearAction({ source: 'time' });
						} else {
							calendar.resetSelection?.();
						}
						updateTimeApplyButtonState();
						updateTimeClearButtonState();
						requestReposition();
					});
					actionsFooter.appendChild(clearBtn);
					if (actionsState) {
						actionsState._timeClearButton = clearBtn;
						actionsState._updateTimeClearButtonState =
							updateTimeClearButtonState;
					}
				} else if (actionsState) {
					actionsState._timeClearButton = null;
				}
				if (displayApplyButton && actionsFooter) {
					const applyBtn = document.createElement('button');
					applyBtn.type = 'button';
					applyBtn.className = 'nova-time-apply-btn';
					applyBtn.textContent =
						calendar.getApplyActionLabel?.('time') || applyButtonLabel;
					updateTimeApplyButtonState = () => {
						const disabled = calendar.isApplyActionDisabled?.('time') === true;
						setApplyButtonVisualState(applyBtn, disabled);
					};
					updateTimeApplyButtonState();
					if (actionsState) {
						actionsState._timeApplyButton = applyBtn;
						actionsState._updateTimeApplyButtonState =
							updateTimeApplyButtonState;
					}
					applyBtn.addEventListener('click', () => {
						if (typeof calendar.handleApplyAction === 'function') {
							calendar.handleApplyAction({
								source: 'time',
								close: calendar.inline ? false : true,
							});
							updateTimeApplyButtonState();
							updateTimeClearButtonState();
							return;
						}
						calendar.updateHiddenInput?.();
						calendar.updateButtonLabel?.();
						const latestState = getState(calendar);
						const meetsMinimum = latestState.minBlocksMet !== false;
						const withinMaximum = latestState.maxBlocksReached !== true;
						const minDatesRequirement = Number(calendar.minMultipleDates) || 0;
						const selectedDatesCount = Array.isArray(calendar.selectedDates)
							? calendar.selectedDates.filter((value) => value instanceof Date)
									.length
							: 0;
						const meetsDateMinimum =
							calendar.mode !== 'multiple' ||
							minDatesRequirement <= 0 ||
							selectedDatesCount >= minDatesRequirement;
						if (!meetsMinimum || !withinMaximum || !meetsDateMinimum) {
							if (!meetsDateMinimum) {
								if (typeof calendar.notifyInvalidSelection === 'function') {
									calendar.notifyInvalidSelection('error');
								} else {
									calendar.triggerInvalidRangeFeedback?.();
								}
							}
							updateTimeApplyButtonState();
							updateTimeClearButtonState();
							return;
						}
						latestState._panelView = 'calendar';
						calendar._timePluginState = latestState;
						calendar.hideHoverTooltip?.(true);
						calendar.renderCalendar?.();
						calendar.updateButtonLabel?.();
						calendar.updateHiddenInput?.();
						if (!calendar.inline) calendar.hideCalendar?.();
						updateTimeApplyButtonState();
						updateTimeClearButtonState();
					});
					actionsFooter.appendChild(applyBtn);
				} else if (actionsState) {
					actionsState._timeApplyButton = null;
				}
				if (actionsState) {
					actionsState._updateTimeApplyButtonState = updateTimeApplyButtonState;
					actionsState._updateTimeClearButtonState = updateTimeClearButtonState;
					calendar._timePluginState = actionsState;
				}

				const intervalMinutes =
					Number.isFinite(options.interval) && options.interval > 0
						? Math.floor(options.interval)
						: 60;
				const fromMinutesRaw =
					typeof options.from === 'string' || typeof options.from === 'number'
						? parseTimeValue(options.from)
						: null;
				const toMinutesRaw =
					typeof options.to === 'string' || typeof options.to === 'number'
						? parseTimeValue(options.to)
						: null;
				let fromMinutes = fromMinutesRaw ?? parseTimeValue('08:00');
				let toMinutes = toMinutesRaw ?? parseTimeValue('16:00');
				if (toMinutes <= fromMinutes) {
					toMinutes = Math.min(24 * 60, fromMinutes + intervalMinutes);
				}
				const buildTimeFromMinutes = (minutes) =>
					new Date(0, 0, 0, Math.floor(minutes / 60), minutes % 60, 0, 0);
				let cur = buildTimeFromMinutes(fromMinutes);
				const end = buildTimeFromMinutes(toMinutes);
				const selectedBlocks = ensureBlockArray(selectedTimesMap[activeKey]);
				applyTimeBlockCounter(calendar, context, selectedBlocks);
				updateTimeStatusMessage(calendar, selectedBlocks.length, context);

				const pointerEventsSupported =
					typeof window !== 'undefined' && 'PointerEvent' in window;
				const resolvePointerType = (event) => {
					if (!event) return null;
					if (event.pointerType) return event.pointerType;
					if (typeof event.type === 'string') {
						if (event.type.startsWith('mouse') || event.type === 'mouseenter')
							return 'mouse';
						if (event.type.startsWith('touch')) return 'touch';
						if (event.type.startsWith('pen')) return 'pen';
					}
					return null;
				};
				const isTouchLikePointer = (type) => type === 'touch' || type === 'pen';
				const setPointerTypeFromEvent = (event) => {
					const pointerType = resolvePointerType(event);
					if (pointerType) calendar._lastPointerType = pointerType;
					return pointerType;
				};
				const clearHoverHideTimer = () => {
					if (calendar && calendar._hoverHideTimeout) {
						clearTimeout(calendar._hoverHideTimeout);
						calendar._hoverHideTimeout = null;
					}
				};
				const hideTooltipAfterInteraction = (event, pointerType) => {
					if (isTouchLikePointer(pointerType)) {
						if (
							event?.type === 'touchcancel' ||
							event?.type === 'pointercancel'
						) {
							calendar.hideHoverTooltip?.(true);
						}
						return;
					}
					calendar.hideHoverTooltip?.();
				};

				while (cur < end) {
					const next = new Date(cur.getTime() + intervalMinutes * 60000);
					if (next > end) break;
					const blockStartMinutes = cur.getHours() * 60 + cur.getMinutes();
					const blockEndMinutes = next.getHours() * 60 + next.getMinutes();
					const startLabel = minutesToLabel(blockStartMinutes);
					const endLabel = minutesToLabel(blockEndMinutes);
					const blockKey = `${startLabel} - ${endLabel}`;
					const isBlocked =
						typeof options.isTimeBlocked === 'function'
							? options.isTimeBlocked(blockKey, [activeDate])
							: isTimeSlotBlocked(
									disabledTimeRules,
									activeDate,
									blockStartMinutes,
									blockEndMinutes,
									startLabel
							  );
					const btn = document.createElement('button');
					btn.className = `nova-time-block nova-btn${
						isBlocked ? ' blocked' : ''
					}`;
					const displayLabel = formatBlockDisplayLabel(
						blockKey,
						context.role,
						showEndTimeInLabels
					);
					btn.textContent = displayLabel || blockKey;
					btn.dataset.blockKey = blockKey;
					btn.title = blockKey;
					btn.disabled = !!isBlocked;
					if (selectedBlocks.includes(blockKey)) btn.classList.add('selected');
					const buildTooltipParams = () => {
						const latestMap = getState(calendar).selectedTimes || {};
						const currentBlocks = ensureBlockArray(latestMap[activeKey]);
						return {
							date: activeDate,
							blockLabel: blockKey,
							displayBlockLabel: displayLabel || blockKey,
							targetEl: btn,
							isSelected: currentBlocks.includes(blockKey),
							blocksCount: currentBlocks.length,
							minBlocks,
							maxBlocks,
							rangeRole: context.role,
							rangeLabel: context.label,
						};
					};
					btn.onclick = () => {
						let blocks = ensureBlockArray(selectedTimesMap[activeKey]);
						const exists = blocks.indexOf(blockKey);
						if (exists === -1) {
							if (maxBlocks > 0 && blocks.length >= maxBlocks) {
								if (maxBlocks === 1) {
									blocks = [blockKey];
								} else {
									if (typeof calendar.notifyInvalidSelection === 'function')
										calendar.notifyInvalidSelection('error');
									else calendar.triggerInvalidRangeFeedback?.();
									calendar.setStatusMessageOverride?.({
										type: 'error',
										text: `Maximum de ${maxBlocks} blocs atteint.`,
										autoHideDelay: 5000,
									});
									return;
								}
							} else {
								blocks.push(blockKey);
							}
						} else {
							blocks.splice(exists, 1);
						}
						blocks = blocks.sort();
						if (blocks.length) selectedTimesMap[activeKey] = blocks;
						else delete selectedTimesMap[activeKey];
						const nextMap = { ...selectedTimesMap };
						const state = getState(calendar);
						state.selectedTimes = nextMap;
						state._lastDateClicked = cloneDate(activeDate);
						if (calendar.mode === 'range' && context.role)
							state.activeRangeTarget = context.role;
						if (calendar.mode === 'multiple') {
							state._activeMultipleDateKey = getDateKey(activeDate);
							if (multipleMode === MULTIPLE_MODE_DUAL && context.role)
								state._activeMultipleRole = context.role;
						}
						calendar._timePluginState = state;
						const selectionSet = new Set(nextMap[activeKey] || []);
						listWrapper
							.querySelectorAll('.nova-time-block')
							.forEach((blockBtn) => {
								const originalKey = blockBtn.dataset.blockKey || '';
								if (selectionSet.has(originalKey))
									blockBtn.classList.add('selected');
								else blockBtn.classList.remove('selected');
							});
						if (calendar.mode === 'single') {
							calendar.selectedDate = cloneDate(activeDate);
							calendar.selectedDates = [cloneDate(activeDate)].filter(Boolean);
						}
						calendar.updateButtonLabel?.();
						calendar.updateHiddenInput?.();
						calendar.updateApplyActionState?.('calendar');
						updateTimeApplyButtonState();
						updateTimeClearButtonState();
						calendar.updateDayClasses?.();
						applyTimeBlockCounter(calendar, context, blocks);
						updateTimeStatusMessage(calendar, blocks.length, context);
						if (
							panelPlacement === 'replace' &&
							shouldAutoReturnAfterSelection(calendar) &&
							exists === -1 &&
							blocks.length >= Math.max(1, minBlocks)
						) {
							const minDatesRequirement =
								Number(calendar.minMultipleDates) || 0;
							const selectedDatesCount = Array.isArray(calendar.selectedDates)
								? calendar.selectedDates.filter(
										(value) => value instanceof Date
								  ).length
								: 0;
							const meetsMinDates =
								calendar.mode !== 'multiple' ||
								minDatesRequirement <= 0 ||
								selectedDatesCount >= minDatesRequirement;
							if (!meetsMinDates) return;
							setTimeout(() => {
								const latestState = getState(calendar);
								latestState._panelView = 'calendar';
								calendar._timePluginState = latestState;
								calendar.hideHoverTooltip?.(true);
								calendar.renderCalendar?.();
								calendar.updateButtonLabel?.();
								calendar.updateHiddenInput?.();
								if (!calendar.inline) calendar.hideCalendar?.();
								updateTimeApplyButtonState();
								updateTimeClearButtonState();
							}, 120);
						}
						if (typeof calendar.showTimeBlockTooltip === 'function') {
							const pointerTypeAfterClick =
								calendar._lastPointerType || 'mouse';
							clearHoverHideTimer();
							if (
								isTouchLikePointer(pointerTypeAfterClick) ||
								btn.matches(':hover')
							) {
								calendar.showTimeBlockTooltip(buildTooltipParams());
							}
						}
					};
					const showTooltip = () => {
						if (typeof calendar.showTimeBlockTooltip === 'function') {
							calendar.showTimeBlockTooltip(buildTooltipParams());
						}
					};
					const handleHoverStart = (event) => {
						setPointerTypeFromEvent(event);
						clearHoverHideTimer();
						showTooltip();
					};
					const handleHoverMove = (event) => {
						setPointerTypeFromEvent(event);
						showTooltip();
					};
					const handleHoverEnd = (event) => {
						const pointerType =
							setPointerTypeFromEvent(event) ||
							calendar._lastPointerType ||
							'mouse';
						hideTooltipAfterInteraction(event, pointerType);
					};
					const handlePointerUp = (event) => {
						const pointerType =
							setPointerTypeFromEvent(event) || calendar._lastPointerType;
						if (!pointerType) return;
						if (isTouchLikePointer(pointerType)) {
							return;
						}
						hideTooltipAfterInteraction(event, pointerType);
					};
					if (pointerEventsSupported) {
						btn.addEventListener('pointerdown', (event) => {
							event.stopPropagation();
							const pointerType = setPointerTypeFromEvent(event);
							if (isTouchLikePointer(pointerType)) {
								handleHoverStart(event);
							}
						});
						btn.addEventListener('pointerenter', handleHoverStart);
						btn.addEventListener('pointermove', handleHoverMove);
						btn.addEventListener('pointerleave', handleHoverEnd);
						btn.addEventListener('pointercancel', handleHoverEnd);
						btn.addEventListener('pointerup', handlePointerUp);
					} else {
						btn.addEventListener('touchstart', (event) => {
							event.stopPropagation();
							handleHoverStart(event);
						});
						btn.addEventListener('touchmove', handleHoverMove);
						btn.addEventListener('touchend', (event) => {
							handleHoverEnd(event);
							event.stopPropagation();
						});
						btn.addEventListener('touchcancel', handleHoverEnd);
						btn.addEventListener('mouseenter', handleHoverStart);
						btn.addEventListener('mousemove', handleHoverMove);
						btn.addEventListener('mouseleave', handleHoverEnd);
					}
					listWrapper.appendChild(btn);
					cur = next;
				}
				if (actionsFooter) {
					timeBlockDiv.appendChild(actionsFooter);
				}
			};

			renderState._renderBlocks = renderBlocks;
			calendar._timePluginState = renderState;
			renderBlocks(true);
		},
		onSelectionCleared(calendar) {
			const state = getState(calendar);
			state.selectedTimes = {};
			state.minBlocksMet = minBlocks === 0;
			state.maxBlocksReached = false;
			state._timeApplyButton = null;
			state._updateTimeApplyButtonState = null;
			state._timeClearButton = null;
			state._updateTimeClearButtonState = null;
			state._renderBlocks = null;
			state._lastDateClicked = null;
			if (calendar.mode === 'range') {
				state.activeRangeTarget = defaultRangeFocus;
			}
			if (calendar.mode === 'multiple') {
				state._activeMultipleDateKey = null;
				state._activeMultipleRole =
					multipleMode === MULTIPLE_MODE_DUAL ? defaultMultipleRole : null;
			}
			if (panelPlacement === 'replace') {
				state._panelView = 'calendar';
			}
			calendar._timePluginState = state;
			calendar.clearBlockCounterOverride?.();
			calendar.clearStatusMessageOverride?.();
			calendar.hideHoverTooltip?.(true);
		},
		isApplyActionDisabled(calendar, target) {
			if (target !== 'calendar' && target !== 'time') return false;
			const state = getState(calendar);
			if (!state) return false;
			if (state.minBlocksMet === false) return true;
			if (state.maxBlocksReached === true) return true;
			if (target === 'time' && calendar.mode === 'multiple') {
				const minDatesRequirement = Number(calendar.minMultipleDates) || 0;
				if (minDatesRequirement > 0) {
					const selectedDatesCount = Array.isArray(calendar.selectedDates)
						? calendar.selectedDates.filter((value) => value instanceof Date)
								.length
						: 0;
					if (selectedDatesCount < minDatesRequirement) return true;
				}
			}
			return false;
		},
		onBeforeApplyAction(calendar, source) {
			const state = getState(calendar);
			if (!state) return true;
			const meetsMinBlocks = state.minBlocksMet !== false;
			const withinMaximum = state.maxBlocksReached !== true;
			const minDatesRequirement = Number(calendar.minMultipleDates) || 0;
			const selectedDatesCount = Array.isArray(calendar.selectedDates)
				? calendar.selectedDates.filter((value) => value instanceof Date).length
				: 0;
			const meetsDateMinimum =
				calendar.mode !== 'multiple' ||
				minDatesRequirement <= 0 ||
				selectedDatesCount >= minDatesRequirement;
			if (!meetsMinBlocks || !withinMaximum || !meetsDateMinimum) {
				if (!meetsDateMinimum) {
					if (typeof calendar.notifyInvalidSelection === 'function') {
						calendar.notifyInvalidSelection('error');
					} else {
						calendar.triggerInvalidRangeFeedback?.();
					}
				} else if (!meetsMinBlocks) {
					calendar.triggerInvalidRangeFeedback?.();
				}
				const rejectionMessage = buildApplyRejectionMessage(calendar);
				if (
					rejectionMessage &&
					typeof calendar.setStatusMessageOverride === 'function'
				) {
					calendar.setStatusMessageOverride({
						type: 'error',
						text: rejectionMessage,
						autoHideDelay: 5000,
					});
				}
				calendar.updateApplyActionState?.('calendar');
				return false;
			}
			return true;
		},
		onApplyAction(calendar) {
			const state = getState(calendar);
			if (!state) return;
			if (panelPlacement === 'replace') {
				state._panelView = 'calendar';
				calendar._timePluginState = state;
				calendar.hideHoverTooltip?.(true);
				calendar.renderCalendar?.();
			} else {
				calendar._timePluginState = state;
				calendar.updateButtonLabel?.();
				calendar.updateHiddenInput?.();
			}
			calendar.updateApplyActionState?.('calendar');
		},
		onApplyActionRejected(calendar, target) {
			if (target !== 'time') return;
			const message = buildApplyRejectionMessage(calendar);
			if (message && typeof calendar.setStatusMessageOverride === 'function') {
				calendar.setStatusMessageOverride({
					type: 'error',
					text: message,
					autoHideDelay: 5000,
				});
			}
			const state = getState(calendar);
			if (state) {
				if (typeof state._updateTimeApplyButtonState === 'function') {
					state._updateTimeApplyButtonState();
				} else if (state._timeApplyButton instanceof HTMLButtonElement) {
					const disabled = calendar.isApplyActionDisabled?.('time') === true;
					setApplyButtonVisualState(state._timeApplyButton, disabled);
				}
				if (typeof state._updateTimeClearButtonState === 'function') {
					try {
						state._updateTimeClearButtonState();
					} catch (error) {
						/* ignore clear state errors */
					}
				} else if (state._timeClearButton instanceof HTMLButtonElement) {
					const hasSelection =
						typeof calendar.hasCalendarSelection === 'function'
							? calendar.hasCalendarSelection()
							: false;
					if (typeof calendar.setClearButtonVisualState === 'function') {
						calendar.setClearButtonVisualState(
							state._timeClearButton,
							!hasSelection
						);
					} else {
						state._timeClearButton.disabled = false;
						if (!hasSelection) {
							state._timeClearButton.classList.add('is-disabled');
							state._timeClearButton.setAttribute('aria-disabled', 'true');
						} else {
							state._timeClearButton.classList.remove('is-disabled');
							state._timeClearButton.removeAttribute('aria-disabled');
						}
					}
				}
				calendar._timePluginState = state;
			}
		},
	};
}
