// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Shared entitlement seam for the gated extension registries. The Tools-menu
// (./toolExtensions) and Overlay-menu (./overlayExtensions) seams both host gated
// add-ons; rather than each carrying its own policy, they consult ONE resolver
// installed here. A downstream build wires entitlement for BOTH new seams with a
// single setEntitlementResolver call — so neither registry can silently "fall open"
// (render a paid HUD to a free user) because the install was forgotten on one of them.
//
// The resolver is keyed on the minimal { id, tier } shape every extension shares — it
// never needs the render fns, labels, or shortcut badges — so one (ext) => boolean
// gates every registry regardless of its other fields. The open core installs no
// resolver (everything resolves to entitled).
//
// The original View-menu seam (./mapExtensions) predates this module and keeps its own
// resolver for backward compatibility with already-shipped downstream wiring; it is
// gated independently. New seams should delegate here instead of copying the boilerplate.

import type { Entitlement } from './mapExtensions';
export type { Entitlement } from './mapExtensions';

/** The minimal shape the entitlement policy inspects — every extension satisfies it. */
export interface GatedExtension {
  /** Stable unique id (also the policy's natural lookup key). */
  id: string;
  /** Defaults to 'core'. Only 'gated' extensions consult the resolver. */
  tier?: Entitlement;
}

// The open core ships no gating (everything resolves to available). A downstream build
// installs its own — e.g. checking a license/session — via setEntitlementResolver.
let resolveEntitled: (ext: GatedExtension) => boolean = () => true;

/** Install the entitlement policy (downstream builds only). One call covers every
 *  registry that delegates here — currently the Tools and Overlay menus. */
export function setEntitlementResolver(fn: (ext: GatedExtension) => boolean): void {
  resolveEntitled = fn;
}

/** Whether `ext`'s real HUD (vs. its CTA) should render for the current user. */
export function isEntitled(ext: GatedExtension): boolean {
  return ext.tier !== 'gated' || resolveEntitled(ext);
}
