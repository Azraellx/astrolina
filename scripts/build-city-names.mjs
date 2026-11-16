// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Regenerates the localized place names that sit beside the offline atlas.
//
//   node scripts/build-city-names.mjs                 # download, build, delete the download
//   node scripts/build-city-names.mjs --zip <path>    # reuse <path>, or download to it and keep it
//
// Reads GeoNames' alternateNamesV2 table (one ~200 MB zip, streamed — never held in memory
// whole) and keeps, for each interface language below, the name of every atlas city
// (src/lib/atlas/data/cities15000.json, by geonameid) and every atlas region
// (admin1.json, by its "CC.code" key — the geonameid comes from admin1CodesASCII,
// fetched once beside it) in that language, where GeoNames has one.
//
// Selection, per place and language:
//   - historic names, colloquial names and names with an end date are never taken;
//   - a name must be in the language's script (Latin for es/pt/tr/de/pl, Cyrillic for ru),
//     which drops transliterations filed under the wrong code;
//   - a name in the interface's own regional variant (pt-BR) beats the plain language's;
//     then a preferred name beats any other; a short name is taken only when nothing else
//     is there; between equals, the first in the file wins.
// A name equal to the English one is left out, so each file holds only what differs and a
// place missing from it reads in English. So is one that is the English name with accents
// taken off ("Wroclaw" for "Wrocław", "Sao Paulo" for "São Paulo"): that is a romanisation,
// not a name the language has of its own, and the atlas's spelling is the better one.
// OVERRIDES below corrects the few entries a reading of the output found wrong.
//
// Outputs (committed, like the atlas itself), one per language:
//   src/lib/atlas/data/names/<lang>.json — { "cities": { "<geonameid>": name, … },
//                                           "admin1": { "<CC.code>": name, … } }
// Country names are not here: the runtime names a country itself (Intl.DisplayNames).
//
// GeoNames data is CC-BY 4.0. This is a one-time / refresh tool, not a build step. Rerun it
// after build-cities.mjs, so a city added to the atlas gets its names too.

import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createInflateRaw, gzipSync } from 'node:zlib';

const BASE = 'https://download.geonames.org/export/dump';
const ALT_URL = `${BASE}/alternateNamesV2.zip`;
const ADMIN1_URL = `${BASE}/admin1CodesASCII.txt`;
const ENTRY = 'alternateNamesV2.txt';

