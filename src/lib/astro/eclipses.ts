// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The Eclipses overlay's data layer: the bundled NASA catalog (what the picker
// lists — dates, types, Saros series), Swiss Ephemeris resolution of one
// selected eclipse (precise event times), and the GeoJSON the map draws
// (central line, umbral band, magnitude isolines, greatest-eclipse marker —
// all computed by eclipsePath.ts from Sun/Moon positions).
//
// Division of labour: the CATALOG answers "which eclipses exist, with which
// Saros/type" (Swiss cannot — it has no Saros numbers and no listing); SWISS
// answers "exactly when" and provides the positions; eclipsePath answers
// "where on Earth". Catalog metadata (gamma, magnitude, width, duration) feeds
// the details panel as published, while everything DRAWN is recomputed from
// Swiss so the geometry agrees with the app's own sky.
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import rawCatalog from './data/solarEclipses.json';
import {
  findSolarEclipse,
  jdToCivil,
  obliquity,
  raDecToEclipticLon,
  sunMoonEquatorial,
  type EclipseEvent,
  type SolarEclipseKind,
} from '../ephemeris';
import {
  computeElements,
  centralLine,
  greatestEclipsePoint,
  magnitudeIsolines,
  umbralLimits,
  type BesselianElements,
  type EclipseEphemeris,
} from './eclipsePath';
import { SIGN_GLYPHS } from './glyphChars';
import type { EclipseIsoStep } from '../overlayPrefs';
import type { Theme } from '../theme';

// ── Catalog ───────────────────────────────────────────────────────────────────

export interface EclipseCatalogRow {
  /** "YYYY-MM-DD" of greatest eclipse (TD) — the stable selection key. */
  id: string;
  /** "HH:MM" TD of greatest eclipse (display seed; precise times via Swiss). */
  timeTD: string;
  kind: SolarEclipseKind;
  central: boolean;
  saros: number;
  /** Synodic months since the New Moon of 2000-01-06 (the catalog convention). */
  lunation: number;
  gamma: number;
  magnitude: number;
  /** Greatest-eclipse point, whole degrees (the drawn marker is recomputed). */
  geLat: number;
  geLng: number;
  widthKm: number | null;
  durationSec: number | null;
}

const KIND_BY_CHAR: Record<string, SolarEclipseKind> = {
  T: 'total',
  A: 'annular',
  H: 'hybrid',
  P: 'partial',
};

let catalogCache: EclipseCatalogRow[] | null = null;

export function loadEclipseCatalog(): EclipseCatalogRow[] {
  if (!catalogCache) {
    catalogCache = (rawCatalog.rows as (string | number | null)[][]).map((r) => ({
      id: r[0] as string,
      timeTD: r[1] as string,
      kind: KIND_BY_CHAR[r[2] as string],
      central: r[3] === 1,
      saros: r[4] as number,
      lunation: r[5] as number,
      gamma: r[6] as number,
      magnitude: r[7] as number,
      geLat: r[8] as number,
      geLng: r[9] as number,
      widthKm: r[10] as number | null,
      durationSec: r[11] as number | null,
    }));
  }
  return catalogCache;
}

/** Epoch ms of a row's greatest eclipse. TD ≈ UT at minute precision — fine
 *  for list ordering and nearest-eclipse selection, never for geometry. */
export function eclipseRowMs(row: EclipseCatalogRow): number {
  const [y, m, d] = row.id.split('-').map(Number);
  const [hh, mm] = row.timeTD.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm);
}

/** The catalog eclipse nearest a moment — the default selection when entering
 *  the mode (rows are chronological, so binary-search the insertion point). */
export function nearestEclipse(
  rows: EclipseCatalogRow[],
  targetMs: number,
): EclipseCatalogRow {
  let lo = 0, hi = rows.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (eclipseRowMs(rows[mid]) < targetMs) lo = mid + 1;
    else hi = mid;
  }
  const after = rows[lo];
  const before = rows[Math.max(0, lo - 1)];
  return Math.abs(eclipseRowMs(after) - targetMs) <
    Math.abs(eclipseRowMs(before) - targetMs)
    ? after
    : before;
}

// ── Swiss resolution + path geometry ──────────────────────────────────────────

const UNIX_EPOCH_JD = 2440587.5;
export const jdToMs = (jd: number) => (jd - UNIX_EPOCH_JD) * 86_400_000;

// The browser-side ephemeris adapter for eclipsePath (the Node verify script
// builds its own from @swisseph/node).
const browserEclipseEphemeris: EclipseEphemeris = { sunMoon: sunMoonEquatorial };

export interface ResolvedEclipse {
  row: EclipseCatalogRow;
  /** Swiss's own event (UT JDs) — authoritative for times shown in the UI. */
  event: EclipseEvent;
  elements: BesselianElements;
  /** Our greatest-eclipse point — lies exactly on the drawn central line. */
  ge: { lat: number; lng: number; jd: number };
}

/** Re-derive one catalog eclipse through Swiss + the Besselian fit. ~20 Swiss
 *  calls; memoize per row (App holds it in a useMemo keyed by the row). */
export function resolveEclipse(row: EclipseCatalogRow): ResolvedEclipse {
  // Search from two days before the catalog date — the next eclipse found IS
  // this one (eclipses are never closer than ~29 days).
  const jdSeed = eclipseRowMs(row) / 86_400_000 + UNIX_EPOCH_JD;
  const event = findSolarEclipse(jdSeed - 2);
  const elements = computeElements(browserEclipseEphemeris, event);
  return { row, event, elements, ge: greatestEclipsePoint(elements) };
}

