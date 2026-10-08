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
import type { FeatureCollection, Geometry, LineString, Point } from 'geojson';
import {
  birthDataToJD,
  eclipticLonOfRA,
  eclipticToRaDec,
  getMinorSamples,
  getPlanetPositions,
  gmstRadians,
  minorLinePositionOf,
  obliquity,
  projectMinorOntoEcliptic,
  raDecToEclipticLat,
  raDecToEclipticLon,
  shiftEclipticLongitude,
  shiftMinorEclipticLongitude,
  shiftMinorRightAscension,
  shiftRightAscension,
  solarDailyMotionLong,
  solarDailyMotionRA,
  type CoordSystem,
  type DirectedMinor,
  type LineSystem,
  type MinorPosition,
  type MinorSample,
  type NodeType,
  type PlanetName,
  type PlanetPosition,
} from '../ephemeris';
import type { CompositeParents, StoredChart } from '../chartLibrary';
import { skyHeldFor } from '../skyHold';
import { compositeEquatorial, compositeMinorSamples, solveCompositeFrameJd } from './composite';
import { meridianLngFor, type LineType, type MeridianLng } from './lines';
import {
  generateMinorLines,
  generateMinorZenith,
  type MinorDecor,
  type MinorLineProps,
  type MinorZenithProps,
} from './minorLines';
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

// The overlay modes that scrub a moving date — transits + the symbolic clocks. These
// are the modes that render the timeline bar (and its display drawer, whose toggles
// claim hotkeys while it's up); synastry and eclipses have no date to scrub.
export const TIME_OVERLAY_MODES = new Set<OverlayMode>([
  'transits',
  'cyclo',
  'progressed',
  'tertiary-progressed',
  'solar-arc',
  'primary-directions',
]);

// The overlay modes that PARK while a registered surface owns the viewport
// (lib/extensions/viewLock): eclipses are pure map-ground geometry (track,
// limits, visibility hemisphere) and synastry is a two-chart comparison of the
// map itself — neither carries onto an owning surface. Their Overlay-menu rows
// HIDE and the 'o' cycle skips them while the lock holds, and the host's EFFECTIVE
// overlay reads an active one as 'off' meanwhile — masked, not written, so the
// reader's choice is back when the lock clears. (Until 2026-10-05 the owner wrote
// 'off' on mount; see App's overlayMode.)
export const VIEW_LOCK_PARKED_OVERLAYS = new Set<OverlayMode>([
  'eclipses',
  'synastry',
]);

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

// Overlay modes HELD on a geodetic map (lib/skyHold, 2026-10-02). Primary Directions
// move the map by advancing the RAMC — the sky turning over the place — and a geodetic
// map has no turning to advance. Every other overlay moves the PLANETS by degree and
// works there unchanged (lib/skyHold's clock test). Held like the chart blocks above:
// the row greys with the sky sentence, an active one reads 'off' while the map is
// geodetic, and the stored choice is kept for Celestial.
export const SKY_HELD_OVERLAYS = new Set<OverlayMode>(['primary-directions']);

/** WHICH block bars a mode, or null if none does. A menu that greys a row out owes the
 *  reader the reason — and the reasons are different things, not one blanket
 *  "unavailable": the first three are facts about the CHART, 'geodetic' is the MAP's
 *  line system (SKY_HELD_OVERLAYS). */
export type OverlayBlock = 'composite' | 'no-time' | 'davison' | 'geodetic';

/** Pass the EFFECTIVE line system (App.tsx's derived `lineSystem`, `ctx.lineSystem`);
 *  omitted, it reads as Celestial and holds nothing on the map's account. */
export function overlayBlockFor(
  chart: { composite?: unknown; timeKnown?: boolean; tag?: string } | null,
  lineSystem: LineSystem = 'celestial',
): (mode: OverlayMode) => OverlayBlock | null {
  const held = skyHeldFor(lineSystem);
  if (!chart) return (mode) => (held && SKY_HELD_OVERLAYS.has(mode) ? 'geodetic' : null);
  const composite = !!chart.composite;
  const noTime = chart.timeKnown === false;
  // A Davison is a locally-generated relationship chart: real natal math (so no
  // `composite` payload) but system-tagged 'space' by the relationship generator.
  // You can't add a partner to a chart that is already a two-person relationship
  // chart, so Synastry is barred on it — the same reason a composite bars it.
  const davison = !composite && chart.tag === 'space';
  return (mode) => {
    if (composite && COMPOSITE_BLOCKED_OVERLAYS.has(mode)) return 'composite';
    if (noTime && TIME_UNKNOWN_BLOCKED_OVERLAYS.has(mode)) return 'no-time';
    if (davison && mode === 'synastry') return 'davison';
    // The chart's own blocks outrank the map's: the geodetic reason names a setting
    // to change, and on a chart that bars the mode anyway that fix would be false.
    if (held && SKY_HELD_OVERLAYS.has(mode)) return 'geodetic';
    return null;
  };
}

