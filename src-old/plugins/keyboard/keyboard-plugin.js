const NAVIGATION_KEYS = new Set([
	'ArrowLeft',
	'ArrowRight',
	'ArrowUp',
	'ArrowDown',
	'Home',
	'End',
	'PageUp',
	'PageDown',
]);

const DEFAULT_OPTIONS = {
	weekStartsOn: 1, // Monday
	enableYearJump: true,
	yearJumpModifier: 'shift',
};

export function keyboardNavigationPlugin(options = {}) {
	const config = normalizeOptions(options);
	return {
		name: 'keyboardNavigation',
		options: config,
		_keydownHandler: null,
		onInit(calendar) {
			calendar.setKeyboardNavigationLock(false);
		},
		onShadowReady(calendar) {
			this.attachHandler(calendar, config);
		},
		onRender(calendar) {
			calendar.setKeyboardNavigationLock(false);
		},
		onDestroy(calendar) {
			this.detachHandler(calendar);
		},
		attachHandler(calendar, cfg) {
			this.detachHandler(calendar);
			if (!calendar?.shadowRoot) return;
			this._keydownHandler = (event) =>
				handleKeydown(event, calendar, cfg ?? config);
			calendar.shadowRoot.addEventListener(
				'keydown',
				this._keydownHandler,
				true
			);
		},
		detachHandler(calendar) {
			if (this._keydownHandler && calendar?.shadowRoot) {
				calendar.shadowRoot.removeEventListener(
					'keydown',
					this._keydownHandler,
					true
				);
			}
			this._keydownHandler = null;
		},
	};
}

function normalizeOptions(options) {
	const config = { ...DEFAULT_OPTIONS };
	if (Number.isInteger(options?.weekStartsOn)) {
		config.weekStartsOn = clampWeekday(options.weekStartsOn);
	}
	if (options?.enableYearJump === false) {
		config.enableYearJump = false;
	}
	if (typeof options?.yearJumpModifier === 'string') {
		config.yearJumpModifier = options.yearJumpModifier.trim().toLowerCase();
	}
	return config;
}

function handleKeydown(event, calendar, config) {
	if (!NAVIGATION_KEYS.has(event.key)) return;
	if (event.defaultPrevented) return;
	const target = event.target instanceof Element ? event.target : null;
	const dayEl = target?.closest?.('.day');
	if (!dayEl) return;
	const currentDate = resolveDateFromElement(dayEl);
	if (!currentDate) return;

	const nextDate = resolveNextDate(event, currentDate, config);
	if (!nextDate) return;

	event.preventDefault();
	focusCalendarDate(calendar, nextDate);
}

function resolveNextDate(event, date, config) {
	switch (event.key) {
		case 'ArrowLeft':
			return addDays(date, -1);
		case 'ArrowRight':
			return addDays(date, 1);
		case 'ArrowUp':
			return addDays(date, -7);
		case 'ArrowDown':
			return addDays(date, 7);
		case 'Home':
			return moveToWeekEdge(date, config.weekStartsOn, 'start');
		case 'End':
			return moveToWeekEdge(date, config.weekStartsOn, 'end');
		case 'PageUp':
			return pageJump(date, -1, event, config);
		case 'PageDown':
			return pageJump(date, 1, event, config);
		default:
			return null;
	}
}

function focusCalendarDate(calendar, date) {
	const normalized = calendar.normalizeDate(date);
	if (!normalized) return;
	const focused = calendar.focusDate(normalized, { focus: true });
	if (focused) return;
	calendar.date = new Date(normalized.getFullYear(), normalized.getMonth(), 1);
	calendar.setFocusIntent(normalized, true);
	calendar.renderCalendar();
}

function addDays(date, days) {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

function moveToWeekEdge(date, weekStartsOn, edge) {
	const normalizedStart = clampWeekday(weekStartsOn);
	const currentWeekday = normalizeWeekday(date.getDay(), normalizedStart);
	const delta =
		edge === 'start'
			? -currentWeekday
			: 6 - currentWeekday;
	return addDays(date, delta);
}

function pageJump(date, direction, event, config) {
	const months = 1 * direction;
	if (
		config.enableYearJump !== false &&
		shouldJumpYear(event, config.yearJumpModifier)
	) {
		return addMonths(date, 12 * direction);
	}
	return addMonths(date, months);
}

function addMonths(date, months) {
	const next = new Date(date);
	next.setMonth(next.getMonth() + months);
	return next;
}

function shouldJumpYear(event, modifier) {
	if (modifier === 'ctrl') {
		return event.ctrlKey || event.metaKey;
	}
	if (modifier === 'alt') {
		return event.altKey;
	}
	return event.shiftKey;
}

function resolveDateFromElement(element) {
	if (element._date instanceof Date) {
		return new Date(element._date);
	}
	const stamp = Number(element.dataset?.dateStamp);
	if (Number.isFinite(stamp)) {
		return new Date(stamp);
	}
	return null;
}

function clampWeekday(value) {
	const number = Number(value);
	if (!Number.isFinite(number)) return 1;
	const normalized = number % 7;
	return normalized < 0 ? normalized + 7 : normalized;
}

function normalizeWeekday(day, weekStartsOn) {
	const normalizedStart = clampWeekday(weekStartsOn);
	const normalizedDay = clampWeekday(day);
	return (normalizedDay - normalizedStart + 7) % 7;
}
