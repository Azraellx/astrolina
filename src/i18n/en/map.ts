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
  // Hover labels for the Eclipses overlay's curves. The tip leads with the
  // eclipse identity ("2024-04-08 · Total"), then one of these; where the
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
    // {pct} obscuration (area covered) + {time} "HH:MM" UTC of the local peak.
    localMax: '{pct} of the Sun covered here, at {time} UTC',
    // Hover sub-line on lunar curves: how much of the eclipse this place sees.
    lunarAllVisible: 'The whole eclipse is visible from here',
    lunarPartView: 'Part of the eclipse is visible from here ({n} of {total} contacts)',
  },
  // The pinned click-card in eclipses mode: local contact times (solar) or
  // phase visibility (lunar) at the clicked point.
  eclipseCard: {
    notVisible: 'Eclipse not visible from here',
    // Solar contact rows (times are HH:MM:SS UTC).
    c1: 'Partial begins',
    c2: 'Totality begins',
    c2Annular: 'Ring begins',
    max: 'Maximum',
    c3: 'Totality ends',
    c3Annular: 'Ring ends',
    c4: 'Partial ends',
    // Suffix for a contact clipped by the horizon ("17:02:11 · at sunrise").
    atSunrise: 'at sunrise',
    atSunset: 'at sunset',
    // "73% magnitude · 64% of the Sun covered" on the Maximum row.
    maxValue: '{mag} magnitude · {obsc} covered',
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
  // Zenith stamp hover popup. {planet} is the planet display name.
  zenithTitle: '{planet} zenith',
  zenithSub: 'where {planet} is directly overhead',
  // Nadir (antipodal underfoot) stamp hover popup.
  nadirTitle: '{planet} nadir',
  nadirSub: 'where {planet} is directly underfoot',
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
