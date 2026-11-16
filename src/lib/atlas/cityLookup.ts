// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import KDBush from 'kdbush';
import { around, distance } from 'geokdbush';
import type { GeocodeResult } from './geocode';
import { composePlaceLabel, foldName } from './placeLabel';
import {
  foldLocalName,
  localCityName,
  localCountryName,
  localRegionName,
  placeNamesFile,
  placeNamesLang,
  type PlaceNamesFile,
} from './placeNames';
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
// already romanised; folding it again is harmless. The folding itself lives in
// placeLabel.ts, beside the label rule that also compares by it.
const fold = foldName;
// The same folding, for callers comparing an OUTSIDE name against these rows —
// merging another source's results without listing one place twice, say. Sharing
// the function is the point: two foldings that drift apart would miss matches.
export { foldName };
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

// The interface language's names as a third key, for the rows that have one: a Turkish
// reader finds Vienna by "viyana" as well as by "vienna". Rebuilt when the names in force
// change (placeNames.ts); null while they are English.
let localKeys: { from: PlaceNamesFile; keys: (string | 0)[]; regions: Map<string, string> } | null = null;
function localKeysNow(): { keys: (string | 0)[]; regions: Map<string, string> } | null {
  const file = placeNamesFile();
  if (!file) return null;
  if (localKeys?.from !== file) {
    const keys = rows.map((r) => {
      const n = r[7] ? file.cities[r[7]] : undefined;
      return n ? foldLocalName(n) : 0;
    });
    const regions = new Map(Object.entries(file.admin1).map(([k, n]) => [k, foldLocalName(n)]));
    localKeys = { from: file, keys, regions };
  }
  return localKeys;
}

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

// "City, Region, Country", a part dropped where it only repeats the one before
// ("Lisbon, Portugal", never "Lisbon, Lisbon, Portugal") — see composePlaceLabel.
// Labels already SAVED with the repeat (a birthplace, a pin) are left as they
// were written: every reader of one takes only its first part, so nothing breaks.
//
// In the interface language (placeNames.ts): each part reads in it where it has a name
// there, and in English where not. englishLabelFor is the same label in English — what
// the online geocoder answers in, so what a comparison with it has to use.
function labelFor(r: Row): string {
  const key = `${r[4]}.${r[5]}`;
  const region = admin1[key];
  const country = countries[r[4]] ?? r[4];
  return composePlaceLabel([
    localCityName(r[7], r[0]),
    region && localRegionName(key, region),
    localCountryName(r[4], country),
  ]);
}

function englishLabelFor(r: Row): string {
  const region = admin1[`${r[4]}.${r[5]}`];
  const country = countries[r[4]] ?? r[4];
  return composePlaceLabel([r[0], region, country]);
}

// `enLabel` rides along only where it differs, so an English result is exactly what it was.
const toResult = (r: Row): GeocodeResult => {
  const label = labelFor(r);
  const en = englishLabelFor(r);
  return { label, lat: r[2], lng: r[3], ...(en !== label ? { enLabel: en } : {}) };
};

// Within this radius (km) of the closest hit, candidates are treated as the same
// place; the most populous wins. This collapses a city's own sub-records — Paris
// arrondissements, Tokyo wards, "Bay Street Corridor" — into the parent city,
// whose centroid can sit slightly farther from a click than a district's. Kept
// tight so genuinely distinct neighbours (e.g. Cambridge vs Boston, ~5 km apart)
// stay separate.
const SAME_PLACE_KM = 4;

