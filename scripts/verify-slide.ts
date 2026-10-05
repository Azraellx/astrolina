// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the SLIDE tool's physics against the real src/lib code (run via the
// harness: `npm run verify:slide`). Slide spins the Earth about its polar axis by
// θ under the natal line-cage, advancing time by Δt = θ / (sidereal rate). The cage
// is recomputed at natal+Δt but mapped through the NATAL sidereal frame, and the Map
// rotates it rigidly by θ while the camera centre counter-rotates by θ. The checks:
//   A. cage pipeline: the resampled cage's MC = (RA(t+Δt) − GMST_natal), i.e. it uses
//      the NATAL frame (so it sits at the un-spun anchor), validated against Swiss RA;
//   B. pinned-except-drift: the cage's only change from natal is the bodies' own RA
//      motion (NO GMST term) — that's what lets the −θ translate / −θ camera cancel;
//   C. spin↔time honesty: θ = Δt·rate equals the REAL Earth rotation (Swiss GMST
//      advance), so "drift +90° E · +6h" describes the actual sky;
//   D. Δt ↔ θ round-trips through the sidereal rate;
//   E. render mechanic: −θ on cage AND −θ on camera leaves each line's screen offset
//      invariant (pinned) while the basemap shifts by exactly θ;
//   F. frame gate: celestial MC carries the GMST dependence the spin acts on; the
//      geodetic MC is GMST-independent — nothing to spin — so Slide is celestial-only;
//   G. tiling: a spin of ANY size reaches MapLibre's GeoJSON tiler whole — the map's own
//      rendered rotation (tiling.ts) agrees, tile by tile, with the same picture made by
//      a small rotation, where the raw unwrapped spin used to lose every line by ~2 days.
import { createRequire } from 'node:module';
// G's tiler. A devDependency of its own (package.json) rather than reached through maplibre-gl's
// tree, where it only resolved because npm happened to hoist it: MapLibre bundles its copy into
// its own build, so this one stands in for it, and its range must track the one maplibre-gl
// declares (^6.1.0 for 5.24) — check it on every MapLibre bump.
import { GeoJSONVT } from '@maplibre/geojson-vt';
import type { FeatureCollection } from 'geojson';
import {
  LINE_SOURCE_OPTS,
  WASH_SOURCE_OPTS,
  translateLng,
  wrapSpin,
} from '../src/components/Map/tiling';
import { generateNightShade } from '../src/lib/astro/nightShade';
import {
  birthDataToJD,
  gmstRadians,
  getPlanetPositions,
  initEphemeris,
  obliquity,
  type PlanetName,
} from '../src/lib/ephemeris';
import { generateLines, meridianLngFor, normLng, type MeridianLng } from '../src/lib/astro/lines';
import type { BirthData } from '../src/lib/birthData';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const node: any = createRequire(import.meta.url)('@swisseph/node');

const RAD2DEG = 180 / Math.PI;
// Must match the app (src/components/Map/Map.tsx): 360° per sidereal day. A
// solar-rate bug (24h day) would show here as a ~1°/day θ error against Swiss.
const SIDEREAL_DEG_PER_HOUR = 360 / 23.9344696;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}
const fmt = (x: number) => x.toExponential(2);
// Smallest signed angle to (−180, 180], so differences near the ±180 seam compare honestly.
const wrap180 = (d: number) => (((d + 180) % 360) + 360) % 360 - 180;

await initEphemeris();

// Independent Greenwich apparent sidereal time straight from Swiss (armc at 0,0) —
// the GMST oracle, none of the app's code.
const gastDeg = (jd: number): number =>
  node.calculateHouses(jd, 0, 0, node.HouseSystem.WholeSign).armc;

const birth = (
  name: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tzOffset: number,
  lat = 0,
  lng = 0,
): BirthData => ({
  name,
  year,
  month,
  day,
  hour,
  minute,
  tzOffset,
  birthplace: { label: name, lat, lng },
});

const CHARTS: BirthData[] = [
  birth('Jim Lewis (seed chart)', 1941, 6, 5, 9, 30, -4, 40.9312, -73.8988),
  birth('standstill Moon', 2025, 3, 7, 18, 0, 0),
  birth('J2000', 2000, 1, 1, 12, 0, 0),
];
const BODY_SET: PlanetName[] = ['Sun', 'Moon', 'Venus', 'Saturn', 'Pluto', 'NorthNode', 'SouthNode'];
// A spread of spins both ways, including > a sidereal day (48h) to exercise wrapping.
const DTS_HOURS = [0.5, 3, 12, 48, -3, -12];

