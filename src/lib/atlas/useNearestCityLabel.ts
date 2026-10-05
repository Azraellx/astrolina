// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect, useMemo, useState } from 'react';
import type { GeocodeResult } from './geocode';

export type NearestCity = (
  lat: number,
  lng: number,
  maxKm?: number,
) => GeocodeResult | null;

/**
 * The offline nearest-city lookup itself, once its chunk has loaded: null until then, and
 * not fetched at all until `active`. The cities chunk is loaded lazily on first use (it's the
 * same chunk the pinned reverse-geocoder dynamic-imports, so it's fetched once and shared).
 * Split out of useNearestCityLabel (2026-10-02) for a caller that looks up many points
 * itself — the geodetic grid's hover readout, which runs inside the map's own hover handler
 * rather than on one React point. The setState lives in the import promise callback, never
 * synchronously in the effect body.
 */
export function useNearestCity(active: boolean): NearestCity | null {
  const [nearestCity, setNearestCity] = useState<NearestCity | null>(null);

  useEffect(() => {
    if (!active || nearestCity) return;
    let cancelled = false;
    import('./cityLookup').then((m) => {
      if (!cancelled) setNearestCity(() => m.nearestCity);
    });
    return () => {
      cancelled = true;
    };
  }, [active, nearestCity]);

  return nearestCity;
}

/**
 * Resolve a map point to its nearest "City, Region, Country" label entirely
 * OFFLINE, from the bundled GeoNames cities — used for the live HOVER readout,
 * which must stay instant and never touch the network geocoder. The per-point
 * lookup is a sub-millisecond k-d-tree query memoized on the point.
 *
 * Returns null until the chunk has loaded, or when no city lies within range
 * (the caller falls back to the offline country).
 */
export function useNearestCityLabel(
  point: { lat: number; lng: number } | null,
): string | null {
  const nearestCity = useNearestCity(point !== null);

  return useMemo(
    () =>
      point && nearestCity
        ? (nearestCity(point.lat, point.lng)?.label ?? null)
        : null,
    [point, nearestCity],
  );
}
