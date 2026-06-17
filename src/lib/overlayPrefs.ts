// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// localStorage persistence for the timeline/overlay controls, mirroring the
// load/save shape of theme.ts and chartLibrary.ts.
import type {
  AngleProgression,
  OverlayMode,
  PrimaryRate,
  RelationshipMethod,
  TimeUnit,
  TransitFrame,
} from './astro/timeline';
import { ZODIAC_MODES, type ZodiacMode } from './astro/ayanamsa';

const MODE_KEY = 'astro:overlay-mode:v1';
const DATE_KEY = 'astro:overlay-date:v1';
const PARTNER_KEY = 'astro:overlay-partner:v1';
// Stores a time-unit name (hour/day/week/month/year).
const STEP_KEY = 'astro:overlay-step:v1';
// Progressions & Directions ("Progs/Dirns") settings.
const ANGLE_PROG_KEY = 'astro:angle-progression:v1';
const PRIMARY_RATE_KEY = 'astro:primary-rate:v1';
const USER_PRIM_RATE_KEY = 'astro:user-primary-rate:v1';

const UNITS: TimeUnit[] = ['minute', 'hour', 'day', 'week', 'month', 'year'];

const MODES: OverlayMode[] = [
  'off',
  'transits',
  'progressed',
  'tertiary-progressed',
  'solar-arc',
  'primary-directions',
  'cyclo',
  'synastry',
  'eclipses',
];

const ANGLE_PROGS: AngleProgression[] = [
  'sa-long',
  'sa-ra',
  'naibod-long',
  'naibod-ra',
  'mean-quotidian',
];

const PRIMARY_RATES: PrimaryRate[] = [
  'ptolemy',
  'naibod',
  'cardan',
  'kepler-ra',
  'solar-long',
  'placidus-ra',
  'user',
];

export function loadOverlayMode(): OverlayMode {
  const v = localStorage.getItem(MODE_KEY);
  return v && (MODES as string[]).includes(v) ? (v as OverlayMode) : 'off';
}
export function saveOverlayMode(mode: OverlayMode) {
  localStorage.setItem(MODE_KEY, mode);
}

export function loadOverlayDate(): number {
  const v = Number(localStorage.getItem(DATE_KEY));
  return Number.isFinite(v) && v > 0 ? v : Date.now();
}
export function saveOverlayDate(ms: number) {
  localStorage.setItem(DATE_KEY, String(ms));
}

export function loadOverlayPartner(): string | null {
  return localStorage.getItem(PARTNER_KEY);
}
export function saveOverlayPartner(id: string | null) {
  if (id) localStorage.setItem(PARTNER_KEY, id);
  else localStorage.removeItem(PARTNER_KEY);
}

export function loadOverlayStep(): TimeUnit {
  const v = localStorage.getItem(STEP_KEY);
  return v && (UNITS as string[]).includes(v) ? (v as TimeUnit) : 'day';
}
export function saveOverlayStep(unit: TimeUnit) {
  localStorage.setItem(STEP_KEY, unit);
}

// Default 'mean-quotidian' — the storage key behind the "Natal Frame" option
// (historical name, kept for saved prefs): a no-op for both directed overlays
// (Solar Arc stays SA-in-longitude, Progressed holds the natal RAMC).
export function loadAngleProgression(): AngleProgression {
  const v = localStorage.getItem(ANGLE_PROG_KEY);
  return v && (ANGLE_PROGS as string[]).includes(v)
    ? (v as AngleProgression)
    : 'mean-quotidian';
}
export function saveAngleProgression(a: AngleProgression) {
  localStorage.setItem(ANGLE_PROG_KEY, a);
}

export function loadPrimaryRate(): PrimaryRate {
  const v = localStorage.getItem(PRIMARY_RATE_KEY);
  return v && (PRIMARY_RATES as string[]).includes(v)
    ? (v as PrimaryRate)
    : 'ptolemy';
}
export function savePrimaryRate(r: PrimaryRate) {
  localStorage.setItem(PRIMARY_RATE_KEY, r);
}

export function loadUserPrimaryRate(): number {
  const v = Number(localStorage.getItem(USER_PRIM_RATE_KEY));
  return Number.isFinite(v) && v > 0 ? v : 1;
}
export function saveUserPrimaryRate(deg: number) {
  localStorage.setItem(USER_PRIM_RATE_KEY, String(deg));
}

