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
import {
	NovaCalendar,
	timePlugin,
	monthsPlugin,
	lockPlugin,
} from 'nova-calendar';

const calendar = new NovaCalendar({
	trigger: '#calendar-btn',
	mode: 'range',
	plugins: [
		monthsPlugin({ months: 2 }),
		timePlugin({ from: '08:00', to: '18:00' }),
		lockPlugin({ blockedDates: ['2025-06-20'] }),
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
		plugins: [lockPlugin({ blockedDates: ['2025-06-20'] })],
	});
</script>
```

## Plugins

- **monthsPlugin**: Display multiple months side by side.
- **timePlugin**: Add time block selection below the calendar.
- **lockPlugin**: Gère le blocage de dates, l'interdiction de début/fin de plage, et fournit un feedback visuel robuste pour toutes les sélections interdites.

### lockPlugin

Le plugin `lockPlugin` permet de :

- Bloquer certaines dates (empêche toute sélection)
- Interdire qu'une date soit le début d'une plage (`noRangeStartDates`)
- Interdire qu'une date soit la fin d'une plage (`noRangeEndDates`)
- Fournir un retour visuel immédiat (CSS `.blocked`, `.no-range-start`, `.no-range-end`, `.denied`)
- Gérer tous les cas de sélection (simple, plage, multiples, hover, edge cases)
- Fonctionne en UTC pour éviter les problèmes de fuseau

**Options** :

```js
lockPlugin({
	blockedDates: ['2025-06-20', '2025-06-24'], // Dates interdites (format YYYY-MM-DD ou timestamp)
	noRangeStartDates: ['2025-06-22'], // Interdit de commencer une plage sur ces dates
	noRangeEndDates: ['2025-06-23'], // Interdit de finir une plage sur ces dates
});
```

**Exemple d'utilisation** :

```js
import { NovaCalendar, lockPlugin } from 'nova-calendar';
const calendar = new NovaCalendar({
	trigger: '#calendar-btn',
	mode: 'range',
	plugins: [
		lockPlugin({
			blockedDates: ['2025-06-20', '2025-06-24'],
			noRangeStartDates: ['2025-06-22'],
			noRangeEndDates: ['2025-06-23'],
		}),
	],
});
```

**API dynamique** :

- `calendar.setBlockedDates(dates)`
- `calendar.setNoRangeStartDates(dates)`
- `calendar.setNoRangeEndDates(dates)`

Chaque modification met à jour l'affichage et bloque les sélections interdites en temps réel.

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
- `plugins`: array of plugins (e.g. `monthsPlugin`, `timePlugin`, `lockPlugin`)

## Development

- Source: [`src/`](src/)
- Plugins: [`src/plugins/`](src/plugins/)
- Styles: [`src/core/styles.css`](src/core/styles.css)
- Demo: [`demo/`](demo/)

## License

MIT License. See [LICENSE](LICENSE) for details.

---

© 2025 NovaCalendar contributors.
