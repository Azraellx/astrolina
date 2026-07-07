// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Timeline & overlays: turns the active chart + a mode + a target moment (or a
// partner chart) into a second set of positions/gmst that the existing line,
// paran, and local-space generators consume unchanged. This is the single
// abstraction behind transits, secondary progressions, solar-arc directions,
// and relationship (synastry) overlays — each is just "derive a different
// positions+gmst and overlay it."
import type { FeatureCollection, LineString } from 'geojson';
import {
  birthDataToJD,
  eclipticLonOfRA,
  eclipticToRaDec,
  getPlanetPositions,
  gmstRadians,
  obliquity,
  raDecToEclipticLon,
  shiftEclipticLongitude,
  shiftRightAscension,
  solarDailyMotionLong,
  solarDailyMotionRA,
  type NodeType,
  type PlanetName,
  type PlanetPosition,
} from '../ephemeris';
import type { StoredChart } from '../chartLibrary';
import { compositeEquatorial, solveCompositeFrameJd } from './composite';
import type { TFn } from '../../i18n';

export type OverlayMode =
  | 'off'
  | 'transits'
  | 'progressed'
  | 'tertiary-progressed'
  | 'solar-arc'
  | 'primary-directions'
  | 'cyclo'
  | 'synastry'
  | 'eclipses';

export type OverlayKind = Exclude<OverlayMode, 'off'>;

// Overlay modes in MENU + cycle order — the SINGLE source the Overlay dropdown (TopNav)
// maps over and App's 'o'-key cycle derives from. Transits leads, then the symbolic
// clocks fast-to-slow (CCG, the progressions, the directions); the event/relationship
// overlays (eclipses, synastry) close the list.
export const OVERLAY_MODES: OverlayKind[] = [
  'transits',
  'cyclo',
  'progressed',
  'tertiary-progressed',
  'solar-arc',
  'primary-directions',
  'eclipses',
  'synastry',
];

// The overlay modes that require the 'adv' plan tier — ONLY synastry (the last of
// OVERLAY_MODES); every technique overlay is baseline. Tier-gated modes are hidden from
// the menu + the 'o' cycle below the tier, ADV-badged when shown, and switched off if
// Advanced is turned off. This is the tier source of truth.
export const ADVANCED_OVERLAY_MODES = new Set<OverlayMode>(['synastry']);

// Overlay modes unavailable on a COMPOSITE chart — leaving Transits + Eclipses
// only. A composite is a symbolic midpoint construct with no real sky moment, so
// the progression/direction techniques (and the relationship-generating Synastry
// overlay) have no real referent to advance; transits and eclipses stay valid
// because the transiting/eclipse body is real and forms a genuine current-sky
// aspect to the composite points regardless. Davison charts keep the full set
// (they ARE a real averaged moment). See docs/calculation-methods.md.
export const COMPOSITE_BLOCKED_OVERLAYS = new Set<OverlayMode>([
  'progressed',
  'tertiary-progressed',
  'solar-arc',
  'primary-directions',
  'cyclo',
  'synastry',
]);

// Overlay modes unavailable when the chart's birth TIME is unknown (timeKnown === false):
// every technique that ADVANCES the natal moment — the stored noon placeholder would
// progress/direct a moment that was never real. Transits + eclipses stay (the transiting
// sky and eclipse geometry are real regardless of the birth minute), and synastry stays
// (the partner's linework is the partner's own; the natal side is already suppressed).
export const TIME_UNKNOWN_BLOCKED_OVERLAYS = new Set<OverlayMode>([
  'progressed',
  'tertiary-progressed',
  'solar-arc',
  'primary-directions',
  'cyclo',
]);

/** The overlay modes a given chart cannot carry — the composite block, the
 *  unknown-birth-time block, and the Davison synastry block. The one predicate
 *  behind the Overlay menu, the 'o' cycle, and the stale-mode reset, so they can
 *  never disagree. */
