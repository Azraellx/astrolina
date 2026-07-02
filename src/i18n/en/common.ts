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
  // Unknown-birth-time banner (App header / coordinates window). Kept terse —
  // the chart form's note carries the full explanation of the degrade.
  timeUnknownBanner: 'Birth time unknown',
  // Spelled-out cardinal direction words. (The single-letter DMS readout codes in
  // coordFormat.ts stay language-neutral as cartographic convention; these are here
  // for any spelled-out use and for locales where the letters differ.)
  cardinal: { north: 'N', south: 'S', east: 'E', west: 'W' },
  hud: {
    dragToMove: 'Drag to move',
    // Shown as a hotkey pill — the word before the click icon ("Double" + 🖱 reads as
    // a double-click) — then the plain-text explanation after it.
    dockKey: 'Double',
    dockHint: 'to dock · snaps to centre',
    // Same "Double 🖱" pill, but for the floating windows (Location / Guides) that
    // recentre on double-click instead of docking — they have no dock home.
    recentreHint: 'to recentre',
    // The eye on a tool window's header collapses its body to just the title bar (like the
    // overlay nubs), to clear screen clutter without leaving the tool. Aria labels.
    collapse: 'Collapse panel',
    expand: 'Expand panel',
    // Hover-tip hint under the collapse/expand eye (shared by both states).
    collapseHint: 'Show or hide the controls.',
  },
} as const;
