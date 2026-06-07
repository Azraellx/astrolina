// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Hover-hint text for the interactive (sidebar) wheel: the one-line element ·
// modality · keyword gloss per sign and life-area gloss per house, the short
// keyword gloss per body, the four chart-angle hints, and the motion-state tags.
// Sign and planet display names come from labels.sign / labels.planet; the
// 3-letter sign codes and glyphs stay language-neutral.
export const wheel = {
  // House sector label in the house ring's hover hint, e.g. "House 5".
  house: 'House {number}',
  // One-line novice gloss per sign (element · modality · keyword), 0-based.
  signMeanings: {
    aries: 'Fire · Cardinal · initiative',
    taurus: 'Earth · Fixed · stability',
    gemini: 'Air · Mutable · curiosity',
    cancer: 'Water · Cardinal · nurture',
    leo: 'Fire · Fixed · self-expression',
    virgo: 'Earth · Mutable · precision',
    libra: 'Air · Cardinal · balance',
    scorpio: 'Water · Fixed · intensity',
    sagittarius: 'Fire · Mutable · adventure',
    capricorn: 'Earth · Cardinal · ambition',
    aquarius: 'Air · Fixed · innovation',
    pisces: 'Water · Mutable · imagination',
  },
  // One-line novice gloss per house (life area), 0-based.
  houseMeanings: {
    h1: 'Self · identity · first impressions',
    h2: 'Money · possessions · self-worth',
    h3: 'Communication · siblings · learning',
    h4: 'Home · family · roots',
    h5: 'Creativity · romance · children',
    h6: 'Work · health · daily routine',
    h7: 'Partnership · marriage · the "other"',
    h8: 'Intimacy · shared resources · rebirth',
    h9: 'Travel · philosophy · higher learning',
    h10: 'Career · reputation · public life',
    h11: 'Friends · community · hopes',
    h12: 'Solitude · the unseen · spirituality',
  },
  // Short keyword gloss per body, keyed by PlanetName.
  planetMeanings: {
    Sun: 'Identity · vitality · ego',
    Moon: 'Emotions · instinct · needs',
    Mercury: 'Mind · communication',
    Venus: 'Love · beauty · values',
    Mars: 'Drive · energy · action',
    Jupiter: 'Growth · luck · expansion',
    Saturn: 'Discipline · structure · limits',
    Uranus: 'Change · freedom · insight',
    Neptune: 'Dreams · intuition · spirit',
    Pluto: 'Power · transformation',
    NorthNode: "Soul's path · growth",
    SouthNode: 'Past · innate gifts',
    Lilith: 'Shadow · raw instinct',
    Chiron: 'The wounded healer',
    Ceres: 'Nurture · cycles',
    Pallas: 'Wisdom · strategy',
    Juno: 'Commitment · partnership',
    Vesta: 'Focus · devotion',
  },
  // The four chart angles, keyed by the two-letter label drawn on the wheel.
  angles: {
    As: { title: 'Ascendant', sub: 'Rising sign, the self & first impressions' },
    Ds: { title: 'Descendant', sub: 'Relationships & the "other"' },
    Mc: { title: 'Midheaven (Medium Coeli)', sub: 'Career, reputation & public life' },
    Ic: { title: 'Imum Coeli', sub: 'Home, roots & private life' },
  },
  // Motion-state tags appended to a readout sign's hover title.
  motion: {
    retrograde: 'Retrograde',
    stationary: 'Stationary',
  },
} as const;
