// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Shareable chart links: the chart's birth data + the current map view, encoded
// as a compact base64url token in a `#c=` URL fragment. The schema lives HERE —
// next to the state it serializes — because it drifts with the app's own model;
// anything downstream should call these functions, never mint tokens itself.
//
// Decoding is deliberately paranoid: the token arrives from a URL (anyone can
// mint one), so every field is type- and range-checked, strings are length-
// clamped, and ANY irregularity returns null — the app then just boots
// normally. Nothing here is executed or interpolated as markup.
import type { BirthData } from './birthData';
import {
  entrySeconds,
  MAX_ZONE_OFFSET_SECONDS,
  sanitizeTzEntry,
  type DaylightCode,
  type TzEntry,
} from './atlas/zoneEntry';

/** A camera view worth restoring: where and how close. */
export interface ShareView {
  lat: number;
  lng: number;
  zoom: number;
}

/** Everything a share link carries (v1). */
export interface ShareState {
  /** The chart itself. `tzIana` rides along when known so the restored chart
   *  keeps DST-aware timeline readouts, and `tzEntry` so it reopens in the
   *  sender's zone terms ("EST + daylight") rather than as a bare number.
   *  Composite charts are NOT shareable — their planets are parent midpoints,
   *  which a bare moment can't recast. */
  chart: BirthData & { tzIana?: string; tzEntry?: TzEntry };
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
  ze?: WireEntry; // tzEntry — how tz was stated (lib/atlas/zoneEntry); never overrides tz
  tk?: 0; // present (0) ⇔ timeKnown === false; absent ⇔ known
  pl: string; // birthplace label
  pa: number; // birthplace lat
  pg: number; // birthplace lng
  vw?: [number, number, number]; // view [lat, lng, zoom]
  pn?: [number, number]; // pin [lat, lng]
}

// A TzEntry with short keys, in the same spirit as the rest of the wire. Added
// 2026-10-02 as an OPTIONAL key of v1 rather than a v2: older decoders ignore
// keys they do not know, so links minted now still open everywhere.
type WireEntry =
  | { m: 's'; s: number; d: DaylightCode; z?: string } // standard: std, daylight, zone id
  | { m: 'o'; s: number; b?: 'lmt' | 'ut'; t?: string }; // offset: seconds, basis, text

function toWireEntry(e: TzEntry): WireEntry {
  if (e.mode === 'standard') {
    const w: WireEntry = { m: 's', s: e.std, d: e.daylight };
    if (e.zone) w.z = e.zone;
    return w;
  }
  const w: WireEntry = { m: 'o', s: e.seconds };
  if (e.basis) w.b = e.basis;
  if (e.text) w.t = e.text;
  return w;
}

function fromWireEntry(w: unknown): TzEntry | undefined {
  if (!w || typeof w !== 'object') return undefined;
  const o = w as Record<string, unknown>;
  if (o.m === 's') return sanitizeTzEntry({ mode: 'standard', std: o.s, daylight: o.d, zone: o.z });
  if (o.m === 'o') return sanitizeTzEntry({ mode: 'offset', seconds: o.s, basis: o.b, text: o.t });
  return undefined;
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

/** Encode a share state as the `#c=` token. */
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
  if (c.tzEntry) wire.ze = toWireEntry(c.tzEntry);
  if (c.timeKnown === false) wire.tk = 0;
  if (state.view) {
    wire.vw = [round(state.view.lat, 3), round(state.view.lng, 3), round(state.view.zoom, 2)];
  }
  if (state.pin) wire.pn = [round(state.pin.lat, 4), round(state.pin.lng, 4)];
  return b64urlEncode(JSON.stringify(wire));
}

/** A full shareable URL for the current origin/path.
 *
 *  The token rides in the FRAGMENT, not the query string, and that is a correctness
 *  requirement rather than a formatting choice. A fragment is never transmitted: it is
 *  not in the request line, so it reaches no access log, proxy or CDN along the way, and
 *  it is stripped from the `Referer` header sent to any third party the recipient
 *  navigates on to. A query string is in all of them.
 *
 *  The token IS the birth details — name, date, time, birthplace and its coordinates —
 *  so that distinction decides whether sharing a chart hands those details to every host
 *  the link passes through. Whoever deploys this, and whatever they undertake to their
 *  own users, the mechanism is what makes the undertaking keepable. Do not move it back
 *  into the query string. */
export function buildShareUrl(state: ShareState): string {
  return `${location.origin}${location.pathname}#${PARAM}=${encodeShareState(state)}`;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const inRange = (v: unknown, lo: number, hi: number): v is number =>
  num(v) && v >= lo && v <= hi;
const latOk = (v: unknown) => inRange(v, -90, 90);
const lngOk = (v: unknown) => inRange(v, -180, 180);

/** Decode a `#c=` token; null on ANY malformed/out-of-range content (fail safe). */
export function decodeShareState(raw: string | null | undefined): ShareState | null {
  if (!raw) return null;
  try {
    const w = JSON.parse(b64urlDecode(raw)) as Partial<Wire>;
    if (!w || w.v !== 1) return null;
    if (typeof w.n !== 'string' || typeof w.pl !== 'string') return null;
    if (!inRange(w.y, 1, 9999) || !inRange(w.mo, 1, 12) || !inRange(w.d, 1, 31)) return null;
    if (!inRange(w.h, 0, 23) || !inRange(w.mi, 0, 59)) return null;
    // The importer's and the form's bound (MAX_ZONE_OFFSET_SECONDS), not the
    // ±14 of today's zones: a stated "Chatham + double summer time" is +14:45,
    // and at ±14 its link failed to open at all (2026-10-02, found in review).
    const tzMax = MAX_ZONE_OFFSET_SECONDS / 3600;
    if (!inRange(w.tz, -tzMax, tzMax)) return null;
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
    // The one field that is dropped rather than failing the whole link: it only
    // describes `tz`, so a link whose entry does not validate — or does not add up
    // to `tz` exactly — still restores the right chart, just without the terms.
    const entry = w.ze !== undefined ? fromWireEntry(w.ze) : undefined;
    if (entry && entrySeconds(entry) === Math.round(w.tz * 3600)) chart.tzEntry = entry;
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
    // Current form: the token in the fragment (see buildShareUrl).
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const fromHash = hash.get(PARAM);
    if (fromHash) {
      const state = decodeShareState(fromHash);
      hash.delete(PARAM);
      const rest = hash.toString();
      history.replaceState(null, '', `${location.pathname}${location.search}${rest ? `#${rest}` : ''}`);
      return state;
    }
    // Legacy form. Links minted before the token moved are already sent and cannot be
    // recalled, so the query string is still READ — it is never emitted. Only the half
    // actually consumed from is rewritten, or a plain "#faq" anchor would come back
    // as "#faq=".
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
