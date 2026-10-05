// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The uncertainty bands: on a geodetic map, where a chart with no birth time is cast for
// its 12:00 placeholder (lib/astro/timeless), the span a fast body's angle line can occupy
// across the unknown time of day — filled in the body's own colour around its line, so a
// reader zoomed in never meets a lone band edge and takes it for the line (2026-10-02).
//
// A band is the set of places where the line could fall: for the MC, every place whose MC
// is within ±w of the body's degree; for the ASC, every place whose geodetic Ascendant is;
// and so on. Each is built from the same tracer and the same meridian mapping the line
// itself is drawn with (lines.ts), so a band and its line can't disagree about where the
// line is — and verify-geodetic-chart §1 requires the polygon to agree, place by place
// from 84°S to 84°N, with the place readout (geodeticAngles), a part written independently
// of both.
//
//   MC / IC   a strip of longitude: the meridians of the band's two end degrees, pole to
//             pole, joined along the poles.
//   ASC / DSC the region swept by the rising (setting) curves of every degree in the band.
//             Each curve runs from its degree's southern turning point to its northern one,
//             at latitude ±(90° − |declination|), and the rising and setting curves of a
//             degree meet there — so the ring is the first degree's curve, the locus of the
//             northern turning points, the last degree's curve back, and the locus of the
//             southern ones. At an equinox degree the declination is 0, the curve is a
//             whole meridian and the turning points are the poles, where the locus jumps a
//             quarter turn of longitude; the ring follows the pole across that jump.
//
// Every ring is longitude-unwrapped and closed, and a ring that winds around a pole or
// carries a non-finite point is dropped rather than drawn as a world-wide smear.
import type { Feature, FeatureCollection, LineString, Polygon } from 'geojson';
import {
  eclipticToRaDec,
  raDecToEclipticLon,
  type PlanetName,
  type PlanetPosition,
} from '../ephemeris';
import { unwrapLongitudes } from './dateline';
import { traceHorizonCoords, type LineProps, type LineType, type MeridianLng } from './lines';

/** What a band carries: whose line it surrounds, and the fill the map reads per feature. */
export interface UncertaintyBandProps {
  planet: PlanetName;
  lineType: LineType;
  color: string;
  opacity: number;
}

/** One fill opacity on every theme: enough to read as the line's own colour over the zone
 *  shading, faint enough that the line inside it stays the thing the eye lands on. */
export const UNCERTAINTY_BAND_OPACITY = 0.16;

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
// The turning-point loci are sampled at least every this many ecliptic degrees.
const LOCUS_STEP_DEG = 0.25;
// A meridian edge gets a vertex every this many degrees of latitude, and a run along a pole
// one every this many degrees of longitude: the globe draws a segment as a straight chord,
// so a long one would cut through the sphere, and the tiler (tolerance 0) keeps them.
const EDGE_STEP_DEG = 2;
const POLE_STEP_DEG = 1;
// A band end this close to an equinox IS the equinox (float noise from λ ± w).
const EQUINOX_SNAP_DEG = 1e-9;
// The four classical angles. The Vertex axis gets no band: its lines are off by default,
// and a band about a line the reader hasn't drawn would be a band about nothing.
const BANDED: ReadonlySet<LineType> = new Set<LineType>(['MC', 'IC', 'ASC', 'DSC']);

type Pt = [number, number];

// A longitude difference folded into (−180, 180]: the short way round.
function shortWay(d: number): number {
  const x = ((((d + 180) % 360) + 360) % 360) - 180;
  return x === -180 ? 180 : x;
}

function snapEquinox(deg: number): number {
  const e = 180 * Math.round(deg / 180);
  return Math.abs(deg - e) < EQUINOX_SNAP_DEG ? e : deg;
}

