// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Fixed-star angle lines. The bundled catalog (data/stars.json, extracted from
// the Swiss Ephemeris star file) holds ICRS/J2000 positions + proper motion; a
// star's position of date is proper motion applied in the J2000 frame, then
// IAU-1976 precession to date. Nutation and annual aberration (≤ ~20″ combined)
// sit far below the width of a drawn line and are deliberately skipped — the
// docs' "needs a star catalog with proper motion" requirement, now met.
//
// Stars are natively equatorial (ra/dec), so the planet lines' meridian and
// horizon geometry applies with no ecliptic step. ASC/DSC lines are suppressed
// for high-declination stars: those are circumpolar across most inhabited
// latitudes, where rising/setting barely happens and parans are the
// conventional reading instead.
import type { Feature, FeatureCollection, LineString } from 'geojson';
import {
  meridianCoords,
  normLng,
  traceHorizonCoords,
  type LineType,
  type MeridianLng,
} from './lines';
import { eclipticToRaDec, raDecToEclipticLon } from '../ephemeris';
import starsJson from './data/stars.json';

export interface StarRecord {
  name: string;
  /** 1 = headline set (royal stars + brightest); 2 = the full classic set. */
  tier: 1 | 2;
  ra: number; // degrees, ICRS/J2000
  dec: number; // degrees
  pmRa: number; // mas/yr, × cos(dec)
  pmDec: number; // mas/yr
  mag: number;
}

const CATALOG = (starsJson as { stars: StarRecord[] }).stars;

export type StarSet = 'bright' | 'all';

export interface StarPosition {
  name: string;
  ra: number; // radians, equinox of date
  dec: number; // radians
  mag: number;
}

const DEG2RAD = Math.PI / 180;
const J2000 = 2451545.0;
// One milliarcsecond, in radians.
const MAS = DEG2RAD / 3_600_000;
const ARCSEC = DEG2RAD / 3600;

/** Star positions for the chart instant: proper motion + precession to date. */
export function starsOfDate(jd: number, set: StarSet): StarPosition[] {
  const T = (jd - J2000) / 36525;
  const years = (jd - J2000) / 365.25;
  // IAU-1976 precession angles (arcsec), accurate to well under 1″ across the
  // app's 1800–2399 window — far inside the line width.
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * ARCSEC;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * ARCSEC;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * ARCSEC;

  const out: StarPosition[] = [];
  for (const s of CATALOG) {
    if (set === 'bright' && s.tier !== 1) continue;
    const dec0 = s.dec * DEG2RAD + s.pmDec * MAS * years;
    const ra0 =
      s.ra * DEG2RAD + (s.pmRa * MAS * years) / Math.max(Math.cos(dec0), 1e-6);
    // Rigorous precession of the unit vector via the standard angle set.
    const A = Math.cos(dec0) * Math.sin(ra0 + zeta);
    const B =
      Math.cos(theta) * Math.cos(dec0) * Math.cos(ra0 + zeta) -
      Math.sin(theta) * Math.sin(dec0);
    const C =
      Math.sin(theta) * Math.cos(dec0) * Math.cos(ra0 + zeta) +
      Math.cos(theta) * Math.sin(dec0);
    out.push({
      name: s.name,
      ra: Math.atan2(A, B) + z,
      dec: Math.asin(Math.min(1, Math.max(-1, C))),
      mag: s.mag,
    });
  }
  return out;
}

export interface StarLineProps {
  kind: 'star';
  star: string;
  lineType: LineType;
  color: string;
  label: string;
  // Overlay frame prefix (Tr/Sp/Tp/Sa/Pd/Cy/Sy) when these star lines belong to
  // an active overlay's frame; absent for the natal chart's own star lines.
  tag?: string;
}

// Past this declination a star is circumpolar over most of the inhabited world:
// no ASC/DSC lines (see module note).
const STAR_HORIZON_DEC_MAX = 60 * DEG2RAD;

/**
 * MC/IC (always) + ASC/DSC (sub-circumpolar stars) lines for a star set.
 * `eclipticEps`: in geodetic (Mundane) mode pass the obliquity — each star is
 * first projected onto the ecliptic (latitude zeroed), the same convention the
 * planets follow there; null keeps the true-sky position (celestial mode).
 * `color` is the shared per-theme starlight tint (theme.STAR_LINE_COLORS) —
 * the stars read as one family, distinct from the per-body planet palette.
 */
export function generateStarLines(
  stars: StarPosition[],
  meridianLng: MeridianLng,
  eclipticEps: number | null,
  color: string,
): FeatureCollection<LineString, StarLineProps> {
  const features: Feature<LineString, StarLineProps>[] = [];
  const make = (
    star: string,
    lineType: LineType,
    coordinates: [number, number][],
  ): Feature<LineString, StarLineProps> => ({
    type: 'Feature',
    properties: {
      kind: 'star',
      star,
      lineType,
      color,
      label: `${star} ${lineType}`,
    },
    geometry: { type: 'LineString', coordinates },
  });

  for (const s of stars) {
    let { ra, dec } = s;
    if (eclipticEps !== null) {
      const lon = raDecToEclipticLon(ra, dec, eclipticEps);
      ({ ra, dec } = eclipticToRaDec(lon, 0, eclipticEps));
    }
    const lngMC = normLng(meridianLng(ra));
    const lngIC = normLng(lngMC + 180);
    features.push(make(s.name, 'MC', meridianCoords(lngMC)));
    features.push(make(s.name, 'IC', meridianCoords(lngIC)));
    if (Math.abs(dec) <= STAR_HORIZON_DEC_MAX) {
      const p = { ra, dec };
      features.push(make(s.name, 'ASC', traceHorizonCoords(p, meridianLng, 'ASC')));
      features.push(make(s.name, 'DSC', traceHorizonCoords(p, meridianLng, 'DSC')));
    }
  }
  return { type: 'FeatureCollection', features };
}
