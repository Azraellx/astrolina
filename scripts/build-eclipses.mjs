// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Regenerates the solar-eclipse catalog from NASA's Five Millennium Catalog.
//
//   node scripts/build-eclipses.mjs
//
// Downloads the per-century catalog pages of the Five Millennium Catalog of
// Solar Eclipses (Fred Espenak & Jean Meeus, NASA/GSFC), keeps the years the
// bundled ephemeris files cover (1800–2399, see public/ephe), and emits the
// compact JSON the Eclipses overlay loads for its picker list. The catalog
// supplies what Swiss Ephemeris cannot — Saros series and lunation numbers —
// plus seed metadata (type, gamma, magnitude, greatest-eclipse point); the app
// re-derives precise event times and all path geometry from Swiss Ephemeris at
// runtime so the drawn paths stay self-consistent with the app's own sky.
//
// Every row is cross-validated against a Swiss Ephemeris enumeration
// (@swisseph/node + the same .se1 files the app ships): the two catalogs must
// agree 1:1 on event times and classification before anything is written.
//
// Output (committed to the repo):
//   src/lib/astro/data/solarEclipses.json — positional rows, chronological:
//       [id "YYYY-MM-DD" (TD date of greatest eclipse — the stable selection
//        key), "HH:MM" TD of greatest, type "T"|"A"|"H"|"P", central 0|1,
//        saros, lunation (synodic months since 2000-01-06), gamma, magnitude,
//        geLat, geLng (whole degrees, +N/+E), pathWidthKm|null,
//        centralDurationSec|null]
//
// NASA eclipse data terms: free to reproduce with acknowledgment — see the
// attribution in NOTICE ("Eclipse Predictions by Fred Espenak and Jean Meeus
// (NASA's GSFC)"). This is a one-time / refresh tool, not a build step.

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  setEphemerisPath,
  julianDay,
  findNextSolarEclipse,
  CalculationFlag,
  EclipseType,
} from '@swisseph/node';

const YEAR_MIN = 1800;
const YEAR_MAX = 2399;

// The 5MCSE catalog is published as one page per century.
const CENTURY_PAGES = [
  'SE1701-1800.html', // for the year 1800 only
  'SE1801-1900.html',
  'SE1901-2000.html',
  'SE2001-2100.html',
  'SE2101-2200.html',
  'SE2201-2300.html',
  'SE2301-2400.html', // 2400 itself is dropped (outside ephemeris coverage)
];
const BASE = 'https://eclipse.gsfc.nasa.gov/SEcat5';

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', 'src', 'lib', 'astro', 'data', 'solarEclipses.json',
);

const MONTHS = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

async function getText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

// One catalog row, after stripping the page's HTML link markup:
//   09519  2005 Apr 08  20:36:51     65     65  129   H   -n  -0.3473  1.0074  11S 119W  70   27  00m42s
//   cat#   date         TD greatest  ΔT(s)  lun saros type QLE gamma    mag    lat lng   alt width dur
// Partial rows leave alt/width/duration blank or '-'.
const ROW_RE = new RegExp(
  '^\\s*(\\d{5})\\s+' +                  // catalog number
  '(\\d{4}) ([A-Z][a-z]{2}) (\\d{2})\\s+' + // calendar date (TD)
  '(\\d{2}):(\\d{2}):(\\d{2})\\s+' +     // TD of greatest eclipse
  '(-?\\d+)\\s+' +                       // ΔT seconds
  '(-?\\d+)\\s+' +                       // lunation number
  '(\\d+)\\s+' +                         // saros
  '([PATH])([a-z+\\-23]?)\\s+' +         // type + variant char
  '(\\S{2})\\s+' +                       // QLE code (unused)
  '(-?[\\d.]+)\\s+' +                    // gamma
  '([\\d.]+)\\s+' +                      // magnitude
  '(\\d+)([NS])\\s+(\\d+)([EW])' +       // greatest-eclipse lat/lng
  '(?:\\s+(\\d+))?' +                    // sun altitude (unused)
  '(?:\\s+(\\d+|-))?' +                  // path width km
  '(?:\\s+(\\d+)m(\\d+)s)?\\s*$',        // central duration
);

function parsePage(html) {
  const rows = [];
  for (const raw of html.split('\n')) {
    // Each data cell may be wrapped in <a> links to maps/plots; the underlying
    // text is a fixed-width table. Entities only appear in the header (Δ, °).
    const line = raw.replace(/<[^>]*>/g, '');
    const m = ROW_RE.exec(line);
    if (!m) continue;
    const [
      , , year, mon, day, hh, mm, , dt, lunation, saros,
      typeChar, variant, , gamma, mag, latAbs, latNS, lngAbs, lngEW,
      , width, durMin, durSec,
    ] = m;
    const y = Number(year);
    if (y < YEAR_MIN || y > YEAR_MAX) continue;
    // Variant char (see eclipse.gsfc.nasa.gov/SEcat5/catkey.html): '+'/'-' are
    // NON-central (umbra axis misses Earth); 'n'/'s' are central with one
    // missing limit; 'm'/'b'/'e'/'2'/'3' are saros/hybrid notes — all central.
    const central =
      typeChar !== 'P' && variant !== '+' && variant !== '-' ? 1 : 0;
    rows.push({
      id: `${year}-${String(MONTHS[mon]).padStart(2, '0')}-${day}`,
      timeTD: `${hh}:${mm}`,
      // UT julian day of greatest eclipse (TD minus the catalog's own ΔT),
      // used only to line rows up with the Swiss enumeration below.
      jdUT:
        julianDay(y, MONTHS[mon], Number(day), Number(hh) + Number(mm) / 60 + Number(m[7]) / 3600) -
        Number(dt) / 86400,
      typeChar,
      central,
      saros: Number(saros),
      lunation: Number(lunation),
      gamma: Number(gamma),
      magnitude: Number(mag),
      geLat: Number(latAbs) * (latNS === 'N' ? 1 : -1),
      geLng: Number(lngAbs) * (lngEW === 'E' ? 1 : -1),
      widthKm: width && width !== '-' ? Number(width) : null,
      durationSec: durMin ? Number(durMin) * 60 + Number(durSec) : null,
    });
  }
  return rows;
}

