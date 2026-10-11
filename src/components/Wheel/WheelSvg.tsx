// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

/* This module co-locates a few pure helpers (aspect math, longitude formatting,
   sign labels) with the WheelSvg component. react-refresh would rather they live
   in their own file, but that only affects dev hot-reload (a full reload instead
   of a hot-swap when editing this file), and the helpers belong with the wheel. */
/* eslint-disable react-refresh/only-export-components */
import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  POINTS,
  type EclipticPosition,
  type PlanetName,
  type RelocatedAngles,
} from '../../lib/ephemeris';
import {
  ELEMENT_ORDER,
  aspectInk,
  planetInk,
  wheelMotionInk,
} from '../../lib/themePalette';
import { useT } from '../../i18n';
import type { EnumLabels, MsgKey, TFn } from '../../i18n';
import { ANGLE_LABEL, fmtDM, lonRange, lonToZodiac, truncZodiac } from '../../lib/astro/format';
import { placeOnRing, type RingMark } from '../../lib/ringLayout';
import { angleLabelHalfPx, wheelGeometry } from '../../lib/wheelGeometry';
import { layoutMinorRing, minorRingWalls } from '../../lib/wheelRingLayout';
import { minorDiamondPath, minorHollowPath } from '../../lib/minorBodies/mark';
import type { WheelMinorBody } from '../../lib/minorBodies/wheel';
import {
  DEFAULT_ASPECT_ORBS,
  maxAspectOrb,
  type AspectName,
  type AspectOrbs,
} from '../../lib/aspectPrefs';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import { ZodiacGlyph } from '../ZodiacGlyph/ZodiacGlyph';
import { SVG_NO_TRANSLATE } from '../ui/glyphify';
import { ZodiacRange } from '../ZodiacGlyph/ZodiacRange';
import { MinorMark, MinorMarkSvg } from '../MinorMark/MinorMark';
import './WheelSvg.css';

export const SIGNS = [
  'Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir',
  'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis',
];

// Per-sign novice hint (element · modality · keyword), shown when hovering a sign
// in the outer rim of the interactive (sidebar) wheel. Full sign names come from
// labels.sign; this gloss is resolved by 0-based index via wheel.signMeanings.
const SIGN_MEANING_KEYS = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
] as const;
const signMeaning = (t: TFn, idx: number) =>
  t(`wheel.signMeanings.${SIGN_MEANING_KEYS[idx] ?? 'aries'}` as MsgKey);

// A one-line novice gloss per house (life area), shown when hovering a sector of
// the dedicated house ring in the interactive wheel — the houses' twin of the
// rim signs' hover hint. Resolved by 0-based index via wheel.houseMeanings.
const houseMeaning = (t: TFn, idx: number) =>
  t(`wheel.houseMeanings.h${idx + 1}` as MsgKey);

// A short, standard keyword gloss per body. Not the wheel's own hover any more —
// the discs say where the body IS (see positionTip below) — but the readouts
// underneath name bodies without describing them, so this is what their glyphs
// carry on hover. Exported for those surfaces; resolved via wheel.planetMeanings,
// keyed by the PlanetName code.
export const planetMeaning = (t: TFn, p: PlanetName) =>
  t(`wheel.planetMeanings.${p}` as MsgKey);

// A body's hover tip, in two halves.
//
// The TITLE carries the two IDENTITIES — which body, and which sign it is in —
// because those are what a glance is asking for and they belong on the bold line
// together: "♃ Jupiter | ♏ Scorpio". The description underneath carries the
// FIGURES: how the body is moving where that is worth saying, then where it sits,
// one coordinate per line. The horizon dials read the same way in their own frame
// (azimuth, then altitude — see LocalSpaceCompass), which is the shape this
// follows.
//
// The longitude line is the degree WITHIN the sign, since the sign itself is
// already named above it — the same split the wheel's own readout ring makes.
//
// This replaced a keyword gloss ("Identity · vitality · ego"). The gloss said the
// same thing every time the wheel was opened, which the wheel is not the place to
// keep teaching; where a body IS changes with every chart, and on a panel too
// narrow to show the readout ring this is the only place the figure appears at
// all. (The gloss moved to the planet glyphs in the readouts below — see
// planetMeaning above.)
//
// Latitude is optional on the position — the caller only computes it when the
// sidebar's Advanced mode asked for it — and the line is simply left off when it
// is absent, rather than printed as an em-dash the tag has no room to explain.
// Takes anything with a longitude, so the chart ANGLES read the same way as the
// bodies do — they simply have no motion and no latitude to report (an angle is a
// point ON the ecliptic), and those lines fall away on their own.
//
// Two options, both for a geodetic frame's ANGLES (2026-10-02): `trunc` reads the
// degree through format.ts truncZodiac, as every readout of a place's angles does, so
// the tip names the place's zone and never rounds into the next sign; `hideLon` drops
// the figure where Discreet masks it (see maskAngleText) — and with it the whole
// description, which for an angle is that one line.
//
// `note` is a last line saying where the figure comes from (bodyNotes). It survives
// `hideLon`: it names a source, not a degree, and a masked Lot still being labelled is
// what tells the reader its figure was hidden rather than never there. (2026-10-02)
//
// `range` is a body known only to a span — a chart with no birth time (lib/astro/timeless):
// its half-width in degrees. The longitude line becomes the span (2°♉–18°♉, each end in its
// own sign) with a line saying why, and the title names a sign only when the whole span is
// in one. `hideLon` hides the span and its line as it hides a degree. (2026-10-02)
function bodyTip(
  t: TFn,
  labels: EnumLabels,
  p: { lon: number; lat?: number; retrograde?: boolean; stationary?: boolean },
  opts: { trunc?: boolean; hideLon?: boolean; note?: string | null; range?: number | null } = {},
): { suffix: ReactNode; sub: ReactNode } {
  const z = opts.trunc ? truncZodiac(p.lon, 'min') : null;
  const { signIdx, degMin } = z ? { signIdx: z.signIdx, degMin: z.text } : lonToZodiac(p.lon);
  const half = opts.range ?? null;
  const span = half !== null ? lonRange(p.lon, half) : null;
  const titleSign = !span ? signIdx : span.lo.signIdx === span.hi.signIdx ? span.lo.signIdx : null;
  const tag = motionTag(p);
  const figure = opts.hideLon ? null : (
    <>
      {/* Retrograde / stationary leads, in the ℞ / S mark and colour the
          readout ring and the sidebar's table both use, so one body reads the
          same however you meet it. */}
      {tag && (
        <>
          <span className="wheel-tip-status" style={{ color: MOTION_MARK[tag].color }}>
            {MOTION_MARK[tag].char} {motionWord(t, tag)}
          </span>
          <br />
        </>
      )}
      {half !== null ? (
        <>
          <ZodiacRange lon={p.lon} halfDeg={half} size={12} />
          <br />
          {t('wheel.tip.rangeNote')}
        </>
      ) : (
        t('wheel.tip.longitude', { lon: degMin })
      )}
      {p.lat !== undefined && (
        <>
          <br />
          {t('wheel.tip.latitude', { lat: fmtDM((p.lat * 180) / Math.PI, true) })}
        </>
      )}
    </>
  );
  return {
    // The separator rides inside the sign's group, so a title long enough to wrap
    // carries "| ♐ Sagittarius" to the next line together instead of leaving the bar
    // dangling at the end of the first.
    suffix:
      titleSign === null ? null : (
        <span className="wheel-tip-sign">
          <span className="wheel-tip-sep" aria-hidden="true">
            |
          </span>
          <ZodiacGlyph sign={titleSign} size={13} />
          {labels.sign(titleSign)}
        </span>
      ),
    sub: opts.note ? (
      <>
        {figure && (
          <>
            {figure}
            <br />
          </>
        )}
        {opts.note}
      </>
    ) : (
      figure
    ),
  };
}

// The chart angles, keyed by their angle code (format.ts AngleCode). The title +
// sub hint text is resolved via wheel.angles.<key> at render time; the mark itself
// prints ANGLE_LABEL[key] (AS, MC, DS, IC — the codes were drawn as they stand until
// 2026-10-02). Vx/Avx (the Vertex axis) are opt-in via the Advanced ▸ Vertex axis
// setting.
type AngleKey = 'As' | 'Ds' | 'Mc' | 'Ic' | 'Vx' | 'Avx';
const ANGLE_HINTS: { key: AngleKey }[] = [
  { key: 'As' },
  { key: 'Mc' },
  { key: 'Ds' },
  { key: 'Ic' },
  { key: 'Vx' },
  { key: 'Avx' },
];

// A hovered hint: the SVG anchor (px = user units, since the viewBox is 1:1), the
// element's radius (for the tag's standoff), and the tag's text + accent color.
// Exported (with WheelTip below) so sibling wheel surfaces reuse the same tag.
export interface HoverTip {
  x: number;
  y: number;
  r: number;
  title: string;
  sub?: ReactNode;
  color?: string;
  /** Glyph shown before the title — the hovered body or sign. */
  marker?: ReactNode;
  /** A small mark appended after the title — e.g. the ℞ / S motion tag on a
   *  retrograde / stationary body's readout sign. */
  suffix?: ReactNode;
  /** Colour applied to the title text itself (used for the angle hints). */
  titleColor?: string;
}

// Tag layout constants. The tag is centered on its anchor's x and clamped so a
// max-width box never spills past the wheel edges (the scroll pane clips
// overflow); near the top it flips below the anchor instead of above.
const TIP_MAX = 188;
const TIP_HALF = TIP_MAX / 2;
const TIP_FLIP_Y = 72;

// The floating hint tag, anchored to a wheel element. Reuses the shared .ui-tip
// chrome (index.css) so it matches the map's zenith popup + the timeline nub.
export function WheelTip({ tip, size }: { tip: HoverTip; size: number }) {
  const placement = tip.y < TIP_FLIP_Y ? 'below' : 'above';
  const offset = tip.r + 9;
  const top = placement === 'below' ? tip.y + offset : tip.y - offset;
  const left = Math.min(Math.max(tip.x, TIP_HALF + 4), size - TIP_HALF - 4);
  // The tag stays mounted while the pointer moves from one mark to the next, and its title
  // and sub are runs of text beside glyph elements, which React patches node by node. Under a
  // browser's page translator those nodes have been swapped out, so a patched tag would keep
  // naming the first mark hovered. Keyed by the anchor and title, the two spans are replaced
  // instead whenever the tag moves to another mark (or the mark moves, as it does while the
  // time plays). (2026-10-09)
  const k = `${tip.x},${tip.y},${tip.title}`;
  return (
    <div
      className="wheel-tip ui-tip-box ui-tip"
      data-placement={placement}
      style={{ left, top, maxWidth: TIP_MAX }}
    >
      <span
        key={`t:${k}`}
        className="ui-tip-title wheel-tip-title"
        style={tip.titleColor ? { color: tip.titleColor } : undefined}
      >
        {tip.marker}
        {tip.title}
        {tip.suffix}
      </span>
      {tip.sub && (
        <span key={`s:${k}`} className="ui-tip-sub">
          {tip.sub}
        </span>
      )}
    </div>
  );
}

export type AspectCategory = 'harmonious' | 'hard' | 'conjunction';

export function fmtLon(lonRad: number): string {
  const lonDeg = ((lonRad * 180) / Math.PI + 360) % 360;
  const sign = SIGNS[Math.floor(lonDeg / 30)];
  const inSign = lonDeg % 30;
  const deg = Math.floor(inSign);
  const min = Math.floor((inSign - deg) * 60);
  return `${deg}°${String(min).padStart(2, '0')}' ${sign}`;
}

export interface Aspect {
  a: string;
  b: string;
  type: string;
  category: AspectCategory;
  /** A CSS colour expression — `var(--aspect-<type>, <canonical hex>)` (lib/themePalette
   *  aspectInk) — so a Custom theme recolours every table and chord from the stylesheet.
   *  Use it in a `style` (a CSS property), never an SVG `fill=` / `stroke=` attribute, and
   *  never as a hex to do arithmetic on. (2026-10-06) */
  color: string;
  orb: number;
  lonA: number;
  lonB: number;
}

const ASPECT_TYPES: {
  name: AspectName;
  angle: number;
  color: string;
  category: AspectCategory;
}[] = [
  // Orb limits live in AspectOrbs (Advanced ▸ Aspect orbs); the default is
  // the original flat 7° across the majors. The common practice of a tighter
  // sextile (3-5°) is now one settings change away.
  //
  // The colours are the canonical ones (conjunction gold, hard red, harmonious blue),
  // now read through aspectInk so the hex lives once, in ASPECT_INK_CANON. (2026-10-06)
  { name: 'conjunction', angle: 0,   color: aspectInk('conjunction'), category: 'conjunction' },
  { name: 'opposition',  angle: 180, color: aspectInk('opposition'),  category: 'hard' },
  { name: 'trine',       angle: 120, color: aspectInk('trine'),       category: 'harmonious' },
  { name: 'square',      angle: 90,  color: aspectInk('square'),      category: 'hard' },
  { name: 'sextile',     angle: 60,  color: aspectInk('sextile'),     category: 'harmonious' },
];

