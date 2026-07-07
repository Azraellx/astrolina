// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the PARAN math of the real src/lib code (run via the harness:
// `npm run verify:parans`). A paran is a latitude where two bodies stand on
// their angles at the same instant — A culminating while B rises, two bodies
// rising together, and so on. The closed forms in parans.ts are checked two
// independent ways:
//   1. Simultaneity: at (paran latitude, intersection longitude) at the chart
//      instant, body A really is on its meridian / horizon and body B really is
//      on the horizon (vector-form altitudes + hour angles), with the
//      rising/setting LABELS confirmed against the actual sign of d(alt)/dt.
//   2. Completeness: an independent brute-force latitude scan with bisection
//      must find exactly the paran set the closed forms produce — nothing
//      missing, nothing extra (within the scan's resolution).
// Plus the mirrored-solution symmetry of horizon×horizon pairs, and numeric
// notes on the two guards in paranLat (the |tanφ|>6 cap and the ±72° clip).
import { createRequire } from 'node:module';
import {
  birthDataToJD,
  eclipticLonOfRA,
  gmstRadians,
  getPlanetPositions,
  initEphemeris,
  obliquity,
  projectOntoEcliptic,
  type PlanetName,
  type PlanetPosition,
} from '../src/lib/ephemeris';
import { generateParans, generateStarParans, type ParanProps } from '../src/lib/astro/parans';
import { generateLines, normLng, type MeridianLng } from '../src/lib/astro/lines';
import { starsOfDate } from '../src/lib/astro/starLines';
import type { BirthData } from '../src/lib/birthData';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const node: any = createRequire(import.meta.url)('@swisseph/node');

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const gastCache = new Map<number, number>();
function gastRad(jd: number): number {
  let v = gastCache.get(jd);
  if (v === undefined) {
    v = node.calculateHouses(jd, 0, 0, node.HouseSystem.WholeSign).armc * DEG2RAD;
    gastCache.set(jd, v!);
  }
  return v!;
}

// Geocentric altitude of a fixed (ra, dec) from a place at an instant — vector
// form, independent of the hour-angle algebra in parans.ts.
function altitudeOf(jd: number, ra: number, dec: number, latDeg: number, lngDeg: number): number {
  const theta = gastRad(jd) + lngDeg * DEG2RAD;
  const phi = latDeg * DEG2RAD;
  const dot =
    Math.cos(phi) * Math.cos(dec) * Math.cos(theta - ra) + Math.sin(phi) * Math.sin(dec);
  return Math.asin(Math.max(-1, Math.min(1, dot)));
}

function altSlope(jd: number, ra: number, dec: number, latDeg: number, lngDeg: number): number {
  const dt = 30 / 86400;
  return (
    (altitudeOf(jd + dt, ra, dec, latDeg, lngDeg) - altitudeOf(jd - dt, ra, dec, latDeg, lngDeg)) /
    (2 * dt)
  );
}

const normDelta = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));

await initEphemeris();

const CHART: BirthData = {
  name: 'paran battery',
  year: 1941,
  month: 6,
  day: 5,
  hour: 9,
  minute: 30,
  tzOffset: -4,
  birthplace: { label: 'Yonkers', lat: 40.9312, lng: -73.8988 },
};
const jd = birthDataToJD(CHART);
const gmst = gmstRadians(jd);
const BODY_SET: PlanetName[] = ['Sun', 'Moon', 'Venus', 'Saturn', 'Pluto'];
const positions = getPlanetPositions(jd, 'mean').filter((p) => BODY_SET.includes(p.name));
const byName = new Map(positions.map((p) => [p.name, p]));
// The App's celestial meridian mapping (App.tsx): RA − GMST, in degrees.
const celestialLng: MeridianLng = (ra) => ((ra - gmst) * 180) / Math.PI;
const parans = generateParans(positions, celestialLng);
const props = parans.features.map((f) => f.properties as ParanProps);

console.log(`generated parans: ${props.length}`);

