export class NovaCalendar {
	constructor(options = {}) {
		this.options = options;
		this.date = new Date();
		this.startDate = null;
		this.endDate = null;
		this.hoverDate = null;
		this.blockedDates = [];
	}

	static parseYMD(str) {
		// str doit être au format YYYY-MM-DD
		const [y, m, d] = str.split('-').map(Number);
		return new Date(y, m - 1, d); // monthIndex: 0 pour janvier !
	}

	setRange(start, end) {
		const startDate = NovaCalendar.parseYMD(start);
		const endDate = end ? NovaCalendar.parseYMD(end) : null;
		this.startDate = startDate;
		this.endDate = endDate;
		this.hoverDate = null;
		console.log('setRange this:', this);
		this.updateInput();
		console.log('Avant renderCalendar', this.startDate, this.endDate);
		this.renderCalendar();
		this.updateDayClasses();
	}

	setBlockedDates(dates) {
		this.blockedDates = dates.map((d) => {
			const dateObj = new Date(d);
			dateObj.setHours(0, 0, 0, 0);
			return dateObj.getTime();
		});
		this.renderCalendar();
		this.updateDayClasses();
	}

	attachTo(selector) {
		const input = document.querySelector(selector);
		if (!input) return;

		const container = document.createElement('div');
		container.className = 'nova-calendar';
		container.style.display = 'none';
		this.container = container;
		this.input = input;

		this.renderCalendar(); // Un seul render au départ
		input.insertAdjacentElement('afterend', container);

		input.addEventListener('focus', () => {
			container.style.display = 'block';
		});

		document.addEventListener('click', (e) => {
			if (!container.contains(e.target) && e.target !== input) {
				container.style.display = 'none';
			}
		});
	}

	renderCalendar() {
		console.log('renderCalendar', this.date, this.startDate, this.endDate);
		const month = this.date.toLocaleString('default', { month: 'long' });
		const year = this.date.getFullYear();

		if (!this.container.querySelector('.header')) {
			const header = document.createElement('div');
			header.classList.add('header');
			header.innerHTML = `
            <button class="prev-month">&#8249;</button>
            <span>${month} ${year}</span>
            <button class="next-month">&#8250;</button>
        `;
			this.container.appendChild(header);

			header.querySelector('.prev-month').onclick = () => {
				this.date.setMonth(this.date.getMonth() - 1);
				this.renderCalendar();
				this.updateDayClasses();
			};
			header.querySelector('.next-month').onclick = () => {
				this.date.setMonth(this.date.getMonth() + 1);
				this.renderCalendar();
				this.updateDayClasses();
			};
		} else {
			this.container.querySelector(
				'.header span'
			).textContent = `${month} ${year}`;
		}

		const existingDays = this.container.querySelector('.days');
		if (existingDays) {
			this.container.removeChild(existingDays);
		}

		let days = this.generateDays(this.date);
		this.container.appendChild(days);
	}