const isLuminary = (name: string) => name === 'Sun' || name === 'Moon';

// Derived points (Lots such as the Part of Fortune) are plotted on the wheel but
// not aspected: they have no body, and aspecting a computed longitude is a
// separate doctrine we don't draw. Drop them from every aspect pass.
const aspectable = (p: EclipticPosition) => !POINTS.includes(p.name);

// The tightest aspect (if any) between two ecliptic longitudes (radians).
// `widen` adds the luminary bonus to every limit (set when either body is a
// luminary).
function aspectBetween(
  lonA: number,
  lonB: number,
  orbs: AspectOrbs,
  widen: boolean,
): { type: string; category: AspectCategory; color: string; orb: number } | null {
  let diff = Math.abs(((lonA - lonB) * 180) / Math.PI);
  if (diff > 180) diff = 360 - diff;
  // Pick the TIGHTEST in-orb aspect, not the first: wide user orbs (up to 15°
  // + luminary bonus) can put one separation inside two adjacent majors'
  // windows (e.g. 104° inside both trine and square at 20° orbs).
  let best: { type: string; category: AspectCategory; color: string; orb: number } | null =
    null;
  for (const t of ASPECT_TYPES) {
    const orb = Math.abs(diff - t.angle);
    if (orb <= orbs.orbs[t.name] + (widen ? orbs.luminaryBonus : 0)) {
      if (!best || orb < best.orb) {
        best = { type: t.name, category: t.category, color: t.color, orb };
      }
    }
  }
  return best;
}

export function computeAspects(
  allPlanets: EclipticPosition[],
  orbs: AspectOrbs = DEFAULT_ASPECT_ORBS,
): Aspect[] {
  const out: Aspect[] = [];
  const planets = allPlanets.filter(aspectable);
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const a = planets[i];
      const b = planets[j];
      const asp = aspectBetween(
        a.lon,
        b.lon,
        orbs,
        isLuminary(a.name) || isLuminary(b.name),
      );
      if (asp) {
        out.push({ a: a.name, b: b.name, ...asp, lonA: a.lon, lonB: b.lon });
      }
    }
  }
  return out;
}

// Declination aspects: parallel (same declination, same side of the celestial
// equator — read like a conjunction) and contraparallel (mirror declinations —
// read like an opposition). List-only: they have no zodiacal chord to draw in
// the wheel, so only the sidebar's aspect tables consume them.
export function computeDeclinationAspects(
  allPlanets: EclipticPosition[],
  orbs: AspectOrbs = DEFAULT_ASPECT_ORBS,
): Aspect[] {
  const out: Aspect[] = [];
  const planets = allPlanets.filter(aspectable);
  const R2D = 180 / Math.PI;
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const a = planets[i];
      const b = planets[j];
      if (a.dec === undefined || b.dec === undefined) continue;
      const decA = a.dec * R2D;
      const decB = b.dec * R2D;
      const par = Math.abs(decA - decB);
      const contra = Math.abs(decA + decB);
      // Hemisphere decides the reading: same side of the equator → parallel,
      // opposite sides → contraparallel (a near-equator straddling pair is a
      // contraparallel, not a wide "parallel"). A body exactly ON the equator
      // can read either way — take the tighter.
      const sameSide = decA * decB;
      const isParallel = sameSide > 0 || (sameSide === 0 && par <= contra);
      if (isParallel && par <= orbs.declinationOrb) {
        out.push({
          a: a.name, b: b.name, type: 'parallel', category: 'conjunction',
          color: aspectInk('parallel'), orb: par, lonA: a.lon, lonB: b.lon,
        });
      } else if (!isParallel && contra <= orbs.declinationOrb) {
        out.push({
          a: a.name, b: b.name, type: 'contraparallel', category: 'hard',
          color: aspectInk('contraparallel'), orb: contra, lonA: a.lon, lonB: b.lon,
        });
      }
    }
  }
  return out;
}

// Aspects BETWEEN two charts (bi-wheel). Every call site passes the OVERLAY
// bodies first: the overlay body is the aspect's subject ("transiting Mars
// conjunct natal Sun"), so it lands in the result's `a` slot and reads first in
// the lists. The separation math is symmetric; only the labeling order matters.
export function computeCrossAspects(
  subjectAll: EclipticPosition[],
  natalAll: EclipticPosition[],
  orbs: AspectOrbs = DEFAULT_ASPECT_ORBS,
): Aspect[] {
  const out: Aspect[] = [];
  const subject = subjectAll.filter(aspectable);
  const natal = natalAll.filter(aspectable);
  for (const a of subject) {
    for (const b of natal) {
      const asp = aspectBetween(
        a.lon,
        b.lon,
        orbs,
        isLuminary(a.name) || isLuminary(b.name),
      );
      if (asp) {
        out.push({ a: a.name, b: b.name, ...asp, lonA: a.lon, lonB: b.lon });
      }
    }
  }
  return out;
}

// Aspects between the bodies' horizon-frame azimuths (degrees clockwise from
// north) — the same separations the local-space lines draw on the map, so a
// pair whose bearings are 120° apart reads as a trine in that frame.
// aspectBetween only folds an angular separation, so azimuths in radians drop
// straight in; `lonA`/`lonB` carry the azimuths (radians) so chord drawing can
// reuse them. Pairs missing an azimuth entry are skipped.
export function computeAzimuthAspects(
  planets: EclipticPosition[],
  azimuths: ReadonlyMap<string, number>,
  orbs: AspectOrbs = DEFAULT_ASPECT_ORBS,
): Aspect[] {
  const out: Aspect[] = [];
  const D2R = Math.PI / 180;
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const a = planets[i];
      const b = planets[j];
      const azA = azimuths.get(a.name);
      const azB = azimuths.get(b.name);
      if (azA === undefined || azB === undefined) continue;
      const asp = aspectBetween(
        azA * D2R,
        azB * D2R,
        orbs,
        isLuminary(a.name) || isLuminary(b.name),
      );
      if (asp) {
        out.push({ a: a.name, b: b.name, ...asp, lonA: azA * D2R, lonB: azB * D2R });
      }
    }
  }
  return out;
}

function svgPos(
  lonRad: number,
  ascRad: number,
  r: number,
  cx: number,
  cy: number,
) {
  const theta = Math.PI - (lonRad - ascRad);
  return { x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) };
}

