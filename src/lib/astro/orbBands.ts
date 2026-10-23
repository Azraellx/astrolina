// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Orb-of-influence bands: a translucent zone around each planet angle line (a
// GROUND distance, so the band is geodesically honest at every latitude and in
// both projections — a px-width halo would lie at high latitudes) and a
// latitude band around each paran (its orb arrives as a ground distance too and
// converts to a ± latitude span, since a paran is a horizontal latitude line).
// Rendered as fill polygons under the line layers.
//
// Geometry rides the lines' own (possibly ±180-unwrapped) longitude frame: the
// perpendicular offset is computed as a Δlongitude and ADDED to the vertex's
// longitude, so a band stays continuous across the seam exactly like its line.
//
// A line that carries an uncertainty band (`props.band`, uncertaintyBands stampBands) gets
// a corridor round its BAND instead (2026-10-20). Lina, 20 Oct 2026, §13: "On a banded line
// the orb corridor surrounds the band, so it shows every place that could be within orb of
// the line, wherever in the band the line truly lies." See bandedCorridor below.
import type { Feature, FeatureCollection, LineString, Polygon, Position } from 'geojson';
import { foldRibbon } from './geodeticGrid';
import type { LineProps } from './lines';
import type { ParanProps } from './parans';
import { bandOutline, type LineBand, bandKeyOf } from './uncertaintyBands';

const R_KM = 6371;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

// The offset distance is clamped so a band edge can never reach past this
// latitude: an offset crossing the pole flips its computed Δlongitude by
// ~180°, breaking the unwrapped frame and folding the ring into a bogus
// polar fill. Clamping the distance instead of dropping vertices keeps the
// band continuous — it just pinches as the line nears a pole (a horizon
// line's apex sits at 90−|dec|, well inside reach of a wide user orb).
const POLE_CUTOFF_LAT = 88.5;
const KM_PER_DEG = 111.2;

export interface OrbBandProps {
  color: string;
  opacity: number;
  /** A banded line's corridor only: whose band it surrounds, "Moon:MC". The map shows such a
   *  corridor only while its line is hovered or tapped, with the band (Lina, 21 Oct 2026, §2.1). */
  bandOf?: string;
}

type Pt = [number, number]; // GeoJSON [lng, lat]

// Destination point at `km` along `bearing` (radians, from north) — Δλ comes
// straight out of the formula, so the unwrapped frame is preserved.
function offset(p: Pt, bearing: number, km: number): Pt {
  const d = km / R_KM;
  const phi1 = p[1] * D2R;
  const sinPhi2 =
    Math.sin(phi1) * Math.cos(d) + Math.cos(phi1) * Math.sin(d) * Math.cos(bearing);
  const dLng = Math.atan2(
    Math.sin(bearing) * Math.sin(d) * Math.cos(phi1),
    Math.cos(d) - Math.sin(phi1) * sinPhi2,
  );
  return [p[0] + dLng * R2D, Math.asin(sinPhi2) * R2D];
}

// Initial great-circle bearing a→b (radians). The unwrapped frame's Δλ is the
// plain difference.
function bearing(a: Pt, b: Pt): number {
  const phi1 = a[1] * D2R;
  const phi2 = b[1] * D2R;
  const dLng = (b[0] - a[0]) * D2R;
  return Math.atan2(
    Math.sin(dLng) * Math.cos(phi2),
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng),
  );
}

const HALF_PI = Math.PI / 2;

// One line's band: every vertex offset `orbKm` to each side, perpendicular to
// the local line direction; left side forward + right side reversed close the
// ring. Vertices hugging a pole are dropped (the band simply ends early there).
function bandRing(coords: Pt[], orbKm: number): Pt[] | null {
  const usable = coords.filter((c) => Math.abs(c[1]) < POLE_CUTOFF_LAT);
  if (usable.length < 2) return null;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < usable.length; i++) {
    const a = usable[Math.max(0, i - 1)];
    const b = usable[Math.min(usable.length - 1, i + 1)];
    const dir = bearing(a, b);
    // Per-vertex clamp: never offset farther than the cutoff latitude allows
    // (see POLE_CUTOFF_LAT above — past the pole the ring folds).
    const km = Math.min(
      orbKm,
      Math.max(0, (POLE_CUTOFF_LAT - Math.abs(usable[i][1])) * KM_PER_DEG),
    );
    left.push(offset(usable[i], dir - HALF_PI, km));
    right.push(offset(usable[i], dir + HALF_PI, km));
  }
  right.reverse();
  const ring = [...left, ...right];
  ring.push(ring[0]);
  return ring;
}

