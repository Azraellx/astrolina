// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verify the offline lat/lng → country lookup against the bundled Natural Earth
// 1:110m set. The lookup ray-casts in plain lng/lat, which has no idea longitude
// is periodic, so the whole of its risk sits at the ±180° seam: Natural Earth
// cuts a country that crosses it into one ring that steps the width of the map,
// and reading that step as a real segment puts its whole latitude band inside
// the country — Greenland answered "Russia". These checks fix that behaviour in
// place: the seam countries, a band sweep where the bug showed, the periodicity
// longitude must obey, and a bulk cross-check against the GeoNames cities.
//
//   node scripts/harness/run.mjs scripts/verify-countries.ts
import { feature } from 'topojson-client';
import topo from 'world-atlas/countries-110m.json';
import { countryHitOf, countryOf } from '../src/lib/atlas/countryOf';
import rows from '../src/lib/atlas/data/cities15000.json';
import countryNames from '../src/lib/atlas/data/countries.json';
import countryNum from '../src/lib/atlas/data/countryNum.json';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function at(name: string, lat: number, lng: number, want: string | null) {
  const got = countryOf(lat, lng);
  check(`${name} (${lat}, ${lng}) → ${want ?? 'null'}`, got === want, `got ${got ?? 'null'}`);
}

// ── Russia's band: the reported bug ──────────────────────────────────────────
// Its cut ring spans 65°N–71°N, so the whole band read Russia. Interior points,
// well clear of the 110m coastline's generalization.
at('Greenland ice sheet, 67°N', 67, -45, 'Greenland');
at('Greenland ice sheet, 69°N', 69, -42, 'Greenland');
at('Greenland ice sheet, 71°N', 71, -38, 'Greenland');
at('Greenland ice sheet, 65°N', 65, -45, 'Greenland');
at('Greenland, Summit Camp', 72.58, -38.46, 'Greenland');
at('Greenland, Peary Land', 82.5, -33, 'Greenland');
at('Labrador Sea', 67, -58, null);
at('Norwegian Sea', 69, -5, null);
at('Iceland interior', 64.9, -18.6, 'Iceland');
at('Canada, Nunavut', 67, -95, 'Canada');
at('Sweden, Lapland', 67, 19, 'Sweden');
at('Alaska, Brooks Range', 68, -150, 'United States of America');
// The same cut left Russia's OWN land in the band one crossing over, so it read
// as nothing at all.
at('Russia, Murmansk', 68.97, 33.08, 'Russia');
at('Russia, Novyy Urengoy', 66.08, 76.63, 'Russia');
at('Russia, Siberia', 67, 100, 'Russia');

// ── Fiji's band ─────────────────────────────────────────────────────────────
// Fiji is the FIRST feature in the set and its cut ring spans 16°S–17°S, so it
// won that band outright, ahead of every country actually there.
at('Bolivia, La Paz', -16.5, -68.15, 'Bolivia');
at('Brazil, Mato Grosso', -16.25, -55, 'Brazil');
at('Australia, Northern Territory', -16.5, 133, 'Australia');
at('Angola, Kwanza', -16.25, 15, 'Angola');
at('Indian Ocean, 16°S', -16.5, 70, null);

// ── The seam countries themselves still resolve, on both sides ──────────────
at('Russia, Chukotka (past 180°)', 66, -175, 'Russia');
at('Russia, Wrangel Island', 71.2, -179.5, 'Russia');
at('Russia, Wrangel Island (east side)', 71.2, 179.5, 'Russia');
at('Russia, Kaliningrad', 54.7, 20.5, 'Russia');
at('Fiji, Vanua Levu', -16.6, 179.3, 'Fiji');
at('Fiji, on the seam', -16.5, -180, 'Fiji');
at('Fiji, on the seam from the east', -16.5, 180, 'Fiji');

