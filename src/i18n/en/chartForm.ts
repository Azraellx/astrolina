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
  timeLabel: 'Time (local, 24h)',
  hour: 'Hour',
  minute: 'Minute',
  timeZone: 'Time zone',
  // Shown above the (disabled) moment fields when editing a composite chart.
  compositeMoment:
    'Composite chart: the planets are midpoints of its two parents, and the date below is the synthesized map-frame anchor (kept in sync automatically).',
  tz: {
    selectLabel: 'Choose time zone',
    auto: 'Auto',
    autoTip: 'Reset to the zone detected from the birthplace ({iana})',
    setPlace: 'Set a birthplace to choose a time zone',
    verifyDst: 'verify DST',
  },
  // The Star toggle beside the time inputs: a "Tag" caption over a button whose label
  // is the tag name; its .ui-tip explains what it does.
  tag: {
    caption: 'Tag',
    label: 'Star',
    assignTitle: 'Favorite this chart',
    assignHint: 'Mark this chart so you can find it easily',
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
  import: 'Import',
} as const;
