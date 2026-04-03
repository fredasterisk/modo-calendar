// src/plugins/lock/lock-plugin.js
// Plugin to handle blocked dates, no-range-start, and no-range-end for NovaCalendar
import pluginStyles from './styles.css?raw';
function injectCSS(shadowRoot) {
	if (!shadowRoot) return;
	if (shadowRoot.getElementById('lock-plugin-css')) return;
	const style = document.createElement('style');
	style.id = 'lock-plugin-css';
	style.textContent = pluginStyles;
	shadowRoot.appendChild(style);
}

function normalizeDateInputs(values) {
	if (values == null) return [];
	const array = Array.isArray(values)
		? values
		: typeof values === 'string'
		? [values]
		: values && typeof values[Symbol.iterator] === 'function'
		? Array.from(values)
		: [values];
	return array
		.map((value) => getUTCMidnightTimestamp(value))
		.filter((value) => typeof value === 'number' && Number.isFinite(value));
}

const LOCK_PROPS = ['blockedDates', 'noRangeStartDates', 'noRangeEndDates'];

function applyLockDates(calendar, prop, values, options = {}) {
	const normalized = normalizeDateInputs(values);
	calendar[prop] = normalized;
	calendar[`${prop}Set`] = new Set(normalized);
	if (options.skipRefresh) return normalized;
	if (options.render && typeof calendar.renderCalendar === 'function') {
		calendar.renderCalendar();
	}
	calendar.updateDayClasses?.();
	return normalized;
}

function updateLockDatesFromSource(calendar, prop, source, options = {}) {
	const { render = false, skipRefresh = false } = options;
	const apply = (input) =>
		applyLockDates(calendar, prop, input, { render, skipRefresh });
	let value = source;
	if (typeof value === 'function') {
		try {
			value = value.call(calendar, calendar);
		} catch (error) {
			console.error(
				`NovaCalendar lockPlugin: impossible d'évaluer "${prop}" via fonction.`,
				error
			);
			return apply([]);
		}
	}
	if (value && typeof value.then === 'function') {
		const pendingMap =
			calendar._lockPendingTokens || (calendar._lockPendingTokens = {});
		const token = Symbol(prop);
		pendingMap[prop] = token;
		value
			.then((resolved) => {
				if (pendingMap[prop] !== token) return;
				apply(resolved);
			})
			.catch((error) => {
				if (pendingMap[prop] !== token) return;
				console.error(
					`NovaCalendar lockPlugin: promesse rejetée pour "${prop}".`,
					error
				);
				apply([]);
			});
		return;
	}
	apply(value);
}

function getLockSet(calendar, prop) {
	return calendar[`${prop}Set`] || new Set(calendar[prop] || []);
}

function walkLocalMidnightRange(fromDate, toDate, iteratee) {
	if (!fromDate || !toDate) return;
	const dir = fromDate < toDate ? 1 : -1;
	const cursor = new Date(fromDate);
	while ((dir > 0 && cursor <= toDate) || (dir < 0 && cursor >= toDate)) {
		const timestamp = getUTCMidnightTimestamp(cursor);
		if (iteratee(timestamp, cursor) === true) break;
		cursor.setDate(cursor.getDate() + dir);
	}
}

function walkUTCMidnightRange(fromDate, toDate, iteratee) {
	if (!fromDate || !toDate) return;
	const dir = fromDate < toDate ? 1 : -1;
	const cursor = new Date(
		Date.UTC(
			fromDate.getUTCFullYear(),
			fromDate.getUTCMonth(),
			fromDate.getUTCDate()
		)
	);
	const target = Date.UTC(
		toDate.getUTCFullYear(),
		toDate.getUTCMonth(),
		toDate.getUTCDate()
	);
	while (
		(dir > 0 && cursor.getTime() <= target) ||
		(dir < 0 && cursor.getTime() >= target)
	) {
		const timestamp = getUTCMidnightTimestamp(cursor);
		if (iteratee(timestamp, cursor) === true) break;
		cursor.setUTCDate(cursor.getUTCDate() + dir);
	}
}