/** The overlay modes a given chart cannot carry on the given map. The one predicate
 *  behind the Overlay menu, the 'o' cycle, and the effective overlay mode, so they can
 *  never disagree — which holds only while every caller passes the same EFFECTIVE line
 *  system. Callers that want to SAY why should use `overlayBlockFor` instead. */
export function overlayBlockedFor(
  chart: { composite?: unknown; timeKnown?: boolean; tag?: string } | null,
  lineSystem: LineSystem = 'celestial',
): (mode: OverlayMode) => boolean {
  const reason = overlayBlockFor(chart, lineSystem);
  return (mode) => reason(mode) !== null;
}

// The auxiliary line families that derive from a chart's body set (as opposed to
// the primary angle lines): aspect-to-angle lines, midpoint lines, paran lines,
// and fixed-star lines.
export type AuxFamily = 'aspect' | 'midpoint' | 'paran' | 'star';

// Which auxiliary families an overlay does not draw OF ITS OWN. Cyclocartography's
// "sky" stitches two instants together (progressed personal planets + transiting
// outers), so any construct that needs a single simultaneous moment breaks —
//   · a paran is two bodies angular at ONE moment; across two epochs no such
//     moment exists, so paran rows would be meaningless.
//   · a midpoint collapses two bodies into ONE point; averaging a progressed and
//     a transiting position joins two epochs into a single place — incoherent.
// Aspect-to-angle and star lines stay allowed: each is a PER-BODY construct (a
// body's own position aspecting/marking an angle) needing no cross-body
// simultaneity, so each Cyclo body stands on its own well-defined position.
//
// PARANS are not drawn for ANY time overlay (2026-10-06, Salvatore). Parans are read
// from a chart: the natal one (which stays on the map beside an overlay), a synastry
// partner's, an eclipse's. Of the time overlays, none has a paran reading of its own:
//   · Primary directions, and solar arc applied in right ascension (true or Naibod),
//     turn the natal set rigidly in RA — every RA gap and declination is kept, so
//     every paran latitude is the NATAL one, exactly (all 410 rows of a test chart
//     on their natal twins to 0.000°). Drawn beside the chart's, each row twice.
//   · A transit sky's parans are that day's sky, the same for everyone on Earth;
//     what an astrologer times with parans is a transit angular WITH a natal body,
//     which these are not. Progressed and longitude-directed sets have no
//     established paran reading either.
// A reader with Transits on took the transit sky's rows for her natal parans and
// compared them with another program's (the report behind seam L23's addendum).
// Synastry (the partner's own parans) and Eclipses (an opt-in) keep theirs.
export const AUX_BLOCKED_OVERLAYS: Record<AuxFamily, ReadonlySet<OverlayMode>> = {
  aspect: new Set<OverlayMode>(),
  midpoint: new Set<OverlayMode>(['cyclo']),
  paran: TIME_OVERLAY_MODES,
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
  | 'mean-quotidian'; // natal frame: angles hold the natal RAMC (historical storage key)

/** The four real CALCULATIONS, without the natal-frame member.
 *
 *  'mean-quotidian' was never a fifth calculation — it is a frame answer that had been
 *  living in a calculation menu. On the progressed overlays it means "don't advance the
 *  angles at all", which is now the `Angles` control's other segment; on Solar Arc it has
 *  no distinct form and falls through to `sa-long` (see solarArcChoice), so the menu
 *  carried two entries with identical output and no way to explain the difference.
 *
 *  It stays in AngleProgression above, which is the value the overlay builder and every
 *  downstream consumer read: what changed is which UI can produce it, not what it means. */
export type ArcMethod = Exclude<AngleProgression, 'mean-quotidian'>;

/** Whether a progressed overlay's ANGLES advance, or hold the birth chart's. The
 *  calculation (ArcMethod) only comes into it once they do. */
export type ProgAngleFrame = 'natal' | 'progressed';

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

// The tertiary clock: one ephemeris day per tropical month of life. See returns.ts,
// where the same number is the lunar-return interval — a different concept that must
// not be unified with this one.
const TROPICAL_MONTH_DAYS = 27.321582;

// How the TRANSIT overlay's angle lines are framed:
//  - 'relative-to-natal' (default): hold the natal chart's RAMC fixed and let the
//    transiting planets fall through it — the lines reflect the planets' zodiacal
//    (secondary) motion, drifting slowly day to day. This is the radix-relative map,
//    and it is the DEFAULT on the judgement that it is the more intuitive first map
//    for a reader who has come here to ask where to live: it holds still enough to be
//    read across a season, where the moment's own frame sweeps ~15° an hour and only
//    means anything at an instant deliberately chosen. (It was justified here as "the
//    Solar Maps-style transit map this app's astrologers work with" until August 2026.
//    That does not survive measurement: Astro Gold is Esoteric Technologies — the Solar
//    Fire and Solar Maps house — and it draws the moment's frame. Two independent
//    programs draw the moment's frame and we are the outlier. The default is still
//    right; the reason had to change. See overlayPrefs.ts, which already said this.)
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
   *  "Solar Arc · 30.2°" or "Transits · 2026-05-10 14:30 (UTC)". */
  labelFull: string;
  /** The overlay's target instant as "YYYY-MM-DD HH:MM" (UTC), for surfaces that want the
   *  raw date/time without the timeline bar in view (the expanded wheel's overlay caption).
   *  null for synastry, which has no single instant. */
  moment: string | null;
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
  /** HOW this layer placed its bodies — recorded so the catalog minor bodies can be
   *  placed by the same rule beside it (overlayMinorSamples), switching on the rule
   *  rather than restating each mode's logic. Every case of buildOverlay sets it. */
  bodyRule: OverlayBodyRule;
}

