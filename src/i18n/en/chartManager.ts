// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

export const chartManager = {
  // Dialog aria-label and heading for the chart manager modal.
  dialogLabel: 'Charts',
  title: 'My Charts',
  // Search box placeholder, aria-label, and the clear-search button label.
  searchPlaceholder: 'Search names or places…',
  searchLabel: 'Search charts',
  clearSearch: 'Clear search',
  // Empty-state row when no charts have been saved.
  empty: 'No saved charts yet.',
  // "Add <query>" row offered when the typed name has no exact match.
  addQuery: 'Add “{name}”',
  // window.confirm before deleting a chart.
  deleteConfirm: 'Delete "{name}"?',
  // Header above the right-hand form when editing an existing chart.
  editingHeader: 'Editing {name}',
  // BirthDataForm submit-button labels owned by this view.
  saveChanges: 'Save changes',
  addChart: 'Add chart',
} as const;