function rangeContainsBlockedDate(fromDate, toDate, blockedSet) {
	if (!fromDate || !toDate || !(blockedSet && blockedSet.size)) return false;
	const fromStamp = getUTCMidnightTimestamp(fromDate);
	const toStamp = getUTCMidnightTimestamp(toDate);
	let touched = false;
	walkUTCMidnightRange(fromDate, toDate, (stamp) => {
		if (stamp === fromStamp || stamp === toStamp) return;
		if (blockedSet.has(stamp)) {
			touched = true;
			return true;
		}
	});
	return touched;
}

function notifyRangeError(calendar, text) {
	if (!text) return;
	if (typeof calendar.setStatusMessage === 'function') {
		calendar.setStatusMessage({
			type: 'error',
			text,
			autoHideDelay: 5000,
		});
	}
	if (typeof calendar.notifyInvalidSelection === 'function') {
		calendar.notifyInvalidSelection('error');
	} else {
		calendar.triggerInvalidRangeFeedback?.();
	}
}

export function lockPlugin(options = {}) {
	return {
		name: 'lock',
		options,
		onShadowReady(calendarInstance) {
			injectCSS(calendarInstance.shadowRoot);
		},
		onInit(calendar) {
			const createLockSetter = (prop) => (dates) => {
				updateLockDatesFromSource(calendar, prop, dates, { render: true });
			};
			calendar.setBlockedDates = createLockSetter('blockedDates');
			calendar.setNoRangeStartDates = createLockSetter('noRangeStartDates');
			calendar.setNoRangeEndDates = createLockSetter('noRangeEndDates');

			// Override updateDayClasses to add lock classes and handle hover
			const originalUpdateDayClasses =
				calendar.updateDayClasses?.bind(calendar) || (() => {});
			calendar.updateDayClasses = function () {
				let fromDate = this.startDate;
				let toDate =
					this.endDate ||
					(this.startDate && this.hoverDate ? this.hoverDate : null);
				const blocked = getLockSet(this, 'blockedDates');
				const noStart = getLockSet(this, 'noRangeStartDates');
				const noEnd = getLockSet(this, 'noRangeEndDates');
				originalUpdateDayClasses();
				if (!this.dayElements) return;
				// Remove denied classes
				this.dayElements.forEach(({ el }) => el.classList.remove('denied'));
				// Limit hover range to not exceed a blocked date
				if (
					this.mode === 'range' &&
					fromDate &&
					this.hoverDate &&
					!this.endDate
				) {
					const fromStamp = getUTCMidnightTimestamp(fromDate);
					let hoverLimit = this.hoverDate;
					const dir = fromDate < hoverLimit ? 1 : -1;
					walkLocalMidnightRange(fromDate, hoverLimit, (stamp, cursor) => {
						if (stamp === fromStamp) return;
						if (blocked.has(stamp)) {
							hoverLimit = new Date(cursor);
							hoverLimit.setDate(hoverLimit.getDate() - dir);
							return true;
						}
					});
					toDate = hoverLimit;
				}
				this.dayElements.forEach(({ el, date }) => {
					const stamp = getUTCMidnightTimestamp(date);
					el.classList.toggle('blocked', blocked.has(stamp));
					el.classList.toggle('no-range-start', noStart.has(stamp));
					el.classList.toggle('no-range-end', noEnd.has(stamp));
				});
				// Add denied class for denied hover
				if (this.mode === 'range' && fromDate && toDate && !this.endDate) {
					const fromTime = getUTCMidnightTimestamp(fromDate),
						toTime = getUTCMidnightTimestamp(toDate),
						minTime = Math.min(fromTime, toTime),
						maxTime = Math.max(fromTime, toTime);
					const denied = rangeContainsBlockedDate(fromDate, toDate, blocked);
					if (denied) {
						this.dayElements.forEach(({ el, date }) => {
							const stamp = getUTCMidnightTimestamp(date);
							if (stamp >= minTime && stamp <= maxTime && !blocked.has(stamp)) {
								el.classList.add('denied');
								el.style.animation = 'none';
								el.offsetHeight;
								el.style.animation = null;
							}
						});
					}
				}
			};

			// Override selectDate to prevent selection on locked days
			const originalSelectDate = calendar.selectDate?.bind(calendar);
			calendar.selectDate = function (selected, monthIndex, meta) {
				const dateStamp = getUTCMidnightTimestamp(selected);
				const blocked = getLockSet(this, 'blockedDates');
				const noStart = getLockSet(this, 'noRangeStartDates');
				const noEnd = getLockSet(this, 'noRangeEndDates');

				// Range selection start
				if (
					this.mode === 'range' &&
					(!this.startDate || (this.startDate && this.endDate))
				) {
					if (noStart.has(dateStamp)) {
						notifyRangeError(this, 'Aucun départ cette journée.');
						return;
					}
				}

				// Range selection end
				if (this.mode === 'range' && this.startDate && !this.endDate) {
					const startStamp = getUTCMidnightTimestamp(this.startDate);
					if (noEnd.has(dateStamp)) {
						notifyRangeError(this, 'Aucune arrivée cette journée.');
						return;
					}
					if (
						(noStart.has(startStamp) && noEnd.has(dateStamp)) ||
						(noEnd.has(startStamp) && noStart.has(dateStamp))
					) {
						notifyRangeError(this, 'Sélection impossible pour ces dates.');
						return;
					}
					// Prevent reverse selection ending on no-range-start
					if (noStart.has(dateStamp) && dateStamp < startStamp) {
						notifyRangeError(this, 'Aucun départ cette journée.');
						return;
					}
					if (rangeContainsBlockedDate(this.startDate, selected, blocked)) {
						notifyRangeError(this, 'Le range inclut une date bloquée.');
						return;
					}
				}

				return originalSelectDate(selected, monthIndex, meta);
			};

			// Store initial options for later (DOM not ready)
			const opts =
				calendar.options.plugins?.find((p) => p && p.name === 'lock')
					?.options || {};
			calendar._lockInitOptions = opts;
			LOCK_PROPS.forEach((prop) =>
				applyLockDates(calendar, prop, [], { skipRefresh: true })
			);
		},
		onRender(calendar) {
			// Apply lock options on first render if needed
			if (calendar._lockInitOptions) {
				const opts = calendar._lockInitOptions;
				if (opts.blockedDates)
					updateLockDatesFromSource(
						calendar,
						'blockedDates',
						opts.blockedDates
					);
				if (opts.noRangeStartDates)
					updateLockDatesFromSource(
						calendar,
						'noRangeStartDates',
						opts.noRangeStartDates
					);
				if (opts.noRangeEndDates)
					updateLockDatesFromSource(
						calendar,
						'noRangeEndDates',
						opts.noRangeEndDates
					);
				delete calendar._lockInitOptions;
				calendar.updateDayClasses?.();
				return;
			}
			calendar.updateDayClasses?.();
		},
	};
}

// Returns local-midnight timestamp for a date, timestamp, or string
function getUTCMidnightTimestamp(d) {
	let date;
	if (typeof d === 'number') {
		date = new Date(d);
	} else if (d instanceof Date) {
		date = new Date(d.getTime());
	} else if (typeof d === 'string') {
		const parts = d.split('-').map(Number);
		if (parts.length === 3 && parts.every((value) => Number.isFinite(value))) {
			const [y, m, day] = parts;
			date = new Date(y, m - 1, day);
		}
	}
	if (!date || Number.isNaN(date.getTime())) return NaN;
	return new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate()
	).getTime();
}

// Parses YMD string as UTC date
lockPlugin.parseYMD = function (str) {
	const [y, m, d] = str.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d));
};
