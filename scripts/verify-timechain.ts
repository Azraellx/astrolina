// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies the TIME CHAIN of the real src/lib code (run via the harness:
// `npm run verify:timechain`): everything between "user enters a birth moment"
// and "the ephemeris has the right instant", plus the ephemeris-integration
// residuals that ride on it.
//   1. Timezone resolution: local-mean-time-era births (the birthplace's own
//      LMT, not the zone reference city's), legal mean-time standards kept
//      (Paris Mean Time), first-generation DST, UK double summer time,
//      half-hour zones and 30-minute DST — goldens transcribed from the IANA
//      tz database source files.
//   2. Julian/Gregorian calendar cutover continuity and jdToCivil round-trips.
//   3. UT handling end to end: the Moon's apparent place and Greenwich apparent
//      sidereal time against JPL Horizons goldens — a UT/TT (Delta-T) mix-up
//      anywhere in the chain would show as a ~38″ lunar error.
//   4. South Node derivation, ecliptic↔equatorial round-trips, the
//      true-obliquity frame consistency proof, and station-flag semantics.
import { createRequire } from 'node:module';
import { DateTime, Settings } from 'luxon';
import {
  birthDataToJD,
  bodyLonSpeed,
  eclipticToRaDec,
  getEclipticPositions,
  getPlanetPositions,
  gmstRadians,
  initEphemeris,
  jdToCivil,
  obliquity,
  raDecToEclipticLon,
} from '../src/lib/ephemeris';
import { resolveBirthTimezone, resolveZoneInfo } from '../src/lib/atlas/timezone';
import type { BirthData } from '../src/lib/birthData';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const node: any = createRequire(import.meta.url)('@swisseph/node');

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const ARCSEC = 1 / 3600;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

await initEphemeris();

const birth = (
  year: number, month: number, day: number, hour: number, minute: number, tzOffset: number,
): BirthData => ({
  name: 'tc', year, month, day, hour, minute, tzOffset,
  birthplace: { label: 'tc', lat: 0, lng: 0 },
});

