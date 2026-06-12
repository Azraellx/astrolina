// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Solar & lunar returns: the instant a transiting luminary comes back to its
// exact natal ecliptic longitude. The timeline's "Returns" snap sets the transit
// overlay's target date to this instant; framed by the moment's own sidereal
// time ('transit-moment' positioning) the resulting map IS the return chart's
// astrocartography — the classic relocated solar-return technique.
import {
  birthDataToJD,
  bodyLonSpeed,
  type PlanetName,
} from '../ephemeris';
import type { StoredChart } from '../chartLibrary';
import { compositeBodyLon } from './composite';
import { epochMsToJD, jdToEpochMs, normalizeAngle } from './timeline';

export type ReturnBody = 'solar' | 'lunar';

const RETURN_PLANET: Record<ReturnBody, PlanetName> = {
  solar: 'Sun',
  lunar: 'Moon',
};

// Mean revolution period (days) — only the seed for hopping to the previous/
// next return; the Newton refinement does the precision work. (Lunar returns
// recur per TROPICAL month: a return to a longitude, not to a fixed star.)
const RETURN_PERIOD_DAYS: Record<ReturnBody, number> = {
  solar: 365.2422,
  lunar: 27.321582,
};

const DEG2RAD = Math.PI / 180;
// 1e-9 rad of solar longitude ≈ 5 ms of time — far below the timeline's
// minute-level display resolution, cheap to reach (Newton doubles digits/step).
const TOL_RAD = 1e-9;
const MAX_ITERS = 20;
const ONE_SECOND_DAYS = 1 / 86_400;

// Newton-iterate on f(jd) = wrap(lon(jd) − natalLon). The body's instantaneous
// speed (straight from Swiss) is f′; the luminaries never retrograde, so f is
// monotonic between returns and the iteration converges to the crossing nearest
// the seed (the wrapped error never sends it more than half a revolution away).
function refineReturn(
  planet: PlanetName,
  natalLon: number,
  seedJD: number,
): number | null {
  let jd = seedJD;
  for (let i = 0; i < MAX_ITERS; i++) {
    const s = bodyLonSpeed(jd, planet);
    if (!s || s.speed <= 0) return null; // off the ephemeris range
    const err = normalizeAngle(s.lon - natalLon);
    if (Math.abs(err) < TOL_RAD) return jd;
    jd -= err / (s.speed * DEG2RAD); // rad ÷ rad/day = days
  }
  return null;
}

export interface ReturnInstant {
  jd: number;
  ms: number; // epoch ms UTC — the timeline's targetDate unit
}

/** The chart's solar/lunar return nearest `nearMs` (dir 0), or the first one
 *  strictly after (+1) / before (−1) that moment. Null when the date falls off
 *  the ephemeris range (the luminaries' Moshier fallback makes that rare). */
export function findReturn(
  chart: StoredChart,
  body: ReturnBody,
  nearMs: number,
  dir: -1 | 0 | 1 = 0,
): ReturnInstant | null {
  const planet = RETURN_PLANET[body];
  // A composite chart's reference is its midpoint Sun/Moon, so the snap finds
  // the transiting luminary back on the COMPOSITE point (its stored moment is
  // only the sidereal-frame anchor, not a sky to return to).
  const natalLon = chart.composite
    ? compositeBodyLon(chart.composite, planet, 'mean')
    : bodyLonSpeed(birthDataToJD(chart), planet)?.lon ?? null;
  if (natalLon === null) return null;
  const nearJD = epochMsToJD(nearMs);
  let jd = refineReturn(planet, natalLon, nearJD);
  if (jd === null) return null;
  // The refinement lands on the return nearest the seed; when the caller wants
  // the strictly-previous/next one, hop a whole period and refine again. The
  // one-second slack keeps a repeated press from re-finding the same instant.
  const period = RETURN_PERIOD_DAYS[body];
  if (dir === 1 && jd <= nearJD + ONE_SECOND_DAYS) {
    jd = refineReturn(planet, natalLon, jd + period);
  } else if (dir === -1 && jd >= nearJD - ONE_SECOND_DAYS) {
    jd = refineReturn(planet, natalLon, jd - period);
  }
  return jd === null ? null : { jd, ms: jdToEpochMs(jd) };
}
