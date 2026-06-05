// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Server-side Nominatim lookup, shared by the Cloudflare Pages Function
// (functions/api/geocode.ts) and the Vite dev middleware (vite.config.ts).
// Lives under functions/_shared so the leading underscore keeps it out of
// Pages routing. Uses only universal fetch APIs (no DOM- or Worker-specific
// globals) so it type-checks under the Node project too.
//
// This module is the single geocoding-provider seam: the rest of the app talks
// to /api/geocode + /api/reverse-geocode and never to a provider directly, so
// swapping or adding a provider later is a change confined to this one file.

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

// Nominatim's usage policy requires an identifying User-Agent naming the app and
// a real contact, so OSM can reach the operator about abuse. The default below
// uses the project URL rather than a personal email, so nothing private sits in
// the public source; every real deployment (including the canonical one) should
// set its OWN contact via the GEOCODER_UA environment variable (on the Cloudflare
// Pages project, and locally for dev) so rate-limiting or abuse reports reach the
// actual operator. Heavy users should self-host Nominatim or use a paid geocoder.
export const DEFAULT_GEOCODER_UA = 'AstroLina/1.0.0 (+https://astrolina.org)';

const resolveUa = (override?: string): string =>
  override?.trim() || DEFAULT_GEOCODER_UA;

interface NominatimItem {
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string | undefined>;
}

// Build a concise "City, Region, Country" label from the structured address,
// instead of Nominatim's long display_name (which includes noise like
// "Golden Horseshoe" for Toronto).
function buildLabel(item: NominatimItem): string {
  const a = item.address;
  if (!a) return item.display_name;
  const place =
    a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality ??
    a.suburb ?? a.county ?? a.state_district;
  const region = a.state ?? a.region;
  const parts = [place, region, a.country].filter(Boolean);
  return parts.length ? parts.join(', ') : item.display_name;
}

export async function fetchGeocode(
  query: string,
  limit = 6,
  signal?: AbortSignal,
  userAgent?: string,
): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    dedupe: '1',
    limit: String(Math.min(Math.max(Math.round(limit) || 6, 1), 10)),
    q: trimmed,
  });
  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    signal,
    headers: { 'User-Agent': resolveUa(userAgent), 'Accept-Language': 'en' },
  });
  if (!res.ok) throw new Error(`Geocoder error: ${res.status}`);
  const json = (await res.json()) as NominatimItem[];
  return json.map((item) => ({
    label: buildLabel(item),
    lat: Number.parseFloat(item.lat),
    lng: Number.parseFloat(item.lon),
  }));
}

const REVERSE_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';

// Reverse: a single lat/lng → "City, Region, Country" label, or null when the
// point has no addressable place (e.g. open ocean — Nominatim returns {error}).
// zoom=10 keeps the result at town/city granularity rather than a building.
export async function fetchReverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
  userAgent?: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '10',
    lat: String(lat),
    lon: String(lng),
  });
  const res = await fetch(`${REVERSE_ENDPOINT}?${params.toString()}`, {
    signal,
    headers: { 'User-Agent': resolveUa(userAgent), 'Accept-Language': 'en' },
  });
  if (!res.ok) throw new Error(`Reverse geocoder error: ${res.status}`);
  const item = (await res.json()) as NominatimItem & { error?: unknown };
  if (item.error || !item.lat) return null;
  return buildLabel(item);
}
