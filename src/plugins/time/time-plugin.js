import styles from './styles.css?inline';

/**
 * Plugin de sélection horaire pour le calendrier
 *
 * @param {Object} options
 * @param {boolean} [options.multiple=false] Permet la sélection de plusieurs blocs horaires par date
 * @param {string} [options.from='08:00'] Heure de début des blocs horaires
 * @param {string} [options.to='16:00'] Heure de fin des blocs horaires
 * @param {number} [options.interval=60] Intervalle en minutes entre les blocs horaires
 * @param {Array<string>} [options.disabledTimes] Liste des heures bloquées (format 'HH:MM')
 * @param {function} [options.isTimeBlocked] Fonction personnalisée pour déterminer si un horaire est bloqué
 * @returns {Object} Plugin pour le calendrier
 */
export function timePlugin(options = {}) {
	const allowMultiple = !!options.multiple; // options.multiple : true pour activer la sélection multiple de blocs
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
			injectStyle(styles);
			calendar._timePluginState = {
				selectedTimes: {}, // { timestamp: [blocs] }
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
				// Si le bloc existe déjà, on lereplace juste après .days si besoin
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
					const multiple = !!options.multiple;
					const mode = calendar.mode;
					let val = {};
					if (calendar.hiddenInput && calendar.hiddenInput.value) {
						try {
							val = JSON.parse(calendar.hiddenInput.value || '{}');
						} catch (e) {}
					}

					// Helper pour obtenir la clé date (timestamp UTC à minuit)
					const getDateKey = (d) => {
						const dt = new Date(d);
						dt.setUTCHours(0, 0, 0, 0);
						return dt.getTime();
					};

					if (mode === 'range') {
						// Deux dates : startDate et endDate
						const [start, end] = [calendar.startDate, calendar.endDate];
						if (!start || !end) return;
						val.times = val.times || {};
						const startKey = getDateKey(start);
						const endKey = getDateKey(end);
						// Sélectionne pour start ou end selon le bouton cliqué (toggle)
						const isStart =
							!val.times[startKey] || val.times[startKey].length === 0;
						if (isStart) {
							val.times[startKey] = [blockKey];
						} else {
							val.times[endKey] = [blockKey];
						}
						// UI: highlight
						[...timeBlockDiv.querySelectorAll('.nova-time-block')].forEach(
							(b) => b.classList.remove('selected')
						);
						// Marque le bouton sélectionné
						btn.classList.add('selected');
					} else {
						// single ou multiple
						let dates = [];
						if (mode === 'single') {
							dates = [calendar.selectedDate];
						} else if (mode === 'multiple') {
							dates = calendar.selectedDates || [];
						}
						val.times = val.times || {};
						// Pour chaque date sélectionnée, toggle le bloc d'heure
						dates.forEach((d) => {
							const key = getDateKey(d);
							val.times[key] = val.times[key] || [];
							if (multiple) {
								// toggle: ajoute ou retire
								const idx = val.times[key].indexOf(blockKey);
								if (idx === -1) {
									val.times[key].push(blockKey);
									btn.classList.add('selected');
								} else {
									val.times[key].splice(idx, 1);
									btn.classList.remove('selected');
								}
							} else {
								// single: un seul bloc par date
								val.times[key] = [blockKey];
								[...timeBlockDiv.querySelectorAll('.nova-time-block')].forEach(
									(b) => b.classList.remove('selected')
								);
								btn.classList.add('selected');
							}
						});
					}
					calendar.hiddenInput.value = JSON.stringify(val);
					calendar.plugins?.forEach((p) =>
						p.onTimeSelected?.(blockKey, calendar)
					);
				};
				timeBlockDiv.appendChild(btn);
				blocks.push({ label: blockKey, blocked: !!isBlocked });
				cur = next;
			}
			calendar._timePluginState.blocks = blocks;

			// Ajout : sur chaque update, on synchronise la sélection UI selon val.times
			if (calendar.hiddenInput && calendar.hiddenInput.value) {
				try {
					const val = JSON.parse(calendar.hiddenInput.value || '{}');
					if (val.times) {
						const getDateKey = (d) => {
							const dt = new Date(d);
							dt.setUTCHours(0, 0, 0, 0);
							return dt.getTime();
						};
						let dates = [];
						if (calendar.mode === 'range') {
							if (calendar.startDate) dates.push(calendar.startDate);
							if (calendar.endDate) dates.push(calendar.endDate);
						} else if (calendar.mode === 'single') {
							if (calendar.selectedDate) dates.push(calendar.selectedDate);
						} else if (calendar.mode === 'multiple') {
							if (calendar.selectedDates) dates = calendar.selectedDates;
						}
						[...timeBlockDiv.querySelectorAll('.nova-time-block')].forEach(
							(b) => {
								b.classList.remove('selected');
								const blockKey = b.textContent;
								dates.forEach((d) => {
									const key = getDateKey(d);
									if (val.times[key] && val.times[key].includes(blockKey)) {
										b.classList.add('selected');
									}
								});
							}
						);
					}
				} catch (e) {}
			}
		},
		onDateSelected(date, calendar) {
			// En mode multiple, on ne supprime que les blocs horaires des dates désélectionnées
			if (calendar.mode === 'multiple' && calendar.selectedDates) {
				if (calendar.hiddenInput && calendar.hiddenInput.value) {
					try {
						const val = JSON.parse(calendar.hiddenInput.value || '{}');
						if (val.times) {
							const getDateKey = (d) => {
								const dt = new Date(d);
								dt.setUTCHours(0, 0, 0, 0);
								return dt.getTime();
							};
							const selectedKeys = new Set(
								calendar.selectedDates.map(getDateKey)
							);
							for (const key of Object.keys(val.times)) {
								if (!selectedKeys.has(Number(key))) {
									delete val.times[key];
								}
							}
							// Si plus aucune date n'a de bloc, on supprime la clé times
							if (Object.keys(val.times).length === 0) delete val.times;
							calendar.hiddenInput.value = JSON.stringify(val);
						}
					} catch (e) {}
				}
				return;
			}
			// Pour single/range, comportement inchangé (reset)
			if (calendar.mode === 'single' && calendar.selectedDate) {
				calendar._timePluginState.selectedTimes = {};
			}
			if (calendar.mode === 'range') {
				calendar._timePluginState.selectedTimes = {};
			}
			// Nettoie la clé times du hidden input pour single/range
			if (
				(calendar.mode === 'single' || calendar.mode === 'range') &&
				calendar.hiddenInput &&
				calendar.hiddenInput.value
			) {
				try {
					const val = JSON.parse(calendar.hiddenInput.value || '{}');
					delete val.times;
					calendar.hiddenInput.value = JSON.stringify(val);
				} catch (e) {}
			}
		},
	};
}
