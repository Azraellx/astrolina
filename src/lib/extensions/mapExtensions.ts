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
// in: a 'gated' extension renders its HUD only when entitled — the menu hides it
// otherwise (no teaser). The open core ships no gating (every extension resolves to
// entitled).

import type { ReactNode } from 'react';
import type { FeatureCollection } from 'geojson';
import type { StoredChart } from '../chartLibrary';
import type { AngleProgression, OverlayMode, PrimaryRate } from '../astro/timeline';
import type { PlanetName, NodeType, HouseSystem } from '../ephemeris';
import type { ZodiacMode } from '../astro/ayanamsa';

/** The COMPLETE line set — every planet, line type, and family (natal angular + aspects +
 *  midpoints + parans + star lines + local space, and the active overlay's equivalents) — with the
 *  current visibility filters and Advanced toggles IGNORED. Built on demand by
 *  {@link MapExtensionContext.collectAllLines}. Families are generic FeatureCollections like the
 *  rest of the ctx linework (narrow at the boundary). Overlay families are null when no overlay. */
export interface AllLines {
  lines: FeatureCollection;
  angleLines: FeatureCollection;
  parans: FeatureCollection;
  starLines: FeatureCollection;
  localSpace: FeatureCollection;
  overlayLines: FeatureCollection | null;
  overlayParans: FeatureCollection | null;
  overlayLocalSpace: FeatureCollection | null;
}

/** A point-and-radius "spotlight" on the linework — a neutral view treatment, not tied to any
 *  one feature: it dims the basemap and shows only the line features within `radiusKm` of
 *  `center`. A null `center` means "aiming" — dim + hide ALL lines; passing the whole object as
 *  null clears the spotlight (the normal map). Applied via {@link MapExtensionContext.setLineSpotlight}. */
export interface LineSpotlight {
  center: { lat: number; lng: number } | null;
  radiusKm: number;
  /** The full line set to reveal within the radius (from {@link MapExtensionContext.collectAllLines}),
   *  so the reveal shows EVERY line near the point regardless of the user's filters. When absent, the
   *  reveal falls back to the effective (currently-drawn) linework. Null/absent while aiming. */
  lines?: AllLines | null;
}

/**
 * A read-only snapshot of map/chart state plus action callbacks, handed to each
 * open HUD extension on render. Read state from here; change the app only through
 * the actions. The shape is intentionally generous and may grow as extensions
 * need more — treat additions as backward-compatible.
 */
