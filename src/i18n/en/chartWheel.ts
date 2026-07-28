// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Compact natal-chart wheel in the corner minimap: its two controls (open the
// full sidebar wheel, resize in place) and the empty-state placeholder.
export const chartWheel = {
  resizeLabel: 'Toggle wheel size',
  shrink: 'Shrink wheel',
  enlarge: 'Enlarge wheel',
  // The minimap's doorway to the sidebar wheel — the same panel the top bar's
  // toggle opens, offered again once the mini wheel has been enlarged. It exists
  // twice on purpose: enlarging is someone asking for a closer read, and nothing
  // about a small wheel suggests a fuller one is a click away.
  openSidebar: 'Open the full wheel',
  openSidebarHint: 'A larger wheel with aspects and the planet table, in the side panel.',
  openSidebarLabel: 'Show chart sidebar',
  placeholder: 'No chart selected',
  // Shown in the empty wheel when an overlay with no coherent chart (Cyclo·cartography)
  // is promoted with the natal chart hidden — there's nothing to draw.
  noChart: 'NO CHART (CCG)',
} as const;
