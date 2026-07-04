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
import { Fragment, useEffect, useRef, useState, type RefObject } from 'react';
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
    map.on('move', bump);
    map.on('moveend', bump);
    map.on('resize', bump);
    bump(); // place once on (re)subscribe
    return () => {
      map.off('move', bump);
      map.off('moveend', bump);
      map.off('resize', bump);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [mapRef, ready]);

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
    <>
      {overlays.map((o) => (
        <Fragment key={o.id}>{o.render(api)}</Fragment>
      ))}
    </>
  );
}
