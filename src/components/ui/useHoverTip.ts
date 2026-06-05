// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useRef, useState } from 'react';

export type TipPlacement = 'left' | 'top' | 'bottom' | 'bottom-start' | 'right';

export interface TipPos {
  left: number;
  top: number;
}

// Compute where a tip should sit for a given trigger rect + placement. 'left'
// pops to the trigger's left and 'right' to its right (both vertically centred,
// for edge-docked chrome like the sidebars, minimap, and zoom controls); 'bottom'
// pops below, horizontally centred (the top bar). Coordinates are viewport-
// relative — the card is position: fixed and portaled to <body>, so nothing clips it.
export function tipPosFor(r: DOMRect, placement: TipPlacement): TipPos {
  if (placement === 'bottom') {
    return { left: r.left + r.width / 2, top: r.bottom + 8 };
  }
  if (placement === 'bottom-start') {
    return { left: r.left, top: r.bottom + 8 };
  }
  if (placement === 'right') {
    return { left: r.right + 8, top: r.top + r.height / 2 };
  }
  if (placement === 'top') {
    return { left: r.left + r.width / 2, top: r.top - 8 };
  }
  return { left: r.left - 8, top: r.top + r.height / 2 };
}

// Convenience for React triggers: a ref + hover/focus handlers that drive the
// tip position. (Plain DOM triggers — e.g. MapLibre's zoom buttons — set the
// position themselves with tipPosFor instead.)
export function useHoverTip<T extends HTMLElement>(placement: TipPlacement = 'left') {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState<TipPos | null>(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos(tipPosFor(r, placement));
  };
  const hide = () => setPos(null);
  return { ref, pos, show, hide };
}
