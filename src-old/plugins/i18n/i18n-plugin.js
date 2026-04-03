const FALLBACK_LOCALE = 'fr-FR';

const normalizeWeekdayOption = (value) => {
	if (value === null || value === undefined) return null;
	const number = Number(value);
	if (!Number.isFinite(number)) return null;
	const normalized = Math.round(number) % 7;
	return normalized < 0 ? normalized + 7 : normalized;
};

const sanitizeKey = (value) =>
	typeof value === 'string' && value.trim() ? value.trim() : null;

const normalizeA11yPayload = (payload) => {
	if (!payload || typeof payload !== 'object') return null;
	const normalized = {};
	Object.entries(payload).forEach(([key, value]) => {
		if (!key) return;
		if (
			value === undefined ||
			value === null ||
			(typeof value !== 'string' &&
				typeof value !== 'number' &&
				typeof value !== 'function')
		)
			return;
		normalized[key] = value;
	});
	return Object.keys(normalized).length ? normalized : null;
};

const normalizeLocaleEntry = (key, source) => {
	if (source === null || source === undefined) return null;
	if (typeof source === 'string') {
		return normalizeLocaleEntry(key, { locale: source });
	}
	if (typeof source !== 'object') return null;
	const entry = {};
	const normalizedKey = sanitizeKey(source.key || key);
	if (normalizedKey) entry.key = normalizedKey;
	const localeCode =
		sanitizeKey(source.locale || source.code || source.id) ||
		(null);
	if (localeCode) entry.locale = localeCode;
	const weekStartValue =
		source.weekStartsOn ??
		source.weekStart ??
		source.firstDayOfWeek ??
		source.firstDay ??
		source.debutSemaine;
	const normalizedWeekStart = normalizeWeekdayOption(weekStartValue);
	if (normalizedWeekStart !== null) entry.weekStartsOn = normalizedWeekStart;
	if (typeof source.placeholder === 'string') {
		const trimmed = source.placeholder.trim();
		if (trimmed) entry.placeholder = trimmed;
	}
	const a11yPayload =
		source.a11y && typeof source.a11y === 'object'
			? source.a11y
			: source.translations && typeof source.translations === 'object'
			? source.translations
			: null;
	const normalizedA11y = normalizeA11yPayload(a11yPayload);
	if (normalizedA11y) entry.a11y = normalizedA11y;
	if (typeof source.format === 'function') entry.format = source.format;
	if (typeof source.formatDisplay === 'function') {
		entry.formatDisplay = source.formatDisplay;
	}
	if (!entry.key && entry.locale) entry.key = entry.locale;
	if (!entry.key && normalizedKey) entry.key = normalizedKey;
	return Object.keys(entry).length ? entry : null;
};

const normalizeLocales = (raw) => {
	if (!raw || typeof raw !== 'object') return null;
	const entries = {};
	Object.entries(raw).forEach(([key, value]) => {
		const entry = normalizeLocaleEntry(key, value);
		if (entry) entries[entry.key || key] = entry;
	});
	const keys = Object.keys(entries);
	return keys.length ? entries : null;
};

const hasLocaleFields = (source) => {
	if (!source || typeof source !== 'object') return false;
	return (
		typeof source.locale === 'string' ||
		source.weekStartsOn !== undefined ||
		source.weekStart !== undefined ||
		source.firstDayOfWeek !== undefined ||
		typeof source.placeholder === 'string' ||
		(typeof source.a11y === 'object' && source.a11y !== null) ||
		(typeof source.translations === 'object' && source.translations !== null) ||
		typeof source.format === 'function' ||
		typeof source.formatDisplay === 'function'
	);
};

const cloneEntry = (entry) => {
	if (!entry) return null;
	const clone = { ...entry };
	if (entry.a11y) clone.a11y = { ...entry.a11y };
	return clone;
};

