// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// ── THE SWITCH ───────────────────────────────────────────────────────────────
// The GEODETIC line system (labelled Mundane until 2026-10-02) was held (2026-08-27)
// while discrepancies in how it drew were worked through. Nothing was deleted or
// stubbed: the generators, the settings control, the strings and the docs all stayed
// compiled, and this one boolean was the whole of the hold.
//
// LIFTED 2026-10-23, for the public launch, together with what it held (below). It was
// lifted once before, on 2026-10-21, and put back on 2026-10-22; nothing was written on
// anyone's device either way. The per-device unlock (`astro:geodetic-unlock:v1`) and its
// console command went with it: a '1' left on a tester's device is read by nothing now.
//
// The flag stays exported, a plain `false`, so every consumer below still derives from it
// and simply folds to its unlocked branch. Folding those branches away (the held strings,
// the `held` parameters, the Help conditionals) is a tidy-up for later, not part of the
// lift: the downstream build's docs/hidden-features.md (H5) lists them.
//
// What false restores:
//   · the Geodetic half of Calculation ▸ Line system goes live instead of dimmed,
//   · a stored 'geodetic' preference stops being masked and draws again,
//   · the Help article drops its "under review" note,
//   · event charts (2026-10-20): the chart form's Person | Event switch with Find…, the
//     chart menu's Events and People sections, My Charts' Events chip and event marks,
//     and a stored `kind: 'event'` shown as the event it is (lib/eventCharts
//     presentedKind) — for a reader on the ADV rung (App's `eventsLocked`, lib/plan),
//     which they also need once the hold is gone,
//   · "No chart · the sky alone" — the menu's row, its key 0 and the state itself; a
//     stored pick (NO_CHART_ID) stops reading as the first chart (resolveSelection).
// Every one of those derives from this flag and writes nothing, so a held device keeps any
// event chart or sentinel it was handed (a sync, an import) exactly as stored.
//
// NOTHING IS WRITTEN. A reader who had Geodetic selected keeps it in
// `astro:line-system:v1`; the derived `lineSystem` in App.tsx simply masks it to
// celestial for as long as the hold lasts. The hold is a standing state, not an
// event, so it derives rather than rewrites — and when it ends, their choice is
// still there. (This is the rule the whole forced-settings discipline turns on; see
// vendor/core/docs/forced-settings.md.)
//
// WHY IT LIVES IN THE CORE. The setting, the derivation and the control are all
// here, and so is the code being reviewed — the open core draws the same geodetic
// map from the same generators. Holding it downstream only would leave the fault
// reachable in the build that carries it.

/** True while the geodetic mapping is withheld. Lifted 2026-10-23 (above). */
export const GEODETIC_HELD: boolean = false;
