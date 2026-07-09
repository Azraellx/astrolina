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
// magnitude-isoline interval, and the display toggles: the natal chart's map
// linework (on by default), the eclipse CHART (the overlay ring in the chart
// wheel), and — HIDDEN — the eclipse-time planet/angle LINES on the map.
const ECLIPSE_ID_KEY = 'astro:eclipse-id:v1';
const ECLIPSE_ISO_STEP_KEY = 'astro:eclipse-iso-step:v1';
// Legacy key name ('…-chart-lines…') kept so existing prefs survive: it now backs
// the eclipse CHART (wheel ring) ALONE — the map lines split off to their own key.
const ECLIPSE_CHART_KEY = 'astro:eclipse-chart-lines:v1';
const ECLIPSE_MAP_LINES_KEY = 'astro:eclipse-map-lines:v1';
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

export function loadEclipseChart(): boolean {
  return localStorage.getItem(ECLIPSE_CHART_KEY) === '1';
}
export function saveEclipseChart(show: boolean) {
  localStorage.setItem(ECLIPSE_CHART_KEY, show ? '1' : '0');
}

// The eclipse-time planet/angle lines on the MAP. Off by default and opt-in: a fork can
// turn them on (e.g. from a dev console via the `astro:cheat` event in App.tsx) or just
// default them on. A plain click on the Eclipse-Chart toggle only shows the wheel ring.
export function loadEclipseMapLines(): boolean {
  return localStorage.getItem(ECLIPSE_MAP_LINES_KEY) === '1';
}
export function saveEclipseMapLines(show: boolean) {
  localStorage.setItem(ECLIPSE_MAP_LINES_KEY, show ? '1' : '0');
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
// The translucent bands around planet angle lines and parans, BOTH sized as a GROUND
// distance entered in the user's chosen unit (km or mi — one shared toggle). The line orb
// is a perpendicular halo; the paran orb becomes a ± latitude band at render (a paran is a
// horizontal latitude line, so its km orb converts via ≈111 km per degree — see
// orbBands.generateOrbBands). On by default, but gated by Advanced mode (App's
// `advancedWheel && showOrbZones`), so a fresh account first sees them when it switches to
// ADV — the same pattern as the zenith/nadir stamps (astro:show-zenith:v1, also `!== '0'`).
const ORB_ZONES_KEY = 'astro:orb-zones:v1';
const ORB_ZONE_VAL_KEY = 'astro:orb-zone-val:v1';
const ORB_ZONE_UNIT_KEY = 'astro:orb-zone-unit:v1';
// New distance key: the retired 'astro:paran-orb-deg:v1' held DEGREES, so a fresh key keeps
// an old value from being misread as km/mi (a stale "1" would be a 1 km sliver).
const PARAN_ORB_VAL_KEY = 'astro:paran-orb-val:v1';

// The line-orb band width is stored in the user's chosen unit; the map converts it to km
// (generateOrbBands) at render. Round per-unit defaults + a 25-unit step — 325 km ≈ 200 mi
// (each snaps to the other on the 25 grid), so toggling units reads as the same width.
export type DistanceUnit = 'km' | 'mi';
export const KM_PER_MI = 1.609344;
export const ORB_ZONE_STEP = 25;
export const ORB_ZONE_MIN = 25;
const ORB_ZONE_MAX: Record<DistanceUnit, number> = { km: 2000, mi: 1250 };
const ORB_ZONE_DEFAULT: Record<DistanceUnit, number> = { km: 325, mi: 200 };

/** The max line-orb width in the given unit (the floor is the shared ORB_ZONE_MIN). */
export function orbZoneMax(unit: DistanceUnit): number {
  return ORB_ZONE_MAX[unit];
}
function clampOrbZone(v: number, unit: DistanceUnit): number {
  return Math.min(Math.max(v, ORB_ZONE_MIN), ORB_ZONE_MAX[unit]);
}

export function loadShowOrbZones(): boolean {
  return localStorage.getItem(ORB_ZONES_KEY) !== '0';
}
export function saveShowOrbZones(show: boolean) {
  localStorage.setItem(ORB_ZONES_KEY, show ? '1' : '0');
}

export function loadOrbZoneUnit(): DistanceUnit {
  return localStorage.getItem(ORB_ZONE_UNIT_KEY) === 'mi' ? 'mi' : 'km';
}
export function saveOrbZoneUnit(unit: DistanceUnit) {
  localStorage.setItem(ORB_ZONE_UNIT_KEY, unit);
}

/** The line-orb width stored in `unit`; defaults to the round per-unit value, range-checked. */
export function loadOrbZoneVal(unit: DistanceUnit): number {
  const v = Number(localStorage.getItem(ORB_ZONE_VAL_KEY));
  return Number.isFinite(v) && v >= ORB_ZONE_MIN && v <= ORB_ZONE_MAX[unit]
    ? v
    : ORB_ZONE_DEFAULT[unit];
}
export function saveOrbZoneVal(val: number) {
  localStorage.setItem(ORB_ZONE_VAL_KEY, String(val));
}

/** Re-express a width when the unit switches: convert through km, snap to the 25 grid, clamp.
 *  So 325 km ↔ 200 mi, and any custom width carries across to the nearest round value. */
export function convertOrbZoneVal(val: number, from: DistanceUnit, to: DistanceUnit): number {
  if (from === to) return val;
  const km = from === 'mi' ? val * KM_PER_MI : val;
  const inTarget = to === 'mi' ? km / KM_PER_MI : km;
  return clampOrbZone(Math.round(inTarget / ORB_ZONE_STEP) * ORB_ZONE_STEP, to);
}

// The paran orb, like the line orb, is a ground distance entered in the shared unit (km or
// mi) and stored in that unit; the map converts it to a latitude band at render. Round
// per-unit defaults + a 10-unit step — 100 km ≈ 60 mi (each snaps to the other on the 10
// grid), so toggling units reads as the same width.
export const PARAN_ORB_STEP = 10;
export const PARAN_ORB_MIN = 10;
const PARAN_ORB_MAX: Record<DistanceUnit, number> = { km: 500, mi: 300 };
const PARAN_ORB_DEFAULT: Record<DistanceUnit, number> = { km: 100, mi: 60 };

/** The max paran-orb distance in the given unit (the floor is the shared PARAN_ORB_MIN). */
export function paranOrbMax(unit: DistanceUnit): number {
  return PARAN_ORB_MAX[unit];
}
function clampParanOrb(v: number, unit: DistanceUnit): number {
  return Math.min(Math.max(v, PARAN_ORB_MIN), PARAN_ORB_MAX[unit]);
}

/** The paran-orb distance stored in `unit`; defaults to the round per-unit value, range-checked. */
export function loadParanOrbVal(unit: DistanceUnit): number {
  const v = Number(localStorage.getItem(PARAN_ORB_VAL_KEY));
  return Number.isFinite(v) && v >= PARAN_ORB_MIN && v <= PARAN_ORB_MAX[unit]
    ? v
    : PARAN_ORB_DEFAULT[unit];
}
export function saveParanOrbVal(val: number) {
  localStorage.setItem(PARAN_ORB_VAL_KEY, String(val));
}

/** Re-express the paran orb when the unit switches: convert through km, snap to the 10 grid,
 *  clamp. So 100 km ↔ 60 mi, and any custom value carries across to the nearest round one. */
export function convertParanOrbVal(val: number, from: DistanceUnit, to: DistanceUnit): number {
  if (from === to) return val;
  const km = from === 'mi' ? val * KM_PER_MI : val;
  const inTarget = to === 'mi' ? km / KM_PER_MI : km;
  return clampParanOrb(Math.round(inTarget / PARAN_ORB_STEP) * PARAN_ORB_STEP, to);
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

// The Local Space window's CAPTURE section: one "Transparent Mode" toggle that shapes the
// framed export. A gated-tier surface (lib/plan), visible and applied only while the Capture
// tool is armed (App gates it on the window being open, the frame being up AND the plan
// reaching the gated rung — dropping any of those restores the map, so it can't "stick" past
// the session or a tier lapse; the pref persists for the next capture).
//
// "Transparent Mode": the clean-export preset — hides the line arrows, switches the
// local-space lines to standard (frame-edge) labels, and blanks the basemap so the export
// keeps a transparent background (a see-through PNG for laying over a floor plan or any
// backdrop of the user's own). Replaces the former separate hide-arrows / standard-labels /
// hide-map prefs; a fresh key, so an old individual value can't be misread as the mode.
const LS_TRANSPARENT_KEY = 'astro:ls-transparent:v1';
export function loadLsTransparent(): boolean {
  return localStorage.getItem(LS_TRANSPARENT_KEY) === '1';
}
export function saveLsTransparent(v: boolean) {
  localStorage.setItem(LS_TRANSPARENT_KEY, v ? '1' : '0');
}

// Transparent-export badge labels (shown in the Capture Details section in place of the wheel /
// list picker): whether each local-space badge prints the planet's name after its glyph, and
// whether the line's bearing is printed along the line. Both off by default (a glyph-only rose);
// only meaningful with Transparent mode on (App gates their effect there).
const LS_LABEL_NAME_KEY = 'astro:ls-label-name:v1';
export function loadLsLabelName(): boolean {
  return localStorage.getItem(LS_LABEL_NAME_KEY) === '1';
}
export function saveLsLabelName(v: boolean) {
  localStorage.setItem(LS_LABEL_NAME_KEY, v ? '1' : '0');
}
const LS_LINE_DEG_KEY = 'astro:ls-line-deg:v1';
export function loadLsLineDeg(): boolean {
  return localStorage.getItem(LS_LINE_DEG_KEY) === '1';
}
export function saveLsLineDeg(v: boolean) {
  localStorage.setItem(LS_LINE_DEG_KEY, v ? '1' : '0');
}

// Capture ▸ per-overlay visibility: the registered map overlays (see
// lib/extensions/mapOverlays, MapOverlay.captureToggle) the user has hidden from
// captures — stored as a JSON array of overlay ids. Like the options above, the
// hide applies only while the Capture tool is armed (App gates it); the set
// persists so the next capture opens with the same choices.
const CAPTURE_HIDE_OVERLAYS_KEY = 'astro:capture-hide-overlays:v1';
export function loadCaptureHiddenOverlays(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(CAPTURE_HIDE_OVERLAYS_KEY) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}
export function saveCaptureHiddenOverlays(ids: ReadonlySet<string>) {
  localStorage.setItem(CAPTURE_HIDE_OVERLAYS_KEY, JSON.stringify([...ids]));
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