// ── 1. Timezone resolution goldens (IANA tzdb source values) ──────────────────
{
  const cases: Array<{
    label: string; lat: number; lng: number;
    date: [number, number, number, number, number];
    wantHours: number; tolSec: number; wantLmt?: boolean;
  }> = [
    // Pre-standard-time: birthplace LMT (longitude/15), NOT Europe/Berlin's +0:53:28.
    { label: 'Ulm 1879 (Einstein) → birthplace LMT', lat: 48.4011, lng: 9.9876, date: [1879, 3, 14, 11, 30], wantHours: 9.9876 / 15, tolSec: 1, wantLmt: true },
    { label: 'Munich 1885 → birthplace LMT (Berlin zone, pre-1893)', lat: 48.137, lng: 11.575, date: [1885, 6, 1, 12, 0], wantHours: 11.575 / 15, tolSec: 1, wantLmt: true },
    // Legal mean-time standards must be KEPT: France ran on Paris Mean Time 1891–1911.
    { label: 'Lyon 1900 → Paris Mean Time +0:09:21 (not Lyon LMT)', lat: 45.764, lng: 4.8357, date: [1900, 6, 15, 12, 0], wantHours: 9 / 60 + 21 / 3600, tolSec: 1, wantLmt: false },
    // ...but pre-1891-03-16 France was on local mean time.
    { label: 'Lyon 1880 → birthplace LMT', lat: 45.764, lng: 4.8357, date: [1880, 6, 15, 12, 0], wantHours: 4.8357 / 15, tolSec: 1, wantLmt: true },
    // GMT was legal in Britain from 1847 (tzdb): no LMT substitution.
    { label: 'London 1860 → GMT', lat: 51.5074, lng: -0.1278, date: [1860, 6, 15, 12, 0], wantHours: 0, tolSec: 1, wantLmt: false },
    // First-generation US DST (1918) and its winter side.
    { label: 'NYC 1918-06 → EDT −4 (first US DST)', lat: 40.71, lng: -74.006, date: [1918, 6, 15, 12, 0], wantHours: -4, tolSec: 0.5 },
    { label: 'NYC 1918-01 → EST −5', lat: 40.71, lng: -74.006, date: [1918, 1, 15, 12, 0], wantHours: -5, tolSec: 0.5 },
    // UK double summer time; and no winter GMT during 1941–1945.
    { label: 'London 1941-07 → BDST +2', lat: 51.5, lng: -0.12, date: [1941, 7, 1, 12, 0], wantHours: 2, tolSec: 0.5 },
    { label: 'London 1941-12 → BST +1 (war winters kept +1)', lat: 51.5, lng: -0.12, date: [1941, 12, 15, 12, 0], wantHours: 1, tolSec: 0.5 },
    // Half-hour zone with a 30-minute DST.
    { label: 'Lord Howe 1990-01 → +11 (30-min DST)', lat: -31.55, lng: 159.08, date: [1990, 1, 15, 12, 0], wantHours: 11, tolSec: 0.5 },
    { label: 'Lord Howe 1990-06 → +10:30', lat: -31.55, lng: 159.08, date: [1990, 6, 15, 12, 0], wantHours: 10.5, tolSec: 0.5 },
    // Quarter-hour standard offsets, including Nepal's 1986 switch.
    { label: 'Kolkata 1990 → +5:30', lat: 22.57, lng: 88.36, date: [1990, 6, 15, 12, 0], wantHours: 5.5, tolSec: 0.5 },
    { label: 'Kathmandu 1990 → +5:45', lat: 27.72, lng: 85.32, date: [1990, 6, 15, 12, 0], wantHours: 5.75, tolSec: 0.5 },
    { label: 'Kathmandu 1980 → +5:30 (pre-1986)', lat: 27.72, lng: 85.32, date: [1980, 6, 15, 12, 0], wantHours: 5.5, tolSec: 0.5 },
    // The seed chart's own convention check.
    { label: 'Yonkers 1941-06-05 → EDT −4 (Jim Lewis)', lat: 40.9312, lng: -73.8988, date: [1941, 6, 5, 9, 30], wantHours: -4, tolSec: 0.5 },
    // Day of Two Noons: the US standardized at local NOON on 1883-11-18, so
    // that morning is still birthplace LMT while the afternoon is EST.
    { label: 'Boston 1883-11-18 09:00 → birthplace LMT (pre-noon)', lat: 42.3601, lng: -71.0589, date: [1883, 11, 18, 9, 0], wantHours: -71.0589 / 15, tolSec: 1, wantLmt: true },
    { label: 'Boston 1883-11-18 13:00 → EST −5 (post-noon)', lat: 42.3601, lng: -71.0589, date: [1883, 11, 18, 13, 0], wantHours: -5, tolSec: 0.5, wantLmt: false },
    // Second LMT eras (date-line transfers): the table must extend past the
    // first tzdb Zone line. Philippines kept LMT to 1899; Alaska to 1900.
    { label: 'Cebu 1870 → birthplace LMT (PH second LMT era)', lat: 10.3157, lng: 123.8854, date: [1870, 6, 15, 12, 0], wantHours: 123.8854 / 15, tolSec: 1, wantLmt: true },
    { label: 'Fairbanks 1890 → birthplace LMT (AK second LMT era)', lat: 64.8378, lng: -147.7164, date: [1890, 6, 15, 12, 0], wantHours: -147.7164 / 15, tolSec: 1, wantLmt: true },
    // Pre-date-line-shift reckoning: Samoa kept the EASTERN calendar until
    // 1892-07-04, so the birthplace LMT is shifted +24h to land the recorded
    // local date on the correct UT instant.
    { label: 'Apia 1885 → eastern-reckoned birthplace LMT (+24h)', lat: -13.8333, lng: -171.7667, date: [1885, 6, 10, 6, 0], wantHours: -171.7667 / 15 + 24, tolSec: 1, wantLmt: true },
    // Legal mean-time standards are KEPT, never replaced by birthplace LMT.
    { label: 'Porto 1900 → legal Lisbon Mean Time −0:36:45', lat: 41.1579, lng: -8.6291, date: [1900, 6, 15, 12, 0], wantHours: -(36 / 60 + 45 / 3600), tolSec: 1, wantLmt: false },
    { label: 'Lima 1900 → legal Lima Mean Time −5:08:36', lat: -12.046, lng: -77.0428, date: [1900, 6, 15, 12, 0], wantHours: -(5 + 8 / 60 + 36 / 3600), tolSec: 1, wantLmt: false },
    // Open ocean: nautical zone time exists only from 1920 — a sea birth
    // before that keeps the position's own mean time; after, the Etc zone.
    { label: 'mid-Atlantic 1850 → ship\'s LMT (pre-nautical-time)', lat: 30, lng: -40, date: [1850, 6, 15, 12, 0], wantHours: -40 / 15, tolSec: 1, wantLmt: true },
    { label: 'mid-Atlantic 1985 → nautical Etc/GMT+3', lat: 30, lng: -40, date: [1985, 6, 15, 12, 0], wantHours: -3, tolSec: 0.5, wantLmt: false },
  ];
  for (const c of cases) {
    const z = resolveBirthTimezone(c.lat, c.lng, ...c.date);
    const dSec = Math.abs(z.offsetHours - c.wantHours) * 3600;
    const lmtOk = c.wantLmt === undefined || z.lmt === c.wantLmt;
    check(c.label, dSec <= c.tolSec && lmtOk, `got ${z.offsetHours.toFixed(6)}h (Δ ${dSec.toFixed(1)}s) lmt=${z.lmt}`);
  }

  // Explicit-zone path during an LMT era: keeps the zone's reference-city value
  // but must flag it as uncertain (it is almost surely not the birthplace's LMT).
  const berlin = resolveZoneInfo('Europe/Berlin', 1879, 3, 14, 11, 30);
  check(
    'explicit Europe/Berlin in 1879 → reference-city LMT, flagged uncertain',
    Math.abs(berlin.offsetHours - (53 / 60 + 28 / 3600)) * 3600 < 1 && berlin.lmt && berlin.uncertain,
    `got ${berlin.offsetHours.toFixed(6)}h lmt=${berlin.lmt} uncertain=${berlin.uncertain}`,
  );

  // DST-gap and fall-back-ambiguity behavior (documented convention, pinned so a
  // Luxon upgrade can't change it silently): nonexistent spring-forward times
  // resolve to the post-gap offset; ambiguous fall-back times take the EARLIER
  // (still-DST) offset.
  const gap = resolveBirthTimezone(40.71, -74.006, 1918, 3, 31, 2, 30);
  check('DST gap 1918-03-31 02:30 → post-gap offset −4', Math.abs(gap.offsetHours + 4) < 1e-9, `got ${gap.offsetHours}`);
  const amb = resolveBirthTimezone(40.71, -74.006, 1918, 10, 27, 1, 30);
  check('DST ambiguity 1918-10-27 01:30 → earlier offset −4', Math.abs(amb.offsetHours + 4) < 1e-9, `got ${amb.offsetHours}`);

  // …whatever day the code runs on (2026-11-27). Luxon's DateTime.fromObject starts
  // from the zone's offset at Settings.now and keeps that guess whenever it reads the
  // clock back, which both passes of a repeated hour do — so the check above passed in
  // summer and failed in winter. Move the live source: each repeated hour is resolved
  // with "now" in January and in July, and must give the same, earlier pass both times,
  // flagged ambiguous with the later pass beside it, while the hours either side are not
  // flagged. Luxon's own reading is required to have MOVED between the two runs, or the
  // comparison tested nothing.
  {
    const realNow = Settings.now;
    const nows: Array<[string, number]> = [
      ['January', Date.UTC(2026, 0, 15, 12)],
      ['July', Date.UTC(2026, 6, 15, 12)],
    ];
    const overlaps: Array<{ label: string; iana: string; at: [number, number, number, number, number]; want: number; other: number }> = [
      { label: 'New York 1918-10-27 01:30', iana: 'America/New_York', at: [1918, 10, 27, 1, 30], want: -4, other: -5 },
      { label: 'New York 2026-11-01 01:30', iana: 'America/New_York', at: [2026, 11, 1, 1, 30], want: -4, other: -5 },
      { label: 'London 2026-10-25 01:30', iana: 'Europe/London', at: [2026, 10, 25, 1, 30], want: 1, other: 0 },
      { label: 'Melbourne 2026-04-05 02:30', iana: 'Australia/Melbourne', at: [2026, 4, 5, 2, 30], want: 11, other: 10 },
    ];
    for (const c of overlaps) {
      const [y, mo, d, h, mi] = c.at;
      const got: string[] = [];
      const luxon: number[] = [];
      let ok = true;
      try {
        for (const [name, ms] of nows) {
          Settings.now = () => ms;
          const z = resolveZoneInfo(c.iana, y, mo, d, h, mi);
          const before = resolveZoneInfo(c.iana, y, mo, d, h - 1, mi);
          const after = resolveZoneInfo(c.iana, y, mo, d, h + 1, mi);
          luxon.push(DateTime.fromObject({ year: y, month: mo, day: d, hour: h, minute: mi }, { zone: c.iana }).offset / 60);
          ok &&=
            z.offsetHours === c.want &&
            z.ambiguous === true &&
            z.otherOffsetHours === c.other &&
            before.ambiguous !== true &&
            after.ambiguous !== true;
          got.push(
            `${name} now: ${z.offsetHours} (other ${z.otherOffsetHours}, ambiguous ${z.ambiguous}; an hour before ${before.ambiguous === true}, after ${after.ambiguous === true})`,
          );
        }
      } finally {
        Settings.now = realNow;
      }
      const moved = luxon.length === nows.length && new Set(luxon).size > 1;
      check(
        `DST ambiguity ${c.label} → earlier offset ${c.want}, the same with "now" in January and July`,
        ok && got.length === nows.length && moved,
        `${got.join('; ')}; Luxon alone read ${luxon.join(' / ')}${moved ? '' : ' (did not move: nothing tested)'}`,
      );
    }
  }
}

