// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The chart's COMPLETE line set in a line system named by the caller (2026-10-20): every
// family a chart draws — its angle lines, aspect and midpoint lines, parans, fixed stars, local
// space, catalog bodies and their parans — with no filter, no Advanced toggle and no overlay.
//
// Lifted out of App's buildAllLines, whose natal half it now is, so that a FINISHED document
// can ask for the chart's lines in the line system it was made in rather than the one the map is
// on now (Lina's ruling for Reports, 20 Oct 2026, §23: a report records its line system, and
// builds its own lines in it — not a disclosed hold on the map's). App's live builder calls this
// for the map's own system and adds the overlay's families beside it; the extension context's
// collectAllLinesFor(ls) calls it for the other one (lib/extensions/mapExtensions; seam L119).
//
// The rules are the map's own, each written once here and read by both: the In-Zodiaco and
// geodetic projection; the one tilt a geodetic map is drawn at (geoEps, Lina's §2); the
// sky-hold families a geodetic map leaves out (lib/skyHold) and the no-birth-time ones; and on a
// geodetic map a timeless chart's bands, stamped onto its lines (uncertaintyBands). So a set
// built here for 'geodetic' is the set the map would draw if it were switched to Geodetic —
// which verify-geodetic-chart §9 holds it to, against the generators called directly.
//
// Geometry only, in the generators' own colours: the caller inks it (lib/lineInks inkAllLines),
// as the live set is inked.
import type { FeatureCollection, LineString } from 'geojson';
import {
  projectMinorOntoEcliptic,
  projectOntoEcliptic,
  type CoordSystem,
  type LineSystem,
  type MinorPosition,
  type PlanetPosition,
} from '../ephemeris';
import type { AllLines } from '../extensions/mapExtensions';
import { skyHeldFor } from '../skyHold';
import { generateAspectLines, generateMidpointLines, type AngleOverlayLineProps } from './angleAspects';
import { generateLines, meridianLngFor, type LineProps, type MeridianLng } from './lines';
import { generateLocalSpace } from './localSpace';
import { generateMinorLines, type MinorDecor } from './minorLines';
import { generateMinorParans, generateParans } from './parans';
import { generateStarLines, starsOfDate, type StarSet } from './starLines';
import type { BirthDateMotion } from './timeless';
import { stampBands } from './uncertaintyBands';

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

/** What the chart's lines are built from: everything but the line system, which is the
 *  question being asked. The same values for every line system — a setting that differs
 *  between them is decided below from `ls`, never passed in. */
export interface NatalLineInputs {
  /** The chart's TRUE-SKY positions (RA/dec), as sampled — what local space reads as they are
   *  and every other family projects first. App's live set passes its slid sample. */
  positions: readonly PlanetPosition[];
  /** The instant `positions` were sampled at: the projection's epoch. */
  sampleJd: number;
  /** The chart's own moment: the fixed stars are precessed to it. */
  jd: number;
  /** The chart's obliquity and sidereal time: a celestial map's frame (radians). */
  eps: number;
  gmst: number;
  /** The one tilt a geodetic map is drawn at (App's geoEps): the chart's own obliquity with a
   *  chart loaded, which every caller here has. */
  geoEps: number;
  /** The STORED In Mundo / In Zodiaco choice. A geodetic set reads In Zodiaco whatever it says,
   *  as the map does. */
  coordSystem: CoordSystem;
  /** No birth time: no lines at all on a celestial map, and no parans, stars or local space on
   *  either. */
  noTime: boolean;
  /** A chart with no birth time's motion over its birth date (timeless.ts birthDateMotion), which
   *  its geodetic lines' bands are read from; null for a timed chart. */
  motion: BirthDateMotion | null;
  /** The Part of Fortune as a body (App's fortuneMapPos), or null. Joins the angle lines only
   *  where they are zodiacal — In Zodiaco, or geodetic. */
  fortune: PlanetPosition | null;
  starSet: StarSet;
  /** The fixed stars' generator colour (lib/theme STAR_LINE_COLORS for the base theme). */
  starColor: string;
  /** Where local space radiates from (App's resolved origin), or null for none. */
  localSpaceOrigin: { lat: number; lng: number } | null;
  /** The catalog bodies in play, as sampled (true sky), their sample instant, and their
   *  decoration. Empty positions for none. */
  minor: { positions: readonly MinorPosition[]; sampleJd: number; decor: (n: number) => MinorDecor };
  /** The "Parans with the planets" switch as it stands with every hold applied but the sky
   *  hold, which depends on the line system and is applied below. */
  minorParans: boolean;
}

