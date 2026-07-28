// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// ImportChartModal.tsx: the three steps of bringing charts in — paste or drop,
// say which column is which (only when the file needs it), then check the
// preview and commit. The `issue` block is the plain-language half of the
// parser's issue codes (lib/import/types.ts): every amber or red row cites one,
// and it is what the user actually reads, so each says what to DO where it can.
export const importChartModal = {
  title: 'Import charts',
  intro: 'Paste your chart data or drop in a file. Nothing is saved until you say so.',
  orSeparator: '— or —',
  dropzonePrefix: 'Drag & drop a ',
  dropzoneOr: ' or ',
  dropzoneSuffix: ', or click to choose a file',
  fileTypeError: 'Please drop a text file (.txt, .csv, .tsv or .aaf).',
  fileReadError: 'Could not read that file.',
  // Shown when the file was not UTF-8, so an odd-looking place name has an
  // explanation rather than being a mystery. {encoding} is e.g. windows-1252.
  encodingNote: 'Read as {encoding}.',
  // Shape names, shown so it is clear what was recognised.
  shape: {
    aaf: 'Exchange format',
    delimited: 'Separated columns',
    fixed: 'Aligned columns',
    block: 'Pasted details',
  },

  // ── Step 2: the column mapping ────────────────────────────────────────────
  map: {
    title: 'Which column is which?',
    // Aligned-column files have nothing to split on, so the boundaries are set
    // by hand. The guess is a starting point and is usually not right.
    hintFixed:
      'We have guessed where the columns divide. Click the ruler to add or remove a divider, then say what each column holds.',
    hintDelimited: 'Say what each column holds. Anything left as Ignore is not read.',
    column: 'Column {n}',
    empty: '(empty)',
    firstRowIsHeader: 'First row is a header',
    needMore: 'Name at least a date, a latitude and a longitude to continue.',
    continue: 'Continue',
    back: 'Back',
    // Saved layouts: the same file shape next time needs no work at all.
    savedApplied: 'Using your saved layout “{name}”.',
    saveThis: 'Remember this layout',
    saveName: 'Name this layout',
    savePlaceholder: 'e.g. My program’s export',
    saved: 'Saved. A file of this shape will use it next time.',
    forget: 'Forget this layout',
  },

  // What a column can hold. Kept short — they sit in a dropdown per column.
  target: {
    ignore: 'Ignore',
    name: 'Name',
    firstName: 'First name',
    lastName: 'Last name',
    date: 'Birth date',
    year: 'Year',
    month: 'Month',
    day: 'Day',
    time: 'Birth time',
    hour: 'Hour',
    minute: 'Minute',
    second: 'Second',
    meridiem: 'am/pm',
    offset: 'UTC offset',
    dstFlag: 'Daylight saving flag',
    zoneAbbrev: 'Zone abbreviation',
    place: 'Place',
    country: 'Country / state',
    latitude: 'Latitude',
    longitude: 'Longitude',
    notes: 'Notes',
    rating: 'Source rating',
    folder: 'Folder',
  },
  dateFormat: {
    label: 'Date order',
    auto: 'Work it out',
    dmy: 'Day first',
    mdy: 'Month first',
    ymd: 'Year first',
    yyyymmdd: 'YYYYMMDD',
    mmddyyyy: 'MMDDYYYY',
    ddmmyyyy: 'DDMMYYYY',
  },

  // ── Step 3: the preview ───────────────────────────────────────────────────
  controls: {
    // Which way the file counts longitude. Programs genuinely disagree, and a
    // flipped longitude draws a normal-looking map of the wrong hemisphere, so
    // this is asked rather than guessed.
    longitude: 'East / west',
    offset: 'Offset direction',
    eastPositive: 'East is positive',
    westPositive: 'West is positive',
    dateOrder: 'Date order',
    zone: 'Time zones',
    zoneFile: 'Keep the file’s',
    zoneApp: 'Work them out fresh',
    duplicates: 'Skip charts I already have',
    folder: 'Put them in',
    folderPlaceholder: 'Unfiled',
  },
  preview: {
    // The row tally above the table.
    counts: '{ready} ready · {warned} to check · {skipped} skipped',
    header: { status: '', name: 'Name', when: 'Born', where: 'Place' },
    noTime: '—',
    empty: 'Nothing recognised yet.',
    // Per-row toggle for a row the duplicate check set aside.
    include: 'Import anyway',
    exclude: 'Skip',
  },
  // The skipped rows, downloaded as a file to fix and drop back in.
  downloadRejected: 'Download the {count, plural, one {# skipped row} other {# skipped rows}}',
  rejectedFilename: 'charts-to-fix.txt',

  // ── Why a row is amber or red ─────────────────────────────────────────────
  issue: {
    // Rejections.
    noDate: 'No birth date.',
    badDate: 'Could not read the date “{value}”.',
    ambiguousDate:
      'The date “{value}” could be read two ways — set the date order above.',
    noPlace: 'No birthplace.',
    noCoords:
      'No coordinates for {place}. Add a latitude and longitude, or enter this chart by hand.',
    badCoords: 'Could not read the coordinates “{value}”.',
    latRange: 'Latitude {value} is not a real latitude.',
    lngRange: 'Longitude {value} is not a real longitude.',
    yearRange: 'The year {year} is outside the {min}–{max} range we can chart.',
    offsetRange: 'A UTC offset of {value} is not a real time zone.',
    fieldCount: 'This record has {got} fields where it should have {expected} — probably a stray comma.',
    unreadable: 'Nothing here we recognise.',
    // Warnings.
    noName: 'No name — saved as “Imported {fallback}”.',
    noTime: 'No birth time — imported with the time marked unknown.',
    // A noon reading that the source itself marks as a stand-in.
    noTimeAssumed:
      'The time is noon and the file marks it as a stand-in — imported with the time marked unknown.',
    noOffset: 'No UTC offset — worked out from the birthplace.',
    // The instant the file states for itself disagrees with the one its own
    // fields give. Worth a look: it usually means a daylight rule.
    jdMismatch: 'The file’s own stated moment is {minutes} minutes from what its date, time and zone give.',
    zoneDisagrees: 'The file says {file}; we make it {app}. Keeping the file’s.',
    signAssumed:
      'The coordinates have no N/S/E/W, so the east / west setting above decides them — check the place is on the right side of the world.',
    duplicate: 'Already in your library.',
  },

  importButton: 'Import {count, plural, one {# chart} other {# charts}}',
  importEmpty: 'Import',
} as const;