// MC longitude per body, read from the actual line generator (the MC meridian's
// vertices all share one longitude).
function mcLngs(positions: ReturnType<typeof getPlanetPositions>, meridianLng: MeridianLng) {
  const out = new Map<string, number>();
  for (const f of generateLines(positions, meridianLng).features) {
    if (f.properties.lineType === 'MC') {
      out.set(f.properties.planet, (f.geometry.coordinates as [number, number][])[0][0]);
    }
  }
  return out;
}

// ── A–C. Per-chart, per-Δt cage behaviour ────────────────────────────────────
for (const b of CHARTS) {
  const jd0 = birthDataToJD(b);
  const gmst0 = gmstRadians(jd0);
  // The app's celestial recipe, frozen at the NATAL sidereal time — what slideLines
  // maps the resampled positions through (src/App.tsx).
  const meridianLng0: MeridianLng = (ra) => ((ra - gmst0) * 180) / Math.PI;
  const natalPos = getPlanetPositions(jd0, 'mean').filter((p) => BODY_SET.includes(p.name));
  const natalMC = mcLngs(natalPos, meridianLng0);
  const natalRa = new Map(natalPos.map((p) => [p.name, p.ra]));

  for (const dtH of DTS_HOURS) {
    const jdT = jd0 + dtH / 24;
    const posT = getPlanetPositions(jdT, 'mean').filter((p) => BODY_SET.includes(p.name));
    const slideMC = mcLngs(posT, meridianLng0); // the app's slide cage
    const raT = new Map(posT.map((p) => [p.name, p.ra]));

    // A. cage MC == (RA(t+Δt) − GMST_natal): validates the resample + natal-frame map.
    let maxA = 0;
    for (const [body, lng] of slideMC) {
      const expect = normLng(raT.get(body)! * RAD2DEG - gmst0 * RAD2DEG);
      maxA = Math.max(maxA, Math.abs(wrap180(lng - expect)));
    }
    check(`${b.name} Δt=${dtH}h: cage MC = RA(t+Δt) − GMST_natal`, maxA < 1e-6, `max ${fmt(maxA)}°`);

    // B. cage drift from natal == the body's own RA motion (no GMST advance baked in
    //    — that absence is exactly what the −θ translate/camera cancel against).
    let maxDrift = 0;
    let saturnDrift = 0;
    for (const [body, lng] of slideMC) {
      const dRa = wrap180((raT.get(body)! - natalRa.get(body)!) * RAD2DEG);
      const drift = wrap180(lng - natalMC.get(body)!);
      maxDrift = Math.max(maxDrift, Math.abs(wrap180(drift - dRa)));
      if (body === 'Saturn') saturnDrift = Math.abs(drift);
    }
    check(`${b.name} Δt=${dtH}h: cage drift == body RA motion`, maxDrift < 1e-6, `max ${fmt(maxDrift)}°`);
    // Saturn's RA can move ~0.1–0.2°/day (obliquity projection + retrograde loops),
    // still negligible against a θ of tens-to-hundreds of degrees — the cage reads as
    // static while the Earth spins under it.
    check(
      `${b.name} Δt=${dtH}h: slow body barely drifts (cage ~static)`,
      saturnDrift < Math.abs(dtH / 24) * 0.25 + 1e-9,
      `Saturn ${saturnDrift.toFixed(4)}°`,
    );

    // C. θ = Δt·rate equals the REAL Earth rotation (independent Swiss GMST advance):
    //    the camera spins by exactly the sidereal amount for the elapsed time.
    const theta = dtH * SIDEREAL_DEG_PER_HOUR;
    const swissAdvance = wrap180(gastDeg(jdT) - gastDeg(jd0));
    const appAdvance = wrap180((gmstRadians(jdT) - gmst0) * RAD2DEG);
    check(
      `${b.name} Δt=${dtH}h: θ(=Δt·rate) == Swiss GMST advance`,
      Math.abs(wrap180(theta - swissAdvance)) < 0.05,
      `Δ ${Math.abs(wrap180(theta - swissAdvance)).toFixed(4)}°`,
    );
    check(
      `${b.name} Δt=${dtH}h: app gmstRadians advance == Swiss`,
      Math.abs(wrap180(appAdvance - swissAdvance)) < 1e-6,
      `Δ ${fmt(Math.abs(wrap180(appAdvance - swissAdvance)))}°`,
    );
  }
}

