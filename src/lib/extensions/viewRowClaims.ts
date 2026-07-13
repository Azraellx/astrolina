// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Built-in View-menu row claims — the seam that lets a registered extension HOST
// a built-in reference row inside its own surface instead: a claimed row leaves
// the View menu, while the window behind it stays controllable through the
// extension context's viewFlags. Claim at startup (registration time, before
// first render), like the extension registries. The open core claims nothing —
// every built-in row renders as always.

const claimed = new Set<string>();

/** Claim built-in View-menu rows by id — call at extension registration. */
export function claimViewRows(ids: readonly string[]): void {
  for (const id of ids) claimed.add(id);
}

/** Whether an extension has claimed a built-in View-menu row. */
export function isViewRowClaimed(id: string): boolean {
  return claimed.has(id);
}
