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
  // The heart beside the dialog's close ✕ — opens the acknowledgements sub-dialog.
  // The names, addresses, and site labels listed there are proper nouns and stay as
  // written in every language, so they live in the component rather than here.
  thanks: {
    tip: 'Special thanks',
    hint: 'View credits',
    title: 'Special thanks',
    // The lead astrologer comes first and alone — the app is her practice put into
    // software, which is a different kind of credit from the thanks below it.
    leadRole: 'The astrologer behind AstroLina',
    leadBody:
      'This app began as her practice, and it still answers to it. The methods it follows, the conventions it holds to, and the judgement behind every line it draws are hers — explained patiently, and often more than once, until the software matched the craft.',
    othersHeading: 'With thanks also to',
    body: 'Two professional astrologers gave their time, their expertise, and a great deal of patience to this project — answering questions, checking conventions, and helping an early tool find its footing. It would be a lesser thing without them.',
    role: 'Professional astrologer',
  },
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
    photon: 'Online place and address search; data © OpenStreetMap contributors.',
    swisseph: 'Planetary positions (JPL DE441). © Astrodienst AG, via @swisseph/browser.',
    nasaEclipse:
      'Solar- and lunar-eclipse catalogs (dates, types, Saros series). Eclipse Predictions by Fred Espenak and Jean Meeus (NASA/GSFC).',
    noto: 'Astrological glyphs. © 2022 The Noto Project Authors.',
    maplibre: 'Interactive map rendering.',
    other: 'Plus other MIT-licensed libraries listed in the project repository.',
  },
  footer:
    " · The astrocartography calculations and interface design are AstroLina's own; the underlying ephemeris and map data are credited above.",
} as const;
