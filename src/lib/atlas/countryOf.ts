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
//
// Longitude is periodic and the ray-casting below is not, so the seam at ±180°
// is handled explicitly at both ends: the rings that touch it are repaired at
// build time (see repairRing) and the query point is brought onto the same turn
// in find().

interface Country {
  name: string;
  /** The source feature's id (ISO-3166 numeric as a string) — the stable key for
   *  joining against other country-coded datasets. Null for the few disputed
   *  territories Natural Earth ships without one. */
  id: string | null;
  // [polygon][ring][point]; ring[0] is the outer ring, the rest are holes; each
  // point is [lng, lat].
  polys: number[][][][];
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  /** Some ring runs past ±180° after unwrapping, so a query longitude may have to
   *  be shifted a whole turn to reach it. True for a handful of countries. */
  wrapped: boolean;
}

let countries: Country[] | null = null;

const TURN = 360;

// Natural Earth cuts every ring at ±180°, so a ring that spans the seam steps
// the whole width of the map to resume on the far side. Nothing else in the
// source moves that far in one step, so a step longer than half a turn IS a cut.
function seamSteps(ring: number[][]): number[] {
  const at: number[] = [];
  for (let i = 1; i < ring.length; i++) {
    const d = ring[i][0] - ring[i - 1][0];
    if (d > 180 || d < -180) at.push(i);
  }
  return at;
}

// Case 1 — the ring crosses the seam and crosses back (Russia's Chukotka arm,
// Wrangel Island, Fiji's eastern group). Ray-casting reads the cut literally, as
// a single segment ~360° wide, so every point in its latitude band, ANYWHERE on
// Earth, counts one extra crossing: the band's oceans and foreign countries read
// as inside (Greenland at 67°N answered "Russia", Bolivia at 16°S answered
// "Fiji"), while the country's own land in that band, one crossing over, read as
// outside (Murmansk answered nothing at all).
//
// Undo the cut rather than splitting the ring: walk it and add ±360° at each
// step, so the ring stays continuous and simply runs past the seam — Russia's
// mainland ring becomes 19°E → 191°E. find() shifts the query point a turn to
// meet it.
function unwrapRing(ring: number[][], seams: number[]): number[][] {
  const out = ring.slice(0, seams[0]);
  let off = 0;
  let s = 0;
  for (let i = seams[0]; i < ring.length; i++) {
    if (i === seams[s]) {
      off += ring[i][0] - ring[i - 1][0] > 180 ? -TURN : TURN;
      s++;
    }
    out.push(off ? [ring[i][0] + off, ring[i][1]] : ring[i]);
  }
  return out;
}

// Case 2 — the ring encircles a pole, so it crosses the seam without crossing
// back and there is no turn to unwrap onto. Antarctica is the only one: its
// coastline is a loop around the South Pole, cut at ±180° along the −84.7°
// parallel (Natural Earth's land ends at the grounding line — the floating ice
// shelves are not in this layer). Ray-casting a cut loop answers for the coast
// but not for the cap the loop encloses, so the pole itself read as open ocean.
// Close the loop through the pole instead: send the cut down to ±90° and back,
// which adds exactly one crossing for every point in the cap and none above it.
function closeAtPole(ring: number[][], seams: number[]): number[][] | null {
  // One cut is a loop around a pole; more than one is a shape this doesn't know
  // how to close, and the caller drops the ring rather than guess.
  if (seams.length !== 1) return null;
  const i = seams[0];
  const [ax, ay] = ring[i - 1];
  const [bx, by] = ring[i];
  // The pole it wound around is the one it hugs: compare how close the ring gets
  // to each. (Antarctica reaches −85.6°, and only −63.3° the other way.)
  let minLat = 90;
  let maxLat = -90;
  for (const p of ring) {
    if (p[1] < minLat) minLat = p[1];
    if (p[1] > maxLat) maxLat = p[1];
  }
  const pole = 90 - maxLat < minLat + 90 ? 90 : -90;
  // Route the detour through the seam itself rather than through the cut's own
  // endpoints. inRing casts its ray EASTWARD, so only a vertical at +180° is
  // east of every query longitude and can close the cap for all of them; a
  // vertical at, say, 179.70° would leave the wedge beyond it open. Natural
  // Earth clips flush to ±180° at 110m but not at 50m or 10m (179.70° → −180°),
  // so interpolate where the cut actually crosses and start the detour there.
  const side = ax > 0 ? 180 : -180;
  const span = Math.abs(bx - ax + (ax > 0 ? TURN : -TURN));
  const seamLat = span ? ay + (Math.abs(side - ax) / span) * (by - ay) : ay;
  return [
    ...ring.slice(0, i),
    [side, seamLat],
    [side, pole],
    [-side, pole],
    [-side, seamLat],
    ...ring.slice(i),
  ];
}

