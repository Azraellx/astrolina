// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Strings shared across multiple components. Feature-specific text lives in that
// feature's own fragment; only genuinely reused strings belong here.
export const common = {
  close: 'Close',
  cancel: 'Cancel',
  edit: 'Edit',
  delete: 'Delete',
  // Fallback location label shown when the cursor is over open water.
  locationFallbackOcean: 'Ocean',
  // Pre-1970 timezone DST caution (App header + expanded sidebar).
  tzWarning: '⚠ Pre-1970 timezone outside US/EU: verify DST against an atlas',
  // Spelled-out cardinal direction words. (The single-letter DMS readout codes in
  // coordFormat.ts stay language-neutral as cartographic convention; these are here
  // for any spelled-out use and for locales where the letters differ.)
  cardinal: { north: 'N', south: 'S', east: 'E', west: 'W' },
  hud: {
    dragToMove: 'Drag to move',
    dockHint: 'Double-click to dock · snaps to centre',
  },
} as const;
