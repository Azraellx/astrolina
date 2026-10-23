// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// A place's geodetic angles as one line of text, written ONCE for every surface that prints
// them: the map's hover readout and the chart panel's geodetic line (2026-10-20).
//
// Lina's format (20 Oct 2026, §4): "GE: AS 21°♈04′ · MC 10°♑37′" — the code and a colon, then
// each angle as its degrees, the sign, its minutes. Until then the two surfaces each built the
// line themselves and had drifted apart: the map headed the place "Toronto GE" over the angles,
// the panel printed "GE · AS … · MC …". So the figures are made here and nowhere else — the
// truncation by the one sign rule (truncZodiac, to the minute, never rounded: the readout and
// the zone it names must agree), two-digit degrees and minutes, the sign between them — and
// the line is put together from the catalog's templates (map.geoReadout.angles and
// anglesMcOnly), which hold her codes, colon and dot. A surface renders each angle its own way
// (the map as markup with the glyph styled, the panel with its ZodiacGlyph), through
// geoAnglesSegments, so the order and the separators can't differ between them either.
//
// verify-geodetic checks it at Toronto with real figures, and fails on "GE ·".
import { truncZodiac, type TruncZodiac } from './format';
import { SIGN_GLYPHS } from './glyphChars';

/** One angle as the readout prints it. */
export interface GeoAnglePart {
  /** Whole degrees within the sign, two digits: "21". */
  deg: string;
  /** 0 (Aries) … 11 (Pisces): the sign printed between the degrees and the minutes. */
  signIdx: number;
  /** That sign's glyph, text presentation (SIGN_GLYPHS). */
  glyph: string;
  /** Whole minutes, two digits: "04". */
  min: string;
}

/** A place's two angles as the readout prints them. */
export interface GeoAnglesParts {
  /** Null where the readout leaves the Ascendant out (within 0.01° of a pole). */
  as: GeoAnglePart | null;
  mc: GeoAnglePart;
}

/** An angle as an ecliptic longitude in radians, or as the readout already truncated it
 *  (geoReadoutAngles' TruncZodiac — the same rule, so it is used as it is). */
export type GeoAngleIn = number | TruncZodiac;

/** The catalog's two templates: `{as}` and `{mc}` stand for the angles. */
export interface GeoAnglesTemplates {
  /** map.geoReadout.angles: "GE: AS {as} · MC {mc}". */
  angles: string;
  /** map.geoReadout.anglesMcOnly: "GE: MC {mc}" — where there is no Ascendant. */
  anglesMcOnly: string;
}

/** The line in order: the template's own text, and the angles where it names them. */
export type GeoAnglesSegment = { text: string } | { slot: 'as' | 'mc'; part: GeoAnglePart };

const pad2 = (n: number) => String(n).padStart(2, '0');

/** One angle's printed parts, truncated to the minute by the one sign rule. */
export function geoAnglePart(a: GeoAngleIn): GeoAnglePart {
  const z = typeof a === 'number' ? truncZodiac(a, 'min') : a;
  return { deg: pad2(z.deg), signIdx: z.signIdx, glyph: SIGN_GLYPHS[z.signIdx], min: pad2(z.min) };
}

/** A place's AS and MC as the readout prints them. */
export function geoAnglesParts(as: GeoAngleIn | null, mc: GeoAngleIn): GeoAnglesParts {
  return { as: as === null ? null : geoAnglePart(as), mc: geoAnglePart(mc) };
}

/** One angle as plain text: "21°♈04'" (the glyph in text presentation). */
export function geoAngleText(p: GeoAnglePart): string {
  return `${p.deg}°${p.glyph}${p.min}'`;
}

/** The line as the template lays it out: its text and its angles, in order. The MC-only
 *  template where there is no Ascendant. A placeholder the parts can't fill is left as text,
 *  as the catalog's own interpolation leaves an unknown one — visible, not dropped. */
export function geoAnglesSegments(parts: GeoAnglesParts, tpl: GeoAnglesTemplates): GeoAnglesSegment[] {
  const template = parts.as ? tpl.angles : tpl.anglesMcOnly;
  const out: GeoAnglesSegment[] = [];
  let at = 0;
  for (const m of template.matchAll(/\{(as|mc)\}/g)) {
    const slot = m[1] as 'as' | 'mc';
    const part = slot === 'as' ? parts.as : parts.mc;
    if (!part) continue;
    if (m.index! > at) out.push({ text: template.slice(at, m.index) });
    out.push({ slot, part });
    at = m.index! + m[0].length;
  }
  if (at < template.length) out.push({ text: template.slice(at) });
  return out;
}

/** The line as one string: each angle through `angle` (plain text by default) and the
 *  template's text through `text` (as it is by default; the map passes its HTML escape). */
export function geoAnglesText(
  parts: GeoAnglesParts,
  tpl: GeoAnglesTemplates,
  render: { angle?: (p: GeoAnglePart, slot: 'as' | 'mc') => string; text?: (s: string) => string } = {},
): string {
  const angle = render.angle ?? geoAngleText;
  const text = render.text ?? ((s: string) => s);
  return geoAnglesSegments(parts, tpl)
    .map((s) => ('slot' in s ? angle(s.part, s.slot) : text(s.text)))
    .join('');
}
