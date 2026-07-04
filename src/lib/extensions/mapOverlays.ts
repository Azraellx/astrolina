// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Map-OVERLAY registry — the seam that lets a feature DRAW its own positioned DOM on
// the map (markers, badges, pins) WITHOUT editing Map.tsx. It is the drawing cousin of
// the HUD seam (./mapExtensions): that one mounts a floating window; this one renders
// inside the map frame and re-projects on every camera move, exactly the way the core
// positions its own edge/paran badges.
//
// Core ships no overlays of its own — they live inline. Anything registered here is
// rendered IN ADDITION by the MapOverlayHost (components/Map/MapOverlayHost.tsx). Each
// overlay's render() receives a MapOverlayApi: a project(lat,lng) that returns screen
// pixels (null when the point is off-globe / occluded), a mapVersion that bumps on every
// move so consumers can re-place, and the same read-only MapExtensionContext the HUDs
// get — so an overlay can filter what it draws by the active chart / overlay mode.
//
// Gating mirrors the Tools/Overlay menus: a 'gated' overlay consults the SHARED
// entitlement resolver (./entitlement), so the single setEntitlementResolver install a
// downstream build already makes also covers map overlays — a paid overlay can't draw
// for a free user.

import type { ReactNode } from 'react';
import { isEntitled, type Entitlement } from './entitlement';
import type { MapExtensionContext } from './mapExtensions';

/** Window CustomEvent fired on every plain map click: `detail` is the clicked point.
 *  Neutral nudge channel — a feature (e.g. tap-to-tag) listens only while it cares. */
export const MAP_CLICK_EVENT = 'astro:map-click';

/** Window CustomEvent fired on every map double-click: `detail` is the point (same
 *  {@link MapClickDetail} shape). The twin of {@link MAP_CLICK_EVENT} — a tool that treats a
 *  double-click as its own gesture (e.g. a tool re-placing a point) listens only while it cares;
 *  fired for every dblclick regardless, so listeners that don't care ignore it. */
export const MAP_DBLCLICK_EVENT = 'astro:map-dblclick';

/** `detail` shape of the {@link MAP_CLICK_EVENT} / {@link MAP_DBLCLICK_EVENT} CustomEvents. */
export interface MapClickDetail {
  lat: number;
  lng: number;
}

/** What each overlay's render() is handed on every (throttled) map frame. */
export interface MapOverlayApi {
  /** Project a geographic point to container pixels, or null if off-globe / occluded. */
  project: (lat: number, lng: number) => { x: number; y: number } | null;
  /** Inverse of {@link project}: container pixels → a geographic point (null if unmappable). */
  unproject: (x: number, y: number) => { lat: number; lng: number } | null;
  /** The current map zoom (web-mercator z), fresh each frame — lets an overlay size on-screen
   *  geometry or derive a target zoom for `ctx.flyTo` (there's no separate zoom getter). */
  zoom: number;
  /** Increments on each camera move — a cheap re-place signal for memoized consumers. */
  mapVersion: number;
  /** True while the camera is animating (pan / zoom) — the same signal the core edge badges
   *  fade on, so screen-anchored overlay DOM can fade out in motion rather than read detached. */
  moving: boolean;
  /** The same read-only map/chart snapshot the HUD extensions receive. */
  ctx: MapExtensionContext;
}

export interface MapOverlay {
  /** Stable unique id (also the entitlement lookup key). */
  id: string;
  /** Defaults to 'core'. A 'gated' overlay is subject to the shared entitlement resolver. */
  tier?: Entitlement;
  /** Opt in to a per-overlay visibility toggle in the Capture window (its Details
   *  section), so a user can drop this overlay's markers from a framed export.
   *  Strings arrive already localized — extensions own their own strings. The hide
   *  applies only WHILE the Capture tool is armed (App reverts the map to every
   *  overlay the moment it closes); omit to keep the overlay always drawn. */
  captureToggle?: { title: string; hint: string };
  /** The positioned DOM, re-rendered on every map move. */
  render: (api: MapOverlayApi) => ReactNode;
}

const registry = new Map<string, MapOverlay>();

/** Register a map overlay. Call once at startup; idempotent per id. */
export function registerMapOverlay(o: MapOverlay): void {
  registry.set(o.id, o);
}

/** All registered overlays, in registration order. */
export function getMapOverlays(): MapOverlay[] {
  return [...registry.values()];
}

/** Whether `o` should draw for the current user (delegates to the shared resolver). */
export function isOverlayEntitled(o: MapOverlay): boolean {
  return isEntitled(o);
}
