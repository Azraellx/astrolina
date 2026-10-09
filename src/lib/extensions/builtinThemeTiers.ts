// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Built-in theme tiers (2026-10-08) — lets a downstream build put a BUILT-IN theme on a rung,
// so that switching to it needs that rung, without editing Sidebar.tsx or App.tsx. The open
// core sets none: all three built-ins are open to everyone, as they always were.
//
// What a tier gates is the PICK, and only the pick. The theme a reader is already drawn in
// stays theirs whatever their rung — a reader who chose Dark before the build tiered it, or
// whose account has ended, keeps Dark and can re-pick it; only a switch TO a tiered theme from
// another one asks for the rung (lib/themeChoice decideThemePick). That is deliberately not a
// hold like the theme option's: there is no standing state to mask, nothing is drawn other
// than what was chosen, so there is nothing to announce and nothing to release — and taking a
// working theme off someone's screen to make a plan point would be the change-in-silence
// CLAUDE.md's settings rules exist to prevent.
//
// Resolved by the shared entitlement policy (./entitlement), so the one setEntitlementResolver
// call that gates every other seam gates this one, and the answer follows the account rather
// than the Advanced reading toggle (the theme option's rule). The row's badge, tip tag and
// teaser visibility come from the same tier through lib/plan, as every tiered row's do.

import type { Theme } from '../theme';
import { DEFAULT_THEME } from '../theme';
import { isEntitled, type Entitlement } from './entitlement';

const tiers = new Map<Theme, Entitlement>();

/** Put a built-in theme on a rung (downstream builds only; call at startup). The DEFAULT theme
 *  can't be tiered and is ignored: it is what a missing or unreadable stored theme loads as,
 *  and what a held theme option falls back to, so it has to be open to every reader. */
export function setBuiltinThemeTier(theme: Theme, tier: Entitlement): void {
  if (theme === DEFAULT_THEME) return;
  tiers.set(theme, tier);
}

/** The rung a built-in sits on: 'core' (open to all) unless a build tiered it. */
export function builtinThemeTier(theme: Theme): Entitlement {
  return tiers.get(theme) ?? 'core';
}

/** Whether this reader's account reaches the built-in's rung. */
export function builtinThemeEntitled(theme: Theme): boolean {
  return isEntitled({ id: `theme:${theme}`, tier: builtinThemeTier(theme) });
}
