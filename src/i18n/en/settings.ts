// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The controls panel (Sidebar.tsx): section/heading text plus the enum label+hint maps.
// Enum sub-keys are the exact code values (PlanetName/HouseSystem/…); the InfoBar chip
// reads the same label maps via makeEnumLabels so the two never drift. Proper-noun house
// systems (placidus, koch, …) keep their eponyms verbatim.
export const settings = {
  sections: {
    appearance: 'Appearance',
    mapFilters: 'Map filters',
    calculation: 'Calculation',
    overlay: 'Overlay',
  },
  headings: {
    theme: 'Theme',
    details: 'Details',
    projection: 'Projection',
    language: 'Language',
    planets: 'Planets',
    asteroids: 'Asteroids',
    lines: 'Lines',
    lineSystem: 'Line system',
    lineProjection: 'Line projection',
    lunarNode: 'Lunar node',
    houseSystem: 'House system',
    primaryRate: 'Primary directions rate',
    display: 'Display',
    positioning: 'Positioning',
    chartAngle: 'Chart Angle',
  },
  details: { roads: 'Roads', rivers: 'Rivers', labels: 'Labels' },
  shiftTag: 'Shift',
  timelineBar: 'Timeline bar',
  // Tooltip on a language that is listed but not yet translated.
  languageUnavailable: 'Not available at this time.',
  userRate: { label: 'Degrees per year' },
  parans: {
    title: 'Parans',
    hint: 'Latitudes where two bodies are angular at the same moment, one rising as another culminates, and so on. Drawn as horizontal lines across the map.',
  },
  localSpace: {
    title: 'Local Space',
    hint: 'Directional lines radiating from the birthplace, each pointing to a planet’s compass bearing in the local sky.',
  },

  theme: {
    glass: { label: 'Glass' },
    dark: { label: 'Dark' },
    vintage: { label: 'Earth' },
  },

  projection: {
    '2d': { label: 'Flat', hint: 'Classic Web-Mercator map' },
    '3d': { label: 'Globe', hint: 'Rotatable 3D globe' },
  },

  lineSystem: {
    celestial: {
      label: 'Celestial',
      hint: 'Standard astrocartography: angles placed by the sky (sidereal time)',
    },
    geodetic: {
      label: 'Mundane',
      hint: "Geodetic mapping: the zodiac mapped onto Earth's longitudes (Greenwich = 0° Aries), independent of birth time",
    },
  },

  coordSystem: {
    mundo: {
      label: 'In Mundo',
      hint: 'Lines use each body’s true position in the sky (RA / dec). Most affects Pluto and the Moon.',
    },
    zodiaco: {
      label: 'In Zodiaco',
      hint: 'Bodies are projected onto the ecliptic before drawing lines (a common ACG default).',
    },
  },

  nodeType: {
    true: {
      label: 'True Node',
      hint: 'True (osculating) node follows the Moon’s instantaneous orbit; oscillates ±~1.5° around the mean and can briefly turn direct (desktop-tool default).',
    },
    mean: {
      label: 'Mean Node',
      hint: 'The smoothed long-term average; always moves retrograde at a steady rate.',
    },
  },

  houseSystem: {
    placidus: { label: 'Placidus', hint: 'Semi-arc time division (the common modern default)' },
    koch: { label: 'Koch', hint: 'Semi-arc on the birth latitude (GOH)' },
    regiomontanus: { label: 'Regiomontanus', hint: 'Equal divisions of the celestial equator' },
    campanus: { label: 'Campanus', hint: 'Equal divisions of the prime vertical' },
    porphyry: { label: 'Porphyry', hint: 'Each quadrant trisected in ecliptic longitude' },
    alcabitus: { label: 'Alcabitus', hint: 'Ancient semi-arc on the diurnal / nocturnal arcs' },
    whole: { label: 'Whole Sign', hint: 'Each house is a whole sign from the rising sign' },
    equal: { label: 'Equal', hint: '30° houses measured from the Ascendant' },
  },

  primaryRate: {
    ptolemy: { label: 'Ptolemy (1°/yr)', hint: 'One year per degree.' },
    naibod: { label: 'Naibod (59′08″/yr)', hint: '0.985647° per year, the Sun’s mean motion.' },
    cardan: { label: 'Cardan (59′12″/yr)', hint: '0.986667° per year.' },
    'kepler-ra': { label: 'Kepler: Natal Solar RA', hint: 'Natal Sun’s daily motion in right ascension × years.' },
    'solar-long': { label: 'Natal Solar: Longitude', hint: 'Natal Sun’s daily motion in ecliptic longitude × years.' },
    'placidus-ra': { label: 'Placidus: True SA in RA', hint: 'True secondary-progressed solar arc in RA (nonlinear).' },
    user: { label: 'User rate', hint: 'Enter your own degrees-per-year below.' },
  },

  positioning: {
    'relative-to-natal': {
      label: 'Relative',
      hint: 'Frame the overlay against your natal chart’s angles (radix-relative); the lines drift slowly with the planets’ own motion. The default most astrologers work with.',
    },
    'transit-moment': {
      label: 'Absolute',
      hint: 'Place the overlay at its own moment in the sky (that instant’s sidereal time); the lines sweep about 15° per hour with Earth’s rotation. Standard transit astrocartography.',
    },
  },

  chartAngle: {
    'sa-long': { label: 'SA in Longitude', hint: 'Solar arc in ecliptic longitude (the classic solar-arc default).' },
    'sa-ra': { label: 'SA in RA', hint: 'Solar arc measured in right ascension.' },
    'naibod-long': { label: 'Naibod in Long', hint: 'Mean solar rate 0.9856°/yr, applied in longitude.' },
    'naibod-ra': { label: 'Naibod in RA', hint: 'Mean solar rate 0.9856°/yr, applied in right ascension.' },
    'mean-quotidian': { label: 'Mean Quotidian', hint: 'Quotidian progressed angle (one day per year); on Solar Arc it matches SA in Longitude.' },
  },

  // Line-type tooltip text only; the As/Ds/MC/IC button labels stay language-neutral.
  lineType: {
    MC: { hint: 'Midheaven (career, public)' },
    IC: { hint: 'Imum Coeli (home, roots)' },
    ASC: { hint: 'Ascendant (self, identity)' },
    DSC: { hint: 'Descendant (relationships)' },
  },
} as const;
