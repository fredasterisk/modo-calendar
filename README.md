# ModoCalendar

A modern, zero-dependency date picker for the web. TypeScript-first, plugin-based, Shadow DOM encapsulated.

Supports single, range, and multiple date selection with advanced features like time slots, date/time blocking rules, multi-month views, preset ranges, dropdowns, and i18n — all through a clean plugin architecture.

## Features

- **Three selection modes** — single, range (with min/max nights), multiple (with max count)
- **Plugin system** — compose only what you need: months, time, lock, presets, dropdown, i18n
- **Lock rules engine** — flexible date & time blocking: individual dates, ranges, recurring weekdays, combined filters, checkin/checkout restrictions, time slot blocking
- **Time selection** — block grid or spinner picker, per-date time slots, lock-rules integration
- **Shadow DOM** — styles fully encapsulated, no CSS conflicts
- **Reactive state** — Proxy-based auto-sync, batch updates
- **Animations & gestures** — swipe navigation, staggered fade-in, selection animations
- **Keyboard navigation** — full arrow-key, Enter, Escape support
- **i18n** — locale-aware formatting, runtime locale switching
- **CSS custom properties** — fully themeable via `--mc-*` variables
- **BEM class overrides** — `classNames` API for custom styling slots
- **Accessible** — WCAG 2.1 compliant: `aria-modal`, focus trap, `aria-disabled` on blocked days, keyboard-navigable spinners
- **Zero dependencies** — ~25 kB gzipped (ESM)

## Installation

```bash
npm install modo-calendar
```

## Quick Start

```ts
import { ModoCalendar } from 'modo-calendar';

new ModoCalendar({
  trigger: '#datepicker',
  mode: 'single',
});
```

## Modes

### Single date

```ts
new ModoCalendar({
  trigger: '#picker',
  mode: 'single',
});
```

### Date range

```ts
import { ModoCalendar, monthsPlugin } from 'modo-calendar';

new ModoCalendar({
  trigger: '#picker',
  mode: 'range',
  minRangeNights: 2,
  maxRangeNights: 14,
  plugins: [monthsPlugin({ months: 2 })],
});
```

### Multiple dates

```ts
new ModoCalendar({
  trigger: '#picker',
  mode: 'multiple',
  maxMultipleDates: 5,
});
```

## Plugins

### `monthsPlugin`

Display multiple months side by side.

```ts
import { monthsPlugin } from 'modo-calendar';

monthsPlugin({ months: 2 });
```

### `timePlugin`

Add time slot selection (block grid or spinner).

```ts
import { timePlugin } from 'modo-calendar';

// Block grid: 90-minute slots from 08:00 to 18:00
timePlugin({
  from: '08:00',
  to: '18:00',
  interval: 90,
  pickerType: 'blocks', // default
});

// Spinner: hour/minute wheels with 15-min steps
timePlugin({
  pickerType: 'spinner',
  minuteStep: 15,
});

// Multiple dates with arrival/departure per date
timePlugin({
  arrivalDeparture: true,
  pickerType: 'blocks',
  from: '08:00',
  to: '18:00',
  interval: 60,
});

// Time-only (calendar grid hidden, fixed date)
timePlugin({
  hideCalendar: true,
  date: '2026-04-20',
  from: '09:00',
  to: '17:00',
  interval: 30,
});
```

| Option             | Type                       | Default    | Description                                                                                |
| ------------------ | -------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `from`             | `string`                   | `'08:00'`  | Start time (HH:MM)                                                                         |
| `to`               | `string`                   | `'16:00'`  | End time (HH:MM)                                                                           |
| `interval`         | `number`                   | `60`       | Block duration in minutes                                                                  |
| `pickerType`       | `'blocks' \| 'spinner'`    | `'blocks'` | Picker UI type                                                                             |
| `minuteStep`       | `number`                   | `5`        | Minute increment for spinner                                                               |
| `disabledTimes`    | `string[]`                 | `[]`       | Statically disabled time labels                                                            |
| `isTimeBlocked`    | `(time, dates) => boolean` | —          | Custom blocking callback                                                                   |
| `arrivalDeparture` | `boolean`                  | `false`    | Show arrival + departure pickers per date (multiple mode)                                  |
| `hideCalendar`     | `boolean`                  | `false`    | Hide the calendar grid + header to render only the time picker. Requires `date`.           |
| `date`             | `string \| Date`           | —          | Fixed date for time-only flows. `"YYYY-MM-DD"` string or `Date`. Required with `hideCalendar`. |

#### Arrival / Departure in multiple mode

When `arrivalDeparture: true` is combined with `mode: 'multiple'`, each selected date shows two time pickers (arrival and departure) instead of one. The hidden input outputs per-date time pairs:

