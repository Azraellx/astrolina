// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useState } from 'react';
import { EPS_J2000 } from '../ephemeris';
import { buildGeoAscZones, geoAscZones, type GeoAscZones } from './geodeticGrid';

// A slice of the build where the browser hasn't said how idle it is: a forced idle callback
// (its timeout ran out) and the timeout fallback. Short enough to leave a frame its time.
const SLICE_MS = 8;

/**
 * The geodetic grid's Ascendant zones (the hover highlight) at the map's one tilt `eps`, built
 * in idle-time slices while `active` is true, and null until they are done — the highlight
 * simply starts once they are. Built once per tilt: a later caller at an ε already built gets
 * the finished zones at once. The setState lives in the scheduled callback, never
 * synchronously in the effect body. (2026-10-02)
 *
 * A new ε restarts the build (2026-10-20). The zones are the readout's, and the readout is
 * read at the chart's obliquity of date, or J2000 with no chart (Lina, 20 Oct 2026, §2) — so
 * opening a chart of another date drops the previous tilt's zones at once rather than lighting
 * a zone the readout beside it disagrees with, and the highlight comes back about a second
 * later, once the new set is built. `active` is the caller's to narrow: App passes it only
 * while the Ascendant curves are drawn, so no build runs for a highlight that can't show.
 *
 * An idle slice takes all the time the browser offers (timeRemaining, which it caps at 50 ms
 * when nothing else is waiting), where a cap at 8 ms made the build wait out some 45 idle
 * callbacks. Measured in Chrome, the first highlight now comes 1.0–1.2 s after the grid on a
 * desktop (1.2–2.0 s before) and 4.3–4.7 s at a 4× CPU slowdown (4.9 s): what remains is the
 * map's own start-up keeping the thread busy, which is what waiting for idle time is for.
 * Where requestIdleCallback is missing (Safari), a zero timeout stands in for it — the
 * browser stretches a chain of them to about 4 ms apart, room for input and a frame between
 * 8 ms slices, where a 50 ms wait made the gaps six times the work. (2026-10-02)
 */
export function useGeoAscZones(active: boolean, eps: number = EPS_J2000): GeoAscZones | null {
  // The set last built here, with the tilt it is for. Shown only while that is still the
  // tilt asked for; otherwise whatever the module already holds for the new one, if anything.
  const [built, setBuilt] = useState<{ eps: number; zones: GeoAscZones } | null>(() => {
    const z = geoAscZones(eps);
    return z ? { eps, zones: z } : null;
  });
  const zones = built && built.eps === eps ? built.zones : geoAscZones(eps);

  useEffect(() => {
    if (!active || zones) return;
    const idle = typeof window.requestIdleCallback === 'function';
    let handle = 0;
    const run = (deadline?: IdleDeadline) => {
      const budget = deadline && !deadline.didTimeout ? Math.max(1, deadline.timeRemaining()) : SLICE_MS;
      const done = buildGeoAscZones(eps, budget);
      if (done) setBuilt({ eps, zones: done });
      else schedule();
    };
    const schedule = () => {
      handle = idle ? window.requestIdleCallback(run, { timeout: 1000 }) : window.setTimeout(run, 0);
    };
    schedule();
    return () => {
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [active, eps, zones]);

  return zones;
}
