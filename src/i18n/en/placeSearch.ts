// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The shared place-search field (components/ui/PlaceSearchField). Only the
// field's OWN states live here: the built-in scope's chip, the empty result and
// the generic failure. Placeholders and labels come from each host, and any
// search scope a downstream build registers brings its own strings.
export const placeSearch = {
  scopeLabel: 'Place',
  noMatches: 'No matches.',
  failed: 'Couldn’t run that search. Try again.',
  scopeAria: 'Search scope',
  // Fallback for a paged group whose contributor supplied no wording.
  more: 'Show more',
} as const;
