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
  TimeUnit,
  TransitFrame,
} from './astro/timeline';

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
  'solar-arc',
  'primary-directions',
  'synastry',
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

// Default 'mean-quotidian': a no-op for both existing directed overlays (Solar Arc
// stays SA-in-longitude, Progressed keeps the progressed-RAMC angle).
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
