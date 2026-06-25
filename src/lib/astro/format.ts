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
import { ELEMENT_GLYPHS, MODALITY_GLYPHS } from './glyphChars';

// Astrology's conventional luminary-first ordering: Moon, Sun, then outward from
// the Sun (Mercury → Pluto), with the calculated points last.
export const PLANET_ORDER: PlanetName[] = [
  'Moon', 'Sun',
  'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto',
  'NorthNode', 'SouthNode', 'Lilith', 'Chiron', 'Ceres', 'Pallas', 'Juno', 'Vesta',
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

// The six chart angles as static rows, in the conventional Mc, Ic, As, Ds, then
// Vertex axis order. Each is tied to the line-type toggle that gates it (so map
// lines and readout rows move together), the i18n key for its full name, the
// RelocatedAngles field that holds its longitude (`key`), and a CSS-var colour.
// Shared by the sidebar readout and the Capture "Angles" extra.
export interface AngleSpec {
  code: 'Mc' | 'Ic' | 'As' | 'Ds' | 'Vx' | 'Avx';
  key: 'asc' | 'mc' | 'dsc' | 'ic' | 'vertex' | 'antivertex';
  lineType: LineType;
  nameKey: MsgKey;
  color: string;
}
export const ANGLE_SPECS: AngleSpec[] = [
  { code: 'Mc',  key: 'mc',         lineType: 'MC',  nameKey: 'expandedSidebar.angle.midheaven',  color: 'var(--cool)' },
  { code: 'Ic',  key: 'ic',         lineType: 'IC',  nameKey: 'expandedSidebar.angle.imumCoeli',  color: 'var(--cool)' },
  { code: 'As',  key: 'asc',        lineType: 'ASC', nameKey: 'expandedSidebar.angle.ascendant',  color: 'var(--accent)' },
  { code: 'Ds',  key: 'dsc',        lineType: 'DSC', nameKey: 'expandedSidebar.angle.descendant', color: 'var(--accent)' },
  { code: 'Vx',  key: 'vertex',     lineType: 'VX',  nameKey: 'expandedSidebar.angle.vertex',     color: 'var(--text-muted)' },
  { code: 'Avx', key: 'antivertex', lineType: 'AVX', nameKey: 'expandedSidebar.angle.antivertex', color: 'var(--text-muted)' },
];
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