// ── 1. Simultaneity + labels at every generated paran ─────────────────────────
{
  let worstHorizonAlt = 0; // how far off the horizon the "on the horizon" body is
  let worstMeridian = 0; // how far off the meridian the culminating body is
  let labelErrors = 0;
  for (const p of props) {
    const A = byName.get(p.planetA)!;
    const B = byName.get(p.planetB)!;
    const lat = p.latitude;
    const lng = p.intersectionLng;

    // Body B is on the horizon at the chart instant at the intersection point.
    const altB = Math.abs(altitudeOf(jd, B.ra, B.dec, lat, lng));
    if (altB > worstHorizonAlt) worstHorizonAlt = altB;
    // ...and its ASC/DSC label matches whether it is actually rising there.
    const rising = altSlope(jd, B.ra, B.dec, lat, lng) > 0;
    if ((p.angleB === 'ASC') !== rising) labelErrors += 1;

    if (p.angleA === 'MC' || p.angleA === 'IC') {
      // A's hour angle at the intersection: 0 on the MC, π on the IC.
      const H = normDelta(gastRad(jd) + lng * DEG2RAD - A.ra);
      const err = p.angleA === 'MC' ? Math.abs(H) : Math.abs(Math.abs(H) - Math.PI);
      if (err > worstMeridian) worstMeridian = err;
    } else {
      // Horizon × horizon: A is on the horizon too, with a matching label.
      const altA = Math.abs(altitudeOf(jd, A.ra, A.dec, lat, lng));
      if (altA > worstHorizonAlt) worstHorizonAlt = altA;
      const risingA = altSlope(jd, A.ra, A.dec, lat, lng) > 0;
      if ((p.angleA === 'ASC') !== risingA) labelErrors += 1;
    }
  }
  check('paran horizon body altitude 0 at intersection', worstHorizonAlt < 1e-9, `max ${worstHorizonAlt.toExponential(2)} rad`);
  check('paran meridian body on MC/IC at intersection', worstMeridian < 1e-9, `max ${worstMeridian.toExponential(2)} rad`);
  check('paran ASC/DSC labels match actual rising/setting', labelErrors === 0, `${labelErrors} mislabeled`);
}

// ── 1b. theta — the pairing's shared sidereal time holds along the whole line ──
// ParanProps.theta claims: wherever local sidereal time equals theta, both
// bodies stand on their claimed angles (the paran recurring with the daily
// turn, at ANY longitude along the latitude). For each paran, solve the
// instant LST hits theta at three longitudes — the intersection plus two
// arbitrary ones — and re-run the section-1 angle conditions there against the
// chart's fixed (ra, dec). Cross-validates theta jointly against the latitude
// and both bodies, on the sidereal-time side the intersection checks never
// exercise directly.
{
  const TWO_PI = Math.PI * 2;
  const RATE = TWO_PI * 1.00273790935; // mean sidereal turn rate, rad/day
  const wrap2pi = (x: number) => ((x % TWO_PI) + TWO_PI) % TWO_PI;
  let worstAlt = 0;
  let worstMeridian = 0;
  let badRange = 0;
  for (const p of props) {
    if (!(Number.isFinite(p.theta) && p.theta >= 0 && p.theta < TWO_PI)) {
      badRange += 1;
      continue;
    }
    const A = byName.get(p.planetA)!;
    const B = byName.get(p.planetB)!;
    for (const lng of [p.intersectionLng, -117.25, 31.5]) {
      // The instant local sidereal time reaches theta at this longitude: one
      // wrapped sidereal step from the chart instant, one refinement.
      let jdT = jd + wrap2pi(p.theta - lng * DEG2RAD - gastRad(jd)) / RATE;
      jdT += normDelta(p.theta - lng * DEG2RAD - gastRad(jdT)) / RATE;
      const altB = Math.abs(altitudeOf(jdT, B.ra, B.dec, p.latitude, lng));
      if (altB > worstAlt) worstAlt = altB;
      if (p.angleA === 'MC' || p.angleA === 'IC') {
        const H = normDelta(gastRad(jdT) + lng * DEG2RAD - A.ra);
        const err = p.angleA === 'MC' ? Math.abs(H) : Math.abs(Math.abs(H) - Math.PI);
        if (err > worstMeridian) worstMeridian = err;
      } else {
        const altA = Math.abs(altitudeOf(jdT, A.ra, A.dec, p.latitude, lng));
        if (altA > worstAlt) worstAlt = altA;
      }
    }
  }
  check('theta in [0, 2π) on every paran', badRange === 0, `${badRange} out of range`);
  check('theta: horizon bodies on the horizon when LST = theta (3 lngs each)', worstAlt < 1e-6, `max ${worstAlt.toExponential(2)} rad`);
  check('theta: meridian bodies on the MC/IC when LST = theta (3 lngs each)', worstMeridian < 1e-6, `max ${worstMeridian.toExponential(2)} rad`);
}