export function overlayBlockedFor(
  chart: { composite?: unknown; timeKnown?: boolean; tag?: string } | null,
): (mode: OverlayMode) => boolean {
  if (!chart) return () => false;
  const composite = !!chart.composite;
  const noTime = chart.timeKnown === false;
  // A Davison is a locally-generated relationship chart: real natal math (so no
  // `composite` payload) but system-tagged 'space' by the relationship generator.
  // You can't add a partner to a chart that is already a two-person relationship
  // chart, so Synastry is barred on it — the same reason a composite bars it.
  const davison = !composite && chart.tag === 'space';
  return (mode) =>
    (composite && COMPOSITE_BLOCKED_OVERLAYS.has(mode)) ||
    (noTime && TIME_UNKNOWN_BLOCKED_OVERLAYS.has(mode)) ||
    (davison && mode === 'synastry');
}

// The auxiliary line families that derive from a chart's body set (as opposed to
// the primary angle lines): aspect-to-angle lines, midpoint lines, paran lines,
// and fixed-star lines.
export type AuxFamily = 'aspect' | 'midpoint' | 'paran' | 'star';

// Which auxiliary families are INCOHERENT under a given overlay and so must be
// suppressed. Cyclocartography is the sole blocker today: its "sky" stitches two
// instants together (progressed personal planets + transiting outers), so any
// construct that needs a single simultaneous moment breaks —
//   · a paran is two bodies angular at ONE moment; across two epochs no such
//     moment exists, so paran rows would be meaningless.
//   · a midpoint collapses two bodies into ONE point; averaging a progressed and
//     a transiting position joins two epochs into a single place — incoherent.
// Aspect-to-angle and star lines stay allowed: each is a PER-BODY construct (a
// body's own position aspecting/marking an angle) needing no cross-body
// simultaneity, so each Cyclo body stands on its own well-defined position.
export const AUX_BLOCKED_OVERLAYS: Record<AuxFamily, ReadonlySet<OverlayMode>> = {
  aspect: new Set<OverlayMode>(),
  midpoint: new Set<OverlayMode>(['cyclo']),
  paran: new Set<OverlayMode>(['cyclo']),
  star: new Set<OverlayMode>(),
};

/** Whether auxiliary family `f` is suppressed under overlay mode `m`. The one
 *  predicate shared by the map's family generation and the sidebar toggle
 *  gray-out, so the drawn set and the UI can never disagree. */
export const overlayAuxBlocked = (m: OverlayMode, f: AuxFamily): boolean =>
  AUX_BLOCKED_OVERLAYS[f].has(m);

// The relationship-chart method the Synastry overlay's "Generate" button uses.
// 'davison' is a real moment+place (cast like any chart); 'composite' (midpoint of
// every planet between the two charts) is not yet wired — it needs precomputed
// positions through the render stack.
export type RelationshipMethod = 'davison' | 'composite';

// ── Progressions & Directions settings (Solar Fire "Progs/Dirns") ────────────
// Group A — how a directed/progressed chart's ANGLES advance. Drives both the
// Solar Arc and the Progressed overlays. In this angle-only ACG app this resolves
// to either a per-body (ra,dec) shift (solar arc) or a gmst/RAMC offset
// (progressed); see buildOverlay.
export type AngleProgression =
  | 'sa-long'        // solar arc, applied in ecliptic longitude (classic default)
  | 'sa-ra'          // solar arc, applied in right ascension
  | 'naibod-long'    // Naibod mean rate, applied in longitude
  | 'naibod-ra'      // Naibod mean rate, applied in right ascension
  | 'mean-quotidian'; // "Natal Frame": angles hold the natal RAMC (historical storage key)

// Group B — the time-key (arc per year) for the Primary Directions overlay.
export type PrimaryRate =
  | 'ptolemy'      // 1° per year
  | 'naibod'       // 0°59′08.33″ per year
  | 'cardan'       // 0°59′12″ per year
  | 'kepler-ra'    // natal Sun's daily motion in RA, per year
  | 'solar-long'   // natal Sun's daily motion in longitude, per year
  | 'placidus-ra'  // true secondary-progressed solar arc in RA (nonlinear)
  | 'user';        // user-entered degrees per year

