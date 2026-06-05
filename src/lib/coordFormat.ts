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

function fmtDms(absDeg: number): { d: number; m: number; s: number } {
  const d = Math.floor(absDeg);
  const minFull = (absDeg - d) * 60;
  const m = Math.floor(minFull);
  const s = Math.round((minFull - m) * 60);
  if (s === 60) return { d, m: m + 1, s: 0 };
  return { d, m, s };
}

export function fmtLat(latDeg: number): string {
  const dir = latDeg >= 0 ? 'N' : 'S';
  const { d, m, s } = fmtDms(Math.abs(latDeg));
  return `${d}°${dir}${pad2(m)}'${pad2(s)}"`;
}

export function fmtLng(lngDeg: number): string {
  const dir = lngDeg >= 0 ? 'E' : 'W';
  const { d, m, s } = fmtDms(Math.abs(lngDeg));
  return `${d}°${dir}${pad2(m)}'${pad2(s)}"`;
}
