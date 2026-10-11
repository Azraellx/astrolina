// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The controls panel (Sidebar.tsx): section/heading text plus the enum label+hint maps.
// Enum sub-keys are the exact code values (PlanetName/HouseSystem/…); the InfoBar chip
// reads the same label maps via makeEnumLabels so the two never drift. Proper-noun house
// systems (placidus, koch, …) keep their eponyms verbatim.

// The sky hold's reason (lib/skyHold), in its two halves. It is ONE sentence, reused
// word for word on every held surface, so inert.skyHeld below is built from these two
// rather than typed a second time: the why, the fix and the whole cannot drift apart.
// The why alone is the compact form, for a row that carries the fix in its tip.
// (2026-10-02)
const SKY_HELD_WHY = 'Not available on geodetic maps, which don’t turn with the sky.';
const SKY_HELD_FIX = 'Switch the line system to Celestial, in Calculation, to use it.';
// The two other reasons a held surface can give, kept as consts for the same reason: each
// is said alone on a row that carries the fix elsewhere, and with the fix beside it on a
// tip or a note that has room — so the joined forms below are built, never retyped.
const SKY_HELD_FOR_NOW = 'Not available on geodetic maps for now.';
const PARANS_HELD = 'Parans are not shown on geodetic maps.';

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
    geoGrid: 'Geodetic grid',
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
    rulerships: 'Rulerships',
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
  // The Natal Chart toggle in the timeline bar's display drawer — a SWAP, not a hide;
  // the plain hide is `natalLines` below. (The overlay's zenith stamps now ride the
  // shared Zeniths/Nadirs toggle, so there's no separate overlay-zenith key here.)
  natal: {
    title: 'Natal Chart',
    // Not the same act as Advanced ▸ Lines ▸ Natal Lines, though the two sit a click
    // apart and both start with the word: this one SWAPS rather than hides — the
    // overlay is promoted into the chart's place, drawn through its path, and the
    // wheel and readouts follow it. Saying so is what keeps the pair distinguishable.
    hint: 'The underlying birth chart. Hide it and the overlay stands in for it — taking over the chart’s lines, wheel and readouts.',
  },
  // Tooltip on a language that is listed but not yet translated.
  languageUnavailable: 'Coming soon.',
  // The Language menu's second section (2026-10-10): languages this app does NOT ship, translated
  // from the English on the reader's own device by its built-in translator, as they use the app
  // (i18n/machineMenu). Every string here describes that honestly and names no browser, company
  // or product — the feature is "on this device", which is all a reader needs to know and all
  // that stays true across the browsers that offer it. Each row is the language's own name,
  // never translated; these are its heading, its tips and the lines under the menu.
  machine: {
    // The heading over the languages the reader's own device translates by machine, as opposed
    // to the ones above it, which ship with the app. Keep it short: it heads a narrow menu.
    // (2026-10-10: renamed from "Translated on this device", which readers could not tell apart
    // from the section above it; sectionHint now carries the difference.)
    section: 'Auto-translated',
    // The tooltip on that heading (its (i)), 2026-10-10. "above": the
    // languages listed over this heading, which ship with the app as complete translations;
    // "below": the ones under it, which the reader's own device translates by machine. Names no
    // browser or company. What picking one involves (a download, wording that may be imprecise)
    // is each row's own tip, below.
    sectionHint:
      'The languages above come with AstroLina. The languages below will be translated automatically on this device.',
    // A row's tip, in the usual case. "as you use the app": text is translated when it is first
    // needed, so some of it is English for a moment.
    hint: 'Translated from English on this device, as you use the app. Some wording may be off.',
    // A row's tip when the device must first download the translation model (the first time).
    downloadHint: 'Translated from English on this device. The first time, the translation model is downloaded to it.',
    // The tip of the language on screen when part of it is still English because the model has to
    // be downloaded again, which only the reader's own tap may start.
    partialHint: 'Part of the app is still in English. Choose it again to finish downloading the translation to this device.',
    // The tip of the reader's chosen device language that is on hold for the same reason, with
    // nothing translated yet to show: the app is in its usual language until they tap.
    heldDownloadHint: 'Your choice, on hold until the translation is downloaded to this device again. Choose it to download it.',
    // Why the reader's chosen device language is greyed: this device can't translate (its
    // translator switched off or gone) and has nothing translated to show. "kept": the choice is
    // held, not cleared,
    // and returns by itself where translating is possible (CLAUDE.md rule 2).
    heldHint: 'This device can’t translate into this language right now. Your choice is kept, and comes back when it can.',
    // Why the language on screen is greyed: shown from what was translated earlier, with no
    // translator now; new text stays English.
    cacheHint: 'Shown from what this device translated before. It can’t translate here any more, so new text stays in English.',
    // The line under the menu while the model downloads. {language} is the language's own name;
    // {percent} a whole number, 0–100.
    downloading: 'Downloading {language} to this device… {percent}%',
    // The line under the menu while the text on screen is being translated, before the switch.
    translating: 'Translating into {language}…',
    // The line under the menu when the device could not set the language up.
    failed: '{language} couldn’t be set up on this device.',
    // Under the menu for as long as a device language is on screen. Says what the reader is
    // reading and the two things they may notice; never names who made the translator.
    disclosure:
      'Machine-translated on this device. Some wording may be off; anything not yet translated shows in English.',
  },
  // Accessible names for the two touch-only controls that show and hide the whole
  // settings dock: the edge tab beside it (SettingsNub) and the × in its corner. Read
  // aloud by screen readers, never shown. (2026-10-09)
  dock: {
    open: 'Open settings',
    close: 'Close settings',
  },
  userRate: { label: 'Degrees per year' },
  parans: {
    title: 'Parans',
    // The second sentence is there because a transit overlay's rows used to REPLACE the
    // chart's without a word anywhere in the app, and a reader compared them with another
    // program's natal parans (2026-10-06). Time overlays now draw none of their own; a
    // synastry partner's (and an eclipse's opt-in set) join the chart's, tagged.
    hint: 'Latitudes where two bodies are angular at the same moment, one rising as another culminates, and so on. Your chart’s parans stay on beside an overlay.',
    // Shown on the grayed toggle while Cyclocartography stands in for the chart (its
    // "sky" mixes progressed and transiting bodies, so it has no simultaneous moment of
    // its own, and the chart's parans are off the map with the chart). Names the fix.
    blockedCyclo:
      'No single sky-moment — Cyclocartography reads progressed and transiting bodies together. Show the Natal Chart to bring the chart’s own parans back.',
    // The same greyed toggle while any OTHER time overlay stands in for the chart: none of
    // them draws parans of its own (lib/astro/timeline AUX_BLOCKED_OVERLAYS says why).
    blockedOverlay:
      'Parans are read from the chart, and this overlay is standing in for it. Show the Natal Chart to bring the chart’s parans back.',
  },
  // Local Space + its origin selector live in the Local Space view (i18n localSpaceHud).
  aspectLines: {
    title: 'Aspect Lines',
    hint: 'Lines where a planet is sextile (⚹), square (□) or trine (△) to the MC or Ascendant — each aspect twice, once per side. A trine to the AS doubles as a sextile to the DS; hover a line to see both readings. Conjunctions and oppositions are the planet’s own angle lines, already on the map.',
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
  // Advanced ▸ Lines ▸ Natal Lines — the first row, and the only one in that list whose
  // family is on by default. Cap: 180 characters (components/ui/tipWidth.ts), past which the
  // card steps to a wider shape than every tip beside it.
  //
  // The second sentence used to end "line cards and reports still find them", which was HALF
  // false and therefore worse than saying nothing: a line card is produced by one mechanism
  // only — a hit test against RENDERED features (Map.tsx LINE_HIT_LAYERS → lineAtPoint) — and
  // the hide empties the very source those layers read. Reports do still find them; cards
  // cannot exist. A reader tests a sentence like that one click after reading it.
  //
  // Note what this string may NOT say. It ships in the open core, so it cannot promise what
  // Radar or Reports do with the hidden lines — neither exists there. The Help article can,
  // and does, because plugins/help is private to the paid build.
  natalLines: {
    title: 'Natal Lines',
    // "beside an overlay, its parans": since 2026-10-06 the chart's parans stay on the map
    // beside an overlay's, and this switch is how a reader puts them down to read the
    // overlay's alone. With no overlay, parans keep their own switch.
    hint: 'The birth chart’s angle lines on the Ascendant, MC, Descendant and IC — and, beside an overlay, its parans. The wheel and readouts stay; hidden lines can’t be clicked.',
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
    // `hint`: the row's hover tip, one sentence of what the theme looks like (2026-10-08, beside
    // the Prism row's). Describes, never ranks — no theme is the "accurate" one. Under the tip
    // cap (180). Glass's map is Bright since 2026-10-08 (lib/theme BASEMAP_STYLE_URLS); until
    // then its hint said "a quiet light-grey map", which went false with the move.
    glass: { label: 'Glass', hint: 'Frosted silver panels over a bright, detailed map of cream land and pale-blue seas.' },
    dark: { label: 'Dark', hint: 'A deep slate map under dark panels, made for late nights, where every line stands out.' },
    vintage: { label: 'Earth', hint: 'A warm atlas look: soft blue seas and sandy land, framed in parchment-brown panels.' },
    // A downstream build's theme option (lib/extensions/themeOptions). The option brings
    // its own label, hint and held reasons; these are what the CORE draws around it — the
    // opener beneath the list, and the reasons a row gives while it can't act. Neutral on
    // purpose: the core knows no tier names and never names the option (its label() does),
    // and none of these reach the open core's screen, which registers no option. Each under
    // the tip cap (180, ui/tipWidth.ts). (2026-10-06)
    customize: 'Customize',
    customizeHint:
      'Open the theme editor: colours, line styles and effects, from a few broad choices down to every single value.',
    // The held row's reason when the option brings none of its own. It can't say what
    // brings the theme back (the core doesn't know), so it says what is true meanwhile —
    // since 2026-10-08 a hold draws the theme used before this one, not this one's base.
    customHeld:
      'Not available right now. The app is drawn in the theme you used before this one meanwhile; your choice is kept, not cleared.',
    // The live row's note while the reader's own version waits behind the option's
    // fallback (lib/themeChoice editsHeld), when the option brings no editsHeldHint. The
    // row still works — this is a note under its hint, not an unavailable state.
    // (2026-10-08)
    customEditsHeld:
      'Your own version of this theme isn’t available right now, so its standard version is drawn; yours is kept, not cleared.',
    // The Details basemap switches on the Outline map. Names the fix by the editor's own
    // words (its Map row, behind Customize) and says the switch's setting survives.
    outlineUnavailable:
      'The Outline map is coastlines only: it has no roads, rivers or place names. Choose another Map in Customize to use this; your choice is kept.',
    // The note line under a theme row's hint while the reader is below its rung: `lockedNote` on
    // a teaser — a built-in a downstream build has tiered (lib/extensions/builtinThemeTiers), or
    // the theme option's row when not chosen (a chosen one is HELD and says so instead) — and
    // `keptNote` on a tiered built-in the reader is drawn in, which stays theirs. One locked note
    // for every row, so the hints above it can be what each theme LOOKS like, the same for
    // every reader (2026-10-08: Prism's hint used to say who it was free for, to Members too). Neutral, as the option's are: the
    // core knows no tier names (the tip's headline carries the rung's tag), and the build that
    // tiers a theme retunes both to name what unlocks it. Never on the open core's screen,
    // which tiers nothing. Under the tip cap (180). (2026-10-08)
    lockedNote: 'Not open to this account yet. Press to see what unlocks it.',
    keptNote:
      'Yours to keep. If you switch to another theme, coming back to this one needs what the badge shows.',
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
    // Labelled "Mundane" until 2026-10-02 (Lina's ruling, 2026-10-02); only the label
    // changed — the stored value 'geodetic' never did, and the hint stays as written.
    // This one label reaches the Calculation control, the InfoBar chip and the capture
    // caption.
    geodetic: {
      label: 'Geodetic',
      hint: "Geodetic mapping: the zodiac mapped onto Earth's longitudes (Greenwich = 0° Aries, always tropical), independent of birth time",
    },
  },

  // Calculation ▸ Geodetic grid: the zodiac laid on the Earth (lib/astro/geodeticGrid), drawn
  // only on a geodetic map. Each hint stays under the tip cap (180, components/ui/tipWidth.ts).
  // The Ascendant hint does not say the sign "runs east" of its curve: inside the polar circles
  // that is not true at nearly half the crossings, and the zone a place is in is defined by
  // its readout, not by a side of a line. (2026-10-02)
  geoGrid: {
    mc: {
      title: 'MC meridians',
      hint: 'Twelve meridians, every 30° east of Greenwich. On a geodetic map each is where an MC sign begins; the sign is marked at the top of the map.',
    },
    asc: {
      title: 'Ascendant curves',
      hint: 'Where each sign begins to rise: every place on a curve has 0° of that sign as its Ascendant. On by default while no chart lines are drawn; your choice overrides that.',
    },
    zones: {
      title: 'Zone shading',
      hint: 'Fills the twelve MC zones: element as colour, modality as shade (Cardinal darkest, Mutable lightest). The legend on the map shows one element or modality alone.',
    },
    presentation: {
      title: 'Presentation',
      hint: 'Raises the zone shading from faint to strong, for showing the zones to someone else.',
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
    hint: 'The Part of Fortune is a calculated Lot of vitality and worldly ease — a point on the ecliptic, not a body in the sky, so only a zodiacal frame can place it: its map lines need Line projection set to In Zodiaco (or the Geodetic line system). Relocating the map pin recomputes it on the chart wheel for that place, while the map lines keep your natal Fortune.',
    sect: {
      label: 'Sect-based (day/night)',
      hint: 'Day births use Ascendant + Moon − Sun; night births flip to Ascendant + Sun − Moon. The traditional convention.',
    },
    ptolemaic: {
      label: 'Ptolemaic (fixed)',
      hint: 'Ascendant + Moon − Sun for every chart, day or night. The alternative historical convention.',
    },
  },

  // Which rulership table the essential-dignity list reads. Two values, not three:
  // the modern scheme ADDS the outer three to the classical table rather than
  // replacing anything, so Mars keeps Scorpio beside Pluto and both are in
  // detriment in Taurus. Choosing Traditional only ever removes the outer
  // planets' rows — no classical planet's dignity moves either way, which is the
  // thing the control hint has to say, because the two labels imply otherwise.
  rulership: {
    hint: 'Which rulership table the chart wheel’s essential-dignity read uses. Modern ADDS the outer three rather than replacing anyone: Mars keeps Scorpio beside Pluto, and both are in detriment in Taurus opposite it. Choosing Traditional drops the outer planets’ rows and changes nothing else in the list.',
    traditional: {
      label: 'Traditional',
      hint: 'The seven-planet table alone — Mars rules Scorpio, Saturn Aquarius, Jupiter Pisces. Uranus, Neptune and Pluto rule nothing, so they carry no dignity.',
    },
    modern: {
      label: 'Modern',
      hint: 'The same seven, plus Pluto in Scorpio, Uranus in Aquarius and Neptune in Pisces. Those three signs have two rulers, and each row names its era.',
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
    // Opens on "The Geodetic line system", not "Geodetic maps…", which reads first as
    // the plural noun every other hold sentence uses ("on geodetic maps"). Under the
    // tip cap (180): it rides as the note under the segment's own hint. (2026-10-02)
    geodeticSidereal:
      'The Geodetic line system maps the TROPICAL zodiac onto Earth’s longitudes, so it has no sidereal version. Set the zodiac to Tropical (Advanced) to use it; your choice is kept.',
    // The HOLD, and a different fact from the line above it: that one names a
    // setting to change, this one has none to name. So it says what it is and what
    // survives it, and — like the Activations block — says it is coming back rather
    // than that something is broken. No detail about the discrepancies: a reason
    // stated here is a claim that has to stay true, and this one is expected not to
    // outlive the work it is waiting on. See lib/geodeticHold.
    geodeticHeld:
      'Geodetic is under review while we check how it draws — we would rather hold it than draw a map we cannot stand behind. Your choice is kept, not cleared; check back soon.',
    // The SKY hold (lib/skyHold): a third hold beside the sidereal mask and the review
    // hold above, and unlike them a property of the mapping itself — anything that
    // reads the sky's turning has nothing to read on a geodetic map. skyHeld is the
    // whole sentence, skyHeldWhy the compact form, skyHeldFix the half that names the
    // setting, and skyHeldAction the button that opens it. (2026-10-02)
    skyHeldWhy: SKY_HELD_WHY,
    skyHeldFix: SKY_HELD_FIX,
    skyHeld: `${SKY_HELD_WHY} ${SKY_HELD_FIX}`,
    skyHeldAction: 'Open Calculation',
    // For a surface held only because nothing projects it onto a geodetic map YET (a
    // second sky's frame needs no turning there), where the standard reason would be
    // untrue. "For now" rather than "currently": that word is the wording of a hold
    // frozen onto a saved document, and this one is live.
    skyHeldForNow: SKY_HELD_FOR_NOW,
    // …and with the fix beside it, built from the two halves (2026-10-02).
    skyHeldForNowFull: `${SKY_HELD_FOR_NOW} ${SKY_HELD_FIX}`,
    // The angle-frame controls on a geodetic map (the transits pair, the progressed
    // Angles), held at Natal angles. Not the sky sentence: the reason here is not that
    // the map doesn't turn, but that a place's angles are its own.
    anglesHeld:
      'On geodetic maps a place’s angles come from its coordinates, so they don’t move with time.',
    // A paran listing on a geodetic map, in place of its empty state — one sentence,
    // defined once here for every listing.
    paransHeld: PARANS_HELD,
    // …and with the fix beside it, for a tip with no button next to it (2026-10-02).
    paransHeldFull: `${PARANS_HELD} ${SKY_HELD_FIX}`,
  },

  nodeType: {
    true: {
      label: 'True Node',
      // "(the default)" states this app's own default and nothing else. It said "(desktop-tool
      // default)" until 2026-10-09 — an unnamed comparison with other software, which CLAUDE.md
      // rules out however it is worded.
      hint: 'True (osculating) node follows the Moon’s instantaneous orbit; oscillates ±~1.5° around the mean and can briefly turn direct (the default).',
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
      hint: 'Holds the natal frame still, so only the planets’ own secondary motion moves the lines. The diurnal rotation is removed. Answers: where on Earth would this transit be landing on the Ascendant, MC, Descendant or IC? The lines drift over weeks and months, at each planet’s own rate.',
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
      angles: 'Advances the angles by the distance the progressed Sun has travelled to this overlay’s own instant, measured along the ecliptic.',
      bodies: 'Advances every body by the distance this chart’s progressed Sun has actually travelled, measured along the ecliptic. The classic method.',
    },
    'sa-ra': {
      label: 'Solar arc — in right ascension',
      angles: 'Advances the angles by the distance the progressed Sun has travelled to this overlay’s own instant, measured along the equator.',
      bodies: 'Advances every body by the distance this chart’s progressed Sun has actually travelled, measured along the equator.',
    },
    'naibod-long': {
      label: 'Naibod, mean rate — in longitude',
      angles: 'Advances the angles at the Sun’s mean rate over this overlay’s own interval, measured along the ecliptic.',
      bodies: 'Advances every body at the Sun’s average yearly motion, measured along the ecliptic.',
    },
    'naibod-ra': {
      label: 'Naibod, mean rate — in right ascension',
      angles: 'Advances the angles at the Sun’s mean rate over this overlay’s own interval, measured along the equator.',
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
      // Lina's ruling, 25 Aug 2026: "real" was doing rhetorical rather than informational
      // work — "a moment of its own" already carries that the moment exists and can be dated —
      // and dropping it makes this and hintTertiary read as the matched pair they are.
      hint: 'The progressed chart has a moment of its own — one day after birth for each year of life — so it has its own angles. The map is drawn against those instead of the natal ones.',
      // Tertiary runs a different clock, so the same sentence would state the wrong
      // rule beside a correct chart. Naming the month is deliberate and Lina's ruling:
      // "lunar month" reads as SYNODIC to a good share of astrologers, and a reader
      // checking our progressed date against 29.53 days would compute 1,053 progressed
      // days where the app uses 1,139 and conclude the app is wrong. 27.32 closes that.
      // Twice trimmed to stay under tipWidth's 180-char step (now 179) so this segment
      // and its Natal sibling keep the same card width — "real" and "of life" went to
      // pay for the number, which is the better trade.
      hintTertiary: 'The tertiary chart has a moment of its own — a day after birth for each tropical month (27.32 days) — so it has its own angles. The map is drawn against those, not the natal ones.',
    },
    // On the calculation menu while the angles are held natal: it is showing a method
    // that isn't running, which needs saying before a reader takes it for the live one.
    idle: {
      tip: 'Not in force',
      hint: 'The angles are held on the natal chart, so no arc is applied to them. Choosing a calculation here also switches the map to Progressed angles.',
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
      // The Maximum row's value: {date} is the long date ("8 April 2024"), {time}
      // the minute of greatest eclipse. UTC, because the panel speaks for the
      // whole eclipse rather than for a place; the map's click card gives a
      // place's own clock time. "(UTC)": the one zone format's UT form (2026-10-07).
      maximumValue: '{date} · {time} (UTC)',
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
      // The Path width row's value: {n} is the width of the central path in
      // kilometres, a whole number. The unit is the translatable half — some
      // scripts write it differently ("км"). (2026-10-09)
      widthValue: '{n} km',
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
    // Called "Natal Lines" until 2026-08-19, which named a fraction of what it clears
    // and collided with the Advanced ▸ Lines switch of that name — a different control
    // that takes only the chart's angle lines and leaves everything else standing. This
    // one is the blunt instrument, and the hint says both halves of that: what it covers,
    // and that it outranks those families' own toggles while it is off.
    otherLines: {
      title: 'Other Lines',
      hint: 'Everything on the map except the eclipse, cleared in one press so the path reads alone — while this is off it overrides the other line switches. The chart wheel and readouts stay.',
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

  // Line-type tooltip text only; the AS/MC/DS/IC button labels stay language-neutral.
  lineType: {
    MC: { hint: 'Midheaven (career, public)' },
    IC: { hint: 'Imum Coeli (home, roots)' },
    ASC: { hint: 'Ascendant (self, identity)' },
    DSC: { hint: 'Descendant (relationships)' },
    VX: { hint: 'Vertex (fated encounters); also adds Vx to the chart wheel' },
    AVX: { hint: 'Anti-Vertex (the axis’ eastern end); also adds Avx to the wheel' },
  },
} as const;
