// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Settings-sidebar section registry — the seam that lets a downstream build add an
// accordion SECTION to the settings sidebar (a 5th tab beyond Appearance / Map
// Filters / Calculation / Advanced) WITHOUT editing Sidebar.tsx. The core sections
// keep their own inline wiring; anything registered here renders IN ADDITION, beneath
// the built-ins.
//
// The settings twin of the Tools (./toolExtensions) and Overlay (./overlayExtensions)
// menu seams. Gating is SHARED with them via ./entitlement — one setEntitlementResolver
// call covers all three, so a gated section can't silently fall open. The open core
// registers nothing (the registry is empty, so the render path is a no-op here).

import type { ReactNode } from 'react';
import type { GatedExtension } from './entitlement';

// Entitlement is the SHARED policy (see ./entitlement) — re-exported so a consumer can
// register a section and install the (Tools + Overlay + Settings) resolver from one import.
export {
  setEntitlementResolver,
  isEntitled,
  type Entitlement,
  type GatedExtension,
} from './entitlement';

export interface SettingsSectionExtension extends GatedExtension {
  /** Stable unique id; also the accordion open-state key (persisted by the core). */
  id: string;
  /** Section header label, already localized (extensions own their own strings). */
  label: string;
  /** Defaults to 'core' (inherited). A 'gated' section is subject to the shared
   *  entitlement resolver in ./entitlement. */
  tier?: GatedExtension['tier'];
  /** The section body, rendered when this section is the open accordion AND entitled.
   *  Context-free: a settings section owns its own controls/preferences. */
  render: () => ReactNode;
  /** When present, the whole section (header included) renders only while this
   *  returns true — for sections that configure a surface which is only
   *  sometimes active. Re-evaluated on every sidebar render; pair it with
   *  reactive state the sidebar already subscribes to (e.g. the view lock). */
  visible?: () => boolean;
  /** Optional accent for the section, as an "r, g, b" triplet — a literal like
   *  '120, 90, 200' or a token reference like 'var(--brand-rgb)'. When set, the section
   *  gets the same coloured treatment as the core Advanced tab: a diagonal gradient
   *  header (white label) + the faintest wash behind its open body, both driven from
   *  this one value (--section-accent-rgb). Omit for a plain, un-tinted section. */
  accentRgb?: string;
}

const registry = new Map<string, SettingsSectionExtension>();

/** Register a settings-sidebar section. Call once at startup; idempotent per id. */
export function registerSettingsSection(ext: SettingsSectionExtension): void {
  registry.set(ext.id, ext);
}

/** All registered settings sections, in registration order. */
export function getSettingsSections(): SettingsSectionExtension[] {
  return [...registry.values()];
}
