// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useState } from 'react';
import { buildGeoAscZones, geoAscZones, type GeoAscZones } from './geodeticGrid';

// A slice of the build where the browser hasn't said how idle it is: a forced idle callback
// (its timeout ran out) and the timeout fallback. Short enough to leave a frame its time.
const SLICE_MS = 8;

/**
 * The geodetic grid's Ascendant zones (the hover highlight), built in idle-time slices the
 * first time `active` is true, and null until they are done — the highlight simply starts
 * once they are. Built once per page: every later caller gets the finished zones at once.
 * The setState lives in the scheduled callback, never synchronously in the effect body.
 * (2026-10-02)
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
export function useGeoAscZones(active: boolean): GeoAscZones | null {
  const [zones, setZones] = useState<GeoAscZones | null>(geoAscZones);

  useEffect(() => {
    if (!active || zones) return;
    const idle = typeof window.requestIdleCallback === 'function';
    let handle = 0;
    const run = (deadline?: IdleDeadline) => {
      const budget = deadline && !deadline.didTimeout ? Math.max(1, deadline.timeRemaining()) : SLICE_MS;
      const built = buildGeoAscZones(budget);
      if (built) setZones(built);
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
  }, [active, zones]);

  return zones;
}