// The two progressed overlays are distinct OverlayModes (above), each its own row in
// the Overlay menu: 'progressed' is the classic SECONDARY day-for-a-year; the separate
// 'tertiary-progressed' runs one ephemeris day per TROPICAL MONTH of life (the common
// "tertiary I" definition), a faster hand for finer timing work. ProgressionType remains
// as the day-clock selector buildOverlay reads (the mode is the source of truth — see
// its progressed case — but the type also lets callers/tests name a clock directly).
export type ProgressionType = 'secondary' | 'tertiary';

const TROPICAL_MONTH_DAYS = 27.321582;

// How the TRANSIT overlay's angle lines are framed:
//  - 'relative-to-natal' (default): hold the natal chart's RAMC fixed and let the
//    transiting planets fall through it — the lines reflect the planets' zodiacal
//    (secondary) motion, drifting slowly day to day. This is the radix-relative map
//    (the Solar Maps-style transit map this app's astrologers work with).
//  - 'transit-moment': the standard Jim Lewis transit astrocartography — the
//    transiting planets angular at the transit instant itself, driven by that
//    moment's sidereal time (the diurnal/primary placement; lines sweep ~15°/hour).
// (Solar Arc and Primary Directions are already natal-RAMC framed; Progressed has
// its own angle-progression setting.)
export type TransitFrame = 'relative-to-natal' | 'transit-moment';

// Mean solar motion keys (degrees/year of life), per their classical definitions.
const NAIBOD_DEG_PER_YR = 0.985647; // 0°59′08.33″
const CARDAN_DEG_PER_YR = 0.986667; // 0°59′12″

// Cyclo*carto*graphy's body split: the personal planets read at their
// secondary-progressed positions; everything else (Jupiter outward, the nodes,
// Lilith, Chiron, the asteroids) at its real transiting position. Solar Fire's
// conventional CCG split.
const CYCLO_PROGRESSED: ReadonlySet<string> = new Set([
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
]);

/** Cyclo*carto*graphy's per-body label tag: each feature names its actual
 *  SOURCE — "Sp" on the progressed personal planets, "Tr" on the transiting
 *  outers — rather than the mode. (Cyclo draws no parans or midpoint lines — its
 *  two epochs share no single sky-moment — so no cross-source pairing arises.) */
export const cycloBodyTag = (planet: PlanetName): string =>
  CYCLO_PROGRESSED.has(planet) ? 'Sp' : 'Tr';

// Timeline granularity. Each unit defines the MAJOR (labeled) notch interval on
// the ruler and how many sub-segments it splits into; the minor notch — and the
// default amount one Step button press / one animation tick advances — is
// major/subdiv.
//   minute → 5 segments → minor 1 min
//   hour   → 6 segments → minor 10 min
//   day    → 4 segments → minor 6 h
//   week   → 7 segments → minor 1 day
//   month  → 6 segments → minor 5 days
//   year   → 12 segments → minor ~1 month
export type TimeUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export const TIME_UNITS: Record<TimeUnit, { major: number; subdiv: number }> = {
  minute: { major: 5 * MIN_MS, subdiv: 5 },
  hour: { major: HOUR_MS, subdiv: 6 },
  day: { major: DAY_MS, subdiv: 4 },
  week: { major: 7 * DAY_MS, subdiv: 7 },
  month: { major: 30 * DAY_MS, subdiv: 6 },
  year: { major: 365 * DAY_MS, subdiv: 12 },
};

// One minor notch = one Step / one animation tick.
export const minorStepMs = (u: TimeUnit): number =>
  TIME_UNITS[u].major / TIME_UNITS[u].subdiv;

