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
import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  PLANET_COLORS,
  POINTS,
  type EclipticPosition,
  type PlanetName,
  type RelocatedAngles,
} from '../../lib/ephemeris';
import { useT } from '../../i18n';
import type { EnumLabels, MsgKey, TFn } from '../../i18n';
import { fmtDM, lonToZodiac } from '../../lib/astro/format';
import { placeOnRing, type RingMark } from '../../lib/ringLayout';
import {
  DEFAULT_ASPECT_ORBS,
  maxAspectOrb,
  type AspectName,
  type AspectOrbs,
} from '../../lib/aspectPrefs';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import { ZodiacGlyph } from '../ZodiacGlyph/ZodiacGlyph';
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
function bodyTip(
  t: TFn,
  labels: EnumLabels,
  p: { lon: number; lat?: number; retrograde?: boolean; stationary?: boolean },
): { suffix: ReactNode; sub: ReactNode } {
  const { signIdx, degMin } = lonToZodiac(p.lon);
  const tag = motionTag(p);
  return {
    suffix: (
      <>
        <span className="wheel-tip-sep" aria-hidden="true">
          |
        </span>
        <span className="wheel-tip-sign">
          <ZodiacGlyph sign={signIdx} size={13} />
          {labels.sign(signIdx)}
        </span>
      </>
    ),
    sub: (
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
        {t('wheel.tip.longitude', { lon: degMin })}
        {p.lat !== undefined && (
          <>
            <br />
            {t('wheel.tip.latitude', { lat: fmtDM((p.lat * 180) / Math.PI, true) })}
          </>
        )}
      </>
    ),
  };
}

