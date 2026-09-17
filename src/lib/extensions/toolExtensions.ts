// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Tools-menu extension registry — the seam that lets a feature attach a Tools-menu
// item and a floating HUD WITHOUT editing App.tsx or TopNav.tsx. The core tools
// (Measure, Slide) keep their own inline wiring; anything registered here is rendered
// IN ADDITION, beneath the built-ins in the Tools dropdown.
//
// This is the Tools-menu twin of the View-menu seam in ./mapExtensions, and works the
// same way: a downstream build registers a tool by calling registerToolExtension({...})
// at startup and ships its own HUD + label, touching no core file. A tool extension is
// modelled as a toggled HUD (open/closed, optionally persisted) — the same shape as a
// View extension, just surfaced in the Tools dropdown. The core's armed-tool icon and
// the secondary readout bar stay core-owned; an extension renders its own HUD/readout.
//
// Gating: a 'gated' tool renders its HUD only when entitled — the menu hides it
// otherwise (no teaser). Entitlement is shared with the Overlay seam via ./entitlement
// — installing ONE resolver gates both. The open core ships no tool extensions (the
// registry is empty, so every menu and render path is a no-op here).

import type { ReactNode } from 'react';
import type { MapExtensionContext } from './mapExtensions';
import type { GatedExtension } from './entitlement';

// The same read-only app snapshot + actions handed to View extensions is reused here,
// so a tool HUD reads the chart/map state and drives the app the same way.
export type { MapExtensionContext } from './mapExtensions';
// Entitlement is the SHARED policy (see ./entitlement) — re-exported so a consumer can
// register tools and install the (Tools + Overlay) entitlement resolver from one import.
export {
  setEntitlementResolver,
  isEntitled,
  type Entitlement,
  type GatedExtension,
} from './entitlement';

export interface ToolExtension extends GatedExtension {
  /** Stable unique id; also the open/closed-state key. */
  id: string;
  /** Tools-menu label, already localized (extensions own their own strings). */
  label: string;
  /** Optional glyph shown beside the label (and in the hover tip), like the built-in tools.
   *  A ReactNode — typically an inline `<svg>`; omit to show just the label. */
  icon?: ReactNode;
  /** localStorage key to persist open/closed; omit for a non-persisted HUD. */
  storageKey?: string;
  /** Single-key shortcut shown as the menu badge. Display-only — like the View
   *  menu's extension hotkeys, it is NOT wired to a global key handler. */
  hotkey?: string;
  /** Hover-tip body shown on the menu item (explains what the tool does, and — if the
   *  extension wishes — why it might be unavailable). */
  hint?: string;
  /** Optional content shown in the secondary readout bar (below the top nav) while this tool is
   *  open — the extension's equivalent of the built-in tools' readout. A plain string works for a
   *  static usage hint; pass a small component (that subscribes to the tool's own state) for a live
   *  one. Omit to leave the bar to the usual place-name readout. */
  readout?: ReactNode;
  /** Whether it starts open the first time (before any persisted state). */
  defaultOpen?: boolean;
  /** Defaults to 'core' (inherited). A 'gated' tool is subject to the entitlement
   *  resolver in ./entitlement. */
  tier?: GatedExtension['tier'];
  /** The tool draws or reads the REAL sky at the chart's moment — bodies over the Earth
   *  at the chart's sidereal time — so it has no meaning beside the geodetic (Mundane)
   *  line system, which is time-independent and carries no sidereal time. Declaring it
   *  gets the tool the handling the host's own Local Space and Slide get, in both
   *  directions:
   *
   *  - opening it while Mundane is on screen REWRITES the line system to Celestial and
   *    announces it by the tool's `label`;
   *  - Mundane becoming the line system while it is open — chosen, or handed back by the
   *    zodiac returning to Tropical — CLOSES it and announces that.
   *
   *  The tool never has to check `ctx.lineSystem` for this itself: while it is open, the
   *  line system it reads is Celestial. */
  needsSiderealTime?: boolean;
  /** The HUD, rendered when the tool is open AND entitled. */
  render: (ctx: MapExtensionContext, onClose: () => void) => ReactNode;
}

const registry = new Map<string, ToolExtension>();

/** Register a Tools-menu extension. Call once at startup; idempotent per id. */
export function registerToolExtension(ext: ToolExtension): void {
  registry.set(ext.id, ext);
}

/** All registered tool extensions, in registration order. */
export function getToolExtensions(): ToolExtension[] {
  return [...registry.values()];
}
