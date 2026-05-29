// Server-side Nominatim lookup, shared by the Cloudflare Pages Function
// (functions/api/geocode.ts) and the Vite dev middleware (vite.config.ts).
// Lives under functions/_shared so the leading underscore keeps it out of
// Pages routing. Uses only universal fetch APIs (no DOM- or Worker-specific
// globals) so it type-checks under the Node project too.

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

// Nominatim's usage policy requires an identifying User-Agent with contact
// info. Update the contact before any heavy/production traffic.
export const GEOCODER_UA = 'Astrocartography/1.0 (sgrosso@bell.net)';

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
    headers: { 'User-Agent': GEOCODER_UA, 'Accept-Language': 'en' },
  });
  if (!res.ok) throw new Error(`Geocoder error: ${res.status}`);
  const json = (await res.json()) as NominatimItem[];
  return json.map((item) => ({
    label: buildLabel(item),
    lat: Number.parseFloat(item.lat),
    lng: Number.parseFloat(item.lon),
  }));
}
