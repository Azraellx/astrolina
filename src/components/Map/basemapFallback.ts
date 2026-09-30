// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The live basemap on a network that is dead while the browser still says it is online.
//
// Map.tsx opens on its self-contained offline style when navigator.onLine is false. But onLine only
// knows whether the device has a network: a captive portal, a Wi-Fi that has stopped answering or a
// blocked tile host all leave it true, and the live style then waits on requests that fail (the
// chart lines on the style's bare background, no world outline) or never come back (nothing at all:
// MapLibre holds `load`, and with it every chart layer, until they settle). So the map watches each
// live load it starts, falls back to the offline style once the basemap has demonstrably failed, and
// probes for the way back. A rendering fallback, not a setting: nothing is stored and nothing is
// announced beyond what an offline start already shows.
import maplibregl from 'maplibre-gl';
import type { SourceSpecification, StyleSpecification } from 'maplibre-gl';

export type BasemapMode = 'live' | 'offline';

// The offline style still asks the live host for its glyph ranges, so chart-line text can reuse the
// copies a cache holds. Offline those requests are answered from a cache or fail at once, and a
// range that fails is drawn with a local font. On a network that answers nothing they would hang
// instead — and MapLibre holds every chart tile that carries text until its ranges settle, the lines
// in it included. So the offline style reaches the host through this protocol, which gives each
// range a bounded wait and then lets it fail. Short: on this style a range only ever comes from a
// cache, which answers in milliseconds.
const BOUNDED = 'bounded-https';
const OFFLINE_GLYPH_WAIT_MS = 3000;
maplibregl.addProtocol(BOUNDED, async (params, abort) => {
  const ac = new AbortController();
  const cut = window.setTimeout(() => ac.abort(), OFFLINE_GLYPH_WAIT_MS);
  abort.signal.addEventListener('abort', () => ac.abort());
  try {
    const res = await fetch(params.url.replace(`${BOUNDED}://`, 'https://'), { signal: ac.signal });
    if (!res.ok) throw new Error(`${res.status} ${params.url}`);
    return { data: await res.arrayBuffer() };
  } finally {
    window.clearTimeout(cut);
  }
});
/** An https URL template, fetched with the bounded wait above. */
export const boundedWait = (url: string): string => url.replace(/^https:\/\//, `${BOUNDED}://`);

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

/** When to ask again while on the fallback: soon at first (a portal signed into, a Wi-Fi that came
 *  back), then doubling to a five-minute cap — the tile host is someone else's server, and one
 *  that is down for everyone shouldn't hear from every open map every few seconds. */
const PROBE_DELAYS_MS = [10_000, 20_000, 40_000, 80_000, 160_000, 300_000];

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

/** Watch the live style just requested: `onOk` at its first basemap tile, `onFail` once it has
 *  demonstrably failed — the style itself could not be fetched; the map settled with a failed
 *  basemap request and not one tile; or `deadlineMs` passed with neither a tile nor a settled
 *  basemap. A null deadline leaves only the first two, for a load the tile host has just shown it
 *  answers (see the recovery below). Register it BEFORE the setStyle it watches: a style can
 *  land inside that call. Returns the disposer.
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
  const stop = () => {
    window.clearTimeout(timer);
    window.clearTimeout(halfway);
    asking?.abort();
    document.removeEventListener('visibilitychange', arm);
    map.off('style.load', onStyleLoad);
    map.off('sourcedata', onData);
    map.off('error', onError);
    map.off('idle', onIdle);
  };
  const fail = () => {
    stop();
    on.fail();
  };
  const onStyleLoad = () => {
    styleLoaded = true;
  };
  const onData = (e: WatchedEvent) => {
    if (!e.tile || !fromBasemap(e)) return;
    stop();
    on.ok();
  };
  const onError = (e: WatchedEvent) => {
    if (!isRequestError(e)) return;
    // Before the style has landed, a failed request that no source claims is the style itself.
    if (!styleLoaded && !e.sourceId) return fail();
    if (fromBasemap(e)) requestFailed = true;
  };
  // Settled — every request answered or failed — and the only word from the basemap was a failure.
  const onIdle = () => {
    if (requestFailed) fail();
  };
  const onDeadline = () => {
    // Settled without a failure is a basemap with nothing to fetch (every layer hidden), not a
    // dead one: stand down rather than swap.
    if (!styleLoaded || requestFailed || basemapPending(map)) fail();
    else stop();
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

// Whether the live basemap could load now. It asks for what the live style needs from the network
// before any tile: the style (remote for Glass and Dark; for Earth a copy that ships with the app)
// and the TileJSON of its tile source. `no-store`, so the HTTP cache can't answer for a network that
// is still down; a captive portal's sign-in page fails the JSON parse, as it should.
async function probeLiveBasemap(styleUrl: string, signal: AbortSignal): Promise<boolean> {
  const getJson = async (url: string) => {
    const res = await fetch(url, { cache: 'no-store', signal });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json() as Promise<unknown>;
  };
  try {
    const base = new URL(styleUrl, location.href);
    const style = (await getJson(base.href)) as StyleSpecification;
    const tiled = Object.values(style.sources ?? {}).find(
      (s: SourceSpecification) => s.type !== 'geojson' && typeof (s as { url?: unknown }).url === 'string',
    ) as { url: string } | undefined;
    if (tiled) await getJson(new URL(tiled.url, base).href);
    return true;
  } catch {
    return false;
  }
}

/** The way back from the fallback. `start` when the map goes onto the offline style: it probes on
 *  the schedule above, at once on the browser's `online` event, and when a hidden page comes back
 *  into view — never while the browser says it is offline (its `online` event covers that) or the
 *  page is hidden. The first probe that answers calls `onBack` and stops. `reset` after a live
 *  load that worked, so the next outage starts the schedule from the beginning. */
export function createBasemapRecovery(opts: {
  styleUrl: () => string;
  onBack: () => void;
}): { start: () => void; stop: () => void; reset: () => void } {
  let active = false;
  let step = 0;
  let timer = 0;
  let lastAt = 0;
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
      active = true;
      window.addEventListener('online', onOnline);
      document.addEventListener('visibilitychange', onVisible);
      schedule();
    },
    stop,
    reset() {
      step = 0;
    },
  };
}