// Paran bands span every longitude; 5° steps keep the edges smooth on the globe.
const PARAN_LNG_STEP = 5;

function paranRing(latitude: number, orbDeg: number): Pt[] {
  const top = Math.min(latitude + orbDeg, 89);
  const bottom = Math.max(latitude - orbDeg, -89);
  const ring: Pt[] = [];
  for (let lng = -180; lng <= 180; lng += PARAN_LNG_STEP) ring.push([lng, top]);
  for (let lng = 180; lng >= -180; lng -= PARAN_LNG_STEP) ring.push([lng, bottom]);
  ring.push(ring[0]);
  return ring;
}

const LINE_BAND_OPACITY = 0.07;
const PARAN_BAND_OPACITY = 0.045;

// ── The corridor round a band (§13) ───────────────────────────────────────────────────────
// Every place within `orbKm` of the band: the band itself, and everything within the orb of
// its outline. Not an offset of the band's two edge lines, which is what was planned: a band's
// edges are not a band's outline everywhere. Above the polar circles the two end degrees'
// curves CROSS, and the ring a band fills is a figure of eight there, its lobes on opposite
// sides of each edge in turn — so "the edge's outward side" flips along the edge, and any one
// side offset would cut into the band beyond the crossing. And at a turning point the outline
// turns back on itself, a cap an offset would cut straight across. So the corridor is built as
// the set it is defined to be, and its edge lands wherever that is. (2026-10-20)
//
// How, by latitude rows (from −88.5° to 88.5°, POLE_CUTOFF_LAT, the clamp every orb band has):
// at each row, the band's own cross-section (the ring's crossings of the row, paired even-odd,
// as the map fills it) and the stretch of the row within the orb of every point of the ring
// (densified to the row step), merged on the circle; rows whose stretches pair one for one by
// overlap are joined by straight edges, and where the pattern changes the strip between is
// split flat at its midline, as the Ascendant zones are (geodeticGrid). Each chain of joined
// stretches is a ribbon, cut at ±180° and folded into the world by the zones' own foldRibbon.
// The pieces abut and never overlap, and the layer draws with fill-antialias off, so they read
// as one fill.
//
// Why it covers: the radius is the orb plus a row step and half a point spacing. A place within
// the orb of the band, between two rows, is within one row step of the place straight north or
// south of it on either row, so both rows' stretches hold its longitude — and a joined strip,
// or a split one, holds every longitude its two rows share. The disks round the ring's points
// are short of a disk round the ring itself by at most half the spacing. So nothing within orb
// is left out — at the cost of drawing wider than the orb by up to 2.5 row steps: the 1.5 in
// the radius, and one more where a strip between two rows takes the wider row's stretch
// (corridorMarginKm; at the 0.1° step, about 28 km on the default 325 km orb, usually less).
// verify-geodetic-chart §8 holds it to both: every sampled place within orb of either edge line
// (bandEdges, a part this never reads) or inside the band lies inside it, none past the margin
// does, and no place is in two pieces.
//
// Cost, measured 2026-10-20 (Node, one core): about 8 ms a band at the default orb, 15 ms at
// 900 km. A timeless chart's ranged bodies make four bands each (two to five bodies), and
// their aspect and midpoint lines, when drawn, more. Built once per band object and orb.
const CORRIDOR_STEP_MAX = 0.1;
const CORRIDOR_STEP_MIN = 0.02;

