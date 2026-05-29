// Cloudflare Pages Function — GET /api/geocode?q=…&limit=…
//
// Proxies Nominatim from the edge with a policy-compliant User-Agent and
// caches results for a week, so the browser never hits the public endpoint
// directly (avoids rate-limiting/blocking at scale and removes CORS).
//
// Note: not part of any tsconfig project, so the Cloudflare runtime globals
// below (`caches`, the event context) are intentionally untyped here.

import { fetchGeocode } from '../_shared/geocodeSource';

declare const caches: {
  default: {
    match(req: Request): Promise<Response | undefined>;
    put(req: Request, resp: Response): Promise<void>;
  };
};

interface EventContext {
  request: Request;
  waitUntil: (promise: Promise<unknown>) => void;
}

const WEEK = 60 * 60 * 24 * 7;

export const onRequestGet = async (
  context: EventContext,
): Promise<Response> => {
  const url = new URL(context.request.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const limit = Number(url.searchParams.get('limit') ?? '6');
  if (q.length < 2) return Response.json([]);

  // Normalize the cache key so "?q=paris" and "?q=paris&limit=6" share an entry.
  const cacheKey = new Request(
    `${url.origin}/api/geocode?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  try {
    const results = await fetchGeocode(q, limit);
    const resp = Response.json(results, {
      headers: { 'cache-control': `public, max-age=${WEEK}` },
    });
    context.waitUntil(caches.default.put(cacheKey, resp.clone()));
    return resp;
  } catch {
    return Response.json({ error: 'geocode_failed' }, { status: 502 });
  }
};
