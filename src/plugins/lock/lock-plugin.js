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

export function lockPlugin(options = {}) {
	return {
		name: 'lock',
		options,
		onShadowReady(calendarInstance) {
			injectCSS(calendarInstance.shadowRoot);
		},
		onInit(calendar) {
			// Setters for lock states
			calendar.setBlockedDates = (dates) => {
				calendar.blockedDates = dates.map(getUTCMidnightTimestamp);
				calendar.renderCalendar();
				calendar.updateDayClasses();
			};
			calendar.setNoRangeStartDates = (dates) => {
				calendar.noRangeStartDates = dates.map(getUTCMidnightTimestamp);
				calendar.renderCalendar();
				calendar.updateDayClasses();
			};
			calendar.setNoRangeEndDates = (dates) => {
				calendar.noRangeEndDates = dates.map(getUTCMidnightTimestamp);
				calendar.renderCalendar();
				calendar.updateDayClasses();
			};

			// Override updateDayClasses to add lock classes and handle hover
			const originalUpdateDayClasses =
				calendar.updateDayClasses?.bind(calendar) || (() => {});
			calendar.updateDayClasses = function () {
				let fromDate = this.startDate,
					toDate =
						this.endDate ||
						(this.startDate && this.hoverDate ? this.hoverDate : null);
				const blocked = (this.blockedDates || []).map(getUTCMidnightTimestamp);
				const noStart = (this.noRangeStartDates || []).map(
					getUTCMidnightTimestamp
				);
				const noEnd = (this.noRangeEndDates || []).map(getUTCMidnightTimestamp);
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
					const dir = fromDate < this.hoverDate ? 1 : -1;
					let current = new Date(fromDate);
					let hoverLimit = this.hoverDate;
					while (
						(dir > 0 && current <= this.hoverDate) ||
						(dir < 0 && current >= this.hoverDate)
					) {
						const t = current.getTime();
						if (blocked.includes(t) && t !== fromDate.getTime()) {
							hoverLimit = new Date(current);
							hoverLimit.setDate(hoverLimit.getDate() - dir);
							break;
						}
						current.setDate(current.getDate() + dir);
					}
					toDate = hoverLimit;
				}
				this.dayElements.forEach(({ el, date }) => {
					const t = getUTCMidnightTimestamp(date);
					if (blocked.includes(t)) el.classList.add('blocked');
					if (noStart.includes(t)) el.classList.add('no-range-start');
					if (noEnd.includes(t)) el.classList.add('no-range-end');
				});
				// Add denied class for denied hover
				if (this.mode === 'range' && fromDate && toDate && !this.endDate) {
					const fromTime = getUTCMidnightTimestamp(fromDate),
						toTime = getUTCMidnightTimestamp(toDate),
						minTime = Math.min(fromTime, toTime),
						maxTime = Math.max(fromTime, toTime);
					let denied = false;
					let current = new Date(
						Date.UTC(
							fromDate.getUTCFullYear(),
							fromDate.getUTCMonth(),
							fromDate.getUTCDate()
						)
					);
					const dir = fromDate < toDate ? 1 : -1;
					while (
						(dir > 0 && current.getTime() <= toTime) ||
						(dir < 0 && current.getTime() >= toTime)
					) {
						const tt = current.getTime();
						if (blocked.includes(tt) && tt !== fromTime && tt !== toTime) {
							denied = true;
							break;
						}
						current.setUTCDate(current.getUTCDate() + dir);
					}
					if (denied) {
						this.dayElements.forEach(({ el, date }) => {
							const t = getUTCMidnightTimestamp(date);
							if (t >= minTime && t <= maxTime && !blocked.includes(t)) {
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
			calendar.selectDate = function (selected, monthIndex) {
				const t = getUTCMidnightTimestamp(selected);

				const noStart = this.noRangeStartDates || [];
				const noEnd = this.noRangeEndDates || [];

				// Range selection start
				if (
					this.mode === 'range' &&
					(!this.startDate || (this.startDate && this.endDate))
				) {
					if (noStart.includes(t)) {
						this.triggerInvalidRangeFeedback &&
							this.triggerInvalidRangeFeedback();
						return;
					}
				}

				// Range selection end
				if (this.mode === 'range' && this.startDate && !this.endDate) {
					const startT = getUTCMidnightTimestamp(this.startDate);
					if (noEnd.includes(t)) {
						this.triggerInvalidRangeFeedback &&
							this.triggerInvalidRangeFeedback();
						return;
					}
					if (
						(noStart.includes(startT) && noEnd.includes(t)) ||
						(noEnd.includes(startT) && noStart.includes(t))
					) {
						this.triggerInvalidRangeFeedback &&
							this.triggerInvalidRangeFeedback();
						return;
					}
					// Prevent reverse selection ending on no-range-start
					if (noStart.includes(t) && t < startT) {
						this.triggerInvalidRangeFeedback &&
							this.triggerInvalidRangeFeedback();
						return;
					}
					// Prevent range containing a blocked date
					const from = new Date(
						this.startDate.getFullYear(),
						this.startDate.getMonth(),
						this.startDate.getDate()
					);
					const to = new Date(
						selected.getFullYear(),
						selected.getMonth(),
						selected.getDate()
					);
					const dir = from < to ? 1 : -1;
					let current = new Date(from);
					while ((dir > 0 && current <= to) || (dir < 0 && current >= to)) {
						const tt = getUTCMidnightTimestamp(current);
						if (
							this.blockedDates?.includes(tt) &&
							tt !== getUTCMidnightTimestamp(from) &&
							tt !== getUTCMidnightTimestamp(to)
						) {
							this.triggerInvalidRangeFeedback &&
								this.triggerInvalidRangeFeedback();
							return;
						}
						current.setDate(current.getDate() + dir);
					}
				}

				return originalSelectDate(selected, monthIndex);
			};

			// Store initial options for later (DOM not ready)
			const opts =
				calendar.options.plugins?.find((p) => p && p.name === 'lock')
					?.options || {};
			calendar._lockInitOptions = opts;
			calendar.blockedDates = [];
			calendar.noRangeStartDates = [];
			calendar.noRangeEndDates = [];
		},
		onRender(calendar) {
			// Apply lock options on first render if needed
			if (calendar._lockInitOptions) {
				const opts = calendar._lockInitOptions;
				if (opts.blockedDates)
					calendar.blockedDates = opts.blockedDates.map((d) =>
						typeof d === 'number' ? d : lockPlugin.parseYMD(d).getTime()
					);
				if (opts.noRangeStartDates)
					calendar.noRangeStartDates = opts.noRangeStartDates.map((d) =>
						typeof d === 'number' ? d : lockPlugin.parseYMD(d).getTime()
					);
				if (opts.noRangeEndDates)
					calendar.noRangeEndDates = opts.noRangeEndDates.map((d) =>
						typeof d === 'number' ? d : lockPlugin.parseYMD(d).getTime()
					);
				delete calendar._lockInitOptions;
				calendar.updateDayClasses && calendar.updateDayClasses();
				return;
			}
			calendar.updateDayClasses && calendar.updateDayClasses();
		},
	};
}

// Returns UTC midnight timestamp for a date, timestamp, or string
function getUTCMidnightTimestamp(d) {
	if (typeof d === 'number') {
		const date = new Date(d);
		return Date.UTC(
			date.getUTCFullYear(),
			date.getUTCMonth(),
			date.getUTCDate()
		);
	}
	if (d instanceof Date) {
		return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
	}
	if (typeof d === 'string') {
		const [y, m, day] = d.split('-').map(Number);
		return Date.UTC(y, m - 1, day);
	}
	return d;
}

// Parses YMD string as UTC date
lockPlugin.parseYMD = function (str) {
	const [y, m, d] = str.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d));
};