// Overlay positioning (relative-to-natal vs the moment's own sidereal time).
const TRANSIT_FRAME_KEY = 'astro:transit-frame:v1';
const TRANSIT_FRAMES: TransitFrame[] = ['relative-to-natal', 'transit-moment'];
export function loadTransitFrame(): TransitFrame {
  const v = localStorage.getItem(TRANSIT_FRAME_KEY);
  return v && (TRANSIT_FRAMES as string[]).includes(v)
    ? (v as TransitFrame)
    : 'relative-to-natal';
}
export function saveTransitFrame(f: TransitFrame) {
  localStorage.setItem(TRANSIT_FRAME_KEY, f);
}

// ── Eclipses overlay ─────────────────────────────────────────────────────────
// The selected eclipse (a catalog id, "YYYY-MM-DD" of greatest eclipse), the
// magnitude-isoline interval, and the two display toggles: the natal chart's
// map linework (on by default) and the "eclipse chart lines" overlay.
const ECLIPSE_ID_KEY = 'astro:eclipse-id:v1';
const ECLIPSE_ISO_STEP_KEY = 'astro:eclipse-iso-step:v1';
const ECLIPSE_CHART_LINES_KEY = 'astro:eclipse-chart-lines:v1';
const ECLIPSE_NATAL_LINES_KEY = 'astro:eclipse-natal-lines:v1';

export type EclipseIsoStep = 10 | 20 | 25;
const ECLIPSE_ISO_STEPS: EclipseIsoStep[] = [10, 20, 25];