// The rows scripts/build-cities.mjs adds by hand (its ADDITIONS list): sections of a city that a
// reader needs named in their own right (Greenwich, 2026-10-22; on the Prime Meridian itself since
// 23 Oct, Lina's G-1). Such a row carries a district's population, below the towns around it, so the
// same-place rule would hand its spot to a bigger neighbour — Eltham, at Greenwich. When one is
// itself the NEAREST row, it wins.
export const HAND_ADDED_GIDS: ReadonlySet<number> = new Set([2647937]);

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
  if (HAND_ADDED_GIDS.has(r0[7])) return toResult(r0);
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
  // The interface language's names too (placeNames.ts), by their own folding.
  const local = localKeysNow()?.keys;
  const ql = foldLocalName(query.trim());
  const prefix: Row[] = [];
  const substr: Row[] = [];
  for (let i = 0; i < N; i++) {
    const alt = foldedAlt[i];
    const loc = local ? local[i] : 0;
    if (folded[i].startsWith(q) || (alt && alt.startsWith(q)) || (loc && loc.startsWith(ql))) {
      prefix.push(rows[i]);
    } else if (folded[i].includes(q) || (alt && alt.includes(q)) || (loc && loc.includes(ql))) {
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
  /** A hand addition (HAND_ADDED_GIDS): a point placed exactly, not a centroid — Greenwich on the
   *  Prime Meridian at 51°29′00″N (Lina, 23 Oct 2026, G-1). Absent on every other row. */
  exact?: boolean;
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
// The countries' names in the interface language, folded, by code — rebuilt per language.
let countryLocal: { lang: string; keys: Map<string, string> } | null = null;
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
  // The interface language's names are searched beside the English ones (placeNames.ts),
  // and a hit is labelled in that language whichever name it was found by.
  const ql = foldLocalName(query.trim());
  const local = localKeysNow();
  const lang = placeNamesLang();
  if (lang && countryLocal?.lang !== lang) {
    countryLocal = {
      lang,
      keys: new Map(countryEntries!.map((c) => [c.code, foldLocalName(localCountryName(c.code, c.name))])),
    };
  }
  const countryKeys = lang ? countryLocal!.keys : null;
  const matchLocal = (key: string | 0 | undefined): 'prefix' | 'substr' | null =>
    !key ? null : key.startsWith(ql) ? 'prefix' : key.includes(ql) ? 'substr' : null;

  // Collect candidates (row + precision + label), then rank: prefix matches first,
  // then by population (a region/country uses its largest city's population).
  const cands: {
    kind: PlaceKind;
    label: string;
    lat: number;
    lng: number;
    pop: number;
    prefix: boolean;
    exact?: boolean;
    enLabel?: string;
  }[] = [];
  // The English label beside a localized one, where they differ (GeocodeResult.enLabel).
  const en = (label: string, english: string) => (english !== label ? { enLabel: english } : {});

  for (let i = 0; i < N; i++) {
    const f = folded[i];
    const alt = foldedAlt[i];
    const loc = matchLocal(local?.keys[i]);
    const pre = f.startsWith(q) || (alt !== 0 && alt.startsWith(q)) || loc === 'prefix';
    if (!pre && !f.includes(q) && !(alt !== 0 && alt.includes(q)) && !loc) continue;
    const r = rows[i];
    const label = labelFor(r);
    cands.push({
      kind: 'city',
      label,
      lat: r[2],
      lng: r[3],
      pop: r[6],
      prefix: pre,
      exact: HAND_ADDED_GIDS.has(r[7]),
      ...en(label, englishLabelFor(r)),
    });
  }
  for (const c of countryEntries!) {
    const loc = matchLocal(countryKeys?.get(c.code));
    const pre = c.folded.startsWith(q) || loc === 'prefix';
    if (!pre && !c.folded.includes(q) && !loc) continue;
    const city = largestByCountry!.get(c.code);
    if (!city) continue;
    const label = localCountryName(c.code, c.name);
    cands.push({ kind: 'country', label, lat: city[2], lng: city[3], pop: city[6], prefix: pre, ...en(label, c.name) });
  }
  for (const a of admin1Entries!) {
    const loc = matchLocal(local?.regions.get(a.key));
    const pre = a.folded.startsWith(q) || loc === 'prefix';
    if (!pre && !a.folded.includes(q) && !loc) continue;
    const city = largestByAdmin1!.get(a.key);
    if (!city) continue;
    const cc = a.key.slice(0, a.key.indexOf('.'));
    const country = countries[cc] ?? cc;
    // The same rule as a city's label: a region named for its country
    // ("Taiwan, Taiwan") is one name, and its kind tag says which it is.
    const label = composePlaceLabel([localRegionName(a.key, a.name), localCountryName(cc, country)]);
    cands.push({
      kind: 'region',
      label,
      lat: city[2],
      lng: city[3],
      pop: city[6],
      prefix: pre,
      ...en(label, composePlaceLabel([a.name, country])),
    });
  }

  cands.sort((x, y) => (x.prefix !== y.prefix ? (x.prefix ? -1 : 1) : y.pop - x.pop));
  return cands.slice(0, limit).map((c) => ({
    label: c.label,
    lat: c.lat,
    lng: c.lng,
    kind: c.kind,
    zoom: zoomFor(c.kind, c.pop),
    ...(c.exact ? { exact: true } : {}),
    ...(c.enLabel ? { enLabel: c.enLabel } : {}),
  }));
}
