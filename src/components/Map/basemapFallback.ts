// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The live basemap on a network that is dead while the browser still says it is online, or that
// dies while the map is open.
//
// Map.tsx opens on its self-contained offline style when navigator.onLine is false. But onLine only
// knows whether the device has a network: a captive portal, a Wi-Fi that has stopped answering or a
// blocked tile host all leave it true, and the live style then waits on requests that fail (the
// chart lines on the style's bare background, no world outline) or never come back (no basemap).
// The chart layers don't wait for any of that: they are built at the first `style.load`, and what
// they could still be held by — a chart tile with text waits on its glyph ranges — is given a bound
// on both styles (BOUNDED and PATIENT below). So the map watches each live load it starts — closely
// until its first basemap tile, lightly from then on, for a connection lost mid-session — falls back
// to the offline style once the basemap has demonstrably failed, and probes for the way back. A
// rendering fallback, not a setting: nothing is stored and nothing is announced beyond what an
// offline start already shows.
import maplibregl from 'maplibre-gl';
import type {
  RequestParameters,
  ResourceType,
  SourceSpecification,
  StyleSpecification,
} from 'maplibre-gl';

export type BasemapMode = 'live' | 'offline';

/** How long a live load may go without one basemap tile before it counts as failed. Only requests
 *  that HANG wait this long: when they fail, the map settles with errors and no tile, and that is
 *  the verdict at once. Measured on DevTools' "Slow 4G" preset (562.5 ms round trips, 1.44 Mbit/s)
 *  with an empty HTTP cache, the first tile landed 6.4 s after the map was made on an installed
 *  app and 7.1 s on a first visit. 12 s leaves that link room for a worse moment, and still ends
 *  well before a connection attempt into nothing gives up on its own — tens of seconds (Windows'
 *  defaults retry the handshake four times from a 1 s timeout: about 31 s), all of them without a
 *  single chart line. A link slower still is told apart by asking the tile host halfway through
 *  (see watchLiveBasemap). Counted only while the page is visible: a background tab doesn't draw,
 *  so it loads no tiles either. */
export const LIVE_BASEMAP_WAIT_MS = 12_000;

// Both styles reach the tile host through a MapLibre protocol of ours that re-issues the same https
// URL and gives up on a request that doesn't answer. MapLibre itself never does — and on a network
// that answers nothing, whatever it is waiting for it waits for indefinitely.
//
// BOUNDED: the offline style's glyph ranges. It still asks the live host for them, so chart-line text
// can reuse the copies a cache holds; offline those requests are answered from a cache or fail at
// once, and a range that fails is drawn with a local font. On a network that answers nothing they
// would hang instead — and MapLibre holds every chart tile that carries text until its ranges settle,
// the lines in it included. A short wait, counted from the start: on this style a range only ever
// comes from a cache, which answers in milliseconds.
//
// PATIENT: the live style's sprite and glyph ranges (transformBasemapRequest). A sprite request that
// never answers holds MapLibre's `load` and every `idle` after it — the style counts as loading until
// its sprite settles — and every basemap tile that draws an icon or a pattern: on Dark that is every
// tile at every zoom (its city dots), on Glass every tile from z3, on Earth none. A glyph range that
// never answers holds every tile with text, the chart's included. Once the chart stopped waiting for
// `load` those were what a hung sprite still held: on Dark the whole basemap — black under the chart
// lines for as long as it hung (measured 2026-10-01), with the start-up watch satisfied by the tile
// host's answer at halfway, so no fallback either; the verdict on a map that settled with failed
// requests, which needs `idle`; and Capture's settle-wait, which used its whole budget on every shot
// while a tile in view waited. PATIENT gives up only after LIVE_BASEMAP_WAIT_MS in which not one byte
// arrived — counted from the request, then from the last bytes — so a slow download is never cut,
// only a silent one. Measured, the sprite never answering: Dark's first tile 0.05 s after the sprite
// was given up, `load` 0.2 s after; the chart lines at 2.2 s throughout. The clock's start includes
// the wait for the first byte, and a give-up lasts for the style (MapLibre keeps a rejected glyph
// range; the sprite isn't asked again until a theme change or a swap) — so measured on DevTools' 3G
// preset too (2026-10-01, the page's own requests, cache off): the sprite in 2.2 s and 3.1 s, every
// range's first bytes within 2.3 s, the slowest done at 11 s with bytes arriving throughout. Nothing
// came near the cut. Not re-asked after a give-up on purpose: against a sprite that never answers,
// each re-ask would hold `load` and `idle` for another 12 s.
//
// A request given up is a failure of THAT request, not of the basemap: the sprite's icons are left out
// (Map.tsx fills each image a tile asks for and doesn't have with a transparent pixel) and a range is
// drawn with a local font, while whether the basemap works is still decided by its tiles. Sending the
// map to the fallback for a hung sprite instead would cycle: the probe checks a tile, not the sprite,
// so it would answer, the live style would ask for the same sprite, and the basemap would swap under
// the reader at every probe — the cycle the probe's tile was added to end.
const BOUNDED = 'bounded-https';
const OFFLINE_GLYPH_WAIT_MS = 3000;
const PATIENT = 'patient-https';

