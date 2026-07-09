# Changelog

All notable changes to ModoCalendar will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2026-07-09

### Added

- `dateFocused` event — emitted in `multiple` + `multiSlot` mode when an already-selected date becomes the one the time panel edits.
- Multi-date chips now show a `×` affordance on hover and keyboard focus, so it is clear that clicking removes the date. Touch devices, which have no hover, show it permanently.
- The date whose time slots are being edited is highlighted, both in the grid (`mc-day--time-active`) and in its chip (`mc-remove-date--active`). The slot panel is captioned with that date.
- Locale string `remove`, used for the chips' `aria-label` and `title` (previously a hard-coded English `Remove`).
- `HiddenInputValueMultiple` now types the `slots` field emitted by `multiSlot`.

### Fixed

- `multiSlot`: adding or removing a date no longer wiped the time slots displayed on the other selected dates' chips. The chip label is now built from a single `_multiChipLabel()` helper that reads `selectedSlots`, instead of three separate call sites that only knew about `selectedTimes` and `selectedTimePairs`.
- `multiSlot` in `multiple` mode: clicking an already-selected date now focuses it so its slots can be edited, instead of removing it. Clicking it a second time — when it is the active date — removes it, and removal is still available from its chip.
- Removing a date now discards its time state and moves the time panel to a date that is still selected, rather than leaving the panel on a deselected date.
- Removing a date from the `monthsPlugin` chip list now clears its time state and emits `dateDeselected`, matching the core's behavior.

## [0.6.0] - 2026-06-08

### Added

- Mobile bottom sheet: a dimmed backdrop behind the sheet gives it a modal feel; clicking it closes the calendar. It fades in and out, and respects `prefers-reduced-motion`.
- Instant press feedback on day cells (`mc-day--pressed`), toggled from `pointerdown` rather than relying on CSS `:active`/`:hover`, which are unreliable on touch and made taps feel unresponsive.

## [0.5.0] - 2026-05-31

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

[0.7.0]: https://github.com/fredasterisk/modo-calendar/releases/tag/v0.7.0
[0.6.0]: https://github.com/fredasterisk/modo-calendar/releases/tag/v0.6.0
[0.5.0]: https://github.com/fredasterisk/modo-calendar/releases/tag/v0.5.0
[0.1.0]: https://github.com/fredasterisk/modo-calendar/releases/tag/v0.1.0
