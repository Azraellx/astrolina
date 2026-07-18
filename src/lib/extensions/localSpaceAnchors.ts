// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Local-space origin anchors — let a downstream build add origin choices to the
// Local Space window WITHOUT editing it (a sibling of the credits-items seam).
// The core ships two built-in origins (the placed pin and the birthplace); a
// registered anchor appears as another segmented button, resolves through
// get()/subscribe(), and may render an inline editor below the origin row while
// it is the selected origin (e.g. a picker that sets the anchor's place). The
// open core registers none.

import type { ReactNode } from 'react';

export interface LocalSpaceAnchor {
  /** Persisted as the origin-pref value — pick something short and stable.
   *  Must not collide with the built-in 'pin' / 'birthplace'. */
  id: string;
  /** Segmented-button label. Extensions own their strings (already localized). */
  label: string;
  /** Hover-tip headline + hint for the button. */
  tipTitle: string;
  tipHint: string;
  /** The anchor's current point, or null while unset (the origin then falls
   *  back to the birthplace). useSyncExternalStore semantics: must return a
   *  referentially stable snapshot until the value actually changes. */
  get(): { lat: number; lng: number } | null;
  /** Change notification for get(). */
  subscribe(cb: () => void): () => void;
  /** Optional inline editor, rendered inside the window while selected. */
  renderEditor?: () => ReactNode;
}

const anchors: LocalSpaceAnchor[] = [];

/** Register an origin anchor (downstream builds only). Call once at startup,
 *  before the app first renders. Registration order = button order. */
export function registerLocalSpaceAnchor(a: LocalSpaceAnchor): void {
  anchors.push(a);
}

/** Every registered anchor (empty in the open core). */
export function getLocalSpaceAnchors(): LocalSpaceAnchor[] {
  return anchors;
}

/** The anchor persisted under this origin id, or null (built-ins / stale ids). */
export function findLocalSpaceAnchor(id: string): LocalSpaceAnchor | null {
  return anchors.find((a) => a.id === id) ?? null;
}

// Stable no-op subscription pair for "no anchor selected" — lets a caller keep
// its useSyncExternalStore unconditional across built-in and anchor origins.
export const subscribeNoAnchor = (): (() => void) => () => {};
export const getNoAnchor = (): null => null;