export interface OverlayLayer {
  kind: OverlayKind;
  /** Dynamic readout shown in the timeline nub next to the mode name: "Age 32.0"
   *  / "30.2°". null for transits (the mode name alone says it) and synastry
   *  (which has no timeline bar). */
  measure: string | null;
  /** Full spelled-out label for the roomy expanded-view caption, e.g.
   *  "Solar Arc · 30.2°" or "Transits · 2026-05-10 14:30 UTC". */
  labelFull: string;
  jd: number; // effective JD, for toEclipticPositions in the bi-wheel
  positions: PlanetPosition[];
  gmst: number;
  originLat: number; // local-space origin
  originLng: number;
  /** Per-body epochs for a layer that MIXES instants (cyclo: progressed
   *  inners + transiting outers). Sidereal display shifts each listed body by
   *  its own epoch's ayanamsa instead of the layer's `jd`; absent for the
   *  single-instant overlays. */
  bodyJd?: Partial<Record<PlanetName, number>>;
  /** Directed-overlay angle inference. Solar-arc / primary-directions / progressed have no
   *  relocatable "second moment": their bi-wheel angle marks are the NATAL angles advanced
   *  by the directional arc. `angleArc` is that arc (radians); `angleFrame` is how it
   *  advances the angles — 'long' adds it to each angle's ecliptic longitude (solar-arc-in-
   *  longitude); 'ramc' advances the RAMC by the arc and re-derives MC/ASC (the classical
   *  meridian operation — see ephemeris.directedAngles). Absent for transits / synastry,
   *  whose overlay angles come straight from relocate() at the target moment. */
  angleArc?: number;
  angleFrame?: 'long' | 'ramc';
  /** The moment whose relocated angles seed the bi-wheel's overlay ring (defaults to
   *  `jd`). The progressed overlay sets it to the BIRTH moment: its angle methods direct
   *  the NATAL angles (matching the map frame's RAMC treatment — the default holds them),
   *  while `jd` stays the progressed instant for the planets' positions. Without this the
   *  wheel showed the true-quotidian angles regardless of the chosen method. */
  angleJd?: number;
}

const TROPICAL_YEAR_DAYS = 365.2422;
const UNIX_EPOCH_JD = 2440587.5;

export const epochMsToJD = (ms: number) => UNIX_EPOCH_JD + ms / 86_400_000;
export const jdToEpochMs = (jd: number) => (jd - UNIX_EPOCH_JD) * 86_400_000;

// Normalize a radian angle to (-π, π].
export function normalizeAngle(r: number): number {
  let x = r % (2 * Math.PI);
  if (x > Math.PI) x -= 2 * Math.PI;
  if (x <= -Math.PI) x += 2 * Math.PI;
  return x;
}

