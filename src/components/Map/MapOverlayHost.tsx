// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Renders every registered map overlay (registerMapOverlay) as positioned DOM inside the
// map frame, re-projecting on each camera move. It owns NO feature logic: it just hands
// each overlay a project() + the live MapExtensionContext and lets it place its own
// markers — the same approach the core uses for its edge/paran badges, factored into a
// neutral host so out-of-tree features can draw on the map without touching Map.tsx.
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type maplibregl from 'maplibre-gl';
import { projectVisible } from '../../lib/mapProjection';
import {
  getMapOverlays,
  isOverlayEntitled,
  type MapOverlayApi,
} from '../../lib/extensions/mapOverlays';
import type { MapExtensionContext } from '../../lib/extensions/mapExtensions';

interface MapOverlayHostProps {
  /** The live MapLibre instance (Map.tsx's internal ref). */
  mapRef: RefObject<maplibregl.Map | null>;
  /** Flips true once the map's style has loaded, so we subscribe to a real instance. */
  ready: boolean;
  /** True while the camera animates — forwarded to overlays so they can fade out in motion
   *  (the same `mapMoving` signal the edge badges use). */
  moving: boolean;
  /** Overlay ids to withhold from the map — the Capture window's per-overlay
   *  visibility toggles (see MapOverlay.captureToggle). Absent/empty = draw all. */
  hiddenIds?: ReadonlySet<string>;
  /** The read-only snapshot handed to each overlay. */
  ctx: MapExtensionContext;
  /** Told whenever the overlays' DOM may have moved or changed: after every commit of this host
   *  (fresh projections — each camera frame, a settle, a ctx change), and whenever nodes are
   *  added to or removed from the track by an overlay re-rendering on its OWN state (a layer's
   *  store updating), which this host never renders for. Map.tsx re-places its line labels off
   *  the markers it finds here. Called often, mid-pan included: the receiver decides, cheaply,
   *  whether anything it cares about moved. */
  onPlaced?: () => void;
}