// ── Map features ──────────────────────────────────────────────────────────────

export interface EclipseFeatureProps {
  kind: 'central' | 'limit' | 'isoline' | 'band' | 'ge';
  color: string;
  /** Isoline text drawn along the line ("50%"); empty for other kinds. */
  label: string;
  /** "2024-04-08 · Total" — the hover tip's identity prefix (pre-localized). */
  dateLabel: string;
}

export type EclipseMapData = FeatureCollection<Geometry, EclipseFeatureProps>;

// Path/contour colors per basemap theme. Total/hybrid paths burn red, annular
// paths a ring-of-fire orange; the partial-magnitude contours use a quiet slate
// so the dashed family reads as reference lines, not chart lines.
const PATH_COLORS: Record<Theme, { total: string; annular: string; iso: string }> = {
  glass: { total: '#d8434e', annular: '#d97e2f', iso: '#5d6679' },
  dark: { total: '#ff6b6b', annular: '#ffb066', iso: '#9aa3b8' },
  vintage: { total: '#c03a32', annular: '#bd7427', iso: '#6e6253' },
};

const lineFeature = (
  coords: [number, number][],
  properties: EclipseFeatureProps,
): Feature<Geometry, EclipseFeatureProps> => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: coords },
  properties,
});

/**
 * Everything the map draws for one resolved eclipse, as a single mixed-geometry
 * FeatureCollection (the layers filter on `kind`). Longitudes arrive unwrapped
 * from eclipsePath, so dateline-crossing paths render seamlessly.
 */
export function buildEclipseMap(
  resolved: ResolvedEclipse,
  isoStep: EclipseIsoStep,
  theme: Theme,
  dateLabel: string,
): EclipseMapData {
  const { elements: el, ge } = resolved;
  const pal = PATH_COLORS[theme];
  // Color by the CATALOG kind — the same source every label uses. (Swiss and
  // the catalog disagree on a handful of historical annular/hybrid boundary
  // eclipses; coloring by event.kind would paint a path red while every label
  // says "Annular".)
  const pathColor = resolved.row.kind === 'annular' ? pal.annular : pal.total;
  const features: Feature<Geometry, EclipseFeatureProps>[] = [];
  const props = (
    kind: EclipseFeatureProps['kind'],
    color: string,
    label = '',
  ): EclipseFeatureProps => ({ kind, color, label, dateLabel });

  const { limits, band } = umbralLimits(el);
  if (band) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [band] },
      properties: props('band', pathColor),
    });
  }
  for (const seg of limits) features.push(lineFeature(seg, props('limit', pathColor)));
  for (const iso of magnitudeIsolines(el, isoStep)) {
    const label = `${Math.round(iso.magnitude * 100)}%`;
    for (const seg of iso.segments) {
      features.push(lineFeature(seg, props('isoline', pal.iso, label)));
    }
  }
  for (const seg of centralLine(el)) {
    features.push(lineFeature(seg, props('central', pathColor)));
  }
  features.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [ge.lng, ge.lat] },
    properties: props('ge', pathColor),
  });
  return { type: 'FeatureCollection', features };
}

// ── Details panel ─────────────────────────────────────────────────────────────

/** "19°♈24′" — degrees-in-sign + sign glyph + minutes, the wheel's convention —
 *  plus the (carry-corrected) sign index, for UI that names the sign. Render
 *  the text inside an .astro-glyph-aware context (glyphify) for the bundled font. */
export function zodiacParts(lonRad: number): { text: string; signIndex: number } {
  const deg = (((lonRad * 180) / Math.PI) % 360 + 360) % 360;
  let sign = Math.floor(deg / 30) % 12;
  const inSign = deg - Math.floor(deg / 30) * 30;
  let d = Math.floor(inSign);
  let m = Math.round((inSign - d) * 60);
  if (m === 60) {
    m = 0;
    d += 1;
  }
  // The minute round can carry 29°59.5′ across the cusp — roll into the next sign.
  if (d === 30) {
    d = 0;
    sign = (sign + 1) % 12;
  }
  return {
    text: `${d}°${SIGN_GLYPHS[sign]}${String(m).padStart(2, '0')}′`,
    signIndex: sign,
  };
}

/** Everything the Overlay-tab details panel shows for the selected eclipse:
 *  catalog metadata plus the Swiss-derived strings. */
export interface EclipseDetails {
  row: EclipseCatalogRow;
  /** "2024-04-08 18:17 UTC", from the Swiss-resolved maximum. */
  maxUtc: string;
  /** "19°♈24′" — the eclipse degree (render through glyphify). */
  sunZodiac: string;
  /** The eclipse degree's sign, 0 = Aries … 11 = Pisces (for the hover tip). */
  sunSignIndex: number;
}

export function buildEclipseDetails(resolved: ResolvedEclipse): EclipseDetails {
  const c = jdToCivil(resolved.event.maximum);
  const p = (n: number) => String(n).padStart(2, '0');
  // The Sun's zodiacal position at the eclipse maximum (the Moon is conjunct
  // by definition) — the "eclipse degree" astrologers track.
  const jd = resolved.event.maximum;
  const s = sunMoonEquatorial(jd);
  const zodiac = zodiacParts(raDecToEclipticLon(s.sunRa, s.sunDec, obliquity(jd)));
  return {
    row: resolved.row,
    maxUtc: `${c.year}-${p(c.month)}-${p(c.day)} ${p(c.hour)}:${p(c.minute)} UTC`,
    sunZodiac: zodiac.text,
    sunSignIndex: zodiac.signIndex,
  };
}
