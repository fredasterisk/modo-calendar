// Plugin d'affichage multi-mois pour NovaCalendar
// src/plugins/months/months-plugin.js
import styles from './styles.css?inline';

export function monthsPlugin(options = {}) {
	return {
		name: 'months',
		options,
		onInit(calendar) {
			// Ajoute le style du plugin dans le shadowRoot
			if (
				calendar &&
				calendar.shadowRoot &&
				!calendar.shadowRoot.querySelector('style[data-nova-months]')
			) {
				const style = document.createElement('style');
				style.setAttribute('data-nova-months', '');
				style.textContent = styles;
				calendar.shadowRoot.appendChild(style);
			}
			// Définit le nombre de mois à 2 par défaut si non précisé ou si < 2
			let nbMonths = 2;
			if (
				options.months &&
				typeof options.months === 'number' &&
				options.months >= 2
			) {
				nbMonths = options.months;
			}
			calendar.months = nbMonths;
		},
		onRender(calendar) {
			// Toujours afficher 2 mois minimum
			if (!calendar.months || calendar.months < 2) {
				calendar.months = 2;
			}
			// Remplace le rendu du calendrier par un rendu multi-mois uniquement si months >= 2
			if (!calendar.months || calendar.months < 2) {
				// Ne rien faire, laisser le rendu par défaut du calendrier
				return;
			}
			calendar.container.innerHTML = '';
			if (
				!calendar.monthOffsets ||
				calendar.monthOffsets.length !== calendar.months
			) {
				calendar.monthOffsets = Array(calendar.months).fill(0);
			}
			const baseDate = new Date(calendar.date);
			calendar.dayElements = [];

			const monthsWrapper = document.createElement('div');
			monthsWrapper.className = 'nova-months-wrapper';
			calendar.container.appendChild(monthsWrapper);

			for (let i = 0; i < calendar.months; i++) {
				const offset = calendar.monthOffsets[i] || 0;
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
					if (idx === 0 && (calendar.monthOffsets[0] || 0) <= 0) return;
					if (idx > 0) {
						const prevMonthDate = new Date(
							baseDate.getFullYear(),
							baseDate.getMonth() +
								idx -
								1 +
								(calendar.monthOffsets[idx - 1] || 0),
							1
						);
						const newMonthDate = new Date(
							baseDate.getFullYear(),
							baseDate.getMonth() + idx + (calendar.monthOffsets[idx] || 0) - 1,
							1
						);
						if (newMonthDate <= prevMonthDate) return;
					}
					calendar.monthOffsets[idx] = (calendar.monthOffsets[idx] || 0) - 1;
					for (let j = idx + 1; j < calendar.months; j++) {
						const prevMonthDate = new Date(
							baseDate.getFullYear(),
							baseDate.getMonth() + j - 1 + (calendar.monthOffsets[j - 1] || 0),
							1
						);
						const nextMonthDate = new Date(
							baseDate.getFullYear(),
							baseDate.getMonth() + j + (calendar.monthOffsets[j] || 0),
							1
						);
						if (nextMonthDate <= prevMonthDate) {
							calendar.monthOffsets[j] =
								prevMonthDate.getMonth() -
								baseDate.getMonth() +
								1 +
								(prevMonthDate.getFullYear() - baseDate.getFullYear()) * 12 -
								j;
						}
					}
					calendar.renderCalendar();
					calendar.updateDayClasses();
				});
				header.querySelector('.next-month')?.addEventListener('click', (e) => {
					e.stopPropagation();
					const idx = +e.currentTarget.getAttribute('data-month');
					if (idx > 0) {
						const prevMonthDate = new Date(
							baseDate.getFullYear(),
							baseDate.getMonth() +
								idx -
								1 +
								(calendar.monthOffsets[idx - 1] || 0),
							1
						);
						const newMonthDate = new Date(
							baseDate.getFullYear(),
							baseDate.getMonth() + idx + (calendar.monthOffsets[idx] || 0) + 1,
							1
						);
						if (newMonthDate <= prevMonthDate) return;
					}
					calendar.monthOffsets[idx] = (calendar.monthOffsets[idx] || 0) + 1;
					for (let j = idx + 1; j < calendar.months; j++) {
						const prevMonthDate = new Date(
							baseDate.getFullYear(),
							baseDate.getMonth() + j - 1 + (calendar.monthOffsets[j - 1] || 0),
							1
						);
						const nextMonthDate = new Date(
							baseDate.getFullYear(),
							baseDate.getMonth() + j + (calendar.monthOffsets[j] || 0),
							1
						);
						if (nextMonthDate <= prevMonthDate) {
							calendar.monthOffsets[j] =
								prevMonthDate.getMonth() -
								baseDate.getMonth() +
								1 +
								(prevMonthDate.getFullYear() - baseDate.getFullYear()) * 12 -
								j;
						}
					}
					calendar.renderCalendar();
					calendar.updateDayClasses();
				});

				const days = calendar.generateDays(monthDate, i);
				monthCol.appendChild(days);
				days.querySelectorAll('.day').forEach((dayEl) => {
					calendar.dayElements.push({
						el: dayEl,
						date: dayEl._date,
						monthIndex: i,
					});
				});
			}
			// Ajout : affichage de la liste des dates sélectionnées en mode multiple
			if (calendar.mode === 'multiple') {
				let multiList = calendar.container.querySelector('.multi-list');
				if (!multiList) {
					multiList = document.createElement('div');
					multiList.className = 'multi-list';
					calendar.container.appendChild(multiList);
				}
				multiList.innerHTML = '';
				if (calendar.selectedDates && calendar.selectedDates.length > 0) {
					[...calendar.selectedDates]
						.sort((a, b) => a - b)
						.forEach((date, idx) => {
							const btn = document.createElement('button');
							btn.className = 'nova-btn remove-date';
							btn.textContent = date.toLocaleDateString('fr-FR', {
								day: '2-digit',
								month: 'short',
							});
							btn.onclick = (e) => {
								calendar.selectedDates.splice(idx, 1);
								calendar.updateButtonLabel();
								calendar.renderCalendar();
								calendar.updateDayClasses();
								calendar.updateHiddenInput();
							};
							multiList.appendChild(btn);
						});
				} else {
					const empty = document.createElement('div');
					empty.className = 'multi-date-empty';
					empty.textContent = 'Aucune date sélectionnée';
					multiList.appendChild(empty);
				}
			}
			calendar.plugins?.forEach((p) => {
				if (p.name !== 'months' && typeof p.onRender === 'function')
					p.onRender(calendar);
			});
		},
	};
}
