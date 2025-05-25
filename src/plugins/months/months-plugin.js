// Multi-month display plugin for NovaCalendar
// src/plugins/months/months-plugin.js
import pluginStyles from './styles.css?raw';
function injectCSS(shadowRoot) {
	if (!shadowRoot) return;
	if (shadowRoot.getElementById('months-plugin-css')) return;
	const style = document.createElement('style');
	style.id = 'months-plugin-css';
	style.textContent = pluginStyles;
	shadowRoot.appendChild(style);
}

export function monthsPlugin(options = {}) {
	return {
		name: 'months',
		options,
		onShadowReady(calendarInstance) {
			injectCSS(calendarInstance.shadowRoot);
		},
		onInit(calendar) {
			calendar.months = (typeof options.months === 'number' && options.months >= 2) ? options.months : 2;
		},
		onRender(calendar) {
			if (!calendar.months || calendar.months < 2) calendar.months = 2;
			calendar.container.innerHTML = '';
			if (!calendar.monthOffsets || calendar.monthOffsets.length !== calendar.months) calendar.monthOffsets = Array(calendar.months).fill(0);
			const baseDate = new Date(calendar.date);
			calendar.dayElements = [];
			const monthsWrapper = document.createElement('div');
			monthsWrapper.className = 'nova-months-wrapper';
			calendar.container.appendChild(monthsWrapper);
			for (let i = 0; i < calendar.months; i++) {
				const offset = calendar.monthOffsets[i] || 0;
				const monthDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + i + offset, 1);
				const month = monthDate.toLocaleString('default', { month: 'long' }), year = monthDate.getFullYear();
				const monthCol = document.createElement('div');
				monthCol.className = 'nova-month-col';
				monthsWrapper.appendChild(monthCol);
				const header = document.createElement('div');
				header.classList.add('header');
				header.innerHTML = `<span>${month} ${year}</span><span><button class="prev-month" data-month="${i}">&#8249;</button><button class="next-month" data-month="${i}">&#8250;</button></span>`;
				monthCol.appendChild(header);
				header.querySelector('.prev-month')?.addEventListener('click', (e) => {
					e.stopPropagation();
					const idx = +e.currentTarget.getAttribute('data-month');
					if (idx === 0 && (calendar.monthOffsets[0] || 0) <= 0) return;
					if (idx > 0) {
						const prevMonthDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + idx - 1 + (calendar.monthOffsets[idx - 1] || 0), 1);
						const newMonthDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + idx + (calendar.monthOffsets[idx] || 0) - 1, 1);
						if (newMonthDate <= prevMonthDate) return;
					}
					calendar.monthOffsets[idx] = (calendar.monthOffsets[idx] || 0) - 1;
					for (let j = idx + 1; j < calendar.months; j++) {
						const prevMonthDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + j - 1 + (calendar.monthOffsets[j - 1] || 0), 1);
						const nextMonthDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + j + (calendar.monthOffsets[j] || 0), 1);
						if (nextMonthDate <= prevMonthDate) {
							calendar.monthOffsets[j] = prevMonthDate.getMonth() - baseDate.getMonth() + 1 + (prevMonthDate.getFullYear() - baseDate.getFullYear()) * 12 - j;
						}
					}
					calendar.renderCalendar();
					calendar.updateDayClasses();
				});
				header.querySelector('.next-month')?.addEventListener('click', (e) => {
					e.stopPropagation();
					const idx = +e.currentTarget.getAttribute('data-month');
					if (idx > 0) {
						const prevMonthDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + idx - 1 + (calendar.monthOffsets[idx - 1] || 0), 1);
						const newMonthDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + idx + (calendar.monthOffsets[idx] || 0) + 1, 1);
						if (newMonthDate <= prevMonthDate) return;
					}
					calendar.monthOffsets[idx] = (calendar.monthOffsets[idx] || 0) + 1;
					for (let j = idx + 1; j < calendar.months; j++) {
						const prevMonthDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + j - 1 + (calendar.monthOffsets[j - 1] || 0), 1);
						const nextMonthDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + j + (calendar.monthOffsets[j] || 0), 1);
						if (nextMonthDate <= prevMonthDate) {
							calendar.monthOffsets[j] = prevMonthDate.getMonth() - baseDate.getMonth() + 1 + (prevMonthDate.getFullYear() - baseDate.getFullYear()) * 12 - j;
						}
					}
					calendar.renderCalendar();
					calendar.updateDayClasses();
				});
				const days = calendar.generateDays(monthDate, i);
				monthCol.appendChild(days);
				days.querySelectorAll('.day').forEach((dayEl) => {
					calendar.dayElements.push({ el: dayEl, date: dayEl._date, monthIndex: i });
				});
			}
			if (calendar.mode === 'multiple') {
				let multiList = calendar.container.querySelector('.multi-list');
				if (!multiList) {
					multiList = document.createElement('div');
					multiList.className = 'multi-list';
					calendar.container.appendChild(multiList);
				}
				multiList.innerHTML = '';
				let filteredDates = [...(calendar.selectedDates || [])];
				const timePlugin = calendar.plugins?.find((p) => p.name === 'timePlugin');
				if (timePlugin && calendar.hiddenInput && calendar.hiddenInput.value) {
					try {
						const val = JSON.parse(calendar.hiddenInput.value || '{}');
						if (val.times) {
							const getDateKey = (d) => { const dt = new Date(d); dt.setUTCHours(0, 0, 0, 0); return dt.getTime(); };
							filteredDates = filteredDates.filter((d) => val.times[getDateKey(d)] && val.times[getDateKey(d)].length > 0);
						}
					} catch (e) {}
				}
				if (timePlugin && calendar._timePluginState && calendar._timePluginState._lastDateClicked) {
					const getDateKey = (d) => { const dt = new Date(d); dt.setUTCHours(0, 0, 0, 0); return dt.getTime(); };
					const lastKey = getDateKey(calendar._timePluginState._lastDateClicked);
					if (!filteredDates.some((d) => getDateKey(d) === lastKey)) filteredDates.push(new Date(Number(lastKey)));
				}
				if (filteredDates.length > 0) {
					filteredDates.sort((a, b) => a - b).forEach((date) => {
						const btn = Object.assign(document.createElement('button'), { className: 'nova-btn remove-date' });
						btn.textContent = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
						btn.onclick = () => {
							calendar.selectedDates.splice(calendar.selectedDates.findIndex((d) => d.getTime() === date.getTime()), 1);
							calendar.updateButtonLabel();
							calendar.renderCalendar();
							calendar.updateDayClasses();
							calendar.updateHiddenInput();
						};
						multiList.appendChild(btn);
					});
				} else {
					const empty = Object.assign(document.createElement('div'), { className: 'multi-date-empty' });
					empty.textContent = 'Aucune date sélectionnée';
					multiList.appendChild(empty);
				}
			}
		},
	};
}
