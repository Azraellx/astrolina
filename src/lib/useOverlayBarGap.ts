// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useEffect } from 'react';

// A bottom overlay bar (timeline / eclipse / synastry — all docked at the same bottom-centre slot)
// publishes its rendered height + a small clearance gap to --overlay-bar-gap on the document root.
// The map's "Zoom out" escape pill reads it (on touch) to lift itself ABOVE a visible bar instead
// of tucking behind it; with no bar up the variable is 0px, so the pill drops back to the gutter.
// Only one such bar is mounted at a time, so they share the single variable. The height is tracked
// live (ResizeObserver), so the pill follows the bar as it expands / collapses.
const CLEARANCE_PX = 8;

export function useOverlayBarGap(ref: { readonly current: HTMLElement | null }): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () => {
      const h = el.offsetHeight;
      // h === 0 when the bar is mounted but not laid out (hidden) — treat as "no bar".
      document.documentElement.style.setProperty(
        '--overlay-bar-gap',
        h > 0 ? `${h + CLEARANCE_PX}px` : '0px',
      );
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty('--overlay-bar-gap', '0px');
    };
  }, [ref]);
}