// The row step for an orb (degrees): a tenth of the orb, between the two limits.
function corridorStep(orbKm: number): number {
  return Math.min(CORRIDOR_STEP_MAX, Math.max(CORRIDOR_STEP_MIN, ((orbKm / R_KM) * R2D) / 10));
}

/** How much wider than the orb a corridor may be drawn (km): 2.5 row steps on the ground —
 *  the construction's own bound (the header says why). */
export function corridorMarginKm(orbKm: number): number {
  return 2.5 * corridorStep(orbKm) * D2R * R_KM;
}

type Flat = number[]; // [l0, r0, l1, r1, …]

// A row's stretches merged on the circle: each with l in [−180, 180) and r > l, r − l < 360,
// ascending; a whole parallel is [−180, 180].
function mergeCircular(flat: Flat): Flat {
  const iv: [number, number][] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    let l = flat[i];
    let r = flat[i + 1];
    if (!(r > l)) continue;
    if (r - l >= 360) return [-180, 180];
    const sh = 360 * Math.floor((l + 180) / 360);
    l -= sh;
    r -= sh;
    if (r > 180) iv.push([l, 180], [-180, r - 360]);
    else iv.push([l, r]);
  }
  if (iv.length === 0) return [];
  iv.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [l, r] of iv) {
    const last = out[out.length - 1];
    if (last && l <= last[1]) last[1] = Math.max(last[1], r);
    else out.push([l, r]);
  }
  if (out.length === 1 && out[0][0] <= -180 && out[0][1] >= 180) return [-180, 180];
  // A stretch running up to +180 continues in the one starting at −180.
  if (out.length > 1 && out[0][0] <= -180 && out[out.length - 1][1] >= 180) {
    const first = out.shift()!;
    out[out.length - 1][1] = first[1] + 360;
  }
  return out.flat();
}

// Do two stretches overlap on the circle?
function overlaps(l1: number, r1: number, l2: number, r2: number): boolean {
  for (const k of [-360, 0, 360]) if (Math.max(l1, l2 + k) < Math.min(r1, r2 + k)) return true;
  return false;
}

// Row B as a continuation of row A: for each stretch of A the one stretch of B it overlaps,
// when that pairing is one for one both ways. Null otherwise.
function matchStretches(A: Flat, B: Flat): number[] | null {
  const n = A.length / 2;
  if (n === 0 || n !== B.length / 2) return null;
  const to = new Array<number>(n).fill(-1);
  const hit = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (!overlaps(A[2 * i], A[2 * i + 1], B[2 * j], B[2 * j + 1])) continue;
      if (to[i] >= 0) return null;
      to[i] = j;
      hit[j] += 1;
    }
    if (to[i] < 0) return null;
  }
  return hit.every((h) => h === 1) ? to : null;
}

// Angular distance between two [lng, lat] points, degrees.
function arcDeg(a: Pt, b: Pt): number {
  const p1 = a[1] * D2R;
  const p2 = b[1] * D2R;
  const h =
    Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(((b[0] - a[0]) * D2R) / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h))) * R2D;
}

const corridorCache = new WeakMap<LineBand, { orbKm: number; rings: Pt[][] }>();

/**
 * The orb corridor round a band: every place within `orbKm` (ground distance) of the band, as
 * closed counter-clockwise rings inside −180…180 that abut and never overlap — one Polygon
 * each. Clamped at ±88.5° like every orb band. Built once per band object and orb.
 */
export function bandedCorridor(band: LineBand, orbKm: number): Pt[][] {
  if (!(orbKm > 0)) return [];
  const cached = corridorCache.get(band);
  if (cached && cached.orbKm === orbKm) return cached.rings;
  const ring = bandOutline(band);
  const rings = ring ? corridorRings(ring, orbKm) : [];
  corridorCache.set(band, { orbKm, rings });
  return rings;
}

