import { NovaCalendar } from './core/calendar.js';

const createLoader = (importer, exportName) => async (options) => {
	const module = await importer();
	const factory = module?.[exportName];
	if (typeof factory !== 'function') {
		throw new Error(
			`NovaCalendar: impossible de trouver l'export "${exportName}" pour le plugin.`
		);
	}
	return factory(options);
};

NovaCalendar.registerPluginLoader(
	'time',
	createLoader(() => import('./plugins/time/time-plugin.js'), 'timePlugin')
);

NovaCalendar.registerPluginLoader(
	'months',
	createLoader(
		() => import('./plugins/months/months-plugin.js'),
		'monthsPlugin'
	)
);

NovaCalendar.registerPluginLoader(
	'lock',
	createLoader(() => import('./plugins/lock/lock-plugin.js'), 'lockPlugin')
);

NovaCalendar.registerPluginLoader(
	'keyboard',
	createLoader(
		() => import('./plugins/keyboard/keyboard-plugin.js'),
		'keyboardNavigationPlugin'
	)
);

NovaCalendar.registerPluginLoader(
	'i18n',
	createLoader(() => import('./plugins/i18n/i18n-plugin.js'), 'i18nPlugin')
);

const createPluginRequest = (name) => (options) =>
	NovaCalendar.requestPlugin(name, options);

const timePlugin = createPluginRequest('time');
const monthsPlugin = createPluginRequest('months');
const lockPlugin = createPluginRequest('lock');
const keyboardPlugin = createPluginRequest('keyboard');
const i18nPlugin = createPluginRequest('i18n');

const plugins = {
	time: timePlugin,
	months: monthsPlugin,
	lock: lockPlugin,
	keyboard: keyboardPlugin,
	i18n: i18nPlugin,
};

if (typeof window !== 'undefined') {
	window.NovaCalendar = NovaCalendar;
	window.timePlugin = timePlugin;
	window.monthsPlugin = monthsPlugin;
	window.lockPlugin = lockPlugin;
	window.keyboardPlugin = keyboardPlugin;
	window.i18nPlugin = i18nPlugin;
	window.NovaCalendarPlugins = plugins;
}

export {
	NovaCalendar,
	timePlugin,
	monthsPlugin,
	lockPlugin,
	keyboardPlugin,
	i18nPlugin,
	plugins,
};