/** The families a caller already holds, generated from these same inputs in this same line
 *  system by the helpers below (App's drawn memos), handed in so the set reuses them rather
 *  than building them twice. Anything absent is built here. */
export interface NatalLineReuse {
  lines?: FeatureCollection;
  parans?: FeatureCollection;
  localSpace?: FeatureCollection;
  minorLines?: FeatureCollection;
}

/** The tilt a line system's lines are mapped at: the one tilt on a geodetic map (Lina, 20 Oct
 *  2026, §2), the chart's own obliquity on a celestial one — where it places nothing on the
 *  map (the mapping is RA − GMST) and only an In-Zodiaco point's equatorial position reads it. */
export function natalLineEps(i: Pick<NatalLineInputs, 'eps' | 'geoEps'>, ls: LineSystem): number {
  return ls === 'geodetic' ? i.geoEps : i.eps;
}

/** The meridian mapping of a line system's lines (lines.ts meridianLngFor at natalLineEps). */
export function natalMeridianLng(
  i: Pick<NatalLineInputs, 'eps' | 'geoEps' | 'gmst'>,
  ls: LineSystem,
): MeridianLng {
  return meridianLngFor(ls, natalLineEps(i, ls), i.gmst);
}

/** The positions a line system's line generators read: projected onto the ecliptic In
 *  Zodiaco and on a geodetic map — on a geodetic one laid back on the equator at the one tilt —
 *  and none at all for a chart with no birth time on a celestial map, whose lines are the
 *  sky's turning that the unknown hour decides. (App's linePositions is this, sliding aware.) */
export function natalLinePositions(
  positions: readonly PlanetPosition[],
  sampleJd: number,
  ls: LineSystem,
  coordSystem: CoordSystem,
  noTime: boolean,
  geoEps: number,
): PlanetPosition[] {
  if (noTime && ls !== 'geodetic') return [];
  return ls === 'geodetic' || coordSystem === 'zodiaco'
    ? projectOntoEcliptic(positions as PlanetPosition[], sampleJd, ls === 'geodetic' ? geoEps : undefined)
    : (positions as PlanetPosition[]);
}

/** The catalog bodies' twin of natalLinePositions — the planets' frame rule exactly. */
export function natalMinorLinePositions(
  positions: readonly MinorPosition[],
  sampleJd: number,
  ls: LineSystem,
  coordSystem: CoordSystem,
  noTime: boolean,
  geoEps: number,
): MinorPosition[] {
  if (noTime && ls !== 'geodetic') return [];
  return ls === 'geodetic' || coordSystem === 'zodiaco'
    ? projectMinorOntoEcliptic(positions, sampleJd, ls === 'geodetic' ? geoEps : undefined)
    : (positions as MinorPosition[]);
}

/** Whether a line system's lines carry a timeless chart's bands: a chart with no birth time on
 *  a geodetic map (App's timelessGeodetic). */
export function natalBanded(noTime: boolean, ls: LineSystem): boolean {
  return noTime && ls === 'geodetic';
}

/** `fc` with its bands stamped where natalBanded says so — a chart with no birth time (its
 *  `motion`) on a geodetic map — at the line system's own tilt and the positions the lines
 *  were generated from; else `fc` itself. */
export function stampNatalBands<P extends LineProps>(
  fc: FeatureCollection<LineString, P>,
  linePositions: readonly PlanetPosition[],
  motion: BirthDateMotion | null,
  ls: LineSystem,
  geoEps: number,
): FeatureCollection<LineString, P> {
  return motion && natalBanded(true, ls) ? stampBands(fc, linePositions, motion, geoEps) : fc;
}