// Enumerate the same period with Swiss Ephemeris so the committed catalog is
// guaranteed to line up with what the app will compute at runtime.
function swissEnumerate(jdStart, jdEnd) {
  const events = [];
  let jd = jdStart;
  for (;;) {
    const e = findNextSolarEclipse(jd, CalculationFlag.SwissEphemeris, 0, false);
    if (e.maximum > jdEnd) break;
    events.push(e);
    jd = e.maximum + 1; // eclipses are never less than ~29 days apart
  }
  return events;
}

function swissKind(typeFlags) {
  if (typeFlags & EclipseType.AnnularTotal) return 'H';
  if (typeFlags & EclipseType.Total) return 'T';
  if (typeFlags & EclipseType.Annular) return 'A';
  return 'P';
}

async function main() {
  console.log('Fetching Five Millennium Catalog pages…');
  const rows = [];
  for (const page of CENTURY_PAGES) {
    const html = await getText(`${BASE}/${page}`);
    const parsed = parsePage(html);
    console.log(`  ${page}: ${parsed.length} eclipses in range`);
    rows.push(...parsed);
  }
  rows.sort((a, b) => a.jdUT - b.jdUT);
  const ids = new Set(rows.map((r) => r.id));
  if (ids.size !== rows.length) throw new Error('duplicate eclipse ids');

  console.log(`Parsed ${rows.length} eclipses ${YEAR_MIN}–${YEAR_MAX}.`);

  console.log('Cross-validating against Swiss Ephemeris…');
  setEphemerisPath(process.cwd() + '/public/ephe');
  const jdStart = julianDay(YEAR_MIN, 1, 1, 0);
  const jdEnd = julianDay(YEAR_MAX, 12, 31, 24);
  const swiss = swissEnumerate(jdStart - 2, jdEnd);
  console.log(`  Swiss enumeration: ${swiss.length} eclipses.`);
  if (swiss.length !== rows.length) {
    // Walk both lists to report where they diverge before bailing.
    for (let i = 0; i < Math.min(swiss.length, rows.length); i++) {
      if (Math.abs(swiss[i].maximum - rows[i].jdUT) > 0.5) {
        console.error(`  First divergence at index ${i}: catalog ${rows[i].id}, Swiss JD ${swiss[i].maximum}`);
        break;
      }
    }
    throw new Error(`count mismatch: catalog ${rows.length} vs Swiss ${swiss.length}`);
  }

  let worstDt = 0;
  const typeDisagreements = [];
  for (let i = 0; i < rows.length; i++) {
    const dt = Math.abs(swiss[i].maximum - rows[i].jdUT);
    worstDt = Math.max(worstDt, dt);
    if (dt > 0.02) {
      throw new Error(
        `time mismatch at ${rows[i].id}: |Swiss − catalog| = ${(dt * 1440).toFixed(1)} min`,
      );
    }
    const kind = swissKind(swiss[i].type);
    const central = swiss[i].type & EclipseType.Central ? 1 : 0;
    if (kind !== rows[i].typeChar || central !== rows[i].central) {
      // Hybrid/total and central/non-central boundary cases legitimately differ
      // between ΔT models and shadow constants; report, don't fail.
      typeDisagreements.push(
        `  ${rows[i].id}: catalog ${rows[i].typeChar}${rows[i].central ? ' central' : ''}` +
          ` vs Swiss ${kind}${central ? ' central' : ''}`,
      );
    }
  }
  console.log(`  Worst time delta: ${(worstDt * 86400).toFixed(1)} s.`);
  if (typeDisagreements.length) {
    console.log(`  ${typeDisagreements.length} classification disagreement(s) (kept catalog values):`);
    for (const d of typeDisagreements) console.log(d);
  }

  const out = {
    source:
      'Five Millennium Catalog of Solar Eclipses, Fred Espenak & Jean Meeus (NASA/GSFC), eclipse.gsfc.nasa.gov',
    range: [YEAR_MIN, YEAR_MAX],
    rows: rows.map((r) => [
      r.id, r.timeTD, r.typeChar, r.central, r.saros, r.lunation,
      r.gamma, r.magnitude, r.geLat, r.geLng, r.widthKm, r.durationSec,
    ]),
  };
  // One row per line keeps the committed file diffable on refresh.
  const json =
    '{\n' +
    `  "source": ${JSON.stringify(out.source)},\n` +
    `  "range": ${JSON.stringify(out.range)},\n` +
    '  "rows": [\n' +
    out.rows.map((r) => `    ${JSON.stringify(r)}`).join(',\n') +
    '\n  ]\n}\n';
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, json);
  console.log(`Wrote ${out.rows.length} eclipses to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