// The chart angles, keyed by the label drawn on the wheel. The title + sub
// hint text is resolved via wheel.angles.<key> at render time. Vx/Avx (the
// Vertex axis) are opt-in via the Advanced ▸ Vertex axis setting.
type AngleKey = 'As' | 'Ds' | 'Mc' | 'Ic' | 'Vx' | 'Avx';
const ANGLE_HINTS: { key: AngleKey }[] = [
  { key: 'As' },
  { key: 'Ds' },
  { key: 'Mc' },
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
  return (
    <div
      className="wheel-tip ui-tip-box ui-tip"
      data-placement={placement}
      style={{ left, top, maxWidth: TIP_MAX }}
    >
      <span
        className="ui-tip-title wheel-tip-title"
        style={tip.titleColor ? { color: tip.titleColor } : undefined}
      >
        {tip.marker}
        {tip.title}
        {tip.suffix}
      </span>
      {tip.sub && <span className="ui-tip-sub">{tip.sub}</span>}
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
  { name: 'conjunction', angle: 0,   color: '#f5b83d', category: 'conjunction' },
  { name: 'opposition',  angle: 180, color: '#e85a4f', category: 'hard' },
  { name: 'trine',       angle: 120, color: '#5ec2e0', category: 'harmonious' },
  { name: 'square',      angle: 90,  color: '#e85a4f', category: 'hard' },
  { name: 'sextile',     angle: 60,  color: '#5ec2e0', category: 'harmonious' },
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
          color: '#f5b83d', orb: par, lonA: a.lon, lonB: b.lon,
        });
      } else if (!isParallel && contra <= orbs.declinationOrb) {
        out.push({
          a: a.name, b: b.name, type: 'contraparallel', category: 'hard',
          color: '#e85a4f', orb: contra, lonA: a.lon, lonB: b.lon,
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
// Per-character advances (in em, at weight 700) for the nine characters the six
// codes are built from. Deliberately a table rather than one average figure: an
// average generous enough for "Mc" reserves half again too much for "Ic", and the
// wasted arc is arc some body is being pushed out of for no reason.
const ANGLE_LABEL_EM: Record<string, number> = {
  A: 0.72, D: 0.72, I: 0.34, M: 0.92, V: 0.68,
  c: 0.56, s: 0.52, v: 0.56, x: 0.56,
};
// .wheel-angle-label in WheelSvg.css: 13px/700 with a 3px paint-order stroke halo
// (1.5px each side, and the halo is part of what must not be overlapped — it is
// the panel colour, so it erases whatever it lands on).
const ANGLE_LABEL_FONT = 13;
const ANGLE_LABEL_HALO = 3;
const angleLabelHalfPx = (code: string): number => {
  let em = 0;
  for (const ch of code) em += ANGLE_LABEL_EM[ch] ?? 0.6;
  return (em * ANGLE_LABEL_FONT + ANGLE_LABEL_HALO) / 2;
};
// A planet's disc: the radius plus half its stroke.
const DISC_HALF_PX = (r: number, stroke: number) => r + stroke / 2;

// (spreadOnRing lived here: bodies-only spreading for the overlay ring. It was
// the reason the overlay's angle codes were overlapped — it had no way to be told
// about them. placeOnRing above replaced it and takes both sets.)

// Retrograde / stationary highlight colors for the readout (sign · degree ·
// minute) text only — the planet glyph keeps its own color. Plain hex (not theme
// vars): red and dark-yellow read clearly on every theme.
const RETRO_COLOR = '#e85a4f';
const STATION_COLOR = '#c79a17';

// Size-driven detail tiers (independent of the Advanced toggle): the per-planet
// degree·sign·minute readout appears once the wheel is big enough to read it, and
// the overlay (bi-wheel) readout needs a larger wheel still.
const READOUT_MIN = 440;
const OVERLAY_READOUT_MIN = 600;

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
   * Which angle labels (As/Ds/Mc/Ic and the Vx/Avx Vertex axis) to draw,
   * mirroring the Map Filter's line-type toggles. Omitted → all (the minimap
   * draws no angle marks, so it never reaches this).
   */
  visibleAngles?: Set<'As' | 'Ds' | 'Mc' | 'Ic' | 'Vx' | 'Avx'>;
  /**
   * Enable novice hover hints: a responsive scale on the planet discs + rim
   * signs, the four angle labels (As/Ds/Mc/Ic), and a floating tag naming each
   * one. Opt-in so the minimap stays static — only the expanded sidebar sets it.
   */
  interactive?: boolean;
  /**
   * Force the per-planet degree·sign·minute readout ring on below the usual
   * READOUT_MIN size gate (still skipped if the wheel is geometrically too tight —
   * rReadout ≤ 30). For the Capture wheel, which is smaller than a sidebar wheel
   * but still wants the readout when there's room.
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
}

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
}: WheelSvgProps) {
  const { t, labels } = useT();
  // Hovered hint (interactive mode only). Hooks run unconditionally; when the
  // wheel isn't interactive no handler ever sets it, so it stays null.
  const [tip, setTip] = useState<HoverTip | null>(null);
  const clearTip = () => setTip(null);

  const cx = size / 2;
  const cy = size / 2;
  // The expanded wheel draws everything inside the outer ring; Advanced mode
  // adds a ring of house-cusp degree labels just OUTSIDE the rim, so it reserves
  // extra margin (28px) for them. Otherwise just a small breathing margin.
  const rOuter = size / 2 - (detailed ? (advanced ? 34 : 14) : 4);
  const rZodiacInner = rOuter - (detailed ? 34 : 0);
  // Bi-wheel: when a second chart is supplied (and the wheel is big enough),
  // its planets occupy an outer ring just inside the zodiac band, and the natal
  // glyph ring is pushed inward to make room. Everything inside cascades from
  // rPlanets, so the readout/house/aspect rings shift in automatically.
  const hasOverlay =
    detailed && !!overlayPlanets && overlayPlanets.length > 0 && size >= 420;
  const rOverlay = hasOverlay ? rZodiacInner - 18 : 0;
  // Bi-ring detail: an overlay readout ring (degree·sign·minute) just inside the
  // overlay glyphs, mirroring the natal readout. Needs extra radial room, so
  // it's the bi-wheel's third (largest) size tier.
  const showOverlayReadouts = hasOverlay && size >= OVERLAY_READOUT_MIN;
  // The readout fan sits 40px inside the overlay glyph ring so the degree value
  // clears the planet discs with comfortable breathing room. OV_FAN is the
  // radial gap between the fan's degree / sign / minute slots — a touch wider
  // than the natal readout's 16 so the overlay trio reads roomier on the rim.
  const rOverlayReadout = showOverlayReadouts ? rOverlay - 40 : 0;
  // As the (single) wheel grows, the inner aspect circle would otherwise absorb
  // ALL the extra radius. Instead share it ~50/50: bandGrow is the extra (0 below
  // the readout tier), spread across the zodiac→planet, planet→readout and
  // readout→house gaps so the planets + their readout get more room — leaving the
  // central aspect-line circle growing at roughly half its former rate. Disabled
  // for the bi-wheel: that layout is already tight, so spreading/scaling there
  // would overlap the overlay ring's glyphs and aspect lines — keep it compact.
  const bandGrow =
    detailed && !hasOverlay && size >= READOUT_MIN ? (size - READOUT_MIN) * 0.25 : 0;
  // The readout text, sign glyph, and degree/minute fan scale up with that extra
  // room so they actually fill it instead of staying small on the inner ring.
  const readoutScale = 1 + bandGrow / 130;
  const readoutFan = Math.round(16 * readoutScale);
  const readoutFont = Math.min(17, Math.round(11 * readoutScale));
  const OV_FAN = Math.round(18 * readoutScale);
  // Planet glyph ring, then a readout ring (degree · sign · minute) just
  // inside it — mirroring a printed natal chart.
  // The natal glyph ring drops further in when an overlay is present — the gap
  // from the overlay zone to the natal ring is widened ~15% (28→32, 36→41) so
  // the separator ring has clear breathing room on both sides and the overlay
  // discs no longer crowd it.
  const rPlanets = detailed
    ? hasOverlay
      ? showOverlayReadouts
        ? rOverlayReadout - 41
        : rOverlay - 32
      : rZodiacInner - 20 - bandGrow / 3
    : rOuter - 26;
  // Bi-wheel separator: a hairline ring drawn in the gap between the overlay
  // (outer) planet zone and the natal (inner) glyph ring, so the two charts read
  // as distinct bands. Centered on the midpoint of that gap — between the overlay
  // content's inner edge (its readout minutes slot, or its glyph disc) and the
  // natal glyph disc's outer edge — so it clears both rings symmetrically.
  const rOverlayDivider = hasOverlay
    ? ((showOverlayReadouts ? rOverlayReadout - OV_FAN : rOverlay - 9) + (rPlanets + 11)) / 2
    : 0;
  // Gap from the planet glyphs to the readout trio (the 34px base widened by
  // ~15% to give the degree value more breathing room from the planet circle).
  const rReadout = detailed ? rPlanets - 39 - bandGrow / 3 : 0;
  // The degree·sign·minute readout appears once the wheel is large enough to read
  // it — the single wheel's second size tier (no longer tied to Advanced). The Capture
  // wheel opts in below that size gate (`readouts`), still bounded by the geometric guard.
  const showReadouts = detailed && rReadout > 30 && (size >= READOUT_MIN || readouts);
  // Dedicated house ring: a band just inside the planet glyphs — or inside the
  // readout ring when Advanced is on — holding the cusp spokes and house
  // numbers so nothing else overlaps them. Its two borders (houseRingOuter and
  // houseRingInner) ARE the band edges, replacing the old thin double border.
  const houseRingOuter = detailed
    ? (showReadouts ? rReadout - 28 - bandGrow / 3 : rPlanets - 22)
    : 0;
  // planetsOnly zeroes the band: the house ring circle, hover zones, cusp lines
  // and numbers are all gated on houseBand > 0, so they fall away together while
  // the inner radii (houseRingInner = houseRingOuter) stay geometrically sane.
  const houseBand =
    detailed && !planetsOnly ? Math.min(24, Math.max(0, houseRingOuter - 12)) : 0;
  const houseRingInner = houseRingOuter - houseBand;
  const rAspectRing = detailed ? houseRingInner : rPlanets - 22;
  const rInner = detailed ? houseRingInner : rPlanets - 22;

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

  // The four chart angles (As/Ds/Mc/Ic), drawn as ring marks alongside the
  // planets so they read in the chart itself rather than in a separate list.
  // Each keeps its axis colour — As/Ds gold, Mc/Ic cool — and joins the planet
  // spread below so an angle is never stacked on top of a planet it's conjunct.
  //
  // Gated on the DETAILED wheel, not on `interactive`. The two were one flag
  // once, which meant a non-interactive consumer — a rasterised or printed
  // wheel — drew a relocated chart with no angle marked at all, the one thing
  // such a chart exists to show. Interactivity now decides only the hover
  // affordances (ANGLE_HINTS, the hit targets), not whether the marks exist.
  const showAngleMarks = detailed && !planetsOnly;
  const angleLonByKey: Record<AngleKey, number> = {
    As: angles.asc,
    Ds: angles.dsc,
    Mc: angles.mc,
    Ic: angles.ic,
    Vx: angles.vertex,
    Avx: angles.antivertex,
  };
  const angleColor = (key: AngleKey) =>
    key === 'As' || key === 'Ds'
      ? 'var(--accent)'
      : key === 'Vx' || key === 'Avx'
        ? 'var(--text-muted)'
        : 'var(--cool)';
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
  const discHalf = DISC_HALF_PX(detailed ? 11 : 13, 1.3);

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
    for (const [name, deg] of placeOnRing(fixed, movable, minSep, radius)) {
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
    const sep = showReadouts
      ? Math.min(
          20,
          Math.max(4, (16 * 360) / (2 * Math.PI * Math.max(rReadout - readoutFan, 1))),
        )
      : 0;
    const placed = placeLongitudes(
      angleMarks.map((a) => ({
        name: a.key as string,
        off: off(a.lon),
        half: angleLabelHalfPx(a.key),
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
  const lonFor = (p: EclipticPosition) => displayLon.get(p.name) ?? p.lon;
  const angleLonFor = (a: { key: string; lon: number }) =>
    displayLon.get(a.key) ?? a.lon;

  // One spread for the overlay ring, shared by its glyphs and (when shown) its
  // readout trio so the two stay radially aligned. Sized to the innermost ring
  // in use — the minutes slot when the readout is on — so nothing collides there.
  //
  // The overlay's angle codes are fixed marks on this ring exactly as the natal
  // ones are on theirs. They are DRAWN at their true longitude already; what was
  // missing is that nothing knew they were there, so the overlay bodies were
  // spread against each other only and settled straight on top of them.
  const overlaySpreadRadius = showOverlayReadouts
    ? Math.max(rOverlayReadout - OV_FAN, 1)
    : rOverlay;
  const overlayDisplay = hasOverlay
    ? placeLongitudes(
        overlayAngleMarks.map((a) => ({
          name: a.key as string,
          off: off(a.lon),
          half: angleLabelHalfPx(a.key),
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
        showOverlayReadouts
          ? Math.min(
              20,
              Math.max(4, (16 * 360) / (2 * Math.PI * Math.max(overlaySpreadRadius, 1))),
            )
          : 0,
        Math.max(rOverlay, 1),
      )
    : null;
  const overlayLonFor = (p: EclipticPosition) =>
    overlayDisplay?.get(p.name) ?? p.lon;
  const overlayAngleLonFor = (a: { key: string; lon: number }) =>
    overlayDisplay?.get(a.key) ?? a.lon;

  // A sign glyph inside a body's readout that names itself on hover (interactive
  // wheel only), exactly like the rim signs — so the sign attached to each planet
  // reads the same way as the zodiac band. When the body is retrograde / stationary
  // (the red / yellow readout, Advanced mode) its `status` appends the matching
  // ℞ / S tag to the hover title. Non-interactive wheels just draw the glyph.
  const readoutSign = (
    signIdx: number,
    x: number,
    y: number,
    size: number,
    status?: MotionTag | null,
  ) => {
    if (!interactive) {
      return <ZodiacGlyph sign={signIdx} x={x} y={y} size={size} />;
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
        <ZodiacGlyph sign={signIdx} x={x} y={y} size={size} />
      </g>
    );
  };

  const svg = (
    <svg
      className={`wheel-svg${interactive ? ' interactive' : ''}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
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
              const lon = ((i * 30 + 15) * Math.PI) / 180;
              const pos = svgPos(lon, frameAnchor, (rZodiacInner + rOuter) / 2, cx, cy);
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

      {detailed &&
        Array.from({ length: 12 }).map((_, i) => {
          const lon = ((i * 30 + 15) * Math.PI) / 180;
          const rMid = (rZodiacInner + rOuter) / 2;
          const pos = svgPos(lon, frameAnchor, rMid, cx, cy);
          return (
            <ZodiacGlyph
              key={`sign-${i}`}
              sign={i}
              x={pos.x}
              y={pos.y}
              size={22}
              className="sign-rim"
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

      {/* Advanced: house-cusp degree·minute labels ringing the OUTSIDE of the
          wheel, the way printed natal charts annotate each cusp (e.g. "23°45'").
          The sign is read from the zodiac band, so no sign glyph here. */}
      {detailed &&
        advanced &&
        !planetsOnly &&
        angles.cusps.map((lon, idx) => {
          if (!Number.isFinite(lon)) return null;
          const pos = svgPos(lon, frameAnchor, rOuter + 12, cx, cy);
          const lonDeg = (((lon * 180) / Math.PI) % 360 + 360) % 360;
          const inSign = lonDeg % 30;
          const deg = Math.floor(inSign);
          const min = Math.floor((inSign - deg) * 60);
          return (
            <text
              key={`cuspdeg-${idx}`}
              x={pos.x}
              y={pos.y + 3}
              textAnchor="middle"
              className="cusp-rim-deg"
            >
              {deg}°{String(min).padStart(2, '0')}&#39;
            </text>
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
              <circle key={`asp-${i}`} cx={pos.x} cy={pos.y} r={3} fill={a.color} opacity={opacity} />
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
              stroke={a.color}
              strokeWidth={1}
              opacity={opacity}
            />
          );
        })}

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
                  stroke={PLANET_COLORS[p.name]}
                  strokeWidth={0.6}
                  opacity={0.4}
                />
              )}
              <line
                x1={tickPos.x}
                y1={tickPos.y}
                x2={tipPos.x}
                y2={tipPos.y}
                stroke={PLANET_COLORS[p.name]}
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

      {planets.map((p) => {
        const pos = svgPos(lonFor(p), frameAnchor, rPlanets, cx, cy);
        // The non-detailed minimap draws larger planet discs/glyphs (they're the
        // only thing on that simplified wheel, so there's room).
        const r = detailed ? 11 : 13;
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
                  ...bodyTip(t, labels, p),
                  color: PLANET_COLORS[p.name],
                  marker: (
                    <PlanetGlyph
                      planet={p.name}
                      size={14}
                      color={PLANET_COLORS[p.name]}
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
                stroke={PLANET_COLORS[p.name]}
                strokeWidth={1.3}
              />
              <PlanetGlyph
                planet={p.name}
                x={pos.x}
                y={pos.y}
                size={detailed ? 16 : 19.5}
                color={PLANET_COLORS[p.name]}
              />
            </g>
          </g>
        );
      })}

      {/* Angle marks: the two-letter code (As/Ds/Mc/Ic) as bare text on the
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
                    ...bodyTip(t, labels, { lon: a.lon }),
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
                  style={{ fill: a.color } as CSSProperties}
                >
                  {a.key}
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
                  stroke={PLANET_COLORS[p.name]}
                  strokeWidth={0.6}
                  strokeDasharray="2 2"
                  opacity={0.45}
                />
                <line
                  x1={tickPos.x}
                  y1={tickPos.y}
                  x2={tipPos.x}
                  y2={tipPos.y}
                  stroke={PLANET_COLORS[p.name]}
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
                        color: PLANET_COLORS[p.name],
                        marker: (
                          <PlanetGlyph
                            planet={p.name}
                            size={14}
                            color={PLANET_COLORS[p.name]}
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
                        stroke={PLANET_COLORS[p.name]}
                        strokeWidth={1.1}
                        strokeDasharray="2 1.5"
                      />
                      <PlanetGlyph
                        planet={p.name}
                        x={glyphPos.x}
                        y={glyphPos.y}
                        size={13}
                        color={PLANET_COLORS[p.name]}
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
                      stroke={PLANET_COLORS[p.name]}
                      strokeWidth={1.1}
                      strokeDasharray="2 1.5"
                    />
                    <PlanetGlyph
                      planet={p.name}
                      x={glyphPos.x}
                      y={glyphPos.y}
                      size={13}
                      color={PLANET_COLORS[p.name]}
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
                    ...bodyTip(t, labels, { lon: a.lon }),
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
                  style={{ fill: a.color } as CSSProperties}
                >
                  {a.key}
                </text>
              </g>
            </g>
          );
        })}

      {/* The overlay angles' degree·sign·minute readout — the natal angle readout's twin
          in the OUTER ring, so the bi-wheel's overlay angles read exactly like the natal
          ones (this is what was missing for transits/progressed; solar-arc now has angles
          to show too). Same fanned trio + formatter, positioned on the overlay readout
          radii. */}
      {showOverlayReadouts &&
        showAngleMarks &&
        overlayAngleMarks.map((a) => {
          const degPos = svgPos(overlayAngleLonFor(a), frameAnchor, rOverlayReadout + OV_FAN, cx, cy);
          const signPos = svgPos(overlayAngleLonFor(a), frameAnchor, rOverlayReadout, cx, cy);
          const minPos = svgPos(overlayAngleLonFor(a), frameAnchor, rOverlayReadout - OV_FAN, cx, cy);
          const lonDeg = (((a.lon * 180) / Math.PI) % 360 + 360) % 360;
          const signIdx = Math.floor(lonDeg / 30);
          const inSign = lonDeg % 30;
          const deg = Math.floor(inSign);
          const min = Math.floor((inSign - deg) * 60);
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
          const degPos = svgPos(lonFor(p), frameAnchor, rReadout + readoutFan, cx, cy);
          const signPos = svgPos(lonFor(p), frameAnchor, rReadout, cx, cy);
          const minPos = svgPos(lonFor(p), frameAnchor, rReadout - readoutFan, cx, cy);
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
              {readoutSign(signIdx, signPos.x, signPos.y, readoutFont + 3, sc ? motionTag(p) : null)}
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

      {/* Angle degree·sign·minute readout, fanned inward along the spoke exactly
          like the planet readout (degree nearest the disc, then sign glyph, then
          minutes) — so each angle reads e.g. 23° ♑ 17' right in the wheel. */}
      {showReadouts &&
        showAngleMarks &&
        angleMarks.map((a) => {
          const degPos = svgPos(angleLonFor(a), frameAnchor, rReadout + readoutFan, cx, cy);
          const signPos = svgPos(angleLonFor(a), frameAnchor, rReadout, cx, cy);
          const minPos = svgPos(angleLonFor(a), frameAnchor, rReadout - readoutFan, cx, cy);
          const lonDeg = (((a.lon * 180) / Math.PI) % 360 + 360) % 360;
          const signIdx = Math.floor(lonDeg / 30);
          const inSign = lonDeg % 30;
          const deg = Math.floor(inSign);
          const min = Math.floor((inSign - deg) * 60);
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
              {readoutSign(signIdx, signPos.x, signPos.y, readoutFont + 3)}
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