// ── 2. Calendar cutover + jdToCivil round-trips ───────────────────────────────
{
  // Julian 1582-10-04 was followed by Gregorian 1582-10-15: one day apart.
  const before = birthDataToJD(birth(1582, 10, 4, 0, 0, 0));
  const after = birthDataToJD(birth(1582, 10, 15, 0, 0, 0));
  check('cutover: JD(1582-10-04) + 1 = JD(1582-10-15)', Math.abs(after - before - 1) < 1e-9, `Δ=${after - before}`);
  check('cutover: 1582-10-15 00:00 = JD 2299160.5', Math.abs(after - 2299160.5) < 1e-9, `got ${after}`);

  // Round-trip across the reform and at day boundaries: civil → JD → civil.
  const civils: Array<[number, number, number, number, number]> = [
    [1582, 10, 4, 23, 59], [1582, 10, 15, 0, 0], [1452, 4, 15, 6, 30],
    [1879, 3, 14, 11, 30], [2024, 12, 31, 23, 59], [2000, 2, 29, 12, 0],
  ];
  let rtOk = true;
  for (const [y, m, d, h, min] of civils) {
    const jd = birthDataToJD(birth(y, m, d, h, min, 0));
    const c = jdToCivil(jd);
    if (c.year !== y || c.month !== m || c.day !== d || c.hour !== h || c.minute !== min) {
      rtOk = false;
      console.log(`  round-trip mismatch: ${y}-${m}-${d} ${h}:${min} → ${JSON.stringify(c)}`);
    }
  }
  check('jdToCivil round-trips civil dates across the reform', rtOk);

  // The minute snap: 30 s before midnight must land on the NEXT day's 00:00.
  const nearMidnight = birthDataToJD(birth(2024, 6, 21, 23, 59, 0)) + 30 / 86400;
  const snapped = jdToCivil(nearMidnight);
  check(
    'jdToCivil snaps 23:59:30 to next-day 00:00',
    snapped.day === 22 && snapped.hour === 0 && snapped.minute === 0,
    JSON.stringify(snapped),
  );
}