export function loadEclipseId(): string | null {
  const v = localStorage.getItem(ECLIPSE_ID_KEY);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
export function saveEclipseId(id: string | null) {
  if (id) localStorage.setItem(ECLIPSE_ID_KEY, id);
  else localStorage.removeItem(ECLIPSE_ID_KEY);
}

export function loadEclipseIsoStep(): EclipseIsoStep {
  const v = Number(localStorage.getItem(ECLIPSE_ISO_STEP_KEY));
  return (ECLIPSE_ISO_STEPS as number[]).includes(v) ? (v as EclipseIsoStep) : 25;
}
export function saveEclipseIsoStep(step: EclipseIsoStep) {
  localStorage.setItem(ECLIPSE_ISO_STEP_KEY, String(step));
}

export function loadEclipseChartLines(): boolean {
  return localStorage.getItem(ECLIPSE_CHART_LINES_KEY) === '1';
}
export function saveEclipseChartLines(show: boolean) {
  localStorage.setItem(ECLIPSE_CHART_LINES_KEY, show ? '1' : '0');
}

// Kept separate from the time overlays' Natal Chart toggle: that one PROMOTES
// the overlay to stand in for the chart, while this simply clears the natal
// linework off the map so the eclipse path stands alone.
export function loadEclipseNatalLines(): boolean {
  return localStorage.getItem(ECLIPSE_NATAL_LINES_KEY) !== '0';
}
export function saveEclipseNatalLines(show: boolean) {
  localStorage.setItem(ECLIPSE_NATAL_LINES_KEY, show ? '1' : '0');
}

// ── Orb-of-influence zones ───────────────────────────────────────────────────
// The translucent bands around planet angle lines (a ground distance, km) and
// parans (degrees of latitude, the conventional paran orb). On by default, but
// gated by Advanced mode (App's `advancedWheel && showOrbZones`), so a fresh
// account first sees them when it switches to ADV — the same pattern as the
// zenith/nadir stamps (astro:show-zenith:v1, also `!== '0'`).
const ORB_ZONES_KEY = 'astro:orb-zones:v1';
const ORB_ZONE_KM_KEY = 'astro:orb-zone-km:v1';
const PARAN_ORB_DEG_KEY = 'astro:paran-orb-deg:v1';

export function loadShowOrbZones(): boolean {
  return localStorage.getItem(ORB_ZONES_KEY) !== '0';
}
export function saveShowOrbZones(show: boolean) {
  localStorage.setItem(ORB_ZONES_KEY, show ? '1' : '0');
}

export function loadOrbZoneKm(): number {
  const v = Number(localStorage.getItem(ORB_ZONE_KM_KEY));
  return Number.isFinite(v) && v >= 10 && v <= 2000 ? v : 150;
}
export function saveOrbZoneKm(km: number) {
  localStorage.setItem(ORB_ZONE_KM_KEY, String(km));
}

export function loadParanOrbDeg(): number {
  const v = Number(localStorage.getItem(PARAN_ORB_DEG_KEY));
  return Number.isFinite(v) && v >= 0.25 && v <= 5 ? v : 1.5;
}
export function saveParanOrbDeg(deg: number) {
  localStorage.setItem(PARAN_ORB_DEG_KEY, String(deg));
}

// Night-side shading (Filters ▸ Night Shading): the hemisphere where the Sun
// is below the horizon at the displayed moment. Off by default.
const NIGHT_SHADE_KEY = 'astro:night-shade:v1';

export function loadShowNightShade(): boolean {
  return localStorage.getItem(NIGHT_SHADE_KEY) === '1';
}
export function saveShowNightShade(show: boolean) {
  localStorage.setItem(NIGHT_SHADE_KEY, show ? '1' : '0');
}

// Zodiac reading frame: tropical (default) or sidereal by ayanamsa. Display
// layer only — the map lines mark zodiac-independent angular events.
const ZODIAC_MODE_KEY = 'astro:zodiac-mode:v1';

export function loadZodiacMode(): ZodiacMode {
  const v = localStorage.getItem(ZODIAC_MODE_KEY);
  return v && (ZODIAC_MODES as string[]).includes(v) ? (v as ZodiacMode) : 'tropical';
}
export function saveZodiacMode(m: ZodiacMode) {
  localStorage.setItem(ZODIAC_MODE_KEY, m);
}

// Where local-space lines radiate from: the active pin (default — relocated
// local space) or always the birthplace.
const LS_ORIGIN_KEY = 'astro:ls-origin:v1';

export type LsOriginPref = 'pin' | 'birthplace';
const LS_ORIGINS: LsOriginPref[] = ['pin', 'birthplace'];

export function loadLsOrigin(): LsOriginPref {
  const v = localStorage.getItem(LS_ORIGIN_KEY);
  return v && (LS_ORIGINS as string[]).includes(v) ? (v as LsOriginPref) : 'pin';
}
export function saveLsOrigin(o: LsOriginPref) {
  localStorage.setItem(LS_ORIGIN_KEY, o);
}

// Local-space line/compass visibility (Location view). Both use "hide" polarity so
// the stored default (absent / not '1') leaves everything shown — the prior behavior.
const LS_HIDE_INBOUND_KEY = 'astro:ls-hide-inbound:v1';
export function loadLsHideInbound(): boolean {
  return localStorage.getItem(LS_HIDE_INBOUND_KEY) === '1';
}
export function saveLsHideInbound(v: boolean) {
  localStorage.setItem(LS_HIDE_INBOUND_KEY, v ? '1' : '0');
}

const LS_HIDE_COMPASS_KEY = 'astro:ls-hide-compass:v1';
export function loadLsHideCompass(): boolean {
  return localStorage.getItem(LS_HIDE_COMPASS_KEY) === '1';
}
export function saveLsHideCompass(v: boolean) {
  localStorage.setItem(LS_HIDE_COMPASS_KEY, v ? '1' : '0');
}

// (The 'progressed' vs 'tertiary-progressed' choice is now two separate Overlay-menu
// modes — see OverlayMode / loadOverlayMode — so there's no separate clock pref.)

// ── Fixed-star lines ─────────────────────────────────────────────────────────
const STAR_LINES_KEY = 'astro:star-lines:v1';
const STAR_SET_KEY = 'astro:star-set:v1';

export type StarSetPref = 'bright' | 'all';
const STAR_SETS: StarSetPref[] = ['bright', 'all'];

export function loadShowStarLines(): boolean {
  return localStorage.getItem(STAR_LINES_KEY) === '1';
}
export function saveShowStarLines(show: boolean) {
  localStorage.setItem(STAR_LINES_KEY, show ? '1' : '0');
}

export function loadStarSet(): StarSetPref {
  const v = localStorage.getItem(STAR_SET_KEY);
  return v && (STAR_SETS as string[]).includes(v) ? (v as StarSetPref) : 'bright';
}
export function saveStarSet(s: StarSetPref) {
  localStorage.setItem(STAR_SET_KEY, s);
}

// Which relationship-chart method the Synastry overlay's Generate button uses.
const SYNASTRY_METHOD_KEY = 'astro:synastry-method:v1';
const RELATIONSHIP_METHODS: RelationshipMethod[] = ['davison', 'composite'];
export function loadSynastryMethod(): RelationshipMethod {
  const v = localStorage.getItem(SYNASTRY_METHOD_KEY);
  return v && (RELATIONSHIP_METHODS as string[]).includes(v)
    ? (v as RelationshipMethod)
    : 'davison';
}
export function saveSynastryMethod(m: RelationshipMethod) {
  localStorage.setItem(SYNASTRY_METHOD_KEY, m);
}
