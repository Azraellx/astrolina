// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The plan / subscription tier ladder as ONE source of truth, so the open-core "Advanced"
// gating and the downstream paid gating are two rungs of a single mechanism rather than
// parallel concepts. A feature declares the tier it BELONGS to; the menu badge and the
// visibility rules read from here, so adding a downstream feature is just `tier: 'gated'` —
// it inherits the badge + gating with no new wiring.
//
//   • new   — the baseline every user has.
//   • adv   — Advanced reading mode: OPEN-SOURCE, a free toggle (advancedWheel). Its
//             features (Slide, Local Space, Synastry, Eclipses, the Advanced settings tab)
//             are HIDDEN until the user opts in — no upsell, just more depth once enabled.
//   • gated — the DOWNSTREAM tier: a private build's extra Tools / Overlay / View options +
//             the 5th settings tab, added through the extension seams and gated by the
//             entitlement resolver (./extensions/entitlement). Gated the SAME way as adv —
//             HIDDEN until the tier is reached, no teaser. The core names this rung only
//             generically ('gated'); its user-facing label + final accent come downstream.
//
// Why a ladder and not booleans: the product is a subscription tier you climb — once a user
// opts into ADV they rarely go back (it only adds features), and the gated tier is the same
// step one rung higher. Both rungs gate identically (hidden until reached), so "is this
// unlocked?" is a single `tierMet` comparison and a downstream build slots its tier in
// without touching the core mechanism. (Core convention: name the paid rung 'gated', never
// by a product/plan name — that lives downstream.)

import type { Entitlement } from './extensions/entitlement';

export type PlanTier = 'new' | 'adv' | 'gated';

const RANK: Record<PlanTier, number> = { new: 0, adv: 1, gated: 2 };

/** Whether the user's current tier reaches (meets or exceeds) the tier a feature requires. */
export function tierMet(current: PlanTier, required: PlanTier): boolean {
  return RANK[current] >= RANK[required];
}

// The user's tier is DERIVED from the open-source Advanced toggle by default (new ↔ adv) —
// the core can never reach the gated rung on its own. A downstream build installs its own
// resolver (entitlement check) to reach 'gated' when the user is entitled. The seam mirrors
// setEntitlementResolver: App calls planTierFor(advancedWheel) each render, so installing the
// resolver before the app boots makes the gated tier live. Keep the resolver SYNCHRONOUS and
// cheap (it runs per render) — read a value the downstream already holds, don't fetch.
let resolveTier: (advanced: boolean) => PlanTier = (advanced) => (advanced ? 'adv' : 'new');

/** Install the plan-tier resolver (downstream builds only). One call gates the whole app. */
export function setPlanTierResolver(fn: (advanced: boolean) => PlanTier): void {
  resolveTier = fn;
}

/** The user's current plan tier, given the open-source Advanced-toggle state. */
export function planTierFor(advanced: boolean): PlanTier {
  return resolveTier(advanced);
}

// Badge labels per rung. The core ships labels only for the tiers it OWNS; the gated tier's
// label is supplied by the downstream build via setGatedTierLabel (the core names no paid
// tier). NEW is the baseline, so it never badges a menu row in practice.
const LABELS: Record<PlanTier, string> = { new: 'NEW', adv: 'ADV', gated: '' };

/** Install a tier's user-facing label (downstream builds only). The core ships
 *  defaults for the tiers it owns; a downstream build can rename any rung — e.g.
 *  to its own plan names — without the core knowing those names. */
export function setTierLabel(tier: PlanTier, label: string): void {
  LABELS[tier] = label;
}

/** Install the gated tier's user-facing badge label (downstream builds only). */
export function setGatedTierLabel(label: string): void {
  setTierLabel('gated', label);
}

/** The short badge label for a tier, or '' when none should show (NEW, or an unset gated). */
export function tierLabel(tier: PlanTier): string {
  return LABELS[tier];
}

// Full plan NAME per rung — the longer display name shown on the profile/sidebar plan PILL,
// as opposed to the compact tierLabel code shown on menu tier badges + tip markers. Defaults
// mirror the labels; a downstream build renames the rungs to its own plan names.
const NAMES: Record<PlanTier, string> = { new: 'NEW', adv: 'ADV', gated: '' };

/** Install a tier's full display name (downstream builds only). */
export function setTierName(tier: PlanTier, name: string): void {
  NAMES[tier] = name;
}

/** The full display name for a tier (shown on the profile/sidebar plan pill). */
export function tierName(tier: PlanTier): string {
  return NAMES[tier];
}

/** A registered extension's coarse 'core' | 'gated' entitlement expressed on the plan
 *  ladder: a 'gated' add-on is the gated tier, everything else is the baseline. Reconciles
 *  the two vocabularies in ONE place so a gated extension automatically reads as gated. */
export function tierOfEntitlement(tier: Entitlement | undefined): PlanTier {
  return tier === 'gated' ? 'gated' : 'new';
}
