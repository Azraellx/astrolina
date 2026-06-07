// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The movable "Teleport" search window: fly the map camera to any city, region or
// country. Place names and coordinates stay language-neutral and are not in this
// catalog.
export const teleportHud = {
  title: 'Teleport',
  // Drag-hint shown above the grip; the title reuses common.hud.dragToMove but this
  // window double-clicks to recentre (not dock), so it keeps its own hint line.
  recentreHint: 'Double-click to recentre',
  closeAria: 'Close Teleport',
  placeholder: 'Jump to a place…',
  searchAria: 'Search for a place to jump to',
  goForward: 'Go forward',
  goBack: 'Go back',
  // Result badge for each match's place kind (PlaceKind enum -> label).
  kind: {
    city: 'city',
    region: 'region',
    country: 'country',
  },
} as const;
