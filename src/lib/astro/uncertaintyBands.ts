// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The uncertainty bands: on a geodetic map, where a chart with no birth time is cast for
// its 12:00 placeholder (lib/astro/timeless), the span a ranged body's line can occupy
// across the unknown time of day — filled in the body's own colour around its line, so a
// reader zoomed in never meets a lone band edge and takes it for the line (2026-10-02).
//
// A band is the set of places where the line could fall: the line swept across the body's
// motion over the birth date (Lina, 22 Oct 2026, §2.2) — for the MC, every place whose MC lies
// within that range of degrees; for the ASC, every place whose geodetic Ascendant does; and so
// on. The range runs from `lo` to `hi` and need not be centred on the noon line, which sits
// inside it wherever the body was at noon. Each is built from the same tracer and the same meridian mapping the line
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
//
// THE BAND IS CARRIED ON THE LINE (2026-10-20). Lina's 20 Oct reply widened what reads a band:
// the orb corridor goes round it (§13), and the listing tools report a banded line by its
// band (§16). So the band is decided ONCE, by stampBands, and written onto the line as
// `props.band` — its range, noon degree, angle and tilt — and the fills here, the corridors,
// the tips and every listing tool read that, never a range table or a tag test of their own
// (CLAUDE.md rule 5). bandFor is the one predicate; bandCoverage the one membership test,
// through the place readout at the band's own tilt — the agreement verify-geodetic-chart §1
// already holds the polygon to.
//
// Which lines (Lina, 22 Oct 2026, §2.2): every RANGED body's (timeless.ts) four angle lines; its
// aspect lines, banded by its own range about their virtual point's degree, `vlon`
// (angleAspects.ts); and every midpoint line with a ranged body on either side, banded by the
// pair's own midpoint motion over the day (half of each body's, measured per pair).
import type { Feature, FeatureCollection, LineString, Polygon } from 'geojson';
import {
  eclipticToRaDec,
  geodeticAngles,
  raDecToEclipticLon,
  type PlanetName,
  type PlanetPosition,
} from '../ephemeris';
import { unwrapLongitudes } from './dateline';
import { lonRangeText } from './format';
import { meridianLngFor, traceHorizonCoords, type LineProps, type LineType, type MeridianLng } from './lines';
import { isRanged, midpointRange, type BirthDateMotion, type BodyRange } from './timeless';

/** What a band carries: whose line it surrounds, and the fill the map reads per feature. */
export interface UncertaintyBandProps {
  planet: PlanetName;
  lineType: LineType;
  color: string;
  opacity: number;
  /** The line it belongs to (bandKeyOf): what the map's hover shows one band by. */
  bandKey: string;
}

/** The four classical angles: the only lines a band surrounds. */
export type BandAngle = 'MC' | 'IC' | 'ASC' | 'DSC';

/** Where a banded line could lie, as stampBands writes it onto the line (`props.band`). */
export interface LineBand {
  /** The range's first degree [0, 360): the line at the start of the motion's extent. */
  lo: number;
  /** Its last degree: `lo` plus the range's width, so always above `lo` (it may pass 360). */
  hi: number;
  /** The noon degree — the one the drawn line is the `angle` of: the body's own longitude, or
   *  an aspect or midpoint line's virtual point (its `vlon`) — degrees [0, 360). Inside the
   *  range, not necessarily its middle. */
  deg: number;
  /** Which angle of that degree the line is (an aspect line's own `branch`, not its relabel). */
  angle: BandAngle;
  /** The tilt the line was mapped at (radians). A band exists only on a geodetic map, whose
   *  mapping is read at this ε alone, so the band carries everything that rebuilds it. */
  eps: number;
}

/** A line as the band code reads it: any line, with the aspect / midpoint fields where it has
 *  them, and its band once stamped. */
export type BandedLineProps = LineProps & {
  kind?: string;
  branch?: LineType;
  planetB?: PlanetName;
  vlon?: number;
  band?: LineBand;
};

/** bandFor's answer: the band a line gets as offsets from its noon degree, but for a body's own
 *  line not that degree, which is the body's longitude and so comes from the positions
 *  (stampBands reads it there). */
