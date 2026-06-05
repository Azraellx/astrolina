// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

// Calls our own edge function (functions/api/geocode.ts), which proxies and
// caches Nominatim with a policy-compliant User-Agent. In dev the same path is
// served by a Vite middleware (see vite.config.ts).
export async function geocode(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const res = await fetch(
    `/api/geocode?q=${encodeURIComponent(trimmed)}&limit=6`,
    { signal },
  );
  if (!res.ok) throw new Error(`Geocoder error: ${res.status}`);
  return (await res.json()) as GeocodeResult[];
}

// Reverse-geocodes a map coordinate to a "City, Region, Country" label via our
// edge function (functions/api/reverse-geocode.ts). Coordinates are rounded to
// ~110 m to match the server cache key. Returns null when the point has no
// addressable place (e.g. open ocean).
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(
    `/api/reverse-geocode?lat=${lat.toFixed(3)}&lng=${lng.toFixed(3)}`,
    { signal },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { label?: string | null };
  return data.label ?? null;
}