// Closed path for an annular sector spanning lon0→lon1 (the forward arc, so it
// wraps correctly past 0°), sampled as a polygon so we don't have to reason
// about SVG arc sweep flags — the wheel already draws long lines as dense
// polylines for the same reason. Used as the (invisible) hover target for each
// rim sign and each house-ring sector in the interactive wheel.
function annularSectorPath(
  lon0: number,
  lon1: number,
  rIn: number,
  rOut: number,
  ascRad: number,
  cx: number,
  cy: number,
): string {
  const span = ((((lon1 - lon0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
  // ~3° per segment so wide (Placidus) houses stay smooth, min 8 for tight ones.
  const STEPS = Math.max(8, Math.ceil((span * 180) / Math.PI / 3));
  const pts: { x: number; y: number }[] = [];
  for (let s = 0; s <= STEPS; s++) {
    pts.push(svgPos(lon0 + (span * s) / STEPS, ascRad, rOut, cx, cy));
  }
  for (let s = 0; s <= STEPS; s++) {
    pts.push(svgPos(lon0 + span - (span * s) / STEPS, ascRad, rIn, cx, cy));
  }
  return `M ${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')} Z`;
}

// One 30° zodiac-band sector (sign `i`) — a fixed-span case of the above.
function signSectorPath(
  signIdx: number,
  rIn: number,
  rOut: number,
  ascRad: number,
  cx: number,
  cy: number,
): string {
  const lon0 = (signIdx * 30 * Math.PI) / 180;
  const lon1 = ((signIdx + 1) * 30 * Math.PI) / 180;
  return annularSectorPath(lon0, lon1, rIn, rOut, ascRad, cx, cy);
}

// Spread overlapping planets along a ring so their glyphs don't collide. Two
// relaxation passes (forward then backward) enforce a min angular separation
// sized to give ~16px of arc at the given ring radius. Returns display
// longitudes keyed by planet name; the true longitude is still marked by a
// tick at the planet's real position by the caller.
// Half-widths on the glyph ring, in pixels — what a mark actually occupies, and
// therefore what its neighbour has to clear.
//
// The angle codes are TEXT, and text is not square: "Ic" is barely half the width
// of "Avx". One separation figure for the whole ring can only be right for one of
// them, which is why the codes used to sit on top of the discs beside them — the
// figure was sized for a circular disc and the labels are wider than that. So each
// mark states its own half-width and every pair clears the sum of the two.
//
// (spreadOnRing lived here: bodies-only spreading for the overlay ring. It was
// the reason the overlay's angle codes were overlapped — it had no way to be told
// about them. placeOnRing above replaced it and takes both sets.)

// Retrograde / stationary highlight colors for the readout (sign · degree ·
// minute) text only — the planet glyph keeps its own color. Fixed across the built-in
// themes: red and dark-yellow read clearly on every one. Since 2026-10-06 they are the
// var() expressions of lib/themePalette wheelMotionInk — `var(--wheel-retro, #e85a4f)` /
// `var(--wheel-station, #c79a17)` — which no stylesheet declares, so a built-in theme draws
// exactly those hexes and a Custom theme can retune them. Style values only.
//
// Note for whoever next reads the readout: the degree and minute <text> carry the status
// colour as a `fill=` ATTRIBUTE, and `.wheel-svg .readout-deg` / `.readout-min` set `fill`
// in WheelSvg.css — a class rule, which beats a presentation attribute (the header of
// WheelSvg.css explains the mechanism). So today only the readout's SIGN glyph, which
// paints currentColor off the group's inline `color`, actually turns red / yellow. Left as
// it stands on purpose: moving the trio to an inline style would repaint every retrograde
// readout on the built-in themes, which the Custom theme work must not do.
const RETRO_COLOR = wheelMotionInk('retro');
const STATION_COLOR = wheelMotionInk('station');

// (The size-driven detail tiers moved to lib/wheelGeometry.ts, where they became
// an OFFER rather than a verdict: what a wheel actually draws is now decided by
// whether the aspect hub still gets its share of the middle, not by a threshold.)

// Highlight color for a body's motion state, or null for normal coloring.
function statusColor(p: EclipticPosition): string | null {
  if (p.stationary) return STATION_COLOR;
  if (p.retrograde) return RETRO_COLOR;
  return null;
}

// The motion state appended as a tag to a readout sign's hover title — same
// station-before-retrograde priority as statusColor, so the tag matches the
// red / yellow coloring of the sign it's on. null for direct motion.
type MotionTag = 'retrograde' | 'stationary';
function motionTag(p: { retrograde?: boolean; stationary?: boolean }): MotionTag | null {
  if (p.stationary) return 'stationary';
  if (p.retrograde) return 'retrograde';
  return null;
}
// The mark + accent for each motion tag, mirroring the sidebar's ℞ / S markers
// (ExpandedChartSidebar) so the wheel and the data table read the same. The ℞ / S
// glyphs and colours stay language-neutral; the spelled-out word is resolved via
// wheel.motion.<tag>.
const MOTION_MARK: Record<MotionTag, { char: string; color: string }> = {
  retrograde: { char: '℞', color: RETRO_COLOR },
  stationary: { char: 'S', color: STATION_COLOR },
};
const motionWord = (t: TFn, tag: MotionTag) => t(`wheel.motion.${tag}` as MsgKey);

// A sign glyph's ink on the wheel, by sign index (2026-10-06): the Custom theme's colour
// for the sign's element when it draws signs by element, else its one sign colour, else
// currentColor — which is what every sign glyph painted before, so a built-in theme (no
// stylesheet declares any of the three) is unchanged. Element order is the zodiac's own
// (Aries fire, Taurus earth, Gemini air, Cancer water, and round again). A STYLE value:
// ZodiacGlyph writes it as one.
const SIGN_INK: readonly string[] = Array.from(
  { length: 12 },
  (_, i) => `var(--wheel-sign-${ELEMENT_ORDER[i % 4]}, var(--wheel-sign, currentColor))`,
);

interface WheelSvgProps {
  size: number;
  angles: RelocatedAngles;
  planets: EclipticPosition[];
  detailed: boolean;
  /** Advanced mode adds the rim degree-scale + cusp-rim labels (the inner
   *  readout is now driven by wheel size, not this toggle). */
  advanced?: boolean;
  /**
   * Bi-wheel: a second chart's planets (transits / progressed / solar-arc /
   * synastry partner) drawn in an outer ring just inside the zodiac band,
   * dashed and dimmed. Detailed mode only, and only when the wheel is large
   * enough to fit the extra ring.
   */
  overlayPlanets?: EclipticPosition[] | null;
  /** The overlay chart's own MC/IC/AS/DS, marked in the outer ring (gated by the
   *  same visibleAngles toggles as the natal angles). */
  overlayAngles?: RelocatedAngles | null;
  visibleAspects?: Set<AspectCategory>;
  /** Per-aspect orb limits (Advanced ▸ Aspect orbs). Omitted → the flat-7°
   *  defaults, the original behaviour. */
  aspectOrbs?: AspectOrbs;
  /**
   * Which angle marks (by code: As/Ds/Mc/Ic and the Vx/Avx Vertex axis) to draw,
   * mirroring the Map Filter's line-type toggles. Omitted → all (the minimap
   * draws no angle marks, so it never reaches this).
   */
  visibleAngles?: Set<'As' | 'Ds' | 'Mc' | 'Ic' | 'Vx' | 'Avx'>;
  /**
   * Enable novice hover hints: a responsive scale on the planet discs + rim
   * signs, the four angle labels (AS/MC/DS/IC), and a floating tag naming each
   * one. Opt-in so the minimap stays static — only the expanded sidebar sets it.
   */
  interactive?: boolean;
  /**
   * OFFER the per-body degree·sign·minute readout below the size at which the wheel
   * would offer it unprompted (READOUT_OFFER_MIN, lib/wheelGeometry). It is only an
   * offer either way: the geometry still sheds the trio — minutes first, then the sign,
   * then the whole thing — if keeping it would take the aspect hub below its share of
   * the radius. For the Capture wheel, which is smaller than a sidebar wheel but still
   * wants the readout when there's room for it.
   */
  readouts?: boolean;
  /**
   * Planets on the zodiac ring only: no houses, cusps, angle axes, or angle
   * marks — for a chart whose angles aren't real (the birth time is unknown, so
   * the ASC/MC and every house are functions of a minute nobody has). Pair with
   * ARIES_FRAME so the zodiac reads in the classic sign order; planet-to-planet
   * aspects still draw (they don't depend on the time of day).
   */
  planetsOnly?: boolean;
  /**
   * Catalog minor bodies (lib/minorBodies/wheel), placed on the NATAL chart only —
   * never on the overlay ring. Plotted and never aspected: they are not handed to the
   * aspect pass, so no chord or conjunction dot can reach them. On every wheel each
   * one gets a diamond in the tick strip at its true degree. A single wheel at or above
   * MINOR_RING_MIN (600px) also draws each as a coin in a ring just inside the zodiac
   * band, the planet ring stepped inward to make room; a bi-wheel never does
   * (lib/wheelGeometry says why, with the measurements).
   *
   * Absent or empty means none. Nothing in this component reads the minor-body
   * preference or its loader — whatever is passed is what is drawn — which is what
   * keeps a stored document's wheel exactly as it was when it was made.
   */
  minorBodies?: readonly WheelMinorBody[] | null;
  /**
   * The OVERLAY chart's catalog minor bodies (lib/minorBodies/wheel, from an overlay's
   * own samples), drawn only on a bi-wheel — with an overlay ring to belong to. Each is a
   * mark at its true degree in the tick strip beside the chart's own (lib/wheelGeometry
   * rOverlayPip says why there and not on the divider), smaller and softened as the
   * overlay ring is, and named with the overlay in its tip. Never aspected. Absent or
   * empty: none, and the wheel's geometry exactly as without it — every Reports wheel.
   */
  overlayMinorBodies?: readonly WheelMinorBody[] | null;
  /** The overlay chart's short name ("Transits", "Solar Return"), which its catalog
   *  marks' tips are titled with. Read only beside overlayMinorBodies. */
  overlayName?: string | null;
  /** Hold the catalog ring with no bodies in it yet, because their files are still on
   *  their way — so the planet ring does not step inward a moment after the first
   *  paint. A request like the bodies themselves: the size still decides, and a
   *  bi-wheel never takes it. */
  minorReserve?: boolean;
  /**
   * Discreet mode over a birthplace's GEODETIC frame (2026-10-02): those angles are a
   * function of the place alone — the MC is its longitude — so their figures are birth
   * data. Hides every degree the wheel prints for the frame: both angle readout trios
   * (natal and overlay ring, which on a geodetic map is the same place's frame), the
   * angle tips' longitude line and the cusp rim's degree and minutes. The marks, axes
   * and houses still draw where they fall. The caller decides when — Discreet on, the
   * frame geodetic, and its place the birthplace — so the wheel never reads the mode.
   *
   * A Lot among the planets (POINTS: the Part of Fortune) loses its readout trio and
   * its tip's longitude too: it is built from this frame's Ascendant, so its degree
   * beside the Sun's and Moon's would give the masked Ascendant back exactly. Its
   * glyph stays where it falls, as the angle marks do.
   */
  maskAngleText?: boolean;
  /**
   * A line per body saying where its figure comes from, printed last in that body's
   * hover tip — even where maskAngleText hides the figure itself. The NATAL ring only:
   * an overlay's bodies are another chart's. Today it carries one entry, the Part of
   * Fortune on a geodetic map, which the caller builds from the place's geodetic
   * Ascendant rather than the chart's own (2026-10-02).
   */
  bodyNotes?: ReadonlyMap<PlanetName, string> | null;
  /**
   * Bodies known only to a span, with its half-width in degrees: a chart with no birth
   * time, cast for its 12:00 placeholder (lib/astro/timeless) — the Moon, and on a geodetic
   * map the Part of Fortune. Such a body's tip prints the span instead of a degree to the
   * minute, it gets no degree·sign·minute trio in the readout ring, and a detailed wheel
   * draws the span as an arc of the tick strip in its colour. The NATAL ring only, like
   * bodyNotes. (2026-10-02)
   */
  ranges?: ReadonlyMap<PlanetName, number> | null;
}

/** No catalog bodies: one stable reference, so the ring layout's memo holds still. */
const NO_MINOR: readonly WheelMinorBody[] = [];
/** A rim mark in the tick strip, and which chart it belongs to — the chart's own, or an
 *  overlay's beside it on a bi-wheel. */
interface PipMember {
  m: WheelMinorBody;
  overlay: boolean;
}

// Below the ring size, a catalog body's only mark is its rim diamond — a few px across,
// too small to aim a pointer at on its own. Each is given this much ring either side
// (px along the ring), and diamonds whose zones overlap are one hover target that names
// every body in it, rather than a stack of targets where only the top one can ever win.
const MINOR_PIP_HIT_PX = 6;
// A cluster's tip lists its bodies by name and degree, up to this many, then says how
// many more — and never more copy than TIP_COPY_MAX characters, the most a .ui-tip
// carries at the app's standard card width (ui/tipWidth steps wider past it), so the
// card keeps that width however long the catalog names run.
const MINOR_CLUSTER_LINES = 4;
const TIP_COPY_MAX = 180;

/**
 * The neutral frame for a planets-only wheel: 0° Aries takes the due-left anchor
 * the Ascendant normally holds. The angle values exist only to satisfy the frame
 * shape — planetsOnly suppresses everything that would draw them — and the empty
 * cusps keep every house-driven loop naturally empty.
 */
export const ARIES_FRAME: RelocatedAngles = {
  asc: 0,
  dsc: Math.PI,
  mc: (3 * Math.PI) / 2,
  ic: Math.PI / 2,
  vertex: 0,
  antivertex: Math.PI,
  cusps: [],
};

export function WheelSvg({
  size,
  angles,
  planets,
  detailed,
  advanced = false,
  overlayPlanets,
  overlayAngles,
  visibleAspects,
  aspectOrbs = DEFAULT_ASPECT_ORBS,
  visibleAngles,
  interactive = false,
  readouts = false,
  planetsOnly = false,
  minorBodies,
  overlayMinorBodies,
  overlayName = null,
  minorReserve = false,
  maskAngleText = false,
  bodyNotes = null,
  ranges = null,
}: WheelSvgProps) {
  const { t, labels } = useT();
  // Hovered hint (interactive mode only). Hooks run unconditionally; when the
  // wheel isn't interactive no handler ever sets it, so it stays null.
  const [tip, setTip] = useState<HoverTip | null>(null);
  const clearTip = () => setTip(null);

  // Bi-wheel: when a second chart is supplied (and the wheel is big enough), its
  // planets occupy an outer ring just inside the zodiac band, and the natal glyph
  // ring is pushed inward to make room. This is the one geometry input the
  // component decides rather than the solver, because it depends on the DATA
  // (is there a second chart at all?) and not on the radius.
  const hasOverlay =
    detailed && !!overlayPlanets && overlayPlanets.length > 0 && size >= 420;

  // Every radius, disc size and font size the wheel draws with. See
  // lib/wheelGeometry.ts: the bands are shares of the radius with pixel floors and
  // caps, and when they still do not fit, detail is shed in a declared order — the
  // overlay readout, then the natal minutes, then its sign, then the readout
  // entirely — until the aspect hub keeps its floor of the middle. The cusp rim and
  // the house band are NOT on that list and never shed.
  //
  // The font sizes below are handed to the elements as SVG presentation attributes,
  // which any CSS selector would beat — see the note at the top of WheelSvg.css, and
  // do not add a font-size there for a class sized from here.
  //
  // What this replaced was a cascade of fixed constants cut for a ~700px wheel. On
  // a phone their sum exceeded the whole radius, so the rings nearest the centre
  // absorbed the shortfall: a 12px aspect hub (6.3% of the radius) with 12.6px of
  // arc per house number, and — below 300px — a house band of ZERO, which deleted
  // the house ring, the cusp lines and all twelve numbers with nothing said.
  //
  // The catalog ring is the other data-driven input, and like the overlay it is only
  // asked for: the geometry grants it by size alone (see MINOR_RING_MIN there), and on a
  // single wheel only — a bi-wheel takes the rim-diamond path at every size, and
  // `minorRingOn` below is false there.
  //
  // Memoised because the catalog ring's layout below is, and a memo can only hold
  // still on inputs that do: the geometry is a pure function of these seven values.
  const minorList = minorBodies ?? NO_MINOR;
  const wantMinorRing = minorList.length > 0 || minorReserve;
  // An overlay's catalog bodies belong to its ring, so they are drawn only with one.
  const overlayMinorList = hasOverlay ? (overlayMinorBodies ?? NO_MINOR) : NO_MINOR;
  const wantOverlayMinor = overlayMinorList.length > 0;
  const g = useMemo(
    () =>
      wheelGeometry({
        size,
        detailed,
        advanced,
        hasOverlay,
        planetsOnly,
        readouts,
        minorRing: wantMinorRing,
        overlayMinor: wantOverlayMinor,
      }),
    [size, detailed, advanced, hasOverlay, planetsOnly, readouts, wantMinorRing, wantOverlayMinor],
  );
  const {
    cx, cy,
    rOuter, rZodiacInner, rPlanets,
    rOverlay, rOverlayReadout, rOverlayDivider, overlayFan: OV_FAN,
    houseRingOuter, houseRingInner, houseBand,
    rAspectRing, rInner,
    readoutFont, discR, discHalf, glyphPx, signGlyphPx,
    houseNumPx, cuspRimPx, cuspSignPx, cuspUnitStepPx, cuspUnitHalfPx, angleCodePx,
    rPip, pipR, rMinor, minorR, minorDiscHalf, minorGlyphPx, bodyOverlap,
    rOverlayPip, overlayPipR,
  } = g;
  const showReadouts = g.detail.readout;
  const showOverlayReadouts = g.detail.overlayReadout;
  const showCuspRim = g.detail.cuspRim;
  const minorRingOn = g.detail.minorRing;

  // Where each catalog coin sits on its ring (display longitude, radians, by body id).
  // Laid out by the one function the verify suite asserts about (lib/wheelRingLayout),
  // between the four axes — the walls that cap how far a crowded coin may be pushed —
  // and in its own pass, so no catalog body can move a planet off its notch. Empty below
  // the ring size and on a bi-wheel, where there is nothing to lay out. Memoised on
  // exactly what it reads: a hover re-renders the wheel, and the answer cannot have
  // changed.
  const { asc: axAsc, dsc: axDsc, mc: axMc, ic: axIc } = angles;
  const minorDisplay = useMemo(
    () =>
      layoutMinorRing(
        { rMinor, minorDiscHalf, bodyOverlap },
        minorRingWalls(planetsOnly ? null : { asc: axAsc, dsc: axDsc, mc: axMc, ic: axIc }),
        minorList,
      ),
    [rMinor, minorDiscHalf, bodyOverlap, planetsOnly, axAsc, axDsc, axMc, axIc, minorList],
  );

  // Whole-sign houses: the first house is a SIGN, beginning at 0° of the rising
  // sign, and the Ascendant floats somewhere inside it. That is the whole content
  // of the system, so the boundary is what the wheel is built on — every other
  // program draws it that way, and anchoring on the Ascendant instead left the
  // house divisions lying at an angle nobody else shows.
  //
  // Detected from the cusps rather than passed in: whole sign is the one system
  // whose twelve cusps ALL sit on sign boundaries. Equal houses are 30° apart too
  // but offset from the Ascendant, and only coincide with this when the Ascendant
  // is itself exactly on a boundary — where the two anchors are the same degree
  // anyway. (Meridian and Morinus start their first house on an East Point rather
  // than the Ascendant, and are deliberately NOT included: their cusps are not
  // uniform, and this is not the change to decide their convention in.)
  const SIGN_RAD = Math.PI / 6;
  const onSignBoundary = (lon: number) => {
    const m = ((lon % SIGN_RAD) + SIGN_RAD) % SIGN_RAD;
    return Math.min(m, SIGN_RAD - m) < 1e-6; // ~0.2 arcsec
  };
  const wholeSign =
    angles.cusps.length === 12 && angles.cusps.every(onSignBoundary);

  // The longitude that sits at due-left — the wheel's rotation reference, and the
  // ONE value every draw site below rotates against.
  const frameAnchor = wholeSign ? angles.cusps[0] : angles.asc;

  // The wheel is rotated so the first house cusp sits at due-left. Under every
  // system but whole sign that IS the ASC, making the ASC–DSC axis a true
  // horizontal diameter; under whole sign the Ascendant falls inside the first
  // house and the axis tilts, so it is drawn from its real longitude (below) the
  // way the MC–IC axis always has been. The MC is NOT at due-top either (that
  // only holds when asc − mc = 90°), so the detailed MC–IC axis is drawn at the
  // MC's real longitude via svgPos — keeping the cusp-10/cusp-4 separators
  // aligned with the house numbers.
  const mcOuter = svgPos(angles.mc, frameAnchor, rOuter, cx, cy);
  const icOuter = svgPos(angles.ic, frameAnchor, rOuter, cx, cy);
  // Drawn from the Ascendant's real longitude rather than as a flat diameter: it
  // IS a flat diameter whenever the anchor is the Ascendant (every system but
  // whole sign), and under whole sign it has to tilt to where the Ascendant
  // actually falls inside the first house.
  const ascOuter = svgPos(angles.asc, frameAnchor, rOuter, cx, cy);
  const dscOuter = svgPos(angles.dsc, frameAnchor, rOuter, cx, cy);

  // `planets` only. The catalog bodies (minorBodies) are placed, never aspected — they
  // are simply not handed to this pass, so no chord or conjunction dot can reach them
  // (the reason is on calculation-methods.md).
  const aspects = detailed ? computeAspects(planets, aspectOrbs) : [];
  // Normalizes the per-aspect opacity fade: an exact aspect is brightest, one
  // at the (configurable) orb limit sits at the floor.
  const maxOrb = maxAspectOrb(aspectOrbs);
  const filteredAspects = visibleAspects
    ? aspects.filter((a) => visibleAspects.has(a.category))
    : aspects;

  // A bi-wheel draws the INNER chart's aspects only. Cross-ring contacts
  // (overlay-to-natal) were once drawn here as a second, dashed web; two webs
  // over one centre is unreadable at any wheel size, and the contacts are
  // better served as a list, where each pair can carry its own orb. Callers
  // that want them compute computeCrossAspects() themselves and render a
  // section beside the wheel. A per-ring toggle for the chords is a separate
  // question and deliberately not answered here.

  // The four chart angles (AS/MC/DS/IC), drawn as ring marks alongside the
  // planets so they read in the chart itself rather than in a separate list.
  // Each keeps its axis colour — AS/DS gold, MC/IC cool — and joins the planet
  // spread below so an angle is never stacked on top of a planet it's conjunct.
  //
  // Gated on the DETAILED wheel, not on `interactive`. The two were one flag
  // once, which meant a non-interactive consumer — a rasterised or printed
  // wheel — drew a relocated chart with no angle marked at all, the one thing
  // such a chart exists to show. Interactivity now decides only the hover
  // affordances (ANGLE_HINTS, the hit targets), not whether the marks exist.
  const showAngleMarks = detailed && !planetsOnly;
  // A Lot whose figure goes with the masked angles' (maskAngleText says why). (2026-10-02)
  const maskLot = (name: PlanetName) => maskAngleText && POINTS.includes(name);
  const angleLonByKey: Record<AngleKey, number> = {
    As: angles.asc,
    Ds: angles.dsc,
    Mc: angles.mc,
    Ic: angles.ic,
    Vx: angles.vertex,
    Avx: angles.antivertex,
  };
  // The axis colours are the Custom theme's wheel axes when it sets them, and the accent /
  // cool otherwise — the same var(--wheel-axis-*, …) pair the axis lines in WheelSvg.css
  // read, so a code and its axis can never disagree. Neither variable is declared by any
  // stylesheet, so a built-in theme paints var(--accent) / var(--cool) as before.
  // (2026-10-06)
  const angleColor = (key: AngleKey) =>
    key === 'As' || key === 'Ds'
      ? 'var(--wheel-axis-asc, var(--accent))'
      : key === 'Vx' || key === 'Avx'
        ? 'var(--text-muted)'
        : 'var(--wheel-axis-mc, var(--cool))';
  // Every mark — the four primary angles AND the Vertex axis — follows the
  // map's line-type filter toggles, so wheel and map always show the same set.
  const angleMarks = showAngleMarks
    ? ANGLE_HINTS.filter(
        (h) =>
          Number.isFinite(angleLonByKey[h.key]) &&
          (!visibleAngles || visibleAngles.has(h.key)),
      ).map((h) => ({
        ...h,
        // Name only. The `.sub` gloss beside it in the catalog is what an angle
        // MEANS, and that is now read off its row below the wheel rather than off
        // the mark — the mark's tip gives the position.
        title: t(`wheel.angles.${h.key}.title`),
        lon: angleLonByKey[h.key],
        color: angleColor(h.key),
      }))
    : [];
  // The overlay chart's angles, marked in the outer (overlay) ring — same toggles
  // as the natal angle marks. The Vertex axis rides along now: a directed
  // overlay's Vertex point IS directed (re-derived from the advanced RAMC — see
  // ephemeris.directedAngles), a real point shown alongside the natal Vertex; a
  // transit/synastry overlay shows its own relocated Vertex.
  const overlayAngleLonByKey: Record<AngleKey, number> | null =
    overlayAngles
      ? {
          As: overlayAngles.asc,
          Ds: overlayAngles.dsc,
          Mc: overlayAngles.mc,
          Ic: overlayAngles.ic,
          Vx: overlayAngles.vertex,
          Avx: overlayAngles.antivertex,
        }
      : null;
  const overlayAngleMarks =
    showAngleMarks && overlayAngleLonByKey
      ? ANGLE_HINTS.filter(
          (h) =>
            Number.isFinite(overlayAngleLonByKey[h.key]) &&
            (!visibleAngles || visibleAngles.has(h.key)),
        ).map((h) => ({
          ...h,
          title: t(`wheel.angles.${h.key}.title`),
          lon: overlayAngleLonByKey[h.key],
          color: angleColor(h.key),
        }))
      : [];

  const off = (lon: number) =>
    ((((lon - angles.asc) * 180) / Math.PI) % 360 + 360) % 360;

  // Spread overlapping planets along the ring so their glyphs and readouts
  // don't collide; the true position is still marked by a tick on the zodiac
  // band. Aspect lines keep using the true longitudes.
  //
  // The angle codes are the FIXED marks here: they name an axis, so they hold the
  // exact spot where that axis crosses the ring and the bodies move around them.
  // (They used to relax alongside the bodies on equal terms, under one separation
  // figure sized for a circular disc — which left a code both off its own axis AND
  // still overlapping its neighbour, since the codes are wider than the discs the
  // figure was cut for. Both halves of that are fixed by giving each mark its own
  // width and letting the axes stand still.)
  //
  // ONE converter for both rings, and the only place either of them may call the
  // layout module: placeOnRing answers in DEGREES round the ring, every draw site
  // below reads an absolute longitude in RADIANS, and a ring laid out in one unit
  // and drawn in the other puts its glyphs nowhere near the ticks that mark their
  // true degree. (Which is what the overlay ring did the day it was moved onto
  // placeOnRing: the natal path converted, the overlay path did not.)
  const placeLongitudes = (
    fixed: RingMark[],
    movable: RingMark[],
    minSep: number,
    radius: number,
  ): Map<string, number> => {
    const out = new Map<string, number>();
    // The overlap tolerance rides on every ring this converter serves — see
    // BODY_OVERLAP_SHARE in ringLayout: bodies may share a third of their width
    // rather than be pushed across a house cusp to avoid touching.
    for (const [name, deg] of placeOnRing(fixed, movable, minSep, radius, g.bodyOverlap)) {
      out.set(name, angles.asc + (deg * Math.PI) / 180);
    }
    return out;
  };

  const displayLon = new Map<string, number>();
  if (detailed) {
    // A floor every pair clears on top of what their own widths ask for. The
    // degree·sign·minute trio fans INWARD from the glyph ring, and the same angle
    // buys less arc the further in it lands, so it is sized on that innermost
    // (minutes) ring — otherwise the figures collide under discs that look
    // correctly spaced.
    //
    // Only while the trio is actually drawn, though. It used to be charged on
    // every wheel, and on one too small to show a readout at all that is a wide
    // reservation for a ring that isn't there: at the narrowest sidebar width it
    // came to 27px of arc between marks that need 23, which both flung bodies
    // further from their true degree than anything required and left arcs too
    // narrow to hold what fell in them. Below the readout size the widths decide
    // on their own.
    const sep = g.ringSep;
    const placed = placeLongitudes(
      angleMarks.map((a) => ({
        name: a.key as string,
        off: off(a.lon),
        half: angleLabelHalfPx(ANGLE_LABEL[a.key], angleCodePx, g.angleCodeHalo),
      })),
      planets.map((p) => ({
        name: p.name as string,
        off: off(p.lon),
        half: discHalf,
      })),
      sep,
      Math.max(rPlanets, 1),
    );
    for (const [name, lon] of placed) displayLon.set(name, lon);
  }
  // ── The zodiac band's own layout ──────────────────────────────────────────
  // The band carries two things now: the twelve sign glyphs and — in Advanced —
  // the twelve house-cusp readouts, which used to ring the OUTSIDE of the wheel
  // and reserved a fifth of the radius on a phone for the privilege.
  //
  // They share one radius, so they have to be kept off each other. Only whole sign
  // puts a cusp on a sign boundary; under the other nine systems a cusp lands
  // mid-sign, and at the band radius a cusp within ~9° of a sign's midpoint would
  // print on top of its glyph — which is most of them.
  //
  // Same fixed/movable split placeOnRing already runs for angle codes against
  // bodies, and for the same reason: a cusp readout NAMES A POSITION and must stay
  // on it, while a sign glyph merely labels a 30° arc and reads no differently a
  // few degrees off its midpoint. So the glyph is the one that gives way.
  const rBandMid = (rZodiacInner + rOuter) / 2;
  // Tabular digits run ~0.55em; the degree and minute marks are narrower, so this
  // is a slight over-estimate and errs toward keeping the glyph clear.
  //
  // The cusp figure truncates through format.ts truncZodiac (2026-10-02): the floor it
  // always took, plus that rule's float snap, so a cusp lying exactly on a minute (a
  // geodetic cusp 10 IS the MC, a whole minute of longitude) prints that minute, as
  // the MC's own readout does, rather than the one below it.
  const cuspText = (lon: number) => {
    const z = truncZodiac(lon, 'min');
    return { deg: z.deg, min: z.min, signIdx: z.signIdx };
  };
  // A cusp reads as ONE unit — degree, sign glyph, minutes, laid along the band the
  // way a printed chart annotates a cusp. Its glyph size, its internal step and its
  // half-width all come from the geometry, so the band suite reserves the same arc
  // this actually draws rather than a second estimate of it.
  /** The step from the unit's centre out to its degree and its minutes, in SCREEN
   *  px rather than along the band. The unit is a horizontal line of text wherever
   *  it lands, so the degree is on the left at the bottom of the wheel exactly as it
   *  is at the top. Stepping along the curve instead looks tidier on the rim and
   *  reads backwards for half the chart — `00' ♍ 0°` at the six o'clock cusp. */

  /** Where a cusp unit puts its degree and its minutes, relative to its sign glyph.
   *
   *  ALONG THE BAND, not flat across the picture. At twelve and six o'clock the band
   *  runs horizontally and the unit reads `0° ♓ 00'` across; at three and nine it
   *  runs vertically and the unit stacks, degree above the glyph and minutes below.
   *  That is what the reference charts do, and it is also what keeps the unit ON the
   *  wheel: laid out flat, a unit at the sides is at the band's widest point in x and
   *  half of it falls off the edge of the picture.
   *
   *  The direction is then normalised so the unit always READS the right way round —
   *  degree to the left where the run is more horizontal, degree above where it is
   *  more vertical. Without that the six o'clock cusp comes out `00' ♍ 0°`. */
  const cuspOffset = (px: number, py: number) => {
    const dx = px - cx;
    const dy = py - cy;
    const len = Math.hypot(dx, dy) || 1;
    // The tangent at this point on the band.
    let ux = -dy / len;
    let uy = dx / len;
    // Point it rightward when the run is mostly horizontal, downward when mostly
    // vertical, so the degree (which sits at -u) lands left or above.
    const flip = Math.abs(ux) >= Math.abs(uy) ? ux < 0 : uy < 0;
    if (flip) {
      ux = -ux;
      uy = -uy;
    }
    return { ux, uy };
  };
  const cuspMarks: RingMark[] = showCuspRim
    ? angles.cusps
        .map((lon, idx) => ({ name: `cusp-${idx}`, off: off(lon), half: cuspUnitHalfPx }))
        .filter((m) => Number.isFinite(m.off))
    : [];
  // The band carries ONE kind of mark at a time: the cusp units when they are drawn,
  // and the plain sign glyphs at their midpoints when they are not. So the only
  // thing to resolve here is cusp against cusp — twelve of them are 30° apart under
  // most systems, but a polar Placidus chart bunches several within a degree or two,
  // and two units printed on the same spot are worse than either one moved.
  const bandLon =
    detailed && cuspMarks.length > 1
      ? placeLongitudes(cuspMarks, [], 0, Math.max(rBandMid, 1))
      : new Map<string, number>();
  /** Where cusp `idx`'s readout is drawn. Fixed marks keep their exact spot unless
   *  the band cannot hold the set at all — polar Placidus bunches cusps within a
   *  degree or two — in which case placeOnRing relaxes them among themselves rather
   *  than printing one on top of another. */
  const cuspLonFor = (idx: number, trueLon: number) =>
    bandLon.get(`cusp-${idx}`) ?? trueLon;

  const lonFor = (p: EclipticPosition) => displayLon.get(p.name) ?? p.lon;
  const angleLonFor = (a: { key: string; lon: number }) =>
    displayLon.get(a.key) ?? a.lon;
  const minorLonFor = (m: WheelMinorBody) => minorDisplay.get(m.id) ?? m.lon;

  // One spread for the overlay ring, shared by its glyphs and (when shown) its
  // readout trio so the two stay radially aligned. Sized to the innermost ring
  // in use — the minutes slot when the readout is on — so nothing collides there.
  //
  // The overlay's angle codes are fixed marks on this ring exactly as the natal
  // ones are on theirs. They are DRAWN at their true longitude already; what was
  // missing is that nothing knew they were there, so the overlay bodies were
  // spread against each other only and settled straight on top of them.
  const overlayDisplay = hasOverlay
    ? placeLongitudes(
        overlayAngleMarks.map((a) => ({
          name: a.key as string,
          off: off(a.lon),
          half: angleLabelHalfPx(ANGLE_LABEL[a.key], angleCodePx, g.angleCodeHalo),
        })),
        overlayPlanets!.map((p) => ({
          name: p.name as string,
          off: off(p.lon),
          half: discHalf,
        })),
        // Conditional for the same reason the natal ring's is: the floor exists to
        // keep the degree·sign·minute trio clear where it fans inward, and on a
        // wheel too small to draw that trio it is arc reserved for a ring that
        // isn't there.
        g.overlayRingSep,
        Math.max(rOverlay, 1),
      )
    : null;
  const overlayLonFor = (p: EclipticPosition) =>
    overlayDisplay?.get(p.name) ?? p.lon;
  const overlayAngleLonFor = (a: { key: string; lon: number }) =>
    overlayDisplay?.get(a.key) ?? a.lon;

  // ── Catalog minor bodies: their tips, and their clusters below the ring size ──
  // A catalog body's tip is a body's tip (bodyTip): its name and its sign on the title
  // line, then its motion and where it sits. Its own mark leads the title in its line
  // colour, the way a planet's glyph leads a planet's.
  const minorTip = (m: WheelMinorBody, x: number, y: number, r: number): HoverTip => ({
    x,
    y,
    r,
    title: m.label,
    ...bodyTip(t, labels, m),
    color: m.color,
    marker: <MinorMark color={m.color} glyph={m.glyph} hollow={m.hypothetical} size={14} />,
  });
  // An overlay's catalog body: the same tip, titled with the overlay chart's name beside
  // its own, since its mark shares the strip with the chart's.
  const overlayMinorTip = (m: WheelMinorBody, x: number, y: number, r: number): HoverTip => ({
    ...minorTip(m, x, y, r),
    title: overlayName ? t('wheel.tip.overlayMinor', { name: m.label, chart: overlayName }) : m.label,
  });
  // Several bodies under one target: how many, then each by mark, name and degree —
  // the colour is what ties a line to its diamond on the rim — as many as the copy
  // budget holds, and a count of the rest. On a bi-wheel the target can hold both charts'
  // marks: a cluster of the overlay's alone is titled with its name, and in a mixed one
  // each of its lines says whose it is.
  const minorClusterTip = (members: PipMember[], x: number, y: number): HoverTip => {
    const allOverlay = !!overlayName && members.every((e) => e.overlay);
    const title = allOverlay
      ? t('wheel.tip.overlayMinorCluster', { n: members.length, chart: overlayName })
      : t('wheel.tip.minorCluster', { n: members.length });
    let budget = TIP_COPY_MAX - title.length;
    const lines: { m: WheelMinorBody; text: string; signIdx: number }[] = [];
    for (const { m, overlay } of members) {
      if (lines.length === MINOR_CLUSTER_LINES) break;
      const { signIdx, degMin } = lonToZodiac(m.lon);
      const text =
        overlay && overlayName && !allOverlay
          ? t('wheel.tip.minorLineOverlay', { name: m.label, lon: degMin, chart: overlayName })
          : t('wheel.tip.minorLine', { name: m.label, lon: degMin });
      const left = members.length - lines.length - 1;
      const moreLen = left > 0 ? t('wheel.tip.minorMore', { n: left }).length : 0;
      // The mark and the sign glyph around the text read as a character each.
      if (lines.length > 0 && text.length + 2 + moreLen > budget) break;
      budget -= text.length + 2;
      lines.push({ m, text, signIdx });
    }
    const more = members.length - lines.length;
    return {
      x,
      y,
      r: MINOR_PIP_HIT_PX,
      title,
      sub: (
        <>
          {lines.map((l, i) => (
            <Fragment key={`${i}-${l.m.id}`}>
              {i > 0 && <br />}
              <span className="wheel-tip-minor-line">
                <MinorMark color={l.m.color} glyph={l.m.glyph} hollow={l.m.hypothetical} size={10} />
                {l.text}
                <ZodiacGlyph sign={l.signIdx} size={11} />
              </span>
            </Fragment>
          ))}
          {more > 0 && (
            <>
              <br />
              {t('wheel.tip.minorMore', { n: more })}
            </>
          )}
        </>
      ),
    };
  };
  // Below the ring size a diamond is the body's only mark, and each is given
  // MINOR_PIP_HIT_PX of ring either side to be hovered by. Where those zones overlap the
  // bodies are one cluster with one target: walked in zodiac order and split wherever
  // the gap between neighbours clears two zones. The walk starts just past such a gap,
  // so no cluster is cut in two where the circle closes; with no such gap anywhere,
  // every body is one cluster. None on the ring, where the coins carry the tips, and
  // none on a static wheel.
  //
  // An overlay's marks share the strip (rOverlayPip), so they are walked WITH the chart's:
  // two zones over one strip would leave whichever was drawn first unreachable where they
  // overlap. A cluster's tip says whose each body is (minorClusterTip).
  const pipMarks: PipMember[] = useMemo(
    () => [
      ...(minorRingOn ? [] : minorList.map((m) => ({ m, overlay: false }))),
      ...overlayMinorList.map((m) => ({ m, overlay: true })),
    ],
    [minorRingOn, minorList, overlayMinorList],
  );
  const minorClusters: PipMember[][] = [];
  const TWO_PI = 2 * Math.PI;
  const normLon = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
  if (interactive && pipMarks.length > 0 && rPip > 0) {
    const reach = (2 * MINOR_PIP_HIT_PX) / rPip;
    const byLon = [...pipMarks].sort((a, b) => normLon(a.m.lon) - normLon(b.m.lon));
    const gapBefore = (i: number) =>
      normLon(byLon[i].m.lon - byLon[(i + byLon.length - 1) % byLon.length].m.lon);
    let start = 0;
    for (let i = 0; i < byLon.length && byLon.length > 1; i++) {
      if (gapBefore(i) >= reach) {
        start = i;
        break;
      }
    }
    let cur: PipMember[] = [];
    for (let k = 0; k < byLon.length; k++) {
      const i = (start + k) % byLon.length;
      if (cur.length > 0 && gapBefore(i) >= reach) {
        minorClusters.push(cur);
        cur = [];
      }
      cur.push(byLon[i]);
    }
    if (cur.length > 0) minorClusters.push(cur);
  }

  // A sign glyph inside a body's readout that names itself on hover (interactive
  // wheel only), exactly like the rim signs — so the sign attached to each planet
  // reads the same way as the zodiac band. When the body is retrograde / stationary
  // (the red / yellow readout, Advanced mode) its `status` appends the matching
  // ℞ / S tag to the hover title. Non-interactive wheels just draw the glyph.
  //
  // The glyph takes the sign ink (SIGN_INK) — except under a motion status, where it keeps
  // currentColor: the group's red / yellow is what says the body is retrograde, and a sign
  // colour painted over it would erase that. (2026-10-06)
  const readoutSign = (
    signIdx: number,
    x: number,
    y: number,
    size: number,
    status?: MotionTag | null,
  ) => {
    const ink = status ? undefined : SIGN_INK[signIdx];
    if (!interactive) {
      return <ZodiacGlyph sign={signIdx} x={x} y={y} size={size} color={ink} />;
    }
    const mark = status ? MOTION_MARK[status] : null;
    const markWord = status ? motionWord(t, status) : null;
    return (
      <g
        className="sign-mark"
        onMouseEnter={() =>
          setTip({
            x,
            y,
            r: 9,
            title: labels.sign(signIdx),
            sub: signMeaning(t, signIdx),
            marker: <ZodiacGlyph sign={signIdx} size={14} />,
            suffix: mark ? (
              <span
                className="wheel-tip-status"
                style={{ color: mark.color }}
                aria-label={markWord ?? undefined}
              >
                {mark.char}
              </span>
            ) : undefined,
          })
        }
        onMouseLeave={clearTip}
        aria-label={`${labels.sign(signIdx)}${markWord ? ` (${markWord})` : ''}`}
      >
        <circle cx={x} cy={y} r={9} className="planet-hit" />
        <ZodiacGlyph sign={signIdx} x={x} y={y} size={size} color={ink} />
      </g>
    );
  };

  // The whole drawing is kept out of a browser's page translator (2026-10-09): every text
  // node in it is a glyph, an angle code or a degree, and the degrees change as the chart
  // moves — a translator's <font> swap would freeze them. The attribute and the class
  // both, because some translators honour only the class. The words a reader needs (sign
  // and body names, the hints) live in WheelTip, outside the <svg>, and stay translatable.
  const svg = (
    <svg
      className={`wheel-svg notranslate${interactive ? ' interactive' : ''}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      {...SVG_NO_TRANSLATE}
    >
      {/* The wheel's face: the whole disc out to the rim, drawn first so everything sits
          on it. Unpainted unless a Custom theme gives the wheel a solid background
          (`fill: var(--wheel-face, none)` in WheelSvg.css) — no stylesheet declares that
          variable, so on a built-in theme the panel shows through exactly as before.
          (2026-10-06) */}
      <circle cx={cx} cy={cy} r={rOuter} className="wheel-face" />

      {/* Zodiac band fill — a thick-stroked circle that paints the band
          between rOuter and rZodiacInner with a faint accent tint. */}
      {detailed && (
        <circle
          cx={cx}
          cy={cy}
          r={(rOuter + rZodiacInner) / 2}
          fill="none"
          stroke="rgba(var(--accent-rgb), 0.05)"
          strokeWidth={rOuter - rZodiacInner}
        />
      )}

      {/* Concentric ring boundaries. In detailed mode the inner two circles
          bound the dedicated house ring band. */}
      <circle cx={cx} cy={cy} r={rOuter} className="ring" />
      {detailed && <circle cx={cx} cy={cy} r={rZodiacInner} className="ring" />}
      {detailed && houseBand > 0 && (
        <circle cx={cx} cy={cy} r={houseRingOuter} className="ring" />
      )}
      {hasOverlay && rOverlayDivider > 0 && (
        <circle cx={cx} cy={cy} r={rOverlayDivider} className="ring overlay-divider" />
      )}
      <circle cx={cx} cy={cy} r={rInner} className="ring" />

      {/* Faint house spokes spanning the inner rings out to the zodiac band, so
          the 12 house sectors read across the whole wheel (drawn early → behind
          the planets, aspects, and bolder cusp marks). */}
      {detailed &&
        !planetsOnly &&
        angles.cusps.map((lon, idx) => {
          if (!Number.isFinite(lon)) return null;
          const inner = svgPos(lon, frameAnchor, rInner, cx, cy);
          const outer = svgPos(lon, frameAnchor, rZodiacInner, cx, cy);
          return (
            <line
              key={`spoke-${idx}`}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              className="house-spoke"
            />
          );
        })}

      {detailed &&
        Array.from({ length: 12 }).map((_, i) => {
          const lon = (i * 30 * Math.PI) / 180;
          const inner = svgPos(lon, frameAnchor, rZodiacInner, cx, cy);
          const outer = svgPos(lon, frameAnchor, rOuter, cx, cy);
          return (
            <line
              key={`div-${i}`}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              className="sign-divider"
            />
          );
        })}

      {/* Per-sign hover zones over the zodiac band (interactive wheel only): a
          generous 30° target that names the sign on hover and faintly tints its
          slice. Drawn BEFORE the glyphs so the tint sits behind them; the glyphs
          are pointer-transparent (.sign-rim), so the whole slice stays hot. */}
      {detailed &&
        interactive &&
        Array.from({ length: 12 }).map((_, i) => (
          <path
            key={`sign-hit-${i}`}
            className="sign-hit"
            d={signSectorPath(i, rZodiacInner, rOuter, frameAnchor, cx, cy)}
            onMouseEnter={() => {
              const pos = svgPos(
                ((i * 30 + 15) * Math.PI) / 180,
                frameAnchor,
                rBandMid,
                cx,
                cy,
              );
              setTip({
                x: pos.x,
                y: pos.y,
                r: 14,
                title: labels.sign(i),
                sub: signMeaning(t, i),
                marker: <ZodiacGlyph sign={i} size={14} />,
              });
            }}
            onMouseLeave={clearTip}
            aria-label={labels.sign(i)}
          />
        ))}

      {/* The zodiac read straight off the band — but ONLY when the cusp units below
          are not drawn, because those carry their own sign glyph and two glyphs per
          sign is a band that reads as noise. This is what a non-Advanced wheel shows,
          and the reports export and the map minimap with it. */}
      {detailed &&
        !showCuspRim &&
        Array.from({ length: 12 }).map((_, i) => {
          const lon = ((i * 30 + 15) * Math.PI) / 180;
          const pos = svgPos(lon, frameAnchor, rBandMid, cx, cy);
          return (
            <ZodiacGlyph
              key={`sign-${i}`}
              sign={i}
              x={pos.x}
              y={pos.y}
              size={signGlyphPx}
              className="sign-rim"
              color={SIGN_INK[i]}
            />
          );
        })}

      {/* Degree scale (Advanced only): 1° graduation ticks on the inner edge
          of the zodiac band, longer at 5° and 10°. Resets each sign (0–30°),
          so any planet or angle can be read to the degree without callouts. */}
      {detailed &&
        advanced &&
        Array.from({ length: 360 }).map((_, d) => {
          const lon = (d * Math.PI) / 180;
          const len = d % 10 === 0 ? 8 : d % 5 === 0 ? 5 : 2.5;
          const o = svgPos(lon, frameAnchor, rZodiacInner, cx, cy);
          const i = svgPos(lon, frameAnchor, rZodiacInner - len, cx, cy);
          const cls =
            d % 10 === 0
              ? 'deg-tick deg-tick-10'
              : d % 5 === 0
                ? 'deg-tick deg-tick-5'
                : 'deg-tick';
          return (
            <line key={`deg-${d}`} x1={o.x} y1={o.y} x2={i.x} y2={i.y} className={cls} />
          );
        })}

      {/* Advanced: house-cusp degree·minute labels, the way printed natal charts
          annotate each cusp (e.g. "23°45'"). INSIDE the zodiac band, sharing its
          radius with the sign glyphs — the sign is read from the glyph beside them,
          so no sign glyph here.

          These used to ring the outside of the wheel and reserved a 20–22px band
          out there to do it: a fifth of the radius on a phone, spent on labels that
          read as page furniture rather than as part of the chart. Nothing sits
          outside the rim now but the breathing margin. */}
      {showCuspRim &&
        angles.cusps.map((lon, idx) => {
          if (!Number.isFinite(lon)) return null;
          const at = cuspLonFor(idx, lon);
          const { deg, min, signIdx } = cuspText(lon);
          // Degree · sign · minutes, centred on the cusp and stepped along the band.
          const signPos = svgPos(at, frameAnchor, rBandMid, cx, cy);
          const { ux, uy } = cuspOffset(signPos.x, signPos.y);
          const degPos = {
            x: signPos.x - ux * cuspUnitStepPx,
            y: signPos.y - uy * cuspUnitStepPx,
          };
          const minPos = {
            x: signPos.x + ux * cuspUnitStepPx,
            y: signPos.y + uy * cuspUnitStepPx,
          };
          // Masked (maskAngleText): the sign glyph stays — it says no more than the
          // cusp line drawn through the band does — and the figures go. (2026-10-02)
          return (
            <g key={`cuspdeg-${idx}`}>
              {!maskAngleText && (
                <text
                  x={degPos.x}
                  y={degPos.y + 3}
                  textAnchor="middle"
                  className="cusp-rim-deg"
                  fontSize={cuspRimPx}
                >
                  {deg}°
                </text>
              )}
              <ZodiacGlyph
                sign={signIdx}
                x={signPos.x}
                y={signPos.y}
                size={cuspSignPx}
                className="cusp-rim-sign"
                color={SIGN_INK[signIdx]}
              />
              {!maskAngleText && (
                <text
                  x={minPos.x}
                  y={minPos.y + 3}
                  textAnchor="middle"
                  className="cusp-rim-deg"
                  fontSize={cuspRimPx}
                >
                  {String(min).padStart(2, '0')}&#39;
                </text>
              )}
            </g>
          );
        })}

      {/* Per-house hover zones over the dedicated house ring band (interactive
          wheel only): a hit target spanning each cusp→next-cusp sector that
          names the house and faintly tints it, echoing the rim signs. Drawn
          BEFORE the cusp lines + numbers so the tint sits behind them. */}
      {detailed &&
        interactive &&
        houseBand > 0 &&
        angles.cusps.map((lon, idx) => {
          const next = angles.cusps[(idx + 1) % 12];
          if (!Number.isFinite(lon) || !Number.isFinite(next)) return null;
          const span = (((next - lon) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          const mid = lon + span / 2;
          const pos = svgPos(mid, frameAnchor, (houseRingInner + houseRingOuter) / 2, cx, cy);
          return (
            <path
              key={`house-hit-${idx}`}
              className="house-hit"
              d={annularSectorPath(lon, next, houseRingInner, houseRingOuter, frameAnchor, cx, cy)}
              onMouseEnter={() =>
                setTip({
                  x: pos.x,
                  y: pos.y,
                  r: houseBand / 2 + 4,
                  title: t('wheel.house', { number: idx + 1 }),
                  sub: houseMeaning(t, idx),
                })
              }
              onMouseLeave={clearTip}
              aria-label={t('wheel.house', { number: idx + 1 })}
            />
          );
        })}

      {/* House cusps. The four angles (ASC/MC/DSC/IC) are drawn as bold
          diameters below, so any cusp coincident with one is skipped here.
          In Placidus that's cusps 1/4/7/10; in Equal/Whole the 4th/10th (and
          others) float free of the meridian and so ARE drawn. */}
      {detailed && houseBand > 0 &&
        angles.cusps.map((lon, idx) => {
          if (!Number.isFinite(lon)) return null;
          const angleDiff = (a: number) => {
            let d = Math.abs(((lon - a) % (2 * Math.PI)));
            if (d > Math.PI) d = 2 * Math.PI - d;
            return d;
          };
          const onAxis = [angles.asc, angles.mc, angles.dsc, angles.ic].some(
            (a) => angleDiff(a) < 0.0087, // ~0.5°
          );
          if (onAxis) return null;
          const inner = svgPos(lon, frameAnchor, houseRingInner, cx, cy);
          const outer = svgPos(lon, frameAnchor, houseRingOuter, cx, cy);
          return (
            <line
              key={`cusp-${idx}`}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              className="house-cusp"
            />
          );
        })}

      {detailed && houseBand > 0 &&
        angles.cusps.map((lon, idx) => {
          const next = angles.cusps[(idx + 1) % 12];
          if (!Number.isFinite(lon) || !Number.isFinite(next)) return null;
          // Bisector of the house (cusp idx → next cusp), centered in the
          // dedicated house ring band.
          const span = (((next - lon) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          const mid = lon + span / 2;
          const pos = svgPos(mid, frameAnchor, (houseRingInner + houseRingOuter) / 2, cx, cy);
          return (
            <text
              key={`house-${idx}`}
              x={pos.x}
              y={pos.y + 3}
              textAnchor="middle"
              className="house-number"
              fontSize={houseNumPx}
            >
              {idx + 1}
            </text>
          );
        })}

      {/* The two angle axes — meaningless without a real birth minute, so the
          planets-only wheel draws neither. */}
      {!planetsOnly && (
        <line
          x1={ascOuter.x}
          y1={ascOuter.y}
          x2={dscOuter.x}
          y2={dscOuter.y}
          className="angle asc-dsc"
        />
      )}
      {!planetsOnly &&
        (detailed ? (
          <line
            x1={mcOuter.x}
            y1={mcOuter.y}
            x2={icOuter.x}
            y2={icOuter.y}
            className="angle mc-ic"
          />
        ) : (
          <line
            x1={cx}
            y1={cy - rOuter}
            x2={cx}
            y2={cy + rOuter}
            className="angle mc-ic"
          />
        ))}

      {/* The expanded wheel intentionally omits the ASC/MC/DSC/IC degree
          callouts — those positions are listed in the sidebar. Advanced mode
          instead shows a degree scale on the rim (drawn with the zodiac band
          above) so any planet/angle position is readable in place. */}

      {detailed &&
        filteredAspects.map((a, i) => {
          const opacity = 0.35 + (1 - a.orb / maxOrb) * 0.45;
          // A conjunction's two endpoints nearly coincide, so a chord collapses to
          // an invisible dot — mark it with a small disc at its longitude instead.
          if (a.category === 'conjunction') {
            let mid = (a.lonA + a.lonB) / 2;
            if (Math.abs(a.lonA - a.lonB) > Math.PI) mid += Math.PI;
            const pos = svgPos(mid, frameAnchor, rAspectRing, cx, cy);
            return (
              <circle key={`asp-${i}`} cx={pos.x} cy={pos.y} r={3} style={{ fill: a.color }} opacity={opacity} />
            );
          }
          const posA = svgPos(a.lonA, frameAnchor, rAspectRing, cx, cy);
          const posB = svgPos(a.lonB, frameAnchor, rAspectRing, cx, cy);
          return (
            <line
              key={`asp-${i}`}
              x1={posA.x}
              y1={posA.y}
              x2={posB.x}
              y2={posB.y}
              style={{ stroke: a.color }}
              strokeWidth={1}
              opacity={opacity}
            />
          );
        })}

      {/* A body known only to a span (ranges: a timeless chart's Moon, and its Part of
          Fortune on a geodetic map) has its span drawn as an arc of the tick strip in its
          own colour, centred on the tick at its placeholder degree — what the readout
          ring's trio would otherwise say to the minute. First in the strip, so the catalog
          diamonds and every tick draw over it, and deaf to the pointer, so it never takes a
          hover from them. Detailed wheels only, like the ticks. (2026-10-02) */}
      {detailed &&
        ranges &&
        planets.map((p) => {
          const half = ranges.get(p.name);
          if (half === undefined) return null;
          const h = (half * Math.PI) / 180;
          return (
            <path
              key={`range-${p.name}`}
              className="wheel-range-arc"
              d={annularSectorPath(p.lon - h, p.lon + h, rPip - pipR, rZodiacInner, frameAnchor, cx, cy)}
              style={{ fill: planetInk(p.name) }}
              opacity={0.22}
              pointerEvents="none"
            />
          );
        })}

      {/* Catalog minor bodies' hover zones below the ring size (interactive wheel
          only): one per cluster of rim diamonds — a strip of the tick band reaching
          MINOR_PIP_HIT_PX past its outermost diamonds and stopping at the zodiac band,
          whose sign zones stay whole. Drawn BEFORE the diamonds so the hover tint sits
          behind them; the diamonds are pointer-transparent (.minor-pip), so the whole
          zone stays hot. A lone body's zone gives that body's own tip. */}
      {minorClusters.map((members) => {
        const first = normLon(members[0].m.lon);
        const span = normLon(members[members.length - 1].m.lon - first);
        const pad = MINOR_PIP_HIT_PX / rPip;
        const anchor = svgPos(first + span / 2, frameAnchor, rPip, cx, cy);
        const lone = members.length === 1 ? members[0] : null;
        return (
          <path
            key={`minor-hit-${members[0].overlay ? 'ov-' : ''}${members[0].m.id}`}
            className="minor-pip-hit"
            d={annularSectorPath(
              first - pad,
              first + span + pad,
              // Down past the diamond's inner tip, which reaches further in as it grows.
              rPip - Math.max(MINOR_PIP_HIT_PX, pipR + 2),
              rZodiacInner,
              frameAnchor,
              cx,
              cy,
            )}
            onMouseEnter={() =>
              setTip(
                lone
                  ? (lone.overlay ? overlayMinorTip : minorTip)(lone.m, anchor.x, anchor.y, pipR + 2)
                  : minorClusterTip(members, anchor.x, anchor.y),
              )
            }
            onMouseLeave={clearTip}
            aria-label={members
              .map(({ m, overlay }) =>
                overlay && overlayName ? t('wheel.tip.overlayMinor', { name: m.label, chart: overlayName }) : m.label,
              )
              .join(', ')}
          />
        );
      })}

      {/* Catalog minor bodies' rim diamonds: each at its TRUE degree in the tick strip,
          its long axis along the radius — it is the body's tick, and points at its
          degree the way a planet's tick does. On every wheel, the minimap included: it
          costs no radius and needs no layout pass. With the catalog ring drawn (a single
          wheel from 600px; never a bi-wheel, where a leader would cross the overlay
          ring), each diamond adds the faint leader in to its coin, on the planets' own
          rule. Drawn before the planet ticks, so a planet's tick at the same
          degree stays on top. A hypothetical point's diamond is HOLLOW: still a fill,
          the solid outline with the hole cut out (lib/minorBodies/mark), so it keeps
          the solid mark's footprint in the strip and takes Earth's halo the same way. */}
      {minorList.map((m) => {
        const at = svgPos(m.lon, frameAnchor, rPip, cx, cy);
        const out = svgPos(m.lon, frameAnchor, 1, 0, 0);
        const coin = minorRingOn ? svgPos(minorLonFor(m), frameAnchor, rMinor, cx, cy) : null;
        const leadFrom = svgPos(m.lon, frameAnchor, rPip - pipR, cx, cy);
        return (
          <g key={`minor-pip-${m.id}`} className="minor-pip">
            {coin && !hasOverlay && (
              <line
                x1={leadFrom.x}
                y1={leadFrom.y}
                x2={coin.x}
                y2={coin.y}
                stroke={m.color}
                strokeWidth={0.6}
                opacity={0.4}
              />
            )}
            <path
              d={(m.hypothetical ? minorHollowPath : minorDiamondPath)(at.x, at.y, pipR, out.x, out.y)}
              fill={m.color}
            />
          </g>
        );
      })}

      {/* An overlay's catalog bodies on a bi-wheel: the same mark at its true degree in the
          same strip (lib/wheelGeometry rOverlayPip: the divider between the charts has no
          room for one), told from the chart's by being smaller — clear of the overlay discs
          — and softened to the overlay readout's 0.8, and by a tip that names the overlay.
          Filled or hollow as the chart's are, so a hypothetical point still reads as one.
          After the chart's own, so where two coincide the overlay's lesser mark shows on
          top of the larger rather than vanishing under it. An attribute, not a class, so
          the export (lib/wheelRaster) carries the softening. */}
      {overlayMinorList.length > 0 && rOverlayPip > 0 && (
        <g className="wheel-overlay-pips" opacity={0.8}>
          {overlayMinorList.map((m) => {
            const at = svgPos(m.lon, frameAnchor, rOverlayPip, cx, cy);
            const out = svgPos(m.lon, frameAnchor, 1, 0, 0);
            return (
              <g key={`minor-pip-ov-${m.id}`} className="minor-pip">
                <path
                  d={(m.hypothetical ? minorHollowPath : minorDiamondPath)(at.x, at.y, overlayPipR, out.x, out.y)}
                  fill={m.color}
                />
              </g>
            );
          })}
        </g>
      )}

      {/* Connector from the true zodiac position to the (possibly spread)
          glyph, plus a tick on the zodiac band marking the exact longitude.
          The connector is SINGLE-WHEEL ONLY. On a bi-wheel `rPlanets` is pushed
          deep inside the overlay ring, so the same short leader becomes a line
          spanning almost the whole radius — one per body, all crossing the outer
          ring on their way in. That is what reads as "lines from the inner wheel
          to the outer ring", and it is the same complaint that took the cross-ring
          aspect web out (b10eb88): two sets of long strokes over one centre are
          unreadable at any wheel size. The TICK stays either way — it is what
          actually marks the exact longitude; the leader only said which glyph the
          tick belonged to, and on a bi-wheel each glyph prints its own degree and
          sign beside it. Astrologer-asked, 2026-08-21. */}
      {detailed &&
        planets.map((p) => {
          const truePos = svgPos(p.lon, frameAnchor, rZodiacInner, cx, cy);
          const glyphPos = svgPos(lonFor(p), frameAnchor, rPlanets, cx, cy);
          const tickPos = svgPos(p.lon, frameAnchor, rZodiacInner - 2, cx, cy);
          const tipPos = svgPos(p.lon, frameAnchor, rZodiacInner - 8, cx, cy);
          return (
            <g key={`mark-${p.name}`}>
              {!hasOverlay && (
                <line
                  x1={truePos.x}
                  y1={truePos.y}
                  x2={glyphPos.x}
                  y2={glyphPos.y}
                  style={{ stroke: planetInk(p.name) }}
                  strokeWidth={0.6}
                  opacity={0.4}
                />
              )}
              <line
                x1={tickPos.x}
                y1={tickPos.y}
                x2={tipPos.x}
                y2={tipPos.y}
                style={{ stroke: planetInk(p.name) }}
                strokeWidth={1.5}
              />
            </g>
          );
        })}

      {/* The four angles get the planets' connector + zodiac-band tick: a faint
          line back to the true longitude (the spread may have nudged the disc)
          and a bold tick marking the exact position. The group's `color` carries
          the axis colour so currentColor resolves the CSS var on the strokes.
          The connector follows the planets' rule above — it spans the same
          radius, so on a bi-wheel it is the same long stroke across the outer
          ring, and the axis line itself already says where the angle is. */}
      {showAngleMarks &&
        angleMarks.map((a) => {
          const truePos = svgPos(a.lon, frameAnchor, rZodiacInner, cx, cy);
          const glyphPos = svgPos(angleLonFor(a), frameAnchor, rPlanets, cx, cy);
          const tickPos = svgPos(a.lon, frameAnchor, rZodiacInner - 2, cx, cy);
          const tipPos = svgPos(a.lon, frameAnchor, rZodiacInner - 8, cx, cy);
          return (
            <g key={`angle-mark-${a.key}`} style={{ color: a.color }}>
              {!hasOverlay && (
                <line
                  x1={truePos.x}
                  y1={truePos.y}
                  x2={glyphPos.x}
                  y2={glyphPos.y}
                  stroke="currentColor"
                  strokeWidth={0.6}
                  opacity={0.4}
                />
              )}
              <line
                x1={tickPos.x}
                y1={tickPos.y}
                x2={tipPos.x}
                y2={tipPos.y}
                stroke="currentColor"
                strokeWidth={1.5}
              />
            </g>
          );
        })}

      {/* The catalog ring — a single wheel at or above MINOR_RING_MIN (600px; never a
          bi-wheel — lib/wheelGeometry says why). Each body's
          coin — half a planet disc, a SOLID outline in its line colour (dashed is
          the overlay's convention), its own symbol or the shared diamond inside. After
          every tick and leader, so a coin sits over them; before the planet discs,
          whose wider hit disc wins where it reaches a coin's inner edge. No readout
          trio: the tip and the positions table carry the degree, and a trio's spacing
          floor is what would fill this ring. */}
      {minorRingOn &&
        minorList.map((m) => {
          const pos = svgPos(minorLonFor(m), frameAnchor, rMinor, cx, cy);
          const markProps = interactive
            ? {
                className: 'planet-mark',
                onMouseEnter: () => setTip(minorTip(m, pos.x, pos.y, minorR)),
                onMouseLeave: clearTip,
                'aria-label': m.label,
              }
            : {};
          return (
            <g key={`minor-coin-${m.id}`} {...markProps}>
              {interactive && (
                <circle cx={pos.x} cy={pos.y} r={minorR + 3} className="planet-hit" />
              )}
              <g className="planet-mark-visual">
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={minorR}
                  className="planet-disc-fill"
                  stroke={m.color}
                  strokeWidth={g.minorDiscStroke}
                />
                <MinorMarkSvg
                  color={m.color}
                  glyph={m.glyph}
                  hollow={m.hypothetical}
                  x={pos.x}
                  y={pos.y}
                  r={minorR}
                  glyphPx={minorGlyphPx}
                />
              </g>
            </g>
          );
        })}

      {planets.map((p) => {
        const pos = svgPos(lonFor(p), frameAnchor, rPlanets, cx, cy);
        // The non-detailed minimap draws larger planet discs/glyphs (they're the
        // only thing on that simplified wheel, so there's room).
        const r = discR;
        // Interactive wheel: the whole group is a hover target (a transparent hit
        // disc widens it past the glyph) that scales the disc + names the planet.
        const markProps = interactive
          ? {
              className: 'planet-mark',
              onMouseEnter: () =>
                setTip({
                  x: pos.x,
                  y: pos.y,
                  r,
                  title: labels.planet(p.name),
                  ...bodyTip(t, labels, p, {
                    hideLon: maskLot(p.name),
                    note: bodyNotes?.get(p.name),
                    range: ranges?.get(p.name),
                  }),
                  color: planetInk(p.name),
                  marker: (
                    <PlanetGlyph
                      planet={p.name}
                      size={14}
                      color={planetInk(p.name)}
                    />
                  ),
                }),
              onMouseLeave: clearTip,
              'aria-label': labels.planet(p.name),
            }
          : {};
        // The planet glyph/disc always keep the planet's own color — only its
        // readout (sign · degree · minute) flags Rx/station.
        return (
          <g key={p.name} {...markProps}>
            {interactive && (
              <circle cx={pos.x} cy={pos.y} r={r + 6} className="planet-hit" />
            )}
            <g className="planet-mark-visual">
              <circle
                cx={pos.x}
                cy={pos.y}
                r={r}
                className="planet-disc-fill"
                style={{ stroke: planetInk(p.name) }}
                strokeWidth={1.3}
              />
              <PlanetGlyph
                planet={p.name}
                x={pos.x}
                y={pos.y}
                size={glyphPx}
                color={planetInk(p.name)}
              />
            </g>
          </g>
        );
      })}

      {/* Angle marks: the two-letter code (AS/MC/DS/IC) as bare text on the
          glyph ring — no disc, so they're not mistaken for the circled planets.
          A panel-coloured halo (wheel-angle-label) keeps the code legible over
          the spokes/lines, and the planet hover (lift + named tag) is reused via
          a transparent hit target. */}
      {showAngleMarks &&
        angleMarks.map((a) => {
          const pos = svgPos(angleLonFor(a), frameAnchor, rPlanets, cx, cy);
          // The hover lift + named tag are the interactive wheel's; a static
          // wheel keeps the mark and drops the handlers with the hit target.
          const markProps = interactive
            ? {
                onMouseEnter: () =>
                  setTip({
                    x: pos.x,
                    y: pos.y,
                    r: 11,
                    title: a.title,
                    // The angle says WHERE it falls, exactly as the bodies do.
                    // What it MEANS is the same sentence in every chart, and has
                    // moved to its row in the readout below the wheel — see
                    // AngleTipGlyph in ExpandedChartSidebar.
                    ...bodyTip(t, labels, { lon: a.lon }, {
                      trunc: !!angles.geodetic,
                      hideLon: maskAngleText,
                    }),
                    titleColor: a.color,
                  }),
                onMouseLeave: clearTip,
                'aria-label': a.title,
              }
            : {};
          return (
            <g key={`angle-disc-${a.key}`} className="planet-mark" {...markProps}>
              {interactive && <circle cx={pos.x} cy={pos.y} r={14} className="planet-hit" />}
              <g className="planet-mark-visual">
                <text
                  x={pos.x}
                  y={pos.y + 4}
                  textAnchor="middle"
                  className="wheel-angle-label"
                  fontSize={angleCodePx}
                  style={{ fill: a.color } as CSSProperties}
                >
                  {ANGLE_LABEL[a.key]}
                </text>
              </g>
            </g>
          );
        })}

      {/* Bi-wheel: the overlay chart's planets in an outer ring, dashed and
          dimmed, with a tick on the zodiac band marking each true longitude. */}
      {hasOverlay && (
        <g className="wheel-overlay-ring" opacity={0.92}>
          {overlayPlanets!.map((p) => {
            const truePos = svgPos(p.lon, frameAnchor, rZodiacInner, cx, cy);
            const glyphPos = svgPos(overlayLonFor(p), frameAnchor, rOverlay, cx, cy);
            const tickPos = svgPos(p.lon, frameAnchor, rZodiacInner - 2, cx, cy);
            const tipPos = svgPos(p.lon, frameAnchor, rZodiacInner - 7, cx, cy);
            return (
              <g key={`ov-${p.name}`}>
                <line
                  x1={truePos.x}
                  y1={truePos.y}
                  x2={glyphPos.x}
                  y2={glyphPos.y}
                  style={{ stroke: planetInk(p.name) }}
                  strokeWidth={0.6}
                  strokeDasharray="2 2"
                  opacity={0.45}
                />
                <line
                  x1={tickPos.x}
                  y1={tickPos.y}
                  x2={tipPos.x}
                  y2={tipPos.y}
                  style={{ stroke: planetInk(p.name) }}
                  strokeWidth={1.2}
                />
                {interactive ? (
                  <g
                    className="planet-mark"
                    onMouseEnter={() =>
                      setTip({
                        x: glyphPos.x,
                        y: glyphPos.y,
                        r: 9,
                        title: labels.planet(p.name),
                        ...bodyTip(t, labels, p),
                        color: planetInk(p.name),
                        marker: (
                          <PlanetGlyph
                            planet={p.name}
                            size={14}
                            color={planetInk(p.name)}
                          />
                        ),
                      })
                    }
                    onMouseLeave={clearTip}
                    aria-label={labels.planet(p.name)}
                  >
                    <circle cx={glyphPos.x} cy={glyphPos.y} r={15} className="planet-hit" />
                    <g className="planet-mark-visual">
                      <circle
                        cx={glyphPos.x}
                        cy={glyphPos.y}
                        r={9}
                        className="planet-disc-fill"
                        style={{ stroke: planetInk(p.name) }}
                        strokeWidth={1.1}
                        strokeDasharray="2 1.5"
                      />
                      <PlanetGlyph
                        planet={p.name}
                        x={glyphPos.x}
                        y={glyphPos.y}
                        size={13}
                        color={planetInk(p.name)}
                      />
                    </g>
                  </g>
                ) : (
                  <>
                    <circle
                      cx={glyphPos.x}
                      cy={glyphPos.y}
                      r={9}
                      className="planet-disc-fill"
                      style={{ stroke: planetInk(p.name) }}
                      strokeWidth={1.1}
                      strokeDasharray="2 1.5"
                    />
                    <PlanetGlyph
                      planet={p.name}
                      x={glyphPos.x}
                      y={glyphPos.y}
                      size={13}
                      color={planetInk(p.name)}
                    />
                  </>
                )}
              </g>
            );
          })}
        </g>
      )}

      {/* The overlay chart's angles (As/Ds/Mc/Ic) in the outer ring — dashed
          connector + zodiac-band tick, same colours and toggles as the natal angle
          marks, so the bi-wheel shows the overlay's angles too. */}
      {hasOverlay &&
        overlayAngleMarks.map((a) => {
          const truePos = svgPos(a.lon, frameAnchor, rZodiacInner, cx, cy);
          // The code holds its own axis; the settled position only differs from it
          // when two overlay codes were close enough to have to clear each other,
          // and the dashed connector below points back to the true degree either way.
          const glyphPos = svgPos(overlayAngleLonFor(a), frameAnchor, rOverlay, cx, cy);
          const tickPos = svgPos(a.lon, frameAnchor, rZodiacInner - 2, cx, cy);
          const tipPos = svgPos(a.lon, frameAnchor, rZodiacInner - 7, cx, cy);
          const markProps = interactive
            ? {
                onMouseEnter: () =>
                  setTip({
                    x: glyphPos.x,
                    y: glyphPos.y,
                    r: 11,
                    title: a.title,
                    // As the natal angle marks above: position here, meaning in
                    // the readout below the wheel.
                    ...bodyTip(t, labels, { lon: a.lon }, {
                      trunc: !!overlayAngles?.geodetic,
                      hideLon: maskAngleText,
                    }),
                    titleColor: a.color,
                  }),
                onMouseLeave: clearTip,
                'aria-label': a.title,
              }
            : {};
          return (
            <g
              key={`ov-angle-${a.key}`}
              className="planet-mark"
              style={{ color: a.color }}
              {...markProps}
            >
              <line
                x1={truePos.x}
                y1={truePos.y}
                x2={glyphPos.x}
                y2={glyphPos.y}
                stroke="currentColor"
                strokeWidth={0.6}
                strokeDasharray="2 2"
                opacity={0.45}
              />
              <line
                x1={tickPos.x}
                y1={tickPos.y}
                x2={tipPos.x}
                y2={tipPos.y}
                stroke="currentColor"
                strokeWidth={1.2}
              />
              {interactive && (
                <circle cx={glyphPos.x} cy={glyphPos.y} r={14} className="planet-hit" />
              )}
              <g className="planet-mark-visual">
                <text
                  x={glyphPos.x}
                  y={glyphPos.y + 4}
                  textAnchor="middle"
                  className="wheel-angle-label"
                  fontSize={angleCodePx}
                  style={{ fill: a.color } as CSSProperties}
                >
                  {ANGLE_LABEL[a.key]}
                </text>
              </g>
            </g>
          );
        })}

      {/* The overlay angles' degree·sign·minute readout — the natal angle readout's twin
          in the OUTER ring, so the bi-wheel's overlay angles read exactly like the natal
          ones (this is what was missing for transits/progressed; solar-arc now has angles
          to show too). Same fanned trio + formatter, positioned on the overlay readout
          radii. Not drawn at all under maskAngleText. */}
      {showOverlayReadouts &&
        showAngleMarks &&
        !maskAngleText &&
        overlayAngleMarks.map((a) => {
          const degPos = svgPos(overlayAngleLonFor(a), frameAnchor, rOverlayReadout + OV_FAN, cx, cy);
          const signPos = svgPos(overlayAngleLonFor(a), frameAnchor, rOverlayReadout, cx, cy);
          const minPos = svgPos(overlayAngleLonFor(a), frameAnchor, rOverlayReadout - OV_FAN, cx, cy);
          // The one truncation rule (format.ts truncZodiac), in both line systems: the
          // floor this always took, plus the float snap that keeps an exact minute — a
          // geodetic MC is one — from printing as the minute below. (2026-10-02)
          const { signIdx, deg, min } = truncZodiac(a.lon, 'min');
          return (
            <g key={`ov-angle-rdo-${a.key}`} className="planet-readout overlay-readout">
              <text
                x={degPos.x}
                y={degPos.y + 3}
                textAnchor="middle"
                className="readout-deg"
                fontSize={readoutFont}
              >
                {deg}°
              </text>
              {readoutSign(signIdx, signPos.x, signPos.y, readoutFont + 2)}
              <text
                x={minPos.x}
                y={minPos.y + 3}
                textAnchor="middle"
                className="readout-min"
                fontSize={readoutFont}
              >
                {String(min).padStart(2, '0')}&#39;
              </text>
            </g>
          );
        })}

      {/* Bi-ring detail: the overlay planets' degree·sign·minute readout, laid out
          fanned along the spoke just inside the overlay glyphs (degree nearest the
          glyph, then sign, then minutes) — the natal readout's twin, so overlay
          positions read exactly. Retrograde → red, stationary → yellow. */}
      {showOverlayReadouts &&
        overlayPlanets!.map((p) => {
          const degPos = svgPos(overlayLonFor(p), frameAnchor, rOverlayReadout + OV_FAN, cx, cy);
          const signPos = svgPos(overlayLonFor(p), frameAnchor, rOverlayReadout, cx, cy);
          const minPos = svgPos(overlayLonFor(p), frameAnchor, rOverlayReadout - OV_FAN, cx, cy);
          const sc = advanced ? statusColor(p) : null;
          const lonDeg = (((p.lon * 180) / Math.PI) % 360 + 360) % 360;
          const signIdx = Math.floor(lonDeg / 30);
          const inSign = lonDeg % 30;
          const deg = Math.floor(inSign);
          const min = Math.floor((inSign - deg) * 60);
          return (
            <g
              key={`ovrdo-${p.name}`}
              className="planet-readout overlay-readout"
              style={sc ? { color: sc } : undefined}
            >
              <text
                x={degPos.x}
                y={degPos.y + 3}
                textAnchor="middle"
                className="readout-deg"
                fontSize={readoutFont}
                fill={sc ?? undefined}
              >
                {deg}°
              </text>
              {readoutSign(signIdx, signPos.x, signPos.y, readoutFont + 2, sc ? motionTag(p) : null)}
              <text
                x={minPos.x}
                y={minPos.y + 3}
                textAnchor="middle"
                className="readout-min"
                fontSize={readoutFont}
                fill={sc ?? undefined}
              >
                {String(min).padStart(2, '0')}&#39;
              </text>
            </g>
          );
        })}

      {/* Degree · sign · minute readout: each value gets its own radial slot
          (degree nearest the glyph, then sign, then minutes), fanning along the
          spoke — the traditional natal-chart arrangement. Retrograde → red,
          stationary → yellow. */}
      {showReadouts &&
        planets.map((p) => {
          // No trio for a masked Lot, as for the masked angles below — nor for a body known
          // only to a span (ranges), whose arc in the tick strip stands in for it: a span
          // squeezed into the degree and minute slots reads as a degree and minutes.
          // (2026-10-02)
          if (maskLot(p.name) || ranges?.has(p.name)) return null;
          const degPos = svgPos(lonFor(p), frameAnchor, g.rReadoutDeg, cx, cy);
          const signPos = svgPos(lonFor(p), frameAnchor, g.rReadoutSign, cx, cy);
          const minPos = svgPos(lonFor(p), frameAnchor, g.rReadoutMin, cx, cy);
          const sc = advanced ? statusColor(p) : null;
          const lonDeg = (((p.lon * 180) / Math.PI) % 360 + 360) % 360;
          const signIdx = Math.floor(lonDeg / 30);
          const inSign = lonDeg % 30;
          const deg = Math.floor(inSign);
          const min = Math.floor((inSign - deg) * 60);
          return (
            <g
              key={`rdo-${p.name}`}
              className="planet-readout"
              style={sc ? { color: sc } : undefined}
            >
              <text
                x={degPos.x}
                y={degPos.y + 3}
                textAnchor="middle"
                className="readout-deg"
                fontSize={readoutFont}
                fill={sc ?? undefined}
              >
                {deg}°
              </text>
              {g.detail.readoutSign &&
                readoutSign(signIdx, signPos.x, signPos.y, readoutFont + 3, sc ? motionTag(p) : null)}
              {g.detail.readoutMin && (
                <text
                  x={minPos.x}
                  y={minPos.y + 3}
                  textAnchor="middle"
                  className="readout-min"
                  fontSize={readoutFont}
                  fill={sc ?? undefined}
                >
                  {String(min).padStart(2, '0')}&#39;
                </text>
              )}
            </g>
          );
        })}

      {/* Angle degree·sign·minute readout, fanned inward along the spoke exactly
          like the planet readout (degree nearest the disc, then sign glyph, then
          minutes) — so each angle reads e.g. 23° ♑ 17' right in the wheel. Not
          drawn at all under maskAngleText. */}
      {showReadouts &&
        showAngleMarks &&
        !maskAngleText &&
        angleMarks.map((a) => {
          const degPos = svgPos(angleLonFor(a), frameAnchor, g.rReadoutDeg, cx, cy);
          const signPos = svgPos(angleLonFor(a), frameAnchor, g.rReadoutSign, cx, cy);
          const minPos = svgPos(angleLonFor(a), frameAnchor, g.rReadoutMin, cx, cy);
          // Truncated as the overlay ring's above (format.ts truncZodiac). (2026-10-02)
          const { signIdx, deg, min } = truncZodiac(a.lon, 'min');
          return (
            <g key={`angle-rdo-${a.key}`} className="planet-readout">
              <text
                x={degPos.x}
                y={degPos.y + 3}
                textAnchor="middle"
                className="readout-deg"
                fontSize={readoutFont}
              >
                {deg}°
              </text>
              {g.detail.readoutSign && readoutSign(signIdx, signPos.x, signPos.y, readoutFont + 3)}
              {g.detail.readoutMin && (
                <text
                  x={minPos.x}
                  y={minPos.y + 3}
                  textAnchor="middle"
                  className="readout-min"
                  fontSize={readoutFont}
                >
                  {String(min).padStart(2, '0')}&#39;
                </text>
              )}
            </g>
          );
        })}
    </svg>
  );

  if (!interactive) return svg;

  // Interactive wheel: wrap the SVG so the hint tag can be an absolutely-
  // positioned HTML element over it (SVG user units map 1:1 to px here).
  return (
    <div className="wheel-svg-wrap">
      {svg}
      {tip && <WheelTip tip={tip} size={size} />}
    </div>
  );
}
