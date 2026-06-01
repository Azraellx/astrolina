import { useEffect, useMemo, useState } from 'react';
import type { GeocodeResult } from './geocode';

type NearestCity = (
  lat: number,
  lng: number,
  maxKm?: number,
) => GeocodeResult | null;

/**
 * Resolve a map point to its nearest "City, Region, Country" label entirely
 * OFFLINE, from the bundled GeoNames cities — used for the live HOVER readout,
 * which must stay instant and never touch the network geocoder. The cities chunk
 * is loaded lazily on first use (it's the same chunk the pinned reverse-geocoder
 * dynamic-imports, so it's fetched once and shared), and the per-point lookup is
 * a sub-millisecond k-d-tree query memoized on the point.
 *
 * Returns null until the chunk has loaded, or when no city lies within range
 * (the caller falls back to the offline country). The setState lives in the
 * import promise callback, never synchronously in the effect body.
 */
export function useNearestCityLabel(
  point: { lat: number; lng: number } | null,
): string | null {
  const [nearestCity, setNearestCity] = useState<NearestCity | null>(null);
  const active = point !== null;

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

  return useMemo(
    () =>
      point && nearestCity
        ? (nearestCity(point.lat, point.lng)?.label ?? null)
        : null,
    [point, nearestCity],
  );
}
