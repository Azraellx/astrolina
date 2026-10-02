// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verify the offline place lookups against the committed cities15000 dataset —
// guards the compact row encoding build-cities.mjs emits (asciiname omitted when
// it equals the display name, 3-decimal coordinates): accent-folded search must
// keep matching through both the kept and the omitted asciiname paths, and the
// spatial reverse lookup must keep resolving the right city.
//
//   npx tsx scripts/verify-cities.ts
import rows from '../src/lib/atlas/data/cities15000.json';
import { nearestCity, searchCity, searchPlaces } from '../src/lib/atlas/cityLookup';
import { composePlaceLabel, foldName, leadPlaceName } from '../src/lib/atlas/placeLabel';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// ── Dataset invariants ────────────────────────────────────────────────────────
type Row = [string, string | 0, number, number, string, string, number];
const all = rows as unknown as Row[];
const badAscii = all.filter((r) => r[1] !== 0 && r[1] === r[0]).length;
check('asciiname deduped (0 when equal to name)', badAscii === 0, `${badAscii} duplicated`);
const omitted = all.filter((r) => r[1] === 0).length;
check(
  'omitted-asciiname rows form the expected majority',
  omitted > all.length / 2,
  `${omitted}/${all.length} omitted`,
);
const tooPrecise = all.filter(
  (r) => Math.round(r[2] * 1e3) / 1e3 !== r[2] || Math.round(r[3] * 1e3) / 1e3 !== r[3],
).length;
check('coordinates carry at most 3 decimals', tooPrecise === 0, `${tooPrecise} overlong`);

// ── Forward search (accent-insensitive typeahead) ─────────────────────────────
const first = (q: string) => searchCity(q)[0]?.label ?? '(no hit)';
// "São Paulo" keeps an asciiname ("Sao Paulo" differs) — the retained-string path.
check('searchCity("sao") finds São Paulo', first('sao').startsWith('São Paulo'), first('sao'));
// Zürich's GeoNames asciiname is the respelled "Zuerich" — BOTH romanisations
// must match: the plain accent-strip via the folded display name (foldedAlt)
// and the official respelling via the asciiname key.
check('searchCity("zur") finds Zürich', first('zur').startsWith('Zürich'), first('zur'));
check('searchCity("zuerich") finds Zürich', first('zuerich').startsWith('Zürich'), first('zuerich'));
// London's asciiname equals its name, so it is omitted — the `r[1] || r[0]` path.
check('searchCity("londo") finds London', first('londo').startsWith('London'), first('londo'));
// Accented QUERY against an omitted asciiname still folds to a match.
check('searchCity("lóndon") folds the query', first('lóndon').startsWith('London'), first('lóndon'));

// ── Reverse lookup (3-decimal centroids, KDBush index) ────────────────────────
const paris = nearestCity(48.8566, 2.3522);
check('nearestCity(Paris) → Paris', paris?.label.startsWith('Paris') ?? false, paris?.label);
const tokyo = nearestCity(35.6762, 139.6503);
check('nearestCity(Tokyo) → Tokyo', tokyo?.label.startsWith('Tokyo') ?? false, tokyo?.label);
const ocean = nearestCity(-48, -123); // Point Nemo — no city within 50 km
check('nearestCity(open ocean) → null', ocean === null, ocean?.label);

// ── Place search (Teleport: regions + countries ride the same rows) ───────────
const nz = searchPlaces('new zealand').find((p) => p.kind === 'country');
check('searchPlaces("new zealand") has the country', !!nz, nz?.label);

// ── Labels: a part that only repeats the one before it is dropped ────────────
// The atlas takes a city's region from its own list, and hundreds of cities
// share a name with theirs ("Lisbon, Lisbon, Portugal"), a couple of hundred
// regions their country's ("Taipei, Taiwan, Taiwan"). Exact repeats go,
// compared accent-folded; a region that only CONTAINS the city's name is a
// different name and stays.
const at = (lat: number, lng: number) => nearestCity(lat, lng)?.label ?? '(no hit)';
const labelCases: [string, string, number, number][] = [
  ['Lisbon', 'Lisbon, Portugal', 38.7223, -9.1393],
  ['Madrid', 'Madrid, Spain', 40.4168, -3.7038],
  ['Tokyo', 'Tokyo, Japan', 35.6762, 139.6503],
  ['Taipei', 'Taipei, Taiwan', 25.033, 121.5654],
  ['Vienna (near-duplicate kept)', 'Vienna, State of Vienna, Austria', 48.2082, 16.3738],
  ['New York (near-duplicate kept)', 'New York City, New York, United States', 40.7128, -74.006],
];
for (const [name, want, lat, lng] of labelCases) {
  const got = at(lat, lng);
  check(`nearestCity(${name}) → "${want}"`, got === want, got);
}
check(
  'composePlaceLabel folds accents when comparing ("Zürich" over "Zurich")',
  composePlaceLabel(['Zürich', 'Zurich', 'Switzerland']) === 'Zürich, Switzerland',
  composePlaceLabel(['Zürich', 'Zurich', 'Switzerland']),
);
check(
  'composePlaceLabel skips empty parts and collapses a run of repeats to one',
  composePlaceLabel(['Panamá', '', null, ' Panama ', 'Panama']) === 'Panamá',
  composePlaceLabel(['Panamá', '', null, ' Panama ', 'Panama']),
);
check(
  'composePlaceLabel keeps a repeat that is not adjacent',
  composePlaceLabel(['Alpha', 'Beta', 'Alpha']) === 'Alpha, Beta, Alpha',
);
const taiwanRegion = searchPlaces('taiwan').find((p) => p.kind === 'region');
check('a region named for its country reads once', taiwanRegion?.label === 'Taiwan', taiwanRegion?.label);
// Through the real lookup, at every atlas city's own spot: no label it hands out
// still carries a back-to-back repeat.
const stutter = all.filter((r) => {
  const parts = (nearestCity(r[2], r[3], 0.01)?.label ?? '').split(', ');
  return parts.some((p, k) => k > 0 && foldName(p) === foldName(parts[k - 1]));
}).length;
check('no label nearestCity gives at an atlas city repeats a part', stutter === 0, `${stutter} found`);
check(
  'the settlement test reads the first part only',
  leadPlaceName('Madrid, Community of Madrid, Spain') === leadPlaceName('Madrid, Spain') &&
    leadPlaceName('Móstoles, Spain') !== leadPlaceName('Madrid, Spain'),
);

process.exit(failures ? 1 : 0);
