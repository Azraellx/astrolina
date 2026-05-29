export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

export async function geocode(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const url = `${ENDPOINT}?format=json&limit=6&q=${encodeURIComponent(trimmed)}`;
  const res = await fetch(url, {
    signal,
    headers: { 'Accept-Language': 'en' },
  });
  if (!res.ok) throw new Error(`Geocoder error: ${res.status}`);
  const json = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
  }>;
  return json.map((item) => ({
    label: item.display_name,
    lat: Number.parseFloat(item.lat),
    lng: Number.parseFloat(item.lon),
  }));
}
