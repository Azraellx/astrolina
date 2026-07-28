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
