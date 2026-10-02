// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Right-to-left text on the basemap: Arabic shaped and joined, Arabic and Hebrew in reading order.
//
// MapLibre lays label text out left to right, one glyph per code point, unless an RTL text plugin is
// registered. Nothing registered one, so every Arabic place name drew as isolated letters in reverse
// (Cairo, Tunis, Casablanca…), Hebrew drew backwards (Tel Aviv), and captures and report figures —
// which copy the map canvas — printed them that way. Only the local-script line of a label was
// affected; the Latin line never needed this. Do not "fix" it by dropping `name:nonlatin` from the
// labels instead: that also takes away Cyrillic, Greek and CJK, which have always drawn correctly.
//
// Registered once per page, by the first map: Map.tsx calls ensureRtlTextPlugin() as it creates one,
// and the promise is memoized here, at module scope. MapLibre keeps the plugin in a page-wide
// singleton and throws on a second registration, and a component effect runs twice under StrictMode
// and again on every hot reload — the memo answers those. The status checks below make a
// re-evaluated copy of this module a no-op too.
//
// Not at import. This module is in the app's static graph (App → Map), which is evaluated while the
// engine is still downloading, so starting there put the plugin's fetch (~148 KB, ~43 KB gzipped)
// beside the engine's — on a slow link, exactly where the boot's wait is — and the status read alone
// builds MapLibre's worker pool (its RTL state object takes the global dispatcher as it is made),
// before any map exists or a WebGL check has passed.
//
// Self-hosted: the plugin's built file (@mapbox/mapbox-gl-rtl-text, pinned to the version MapLibre's
// own documentation names; BSD-2-Clause, with ICU's shaping and bidi code compiled in — see NOTICE)
// ships as one of the app's hashed assets through the `?url` import. The package's `exports` map
// only publishes its ES-module source, which a worker's importScripts can't load, so both
// vite.config.ts files alias the built file's path explicitly.
//
// EAGER from the first map (not on the first RTL label), and fetched by the PAGE rather than by
// MapLibre's worker. The two other ways to load it
// each cost something real:
//   - MapLibre's lazy mode drops every label holding RTL text — its Latin line too — from the moment
//     the first one is met until the plugin arrives, and if that fetch fails, for the rest of the
//     session. Lazy saves ~40 KB on the wire for a session that never shows such a label.
//   - Handing MapLibre the file's own URL makes the worker fetch it with importScripts, which is
//     synchronous: on a cold slow link every basemap tile AND every chart line — both are tiled in
//     that worker — waits behind the download. Whether that fetch reaches the service worker's copy
//     offline depends on the browser (MapLibre's worker is itself a blob: worker).
// So the page fetches the bytes — through the service worker where there is one, so the hosted app
// reads its precached copy offline — and passes the worker a blob: URL it imports at once. Until
// the bytes land the worker lays RTL text out as it always did, and MapLibre re-tiles the sources
// once the plugin registers. A failed fetch leaves exactly the old rendering, never missing labels.
import maplibregl from 'maplibre-gl';
import pluginUrl from '@mapbox/mapbox-gl-rtl-text/dist/mapbox-gl-rtl-text.js?url';

// 'requested' is MapLibre noting that a tile met RTL text before anything was registered — still
// open, and the registration below picks it up. Anything else means a copy of this module (or
// MapLibre itself) is already past this point.
const open = (): boolean => {
  const status = maplibregl.getRTLTextPluginStatus();
  return status === 'unavailable' || status === 'requested';
};

async function register(): Promise<void> {
  // All of it inside the try, the status read included: that read is what makes MapLibre's worker
  // pool, and a throw there would otherwise reject the promise Capture waits on.
  try {
    if (!open()) return;
    const res = await fetch(pluginUrl);
    // A page still running an older build asks for a hash the current deploy no longer has, and
    // the host answers that with the app shell (200 text/html), not a 404.
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/javascript/i.test(type)) throw new Error(`${res.status} ${type} ${pluginUrl}`);
    const blob = new Blob([await res.arrayBuffer()], { type: 'text/javascript' });
    // The fetch was asynchronous: re-check, in case another copy of this module registered meanwhile.
    if (!open()) return;
    const blobUrl = URL.createObjectURL(blob);
    try {
      await maplibregl.setRTLTextPlugin(blobUrl, false);
    } finally {
      // The worker has imported it (or failed to) once this settles, and MapLibre never asks again.
      URL.revokeObjectURL(blobUrl);
    }
  } catch (err) {
    console.warn('[map] right-to-left text plugin not loaded; Arabic and Hebrew labels stay unshaped', err);
  }
}

let settled: Promise<void> | null = null;

/** Starts the registration on the first call; every call returns the same promise, which settles
 *  (never rejects) once the plugin has registered, failed, or turned out to be registered already.
 *  Map.tsx calls it as it creates a map, and Capture waits on it, so a shot taken in the first
 *  moments of a session doesn't freeze labels that are about to be redrawn. */
export function ensureRtlTextPlugin(): Promise<void> {
  settled ??= register();
  return settled;
}
