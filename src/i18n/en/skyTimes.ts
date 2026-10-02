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
  // The hint on the Part of Fortune's legend entry, which has no times: it is
  // shown on the map in a zodiacal frame, so its absence here needs a reason.
  fortuneNote:
    'No rise or set of its own to time: the Lot is built from the Ascendant, so it keeps almost the same distance from it all day.',
  today: 'Today',
  prevDay: 'Previous day',
  nextDay: 'Next day',
  // The day readout doubles as a button opening the shared moment picker (the
  // same editor the timeline bar and My Charts use) — no native calendar widget.
  pickDate: 'Pick a date',
  pickDateHint: 'Jump the sky clock to any date — decades past or future.',
  // While the Slide tool is armed the band shows the SLID day, and the pager's
  // controls turn the map's sky instead of paging the band — so each one's tip
  // says what will really move. The reader's own paged day is kept, and comes
  // back when Slide closes; the hints say that too, since otherwise the pager
  // looks as if it has lost their place.
  slide: {
    prevTip: 'Previous day · moves Slide',
    nextTip: 'Next day · moves Slide',
    todayTip: 'Today · moves Slide to now',
    pickTip: 'Pick a date · moves Slide',
    stepHint:
      'Slide is armed, so the band shows the slid day and this turns the map’s sky by a whole day. The day you were reading returns when Slide closes.',
    todayHint:
      'Slide is armed, so the band shows the slid day and this turns the map’s sky to the present moment. The day you were reading returns when Slide closes.',
    pickHint:
      'Slide is armed: the map’s sky moves to the chosen date at the same local time. The day you were reading returns when Slide closes.',
  },
  // The live time cursor on a registered band track.
  now: 'Now',
  // Footer: which timezone the clock reads in.
  zoneNote: 'Local time at this point ({zone})',
  // Table toggle at the band's left edge: the inline times list (the default)
  // laid out as the speculum table instead.
  detail: {
    label: 'Table',
    tipShow: 'Lay the times out as a table',
    tipHide: 'Back to the inline list',
    hint: 'The four angle moments as rows, one column per body. Scroll or drag the row if it runs past the edge.',
  },
  // "Time Stamp" toggle in the context column: read the sky at a chosen spot, marked
  // by the map beacon. On desktop the band reads live under the cursor and a click parks
  // it; on touch there's no cursor, so a tap places (and moves) the stamp — the held half.
  follow: {
    label: 'Time Stamp',
    tipOn: 'Read the sky at a chosen spot',
    tipOff: 'Stop — back to the pin',
    hint: 'Read the sky clock live under the cursor as it moves across the map. Click the map to hold a spot; click again to resume. Turn off to return to the pin or birthplace.',
    hintHeld: 'Held at the clicked spot — click the map again to resume following, or turn this off to return to the pin or birthplace.',
    hintTouch: 'Tap a spot on the map to read its sky clock there; tap again to move the stamp. Turn off to return to the pin or birthplace.',
  },
  // PLANETARY HOURS — the band's module: a chip at the legend's head (the day's
  // ruler and the hour in force at the point, at the current moment or the Slide
  // tool's slid one) that opens and closes a window listing the shown day's 24
  // hours. {hour} / {day} are planet display names — the noun-adjunct form the
  // map's own tips use ("Venus zenith", "Mars rising").
  planetary: {
    // The chip's tip headline while an hour is in force on the shown day
    // (glyph-prefixed).
    now: '{hour} hour, until {end}',
    // The chip's headline when the shown day isn't today, and the window's line
    // over the day's list — the day and its ruler.
    day: '{weekday} · day ruler {day}',
    // The chip's hint: what a click does, by the window's state.
    chip: {
      openHint: 'Open the day’s 24 planetary hours in their own window.',
      // The shown day has no hours here (polar day or night): the window says why.
      openHintNone: 'Open the planetary hours window to read why there are none here.',
      closeHint: 'Close the planetary hours window.',
    },
    // The window itself.
    hud: {
      title: 'Planetary hours',
      closeAria: 'Close planetary hours',
      closeHint: 'Close this window. The hours chip at the start of the Sky Times band brings it back.',
    },
    // The window's lead block: the hour in force, where it falls, and the instant
    // it was read at — the present (refreshed on the minute while the window is
    // open), or the Slide tool's slid moment.
    hourName: '{hour} hour',
    hourOfDay: 'Hour {n} of the day',
    hourOfNight: 'Hour {n} of the night',
    until: 'until {end}',
    nowAt: 'Now {time}',
    slideAt: 'Slid to {time}',
    // Column heads: each half of the day and the length of one of its hours.
    colDay: 'Day · {len}',
    colNight: 'Night · {len}',
    minutes: '{m} min',
    nextSunrise: 'Next sunrise {time}',
    // The hour in force belongs to a neighbouring planetary day — the day starts at
    // sunrise, not midnight — so it isn't in the list. {prev} / {next} name that
    // day, {day} the listed one, {time} the sunrise between them.
    beforeSunrise: 'Still {prev}’s night — {day}’s hours begin at sunrise, {time}.',
    // …and the listed day itself has none (its block below says why).
    beforeSunriseNone: 'Still {prev}’s night — {day} itself has no planetary hours here.',
    afterNextSunrise: '{next}’s hours have begun — its sunrise was at {time}.',
    // The instant belongs to a neighbouring day that has NO hours here — the night
    // before a polar day's first sunrise, or a polar day already begun. The chip
    // reads "not available" then; this is the window's matching explanation.
    prevNone: '{prev}’s night has no planetary hours here — {day}’s begin at sunrise, {time}.',
    prevNoneEither: '{prev}’s night has no planetary hours here, and neither has {day}.',
    nextNone: '{next} has begun, and has no planetary hours here.',
    order: 'Hour 1 goes to the day ruler; the rest follow this order, repeating:',
    // The chip's tip headline for an unavailable reading.
    unavailable: 'Planetary hours · not available here',
    // The window's: over a polar day's reason, or its whole body in the rare case
    // no planetary days could be computed at all (no ephemeris for the Sun). The
    // window's own title already says "Planetary hours".
    unavailableShort: 'Not available here',
    reason: {
      sunUp:
        'The Sun stays up all night here around {weekday}, so there is no sunrise-to-sunrise day to divide into hours. Try another date or a place nearer the equator.',
      sunDown:
        'The Sun doesn’t rise here on {weekday}, so there is no daylight to divide into hours. Try another date or a place nearer the equator.',
      noNextSunrise:
        'The Sun doesn’t rise here the morning after {weekday}, so that night has no end to divide into hours. Try another date or a place nearer the equator.',
    },
    // The chip button's accessible name (its pressed state carries open/closed).
    aria: {
      now: 'Planetary hours: {hour} hour until {end}, day ruler {day}',
      day: 'Planetary hours for {weekday}, day ruler {day}',
      unavailable: 'Planetary hours: not available here',
    },
  },
} as const;
