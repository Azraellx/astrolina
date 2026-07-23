// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Dev-server stand-ins for the geocoding Pages Functions. `vite` runs no
// Functions, so without these a dev server answers /api/* with the SPA's HTML
// and a 200 — which fails as a JSON parse error rather than an honest 502, and
// reads as a broken feature that works fine in production.
//
// These are bare request handlers, deliberately carrying no Vite or Node types:
// each build wraps them in a plugin of its OWN. A downstream build installs its
// own copy of vite, and a `Plugin` handed across that boundary is a different
// type to the compiler even at identical versions — so the shared thing has to
// be the logic, not the plugin. The parameter types below are the minimum each
// handler touches, which a real IncomingMessage/ServerResponse satisfies.

import { fetchGeocode, fetchReverseGeocode } from './geocodeSource';

interface DevRequest {
  url?: string;
}

interface DevResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body: string): void;
}

const send = (res: DevResponse, body: unknown, status?: number): void => {
  if (status) res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
};

/** The deployment's geocoder settings, as the edge functions read them from the
 *  environment — passed in so this module needs no notion of where they live. */
export interface DevGeocoderEnv {
  userAgent?: string;
  base?: string;
}

/** GET /api/geocode?q=…&limit=… — mirrors functions/api/geocode.ts. */
export async function handleDevGeocode(
  req: DevRequest,
  res: DevResponse,
  env: DevGeocoderEnv = {},
): Promise<void> {
  try {
    const url = new URL(req.url ?? '', 'http://localhost');
    const q = url.searchParams.get('q') ?? '';
    const limit = Number(url.searchParams.get('limit') ?? '6');
    send(
      res,
      q.trim().length < 2 ? [] : await fetchGeocode(q, limit, undefined, env.userAgent, env.base),
    );
  } catch {
    send(res, { error: 'geocode_failed' }, 502);
  }
}

/** GET /api/reverse-geocode?lat=…&lng=… — mirrors functions/api/reverse-geocode.ts. */
export async function handleDevReverseGeocode(
  req: DevRequest,
  res: DevResponse,
  env: DevGeocoderEnv = {},
): Promise<void> {
  try {
    const url = new URL(req.url ?? '', 'http://localhost');
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    const label =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? await fetchReverseGeocode(lat, lng, undefined, env.userAgent, env.base)
        : null;
    send(res, { label });
  } catch {
    send(res, { error: 'reverse_geocode_failed' }, 502);
  }
}
