// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The credits / license disclosures dialog (CreditsModal.tsx). Group headings, intro,
// the report-a-problem notice, per-dependency note prose, and the footer attribution. Item
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
  // The invitation to report a problem, at the top of the dialog. Not a countdown to
  // its own removal: the ephemeris side is settled and says so, and what is young is
  // the software around it — where a reader's report is the fastest route to a fix.
  // Split in three so the opening sentence can carry the emphasis and the closing one
  // can be the link. A downstream build's help page can render lead + body under a
  // heading of its own rather than keeping a second copy of the wording, and point
  // `report` at itself instead of at the address (see creditsFooter's notice tail).
  notice: {
    lead: 'We’re new at this, and glad of your help.',
    body: 'The astronomy is solid — Swiss Ephemeris, JPL data, agreement with the professional tools to well under an arcsecond. The app around it is version one, and it does enough that we couldn’t have reached every corner before launch. So if a line looks wrong, a figure looks odd, or something simply won’t do what you asked, please tell us — every report is read by a person, and we mean to make this a tool you can rely on.',
    // The one thing in the notice to act on, so it is the only thing in it that links.
    report: 'Report an issue.',
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
