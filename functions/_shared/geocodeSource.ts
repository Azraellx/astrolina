// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Server-side geocoding lookups, shared by the Cloudflare Pages Functions
// (functions/api/geocode.ts, reverse-geocode.ts) and the Vite dev middleware
// (vite.config.ts). Lives under functions/_shared so the leading underscore
// keeps it out of Pages routing. Uses only universal fetch APIs (no DOM- or
// Worker-specific globals) so it type-checks under the Node project too.
//
// This module is the single geocoding-provider seam: the rest of the app talks
// to /api/geocode + /api/reverse-geocode and never to a provider directly, so
// swapping or adding a provider later is a change confined to this one file.
//
// Two providers, deliberately: FORWARD search goes to Photon (komoot's OSM
// geocoder), which is built for the debounced search-as-you-type queries the
// location fields fall back to on an offline miss — the public Nominatim
// endpoint's usage policy explicitly forbids that query pattern. REVERSE stays
// on Nominatim: those are single explicit lookups, and its zoom parameter
// pins labels at the town/city granularity this app wants.

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

// Bump whenever the label shape or the choice of results changes. Both geocode
// endpoints cache for a week keyed by the QUERY alone, so a deployed change to
// either would otherwise stay invisible — for up to that week, and only at the
// points nobody had looked up yet — which reads as a fix that didn't work.
export const LABEL_REVISION = '2';

// Public instances by default; both are overridable per deployment (see the
// UA note below for why a deployment would want its own). Pointing these at a
// self-hosted or paid endpoint is a config change, never a code change — which
// also keeps any credential such a provider needs out of this repository.
export const DEFAULT_GEOCODER_BASE = 'https://photon.komoot.io';
export const DEFAULT_REVERSE_GEOCODER_BASE = 'https://nominatim.openstreetmap.org';

const resolveBase = (override: string | undefined, fallback: string): string =>
  (override?.trim() || fallback).replace(/\/+$/, '');

// Both public instances ask for an identifying User-Agent naming the app and a
// real contact, so the operators can reach whoever is responsible about abuse.
// The default below uses the project URL rather than a personal email, so
// nothing private sits in the public source; every real deployment (including
// the canonical one) should set its OWN contact via the GEOCODER_UA environment
// variable (on the Cloudflare Pages project, and locally for dev) so
// rate-limiting or abuse reports reach the actual operator rather than whoever
// publishes this source. Heavy users should self-host or use a paid geocoder —
// GEOCODER_BASE / REVERSE_GEOCODER_BASE point these calls anywhere without a
// code change.
export const DEFAULT_GEOCODER_UA = 'AstroLina/1.0.0 (+https://astrolina.org)';

const resolveUa = (override?: string): string =>
  override?.trim() || DEFAULT_GEOCODER_UA;

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: { name?: string; city?: string; state?: string; country?: string };
}

// "Place, Region, Country" labels, matching the reverse path's shape. The hit's
// OWN name leads: a search for a named feature — a bay, a park, a peak, a hamlet
// — is answered by the thing that was asked for, not by whichever settlement
// happens to contain it. The containing town follows as context when the record
// carries one; the region then drops, since the pair already places the hit and
// a fourth segment only truncates in the narrow popovers this field mounts in.
// Adjacent duplicates collapse (a town's own record names it twice otherwise).
function photonLabel(p: NonNullable<PhotonFeature['properties']>): string {
  const name = p.name?.trim();
  const city = p.city?.trim();
  const region = name && city && name !== city ? undefined : p.state?.trim();
  const parts: string[] = [];
  for (const part of [name, city, region, p.country?.trim()]) {
    if (part && parts[parts.length - 1] !== part) parts.push(part);
  }
  return parts.join(', ');
}

export async function fetchGeocode(
  query: string,
  limit = 6,
  signal?: AbortSignal,
  userAgent?: string,
  base?: string,
): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const params = new URLSearchParams({
    q: trimmed,
    lang: 'en',
    limit: String(Math.min(Math.max(Math.round(limit) || 6, 1), 10)),
  });
  const res = await fetch(
    `${resolveBase(base, DEFAULT_GEOCODER_BASE)}/api?${params.toString()}`,
    { signal, headers: { 'User-Agent': resolveUa(userAgent) } },
  );
  if (!res.ok) throw new Error(`Geocoder error: ${res.status}`);
  const fc = (await res.json()) as { features?: PhotonFeature[] };
  const out: GeocodeResult[] = [];
  // The provider dedupes OSM objects, not labels — distinct objects can still
  // coarsen to one label (central Paris three ways), which reads as a stutter
  // in a suggestion list. First (best-ranked) occurrence wins.
  const seen = new Set<string>();
  for (const f of fc.features ?? []) {
    // GeoJSON coordinate order is [lon, lat].
    const lon = f.geometry?.coordinates?.[0];
    const lat = f.geometry?.coordinates?.[1];
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const label = photonLabel(f.properties ?? {});
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, lat, lng: lon });
  }
  return out;
}

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
  // Adjacent duplicates collapse, as on the forward path: a settlement that
  // shares its name with the province around it reads "Pedernales, Pedernales,
  // Dominican Republic" otherwise.
  const parts: string[] = [];
  for (const part of [place, region, a.country]) {
    const s = part?.trim();
    if (s && parts[parts.length - 1] !== s) parts.push(s);
  }
  return parts.length ? parts.join(', ') : item.display_name;
}

// Reverse: a single lat/lng → "City, Region, Country" label, or null when the
// point has no addressable place (e.g. open ocean — Nominatim returns {error}).
// zoom=12 is the settlement tier: it names the town or village actually standing
// at the point, where the coarser tier answers with whatever district or
// municipality contains it — a remote village then reads as an administrative
// area nobody would recognise as the place they pointed at. Finer than this
// starts breaking cities into their neighbourhoods, which is the opposite
// mistake; the point of this label is the settlement, not the address.
export async function fetchReverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
  userAgent?: string,
  base?: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    zoom: '12',
    lat: String(lat),
    lon: String(lng),
  });
  const res = await fetch(
    `${resolveBase(base, DEFAULT_REVERSE_GEOCODER_BASE)}/reverse?${params.toString()}`,
    { signal, headers: { 'User-Agent': resolveUa(userAgent), 'Accept-Language': 'en' } },
  );
  if (!res.ok) throw new Error(`Reverse geocoder error: ${res.status}`);
  const item = (await res.json()) as NominatimItem & { error?: unknown };
  if (item.error || !item.lat) return null;
  return buildLabel(item);
}