/**
 * How an overlay layer's bodies were placed, as a rule another family of bodies can
 * follow. Four, because every overlay mode reduces to one of them:
 *  - `sample`: the sky at one instant — transits and eclipses (the target), the
 *    progressed overlays (their progressed instant), synastry (the partner's moment),
 *    and Cyclo's transiting side (the target);
 *  - `shift-long`: the birth sky directed by one arc in ecliptic longitude, at `eps`
 *    (solar arc and Naibod in longitude);
 *  - `shift-ra`: the birth sky directed by one arc in right ascension (solar arc and
 *    Naibod in RA; primary directions, whose bodies move by −arc — see buildOverlay);
 *  - `composite`: a composite partner's midpoints.
 * `baseJd` is the birth moment the directed rules shift FROM.
 */
export type OverlayBodyRule =
  | { by: 'sample'; jd: number }
  | { by: 'shift-long'; baseJd: number; arc: number; eps: number }
  | { by: 'shift-ra'; baseJd: number; arc: number }
  | { by: 'composite'; parents: CompositeParents };

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
/**
 * The natal-invariant half of a directed/progressed frame, plus that frame's arcs as
 * functions of a TRIAL instant.
 *
 * Split this way because two kinds of caller want opposite shapes. Drawing an overlay
 * asks about ONE instant — the cursor — and wants every body at once. Solving for the
 * instant a body reaches a given longitude asks about one body at thousands of trial
 * times, inside a bisection, and cannot afford to rebuild the natal set per probe.
 *
 * So everything independent of the trial time is computed once here, and the rest are
 * functions of `jd`. Both kinds of caller then read the SAME arithmetic — which is the
 * point: a change of convention cannot reach one and silently miss the other.
 */
