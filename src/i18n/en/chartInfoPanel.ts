// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Collapsible "Chart Info" panel: planet/angle longitude readouts and the aspect
// colour legend. The 3-letter sign codes (Ari…Pis), the angle abbreviations
// (As/MC/Ds/IC), planet glyphs/colours and the DMS numeric format stay
// language-neutral and live in the component.
export const chartInfoPanel = {
  title: 'Chart Info',
  relocated: 'relocated',
  planets: 'Planets',
  angles: 'Angles',
  empty: 'No chart loaded.',
  legend: {
    trineSextile: 'trine / sextile',
    squareOpp: 'square / opp',
    conj: 'conj',
  },
} as const;
