// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The Eclipses overlay's data layer: the bundled NASA catalogs (what the
// picker lists — dates, types, Saros series, solar and lunar merged), Swiss
// Ephemeris resolution of one selected eclipse (precise event times), and the
// GeoJSON the map draws — a solar eclipse's central line, umbral band,
// magnitude isolines and greatest-eclipse marker (computed by eclipsePath.ts),
// or a lunar eclipse's visibility hemisphere, moonrise/set contact curves and
// sub-lunar marker (computed by lunarEclipse.ts).
//
// Division of labour: the CATALOG answers "which eclipses exist, with which
// Saros/type" (Swiss cannot — it has no Saros numbers and no listing); SWISS
// answers "exactly when" and provides the positions; eclipsePath/lunarEclipse
// answer "where on Earth". Catalog metadata (gamma, magnitudes, width,
// durations) feeds the details panel as published, while everything DRAWN is
// recomputed from Swiss so the geometry agrees with the app's own sky.
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import rawSolarCatalog from './data/solarEclipses.json';
import rawLunarCatalog from './data/lunarEclipses.json';
import {
  findLunarEclipse,
  findSolarEclipse,
  jdToCivil,
  obliquity,
  raDecToEclipticLon,
  sunMoonEquatorial,
  type EclipseEvent,
  type LunarEclipseEvent,
  type LunarEclipseKind,
  type PlanetName,
  type SolarEclipseKind,
} from '../ephemeris';
import {
  computeElements,
  centralLine,
  greatestEclipsePoint,
  magnitudeIsolines,
  penumbralLimit,
  umbralLimits,
  type BesselianElements,
  type EclipseEphemeris,
} from './eclipsePath';
import {
  lunarGeometry,
  lunarLocalView as lunarLocalViewWith,
  type LunarEclipseGeometry,
  type LunarLocalView,
} from './lunarEclipse';
import { SIGN_GLYPHS } from './glyphChars';
import type { EclipseIsoStep } from '../overlayPrefs';
import type { Theme } from '../theme';

// Re-exported so the App can reach the per-location lookups through its one
// lazy `import('./lib/astro/eclipses')` — this module (with its catalog JSON
// and the geometry code) stays out of the main bundle until eclipse mode is
// first opened, and a second entry point would split the chunk for nothing.
export { localCircumstances, localContacts } from './eclipsePath';
export {
  moonSinAlt,
  LUNAR_PHASE_ORDER,
  type LunarLocalView,
  type LunarPhaseTag,
} from './lunarEclipse';

// ── Catalog ───────────────────────────────────────────────────────────────────

/** Fields both catalogs share; `body` discriminates the union. */
interface EclipseRowShared {
  /** "YYYY-MM-DD" of greatest eclipse (TD) — the stable selection key (no
   *  date hosts both a solar and a lunar eclipse; the verify script asserts). */
  id: string;
  /** "HH:MM" TD of greatest eclipse (display seed; precise times via Swiss). */
  timeTD: string;
  saros: number;
  /** Synodic months since the New Moon of 2000-01-06 (the catalog convention). */
  lunation: number;
  gamma: number;
}

export interface SolarCatalogRow extends EclipseRowShared {
  body: 'solar';
  kind: SolarEclipseKind;
  central: boolean;
  magnitude: number;
  /** Greatest-eclipse point, whole degrees (the drawn marker is recomputed). */
  geLat: number;
  geLng: number;
  widthKm: number | null;
  durationSec: number | null;
}

export interface LunarCatalogRow extends EclipseRowShared {
  body: 'lunar';
  kind: LunarEclipseKind;
  /** How deep the Moon dips into each shadow, in Moon diameters; the umbral
   *  value is negative when the Moon misses the umbra (penumbral eclipses). */
  penMag: number;
  umbMag: number;
  /** Sub-lunar point at greatest eclipse, whole degrees (marker recomputed). */
  zenLat: number;
  zenLng: number;
  /** Phase durations, decimal minutes; null for phases the eclipse lacks. */
  durPenMin: number | null;
  durParMin: number | null;
  durTotMin: number | null;
}

export type EclipseCatalogRow = SolarCatalogRow | LunarCatalogRow;

