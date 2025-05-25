import calendarStyles from './styles.css?inline';

export class NovaCalendar {
	static instances = [];
	static globalPlugins = [];
	static use(plugin) {
		this.globalPlugins.push(plugin);
	}

	constructor(options = {}) {
		this.options = {
			trigger: options.trigger || null,
			mode: options.mode || 'range',
			inline: options.inline || false,
			format:
				options.format ||
				((start, end) =>
					start && end ? `${start} - ${end}` : start || options.placeholder),
			...options,
		};
		this.date = new Date();
		this.mode = this.options.mode;
		this.months = this.options.months || 1;
		if (this.mode === 'multiple') this.selectedDates = [];
		this.plugins = [];
		this._initialLabelValue = null;
		[...(this.constructor.globalPlugins || []), ...(this.options.plugins || [])].forEach((p) => this.addPlugin(p));
		NovaCalendar.instances.push(this);
		if (this.options.inline || this.options.trigger) this.attachToTrigger(this.options.trigger);
		const monthsPluginInstance = this.plugins.find((p) => p.name === 'months');
		this.strictRange2Months = monthsPluginInstance?.options?.strictRange2Months;
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

	attachToTrigger(selector) {
		const isInline = typeof this.options.inline === 'string';
		const btn = selector && !isInline ? document.querySelector(selector) : null;
		const inlineContainer = isInline ? document.querySelector(this.options.inline) : null;
		if (isInline && !inlineContainer) return;
		if (!btn && !this.options.inline) return;
		this.trigger = btn;
		this.shadowHost = document.createElement('div');
		(isInline && inlineContainer ? inlineContainer : document.body).appendChild(this.shadowHost);
		this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open' });
		this.shadowRoot.innerHTML = `<style>${calendarStyles}</style>`;
		this.container = Object.assign(document.createElement('div'), { className: 'nova-calendar' });
		this.shadowRoot.appendChild(this.container);
		this.plugins.forEach((p) => p.onShadowReady?.(this));
		if (this.options.hiddenInput) {
			this.hiddenInput = this.options.hiddenInput;
		} else {
			this.hiddenInput = Object.assign(document.createElement('input'), {
				type: 'hidden',
				className: 'nova-calendar-timestamp',
				name: this.trigger && this.trigger.id ? this.trigger.id : this.options.name || 'nova-calendar',
			});
			if (this.trigger && this.trigger.parentNode) {
				this.trigger.parentNode.insertBefore(this.hiddenInput, this.trigger.nextSibling);
			} else {
				document.body.appendChild(this.hiddenInput);
			}
		}
		if (!this.options.inline) {
			this.container.style.display = 'none';
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.showCalendar();
			});
			document.addEventListener('click', (e) => {
				const path = e.composedPath ? e.composedPath() : [];
				if (!(path.includes(this.container) || path.includes(this.shadowHost) || e.target === btn)) this.hideCalendar();
			});
		} else {
			this.container.style.display = 'block';
			this.shadowHost.style.position = 'static';
		}
		this.renderCalendar();
		this.updateHiddenInput();
		let labelEl = this.trigger ? this.trigger.querySelector('.dates') : null;
		if (!labelEl && this.container) labelEl = this.container.querySelector('.dates');
		if (labelEl) this._initialLabelValue = labelEl.textContent;
	}

	showCalendar() {
		if (this.options.inline) return;
		NovaCalendar.instances.forEach((i) => { if (i !== this) i.hideCalendar(); });
		this.container.style.display = 'block';
		const rect = this.trigger.getBoundingClientRect();
		Object.assign(this.shadowHost.style, {
			position: 'absolute',
			left: rect.left + window.scrollX + 'px',
			top: rect.bottom + window.scrollY + 'px',
		});
		this.plugins?.forEach((p) => p.onCalendarOpen?.(this));
	}

	hideCalendar() {
		if (this.options.inline) return;
		this.container.style.display = 'none';
	}

	renderCalendar() {
		this.container.innerHTML = '';
		let rendered = false;
		this.plugins?.forEach((p) => {
			if (typeof p.onRender === 'function') {
				const before = this.container.innerHTML;
				p.onRender(this);
				if (p.name === 'months' && this.container.innerHTML !== before) rendered = true;
			}
		});
		if (!rendered) {
			const header = Object.assign(document.createElement('div'), { className: 'header' });
			const month = this.date.toLocaleString('default', { month: 'long' });
			const year = this.date.getFullYear();
			header.innerHTML = `<span>${month} ${year}</span><span><button class="prev-month">&#8249;</button><button class="next-month">&#8250;</button></span>`;
			this.container.appendChild(header);
			header.querySelector('.prev-month').addEventListener('click', (e) => {
				e.stopPropagation();
				this.date = new Date(this.date.getFullYear(), this.date.getMonth() - 1, 1);
				this.renderCalendar();
				this.updateDayClasses();
			});
			header.querySelector('.next-month').addEventListener('click', (e) => {
				e.stopPropagation();
				this.date = new Date(this.date.getFullYear(), this.date.getMonth() + 1, 1);
				this.renderCalendar();
				this.updateDayClasses();
			});
			const days = this.generateDays(this.date, 0);
			this.container.appendChild(days);
			this.dayElements = [];
			days.querySelectorAll('.day').forEach((dayEl) => this.dayElements.push({ el: dayEl, date: dayEl._date, monthIndex: 0 }));
			if (this.mode === 'multiple') {
				let multiList = this.container.querySelector('.multi-list') || Object.assign(document.createElement('div'), { className: 'multi-list' });
				if (!multiList.parentNode) this.container.appendChild(multiList);
				multiList.innerHTML = '';
				if (this.selectedDates?.length > 0) {
					let filteredDates = [...this.selectedDates];
					const timePlugin = this.plugins.find((p) => p.name === 'timePlugin');
					if (timePlugin && this.hiddenInput && this.hiddenInput.value) {
						try {
							const val = JSON.parse(this.hiddenInput.value || '{}');
							if (val.times) {
								const getDateKey = (d) => { const dt = new Date(d); dt.setUTCHours(0, 0, 0, 0); return dt.getTime(); };
								filteredDates = filteredDates.filter((d) => val.times[getDateKey(d)] && val.times[getDateKey(d)].length > 0);
							}
						} catch (e) {}
					}
					if (timePlugin && filteredDates.length !== this.selectedDates.length) this.selectedDates = filteredDates;
					if (filteredDates.length > 0) {
						filteredDates.sort((a, b) => a - b).forEach((date) => {
							const btn = Object.assign(document.createElement('button'), { className: 'nova-btn remove-date' });
							btn.textContent = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
							btn.onclick = () => {
								this.selectedDates.splice(this.selectedDates.findIndex((d) => d.getTime() === date.getTime()), 1);
								this.updateButtonLabel();
								this.renderCalendar();
								this.updateDayClasses();
								this.updateHiddenInput();
							};
							multiList.appendChild(btn);
						});
					} else {
						const empty = Object.assign(document.createElement('div'), { className: 'multi-date-empty' });
						empty.textContent = 'Aucune date sélectionnée';
						multiList.appendChild(empty);
					}
				} else {
					const empty = Object.assign(document.createElement('div'), { className: 'multi-date-empty' });
					empty.textContent = 'Aucune date sélectionnée';
					multiList.appendChild(empty);
				}
			}
		}
		this.plugins?.forEach((p) => { if (p.name !== 'months' && typeof p.onRender === 'function') p.onRender(this); });
	}

	generateDays(date, monthIndex) {
		const daysContainer = Object.assign(document.createElement('div'), { className: 'days' });
		const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay() || 7;
		const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
		['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach((d) => {
			const dayHeader = Object.assign(document.createElement('div'), { className: 'day-header' });
			dayHeader.textContent = d;
			daysContainer.appendChild(dayHeader);
		});
		for (let i = 1; i < firstDay; i++) daysContainer.appendChild(Object.assign(document.createElement('div'), { className: 'empty' }));
		for (let d = 1; d <= daysInMonth; d++) {
			const currentDate = new Date(date.getFullYear(), date.getMonth(), d), day = Object.assign(document.createElement('div'), { className: 'day' });
			const dayText = Object.assign(document.createElement('div'), { className: 'day-text' });
			dayText.textContent = d;
			day.appendChild(dayText);
			day._date = currentDate;
			day.dataset.monthIndex = monthIndex;
			const today = new Date(); today.setHours(0, 0, 0, 0);
			if (currentDate < today) day.classList.add('before-today');
			day.onclick = () => {
				this._timePluginState = this._timePluginState || {};
				this._timePluginState._lastDateClicked = currentDate;
				this.selectDate(currentDate, monthIndex);
			};
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

	triggerInvalidRangeFeedback() {
		if (!this.container) return;
		this.container.classList.add('invalid-range');
		setTimeout(() => this.container.classList.remove('invalid-range'), 600);
	}

	selectDate(selected, monthIndex) {
		const selectedTime = selected.getTime();
		if (this.mode === 'single') {
			this.selectedDate = selected;
			this.startDate = selected;
			this.updateButtonLabel();
			this.updateDayClasses();
			this.updateHiddenInput();
			this.plugins?.forEach((p) => p.onDateSelected?.(selected, this));
			this.renderCalendar();
			return;
		}
		if (this.mode === 'multiple') {
			const hasTimePlugin = this.plugins?.some((p) => p.name === 'timePlugin');
			if (hasTimePlugin) {
				if (this._timePluginState && this._timePluginState._lastDateClicked && this.dayElements) {
					const lastKey = this._timePluginState._lastDateClicked.getTime();
					this.dayElements.forEach(({ el, date }) => {
						if (date.getTime() === lastKey) el.classList.add('selected');
						else el.classList.remove('selected');
					});
				}
				this._forceTimePluginRender = true;
				this.updateButtonLabel();
				this.updateDayClasses();
				this.updateHiddenInput();
				return;
			}
			const dateKey = selectedTime;
			const index = this.selectedDates.findIndex((d) => d.getTime() === dateKey);
			if (index === -1) this.selectedDates.push(selected);
			else this.selectedDates.splice(index, 1);
			this.updateButtonLabel();
			this.renderCalendar();
			this.updateDayClasses();
			this.updateHiddenInput();
			return;
		}
		const today = new Date(); today.setHours(0, 0, 0, 0);
		const isBeforeToday = selected < today;
		if (this.mode === 'range' && this.months === 2 && this.strictRange2Months) {
			if (!this.startDate || (this.startDate && this.endDate)) {
				if (monthIndex !== 0) { this.triggerInvalidRangeFeedback(); return; }
			} else if (this.startDate && !this.endDate) {
				if (monthIndex !== 1) { this.triggerInvalidRangeFeedback(); return; }
			}
		}
		if (!this.startDate || (this.startDate && this.endDate)) {
			this.startDate = selected;
			this.endDate = this.hoverDate = null;
			this.updateDayClasses();
			this.updateHiddenInput();
		} else if (!isBeforeToday) {
			if (selected.getTime() === this.startDate.getTime()) {
				this.startDate = this.endDate = this.hoverDate = null;
				this.updateDayClasses();
				this.updateHiddenInput();
				this.updateButtonLabel();
				let labelEl = this.trigger ? this.trigger.querySelector('.dates') : null;
				if (!labelEl && this.container) labelEl = this.container.querySelector('.dates');
				if (labelEl) labelEl.textContent = this._initialLabelValue || '';
				return;
			}
			this.endDate = selected;
			this.hoverDate = null;
			this.updateButtonLabel();
			this.updateDayClasses();
			if (!this.options.inline) this.container.style.display = 'none';
			this.updateHiddenInput();
			return;
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
		let fromDate = this.startDate, toDate = this.endDate || (this.startDate && this.hoverDate ? this.hoverDate : null);
		this.dayElements.forEach(({ el, date }) => {
			el.className = 'day';
			const today = new Date(); today.setHours(0, 0, 0, 0);
			if (date.getTime() < today.getTime()) el.classList.add('before-today');
			if (this.mode === 'single' && this.selectedDate && date.getTime() === this.selectedDate.getTime()) el.classList.add('selected');
			if (this.mode === 'multiple' && this.selectedDates?.find((d) => d.getTime() === date.getTime())) el.classList.add('selected');
			if (this.mode === 'range') {
				if (fromDate && toDate) {
					const fromTime = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()).getTime(),
						toTime = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()).getTime(),
						dateTime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
						minTime = Math.min(fromTime, toTime),
						maxTime = Math.max(fromTime, toTime);
					if (dateTime === minTime) el.classList.add('selected', 'range-start');
					else if (dateTime === maxTime) el.classList.add('selected', 'range-end');
					else if (dateTime > minTime && dateTime < maxTime) el.classList.add('in-range');
				}
				if (!toDate && this.hoverDate && fromDate && this.hoverDate.getTime() > fromDate.getTime() && date.getTime() === this.hoverDate.getTime()) el.classList.add('range-end');
				if (!toDate && this.hoverDate && fromDate && this.hoverDate.getTime() < fromDate.getTime() && date.getTime() === this.hoverDate.getTime()) el.classList.add('range-start');
				if (fromDate && !toDate && date.getTime() === fromDate.getTime()) {
					if (this.hoverDate && this.hoverDate.getTime() < fromDate.getTime()) el.classList.add('selected', 'range-end');
					else el.classList.add('selected', 'range-start');
				}
			}
		});
	}

	getDateRangeArray(startDate, endDate) {
		const range = [], dir = startDate < endDate ? 1 : -1;
		let current = new Date(startDate);
		while ((dir > 0 && current <= endDate) || (dir < 0 && current >= endDate)) {
			range.push(new Date(current));
			current.setDate(current.getDate() + dir);
		}
		return range;
	}

	updateButtonLabel() {
		const btn = this.trigger;
		let text = this.options.placeholder || '';
		if (this.mode === 'multiple' && this.selectedDates?.length > 0)
			text = [...this.selectedDates].sort((a, b) => a - b).map((d) => this.formatDisplay(d)).join(', ');
		else if (this.startDate && this.endDate) {
			const d1 = this.startDate, d2 = this.endDate, first = d1.getTime() <= d2.getTime() ? d1 : d2, last = d1.getTime() > d2.getTime() ? d1 : d2;
			text = this.options.format(this.formatDisplay(first), this.formatDisplay(last));
		} else if (this.startDate) text = this.options.format(this.formatDisplay(this.startDate), null);
		let labelEl = btn ? btn.querySelector('.dates') : null;
		if (!labelEl && this.container) labelEl = this.container.querySelector('.dates');
		if (labelEl) {
			if (!this.startDate && !this.endDate && (!this.selectedDates || this.selectedDates.length === 0)) labelEl.textContent = this._initialLabelValue || '';
			else labelEl.textContent = text;
		}
		this.updateHiddenInput();
	}

	formatDisplay(date) {
		return date ? date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '';
	}
	formatDate(date) {
		const year = date.getFullYear(), month = (date.getMonth() + 1).toString().padStart(2, '0'), day = date.getDate().toString().padStart(2, '0');
		return `${year}-${month}-${day}`;
	}
	addPlugin(plugin) {
		this.plugins.push(plugin);
		plugin.onInit?.(this);
	}

	updateHiddenInput() {
		if (!this.hiddenInput) return;
		let value = '';
		if (this.mode === 'single') {
			value = this.selectedDate ? { mode: 'single', dates: [this.selectedDate.getTime()] } : '';
		} else if (this.mode === 'range') {
			const t1 = this.startDate ? this.startDate.getTime() : null, t2 = this.endDate ? this.endDate.getTime() : null;
			if (t1 && t2) value = { mode: 'range', dates: [t1, t2] };
			else if (t1) value = { mode: 'range', dates: [t1] };
			else value = '';
		} else if (this.mode === 'multiple') {
			const arr = this.selectedDates?.length > 0 ? [...this.selectedDates].sort((a, b) => a - b).map((d) => d.getTime()) : [];
			value = arr.length ? { mode: 'multiple', dates: arr } : '';
		}
		this.hiddenInput.value = value ? JSON.stringify(value) : '';
	}
}
