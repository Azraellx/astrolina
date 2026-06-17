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
    advanced: 'Advanced',
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
    zodiac: 'Zodiac',
    aspectOrbs: 'Aspect orbs',
    primaryRate: 'Pri. directions rate',
    display: 'Display',
    positioning: 'Positioning',
    chartAngle: 'Chart Angle',
    magnitudeSteps: 'Magnitude steps',
  },
  // Basemap detail toggles. Roads + rivers share one switch; "Place names" (city
  // and country text) is named to avoid confusion with the ACG line-label badges.
  details: {
    roadsRivers: 'Roads/Rivers',
    roadsRiversHint:
      'Shows the basemap’s road and river linework. Hide it for a cleaner backdrop behind the astrocartography lines.',
    placeNames: 'Names/Labels',
    placeNamesHint:
      'Shows the basemap’s city and country text. This is separate from the ACG line-label badges, which stay either way.',
  },
  shiftTag: 'Shift',
  // Overlay ▸ Display toggles — each a show/hide switch with a hover hint, like the
  // Parans toggle in Map filters. (The Timeline Bar show/hide toggle moved onto the
  // timeline nub itself — see timeline.barToggle.)
  overlayZenith: {
    title: 'Zenith/Nadirs',
    hint: 'Stamps where each overlay body is directly overhead (its zenith — a circle, on the MC line) and directly underfoot (its antipodal nadir — a diamond, on the IC line).',
  },
  natal: {
    title: 'Natal Chart',
    hint: 'The underlying birth chart. Hide it to show just the overlay.',
  },
  // Tooltip on a language that is listed but not yet translated.
  languageUnavailable: 'Coming soon.',
  userRate: { label: 'Degrees per year' },
  parans: {
    title: 'Parans',
    hint: 'Latitudes where two bodies are angular at the same moment, one rising as another culminates, and so on. Drawn as horizontal lines across the map.',
  },
  // Local Space + its origin selector live in the Local Space view (i18n localSpaceHud).
  aspectLines: {
    title: 'Aspect Lines',
    hint: 'Lines where a planet is sextile (⚹), square (□) or trine (△) to the MC or Ascendant — each aspect twice, once per side. A trine to the Asc doubles as a sextile to the Dsc; hover a line to see both readings. Conjunctions and oppositions are the planet’s own angle lines, already on the map.',
  },
  midpointLines: {
    title: 'Midpoint Lines',
    hint: 'Lines where the midpoint of two visible bodies sits exactly on an angle (e.g. Su/Mo MC). In Mundo uses the bodily midpoint (mean RA and declination); In Zodiaco the classic longitude midpoint. Narrow the planet filter to keep the set readable.',
  },
  zenithNadir: {
    title: 'Zenith/Nadirs',
    hint: 'Marks where each body is directly overhead (zenith — a circle on the MC line) and underfoot (nadir — a diamond on the IC line). Hover to identify, click to fly there.',
  },
  aspectOrbs: {
    hint: 'Max distance from exact (degrees) per aspect in the wheel and aspect lists. Luminaries widens every orb when the Sun or Moon is involved; Parallels is the declination orb.',
    // The stepper's label below the dropdown (which already names the picked orb);
    // it states the unit, like "Degrees per year" over in the Calculation tab.
    setDegrees: 'Set degrees',
    orbAria: 'Orb for {aspect} aspects, in degrees',
    lumLabel: 'Luminaries +',
    // Hover hint on the Luminaries+ pick in the orb dropdown.
    lumHint: 'Extra degrees of orb whenever the Sun or Moon is involved.',
    lumAria: 'Extra orb when a luminary is involved, in degrees',
    declinationLabel: 'Parallels',
    declinationAria: 'Orb for parallel and contraparallel aspects, in degrees of declination',
  },
  zodiac: {
    tropical: {
      label: 'Tropical',
      hint: 'Signs anchored to the seasons (0° Aries = the March equinox). The Western default.',
    },
    lahiri: {
      label: 'Sidereal · Lahiri',
      hint: 'Signs anchored to the fixed stars, by the Lahiri ayanamsa (the Vedic standard, ~24° behind tropical today). Changes the wheel and readouts; the map lines mark zodiac-independent events and stay put.',
    },
    'fagan-bradley': {
      label: 'Sidereal · Fagan/Bradley',
      hint: 'Signs anchored to the fixed stars, by the Fagan/Bradley ayanamsa (the Western sidereal standard). Changes the wheel and readouts; the map lines stay put.',
    },
  },
  starLines: {
    title: 'Fixed Stars',
    hint: 'Angle lines for the classic fixed stars (Regulus, Spica, Algol and company): dotted lines threaded with little stars, in a shared starlight tint. Rising/setting lines are skipped for circumpolar stars; parans are the traditional reading there.',
    bright: 'Headline stars',
    brightHint: 'The four royal stars and the brightest classics (18 stars).',
    all: 'Full set',
    allHint: 'The whole bundled working set (40 stars). Expect a busy map.',
  },
  nightShade: {
    title: 'Night Shade',
    hint: 'Shades the half of Earth in night at the displayed moment: the chart’s own moment, the target date under Transits or CCG, and the eclipse maximum in Eclipses mode (a lunar eclipse is visible from exactly that night side).',
  },
  orbZones: {
    title: 'Orb Zones',
    hint: 'Shaded influence zones: a band of ground distance around each planet angle line, and a band of latitude around each paran. Influence fades with distance; the edge is a convention, not a cliff.',
    lineLabel: 'Lines (km)',
    lineAria: 'Line orb zone width, in kilometres each side',
    paranLabel: 'Parans (°)',
    paranAria: 'Paran orb, in degrees of latitude each side',
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
      hint: "Geodetic mapping: the zodiac mapped onto Earth's longitudes (Greenwich = 0° Aries, always tropical), independent of birth time",
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
    meridian: { label: 'Meridian', hint: 'Equal 30° arcs of the equator from the MC, projected by hour circles; the 1st cusp is an East Point, not the Ascendant. Well-defined at every latitude.' },
    morinus: { label: 'Morinus', hint: 'Equal equator arcs projected by ecliptic-pole circles; uses no Ascendant or MC at all, so it survives even polar latitudes untroubled.' },
    whole: { label: 'Whole Sign', hint: 'Each house is a whole sign from the rising sign' },
    equal: { label: 'Equal', hint: '30° houses measured from the Ascendant' },
  },

  primaryRate: {
    ptolemy: { label: 'Ptolemy (1°/yr)', hint: 'One year per degree.' },
    naibod: { label: 'Naibod (59′08″/yr)', hint: '0.985647° per year, the Sun’s mean motion.' },
    cardan: { label: 'Cardan (59′12″/yr)', hint: '0.986667° per year.' },
    'kepler-ra': { label: 'Solar Daily Motion (RA)', hint: 'Kepler’s key — the natal Sun’s daily motion in right ascension × years.' },
    'solar-long': { label: 'Solar Daily Motion (Longitude)', hint: 'Natal Sun’s daily motion in ecliptic longitude × years.' },
    'placidus-ra': { label: 'True Solar Arc (RA)', hint: 'True secondary-progressed solar arc in RA, applied as a primary-direction rate (nonlinear with time).' },
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
    // Storage key is historical ('mean-quotidian'); the behavior is the natal
    // frame — progressed angles do NOT advance. Relabeled by the June 2026
    // audit: the old "Mean Quotidian" label promised angle motion the overlay
    // deliberately doesn't perform (true quotidian angles are a planned option).
    'mean-quotidian': { label: 'Natal Frame', hint: 'Angles hold the natal RAMC — progressed planets read against the birth chart’s frame. On Solar Arc this applies the arc in longitude (the classic default).' },
  },

  // Synastry ▸ Relationships: derive one chart from the two synastry charts.

  // Eclipses overlay (Overlay tab while the Eclipses mode is active): the
  // details panel labels, the display toggles, the natal-contacts list, and
  // the isoline-interval radios.
  eclipses: {
    // Shared by solar and lunar rows: 'total'/'partial' mean the right thing
    // for either body, and the body itself is marked separately (☉/☾).
    kind: {
      total: 'Total',
      annular: 'Annular',
      hybrid: 'Hybrid',
      partial: 'Partial',
      penumbral: 'Penumbral',
    },
    body: {
      solar: 'Solar',
      lunar: 'Lunar',
    },
    details: {
      maximum: 'Maximum',
      type: 'Type',
      central: 'central',
      nonCentral: 'non-central',
      magnitude: 'Magnitude',
      gamma: 'Gamma',
      saros: 'Saros series',
      lunation: 'Lunation',
      sunPosition: 'Eclipse degree',
      // Hover tip on the eclipse-degree value; {sign} is the spelled-out sign name.
      sunPositionTip:
        'The zodiac degree of the eclipse — the Sun and Moon meet here in {sign}.',
      moonPositionTip:
        'The zodiac degree of the eclipsed Moon in {sign} — it stands opposite the Sun.',
      hemisphere: 'Hemisphere',
      north: 'Northern',
      south: 'Southern',
      duration: 'Max duration',
      width: 'Path width',
      // Lunar rows: how deep the Moon dips into each shadow, in Moon diameters.
      umbralMag: 'Umbral magnitude',
      penumbralMag: 'Penumbral magnitude',
      penumbralDur: 'Penumbral phase',
      partialDur: 'Partial phase',
      totalDur: 'Total phase',
    },
    contacts: {
      heading: 'Natal Contacts',
      // Under the heading when the eclipse degree strikes nothing in the chart.
      none: 'No contacts within 3° — this eclipse passes the chart quietly.',
      aspect: {
        conjunction: 'conjunct',
        square: 'square',
        opposition: 'opposite',
      },
      // The natal angles as contact targets.
      asc: 'Ascendant',
      mc: 'Midheaven',
    },
    natalLines: {
      title: 'Natal Lines',
      hint: 'The birth chart’s linework on the map. Hide it to see the eclipse path on a clean map — the chart wheel and readouts stay.',
    },
    chartLines: {
      title: 'Eclipse Chart',
      hint: 'Planet and angle lines for the chart of the eclipse maximum, framed at that moment’s own sky — see where the eclipse-time lines run relative to the path.',
    },
    isoStep: {
      // Spacing of the dashed equal-magnitude contours around the path.
      '10': { label: '10%', hint: 'Nine contours — a dense reference grid.' },
      '20': { label: '20%', hint: 'Four contours — a balanced middle ground.' },
      '25': { label: '25%', hint: 'Three contours at quarter steps (the classic eclipse-map convention).' },
    },
  },

  // Line-type tooltip text only; the As/Ds/MC/IC button labels stay language-neutral.
  lineType: {
    MC: { hint: 'Midheaven (career, public)' },
    IC: { hint: 'Imum Coeli (home, roots)' },
    ASC: { hint: 'Ascendant (self, identity)' },
    DSC: { hint: 'Descendant (relationships)' },
    VX: { hint: 'Vertex (fated encounters); also adds Vx to the chart wheel' },
    AVX: { hint: 'Anti-Vertex (the axis’ eastern end); also adds Avx to the wheel' },
  },
} as const;
