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
