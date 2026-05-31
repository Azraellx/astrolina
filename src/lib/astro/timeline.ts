// Timeline & overlays: turns the active chart + a mode + a target moment (or a
// partner chart) into a second set of positions/gmst that the existing line,
// paran, and local-space generators consume unchanged. This is the single
// abstraction behind transits, secondary progressions, solar-arc directions,
// and relationship (synastry) overlays — each is just "derive a different
// positions+gmst and overlay it."
import type { FeatureCollection, LineString } from 'geojson';
import {
  birthDataToJD,
  getPlanetPositions,
  gmstRadians,
  obliquity,
  raDecToEclipticLon,
  shiftEclipticLongitude,
  type NodeType,
  type PlanetPosition,
} from '../ephemeris';
import type { StoredChart } from '../chartLibrary';

export type OverlayMode =
  | 'off'
  | 'transits'
  | 'progressed'
  | 'solar-arc'
  | 'synastry';

export type OverlayKind = Exclude<OverlayMode, 'off'>;

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
  /** Compact dynamic measure for the HUD readout (no mode word, since the
   *  dropdown already names the mode): "Age 32.0" / "30.2°". null when the mode
   *  has nothing extra worth showing (transits — the date is in the bar already;
   *  synastry — the partner is named in its picker). */
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

// Which sidereal time drives the PROGRESSED angles/lines. Documented, swappable:
//  - 'progressed-ramc': cast the progressed chart at the progressed instant
//    (one gmst drives both planets and angles — the honest secondary sky).
//  - 'natal-anchored': keep the natal RAMC so only the planets progress.
// Default is the progressed instant; flip this constant to compare.
export const PROGRESSED_ANGLE_MODE: 'progressed-ramc' | 'natal-anchored' =
  'progressed-ramc';

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

export function buildOverlay(
  chart: StoredChart,
  mode: OverlayKind,
  targetDate: number, // epoch ms UTC; ignored for synastry
  partner: StoredChart | null,
  nodeType: NodeType = 'mean',
): OverlayLayer | null {
  switch (mode) {
    case 'transits': {
      const jd = epochMsToJD(targetDate);
      return {
        kind: mode,
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
      const birthJD = birthDataToJD(chart);
      const yearsElapsed =
        (epochMsToJD(targetDate) - birthJD) / TROPICAL_YEAR_DAYS;
      const progressedJD = birthJD + yearsElapsed;
      const gmst =
        PROGRESSED_ANGLE_MODE === 'progressed-ramc'
          ? gmstRadians(progressedJD)
          : gmstRadians(birthJD);
      return {
        kind: mode,
        measure: `Age ${yearsElapsed.toFixed(1)}`,
        labelFull: `Secondary Progressions · age ${yearsElapsed.toFixed(1)}`,
        jd: progressedJD,
        positions: getPlanetPositions(progressedJD, nodeType),
        gmst,
        originLat: chart.birthplace.lat,
        originLng: chart.birthplace.lng,
      };
    }
    case 'solar-arc': {
      const birthJD = birthDataToJD(chart);
      const eps = obliquity(birthJD);
      const natal = getPlanetPositions(birthJD, nodeType);
      const yearsElapsed =
        (epochMsToJD(targetDate) - birthJD) / TROPICAL_YEAR_DAYS;
      const progressedJD = birthJD + yearsElapsed;
      // Solar arc = how far the secondary-progressed Sun has moved in ecliptic
      // longitude from its natal place (≈ 0.9856°/yr ≈ the native's age).
      const natalSunLon = raDecToEclipticLon(natal[0].ra, natal[0].dec, eps);
      const progSun = getPlanetPositions(progressedJD, nodeType)[0];
      const arc = normalizeAngle(
        raDecToEclipticLon(progSun.ra, progSun.dec, eps) - natalSunLon,
      );
      // Advance every natal body — and, via natal gmst, the angles too — by the
      // arc, so the directed MC = natal MC + arc (the standard result).
      const positions = natal.map((p) => shiftEclipticLongitude(p, arc, eps));
      return {
        kind: mode,
        measure: `Sun ${((arc * 180) / Math.PI).toFixed(1)}°`,
        labelFull: `Solar Arc · ${((arc * 180) / Math.PI).toFixed(1)}°`,
        jd: birthJD,
        positions,
        gmst: gmstRadians(birthJD),
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