export interface MapExtensionContext {
  current: StoredChart | null;
  /** The active synastry partner chart, if a relationship overlay is in play; else null. */
  partner: StoredChart | null;
  jd: number;
  /** The current timeline instant (epoch ms) the overlay is set to (the value behind
   *  `setTargetDate`), so a HUD/overlay can capture or display "the moment on screen". */
  targetDate: number;
  pinned: { lat: number; lng: number } | null;
  pinnedLabel: string | null;
  visiblePlanets: ReadonlySet<PlanetName>;
  nodeType: NodeType;
  houseSystem: HouseSystem;
  /** Effective zodiac mode (Advanced ▸ Zodiac; 'tropical' unless Advanced is on),
   *  so a dated HUD can read its list in the chart's active zodiac. */
  zodiacMode: ZodiacMode;
  /** Whether the night-side shading layer is on (Appearance ▸ Night Shade), so an
   *  extension drawing its own day/night treatment can follow the same switch. */
  nightShadeOn: boolean;
  overlayMode: OverlayMode;
  /** The Progressions/Directions settings the directed overlays advance by
   *  (Chart-Angle method, Primary-Directions rate + user rate), so an extension
   *  reading a directed overlay can reproduce its arc exactly. */
  angleProgression: AngleProgression;
  primaryRate: PrimaryRate;
  userPrimaryRate: number;
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
  /** Effective drawn local-space lines (great circles from the chart's origin), with any active
   *  line spotlight already applied. Empty unless the Local Space view is on. */
  localSpace: FeatureCollection;
  /** Effective drawn fixed-star lines (star MC/IC/ASC/DSC) — distinct from the report-only
   *  `starParans` above, which never draw as map lines. Empty unless the Fixed Stars layer is on. */
  starLines: FeatureCollection;
  /** The active overlay's local-space lines, if any (null when no overlay, or none drawn). */
  overlayLocalSpace: FeatureCollection | null;
  /** Fly the map camera to a point. */
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  /** Set the timeline to an instant (epoch milliseconds). */
  setTargetDate: (epochMs: number) => void;
  /** Switch the active time-overlay mode (e.g. start a transits overlay). */
  setOverlayMode: (mode: OverlayMode) => void;
  /** The ids of the HUD extensions currently OPEN — the read half of {@link openExtension},
   *  so a map overlay can draw only while its companion window is open (a feature whose
   *  on-map layer follows its View-menu window's open/closed state). */
  openExtensionIds: ReadonlySet<string>;
  /** Open a registered map-HUD extension by id (no-op if unknown / already open). Lets a
   *  map overlay surface its companion HUD — e.g. clicking a marker opens its window. */
  openExtension: (id: string) => void;
  /** Force-open a registered Tools-menu extension by id (single-select — closes any other open
   *  tool and disarms any built-in; no-op if it's already the only open tool). The Tools twin of
   *  {@link openExtension}: lets one HUD launch a companion tool — e.g. a HUD opening a map tool
   *  already positioned at a chosen point. */
  openTool: (id: string) => void;
  /** Arm the built-in frame-capture tool (the same action as its Tools-menu entry / hotkey);
   *  idempotent while already armed. Lets a HUD offer "grab the current map view" — pair with a
   *  registered capture destination (lib/extensions/captureSink) to receive the frame. */
  openCapture: () => void;
  /** Arm one of the other built-in map tools by id (the same action as its Tools-menu entry /
   *  hotkey); idempotent while already armed. Capture keeps its dedicated opener above — it
   *  predates this and pairs with the capture-sink seam. */
  openBuiltinTool: (tool: 'measure' | 'slide') => void;
  /** Focus the linework to a radius around a point: dims the basemap and reveals only the lines
   *  passing within `radiusKm` of the spotlight's `center` (a null center dims + hides all lines;
   *  passing null clears it). Everything else on the map is untouched — purely a view treatment. */
  setLineSpotlight: (spotlight: LineSpotlight | null) => void;
  /** Generate the COMPLETE line set (all planets, line types, and families — aspects, midpoints,
   *  parans, star lines, local space, and the active overlay's equivalents), IGNORING the current
   *  visibility filters and Advanced toggles. Expensive (midpoints are quadratic) — call on demand
   *  (e.g. once per point query), never per frame. Pair with `setLineSpotlight({ ..., lines })` to
   *  reveal the full set on the map, and read it for a "which lines are near here" list. */
  collectAllLines: () => AllLines;
  /** Whether Advanced reading mode is on (the free rung that reveals the advanced
   *  views/overlays). Read it before opening an advanced-gated view, so the menus
   *  stay in step with what's on screen. */
  advancedMode: boolean;
  /** Switch Advanced reading mode — the same setter the built-in toggles use, so
   *  turning it OFF also closes any advanced-only feature that's active. */
  setAdvancedMode: (on: boolean) => void;
  /** Force a BUILT-IN view window open by id — the built-ins' twin of
   *  {@link openExtension} ('charts' is the chart browser). Idempotent. An
   *  advanced-gated view ('skyTimes'/'localSpace') opens regardless of the Advanced
   *  switch — flip {@link setAdvancedMode} first so the menus agree — and a view
   *  lock doesn't block the state flip: the window appears once the lock clears. */
  openView: (
    id: 'coordinates' | 'minimap' | 'teleport' | 'skyTimes' | 'localSpace' | 'charts',
  ) => void;
  /** Open the settings sidebar, optionally at an accordion section (a
   *  SidebarSection id, e.g. 'filters' — typed as plain string so this module
   *  stays free of component types). */
  openSettings: (section?: string) => void;
  /** Open the credits / licenses dialog — the disclosures behind the map's
   *  attribution button (data sources, libraries, and their licences). */
  openCredits: () => void;
  /** Open state of the built-in reference surfaces (the guides card + info chip) —
   *  the read half of {@link setViewFlag}. */
  viewFlags: { guides: boolean; info: boolean };
  /** Show/hide a built-in reference surface — for an extension that HOSTS those
   *  toggles after claiming their menu rows (see lib/extensions/viewRowClaims). */
  setViewFlag: (id: 'guides' | 'info', open: boolean) => void;
  /** The ids of the tool extensions currently OPEN — the read half of
   *  {@link openTool}, mirroring {@link openExtensionIds}. */
  openToolIds: ReadonlySet<string>;
  /** Close a tool extension by id (no-op unless open) — the inverse of
   *  {@link openTool}, e.g. releasing a viewport-owning tool before opening a
   *  map window it parks. */
  closeTool: (id: string) => void;
}

