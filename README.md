# NovaCalendar

A modern, lightweight, and extensible calendar/date-picker component for the web. Supports single, range, and multiple date selection, with plugin support for advanced features (multi-month, time blocks, etc). Styles are encapsulated in Shadow DOM for robust theming.

## Features

- **Single, range, and multiple date selection**
- **Plugin system** (easily add months, time, etc)
- **Shadow DOM encapsulation** for styles
- **Keyboard and mouse navigation**
- **Customizable via CSS and JS**
- **Lightweight, no dependencies**

## Demo

See the [`demo/index.html`](demo/index.html) for usage examples and visual tests.

## Installation

```bash
npm install nova-calendar
```

Or simply copy the `src/` folder into your project.

## Usage

```js
import { NovaCalendar, timePlugin, monthsPlugin } from 'nova-calendar';

const calendar = new NovaCalendar({
	trigger: '#calendar-btn',
	mode: 'range',
	plugins: [
		monthsPlugin({ months: 2 }),
		timePlugin({ from: '08:00', to: '18:00' }),
	],
});
```

Or use directly in HTML:

```html
<script src="src/index.js"></script>
<script>
	const calendar = new NovaCalendar({
		trigger: '#calendar-btn',
		mode: 'single',
	});
</script>
```

## Plugins

- **monthsPlugin**: Display multiple months side by side.
- **timePlugin**: Add time block selection below the calendar.

Each plugin injects its own CSS into the Shadow DOM for style isolation.

## API

- `new NovaCalendar(options)` — create a calendar instance.
- `calendar.setRange(start, end)` — set selected range.
- `calendar.setBlockedDates(dates)` — block specific dates.
- `calendar.setNoRangeStartDates(dates)` — block range starts.
- `calendar.setNoRangeEndDates(dates)` — block range ends.
- `calendar.addPlugin(plugin)` — add a plugin at runtime.

## Options

- `trigger`: CSS selector or DOM element to attach the calendar to.
- `mode`: `'single' | 'range' | 'multiple'`
- `inline`: `false` or CSS selector for inline mode.
- `format`: function for display formatting.
- `plugins`: array of plugins (e.g. `monthsPlugin`, `timePlugin`)

## Development

- Source: [`src/`](src/)
- Plugins: [`src/plugins/`](src/plugins/)
- Styles: [`src/core/styles.css`](src/core/styles.css)
- Demo: [`demo/`](demo/)

## License

MIT License. See [LICENSE](LICENSE) for details.

---

© 2025 NovaCalendar contributors.
