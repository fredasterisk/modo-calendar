import styles from './styles.css?inline';

// Squelette minimal pour débloquer le build
export function timePlugin(options = {}) {
	return {
		name: 'timePlugin',
		options,
		onInit(calendar) {
			const injectStyle = (css) => {
				if (
					calendar &&
					calendar.shadowRoot &&
					!calendar.shadowRoot.querySelector('style[data-nova-time]')
				) {
					const style = document.createElement('style');
					style.setAttribute('data-nova-time', '');
					style.textContent = css;
					calendar.shadowRoot.appendChild(style);
				}
			};
			console.log(styles);
			injectStyle(styles);
			calendar._timePluginState = {
				selectedTime: null,
				blocks: [],
			};
		},
		onRender(calendar) {
			const container = calendar.container;
			// Affiche le bloc horaire seulement si une date est sélectionnée (single), ou plage complète (range), ou au moins une date (multiple)
			let showTime = false;
			let selectedDate = null;
			if (calendar.mode === 'single' && calendar.selectedDate) {
				showTime = true;
				selectedDate = calendar.selectedDate;
			} else if (
				calendar.mode === 'range' &&
				calendar.startDate &&
				calendar.endDate
			) {
				showTime = true;
				selectedDate = [calendar.startDate, calendar.endDate];
			} else if (
				calendar.mode === 'multiple' &&
				calendar.selectedDates &&
				calendar.selectedDates.length > 0
			) {
				showTime = true;
				selectedDate = calendar.selectedDates;
			}
			let timeBlockDiv = container.querySelector('.nova-time-blocks');
			if (!showTime) {
				if (timeBlockDiv) timeBlockDiv.remove();
				return;
			}
			if (!timeBlockDiv) {
				timeBlockDiv = document.createElement('div');
				timeBlockDiv.className = 'nova-time-blocks';
				// Toujours insérer juste après le premier .days
				const days = container.querySelector('.days');
				if (days) {
					if (days.nextSibling !== timeBlockDiv) {
						container.insertBefore(timeBlockDiv, days.nextSibling);
					}
				} else {
					container.appendChild(timeBlockDiv);
				}
			} else {
				// Si le bloc existe déjà, on le replace juste après .days si besoin
				const days = container.querySelector('.days');
				if (days && days.nextSibling !== timeBlockDiv) {
					container.insertBefore(timeBlockDiv, days.nextSibling);
				}
			}
			// Génération des blocs horaires dynamiquement selon la date sélectionnée
			const from = options.from || '08:00';
			const to = options.to || '16:00';
			const interval =
				typeof options.interval === 'number' ? options.interval : 60; // minutes
			const disabledTimes = Array.isArray(options.disabledTimes)
				? options.disabledTimes
				: [];
			const blocks = [];
			const [fromH, fromM] = from.split(':').map(Number);
			const [toH, toM] = to.split(':').map(Number);
			let cur = new Date(0, 0, 0, fromH, fromM, 0, 0);
			const end = new Date(0, 0, 0, toH, toM, 0, 0);
			timeBlockDiv.innerHTML = '';
			while (cur < end) {
				const next = new Date(cur.getTime() + interval * 60000);
				if (next > end) break;
				const label = cur.toLocaleTimeString('fr-FR', {
					hour: '2-digit',
					minute: '2-digit',
				});
				const nextLabel = next.toLocaleTimeString('fr-FR', {
					hour: '2-digit',
					minute: '2-digit',
				});
				const blockKey = label + ' - ' + nextLabel;
				const isBlocked =
					typeof options.isTimeBlocked === 'function'
						? options.isTimeBlocked(label, selectedDate)
						: disabledTimes.includes(label);
				const btn = document.createElement('button');
				btn.className =
					'nova-time-block nova-btn' + (isBlocked ? ' blocked' : '');
				btn.textContent = blockKey;
				btn.disabled = !!isBlocked;
				btn.onclick = () => {
					calendar._timePluginState.selectedTime = blockKey;
					[...timeBlockDiv.querySelectorAll('.nova-time-block')].forEach((b) =>
						b.classList.remove('selected')
					);
					btn.classList.add('selected');
					calendar.plugins?.forEach((p) =>
						p.onTimeSelected?.(blockKey, calendar)
					);
				};
				timeBlockDiv.appendChild(btn);
				blocks.push({ label: blockKey, blocked: !!isBlocked });
				cur = next;
			}
			calendar._timePluginState.blocks = blocks;
		},
		onDateSelected(date, calendar) {
			// Peut-être vider la sélection de l'heure si la date change
			calendar._timePluginState.selectedTime = null;
		},
	};
}
