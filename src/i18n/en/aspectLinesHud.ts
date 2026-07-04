// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The movable "Aspect Lines" window (Settings ▸ Advanced ▸ Lines ▸ Aspect Lines ▸
// Filters & orbs): display filters for the map's aspect lines, and every aspect
// orb laid out at once. A gated-tier surface (lib/plan). Aspect glyphs (⚹ △ □)
// are language-neutral and stay OUT of the catalog — rendered in JSX beside the
// titles.
export const aspectLinesHud = {
  title: 'Aspects',
  closeAria: 'Close Aspects',
  closeHint:
    'Close this window. The lines stay on — turn them off from Settings ▸ Advanced ▸ Lines.',
  filters: { label: 'Filters' },
  harmonious: {
    title: 'Harmonious',
    hint: 'Sextile and trine lines. One family by geometry: every line reads as a sextile from one end of its axis and a trine from the other.',
  },
  challenging: {
    title: 'Challenging',
    hint: 'Square lines — a square to one end of an axis is a square to the other, so this family stands alone.',
  },
  mcAxis: {
    title: 'Midheaven axis',
    hint: 'Lines aspecting the MC (each also readable from the IC).',
  },
  ascAxis: {
    title: 'Horizon axis',
    hint: 'Lines aspecting the Ascendant (each also readable from the Descendant).',
  },
  orbs: {
    label: 'Aspect orbs',
    infoTitle: 'Aspect orbs',
    infoHint:
      'Max distance from exact (degrees) in the chart wheel and aspect lists. The map’s aspect lines mark the exact angle and take no orb.',
  },
} as const;
