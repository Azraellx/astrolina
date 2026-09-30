// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Catalog minor bodies (433 Eros, 136199 Eris, …): the Minor bodies window, the
// "More…" button beside the five built-in minor bodies in Map filters, the row
// states that explain why a body isn't drawn, and the line card. Body NAMES are
// proper nouns from the catalog and are never translated here; glyphs are
// language-neutral and stay in JSX.
export const minorBodies = {
  // The sixth button in Settings ▸ Map filters ▸ Minor bodies.
  more: {
    label: 'More',
    title: 'More minor bodies',
    hint: 'Search and toggle every minor body, including these five.',
    // The standard unavailable note (.ui-inert), shown while Advanced is off in a build
    // that doesn't nudge that rung (the open core). A build that does gets a clickable
    // upgrade teaser instead, and its own flow says the rest.
    advancedHint:
      'The wider set of minor bodies is an Advanced reading — turn Advanced on to use it. Your list is kept meanwhile.',
    // Shown on the button when catalog bodies are switched on / held.
    count: '+{n}',
    held: '{n} held',
  },
  hud: {
    title: 'Minor bodies',
    closeAria: 'Close Minor bodies',
    closeHint: 'Close this window. The bodies you switched on stay on the map.',
    searchPlaceholder: 'Name or number',
    searchAria: 'Search minor bodies by name or number',
    noMatch: 'Nothing matches “{q}”.',
    searching: 'Searching…',
    // A search that failed without its source saying why (a source that knows
    // why supplies its own sentence instead).
    searchFailed: 'Couldn’t run that search. Try again.',
    // The bundled set's scope chip (shown only beside a downstream build's scope — the
    // open core has one scope and no chips). "Featured", not "Bundled": what the set IS
    // to a reader, rather than how it ships.
    scopeBundled: 'Featured',
    scopeAria: 'Search scope',
    // Shown once, ever: a Featured search found nothing and another scope's chip (a
    // downstream build's — the open core has none) can search further. {scope} is
    // that chip's label; the hint's caret points at it.
    scopeHint: 'Not among the featured bodies — switch to {scope} to search further.',
    // The family switch, on the row under the search box. Named for what turning it
    // ON does — off by default, so the switch reads "not hiding" until the reader
    // asks — and its label never flips with the state: one constant name plus
    // aria-checked, where a flipping label read to a screen reader as two answers to
    // one question.
    //
    // "Your list", not "catalog", wherever it names the set: in a build that
    // registers a hosted source, "Full catalog" is that source's chip — one tier of what
    // this switch covers — and a reader holding only bundled bodies would read
    // "catalog bodies" as a product they don't have. Every body this switch reaches
    // is on the reader's list (switching one on puts it there), so the list names
    // exactly the set, in both builds.
    hideAll: {
      label: 'Hide all',
      // The short label can't say "all of WHAT", so the accessible name does — it
      // still starts with the visible words, so speaking the label finds it.
      aria: 'Hide all bodies on your list',
      // Says the main minor bodies are exempt: they sit just below the switch, and
      // "all" would otherwise read as including them.
      hint: 'Hide every body on your list at once and keep your selection. The five main minor bodies keep their own switches.',
      // At the top of the list while the switch is on — naming the switch, since
      // the list may sit in its own column away from it.
      hiddenNote: 'Every body on your list is hidden, and your selection is kept. Turn off Hide all to show them again.',
    },
    sections: {
      // Chiron and Ceres–Vesta: the built-in bodies, a group by convention rather than
      // by orbit (its info line is groupInfo.builtin).
      builtin: 'Main minor bodies',
      yours: 'Your list',
      results: 'Results',
    },
    // The Featured browse's headings. The four physical groups and Hypothetical points
    // are level 1 (the section style, capitals by CSS); Uranian points and Other
    // hypothetical points are level 2, under Hypothetical points
    // (lib/minorBodies/hypothetical.ts). Written in sentence case — the capitals are
    // the style's, so a screen reader and a copy-paste get the words as written.
    groups: {
      dwarf: 'Dwarf planets & trans-Neptunian objects',
      centaur: 'Centaurs',
      mainBelt: 'Main-belt asteroids',
      nearEarth: 'Near-Earth asteroids',
      hypothetical: 'Hypothetical points',
      uranian: 'Uranian points',
      otherHyp: 'Other hypothetical points',
    },
    // The one-line info text under each heading — the same text opens that group's Help
    // entry, so the two say one thing. Each tag's own definition (tags below) is the
    // Help's, not repeated in the window.
    groupInfo: {
      builtin: 'Chiron and the first four asteroids discovered',
      dwarf: 'Orbiting beyond Neptune, including the dwarf planets Eris, Haumea and Makemake',
      centaur: 'Orbiting between Jupiter and Neptune; some show comet-like activity',
      mainBelt: 'Orbiting between Mars and Jupiter',
      nearEarth: 'Orbits coming within 1.3 times Earth’s distance from the Sun',
      hypothetical: 'No observed body; position defined by a published orbit',
      uranian: 'Hypothetical points of the Hamburg School (Witte/Sieggrün)',
      otherHyp: 'TransPluto (proposed planet beyond Pluto) and Selena (White Moon)',
    },
    // Beside "Your list": empties it after an inline confirm. Harsher than Hide all,
    // which keeps the selection; Hide all itself is left as it is.
    clear: {
      label: 'Clear',
      aria: 'Clear your list',
      ask: '{count, plural, one {Remove # body?} other {Remove all #?}}',
      confirm: 'Clear',
      keep: 'Keep',
    },
    row: {
      // The title of a row's tip when a cap would refuse switching it on (a row
      // otherwise names itself by its text and pressed state).
      show: 'Show {name}',
      remove: 'Remove {name} from your list',
      removeConfirm: 'Remove',
      removeKeep: 'Keep',
      retry: 'Try again',
      retryAria: 'Try loading {name} again',
      // The label of the list icon on a search or browsing row whose body is on the list
      // but switched off: the icon's accessible name, and the row's tip.
      added: 'On your list',
    },
    // A search hit that is really one of the built-in bodies: pointed at its own
    // row, never offered as a second copy. ONE line beside the body's class tag, like
    // every row: "in", and no "above", because "Ceres — under Main minor bodies above"
    // + "Dwarf planet" wrapped in the narrowest column (measured in Chrome, 2026-09-29).
    builtinHit: {
      minor: '{name} — in Main minor bodies',
      planet: '{name} — under Planets in Map filters',
    },
    status: {
      loading: 'Loading…',
      offline: 'Needs a connection the first time — it loads by itself once you’re back online.',
      missing: 'Its ephemeris file couldn’t be found.',
      content: 'Its ephemeris file couldn’t be read.',
      // A hypothetical point: the file of orbital elements it is computed from
      // couldn't be loaded or read. Nothing is drawn in its place.
      elements: 'Its orbital elements couldn’t be read.',
      // The row greys out and says this; the why is its tip (noDataHint). "This date",
      // not "this chart's date": while Slide moves the map, the row reads the slid
      // instant — the one the lines are drawn at.
      noData: 'No data for this date',
      // Not one span for every body: most short files run about 1500–2100, a few
      // near-Earth files start later, and Pholus is read from the main-asteroid file
      // (1800–2399) — so the sentence names the common span, not a promise.
      noDataHint: 'This date falls outside the years this body’s file covers — about 1500 to 2100 for most. It is drawn again by itself on a date inside them.',
      // A hypothetical point has no file: it is seen from the Earth the planets are
      // computed for, so it has their span and no other.
      noDataHintHyp: 'This date falls outside the years the planets can be computed for, which a hypothetical point shares. It is drawn again by itself on a date inside them.',
      composite: 'Not yet available for composite charts.',
      unavailable: 'Added in another version of the app; not available here.',
      familyHidden: 'Hidden with the rest of your list.',
      advanced: 'An Advanced reading — kept on your list, drawn again once Advanced is on.',
      // Loaded and in range, but the map has no lines for ANY body at the moment —
      // so the row says why rather than reading "drawn" over an empty map. Each
      // names a state of the map, not a fault in the body.
      //
      // "No lines", not "Not drawn": the body is still placed in the natal chart wheel
      // in every one of these states (a line gate takes lines away, never the body), so
      // "not drawn" would be false of the wheel beside the map. The one exception is not
      // a line gate: while an overlay chart takes the wheel, no catalog body is on it.
      undrawn: {
        noChart: 'Drawn once a chart is open.',
        noTime: 'No lines on a chart without a birth time — for this body or any other.',
        angles: 'No lines while Map filters ▸ Angles shows none of ASC, DSC, MC or IC.',
        natalOff: 'No lines while the natal lines are off the map — its lines return with them.',
      },
    },
    cap: 'Up to {max} minor bodies beyond the main five can be drawn at once — switch one off first.',
    listCap: 'Your list holds up to {max} bodies — remove one first.',
    empty: 'Search by name or number, or pick from the featured bodies below.',
    // Under the search box in a downstream build's scope (the open core has none) while
    // nothing is typed: a catalog of thousands has no list to browse, so the Featured
    // groups are not shown under it.
    emptyScope: 'Type a name or number to search.',
    // The end of a page of search results. {n} is exactly what the click adds (the
    // window already holds the next page), never a guess at the total.
    more: 'Show {n} more',
  },
  // A body's class tag, at the right of its name line in the Minor bodies window: on
  // every row of Your list, and on search results — never in the Featured browse, whose
  // headings already say it, and never on the map. Each is the class's shortest plain
  // word ("Main belt", not the heading's singular "Main-belt asteroid"), because the tag
  // shares ONE line with the name (see .mbh-main in MinorBodiesHud.css for the widths it
  // has to fit); the heading and the Help say the rest. Which body gets which is
  // lib/minorBodies/classTags.ts (orbit classes from NASA JPL's Small-Body Database,
  // dwarf-planet status from the IAU). JPL's own codes are never shown.
  tags: {
    dwarf: 'Dwarf planet',
    tno: 'Trans-Neptunian',
    centaur: 'Centaur',
    mainBelt: 'Main belt',
    nearEarth: 'Near-Earth',
    trojan: 'Jupiter Trojan',
    marsCrosser: 'Mars-crosser',
    other: 'Other',
    uranian: 'Uranian',
    otherHyp: 'Hypothetical',
  },
  // Line hover + card.
  card: {
    // "Eros (433)" — every catalog body is shown with its number, which is what
    // tells asteroid 1181 Lilith from Black Moon Lilith.
    name: '{name} ({n})',
    unnamed: '({n})',
    // A hypothetical point is never shown with a number — its key isn't a catalog
    // number, and "(hyp)" is what tells the point Zeus from the asteroid 5731 Zeus.
    hyp: '{name} (hyp)',
    body: '{name} is a minor planet. Its lines read like any body’s, narrowly: its themes colour {essence}, strongest within a degree or so of the line.',
    // card.body's counterpart for a hypothetical point: computed from a set of orbital
    // elements, with no body in the sky behind it. Kept no longer than card.body (136
    // characters against 141, as templates); "strongest within a degree or so" carries
    // the narrow reading card.body spells out.
    hypBody: '{name} is a hypothetical point, computed rather than observed. Its themes colour {essence}, strongest within a degree or so of the line.',
  },
} as const;