/** The set with no chart: every family empty, every overlay slot null, held as `ls` holds. */
export function emptyNatalLineSet(ls: LineSystem): AllLines {
  return {
    lines: EMPTY,
    angleLines: EMPTY,
    parans: EMPTY,
    starLines: EMPTY,
    localSpace: EMPTY,
    overlayLines: null,
    overlayParans: null,
    overlayLocalSpace: null,
    natalAngleLines: EMPTY,
    natalParans: EMPTY,
    natalStarLines: EMPTY,
    minorLines: EMPTY,
    overlayMinorLines: null,
    minorParans: EMPTY,
    overlayMinorParans: null,
    skyHeld: skyHeldFor(ls),
    lineSystem: ls,
  };
}

/**
 * The chart's complete line set in line system `ls`, natal families only: every overlay slot
 * null, as in a set built with no overlay. `skyHeld` and `lineSystem` say what it was built in.
 */
export function buildNatalLineSet(
  i: NatalLineInputs,
  ls: LineSystem,
  reuse: NatalLineReuse = {},
): AllLines {
  const skyHeld = skyHeldFor(ls);
  // The families that read the sky's turning at the chart minute: none without a birth time,
  // and none on a geodetic map (the sky hold).
  const skyFamiliesOff = i.noTime || skyHeld;
  // The Vertex axis is the sky's too.
  const lineOpts = { vertex: !skyHeld };
  const lineEps = natalLineEps(i, ls);
  const meridianLng = natalMeridianLng(i, ls);
  const linePositions = natalLinePositions(i.positions, i.sampleJd, ls, i.coordSystem, i.noTime, i.geoEps);
  const zodiacal = ls === 'geodetic' || i.coordSystem === 'zodiaco';
  const effCoordSystem: CoordSystem = ls === 'geodetic' ? 'zodiaco' : i.coordSystem;

  const lines =
    reuse.lines ??
    stampNatalBands(
      generateLines(i.fortune && zodiacal ? [...linePositions, i.fortune] : linePositions, meridianLng, lineOpts),
      linePositions,
      i.motion,
      ls,
      i.geoEps,
    );
  // Aspects and midpoints from the FULL body set, every line type — no display filter. On a
  // chart with no birth time they are drawn and banded like the rest (Lina, 22 Oct 2026, §2.2).
  const angleLines = stampNatalBands(
    {
      type: 'FeatureCollection',
      features: [
        ...generateAspectLines(linePositions, meridianLng, effCoordSystem, lineEps, lineOpts).features,
        ...generateMidpointLines(linePositions, meridianLng, effCoordSystem, lineEps, lineOpts).features,
      ],
    } as FeatureCollection<LineString, AngleOverlayLineProps>,
    linePositions,
    i.motion,
    ls,
    i.geoEps,
  );
  const parans = reuse.parans ?? (skyFamiliesOff ? EMPTY : generateParans(linePositions, meridianLng));
  const starLines = skyFamiliesOff
    ? EMPTY
    : generateStarLines(starsOfDate(i.jd, i.starSet), meridianLng, ls === 'geodetic' ? lineEps : null, i.starColor);
  // True-sky positions, never projected (local space is a technique of the real sky).
  const localSpace =
    reuse.localSpace ??
    (i.localSpaceOrigin && !i.noTime && !skyHeld
      ? generateLocalSpace(i.positions as PlanetPosition[], i.gmst, i.localSpaceOrigin.lat, i.localSpaceOrigin.lng)
      : EMPTY);
  const minorPositions = natalMinorLinePositions(
    i.minor.positions,
    i.minor.sampleJd,
    ls,
    i.coordSystem,
    i.noTime,
    i.geoEps,
  );
  const minorLines = reuse.minorLines ?? generateMinorLines(minorPositions, meridianLng, i.minor.decor);
  const minorParans =
    i.minorParans && !skyFamiliesOff && minorPositions.length > 0
      ? generateMinorParans(minorPositions, linePositions, meridianLng, i.minor.decor)
      : EMPTY;
  return {
    lines,
    angleLines,
    parans,
    starLines,
    localSpace,
    overlayLines: null,
    overlayParans: null,
    overlayLocalSpace: null,
    natalAngleLines: angleLines,
    natalParans: parans,
    natalStarLines: starLines,
    minorLines,
    overlayMinorLines: null,
    minorParans,
    overlayMinorParans: null,
    skyHeld,
    lineSystem: ls,
  };
}
