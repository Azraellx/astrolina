// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Credits-dialog seams — let a downstream build extend the credits/licenses
// window WITHOUT editing it. A sibling of the profile-section seam. Two hooks:
// a single-slot FOOTER (e.g. Privacy / Terms links) and a multi-registry of
// GROUP ITEMS — disclosure rows appended to one of the core groups, for data or
// dependencies a downstream build bundles that the open core doesn't ship.
// The open core registers nothing for either.

import type { ReactNode } from 'react';

export interface CreditsFooter {
  /** Extra footer content (e.g. legal links). Absent in the open core. */
  render?: () => ReactNode;
}

let footer: CreditsFooter = {};

/** Install the credits-footer customization (downstream builds only). Last call wins. */
export function registerCreditsFooter(f: CreditsFooter): void {
  footer = f;
}

/** The installed customization, or an empty object in the open core. */
export function getCreditsFooter(): CreditsFooter {
  return footer;
}

/** The core credit groups a registered row can append to. */
export type CreditsGroupKey = 'astrolina' | 'mapsPlaces' | 'astronomy' | 'typeSoftware';

/** One appended disclosure row, rendered with the same chrome as the core's own
 *  rows (name/link + license chip + note). Strings arrive already localized —
 *  extensions own their strings. */
export interface CreditsGroupItem {
  group: CreditsGroupKey;
  name: string;
  href?: string;
  license: string;
  note: string;
}

const groupItems: CreditsGroupItem[] = [];

/** Append disclosure rows to core credit groups (downstream builds only).
 *  Call once at startup; rows render after the group's own, in call order. */
export function registerCreditsItems(items: CreditsGroupItem[]): void {
  groupItems.push(...items);
}

/** The registered rows for one group (empty in the open core). */
export function getCreditsItems(group: CreditsGroupKey): CreditsGroupItem[] {
  return groupItems.filter((i) => i.group === group);
}