export function MapOverlayHost({
  mapRef,
  ready,
  moving,
  hiddenIds,
  ctx,
  onPlaced,
}: MapOverlayHostProps) {
  // A frame counter bumped (throttled to one rAF) on every camera move, so the overlays
  // re-render and re-project as the user pans/zooms.
  const [version, setVersion] = useState(0);
  const rafRef = useRef(0);
  // Same-frame tracking (the marker technique): screen-anchored overlay DOM re-projects
  // through a rAF + a React render, so during camera motion it TRAILS the canvas by a
  // frame and reads as jitter against the basemap — where a real MapLibre marker,
  // repositioned synchronously inside the move event, is rock solid. The track div gets
  // that same treatment wholesale: every move event applies, synchronously, the AFFINE
  // map between commit-time screen space and now — under pan + zoom that mapping is
  // exactly `scale(2^Δzoom)` about the world origin plus a translation, recovered from
  // one anchor point (p_now = s·p_then + t ⇒ t = p_now − s·p_then). Exact for the
  // mercator projection's pan AND zoom (rotation/pitch would need more terms; the app
  // keeps north up), anchor-true on the globe; each committed render resets it to
  // identity with fresh projections. The per-frame zoom factor also scales the marker
  // DOM for that one frame (≤ a few %) — imperceptible, where position error was not.
  const trackRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<{
    ll: maplibregl.LngLat;
    x: number;
    y: number;
    zoom: number;
  } | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const bump = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        setVersion((v) => (v + 1) % 1_000_000);
      });
    };
    const onMove = () => {
      // Synchronous — runs inside the map's own frame, before the canvas paints.
      const el = trackRef.current;
      const anchor = anchorRef.current;
      if (el && anchor) {
        const s = Math.pow(2, map.getZoom() - anchor.zoom);
        const p = map.project(anchor.ll);
        el.style.transform = `translate(${p.x - s * anchor.x}px, ${p.y - s * anchor.y}px) scale(${s})`;
      }
      bump();
    };
    map.on('move', onMove);
    map.on('moveend', bump);
    map.on('resize', bump);
    bump(); // place once on (re)subscribe
    return () => {
      map.off('move', onMove);
      map.off('moveend', bump);
      map.off('resize', bump);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [mapRef, ready]);

  // Scroll-zoom over overlay DOM. MapLibre binds its wheel handling to the CANVAS
  // container, and this track is a SIBLING of that container rather than a descendant of
  // it — so a wheel event that lands on any overlay marker bubbles up through the frame
  // and never reaches the map at all. The symptom is that resting the cursor on a marker
  // silently freezes zoom: the pointer is over the map, the map has stopped responding,
  // and nothing on screen says why. It applies to every interactive overlay at once, which
  // is why the fix lives here and not in whichever layer happened to notice.
  //
  // So forward it. Non-passive, because the page-scroll default has to be cancellable —
  // and an overlay that wants the wheel for itself (a scrollable panel of its own) simply
  // calls preventDefault(), which is the opt-out checked below. The re-dispatched event
  // carries clientX/clientY so MapLibre still zooms about the CURSOR rather than the map's
  // centre, and it lands in a different subtree, so it cannot re-enter this handler.
  useEffect(() => {
    const el = trackRef.current;
    const map = mapRef.current;
    if (!ready || !el || !map) return;
    const onWheel = (e: WheelEvent) => {
      if (e.defaultPrevented) return;
      const canvas = map.getCanvasContainer();
      // Already inside the map's own subtree (nothing to forward), or no canvas yet.
      if (!canvas || canvas.contains(e.target as Node)) return;
      e.preventDefault();
      canvas.dispatchEvent(
        new WheelEvent('wheel', {
          deltaX: e.deltaX,
          deltaY: e.deltaY,
          deltaZ: e.deltaZ,
          deltaMode: e.deltaMode,
          clientX: e.clientX,
          clientY: e.clientY,
          // Carried so a trackpad pinch (ctrl+wheel) and any modifier-gated zoom
          // behave over a marker exactly as they do over bare map.
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [mapRef, ready]);

  // Re-anchor on EVERY committed render (no deps — a ctx-driven re-render mid-pan also
  // re-projects the children): the overlays just got fresh positions, so the track's
  // correction restarts from zero. Layout effect — applied before paint, no flicker.
  useLayoutEffect(() => {
    const map = mapRef.current;
    const el = trackRef.current;
    if (!map || !el) return;
    el.style.transform = '';
    const ll = map.getCenter();
    const p = map.project(ll);
    anchorRef.current = { ll, x: p.x, y: p.y, zoom: map.getZoom() };
  });

  // onPlaced: after every commit (no deps — the overlays may have just re-projected, or the
  // track mounted or gone), and on any child-list change inside the track between commits. The
  // observer follows the track element, which comes and goes with the overlay list (an
  // entitlement flip). Child lists only: a camera frame rewrites every marker's style, and the
  // commit after it already reports that.
  // The latest callback is taken in the commit (this no-deps layout effect), not during
  // render: every reader — the call below and the observer, which only fires after a commit
  // — runs after it, so the ref is current wherever it is read.
  const onPlacedRef = useRef(onPlaced);
  const observedRef = useRef<{ el: HTMLElement; mo: MutationObserver } | null>(null);
  useLayoutEffect(() => {
    onPlacedRef.current = onPlaced;
    const el = trackRef.current;
    if (observedRef.current?.el !== el) {
      observedRef.current?.mo.disconnect();
      observedRef.current = null;
      if (el) {
        const mo = new MutationObserver(() => onPlacedRef.current?.());
        mo.observe(el, { childList: true, subtree: true });
        observedRef.current = { el, mo };
      }
    }
    onPlacedRef.current?.();
  });
  useEffect(
    () => () => {
      observedRef.current?.mo.disconnect();
      observedRef.current = null;
    },
    [],
  );

  const overlays = getMapOverlays()
    .filter(isOverlayEntitled)
    .filter((o) => !hiddenIds?.has(o.id));
  if (overlays.length === 0) return null;

  const map = mapRef.current;
  const api: MapOverlayApi = {
    project: (lat, lng) => (map ? projectVisible(map, lng, lat) : null),
    unproject: (x, y) => {
      if (!map) return null;
      const ll = map.unproject([x, y]);
      return Number.isFinite(ll.lat) && Number.isFinite(ll.lng)
        ? { lat: ll.lat, lng: ll.lng }
        : null;
    },
    zoom: map ? map.getZoom() : 0,
    mapVersion: version,
    moving,
    ctx,
  };

  return (
    <div ref={trackRef} className="map-overlay-track">
      {overlays.map((o) => (
        <Fragment key={o.id}>{o.render(api)}</Fragment>
      ))}
    </div>
  );
}
