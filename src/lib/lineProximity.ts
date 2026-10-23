// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Point ↔ map-line proximity, entirely client-side over the already-generated line
// geometry. Distances are exact point-to-great-circle-segment arcs in 3D vector form —
// trig on unit vectors is insensitive to the ±180° unwrapping the rendered lines carry,
// so there is no longitude-normalization step (or want for one). This is the shared
// kernel behind: the "spotlight" reveal in App (filterWithinKm — which features to draw),
// the per-location "lines near here" list a HUD can present (linesNearPoint), and the
// place↔line search (citiesNearLine, which lives with the city index).

import type { Feature, FeatureCollection, LineString } from 'geojson';
import { bandCovers, bandOutline, type LineBand } from './astro/uncertaintyBands';

const R_KM = 6371;
const D2R = Math.PI / 180;

export type Vec3 = [number, number, number];

export const toVec = (lat: number, lng: number): Vec3 => {
  const phi = lat * D2R;
  const lam = lng * D2R;
  return [Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi)];
};

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

// Great-circle distance between unit vectors. atan2 keeps full precision at small
// separations, where the dot product alone saturates toward 1.
export const vecDistKm = (a: Vec3, b: Vec3) => Math.atan2(len(cross(a, b)), dot(a, b)) * R_KM;

/** Initial great-circle bearing from (lat1,lng1) toward (lat2,lng2): degrees 0–360,
 *  clockwise from geographic north — the navigation azimuth of the geodesic at its
 *  starting point. Same convention as the local-space azimuths, so a point lying ON
 *  a local-space line yields exactly that line's azimuth from its origin. */
export function initialBearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const p1 = lat1 * D2R;
  const p2 = lat2 * D2R;
  const dl = (lng2 - lng1) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (((Math.atan2(y, x) / D2R) % 360) + 360) % 360;
}

// Great-circle distance to one endpoint, fully scalar — the endpoint fallback below runs
// for nearly every segment of a long polyline, so it must not allocate.
const endpointDistKm = (px: number, py: number, pz: number, q: Vec3): number => {
  const cx = py * q[2] - pz * q[1];
  const cy = pz * q[0] - px * q[2];
  const cz = px * q[1] - py * q[0];
  return (
    Math.atan2(Math.sqrt(cx * cx + cy * cy + cz * cz), px * q[0] + py * q[1] + pz * q[2]) * R_KM
  );
};

// Min distance from point P to the great-circle ARC a→b (all unit vectors). Cross-track
// distance when P's foot lies within the arc, else the nearer endpoint. The two sign tests
// check the foot sits forward of `a` and behind `b` along the arc's travel direction
// (n = a×b is the circle's pole). Written scalar-only: this is the innermost loop of every
// proximity query — over a large line set it runs hundreds of thousands of times per call,
// and intermediate vector allocations were most of its cost.
export function pointSegmentKm(p: Vec3, a: Vec3, b: Vec3): number {
  const px = p[0],
    py = p[1],
    pz = p[2];
  // n = a × b
  const nx = a[1] * b[2] - a[2] * b[1];
  const ny = a[2] * b[0] - a[0] * b[2];
  const nz = a[0] * b[1] - a[1] * b[0];
  const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (nl < 1e-12) return endpointDistKm(px, py, pz, a); // degenerate: a ≈ b
  const nux = nx / nl,
    nuy = ny / nl,
    nuz = nz / nl;
  const t = px * nux + py * nuy + pz * nuz; // sin(cross-track angle), signed
  // Foot of P on the circle: remove the off-plane component and renormalize.
  const fx = px - t * nux,
    fy = py - t * nuy,
    fz = pz - t * nuz;
  const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
  if (fl < 1e-9) {
    // P sits at the circle's pole — every circle point is 90° away.
    return Math.min(
      (Math.PI / 2) * R_KM,
      endpointDistKm(px, py, pz, a),
      endpointDistKm(px, py, pz, b),
    );
  }
  const fux = fx / fl,
    fuy = fy / fl,
    fuz = fz / fl;
  // (a × fu) · n ≥ 0: the foot lies forward of `a` …
  const afn =
    (a[1] * fuz - a[2] * fuy) * nx + (a[2] * fux - a[0] * fuz) * ny + (a[0] * fuy - a[1] * fux) * nz;
  if (afn >= 0) {
    // … and (fu × b) · n ≥ 0: behind `b`.
    const fbn =
      (fuy * b[2] - fuz * b[1]) * nx +
      (fuz * b[0] - fux * b[2]) * ny +
      (fux * b[1] - fuy * b[0]) * nz;
    if (fbn >= 0) return Math.asin(Math.min(1, Math.abs(t))) * R_KM;
  }
  return Math.min(endpointDistKm(px, py, pz, a), endpointDistKm(px, py, pz, b));
}

// GeoJSON positions are [lng, lat].
export type Coords = [number, number][];