// Re-issue a protocol request over https, abandoned after `waitMs` — from the start, or with `quiet`,
// from the last bytes to arrive. Answers in the form MapLibre asked for: parsed for a sprite's JSON,
// the bytes for its image and for a glyph range.
async function fetchBounded(
  params: RequestParameters,
  abort: AbortController,
  scheme: string,
  waitMs: number,
  quiet: boolean,
): Promise<{ data: unknown }> {
  const url = params.url.replace(`${scheme}://`, 'https://');
  const ac = new AbortController();
  let cut = 0;
  const arm = () => {
    window.clearTimeout(cut);
    cut = window.setTimeout(() => ac.abort(), waitMs);
  };
  const onAbort = () => ac.abort();
  abort.signal.addEventListener('abort', onAbort);
  arm();
  try {
    const res = await fetch(url, {
      headers: params.headers as HeadersInit | undefined,
      credentials: params.credentials,
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    let bytes: ArrayBuffer;
    if (quiet && res.body) {
      arm();
      const reader = res.body.getReader();
      const parts: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        arm();
        parts.push(value);
        size += value.byteLength;
      }
      const all = new Uint8Array(size);
      let at = 0;
      for (const p of parts) {
        all.set(p, at);
        at += p.byteLength;
      }
      bytes = all.buffer;
    } else {
      bytes = await res.arrayBuffer();
    }
    if (params.type === 'json') return { data: JSON.parse(new TextDecoder().decode(bytes)) };
    if (params.type === 'string') return { data: new TextDecoder().decode(bytes) };
    return { data: bytes };
  } catch (err) {
    // Said plainly in the console, where an abort would read as nothing at all.
    if (ac.signal.aborted && !abort.signal.aborted) {
      throw new Error(`No answer in ${waitMs / 1000} s: ${url}`, { cause: err });
    }
    throw err;
  } finally {
    window.clearTimeout(cut);
    abort.signal.removeEventListener('abort', onAbort);
  }
}
maplibregl.addProtocol(BOUNDED, (params, abort) =>
  fetchBounded(params, abort, BOUNDED, OFFLINE_GLYPH_WAIT_MS, false),
);
maplibregl.addProtocol(PATIENT, (params, abort) =>
  fetchBounded(params, abort, PATIENT, LIVE_BASEMAP_WAIT_MS, true),
);
/** An https URL template, fetched with the offline style's bounded wait (BOUNDED above). */
export const boundedWait = (url: string): string => url.replace(/^https:\/\//, `${BOUNDED}://`);

/** The map's `transformRequest`: the live style's sprite and glyph ranges go through PATIENT. Every
 *  other request, and anything not plain https (the offline style's BOUNDED glyphs), is left as it
 *  is. Same URL on the wire, so a service worker's rule for it still sees it. */
export function transformBasemapRequest(
  url: string,
  type?: ResourceType,
): RequestParameters | undefined {
  const kind = type as string | undefined;
  if (kind !== 'SpriteJSON' && kind !== 'SpriteImage' && kind !== 'Glyphs') return undefined;
  if (!url.startsWith('https://')) return undefined;
  return { url: `${PATIENT}://${url.slice('https://'.length)}` };
}

/** When to ask again while on the fallback: soon at first (a portal signed into, a Wi-Fi that came
 *  back), then doubling to a five-minute cap — the tile host is someone else's server, and one
 *  that is down for everyone shouldn't hear from every open map every few seconds. The light watch
 *  spaces the probes it makes on a live map by the same steps. */
const PROBE_DELAYS_MS = [10_000, 20_000, 40_000, 80_000, 160_000, 300_000];

/** How long the live map must hold before the next outage starts that schedule over: its longest
 *  wait. A live load landing used to start it over at once, which was harmless while a live map,
 *  once drawn, was never looked at again. With the light watch below a link that keeps dropping —
 *  answering a probe, then failing the tiles — would be swapped out and back at the first interval
 *  for as long as it kept doing it; now each round comes later, as the schedule says. */
const HOLD_MS = PROBE_DELAYS_MS[PROBE_DELAYS_MS.length - 1];

/** How long basemap tiles may be out on a live map with none landing before the light watch asks:
 *  the wait a live load gets for its first tile. Not half of it, as the start-up's own ask is: on a
 *  healthy connection to the real tile host, a minute of pans to new places went 6 s with tiles out
 *  and none landing three times (2026-10-01), each one a probe for nothing. A probe here is only a
 *  question — a slow link answers it and nothing changes — but a healthy map shouldn't be asking. */
const STALL_MS = LIVE_BASEMAP_WAIT_MS;

/** How long the browser must stay offline before the light watch acts on it. A Wi-Fi that drops
 *  and comes straight back is an `offline` and an `online` event a moment apart, and following
 *  each one would swap the whole basemap out and back for nothing: ten flips 150 ms apart moved
 *  the map eleven times, and the last swap, made by a probe that had failed while offline, left it
 *  on the outline under a working network (2026-10-01). */
const OFFLINE_GRACE_MS = 1000;

type WatchedEvent = {
  error?: unknown;
  sourceId?: string;
  source?: { type?: string };
  tile?: unknown;
};

// The basemap's own sources, as against the app's: every chart source is GeoJSON the app adds
// itself, so anything else belongs to the basemap (the split basemapStyle.isBasemapLayer makes).
const fromBasemap = (e: WatchedEvent): boolean =>
  !!e.sourceId && e.source?.type !== undefined && e.source.type !== 'geojson';

// MapLibre reports every failed request — refused, unreachable, or answered with an error status —
// as an AJAXError, which carries the URL. The ErrorEvents the app can cause itself (a layer not
// there yet) carry none, and must never read as a dead network.
const isRequestError = (e: WatchedEvent): boolean =>
  typeof (e.error as { url?: unknown } | null | undefined)?.url === 'string';

// MapLibre prints an error to the console only while nothing listens for errors, and a live map is
// now watched for as long as it stays: each watch passes every error on, so the console still shows
// them all — the app's own mistakes (a layer not there yet) included.
const report = (e: WatchedEvent): void => console.error(e.error);

// A failed request asks MapLibre for no new frame, and `idle` only fires at the end of one: a map
// whose last requests failed after it had stopped moving was loaded, still, and silent — refused
// tiles after a pan, then 12 s without an `idle` (measured 2026-10-01). One frame lets it say so;
// an error storm asks for it many times and gets one.
const askForFrame = (map: maplibregl.Map): void => map.triggerRepaint();

// Whether a basemap source still has requests out — its TileJSON or an in-view tile. Reached
// through the layers rather than getStyle(), which would serialize every chart source's GeoJSON.
function basemapPending(map: maplibregl.Map): boolean {
  try {
    const ids = new Set(map.getLayersOrder().map((id) => map.getLayer(id)?.source));
    return [...ids].some(
      (id) => !!id && map.getSource(id)?.type !== 'geojson' && !map.isSourceLoaded(id),
    );
  } catch {
    return true;
  }
}

// Where to ask whether the tile host answers: the TileJSON of the basemap's tile source, or before
// the style has landed, the style — unless that is the app's own (Earth's ships with the app, and
// its worker would answer for it), which says nothing about the tile host.
function hostUrl(map: maplibregl.Map, styleUrl: string): string | null {
  try {
    for (const id of new Set(map.getLayersOrder().map((l) => map.getLayer(l)?.source))) {
      const src = id ? map.getSource(id) : undefined;
      const url = src && src.type !== 'geojson' ? (src as { url?: unknown }).url : undefined;
      if (typeof url === 'string') return new URL(url, location.href).href;
    }
  } catch {
    /* no style yet */
  }
  const style = new URL(styleUrl, location.href);
  return style.origin === location.origin ? null : style.href;
}

/** Watch the live style just requested. Until its first basemap tile, closely: `onOk` at that tile,
 *  `onFail` once the load has demonstrably failed — the style itself could not be fetched; the map
 *  settled with a failed basemap request and not one tile; or `deadlineMs` passed with neither a
 *  tile nor a settled basemap. A null deadline leaves only the first two, for a load the tile host
 *  has just shown it answers (see the recovery below). From the first tile on, lightly, for as long
 *  as the style stays: see holdLiveBasemap. Register it BEFORE the setStyle it watches: a style can
 *  land inside that call. Returns the disposer, which ends both.
 *
 *  Halfway to the deadline with no tile, it asks the tile host whether it answers at all: one
 *  `no-store` request, done as soon as its response starts — a round trip, not a download. A host
 *  that answers is on a slow link, not a dead one, and the deadline goes as it does after a probe.
 *  On DevTools' "3G" preset (2 s round trips) the first tile takes about 20 s, and falling back at
 *  12 s only delayed it: the way back started the load again from nothing (measured, 2026-09-30:
 *  offline at 12 s, live again at 24 s, the first tile at 45 s). A healthy start has its tile long
 *  before halfway and asks nothing; a dead network doesn't answer, and falls back at the deadline. */
export function watchLiveBasemap(
  map: maplibregl.Map,
  deadlineMs: number | null,
  styleUrl: string,
  on: { ok: () => void; fail: () => void },
): () => void {
  let styleLoaded = false;
  let requestFailed = false;
  let timer = 0;
  let halfway = 0;
  let asking: AbortController | null = null;
  let answered = false;
  let held: (() => void) | null = null;
  // The close watch, until the first tile.
  const endClose = () => {
    window.clearTimeout(timer);
    window.clearTimeout(halfway);
    asking?.abort();
    document.removeEventListener('visibilitychange', arm);
    map.off('style.load', onStyleLoad);
    map.off('sourcedata', onData);
    map.off('error', onError);
    map.off('idle', onIdle);
  };
  const stop = () => {
    endClose();
    held?.();
    held = null;
  };
  // Every verdict ends the watch BEFORE the swap it causes, so the swap's own aborted and failed
  // requests can't reach it.
  const fail = () => {
    stop();
    on.fail();
  };
  const onStyleLoad = () => {
    styleLoaded = true;
  };
  const onData = (e: WatchedEvent) => {
    if (!e.tile || !fromBasemap(e)) return;
    endClose();
    held = holdLiveBasemap(map, styleUrl, fail);
    on.ok();
  };
  const onError = (e: WatchedEvent) => {
    report(e);
    if (!isRequestError(e)) return;
    // Before the style has landed, a failed request that no source claims is the style itself.
    if (!styleLoaded && !e.sourceId) return fail();
    if (!fromBasemap(e)) return;
    requestFailed = true;
    askForFrame(map);
  };
  // Settled — every request answered or failed — and the only word from the basemap was a failure.
  const onIdle = () => {
    if (requestFailed) fail();
  };
  const onDeadline = () => {
    // Settled without a failure is a basemap with nothing to fetch (every layer hidden), not a
    // dead one: stand down rather than swap — to the light watch, for the tiles it fetches once
    // shown again.
    if (!styleLoaded || requestFailed || basemapPending(map)) return fail();
    endClose();
    held = holdLiveBasemap(map, styleUrl, fail);
  };
  const askHost = async () => {
    const url = hostUrl(map, styleUrl);
    if (!url || asking) return;
    const ac = (asking = new AbortController());
    try {
      const res = await fetch(url, { cache: 'no-store', signal: ac.signal });
      if (!res.ok) return;
      answered = true;
      window.clearTimeout(timer);
      window.clearTimeout(halfway);
    } catch {
      /* no answer: the deadline decides */
    } finally {
      ac.abort(); // the response's start was the answer; its body isn't wanted
      if (asking === ac) asking = null;
    }
  };
  // The wait restarts whenever the page comes back into view.
  function arm() {
    window.clearTimeout(timer);
    window.clearTimeout(halfway);
    if (deadlineMs === null || answered || document.hidden) return;
    timer = window.setTimeout(onDeadline, deadlineMs);
    halfway = window.setTimeout(() => void askHost(), deadlineMs / 2);
  }
  map.on('style.load', onStyleLoad);
  map.on('sourcedata', onData);
  map.on('error', onError);
  map.on('idle', onIdle);
  document.addEventListener('visibilitychange', arm);
  arm();
  return stop;
}

// The light watch: a live map that has drawn, and the connection lost under it (2026-10-01). Until
// then the watch ended at the first tile, so a network that died mid-session left the tiles already
// drawn in place and every area panned to afterwards blank, for the rest of the session. Accepted with
// the fix: the swap it makes replaces the detail already drawn with the outline, as a failed start
// does; the chart lines stay throughout, as on every swap.
//
// It never decides on the map's word alone. Something raises a doubt, and a probe — the same
// tile-checked probe the way back uses — settles it:
//  - the map settles (`idle`) with a basemap request failed and no basemap tile landed since;
//  - basemap tiles are out and none has landed for STALL_MS: requests that hang never let the map
//    settle, and neither does a chart that keeps changing (a playing timeline), so this is also the
//    backstop for a failure the map doesn't settle after.
// A probe that fails is the verdict: `fail`, the swap a failed start makes. One that answers clears
// the doubt — the failures were those tiles', not the network's (a host refusing a few tiles keeps
// the detail it drew) — and spaces the next probe by the recovery's schedule, a step further with
// each answer, so a host that keeps failing some tiles is asked now and then, not at every pan. A
// failed probe is let go if a tile landed while it was out, and asked again if the browser came back
// online meanwhile: that failure was about a network that has since returned.
//
// The browser's `offline` event is the other way in, and needs no probe: while the browser says it
// is offline every request fails at once, so nothing could answer one. It acts once the browser has
// stayed offline for OFFLINE_GRACE_MS, and in the meantime no probe is made.
//
// Cheap while healthy: listeners only. The one timer runs only while basemap tiles are out or a
// failure is unanswered, and stops once neither is true; nothing is asked while the page is hidden
// (on return, a doubt still standing is settled then).
function holdLiveBasemap(map: maplibregl.Map, styleUrl: string, fail: () => void): () => void {
  let doubt = false;
  let stall = 0;
  let stallFrom = 0; // when the stall clock started: armed, or the last tile landed
  let later = 0;
  let offlineWait = 0;
  let onlineAt = 0;
  let quietUntil = 0;
  let answers = 0;
  let probing: AbortController | null = null;
  const dispose = () => {
    window.clearTimeout(stall);
    window.clearTimeout(later);
    window.clearTimeout(offlineWait);
    stall = 0;
    probing?.abort();
    probing = null;
    map.off('sourcedata', onData);
    map.off('sourcedataloading', onLoading);
    map.off('error', onError);
    map.off('idle', onIdle);
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
  };
  const settle = async () => {
    window.clearTimeout(later);
    // Offline, the `offline` event's wait decides (and `online` brings the doubt back here).
    if (!doubt || probing || document.hidden || !navigator.onLine) return;
    const wait = quietUntil - Date.now();
    if (wait > 0) {
      later = window.setTimeout(() => void settle(), wait);
      return;
    }
    const ac = (probing = new AbortController());
    const askedAt = Date.now();
    // On a network that answers nothing the probe must end too — at the wait a live load gets.
    const cut = window.setTimeout(() => ac.abort(), LIVE_BASEMAP_WAIT_MS);
    const ok = await probeLiveBasemap(styleUrl, ac.signal);
    window.clearTimeout(cut);
    if (probing !== ac) return; // disposed meanwhile
    probing = null;
    if (ok) {
      doubt = false;
      quietUntil = Date.now() + PROBE_DELAYS_MS[Math.min(answers++, PROBE_DELAYS_MS.length - 1)];
      return;
    }
    if (!navigator.onLine) return;
    if (onlineAt >= askedAt) return void settle();
    if (doubt) fail();
  };
  const armStall = () => {
    if (stall) return;
    stallFrom = Date.now();
    stall = window.setTimeout(onStall, STALL_MS);
  };
  function onStall() {
    stall = 0;
    if (document.hidden) return; // picked up on the return to view
    const quiet = Date.now() - stallFrom;
    if (quiet < STALL_MS) {
      stall = window.setTimeout(onStall, STALL_MS - quiet);
      return;
    }
    if (doubt || basemapPending(map)) {
      doubt = true;
      void settle();
    }
  }
  function onData(e: WatchedEvent) {
    if (!e.tile || !fromBasemap(e)) return;
    doubt = false;
    stallFrom = Date.now();
  }
  function onLoading(e: WatchedEvent) {
    if (e.tile && fromBasemap(e)) armStall();
  }
  function onError(e: WatchedEvent) {
    report(e);
    if (!isRequestError(e) || !fromBasemap(e)) return;
    doubt = true;
    armStall();
    askForFrame(map);
  }
  function onIdle() {
    if (doubt) void settle();
  }
  function onOffline() {
    window.clearTimeout(offlineWait);
    offlineWait = window.setTimeout(() => {
      if (!navigator.onLine) fail();
    }, OFFLINE_GRACE_MS);
  }
  function onOnline() {
    window.clearTimeout(offlineWait);
    onlineAt = Date.now();
    if (doubt) void settle();
  }
  function onVisible() {
    if (document.hidden) return;
    if (doubt) void settle();
    else if (basemapPending(map)) armStall();
  }
  map.on('sourcedata', onData);
  map.on('sourcedataloading', onLoading);
  map.on('error', onError);
  map.on('idle', onIdle);
  window.addEventListener('offline', onOffline);
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  // Taken over while the browser is ALREADY offline — a first tile answered from the HTTP cache
  // after the network dropped, or the deadline standing down to this watch — there is no
  // `offline` event to come, and settle() holds off while offline: nothing would ever act, and
  // the live style would sit there with blank tiles until the browser came back. So treat it as
  // the event, with the same grace.
  if (!navigator.onLine) onOffline();
  return dispose;
}

// Whether the live basemap could load now. It asks for what the live style needs from the network,
// in the order the map would: the style (remote for Glass and Dark; for Earth a copy that ships with
// the app), the TileJSON of its tile source, and then ONE TILE. `no-store`, so the HTTP cache can't
// answer for a network that is still down; a captive portal's sign-in page fails the JSON parse, as
// it should.
//
// The tile is what makes the answer mean "the basemap would draw" rather than "the tile host has a
// front door" (2026-09-30). Without it, a partial outage — the TileJSON answering while every tile
// fails — passed every probe, sent the map back to the live style, failed again, and fell back
// again: the whole basemap swapping under the reader once per probe interval, for as long as the
// outage lasted. The tile is the world at the source's lowest zoom, and only its response's start is
// waited for: the body is dropped unread, so the question costs a round trip, not a download.
async function probeLiveBasemap(styleUrl: string, signal: AbortSignal): Promise<boolean> {
  const get = async (url: string) => {
    const res = await fetch(url, { cache: 'no-store', signal });
    if (!res.ok) throw new Error(`${res.status}`);
    return res;
  };
  const getJson = async (url: string) => (await get(url)).json() as Promise<unknown>;
  try {
    const base = new URL(styleUrl, location.href);
    const style = (await getJson(base.href)) as StyleSpecification;
    const tiled = Object.values(style.sources ?? {}).find((s: SourceSpecification) => {
      if (s.type === 'geojson') return false;
      const t = s as { url?: unknown; tiles?: unknown };
      return typeof t.url === 'string' || Array.isArray(t.tiles);
    }) as { url?: string; tiles?: string[]; minzoom?: number } | undefined;
    if (!tiled) return true;
    // A source names its tiles itself, or through its TileJSON.
    let tiles = tiled.tiles;
    let minzoom = tiled.minzoom;
    let tilesBase = base;
    if (typeof tiled.url === 'string') {
      tilesBase = new URL(tiled.url, base);
      const tj = (await getJson(tilesBase.href)) as { tiles?: unknown; minzoom?: unknown };
      if (Array.isArray(tj.tiles)) tiles = tj.tiles as string[];
      if (typeof tj.minzoom === 'number') minzoom = tj.minzoom;
    }
    const template = tiles?.find((t) => typeof t === 'string' && /\{z\}.*\{x\}.*\{y\}/.test(t));
    // A tile scheme this can't address (a quadkey, a bbox): the TileJSON's answer stands.
    if (!template) return true;
    const z = Math.max(0, Math.floor(minzoom ?? 0));
    const tileUrl = template.replace('{z}', String(z)).replace('{x}', '0').replace('{y}', '0');
    const res = await get(new URL(tileUrl, tilesBase).href);
    void res.body?.cancel().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** The way back from the fallback. `start` when the map goes onto the offline style: it probes on
 *  the schedule above, at once on the browser's `online` event, and when a hidden page comes back
 *  into view — never while the browser says it is offline (its `online` event covers that) or the
 *  page is hidden. The first probe that answers calls `onBack` and stops. `landed` when a live load
 *  draws its first tile: the next outage starts the schedule over if the live map has held HOLD_MS
 *  by then, and carries on from where it was if not. */
export function createBasemapRecovery(opts: {
  styleUrl: () => string;
  onBack: () => void;
}): { start: () => void; stop: () => void; landed: () => void } {
  let active = false;
  let step = 0;
  let timer = 0;
  let lastAt = 0;
  let liveSince = 0;
  let inFlight: AbortController | null = null;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(probe, PROBE_DELAYS_MS[Math.min(step, PROBE_DELAYS_MS.length - 1)]);
  };
  async function probe() {
    if (!active || inFlight || !navigator.onLine || document.hidden) return;
    window.clearTimeout(timer);
    lastAt = Date.now();
    const ac = new AbortController();
    inFlight = ac;
    // A probe on a network that answers nothing must end too — at the same wait a live load gets.
    const cut = window.setTimeout(() => ac.abort(), LIVE_BASEMAP_WAIT_MS);
    const ok = await probeLiveBasemap(opts.styleUrl(), ac.signal);
    window.clearTimeout(cut);
    if (inFlight !== ac) return; // stopped meanwhile
    inFlight = null;
    if (ok) {
      // The schedule moves on here too, and only a live map that has held starts it over
      // (`landed`, HOLD_MS). A probe can still answer for a basemap that then fails to draw — a
      // tile host failing some tiles and not others — and each round of that is a whole basemap
      // swapped under the reader twice; the next round should come later, not at the same short
      // interval forever.
      step++;
      stop();
      opts.onBack();
    } else {
      step++;
      schedule();
    }
  }
  // Back in view: ask now, unless the last probe was moments ago — flipping between tabs mustn't
  // turn into a stream of requests — in which case the schedule picks it up.
  const onVisible = () => {
    if (!active || document.hidden) return;
    if (Date.now() - lastAt >= PROBE_DELAYS_MS[0]) void probe();
    else if (!inFlight) schedule();
  };
  const onOnline = () => void probe();
  function stop() {
    if (!active) return;
    active = false;
    window.clearTimeout(timer);
    inFlight?.abort();
    inFlight = null;
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
  }
  return {
    start() {
      if (active) return;
      if (liveSince && Date.now() - liveSince >= HOLD_MS) step = 0;
      liveSince = 0;
      active = true;
      window.addEventListener('online', onOnline);
      document.addEventListener('visibilitychange', onVisible);
      schedule();
    },
    stop,
    // The start of the live spell, not its latest load: a theme change mid-spell lands again, and
    // mustn't push back the moment the spell began.
    landed() {
      liveSince ||= Date.now();
    },
  };
}
