// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The eclipse picker bar (EclipseHud.tsx) shown while the Eclipses overlay is
// active. Eclipse TYPE names reuse settings.eclipses.kind.*; "Saros" is the
// standard proper noun for the eclipse family cycle and stays untranslated in
// most locales.
export const eclipseHud = {
  title: 'Eclipses',
  // Trigger hover tip + accessible label.
  choose: 'Choose an eclipse',
  prev: 'Previous eclipse',
  next: 'Next eclipse',
  // The ⌖ button: fly the camera to the selected eclipse's ground point.
  locate: 'Fly to this eclipse',
  // The picker's filter rows: a body row (All / Solar / Lunar) and a type row
  // contextual to the chosen body (names from settings.eclipses.*).
  all: 'All',
  searchPlaceholder: 'Search year, type, or Saros…',
  noMatches: 'No eclipses match.',
  // Compact Saros tag in rows and the trigger meta line, e.g. "Saros 139".
  saros: 'Saros {n}',
  // The eye on the nub collapses/expands the body (vitals, contacts, options),
  // leaving just the nub — to focus on the map.
  barToggle: {
    show: 'Show eclipse details',
    hide: 'Hide eclipse details',
  },
} as const;
