import pluginStyles from './styles.css?raw';

function injectCSS(shadowRoot) {
	if (!shadowRoot) return;
	if (shadowRoot.getElementById('months-plugin-css')) return;
	fetch(new URL('./styles.css', import.meta.url))
		.then((r) => r.text())
		.then(() => {
			const style = document.createElement('style');
			style.id = 'months-plugin-css';
			style.textContent = pluginStyles;
			shadowRoot.appendChild(style);
		});
}

function getDateKey(d) {
	const dt = new Date(d);
	dt.setUTCHours(0, 0, 0, 0);
	return dt.getTime();
}

// NovaCalendar time selection plugin (single mode only)
export function timePlugin(options = {}) {
	return {
		name: 'timePlugin',
		options,
		onShadowReady(calendarInstance) {
			injectCSS(calendarInstance.shadowRoot);
		},
		onInit(calendar) {
			calendar._timePluginState = {
				selectedTimes: {},
				_lastDateClicked: null,
			};

			const originalUpdateHiddenInput =
				calendar.updateHiddenInput?.bind(calendar) || (() => {});
			calendar.updateHiddenInput = function () {
				const { selectedDates, selectedTimes } = calendar;
				if (selectedDates?.length === 1 && selectedTimes) {
					const key = selectedDates[0].getTime();
					const blockKey = selectedTimes[key];
					if (blockKey) {
						const [fromLabel, toLabel] = blockKey.split(' - ');
						const [fromHour, fromMinute] = fromLabel.split(':').map(Number);
						const [toHour, toMinute] = toLabel.split(':').map(Number);
						const d = selectedDates[0];
						const fromTimestamp = new Date(
							d.getFullYear(),
							d.getMonth(),
							d.getDate(),
							fromHour,
							fromMinute
						).getTime();
						const toTimestamp = new Date(
							d.getFullYear(),
							d.getMonth(),
							d.getDate(),
							toHour,
							toMinute
						).getTime();
						calendar.hiddenInput.value = JSON.stringify({
							mode: 'single',
							dates: [key],
							time: [fromTimestamp, toTimestamp],
						});
						return;
					}
				}
				originalUpdateHiddenInput();
			};

			const originalUpdateButtonLabel =
				calendar.updateButtonLabel?.bind(calendar) || (() => {});
			calendar.updateButtonLabel = function () {
				let activeDate =
					calendar._timePluginState?._lastDateClicked || calendar.selectedDates?.[0];
				if (activeDate && !(activeDate instanceof Date)) activeDate = new Date(activeDate);
				const key = activeDate ? getDateKey(activeDate) : null;
				const selectedTimes = calendar._timePluginState?.selectedTimes || {};
				const blockKey = key && selectedTimes[key] ? selectedTimes[key] : null;
				const labelDiv = calendar.trigger?.querySelector('.dates');
				if (activeDate && blockKey && labelDiv) {
					labelDiv.textContent = `${activeDate.toLocaleDateString('fr-FR', {
						day: '2-digit',
						month: 'long',
						year: 'numeric',
					})} · ${blockKey}`;
					return;
				}
				originalUpdateButtonLabel();
			};
		},
		onRender(calendar) {
			const container = calendar.container;
			let activeDate = calendar._timePluginState._lastDateClicked;
			if (activeDate && !(activeDate instanceof Date)) activeDate = new Date(activeDate);
			if (!activeDate) {
				const timeBlockDiv = container.querySelector('.nova-time-blocks');
				if (timeBlockDiv) timeBlockDiv.remove();
				return;
			}
			const selectedTimes = calendar._timePluginState.selectedTimes || {};
			const key = getDateKey(activeDate);
			let timeBlockDiv = container.querySelector('.nova-time-blocks');
			if (!timeBlockDiv) {
				timeBlockDiv = document.createElement('div');
				timeBlockDiv.className = 'nova-time-blocks';
				const days = container.querySelector('.days');
				if (days) container.insertBefore(timeBlockDiv, days.nextSibling);
				else container.appendChild(timeBlockDiv);
			} else {
				const days = container.querySelector('.days');
				if (days && days.nextSibling !== timeBlockDiv) {
					container.insertBefore(timeBlockDiv, days.nextSibling);
				}
			}
			timeBlockDiv.innerHTML = '';

			const from = options.from || '08:00';
			const to = options.to || '16:00';
			const interval = typeof options.interval === 'number' ? options.interval : 60;
			const disabledTimes = Array.isArray(options.disabledTimes) ? options.disabledTimes : [];
			const [fromH, fromM] = from.split(':').map(Number);
			const [toH, toM] = to.split(':').map(Number);
			let cur = new Date(0, 0, 0, fromH, fromM, 0, 0);
			const end = new Date(0, 0, 0, toH, toM, 0, 0);
			const selectedBlock = key && selectedTimes[key] ? selectedTimes[key] : null;

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
				const blockKey = `${label} - ${nextLabel}`;
				const isBlocked = typeof options.isTimeBlocked === 'function'
					? options.isTimeBlocked(label, [activeDate])
					: disabledTimes.includes(label);
				const btn = document.createElement('button');
				btn.className = `nova-time-block nova-btn${isBlocked ? ' blocked' : ''}`;
				btn.textContent = blockKey;
				btn.disabled = !!isBlocked;
				if (selectedBlock === blockKey) btn.classList.add('selected');
				btn.onclick = () => {
					selectedTimes[key] = blockKey;
					calendar._timePluginState.selectedTimes = { ...selectedTimes };
					calendar.selectedTimes = { ...selectedTimes };
					calendar._timePluginState._lastDateClicked = activeDate;
					const dateObj = activeDate instanceof Date ? activeDate : new Date(Number(key));
					const [fromLabel, toLabel] = blockKey.split(' - ');
					const [fromHour, fromMinute] = fromLabel.split(':').map(Number);
					const [toHour, toMinute] = toLabel.split(':').map(Number);
					const fromTimestamp = new Date(
						dateObj.getFullYear(),
						dateObj.getMonth(),
						dateObj.getDate(),
						fromHour,
						fromMinute
					).getTime();
					const toTimestamp = new Date(
						dateObj.getFullYear(),
						dateObj.getMonth(),
						dateObj.getDate(),
						toHour,
						toMinute
					).getTime();
					calendar.selectedDates = [new Date(Number(key))];
					calendar.hiddenInput.value = JSON.stringify({
						mode: 'single',
						dates: [key],
						time: [fromTimestamp, toTimestamp],
					});
					calendar.updateButtonLabel?.();
					calendar.updateDayClasses?.();
					Array.from(timeBlockDiv.querySelectorAll('.nova-time-block')).forEach(b => b.classList.remove('selected'));
					btn.classList.add('selected');
					const labelDiv = calendar.trigger?.querySelector('.dates');
					if (labelDiv) {
						labelDiv.textContent = `${dateObj.toLocaleDateString('fr-FR', {
							day: '2-digit',
							month: 'long',
							year: 'numeric',
						})} · ${blockKey}`;
					}
					if (typeof calendar.options?.onTimeSelected === 'function') {
						calendar.options.onTimeSelected({ date: new Date(Number(key)), time: blockKey });
					}
				};
				timeBlockDiv.appendChild(btn);
				cur = next;
			}
		},
	};
}
