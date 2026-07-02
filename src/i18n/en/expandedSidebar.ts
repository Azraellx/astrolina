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
  // Bold state title in the wheel's top-left corner, tracking the live map state.
  wheelTitle: {
    natal: 'NATAL CHART',
    pinned: 'PINNED CHART',
    hover: 'HOVER CHART',
  },
  empty: 'No chart selected',
  // Shown in the empty wheel when an overlay with no coherent chart (Cyclo·cartography)
  // is promoted with the natal chart hidden — there's nothing to draw.
  noChart: 'NO CHART (CCG)',
  // One-sentence reason shown (centred) under the empty-wheel label, so the empty
  // state explains itself rather than just asserting there's nothing to draw.
  noChartNote:
    'Cyclocartography blends progressed inner planets with transiting outer planets, so there’s no single chart to draw.',

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

  // Shown under the wheel-state title when the chosen quadrant house system is
  // undefined at this latitude (above the polar circles) and Porphyry cusps are
  // drawn instead — so the wheel never silently shows a different system.
  houseFallback: 'Porphyry cusps — chosen system undefined at this latitude',

  // Shown under the wheel-state title on a planets-only wheel. Kept terse — the
  // chart form's note carries the full explanation of the degrade.
  timeUnknownNote: 'Birth time unknown',

  // Pre-1970 timezone DST caution glyph in the meta row.
  tzUncertain: 'Timezone uncertain',
  tzUncertainHint: 'Pre-1970 timezone outside US/EU: verify DST against an atlas',

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

  // Advanced table column headers and their explanatory hover tips.
  table: {
    point: 'Point',
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
  // essential dignities (Advanced) over the bodies the map filter shows.
  balanceHeading: 'Balance',
  balanceTip: 'Chart balance',
  balanceHint: 'How the shown bodies spread across the four elements (fire, earth, air, water) and three modalities (cardinal, fixed, mutable) — a quick read of where the chart’s emphasis lies.',
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
  // Hover blurbs explaining each essential dignity (the Advanced dignity list).
  dignityDesc: {
    rulership: 'The planet is in a sign it rules — at home and able to act freely, in full strength.',
    exaltation: 'The planet is an honoured guest in its sign of exaltation — its best qualities lifted and amplified.',
    detriment: 'The planet sits opposite a sign it rules — out of place, working against the grain.',
    fall: 'The planet sits opposite its sign of exaltation — weakened, its expression strained.',
  },

  // Aspect section heading (counted) + its hover-tip title and explanation.
  aspectsCount: '{count, plural, one {Aspects (#)} other {Aspects (#)}}',
  aspectsTip: 'Aspects',
  aspectsHint: 'Angular relationships between two bodies by ecliptic longitude (conjunction, sextile, square, trine, opposition) that shape how their energies interact.',

  // Overlay-aspect section: the "(overlay)" planet suffix, counted heading, tip, hint.
  overlaySuffix: '(overlay)',
  overlayAspectsCount: '{count, plural, one {Overlay aspects (#)} other {Overlay aspects (#)}}',
  overlayAspectsTip: 'Overlay aspects',
  overlayAspectsHint: 'Aspects between the overlay chart’s bodies and your natal ones (e.g. a transiting planet to a natal planet), showing how the overlay activates the chart.',

  resize: 'Drag to resize',
} as const;
