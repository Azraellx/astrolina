// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The birth-details form (BirthDataForm.tsx): field labels, placeholders, aria-labels,
// timezone status/notes (the IANA zone name is interpolated as {iana}, not translated),
// birthplace search states, and validation errors.
export const chartForm = {
  name: 'Name',
  namePlaceholder: 'Enter a chart name',
  dateLabel: 'Date (Y / M / D)',
  year: 'Year',
  month: 'Month',
  day: 'Day',
  timeLabel: 'Local Time',
  // The (i) beside the Local Time caption. hintBlank is the birth form's version
  // (its time is clearable — blank = unknown); the plain hint serves callers whose
  // moment must stay complete (the timeline's date modal).
  timeInfo: {
    hint: 'Local time at the place, in the 24-hour clock — e.g. 21:30 for 9:30 pm.',
    hintBlank:
      'Local time at the birthplace, in the 24-hour clock — e.g. 21:30 for 9:30 pm. Don’t know the birth time? Leave it blank.',
  },
  hour: 'Hour',
  minute: 'Minute',
  timeZone: 'Time zone',
  // Shown above the (disabled) moment fields when editing a composite chart.
  compositeMoment:
    'Composite chart: the planets are midpoints of its two parents, and the date below is the synthesized map-frame anchor (kept in sync automatically).',
  tz: {
    selectLabel: 'Choose time zone',
    utcLabel: 'Choose UTC offset',
    auto: 'Auto',
    autoTip: 'Reset to the zone detected from the birthplace ({iana})',
    setPlace: 'Set a birthplace to choose a time zone',
    setDate: 'Add the birth date to set the time zone',
    verifyDst: 'verify DST',
    // Shown when the birth predates standard time in this region: the offset is
    // the birthplace's own local mean time, derived from its longitude.
    lmt: 'LMT (local mean time of the birthplace)',
  },
  // The note shown once the user has moved past an EMPTY time (started on the
  // birthplace) — the moment "leave it empty" has already happened, so it says
  // what saving will do, in plain words: the grey "?" mark, planets still shown,
  // the time-dependent lines hidden.
  timeUnknown: {
    hint: 'No birth time will be saved as Unknown. You’ll still see the planets in their signs, but map lines and houses need an exact time, so they’ll stay hidden.',
  },
  // The tag toggle beside the time inputs: a "Tag" caption over a button whose label
  // is the tag name; its .ui-tip explains what it does. Normally the Star toggle; a
  // chart carrying a system tag shows that instead — 'shared' (link-received) can be
  // removed by pressing it, 'space' (app-generated) is a fixed, informational mark.
  tag: {
    caption: 'Tag',
    label: 'Star',
    assignTitle: 'Favorite this chart',
    assignHint: 'Mark this chart so you can find it easily',
    spaceLabel: 'Space',
    spaceTitle: 'A generated chart',
    spaceHint:
      'Set by the app on charts it generated for you — a composite or Davison chart.',
    sharedLabel: 'Share',
    removeSharedTitle: 'Remove the Share tag',
    removeSharedHint:
      'Added to a chart that arrived through a share link. Click to remove it; you can star the chart afterwards.',
  },
  birthplace: 'Birthplace',
  birthplacePlaceholder: 'City, country',
  searching: 'searching…',
  resolved: '✓ {label}',
  latitude: 'Latitude',
  longitude: 'Longitude',
  enterCoords: 'Enter manually',
  errorNoPlace: 'Choose a birthplace from the dropdown.',
  errorNoName: 'Add a name.',
  // The time is optional — leaving it empty marks the birth time unknown.
  errorNoDate: 'Add a birth date.',
  errorPartialTime:
    'Add the hour too — or clear the minutes to mark the birth time unknown.',
  // Tooltip on an out-of-range year box (not auto-corrected), and the matching
  // submit-blocked message. {min}/{max} are the ephemeris data's year range.
  yearRangeTip: 'Our ephemeris data covers {min}–{max}.',
  errorYearRange: 'Enter a year between {min} and {max}.',
  import: 'Import',
} as const;
