// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Local-space placeholder seam — lets a downstream build fill the local-space dials' slot
// when the caller's tier gate holds the real dials back. The expanded sidebar renders the
// installed node in the dials' place (at the dial size); the open core installs nothing, so
// the slot stays empty and nothing shows where the dials would. A gated build registers a
// renderer at startup. The single-slot twin of the menu registries in this folder.

import type { ReactNode } from 'react';

let renderer: ((size: number) => ReactNode) | null = null;

/** Install the gated local-space slot renderer (downstream builds only). Last call wins. */
export function registerLocalSpaceGatedSlot(fn: (size: number) => ReactNode): void {
  renderer = fn;
}

/** The installed slot rendered at the dial size, or null in the open core (or when the
 *  downstream renderer itself declines to show anything). */
export function renderLocalSpaceGatedSlot(size: number): ReactNode {
  return renderer ? renderer(size) : null;
}
