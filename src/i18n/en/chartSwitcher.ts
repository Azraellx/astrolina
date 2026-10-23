// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// ChartSwitcher: the top-bar / sidebar quick-switch dropdown for saved charts.
export const chartSwitcher = {
  noChart: 'No chart selected',
  tip: 'Switch, edit, or add a chart',
  // {key} renders as the yellow Tab key pill in the trigger's hover tip.
  // Translator note (2026-10-09): {key} must appear exactly once, spelled exactly so. It
  // may move to wherever the sentence needs the key's name — the pill is drawn there.
  tabHint: '{key} swaps to your previous chart — keep tapping to cycle the recent five.',
  // The same line once the menu is split into an Events list and a People list
  // (2026-10-20): Tab then cycles the list the active chart is in, never the two
  // mixed. Names the two lists by the headings the menu shows (section.events,
  // section.people), so keep those words matching them. Same {key} rule as tabHint.
  tabHintSections:
    '{key} swaps to your previous chart in the same list, Events or People — keep tapping to cycle it.',
  empty: 'No saved charts yet.',
  searchAdd: 'Search + Add Name',

  // "No chart · the sky alone" (2026-10-20): the fixed first row of the menu, which
  // selects no chart at all, so Transits and Eclipses draw the sky with nothing from a
  // chart in force. Shown only while event charts are available.
  sky: {
    // The row's name, and what the menu's trigger reads while it is selected. Short:
    // it sits where a chart's name sits in the top bar.
    // @i18n-max 16
    name: 'No chart',
    // Shown on the same line, after the name and a dot, in lower case as a continuation
    // of it ("No chart · the sky alone" reads as one phrase).
    // @i18n-max 28
    tagline: 'the sky alone',
    // The trigger's second line while No chart is selected and an overlay draws the
    // sky: {overlay} is overlay.transits or overlay.eclipses below, {date} the
    // overlay's date ("20 Oct 2026"). Rewritten as the timeline moves.
    // @i18n-max 32
    meta: '{overlay} · {date}',
    // The trigger's second line while No chart is selected with the overlay off: the
    // map shows the sky with nothing on it from a chart.
    // @i18n-max 28
    metaOff: 'The sky alone',
    // The overlay names {overlay} takes above, as a noun at the start of the line.
    overlay: {
      transits: 'Transits',
      eclipses: 'Eclipse',
    },
    // The row's hover tip: what choosing it does. A hover tip: keep it under 180
    // characters together with hintMasks.
    hint: 'Draw the sky with no chart in force: Transits and Eclipses run in the moment’s own frame.',
    // Added after the hint only when choosing the row would set something aside: the
    // overlay now drawn, when it needs a chart, and an open Local Space window, which
    // measures from the chart's place. {held} is their menu names as a list ("Solar Arc",
    // "Local Space", or "Solar Arc and Local Space"), {count} how many (1 or 2). They wait
    // rather than being switched off: picking a chart brings them back.
    hintMasks:
      '{count, plural, one {{held} needs a chart, so it waits until you pick one.} other {{held} need a chart, so they wait until you pick one.}}',
  },
  // The two lists under the No chart row, in an order that follows the map (Events
  // first on a geodetic map).
  section: {
    // The lists' headings, shown in capitals by the stylesheet — write them in
    // ordinary case. Keep them matching tabHintSections' words.
    // @i18n-max 20
    events: 'Events',
    // @i18n-max 20
    people: 'People',
    // Each list's empty line. The Events one sits above the Add example event button.
    eventsEmpty: 'No event charts yet.',
    peopleEmpty: 'No person charts yet.',
  },
} as const;