export function directedBase(chart: StoredChart, nodeType: NodeType) {
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
  const yearsAt = (jd: number) => (jd - birthJD) / TROPICAL_YEAR_DAYS;
  const progressedJDAt = (jd: number) => birthJD + yearsAt(jd);
  const natalGMST = gmstRadians(birthJD);
  // Solar arc measured in ecliptic longitude vs in right ascension. The arc is
  // ALWAYS the real Sun's day-for-a-year travel from the chart's stored moment
  // — for a composite that keeps arc(birth) = 0 and ~1°/yr thereafter (the
  // composite Sun is a midpoint, not a moving body to progress against).
  // Look the Sun up BY NAME rather than trusting array order — the position
  // list drops bodies that lack data, so an index would silently misread.
  const sunOf = (list: PlanetPosition[]) => list.find((p) => p.name === 'Sun') ?? list[0];
  const natalSun = sunOf(real);
  // The Sun's travel from birth to a PROGRESSED instant, in both measures. Keyed on
  // the progressed instant rather than the target date, because which symbolic clock
  // produced it is not this function's business — the tertiary hand reaches a different
  // instant from the secondary hand and both are asked the same question here.
  //
  // Memoized: a scan marches every body over the SAME grid of times, so each sample's
  // Sun is solved once however many bodies ask for it.
  const sunMemo = new Map<number, { long: number; ra: number }>();
  const arcsAtProgressedJD = (progJD: number) => {
    let v = sunMemo.get(progJD);
    if (v === undefined) {
      const s = sunOf(getPlanetPositions(progJD, nodeType));
      v = {
        long: normalizeAngle(
          raDecToEclipticLon(s.ra, s.dec, eps) -
            raDecToEclipticLon(natalSun.ra, natalSun.dec, eps),
        ),
        ra: normalizeAngle(s.ra - natalSun.ra),
      };
      sunMemo.set(progJD, v);
    }
    return v;
  };
  /** Naibod's mean rate over the same interval: 0.985647° per progressed DAY. For the
   *  secondary clock a progressed day IS a year of life, which is why this reads as
   *  °/year there; on the tertiary clock it is the same rate over the tertiary
   *  interval, which is what keeps one overlay on one instant.
   *
   *  WRAPPED, like the true arc beside it. The tertiary hand covers ~1139 progressed
   *  days by age 85 — over three full turns of mean solar motion — and an arc is a
   *  rotation, so only its residue means anything. Leaving it unwrapped still drew the
   *  right map (every consumer normalises eventually) but reported `angleArc` as
   *  1122.86°, which is the number a reader would be shown. On the secondary clock
   *  nothing wraps before age 365, which is why this never mattered until now. */
  const naibodArcTo = (progJD: number) =>
    normalizeAngle(((progJD - birthJD) * NAIBOD_DEG_PER_YR * Math.PI) / 180);
  const arcsAt = (jd: number) => arcsAtProgressedJD(progressedJDAt(jd));
  const arcLongAt = (jd: number) => arcsAt(jd).long;
  const arcRAAt = (jd: number) => arcsAt(jd).ra;
  // Advance the MC's ecliptic longitude by Δλ and return the matching frame, as a
  // GREENWICH sidereal time — which is what every consumer of `gmst` expects.
  //
  // The advance has to be worked at the CHART'S OWN meridian, not at Greenwich. An arc
  // carried in right ascension is a rigid rotation of the sphere: advance the RAMC at
  // any meridian and every other meridian advances by the same amount, so for the
  // `-ra` methods the anchor is a free choice and Greenwich is as good as anywhere. A
  // LONGITUDE arc is not rigid. "Add Δλ to the culminating degree" gives a different RA
  // advance at every meridian, because the ecliptic-to-equator map is nonlinear — so
  // there is no one global frame that satisfies it everywhere, and the anchor decides
  // which single meridian it IS satisfied at. Greenwich is the one meridian with no
  // claim to it: the resulting frame did not culminate the MC the wheel prints and two
  // other programs corroborate. Measured 3.74° out at Yonkers on the Jim Lewis chart,
  // and up to ~8° elsewhere, varying with the chart's own longitude — which is what
  // made it look like a moving target rather than a constant offset.
  //
  // Corrects docs/calculation-methods.md, "Angles anchored to Greenwich", which stated
  // the free half of this as though it covered both. (Lina's defect 2, 24 Aug 2026.)
  //
  // eclipticToRaDec(eclipticLonOfRA(g),0).ra round-trips to g, so Δλ=0 ⇒ natalGMST
  // still holds exactly: the two birthLng terms cancel.
  const birthLng = (chart.birthplace.lng * Math.PI) / 180;
  const ramcOfLong = (dLon: number) =>
    norm2pi(
      eclipticToRaDec(eclipticLonOfRA(natalGMST + birthLng, eps) + dLon, 0, eps).ra - birthLng,
    );
  return {
    birthJD, eps, natal, natalGMST, natalSun,
    yearsAt, progressedJDAt, arcLongAt, arcRAAt, ramcOfLong,
    arcsAtProgressedJD, naibodArcTo,
  };
}
export type DirectedBase = ReturnType<typeof directedBase>;

/** The same frame bound to ONE instant — the shape the overlay builder wants. */
function directionContext(chart: StoredChart, targetDate: number, nodeType: NodeType) {
  const b = directedBase(chart, nodeType);
  const jd = epochMsToJD(targetDate);
  return {
    ...b,
    years: b.yearsAt(jd),
    progressedJD: b.progressedJDAt(jd),
    arcLong: () => b.arcLongAt(jd),
    arcRA: () => b.arcRAAt(jd),
  };
}

// ── The two arc tables ────────────────────────────────────────────────────────
// These are the ONE statement of what each dropdown value means. They are pure and
// exported so that every consumer — whoever draws a frame at the cursor, and whoever
// solves for the instant a body arrives somewhere — selects from the same table
// instead of restating it. A restated switch is the failure this prevents: it agrees
// on the day it is written and nothing checks it afterwards.

/** How a solar-arc method sources its arc, and the coordinate it is applied in. */
export type SolarArcChoice = { source: 'true' | 'naibod'; frame: 'long' | 'ra' };

/** Mean Quotidian ("Natal Frame") has no native solar-arc form, so it falls back to
 *  SA in longitude — which makes those two options produce identical directed BODIES,
 *  differing only in how the frame itself is drawn. */
