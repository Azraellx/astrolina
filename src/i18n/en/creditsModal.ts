// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The credits / license disclosures dialog (CreditsModal.tsx). Group headings, intro,
// accuracy disclaimer, per-dependency note prose, and the footer attribution. Item
// names, SPDX license ids, brand/proper nouns, and the astrolina.org domain label stay
// language-neutral and are NOT in this catalog.
export const creditsModal = {
  title: 'Credits & licenses',
  intro:
    'AstroLina is built on open data and open-source software. The full license texts are available in the project repository.',
  disclaimer: {
    label: '⚠️ Early access:',
    body: ' accuracy is still being verified. AstroLina uses the same datasets as the professional tools, but its output is still being cross-checked, and display bugs could currently misplace a line. Please treat results as provisional for now.',
  },
  groups: {
    astrolina: 'AstroLina',
    mapsPlaces: 'Maps & places',
    astronomy: 'Astronomy',
    typeSoftware: 'Type & software',
  },
  notes: {
    astrolina: '© 2026 AstroLina. Free, open-source software under the GNU Affero General Public License v3.0.',
    sourceCode: 'Full source code, available per the AGPL. Contributions welcome.',
    openstreetmap: 'Base map data (also credited on the map itself).',
    openfreemap: 'Free vector tiles, label fonts, and sprites.',
    maptiler: 'Basemap styling for the Earth theme. © MapTiler.com & OpenMapTiles contributors; © Mapbox.',
    geonames: 'Offline place-name search and city lookup.',
    swisseph: 'Planetary positions (JPL DE441). © Astrodienst AG, via @swisseph/browser.',
    nasaEclipse:
      'Solar-eclipse catalog (dates, types, Saros series). Eclipse Predictions by Fred Espenak and Jean Meeus (NASA/GSFC).',
    noto: 'Astrological glyphs. © 2022 The Noto Project Authors.',
    maplibre: 'Interactive map rendering.',
    other: 'Plus other MIT-licensed libraries listed in the project repository.',
  },
  footer:
    " · The astrocartography calculations and interface design are AstroLina's own; the underlying ephemeris and map data are credited above.",
} as const;
