import { NovaCalendar } from './core/calendar.js';
import './core/styles.css';

window.NovaCalendar = NovaCalendar;

import { timePlugin } from './plugins/time/time-plugin.js';
import './plugins/time/styles.css';

NovaCalendar.use(timePlugin);
window.timePlugin = timePlugin;
