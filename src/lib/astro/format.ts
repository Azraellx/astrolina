// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Shared chart-readout formatting + ordering. The expanded sidebar's planet/angle
// list and the Capture tool's "Extras" panel both render the same rows, so the
// longitude format, the luminary-first planet order, and the angle definitions live
// here — one source of truth, so the on-screen readout and the exported image can't
// drift apart.
import type { PlanetName } from '../ephemeris';
import type { LineType } from './lines';
import type { MsgKey, TFn } from '../../i18n/types';
import { signElement, signIndex, signModality } from './dignities';
import { ELEMENT_GLYPHS, MODALITY_GLYPHS, SIGN_GLYPHS } from './glyphChars';

// Astrology's conventional luminary-first ordering: Moon, Sun, then outward from
// the Sun (Mercury → Pluto), with the calculated points last.
export const PLANET_ORDER: PlanetName[] = [
  'Moon', 'Sun',
  'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto',
  'NorthNode', 'SouthNode', 'Lilith', 'Chiron', 'Ceres', 'Pallas', 'Juno', 'Vesta',
  'Fortune',
];
export function planetRank(name: PlanetName): number {
  const i = PLANET_ORDER.indexOf(name);
  return i === -1 ? PLANET_ORDER.length : i;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

// Ecliptic longitude (radians) → the compact "DD°MM'" readout (rounded to the
// arcminute) plus the zodiac sign index (0 = Aries … 11 = Pisces). Mirrors the
// compact branch of the expanded sidebar's Longitude readout, with the same
// 60'→degree and 30°→next-sign rollover so the two never disagree.
export function lonToZodiac(lon: number): { signIdx: number; degMin: string } {
  const lonDeg = ((lon * 180) / Math.PI + 360) % 360;
  let signIdx = Math.floor(lonDeg / 30);
  const inSign = lonDeg % 30;
  const d = Math.floor(inSign);
  const mFull = (inSign - d) * 60;
  let cd = d;
  let cm = Math.round(mFull);
  if (cm === 60) { cm = 0; cd += 1; }
  if (cd === 30) { cd = 0; signIdx = (signIdx + 1) % 12; }
  return { signIdx, degMin: `${cd}°${pad2(cm)}'` };
}

// ── The truncation and sign rule (2026-10-02) ────────────────────────────────
// lonToZodiac above ROUNDS, and its rollover is right for a planet's readout. It is
// wrong for a place's geodetic angles, which are quoted truncated (the reference
// values verify-geodetic checks are truncated, not rounded) — and wrong in a worse
// way at a sign's last minute: Cape Town 18°22′E has AS 29°59′35″ Gemini, which
// rounding prints as 0°00′ Cancer, a sign the place is not in. So everything that
// names a place's geodetic degree or sign — the grid readout, zone membership, the
// hover highlight, the GE box, the wheels' geodetic angles, a timeless range — reads
// THIS one function, and the sign a readout names is the zone's sign by construction.
//
// Truncation alone would undo that on float noise: a round trip turns an exact
// 18°57′ into 18°56′59.9999″, which plain truncation shows as 18°56′. So the value is
// snapped up by TRUNC_SNAP_ARCSEC first — far below anything a reader can place,
// and far above the ~1e-9″ noise of the trigonometry.
export const TRUNC_SNAP_ARCSEC = 1e-3;

/** A longitude truncated in its sign. deg 0–29, min 0–59, sec 0–59 (0 for 'min'). */
export interface TruncZodiac {
  signIdx: number;
  deg: number;
  min: number;
  sec: number;
  /** "29°59'" ('min') or "29°59'35\"" ('sec'); the sign is the caller's to render. */
  text: string;
}

/** Ecliptic longitude in RADIANS → its sign and truncated degree, minute (and
 *  second). Integer arithmetic after the snap, so it never prints 60′ or 60″ and
 *  never rolls into the next sign; signIdx is the same for both units. Any finite
 *  input, negative or past 2π, is wrapped first. A non-finite one (a geodetic
 *  frame's NaN Vertex) comes back as NaN fields and "NaN" text, not a throw, so a
 *  caller listing a frame's points filters on Number.isFinite first. */
export function truncZodiac(lonRad: number, unit: 'min' | 'sec'): TruncZodiac {
  const lonDeg = ((((lonRad * 180) / Math.PI) % 360) + 360) % 360;
  const step = unit === 'min' ? 60 : 1;
  // Whole arcseconds from 0° Aries, 0 … 1295999 (a snap past 360° wraps to 0° Aries).
  const whole = (Math.floor((lonDeg * 3600 + TRUNC_SNAP_ARCSEC) / step) * step) % 1296000;
  const signIdx = Math.floor(whole / 108000);
  const inSign = whole - signIdx * 108000;
  const deg = Math.floor(inSign / 3600);
  const min = Math.floor((inSign % 3600) / 60);
  const sec = inSign % 60;
  const text = unit === 'min' ? `${deg}°${pad2(min)}'` : `${deg}°${pad2(min)}'${pad2(sec)}"`;
  return { signIdx, deg, min, sec, text };
}

/** One end of a printed range: a whole degree (0–29) in its own sign. */
export interface RangeEnd {
  signIdx: number;
  deg: number;
}

/** A longitude known only to within ±halfDeg — a body on a chart with no birth time
 *  (lib/astro/timeless) — as the two ends of its span, each truncated to the whole degree
 *  in its OWN sign (2026-10-02). Read through truncZodiac above, so it is the same rule as
 *  every truncated readout: the snap keeps an end that is exactly 0° Aries from printing as
 *  29° Pisces on float noise, and an end never names a sign it isn't in. A span across a
 *  sign boundary therefore carries two signs (24°♓–9°♈), and one inside a sign the same
 *  one twice (2°♉–18°♉). `lonRad` in radians, like truncZodiac. */
export function lonRange(lonRad: number, halfDeg: number): { lo: RangeEnd; hi: RangeEnd } {
  const h = (halfDeg * Math.PI) / 180;
  const lo = truncZodiac(lonRad - h, 'min');
  const hi = truncZodiac(lonRad + h, 'min');
  return { lo: { signIdx: lo.signIdx, deg: lo.deg }, hi: { signIdx: hi.signIdx, deg: hi.deg } };
}

/** lonRange as plain text, "2°♉–18°♉": each end's degree then its sign glyph, joined by an
 *  en dash with no spaces. For an attribute or a test; the rendered form is ZodiacRange. */
export function lonRangeText(lonRad: number, halfDeg: number): string {
  const { lo, hi } = lonRange(lonRad, halfDeg);
  return `${lo.deg}°${SIGN_GLYPHS[lo.signIdx]}–${hi.deg}°${SIGN_GLYPHS[hi.signIdx]}`;
}

// Degrees → "DD°MM'" — the same degree+arcminute form the Advanced planet table
// quotes, for any coordinate that isn't a zodiacal longitude. A 0–360 quantity
// (azimuth, right ascension) passes signed=false and wraps 360° back to 0°; a
// ± quantity (altitude, declination, ecliptic latitude, daily motion) passes
// signed=true and keeps its leading − or +.
//
// It lives here beside lonToZodiac rather than with the horizon dial that first
// needed it: the zodiac wheel's own hover readout wants it too, and that wheel is
// where the dial imports its tip chrome from, so keeping it there would have made
// the two modules import each other.
export function fmtDM(deg: number, signed = false): string {
  const abs = Math.abs(deg);
  let d = Math.floor(abs);
  let m = Math.round((abs - d) * 60);
  if (m === 60) {
    m = 0;
    d += 1;
  }
  if (d >= 360 && !signed) d -= 360; // 359°59.6' rounds to 0°00', not 360°00'
  const sign = d === 0 && m === 0 ? '' : deg < 0 ? '-' : signed ? '+' : '';
  return `${sign}${d}°${pad2(m)}'`;
}

// The six chart angles as static rows, in the display order AS, MC, DS, IC, then
// the Vertex axis. Each is tied to the line-type toggle that gates it (so map
// lines and readout rows move together), the i18n key for its full name, the
// RelocatedAngles field that holds its longitude (`key`), and a CSS-var colour.
// Shared by the sidebar readout and the Capture "Angles" extra.
//
// `code` is the IDENTITY (what filters, wheel marks and saved sets are keyed by) and
// `label` is what a reader sees. They were one string until 2026-10-02, when the four
// angles became AS, MC, DS, IC on screen, in that order wherever all four appear
// (Lina's ruling, 2026-10-02). The codes did not change: a saved set still holds 'Mc'
// and 'As'. The order did, so a stored list re-sorted by this table comes back in the
// new order with the same members.
export interface AngleSpec {
  code: 'Mc' | 'Ic' | 'As' | 'Ds' | 'Vx' | 'Avx';
  label: 'AS' | 'MC' | 'DS' | 'IC' | 'Vx' | 'Avx';
  key: 'asc' | 'mc' | 'dsc' | 'ic' | 'vertex' | 'antivertex';
  lineType: LineType;
  nameKey: MsgKey;
  color: string;
}
/** An angle's short code — the identity every angle filter is keyed by (the
 *  wheel's angle marks, a capture's Angles extra, a consumer that owns its own
 *  angle set). Named off the spec so the two can never drift apart. Never shown:
 *  print ANGLE_LABEL[code]. */
export type AngleCode = AngleSpec['code'];
export const ANGLE_SPECS: AngleSpec[] = [
  { code: 'As',  label: 'AS',  key: 'asc',        lineType: 'ASC', nameKey: 'expandedSidebar.angle.ascendant',  color: 'var(--accent)' },
  { code: 'Mc',  label: 'MC',  key: 'mc',         lineType: 'MC',  nameKey: 'expandedSidebar.angle.midheaven',  color: 'var(--cool)' },
  { code: 'Ds',  label: 'DS',  key: 'dsc',        lineType: 'DSC', nameKey: 'expandedSidebar.angle.descendant', color: 'var(--accent)' },
  { code: 'Ic',  label: 'IC',  key: 'ic',         lineType: 'IC',  nameKey: 'expandedSidebar.angle.imumCoeli',  color: 'var(--cool)' },
  { code: 'Vx',  label: 'Vx',  key: 'vertex',     lineType: 'VX',  nameKey: 'expandedSidebar.angle.vertex',     color: 'var(--text-muted)' },
  { code: 'Avx', label: 'Avx', key: 'antivertex', lineType: 'AVX', nameKey: 'expandedSidebar.angle.antivertex', color: 'var(--text-muted)' },
];
/** What a reader sees for each angle code: the wheel's marks, the capture's Angles
 *  rows, a report's angle chips. The same strings LINE_TYPE_LABEL (lines.ts) gives
 *  the map's line labels, keyed by the angle's code rather than its line type. */
export const ANGLE_LABEL: Record<AngleCode, AngleSpec['label']> = Object.fromEntries(
  ANGLE_SPECS.map((s) => [s.code, s.label]),
) as Record<AngleCode, AngleSpec['label']>;
// The angle specs whose line type is currently visible, in canonical order.
export function visibleAngleSpecs(visibleLineTypes: Set<LineType>): AngleSpec[] {
  return ANGLE_SPECS.filter((s) => visibleLineTypes.has(s.lineType));
}

// One Balance category (an element or a modality) and the bodies that fall in it —
// rendered as a "constellation" of planet glyphs. The category glyph + label come from the
// shared glyph maps + i18n, so the panel reads identically to the wheel sidebar's Balance.
export interface BalanceSeg {
  key: string;
  label: string;
  glyph: string;
  bodies: PlanetName[];
}
// Tally the given bodies by element (fire/earth/air/water) then modality (cardinal/fixed/
// mutable) — the same grouping the expanded sidebar's Balance section shows. Every body has
// exactly one element and one modality; empty categories are kept (a missing one is real info).
export function buildCaptureBalance(
  planets: { name: PlanetName; lon: number }[],
  t: TFn,
): BalanceSeg[] {
  const el: Record<'fire' | 'earth' | 'air' | 'water', PlanetName[]> = {
    fire: [], earth: [], air: [], water: [],
  };
  const mo: Record<'cardinal' | 'fixed' | 'mutable', PlanetName[]> = {
    cardinal: [], fixed: [], mutable: [],
  };
  for (const p of planets) {
    const idx = signIndex(p.lon);
    el[signElement(idx)].push(p.name);
    mo[signModality(idx)].push(p.name);
  }
  return [
    ...(['fire', 'earth', 'air', 'water'] as const).map((e) => ({
      key: e,
      label: t(`expandedSidebar.element.${e}`),
      glyph: ELEMENT_GLYPHS[e],
      bodies: el[e],
    })),
    ...(['cardinal', 'fixed', 'mutable'] as const).map((m) => ({
      key: m,
      label: t(`expandedSidebar.modality.${m}`),
      glyph: MODALITY_GLYPHS[m],
      bodies: mo[m],
    })),
  ];
}

// The Balance GRID (Capture wheel view): the bodies bucketed into the 12 element×modality
// cells, for the grid graphic drawn beneath the capture wheel. Rows are the four elements,
// columns the three modalities — 4×3 = the 12 signs, a clean bijection, so each cell is one
// sign. Same element/modality logic as buildCaptureBalance above, just cross-tabulated.
export const BALANCE_ELEMENTS = ['fire', 'earth', 'air', 'water'] as const;
export const BALANCE_MODALITIES = ['cardinal', 'fixed', 'mutable'] as const;
// [elementIndex 0..3][modalityIndex 0..2] → the bodies in that cell (in input order).
export type BalanceGrid = PlanetName[][][];

export function buildBalanceGrid(
  planets: { name: PlanetName; lon: number }[],
): BalanceGrid {
  const grid: BalanceGrid = BALANCE_ELEMENTS.map(() =>
    BALANCE_MODALITIES.map(() => [] as PlanetName[]),
  );
  for (const p of planets) {
    const idx = signIndex(p.lon);
    const e = BALANCE_ELEMENTS.indexOf(signElement(idx));
    const m = BALANCE_MODALITIES.indexOf(signModality(idx));
    grid[e][m].push(p.name);
  }
  return grid;
}
