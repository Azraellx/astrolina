// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { feature } from 'topojson-client';
import topo from 'world-atlas/countries-110m.json';

// Offline lat/lng → country NAME via point-in-polygon against a simplified
// (Natural Earth 1:110m) world-countries set, bundled from the world-atlas npm
// package (~105 KB, which already carries country names). Used to label the
// HOVERED map point with its country in real time, with no network — the full
// "City, Region, Country" still comes from the reverse-geocoder, but only when a
// pin is placed. Coastlines are generalized at 110m, so a point right on a
// built-up shoreline can read as null or land just across a border; that's fine
// for a country label. ~0.01 ms per lookup, safe to call on every hover tick.

interface Country {
  name: string;
  // [polygon][ring][point]; ring[0] is the outer ring, the rest are holes; each
  // point is [lng, lat].
  polys: number[][][][];
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

let countries: Country[] | null = null;

function build(): Country[] {
  const fc = feature(
    topo,
    (topo as { objects: { countries: unknown } }).objects.countries,
  );
  const out: Country[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    let polys: number[][][][];
    if (g && g.type === 'Polygon') {
      polys = [g.coordinates as number[][][]];
    } else if (g && g.type === 'MultiPolygon') {
      polys = g.coordinates as number[][][][];
    } else {
      continue;
    }
    let minX = 180;
    let minY = 90;
    let maxX = -180;
    let maxY = -90;
    for (const poly of polys) {
      for (const pt of poly[0]) {
        if (pt[0] < minX) minX = pt[0];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minY) minY = pt[1];
        if (pt[1] > maxY) maxY = pt[1];
      }
    }
    out.push({
      name: f.properties?.name ?? 'Unknown',
      polys,
      bbox: [minX, minY, maxX, maxY],
    });
  }
  return out;
}

// Ray-casting test of a point against one ring.
function inRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Inside the outer ring and outside every hole.
function inPolygon(x: number, y: number, poly: number[][][]): boolean {
  if (!inRing(x, y, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) {
    if (inRing(x, y, poly[k])) return false;
  }
  return true;
}

/**
 * The country containing (lat, lng), or null for ocean / unclaimed points. The
 * polygon set is decoded lazily on first use.
 */
export function countryOf(lat: number, lng: number): string | null {
  if (!countries) countries = build();
  for (const c of countries) {
    if (
      lng < c.bbox[0] ||
      lng > c.bbox[2] ||
      lat < c.bbox[1] ||
      lat > c.bbox[3]
    ) {
      continue;
    }
    for (const poly of c.polys) {
      if (inPolygon(lng, lat, poly)) return c.name;
    }
  }
  return null;
}