// ── 2. Completeness vs an independent brute-force scan ────────────────────────
// For each configuration, scan latitude and root-find where the constraint
// crosses zero, using only textbook horizon algebra (no parans.ts code). Every
// root must appear in the generated set and vice versa.
{
  type Found = { a: PlanetName; angleA: 'MC' | 'IC' | 'ASC' | 'DSC'; b: PlanetName; angleB: 'ASC' | 'DSC'; lat: number };
  const found: Found[] = [];

  // Altitude of body B at the sidereal moment body A sits on a given angle, as
  // a function of latitude. Roots in φ are the meridian×horizon parans.
  const altBatThetaOf = (theta: number, B: PlanetPosition) => (latDeg: number) => {
    const phi = latDeg * DEG2RAD;
    return Math.asin(
      Math.max(-1, Math.min(1,
        Math.cos(phi) * Math.cos(B.dec) * Math.cos(theta - B.ra) + Math.sin(phi) * Math.sin(B.dec),
      )),
    );
  };
  const bisect = (f: (x: number) => number, lo: number, hi: number): number => {
    let a = lo;
    let b = hi;
    for (let i = 0; i < 60; i++) {
      const m = (a + b) / 2;
      if ((f(a) <= 0) === (f(m) <= 0)) a = m;
      else b = m;
    }
    return (a + b) / 2;
  };

  for (const A of positions) {
    for (const B of positions) {
      if (A.name === B.name) continue;
      for (const angleA of ['MC', 'IC'] as const) {
        const theta = A.ra + (angleA === 'IC' ? Math.PI : 0);
        const f = altBatThetaOf(theta, B);
        for (let lat = -72; lat < 72; lat += 0.1) {
          const y0 = f(lat);
          const y1 = f(lat + 0.1);
          if ((y0 <= 0) === (y1 <= 0)) continue;
          const root = bisect(f, lat, lat + 0.1);
          // Label by whether B is rising at that sidereal moment: with frozen
          // positions, d(alt)/dθ ∝ −sin(θ − ra).
          const angleB: 'ASC' | 'DSC' = -Math.sin(theta - B.ra) > 0 ? 'ASC' : 'DSC';
          found.push({ a: A.name, angleA, b: B.name, angleB, lat: root });
        }
      }
    }
  }

  // Horizon×horizon: at each latitude both bodies have (up to) two horizon
  // crossings per sidereal day; a paran is where one of A's coincides with one
  // of B's. Track each rise/set pairing's sidereal-time gap across latitude.
  const horizonTheta = (P: PlanetPosition, latDeg: number, which: 'rise' | 'set'): number | null => {
    const x = -Math.tan(latDeg * DEG2RAD) * Math.tan(P.dec);
    if (x < -1 || x > 1) return null;
    // alt(θ) = 0 at hour angle ±H0; rising at −H0 (altitude increasing), setting at +H0.
    const H0 = Math.acos(x);
    return P.ra + (which === 'rise' ? -H0 : H0);
  };
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const A = positions[i];
      const B = positions[j];
      for (const wa of ['rise', 'set'] as const) {
        for (const wb of ['rise', 'set'] as const) {
          const g = (latDeg: number): number | null => {
            const ta = horizonTheta(A, latDeg, wa);
            const tb = horizonTheta(B, latDeg, wb);
            if (ta === null || tb === null) return null;
            return normDelta(ta - tb);
          };
          for (let lat = -72; lat < 72; lat += 0.1) {
            const y0 = g(lat);
            const y1 = g(lat + 0.1);
            if (y0 === null || y1 === null) continue;
            if ((y0 <= 0) === (y1 <= 0)) continue;
            if (Math.abs(y0) > 1 || Math.abs(y1) > 1) continue; // ±π wrap, not a root
            const root = bisect((x) => g(x) ?? NaN, lat, lat + 0.1);
            found.push({
              a: A.name,
              angleA: wa === 'rise' ? 'ASC' : 'DSC',
              b: B.name,
              angleB: wb === 'rise' ? 'ASC' : 'DSC',
              lat: root,
            });
          }
        }
      }
    }
  }

  // Match the two sets both ways. Generated horizon×horizon parans are stored
  // for unordered pairs, so allow the scan's (A,B) to match a generated (B,A).
  const matches = (f: Found, p: ParanProps) =>
    Math.abs(f.lat - p.latitude) < 0.02 &&
    ((p.planetA === f.a && p.angleA === f.angleA && p.planetB === f.b && p.angleB === f.angleB) ||
      (p.planetA === f.b && p.planetB === f.a && p.angleA === f.angleB && p.angleB === f.angleA &&
        (p.angleA === 'ASC' || p.angleA === 'DSC')));

  const missing = found.filter((f) => !props.some((p) => matches(f, p)));
  const extra = props.filter((p) => !found.some((f) => matches(f, p)));
  check(
    `completeness: every brute-force paran generated (${found.length} scanned)`,
    missing.length === 0,
    missing.slice(0, 4).map((m) => `${m.a} ${m.angleA} × ${m.b} ${m.angleB} @ ${m.lat.toFixed(2)}°`).join('; '),
  );
  check(
    'completeness: no spurious generated parans',
    extra.length === 0,
    extra.slice(0, 4).map((p) => `${p.planetA} ${p.angleA} × ${p.planetB} ${p.angleB} @ ${p.latitude.toFixed(2)}°`).join('; '),
  );
}

