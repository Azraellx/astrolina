// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Expanded chart sidebar: the wheel state titles, the Advanced planet/angle table
// (column headers + their hover tips), station/retrograde/out-of-bounds tips, the
// aspect names/descriptions and toggles, and the section headings. Planet names come
// from labels.planet, sign names from labels.sign, month names from fmt.monthName.
export const expandedSidebar = {
  // The chart's statement (lib/chartHeader, Lina's chart-header spec 2026-10-06): the
  // state label under the chart's name — repeated in the wheel's top-left corner — and
  // the lead words of the lines beneath it. The label names what the wheel really IS,
  // and is never a bare type when the chart is modified: a pin or the hover adds
  // RELOCATED, an overlay takes the label with its date. State names are upper case;
  // a date beside one is not ("TRANSITS · 1 August 2026"). (2026-10-07)
  header: {
    natal: 'NATAL CHART',
    // The labels of an overlaid bi-wheel's two header blocks (Lina, 21 Oct 2026, §5), each
    // followed by " · " and its chart's label ("Inner wheel · NATAL CHART").
    innerWheel: 'Inner wheel',
    outerWheel: 'Outer wheel',
    // A geodetic chart's label names its kind after GEODETIC CHART: "GEODETIC CHART · NATAL"
    // (§5); EVENT for an event chart. Shown in capitals as written.
    natalKind: 'NATAL',
    eventKind: 'EVENT',
    // An event chart's label on a celestial map (2026-10-20): the chart of a moment in
    // the world — an ingress, a founding — rather than of a birth. Upper case like the
    // other state names. On a geodetic map the label is GEODETIC CHART for both kinds.
    event: 'EVENT CHART',
    // A state the WHEEL is in, added after whatever label names it — a chart (NATAL CHART ·
    // RELOCATED, DAVISON · RELOCATED) or an overlay with its date (TRANSITS · 1 August 2026 ·
    // RELOCATED; lib/chartHeader). So it follows nouns of different genders and numbers: in a
    // language whose adjectives agree, use a form that reads right after all of them — one that
    // needs no agreement, or one agreeing with the implied "chart" — never one matched to a
    // single label. (Translator note, 2026-10-09.)
    relocated: 'RELOCATED',
    geodetic: 'GEODETIC CHART',
    composite: 'COMPOSITE (MIDPOINTS)',
    davison: 'DAVISON',
    solarReturn: 'SOLAR RETURN {year}',
    lunarReturn: 'LUNAR RETURN',
    // The time overlays, as a chart: the wheel's overlay ring, or the chart a promoted
    // overlay stands in for. CCG never makes a wheel, so it never shows; kept for the
    // type's sake.
    kind: {
      transits: 'TRANSITS',
      progressed: 'SECONDARY PROGRESSED',
      'tertiary-progressed': 'TERTIARY PROGRESSED',
      'solar-arc': 'SOLAR ARC',
      'primary-directions': 'PRIMARY DIRECTIONS',
      eclipses: 'ECLIPSE',
      cyclo: 'CCG',
    },
    // A relocated chart's birth moment stays the birthplace's own clock; "Born:" says
    // whose moment it is once a second place sits under it — or a ring's moment above it.
    born: 'Born:',
    // The same lead on an event chart's moment (2026-10-20): the moment is the event's,
    // not a birth.
    eventLead: 'Event:',
    // With No chart selected (2026-10-20) and no place pinned or hovered, the sky's
    // wheel has planets but no angles: this line, under the overlay's moment, says how
    // to get them.
    skyNoPlace: 'Pin or hover a place to cast the angles there.',
    // A ring's moment, named where the header's label names something else: a composite
    // outranks a ring it carries, and a bare date there would read as the composite's own.
    ringLead: {
      transits: 'Transits:',
      progressed: 'Progressed:',
      'tertiary-progressed': 'Tertiary progressed:',
      'solar-arc': 'Solar arc:',
      'primary-directions': 'Directions:',
      eclipses: 'Eclipse:',
      cyclo: 'CCG:',
      solarReturn: 'Solar return:',
      lunarReturn: 'Lunar return:',
    },
    // The point a relocated chart is cast for — coordinates only, no zone: the clock
    // there is not an input to anything. The one term on both line systems, and for a synastry
    // partner's wheel too (Lina, 23 Oct 2026, H-3: "Cast for" appears nowhere).
    relocatedTo: 'Relocated to:',
    midpoint: 'Geographic midpoint:',
    // A Davison's parents, named only while the chart is still their midpoint.
    derivedFrom: 'Derived from:',
    // The source rating, then the chart form's own short label for it.
    rodden: 'Rodden: {code}',
    // The first item of the settings line (chart-data settings: geocentric, zodiac,
    // house system, node). The map's status line keeps the line-geometry ones.
    geocentric: 'Geocentric',
  },
  empty: 'No chart selected',
  // Under "No chart selected" in the empty wheel, while No chart (the sky alone) is chosen and
  // no overlay is drawing the sky (2026-10-20): how to get a wheel there. "Overlay menu" is the
  // top bar's Overlay menu. One sentence, centred under the line above.
  // Since 21 Oct 2026 the whole empty state, reason and fix, in Lina's words (§4).
  // @i18n-verbatim
  skyEmpty: 'No chart loaded. Turn on Transits or Eclipses to see the sky, or choose a chart.',
  // A chart with no birth time: the tag after an aspect's name in the aspect list, and after a
  // contact's, when either end is a body given as a range (Lina, 21 Oct 2026, §2.5; every such
  // body since 22 Oct). Her wording; a short tag in a narrow row.
  // @i18n-verbatim
  aspectHourBound: 'depends on the birth hour',
  // The card in the sidebar where the overlay's wheel would be, while Cyclocartography is drawn
  // (Lina, 22 Oct 2026, §2.6: her suggestion, the wording ours): a short heading over the reason
  // there is no wheel and what gives one. The groups are named, not characterised (Sun–Mars,
  // Jupiter–Pluto: the bodies the technique takes from each). "Secondary progressed" and
  // "Transits" are the Overlay menu's two entries.
  cyclo: {
    title: 'CYCLOCARTOGRAPHY · map lines only',
    body: 'It blends progressed Sun–Mars with transiting Jupiter–Pluto, so there is no single chart to draw. For positions, turn on Secondary progressed or Transits.',
  },

  dual: {
    // The Dual toggle in the header: pill label, hover tip title, and explanation.
    // (Advanced reading mode moved to the profile strip's plan tag.)
    label: 'Dual',
    tip: 'Dual wheels',
    hint: 'Split the bi-wheel into two full stacked wheels — the natal chart, then the overlay as its own chart with its own aspect lines. Applies whenever an overlay is on.',
  },

  close: {
    aria: 'Hide expanded view',
    tip: 'Hide sidebar',
    label: 'Hide',
  },

  // Shown under the wheel-state title (with an (i) whose .ui-tip carries the reason) when
  // the chosen quadrant house system is undefined at this latitude (above the polar circles)
  // and Porphyry cusps are drawn instead — so the wheel never silently shows a different system.
  houseFallback: 'Porphyry cusps',
  // The same notice in a narrow panel, where the full one meets the wheel's rim; the tip
  // keeps the full name (2026-10-09).
  houseFallbackShort: 'Porphyry',
  houseFallbackHint:
    'Above the polar circles, quadrant house systems like Placidus become undefined, so the wheel falls back to Porphyry — which trisects the arcs between the angles and stays well-defined at any latitude.',

  // Shown under the wheel-state title on a planets-only wheel. Kept terse — the
  // chart form's note carries the full explanation of the degrade.
  timeUnknownNote: 'Birth time unknown',
  // In place of the birth time in the header's moment line (lib/chartHeader), for a
  // chart with none: the planets are read at 12:00 on the birth date, and "12:00"
  // alone would read as a time somebody recorded. Lower case: it follows the date in
  // the middle of a line. On the geodetic header from 2026-10-02; on every header,
  // and with no zone after it, since 2026-10-07.
  timeUnknownNoon: 'birth time unknown, noon used',
  // The same two for an event chart with no time (2026-10-20): "time", not "birth time".
  timeUnknownNoteEvent: 'Time unknown',
  timeUnknownNoonEvent: 'time unknown, noon used',

  // The panel header's data block on a geodetic map, which says what the wheel is: the
  // chart's own planets inside a PLACE's geodetic angles and houses. After the
  // statement's place lines (header.*, where the label reads GEODETIC CHART since
  // 2026-10-07): the place's AS and MC, and these planets lines, which say where the
  // planets and the houses come from. {system} is the house system's own name, Porphyry
  // wherever the chosen one is undefined at the place's latitude (houseFallback says
  // why). (2026-10-02)
  // The panel header's geodetic data block. Its angle line is the map readout's own
  // (map.geoReadout.angles, since 2026-10-20), so the two surfaces print one format.
  geodetic: {
    // The houses line's one pattern (Lina, 21 Oct 2026, §5): "{Natal | Progressed | Transit |
    // Eclipse | Event} positions · houses: {system}, from the geodetic angles". Her wording.
    // @i18n-verbatim
    planets: 'Natal positions · houses: {system}, from the geodetic angles',
    planetsComposite:
      'Planets at the composite’s positions · houses: {system}, from the geodetic angles',
    // A time overlay promoted to stand in for the chart (Natal off): its bodies are
    // another instant's. {overlay} is its name as the wheel title shows it.
    planetsPromoted: 'Planets from {overlay} · houses: {system}, from the geodetic angles',
    // The same line for an EVENT chart (an ingress, a lunation, a founding — not a birth),
    // 2026-10-20: its planets are the event moment's. A draft for Lina to confirm. {system} as
    // above. One line in the panel header, under the place's angles.
    // @i18n-verbatim
    planetsEvent: 'Event positions · houses: {system}, from the geodetic angles',
  },

  // The houses line on every overlay wheel, both line systems (Lina, 22 Oct 2026, §3.2, her words):
  // "{positions} · houses: {system}, from the {angles}" — which positions the wheel holds, its
  // house system, and which angles its houses are taken from. Under "Outer wheel" in the overlaid
  // view, and in the second header of the stacked one; a line in the panel header, wrapped when
  // long, never cut short. {positions} is one of `positions` below, {angles} one of `angles`, each
  // possibly carrying a calculation (`withCalc`); {system} is the house system's name.
  // @i18n-verbatim
  houses: {
    line: '{positions} · houses: {system}, from the {angles}',
    // The same line with no angle clause (Lina, 23 Oct 2026, H-2): a wheel whose houses come from its
    // own moment at the place — transits, a return, an eclipse, an event chart — names no angles:
    // "Transit positions · houses: Whole Sign".
    lineOwn: '{positions} · houses: {system}',
    // A word with its calculation in brackets after it: "Directed positions (Solar arc, Long.)",
    // "progressed angles (Naibod, R.A.)". {word} and {calc} as built by the code.
    withCalc: '{word} ({calc})',
    // One generic word per family (her names, 23 Oct 2026 §6: Natal, Transit, Return, Eclipse, Event,
    // Progressed, Directed). Use each language's one agreed term for each, the same word wherever it
    // recurs.
    positions: {
      natal: 'Natal positions',
      transit: 'Transit positions',
      progressed: 'Progressed positions',
      directed: 'Directed positions',
      return: 'Return positions',
      eclipse: 'Eclipse positions',
      event: 'Event positions',
    },
    // Lower case: they follow "from the" in the line. Her four angle words (23 Oct 2026, §6).
    angles: {
      natal: 'natal angles',
      progressed: 'progressed angles',
      directed: 'directed angles',
      geodetic: 'geodetic angles',
    },
    // The calculations' short forms, each tied to its name on the methods page (her §3.2): the four
    // arc methods (Solar Arc, a progression's angles), then the primary directions' rate keys by
    // their existing names. {rate} is a user rate's degrees per year.
    calc: {
      'sa-long': 'Solar arc, Long.',
      'sa-ra': 'Solar arc, R.A.',
      'naibod-long': 'Naibod, Long.',
      'naibod-ra': 'Naibod, R.A.',
      ptolemy: 'Ptolemy, 1°/yr',
      naibod: 'Naibod, 59′08″/yr',
      cardan: 'Cardan, 59′12″/yr',
      'kepler-ra': 'Solar Daily Motion, RA',
      'solar-long': 'Solar Daily Motion, Longitude',
      'placidus-ra': 'True Solar Arc, RA',
      user: 'User rate, {rate}°/yr',
    },
  },

  // Pre-1970 timezone DST caution glyph beside a moment line.
  tzUncertain: 'Timezone uncertain',
  tzUncertainHint: 'Pre-1970 timezone outside US/EU: verify DST against an atlas',

  // Under Synastry the partner's block is titled "NATAL CHART · {name}" and carries their own
  // record (Lina, 23 Oct 2026, H-3), then "Relocated to:" where their wheel is cast elsewhere: the
  // partner's angles and houses are cast at the active point — the pin, else the hovered point,
  // else the active chart's birthplace — so that is usually not their own place.
  partnerHead: {
    // The partner's "Relocated to:" line's tip (hover, focus, or a tap). Names no place, so it
    // is safe under Discreet mode. The fallback to the active chart's birthplace is deliberate —
    // both wheels read for one place (calculation-methods.md) — so the tip says how
    // to move it rather than apologising for it.
    castForTip: 'Where both wheels are cast',
    castForHint:
      'Their angles and houses are read for one place — your pin, the point you hover, or else your birthplace — not the partner’s own. Pin a place on the map to cast both there.',
    // Under a composite partner, whose angles are midpoints of its two charts' own angles
    // and so belong to no place. Celestial maps only: on a geodetic map a composite's wheel
    // is the place's frame like any other, and takes "Relocated to:". (2026-10-02)
    midpointAngles: 'Midpoint angles, not relocated',
  },

  // The chart angles, listed in the planet/angle readout and Advanced table.
  // Vertex/Anti-Vertex appear only with Advanced ▸ Vertex axis switched on.
  angle: {
    midheaven: 'Midheaven',
    imumCoeli: 'Imum Coeli',
    ascendant: 'Ascendant',
    descendant: 'Descendant',
    vertex: 'Vertex',
    antivertex: 'Anti-Vertex',
  },

  // Advanced table column headers and their explanatory hover tips. Every header
  // also sorts: press once for ascending, again for descending, a third time to
  // hand the table back to its usual order.
  table: {
    point: 'Point',
    pointHint: 'The bodies in their conventional order — luminaries first — with the chart angles after them. Press any header to sort the table by that column; press it a third time to come back here.',
    longitude: 'Longitude',
    longitudeHint: 'Zodiacal longitude: the body’s degree, sign, and arcminute along the ecliptic.',
    speed: 'Speed',
    speedHint: 'Daily motion in ecliptic longitude; a negative value means retrograde.',
    latitude: 'Latitude',
    latitudeHint: 'Ecliptic latitude: angular distance north or south of the ecliptic (positive is north).',
    raLabel: 'Rt.Asc.',
    raTitle: 'Right Ascension',
    raHint: 'Position along the celestial equator from 0° to 360°, the sky’s east/west coordinate.',
    decLabel: 'Decl.',
    decTitle: 'Declination',
    decHint: 'Angular distance north or south of the celestial equator; past 23°26′ the body is ‘out of bounds’.',
    aziLabel: 'Azi(0°N)',
    aziTitle: 'Azimuth',
    aziHint: 'The body’s compass bearing at the relocated place, measured clockwise from due north (0°).',
    altLabel: 'Alti.',
    altTitle: 'Altitude',
    altHint: 'The body’s angular height above the horizon at the relocated place (negative means below it).',
  },

  // Per-body motion-state tips shown beside a planet in the Advanced table.
  stationary: 'Stationary',
  stationaryHint: 'Briefly motionless against the stars as it turns between direct and retrograde, so its themes feel concentrated and pivotal.',
  retrograde: 'Retrograde',
  retrogradeHint: 'Appears to move backward through the zodiac from Earth’s vantage; its themes turn inward, revisited or replayed.',
  outOfBounds: 'Out of bounds {dir}',
  north: 'north',
  south: 'south',
  outOfBoundsHint: 'Declination beyond the Sun’s maximum (23°26′), past the zodiac’s normal latitude band, an astrologically notable extreme.',
  // A catalog minor planet's mark in the Advanced table (its name is the tip's title).
  // Says what the table can't: why the body has a row here and none in the aspect
  // lists or the balance below.
  minorHint: 'A minor planet from your list, at the chart’s own moment. Placed in the chart, but not aspected and not counted in the balance.',
  // The same, for a hypothetical point (its hollow ◇ and "(hyp)" name): what it is,
  // since it is not a minor planet, then the same placed-not-aspected reason.
  minorHintHyp: 'A hypothetical point from your list, computed from orbital elements at the chart’s own moment. Placed in the chart, but not aspected and not counted in the balance.',

  // Aspect names + descriptions for the Advanced aspect-symbol hover tips.
  aspect: {
    conjunction: { name: 'Conjunction', desc: 'Two bodies fused at the same point, blending their energies.' },
    opposition: { name: 'Opposition', desc: 'Bodies face off across the chart: a tension of opposites seeking balance.' },
    trine: { name: 'Trine', desc: 'An easy, harmonious flow of energy and natural talent.' },
    square: { name: 'Square', desc: 'Friction and challenge that pushes you to grow.' },
    sextile: { name: 'Sextile', desc: 'A supportive opportunity that rewards a little effort.' },
    parallel: { name: 'Parallel', desc: 'Equal declination on the same side of the celestial equator: reads like a conjunction.' },
    contraparallel: { name: 'Contraparallel', desc: 'Mirror declinations across the celestial equator: reads like an opposition.' },
    // The parenthetical for the declination pair (the others show a degree figure).
    byDeclination: 'by declination',
  },

  // Aspect-category pill toggles below the wheel: compact label, full tip label, desc.
  toggle: {
    harmonious: {
      label: 'Trine / Sextile',
      tipLabel: 'Trine / Sextile',
      desc: 'Flowing, supportive aspects: ease, talent, and opportunity.',
    },
    hard: {
      label: 'Square / Opp',
      tipLabel: 'Square / Opposition',
      desc: 'Tense aspects: friction, challenge, and the drive to grow.',
    },
    conjunction: {
      label: 'Conj',
      tipLabel: 'Conjunction',
      desc: 'Two bodies fused at the same point, blending their energies.',
    },
  },

  // Balance section: element/modality glyph constellations (always shown) +
  // essential dignities (Advanced) over the Sun, the Moon and the eight planets — ten bodies,
  // so each tally adds up to ten (Lina, 22 Oct 2026). The dignities read whichever rulership
  // table Settings ▸ Calculation is set to. Every other body shown in the chart (the nodes,
  // Lilith, Chiron, the asteroids, catalog bodies) is placed there but not counted: with them
  // in, the counts would measure how many bodies are switched on rather than the chart (the
  // reason is on calculation-methods.md).
  balanceHeading: 'Balance',
  balanceTip: 'Chart balance',
  // The Sun, the Moon and the eight planets only, since 22 Oct 2026 (Lina): each tally adds up to ten.
  balanceHint: 'How the Sun, the Moon and the eight planets spread across the elements (fire, earth, air, water) and modalities (cardinal, fixed, mutable) — where the chart’s emphasis lies.',
  element: { fire: 'Fire', earth: 'Earth', air: 'Air', water: 'Water' },
  modality: { cardinal: 'Cardinal', fixed: 'Fixed', mutable: 'Mutable' },
  // Blurbs shown beneath the name in each balance category's hover tip: the
  // constituent signs plus what the element/modality colours in a chart.
  elementDesc: {
    fire: 'The fire signs — Aries, Leo, Sagittarius. Drive, warmth, and spontaneity; spirit and the urge to act.',
    earth: 'The earth signs — Taurus, Virgo, Capricorn. Grounding, patience, and craft; the world of the senses and the made.',
    air: 'The air signs — Gemini, Libra, Aquarius. Thought, language, and connection; ideas and the space between people.',
    water: 'The water signs — Cancer, Scorpio, Pisces. Feeling, intuition, and memory; the tides of the inner life.',
  },
  modalityDesc: {
    cardinal: 'The cardinal signs — Aries, Cancer, Libra, Capricorn. Initiators that open each season and set things in motion.',
    fixed: 'The fixed signs — Taurus, Leo, Scorpio, Aquarius. Stabilisers at each season’s heart; they hold, sustain, and persist.',
    mutable: 'The mutable signs — Gemini, Virgo, Sagittarius, Pisces. Adapters that close each season; they flex, blend, and prepare the turn.',
  },
  dignity: {
    rulership: 'rulership',
    exaltation: 'exaltation',
    detriment: 'detriment',
    fall: 'fall',
  },
  // Under the Both rulership scheme the two schools disagree about three signs, so a
  // rulership or detriment only ONE of them grants is named as that school’s — without
  // it Mars and Pluto both read a bare "rulership" in Scorpio with nothing to tell them
  // apart, which is the complaint this scheme choice answers. Nothing is appended under
  // a single-school scheme, or where the two schools agree: there the label would imply
  // a choice that was not made.
  dignityFrom: { traditional: 'traditional', modern: 'modern' },
  // Hover blurbs for the school suffix, in the same voice as the dignity ones.
  dignityFromDesc: {
    traditional: 'Granted by the traditional rulerships only — the seven-planet scheme, where Mars keeps Scorpio, Saturn Aquarius and Jupiter Pisces.',
    modern: 'Granted by the modern rulerships only — where Pluto takes Scorpio, Uranus Aquarius and Neptune Pisces from their traditional rulers.',
  },
  // Hover blurbs explaining each essential dignity (the Advanced dignity list).
  dignityDesc: {
    rulership: 'The planet is in a sign it rules — at home and able to act freely, in full strength.',
    exaltation: 'The planet is an honoured guest in its sign of exaltation — its best qualities lifted and amplified.',
    detriment: 'The planet sits opposite a sign it rules — out of place, working against the grain.',
    fall: 'The planet sits opposite its sign of exaltation — weakened, its expression strained.',
  },

  // The sort strip above the aspect lists. They can't carry column headers (each
  // list is two columns OF ROWS), so the columns are named as chips instead.
  sortBy: 'Sort',
  sort: {
    pair: 'Pair',
    pairHint: 'Group the list by body, in the conventional order — every aspect the Moon makes, then the Sun’s, and so on. Within a body, tightest orb first.',
    crossPairHint: 'Group the list by the overlay body — the one making the contact, and the one each row leads with. Within a body, tightest orb first.',
    type: 'Aspect',
    typeHint: 'Group by the aspect itself, in the usual order: conjunctions, oppositions, trines, squares, sextiles, then the declination pairs. Within a kind, tightest orb first.',
    orb: 'Orb',
    orbHint: 'Order by distance from exact — the list’s own order, tightest first. Press again to read it loosest first.',
  },

  // Aspect section heading (counted) + its hover-tip title and explanation.
  aspectsCount: '{count, plural, one {Aspects (#)} other {Aspects (#)}}',
  aspectsTip: 'Aspects',
  aspectsHint: 'Angular relationships between two bodies by ecliptic longitude (conjunction, sextile, square, trine, opposition) that shape how their energies interact.',

  // The fold under the positions readout that opens the OVERLAY's own table —
  // the same columns for the overlay's bodies at the overlay's moment. Named for
  // the overlay ("Transits positions") rather than labelled generically, since
  // which second chart is being read is the whole question.
  overlayPositions: '{overlay} positions',

  // The fold under the BALANCE groups that opens the same reading for the
  // overlay's bodies, and the one under the aspect list that opens the overlay's
  // OWN aspects. Both named for the overlay, like overlayPositions above, since
  // which second chart is being read is the whole question.
  //
  // "{overlay} aspects" is deliberately distinct from overlayAspectsCount below:
  // that section lists the contacts BETWEEN the two charts, this one the second
  // chart's aspects to itself. Two lists that both mention the overlay is exactly
  // the ambiguity, so the hints say which is which and the two sit adjacent.
  //
  // Plain '{count}' rather than the plural form its neighbours use: both of their
  // branches are identical anyway, and a plural template cannot also interpolate
  // {overlay}.
  overlayBalance: '{overlay} balance',
  overlayOwnAspects: '{overlay} aspects ({count})',
  overlayOwnAspectsTip: 'The second chart’s own aspects',
  overlayOwnAspectsHint:
    'Aspects among the overlay chart’s OWN bodies — the web the second wheel draws for itself. The contacts between the two charts are the section below.',

  // Overlay-aspect section: the "(overlay)" planet suffix, counted heading, tip, hint.
  overlaySuffix: '(overlay)',
  overlayAspectsCount: '{count, plural, one {Overlay aspects (#)} other {Overlay aspects (#)}}',
  overlayAspectsTip: 'Overlay aspects',
  overlayAspectsHint: 'Aspects between the overlay chart’s bodies and your natal ones (e.g. a transiting planet to a natal planet), showing how the overlay activates the chart.',

  // Local-space amalgamation: the horizon dial's caption below the wheel stack
  // and the aspect list's frame-status badges (Local Space view on).
  localSpace: {
    caption: 'Local Space',
    // Planet hover tip on the horizon globe: the body's compass bearing + height at
    // the origin, on two fixed lines so the tip never reflows (not zodiac keywords).
    azTip: 'Azimuth {az}',
    altTip: 'Altitude {alt}',
    // Accessible label / affordance hint for the draggable horizon globe.
    dragHint: 'Local-space globe — drag to rotate, double-click to reset',
    // Flat/3D dial toggle beside the "Local space" caption. Default is the 3D globe
    // (toggle off); turning it on switches the dials to the flat 2D compass.
    flat: 'Flat',
    flatTip: 'Flat compass',
    flatHint:
      'Show the two local-space dials as flat 2D compasses (azimuth around a ring) instead of the default rotatable 3D globes (which also show each body’s altitude).',
    // The two dials of the local-space pair: birthplace (left) vs relocated (right).
    natalWheel: 'Natal',
    natalWheelHint:
      'Local space at the birthplace — the bodies’ compass bearings (azimuths) and heights (altitudes) at the place and moment of birth.',
    relocatedWheel: 'Relocated',
    relocatedWheelHint:
      'Local space at the placed pin — the same moment seen from the relocated place, so each body’s bearing and height shift with the new horizon.',
    relocatedEmpty: 'Same as natal',
    relocatedEmptyHint:
      'The relocated dial appears here once you pin a place away from the birthplace; on the birthplace its local space just repeats the natal one.',
    lost: 'Broken in local space',
    lostHint: 'This natal aspect does not hold between the bodies’ compass bearings (azimuths) at the local-space origin.',
    only: 'Local space only',
    onlyHint: 'These bodies aspect each other by azimuth at the local-space origin, though not in the natal zodiac.',
    both: 'Held in local space',
    bothHint: 'This aspect holds in both frames — in the natal zodiac and between the bodies’ compass bearings (azimuths) at the local-space origin.',
    compare: 'Compare',
    compareTip: 'Compare frames',
    compareHint: 'Compare the frames pair by pair: each row shows a pair’s natal aspect, its local-space aspect, the orb change (− means closer to exact), and a status — retained, changed (same pair, different aspect), lost, or new. Column headers sort; the status pills filter. This table is computed at its own orb, set beside the pills and wider than your aspect table by default. Declination pairs, having no horizon analogue, show in the combined list only.',
    orbValue: 'Orb {deg}°',
    orbTip: 'This table’s orb',
    orbHint: 'Both frames are read at this orb, and it belongs to this table alone — your aspect orbs in Settings are untouched. It opens wider than they are on purpose: a pair 9° apart at birth that closes to 2° here is exactly what the comparison is for, and at a 7° orb it never reaches the natal column at all — the move shows up as “new”, which says the opposite of what happened.',
    orbDefaultHint: 'The default. Wide enough to hold a pair that is loose in one frame and tight in the other, which is the change worth seeing.',
    orbOptionHint: 'Read both frames at {deg}°. A narrower orb lists fewer pairs and reports more of them as lost or new; a wider one holds more pairs across both frames.',
    pairCol: 'Pair',
    pairColHint: 'The two bodies. Sort to group rows by planet.',
    natalCol: 'Natal',
    natalColHint: 'The pair’s aspect by ecliptic longitude in the natal chart, with its orb. Sorts by orb.',
    lsColNatal: 'Local space · natal',
    lsColReloc: 'Local space · relocated',
    lsColHint: 'The pair’s aspect between compass bearings (azimuths) at the local-space origin — the birthplace (natal) or the placed pin (relocated), matching whichever dial is active. Sorts by orb.',
    deltaCol: 'Δ orb',
    deltaColHint: 'How the orb changes from natal to local space — negative means closer to exact (tighter), positive further (wider).',
    statusCol: 'Status',
    statusColHint: 'The pair’s fate across the two frames: retained, changed, lost, or new.',
    status: {
      retained: 'Retained',
      changed: 'Changed',
      lost: 'Lost',
      new: 'New',
    },
    statusHint: {
      retained: 'The pair makes the same aspect in both frames — the natal bond carries into local space.',
      changed: 'The pair aspects in both frames, but as different aspects — the bond persists, its character shifts.',
      lost: 'The natal aspect has no local-space counterpart — the bearing between these bodies makes no aspect.',
      new: 'These bodies aspect each other only by azimuth at the local-space origin — absent natally.',
    },
    tighter: 'Tighter in local space',
    tighterHint: 'This pair sits {delta} closer to exact between azimuths than in the zodiac.',
    wider: 'Wider in local space',
    widerHint: 'This pair sits {delta} further from exact between azimuths than in the zodiac.',
  },

  resize: 'Drag to resize',
} as const;
