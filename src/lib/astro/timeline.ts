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

export interface OverlayLayer {
  kind: OverlayKind;
  label: string;
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

export function buildOverlay(
  chart: StoredChart,
  mode: OverlayKind,
  targetDate: number, // epoch ms UTC; ignored for synastry
  partner: StoredChart | null,
): OverlayLayer | null {
  switch (mode) {
    case 'transits': {
      const jd = epochMsToJD(targetDate);
      return {
        kind: mode,
        label: `Transits · ${fmtDateUTC(targetDate)} UTC`,
        jd,
        positions: getPlanetPositions(jd),
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
        label: `Progressed · age ${yearsElapsed.toFixed(1)}`,
        jd: progressedJD,
        positions: getPlanetPositions(progressedJD),
        gmst,
        originLat: chart.birthplace.lat,
        originLng: chart.birthplace.lng,
      };
    }
    case 'solar-arc': {
      const birthJD = birthDataToJD(chart);
      const eps = obliquity(birthJD);
      const natal = getPlanetPositions(birthJD);
      const yearsElapsed =
        (epochMsToJD(targetDate) - birthJD) / TROPICAL_YEAR_DAYS;
      const progressedJD = birthJD + yearsElapsed;
      // Solar arc = how far the secondary-progressed Sun has moved in ecliptic
      // longitude from its natal place (≈ 0.9856°/yr ≈ the native's age).
      const natalSunLon = raDecToEclipticLon(natal[0].ra, natal[0].dec, eps);
      const progSun = getPlanetPositions(progressedJD)[0];
      const arc = normalizeAngle(
        raDecToEclipticLon(progSun.ra, progSun.dec, eps) - natalSunLon,
      );
      // Advance every natal body — and, via natal gmst, the angles too — by the
      // arc, so the directed MC = natal MC + arc (the standard result).
      const positions = natal.map((p) => shiftEclipticLongitude(p, arc, eps));
      return {
        kind: mode,
        label: `Solar arc · ${((arc * 180) / Math.PI).toFixed(1)}°`,
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
        label: `Synastry · ${partner.name}`,
        jd: pjd,
        positions: getPlanetPositions(pjd),
        gmst: gmstRadians(pjd),
        originLat: partner.birthplace.lat,
        originLng: partner.birthplace.lng,
      };
    }
  }
}

// Short label prefix per overlay kind, baked into the GeoJSON feature labels so
// the map's label layers need no expression changes.
export const OVERLAY_LABEL_PREFIX: Record<OverlayKind, string> = {
  transits: 't ',
  progressed: 'p ',
  'solar-arc': 'd ', // "directed"
  synastry: 's ',
};

// Clone a line/paran FeatureCollection, prepending a prefix to each label.
export function prefixLabels<P extends { label: string }>(
  fc: FeatureCollection<LineString, P>,
  prefix: string,
): FeatureCollection<LineString, P> {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => ({
      ...f,
      properties: { ...f.properties, label: `${prefix}${f.properties.label}` },
    })),
  };
}