// ── 3. Horizon×horizon mirror symmetry ────────────────────────────────────────
// The two sidereal-time solutions of each pair sit at mirrored latitudes. Only
// observable here when both survive the ±72° clip.
{
  const hh = props.filter((p) => p.angleA === 'ASC' || p.angleA === 'DSC');
  const byPair = new Map<string, ParanProps[]>();
  for (const p of hh) {
    const key = `${p.planetA}|${p.planetB}`;
    byPair.set(key, [...(byPair.get(key) ?? []), p]);
  }
  let worst = 0;
  let pairs = 0;
  for (const list of byPair.values()) {
    if (list.length !== 2) continue;
    pairs += 1;
    const d = Math.abs(list[0].latitude + list[1].latitude);
    if (d > worst) worst = d;
  }
  check(`horizon×horizon solutions mirror in latitude (${pairs} pairs)`, worst < 1e-9, `max |lat1+lat2| ${worst.toExponential(2)}°`);
}

// ── 4. Notes (numeric facts for the audit report) ─────────────────────────────
{
  // The |tan dec| < 1e-6 equator skip: a body sits inside that window only
  // while |dec| < 0.21″ — for the Sun, under ~10 s around an equinox crossing.
  console.log(`  note: equator-skip window |dec| < ${(Math.atan(1e-6) * RAD2DEG * 3600).toFixed(2)}″`);
}

// ── 5. Frame consistency with the drawn lines, celestial AND geodetic ─────────
// The paran's recorded intersection point is the badge's fly-to target; it must
// land where the drawn lines visibly cross the paran latitude, in BOTH line
// systems (in Mundane/geodetic mode the meridian mapping changes — a celestial-
// frame fly-to would miss the drawn crossing by roughly the GMST, ~96° here).
{
  const eps = obliquity(jd);
  const geodeticLng: MeridianLng = (ra) => (eclipticLonOfRA(ra, eps) * 180) / Math.PI;
  const frames: Array<[string, PlanetPosition[], MeridianLng]> = [
    ['celestial', positions, celestialLng],
    ['geodetic', projectOntoEcliptic(positions, jd).filter((p) => BODY_SET.includes(p.name)), geodeticLng],
  ];
  for (const [frame, pos, ml] of frames) {
    const ps = generateParans(pos, ml);
    const ls = generateLines(pos, ml);
    const byKey = new Map(
      ls.features.map((f) => [`${f.properties.planet}|${f.properties.lineType}`, f.geometry.coordinates as [number, number][]]),
    );
    let worstMc = 0; // intersectionLng vs the drawn MC/IC meridian longitude
    let worstHorizon = 0; // distance from the horizon curve to the intersection point
    for (const f of ps.features) {
      const p = f.properties as ParanProps;
      if (p.angleA === 'MC' || p.angleA === 'IC') {
        const meridian = byKey.get(`${p.planetA}|${p.angleA}`)!;
        const d = Math.abs(normLng(p.intersectionLng - meridian[0][0]));
        if (d > worstMc) worstMc = d;
      }
      // The horizon body's drawn curve must pass through the intersection point
      // (within polyline sampling).
      const curve = byKey.get(`${p.planetB}|${p.angleB}`)!;
      let best = Infinity;
      for (const [lng, lat] of curve) {
        const d = Math.hypot(normLng(lng - p.intersectionLng), lat - p.latitude);
        if (d < best) best = d;
      }
      if (best > worstHorizon) worstHorizon = best;
    }
    check(`${frame}: paran fly-to sits on the drawn MC/IC meridian`, worstMc < 1e-9, `max Δlng ${worstMc.toExponential(2)}°`);
    check(`${frame}: drawn horizon curve passes through the fly-to point`, worstHorizon < 1.2, `max miss ${worstHorizon.toFixed(3)}° (vertex spacing)`);
  }
}

