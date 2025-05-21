// src/plugins/locking/locking-plugin.js
// Plugin to handle blocked dates, no-range-start, and no-range-end for NovaCalendar

export function lockingPlugin(options = {}) {
	return {
		name: 'locking',
		options,
		onInit(calendar) {
			// Définir les setters d'abord
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

			// Surcharge updateDayClasses pour ajouter les classes de blocage et gérer le hover
			const originalUpdateDayClasses =
				calendar.updateDayClasses?.bind(calendar) || (() => {});
			calendar.updateDayClasses = function () {
				let fromDate = this.startDate,
					toDate =
						this.endDate ||
						(this.startDate && this.hoverDate ? this.hoverDate : null);
				console.log('updateDayClasses (lockingPlugin) called', {
					fromDate,
					toDate,
					hoverDate: this.hoverDate,
					mode: this.mode,
					dayElements: this.dayElements?.length,
				});
				const blocked = (this.blockedDates || []).map(getUTCMidnightTimestamp);
				const noStart = (this.noRangeStartDates || []).map(
					getUTCMidnightTimestamp
				);
				const noEnd = (this.noRangeEndDates || []).map(getUTCMidnightTimestamp);
				console.log('blocked array:', blocked);
				originalUpdateDayClasses();
				if (!this.dayElements) return;
				// Nettoyage des classes denied
				this.dayElements.forEach(({ el }) => {
					el.classList.remove('denied');
				});
				// Calculer la limite de hover (ne pas dépasser une date bloquée)
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
					// Si hoverLimit a changé, on limite le toDate
					toDate = hoverLimit;
				}
				this.dayElements.forEach(({ el, date }) => {
					const t = getUTCMidnightTimestamp(date);
					if (blocked.includes(t)) el.classList.add('blocked');
					if (noStart.includes(t)) el.classList.add('no-range-start');
					if (noEnd.includes(t)) el.classList.add('no-range-end');
				});
				// Ajout d'une passe pour denied sur hover refusé
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
						console.log(
							'Test denied:',
							current,
							'tt:',
							tt,
							'blocked:',
							blocked.includes(tt),
							'fromTime:',
							fromTime,
							'toTime:',
							toTime,
							'blocked array:',
							blocked
						);
						if (blocked.includes(tt) && tt !== fromTime && tt !== toTime) {
							console.log(
								'-> Date bloquée trouvée dans la plage, denied = true',
								current
							);
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
								console.log('Ajout de .denied sur', el, date, 't:', t);
								el.style.animation = 'none';
								el.offsetHeight;
								el.style.animation = null;
							}
						});
					}
				}
			};

			// Surcharge selectDate pour empêcher la sélection sur les jours bloqués/no-range
			const originalSelectDate = calendar.selectDate?.bind(calendar);
			calendar.selectDate = function (selected, monthIndex) {
				const t = getUTCMidnightTimestamp(selected);
				if (this.blockedDates?.includes(t)) {
					this.triggerInvalidRangeFeedback &&
						this.triggerInvalidRangeFeedback();
					return;
				}
				// Empêcher de commencer sur un no-range-start (toujours interdit)
				if (
					this.mode === 'range' &&
					(!this.startDate || (this.startDate && this.endDate)) &&
					this.noRangeStartDates?.includes(t)
				) {
					this.triggerInvalidRangeFeedback &&
						this.triggerInvalidRangeFeedback();
					return;
				}
				// Empêcher de finir sur un no-range-end (toujours interdit)
				if (
					this.mode === 'range' &&
					this.startDate &&
					!this.endDate &&
					this.noRangeEndDates?.includes(t)
				) {
					this.triggerInvalidRangeFeedback &&
						this.triggerInvalidRangeFeedback();
					return;
				}
				// Empêcher de finir sur un no-range-start UNIQUEMENT si sélection inversée (t < startDate)
				if (
					this.mode === 'range' &&
					this.startDate &&
					!this.endDate &&
					this.noRangeStartDates?.includes(t) &&
					t < this.startDate.getTime()
				) {
					this.triggerInvalidRangeFeedback &&
						this.triggerInvalidRangeFeedback();
					return;
				}
				// Empêcher de valider un range qui contient une date bloquée
				if (this.mode === 'range' && this.startDate && !this.endDate) {
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
						const tt = current.getTime();
						if (
							this.blockedDates?.includes(tt) &&
							tt !== from.getTime() &&
							tt !== to.getTime()
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

			// Stocker les options à appliquer pour plus tard (DOM pas prêt)
			const opts =
				calendar.options.plugins?.find((p) => p && p.name === 'locking')
					?.options || {};
			calendar._lockingInitOptions = opts;
			calendar.blockedDates = [];
			calendar.noRangeStartDates = [];
			calendar.noRangeEndDates = [];
		},
		onRender(calendar) {
			// Appliquer les options de blocage au premier rendu si besoin
			if (calendar._lockingInitOptions) {
				const opts = calendar._lockingInitOptions;
				if (opts.blockedDates)
					calendar.blockedDates = opts.blockedDates.map((d) =>
						typeof d === 'number' ? d : lockingPlugin.parseYMD(d).getTime()
					);
				if (opts.noRangeStartDates)
					calendar.noRangeStartDates = opts.noRangeStartDates.map((d) =>
						typeof d === 'number' ? d : lockingPlugin.parseYMD(d).getTime()
					);
				if (opts.noRangeEndDates)
					calendar.noRangeEndDates = opts.noRangeEndDates.map((d) =>
						typeof d === 'number' ? d : lockingPlugin.parseYMD(d).getTime()
					);
				delete calendar._lockingInitOptions;
				// Forcer un update visuel après application (sans boucle infinie)
				calendar.updateDayClasses && calendar.updateDayClasses();
				return;
			}
			calendar.updateDayClasses && calendar.updateDayClasses();
		},
		onDateSelected(selected, calendar) {
			// Optionally, could add feedback here
		},
	};
}

// Helper pour obtenir le timestamp UTC minuit d'une date ou timestamp ou string
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

// Helper for YMD parsing
lockingPlugin.parseYMD = function (str) {
	const [y, m, d] = str.split('-').map(Number);
	return new Date(y, m - 1, d);
};
