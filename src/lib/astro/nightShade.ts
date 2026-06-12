// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Night-side shading: the hemisphere where the Sun sits below the horizon at
// one instant, as a single translucent fill. The boundary is the terminator —
// the great circle 90° from the subsolar point — built exactly like the lunar
// eclipse's visibility hemisphere (lunarEclipse.ts), but standalone: that
// module lives in the lazily-loaded eclipse chunk, and the night shade must
// not drag the whole chunk into the main bundle.
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import { sunMoonEquatorial } from '../ephemeris';
import { unwrapLongitudes } from './dateline';

const RAD2DEG = 180 / Math.PI;
const STEPS = 181;
// Web-mercator latitude limit — the parallel pole-enclosing rings close on.
const POLE_LAT = 85.05;

const normLng = (deg: number) => {
  let v = deg % 360;
  if (v > 180) v -= 360;
  if (v <= -180) v += 360;
  return v;
};

export interface NightShadeProps {
  color: string;
  opacity: number;
}

/**
 * The night hemisphere at `jd` as a renderable closed polygon. The terminator
 * is swept as a circle around the subsolar point; the ring then closes around
 * the pole OPPOSITE the Sun's declination (northern-summer Sun → the night
 * side holds the south pole), the same pole-enclosing construction the lunar
 * visibility fill uses. `color`/`opacity` are the theme's shade style.
 */
export function generateNightShade(
  jd: number,
  color: string,
  opacity: number,
): FeatureCollection<Polygon, NightShadeProps> {
  const s = sunMoonEquatorial(jd);
  // A subsolar point exactly on the equator (the equinoxes) degenerates the
  // unwrap — the terminator runs pole-to-pole as a meridian pair; a hair of
  // declination restores one monotonic sweep without moving anything visibly.
  const dec = Math.abs(s.sunDec) < 1e-6 ? 1e-6 : s.sunDec;
  const lng = s.sunRa - s.gast;
  const cosD = Math.cos(dec);
  const c: [number, number, number] = [
    cosD * Math.cos(lng),
    cosD * Math.sin(lng),
    Math.sin(dec),
  ];
  // Orthonormal frame perpendicular to the subsolar vector: n1 along the
  // equator (east of the subsolar meridian), n2 completing the set.
  const hx = Math.hypot(c[0], c[1]);
  const n1: [number, number, number] = [-c[1] / hx, c[0] / hx, 0];
  const n2: [number, number, number] = [
    c[1] * n1[2] - c[2] * n1[1],
    c[2] * n1[0] - c[0] * n1[2],
    c[0] * n1[1] - c[1] * n1[0],
  ];
  const pts: [number, number][] = [];
  for (let i = 0; i < STEPS; i++) {
    const A = (2 * Math.PI * i) / (STEPS - 1);
    const p = [
      Math.cos(A) * n1[0] + Math.sin(A) * n2[0],
      Math.cos(A) * n1[1] + Math.sin(A) * n2[1],
      Math.cos(A) * n1[2] + Math.sin(A) * n2[2],
    ];
    pts.push([
      normLng(Math.atan2(p[1], p[0]) * RAD2DEG),
      Math.asin(Math.max(-1, Math.min(1, p[2]))) * RAD2DEG,
    ]);
  }
  const boundary = unwrapLongitudes(pts);
  const poleLat = (dec >= 0 ? -1 : 1) * POLE_LAT;
  const first = boundary[0];
  const last = boundary[boundary.length - 1];
  const ring: [number, number][] = [
    ...boundary,
    [last[0], poleLat],
    [first[0], poleLat],
    first,
  ];
  const feature: Feature<Polygon, NightShadeProps> = {
    type: 'Feature',
    properties: { color, opacity },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
  return { type: 'FeatureCollection', features: [feature] };
}
