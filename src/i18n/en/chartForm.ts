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
  decreaseOffset: 'Decrease offset 15 minutes',
  increaseOffset: 'Increase offset 15 minutes',
  tz: {
    manualPrefix: 'Manual ·',
    useDetected: 'use detected',
    useDetectedTip: 'Use detected {iana}',
    manualOffset: 'Manual offset',
    auto: 'Auto · {iana}',
    autoVerifyDst: 'Auto · {iana} · verify DST',
    setPlace: 'Set a place to detect',
  },
  birthplace: 'Birthplace',
  birthplacePlaceholder: 'City, country',
  searching: 'searching…',
  resolved: '✓ {label}',
  latitude: 'Latitude',
  longitude: 'Longitude',
  errorNoPlace: 'Choose a birthplace from the dropdown.',
  errorNoName: 'Add a name.',
  import: 'Import',
} as const;
