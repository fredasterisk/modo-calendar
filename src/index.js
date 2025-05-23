import { NovaCalendar } from './core/calendar.js';

window.NovaCalendar = NovaCalendar;

import { timePlugin } from './plugins/time/time-plugin.js';

window.timePlugin = timePlugin;

import { monthsPlugin } from './plugins/months/months-plugin.js';
import { lockPlugin } from './plugins/lock/lock-plugin.js';

window.monthsPlugin = monthsPlugin;
window.lockPlugin = lockPlugin;

export { timePlugin, monthsPlugin, lockPlugin };