export function solarArcChoice(angleProgression: AngleProgression): SolarArcChoice {
  switch (angleProgression) {
    case 'sa-ra':
      return { source: 'true', frame: 'ra' };
    case 'naibod-long':
      return { source: 'naibod', frame: 'long' };
    case 'naibod-ra':
      return { source: 'naibod', frame: 'ra' };
    case 'sa-long':
    case 'mean-quotidian':
    default:
      return { source: 'true', frame: 'long' };
  }
}

/** The solar arc at `jd` under `choice` (radians). */
export function solarArcAt(base: DirectedBase, choice: SolarArcChoice, jd: number): number {
  if (choice.source === 'naibod') {
    return (base.yearsAt(jd) * NAIBOD_DEG_PER_YR * Math.PI) / 180;
  }
  return choice.frame === 'ra' ? base.arcRAAt(jd) : base.arcLongAt(jd);
}

/** A primary-direction time-key. `trueArcRA` marks the one nonlinear rate (the real
 *  secondary-progressed solar arc in RA); `degPerYear` is then only a nominal pace,
 *  useful for sizing a scan's step but not for computing the arc. */
export type PrimaryArcPlan = { degPerYear: number; trueArcRA: boolean };

export function primaryArcPlan(
  primaryRate: PrimaryRate,
  userPrimaryRate: number,
  base: DirectedBase,
  nodeType: NodeType,
): PrimaryArcPlan {
  switch (primaryRate) {
    case 'naibod':
      return { degPerYear: NAIBOD_DEG_PER_YR, trueArcRA: false };
    case 'cardan':
      return { degPerYear: CARDAN_DEG_PER_YR, trueArcRA: false };
    case 'kepler-ra':
      return { degPerYear: solarDailyMotionRA(base.birthJD), trueArcRA: false };
    case 'solar-long':
      return { degPerYear: solarDailyMotionLong(base.birthJD, nodeType), trueArcRA: false };
    case 'placidus-ra':
      return { degPerYear: 1.1, trueArcRA: true };
    case 'user':
      return {
        degPerYear: Number.isFinite(userPrimaryRate) ? userPrimaryRate : 0,
        trueArcRA: false,
      };
    case 'ptolemy':
    default:
      return { degPerYear: 1, trueArcRA: false };
  }
}

