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
}

export function MapOverlayHost({ mapRef, ready, moving, hiddenIds, ctx }: MapOverlayHostProps) {
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
