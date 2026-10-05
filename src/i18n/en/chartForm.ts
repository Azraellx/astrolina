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
    // The five ways to give a zone (2026-10-02): the switch's short labels, then
    // each one's full name (its hover headline AND its screen-reader name, since
    // "Standard" alone doesn't say what is being chosen) and what it does.
    modesAria: 'How the time zone is given',
    mode: {
      auto: 'Auto',
      standard: 'Standard',
      offset: 'Offset',
      iana: 'IANA',
      utc: 'UTC',
    },
    modeTip: {
      auto: 'Auto: detected from the birthplace',
      standard: 'Standard zone + daylight',
      offset: 'Exact offset',
      iana: 'IANA time zone',
      utc: 'Whole-hour UTC offset',
    },
    modeHint: {
      auto: 'The birthplace’s zone and its daylight-saving rules on the birth date, or its local mean time before standard time began there.',
      standard:
        'A named standard zone plus the daylight correction your source gives, such as EST + daylight or GMT + double summer time.',
      offset:
        'The offset as your source prints it (5hw00, +5:30, 4:56:02 W), this birthplace’s local mean time, or UT.',
      iana: 'Any zone in the time-zone database, found by name, city or abbreviation. Its rules for the birth date give the offset.',
      utc: 'A fixed whole-hour offset from UTC, with no daylight saving.',
    },
    // The folded field's link (2026-10-05): it names how the zone is set now, as
    // "Enter manually" sits beside the coordinates, and unfolds the switch. Its
    // spoken name says what pressing it does, which the one word can't.
    automatic: 'Automatic',
    automaticAria: 'Time zone set automatically from the birthplace. Choose another way',
    setPlace: 'Set a birthplace to choose a time zone',
    setDate: 'Add the birth date to set the time zone',
    // Auto's own line: which zone the birthplace resolved to. {iana} is the
    // zone's id, not translated.
    detected: 'Detected from the birthplace: {iana}',
    // Standard zone + daylight. The zone names themselves are catalogue data
    // (lib/atlas/zoneEntry.ts), shown with region and offset, never alone.
    standardLabel: 'Standard zone',
    standardPick: 'Choose a zone…',
    // An imported record can state a standard offset no named zone here has.
    standardUnnamed: 'Standard time, no named zone · {offset}',
    // Trails a current zone that began within living memory (NZST from 1946),
    // so it isn't taken for the right name for an earlier birth.
    standardSince: 'from {year}',
    // Switching in found nothing to preselect: a mean-time birth, or a
    // birthplace whose standard time that year no zone in the list gives
    // (Istanbul in 2000 kept EET, which the list doesn't name for it).
    standardNone:
      'No zone in this list was this birthplace’s standard time on this date. Choose one, or give the offset instead.',
    // A daylight correction that takes the total past ±15 h (Line Islands +
    // double summer time). {offset} in both notations.
    offsetRange: 'That comes to {offset}, more than 15 hours from UT. Choose another correction.',
    daylightLabel: 'Daylight correction',
    // {amount} is the correction, "+1 h" or "+0:30".
    daylight: {
      standard: 'Standard time',
      daylight: 'Daylight saving {amount}',
      war: 'War time {amount}',
      double: 'Double summer time {amount}',
      half: 'Half-hour daylight {amount}',
    },
    // Exact offset: typed as the source prints it.
    offsetLabel: 'Offset as your source gives it',
    offsetPlaceholder: 'e.g. 5hw00, +5:30, 4:56:02 W',
    offsetUnread:
      'Can’t read that as an offset. Write it as 5hw00, −5:00, 4:56:02 W or UT, without decimals.',
    directionAria: 'Direction from Greenwich',
    east: 'E',
    eastTip: 'East of Greenwich',
    eastHint: 'Ahead of UT: 5h E is UTC+5.',
    west: 'W',
    westTip: 'West of Greenwich',
    westHint: 'Behind UT: 5h W is UTC−5.',
    // Why the E/W control is dimmed while the typed text names its own direction.
    directionStated: 'The offset you typed already says which way. Change it there.',
    lmtButton: 'Birthplace LMT',
    lmtTip: 'Local mean time of this birthplace',
    // {offset} is this birthplace's LMT in both notations.
    lmtHint:
      'Its longitude ÷ 15, to the second: {offset}. For a birth before standard time, or a source that gives LMT.',
    // The same, for a birthplace across the date line from the reckoning its
    // longitude implies (Alaska before 1867): a whole day added or taken, as
    // detection does, so the birth date means what it meant there.
    lmtHintShifted:
      'Its longitude ÷ 15, to the second, moved a whole day to the calendar kept there then: {offset}.',
    // Why the LMT button is unavailable: on its calendar of the time the
    // birthplace's mean time is past ±15 h (Manila before 1845).
    lmtBeyond: 'On this date that comes to more than 15 hours from UT, past what an offset can state. Auto gives it.',
    utButton: 'Time is UT',
    utTip: 'The birth time is in UT',
    utHint: 'For a time recorded in Universal Time (GMT): the offset is zero.',
    // The searchable IANA list.
    ianaLabel: 'Search time zones',
    ianaPlaceholder: 'Zone, city or abbreviation',
    ianaNoMatches: 'No time zone matches that.',
    // Read out to screen readers as the list narrows.
    ianaCount: '{count, plural, one {# time zone} other {# time zones}}',
    // Tag on the row for the zone the birthplace resolved to.
    ianaBirthplace: 'Birthplace',
    utcLabel: 'Choose UTC offset',
    utcPick: 'Choose an offset…',
    // Switching into the whole-hour picker from an offset it can't show.
    utcNone:
      'This birth’s offset, {offset}, isn’t a whole hour. Choose one, or give the exact offset instead.',
    // Switching into Exact offset from an offset past ±15 h (a date-line mean time).
    offsetNone:
      'This birth’s offset, {offset}, is more than 15 hours from UT, past what an offset can state. Type one, or switch back to Auto.',
    // The line under the control: what the entered clock means in UT.
    // {local} is the clock plus any zone abbreviation ("14:30 EDT"), {offset}
    // both notations ("UTC−4 · 4h W").
    confirm: '{local} ({offset}) = {ut} UT',
    confirmNextDay: '{local} ({offset}) = {ut} UT the next day',
    confirmPrevDay: '{local} ({offset}) = {ut} UT the day before',
    confirmNoTime: '{line}, using noon for the unknown time',
    // A saved chart whose stored offset its own terms no longer give (older zone
    // data, a file's offset kept on import) reopens on that stored number. The
    // note names the terms it was saved in: Auto, a picked zone ({zone} is its
    // id, not translated), the whole-hour picker, or a recorded entry.
    keptAsSaved: 'Kept as saved. Auto would now give {offset}.',
    keptAsSavedZone: 'Kept as saved. {zone} would now give {offset}.',
    keptAsSavedUtc: 'Kept as saved. Its whole-hour offset would now give {offset}.',
    keptAsSavedTerms: 'Kept as saved. The terms recorded with it would now give {offset}.',
    keptAsSavedUnread: 'Kept as saved. The terms recorded with it can’t be read.',
    composite: 'UT, fixed for a composite chart',
    errorPending: 'Choose a time zone, or switch back to Auto.',
    errorRange: 'A time zone can’t be more than 15 hours from UT. Choose another correction, or switch back to Auto.',
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
    hint: 'No birth time will be saved as Unknown. You’ll still see the planets in their signs; on celestial maps, lines and houses need an exact time, so they’ll stay hidden there.',
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
  // Where the person lives NOW — optional, and blank simply means "the
  // birthplace". Worth setting on anyone who has moved: the direction-based
  // views can then radiate from where they actually live.
  home: 'Lives now',
  // Said whenever this tab is open, because the tab row makes the two places look
  // like peers and a birthplace IS chart-determining input — so the question this
  // field raises is "will this move my chart?". Answer it before it is asked, and
  // in terms of what the field is FOR. Deliberately names no view: this is read by
  // people who have reached none of them yet.
  homeHint:
    'Nothing here changes the chart — that’s the birth data’s job. This is the starting point for views that measure direction from where someone lives now.',
  // Was "Same as birthplace", which said the two were interchangeable inputs —
  // the very reading the hint above exists to prevent. States the fallback
  // without implying the places are the same kind of thing.
  homeUnset: 'Not set — the birthplace is used instead.',
  // The same fact as a VALUE, for the inline home editor's value slot (which
  // reads "Home: <value> [Set…]" — a sentence would not fit there, and that
  // surface is already explicitly about which point the bearings radiate from,
  // so it never invites the confusion the form's tabs do).
  homeSameAsBirth: 'Same as birthplace',
  homeSet: 'Set…',
  homeChange: 'Change',
  homeCancel: 'Cancel',
  homeClear: 'Clear',
  homePlaceholder: 'Where they live now…',
  homeAria: 'Search for where this person lives now',
  // Group label for the Birthplace / Lives now caption tabs — the two captions
  // above the form's single place box, which pick what that box edits.
  placeTabsAria: 'Which place to edit',
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
  // The folder button beside Add chart: where the chart being saved will land.
  // Starts on the folder the last chart went into.
  folderPicker: {
    tip: 'Choose the folder this chart goes in',
    unfiled: 'Unfiled',
    new: 'New folder',
    // A '/' makes a subfolder, e.g. Clients/2026.
    newPlaceholder: 'Name, or Parent/Child',
  },
  // Free notes about where the birth data came from and how far to trust it.
  // Hidden behind the link until asked for; imports fill it in from whatever
  // the source carried, and then it shows by itself.
  addNotes: '+ Add notes/source',
  notes: 'Notes',
  // Kept short so the box sits flush with the source dropdown beside it.
  notesPlaceholder: 'Where this data came from…',
  // How far the birth data can be trusted — the Rodden-style code, beside the
  // notes because it answers the same question in a form the app can read.
  // Everything on the map hangs off the exact minute, so a certificate and a
  // recollection are not the same kind of chart even when they look alike.
  sourceRating: 'Source',
  // Short glosses, not definitions: a native dropdown shows the SELECTED
  // option's text when shut, so a long one would force the field wide and take
  // the width off the notes box beside it. The full wording is in the help
  // article, which is where someone learning the scale will actually read it.
  rating: {
    unset: 'No rating',
    unsetHint: 'Nobody has said how reliable this birth data is.',
    AA: 'Birth record',
    A: 'From memory',
    B: 'Biography',
    C: 'Unknown source',
    DD: 'Conflicting',
    X: 'No birth time',
    XX: 'Undetermined',
  },
  // The full meaning of each code, revealed as a hover explanation on its row
  // in the dropdown — which is what lets the labels above stay short.
  ratingHint: {
    AA: 'From a birth record: a certificate, or a hospital or state record.',
    A: 'From memory or a news report — quoted by the person, their family, or a friend.',
    B: 'From a biography or autobiography, where no source is given.',
    C: 'The source is unknown, or the time was rectified.',
    DD: 'Conflicting or unverified: accounts that disagree, with nothing to settle them.',
    X: 'No birth time is known.',
    XX: 'Undetermined.',
  },
} as const;