// ── Antarctica: a loop around the pole, cut at the seam ─────────────────────
// The cut leaves the cap it encloses outside the ring, so the pole itself read
// as open ocean until closeAtPole closed the loop through 90°S.
at('Antarctica, South Pole', -89.5, 0, 'Antarctica');
at('Antarctica, 85°S', -85, 0, 'Antarctica');
at('Antarctica, 86°S', -86, -120, 'Antarctica');
at('Antarctica, Queen Maud Land', -75, 10, 'Antarctica');
at('Antarctica, Vostok', -78.46, 106.84, 'Antarctica');
// Closing the loop must not swallow the sea north of it. Natural Earth's land
// ends at the grounding line — the floating shelves are a different layer — so
// the Ross Ice Shelf is not Antarctica here, and the boundary at 160°W sits at
// 85.26°S with open shelf immediately north of it.
at('Ross Ice Shelf (floating)', -82, 175, null);
at('Siple Coast, north of the grounding line', -85.25, -159.75, null);
at('Southern Ocean, 60°S', -60, 175, null);

// ── Dataset canary ──────────────────────────────────────────────────────────
// repairRing mends two shapes of cut: one that crosses the seam and comes back,
// and one that winds around a pole with a single cut. A pole-winding ring cut
// more than once is a shape it cannot close, and countryOf DROPS such a polygon
// rather than keep a cut that would misplace a whole latitude band worldwide.
// No ring in the bundled set is that shape — but the dataset is a caret-ranged
// dependency, so assert it here instead of trusting it. If this ever fails, the
// dropped country has silently gone missing and closeAtPole needs the case.
{
  const fc = feature(topo, (topo as { objects: { countries: unknown } }).objects.countries) as {
    features: { properties?: { name?: string }; geometry?: { type: string; coordinates: unknown } }[];
  };
  const undroppable: string[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as number[][][][];
    for (const poly of polys) {
      for (const ring of poly) {
        const cuts: number[] = [];
        for (let i = 1; i < ring.length; i++) {
          const d = ring[i][0] - ring[i - 1][0];
          if (d > 180 || d < -180) cuts.push(i);
        }
        if (!cuts.length) continue;
        let turns = 0;
        for (const i of cuts) turns += ring[i][0] > ring[i - 1][0] ? 1 : -1;
        if (turns !== 0 && cuts.length !== 1) undroppable.push(f.properties?.name ?? '?');
      }
    }
  }
  check(
    'no ring winds a pole with more than one cut',
    undroppable.length === 0,
    undroppable.length ? `${undroppable.join(', ')} would be dropped` : '',
  );
}

// ── Periodicity: longitude repeats every 360°, so the answer must too ────────
// A panned world map hands back the copy the cursor is over, so the lookup gets
// 191°E and −529°E for the same place as 11°W.
{
  let mismatches = 0;
  let sample = '';
  for (let lat = -85; lat <= 85; lat += 1) {
    for (let lng = -180; lng < 180; lng += 1) {
      const base = countryOf(lat, lng);
      if (countryOf(lat, lng + 360) !== base || countryOf(lat, lng - 360) !== base) {
        if (!mismatches) sample = `${lat}, ${lng} → ${base ?? 'null'}`;
        mismatches++;
      }
    }
  }
  check(
    'countryOf is 360°-periodic in longitude (61k points)',
    mismatches === 0,
    mismatches ? `${mismatches} points differ, first at ${sample}` : '',
  );
}