const normalizeConfig = (raw = {}) => {
	const locales = normalizeLocales(raw.locales);
	const config = {
		locales,
		initialLocale: sanitizeKey(
			raw.initialLocale || raw.defaultLocale || raw.locale || null
		),
		fallbackLocale: sanitizeKey(raw.fallbackLocale || raw.locale || null),
		singleEntry: null,
		sharedFormat: typeof raw.format === 'function' ? raw.format : null,
		sharedFormatDisplay:
			typeof raw.formatDisplay === 'function' ? raw.formatDisplay : null,
		sharedPlaceholder:
			typeof raw.placeholder === 'string' && raw.placeholder.trim()
				? raw.placeholder.trim()
				: null,
		onLocaleChange:
			typeof raw.onLocaleChange === 'function' ? raw.onLocaleChange : null,
	};
	if (!config.initialLocale && config.fallbackLocale) {
		config.initialLocale = config.fallbackLocale;
	}
	if (!config.fallbackLocale && config.initialLocale) {
		config.fallbackLocale = config.initialLocale;
	}
	if (!locales && hasLocaleFields(raw)) {
		config.singleEntry = normalizeLocaleEntry(
			config.initialLocale || raw.locale || 'default',
			raw
		);
		if (config.singleEntry) {
			if (!config.initialLocale)
				config.initialLocale = config.singleEntry.key || config.singleEntry.locale;
			if (!config.fallbackLocale)
				config.fallbackLocale =
					config.singleEntry.key || config.singleEntry.locale;
		}
	}
	if (locales && !config.initialLocale) {
		config.initialLocale = Object.keys(locales)[0] || null;
	}
	if (locales && !config.fallbackLocale) {
		config.fallbackLocale = config.initialLocale;
	}
	return config;
};

const resolveLocaleEntry = (config, target, allowFallback = true) => {
	if (!config) return null;
	const locales = config.locales || {};
	const attemptFromLocales = (keyValue) => {
		const key = sanitizeKey(keyValue);
		if (!key) return null;
		if (locales[key]) return cloneEntry({ ...locales[key], key });
		const match = Object.entries(locales).find(([, entry]) => {
			if (!entry) return false;
			if (entry.key && entry.key === key) return true;
			return entry.locale === key;
		});
		if (match) {
			return cloneEntry({ ...match[1], key: match[0] });
		}
		return null;
	};

	if (target && typeof target === 'object' && !Array.isArray(target)) {
		return normalizeLocaleEntry(target.key || null, target);
	}

	let resolved = attemptFromLocales(target);
	if (!resolved && !target) {
		resolved = attemptFromLocales(config.initialLocale);
	}
	if (!resolved && allowFallback) {
		resolved = attemptFromLocales(config.fallbackLocale);
	}
	if (!resolved && config.singleEntry) {
		resolved = cloneEntry(config.singleEntry);
	}
	if (!resolved && allowFallback && locales) {
		const firstKey = Object.keys(locales)[0];
		if (firstKey) resolved = cloneEntry({ ...locales[firstKey], key: firstKey });
	}
	return resolved;
};

const hasSelection = (calendar) => {
	if (!calendar) return false;
	if (calendar.mode === 'single') return !!calendar.selectedDate;
	if (calendar.mode === 'range')
		return !!calendar.startDate || !!calendar.endDate;
	if (calendar.mode === 'multiple')
		return Array.isArray(calendar.selectedDates)
			? calendar.selectedDates.length > 0
			: false;
	return false;
};

const createFormatContext = (calendar, entry, key) => ({
	calendar,
	locale:
		typeof calendar?.getResolvedLocale === 'function'
			? calendar.getResolvedLocale()
			: entry?.locale || FALLBACK_LOCALE,
	entry,
	key: key || entry?.key || null,
	mode: calendar?.mode ?? null,
});

const defaultFormatDisplay = (date, calendar) => {
	if (!date) return '';
	const locale =
		typeof calendar?.getResolvedLocale === 'function'
			? calendar.getResolvedLocale()
			: FALLBACK_LOCALE;
	try {
		return date.toLocaleDateString(locale || undefined, {
			day: '2-digit',
			month: 'short',
		});
	} catch (error) {
		return date.toLocaleDateString(FALLBACK_LOCALE, {
			day: '2-digit',
			month: 'short',
		});
	}
};

