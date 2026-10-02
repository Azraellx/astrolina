// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Coarse world outline (Natural Earth 1:110m countries, from the bundled `world-atlas` package — the
// SAME set the offline country lookup (countryOf) ships, so it adds no new download) as a GeoJSON
// FeatureCollection of continents + country borders. Used by the Map's OFFLINE basemap fallback
// (offlineStyle / installWorldFallback) when the live OpenFreeMap styles/tiles can't be reached.
//
// Map.tsx DYNAMIC-imports this, so it stays off the start-up path, and warms it once the live
// basemap has drawn (loadWorldOutline / warmWorldOutline there): a connection lost mid-session
// needs it after the network has gone. As a JS chunk it's also covered by the service worker's
// precache, so an offline start resolves it with zero network.
import { feature } from 'topojson-client';
import topo from 'world-atlas/countries-110m.json';

let cached: GeoJSON.FeatureCollection | null = null;

type Ring = GeoJSON.Position[];

// A ring that crosses the antimeridian, made continuous. world-atlas keeps such rings whole, so
// their longitudes jump from +180 to −180 and back mid-ring (Chukotka, Wrangel Island, Fiji's
// Vanua Levu), and a renderer joins those two points the short way across the whole map — a filled
// band with straight edges along 62–72°N on the outline (seen at HEAD and after, 2026-10-01).
// Unwrapped, the ring runs on past ±180 instead; MapLibre's GeoJSON tiler cuts what lies beyond
// and draws it on the other side, where it belongs. Only rings with an EVEN number of jumps: they
// cross and come back. One jump is a ring round a pole (Antarctica's), which closes along the
// map's edge as drawn, and is left alone.
function unwrapRing(ring: Ring): Ring {
  let jumps = 0;
  for (let i = 1; i < ring.length; i++) {
    if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) jumps++;
  }
  if (jumps === 0 || jumps % 2 === 1) return ring;
  let shift = 0;
  return ring.map((p, i) => {
    if (i > 0) {
      const d = p[0] - ring[i - 1][0];
      if (d > 180) shift -= 360;
      else if (d < -180) shift += 360;
    }
    return shift ? [p[0] + shift, ...p.slice(1)] : p;
  });
}

function unwrapGeometry(g: GeoJSON.Geometry): GeoJSON.Geometry {
  if (g.type === 'Polygon') return { ...g, coordinates: g.coordinates.map(unwrapRing) };
  if (g.type === 'MultiPolygon') {
    return { ...g, coordinates: g.coordinates.map((poly) => poly.map(unwrapRing)) };
  }
  return g;
}

/** The countries-110m polygons (continents + borders) as GeoJSON, decoded once and cached. */
export function worldOutline(): GeoJSON.FeatureCollection {
  if (!cached) {
    const fc = feature(
      topo,
      (topo as { objects: { countries: unknown } }).objects.countries,
    ) as unknown as GeoJSON.FeatureCollection;
    cached = {
      ...fc,
      features: fc.features.map((f) =>
        f.geometry ? { ...f, geometry: unwrapGeometry(f.geometry) } : f,
      ),
    };
  }
  return cached;
}
