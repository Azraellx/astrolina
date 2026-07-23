// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import KDBush from 'kdbush';
import { around, distance } from 'geokdbush';
import type { GeocodeResult } from './geocode';
import rowsJson from './data/cities15000.json';
import admin1Json from './data/admin1.json';
import countriesJson from './data/countries.json';

// Offline place-name lookups over the bundled GeoNames cities15000 set (~31k
// places with population >= 15,000). Powers offline-first reverse geocoding (pin
// readout) and the birthplace typeahead, so the online provider is hit only on a
// miss. The dataset is a separate async chunk (this module is dynamically
// imported), so it stays off the first-paint critical path. Mirrors countryOf's
// lazy, pure-function, no-network style.
//
// rows: [name, asciiname, lat, lng, countryCode, admin1Code, population,
// geonameid, capital], sorted by population DESC (see scripts/build-cities.mjs).
// resolveJsonModule infers loose/literal types from the generated files, so pin
// them to the shapes the build script emits. asciiname is 0 (not a string) when
// it equals name — the build script dedupes the ~80% of rows whose name is
// plain ASCII to keep the dataset small; `r[1] || r[0]` below restores the
// folding source. geonameid is the record's stable cross-regen identity and
// capital marks a seat of government — neither is used by the lookups here,
// but consumers that persist or rank rows read them positionally.
type Row = [string, string | 0, number, number, string, string, number, number, 0 | 1];
const rows = rowsJson as unknown as Row[];
const admin1: Record<string, string> = admin1Json;
const countries: Record<string, string> = countriesJson;

const N = rows.length;

// A canonical sample row used when checking label formatting in dev; kept out of
// `rows` above, so it never appears in search or reverse-geocode results.
export const SAMPLE_ROW: Row = ['Ellinbridge', 0, 52.417, -1.831, 'GB', 'GB.CALDWICK', 18240, 0, 0];

// Accent-folded, lowercased name per row — drives accent-insensitive forward
// search ("sao" and "são" both match "São Paulo"). The GeoNames asciiname is
// already romanised; folding it again is harmless.
const fold = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
// The same folding, for callers comparing an OUTSIDE name against these rows —
// merging another source's results without listing one place twice, say. Sharing
// the function is the point: two foldings that drift apart would miss matches.
export { fold as foldName };
const folded: string[] = rows.map((r) => fold(r[1] || r[0]));
// GeoNames sometimes romanises by respelling rather than just dropping accents
// (Zürich → "Zuerich"), so a user who types the plain accent-stripped form
// ("zurich") would miss the asciiname key above. Index the folded DISPLAY name
// as a second key for the rows where it differs; 0 elsewhere keeps the search
// loops' extra checks short-circuited for the common case.
const foldedAlt: (string | 0)[] = rows.map((r, i) => {
  if (!r[1]) return 0;
  const f = fold(r[0]);
  return f === folded[i] ? 0 : f;
});

// Spatial index for reverse lookups, built lazily on the first nearestCity call
// (forward-only sessions never pay for it). kdbush/geokdbush take (lng, lat).
let index: KDBush | null = null;
function getIndex(): KDBush {
  if (!index) {
    const ix = new KDBush(N);
    for (const r of rows) ix.add(r[3], r[2]);
    ix.finish();
    index = ix;
  }
  return index;
}

function labelFor(r: Row): string {
  const region = admin1[`${r[4]}.${r[5]}`];
  const country = countries[r[4]] ?? r[4];
  return [r[0], region, country].filter(Boolean).join(', ');
}

const toResult = (r: Row): GeocodeResult => ({
  label: labelFor(r),
  lat: r[2],
  lng: r[3],
});

// Within this radius (km) of the closest hit, candidates are treated as the same
// place; the most populous wins. This collapses a city's own sub-records — Paris
// arrondissements, Tokyo wards, "Bay Street Corridor" — into the parent city,
// whose centroid can sit slightly farther from a click than a district's. Kept
// tight so genuinely distinct neighbours (e.g. Cambridge vs Boston, ~5 km apart)
// stay separate.
const SAME_PLACE_KM = 4;

/**
 * Reverse: the nearest bundled city to (lat, lng) as a "City, Region, Country"
 * result, or null when no city >= 15k population lies within `maxKm`. The
 * distance cap (open ocean, remote wilderness → null) keeps a far-offshore point
 * from being mislabelled as a distant coastal city; the caller then falls back
 * to the online reverse-geocoder, which can return null for genuine ocean.
 */
export function nearestCity(
  lat: number,
  lng: number,
  maxKm = 50,
): GeocodeResult | null {
  // `around` returns indices in increasing-distance order.
  const ids = around(getIndex(), lng, lat, 24, maxKm);
  if (!ids.length) return null;
  const r0 = rows[ids[0]];
  const cutoff = distance(lng, lat, r0[3], r0[2]) + SAME_PLACE_KM;
  let best = r0;
  for (let k = 1; k < ids.length; k++) {
    const r = rows[ids[k]];
    if (distance(lng, lat, r[3], r[2]) > cutoff) break;
    if (r[6] > best[6]) best = r;
  }
  return toResult(best);
}