/** 'core' is always available; 'gated' is subject to the entitlement resolver. */
export type Entitlement = 'core' | 'gated';

export interface MapExtension {
  /** Stable unique id; also the open/closed-state key. */
  id: string;
  /** View-menu label, already localized (extensions own their own strings). */
  label: string;
  /** Where the extension's TOGGLE lives (default 'view' = a View-menu row).
   *  'timeline-drawer' puts it in the time-overlay bar's display drawer instead
   *  (beside the Natal/Zenith toggles): available only while a timeline overlay
   *  is active (leaving those overlays closes it). Follows the same nudge policy
   *  as the View menu — a nudged un-entitled user sees it as a clickable teaser,
   *  everyone else un-nudged sees nothing. */
  surface?: 'view' | 'timeline-drawer';
  /** Where the extension's HUD sits (default 'map': a floating window over the
   *  map, parked while a registered surface owns the viewport — see
   *  lib/extensions/viewLock). 'modal' marks a full-screen takeover with its own
   *  opaque backdrop (like the chart browser): it layers ABOVE the app, so both
   *  its render and its hotkey stay live under a view lock. */
  layer?: 'map' | 'modal';
  /** localStorage key to persist open/closed; omit for a non-persisted HUD. */
  storageKey?: string;
  /** Single-key shortcut (optional). For a 'view' surface it's global and shown
   *  in the View menu; for a 'timeline-drawer' surface it's live ONLY while the
   *  time-overlay bar is up (the host shadows the letter's base action there)
   *  and shown in the drawer toggle's hover tip. */
  hotkey?: string;
  /** An additional key that triggers the same entry WITHOUT being advertised
   *  in the menus — keeps a legacy/conventional key alive after a remap (a
   *  surface that lists shortcuts may still choose to mention it). Matched by
   *  the core dispatch for 'view'-surface entries only. */
  hotkeyAlias?: string;
  /** A short description of the feature for the toggle's hover tip, already
   *  localized (optional; shown where the surface renders tips — currently the
   *  timeline-drawer rows). */
  hint?: string;
  /** Whether it starts open the first time (before any persisted state). */
  defaultOpen?: boolean;
  /** Defaults to 'core'. A 'gated' extension is subject to the entitlement resolver. */
  tier?: Entitlement;
  /** The extension docks a panel that RESERVES the left column (shrinks the map out
   *  from under it — see lib/leftDock `reserve`). The host treats it as mutually
   *  exclusive with the built-in expanded chart panel, since both own the left edge:
   *  opening either closes the other. */
  reservesLeftColumn?: boolean;
  /** The HUD, rendered when the extension is open AND entitled. */
  render: (ctx: MapExtensionContext, onClose: () => void) => ReactNode;
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