// ── D. Δt ↔ θ round-trip through the sidereal rate ────────────────────────────
{
  let maxErr = 0;
  for (const dtH of DTS_HOURS) {
    const back = (dtH * SIDEREAL_DEG_PER_HOUR) / SIDEREAL_DEG_PER_HOUR;
    maxErr = Math.max(maxErr, Math.abs(back - dtH));
  }
  check('Δt ↔ θ round-trips via the sidereal rate', maxErr < 1e-9, `max ${fmt(maxErr)} h`);
}

// ── E. Render mechanic: −θ on cage AND −θ on camera pins the cage; basemap shifts θ ─
// A line at lngL projects by (lngL − centre). Slide sets cage lng → lngL − θ and
// centre → centre − θ, so (cage − centre) is invariant (pinned), while a fixed ground
// point (no −θ) moves by exactly θ relative to the new centre.
{
  const lngL = 37;
  const centre = -20;
  const offset0 = lngL - centre;
  let maxPinErr = 0;
  let maxEarthErr = 0;
  for (const theta of [10, 90, 200, -130, 405]) {
    const pinned = lngL - theta - (centre - theta);
    maxPinErr = Math.max(maxPinErr, Math.abs(pinned - offset0));
    const earthShift = 0 - (centre - theta) - (0 - centre); // fixed ground pt: should be θ
    maxEarthErr = Math.max(maxEarthErr, Math.abs(earthShift - theta));
  }
  check('cage stays pinned under −θ translate + −θ camera', maxPinErr < 1e-9, `max ${fmt(maxPinErr)}°`);
  check('basemap rotates by exactly θ (camera-only)', maxEarthErr < 1e-9, `max ${fmt(maxEarthErr)}°`);
}

// ── F. Frame gate: celestial carries the GMST signal the spin acts on; geodetic doesn't ─
// Vary GMST by δ for a fixed body RA: the celestial MC = (RA − GMST) shifts by −δ
// (it lives in the rotating sidereal frame the Slide tool spins), while the geodetic
// MC = eclipticLonOfRA(RA) is GMST-free — nothing for the spin to act on. Hence Slide
// is gated to the celestial frame; in geodetic the cancellation has no signal to cancel.
// Both frames go through the app's meridian factory, each handed BOTH GMSTs. Until
// 2026-10-02 the geodetic pair was one expression written twice with no GMST in it, so
// it could not have failed; now a factory that read GMST on geodetic would.
{
  const jd0 = birthDataToJD(CHARTS[0]);
  const eps = obliquity(jd0);
  const sat = getPlanetPositions(jd0, 'mean').find((p) => p.name === 'Saturn')!;
  const gmstA = gmstRadians(jd0);
  const delta = 1.234; // radians of extra sidereal rotation
  const celA = normLng(meridianLngFor('celestial', eps, gmstA)(sat.ra));
  const celB = normLng(meridianLngFor('celestial', eps, gmstA + delta)(sat.ra));
  const geoA = normLng(meridianLngFor('geodetic', eps, gmstA)(sat.ra));
  const geoB = normLng(meridianLngFor('geodetic', eps, gmstA + delta)(sat.ra));
  check(
    'celestial MC shifts by −δ under a GMST change (spinnable frame)',
    Math.abs(wrap180(celB - celA - -delta * RAD2DEG)) < 1e-6,
    `Δ ${fmt(Math.abs(wrap180(celB - celA + delta * RAD2DEG)))}°`,
  );
  check('geodetic MC is GMST-independent (nothing to spin → celestial-only gate)', geoA === geoB);
}