const SOLAR_KIND_BY_CHAR: Record<string, SolarEclipseKind> = {
  T: 'total',
  A: 'annular',
  H: 'hybrid',
  P: 'partial',
};

const LUNAR_KIND_BY_CHAR: Record<string, LunarEclipseKind> = {
  T: 'total',
  P: 'partial',
  N: 'penumbral',
};

let catalogCache: EclipseCatalogRow[] | null = null;

/** Both catalogs merged into one chronological list (the picker's order). */
export function loadEclipseCatalog(): EclipseCatalogRow[] {
  if (!catalogCache) {
    const solar = (rawSolarCatalog.rows as (string | number | null)[][]).map(
      (r): SolarCatalogRow => ({
        body: 'solar',
        id: r[0] as string,
        timeTD: r[1] as string,
        kind: SOLAR_KIND_BY_CHAR[r[2] as string],
        central: r[3] === 1,
        saros: r[4] as number,
        lunation: r[5] as number,
        gamma: r[6] as number,
        magnitude: r[7] as number,
        geLat: r[8] as number,
        geLng: r[9] as number,
        widthKm: r[10] as number | null,
        durationSec: r[11] as number | null,
      }),
    );
    const lunar = (rawLunarCatalog.rows as (string | number | null)[][]).map(
      (r): LunarCatalogRow => ({
        body: 'lunar',
        id: r[0] as string,
        timeTD: r[1] as string,
        kind: LUNAR_KIND_BY_CHAR[r[2] as string],
        saros: r[3] as number,
        lunation: r[4] as number,
        gamma: r[5] as number,
        penMag: r[6] as number,
        umbMag: r[7] as number,
        zenLat: r[8] as number,
        zenLng: r[9] as number,
        durPenMin: r[10] as number | null,
        durParMin: r[11] as number | null,
        durTotMin: r[12] as number | null,
      }),
    );
    catalogCache = [...solar, ...lunar].sort(
      (a, b) => eclipseRowMs(a) - eclipseRowMs(b),
    );
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

// The browser-side ephemeris adapter for the geometry modules (the Node
// verify script builds its own from @swisseph/node).
const browserEclipseEphemeris: EclipseEphemeris = { sunMoon: sunMoonEquatorial };

/** lunarLocalView with the browser ephemeris bound — what the click card
 *  calls (the adapter parameter exists for the Node verify script). */
export function lunarLocalView(
  geometry: LunarEclipseGeometry,
  latDeg: number,
  lngDeg: number,
): LunarLocalView | null {
  return lunarLocalViewWith(browserEclipseEphemeris, geometry, latDeg, lngDeg);
}

export type ResolvedEclipse =
  | {
      body: 'solar';
      row: SolarCatalogRow;
      /** Swiss's own event (UT JDs) — authoritative for times shown in the UI. */
      event: EclipseEvent;
      elements: BesselianElements;
      /** Our greatest-eclipse point — lies exactly on the drawn central line. */
      ge: { lat: number; lng: number; jd: number };
    }
  | {
      body: 'lunar';
      row: LunarCatalogRow;
      event: LunarEclipseEvent;
      geometry: LunarEclipseGeometry;
    };

/** Re-derive one catalog eclipse through Swiss: the Besselian fit for solar
 *  (~20 Swiss calls), the contact-time visibility geometry for lunar (~7).
 *  Memoize per row (App holds it in a useMemo keyed by the row). */
export function resolveEclipse(row: EclipseCatalogRow): ResolvedEclipse {
  // Search from two days before the catalog date — the next eclipse of that
  // body found IS this one (successive ones are never closer than ~29 days).
  const jdSeed = eclipseRowMs(row) / 86_400_000 + UNIX_EPOCH_JD;
  if (row.body === 'lunar') {
    const event = findLunarEclipse(jdSeed - 2);
    return {
      body: 'lunar',
      row,
      event,
      geometry: lunarGeometry(browserEclipseEphemeris, event),
    };
  }
  const event = findSolarEclipse(jdSeed - 2);
  const elements = computeElements(browserEclipseEphemeris, event);
  return { body: 'solar', row, event, elements, ge: greatestEclipsePoint(elements) };
}

// ── Map features ──────────────────────────────────────────────────────────────

export interface EclipseFeatureProps {
  kind:
    | 'central'
    | 'limit'
    | 'isoline'
    | 'penumbral-limit'
    | 'band'
    | 'ge'
    | 'lunar-vis'
    | 'lunar-horizon'
    | 'sublunar';
  color: string;
  /** Text drawn along the line — isoline percentage ("50%") or lunar contact
   *  tag ("U1"); empty for other kinds. */
  label: string;
  /** "2024-04-08 · Total" — the hover tip's identity prefix (pre-localized). */
  dateLabel: string;
}

export type EclipseMapData = FeatureCollection<Geometry, EclipseFeatureProps>;

// Path/contour colors per basemap theme. Total/hybrid solar paths burn red,
// annular paths a ring-of-fire orange, lunar features a moonlit indigo; the
// partial-magnitude contours use a quiet slate so the dashed family reads as
// reference lines, not chart lines.
const PATH_COLORS: Record<
  Theme,
  { total: string; annular: string; iso: string; lunar: string }
> = {
  glass: { total: '#d8434e', annular: '#d97e2f', iso: '#5d6679', lunar: '#5868b8' },
  dark: { total: '#ff6b6b', annular: '#ffb066', iso: '#9aa3b8', lunar: '#94a7ff' },
  vintage: { total: '#c03a32', annular: '#bd7427', iso: '#6e6253', lunar: '#5d5a8a' },
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
 * from the geometry modules, so dateline-crossing features render seamlessly.
 */
export function buildEclipseMap(
  resolved: ResolvedEclipse,
  isoStep: EclipseIsoStep,
  theme: Theme,
  dateLabel: string,
): EclipseMapData {
  const pal = PATH_COLORS[theme];
  const features: Feature<Geometry, EclipseFeatureProps>[] = [];
  const props = (
    kind: EclipseFeatureProps['kind'],
    color: string,
    label = '',
  ): EclipseFeatureProps => ({ kind, color, label, dateLabel });

  if (resolved.body === 'lunar') {
    const { geometry } = resolved;
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [geometry.visPolygon] },
      properties: props('lunar-vis', pal.lunar),
    });
    for (const { phase, ring } of geometry.contactHorizons) {
      features.push(lineFeature(ring, props('lunar-horizon', pal.lunar, phase)));
    }
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [geometry.sublunar.lng, geometry.sublunar.lat],
      },
      properties: props('sublunar', pal.lunar),
    });
    return { type: 'FeatureCollection', features };
  }

  const { elements: el, ge } = resolved;
  // Color by the CATALOG kind — the same source every label uses. (Swiss and
  // the catalog disagree on a handful of historical annular/hybrid boundary
  // eclipses; coloring by event.kind would paint a path red while every label
  // says "Annular".)
  const pathColor = resolved.row.kind === 'annular' ? pal.annular : pal.total;

  const { limits, band } = umbralLimits(el);
  if (band) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [band] },
      properties: props('band', pathColor),
    });
  }
  for (const seg of limits) features.push(lineFeature(seg, props('limit', pathColor)));
  for (const seg of penumbralLimit(el)) {
    features.push(lineFeature(seg, props('penumbral-limit', pal.iso)));
  }
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
  /** "19°♈24′" — the eclipse degree (render through glyphify): the Sun's
   *  longitude for a solar eclipse, the Moon's for a lunar one (they stand
   *  opposite at a Full Moon, so the two carry distinct degrees). */
  zodiac: string;
  /** The eclipse degree's sign, 0 = Aries … 11 = Pisces (for the hover tip). */
  signIndex: number;
  /** The eclipse degree in radians (feeds the natal-contact search). */
  lonRad: number;
}