// ── 6. Fixed-star × planet parans ─────────────────────────────────────────────
// Same closed forms with a star's equinox-of-date position on one side; same
// oracles: every listed paran is a genuine simultaneity (the star and the
// planet really stand on their named angles at the same instant at that
// latitude), labels match actual rising/setting, and an independent latitude
// scan finds exactly the listed set.
{
  const stars = starsOfDate(jd, 'bright');
  const starByName = new Map(stars.map((s) => [s.name, s]));
  const planetSub = positions.filter((p) => ['Sun', 'Venus', 'Saturn'].includes(p.name));
  const sp = generateStarParans(stars, planetSub, celestialLng, '#cdbf8f');
  const spProps = sp.features.map((f) => f.properties as ParanProps);
  console.log(`generated star parans: ${spProps.length} (${stars.length} stars × ${planetSub.length} planets)`);

  let worstAlt = 0;
  let worstMeridian = 0;
  let labelErrors = 0;
  for (const p of spProps) {
    const star = starByName.get(p.star!)!;
    const planet = byName.get(p.planetA)!;
    // Parse who is on which angle from the label convention: the star side is
    // prefixed "★". The meridian body has angle MC/IC; horizon bodies ASC/DSC.
    const starFirst = p.label.startsWith('★');
    const aBody = starFirst ? star : planet;
    const bBody = starFirst ? planet : star;
    const lat = p.latitude;
    const lng = p.intersectionLng;
    const theta = gastRad(jd) + lng * DEG2RAD;

    const checkSide = (body: { ra: number; dec: number }, angle: string) => {
      if (angle === 'MC' || angle === 'IC') {
        const H = normDelta(theta - body.ra);
        const err = angle === 'MC' ? Math.abs(H) : Math.abs(Math.abs(H) - Math.PI);
        if (err > worstMeridian) worstMeridian = err;
      } else {
        const alt = Math.abs(altitudeOf(jd, body.ra, body.dec, lat, lng));
        if (alt > worstAlt) worstAlt = alt;
        const rising = altSlope(jd, body.ra, body.dec, lat, lng) > 0;
        if ((angle === 'ASC') !== rising) labelErrors += 1;
      }
    };
    checkSide(aBody, p.angleA);
    checkSide(bBody, p.angleB);
  }
  check('star parans: horizon bodies on the horizon', worstAlt < 1e-9, `max ${worstAlt.toExponential(2)} rad`);
  check('star parans: meridian bodies on the MC/IC', worstMeridian < 1e-9, `max ${worstMeridian.toExponential(2)} rad`);
  check('star parans: ASC/DSC labels match actual rising/setting', labelErrors === 0, `${labelErrors} mislabeled`);

  // Completeness for one star × one planet: a brute-force latitude scan of all
  // angle-event coincidences must reproduce exactly the generated set.
  const star = stars.find((s) => s.name === 'Regulus') ?? stars[0];
  const planet = byName.get('Saturn')!;
  const one = generateStarParans([star], [planet], celestialLng, '#cdbf8f')
    .features.map((f) => f.properties as ParanProps);
  const eventTheta = (b: { ra: number; dec: number }, which: string, latDeg: number): number | null => {
    if (which === 'MC') return b.ra;
    if (which === 'IC') return b.ra + Math.PI;
    const x = -Math.tan(latDeg * DEG2RAD) * Math.tan(b.dec);
    if (x < -1 || x > 1) return null;
    return b.ra + (which === 'ASC' ? -Math.acos(x) : Math.acos(x));
  };
  // Every angle pairing except both-on-meridian (two meridian events share a
  // sidereal time only when the bodies share a meridian — vertical lines, no
  // latitude — matching the generators' exclusion).
  const combos: Array<[string, string]> = [];
  for (const aw of ['MC', 'IC', 'ASC', 'DSC']) {
    for (const bw of ['MC', 'IC', 'ASC', 'DSC']) {
      const aMer = aw === 'MC' || aw === 'IC';
      const bMer = bw === 'MC' || bw === 'IC';
      if (aMer && bMer) continue;
      combos.push([aw, bw]);
    }
  }
  let scanned = 0;
  let missing = 0;
  for (const [starAngle, planetAngle] of combos) {
    const g = (latDeg: number): number | null => {
      const ts = eventTheta(star, starAngle, latDeg);
      const tp = eventTheta(planet, planetAngle, latDeg);
      if (ts === null || tp === null) return null;
      return normDelta(ts - tp);
    };
    for (let lat = -72; lat < 72; lat += 0.1) {
      const y0 = g(lat);
      const y1 = g(lat + 0.1);
      if (y0 === null || y1 === null) continue;
      if ((y0 <= 0) === (y1 <= 0)) continue;
      if (Math.abs(y0) > 1 || Math.abs(y1) > 1) continue; // ±π wrap, not a root
      let lo = lat;
      let hi = lat + 0.1;
      for (let i = 0; i < 50; i++) {
        const m = (lo + hi) / 2;
        if (((g(lo) ?? NaN) <= 0) === ((g(m) ?? NaN) <= 0)) lo = m;
        else hi = m;
      }
      const root = (lo + hi) / 2;
      scanned += 1;
      // The scan also finds planet-MC × star-horizon as star-ASC × planet-...;
      // match on the angle pair regardless of label order.
      const found = one.some((p) => {
        if (Math.abs(p.latitude - root) > 0.02) return false;
        const starFirst = p.label.startsWith('★');
        const sAngle = starFirst ? p.angleA : p.angleB;
        const pAngle = starFirst ? p.angleB : p.angleA;
        return sAngle === starAngle && pAngle === planetAngle;
      });
      if (!found) missing += 1;
    }
  }
  check(
    `star parans completeness (Regulus × Saturn): scan ↔ generated (${scanned} scanned, ${one.length} generated)`,
    missing === 0 && scanned === one.length,
    `${missing} missing`,
  );
}