// ── 3. UT end-to-end vs JPL Horizons ──────────────────────────────────────────
// Horizons (https://ssd.jpl.nasa.gov/api/horizons.api), retrieved 2026-06-12:
//   Moon geocentric apparent RA/DEC (airless, true equator/equinox of date),
//   2024-01-01 00:00 UT: RA 10 36 28.42, DEC +12 37 39.0
//   Local apparent sidereal time at longitude 0, same instant: 06 40 36.3053
// Swiss is fed the UT JD and applies Delta-T internally; a swe_calc-vs-
// swe_calc_ut mix-up would put the Moon ~38″ off (ΔT≈69 s × 0.55″/s).
{
  const jd = birthDataToJD(birth(2024, 1, 1, 0, 0, 0));
  const moon = getPlanetPositions(jd, 'mean').find((p) => p.name === 'Moon')!;
  const wantRa = (10 + 36 / 60 + 28.42 / 3600) * 15;
  const wantDec = 12 + 37 / 60 + 39.0 / 3600;
  const dRa = Math.abs(moon.ra * RAD2DEG - wantRa) * Math.cos(moon.dec);
  const dDec = Math.abs(moon.dec * RAD2DEG - wantDec);
  check('Horizons: Moon apparent RA (UT fed, Delta-T inside Swiss)', dRa < 2 * ARCSEC, `Δ ${(dRa / ARCSEC).toFixed(2)}″`);
  check('Horizons: Moon apparent DEC', dDec < 2 * ARCSEC, `Δ ${(dDec / ARCSEC).toFixed(2)}″`);

  const wantGast = ((6 + 40 / 60 + 36.3053 / 3600) * 15) * DEG2RAD;
  const dGast = Math.abs(gmstRadians(jd) - wantGast) * RAD2DEG;
  check('Horizons: Greenwich apparent sidereal time', dGast < 0.5 * ARCSEC, `Δ ${(dGast / ARCSEC).toFixed(3)}″`);
}

