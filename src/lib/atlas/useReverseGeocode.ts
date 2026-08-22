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

// How long the point must sit still before we spend anything on it — the offline
// lookup on a cold cell, and the network call in every case.
const SETTLE_MS = 400;

// A resolved cell. `precise` records WHICH resolver answered, because the two
// disagree in a way the label itself never reveals: the offline atlas returns the
// nearest city CENTROID, so a house closer to a neighbour's centre than to its own
// town's is labelled with the neighbour; the online provider answers by BOUNDARY
// containment and names the place you are actually standing in. An imprecise cell
// is a provisional answer, and stays eligible for exactly one upgrade.
interface Cell {
  label: string | null;
  precise: boolean;
}

// Module-level cache: persists across renders and component instances so a cell is
// resolved at most once per session (the edge function also caches across
// sessions). Stores null for points with no addressable place.
const cache = new Map<string, Cell>();

/**
 * Reverse-geocode the active map point (a placed pin) to a "City, Region,
 * Country" label, offline-first: the nearest bundled GeoNames city answers
 * instantly with no network, and — once the map is zoomed in far enough that the
 * difference between two adjacent towns is legible — the online provider is asked
 * to confirm it. The lookup is debounced (~400 ms) and abortable so a live
 * drag-relocation doesn't hammer either path, and results are cached per ~110 m
 * cell (known cells resolve instantly). The label is kept sticky while the point
 * is moving, updating once it settles, so the readout doesn't flicker. Returns
 * null when there is no active point.
 *
 * Every setLabel runs inside the timer/promise callback (never synchronously in
 * the effect body) so it doesn't cascade renders on each tick.
 *
 * `allowNetwork` gates the online provider; the caller passes the map's
 * detail-zoom state. Zoomed out, the offline answer stands and nothing is spent —
 * at a continental zoom the two resolvers are naming the same dot. Zoomed in, the
 * offline answer is still shown FIRST and then refined, because nearest-centroid
 * mislabels precisely the case a zoomed-in user is looking at: one specific house,
 * which is usually not at the centre of its own town and is often nearer the
 * middle of the next one.
 *
 * This used to treat an offline hit as final, which made the accurate resolver
 * unreachable anywhere on land — `allowNetwork` only ever gated the no-city-in-
 * range fallback, so the one control that looked like a precision setting could
 * not affect any inhabited point. It also left the live readout able to disagree
 * with the name the same coordinate is given when it is SAVED (savedPins'
 * resolvePrecisePlace, which has always escalated unconditionally): one map, one
 * spot, two different city names.
 *
 * A cell refines at most once, and only a real answer displaces the provisional
 * one — a null from the provider is it disclaiming the point, not evidence
 * against a city the atlas is confident about. Aborted / offline / failed leaves
 * the cell imprecise so a later visit can try again.
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
    const ctrl = new AbortController();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const show = (v: string | null) => {
      if (!ctrl.signal.aborted) setLabel(v);
    };

    // Upgrade a nearest-centroid label to the boundary-accurate one. `delayMs` is
    // 0 on the cold path — the point has already sat still through SETTLE_MS
    // waiting for the offline lookup — and a full settle behind a cache hit, which
    // showed its label at once; without that, dragging a pin across already-known
    // cells would fire a request for every cell crossed.
    const refine = (delayMs: number) => {
      if (ctrl.signal.aborted) return;
      timers.push(
        setTimeout(() => {
          reverseGeocode(point.lat, point.lng, ctrl.signal)
            .then((name) => {
              if (name == null) return; // see the docstring: a disclaimer, not a correction
              cache.set(key, { label: name, precise: true });
              show(name);
            })
            .catch(() => {
              /* aborted / offline / failed — the provisional label stands, and the
                 cell stays imprecise so a later visit retries */
            });
        }, delayMs),
      );
    };

    const cached = cache.get(key);
    timers.push(
      setTimeout(
        () => {
          if (cached) {
            show(cached.label);
            if (!cached.precise && allowNetwork) refine(SETTLE_MS);
            return;
          }
          import('./cityLookup')
            .then(async ({ nearestCity }) => {
              if (ctrl.signal.aborted) return;
              const hit = nearestCity(point.lat, point.lng);
              if (hit) {
                cache.set(key, { label: hit.label, precise: false });
                show(hit.label);
                if (allowNetwork) refine(0);
                return;
              }
              if (!allowNetwork) {
                // Zoomed out with nothing local to say: skip the request and lean on
                // the caller's country fallback. Don't cache — this effect re-runs on
                // allowNetwork, so zooming in later can still resolve the exact place.
                show(null);
                return;
              }
              // No city in range makes the provider authoritative, null included:
              // out here "no addressable place" IS the answer (open ocean), not a
              // disagreement with an atlas that had nothing to say either.
              const name = await reverseGeocode(point.lat, point.lng, ctrl.signal);
              cache.set(key, { label: name, precise: true });
              show(name);
            })
            .catch(() => {
              /* aborted, chunk-load, or network error — keep the last label */
            });
        },
        cached ? 0 : SETTLE_MS,
      ),
    );

    return () => {
      for (const t of timers) clearTimeout(t);
      ctrl.abort();
    };
  }, [key, point, allowNetwork]);

  return label;
}