/** The primary-direction arc at `jd` (radians), positive = directed forward. */
export function primaryArcAt(base: DirectedBase, plan: PrimaryArcPlan, jd: number): number {
  return plan.trueArcRA
    ? base.arcRAAt(jd)
    : (base.yearsAt(jd) * plan.degPerYear * Math.PI) / 180;
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
  // The overlay's instant, formatted once for any caption that wants the date/time on its
  // own (the expanded wheel shows it beside the overlay name). Synastry has no instant.
  const moment = mode === 'synastry' ? null : fmtDateTimeUTC(targetDate);
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
        moment,
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
        bodyRule: { by: 'sample', jd },
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
      // THE overlay's instant — one per overlay, computed before anything reads it.
      // The tertiary hand runs a day per tropical month, the secondary a day per
      // tropical year; the bodies are read AT this instant and the angle arc is
      // measured TO it. Until 2026-08-24 the arc was computed above this line, from
      // the secondary clock, so a tertiary chart carried tertiary bodies against
      // secondary angles — two clocks inside one overlay, and tertiary angles that
      // were identical to secondary ones at the same date. Solar Fire and Sirius both
      // put this chart's tertiary angles on the tertiary instant, and Lina ruled with
      // them (24 Aug 2026): within one overlay, bodies and angles derive from one
      // instant. Secondary already satisfied it; this is what makes tertiary do so.
      const progJD =
        isTertiary
          ? c.birthJD + (epochMsToJD(targetDate) - c.birthJD) / TROPICAL_MONTH_DAYS
          : c.progressedJD;
      const arcs = c.arcsAtProgressedJD(progJD);
      const naibodArc = c.naibodArcTo(progJD);
      // The planets progress via day-for-a-year; the angle method chooses how the
      // RAMC (gmst) is framed. DEFAULT is relative-to-natal: the progressed planets
      // plotted against the NATAL RAMC (consistent with the transit / solar-arc /
      // primary overlays). The sa-/naibod- options instead advance the natal RAMC by
      // the arc; the true quotidian progressed sidereal time — gmstRadians(progressedJD)
      // — can be re-exposed as its own option when the angle-frame UI toggle is built.
      // The map frame (gmst) and the bi-wheel's angle marks (angleArc/angleFrame,
      // applied to the relocated NATAL angles via angleJd below by ephemeris.
      // directedAngles) advance by the same arc in the same frame. Under the `-ra`
      // methods that makes them agree exactly, at every pin — an RA arc is a rigid
      // rotation. Under the `-long` methods they agree at the CHART'S OWN meridian and
      // part by a bounded amount as the pin moves away from it (a few degrees, peaking
      // near ±90° of RA from the birth meridian), because a longitude arc is not a
      // rigid rotation and no single global frame can satisfy it everywhere. That
      // residual is intrinsic to the method, not a bug to chase — see ramcOfLong.
      // The Natal Frame default leaves both untouched.
      let gmst: number;
      let angleArc: number | undefined;
      let angleFrame: 'long' | 'ramc' | undefined;
      switch (angleProgression) {
        case 'naibod-ra':
          gmst = norm2pi(c.natalGMST + naibodArc);
          angleArc = naibodArc;
          angleFrame = 'ramc';
          break;
        case 'sa-ra':
          gmst = norm2pi(c.natalGMST + arcs.ra);
          angleArc = arcs.ra;
          angleFrame = 'ramc';
          break;
        case 'sa-long':
          gmst = c.ramcOfLong(arcs.long);
          angleArc = arcs.long;
          angleFrame = 'long';
          break;
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
      // `progJD` and the arcs are both established above the switch — see the note
      // there. The default (natal) framing is untouched on either clock.
      return {
        kind: mode,
        moment,
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
        bodyRule: { by: 'sample', jd: progJD },
      };
    }
    case 'solar-arc': {
      const c = directionContext(chart, targetDate, nodeType);
      // Every natal body is advanced by the arc (and, via the natal gmst, the
      // angles too), so directed MC = natal MC + arc. The method picks the arc's
      // source (true solar arc vs Naibod's mean rate) and frame (longitude vs RA).
      // Mean Quotidian has no native solar-arc form → falls back to SA in longitude.
      const choice = solarArcChoice(angleProgression);
      const arc = solarArcAt(c, choice, epochMsToJD(targetDate));
      const frame = choice.frame;
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
        moment,
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
        bodyRule:
          frame === 'ra'
            ? { by: 'shift-ra', baseJd: c.birthJD, arc }
            : { by: 'shift-long', baseJd: c.birthJD, arc, eps: c.eps },
      };
    }
    case 'primary-directions': {
      const c = directionContext(chart, targetDate, nodeType);
      // Primary directions rotate the chart rigidly by the arc. We direct the bodies
      // in RA (−arc, declination unchanged) against the natal frame: this draws the
      // SAME swept lines as advancing the RAMC by +arc would (the hour angle is
      // unchanged), and ALSO gives the bi-wheel real directed positions — advancing
      // only the frame left `positions` = natal, so the overlay ring mirrored the
      // natal one. The rate is the time-key (arc per year); positive arc directs
      // forward.
      const arc = primaryArcAt(
        c,
        primaryArcPlan(primaryRate, userPrimaryRate, c, nodeType),
        epochMsToJD(targetDate),
      );
      const arcDeg = ((arc * 180) / Math.PI).toFixed(1);
      return {
        kind: mode,
        moment,
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
        // The bodies' own direction, −arc — not the angles' +arc above.
        bodyRule: { by: 'shift-ra', baseJd: c.birthJD, arc: -arc },
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
        moment,
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
        // Catalog bodies ride on the TRANSITING side: CYCLO_PROGRESSED is the five
        // personal planets, and everything else is read at the target.
        bodyRule: { by: 'sample', jd },
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
        moment,
        measure: null,
        labelFull: t('timeline.labelFull.synastry', { partner: partner.name }),
        jd: pjd,
        positions,
        gmst: gmstRadians(pjd),
        originLat: partner.birthplace.lat,
        originLng: partner.birthplace.lng,
        bodyRule: partner.composite
          ? { by: 'composite', parents: partner.composite }
          : { by: 'sample', jd: pjd },
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
        moment,
        measure: null,
        labelFull: t('timeline.labelFull.eclipses', {
          datetime: fmtDateTimeUTC(targetDate),
        }),
        jd,
        positions: getPlanetPositions(jd, nodeType),
        gmst: gmstRadians(jd),
        originLat: chart.birthplace.lat,
        originLng: chart.birthplace.lng,
        bodyRule: { by: 'sample', jd },
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

/** The overlay tag for catalog features — `tag` ONLY. Not tagLabels: that overwrites
 *  `label` with the tag, and the map keys a line's hover tip on `label`, so every
 *  overlay catalog line would share one popup id and a tip moved from one to the next
 *  would keep the first body's name. A catalog label already names its body
 *  ("Eros MC"); the tag rides beside it, as the edge chips read it. */
export function tagMinor<G extends Geometry, P extends { tag?: string }>(
  fc: FeatureCollection<G, P>,
  tag: string,
): FeatureCollection<G, P> {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({ ...f, properties: { ...f.properties, tag } })),
  };
}