// Unwrap, sanity-check and close a ring. Null for one with a non-finite point, or one whose
// unwrapped longitude doesn't come back to where it started: that ring winds around a pole,
// and its closing edge would be a chord across the whole world. (eclipsePath's band check,
// without its 45° chord rule, which would reject the legitimate runs along a pole here.)
// The first vertex is folded into −180…180; the rest follow it, past ±180 where they
// cross the antimeridian, which the tiler wraps.
function closeRing(raw: Pt[]): Pt[] | null {
  if (raw.length < 4) return null;
  const ring = unwrapLongitudes(raw);
  if (ring.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return null;
  if (Math.abs(ring[ring.length - 1][0] - ring[0][0]) >= 180) return null;
  const shift = 360 * Math.floor((ring[0][0] + 180) / 360);
  const out = ring.map(([x, y]): Pt => [x - shift, y]);
  out.push([out[0][0], out[0][1]]);
  return out;
}

// The MC (IC) band: the strip between the meridians l0 and l1 (l1 > l0), closed along the
// poles, counter-clockwise.
function meridianRing(l0: number, l1: number): Pt[] {
  const ring: Pt[] = [];
  const n = Math.max(1, Math.ceil((l1 - l0) / POLE_STEP_DEG));
  for (let i = 0; i < n; i++) ring.push([l0 + ((l1 - l0) * i) / n, -90]);
  for (let y = -90; y < 90; y += EDGE_STEP_DEG) ring.push([l1, y]);
  for (let i = 0; i < n; i++) ring.push([l1 - ((l1 - l0) * i) / n, 90]);
  for (let y = 90; y > -90; y -= EDGE_STEP_DEG) ring.push([l0, y]);
  return ring;
}

function meridianBand(
  lonDeg: number,
  w: number,
  lineType: 'MC' | 'IC',
  meridianLng: MeridianLng,
  eps: number,
): Pt[] | null {
  const off = lineType === 'IC' ? 180 : 0;
  const l0 = meridianLng(eclipticToRaDec((lonDeg - w) * D2R, 0, eps).ra) + off;
  const l1 = meridianLng(eclipticToRaDec((lonDeg + w) * D2R, 0, eps).ra) + off;
  return closeRing(meridianRing(l0, l0 + ((((l1 - l0) % 360) + 360) % 360)));
}

// The ASC (DSC) band for the degrees lonDeg ± w. See the header for the construction.
function horizonBand(
  lonDeg: number,
  w: number,
  side: 'ASC' | 'DSC',
  meridianLng: MeridianLng,
  eps: number,
): Pt[] | null {
  const m0 = snapEquinox(lonDeg - w);
  const m1 = snapEquinox(lonDeg + w);
  if (!(m1 > m0)) return null;
  const at = (mu: number) => eclipticToRaDec(mu * D2R, 0, eps);
  const isEquinox = (mu: number) => mu % 180 === 0;
  // An equinox degree's horizon is a whole meridian, a quarter turn from where it culminates.
  const eqMeridian = (mu: number) =>
    meridianLng(at(mu).ra + (side === 'ASC' ? -Math.PI / 2 : Math.PI / 2));
  // A degree's turning points, for declination sign s (passed in, since at an equinox the
  // sign is the side the band leaves it on, not the float the declination happens to be).
  // The rising and setting curves both end here: H = 0 and H = ±π, whichever is the pole
  // side for that sign.
  const north = (mu: number, s: number): Pt => {
    const { ra, dec } = at(mu);
    return [meridianLng(ra + (s > 0 ? Math.PI : 0)), 90 - Math.abs(dec) * R2D];
  };
  const south = (mu: number, s: number): Pt => {
    const { ra, dec } = at(mu);
    return [meridianLng(ra + (s > 0 ? 0 : Math.PI)), -(90 - Math.abs(dec) * R2D)];
  };
  // One degree's curve, south→north, run all the way to its turning points.
  const curve = (mu: number): Pt[] => {
    if (isEquinox(mu)) {
      const lng = eqMeridian(mu);
      const run: Pt[] = [];
      for (let y = -90; y <= 90; y += EDGE_STEP_DEG) run.push([lng, y]);
      return run;
    }
    return traceHorizonCoords(at(mu), meridianLng, side, 90);
  };
  // Along a pole from one longitude to another, the short way (always a quarter turn here),
  // not repeating the start.
  const poleRun = (from: number, to: number, lat: number): Pt[] => {
    const d = shortWay(to - from);
    const n = Math.max(1, Math.ceil(Math.abs(d) / POLE_STEP_DEG));
    const run: Pt[] = [];
    for (let k = 1; k <= n; k++) run.push([from + (d * k) / n, lat]);
    return run;
  };

  // The equinoxes strictly inside the band split it: each piece has one declination sign.
  const breaks = [m0];
  for (let e = 180 * Math.floor(m0 / 180) + 180; e < m1; e += 180) breaks.push(e);
  breaks.push(m1);
  const top: Pt[] = [];
  const bottom: Pt[] = []; // m0 → m1; walked back below
  for (let i = 0; i + 1 < breaks.length; i++) {
    const a = breaks[i];
    const b = breaks[i + 1];
    const s = Math.sin(((a + b) / 2) * D2R) >= 0 ? 1 : -1;
    const n = Math.max(1, Math.ceil((b - a) / LOCUS_STEP_DEG));
    for (let k = 0; k <= n; k++) {
      const mu = k === n ? b : a + ((b - a) * k) / n;
      if (k === 0 && isEquinox(a)) {
        // Leaving an equinox: from the top (bottom) of its meridian along the pole to where
        // this side's turning points begin.
        const L = eqMeridian(a);
        top.push(...poleRun(L, north(a, s)[0], 90));
        bottom.push(...poleRun(L, south(a, s)[0], -90));
      } else if (k === n && isEquinox(b)) {
        // Arriving at one: the last turning point, then along the pole to its meridian.
        const L = eqMeridian(b);
        const nb = north(b, s);
        const sb = south(b, s);
        top.push(nb, ...poleRun(nb[0], L, 90));
        bottom.push(sb, ...poleRun(sb[0], L, -90));
      } else {
        top.push(north(mu, s));
        bottom.push(south(mu, s));
      }
    }
  }
  const first = curve(m0);
  const last = curve(m1);
  if (first.length === 0 || last.length === 0) return null;
  return closeRing([...first, ...top, ...last.reverse(), ...bottom.reverse()]);
}

/**
 * One band per drawn line of each body in `spans` — its MC, IC, ASC and DSC lines, as
 * `drawn` holds them (so a band follows its line through every filter, the natal-lines
 * hide and the eclipse clean-up) — of half-width spans[body] degrees of longitude. A
 * line tagged as another chart's (an overlay's) gets none: the bands are the natal
 * chart's placeholder's. The colour is the line's own.
 *
 * `positions` are the samples the lines were generated from and `meridianLng` and `eps`
 * the frame and obliquity they were projected with, so each band is centred where its
 * line is drawn (CLAUDE.md rule 5).
 */
export function generateUncertaintyBands(
  drawn: FeatureCollection<LineString, LineProps>,
  positions: readonly PlanetPosition[],
  spans: Readonly<Partial<Record<PlanetName, number>>>,
  meridianLng: MeridianLng,
  eps: number,
): FeatureCollection<Polygon, UncertaintyBandProps> {
  const byName = new globalThis.Map(positions.map((p) => [p.name, p] as const));
  const features: Feature<Polygon, UncertaintyBandProps>[] = [];
  const done = new Set<string>();
  for (const f of drawn.features) {
    const { planet, lineType, color, tag } = f.properties;
    const w = spans[planet];
    if (tag || w === undefined || !BANDED.has(lineType)) continue;
    const key = `${planet}:${lineType}`;
    const p = byName.get(planet);
    if (done.has(key) || !p) continue;
    done.add(key);
    const lonDeg = (p.lon ?? raDecToEclipticLon(p.ra, p.dec, eps)) * R2D;
    const ring =
      lineType === 'MC' || lineType === 'IC'
        ? meridianBand(lonDeg, w, lineType, meridianLng, eps)
        : horizonBand(lonDeg, w, lineType as 'ASC' | 'DSC', meridianLng, eps);
    if (!ring) continue;
    features.push({
      type: 'Feature',
      properties: { planet, lineType, color, opacity: UNCERTAINTY_BAND_OPACITY },
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
  }
  return { type: 'FeatureCollection', features };
}