```json
{
  "mode": "multiple",
  "dates": [1713139200000, 1713225600000],
  "timePairs": {
    "1713139200000": {
      "arrival": "09:00 - 10:00",
      "departure": "16:00 - 17:00"
    },
    "1713225600000": { "arrival": null, "departure": null }
  }
}
```

Chips and button labels display the format: `15 avr. (09:00 → 17:00)`.

In range mode, arrival/departure already works by default (no option needed) — the start date gets the arrival picker and the end date gets the departure picker.

### `lockPlugin`

Flexible date & time blocking with a rules engine. Rules are evaluated in order and effects accumulate.

```ts
import { lockPlugin } from 'modo-calendar';

lockPlugin({
  rules: [
    // Block specific dates
    { dates: ['2026-04-20', '2026-04-24'], blocked: true },

    // Block every Sunday
    { weekdays: ['sun'], blocked: true },

    // Block Tuesdays only in April 2026
    { from: '2026-04-01', to: '2026-04-30', weekdays: ['tue'], blocked: true },

    // Allow booking over, but no check-in
    { dates: ['2026-04-22'], blocked: false, noCheckin: true },

    // Allow booking over, but no check-out
    { dates: ['2026-04-23'], blocked: false, noCheckout: true },

    // Block a holiday period
    { from: '2026-05-25', to: '2026-05-31', blocked: true },

    // Block lunch time slots every day
    {
      weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      blocked: false,
      blockedTimes: ['12:00-13:30'],
    },

    // Block morning slots on weekends
    { weekdays: ['sat', 'sun'], blocked: false, blockedTimes: ['08:00-10:00'] },

    // Block ALL time slots on specific dates
    {
      from: '2026-07-04',
      to: '2026-07-07',
      blockAllTimes: true,
      blocked: false,
    },
  ],
});
```

#### Rule selectors

| Property   | Type                 | Description                                                                                      |
| ---------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| `dates`    | `(string \| Date)[]` | Match specific dates (YYYY-MM-DD)                                                                |
| `from`     | `string \| Date`     | Range start (inclusive)                                                                          |
| `to`       | `string \| Date`     | Range end (inclusive)                                                                            |
| `weekdays` | `Weekday[]`          | Recurring weekdays (`'mon'`–`'sun'`). Combined with `from`/`to` to match weekdays within a range |

#### Rule effects

| Property        | Type       | Default  | Description                                                  |
| --------------- | ---------- | -------- | ------------------------------------------------------------ |
| `blocked`       | `boolean`  | `true`\* | Fully block the day (unclickable, hatched)                   |
| `noCheckin`     | `boolean`  | `false`  | Prevent starting a range on this day                         |
| `noCheckout`    | `boolean`  | `false`  | Prevent ending a range on this day                           |
| `blockedTimes`  | `string[]` | `[]`     | Block time slots (`'HH:MM-HH:MM'` ranges or `'HH:MM'` exact) |
| `blockAllTimes` | `boolean`  | `false`  | Block all time slots on matching days                        |

\* If no effect is specified, `blocked: true` is implied.

#### Runtime API

```ts
const cal = new ModoCalendar({ ... });

// Replace all rules
cal.setLockRules(newRules);

// Legacy API (still supported)
cal.setBlockedDates(['2026-06-20']);
cal.setNoRangeStartDates(['2026-06-22']);
cal.setNoRangeEndDates(['2026-06-23']);
```

### `presetsPlugin`

Sidebar with quick-select preset date ranges.

```ts
import { presetsPlugin, presetRanges } from 'modo-calendar';

presetsPlugin({
  presets: [
    presetRanges.today(),
    presetRanges.next7Days(),
    presetRanges.thisWeekend(),
    presetRanges.nextWeekend(),
    presetRanges.nextWeek(),
    presetRanges.nextMonth(),
  ],
});
```

All preset labels are localized. Pass a language code to get translated labels:

```ts
presetsPlugin({
  presets: [
    presetRanges.today('en'), // "Today"
    presetRanges.next7Days('en'), // "Next 7 days"
    presetRanges.thisWeekend('es'), // "Este fin de semana"
    presetRanges.nextMonth('de'), // "Nächster Monat"
  ],
});
```

Built-in languages: `fr` (default), `en`, `es`, `de`, `pt`. Without a language argument, labels default to French.

````

### `dropdownPlugin`

Month and year dropdown selectors in the calendar header.

```ts
import { dropdownPlugin } from 'modo-calendar';

dropdownPlugin({ yearRange: [2024, 2027] });
````

### `i18nPlugin`

Runtime locale switching with custom formatting.

```ts
import { i18nPlugin } from 'modo-calendar';

const i18n = i18nPlugin({
  locales: {
    fr: {
      locale: 'fr-FR',
      weekStartsOn: 1,
      placeholder: 'Choisir une date...',
    },
    en: { locale: 'en-US', weekStartsOn: 0, placeholder: 'Pick a date...' },
  },
  initialLocale: 'fr',
});

