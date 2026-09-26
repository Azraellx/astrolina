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
    scopeBundled: 'Bundled',
    scopeAria: 'Search scope',
    // The family switch, on the row under the search box. Named for what turning it
    // ON does — off by default, so the switch reads "not hiding" until the reader
    // asks — and its label never flips with the state: one constant name plus
    // aria-checked, where a flipping label read to a screen reader as two answers to
    // one question.
    //
    // "Your list", not "catalog", wherever it names the set: in a build that
    // registers a hosted source, "Catalog" is that source's chip — one tier of what
    // this switch covers — and a reader holding only bundled bodies would read
    // "catalog bodies" as a product they don't have. Every body this switch reaches
    // is on the reader's list (switching one on puts it there), so the list names
    // exactly the set, in both builds.
    hideAll: {
      label: 'Hide all',
      // The short label can't say "all of WHAT", so the accessible name does — it
      // still starts with the visible words, so speaking the label finds it.
      aria: 'Hide all bodies on your list',
      // Says the main asteroids are exempt: they sit just below the switch, and
      // "all" would otherwise read as including them.
      hint: 'Hide every body on your list at once and keep your selection. The five main asteroids keep their own switches.',
      // At the top of the list while the switch is on — naming the switch, since
      // the list may sit in its own column away from it.
      hiddenNote: 'Every body on your list is hidden, and your selection is kept. Turn off Hide all to show them again.',
    },
    sections: {
      builtin: 'Main asteroids',
      yours: 'Your list',
      bundled: 'Bundled with the app',
      results: 'Results',
    },
    groups: {
      dwarf: 'Dwarf planets & trans-Neptunian',
      centaur: 'Centaurs',
      mainBelt: 'Main belt',
      nearEarth: 'Near-Earth',
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
      added: 'On your list',
    },
    // A search hit that is really one of the built-in bodies: pointed at its own
    // row, never offered as a second copy.
    builtinHit: {
      minor: '{name} — under Main asteroids above',
      planet: '{name} — under Planets in Map filters',
    },
    status: {
      loading: 'Loading…',
      offline: 'Needs a connection the first time — it loads by itself once you’re back online.',
      missing: 'Its ephemeris file couldn’t be found.',
      content: 'Its ephemeris file couldn’t be read.',
      // Not one span for every body: most short files run about 1500–2100, a few
      // near-Earth files start later, and Pholus is read from the main-asteroid file
      // (1800–2399) — so the sentence names the common span, not a promise.
      noData: 'No ephemeris for this chart’s date — it falls outside the years this body’s file covers (about 1500 to 2100 for most).',
      composite: 'Not yet available for composite charts.',
      unavailable: 'Added in another version of the app; not available here.',
      familyHidden: 'Hidden with the rest of your list.',
      advanced: 'An Advanced reading — kept on your list, drawn again once Advanced is on.',
      // Loaded and in range, but the map has no lines for ANY body at the moment —
      // so the row says why rather than reading "drawn" over an empty map. Each
      // names a state of the map, not a fault in the body.
      undrawn: {
        noChart: 'Drawn once a chart is open.',
        noTime: 'No lines on a chart without a birth time — for this body or any other.',
        angles: 'Not drawn while Map filters ▸ Angles shows none of ASC, DSC, MC or IC.',
        natalOff: 'Not drawn while the natal lines are off the map — it returns with them.',
      },
    },
    cap: 'Up to {max} minor bodies beyond the main five can be drawn at once — switch one off first.',
    listCap: 'Your list holds up to {max} bodies — remove one first.',
    empty: 'Search by name or number, or pick from the bodies bundled with the app below.',
    // The end of a page of search results. {n} is exactly what the click adds (the
    // window already holds the next page), never a guess at the total.
    more: 'Show {n} more',
  },
  // Line hover + card.
  card: {
    // "Eros (433)" — every catalog body is shown with its number, which is what
    // tells asteroid 1181 Lilith from Black Moon Lilith.
    name: '{name} ({n})',
    unnamed: '({n})',
    body: '{name} is a minor planet. Its lines read like any body’s, narrowly: its themes colour {essence}, strongest within a degree or so of the line.',
  },
} as const;
