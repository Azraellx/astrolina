// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

export const chartManager = {
  // Dialog aria-label and heading for the chart manager modal.
  dialogLabel: 'Charts',
  title: 'My Charts',
  // Header/label when the synastry overlay opens this browser to pick a partner;
  // {name} is the active chart being compared with.
  comparisonTitle: 'Synastry with {name}',
  // Leading word in the visible partner-picker heading, before the synastry icon + name.
  comparisonLabel: 'Synastry',
  // Search box placeholder, aria-label, and the clear-search button label.
  searchPlaceholder: 'Search names or places…',
  searchLabel: 'Search charts',
  clearSearch: 'Clear search',
  // Tag-filter chips under the search box (narrow the list by tag). Unknown is
  // the derived birth-time-unknown mark (grey "?"), not a stored tag; Shared is
  // the red gift on charts that arrived through a share link.
  filter: {
    label: 'Filter by tag',
    all: 'All',
    starred: 'Star',
    space: 'Space',
    unknown: 'Unknown',
    shared: 'Share',
  },
  // Folders. A folder is a path written on the chart, so the tree is whatever
  // paths are in use. Charts with no folder are simply listed after the tree,
  // under no heading — they are the ones not sorted yet, which is when you most
  // want to see them.
  folders: {
    new: 'New folder',
    newChild: 'New folder inside',
    rename: 'Rename folder',
    // Removing a folder never removes charts — they move up to the folder above.
    remove: 'Remove',
    // Heading of the right-click menu on a chart row (desktop): file it
    // somewhere without dragging it there.
    moveTo: 'Move to',
    unfiled: 'Unfiled',
    nameLabel: 'Folder name',
    namePlaceholder: 'Folder name',
  },
  // The eye toggle: blanks names, dates and places across the app so a screen
  // can be shared without sharing the library. The map is untouched.
  discreet: {
    hide: 'Hide birth details',
    show: 'Show birth details',
  },
  // Empty-state row when no charts have been saved.
  empty: 'No saved charts yet.',
  // Shown when a search or tag filter matches no charts (but some charts exist).
  noMatches: 'No charts match.',
  // "Add <query>" row offered when the typed name has no exact match.
  addQuery: 'Add “{name}”',
  // window.confirm before deleting a chart.
  // Header above the right-hand form when editing an existing chart.
  editingHeader: 'Editing {name}',
  // BirthDataForm submit-button labels owned by this view.
  saveChanges: 'Save changes',
  addChart: 'Add chart',
} as const;
