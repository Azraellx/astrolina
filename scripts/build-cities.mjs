// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Regenerates the offline place-name dataset from GeoNames.
//
//   node scripts/build-cities.mjs
//
// Downloads three GeoNames tables and trims them to the small JSON files the app
// loads for offline reverse-geocoding (pin readout) and offline birthplace
// typeahead — so common lookups resolve with no network, hitting the online
// provider only as a rare fallback:
//
//   cities15000  (every place with population >= 15,000 — ~31k records, covers
//                 essentially all real birthplaces)
//   admin1Codes  (region code -> region name, e.g. US.CA -> California)
//   countryInfo  (ISO code  -> country name, e.g. US -> United States)
//
// Outputs (committed to the repo, like world-atlas ships its one JSON):
//   src/lib/atlas/data/cities15000.json — positional rows, population desc:
//       [name, asciiname, lat, lng, countryCode, admin1Code, population]
//   src/lib/atlas/data/admin1.json      — { "US.CA": "California", ... }
//   src/lib/atlas/data/countries.json   — { "US": "United States", ... }
//
// GeoNames data is CC-BY 4.0 (commercial use allowed, attribution required).
// This is a one-time / refresh tool, not a build step.

import { inflateRawSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = 'https://download.geonames.org/export/dump';
const CITIES_URL = `${BASE}/cities15000.zip`;
const ADMIN1_URL = `${BASE}/admin1CodesASCII.txt`;
const COUNTRY_URL = `${BASE}/countryInfo.txt`;

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'atlas', 'data');

// Minimal, dependency-free ZIP reader: locate the End-Of-Central-Directory
// record, walk the central directory to find the entry whose name ends with
// `nameSuffix` (its sizes/offsets are authoritative even when the local header
// uses a data descriptor), then inflate it. Avoids shelling out to `unzip` so
// the script runs anywhere Node does.
function unzipEntry(buf, nameSuffix) {
  // EOCD signature 0x06054b50, scanning back from the end (no archive comment).
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('ZIP: no End-Of-Central-Directory record found');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // offset of central directory

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP: bad central header');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name.endsWith(nameSuffix)) {
      // Skip the local file header to reach the compressed data.
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const comp = buf.subarray(dataStart, dataStart + compSize);
      return (method === 0 ? comp : inflateRawSync(comp)).toString('utf8');
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`ZIP: no entry matching "${nameSuffix}" found`);
}

async function getText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

async function main() {
  console.log('Downloading GeoNames cities15000 + admin1 + country tables…');
  const [citiesZip, admin1Txt, countryTxt] = await Promise.all([
    fetch(CITIES_URL).then((r) => {
      if (!r.ok) throw new Error(`cities15000.zip: HTTP ${r.status}`);
      return r.arrayBuffer();
    }),
    getText(ADMIN1_URL),
    getText(COUNTRY_URL),
  ]);

  // admin1: "US.CA\tCalifornia\t…" → { "US.CA": "California" }
  const admin1 = {};
  for (const line of admin1Txt.split('\n')) {
    const c = line.split('\t');
    if (c.length >= 2 && c[0]) admin1[c[0]] = c[1];
  }

  // countryInfo (# comment lines skipped): col 0 ISO code, col 4 country name.
  const countries = {};
  for (const line of countryTxt.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const c = line.split('\t');
    if (c[0] && c[4]) countries[c[0]] = c[4];
  }

  // cities15000.txt columns (tab-separated, see GeoNames readme):
  //  1 name · 2 asciiname · 4 lat · 5 lng · 7 featureCode · 8 country
  //  10 admin1 · 14 population
  const citiesTxt = unzipEntry(Buffer.from(citiesZip), 'cities15000.txt');
  const rows = [];
  for (const line of citiesTxt.split('\n')) {
    if (!line) continue;
    const c = line.split('\t');
    // Drop PPLX ("section of populated place" — arrondissements, neighbourhoods
    // like "Paris 04 Hôtel-de-Ville" / "Bay Street Corridor"). They sit nearer a
    // city-centre click than the main city record, so keeping them makes the pin
    // readout return a district instead of the city.
    if (c[7] === 'PPLX') continue;
    const lat = Number(c[4]);
    const lng = Number(c[5]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    rows.push([
      c[1], // name
      c[2], // asciiname (accent-folded; drives accent-insensitive search)
      Math.round(lat * 1e5) / 1e5,
      Math.round(lng * 1e5) / 1e5,
      c[8], // country code
      c[10], // admin1 code
      Number(c[14]) || 0, // population
    ]);
  }
  // Sort by population desc so the typeahead surfaces major cities first.
  rows.sort((a, b) => b[6] - a[6]);

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'cities15000.json'), JSON.stringify(rows));
  await writeFile(join(outDir, 'admin1.json'), JSON.stringify(admin1));
  await writeFile(join(outDir, 'countries.json'), JSON.stringify(countries));

  console.log(
    `Wrote ${rows.length} cities, ${Object.keys(admin1).length} regions, ` +
      `${Object.keys(countries).length} countries to`,
  );
  console.log(`  ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