	generateDays(date) {
		const daysContainer = document.createElement('div');
		daysContainer.className = 'days';
		this.dayElements = [];

		const firstDay =
			new Date(date.getFullYear(), date.getMonth(), 1).getDay() || 7;
		const daysInMonth = new Date(
			date.getFullYear(),
			date.getMonth() + 1,
			0
		).getDate();

		const weekdays = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
		weekdays.forEach((d) => {
			const dayHeader = document.createElement('div');
			dayHeader.textContent = d;
			dayHeader.className = 'day-header';
			daysContainer.appendChild(dayHeader);
		});

		for (let i = 1; i < firstDay; i++) {
			const empty = document.createElement('div');
			empty.className = 'empty';
			daysContainer.appendChild(empty);
		}

		for (let d = 1; d <= daysInMonth; d++) {
			const currentDate = new Date(date.getFullYear(), date.getMonth(), d);
			const day = document.createElement('div');
			const dayText = document.createElement('div');
			dayText.className = 'day-text';
			dayText.textContent = d;
			day.appendChild(dayText);
			day.textContent = d;
			day.className = 'day';
			const dateTime = currentDate.getTime();
			// Bloquer les dates définies dans blockedDates
			if (this.blockedDates && this.blockedDates.includes(dateTime)) {
				day.classList.add('blocked');
			}
			// Ajout de la classe .before-today si la date est avant aujourd'hui
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			if (currentDate < today) {
				day.classList.add('before-today');
			}

			// Stocke la référence et la date
			this.dayElements.push({ el: day, date: currentDate });

			day.onclick = () => this.selectDate(d);
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
		// Ajouter des jours vides à la fin du mois
		return daysContainer;
	}

	updateDayClasses() {
		console.log(
			'updateDayClasses',
			this.startDate,
			this.endDate,
			this.dayElements.length
		);

		if (!this.dayElements) return;
		let fromDate = this.startDate;
		let toDate =
			this.endDate ||
			(this.startDate && this.hoverDate ? this.hoverDate : null);
		this.dayElements.forEach(({ el, date }) => {
			// Always start with 'day' class
			el.className = 'day';

			// Re-apply .blocked if date is blocked
			const dateTime = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
			if (this.blockedDates && this.blockedDates.includes(dateTime)) {
				el.classList.add('blocked');
				el.style.pointerEvents = 'none';
				el.style.opacity = 0.5;
			}

			// Ajout de la classe .before-today si la date est avant aujourd'hui
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const isBeforeToday = date.getTime() < today.getTime();
			if (isBeforeToday) {
				el.classList.add('before-today');
			}

			// Ajout des classes range-start et range-end
			if (fromDate && toDate) {
				// Force à minuit partout
				const fromTime = new Date(
					fromDate.getFullYear(),
					fromDate.getMonth(),
					fromDate.getDate()
				).getTime();
				const toTime = new Date(
					toDate.getFullYear(),
					toDate.getMonth(),
					toDate.getDate()
				).getTime();
				const dateTime = new Date(
					date.getFullYear(),
					date.getMonth(),
					date.getDate()
				).getTime();

				const minTime = Math.min(fromTime, toTime);
				const maxTime = Math.max(fromTime, toTime);

				if (dateTime === minTime) {
					console.log('range-start', date, minTime, dateTime);
					el.classList.add('selected', 'range-start');
				} else if (dateTime === maxTime) {
					console.log('range-end', date, maxTime, dateTime);
					el.classList.add('selected', 'range-end');
				} else if (dateTime > minTime && dateTime < maxTime) {
					el.classList.add('in-range');
				}
			}

			// Hover classique (hover après start)
			if (
				!toDate &&
				this.hoverDate &&
				fromDate &&
				this.hoverDate.getTime() > fromDate.getTime() &&
				date.getTime() === this.hoverDate.getTime()
			) {
				el.classList.add('range-end');
			}
			// Hover inversé (hover avant start)
			if (
				!toDate &&
				this.hoverDate &&
				fromDate &&
				this.hoverDate.getTime() < fromDate.getTime() &&
				!isBeforeToday &&
				date.getTime() === this.hoverDate.getTime()
			) {
				el.classList.add('range-start');
			}

			// Affichage de la première date sélectionnée si aucune endDate
			if (fromDate && !toDate && date.getTime() === fromDate.getTime()) {
				// Si hoverDate existe et est avant startDate, la startDate devient range-end
				if (this.hoverDate && this.hoverDate.getTime() < fromDate.getTime()) {
					el.classList.add('selected', 'range-end');
				} else {
					el.classList.add('selected', 'range-start');
				}
			}
		});
	}

	resetSelection() {
		this.startDate = null;
		this.endDate = null;
		this.hoverDate = null;
		this.input.value = '';
	}

	selectDate(day) {
		const selected = new Date(
			this.date.getFullYear(),
			this.date.getMonth(),
			day
		);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const isBeforeToday = selected < today;

		if (!this.startDate || (this.startDate && this.endDate)) {
			this.startDate = selected;
			this.endDate = null;
			this.hoverDate = null;
			this.updateDayClasses();
		} else {
			// Permettre la sélection d'une date de fin avant la startDate, sauf si elle est before-today
			if (!isBeforeToday) {
				this.endDate = selected;
				this.hoverDate = null;
				this.updateInput();
				this.updateDayClasses();
				this.container.style.display = 'none';
			} else {
				// Si before-today, on redémarre la sélection
				this.startDate = selected;
				this.endDate = null;
				this.hoverDate = null;
				this.updateDayClasses();
			}
		}
	}

	updateInput() {
		if (this.startDate && this.endDate) {
			this.input.value = `${this.formatDate(
				this.startDate
			)} au ${this.formatDate(this.endDate)}`;
		} else if (this.startDate) {
			this.input.value = this.formatDate(this.startDate);
		}
		if (this.startDate && this.endDate) {
			const event = new CustomEvent('rangeSelected', {
				detail: {
					start: this.formatDate(this.startDate),
					end: this.formatDate(this.endDate),
				},
			});
			this.input.dispatchEvent(event);
		}
	}

	formatDate(date) {
		const year = date.getFullYear();
		const month = (date.getMonth() + 1).toString().padStart(2, '0');
		const day = date.getDate().toString().padStart(2, '0');
		return `${year}-${month}-${day}`;
	}
}