// ── Catalog minor bodies beside an overlay ────────────────────────────────────
// The reader's list placed at the overlay's own instant (or by its own direction, or
// as a composite partner's midpoints), BESIDE buildOverlay rather than inside it. The
// layer records how it placed its bodies (bodyRule); the catalog set follows that rule,
// switching on the rule and never on the mode, so each mode's logic is written once.
//
// Kept off OverlayLayer on purpose. A file landing then never resamples the planets or
// rebuilds their lines; playback can defer the catalog set alone; and the callers that
// build an overlay for a FINISHED document (a report's bi-wheel, Discovery's frames)
// cannot pick up the reader's live list through it — a record must not read a live
// preference (L72's ruling).

/** A catalog body as an overlay places it — MinorSample's shape, with the two things a
 *  derived position changes: whether its ecliptic coordinates are of record, and
 *  whether it has a motion at all. */
export interface OverlayMinorSample {
  n: number;
  ra: number;
  dec: number;
  /** Tropical ecliptic longitude and latitude, radians — what the wheel places it by.
   *  Sampled: the engine's. Directed: derived from the directed ra/dec at the rule's
   *  obliquity, as toEclipticPositions derives the directed planets'. Midpoint: of
   *  record. */
  lon: number;
  lat: number;
  /** lon/lat are coordinates OF RECORD (a midpoint, or a midpoint directed in
   *  longitude): only then may a line position carry `lon` (minorLinePositionOf) — a
   *  derived one would move the In-Zodiaco lines (L72 check 5). */
  ofRecord: boolean;
  /** Ecliptic longitude motion, degrees/day. Present only on a sample of the sky;
   *  absent when directed or a midpoint, which have no motion of their own — the
   *  planets' overlay positions draw the same line (PlanetPosition.speed). */
  speed?: number;
}

/** The chart's own catalog samples and the instant they were taken at — what a
 *  directed rule shifts from. Direct samples, or a composite's midpoints. */
export interface NatalMinorSamples {
  jd: number;
  samples: readonly (MinorSample | OverlayMinorSample)[];
}

/**
 * The catalog bodies `numbers` placed by an overlay's rule. Pure apart from the engine
 * reads; bodies outermost wherever the engine is asked (the one numbered-asteroid file
 * slot — getMinorSamples, compositeMinorSamples).
 *
 * - `sample`: one sample per body at the rule's instant, without the station bracket —
 *   the overlay ring shows no station for the planets either (toEclipticPositions).
 * - `shift-long` / `shift-ra`: the natal sample directed by the planets' own helpers
 *   (shiftMinorEclipticLongitude / shiftMinorRightAscension). Only coordinates of record
 *   go in — a direct sample's lon/lat are derived and stay behind, exactly as the
 *   planets' natal positions carry none — so a catalog body and a planet at one ra/dec
 *   are directed to one place. `natal` is reused only when it was taken at the rule's
 *   base instant; otherwise (or with none) the bodies are sampled there, so a caller
 *   holding the wrong instant gets the right answer at the cost of the engine calls. A
 *   composite never carries a directed rule (COMPOSITE_BLOCKED_OVERLAYS); were one
 *   unblocked, its midpoint samples passed as `natal` are what keep it right.
 * - `composite`: compositeMinorSamples of the partner's parents.
 *
 * A body the rule can't place (its file doesn't reach the instant) drops out, as the
 * planets do.
 */
export function overlayMinorSamples(
  rule: OverlayBodyRule,
  numbers: readonly number[],
  natal: NatalMinorSamples | null,
): OverlayMinorSample[] {
  if (numbers.length === 0) return [];
  switch (rule.by) {
    case 'sample':
      return getMinorSamples(rule.jd, numbers).map((s) => ({ ...s, ofRecord: false }));
    case 'composite':
      return compositeMinorSamples(rule.parents, numbers);
    case 'shift-long':
    case 'shift-ra': {
      const base = natal && natal.jd === rule.baseJd ? natal.samples : getMinorSamples(rule.baseJd, numbers);
      const want = new Set(numbers);
      // The obliquity the planets' directed ring is read back at: toEclipticPositions at
      // the layer's jd, which for every directed mode is the birth moment.
      const eps = rule.by === 'shift-long' ? rule.eps : obliquity(rule.baseJd);
      const out: OverlayMinorSample[] = [];
      for (const s of base) {
        if (!want.has(s.n)) continue;
        const from: DirectedMinor =
          'ofRecord' in s && s.ofRecord
            ? { n: s.n, ra: s.ra, dec: s.dec, lon: s.lon, lat: s.lat }
            : { n: s.n, ra: s.ra, dec: s.dec };
        const d =
          rule.by === 'shift-long'
            ? shiftMinorEclipticLongitude(from, rule.arc, rule.eps)
            : shiftMinorRightAscension(from, rule.arc);
        out.push({
          n: s.n,
          ra: d.ra,
          dec: d.dec,
          lon: d.lon ?? raDecToEclipticLon(d.ra, d.dec, eps),
          lat: d.lat ?? raDecToEclipticLat(d.ra, d.dec, eps),
          ofRecord: d.lon !== undefined,
        });
      }
      return out;
    }
  }
}

