// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Builds src/lib/astro/data/stars.json: the fixed-star catalog for the map's
// star lines, extracted from the Swiss Ephemeris star file (sefstars.txt,
// shipped with the @swisseph/node dev dependency — same data lineage as the
// engine itself). We bundle a curated astrological working set, not all ~1600:
// tier 1 is the headline stars most astrologers reach for first (royal stars,
// brightest luminaries); tier 2 rounds out the classic Robson/Brady names.
//
// Run: npm run build:stars   (or: node scripts/build-stars.mjs)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'node_modules', '@swisseph', 'node', 'ephemeris', 'sefstars.txt');
const OUT = join(root, 'src', 'lib', 'astro', 'data', 'stars.json');

// name → tier. Spellings must match sefstars.txt's traditional-name field.
const WANTED = new Map([
  // Tier 1 — the four royal stars and the unmissable bright set.
  ['Aldebaran', 1], ['Regulus', 1], ['Antares', 1], ['Fomalhaut', 1],
  ['Algol', 1], ['Alcyone', 1], ['Sirius', 1], ['Spica', 1],
  ['Vega', 1], ['Arcturus', 1], ['Betelgeuse', 1], ['Rigel', 1],
  ['Capella', 1], ['Procyon', 1], ['Pollux', 1], ['Altair', 1],
  ['Canopus', 1], ['Deneb Algedi', 1],
  // Tier 2 — the rest of the classic working set.
  ['Alpheratz', 2], ['Mirach', 2], ['Hamal', 2], ['Menkar', 2],
  ['Bellatrix', 2], ['Alnilam', 2], ['Castor', 2], ['Alphard', 2],
  ['Denebola', 2], ['Algorab', 2], ['Alphecca', 2], ['Zuben Elgenubi', 2],
  ['Zuben Eschamali', 2], ['Unukalhai', 2], ['Rasalhague', 2], ['Deneb', 2],
  ['Markab', 2], ['Scheat', 2], ['Achernar', 2], ['Acrux', 2],
  ['Toliman', 2], ['Mirfak', 2],
]);

const lines = readFileSync(SRC, 'utf8').split('\n');
const found = new Map();
for (const line of lines) {
  if (!line || line.startsWith('#')) continue;
  const parts = line.split(',').map((s) => s.trim());
  if (parts.length < 12) continue;
  const name = parts[0];
  const tier = WANTED.get(name);
  if (tier === undefined || found.has(name)) continue; // file has duplicate rows
  const [, , equinox, raH, raM, raS, decD, decM, decS, pmRa, pmDec, , , mag] = parts;
  if (equinox !== 'ICRS' && equinox !== '2000') {
    console.warn(`skip ${name}: equinox ${equinox} not handled`);
    continue;
  }
  const ra = (Number(raH) + Number(raM) / 60 + Number(raS) / 3600) * 15;
  const sign = decD.startsWith('-') ? -1 : 1;
  const dec =
    sign * (Math.abs(Number(decD)) + Number(decM) / 60 + Number(decS) / 3600);
  found.set(name, {
    name,
    tier,
    ra: Number(ra.toFixed(6)), // degrees, J2000/ICRS
    dec: Number(dec.toFixed(6)),
    pmRa: Number(pmRa), // mas/yr, × cos(dec) per the file convention
    pmDec: Number(pmDec), // mas/yr
    mag: Number(mag),
  });
}

const missing = [...WANTED.keys()].filter((n) => !found.has(n));
if (missing.length) {
  console.error('NOT FOUND in sefstars.txt:', missing.join(', '));
  process.exit(1);
}

const stars = [...found.values()].sort((a, b) => a.tier - b.tier || a.ra - b.ra);
writeFileSync(
  OUT,
  JSON.stringify(
    { source: 'Swiss Ephemeris sefstars.txt', frame: 'ICRS/J2000', stars },
    null,
    1,
  ) + '\n',
);
console.log(`wrote ${stars.length} stars (${stars.filter((s) => s.tier === 1).length} tier-1) → ${OUT}`);
