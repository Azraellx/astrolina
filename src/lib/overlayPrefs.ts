// localStorage persistence for the timeline/overlay controls, mirroring the
// load/save shape of theme.ts and chartLibrary.ts.
import type { OverlayMode } from './astro/timeline';

const MODE_KEY = 'astro:overlay-mode:v1';
const DATE_KEY = 'astro:overlay-date:v1';
const PARTNER_KEY = 'astro:overlay-partner:v1';
const STEP_KEY = 'astro:overlay-step:v1';

const MODES: OverlayMode[] = [
  'off',
  'transits',
  'progressed',
  'solar-arc',
  'synastry',
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

export function loadOverlayStep(): number {
  const v = Number(localStorage.getItem(STEP_KEY));
  return Number.isFinite(v) && v > 0 ? v : 1;
}
export function saveOverlayStep(days: number) {
  localStorage.setItem(STEP_KEY, String(days));
}