function corridorRings(ring: readonly Pt[], orbKm: number): Pt[][] {
  const rDeg = (orbKm / R_KM) * R2D;
  const step = corridorStep(orbKm);
  const reach = rDeg + 1.5 * step;
  const cosReach = Math.cos(reach * D2R);
  const n = Math.ceil((2 * POLE_CUTOFF_LAT) / step);
  const h = (2 * POLE_CUTOFF_LAT) / n;
  const ys = Array.from({ length: n + 1 }, (_, k) => -POLE_CUTOFF_LAT + h * k);
  const rowSin = ys.map((y) => Math.sin(y * D2R));
  const rowCos = ys.map((y) => Math.cos(y * D2R));
  const rows: Flat[] = ys.map(() => []);

  // The band's own cross-section at each row, even-odd, as the map fills it: each edge of the
  // ring crosses the rows between its ends, so one walk of the ring finds every crossing.
  const xs: number[][] = ys.map(() => []);
  for (let i = 1; i < ring.length; i++) {
    const [x1, y1] = ring[i - 1];
    const [x2, y2] = ring[i];
    if (y1 === y2) continue;
    const lo = Math.min(y1, y2);
    const hi = Math.max(y1, y2);
    // Rows with lo < y ≤ hi — the half-open rule that counts a vertex on a row once.
    for (let k = Math.max(0, Math.floor((lo + POLE_CUTOFF_LAT) / h)); k <= n && ys[k] <= hi; k++) {
      const y = ys[k];
      if (y1 > y !== y2 > y) xs[k].push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
    }
  }
  xs.forEach((row, k) => {
    row.sort((a, b) => a - b);
    for (let i = 0; i + 1 < row.length; i += 2) rows[k].push(row[i], row[i + 1]);
  });

  // The stretch of each row within `reach` of a point of the ring. Consecutive points of the
  // ring reach a row over stretches that nearly always overlap, so a stretch is folded into the
  // row's last one where it does — the rows stay a few stretches long, not one per point.
  const put = (row: Flat, lo: number, hi: number) => {
    const m = row.length;
    if (m >= 2 && lo <= row[m - 1] && hi >= row[m - 2]) {
      if (lo < row[m - 2]) row[m - 2] = lo;
      if (hi > row[m - 1]) row[m - 1] = hi;
    } else row.push(lo, hi);
  };
  const disk = (x: number, y: number) => {
    const sp = Math.sin(y * D2R);
    const cp = Math.cos(y * D2R);
    const k0 = Math.max(0, Math.ceil((y - reach + POLE_CUTOFF_LAT) / h));
    const k1 = Math.min(n, Math.floor((y + reach + POLE_CUTOFF_LAT) / h));
    for (let k = k0; k <= k1; k++) {
      const den = rowCos[k] * cp;
      // A point at a pole reaches every longitude of a row it reaches at all.
      if (den < 1e-12) {
        if (Math.abs(y - ys[k]) <= reach) put(rows[k], x - 180, x + 180);
        continue;
      }
      const c = (cosReach - rowSin[k] * sp) / den;
      if (c >= 1) continue;
      if (c <= -1) {
        put(rows[k], x - 180, x + 180);
        continue;
      }
      const d = Math.acos(c) * R2D;
      put(rows[k], x - d, x + d);
    }
  };
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i];
    const m = Math.max(1, Math.ceil(arcDeg(a, b) / step));
    for (let j = 0; j < m; j++) disk(a[0] + ((b[0] - a[0]) * j) / m, a[1] + ((b[1] - a[1]) * j) / m);
  }
  if (ring.length) disk(ring[ring.length - 1][0], ring[ring.length - 1][1]);

  // Rows into ribbons: a stretch joins the one it overlaps on the next row when they pair one
  // for one; otherwise every ribbon ends at the midline and the next row's begin there.
  const merged = rows.map(mergeCircular);
  type Ribbon = { sign: number; y: number[]; l: number[]; r: number[] };
  const done: Ribbon[] = [];
  let open: Ribbon[] = [];
  let openRow: Flat | null = null;
  const startAt = (B: Flat, ...at: number[]) =>
    Array.from({ length: B.length / 2 }, (_, j) => ({
      sign: 0,
      y: [...at],
      l: at.map(() => B[2 * j]),
      r: at.map(() => B[2 * j + 1]),
    }));
  ys.forEach((y, k) => {
    const B = merged[k];
    if (openRow === null) {
      open = startAt(B, y);
      openRow = B;
      return;
    }
    const to = matchStretches(openRow, B);
    if (to) {
      const next = new Array<Ribbon>(open.length);
      open.forEach((rb, i) => {
        const j = to[i];
        const last = rb.l[rb.l.length - 1];
        // B's stretch in the copy nearest the ribbon, so its edges stay continuous.
        const sh = 360 * Math.round((last - B[2 * j]) / 360);
        rb.y.push(y);
        rb.l.push(B[2 * j] + sh);
        rb.r.push(B[2 * j + 1] + sh);
        next[j] = rb;
      });
      open = next;
    } else {
      const ym = (ys[k - 1] + y) / 2;
      for (const rb of open) {
        rb.y.push(ym);
        rb.l.push(rb.l[rb.l.length - 1]);
        rb.r.push(rb.r[rb.r.length - 1]);
      }
      done.push(...open);
      open = startAt(B, ym, y);
    }
    openRow = B;
  });
  done.push(...open);

  const out: Position[][][][] = [[]];
  for (const rb of done) if (rb.y.length >= 2) foldRibbon(rb, out);
  return out[0].map((poly) => poly[0] as Pt[]);
}