export function buildEclipseDetails(
  resolved: ResolvedEclipse,
  /** Sidereal display offset (radians) for the zodiac READOUT only. The
   *  returned lonRad stays tropical; the caller (App's eclipseContactList)
   *  applies the per-epoch ayanamsa to BOTH the eclipse degree (eclipse epoch)
   *  and the natal points (birth epoch) before the contact search, so the
   *  contacts list reads in the active zodiac like every other overlay — and,
   *  unlike the old tropical-only doctrine, now agrees with the bi-wheel's
   *  cross list (documented in calculation-methods.md). */
  ayanRad = 0,
): EclipseDetails {
  const jd = resolved.event.maximum;
  const c = jdToCivil(jd);
  const p = (n: number) => String(n).padStart(2, '0');
  // The "eclipse degree" astrologers track: where the eclipsed body stands.
  // Lunar reuses the sky sample the geometry already took at maximum; solar
  // samples here (the Moon is conjunct the Sun by definition).
  const sky =
    resolved.body === 'lunar'
      ? resolved.geometry.samples.max!.sample
      : sunMoonEquatorial(jd);
  const lonRad =
    resolved.body === 'lunar'
      ? raDecToEclipticLon(sky.moonRa, sky.moonDec, obliquity(jd))
      : raDecToEclipticLon(sky.sunRa, sky.sunDec, obliquity(jd));
  const TWO_PI = 2 * Math.PI;
  const zodiac = zodiacParts((((lonRad - ayanRad) % TWO_PI) + TWO_PI) % TWO_PI);
  return {
    row: resolved.row,
    maxUtc: `${c.year}-${p(c.month)}-${p(c.day)} ${p(c.hour)}:${p(c.minute)} UTC`,
    zodiac: zodiac.text,
    signIndex: zodiac.signIndex,
    lonRad,
  };
}