// The interface languages that ship besides English, and the script each one's place names
// are written in.
const LANGS = ['es', 'pt', 'tr', 'de', 'ru', 'pl'];
const LATIN = /^[\p{Script=Latin}\p{M}\p{Zs}0-9'’‘ʼ.,\-()/&]+$/u;
const CYRILLIC = /^[\p{Script=Cyrillic}\p{M}\p{Zs}0-9'’‘ʼ.,\-()/&]+$/u;
const SCRIPT = { es: LATIN, pt: LATIN, tr: LATIN, de: LATIN, ru: CYRILLIC, pl: LATIN };
const HAS_LETTER = /\p{L}/u;
// A regional variant filed under its own code, and the language it serves. The interface's
// Portuguese is Brazilian, so a pt-BR name, where GeoNames has one, beats a plain pt one.
const VARIANT_OF = { 'pt-BR': 'pt' };

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'atlas', 'data');
const outDir = join(dataDir, 'names');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function download(url, to) {
  console.log(`Downloading ${url}…`);
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`${url}: HTTP ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(to));
}

// The one entry's compressed span inside the zip, from its central directory (whose sizes
// are authoritative even when the local header defers them to a data descriptor).
async function locateEntry(zipPath, nameSuffix) {
  const fh = await open(zipPath, 'r');
  try {
    const { size } = await fh.stat();
    const tailLen = Math.min(size, 65_557);
    const tail = Buffer.alloc(tailLen);
    await fh.read(tail, 0, tailLen, size - tailLen);
    let eocd = tailLen - 22;
    while (eocd >= 0 && tail.readUInt32LE(eocd) !== 0x06054b50) eocd--;
    if (eocd < 0) throw new Error('ZIP: no End-Of-Central-Directory record found');
    const count = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOff = tail.readUInt32LE(eocd + 16);
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOff);
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('ZIP: bad central header');
      const method = cd.readUInt16LE(p + 10);
      const compSize = cd.readUInt32LE(p + 20);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const localOff = cd.readUInt32LE(p + 42);
      const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
      if (name.endsWith(nameSuffix)) {
        if (compSize === 0xffffffff || localOff === 0xffffffff) throw new Error('ZIP: zip64 entries are not handled');
        const local = Buffer.alloc(30);
        await fh.read(local, 0, 30, localOff);
        const start = localOff + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
        return { method, start, end: start + compSize - 1 };
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error(`ZIP: no entry matching "${nameSuffix}" found`);
  } finally {
    await fh.close();
  }
}

// Corrections to the source, by language: a name to use, or null to keep the English.
// Each is a place whose GeoNames entry in that language is a wrong place, an old name, a
// name in another language, or a descriptive phrase rather than the name in use.
const OVERRIDES = {
  tr: {
    cities: { 5128581: 'New York', 3530597: null, 694423: null },
    // Armenia's provinces: GeoNames gives several an old Turkish name (Develi, Sönük, Kurdukulu,
    // Yelkovan, Konakkıran, Alagöz) that is not the name in use; they keep the English, as the
    // transliterated ones (Geğarkunik, Tavuş) and Erivan, the Turkish name of the city, do not need to.
    // AG.06's entry is a misspelling of the English ("Saint Paul PArish").
    admin1: { 'AM.01': null, 'AM.02': null, 'AM.03': null, 'AM.05': null, 'AM.07': null, 'AM.08': null, 'AG.06': null },
  },
  pt: { cities: { 1819729: null }, admin1: { 'AT.09': null } },
  pl: { cities: { 316541: null }, admin1: {} },
  es: { cities: {}, admin1: {} },
  de: { cities: {}, admin1: {} },
  ru: { cities: {}, admin1: {} },
};

// Letters NFD leaves whole (and typographic apostrophes), as a romanisation writes them.
const PLAIN = { ł: 'l', Ł: 'L', ø: 'o', Ø: 'O', đ: 'd', Đ: 'D', ħ: 'h', ı: 'i', ß: 'ss', æ: 'ae', œ: 'oe', '’': "'", '‘': "'", 'ʼ': "'" };
const fold = (s) =>
  s
    .replace(/[łŁøØđĐħıßæœ’‘ʼ]/g, (c) => PLAIN[c])
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
// How much of a name is beyond plain ASCII: its marks and its special letters.
const special = (s) => s.normalize('NFD').replace(/[\x00-\x7f]/g, '').length;
// The English name with accents dropped: the same letters once folded, and fewer marks.
const strippedOf = (name, en) => fold(name) === fold(en) && special(name) < special(en);

// The name to write for one place, or undefined for "reads in English".
function pick(found, en, override) {
  if (override !== undefined) return override === null || override === en ? undefined : override;
  if (!found || found === en || strippedOf(found, en)) return undefined;
  return found;
}

// Lower is better: preferred before plain, and a short name only as the last resort.
const rank = (variant, preferred, short) => (variant ? 0 : 4) + (short ? 2 : 0) + (preferred ? 0 : 1);

async function main() {
  const rows = JSON.parse(await readFile(join(dataDir, 'cities15000.json'), 'utf8'));
  const admin1 = JSON.parse(await readFile(join(dataDir, 'admin1.json'), 'utf8'));

  // geonameid → what the atlas calls it, and which table it belongs to.
  const cityEn = new Map(); // gid → English name
  for (const r of rows) if (r[7]) cityEn.set(r[7], r[0]);

  const zipArg = argValue('--zip');
  const zipPath = zipArg ?? join(tmpdir(), `alternateNamesV2-${process.pid}.zip`);
  const keepZip = zipArg !== undefined;
  if (!(await exists(zipPath))) await download(ALT_URL, zipPath);
  else console.log(`Using ${zipPath}`);

  // The region geonameids, from the same table build-cities.mjs reads the region names from.
  // Only regions the atlas has are kept (the table moves on between refreshes).
  console.log(`Downloading ${ADMIN1_URL}…`);
  const a1r = await fetch(ADMIN1_URL);
  if (!a1r.ok) throw new Error(`${ADMIN1_URL}: HTTP ${a1r.status}`);
  const regionKey = new Map(); // gid → "CC.code"
  for (const line of (await a1r.text()).split('\n')) {
    const c = line.split('\t');
    const gid = Number(c[3]);
    if (c[0] && gid && admin1[c[0]] !== undefined) regionKey.set(gid, c[0]);
  }

  // best[lang] : Map<gid, { name, rank }>
  const best = Object.fromEntries(LANGS.map((l) => [l, new Map()]));
  const langSet = new Set(LANGS);

  try {
    const { method, start, end } = await locateEntry(zipPath, ENTRY);
    const raw = createReadStream(zipPath, { start, end });
    const text = method === 0 ? raw : raw.pipe(createInflateRaw());
    const lines = createInterface({ input: text, crlfDelay: Infinity });
    let n = 0;
    // alternateNamesV2 columns: 0 alternateNameId · 1 geonameid · 2 isolanguage · 3 name ·
    // 4 isPreferredName · 5 isShortName · 6 isColloquial · 7 isHistoric · 8 from · 9 to
    for await (const line of lines) {
      n++;
      const t1 = line.indexOf('\t');
      const t2 = line.indexOf('\t', t1 + 1);
      const t3 = line.indexOf('\t', t2 + 1);
      const code = line.slice(t2 + 1, t3);
      const lang = VARIANT_OF[code] ?? code;
      if (!langSet.has(lang)) continue;
      const gid = Number(line.slice(t1 + 1, t2));
      if (!cityEn.has(gid) && !regionKey.has(gid)) continue;
      const c = line.split('\t');
      const name = c[3].trim();
      if (c[6] === '1' || c[7] === '1' || (c[9] && c[9].trim())) continue;
      if (!name || !HAS_LETTER.test(name) || !SCRIPT[lang].test(name)) continue;
      const r = rank(code !== lang, c[4] === '1', c[5] === '1');
      const prev = best[lang].get(gid);
      if (!prev || r < prev.rank) best[lang].set(gid, { name, rank: r });
    }
    console.log(`Read ${n.toLocaleString('en')} alternate names.`);
  } finally {
    if (!keepZip) await rm(zipPath, { force: true });
  }

  const gidOfRegion = new Map([...regionKey].map(([gid, key]) => [key, gid]));
  await mkdir(outDir, { recursive: true });
  for (const lang of LANGS) {
    const cities = {};
    const regions = {};
    let leftOut = 0;
    const fix = OVERRIDES[lang];
    // Atlas order (population desc) for cities, key order for regions: a stable diff.
    for (const r of rows) {
      const found = best[lang].get(r[7])?.name;
      const name = pick(found, r[0], fix.cities[r[7]]);
      if (name !== undefined) cities[r[7]] = name;
      else if (found) leftOut++;
    }
    for (const key of Object.keys(admin1)) {
      const gid = gidOfRegion.get(key);
      const found = gid === undefined ? undefined : best[lang].get(gid)?.name;
      const name = pick(found, admin1[key], fix.admin1[key]);
      if (name !== undefined) regions[key] = name;
      else if (found) leftOut++;
    }
    const json = JSON.stringify({ cities, admin1: regions });
    await writeFile(join(outDir, `${lang}.json`), json);
    const kb = (b) => `${(b / 1024).toFixed(1)} KB`;
    console.log(
      `${lang}: ${Object.keys(cities).length} cities, ${Object.keys(regions).length} regions ` +
        `(${leftOut} found but read in English) — ${kb(Buffer.byteLength(json))} raw, ` +
        `${kb(gzipSync(json).length)} gzipped`,
    );
  }
  console.log(`Wrote ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
