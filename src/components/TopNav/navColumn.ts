// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { getLeftDockWidth } from '../../lib/leftDock';
import { getRightDockWidth } from '../../lib/rightDock';
import { isTouchLayout } from '../../lib/touch';

// The MAP COLUMN the top nav and its dropdowns have to stay inside: from the widest left dock
// to the widest right dock (the screen's edges with none). Both kinds of dock count — the
// Reports dock RESERVES its column (z 29) and the expanded chart sidebar OVERLAYS the map
// (z 30), but either one paints over the nav (z 25), so anything of the nav's that slides under
// a dock is simply gone. On the right the +/- zoom control holds the corner the nav shares a row
// with; a reserving right dock (lib/rightDock, 2026-10-08) shrinks the map frame the control
// rides in, so the corner moves in with the column's right end and `zoomLeft` follows it.
//
// Read in JS rather than restated in CSS because the decisions that need it — whether the full
// bar fits, where a clamped bar's ends land, whether an open menu runs off — all turn on widths
// only the DOM knows: the bar's natural width (it depends on the chart's name), its sideways
// pill-recentring nudge, the readout bar under it, a menu's widest row.

/** The zoom control's footprint, as Map.css sizes it (`.maplibregl-ctrl-top-right`: 36px wide,
 *  42 on touch, `right: var(--edge, 16px)`), and the gap the nav keeps from it. The widths are
 *  only the fallback for a control that isn't laid out yet (or is hidden while framing a
 *  capture): the live one is measured. It was a flat 36 until 1 Oct, which on touch — where the
 *  buttons grow to 40px — left the nav 2px from the control instead of 8, and the docks'
 *  one-row cap (TopNav step 1b) inherited the same 6px. */
export const ZOOM_CTRL_W = 36;
const ZOOM_CTRL_W_TOUCH = 42;
export const ZOOM_GAP = 8;

function zoomWidth(): number {
  const w = document.querySelector<HTMLElement>('.maplibregl-ctrl-top-right')?.offsetWidth ?? 0;
  if (w > 0) return w;
  return isTouchLayout() ? ZOOM_CTRL_W_TOUCH : ZOOM_CTRL_W;
}

export interface NavColumn {
  /** Viewport x where the map column starts — the widest left dock of either kind (0 with none). */
  left: number;
  /** Viewport x where it ends: the widest right dock's left edge (the screen's right edge with
   *  none). */
  right: number;
  /** The nav's own gutter from either end (TopNav.css reads `var(--edge, 10px)`). */
  edge: number;
  /** Viewport x of the zoom control's left edge. */
  zoomLeft: number;
}

/** `--edge` is set only on touch (index.css); a desktop leaves it unset and every element
 *  keeps its own fallback — the nav 10px, the zoom control 16px — so null means "use yours". */
function edgeVar(): number | null {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--edge'));
  return Number.isFinite(v) ? v : null;
}

export function navColumn(): NavColumn {
  const e = edgeVar();
  const right = window.innerWidth - getRightDockWidth();
  return {
    left: getLeftDockWidth(),
    right,
    edge: e ?? 10,
    zoomLeft: right - (e ?? 16) - zoomWidth(),
  };
}

/** Slide an open dropdown sideways, if it has to, so it lands inside the map column — off the
 *  screen's right edge and out from under a dock. A menu opens below its trigger, and beside a
 *  dock the bar's ends sit near the column's: measured with the Reports dock open, the View
 *  menu ran 24–29 px off the screen edge from the full bar (1920 at the dock's widest, 1280 at
 *  its narrowest), and on a 1024 window the compact bar's Tools menu opened 94 px under the
 *  dock. A no-op wherever the panel already fits, which is every roomy layout.
 *  Uses the `translate` property, which composes with the `scale` of the panels' ui-pop entrance
 *  rather than fighting it; the width comes from offsetWidth and the centre from the rect,
 *  because that entrance scales the rect about its centre on the first frame. */
export function fitToNavColumn(panel: HTMLElement): void {
  panel.style.translate = '';
  const col = navColumn();
  const r = panel.getBoundingClientRect();
  const half = panel.offsetWidth / 2;
  const cx = r.left + r.width / 2;
  const lo = col.left + col.edge;
  const hi = col.right - col.edge;
  let dx = 0;
  if (cx + half > hi) dx = hi - (cx + half);
  // The left bound wins when the panel is wider than the column: a panel cut off at the screen
  // edge still shows its start, one slid under a dock shows nothing of the rows beneath it.
  if (cx - half + dx < lo) dx = lo - (cx - half);
  if (Math.abs(dx) >= 1) panel.style.translate = `${Math.round(dx)}px 0`;
}