// Per-polyline segment lists, cached weakly on the coordinate array itself. The same
// geometry is queried repeatedly (spotlight filtering, per-point lists, panel scans), and
// converting every vertex to a unit vector each time dominated those passes. Generated
// line geometry is treated as immutable — a regenerated line is a NEW array, so its stale
// segments simply fall out of the WeakMap with it.
const segCache = new WeakMap<Coords, [Vec3, Vec3][]>();
function segmentsFor(coords: Coords): [Vec3, Vec3][] {
  const hit = segCache.get(coords);
  if (hit) return hit;
  const segs: [Vec3, Vec3][] = [];
  let prev: Vec3 | null = null;
  for (const [lng, lat] of coords) {
    const v = toVec(lat, lng);
    if (prev) segs.push([prev, v]);
    prev = v;
  }
  segCache.set(coords, segs);
  return segs;
}

/** Split one or more polylines into consecutive [a, b] great-circle segment pairs.
 *  The pairs are shared, cached objects — read, don't mutate. */
export function toSegments(coordsList: Coords[]): [Vec3, Vec3][] {
  if (coordsList.length === 1) return segmentsFor(coordsList[0]);
  const out: [Vec3, Vec3][] = [];
  for (const coords of coordsList) {
    const segs = segmentsFor(coords);
    for (let i = 0; i < segs.length; i++) out.push(segs[i]);
  }
  return out;
}

/** Closest great-circle approach (km) from (lat,lng) to a line, whose geometry may be split
 *  across several pieces — pass every piece. Infinity for an empty/degenerate geometry. */
export function nearestApproachKm(lat: number, lng: number, coordsList: Coords[]): number {
  const p = toVec(lat, lng);
  let best = Infinity;
  for (const coords of coordsList) {
    const segs = segmentsFor(coords);
    for (let i = 0; i < segs.length; i++) {
      const d = pointSegmentKm(p, segs[i][0], segs[i][1]);
      if (d < best) best = d;
    }
  }
  return best;
}

/** True if any part of the line passes within `maxKm` of (lat,lng). Early-exits on the first
 *  qualifying segment, so it's cheaper than nearestApproachKm when you only need the boolean. */
export function isWithinKm(coordsList: Coords[], lat: number, lng: number, maxKm: number): boolean {
  const p = toVec(lat, lng);
  for (const coords of coordsList) {
    const segs = segmentsFor(coords);
    for (let i = 0; i < segs.length; i++) {
      if (pointSegmentKm(p, segs[i][0], segs[i][1]) <= maxKm) return true;
    }
  }
  return false;
}

/** A new FeatureCollection keeping only the LineString features that pass within `maxKm` of
 *  (lat,lng). Per-FEATURE: a normal one-feature line (its whole great circle) reveals whole;
 *  a line split into several features reveals only the pieces that qualify.
 *
 *  A line carrying an uncertainty band (`props.band`, lib/astro/uncertaintyBands — a chart with
 *  no birth time on a geodetic map) qualifies by its BAND (2026-10-20): where the band covers
 *  the point (bandCovers, the band's definition), or its ring — the fill the map draws
 *  (bandOutline) — passes within `maxKm`. That is the ranking a listing tool gives a banded line
 *  (bandCoverage's), so a reveal shows every line its list names; the ring is measured here with
 *  this module's own cached segments rather than bandCoverage's, since the reveal runs over
 *  every banded line at each spotlight change. */
export function filterWithinKm<P>(
  fc: FeatureCollection<LineString, P>,
  lat: number,
  lng: number,
  maxKm: number,
): FeatureCollection<LineString, P> {
  const features = fc.features.filter((f: Feature<LineString, P>) => {
    const band = (f.properties as { band?: LineBand } | null)?.band;
    if (band) {
      if (bandCovers(band, lat, lng)) return true;
      const ring = bandOutline(band);
      if (ring && isWithinKm([ring], lat, lng, maxKm)) return true;
    }
    return isWithinKm([f.geometry.coordinates as Coords], lat, lng, maxKm);
  });
  return { ...fc, features };
}

export interface LineEntry {
  /** Caller's identity for the line — carried through to the result. */
  key: string;
  coordsList: Coords[];
}

export interface LineNearPoint {
  key: string;
  km: number;
}

/**
 * Every entry whose line passes within `maxKm` of (lat, lng), nearest first. Brute force over
 * all segments — fine for a drawn set, and thanks to the segment cache + scalar inner loop it
 * stays interactive even over a COMPLETE unfiltered set (hundreds of thousands of vertices):
 * the first query pays the one-time segment build, repeats are pure arithmetic.
 */
export function linesNearPoint(
  entries: LineEntry[],
  lat: number,
  lng: number,
  maxKm: number,
): LineNearPoint[] {
  const p = toVec(lat, lng);
  const out: LineNearPoint[] = [];
  for (const e of entries) {
    let best = Infinity;
    for (const coords of e.coordsList) {
      const segs = segmentsFor(coords);
      for (let i = 0; i < segs.length; i++) {
        const d = pointSegmentKm(p, segs[i][0], segs[i][1]);
        if (d < best) best = d;
      }
    }
    if (best <= maxKm) out.push({ key: e.key, km: best });
  }
  return out.sort((x, y) => x.km - y.km);
}