export function i18nPlugin(options = {}) {
	const config = normalizeConfig(options);
	return {
		name: 'i18n',
		options: config,
		_currentLocaleKey: null,
		_currentEntry: null,
		_calendar: null,
		_basePlaceholder: '',
		_baseA11y: null,
		_defaultFormat: null,
		_defaultFormatDisplay: null,
		onInit(calendar) {
			this._calendar = calendar;
			this._basePlaceholder = calendar.options?.placeholder || '';
			this._baseA11y = { ...(calendar.a11y || {}) };
			this._defaultFormat =
				typeof calendar.options?.format === 'function'
					? calendar.options.format
					: null;
			this._defaultFormatDisplay =
				typeof calendar.formatDisplay === 'function'
					? calendar.formatDisplay
					: null;
			const initialTarget =
				config.initialLocale ||
				config.fallbackLocale ||
				config.singleEntry?.key ||
				config.singleEntry?.locale ||
				null;
			this.applyLocale(calendar, initialTarget, {
				suppressRender: true,
				allowFallback: true,
			});
		},
		onDestroy() {
			if (!this._calendar) return;
			if (this._basePlaceholder !== undefined) {
				this._calendar.options.placeholder = this._basePlaceholder;
			}
			if (this._baseA11y) {
				this._calendar.a11y = { ...this._baseA11y };
			}
			if (this._defaultFormat) {
				this._calendar.options.format = this._defaultFormat;
			}
			if (this._defaultFormatDisplay) {
				this._calendar.formatDisplay = this._defaultFormatDisplay;
			}
		},
		setLocale(target, opts = {}) {
			const calendar = opts.calendar || this._calendar;
			return this.applyLocale(calendar, target, opts);
		},
		getActiveLocale() {
			return this._currentEntry ? { ...this._currentEntry } : null;
		},
		getAvailableLocales() {
			if (config.locales) {
				return Object.keys(config.locales);
			}
			if (config.singleEntry) {
				const key = config.singleEntry.key || config.singleEntry.locale;
				return key ? [key] : [];
			}
			return [];
		},
		applyLocale(calendar, target, opts = {}) {
			if (!calendar) return null;
			const entry = resolveLocaleEntry(
				config,
				target,
				opts.allowFallback !== false
			);
			if (!entry) return null;
			this._currentEntry = entry;
			this._currentLocaleKey = entry.key || entry.locale || null;
			this.applyLocaleEntry(calendar, entry, opts);
			if (typeof config.onLocaleChange === 'function') {
				try {
					config.onLocaleChange(entry, calendar);
				} catch (error) {
					/* ignore listener errors */
				}
			}
			return this._currentLocaleKey;
		},
		applyLocaleEntry(calendar, entry, opts = {}) {
			if (entry.locale) {
				calendar.setLocale(entry.locale, { reRender: false });
			}
			if (typeof entry.weekStartsOn === 'number') {
				calendar.setWeekStartsOn(entry.weekStartsOn, { reRender: false });
			}
			this.applyPlaceholder(calendar, entry.placeholder);
			this.applyFormatters(calendar, entry);
			this.applyA11y(calendar, entry);
			if (!opts.suppressRender && calendar._initialized) {
				calendar.renderCalendar();
				calendar.updateDayClasses();
			}
		},
		applyPlaceholder(calendar, placeholder) {
			let text = null;
			if (typeof placeholder === 'string' && placeholder.trim()) {
				text = placeholder.trim();
			} else if (config.sharedPlaceholder) {
				text = config.sharedPlaceholder;
			} else if (this._basePlaceholder) {
				text = this._basePlaceholder;
			}
			if (!text) return;
			calendar.options.placeholder = text;
			calendar._initialLabelValue = text;
			if (!calendar._initialized) return;
			if (hasSelection(calendar)) return;
			const labelEl = calendar.getLabelElement?.();
			if (labelEl) labelEl.textContent = text;
		},
		applyFormatters(calendar, entry) {
			const contextFactory = () =>
				createFormatContext(calendar, entry, this._currentLocaleKey);
			const formatCallback =
				entry.format ||
				config.sharedFormat ||
				this._defaultFormat ||
				((start, end) => {
					if (start && end) return `${start} – ${end}`;
					if (start) return start;
					return '';
				});
			calendar.options.format = (start, end) =>
				formatCallback(start, end, contextFactory());

			const displayCallback =
				entry.formatDisplay ||
				config.sharedFormatDisplay ||
				((date) => defaultFormatDisplay(date, calendar));
			calendar.formatDisplay = (date) =>
				displayCallback(date, contextFactory());
		},
		applyA11y(calendar, entry) {
			const base = this._baseA11y ? { ...this._baseA11y } : {};
			if (entry.a11y) {
				calendar.a11y = { ...base, ...entry.a11y };
			} else {
				calendar.a11y = base;
			}
		},
	};
}
