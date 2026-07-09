// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Aspect lines and midpoint lines — the two "Aspects to angles" map overlays.
//
// Both techniques reduce to the same trick: every one of their lines is one of
// the four standard angle lines (MC/IC/ASC/DSC) of a VIRTUAL POINT, so we build
// that point and reuse `generateLines` unchanged. The aspect itself is always an
// ECLIPTIC-LONGITUDE relation (60°/90°/120°); the Zodiacal / In-Mundo setting
// decides only whether the virtual point keeps the body's ecliptic latitude.
//
//  - Aspect lines — the virtual point is the planet advanced by ±aspect in
//    ecliptic longitude. Conjunctions are skipped (they ARE the base planet
//    lines) and so are oppositions (opposite the MC = conjunct the IC).
//
//    · zodiaco: the point is a DEGREE on the ecliptic (latitude → 0). The +a
//      and −a degrees are exact antipodes, so a single +a point suffices: its
//      four lines carry every ±a relation to both ends of each axis (its IC/DSC
//      lines coincide with the −a point's MC/ASC lines). We label each line by
//      the reading it also holds as an aspect to the MC or ASC — the +60 point's
//      IC line, where the MC sits 120° behind the planet, stores "trine MC" —
//      and `aspectBranchReading` recovers the geometry-true reading ("sextile
//      Ic") for the hover tip, badge, and card.
//
//    · mundo: the point is the BODY, its ecliptic latitude RETAINED (the same
//      longitude shift a solar-arc direction applies). Off the ecliptic the +a
//      and −a points are no longer antipodal, so BOTH are drawn and each emits
//      four distinct lines. This is what reproduces the reference programs'
//      PAIRED aspect lines (two squares-to-MC at different longitudes) and their
//      off-equator crossings; projecting the point onto the ecliptic instead
//      (latitude → 0) collapses those crossings onto the equator and shifts the
//      meridians several degrees. The relabel above still applies, so the shared
//      consumers read every line by its own angle unchanged.
//
//  - Midpoint lines: the virtual point is the pair's midpoint; its four lines
//    keep their own angle labels ("Su/Mo IC" is the far midpoint culminating).
//    zodiaco averages the two ecliptic longitudes on the ecliptic; mundo takes
//    the BODILY midpoint — mean RA AND mean declination of the two bodies —
//    matching how reference software places mundane midpoint lines.
//
// Celestial vs geodetic needs no handling here: the injected `meridianLng`
// already maps RA to geographic longitude for either system.
import type { Feature, FeatureCollection, LineString } from 'geojson';
import {
  PLANET_CODES,
  PLANET_COLORS,
  PLANET_NAMES,
  eclipticToRaDec,
  raDecToEclipticLon,
  shiftEclipticLongitude,
  type CoordSystem,
  type PlanetName,
  type PlanetPosition,
} from '../ephemeris';
import { ASPECT_GLYPHS } from './glyphChars';
import { generateLines, type LineProps, type LineType, type MeridianLng } from './lines';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const TWO_PI = Math.PI * 2;
const wrap2pi = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
// Same convention as lines.ts: the date line is +180, never -180, so a target
// exactly on it matches the meridian geometry it anchors.
function normLng(lng: number): number {
  let x = ((lng + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

export type AspectKind = 'sextile' | 'square' | 'trine';
const ASPECT_KINDS: AspectKind[] = ['sextile', 'square', 'trine'];
export const ASPECT_DEG: Record<AspectKind, number> = {
  sextile: 60,
  square: 90,
  trine: 120,
};

/** The equivalent reading from the other end of the axis: an aspect of `a` to
 *  the ASC is simultaneously an aspect of 180−a to the DSC (sextile↔trine,
 *  square↔square). Used to relabel IC/DSC-side lines to the MC/ASC convention
 *  and to show the complementary reading in hover tips. */
export const ASPECT_COMPLEMENT: Record<AspectKind, AspectKind> = {
  sextile: 'trine',
  square: 'square',
  trine: 'sextile',
};

/** The geometry-true reading of an aspect line: the aspect to its OWN angle
 *  (the `branch`), rather than the MC/ASC-convention relabel carried by
 *  `lineType`/`aspect`. The generator labels every line as an aspect to the MC
 *  or ASC (so a +a point's IC line reads "trine MC"); this recovers the reading
 *  at the angle the line actually IS — its IC line as "(a) to the Ic", its DSC
 *  line as "(a) to the Ds". A near-side branch (MC/ASC, and VX/AVX which are
 *  never relabeled) keeps the stored aspect; a far-side branch (IC/DSC) takes
 *  the complement, undoing the generator's swap. Used by the hover tip, edge
 *  badge, and line card so all three name the line by the angle it is. */
export function aspectBranchReading(
  aspect: AspectKind,
  branch: LineType,
): { aspect: AspectKind; angle: LineType } {
  const farSide = branch === 'IC' || branch === 'DSC';
  return { aspect: farSide ? ASPECT_COMPLEMENT[aspect] : aspect, angle: branch };
}

/** A planet-aspects-angle line. Extends LineProps so the generic line helpers
 *  (withThemeLineColors, lineType filtering, edge badges) apply unchanged. The
 *  displayed `lineType` is always MC or ASC (the labeling convention above). */
export interface AspectLineProps extends LineProps {
  kind: 'aspect';
  aspect: AspectKind;
  /** The geometric angle line of the generating virtual point (its own
   *  MC/IC/ASC/DSC). Distinguishes the two same-label branches of an aspect
   *  (e.g. both trine-MC meridians) for badge grouping; not displayed. */
  branch: LineType;
  /** This line family's anchor point — where the relevant aspected degree is
   *  directly overhead, on the family's own meridian. The edge badges'
   *  click-to-fly target, the analog of a planet badge's zenith. */
  targetLng: number;
  targetLat: number;
}

/** A midpoint-on-angle line. The inherited `planet` (and its color) is the
 *  pair's first body in canonical display order; `planetB` is the second,
 *  carried for labels, badges, and tooltips. */
export interface MidpointLineProps extends LineProps {
  kind: 'midpoint';
  planetB: PlanetName;
  /** planetB's display color. The inherited `color` (planetA's) gets the
   *  light-theme colour swap from App.withThemeLineColors — this field gets the
   *  same treatment there, so a "Sun/Moon" hover tip stays readable. */
  colorB: string;
  /** The (near or far, per the line's side) midpoint's sub-point — the edge
   *  badges' click-to-fly target (see AspectLineProps.targetLng). */
  targetLng: number;
  targetLat: number;
}

export type AngleOverlayLineProps = AspectLineProps | MidpointLineProps;

// The ecliptic degree (radians) a body's aspect/midpoint math should read,
// per the measuring frame. In zodiaco mode App already feeds ecliptic-projected
// positions, for which this conversion is exact anyway.
function bodyLon(p: PlanetPosition, eps: number): number {
  return raDecToEclipticLon(p.ra, p.dec, eps);
}

// The shorter-arc midpoint of two angles (radians) — the conventional "near"
// midpoint. The far midpoint needs no separate handling: the near point's
// IC/DSC lines are the far point's MC/ASC lines (antipodal symmetry).
function shortArcMid(a: number, b: number): number {
  let d = wrap2pi(b - a);
  if (d > Math.PI) d -= TWO_PI;
  return wrap2pi(a + d / 2);
}

// The four standard angle lines of a virtual equatorial point, attributed to
// `name` so colors and visibility filters track the source planet — plus the
// point's sub-point (its "zenith": where it is directly overhead, on its MC
// line). Lines on the far side of the axis (the point's IC/DSC) anchor to the
// ANTIPODAL sub-point instead, so a badge's fly-to lands on its own family's
// meridian rather than across the world.
function virtualPointLines(
  name: PlanetName,
  ra: number,
  dec: number,
  meridianLng: MeridianLng,
): {
  features: Feature<LineString, LineProps>[];
  subLng: number;
  subLat: number;
} {
  return {
    features: generateLines([{ name, ra, dec }], meridianLng).features,
    subLng: normLng(meridianLng(ra)),
    subLat: dec * RAD2DEG,
  };
}

// Fly-to anchor for one of the virtual point's lines: the sub-point for its
// MC/ASC lines, the antipodal sub-point for its IC/DSC lines.
function lineTarget(
  own: LineType,
  subLng: number,
  subLat: number,
): { targetLng: number; targetLat: number } {
  return own === 'IC' || own === 'DSC'
    ? { targetLng: normLng(subLng + 180), targetLat: -subLat }
    : { targetLng: subLng, targetLat: subLat };
}

/**
 * Lines where a planet is sextile/square/trine to the MC or the ASC.
 * `positions` should already be reduced to the visible bodies. When both lunar
 * nodes are present, the South Node is dropped here: it is the North Node's
 * exact antipode, so its aspect line set coincides with the North Node's and
 * would only double-draw. Alone (North Node hidden) it generates normally.
 */
export function generateAspectLines(
  positions: PlanetPosition[],
  meridianLng: MeridianLng,
  coordSystem: CoordSystem,
  eps: number,
): FeatureCollection<LineString, AspectLineProps> {
  const src = positions.some((p) => p.name === 'NorthNode')
    ? positions.filter((p) => p.name !== 'SouthNode')
    : positions;
  const features: Feature<LineString, AspectLineProps>[] = [];
  for (const p of src) {
    for (const aspect of ASPECT_KINDS) {
      const a = ASPECT_DEG[aspect] * DEG2RAD;
      // The virtual point(s) whose angle lines carry this aspect. zodiaco uses a
      // single ecliptic degree (latitude 0): the +a and −a degrees are antipodes,
      // so one point's four lines already carry every ±a reading. mundo advances
      // the BODY by ±a in ecliptic longitude with its latitude retained (a
      // solar-arc-style shift); off the ecliptic the two signs are distinct
      // lines, so both are drawn (see the module header).
      const points =
        coordSystem === 'zodiaco'
          ? [eclipticToRaDec(wrap2pi(bodyLon(p, eps) + a), 0, eps)]
          : [1, -1].map((sign) => {
              const vp = shiftEclipticLongitude(p, sign * a, eps);
              return { ra: vp.ra, dec: vp.dec };
            });
      for (const { ra, dec } of points) {
        const v = virtualPointLines(p.name, ra, dec, meridianLng);
        for (const f of v.features) {
          const own = f.properties.lineType;
          // Relabel the far-side lines to the MC/ASC reading: the +a point's IC
          // line is the (180−a)-to-MC line, its DSC line the (180−a)-to-ASC.
          const farSide = own === 'IC' || own === 'DSC';
          const angle: LineType = own === 'IC' ? 'MC' : own === 'DSC' ? 'ASC' : own;
          const shown = farSide ? ASPECT_COMPLEMENT[aspect] : aspect;
          features.push({
            ...f,
            properties: {
              ...f.properties,
              lineType: angle,
              branch: own,
              kind: 'aspect',
              aspect: shown,
              ...lineTarget(own, v.subLng, v.subLat),
              label: `${PLANET_CODES[p.name]} ${ASPECT_GLYPHS[shown]} ${angle}`,
            },
          });
        }
      }
    }
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Lines where the midpoint of each pair of `positions` sits exactly on an
 * angle. Pass only the visible bodies: the pair count is quadratic, so the
 * planet filter is what keeps this overlay readable.
 */
export function generateMidpointLines(
  positions: PlanetPosition[],
  meridianLng: MeridianLng,
  coordSystem: CoordSystem,
  eps: number,
): FeatureCollection<LineString, MidpointLineProps> {
  // Canonical pair order (Sun first … Lilith last) keeps labels and the
  // pair's color (= first body's) stable however the filter set changes.
  const sorted = [...positions].sort(
    (x, y) => PLANET_NAMES.indexOf(x.name) - PLANET_NAMES.indexOf(y.name),
  );
  const features: Feature<LineString, MidpointLineProps>[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const A = sorted[i];
      const B = sorted[j];
      // The nodes are exact antipodes: their midpoint is ill-defined (every
      // candidate is 90° from both), so the pair is skipped.
      if (A.name === 'NorthNode' && B.name === 'SouthNode') continue;
      // Zodiacal: the classic λ-average, on the ecliptic. In mundo: the BODILY
      // midpoint — mean RA and mean declination of the two actual bodies (see
      // the module header for why this is not projected onto the ecliptic).
      const { ra, dec } =
        coordSystem === 'zodiaco'
          ? eclipticToRaDec(shortArcMid(bodyLon(A, eps), bodyLon(B, eps)), 0, eps)
          : { ra: shortArcMid(A.ra, B.ra), dec: (A.dec + B.dec) / 2 };
      const v = virtualPointLines(A.name, ra, dec, meridianLng);
      for (const f of v.features) {
        features.push({
          ...f,
          properties: {
            ...f.properties,
            kind: 'midpoint',
            planetB: B.name,
            colorB: PLANET_COLORS[B.name],
            ...lineTarget(f.properties.lineType, v.subLng, v.subLat),
            label: `${PLANET_CODES[A.name]}/${PLANET_CODES[B.name]} ${f.properties.lineType}`,
          },
        });
      }
    }
  }
  return { type: 'FeatureCollection', features };
}