/**
 * Forward: accent-insensitive, population-ranked birthplace typeahead. Prefix
 * matches rank above substring matches; within each, rows stay population-DESC
 * (the dataset is pre-sorted) so major cities surface first. A linear scan over
 * ~31k rows is well under a millisecond.
 */
export function searchCity(query: string, limit = 8): GeocodeResult[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const prefix: Row[] = [];
  const substr: Row[] = [];
  for (let i = 0; i < N; i++) {
    const alt = foldedAlt[i];
    if (folded[i].startsWith(q) || (alt && alt.startsWith(q))) {
      prefix.push(rows[i]);
    } else if (folded[i].includes(q) || (alt && alt.includes(q))) {
      substr.push(rows[i]);
    }
  }
  return [...prefix, ...substr].slice(0, limit).map(toResult);
}

// ── Place search (Location window) ──────────────────────────────────────────
// Like searchCity, but also matches country + admin-1 (state/province) names so
// you can jump to a whole region, and tags each hit with its precision so the
// caller can zoom proportionally — country wide, city tight.

export type PlaceKind = 'city' | 'region' | 'country';

export interface PlaceResult extends GeocodeResult {
  kind: PlaceKind;
  /** A map zoom that frames this place: the more precise the place, the tighter. */
  zoom: number;
}

// Precision → zoom. Countries/regions are broad (wide view); cities are precise,
// and a *smaller* city is a more precise target, so it zooms in tighter still.
function zoomFor(kind: PlaceKind, population: number): number {
  if (kind === 'country') return 4;
  if (kind === 'region') return 6;
  if (population >= 2_000_000) return 9.5;
  if (population >= 200_000) return 10.5;
  return 11.5;
}

// The bundled set has no country/region centroids, so a country/region name match
// flies to its most populous city. Rows are population-DESC, so the FIRST row seen
// for a country code / admin-1 key is its largest city. Built lazily, then cached.
let largestByCountry: Map<string, Row> | null = null;
let largestByAdmin1: Map<string, Row> | null = null;
let countryEntries: { code: string; name: string; folded: string }[] | null = null;
let admin1Entries: { key: string; name: string; folded: string }[] | null = null;

function buildPlaceIndexes() {
  if (largestByCountry) return;
  const byCountry = new Map<string, Row>();
  const byAdmin1 = new Map<string, Row>();
  for (const r of rows) {
    if (!byCountry.has(r[4])) byCountry.set(r[4], r);
    const a1 = `${r[4]}.${r[5]}`;
    if (!byAdmin1.has(a1)) byAdmin1.set(a1, r);
  }
  largestByCountry = byCountry;
  largestByAdmin1 = byAdmin1;
  countryEntries = Object.entries(countries).map(([code, name]) => ({
    code,
    name,
    folded: fold(name),
  }));
  admin1Entries = Object.entries(admin1).map(([key, name]) => ({
    key,
    name,
    folded: fold(name),
  }));
}

export function searchPlaces(query: string, limit = 8): PlaceResult[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  buildPlaceIndexes();

  // Collect candidates (row + precision + label), then rank: prefix matches first,
  // then by population (a region/country uses its largest city's population).
  const cands: {
    kind: PlaceKind;
    label: string;
    lat: number;
    lng: number;
    pop: number;
    prefix: boolean;
  }[] = [];

  for (let i = 0; i < N; i++) {
    const f = folded[i];
    const alt = foldedAlt[i];
    const pre = f.startsWith(q) || (alt !== 0 && alt.startsWith(q));
    if (!pre && !f.includes(q) && !(alt !== 0 && alt.includes(q))) continue;
    const r = rows[i];
    cands.push({ kind: 'city', label: labelFor(r), lat: r[2], lng: r[3], pop: r[6], prefix: pre });
  }
  for (const c of countryEntries!) {
    const pre = c.folded.startsWith(q);
    if (!pre && !c.folded.includes(q)) continue;
    const city = largestByCountry!.get(c.code);
    if (!city) continue;
    cands.push({ kind: 'country', label: c.name, lat: city[2], lng: city[3], pop: city[6], prefix: pre });
  }
  for (const a of admin1Entries!) {
    const pre = a.folded.startsWith(q);
    if (!pre && !a.folded.includes(q)) continue;
    const city = largestByAdmin1!.get(a.key);
    if (!city) continue;
    const cc = a.key.slice(0, a.key.indexOf('.'));
    const country = countries[cc] ?? cc;
    cands.push({
      kind: 'region',
      label: `${a.name}, ${country}`,
      lat: city[2],
      lng: city[3],
      pop: city[6],
      prefix: pre,
    });
  }

  cands.sort((x, y) => (x.prefix !== y.prefix ? (x.prefix ? -1 : 1) : y.pop - x.pop));
  return cands.slice(0, limit).map((c) => ({
    label: c.label,
    lat: c.lat,
    lng: c.lng,
    kind: c.kind,
    zoom: zoomFor(c.kind, c.pop),
  }));
}
