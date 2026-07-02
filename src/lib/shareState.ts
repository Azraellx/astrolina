// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Shareable chart links: the chart's birth data + the current map view, encoded
// as a compact base64url token in a `?c=` query param. The schema lives HERE —
// next to the state it serializes — because it drifts with the app's own model;
// anything downstream should call these functions, never mint tokens itself.
//
// Decoding is deliberately paranoid: the token arrives from a URL (anyone can
// mint one), so every field is type- and range-checked, strings are length-
// clamped, and ANY irregularity returns null — the app then just boots
// normally. Nothing here is executed or interpolated as markup.
import type { BirthData } from './birthData';

/** A camera view worth restoring: where and how close. */
export interface ShareView {
  lat: number;
  lng: number;
  zoom: number;
}

/** Everything a share link carries (v1). */
export interface ShareState {
  /** The chart itself. `tzIana` rides along when known so the restored chart
   *  keeps DST-aware timeline readouts. Composite charts are NOT shareable —
   *  their planets are parent midpoints, which a bare moment can't recast. */
  chart: BirthData & { tzIana?: string };
  /** The camera at share time (absent → the default first-load framing). */
  view?: ShareView | null;
  /** The placed pin (absent → none). */
  pin?: { lat: number; lng: number } | null;
}

const PARAM = 'c';
const NAME_MAX = 50; // chartLibrary.NAME_HARD_LIMIT (kept literal: no value import cycles)
const LABEL_MAX = 120;

// Compact wire form (short keys keep the URL readable). Versioned so a future
// schema can evolve without breaking old links.
interface Wire {
  v: 1;
  n: string; // name
  y: number; // year
  mo: number;
  d: number;
  h: number;
  mi: number;
  tz: number; // tzOffset (hours)
  zi?: string; // tzIana
  tk?: 0; // present (0) ⇔ timeKnown === false; absent ⇔ known
  pl: string; // birthplace label
  pa: number; // birthplace lat
  pg: number; // birthplace lng
  vw?: [number, number, number]; // view [lat, lng, zoom]
  pn?: [number, number]; // pin [lat, lng]
}

const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

const b64urlEncode = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const b64urlDecode = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
};

/** Encode a share state as the `?c=` token. */
export function encodeShareState(state: ShareState): string {
  const c = state.chart;
  const wire: Wire = {
    v: 1,
    n: c.name.slice(0, NAME_MAX),
    y: c.year,
    mo: c.month,
    d: c.day,
    h: c.hour,
    mi: c.minute,
    tz: c.tzOffset,
    pl: c.birthplace.label.slice(0, LABEL_MAX),
    pa: round(c.birthplace.lat, 4),
    pg: round(c.birthplace.lng, 4),
  };
  if (c.tzIana) wire.zi = c.tzIana;
  if (c.timeKnown === false) wire.tk = 0;
  if (state.view) {
    wire.vw = [round(state.view.lat, 3), round(state.view.lng, 3), round(state.view.zoom, 2)];
  }
  if (state.pin) wire.pn = [round(state.pin.lat, 4), round(state.pin.lng, 4)];
  return b64urlEncode(JSON.stringify(wire));
}

/** A full shareable URL for the current origin/path. */
export function buildShareUrl(state: ShareState): string {
  return `${location.origin}${location.pathname}?${PARAM}=${encodeShareState(state)}`;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const inRange = (v: unknown, lo: number, hi: number): v is number =>
  num(v) && v >= lo && v <= hi;
const latOk = (v: unknown) => inRange(v, -90, 90);
const lngOk = (v: unknown) => inRange(v, -180, 180);

/** Decode a `?c=` token; null on ANY malformed/out-of-range content (fail safe). */
export function decodeShareState(raw: string | null | undefined): ShareState | null {
  if (!raw) return null;
  try {
    const w = JSON.parse(b64urlDecode(raw)) as Partial<Wire>;
    if (!w || w.v !== 1) return null;
    if (typeof w.n !== 'string' || typeof w.pl !== 'string') return null;
    if (!inRange(w.y, 1, 9999) || !inRange(w.mo, 1, 12) || !inRange(w.d, 1, 31)) return null;
    if (!inRange(w.h, 0, 23) || !inRange(w.mi, 0, 59)) return null;
    if (!inRange(w.tz, -14, 14)) return null;
    if (!latOk(w.pa) || !lngOk(w.pg)) return null;
    if (w.zi !== undefined && typeof w.zi !== 'string') return null;

    const chart: ShareState['chart'] = {
      name: w.n.slice(0, NAME_MAX),
      year: w.y,
      month: w.mo,
      day: w.d,
      hour: w.h,
      minute: w.mi,
      tzOffset: w.tz,
      birthplace: { label: w.pl.slice(0, LABEL_MAX), lat: w.pa, lng: w.pg },
    };
    if (w.zi) chart.tzIana = w.zi.slice(0, 60);
    if (w.tk === 0) chart.timeKnown = false;

    const state: ShareState = { chart };
    if (Array.isArray(w.vw) && w.vw.length === 3) {
      const [la, ln, z] = w.vw;
      if (latOk(la) && lngOk(ln) && inRange(z, 0, 22)) state.view = { lat: la, lng: ln, zoom: z };
    }
    if (Array.isArray(w.pn) && w.pn.length === 2) {
      const [la, ln] = w.pn;
      if (latOk(la) && lngOk(ln)) state.pin = { lat: la, lng: ln };
    }
    return state;
  } catch {
    return null;
  }
}

/**
 * Read and CONSUME the share param from the current URL: decode it, then strip
 * it from the address bar (history.replaceState) so a refresh doesn't re-import
 * and the token doesn't linger for copy-paste confusion. Call once at boot.
 */
export function consumeShareParam(): ShareState | null {
  try {
    const params = new URLSearchParams(location.search);
    const raw = params.get(PARAM);
    if (!raw) return null;
    const state = decodeShareState(raw);
    params.delete(PARAM);
    const rest = params.toString();
    history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
    return state;
  } catch {
    return null;
  }
}

/** Whether an existing chart is (for share purposes) the same chart — the EXACT
 *  same name and birth data (moment, time-known-ness, place). Used to avoid
 *  duplicating a chart every time the same link opens: on a match the existing
 *  chart is simply selected. A renamed or edited chart no longer matches, so the
 *  link then imports the sender's version alongside it. */
export function matchesSharedChart(existing: BirthData, shared: BirthData): boolean {
  return (
    existing.name.trim() === shared.name.trim() &&
    existing.year === shared.year &&
    existing.month === shared.month &&
    existing.day === shared.day &&
    existing.hour === shared.hour &&
    existing.minute === shared.minute &&
    (existing.timeKnown === false) === (shared.timeKnown === false) &&
    Math.abs(existing.birthplace.lat - shared.birthplace.lat) < 5e-4 &&
    Math.abs(existing.birthplace.lng - shared.birthplace.lng) < 5e-4
  );
}
