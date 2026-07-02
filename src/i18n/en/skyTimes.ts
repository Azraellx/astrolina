// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The Sky Band (View ▸ Sky Times): each body's daily rise / culminate / set /
// anticulminate clock at the active point, read in that place's own local time.
export const skyTimes = {
  title: 'Sky times',
  closeAria: 'Close sky times',
  closeHint: 'Close the sky-times window.',
  noPlace: 'Pick a chart or drop a pin to read the sky clock somewhere.',
  // Column headers use the map's own angle names, so the clock reads as the
  // time-domain twin of the lines: rising = ASC, culminating = MC, …
  col: {
    body: 'Body',
    rise: 'ASC',
    culminate: 'MC',
    set: 'DSC',
    anticulminate: 'IC',
  },
  colHint: {
    rise: 'Rises (crosses the eastern horizon — its ASC moment)',
    culminate: 'Culminates (crosses the upper meridian — its MC moment)',
    set: 'Sets (crosses the western horizon — its DSC moment)',
    anticulminate: 'Anti-culminates (crosses the lower meridian — its IC moment)',
  },
  circumpolarUp: 'Above the horizon all day at this latitude',
  circumpolarDown: 'Below the horizon all day at this latitude',
  today: 'Today',
  prevDay: 'Previous day',
  nextDay: 'Next day',
  // The day readout doubles as a button opening the shared moment picker (the
  // same editor the timeline bar and My Charts use) — no native calendar widget.
  pickDate: 'Pick a date',
  pickDateHint: 'Jump the sky clock to any date — decades past or future.',
  // The live time cursor on a registered band track.
  now: 'Now',
  // Footer: which timezone the clock reads in.
  zoneNote: 'Local time at this point ({zone})',
} as const;
