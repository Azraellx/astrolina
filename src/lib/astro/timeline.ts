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
  type PlanetPosition,
} from '../ephemeris';
import type { StoredChart } from '../chartLibrary';

export type OverlayMode =
  | 'off'
  | 'transits'
  | 'progressed'
  | 'solar-arc'
  | 'primary-directions'
  | 'synastry';

export type OverlayKind = Exclude<OverlayMode, 'off'>;

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
  | 'mean-quotidian'; // quotidian progressed angle (one day per year)

// Group B — the time-key (arc per year) for the Primary Directions overlay.
export type PrimaryRate =
  | 'ptolemy'      // 1° per year
  | 'naibod'       // 0°59′08.33″ per year
  | 'cardan'       // 0°59′12″ per year
  | 'kepler-ra'    // natal Sun's daily motion in RA, per year
  | 'solar-long'   // natal Sun's daily motion in longitude, per year
  | 'placidus-ra'  // true secondary-progressed solar arc in RA (nonlinear)
  | 'user';        // user-entered degrees per year

// Mean solar motion keys (degrees/year of life), per their classical definitions.
const NAIBOD_DEG_PER_YR = 0.985647; // 0°59′08.33″
const CARDAN_DEG_PER_YR = 0.986667; // 0°59′12″

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
}

const TROPICAL_YEAR_DAYS = 365.2422;
const UNIX_EPOCH_JD = 2440587.5;

export const epochMsToJD = (ms: number) => UNIX_EPOCH_JD + ms / 86_400_000;

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
  const natal = getPlanetPositions(birthJD, nodeType);
  const years = (epochMsToJD(targetDate) - birthJD) / TROPICAL_YEAR_DAYS;
  const progressedJD = birthJD + years;
  const natalGMST = gmstRadians(birthJD);
  // Solar arc measured in ecliptic longitude vs in right ascension.
  const arcLong = () => {
    const s = getPlanetPositions(progressedJD, nodeType)[0];
    return normalizeAngle(
      raDecToEclipticLon(s.ra, s.dec, eps) -
        raDecToEclipticLon(natal[0].ra, natal[0].dec, eps),
    );
  };
  const arcRA = () =>
    normalizeAngle(getPlanetPositions(progressedJD, nodeType)[0].ra - natal[0].ra);
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
): OverlayLayer | null {
  switch (mode) {
    case 'transits': {
      const jd = epochMsToJD(targetDate);
      return {
        kind: mode,
        // The nub already shows "Transits" as the mode name — no readout needed.
        measure: null,
        labelFull: `Transits · ${fmtDateTimeUTC(targetDate)} UTC`,
        jd,
        positions: getPlanetPositions(jd, nodeType),
        gmst: gmstRadians(jd),
        originLat: chart.birthplace.lat,
        originLng: chart.birthplace.lng,
      };
    }
    case 'progressed': {
      const c = directionContext(chart, targetDate, nodeType);
      const naibodArc = (NAIBOD_DEG_PER_YR * c.years * Math.PI) / 180;
      // The planets progress via day-for-a-year; the angle method only chooses how
      // the RAMC (gmst) advances. Mean Quotidian = the honest progressed sidereal
      // time (the prior default); the others offset the natal RAMC by the arc.
      let gmst: number;
      switch (angleProgression) {
        case 'naibod-ra':
          gmst = norm2pi(c.natalGMST + naibodArc);
          break;
        case 'sa-ra':
          gmst = norm2pi(c.natalGMST + c.arcRA());
          break;
        case 'sa-long':
          gmst = c.ramcOfLong(c.arcLong());
          break;
        case 'naibod-long':
          gmst = c.ramcOfLong(naibodArc);
          break;
        case 'mean-quotidian':
        default:
          gmst = gmstRadians(c.progressedJD);
          break;
      }
      return {
        kind: mode,
        measure: `Age ${c.years.toFixed(1)}`,
        labelFull: `Secondary Progressions · age ${c.years.toFixed(1)}`,
        jd: c.progressedJD,
        positions: getPlanetPositions(c.progressedJD, nodeType),
        gmst,
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
      let positions: PlanetPosition[];
      switch (angleProgression) {
        case 'sa-ra':
          arc = c.arcRA();
          positions = c.natal.map((p) => shiftRightAscension(p, arc));
          break;
        case 'naibod-long':
          arc = naibodArc;
          positions = c.natal.map((p) => shiftEclipticLongitude(p, arc, c.eps));
          break;
        case 'naibod-ra':
          arc = naibodArc;
          positions = c.natal.map((p) => shiftRightAscension(p, arc));
          break;
        case 'sa-long':
        case 'mean-quotidian':
        default:
          arc = c.arcLong();
          positions = c.natal.map((p) => shiftEclipticLongitude(p, arc, c.eps));
          break;
      }
      return {
        kind: mode,
        // Just the arc angle next to the "Solar Arc" mode name (no "Sun" prefix).
        measure: `${((arc * 180) / Math.PI).toFixed(1)}°`,
        labelFull: `Solar Arc · ${((arc * 180) / Math.PI).toFixed(1)}°`,
        jd: c.birthJD,
        positions,
        gmst: c.natalGMST,
        originLat: chart.birthplace.lat,
        originLng: chart.birthplace.lng,
      };
    }
    case 'primary-directions': {
      const c = directionContext(chart, targetDate, nodeType);
      const perYear = (degPerYr: number) => (degPerYr * c.years * Math.PI) / 180;
      // Primary directions advance the diurnal (RA) frame by the arc, bodies stay
      // at their natal RA/dec — so every line rigidly rotates with the RAMC. The
      // rate is the time-key (arc per year); positive arc directs forward (gmst
      // increases ⇒ lines shift west).
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
        labelFull: `Primary Directions · ${arcDeg}°`,
        jd: c.birthJD,
        positions: c.natal,
        gmst: norm2pi(c.natalGMST + arc),
        originLat: chart.birthplace.lat,
        originLng: chart.birthplace.lng,
      };
    }
    case 'synastry': {
      if (!partner) return null;
      const pjd = birthDataToJD(partner);
      return {
        kind: mode,
        measure: null,
        labelFull: `Synastry · ${partner.name}`,
        jd: pjd,
        positions: getPlanetPositions(pjd, nodeType),
        gmst: gmstRadians(pjd),
        originLat: partner.birthplace.lat,
        originLng: partner.birthplace.lng,
      };
    }
  }
}

// Two-letter tag per overlay kind, shown on the map ahead of the glyph + angle
// code so overlay lines read e.g. "Tr ♂ MC". Tr transits · Sp secondary
// progressions · Sa solar arc · Sy synastry.
export const OVERLAY_LABEL_PREFIX: Record<OverlayKind, string> = {
  transits: 'Tr',
  progressed: 'Sp',
  'solar-arc': 'Sa',
  'primary-directions': 'Pd',
  synastry: 'Sy',
};

// Clone a line/paran FeatureCollection, stamping the overlay tag onto each
// feature's `label` (the overlay map layers prepend it to the glyph + code).
export function tagLabels<P extends { label: string }>(
  fc: FeatureCollection<LineString, P>,
  tag: string,
): FeatureCollection<LineString, P> {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({
      ...f,
      properties: { ...f.properties, label: tag },
    })),
  };
}
