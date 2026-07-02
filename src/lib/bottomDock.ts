// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Bottom-dock height registry — the bottom-edge sibling of lib/leftDock.ts.
// `--sky-band-h` on <html> tells the viewport-anchored bottom furniture (the
// edge glow, the docked overlay bars, the minimap, the info chip, the zoom-out
// pill, the movable-HUD clamp) how much of the bottom edge is a reserved
// layout band, so each shifts up by it. NOTE: the map canvas itself does NOT
// read this var — the map takes its inset as a prop (an inline style commits
// before layout effects, so its resize() always measures the final size; a
// var write from a sibling's effect can land after the map already resized).
const heights = new Map<string, number>();

function apply(): void {
  let max = 0;
  for (const h of heights.values()) if (h > max) max = h;
  document.documentElement.style.setProperty('--sky-band-h', `${max}px`);
}

/** Publish (or update) a bottom band's height. Call from a layout effect. */
export function publishBottomDock(id: string, px: number): void {
  heights.set(id, px);
  apply();
}

/** Retire a bottom band (its unmount cleanup). Recomputes from the rest. */
export function retireBottomDock(id: string): void {
  heights.delete(id);
  apply();
}
