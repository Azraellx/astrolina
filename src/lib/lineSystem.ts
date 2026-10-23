// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The line system ON SCREEN, from the three things that decide it: the stored choice, the
// zodiac, and Advanced, which is what lets a sidereal zodiac take effect at all.
//
// App's derived `lineSystem` is exactly this, and the reasoning for the mask is there: a
// Geodetic choice is MASKED to Celestial while the mapping is held under review
// (lib/geodeticHold) or while a sidereal zodiac is in force (the geodetic mapping is the
// tropical zodiac laid on Earth's longitudes, with no sidereal variant). Masked, never
// rewritten, so the choice is still there when the condition ends (CLAUDE.md rule 2).
//
// It was a module-private function in App.tsx until 2026-10-20, where it sat outside the
// component so that a setter about to change one of the three inputs could ask what the line
// system was ABOUT to become, and act on the change as the event it is rather than an effect
// chasing it afterwards. It moved here so that a document can derive the same mask over its
// OWN stored line system: a report records the line system it was made in, and when that
// record says Geodetic on a device where the hold is up, the report has to draw what the map
// would draw from the same choice. One derivation, so the two cannot disagree about which
// conditions mask Geodetic. (F2 of the 20 Oct geodetic build.)
import type { ZodiacMode } from './astro/ayanamsa';
import type { LineSystem } from './ephemeris';
import { GEODETIC_HELD } from './geodeticHold';

/** WHY a Geodetic choice can't draw, in the order a greyed control names it: the review
 *  hold first, since it has no setting to change, then the sidereal zodiac, which does
 *  (`settings.inert.geodeticHeld` / `settings.inert.geodeticSidereal`). */
export type GeodeticMask = 'held' | 'sidereal';

/** Which condition masks a Geodetic choice right now, or null when nothing does.
 *
 *  `held` defaults to the hold as this device resolved it at load (GEODETIC_HELD), which is
 *  what every live caller wants. It is a parameter so a suite can drive both sides of the
 *  hold without reloading. */
export function geodeticMaskFor(
  zodiac: ZodiacMode,
  advanced: boolean,
  held: boolean = GEODETIC_HELD,
): GeodeticMask | null {
  if (held) return 'held';
  // Advanced decides whether a stored sidereal zodiac takes effect: with it off the zodiac
  // on screen is tropical whatever was stored (App's effZodiacMode).
  const effZodiac = advanced ? zodiac : 'tropical';
  return effZodiac !== 'tropical' ? 'sidereal' : null;
}

/** The EFFECTIVE line system: the stored choice, with Geodetic masked to Celestial while
 *  either condition above holds. Pass the stored PREFERENCE; consumers and guards then read
 *  what this returns, never the preference. */
export function effectiveLineSystem(
  pref: LineSystem,
  zodiac: ZodiacMode,
  advanced: boolean,
  held: boolean = GEODETIC_HELD,
): LineSystem {
  return pref === 'geodetic' && geodeticMaskFor(zodiac, advanced, held) !== null
    ? 'celestial'
    : pref;
}
