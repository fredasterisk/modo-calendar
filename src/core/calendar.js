import calendarStyles from './styles.css?inline';

/**
 * NovaCalendar: Customizable, isolated calendar component (range, single, multiple)
 * - Shadow DOM isolation, dynamic CSS
 * - Blocked dates, before-today, visual feedback
 * - Multi-calendar support (only one open at a time)
 */
export class NovaCalendar {
	static instances = [];
	static globalPlugins = [];
	static use(plugin) {
		this.globalPlugins.push(plugin);
	}
	constructor(options = {}) {
		this.options = {
			trigger: options.trigger || null,
			mode: 'range',
			strictRange2Months: options.strictRange2Months || false, // false par défaut
			inline: options.inline || false, // false, true, ou string (sélecteur)
			format:
				options.format ||
				((start, end) =>
					start && end ? `${start} - ${end}` : start || options.placeholder),
			...options,
		};
		this.date = new Date();
		this.mode = options.mode || 'range';
		this.months = options.months || 1;
		this.startDate = this.endDate = this.hoverDate = null;
		this.blockedDates = [];
		this.noRangeStartDates = [];
		this.noRangeEndDates = [];
		if (this.mode === 'multiple') this.selectedDates = [];
		this.plugins = [];
		// Ajoute les plugins globaux à chaque instance
		if (this.constructor.globalPlugins) {
			this.constructor.globalPlugins.forEach((p) => this.addPlugin(p));
		}
		if (options.plugins) {
			options.plugins.forEach((p) => this.addPlugin(p));
		}
		NovaCalendar.instances.push(this);
		// Appel automatique de attachToTrigger si trigger fourni ou inline
		if (this.options.inline || this.options.trigger) {
			this.attachToTrigger(this.options.trigger);
		}
	}
	static parseYMD(str) {
		const [y, m, d] = str.split('-').map(Number);
		return new Date(y, m - 1, d);
	}
	setRange(start, end) {
		this.startDate = NovaCalendar.parseYMD(start);
		this.endDate = end ? NovaCalendar.parseYMD(end) : null;
		this.hoverDate = null;
		this.updateButtonLabel();
		this.renderCalendar();
		this.updateDayClasses();
	}
	setBlockedDates(dates) {
		this.blockedDates = dates.map((d) => NovaCalendar.parseYMD(d).getTime());
		this.renderCalendar();
		this.updateDayClasses();
	}
	setNoRangeStartDates(dates) {
		this.noRangeStartDates = dates.map((d) =>
			NovaCalendar.parseYMD(d).getTime()
		);
		this.renderCalendar();
		this.updateDayClasses();
	}
	setNoRangeEndDates(dates) {
		this.noRangeEndDates = dates.map((d) => NovaCalendar.parseYMD(d).getTime());
		this.renderCalendar();
		this.updateDayClasses();
	}
	attachToTrigger(selector) {
		const isInlineSelector = typeof this.options.inline === 'string';
		const btn =
			selector && !isInlineSelector ? document.querySelector(selector) : null;
		let inlineContainer = null;
		if (isInlineSelector) {
			inlineContainer = document.querySelector(this.options.inline);
			if (!inlineContainer) {
				console.warn(
					'[NovaCalendar] Conteneur inline non trouvé:',
					this.options.inline
				);
				return;
			}
		}
		if (!btn && !this.options.inline) return;
		this.trigger = btn;
		this.shadowHost = document.createElement('div');
		if (isInlineSelector && inlineContainer) {
			inlineContainer.appendChild(this.shadowHost);
		} else {
			document.body.appendChild(this.shadowHost);
		}
		this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open' });
		this.shadowRoot.innerHTML = `<style>${calendarStyles}</style>`;
		this.container = document.createElement('div');
		this.container.className = 'nova-calendar';
		this.shadowRoot.appendChild(this.container);
		// Ajout du champ hidden pour le timestamp
		this.hiddenInput = document.createElement('input');
		this.hiddenInput.type = 'hidden';
		this.hiddenInput.className = 'nova-calendar-timestamp';
		this.shadowRoot.appendChild(this.hiddenInput);

		if (!this.options.inline) {
			this.container.style.display = 'none';
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.showCalendar();
			});
			document.addEventListener('click', (e) => {
				const path = e.composedPath ? e.composedPath() : [];
				if (
					!(
						path.includes(this.container) ||
						path.includes(this.shadowHost) ||
						e.target === btn
					)
				)
					this.hideCalendar();
			});
		} else {
			this.container.style.display = 'block';
			this.shadowHost.style.position = 'static';
		}
		this.renderCalendar();
		this.updateHiddenInput();
	}
	showCalendar() {
		if (this.options.inline) return;
		NovaCalendar.instances.forEach((i) => {
			if (i !== this) i.hideCalendar();
		});
		this.container.style.display = 'block';
		const rect = this.trigger.getBoundingClientRect();
		this.shadowHost.style.position = 'absolute';
		this.shadowHost.style.left = rect.left + window.scrollX + 'px';
		this.shadowHost.style.top = rect.bottom + window.scrollY + 'px';
		this.plugins?.forEach((p) => p.onCalendarOpen?.(this));
	}
	hideCalendar() {
		if (this.options.inline) return;
		this.container.style.display = 'none';
	}
	/**
	 * Permet de naviguer chaque mois indépendamment dans l'affichage multi-mois
	 */
	renderCalendar() {
		this.container.innerHTML = '';
		if (!this.monthOffsets || this.monthOffsets.length !== this.months) {
			this.monthOffsets = Array(this.months).fill(0);
		}
		const baseDate = new Date(this.date);
		this.dayElements = [];

		// Ajout d'un wrapper flex pour les mois
		const monthsWrapper = document.createElement('div');
		monthsWrapper.className = 'nova-months-wrapper';
		this.container.appendChild(monthsWrapper);

		for (let i = 0; i < this.months; i++) {
			const offset = this.monthOffsets[i] || 0;
			const monthDate = new Date(
				baseDate.getFullYear(),
				baseDate.getMonth() + i + offset,
				1
			);
			const month = monthDate.toLocaleString('default', { month: 'long' }),
				year = monthDate.getFullYear();

			const monthCol = document.createElement('div');
			monthCol.className = 'nova-month-col';
			monthsWrapper.appendChild(monthCol);

			const header = document.createElement('div');
			header.classList.add('header');
			header.innerHTML = `<span>${month} ${year}</span><span>
				<button class="prev-month" data-month="${i}">&#8249;</button>
				<button class="next-month" data-month="${i}">&#8250;</button>
			</span>`;
			monthCol.appendChild(header);

			header.querySelector('.prev-month')?.addEventListener('click', (e) => {
				e.stopPropagation();
				const idx = +e.currentTarget.getAttribute('data-month');
				// Empêche de reculer le mois 0 en dessous de la date de base
				if (idx === 0 && (this.monthOffsets[0] || 0) <= 0) return;
				// Empêche de reculer le mois i pour qu'il ne soit pas égal ou avant le mois précédent
				if (idx > 0) {
					const prevMonthDate = new Date(
						baseDate.getFullYear(),
						baseDate.getMonth() + idx - 1 + (this.monthOffsets[idx - 1] || 0),
						1
					);
					const newMonthDate = new Date(
						baseDate.getFullYear(),
						baseDate.getMonth() + idx + (this.monthOffsets[idx] || 0) - 1,
						1
					);
					if (newMonthDate <= prevMonthDate) return;
				}
				this.monthOffsets[idx] = (this.monthOffsets[idx] || 0) - 1;
				// Synchronisation : ajuste les suivants
				for (let j = idx + 1; j < this.months; j++) {
					const prevMonthDate = new Date(
						baseDate.getFullYear(),
						baseDate.getMonth() + j - 1 + (this.monthOffsets[j - 1] || 0),
						1
					);
					const nextMonthDate = new Date(
						baseDate.getFullYear(),
						baseDate.getMonth() + j + (this.monthOffsets[j] || 0),
						1
					);
					if (nextMonthDate <= prevMonthDate) {
						this.monthOffsets[j] =
							prevMonthDate.getMonth() -
							baseDate.getMonth() +
							1 +
							(prevMonthDate.getFullYear() - baseDate.getFullYear()) * 12 -
							j;
					}
				}
				this.renderCalendar();
				this.updateDayClasses();
			});
			header.querySelector('.next-month')?.addEventListener('click', (e) => {
				e.stopPropagation();
				const idx = +e.currentTarget.getAttribute('data-month');
				// Empêche d'avancer le mois pour qu'il ne soit pas égal ou avant le mois précédent
				if (idx > 0) {
					const prevMonthDate = new Date(
						baseDate.getFullYear(),
						baseDate.getMonth() + idx - 1 + (this.monthOffsets[idx - 1] || 0),
						1
					);
					const newMonthDate = new Date(
						baseDate.getFullYear(),
						baseDate.getMonth() + idx + (this.monthOffsets[idx] || 0) + 1,
						1
					);
					if (newMonthDate <= prevMonthDate) return;
				}
				this.monthOffsets[idx] = (this.monthOffsets[idx] || 0) + 1;
				// Synchronisation : ajuste les suivants
				for (let j = idx + 1; j < this.months; j++) {
					const prevMonthDate = new Date(
						baseDate.getFullYear(),
						baseDate.getMonth() + j - 1 + (this.monthOffsets[j - 1] || 0),
						1
					);
					const nextMonthDate = new Date(
						baseDate.getFullYear(),
						baseDate.getMonth() + j + (this.monthOffsets[j] || 0),
						1
					);
					if (nextMonthDate <= prevMonthDate) {
						this.monthOffsets[j] =
							prevMonthDate.getMonth() -
							baseDate.getMonth() +
							1 +
							(prevMonthDate.getFullYear() - baseDate.getFullYear()) * 12 -
							j;
					}
				}
				this.renderCalendar();
				this.updateDayClasses();
			});

			// Passe l'index du mois à generateDays
			const days = this.generateDays(monthDate, i);
			monthCol.appendChild(days);
			days.querySelectorAll('.day').forEach((dayEl) => {
				this.dayElements.push({
					el: dayEl,
					date: dayEl._date,
					monthIndex: i,
				});
			});
		}

		// Multi-list (pour mode multiple)
		let multiList = this.container.querySelector('.multi-list');
		if (multiList) this.container.removeChild(multiList);
		if (this.mode === 'multiple') {
			multiList = document.createElement('div');
			multiList.className = 'multi-list';
			if (this.selectedDates && this.selectedDates.length > 0) {
				const sorted = [...this.selectedDates].sort((a, b) => a - b);
				multiList.innerHTML = sorted
					.map(
						(d, i) =>
							`<span class="multi-date" data-index="${i}"><button class="nova-btn remove-date" data-index="${i}" title="Deselect">${this.formatDisplay(
								d
							)}  ×</button></span>`
					)
					.join('');
			} else {
				multiList.innerHTML =
					'<span class="multi-date-empty">No date selected</span>';
			}
			this.container.appendChild(multiList);
			multiList.querySelectorAll('.remove-date').forEach((btn) => {
				btn.addEventListener('click', (e) => {
					e.stopPropagation();
					const idx = +btn.getAttribute('data-index');
					const sorted = [...this.selectedDates].sort((a, b) => a - b);
					const dateToRemove = sorted[idx];
					this.selectedDates = this.selectedDates.filter(
						(d) => d.getTime() !== dateToRemove.getTime()
					);
					this.updateButtonLabel();
					this.renderCalendar();
					this.updateDayClasses();
				});
			});
		}
		this.plugins?.forEach((p) => p.onRender?.(this));
	}
	generateDays(date, monthIndex) {
		const daysContainer = document.createElement('div');
		daysContainer.className = 'days';
		// NE PAS réinitialiser this.dayElements ici !
		const firstDay =
			new Date(date.getFullYear(), date.getMonth(), 1).getDay() || 7;
		const daysInMonth = new Date(
			date.getFullYear(),
			date.getMonth() + 1,
			0
		).getDate();
		['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach((d) => {
			const dayHeader = document.createElement('div');
			dayHeader.textContent = d;
			dayHeader.className = 'day-header';
			daysContainer.appendChild(dayHeader);
		});
		for (let i = 1; i < firstDay; i++)
			daysContainer.appendChild(
				Object.assign(document.createElement('div'), { className: 'empty' })
			);
		for (let d = 1; d <= daysInMonth; d++) {
			const currentDate = new Date(date.getFullYear(), date.getMonth(), d),
				day = document.createElement('div'),
				dayText = document.createElement('div');
			dayText.className = 'day-text';
			dayText.textContent = d;
			day.appendChild(dayText);
			day.textContent = d;
			day.className = 'day';
			day._date = currentDate;
			day.dataset.monthIndex = monthIndex;
			const dateTime = currentDate.getTime();
			if (this.blockedDates && this.blockedDates.includes(dateTime))
				day.classList.add('blocked');
			if (this.noRangeStartDates && this.noRangeStartDates.includes(dateTime))
				day.classList.add('no-range-start');
			if (this.noRangeEndDates && this.noRangeEndDates.includes(dateTime))
				day.classList.add('no-range-end');
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			if (currentDate < today) day.classList.add('before-today');
			// Handler modifié pour passer l'index de mois
			day.onclick = (e) => this.selectDate(currentDate, monthIndex);
			day.addEventListener('mousedown', (e) => e.stopPropagation());
			day.addEventListener('click', (e) => e.stopPropagation());
			day.onmouseover = () => {
				if (this.startDate && !this.endDate) {
					this.hoverDate = currentDate;
					this.updateDayClasses();
				}
			};
			daysContainer.appendChild(day);
		}
		return daysContainer;
	}
	/**
	 * Triggers a visual feedback (shake/highlight) when an invalid range is selected
	 */
	triggerInvalidRangeFeedback() {
		if (!this.container) return;
		this.container.classList.add('invalid-range');
		setTimeout(() => {
			this.container.classList.remove('invalid-range');
		}, 600);
	}
	selectDate(selected, monthIndex) {
		const selectedTime = selected.getTime();
		if (this.mode === 'single') {
			this.selectedDate = this.startDate = selected;
			this.updateButtonLabel();
			this.updateDayClasses();
			this.updateHiddenInput();
			// Le plugin timePlugin gère le focus/fermeture si besoin
			this.plugins?.forEach((p) => p.onDateSelected?.(selected, this));
			return;
		}
		if (this.mode === 'multiple') {
			const dateKey = selectedTime;
			const index = this.selectedDates.findIndex(
				(d) => d.getTime() === dateKey
			);
			if (index === -1) this.selectedDates.push(selected);
			else this.selectedDates.splice(index, 1);
			this.updateButtonLabel();
			this.renderCalendar();
			this.updateDayClasses();
			this.updateHiddenInput();
			return;
		}
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const isBeforeToday = selected < today;
		const isNoRangeStart =
			this.noRangeStartDates && this.noRangeStartDates.includes(selectedTime);
		const isNoRangeEnd =
			this.noRangeEndDates && this.noRangeEndDates.includes(selectedTime);
		const isBoth = isNoRangeStart && isNoRangeEnd;

		// --- Correction UX range 2 mois optionnelle ---
		if (
			this.mode === 'range' &&
			this.months === 2 &&
			this.options.strictRange2Months
		) {
			if (!this.startDate || (this.startDate && this.endDate)) {
				// On veut sélectionner le début : uniquement sur le 1er calendrier
				if (monthIndex !== 0) {
					this.triggerInvalidRangeFeedback();
					return;
				}
			} else if (this.startDate && !this.endDate) {
				// On veut sélectionner la fin : uniquement sur le 2e calendrier
				if (monthIndex !== 1) {
					this.triggerInvalidRangeFeedback();
					return;
				}
			}
		}
		// --- Fin correction UX ---

		// Si la date est à la fois no-range-start et no-range-end, on ne peut jamais la sélectionner (début ou fin)
		if (isBoth) {
			this.triggerInvalidRangeFeedback();
			return;
		}
		// Empêcher de commencer une plage sur une date no-range-start (sauf si elle est aussi no-range-end, déjà géré)
		if (
			(!this.startDate || (this.startDate && this.endDate)) &&
			isNoRangeStart
		) {
			this.triggerInvalidRangeFeedback();
			return;
		}
		// Empêcher de finir une plage sur une date no-range-end (sauf si elle est aussi no-range-start, déjà géré)
		if (this.startDate && !this.endDate && isNoRangeEnd) {
			this.triggerInvalidRangeFeedback();
			return;
		}
		// Empêcher de finir une plage inversée sur une date no-range-start (car elle devient le début effectif)
		if (
			this.startDate &&
			!this.endDate &&
			selectedTime < this.startDate.getTime() &&
			isNoRangeStart
		) {
			this.triggerInvalidRangeFeedback();
			return;
		}
		if (!this.startDate || (this.startDate && this.endDate)) {
			this.startDate = selected;
			this.endDate = this.hoverDate = null;
			this.updateDayClasses();
			this.updateHiddenInput();
		} else if (!isBeforeToday) {
			// Prevent same start and end date in range mode
			let fixedEndDate = selected;
			const rangeArr = this.getDateRangeArray(this.startDate, selected);
			let blockedFound = false;
			for (let i = 1; i < rangeArr.length; i++) {
				const day = rangeArr[i],
					dayAtMidnight = new Date(
						day.getFullYear(),
						day.getMonth(),
						day.getDate()
					),
					dayTime = dayAtMidnight.getTime();
				if (this.blockedDates && this.blockedDates.includes(dayTime)) {
					const previousDay = rangeArr[i - 1];
					fixedEndDate = new Date(
						previousDay.getFullYear(),
						previousDay.getMonth(),
						previousDay.getDate()
					);
					blockedFound = true;
					break;
				}
			}
			// If blocked found and fixedEndDate == startDate, do not update endDate (keep only startDate selected)
			if (blockedFound && fixedEndDate.getTime() === this.startDate.getTime()) {
				this.endDate = null;
				this.hoverDate = null;
				this.updateDayClasses();
				this.triggerInvalidRangeFeedback();
				this.updateHiddenInput();
				return;
			}
			// Prevent same start and end date in range mode
			if (selected.getTime() === this.startDate.getTime()) {
				this.triggerInvalidRangeFeedback();
				this.updateHiddenInput();
				return;
			}
			this.endDate = fixedEndDate;
			this.hoverDate = null;
			this.updateButtonLabel();
			this.updateDayClasses();
			if (!this.options.inline) {
				this.container.style.display = 'none';
			}
			this.updateHiddenInput();
		} else {
			this.startDate = selected;
			this.endDate = this.hoverDate = null;
			this.updateDayClasses();
			this.updateHiddenInput();
		}
		this.plugins?.forEach((p) => p.onDateSelected?.(selected, this));
	}
	updateDayClasses() {
		if (!this.dayElements) return;
		let fromDate = this.startDate,
			toDate =
				this.endDate ||
				(this.startDate && this.hoverDate ? this.hoverDate : null);
		this.dayElements.forEach(({ el, date }) => {
			el.className = 'day';
			const dateTime = new Date(
				date.getFullYear(),
				date.getMonth(),
				date.getDate()
			).getTime();

			const isBlocked =
				this.blockedDates && this.blockedDates.includes(dateTime);
			const isNoRangeStart =
				this.noRangeStartDates && this.noRangeStartDates.includes(dateTime);
			const isNoRangeEnd =
				this.noRangeEndDates && this.noRangeEndDates.includes(dateTime);
			const isBoth = isNoRangeStart && isNoRangeEnd;

			if (isBlocked) {
				el.classList.add('blocked');
			}
			if (isNoRangeStart) el.classList.add('no-range-start');
			if (isNoRangeEnd) el.classList.add('no-range-end');

			if (
				this.mode === 'single' &&
				this.selectedDate &&
				date.getTime() === this.selectedDate.getTime()
			)
				el.classList.add('selected');
			if (
				this.mode === 'multiple' &&
				this.selectedDates &&
				this.selectedDates.find((d) => d.getTime() === date.getTime())
			)
				el.classList.add('selected');
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const isBeforeToday = date.getTime() < today.getTime();
			if (isBeforeToday) el.classList.add('before-today');
			let rangeBlocked = false;
			if (this.startDate && (this.endDate || this.hoverDate)) {
				const from = new Date(
						this.startDate.getFullYear(),
						this.startDate.getMonth(),
						this.startDate.getDate()
					),
					to = new Date(
						(this.endDate || this.hoverDate).getFullYear(),
						(this.endDate || this.hoverDate).getMonth(),
						(this.endDate || this.hoverDate).getDate()
					),
					dir = from < to ? 1 : -1;
				let current = new Date(from);
				while ((dir > 0 && current <= date) || (dir < 0 && current >= date)) {
					const t = current.getTime();
					if (this.blockedDates && this.blockedDates.includes(t)) {
						rangeBlocked = true;
						break;
					}
					current.setDate(current.getDate() + dir);
				}
			}
			if (this.mode === 'range') {
				if (fromDate && toDate && !rangeBlocked) {
					const fromTime = new Date(
							fromDate.getFullYear(),
							fromDate.getMonth(),
							fromDate.getDate()
						).getTime(),
						toTime = new Date(
							toDate.getFullYear(),
							toDate.getMonth(),
							toDate.getDate()
						).getTime(),
						dateTime = new Date(
							date.getFullYear(),
							date.getMonth(),
							date.getDate()
						).getTime(),
						minTime = Math.min(fromTime, toTime),
						maxTime = Math.max(fromTime, toTime);
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
					date.getTime() === this.hoverDate.getTime() &&
					!rangeBlocked
				)
					el.classList.add('range-end');
				if (
					!toDate &&
					this.hoverDate &&
					fromDate &&
					this.hoverDate.getTime() < fromDate.getTime() &&
					!isBeforeToday &&
					date.getTime() === this.hoverDate.getTime() &&
					!rangeBlocked
				)
					el.classList.add('range-start');
				if (fromDate && !toDate && date.getTime() === fromDate.getTime()) {
					if (this.hoverDate && this.hoverDate.getTime() < fromDate.getTime())
						el.classList.add('selected', 'range-end');
					else el.classList.add('selected', 'range-start');
				}
			}
		});
	}
	getDateRangeArray(startDate, endDate) {
		const range = [],
			dir = startDate < endDate ? 1 : -1;
		let current = new Date(startDate);
		while ((dir > 0 && current <= endDate) || (dir < 0 && current >= endDate)) {
			range.push(new Date(current));
			current.setDate(current.getDate() + dir);
		}
		return range;
	}
	updateButtonLabel() {
		const btn = this.trigger;
		let text = this.options.placeholder;
		if (
			this.mode === 'multiple' &&
			this.selectedDates &&
			this.selectedDates.length > 0
		)
			text = [...this.selectedDates]
				.sort((a, b) => a - b)
				.map((d) => this.formatDisplay(d))
				.join(', ');
		else if (this.startDate && this.endDate) {
			const d1 = this.startDate,
				d2 = this.endDate,
				first = d1.getTime() <= d2.getTime() ? d1 : d2,
				last = d1.getTime() > d2.getTime() ? d1 : d2;
			text = this.options.format(
				this.formatDisplay(first),
				this.formatDisplay(last)
			);
		} else if (this.startDate)
			text = this.options.format(this.formatDisplay(this.startDate), null);
		const labelEl = btn ? btn.querySelector('.dates') : null;
		if (labelEl) labelEl.textContent = text;
		this.updateHiddenInput();
	}
	formatDisplay(date) {
		return date
			? date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
			: '';
	}
	formatDate(date) {
		const year = date.getFullYear(),
			month = (date.getMonth() + 1).toString().padStart(2, '0'),
			day = date.getDate().toString().padStart(2, '0');
		return `${year}-${month}-${day}`;
	}
	addPlugin(plugin) {
		this.plugins.push(plugin);
		plugin.onInit?.(this);
	}
	updateHiddenInput() {
		if (!this.hiddenInput) return;
		if (this.mode === 'single') {
			this.hiddenInput.value = this.selectedDate
				? this.selectedDate.getTime()
				: '';
		} else if (this.mode === 'range') {
			const t1 = this.startDate ? this.startDate.getTime() : '';
			const t2 = this.endDate ? this.endDate.getTime() : '';
			this.hiddenInput.value = t1 && t2 ? `${t1},${t2}` : t1 || '';
		} else if (this.mode === 'multiple') {
			if (this.selectedDates && this.selectedDates.length > 0) {
				const sorted = [...this.selectedDates].sort((a, b) => a - b);
				this.hiddenInput.value = sorted.map((d) => d.getTime()).join(',');
			} else {
				this.hiddenInput.value = '';
			}
		}
	}
}

// Pour charger dynamiquement les plugins depuis un dossier
import { timePlugin } from '../plugins/time/time-plugin.js';

// Plugin de sélection d'heure pour NovaCalendar
export { timePlugin };
