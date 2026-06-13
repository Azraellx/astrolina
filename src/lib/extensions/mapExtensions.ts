// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Map-HUD extension registry — the seam that lets a feature attach a View-menu
// toggle and a floating HUD WITHOUT editing App.tsx or TopNav.tsx. Core features
// keep their own inline wiring; anything registered here is rendered IN ADDITION.
//
// This is the attach point for a downstream build that depends on this open
// core: such a feature is a folder that calls registerMapExtension({...}) at
// startup and ships its own HUD + label, touching no core file. Gating is built
// in: a 'gated' extension renders its HUD when entitled, or an optional CTA
// (`renderLocked`) when not, in the same UI slot. The open core ships no gating
// (every extension resolves to entitled).

import type { ReactNode } from 'react';
import type { FeatureCollection } from 'geojson';
import type { StoredChart } from '../chartLibrary';
import type { OverlayMode } from '../astro/timeline';
import type { PlanetName, NodeType, HouseSystem } from '../ephemeris';

/**
 * A read-only snapshot of map/chart state plus action callbacks, handed to each
 * open HUD extension on render. Read state from here; change the app only through
 * the actions. The shape is intentionally generous and may grow as extensions
 * need more — treat additions as backward-compatible.
 */
export interface MapExtensionContext {
  current: StoredChart | null;
  jd: number;
  pinned: { lat: number; lng: number } | null;
  pinnedLabel: string | null;
  visiblePlanets: ReadonlySet<PlanetName>;
  nodeType: NodeType;
  houseSystem: HouseSystem;
  overlayMode: OverlayMode;
  /** Effective linework the map is actually drawing (promotion / eclipse-toggle
   *  resolved), so a report can never reference a line that isn't on screen. */
  lines: FeatureCollection;
  angleLines: FeatureCollection;
  parans: FeatureCollection;
  /** Fixed-star × planet parans (the Brady-school list). Computed but never drawn
   *  as map lines — provided for HUDs/readers that present the per-location list.
   *  Empty unless the Fixed Stars layer is on. */
  starParans: FeatureCollection;
  overlayLines: FeatureCollection | null;
  overlayParans: FeatureCollection | null;
  /** Fly the map camera to a point. */
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  /** Set the timeline to an instant (epoch milliseconds). */
  setTargetDate: (epochMs: number) => void;
  /** Switch the active time-overlay mode (e.g. start a transits overlay). */
  setOverlayMode: (mode: OverlayMode) => void;
}

/** 'core' is always available; 'gated' is subject to the entitlement resolver. */
export type Entitlement = 'core' | 'gated';

export interface MapExtension {
  /** Stable unique id; also the open/closed-state key. */
  id: string;
  /** View-menu label, already localized (extensions own their own strings). */
  label: string;
  /** localStorage key to persist open/closed; omit for a non-persisted HUD. */
  storageKey?: string;
  /** Single-key shortcut shown in the View menu (optional). */
  hotkey?: string;
  /** Whether it starts open the first time (before any persisted state). */
  defaultOpen?: boolean;
  /** Defaults to 'core'. A 'gated' extension is subject to the entitlement resolver. */
  tier?: Entitlement;
  /** The HUD, rendered when the extension is open AND entitled. */
  render: (ctx: MapExtensionContext, onClose: () => void) => ReactNode;
  /** Optional panel rendered when a 'gated' extension is opened WITHOUT
   *  entitlement (the call-to-action shown in place of the HUD). */
  renderLocked?: (onClose: () => void) => ReactNode;
}

const registry = new Map<string, MapExtension>();

/** Register a map-HUD extension. Call once at startup; idempotent per id. */
export function registerMapExtension(ext: MapExtension): void {
  registry.set(ext.id, ext);
}

/** All registered extensions, in registration order. */
export function getMapExtensions(): MapExtension[] {
  return [...registry.values()];
}

// Entitlement resolver. The open core ships no gating (everything resolves to
// available). A downstream build installs its own — e.g. checking a license/session —
// via setEntitlementResolver, so 'gated' extensions show their CTA when not entitled.
let resolveEntitled: (ext: MapExtension) => boolean = () => true;

/** Install the entitlement policy (downstream builds only). */
export function setEntitlementResolver(fn: (ext: MapExtension) => boolean): void {
  resolveEntitled = fn;
}

/** Whether `ext`'s real HUD (vs. its CTA) should render for the current user. */
export function isEntitled(ext: MapExtension): boolean {
  return ext.tier !== 'gated' || resolveEntitled(ext);
}
