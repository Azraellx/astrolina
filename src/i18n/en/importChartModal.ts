// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// ImportChartModal.tsx: paste/drop UI for bulk-importing charts. The intro, dropzone
// prose, file-read errors, the parse-error item (⚠ {er}, where er is a runtime message
// from importCharts.ts), and the pluralized Import button live here. Close/Cancel reuse
// the common namespace.
export const importChartModal = {
  title: 'Import charts',
  intro: 'Paste a chart or drop in a file (multiple charts are supported).',
  orSeparator: '— or —',
  dropzonePrefix: 'Drag & drop a ',
  dropzoneOr: ' or ',
  dropzoneSuffix: ', or click to choose a file',
  fileTypeError: 'Please drop a .txt or .csv file.',
  fileReadError: 'Could not read that file.',
  parseError: '⚠ {er}',
  importButton: 'Import {count, plural, one {# chart} other {# charts}}',
  importEmpty: 'Import',
} as const;
