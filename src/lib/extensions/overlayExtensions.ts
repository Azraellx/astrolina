// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Overlay-menu extension registry — the seam that lets a feature attach an Overlay-menu
// mode (a single-select row in the Overlay dropdown) and a floating HUD WITHOUT editing
// App.tsx or TopNav.tsx. The core modes (Transits, Progressed, Eclipses, …) keep their
// own inline wiring; anything registered here is rendered IN ADDITION, beneath the
// built-ins in the Overlay dropdown.
//
// This is the Overlay-menu twin of the View-menu seam in ./mapExtensions, with one
// difference: the Overlay menu is SINGLE-SELECT. At most one overlay is active at a
// time, so selecting a registered overlay clears the active core mode (and picking a
// core mode, or None, clears the active extension). The extension renders its own HUD
// while active; contributing map linework is the extension's own responsibility — the
// core overlay-line pipeline stays core-owned (an extension that needs to draw lines
// does so through its own map layers / the context actions).
//
// Gating: a 'gated' overlay renders its HUD when entitled, or an optional CTA
// (`renderLocked`) when not. Entitlement is shared with the Tools seam via ./entitlement
// — installing ONE resolver gates both. The open core ships no overlay extensions (the
// registry is empty, so every menu and render path is a no-op here).

import type { ReactNode } from 'react';
import type { MapExtensionContext } from './mapExtensions';
import type { GatedExtension } from './entitlement';

// The same read-only app snapshot + actions handed to View extensions is reused here.
export type { MapExtensionContext } from './mapExtensions';
// Entitlement is the SHARED policy (see ./entitlement) — re-exported so a consumer can
// register overlays and install the (Tools + Overlay) entitlement resolver from one import.
export {
  setEntitlementResolver,
  isEntitled,
  type Entitlement,
  type GatedExtension,
} from './entitlement';

export interface OverlayExtension extends GatedExtension {
  /** Stable unique id; also the active-overlay key (persisted by the core). */
  id: string;
  /** Overlay-menu label, already localized (extensions own their own strings). */
  label: string;
  /** Fuller name shown as the hover-tip title when `label` is abbreviated. */
  tipTitle?: string;
  /** Hover-tip body shown on the menu row (describes the overlay). */
  hint?: string;
  /** Shortcut badge shown on the menu row — a letter or small glyph, matching the
   *  core overlay rows (which use a cycle glyph). Display-only — like the View menu's
   *  extension hotkeys, it is NOT wired to a global key handler. */
  hotkey?: ReactNode;
  /** Defaults to 'core' (inherited). A 'gated' overlay is subject to the entitlement
   *  resolver in ./entitlement. */
  tier?: GatedExtension['tier'];
  /** The HUD, rendered while this overlay is the active one AND entitled. */
  render: (ctx: MapExtensionContext, onClose: () => void) => ReactNode;
  /** Optional panel rendered when a 'gated' overlay is selected WITHOUT entitlement
   *  (the call-to-action shown in place of the HUD). `onClose` clears the selection. */
  renderLocked?: (onClose: () => void) => ReactNode;
}

const registry = new Map<string, OverlayExtension>();

/** Register an Overlay-menu extension. Call once at startup; idempotent per id. */
export function registerOverlayExtension(ext: OverlayExtension): void {
  registry.set(ext.id, ext);
}

/** All registered overlay extensions, in registration order. */
export function getOverlayExtensions(): OverlayExtension[] {
  return [...registry.values()];
}
