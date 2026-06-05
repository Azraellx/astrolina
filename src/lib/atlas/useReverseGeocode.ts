// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useState } from 'react';
import { reverseGeocode } from './geocode';

interface Pt {
  lat: number;
  lng: number;
}

// Snap to ~110 m so jittery hover collapses to one lookup + cache entry.
const cellKey = (lat: number, lng: number) =>
  `${lat.toFixed(3)},${lng.toFixed(3)}`;

// Module-level cache: persists across renders and component instances so a cell
// is reverse-geocoded at most once per session (the edge function also caches
// across sessions). Stores null for points with no addressable place.
const cache = new Map<string, string | null>();

/**
 * Reverse-geocode the active map point (a placed pin) to a "City, Region,
 * Country" label, offline-first: the nearest bundled GeoNames city resolves the
 * vast majority of points with no network, and only a miss (open ocean, remote
 * wilderness) falls through to the online provider. The lookup is debounced
 * (~400 ms) and abortable so a live drag-relocation doesn't hammer either path,
 * and results are cached per ~110 m cell (known cells resolve instantly). The
 * label is kept sticky while the point is moving, updating once it settles, so
 * the readout doesn't flicker. Returns null when there is no active point.
 *
 * Every setLabel runs inside the timer/promise callback (never synchronously in
 * the effect body) so it doesn't cascade renders on each tick.
 *
 * `allowNetwork` gates ONLY the online fallback: the offline city lookup always
 * runs, but a miss (open ocean / remote wilderness) only escalates to the network
 * provider when the map is zoomed in far enough that the exact town matters (the
 * caller passes the map's detail-zoom state). At wider zooms a miss resolves to
 * null and is NOT cached, so a later zoomed-in attempt at the same cell can still
 * fetch the precise place.
 */
export function useReverseGeocode(
  point: Pt | null,
  allowNetwork: boolean,
): string | null {
  const [label, setLabel] = useState<string | null>(null);
  const key = point ? cellKey(point.lat, point.lng) : null;

  useEffect(() => {
    if (!key || !point) {
      // No active point — clear once the cursor has actually left (deferred so
      // it isn't a synchronous effect setState, and cancelled on quick re-entry).
      const t = setTimeout(() => setLabel(null), 0);
      return () => clearTimeout(t);
    }
    const cached = cache.has(key);
    const ctrl = new AbortController();
    const timer = setTimeout(
      () => {
        if (cached) {
          setLabel(cache.get(key) ?? null);
          return;
        }
        // Offline-first: try the nearest bundled city (no network); fall back to
        // the online provider only when no city is in range AND we're zoomed in
        // enough for town-level precision to matter.
        import('./cityLookup')
          .then(async ({ nearestCity }) => {
            if (ctrl.signal.aborted) return;
            const hit = nearestCity(point.lat, point.lng);
            if (hit) {
              cache.set(key, hit.label);
              if (!ctrl.signal.aborted) setLabel(hit.label);
              return;
            }
            if (!allowNetwork) {
              // Zoomed out: skip the request and lean on local data. Don't cache —
              // re-runs (this effect depends on allowNetwork) so zooming in later
              // can still resolve the exact place.
              if (!ctrl.signal.aborted) setLabel(null);
              return;
            }
            const name = await reverseGeocode(point.lat, point.lng, ctrl.signal);
            cache.set(key, name);
            if (!ctrl.signal.aborted) setLabel(name);
          })
          .catch(() => {
            /* aborted, chunk-load, or network error — keep the last label */
          });
      },
      cached ? 0 : 400,
    );
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [key, point, allowNetwork]);

  return label;
}
