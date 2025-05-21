import { NovaCalendar } from './core/calendar.js';

window.NovaCalendar = NovaCalendar;

import { timePlugin } from './plugins/time/time-plugin.js';

window.timePlugin = timePlugin;

import { monthsPlugin } from './plugins/months/months-plugin.js';

window.monthsPlugin = monthsPlugin;

export { timePlugin, monthsPlugin };
