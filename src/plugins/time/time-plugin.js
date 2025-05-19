// Plugin de sélection d'heure pour NovaCalendar
export const timePlugin = {
	onRender(calendar) {
		if (calendar.shadowRoot.querySelector('.nova-time')) return;
		const timeDiv = document.createElement('div');
		timeDiv.className = 'nova-time';
		timeDiv.style.marginTop = '1em';
		timeDiv.innerHTML = `
      <label style="font-size:.9em;">Heure :
        <input type="time" class="nova-time-input" step="900" style="margin-left:.5em;">
      </label>
    `;
		calendar.container.appendChild(timeDiv);
		const input = timeDiv.querySelector('.nova-time-input');
		if (calendar.selectedTime) input.value = calendar.selectedTime;
		input.addEventListener('input', () => {
			calendar.selectedTime = input.value;
		});
	},
	onDateSelected(date, calendar) {
		calendar.selectedTime = '';
		const input = calendar.shadowRoot.querySelector('.nova-time-input');
		if (input) input.value = '';
	},
};