/** What an overlay's catalog lines are drawn in — the SAME values the overlay's planet
 *  lines read (CLAUDE.md rule 5), so a caller passes App's derived settings, never the
 *  stored preferences. The meridian itself is not passed: it is the layer's own,
 *  derived below exactly as the overlay memos derive the planets'. */
export interface OverlayMinorFrame {
  /** The EFFECTIVE line system (App's derived `lineSystem`). */
  lineSystem: LineSystem;
  /** In Mundo or In Zodiaco; a geodetic map projects whatever this says, as the
   *  planets' overlay lines do. */
  coordSystem: CoordSystem;
  /** The Angles filter as drawn (App's derived `visibleLineTypes`). */
  visibleLineTypes: ReadonlySet<LineType>;
  /** Whether the overlay's zenith points are drawn at all — App's `effShowZenith`, the
   *  gate the overlay planets' stamps read. The MC filter is applied here, as
   *  filterZenith applies it to theirs. */
  zenith: boolean;
  /** Name, themed colour and sprite per body — the natal lines' own decoration. */
  decor: (n: number) => MinorDecor;
}

export interface OverlayMinorGeometry {
  /** The positions the lines were drawn from, in the overlay's frame — projected onto
   *  the ecliptic In Zodiaco and on a geodetic map. What an overlay paran set pairs. */
  positions: MinorPosition[];
  /** The overlay's meridian mapping: meridianLngFor(lineSystem, obliquity(layer.jd),
   *  layer.gmst), the overlay planets' own. */
  meridianLng: MeridianLng;
  /** Angle lines, Angles-filtered and tagged (tagMinor). */
  lines: FeatureCollection<LineString, MinorLineProps>;
  /** Zenith points, tagged; empty with zeniths off or the MC filtered out. */
  zenith: FeatureCollection<Point, MinorZenithProps>;
}

/**
 * An overlay's catalog lines from samples already taken — the geometry half of
 * buildOverlayMinorLines, for a caller that has to keep the sampling apart (App: the
 * window's rows read the samples, and the decoration reads the rows).
 *
 * Frame, projection and meridian are the overlay planets' own (App's overlay memo):
 * projected at the layer's jd, mapped through the layer's gmst at its obliquity. The
 * tag is the overlay's prefix — on Cyclo the transits' 'Tr', since catalog bodies ride
 * its transiting side (see the cyclo case of buildOverlay).
 */
export function overlayMinorLines(
  layer: OverlayLayer,
  samples: readonly OverlayMinorSample[],
  frame: OverlayMinorFrame,
): OverlayMinorGeometry {
  const meridianLng = meridianLngFor(frame.lineSystem, obliquity(layer.jd), layer.gmst);
  const raw = samples.map(minorLinePositionOf);
  const positions =
    frame.lineSystem === 'geodetic' || frame.coordSystem === 'zodiaco'
      ? projectMinorOntoEcliptic(raw, layer.jd)
      : raw;
  const tag = layer.kind === 'cyclo' ? OVERLAY_LABEL_PREFIX.transits : OVERLAY_LABEL_PREFIX[layer.kind];
  const all = generateMinorLines(positions, meridianLng, frame.decor);
  const lines = tagMinor(
    { ...all, features: all.features.filter((f) => frame.visibleLineTypes.has(f.properties.lineType)) },
    tag,
  );
  const zenith = tagMinor(
    generateMinorZenith(
      frame.zenith && frame.visibleLineTypes.has('MC') ? positions : [],
      meridianLng,
      frame.decor,
    ),
    tag,
  );
  return { positions, meridianLng, lines, zenith };
}

/**
 * The reader's catalog bodies beside an overlay, from the layer alone: samples by the
 * layer's rule (overlayMinorSamples), then lines in the overlay's frame
 * (overlayMinorLines). The ONE implementation every caller drawing them uses — the
 * app's map, and any surface that rebuilds an overlay frame of its own — so no two
 * surfaces can place a catalog body differently beside one overlay.
 *
 * `natal` is the chart's own sample (for the directed rules; null samples afresh).
 */
export function buildOverlayMinorLines(
  layer: OverlayLayer,
  numbers: readonly number[],
  natal: NatalMinorSamples | null,
  frame: OverlayMinorFrame,
): OverlayMinorGeometry & { samples: OverlayMinorSample[] } {
  const samples = overlayMinorSamples(layer.bodyRule, numbers, natal);
  return { samples, ...overlayMinorLines(layer, samples, frame) };
}