// ── 4. South Node, frame round-trips, obliquity consistency, stations ─────────
{
  const jd = birthDataToJD(birth(2024, 1, 1, 0, 0, 0));
  for (const nodeType of ['mean', 'true'] as const) {
    const ecl = getEclipticPositions(jd, nodeType);
    const nn = ecl.find((p) => p.name === 'NorthNode')!;
    const sn = ecl.find((p) => p.name === 'SouthNode')!;
    const dLon = Math.abs(Math.atan2(Math.sin(sn.lon - nn.lon - Math.PI), Math.cos(sn.lon - nn.lon - Math.PI)));
    check(`SouthNode lon = NorthNode lon + 180° (${nodeType})`, dLon < 1e-12, `Δ ${dLon.toExponential(2)} rad`);
    const eq = getPlanetPositions(jd, nodeType);
    const nnE = eq.find((p) => p.name === 'NorthNode')!;
    const snE = eq.find((p) => p.name === 'SouthNode')!;
    const dDec = Math.abs(snE.dec + nnE.dec) * RAD2DEG;
    const dRa = Math.abs(Math.atan2(Math.sin(snE.ra - nnE.ra - Math.PI), Math.cos(snE.ra - nnE.ra - Math.PI))) * RAD2DEG;
    check(`SouthNode equatorial antipode (${nodeType})`, dDec < 2 * ARCSEC && dRa < 2 * ARCSEC, `Δdec ${(dDec / ARCSEC).toFixed(2)}″ Δra ${(dRa / ARCSEC).toFixed(2)}″`);
  }

  // Ecliptic ↔ equatorial closure over a lat/lon grid.
  const eps = obliquity(jd);
  let worstRt = 0;
  for (let lon = 0; lon < 360; lon += 7.5) {
    for (const lat of [-60, -30, -5, 0, 5, 30, 60]) {
      const { ra, dec } = eclipticToRaDec(lon * DEG2RAD, lat * DEG2RAD, eps);
      const dLon = Math.abs(Math.atan2(Math.sin(raDecToEclipticLon(ra, dec, eps) - lon * DEG2RAD), Math.cos(raDecToEclipticLon(ra, dec, eps) - lon * DEG2RAD)));
      // Inverse latitude via the textbook transform (the app only exports the
      // longitude inverse): β = asin(sinδ·cosε − cosδ·sinε·sinα).
      const beta = Math.asin(Math.sin(dec) * Math.cos(eps) - Math.cos(dec) * Math.sin(eps) * Math.sin(ra));
      const dLat = Math.abs(beta - lat * DEG2RAD);
      worstRt = Math.max(worstRt, dLon, dLat);
    }
  }
  check('eclipticToRaDec ↔ raDecToEcliptic round-trip', worstRt < 1e-12, `max Δ ${worstRt.toExponential(2)} rad`);

  // Frame-consistency proof: converting Swiss's ECLIPTIC output with the app's
  // TRUE obliquity of date must land on Swiss's own EQUATORIAL output. (With
  // the mean obliquity it would miss by the ~9″ nutation term.)
  const FLAG_ECL = node.CalculationFlag.SwissEphemeris | node.CalculationFlag.Speed;
  const FLAG_EQ = FLAG_ECL | node.CalculationFlag.Equatorial;
  let worstFrame = 0;
  for (const id of [node.Planet.Sun, node.Planet.Moon, node.Planet.Venus, node.Planet.Pluto]) {
    const e = node.calculatePosition(jd, id, FLAG_ECL);
    const q = node.calculatePosition(jd, id, FLAG_EQ);
    const t = eclipticToRaDec(e.longitude * DEG2RAD, e.latitude * DEG2RAD, eps);
    const dRa = Math.abs(Math.atan2(Math.sin(t.ra - q.longitude * DEG2RAD), Math.cos(t.ra - q.longitude * DEG2RAD))) * Math.cos(t.dec);
    const dDec = Math.abs(t.dec - q.latitude * DEG2RAD);
    worstFrame = Math.max(worstFrame, dRa, dDec);
  }
  check(
    'true obliquity is the frame Swiss equatorial output uses',
    worstFrame * RAD2DEG < 0.5 * ARCSEC,
    `max Δ ${((worstFrame * RAD2DEG) / ARCSEC).toFixed(3)}″ (mean obliquity would miss by ~9″)`,
  );

  // Station flag semantics: locate a real Mercury station by bisecting the
  // longitude-speed sign change, then confirm the flag is set within the
  // documented ±1-day bracket and clear outside it.
  let lo = birthDataToJD(birth(2024, 3, 20, 0, 0, 0));
  let hi = birthDataToJD(birth(2024, 4, 10, 0, 0, 0));
  const speedAt = (t: number) => bodyLonSpeed(t, 'Mercury', 'mean')!.speed;
  if (speedAt(lo) > 0 && speedAt(hi) < 0) {
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (speedAt(mid) > 0) lo = mid;
      else hi = mid;
    }
    const station = (lo + hi) / 2;
    const flagAt = (t: number) =>
      getEclipticPositions(t, 'mean').find((p) => p.name === 'Mercury')!.stationary;
    check('Mercury station 2024-04: flag set at station ±0.5d', flagAt(station) && flagAt(station - 0.5) && flagAt(station + 0.5));
    check('Mercury station 2024-04: flag clear at ±3d', !flagAt(station - 3) && !flagAt(station + 3));
    console.log(`  station instant (UT JD): ${station.toFixed(4)} = ${JSON.stringify(jdToCivil(station))}`);
  } else {
    check('Mercury station bracket 2024-03-20..04-10 (expected Rx station)', false, 'no sign change found');
  }

  // Numeric note for the report: the fixed out-of-bounds threshold (23°26′ in
  // the sidebar) vs the true obliquity of date.
  const oobFixed = 23 + 26 / 60;
  console.log(
    `  note: OOB threshold fixed ${oobFixed.toFixed(4)}° vs obliquity of date ${(eps * RAD2DEG).toFixed(4)}° (Δ ${(((eps * RAD2DEG) - oobFixed) * 3600).toFixed(1)}″)`,
  );

  // Asteroid coverage: outside 1800–2399 the five seas-file bodies drop out
  // silently while the planets stay (documented limitation, pinned here).
  const oldJd = birthDataToJD(birth(1700, 6, 15, 12, 0, 0));
  const oldNames = getPlanetPositions(oldJd, 'mean').map((p) => p.name);
  check(
    'pre-1800: planets present, asteroids dropped (documented limitation)',
    oldNames.includes('Sun') && oldNames.includes('Pluto') && !oldNames.includes('Chiron') && !oldNames.includes('Ceres'),
    oldNames.join(','),
  );
}

console.log(failures === 0 ? '\nverify-timechain: ALL PASS' : `\nverify-timechain: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
