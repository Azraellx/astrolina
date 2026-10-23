// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Text for the map surface: the MapLibre zoom/compass control tooltips, the pin
// title, the clickable edge-badge fly-to tips, the zenith hover popup, and the
// deep-zoom "zoom out" escape pill.
export const map = {
  // MapLibre navigation control tooltips (zoom in/out + reset bearing & tilt).
  ctrl: {
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    resetBearing: 'Reset bearing & tilt',
  },
  // Pin marker title (hover), by pin type.
  pin: {
    natal: 'Natal birth location (right-click to remove)',
    custom: 'Pinned location (right-click to remove)',
    home: 'Home — where this chart lives now (right-click to remove the pin)',
  },
  // The standing home marker: the chart's home place, drawn whenever it is set.
  // `hint` names the place under the title; it is blanked by discreet mode, so
  // the title has to carry the meaning on its own.
  home: {
    tip: 'Home',
    hint: 'Click to read the chart here',
  },
  // Fly-to tooltips on the clickable edge badges. {planet} is the planet display
  // name; {prefix} is the optional overlay prefix already followed by a space.
  flyToZenith: "Fly to {prefix}{planet}'s zenith",
  // Aspect / midpoint edge badges fly to the computed degree's overhead point
  // (its sub-point, on that set's MC line); a second click flies back.
  flyToAspectPoint:
    "Fly to where {planet}'s {aspect} degree is overhead (click again to return)",
  flyToMidpoint:
    'Fly to where the {planetA}/{planetB} midpoint is overhead (click again to return)',
  // Aspect display names for the fly-to tip above.
  aspectNames: { sextile: 'sextile', square: 'square', trine: 'trine' },
  flyToParan: "Fly to this paran's intersection (click again to return)",
  flyToLocalSpaceOrigin: 'Fly to the local-space origin (the pin)',
  // Bare-line hover label for the ecliptic great circle.
  ecliptic: 'Ecliptic',
  // Appended to rising/setting line tooltips poleward of the polar circles,
  // where the horizon grazes the ecliptic at the line's crest and the
  // rising/setting identity (and so the As/Ds reading) flips across it.
  polarNote: 'Polar zone: past this line’s crest, rising and setting trade places.',
  // Appended to the tooltip of a line drawn with an uncertainty band (a chart with no birth
  // time on a geodetic map: the Moon's and Mercury's lines, the Moon's aspect and midpoint
  // lines), only while the orb zones are drawn: the orb corridor then surrounds the whole band
  // rather than the line at its centre. Lina's sentence (2026-10-20). A tooltip line about
  // 260 px wide.
  // @i18n-verbatim
  // The second line of a banded line's hover tip (a chart with no birth time: a ranged body's
  // lines), after the line's name ("Moon MC"). Lina's wording (23 Oct 2026, R-2: one label phrase on
  // every surface, "range {a}–{b}" — a progressed range runs over the progressed day, so the
  // birth date is not named); {range} is two zodiac positions with sign glyphs ("14°♋–21°♋").
  // @i18n-verbatim
  bandRange: 'birth time unknown · range {range}',
  // The hover note on the 90°W and 90°E meridians (Lina, 21 Oct 2026, §4): the two meridians
  // where the Ascendant curve runs straight pole to pole, shown when the cursor is on either
  // line. Her wording for 90°W; the 90°E one mirrors it.
  // @i18n-verbatim
  geoMeridian90W: '0° Capricorn on the MC — 0° Aries rises at every latitude',
  geoMeridian90E: '0° Cancer on the MC — 0° Libra rises at every latitude',
  // The banner over a map that draws no lines because the stored line system and zodiac contradict
  // each other (Geodetic chosen, a sidereal zodiac in force; Lina, 22 Oct 2026, §4) — a combination
  // saved before the two controls greyed each other, or Advanced turned on over a sidereal zodiac.
  // `body` says why nothing is drawn; the two buttons are the two fixes, each a setting's own
  // value. A card about 300 px wide; the buttons short.
  lineConflict: {
    body: 'No lines are drawn: your line system is Geodetic, which is tropical by definition, and a sidereal zodiac is set. Choose one:',
    toTropical: 'Set the zodiac to Tropical',
    toCelestial: 'Switch to Celestial',
  },
  // The legend entry for the banded stroke, in the conventions row at the map's foot, after a
  // drawn sample of the double hairline. Lina's wording (21 Oct 2026, §2.1).
  // @i18n-verbatim
  bandLegend: 'birth time unknown · degree uncertain',
  bandCorridor:
    'On a banded line the orb corridor surrounds the band, so it shows every place that could be within orb of the line, wherever in the band the line truly lies.',
  // Hover labels for the Eclipses overlay's curves. The tip leads with the
  // eclipse identity ("8 April 2024 · Total"), then one of these; where the
  // eclipse is visible, a sub-line adds the local circumstances at the cursor.
  eclipse: {
    central: 'Central line',
    pathEdge: 'Edge of the central path',
    // {pct} is the contour's magnitude, e.g. "50%".
    isoline: '{pct} maximum eclipse',
    // The faint solar 0%-magnitude boundary.
    outerLimit: 'Visibility edge — any eclipse at all inside this line',
    // Lunar moonrise/set circle at a phase contact; {phase} is the contact
    // tag in the astronomical convention (U1, U4, P1, P4).
    horizon: 'Moonrise/set line at {phase}',
    // {pct} obscuration (area covered) + {time} "HH:MM" UTC of the local peak, written
    // in the one zone format's UT form, "16:12 (UTC)" (2026-10-07).
    localMax: '{pct} of the Sun covered here, at {time} (UTC)',
    // Hover sub-line on lunar curves: how much of the eclipse this place sees.
    lunarAllVisible: 'The whole eclipse is visible from here',
    lunarPartView: 'Part of the eclipse is visible from here ({n} of {total} contacts)',
  },
  // The pinned click-card in eclipses mode: the eclipse as seen from the
  // clicked point — the solar contacts there, or which lunar phases the Moon is
  // up for. Every time is given twice, in two columns: the clicked place's own
  // civil time (its time zone, daylight saving included), then UTC. "Local"
  // here always means that clock — the place's, not the reader's device's.
  eclipseCard: {
    notVisible: 'Eclipse not visible from here',
    // The second column's head. The first column is headed by the place's own
    // zone in the shared format ("EDT (UTC−04:00)", "LMT (UTC+00:39:57)" in the
    // mean-time era), which comes from the zone-name module, not from this catalog.
    // (The separate `lmt` head retired 2026-10-07: the shared label carries it.)
    utc: 'UTC',
    // Solar contact rows; each carries the place's time and the UTC time.
    c1: 'Partial begins',
    c2: 'Totality begins',
    c2Annular: 'Ring begins',
    max: 'Maximum',
    c3: 'Totality ends',
    c3Annular: 'Ring ends',
    c4: 'Partial ends',
    // Added to a contact's LABEL when the horizon clips it ("Partial begins ·
    // at sunrise"): the Sun rises or sets mid-eclipse, so that is when this
    // place sees the phase begin or end.
    atSunrise: 'at sunrise',
    atSunset: 'at sunset',
    // The card's foot line at the local maximum. {mag} is the magnitude as a
    // decimal ("0.730" — the fraction of the Sun's diameter covered, the form
    // the eclipse panel uses too); {obsc} is the fraction of its AREA covered,
    // as a percentage ("64%").
    maxValue: 'Magnitude {mag} · {obsc} covered',
    duration: 'Duration',
    // Lunar rows: each phase contact with its visibility at this place.
    phase: {
      P1: 'Penumbral begins',
      U1: 'Partial begins',
      U2: 'Totality begins',
      max: 'Maximum',
      U3: 'Totality ends',
      U4: 'Partial ends',
      P4: 'Penumbral ends',
    },
    belowHorizon: 'Moon below horizon',
    moonrise: 'Moonrise',
    moonset: 'Moonset',
  },
  // The pinned click-card on a map line (its reading lives in lineMeanings).
  lineCard: {
    // The card's closest-approach row: how near the line passes to the reference point.
    // {label} is lineMeanings.distance.fromPin / .fromNatal, already ending in its colon
    // ("Closest distance to natal:"); {km} and {mi} are whole numbers, the same distance in
    // kilometres and in miles. Both units are always shown; write their abbreviations and
    // the order as the language does. (2026-10-09)
    distance: '{label} {km} km / {mi} mi',
    // The same row for a line drawn with an uncertainty band — on a geodetic map, a chart with
    // no birth time draws the Moon's and Mercury's lines (and the Moon's aspect and midpoint
    // lines) with a band: every place the line could be across the unknown hours. Such a line
    // is measured by its band (2026-10-20). {label} as above. `bandCovers`: the reference point
    // lies inside the band, so it is as close to the line as the chart can say and no figure is
    // shown. `bandEdge`: outside it, the figures are the distance to the band's nearest edge,
    // not to the line drawn at its centre. A card line about 260 px wide.
    // Since 21 Oct 2026 in Lina's words (§2.2): {band} is one of bandOf below, {range} the
    // body's range as two zodiac positions ("14°♋–21°♋"), labelled "range" (R-2, 23 Oct).
    // @i18n-verbatim
    bandCovers: '{label} inside {band}',
    // @i18n-verbatim
    bandEdge: '{label} {km} km / {mi} mi to the edge of {band} · birth time unknown · range {range}',
    // The band named by its body, as {band} above: "the Moon's band", "Mercury's band" (no
    // article before a planet's name in English). `line` is for an aspect or midpoint line's
    // band, and any other.
    bandOf: {
      Sun: 'the Sun’s band',
      Moon: 'the Moon’s band',
      Mercury: 'Mercury’s band',
      Venus: 'Venus’s band',
      Mars: 'Mars’s band',
      line: 'this line’s band',
    },
  },
  // Zenith stamp hover popup. {planet} is the planet display name.
  zenithTitle: '{planet} zenith',
  zenithSub: 'where {planet} is directly overhead',
  // Nadir (antipodal underfoot) stamp hover popup.
  nadirTitle: '{planet} nadir',
  nadirSub: 'where {planet} is directly underfoot',
  // The geodetic grid's hover readout, in three lines since 2026-10-20 (Lina's format): the
  // place's geodetic angles to the minute, then the nearest city's own name (over open ground
  // or water there is none, and the line is left out), then the cursor's coordinates. The name
  // and the coordinates are data, printed as they are, so only the angle line and the polar
  // caution are here. Only AS and MC: DS and IC are their opposites, so they would add a line
  // and no information.
  geoReadout: {
    // The geodetic angle line, first line of the map's hover readout and the chart panel's
    // geodetic line (2026-10-20). Lina's format: GE (geodetic equivalents), a colon, then the
    // Ascendant (AS) and Midheaven (MC), each a figure like 21°♈04'. Keep the codes, the colon
    // and the middle dot exactly; translate nothing unless your language writes these angle
    // codes differently. {as} and {mc} are the figures. The place and the coordinates follow
    // on their own lines.
    // @i18n-verbatim
    angles: 'GE: AS {as} · MC {mc}',
    // The same line within 0.01° of a pole, where the Ascendant is undefined: the MC alone.
    // @i18n-verbatim
    anglesMcOnly: 'GE: MC {mc}',
    // Shown under the readout inside the polar circles (from 90° less the map's obliquity).
    // Lina's sentence; she wrote "AL" for the app, expanded here to its name. "The eastern
    // point": of the two places the ecliptic meets the horizon, the one in the east. A tooltip
    // line, about 260 px wide; keep it two short sentences.
    // @i18n-verbatim
    polar:
      'Polar zone: inside the polar circles the Ascendant has two definitions, half a circle apart. AstroLina uses the eastern point.',
  },
  // The zone-shading legend's heads: a row head isolates an element, a column head a
  // modality, and the same head again shows every zone. {group} is "Fire", "Cardinal", …
  geoLegend: {
    aria: 'Zone shading legend',
    isolate: 'Show only {group} zones',
    clear: 'Show every zone',
  },
  // Deep-zoom escape pill (appears once zoomed past the detail threshold).
  zoomOutToWide: 'Zoom out to a wide view',
  zoomOut: 'Zoom Out',
  // Shown in place of the map when the browser can't give us a WebGL context.
  // The whole map renders through WebGL (there's no 2D fallback), so without one
  // the surface is just a blank box. Usually means hardware acceleration is off,
  // or a privacy / anti-fingerprinting shield is blocking or spoofing WebGL
  // (some hardened or niche browsers do this by default). The guidance is
  // deliberately gentle and non-destructive — nothing here asks the user to
  // change anything that could put their system at risk.
  webgl: {
    unsupportedTitle: 'This map needs WebGL',
    unsupportedBody:
      "Your browser isn't giving this page a WebGL graphics context, so the map can't be drawn.",
    // Each tip is a safe, reversible setting the user can try on their own.
    tipsHeading: 'A few things you can try:',
    tipAccel: 'Turn on hardware acceleration in your browser settings, then reload.',
    tipShield:
      'Allow WebGL / canvas for this site if you use an anti-fingerprinting or privacy shield.',
    tipBrowser: 'Or open AstroLina in another up-to-date browser.',
    lostTitle: 'The map lost its graphics context',
    lostBody:
      "This can happen when the device is low on graphics memory. It often recovers on its own — if it doesn't, reload the page.",
    reload: 'Reload the page',
  },
} as const;
