// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Planet/luminary/node/asteroid display names (was PLANET_DISPLAY in ephemeris.ts) and
// the one-line astrological themes used in the Map-filters tips (was PLANET_THEMES in
// Sidebar.tsx). Keyed by the PlanetName code; resolved via makeEnumLabels().planet and
// .planetTheme. Glyphs and 2-letter codes stay language-neutral (glyphChars.ts).
export const planets = {
  Sun: { name: 'Sun', theme: 'Your core identity, vitality, and where you shine.' },
  Moon: { name: 'Moon', theme: 'Emotions, instinct, and what makes you feel at home.' },
  Mercury: { name: 'Mercury', theme: 'The mind: how you think, learn, and communicate.' },
  Venus: { name: 'Venus', theme: 'Love, beauty, pleasure, and what you value.' },
  Mars: { name: 'Mars', theme: 'Drive, courage, and how you assert yourself and act.' },
  Jupiter: { name: 'Jupiter', theme: 'Growth, luck, and where life expands and feels generous.' },
  Saturn: { name: 'Saturn', theme: 'Discipline, limits, and the hard-won lessons of maturity.' },
  Uranus: { name: 'Uranus', theme: 'Sudden change, freedom, and your spark of rebellion.' },
  Neptune: { name: 'Neptune', theme: 'Dreams, intuition, spirituality, and beautiful illusion.' },
  Pluto: { name: 'Pluto', theme: 'Power, intensity, and profound transformation and rebirth.' },
  NorthNode: { name: 'N Node', theme: 'Your growth edge: where life calls you forward, and belonging finds you.' },
  SouthNode: { name: 'S Node', theme: 'Familiar ground: inherited gifts, deep roots, and what you’re ready to release.' },
  Lilith: { name: 'Lilith', theme: 'Raw, untamed instinct and where you refuse to be tamed.' },
  Chiron: { name: 'Chiron', theme: 'The wounded healer: healing through your own deepest hurt.' },
  Ceres: { name: 'Ceres', theme: 'Nurturing, nourishment, and life’s cycles of loss and return.' },
  Pallas: { name: 'Pallas', theme: 'Strategy, skill, and clear-eyed problem-solving.' },
  Juno: { name: 'Juno', theme: 'Commitment, partnership, and what you need to feel it’s equal.' },
  Vesta: { name: 'Vesta', theme: 'Devotion, focus, and the inner flame you keep sacred.' },
  Fortune: { name: 'Fortune', theme: 'Ease, flourishing, and where body and worldly life prosper.' },
} as const;
