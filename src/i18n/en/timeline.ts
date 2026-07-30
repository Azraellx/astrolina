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
    // The separate Tertiary Progressed overlay (its own Overlay-menu mode).
    'tertiary-progressed': 'Tert. Progressed',
    'solar-arc': 'Solar Arc',
    'primary-directions': 'Primary',
    cyclo: 'CCG',
  },
  nubFallback: 'Overlay',

  // The eye toggle on the nub's right edge — shows/hides the ruler + transport row.
  barToggle: {
    show: 'Show timeline bar',
    hide: 'Hide timeline bar',
    hint: 'The date scrubber + playback controls. The nub stays either way.',
  },

  // The tab on the bar's right edge that opens/closes the display-toggles drawer
  // (Natal Chart + this overlay's Zenith stamps).
  drawer: {
    show: 'Show display toggles',
    hide: 'Hide display toggles',
  },

  // The CCG blend legend (cyclo's bottom row): which bodies read progressed (Sp)
  // vs transiting (Tr) — the split behind the mode's mixed on-map line tags.
  cyclo: {
    label: 'Blend',
    spName: 'Personal planets progressed',
    spTip: 'Sp — secondary progressed',
    spHint:
      'Sun, Moon, Mercury, Venus and Mars read at their secondary-progressed positions — the day-for-a-year pace keeps them readable beside the outers. Their lines carry the Sp tag.',
    trName: 'Outer bodies transiting',
    trTip: 'Tr — transiting',
    trHint:
      'Everything from Jupiter outward — plus the nodes, Lilith, Chiron and the asteroids — reads at its real transiting position. Their lines carry the Tr tag.',
  },

  // The frame segmented control in the transits returns row. When the line system
  // isn't Celestial the control is disabled — this tip explains why framing is moot.
  // lockedNoTime: disabled because the chart's birth time is unknown, so the frame
  // is forced to the moment's own sky (there is no natal frame to hold).
  positioning: {
    groupAria: 'Overlay frame',
    disabled:
      'Only Celestial lines have a sidereal-time frame to switch — Mundane and Geodetic lines key off zodiacal longitude, so framing has no effect.',
    lockedNoTime:
      'Birth time unknown — there is no natal frame to hold, so the map can only show the sky of the moment.',
  },

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

  // Returns snap (transits only). `reframes` rides as the HINT on all three buttons
  // — ‹ and › carry the same side effect the named snap does, and › is the usual way
  // in ("show me my next return"), so warning on the middle button alone left the
  // commonest path silent. It is attached only when the switch will actually move
  // (natal frame + celestial lines); once the frame is already the moment's own sky
  // the snap changes nothing and a warning would be noise.
  returns: {
    label: 'Returns',
    reframes:
      'Reframes the map to the sky at that moment. In the natal frame the returning body is pinned to its birth degree, so its lines would never move from one return to the next.',
    solar: {
      name: 'Solar',
      snap: 'Nearest solar return',
      snapAria: 'Snap to the nearest solar return',
      prev: 'Previous solar return',
      prevAria: 'Previous solar return',
      next: 'Next solar return',
      nextAria: 'Next solar return',
    },
    lunar: {
      name: 'Lunar',
      snap: 'Nearest lunar return',
      snapAria: 'Snap to the nearest lunar return',
      prev: 'Previous lunar return',
      prevAria: 'Previous lunar return',
      next: 'Next lunar return',
      nextAria: 'Next lunar return',
    },
  },
  scale: { label: 'Scale' },
  // The Pri.-directions Rate picker, relocated from the Calculations tab to the
  // primary-directions bar's bottom row (labelled just "Rate" there).
  rate: { label: 'Rate' },
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
    'tertiary-progressed': 'Tert. Progressed · age {years}',
    'solar-arc': 'Solar Arc · {deg}°',
    'primary-directions': 'Primary Directions · {deg}°',
    cyclo: 'Cyclo·carto·graphy · {datetime} UTC',
    synastry: 'Synastry · {partner}',
    eclipses: 'Eclipse · {datetime} UTC',
  },
  // Dynamic nub readout. Solar-arc / primary show just "{deg}°" (number + degree
  // symbol, language-neutral), so only the progressed "Age …" form needs a key.
  measure: { progressedAge: 'Age {years}' },
} as const;