// ── Bulk cross-check against GeoNames ────────────────────────────────────────
// Every bundled city carries its own country code, which is an INDEPENDENT
// source: agreement can only come from the polygons being in the right place.
// Join on the ISO-3166 NUMERIC id both sides carry (countryNum for GeoNames,
// the feature id for the polygons), so the two sets' different English spellings
// — "Dem. Rep. Congo", "Bosnia and Herz." — can't read as lookup failures. The
// remainder still misses on genuinely small countries and on cities inside the
// 110m coastline's error, so the bar is a rate, not zero — but a seam bug is not
// subtle here: it moved a whole latitude band at once.
{
  type Row = [string, string | 0, number, number, string, string, number];
  const all = rows as unknown as Row[];
  const names = countryNames as Record<string, string>;
  const nums = countryNum as Record<string, number>;
  const fc = feature(topo, (topo as { objects: { countries: unknown } }).objects.countries) as {
    features: {
      properties?: { name?: string };
      geometry: { type: string; coordinates: unknown };
    }[];
  };

  // At 1:110m a good many small states have no polygon of their own — Hong Kong,
  // Singapore, Monaco, Palestine — so their cities can only ever land in the
  // neighbour that absorbed them. Judge a city only where its country is
  // actually drawn.
  const drawn = new Set(
    (fc as unknown as { features: { id?: string | number }[] }).features
      .map((f) => (f.id != null ? Number(f.id) : NaN))
      .filter((n) => !Number.isNaN(n)),
  );

  let tested = 0;
  let agreed = 0;
  let unjoinable = 0;
  let undrawn = 0;
  const worst = new Map<string, number>();
  for (const r of all) {
    const want = nums[r[4]];
    if (want === undefined) continue;
    if (!drawn.has(want)) {
      undrawn++;
      continue;
    }
    const hit = countryHitOf(r[2], r[3]);
    // Natural Earth ships a few disputed territories with no id at all, so a
    // city inside one can't be judged either way.
    if (hit && hit.id === null) {
      unjoinable++;
      continue;
    }
    tested++;
    if (hit && Number(hit.id) === want) agreed++;
    else {
      const k = `${names[r[4]] ?? r[4]} → ${hit?.name ?? 'null'}`;
      worst.set(k, (worst.get(k) ?? 0) + 1);
    }
  }
  console.log(
    `      (skipped ${undrawn} cities whose country has no 110m polygon, ` +
      `${unjoinable} inside a polygon shipped with no id)`,
  );
  // A rate, not a count: what's left is the coastline generalization the header
  // comment warns about, and it moves with any dataset regen. The bar is a floor
  // under ~95%, not a knife-edge — the seam checks above are what actually catch
  // a seam bug, since one only ever moves a fraction of a percent of the cities.
  const rate = agreed / tested;
  check(
    'GeoNames cities land in the right polygon',
    rate > 0.94,
    `${agreed}/${tested} = ${(rate * 100).toFixed(2)}%`,
  );
  const top = [...worst.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('      top disagreements:', top.map(([k, n]) => `${k} ×${n}`).join(', '));

  // The seam bug's signature is DISTANCE: it hands a country every point in a
  // latitude band right across the globe — La Paz answered "Fiji", 16 000 km
  // away. Ordinary 110m generalization also puts a town on the wrong side (the
  // Amur river border, Geneva, Windsor), but never more than a degree or so from
  // the outline it smoothed, so measure against the outline and let those
  // through. (Crimea reads Russia here, since Natural Earth draws it inside
  // Russia while GeoNames codes it UA — a difference between the two sources,
  // and one this test would flag if it only counted country codes.)
  const OUTLINE_DEG = 2;
  for (const seam of ['Russia', 'Fiji', 'Antarctica']) {
    const verts: number[][] = [];
    for (const f of fc.features) {
      if (f.properties?.name !== seam) continue;
      const g = f.geometry;
      const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as number[][][][];
      for (const poly of polys) for (const p of poly[0]) verts.push(p);
    }
    let stolen = 0;
    let sample = '';
    for (const r of all) {
      const want = names[r[4]] ?? r[4];
      if (want === seam) continue;
      if (countryOf(r[2], r[3]) !== seam) continue;
      // Nearest outline vertex, in degrees with longitude scaled for latitude
      // and wrapped across the seam.
      const kx = Math.cos((r[2] * Math.PI) / 180);
      let near = Infinity;
      for (const v of verts) {
        const dy = v[1] - r[2];
        let dx = Math.abs(v[0] - r[3]);
        if (dx > 180) dx = 360 - dx;
        near = Math.min(near, Math.hypot(dx * kx, dy));
      }
      if (near <= OUTLINE_DEG) continue;
      if (!stolen) sample = `${r[0]}, ${want} (${r[2]}, ${r[3]}) — ${near.toFixed(1)}° out`;
      stolen++;
    }
    check(
      `no city resolves to ${seam} from beyond its outline`,
      stolen === 0,
      stolen ? `${stolen} cities, e.g. ${sample}` : '',
    );
  }
}

process.exit(failures ? 1 : 0);