/**
 * The combined orb-zone fill set: one polygon per planet angle line (`orbKm`
 * ground distance each side) and one latitude band per paran (`paranOrbKm`
 * ground distance each side, converted to a latitude span within). Both inputs
 * are the already-filtered map collections, so the zones always mirror what's visible.
 *
 * A line carrying an uncertainty band (`props.band`) gets the corridor round its band
 * (bandedCorridor: a few abutting polygons, in the line's colour) in place of the one round
 * its centre line, which would show only the places within orb of the placeholder's line.
 * (2026-10-20)
 */
export function generateOrbBands(
  lines: FeatureCollection<LineString, LineProps>,
  parans: FeatureCollection<LineString, ParanProps>,
  orbKm: number,
  paranOrbKm: number,
): FeatureCollection<Polygon, OrbBandProps> {
  const features: Feature<Polygon, OrbBandProps>[] = [];
  if (orbKm > 0) {
    const corridors = new Set<string>();
    for (const f of lines.features) {
      const band = (f.properties as LineProps & { band?: LineBand }).band;
      if (band) {
        // A line drawn twice (a repeated feature) makes one corridor.
        const bandOf = bandKeyOf(f.properties as LineProps & { band?: LineBand });
        const key = `${bandOf}:${f.properties.color}:${band.lo}:${band.hi}:${band.eps}`;
        if (corridors.has(key)) continue;
        corridors.add(key);
        for (const ring of bandedCorridor(band, orbKm)) {
          features.push({
            type: 'Feature',
            properties: { color: f.properties.color, opacity: LINE_BAND_OPACITY, bandOf },
            geometry: { type: 'Polygon', coordinates: [ring] },
          });
        }
        continue;
      }
      const ring = bandRing(f.geometry.coordinates as Pt[], orbKm);
      if (!ring) continue;
      features.push({
        type: 'Feature',
        properties: { color: f.properties.color, opacity: LINE_BAND_OPACITY },
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
    }
  }
  if (paranOrbKm > 0) {
    // The paran orb is a ground distance too; a paran is a horizontal latitude line, so
    // convert it to a ± latitude span here (KM_PER_DEG ≈ km per degree of latitude).
    const paranOrbDeg = paranOrbKm / KM_PER_DEG;
    // Several parans can share one latitude (node merges aside); collapse them
    // so stacked identical bands don't multiply the fill.
    const seen = new Set<string>();
    for (const f of parans.features) {
      const key = `${f.properties.latitude.toFixed(3)}|${f.properties.color}`;
      if (seen.has(key)) continue;
      seen.add(key);
      features.push({
        type: 'Feature',
        properties: { color: f.properties.color, opacity: PARAN_BAND_OPACITY },
        geometry: { type: 'Polygon', coordinates: [paranRing(f.properties.latitude, paranOrbDeg)] },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