// Switch at runtime
i18n.setLocale('en');
```

## Options

| Option               | Type                                | Default   | Description                          |
| -------------------- | ----------------------------------- | --------- | ------------------------------------ |
| `trigger`            | `string \| HTMLElement`             | —         | CSS selector or element to attach to |
| `mode`               | `'single' \| 'range' \| 'multiple'` | `'range'` | Selection mode                       |
| `inline`             | `string \| boolean`                 | `false`   | Inline mode (CSS selector or `true`) |
| `locale`             | `string`                            | `'fr-FR'` | Locale for formatting                |
| `plugins`            | `CalendarPlugin[]`                  | `[]`      | Array of plugins                     |
| `minDate`            | `string \| Date`                    | —         | Earliest selectable date             |
| `maxDate`            | `string \| Date`                    | —         | Latest selectable date               |
| `minRangeNights`     | `number`                            | —         | Minimum nights for range mode        |
| `maxRangeNights`     | `number`                            | —         | Maximum nights for range mode        |
| `maxMultipleDates`   | `number`                            | —         | Max selections in multiple mode      |
| `classNames`         | `CalendarClassNames`                | `{}`      | BEM class overrides per slot         |
| `showStatusMessages` | `boolean`                           | `true`    | Show validation feedback messages    |
| `hiddenInput`        | `HTMLInputElement`                  | —         | Custom hidden input for form data    |

## Instance API

```ts
const cal = new ModoCalendar({ ... });

// Get current selection (works for all modes)
const sel = cal.getSelection();
// => { mode: 'range', dates: [Date, ...], start: Date, end: Date }
// => { mode: 'multiple', dates: [Date, Date, ...], start: null, end: null }
// => { mode: 'single', dates: [Date], start: Date, end: null }

// Clear all selected dates/times
cal.clearSelection();

// Programmatically set a range
cal.setRange('2026-04-10', '2026-04-15');

// Status messages
cal.setStatusMessage({ type: 'warning', text: 'Pick a weekday', autoHideDelay: 3000 });
cal.clearStatusMessage();

// Locale
cal.setLocale('en-US');
cal.setWeekStartsOn(0); // 0=Sun, 1=Mon
cal.getResolvedLocale(); // => 'en-US'

// Destroy
cal.destroy();
```

## Events

```ts
const cal = new ModoCalendar({ ... });

cal.on('dateSelected', ({ date, mode }) => { ... });
cal.on('dateDeselected', ({ date, mode }) => { ... });
cal.on('rangeSelected', ({ start, end }) => { ... });
cal.on('rangeCleared', () => { ... });
cal.on('timeSelected', ({ date, time }) => { ... });
cal.on('monthChanged', ({ date, direction }) => { ... });
cal.on('calendarOpen', () => { ... });
cal.on('calendarClose', () => { ... });
cal.on('statusMessage', (state) => { ... });
cal.on('localeChanged', ({ locale }) => { ... });
```

## Theming

All styles use CSS custom properties with `--mc-` prefix:

```css
:root {
  --mc-accent: #2563eb;
  --mc-accent-fg: #fff;
  --mc-bg: #fff;
  --mc-fg: #0f172a;
  --mc-muted: #f1f5f9;
  --mc-border: #e2e8f0;
  --mc-danger: #ef4444;
  --mc-cell-radius: 0.5rem;
  --mc-font: 'Inter', system-ui, sans-serif;
  --mc-transition: 150ms ease;
}
```

## Development

```bash
npm run dev       # Vite dev server
npm run build     # Production build (ESM + UMD)
npm run preview   # Preview production build
```

- Source: `src/`
- Plugins: `src/plugins/`
- Core styles: `src/core/styles.css`
- Demo: `demo/index.html`

## Accessibility

ModoCalendar follows WCAG 2.1 guidelines:

- Focus trap inside the calendar popup (Tab / Shift+Tab cycle)
- `aria-modal="true"` on the calendar container
- `aria-disabled="true"` on blocked days (lock plugin)
- `tabindex="0"` on spinner buttons for keyboard access
- Preset groups use `role="group"` with `aria-selected` states
- Focus returns to the trigger on Escape
- Full keyboard navigation (arrow keys, Enter, Escape)

## Plugin Hook Chain

Plugins can override core methods cleanly using the hook chain system instead of monkey-patching:

```ts
// Inside a plugin's onInit:
calendar._addHook('updateHiddenInput', (original) => {
  return function () {
    // Custom logic before/after/instead of original
    original();
  };
});
// Returns an unhook function to remove the override
```

Multiple plugins can hook the same method — hooks are chained in registration order.

## License

MIT

---

© 2026 ModoCalendar
