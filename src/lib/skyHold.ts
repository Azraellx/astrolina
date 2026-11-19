// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// ── THE SKY HOLD ─────────────────────────────────────────────────────────────
// What a geodetic map cannot show (2026-10-02).
//
// The reader is given NO reason (Lina's GE-1, 17 Nov 2026): every held surface says "Not
// available on geodetic maps." and the fix. The reason below was the user-facing one until
// then ("which don't turn with the sky"), and she withdrew it because it was not true of
// every feature it was attached to — it had not been true of parans or Sky Times — and each
// feature is to be reviewed in turn. It stands here as the history of how the list was
// drawn up, not as a claim the app makes; nothing changed in what is held.
//
// One test settled every surface:
// if it reads a zodiacal DEGREE, it works on a geodetic map; if it reads the sky's
// ROTATION, it doesn't. In practice — freeze every planet at its degree and move
// the clock an hour. If the answer changes, the surface needs the sky. A geodetic
// map lays the tropical zodiac on Earth's longitudes once and for all, so nothing
// on it turns, and a surface that reads the turning has nothing to read there.
//
// Held on that test. Each control greys with settings.inert.skyHeld (one sentence,
// reused word for word, naming Calculation as the fix), never disappears, and keeps
// the reader's own choice for when the map is Celestial again:
//   · local space — the view and the expanded sidebar's section;
//   · fixed-star lines, and the star parans with them;
//   · the Vertex axis (Vx/Avx): a geodetic map draws the four angles only;
//   · zenith/nadir points, and the ecliptic curve that goes with them;
//   · night shade;
//   · Slide, which turns the sky by its sidereal time;
//   · the Primary Directions overlay (SKY_HELD_OVERLAYS, lib/astro/timeline);
//   · every tool that declares `needsSiderealTime` (lib/extensions/toolExtensions).
// The angle-frame controls (the transits pair, the progressed Angles) hold at Natal
// angles on the same predicate, with their own sentence, settings.inert.anglesHeld:
// a place's angles come from its coordinates, so there is no moving frame to pick.
//
// Two left the list on 2026-11-16, by Lina's ruling, and are shown on a geodetic map
// exactly as on a celestial one — neither is a reading of the geodetic mapping:
//   · the planets' parans (and the catalog bodies'): one set, the natal chart's In
//     Mundo parans, in every line system — built from the bodies' true sky at the
//     celestial mapping (lib/astro/parans), so the map's line system never reaches them;
//   · the Sky Times band: when each body reaches each angle at a place on a date, which
//     is the same in every line system. A geodetic map shows it with a one-line note
//     saying it is not connected to the geodetic angles (skyTimes.geodeticNote).
//
// It takes the EFFECTIVE line system — App.tsx's derived `lineSystem`, never the
// stored preference. A geodetic choice that something else masks to Celestial (a
// sidereal zodiac, the review hold) draws a celestial map, and holding sky features
// over it would grey controls on a map that can show them. Guards read the derived
// value; nothing here writes a preference.
//
// Not GEODETIC_HELD (lib/geodeticHold, the mapping under review), and not a
// downstream build's TIMING_GEODETIC_HELD. Two holds are two holds, and this is a
// third. Those are switches waiting on work, each lifted when its work is done;
// this is a property of the mapping, true exactly as long as the map is geodetic.
// So it has no flag and no release event, and nothing persists or freezes it: it
// ends when the reader switches the line system back, and everything it held is
// there as they left it.
import type { LineSystem } from './ephemeris';

/** Whether the surfaces that read the sky's turning are held: true exactly on a
 *  geodetic map. Pass the EFFECTIVE line system (see the header). */
export function skyHeldFor(lineSystem: LineSystem): boolean {
  return lineSystem === 'geodetic';
}
