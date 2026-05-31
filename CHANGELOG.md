# Changelog

All notable changes to ModoCalendar will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-05-31

### Added

- `timePlugin` option **`multiSlot`** — select **multiple time slots per date** (block picker), in `single` and `multiple` modes. Each block toggles independently (`role="checkbox"` + `aria-checked`); selected slots are stored per date in `_timePluginState.selectedSlots` (`Record<dateKey, string[]>`, sorted by start time).
  - Hidden-input shapes: single → `{ mode: 'single', dates: [key], slots: [...] }`; multiple → `{ mode: 'multiple', dates: [...keys], slots: { [key]: [...] } }`.
  - Mutually exclusive with `arrivalDeparture` (warns and disables it); ignored by the spinner picker and in range mode.

## [0.1.0] - 2026-05-07

Initial public release.

### Added

- Three selection modes: `single`, `range` (with `minRangeNights` / `maxRangeNights`), `multiple` (with `maxMultipleDates`)
- Plugin system with built-in plugins:
  - `monthsPlugin` — display multiple months side by side
  - `timePlugin` — block grid or spinner picker, per-date arrival/departure pairs, time-only mode (`hideCalendar` + `date`)
  - `lockPlugin` — rules engine for date/time blocking (specific dates, ranges, recurring weekdays, `noCheckin`/`noCheckout`, `blockedTimes`, `blockAllTimes`)
  - `presetsPlugin` — sidebar with built-in localized presets (`fr`, `en`, `es`, `de`, `pt`)
  - `dropdownPlugin` — month and year dropdown selectors in the header
  - `i18nPlugin` — runtime locale switching with custom formatting
- Shadow DOM encapsulation
- Reactive Proxy-based state with batch updates
- Viewport-aware popup positioning with flip-up and reposition on scroll/resize
- Mobile bottom-sheet variant below 640px
- Swipe gestures, staggered fade-in, selection animations
- Full keyboard navigation (arrow keys, Enter, Escape) and focus trap
- WCAG 2.1 compliant: `aria-modal`, `aria-disabled` on blocked days, keyboard-navigable spinners
- CSS custom properties (`--mc-*`) for theming
- BEM `classNames` API for slot-level overrides
- Programmatic API: `getSelection`, `clearSelection`, `setRange`, `setLocale`, `setLockRules`, `setStatusMessage`, `destroy`
- Event API: `dateSelected`, `rangeSelected`, `timeSelected`, `monthChanged`, `calendarOpen`/`Close`, `localeChanged`, etc.
- Zero runtime dependencies (~25 kB gzipped, ESM)

[0.4.0]: https://github.com/fredasterisk/modo-calendar/releases/tag/v0.4.0
[0.1.0]: https://github.com/fredasterisk/modo-calendar/releases/tag/v0.1.0
