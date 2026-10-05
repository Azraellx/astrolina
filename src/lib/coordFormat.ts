// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// DMS coordinate formatting shared by the corner CoordReadout and the
// expanded sidebar's "Relocated to / Pinned at" line, e.g. 60°N11'56".

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** A longitude resolved to its canonical meridian, (−180, 180]. On the flat map a
 *  cursor or pin over a REPEATED world copy carries a wrapped longitude — e.g.
 *  −234° for the 126°E meridian — and the readout must show the real meridian,
 *  whichever copy the pointer is over. −180 maps to +180 (the dateline is +180) to
 *  match the line geometry's own convention (astro/lines normLng). */
export function canonicalLng(lngDeg: number): number {
  const lng = (((lngDeg + 180) % 360) + 360) % 360 - 180;
  return lng === -180 ? 180 : lng;
}

// Rounded to the second, with a 60″ carried into the minute and a 60′ that makes into the
// degree — so 39.99999° is 40°00'00", never 39°60'00". The second carry was missing until
// 2026-10-02, and a coordinate within half a second below a whole degree printed 60′ (the
// geodetic panel header's "Cast for" line showed it over open water).
function fmtDms(absDeg: number): { d: number; m: number; s: number } {
  let d = Math.floor(absDeg);
  const minFull = (absDeg - d) * 60;
  let m = Math.floor(minFull);
  let s = Math.round((minFull - m) * 60);
  if (s === 60) {
    s = 0;
    m += 1;
  }
  if (m === 60) {
    m = 0;
    d += 1;
  }
  return { d, m, s };
}

export function fmtLat(latDeg: number): string {
  const dir = latDeg >= 0 ? 'N' : 'S';
  const { d, m, s } = fmtDms(Math.abs(latDeg));
  return `${d}°${dir}${pad2(m)}'${pad2(s)}"`;
}

export function fmtLng(lngDeg: number): string {
  const lng = canonicalLng(lngDeg);
  const dir = lng >= 0 ? 'E' : 'W';
  const { d, m, s } = fmtDms(Math.abs(lng));
  return `${d}°${dir}${pad2(m)}'${pad2(s)}"`;
}

// Degrees and minutes only, ROUNDED to the minute with the 60′ carried into the degree —
// for a place named by its coordinates beside angles quoted to the minute (the geodetic
// grid's hover readout, where open water has no place name). The angles there are
// truncated, but a coordinate is not an angle of the zodiac: there is no sign to keep it
// inside, so it takes the nearest minute like every other coordinate the app prints.
// (2026-10-02)
function fmtDm(absDeg: number): { d: number; m: number } {
  let d = Math.floor(absDeg);
  let m = Math.round((absDeg - d) * 60);
  if (m === 60) {
    d += 1;
    m = 0;
  }
  return { d, m };
}

export function fmtLatDM(latDeg: number): string {
  const { d, m } = fmtDm(Math.abs(latDeg));
  // A rounding to 0°00′ has no hemisphere; name it N, as fmtLat does for 0.
  const dir = latDeg >= 0 || (d === 0 && m === 0) ? 'N' : 'S';
  return `${d}°${dir}${pad2(m)}'`;
}

export function fmtLngDM(lngDeg: number): string {
  const lng = canonicalLng(lngDeg);
  const { d, m } = fmtDm(Math.abs(lng));
  const dir = lng >= 0 || (d === 0 && m === 0) ? 'E' : 'W';
  return `${d}°${dir}${pad2(m)}'`;
}
