import { NovaCalendar } from './core/calendar.js';

window.NovaCalendar = NovaCalendar;

import { timePlugin } from './plugins/time/time-plugin.js';

window.timePlugin = timePlugin;

import { monthsPlugin } from './plugins/months/months-plugin.js';
import { lockingPlugin } from './plugins/locking/locking-plugin.js';

window.monthsPlugin = monthsPlugin;
window.lockingPlugin = lockingPlugin;

export { timePlugin, monthsPlugin, lockingPlugin };