// The repaired ring, or null when the cut is a shape neither case can mend.
function repairRing(ring: number[][], seams: number[]): number[][] | null {
  // Net turns across the seam: zero means it came back (case 1), otherwise the
  // ring wound around a pole (case 2).
  let turns = 0;
  for (const i of seams) turns += ring[i][0] > ring[i - 1][0] ? 1 : -1;
  return turns === 0 ? unwrapRing(ring, seams) : closeAtPole(ring, seams);
}

// Repair a polygon's outer ring, then carry its holes onto the same turn. (The
// 110m set has one hole in the world and it is nowhere near the seam, but a hole
// left a turn behind its outer ring would stop punching through it.) Null when
// the outer ring can't be repaired: the caller must DROP the polygon, because
// keeping the source ring keeps its cut, and one cut misplaces its whole
// latitude band worldwide. A country short a polygon is a local error; that is
// a global one.
function repairPolygon(poly: number[][][]): number[][][] | null {
  const seams = seamSteps(poly[0]);
  if (!seams.length) return poly;
  const outer = repairRing(poly[0], seams);
  if (!outer) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of outer) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
  }
  const mid = (minX + maxX) / 2;
  const out: number[][][] = [outer];
  for (let k = 1; k < poly.length; k++) {
    const cuts = seamSteps(poly[k]);
    // Same reasoning, one step down: an unmendable hole is dropped rather than
    // kept, which over-claims the area it should have punched out.
    const ring = cuts.length ? repairRing(poly[k], cuts) : poly[k];
    if (!ring) continue;
    const shift = Math.round((mid - ring[0][0]) / TURN) * TURN;
    out.push(shift ? ring.map((p) => [p[0] + shift, p[1]]) : ring);
  }
  return out;
}

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
    const repaired: number[][][][] = [];
    for (const poly of polys) {
      const p = repairPolygon(poly);
      if (p) repaired.push(p);
    }
    if (!repaired.length) continue;
    polys = repaired;
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
      id: f.id != null ? String(f.id) : null,
      polys,
      bbox: [minX, minY, maxX, maxY],
      wrapped: minX < -180 || maxX > 180,
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

// Bbox reject, then the rings.
function hits(c: Country, x: number, y: number): boolean {
  if (x < c.bbox[0] || x > c.bbox[2]) return false;
  for (const poly of c.polys) {
    if (inPolygon(x, y, poly)) return true;
  }
  return false;
}

function find(lat: number, lngRaw: number): Country | null {
  if (!countries) countries = build();
  // A panned world map hands back the copy the cursor is over (191°E, −529°E …),
  // so start from the canonical turn.
  const lng = ((((lngRaw + 180) % TURN) + TURN) % TURN) - 180;
  // The one other place a repaired ring can be waiting. A repair shifts by at
  // most one turn and the source lives in [−180°, 180°], so a ring pushed past
  // the seam sits in [180°, 360°) or in (−360°, −180°] and never beyond — and
  // only one of those is a turn away from any given query longitude. (Russia has
  // one of each: its mainland unwrapped east to 191°, Wrangel Island west to
  // −181°, which is why both polygons are tried at both longitudes.)
  const alt = lng < 0 ? lng + TURN : lng - TURN;
  for (const c of countries) {
    if (lat < c.bbox[1] || lat > c.bbox[3]) continue;
    if (hits(c, lng, lat)) return c;
    if (c.wrapped && hits(c, alt, lat)) return c;
  }
  return null;
}

/**
 * The country containing (lat, lng), or null for ocean / unclaimed points. The
 * polygon set is decoded lazily on first use.
 */
export function countryOf(lat: number, lng: number): string | null {
  return find(lat, lng)?.name ?? null;
}

export interface CountryHit {
  /** ISO-3166 numeric code as a string, or null where the source has none. */
  id: string | null;
  name: string;
}

/** Like countryOf, but keyed for joins: the hit carries the polygon's ISO
 *  numeric id alongside the display name. Same lazy decode, same accuracy
 *  caveats (110m coastlines). */
export function countryHitOf(lat: number, lng: number): CountryHit | null {
  const c = find(lat, lng);
  return c ? { id: c.id, name: c.name } : null;
}
