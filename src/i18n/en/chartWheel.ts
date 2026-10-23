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
  // Under the placeholder above in the corner minimap, while No chart (the sky alone) is chosen
  // and no overlay is drawing the sky (2026-10-20): how to get a wheel there. The minimap is
  // narrow (about 180 px of text), so keep it short. "Overlay menu" is the top bar's.
  skyHint: 'Choose Transits or Eclipses in the Overlay menu for the sky’s wheel.',
  // Shown in the empty wheel when an overlay with no coherent chart (Cyclo·cartography)
  // is promoted with the natal chart hidden — there's nothing to draw.
  noChart: 'NO CHART (CCG)',
} as const;
