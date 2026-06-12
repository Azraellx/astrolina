// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Timeline / overlay HUD (TimelineHud.tsx) plus the overlay caption templates that
// lib/astro/timeline.ts builds (buildOverlay receives t and resolves labelFull/measure
// from here). Unit symbols (min/h/d/mo), transport glyphs (‹ › ▶ ❚❚), UTC, and the
// 2-letter overlay prefixes stay language-neutral.
export const timeline = {
  // Name shown on the draggable nub for each time-overlay mode (Primary is shortened
  // here vs the top-bar menu's "Primary Directions").
  nubMode: {
    transits: 'Transits',
    progressed: 'Sec. Progressed',
    // Shown instead of `progressed` when the Progression setting is Tertiary.
    tertiary: 'Tert. Progressed',
    'solar-arc': 'Solar Arc',
    'primary-directions': 'Primary',
    cyclo: 'CCG',
  },
  nubFallback: 'Overlay',

  // Timeline scale picker (the <select>).
  units: {
    minute: 'Minute',
    hour: 'Hour',
    day: 'Day',
    week: 'Week',
    month: 'Month',
    year: 'Year',
  },
  // Lowercase unit word for the scale tooltip ("Notch = 1 minute").
  unitsLower: {
    minute: 'minute',
    hour: 'hour',
    day: 'day',
    week: 'week',
    month: 'month',
    year: 'year',
  },
  // Human description of one mini-notch per scale (= one default Step / one tick).
  minorLabel: {
    minute: '1 min',
    hour: '10 min',
    day: '6 hours',
    week: '1 day',
    month: '5 days',
    year: '1 month',
  },
  // Full step-unit words for the transport tooltips (the compact step box keeps the
  // min/h/d/mo symbol). Keyed by the step's BASE unit; the count picks one/other.
  stepWords: {
    minute: { one: 'minute', other: 'minutes' },
    hour: { one: 'hour', other: 'hours' },
    day: { one: 'day', other: 'days' },
    week: { one: 'week', other: 'weeks' },
    month: { one: 'month', other: 'months' },
    year: { one: 'year', other: 'years' },
  },

  transport: {
    stepBack: 'Step back {count} {unit}',
    stepForward: 'Step forward {count} {unit}',
    stepBackAria: 'Step back',
    stepForwardAria: 'Step forward',
    play: 'Play',
    pause: 'Pause',
    stepAmount: 'Step amount, in {unit}',
    stepAmountAria: 'Step amount in {unit}',
  },

  ruler: { aria: 'Scrub date' },
  now: { label: 'Now', tip: 'Set to the current moment' },

  // Returns snap (transits only). The snap tips disclose the Positioning side
  // effect: a return map is only the return chart's astrocartography when the
  // lines are framed by the return instant itself (Transit moment).
  returns: {
    label: 'Returns',
    // "Absolute" names the Positioning option as the Calculation tab labels it.
    solar: {
      snap: 'Nearest solar return. Positioning switches to Absolute.',
      snapAria: 'Snap to the nearest solar return',
      prev: 'Previous solar return',
      prevAria: 'Previous solar return',
      next: 'Next solar return',
      nextAria: 'Next solar return',
    },
    lunar: {
      snap: 'Nearest lunar return. Positioning switches to Absolute.',
      snapAria: 'Snap to the nearest lunar return',
      prev: 'Previous lunar return',
      prevAria: 'Previous lunar return',
      next: 'Next lunar return',
      nextAria: 'Next lunar return',
    },
  },
  scale: { label: 'Scale' },
  dateField: {
    tipChartZone: 'Transit / progressed moment, in the chart’s time zone',
    tipUtc: 'Transit / progressed moment, in UTC',
  },
  // The pop-up date/time picker (TimelineDateModal) — same moment editor as My Charts.
  // The chart's zone shows next to the time; scrollKey is rendered as a hotkey pill.
  datePicker: {
    open: 'Edit date & time',
    title: 'Set date & time',
    scrollKey: 'Scroll',
    scrollHint: 'to increase or decrease',
    apply: 'Set',
  },

  // Spelled-out overlay captions (from lib/astro/timeline.ts via the passed t()). The
  // date/number values are formatted by the caller and interpolated here.
  labelFull: {
    transits: 'Transits · {datetime} UTC',
    progressed: 'Sec. Progressed · age {years}',
    'solar-arc': 'Solar Arc · {deg}°',
    'primary-directions': 'Primary Directions · {deg}°',
    tertiary: 'Tert. Progressed · age {years}',
    cyclo: 'Cyclo·carto·graphy · {datetime} UTC',
    synastry: 'Synastry · {partner}',
    eclipses: 'Eclipse · {datetime} UTC',
  },
  // Dynamic nub readout. Solar-arc / primary show just "{deg}°" (number + degree
  // symbol, language-neutral), so only the progressed "Age …" form needs a key.
  measure: { progressedAge: 'Age {years}' },
} as const;
