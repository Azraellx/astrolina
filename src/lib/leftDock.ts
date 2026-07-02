// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Left-dock width registry. `--es-width` on <html> tells the whole chrome how
// much of the LEFT edge is covered by a docked panel — the map edge-glow insets
// by it, flyTo centering and the floating HUDs shift by it, and the top bars
// re-center around it. Historically the expanded chart sidebar wrote the var
// directly; any second docked panel would then collide (last writer wins, and
// either panel's unmount reset the var to 0 under the other). This registry
// makes publishing safe for ANY number of docked panels: each publishes its own
// width under a stable id, and the var carries the MAX (every publisher is
// left-anchored, so content must clear the widest). Empty registry → 0px.
const widths = new Map<string, number>();

function apply(): void {
  let max = 0;
  for (const w of widths.values()) if (w > max) max = w;
  document.documentElement.style.setProperty('--es-width', `${max}px`);
}

/** Publish (or update) a docked panel's width. Call from a layout effect. */
export function publishLeftDock(id: string, px: number): void {
  widths.set(id, px);
  apply();
}

/** Retire a docked panel (its unmount cleanup). Recomputes the var from the rest. */
export function retireLeftDock(id: string): void {
  widths.delete(id);
  apply();
}