export interface BandSpec {
  range: BodyRange;
  angle: BandAngle;
  /** Present for an aspect or midpoint line: its `vlon`. */
  deg?: number;
}

/** Which line a band belongs to, as the map's hover reads it (Lina, 22 Oct 2026, §2.2: the band
 *  belongs to the hovered line only). Natal and an overlay's lines differ by their tag, an aspect
 *  line from its body's own line by its kind, a midpoint line by its other body, and the angle
 *  is the band's (an aspect line's `branch`). An aspect or midpoint line adds its own virtual
 *  point's degree (`vlon`): one body's sextile, square and trine lines share a branch, and a
 *  sextile has two, so only the point tells them apart. So no two lines share one. */
export function bandKeyOf(props: BandedLineProps): string {
  const angle = props.band?.angle ?? (props.kind === 'aspect' ? props.branch : props.lineType);
  const at = props.vlon === undefined ? '' : props.vlon.toFixed(4);
  return `${props.tag ?? ''}|${props.kind ?? ''}|${props.planet}|${props.planetB ?? ''}|${angle ?? ''}|${at}`;
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
const isBandAngle = (t: LineType | undefined): t is BandAngle => t !== undefined && BANDED.has(t);

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

// The MC (IC) band's two end meridians, l1 > l0: the meridians of the band's end degrees.
function meridianEnds(
  lo: number,
  hi: number,
  lineType: 'MC' | 'IC',
  meridianLng: MeridianLng,
  eps: number,
): [number, number] {
  const off = lineType === 'IC' ? 180 : 0;
  const l0 = meridianLng(eclipticToRaDec(lo * D2R, 0, eps).ra) + off;
  const l1 = meridianLng(eclipticToRaDec(hi * D2R, 0, eps).ra) + off;
  return [l0, l0 + ((((l1 - l0) % 360) + 360) % 360)];
}

function meridianBand(lo: number, hi: number, lineType: 'MC' | 'IC', meridianLng: MeridianLng, eps: number): Pt[] | null {
  const [l0, l1] = meridianEnds(lo, hi, lineType, meridianLng, eps);
  return closeRing(meridianRing(l0, l1));
}

const isEquinox = (mu: number) => mu % 180 === 0;
// An equinox degree's horizon is a whole meridian, a quarter turn from where it culminates.
function eqMeridianOf(mu: number, side: 'ASC' | 'DSC', meridianLng: MeridianLng, eps: number): number {
  return meridianLng(eclipticToRaDec(mu * D2R, 0, eps).ra + (side === 'ASC' ? -Math.PI / 2 : Math.PI / 2));
}
// One degree's rising (setting) curve, south→north, run all the way to its turning points —
// the band's edge where `mu` is an end degree.
function horizonCurve(mu: number, side: 'ASC' | 'DSC', meridianLng: MeridianLng, eps: number): Pt[] {
  if (isEquinox(mu)) {
    const lng = eqMeridianOf(mu, side, meridianLng, eps);
    const run: Pt[] = [];
    for (let y = -90; y <= 90; y += EDGE_STEP_DEG) run.push([lng, y]);
    return run;
  }
  return traceHorizonCoords(eclipticToRaDec(mu * D2R, 0, eps), meridianLng, side, 90);
}

// The ASC (DSC) band for the degrees lo…hi. See the header for the construction.
function horizonBand(lo: number, hi: number, side: 'ASC' | 'DSC', meridianLng: MeridianLng, eps: number): Pt[] | null {
  const m0 = snapEquinox(lo);
  const m1 = snapEquinox(hi);
  if (!(m1 > m0)) return null;
  const at = (mu: number) => eclipticToRaDec(mu * D2R, 0, eps);
  const eqMeridian = (mu: number) => eqMeridianOf(mu, side, meridianLng, eps);
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
  // One degree's curve, south→north, run all the way to its turning points (bandEdges reads
  // the same two).
  const curve = (mu: number): Pt[] => horizonCurve(mu, side, meridianLng, eps);
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
 * A band's two edge lines, built exactly as its ring builds them: for an MC (IC) band the end
 * degrees' meridians pole to pole, west then east; for an ASC (DSC) band the end degrees'
 * rising (setting) curves, south→north, run to their turning points — low degree first. Null
 * where the ring would be (no band). `meridianLng` is the geodetic mapping at `band.eps`.
 *
 * What the band's ring adds to these is only how it closes between them — the turning-point
 * loci and the runs along a pole — so a place within an orb of an edge line is within that orb
 * of the band (verify-geodetic-chart §8 measures the orb corridor against these, a part the
 * corridor's own construction never reads).
 */
export function bandEdges(band: LineBand, meridianLng: MeridianLng): [Pt[], Pt[]] | null {
  if (band.angle === 'MC' || band.angle === 'IC') {
    const ends = meridianEnds(band.lo, band.hi, band.angle, meridianLng, band.eps);
    return ends.map((L) => {
      const run: Pt[] = [];
      for (let y = -90; y < 90; y += EDGE_STEP_DEG) run.push([L, y]);
      run.push([L, 90]);
      return run;
    }) as [Pt[], Pt[]];
  }
  const m0 = snapEquinox(band.lo);
  const m1 = snapEquinox(band.hi);
  if (!(m1 > m0)) return null;
  const a = horizonCurve(m0, band.angle, meridianLng, band.eps);
  const b = horizonCurve(m1, band.angle, meridianLng, band.eps);
  return a.length && b.length ? [a, b] : null;
}

/**
 * The band a line gets, or null: THE one predicate (2026-10-20; the range rule since 22 Oct).
 * `motion` is the timeless chart's birth-date motion (timeless.ts birthDateMotion), or an
 * overlay's (overlayBirthDateMotion):
 *   - a RANGED body's MC, IC, ASC or DSC line: the body's range (no `deg` here — stampBands
 *     reads the body's longitude from the positions);
 *   - an aspect line of a ranged body: its range, about its `vlon`, as the angle it really is
 *     (`branch`, not the MC/ASC relabel);
 *   - a midpoint line with a ranged body on either side: the pair's own midpoint range
 *     (midpointRange), about its `vlon`.
 * A line tagged as another chart's (an overlay's) gets none — the bands are the timeless
 * chart's placeholder's — unless the caller says the tagged lines ARE that chart's own
 * family (`tagged`: a progression of a timeless chart on a geodetic map, Lina's §15), and
 * hands in that overlay's motion.
 */
export function bandFor(
  props: BandedLineProps,
  motion: BirthDateMotion,
  opts: { tagged?: boolean } = {},
): BandSpec | null {
  if (props.tag && !opts.tagged) return null;
  const r = (name: PlanetName | undefined) => (name ? motion.ranges.get(name) : undefined);
  if (props.kind === 'aspect') {
    const range = r(props.planet);
    if (!isRanged(range) || !isBandAngle(props.branch) || props.vlon === undefined) return null;
    return { range, angle: props.branch, deg: props.vlon };
  }
  if (props.kind === 'midpoint') {
    if (!isRanged(r(props.planet)) && !isRanged(r(props.planetB))) return null;
    if (!isBandAngle(props.lineType) || props.vlon === undefined) return null;
    const range = midpointRange(motion.samples.get(props.planet), props.planetB ? motion.samples.get(props.planetB) : undefined);
    return { range, angle: props.lineType, deg: props.vlon };
  }
  if (props.kind !== undefined) return null;
  const range = r(props.planet);
  if (!isRanged(range) || !isBandAngle(props.lineType)) return null;
  return { range, angle: props.lineType };
}

// Into [0, 360), leaving a degree already there exactly as it is (a vlon is one).
const norm360 = (d: number) => {
  const r = d % 360;
  return r < 0 ? r + 360 : r;
};

/**
 * `fc` with every banded line carrying its band (`props.band`, bandFor's answer completed):
 * a body's own line placed by that body's longitude in `positions` — the samples the lines
 * were generated from, so the band surrounds its line where it is drawn (CLAUDE.md rule 5) —
 * and every band at `eps`, the tilt they were projected at. A line that already carries a band
 * keeps it; a line with no band, or whose body isn't in `positions`, is passed through as it
 * is. Nothing to stamp gives `fc` itself back, so a collection with no banded line keeps its
 * identity (the map's push skips a source that does).
 */
export function stampBands<P extends LineProps>(
  fc: FeatureCollection<LineString, P>,
  positions: readonly PlanetPosition[],
  motion: BirthDateMotion,
  eps: number,
  opts: { tagged?: boolean } = {},
): FeatureCollection<LineString, P & { band?: LineBand }> {
  const byName = new globalThis.Map(positions.map((p) => [p.name, p] as const));
  let changed = false;
  const features = fc.features.map((f): Feature<LineString, P & { band?: LineBand }> => {
    const props = f.properties as P & BandedLineProps;
    if (props.band) return f;
    const spec = bandFor(props, motion, opts);
    if (!spec) return f;
    let deg = spec.deg;
    if (deg === undefined) {
      const p = byName.get(props.planet);
      if (!p) return f;
      deg = (p.lon ?? raDecToEclipticLon(p.ra, p.dec, eps)) * R2D;
    }
    changed = true;
    const lo = norm360(deg + spec.range.lo);
    const band: LineBand = { lo, hi: lo + (spec.range.hi - spec.range.lo), deg: norm360(deg), angle: spec.angle, eps };
    return { ...f, properties: { ...f.properties, band } };
  });
  return changed ? { ...fc, features } : fc;
}

/** The band's own ring, as the map fills it: the strip between two meridians for an MC or IC
 *  band, the region swept by the end degrees' horizon curves for an ASC or DSC one (the header
 *  says how). `meridianLng` must be the geodetic mapping at `band.eps` — what the line was
 *  drawn with. Null for a ring that would wind round a pole or carries a non-finite point. */
export function bandPolygon(band: LineBand, meridianLng: MeridianLng): [number, number][] | null {
  return band.angle === 'MC' || band.angle === 'IC'
    ? meridianBand(band.lo, band.hi, band.angle, meridianLng, band.eps)
    : horizonBand(band.lo, band.hi, band.angle, meridianLng, band.eps);
}

/**
 * One band per banded line in `drawn` — as `drawn` holds them, so a band follows its line
 * through every filter, the natal-lines hide and the eclipse clean-up — in the line's own
 * colour. A line already carrying `props.band` (stampBands) is filled from that; any other is
 * stamped here first from `positions`, `motion` and `eps`, exactly as stampBands would, which
 * keeps the call App made before bands were carried. A line repeated in `drawn` makes one band,
 * and each band carries its line's key (bandKeyOf), so the map can show one line's alone.
 *
 * `meridianLng` and `eps` are the frame and obliquity the lines were projected with, so each
 * band is centred where its line is drawn (CLAUDE.md rule 5).
 */
export function generateUncertaintyBands(
  drawn: FeatureCollection<LineString, LineProps>,
  positions: readonly PlanetPosition[],
  motion: BirthDateMotion,
  meridianLng: MeridianLng,
  eps: number,
): FeatureCollection<Polygon, UncertaintyBandProps> {
  const stamped = stampBands(drawn, positions, motion, eps);
  const features: Feature<Polygon, UncertaintyBandProps>[] = [];
  const done = new Set<string>();
  for (const f of stamped.features) {
    const props = f.properties as BandedLineProps;
    const { planet, lineType, color, band } = props;
    if (!band) continue;
    const bandKey = bandKeyOf(props);
    const key = `${bandKey}:${band.lo}:${band.hi}`;
    if (done.has(key)) continue;
    done.add(key);
    const ring = bandPolygon(band, meridianLng);
    if (!ring) continue;
    features.push({
      type: 'Feature',
      properties: { planet, lineType, color, opacity: UNCERTAINTY_BAND_OPACITY, bandKey },
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** A band's range as the tips and the listing rows print it, "14°♋–21°♋": each end truncated
 *  to its whole degree in its own sign (format.ts lonRange). A band is drawn only on a geodetic
 *  map, so the zodiac is always the tropical one. */
export function bandRangeText(band: LineBand): string {
  return lonRangeText((band.lo * Math.PI) / 180, { lo: 0, hi: band.hi - band.lo });
}

// ── Reading a band: membership, distance, edges ──────────────────────────────────────────
// For everything that asks about a place against a banded line — the listing tools' "covers
// this point", their ranking by distance, the orb corridor's edges — read from `props.band`
// alone. The mapping is the geodetic one at band.eps, the only one a band is ever drawn in.

const R_KM = 6371;
// Each band's ring, built once per band object (a stamp is never edited: a line's props are
// replaced, not changed, when anything about it moves).
const ringCache = new WeakMap<LineBand, { ring: Pt[] | null }>();

/** The band's ring as the map fills it (bandPolygon at the band's own tilt), built once per
 *  band object — for the corridor and the distances, which read the same ring. */
export function bandOutline(band: LineBand): Pt[] | null {
  let g = ringCache.get(band);
  if (!g) {
    g = { ring: bandPolygon(band, meridianLngFor('geodetic', band.eps, 0)) };
    ringCache.set(band, g);
  }
  return g.ring;
}

/** Is the place inside the band? By the band's DEFINITION, read off the place readout at the
 *  band's tilt: its MC (IC, Ascendant, Descendant) within the range lo…hi. Never a polygon
 *  test — verify-geodetic-chart §1 holds the fill to this, place by place. */
export function bandCovers(band: LineBand, lat: number, lng: number): boolean {
  const g = geodeticAngles(lng, lat, band.eps);
  const a = band.angle === 'MC' ? g.mc : band.angle === 'IC' ? g.ic : band.angle === 'ASC' ? g.asc : g.dsc;
  return norm360(a * R2D - band.lo) <= band.hi - band.lo;
}

/**
 * Whether the band covers the place, and how far the place is from the band's nearest edge
 * (km, along the ground; inside the band, how deep in). The ranking a listing tool gives a
 * banded line (Lina, 20 Oct 2026, §16; our default, put to her in the reply): a place the band
 * covers is ON the line, distance 0; outside it the distance is to the band's edge, never to
 * its centre line. `edgeKm` is NaN for a band whose ring couldn't be built (none the app
 * draws).
 */
export function bandCoverage(band: LineBand, lat: number, lng: number): { covers: boolean; edgeKm: number } {
  const covers = bandCovers(band, lat, lng);
  const ring = bandOutline(band);
  return { covers, edgeKm: ring ? distToPolylineKm(ring, lat, lng) : NaN };
}

// Unit vector of [lng, lat] degrees.
function vec(lng: number, lat: number): [number, number, number] {
  const p = lat * D2R;
  const l = lng * D2R;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
}
const dot3 = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function cross3(a: number[], b: number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
const angle3 = (a: number[], b: number[]) => Math.atan2(Math.hypot(...cross3(a, b)), dot3(a, b));

/** Great-circle distance (km) from a place to a polyline of [lng, lat] — each segment the
 *  great-circle arc between its ends, which the dense rings here (a vertex every degree or
 *  two, closer on the curves) follow to well under a kilometre. Exported for the corridor
 *  suite, which measures "within orb of an edge" by it. */
export function distToPolylineKm(line: readonly (readonly number[])[], lat: number, lng: number): number {
  const P = vec(lng, lat);
  let best = Infinity;
  let A = line.length ? vec(line[0][0], line[0][1]) : null;
  if (A) best = angle3(P, A);
  for (let i = 1; i < line.length && A; i++) {
    const B = vec(line[i][0], line[i][1]);
    best = Math.min(best, angle3(P, B));
    const n = cross3(A, B);
    const nn = Math.hypot(...n);
    if (nn > 1e-15) {
      const u: [number, number, number] = [n[0] / nn, n[1] / nn, n[2] / nn];
      const s = dot3(P, u);
      // The foot of the perpendicular on the arc's great circle: inside the arc when it is on
      // the A→B side of both ends.
      const F = [P[0] - s * u[0], P[1] - s * u[1], P[2] - s * u[2]];
      if (dot3(cross3(A, F), u) >= 0 && dot3(cross3(F, B), u) >= 0) best = Math.min(best, Math.abs(Math.asin(Math.max(-1, Math.min(1, s)))));
    }
    A = B;
  }
  return best * R_KM;
}