/** "18:42:07" — seconds-precision UT clock time for the click card's contact
 *  rows (totality lasts minutes, so the minute-snapping jdToCivil is too
 *  coarse there). The date context comes from the selection itself. */
export function jdToUtcHms(jd: number): string {
  const d = new Date(Math.round(jdToMs(jd) / 1000) * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

// ── Eclipse-to-natal contacts ─────────────────────────────────────────────────

export type EclipseAspect = 'conjunction' | 'opposition' | 'square';

export interface EclipseContact {
  /** Natal target — a planet, or one of the chart angles. */
  planet?: PlanetName;
  angle?: 'asc' | 'mc';
  aspect: EclipseAspect;
  /** How far from exact, degrees (0 = partile). */
  orb: number;
}

const CONTACT_ASPECTS: { aspect: EclipseAspect; angle: number }[] = [
  { aspect: 'conjunction', angle: 0 },
  { aspect: 'square', angle: 90 },
  { aspect: 'opposition', angle: 180 },
];
const CONTACT_ORB_DEG = 3;

/**
 * Where the eclipse degree strikes a natal chart: conjunctions, squares and
 * oppositions within a tight 3° orb — the classical "does this eclipse touch
 * my chart" doctrine (softer aspects are conventionally ignored for
 * eclipses). Sorted tightest first.
 */
export function eclipseContacts(
  eclipseLonRad: number,
  natal: { name: PlanetName; lon: number }[],
  angles: { asc: number; mc: number } | null,
): EclipseContact[] {
  const targets: ({ planet: PlanetName } | { angle: 'asc' | 'mc' })[] = [
    ...natal.map((p) => ({ planet: p.name })),
    ...(angles ? ([{ angle: 'asc' }, { angle: 'mc' }] as const) : []),
  ];
  const lons = [
    ...natal.map((p) => p.lon),
    ...(angles ? [angles.asc, angles.mc] : []),
  ];
  const out: EclipseContact[] = [];
  const eclDeg = (((eclipseLonRad * 180) / Math.PI) % 360 + 360) % 360;
  for (let i = 0; i < targets.length; i++) {
    const natDeg = (((lons[i] * 180) / Math.PI) % 360 + 360) % 360;
    // Shorter arc between the two longitudes, 0–180°.
    const arc = Math.abs(((((eclDeg - natDeg) % 360) + 540) % 360) - 180);
    for (const { aspect, angle } of CONTACT_ASPECTS) {
      const orb = Math.abs(arc - angle);
      if (orb <= CONTACT_ORB_DEG) {
        out.push({ ...targets[i], aspect, orb });
        break; // aspect angles are ≥ 90° apart — only one can be in orb
      }
    }
  }
  return out.sort((a, b) => a.orb - b.orb);
}
