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
    privacy: 'Privacy',
    details: 'Details',
    projection: 'Projection',
    language: 'Language',
    planets: 'Planets',
    points: 'Points',
    minorBodies: 'Minor bodies',
    angles: 'Angles',
    lines: 'Lines',
    lineSystem: 'Line system',
    lineProjection: 'Line projection',
    lunarNode: 'Lunar node',
    houseSystem: 'House system',
    zodiac: 'Zodiac',
    aspectOrbs: 'Aspect orbs',
    primaryRate: 'Pri. directions rate',
    display: 'Display',
    // The two halves the old shared "Chart Angle" control split into. Naming them apart
    // is what splits the question: `Arc` sets how far the bodies advance (Solar Arc),
    // `Angles` sets whose angles the map is drawn against (progressions).
    arc: 'Arc',
    progAngles: 'Angles',
    magnitudeSteps: 'Magnitude steps',
    fortuneFormula: 'Part of Fortune',
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
  // The Natal-linework show/hide toggle in the timeline bar's display drawer. (The
  // overlay's zenith stamps now ride the shared Zeniths/Nadirs toggle, so there's no
  // separate overlay-zenith key here anymore.)
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
    // Shown on the grayed toggle while Cyclocartography is active (its "sky" mixes
    // progressed and transiting bodies, so no single simultaneous moment exists).
    blockedCyclo:
      'No single sky-moment — parans aren’t defined across two epochs (Cyclocartography reads progressed and transiting bodies together).',
  },
  // Local Space + its origin selector live in the Local Space view (i18n localSpaceHud).
  aspectLines: {
    title: 'Aspect Lines',
    hint: 'Lines where a planet is sextile (⚹), square (□) or trine (△) to the MC or Ascendant — each aspect twice, once per side. A trine to the Asc doubles as a sextile to the Dsc; hover a line to see both readings. Conjunctions and oppositions are the planet’s own angle lines, already on the map.',
    // The gated-tier "open the Aspects window" sub-row (shows while the toggle is on).
    openHud: 'Customize',
    openHudHint:
      'Open the Aspects window: filter the map’s lines by quality and axis, and set every aspect orb at once.',
  },
  midpointLines: {
    title: 'Midpoint Lines',
    hint: 'Lines where the midpoint of two visible bodies sits exactly on an angle (e.g. Su/Mo MC). In Mundo uses the bodily midpoint (mean RA and declination); In Zodiaco the classic longitude midpoint. Narrow the planet filter to keep the set readable.',
    // Shown on the grayed toggle while Cyclocartography is active (a midpoint would
    // average a progressed and a transiting body into one point — incoherent).
    blockedCyclo:
      'A midpoint here would average a progressed and a transiting body into one point — incoherent across two epochs.',
  },
  zenithNadir: {
    title: 'Zeniths/Nadirs',
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
    hint: 'Shades the half of Earth in night at the displayed moment.',
  },
  // Discreet mode. The hint has to say what is NOT hidden as clearly as what
  // is: someone who thinks the map is covered will use this wrongly.
  discreet: {
    title: 'Discreet mode',
    hint: 'Blanks names, birth dates and birthplaces everywhere on screen — including a capture caption and the image it exports — so you can work with someone beside you. The map and its lines are unchanged, and a document you sit down to produce still carries the real details.',
  },
  orbZones: {
    title: 'Orb Zones',
    hint: 'Shaded influence zones: a band of ground distance around each planet angle line and each paran. Influence fades with distance; the edge is a convention, not a cliff.',
    unitAria: 'Orb zone distance unit (km or mi)',
    lineAria: 'Line orb zone width, each side',
    paranLabel: 'Parans',
    paranAria: 'Paran orb width, each side',
  },

  theme: {
    glass: { label: 'Glass' },
    dark: { label: 'Dark' },
    vintage: { label: 'Earth' },
  },

  projection: {
    // The (i) on the Projection heading. A reader who has met "Mercator distorts
    // the world" anywhere else can read this control as a choice about accuracy;
    // it isn't one. Lines are traced into latitude/longitude before anything is
    // drawn (lib/astro/lines.ts) and both modes hand the SAME coordinates to the
    // renderer, so the honest thing to name here is the one real hazard: judging
    // nearness by eye, which both views get wrong, in opposite directions.
    hint: 'Which way the world is drawn — not where anything is. Both views plot the same coordinates, and every distance the app reports (a line card’s closest-distance row, the click-drag measure, the orb zones) is a true ground distance measured on the sphere. Neither view is safe to judge nearness by eye, though: Flat stretches the scale toward the poles and the globe compresses it toward its edge, so read the distance rather than the gap.',
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
      // The magnitude the notice card deliberately leaves out (see i18n/en/autoFlip
      // 'line-projection') lands here, where it stays available. The Sun is the check
      // a doubtful reader can run in seconds — it has no ecliptic latitude, so the two
      // readings place it identically, which is also why they can't BOTH be arbitrary.
      hint: 'Lines use each body’s own place in the sky (RA / dec). Identical to In Zodiaco for the Sun, which sits on the ecliptic; furthest apart on Pluto and the Moon.',
    },
    zodiaco: {
      label: 'In Zodiaco',
      hint: 'Bodies are projected onto the ecliptic before drawing lines (a common ACG default).',
    },
  },

  // The Part of Fortune's formula (Advanced ▸ Part of Fortune). Its own heading (i)
  // carries the ONE explanation of the Lot for the whole app — what it is, how
  // relocation treats it, and which frames can place it — so the Points filter row
  // needs no (i) of its own (it marks itself inert instead; see inert.fortuneMundo).
  fortuneFormula: {
    hint: 'The Part of Fortune is a calculated Lot of vitality and worldly ease — a point on the ecliptic, not a body in the sky, so only a zodiacal frame can place it: its map lines need Line projection set to In Zodiaco (or the Mundane line system). Relocating the map pin recomputes it on the chart wheel for that place, while the map lines keep your natal Fortune.',
    sect: {
      label: 'Sect-based (day/night)',
      hint: 'Day births use Ascendant + Moon − Sun; night births flip to Ascendant + Sun − Moon. The traditional convention.',
    },
    ptolemaic: {
      label: 'Ptolemaic (fixed)',
      hint: 'Ascendant + Moon − Sun for every chart, day or night. The alternative historical convention.',
    },
  },
  // "The current settings have switched this off" — the shared vocabulary for an
  // unavailable control (the .ui-inert dashed look + the grey .ui-hover badge in
  // its tip). The control can't be clicked and any stored preference is left
  // alone; these strings say why, and NAME THE SETTING to change — a dead control
  // that doesn't tell you what to do about it is just a dead control. Add a
  // reason here when a new filter needs one.
  inert: {
    fortuneMundo:
      'A Lot is a point on the ecliptic with no position in the sky, so In Mundo has nowhere to place it. To see this line, set the projection to In Zodiaco (Calculation).',
    fortuneAdvanced:
      'The Part of Fortune is an Advanced reading — turn Advanced on to use it.',
    geodeticSidereal:
      'Mundane maps the TROPICAL zodiac onto Earth’s longitudes — there is no sidereal version of it. Set the zodiac back to Tropical (Advanced) to use it; your choice is only being held, not cleared.',
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
    // The one nonlinear key. The old hint named three techniques in a single clause and
    // left the reader to work out which was the subject; this says what the key IS and
    // what follows from it. "True" stays in the LABEL — it is doing real work there,
    // marking this as the measured arc against the mean-rate keys above it.
    'placidus-ra': { label: 'True Solar Arc (RA)', hint: 'Uses the actual distance the progressed Sun has covered by this age as the time key, rather than a fixed yearly rate. Because the Sun’s speed varies through the year, the arc accumulates unevenly — so this key runs slightly ahead or behind the fixed-rate options depending on the season of birth.' },
    user: { label: 'User rate', hint: 'Enter your own degrees-per-year below.' },
    // The CONTROL's own copy, on an info tip beside the label. Seven unfamiliar school
    // names need the frame before the choices — what a time-key is and why they differ —
    // and none of the seven entries is the right place to carry it.
    control: {
      tip: 'The primary-directions time key',
      hint: 'Primary directions model the daily rotation: the chart’s angles are carried forward while the bodies hold their natal places in the sky. The rate is the time-key — how much arc accrues per year of life. Schools differ, and the spread is real: over a lifetime Ptolemy and Naibod part by more than a year.',
    },
  },

  // The overlay frame: WHOSE ANGLES the lines are drawn against. Both segments are named
  // for that one question, which is also what the progressions control now asks — so the
  // pattern is learnable across the two bars rather than being two vocabularies.
  //
  // ("My angles" / "Sky now" until August 2026. Both were wrong in the same way: they
  // named the reader's relationship to the frame instead of the frame. "Sky now" was
  // additionally false at every date but the present, which is precisely when it is read
  // — a return, an election, an event.)
  //
  // `label` is the SPELLED-OUT name — the accessible name of the segment, the status strip,
  // and any prose. `short` is the segment FACE: both options end in the same noun, so the
  // control draws that noun once, as the angles mark (ui/AnglesIcon), and each button spends
  // its width on the word that actually distinguishes it. `tip` is the tooltip headline,
  // `hint` the reasoning underneath. The `return*` variants replace them while a return is on
  // screen: the frames are the same two, but under a return each answers a different
  // question, and the exact-degree behaviour of the returning body is the whole reason the
  // frame is held. Third person throughout, and no recommendation — the app explains the
  // options and lets the astrologer choose the technique.
  positioning: {
    'relative-to-natal': {
      label: 'Natal angles',
      short: 'Natal',
      tip: 'The birth chart’s own angles',
      hint: 'Holds the natal frame still, so only the planets’ own secondary motion moves the lines. The diurnal rotation is removed. Answers: where on Earth would this transit be landing on the MC, IC, Ascendant or Descendant? The lines drift over weeks and months, at each planet’s own rate.',
      // Under a solar return: the Sun carries no ecliptic latitude, so In Mundo and In
      // Zodiaco agree about it exactly — which is why this one can promise "the same
      // place every year" where the lunar wording below cannot.
      returnHintSolar: 'Draws the return’s planets against the natal angles. The return Sun is back on its natal degree, and the Sun has no ecliptic latitude, so its lines fall exactly on the natal Sun lines in either projection — the same place every year.',
      returnHintLunar: 'Draws the return’s planets against the natal angles. The return Moon is back on its natal longitude, so In Zodiaco its lines fall on the natal Moon lines; In Mundo they land close but not exactly, because the Moon’s latitude has changed since birth.',
    },
    'transit-moment': {
      label: 'Transit angles',
      short: 'Transit',
      // The second segment is named for the technique in play, so it parallels
      // "Progressed angles" on the other bar and the reader learns one pattern.
      returnLabel: 'Return angles',
      returnShort: 'Return',
      tip: 'The angles of the moment itself',
      returnTip: 'The return chart’s own angles',
      hint: 'Reads the sky against the moment’s own frame, so the lines carry primary motion — the whole set sweeps 15° an hour and comes right around once a day. Each body’s line marks where it is genuinely angular at that instant. No natal chart is involved. Read at an instant, not across a season.',
      returnHint: 'A return chart is a moment of its own, with its own angles. The map is drawn against the return’s angles rather than the natal ones.',
    },
  },

  // The four arc CALCULATIONS. One set of labels, two sets of hints: the same arithmetic
  // acts on different things depending on which overlay is asking, and a tooltip that
  // describes the arc without saying what it moves is the shape the old shared menu was
  // stuck in ("solar arc in ecliptic longitude" — applied to what?).
  //
  // `angles` is the progressions reading, `bodies` the Solar Arc one. Each stands alone,
  // with no back-references between neighbouring entries: they are read one at a time,
  // hovered in whatever order the reader's pointer takes.
  //
  // Names spelled out. "SA" is already the map badge for a solar-arc line, so a menu that
  // also used it as an abbreviation was asking one string to mean two things. And no
  // "(default)" tag on any entry — the radio dot marks the live one, while a static tag
  // would still be sitting next to an option the reader had deliberately moved away from.
  arcMethod: {
    'sa-long': {
      label: 'Solar arc — in longitude',
      angles: 'Advances the angles by the distance this chart’s progressed Sun has actually travelled, measured along the ecliptic.',
      bodies: 'Advances every body by the distance this chart’s progressed Sun has actually travelled, measured along the ecliptic. The classic method.',
    },
    'sa-ra': {
      label: 'Solar arc — in right ascension',
      angles: 'Advances the angles by the distance this chart’s progressed Sun has actually travelled, measured along the equator.',
      bodies: 'Advances every body by the distance this chart’s progressed Sun has actually travelled, measured along the equator.',
    },
    'naibod-long': {
      label: 'Naibod, mean rate — in longitude',
      angles: 'Advances the angles at the Sun’s average yearly motion, measured along the ecliptic.',
      bodies: 'Advances every body at the Sun’s average yearly motion, measured along the ecliptic.',
    },
    'naibod-ra': {
      label: 'Naibod, mean rate — in right ascension',
      angles: 'Advances the angles at the Sun’s average yearly motion, measured along the equator.',
      bodies: 'Advances every body at the Sun’s average yearly motion, measured along the equator.',
    },
    // Menu headers — the question the four entries answer, which differs by overlay and
    // is the whole reason these are two controls now.
    headerAngles: 'How far the angles advance',
    headerBodies: 'How far the bodies advance',
  },

  // The progressed overlays' frame pair, named to parallel the transits bar's: same
  // question ("whose angles?"), same shape of answer — and the same `label`/`short` split,
  // with the shared noun drawn once as the angles mark.
  progAngles: {
    natal: {
      label: 'Natal angles',
      short: 'Natal',
      tip: 'The birth chart’s own angles',
      hint: 'The progressed planets are read against the natal angles. The birth chart’s frame is held still, so only the planets move.',
    },
    progressed: {
      label: 'Progressed angles',
      short: 'Progressed',
      tip: 'The progressed chart’s own angles',
      hint: 'The progressed chart has a real moment of its own — one day after birth for each year of life — so it has its own angles. The map is drawn against those instead of the natal ones.',
    },
    // On the calculation menu while the angles are held natal: it is showing a method
    // that isn't running, which needs saying before a reader takes it for the live one.
    idle: {
      tip: 'Not in force',
      hint: 'The angles are held on the birth chart’s, so no arc is being applied to them. Choosing a calculation here also switches the map to Progressed angles.',
    },
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
      // NOTE: describes only the wheel ring — the eclipse-time MAP lines are a separate,
      // off-by-default opt-in layer (see showEclipseMapLines in App.tsx) and aren't
      // hinted at here.
      hint: 'The chart of the eclipse maximum — the sky framed at that instant — added to the chart wheel as a second ring beside the natal chart.',
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