// ── G. Tiling: a spin of any size reaches the tiler whole ────────────────────────
// The map rotates the pinned linework by the RENDERED spin (wrapSpin) through translateLng
// with `tiled` set, and hands it to MapLibre's GeoJSON tiler — @maplibre/geojson-vt, the
// package MapLibre runs in its worker — with each source's own options, all imported from the
// map's tiling.ts. That tiler folds in only one world copy either side of the main one and
// drops anything further out, so the raw unwrapped spin, which Slide used to feed it, thinned
// the lines out after about a day and lost them all by two (bug #3; item #2's runaway track
// press reached ~4.96 million degrees). The comparison is two parts agreeing rather than a
// count against a formula: for each spin, every (tile, feature) pair that the SAME picture
// made by a small plain rotation (θ minus its whole turns) puts in a tile of z0–z2 must be in
// the app's tiles too, and every feature must reach the world tile. (Not set EQUALITY: the
// small rotation can itself carry a long line to the fold's edge, where the app's per-feature
// turn keeps a sliver of tile buffer the reference loses — more, never less.) A control
// confirms the hazard is real: the unwrapped spin at 800° must lose features, or this
// section is guarding nothing.
{
  // MapLibre's GeoJSONSource hands geojson-vt its pixel options scaled to tile units
  // (× EXTENT / tileSize = 8192 / 512) with maxZoom 18 — restated from its source, as the
  // one thing in this section the app doesn't own.
  const index = (fc: FeatureCollection, o: { buffer: number; tolerance: number }) =>
    new GeoJSONVT(fc, { buffer: o.buffer * 16, tolerance: o.tolerance * 16, extent: 8192, maxZoom: 18 });
  const tagKey = (tags: unknown) => {
    const t = (tags ?? {}) as Record<string, unknown>;
    return `${t.planet ?? 'night'}|${t.lineType ?? ''}`;
  };
  const present = (fc: FeatureCollection, o: { buffer: number; tolerance: number }) => {
    const vt = index(fc, o);
    const seen = new Set<string>();
    for (let z = 0; z <= 2; z++) {
      for (let x = 0; x < 2 ** z; x++) {
        for (let y = 0; y < 2 ** z; y++) {
          for (const f of vt.getTile(z, x, y)?.features ?? []) seen.add(`${z}/${x}/${y}:${tagKey(f.tags)}`);
        }
      }
    }
    return seen;
  };
  const missingFrom = (app: Set<string>, reference: Set<string>) => [...reference].filter((k) => !app.has(k));
  const worldTileKeys = (s: Set<string>) =>
    new Set([...s].filter((k) => k.startsWith('0/0/0:')).map((k) => k.slice(6)));

  const jd0 = birthDataToJD(CHARTS[0]);
  const gmst0 = gmstRadians(jd0);
  const meridianLng0: MeridianLng = (ra) => ((ra - gmst0) * 180) / Math.PI;
  const lines = generateLines(getPlanetPositions(jd0, 'mean'), meridianLng0) as FeatureCollection;
  const night = generateNightShade(jd0, '#000', 0.3) as FeatureCollection;
  const sets: [string, FeatureCollection, { buffer: number; tolerance: number }][] = [
    ['natal lines', lines, LINE_SOURCE_OPTS],
    ['night shade', night, WASH_SOURCE_OPTS],
  ];
  // Both directions, across the fold edges (±540°), past a few days, and item #2's runaway.
  const SPINS = [0.5, 179.5, 180, 359, 540, 600, 800, 1000, 3 * 24 * SIDEREAL_DEG_PER_HOUR, -540, -800, 4_959_993.7];
  for (const [name, fc, opts] of sets) {
    const allKeys = new Set(fc.features.map((f) => tagKey(f.properties)));
    let worst = '';
    let worstWorld = '';
    for (const theta of SPINS) {
      const small = theta - 360 * Math.round(theta / 360);
      const reference = present(translateLng(fc, -small), opts);
      const app = present(translateLng(fc, -wrapSpin(theta), true), opts);
      const missing = missingFrom(app, reference);
      if (missing.length) worst ||= `${theta}°: ${missing.length} missing, e.g. ${missing[0]}`;
      const world = worldTileKeys(app);
      if (world.size !== allKeys.size) worstWorld ||= `${theta}°: ${world.size} of ${allKeys.size}`;
    }
    check(`${name}: every spin tiles as much as its small equivalent (z0–z2)`, !worst, worst || `${SPINS.length} spins`);
    check(`${name}: every feature reaches the world tile at every spin`, !worstWorld, worstWorld || `${allKeys.size} features`);
  }
  const reference = present(lines, LINE_SOURCE_OPTS);
  const unfolded = present(translateLng(lines, -800), LINE_SOURCE_OPTS);
  check(
    'control: an UNWRAPPED 800° spin loses lines in the tiler (the hazard G guards)',
    unfolded.size < reference.size,
    `${unfolded.size} of ${reference.size} tile-features left`,
  );
}

console.log(failures === 0 ? '\nAll slide checks passed.' : `\n${failures} slide check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