function fmtDateUTC(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function fmtDateTimeUTC(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${fmtDateUTC(ms)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// Normalize a radian angle to [0, 2π) — matches gmstRadians' range, so a directed
// gmst stays interchangeable with a measured one downstream.
const norm2pi = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

// Quantities shared by the three directed overlays (solar-arc, progressed,
// primary-directions). The arc closures are lazy — each does a progressed-Sun
// lookup, so only the chosen method pays for it.
function directionContext(
  chart: StoredChart,
  targetDate: number,
  nodeType: NodeType,
) {
  const birthJD = birthDataToJD(chart);
  const eps = obliquity(birthJD);
  // The directed BASE: a composite chart directs its midpoint positions, not
  // the real sky behind its frame-anchor moment. (Directed/progressed modes
  // are currently OFF the menu for composites — COMPOSITE_BLOCKED_OVERLAYS —
  // so this branch is anticipatory. If ever unblocked, note the shift helpers
  // rebuild equatorial geometry from the directed point / shifted RA, so a
  // zero-arc composite ring approximates rather than reproduces the base
  // chart's mean-ra/dec geometry.)
  const real = getPlanetPositions(birthJD, nodeType);
  const natal = chart.composite
    ? compositeEquatorial(chart.composite, nodeType)
    : real;
  const years = (epochMsToJD(targetDate) - birthJD) / TROPICAL_YEAR_DAYS;
  const progressedJD = birthJD + years;
  const natalGMST = gmstRadians(birthJD);
  // Solar arc measured in ecliptic longitude vs in right ascension. The arc is
  // ALWAYS the real Sun's day-for-a-year travel from the chart's stored moment
  // — for a composite that keeps arc(birth) = 0 and ~1°/yr thereafter (the
  // composite Sun is a midpoint, not a moving body to progress against).
  // Look the Sun up BY NAME rather than trusting array order — the position
  // list drops bodies that lack data, so an index would silently misread.
  const sunOf = (list: PlanetPosition[]) => list.find((p) => p.name === 'Sun') ?? list[0];
  const natalSun = sunOf(real);
  const arcLong = () => {
    const s = sunOf(getPlanetPositions(progressedJD, nodeType));
    return normalizeAngle(
      raDecToEclipticLon(s.ra, s.dec, eps) -
        raDecToEclipticLon(natalSun.ra, natalSun.dec, eps),
    );
  };
  const arcRA = () =>
    normalizeAngle(sunOf(getPlanetPositions(progressedJD, nodeType)).ra - natalSun.ra);
  // Advance the MC's ecliptic longitude by Δλ and return the matching RAMC (gmst).
  // eclipticToRaDec(eclipticLonOfRA(g),0).ra round-trips to g, so Δλ=0 ⇒ natalGMST.
  const ramcOfLong = (dLon: number) =>
    eclipticToRaDec(eclipticLonOfRA(natalGMST, eps) + dLon, 0, eps).ra;
  return { birthJD, eps, natal, years, progressedJD, natalGMST, arcLong, arcRA, ramcOfLong };
}

export function buildOverlay(
  chart: StoredChart,
  mode: OverlayKind,
  targetDate: number, // epoch ms UTC; ignored for synastry
  partner: StoredChart | null,
  nodeType: NodeType = 'mean',
  angleProgression: AngleProgression = 'mean-quotidian',
  primaryRate: PrimaryRate = 'ptolemy',
  userPrimaryRate = 1,
  transitFrame: TransitFrame = 'relative-to-natal',
  progressionType: ProgressionType = 'secondary',
  t: TFn,
): OverlayLayer | null {
  switch (mode) {
    case 'transits': {
      const jd = epochMsToJD(targetDate);
      // Default 'relative-to-natal': frame the transiting planets against the NATAL
      // RAMC (the birth chart's angular framework), so the lines move only with the
      // planets' zodiacal motion. 'transit-moment' uses the transit instant's own
      // sidereal time (standard transit ACG). See TransitFrame. Positions are always
      // the real transiting positions at the target date.
      const gmst =
        transitFrame === 'relative-to-natal'
          ? gmstRadians(birthDataToJD(chart))
          : gmstRadians(jd);
      return {
        kind: mode,
        // The nub already shows "Transits" as the mode name — no readout needed.
        measure: null,
        labelFull: t('timeline.labelFull.transits', {
          datetime: fmtDateTimeUTC(targetDate),
        }),
        jd,
        positions: getPlanetPositions(jd, nodeType),
        gmst,
        originLat: chart.birthplace.lat,
        originLng: chart.birthplace.lng,
      };
    }
    case 'progressed':
    case 'tertiary-progressed': {
      // Mode is the source of truth for the day-clock: 'tertiary-progressed' is the
      // tertiary hand. The legacy progressionType param is still honoured (tests /
      // back-compat callers that pass 'tertiary' with the 'progressed' mode).
      const isTertiary =
        mode === 'tertiary-progressed' || progressionType === 'tertiary';
      const c = directionContext(chart, targetDate, nodeType);
      const naibodArc = (NAIBOD_DEG_PER_YR * c.years * Math.PI) / 180;
      // The planets progress via day-for-a-year; the angle method chooses how the
      // RAMC (gmst) is framed. DEFAULT is relative-to-natal: the progressed planets
      // plotted against the NATAL RAMC (consistent with the transit / solar-arc /
      // primary overlays). The sa-/naibod- options instead advance the natal RAMC by
      // the arc; the true quotidian progressed sidereal time — gmstRadians(progressedJD)
      // — can be re-exposed as its own option when the angle-frame UI toggle is built.
      // The map frame (gmst) and the bi-wheel's angle marks (angleArc/angleFrame,
      // applied to the relocated NATAL angles via angleJd below by ephemeris.
      // directedAngles) advance by the same arc in the same frame, so wheel and map
      // always agree. The Natal Frame default leaves both untouched.
      let gmst: number;
      let angleArc: number | undefined;
      let angleFrame: 'long' | 'ramc' | undefined;
      switch (angleProgression) {
        case 'naibod-ra':
          gmst = norm2pi(c.natalGMST + naibodArc);
          angleArc = naibodArc;
          angleFrame = 'ramc';
          break;
        case 'sa-ra': {
          const arc = c.arcRA();
          gmst = norm2pi(c.natalGMST + arc);
          angleArc = arc;
          angleFrame = 'ramc';
          break;
        }
        case 'sa-long': {
          const arc = c.arcLong();
          gmst = c.ramcOfLong(arc);
          angleArc = arc;
          angleFrame = 'long';
          break;
        }
        case 'naibod-long':
          gmst = c.ramcOfLong(naibodArc);
          angleArc = naibodArc;
          angleFrame = 'long';
          break;
        case 'mean-quotidian':
        default:
          gmst = c.natalGMST; // Natal Frame (default): angles stay natal
          break;
      }
      // Tertiary swaps only the symbolic clock (day per tropical month instead
      // of day per year); the angle-method arcs above stay defined by the
      // secondary-progressed Sun, the conventional reading for solar arcs, and
      // the default (natal) framing is untouched either way.
      const progJD =
        isTertiary
          ? c.birthJD + (epochMsToJD(targetDate) - c.birthJD) / TROPICAL_MONTH_DAYS
          : c.progressedJD;
      return {
        kind: mode,
        measure: t('timeline.measure.progressedAge', { years: c.years.toFixed(1) }),
        labelFull: t(
          isTertiary
            ? 'timeline.labelFull.tertiary-progressed'
            : 'timeline.labelFull.progressed',
          { years: c.years.toFixed(1) },
        ),
        jd: progJD,
        positions: getPlanetPositions(progJD, nodeType),
        gmst,
        angleArc,
        angleFrame,
        angleJd: c.birthJD,
        originLat: chart.birthplace.lat,
        originLng: chart.birthplace.lng,
      };
    }
    case 'solar-arc': {
      const c = directionContext(chart, targetDate, nodeType);
      const naibodArc = (NAIBOD_DEG_PER_YR * c.years * Math.PI) / 180;
      // Every natal body is advanced by the arc (and, via the natal gmst, the
      // angles too), so directed MC = natal MC + arc. The method picks the arc's
      // source (true solar arc vs Naibod's mean rate) and frame (longitude vs RA).
      // Mean Quotidian has no native solar-arc form → falls back to SA in longitude.
      let arc: number;
      let frame: 'long' | 'ra';
      switch (angleProgression) {
        case 'sa-ra':
          arc = c.arcRA();
          frame = 'ra';
          break;
        case 'naibod-long':
          arc = naibodArc;
          frame = 'long';
          break;
        case 'naibod-ra':
          arc = naibodArc;
          frame = 'ra';
          break;
        case 'sa-long':
        case 'mean-quotidian':
        default:
          arc = c.arcLong();
          frame = 'long';
          break;
      }
      // Bodies shift by the arc in `frame`; the bi-wheel angle marks advance by the same
      // arc — in longitude for 'long', and via RAMC + arc for 'ra' (an angle has no
      // declination to freeze, so it's re-derived from the advanced RAMC, not RA-shifted;
      // see ephemeris.directedAngles). directed MC/IC/As/Ds thus move with the planets.
      const positions =
        frame === 'ra'
          ? c.natal.map((p) => shiftRightAscension(p, arc))
          : c.natal.map((p) => shiftEclipticLongitude(p, arc, c.eps));
      return {
        kind: mode,
        // Just the arc angle next to the "Solar Arc" mode name (no "Sun" prefix).
        measure: `${((arc * 180) / Math.PI).toFixed(1)}°`,
        labelFull: t('timeline.labelFull.solar-arc', {
          deg: ((arc * 180) / Math.PI).toFixed(1),
        }),
        jd: c.birthJD,
        positions,
        gmst: c.natalGMST,
        angleArc: arc,
        angleFrame: frame === 'ra' ? 'ramc' : 'long',
        originLat: chart.birthplace.lat,
        originLng: chart.birthplace.lng,
      };
    }
    case 'primary-directions': {
      const c = directionContext(chart, targetDate, nodeType);
      const perYear = (degPerYr: number) => (degPerYr * c.years * Math.PI) / 180;
      // Primary directions rotate the chart rigidly by the arc. We direct the bodies
      // in RA (−arc, declination unchanged) against the natal frame: this draws the
      // SAME swept lines as advancing the RAMC by +arc would (the hour angle is
      // unchanged), and ALSO gives the bi-wheel real directed positions — advancing
      // only the frame left `positions` = natal, so the overlay ring mirrored the
      // natal one. The rate is the time-key (arc per year); positive arc directs
      // forward.
      let arc: number;
      switch (primaryRate) {
        case 'naibod':
          arc = perYear(NAIBOD_DEG_PER_YR);
          break;
        case 'cardan':
          arc = perYear(CARDAN_DEG_PER_YR);
          break;
        case 'kepler-ra':
          arc = perYear(solarDailyMotionRA(c.birthJD));
          break;
        case 'solar-long':
          arc = perYear(solarDailyMotionLong(c.birthJD, nodeType));
          break;
        case 'placidus-ra':
          arc = c.arcRA(); // true secondary-progressed solar arc in RA (nonlinear)
          break;
        case 'user':
          arc = perYear(Number.isFinite(userPrimaryRate) ? userPrimaryRate : 0);
          break;
        case 'ptolemy':
        default:
          arc = perYear(1);
          break;
      }
      const arcDeg = ((arc * 180) / Math.PI).toFixed(1);
      return {
        kind: mode,
        measure: `${arcDeg}°`,
        labelFull: t('timeline.labelFull.primary-directions', { deg: arcDeg }),
        jd: c.birthJD,
        positions: c.natal.map((p) => shiftRightAscension(p, -arc)),
        gmst: c.natalGMST,
        // The bodies ride a rigid −arc RA rotation (drawing the same map lines as RAMC+arc
        // would); the bi-wheel angle marks instead advance FORWARD via RAMC + arc — an angle
        // is fixed by the RAMC, so the directed MC advances ~1°/yr (see directedAngles).
        angleArc: arc,
        angleFrame: 'ramc',
        originLat: chart.birthplace.lat,
        originLng: chart.birthplace.lng,
      };
    }
    case 'cyclo': {
      // Cyclo*carto*graphy (Solar Fire's CCG): one line-set mixing the
      // secondary-PROGRESSED personal planets with the TRANSITING societal/outer
      // bodies — the inners' day-for-a-year pace keeps them readable next to the
      // outers' real-time motion. Both sets are framed against the NATAL RAMC
      // (a 'transit-moment' frame is ill-defined across two instants), so the
      // map shows where the combined sky falls through the birth chart's angles.
      const c = directionContext(chart, targetDate, nodeType);
      const jd = epochMsToJD(targetDate);
      const progressed = getPlanetPositions(c.progressedJD, nodeType);
      const bodyJd: Partial<Record<PlanetName, number>> = {};
      const positions = getPlanetPositions(jd, nodeType).map((p) => {
        if (!CYCLO_PROGRESSED.has(p.name)) return p;
        bodyJd[p.name] = c.progressedJD;
        return progressed.find((q) => q.name === p.name) ?? p;
      });
      return {
        kind: mode,
        measure: t('timeline.measure.progressedAge', { years: c.years.toFixed(1) }),
        labelFull: t('timeline.labelFull.cyclo', {
          datetime: fmtDateTimeUTC(targetDate),
        }),
        // The transit instant; the progressed inners' bi-wheel longitudes read
        // through this epoch's obliquity, an arcsecond-scale shrug. Their
        // sidereal readouts do NOT shrug — bodyJd carries each progressed
        // body's own epoch so the ayanamsa matches the Progressed overlay's.
        jd,
        positions,
        gmst: c.natalGMST,
        bodyJd,
        originLat: chart.birthplace.lat,
        originLng: chart.birthplace.lng,
      };
    }
    case 'synastry': {
      if (!partner) return null;
      // A composite partner overlays its midpoint positions; its frame is the
      // live MC-midpoint solve (not the stored minute), which gmst/obliquity
      // below read normally. Any other partner uses its own moment.
      const pjd = partner.composite
        ? solveCompositeFrameJd(partner.composite)
        : birthDataToJD(partner);
      const positions = partner.composite
        ? compositeEquatorial(partner.composite, nodeType)
        : getPlanetPositions(pjd, nodeType);
      return {
        kind: mode,
        measure: null,
        labelFull: t('timeline.labelFull.synastry', { partner: partner.name }),
        jd: pjd,
        positions,
        gmst: gmstRadians(pjd),
        originLat: partner.birthplace.lat,
        originLng: partner.birthplace.lng,
      };
    }
    case 'eclipses': {
      // The Eclipses overlay's optional "eclipse chart lines": the sky at the
      // eclipse maximum (App passes that instant in the targetDate slot). The
      // frame is ALWAYS the moment's own sidereal time — the eclipse path is a
      // geographic fact at one instant, and only the same-instant framing puts
      // the Sun/Moon conjunction's MC line through the path itself, so the
      // transit overlay's relative-to-natal positioning setting does not apply.
      const jd = epochMsToJD(targetDate);
      return {
        kind: mode,
        measure: null,
        labelFull: t('timeline.labelFull.eclipses', {
          datetime: fmtDateTimeUTC(targetDate),
        }),
        jd,
        positions: getPlanetPositions(jd, nodeType),
        gmst: gmstRadians(jd),
        originLat: chart.birthplace.lat,
        originLng: chart.birthplace.lng,
      };
    }
  }
}

// Two-letter tag per overlay kind, shown on the map ahead of the glyph + angle
// code so overlay lines read e.g. "Tr ♂ MC". Tr transits · Sp secondary
// progressions · Tp tertiary progressions · Sa solar arc · Sy synastry · Ec eclipse
// chart. Cyclo is the exception: its features carry per-body SOURCE tags (cycloBodyTag
// — Sp/Tr) rather than this mode prefix; it draws no parans or midpoint lines, so its
// 'Cy' entry here is retained only for Record completeness and is applied to no feature.
export const OVERLAY_LABEL_PREFIX: Record<OverlayKind, string> = {
  transits: 'Tr',
  progressed: 'Sp',
  'tertiary-progressed': 'Tp',
  'solar-arc': 'Sa',
  'primary-directions': 'Pd',
  cyclo: 'Cy',
  synastry: 'Sy',
  eclipses: 'Ec',
};

// Clone a line/paran FeatureCollection, stamping the overlay tag onto each feature.
// `tag` is the clean signal the edge badges read for the label prefix (kept separate
// from natal-vs-overlay routing); `label` is also set to it, since the overlay line
// hover tip reads the tag from `label`.
export function tagLabels<P extends { label: string; tag?: string }>(
  fc: FeatureCollection<LineString, P>,
  tag: string,
): FeatureCollection<LineString, P> {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({
      ...f,
      properties: { ...f.properties, tag, label: tag },
    })),
  };
}

// Per-feature variant for a layer whose features have MIXED sources (cyclo):
// the resolver sees each feature's properties and names its tag.
export function tagLabelsBy<P extends { label: string; tag?: string }>(
  fc: FeatureCollection<LineString, P>,
  tagFor: (props: P) => string,
): FeatureCollection<LineString, P> {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => {
      const tag = tagFor(f.properties);
      return { ...f, properties: { ...f.properties, tag, label: tag } };
    }),
  };
}
