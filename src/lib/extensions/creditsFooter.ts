// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Credits-dialog seams — let a downstream build extend the credits/licenses
// window WITHOUT editing it. A sibling of the profile-section seam. Two hooks:
// a single-slot CUSTOMIZATION (footer content such as Privacy / Terms links, plus
// a tail for the report-a-problem notice) and a multi-registry of GROUP ITEMS —
// disclosure rows appended to one of the core groups, for data or dependencies a
// downstream build bundles that the open core doesn't ship. The open core
// registers nothing for either.

import type { ReactNode } from 'react';

/** What the notice tail may DO, handed to it at render time. The dialog has no
 *  extension context of its own, so the actions it can offer are passed in by the
 *  host (Map) rather than reached for — and a build that renders the dialog without
 *  a context gets no tail rather than a dead link. */
export interface CreditsNoticeActions {
  /** Open a registered View-menu extension by id; the credits dialog closes first. */
  openExtension: (id: string) => void;
}

export interface CreditsFooter {
  /** Extra footer content (e.g. legal links). Absent in the open core. */
  render?: () => ReactNode;
  /** Extra content at the END of the report-a-problem notice, beside the contact
   *  address — for a build that repeats the same notice somewhere with more room
   *  (a help page) and wants to point at it. Absent in the open core, where the
   *  address is the only route. */
  renderNotice?: (actions: CreditsNoticeActions) => ReactNode;
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