// ── Overlay frame (one-frame rule) ────────────────────────────────────────────
// While an overlay is active the App feeds the paran generator that overlay's OWN
// single frame (transits/progressions/…), and the natal set is hidden. The generator
// is frame-agnostic, so single-frame simultaneity must hold on a transit set exactly
// as on the natal one, and every row must pair two bodies of that ONE set. (The
// SELECTION — natal parans hidden under any overlay — and the Cyclocartography
// suppression are App-wiring policy: docs/core-integration-seams.md L23, not generator
// math, so they're covered by the seam doc + manual QA rather than this unit.)
{
  const trJd = jd + 3653; // ~10 years on: a distinct sky, same battery of bodies
  const trGmst = gmstRadians(trJd);
  const trPos = getPlanetPositions(trJd, 'mean').filter((p) => BODY_SET.includes(p.name));
  const trByName = new Map(trPos.map((p) => [p.name, p]));
  const trLng: MeridianLng = (ra) => ((ra - trGmst) * 180) / Math.PI;
  const trProps = generateParans(trPos, trLng).features.map((f) => f.properties as ParanProps);
  let worstHorizon = 0;
  let worstMeridian = 0;
  let single = true;
  for (const p of trProps) {
    if (!trByName.has(p.planetA) || !trByName.has(p.planetB)) {
      single = false;
      continue;
    }
    const A = trByName.get(p.planetA)!;
    const B = trByName.get(p.planetB)!;
    const { latitude: lat, intersectionLng: lng } = p;
    const altB = Math.abs(altitudeOf(trJd, B.ra, B.dec, lat, lng));
    if (altB > worstHorizon) worstHorizon = altB;
    if (p.angleA === 'MC' || p.angleA === 'IC') {
      const H = normDelta(gastRad(trJd) + lng * DEG2RAD - A.ra);
      const err = p.angleA === 'MC' ? Math.abs(H) : Math.abs(Math.abs(H) - Math.PI);
      if (err > worstMeridian) worstMeridian = err;
    } else {
      const altA = Math.abs(altitudeOf(trJd, A.ra, A.dec, lat, lng));
      if (altA > worstHorizon) worstHorizon = altA;
    }
  }
  console.log(`overlay-frame parans generated: ${trProps.length}`);
  check('overlay frame: every paran pairs two bodies of the single overlay set', single);
  check('overlay frame: horizon body altitude 0 at intersection (transit set)', worstHorizon < 1e-9, `max ${worstHorizon.toExponential(2)} rad`);
  check('overlay frame: meridian body on MC/IC at intersection (transit set)', worstMeridian < 1e-9, `max ${worstMeridian.toExponential(2)} rad`);
}

console.log(failures === 0 ? '\nverify-parans: ALL PASS' : `\nverify-parans: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
