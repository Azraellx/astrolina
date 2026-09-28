// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { getReservedLeftInset, subscribeReservedLeftInset } from './leftDock';
import { subscribeBottomDock } from './bottomDock';

// Shared movable-HUD behavior for the bottom overlay bars (timeline + synastry).
// They occupy the same bottom-centre slot, so they share ONE saved position: grab
// either bar by its grip to float the whole thing, release near the dock to snap
// home. Flipping overlay modes therefore preserves wherever the user put the bar.
const POS_KEY = 'astro:hud-pos:v1';
// Release within this many px of the docked bottom-centre spot → snap home.
const SNAP_DIST = 64;
// Docked bottom offset, mirroring the bars' CSS `bottom: 16px`.
const DOCK_BOTTOM = 16;
// Reserve headroom at the top so a protruding grip/nub never clamps off-screen.
const TOP_MARGIN = 26;

// The effective horizontal screen centre: shifted right a quarter of the expanded
// sidebar's width (matching the CSS `left: calc(50% + --es-width/4 + --es-reserved/4)`
// the nav and timeline bars use — a RESERVING dock adds the second quarter, landing
// on the true centre of the remaining map column). Shared so every centred surface
// agrees on one centre — the docked bottom bars' snap point, the floating Location
// window's home spot, and the map's Zoom-out button (which mirrors this in CSS).
export function effectiveCenterX(): number {
  const es =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--es-width'),
    ) || 0;
  return window.innerWidth / 2 + es / 4 + getReservedLeftInset() / 4;
}

// A reserved LAYOUT band along the viewport bottom (the sky band — see
// lib/bottomDock.ts): the drag clamp and the snap-home spot both sit above it,
// exactly as the docked bars' CSS does via the same var.
function bottomReserve(): number {
  return (
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--sky-band-h'),
    ) || 0
  );
}

// Clamp a top-left so the bar (w×h) stays fully on screen with a small margin. HUDs are NOT
// pushed clear of the top nav cluster anymore: they render on a layer ABOVE it (see the z-index
// notes in TopNav.css / LocationHud.css / the overlay-bar CSS), so a HUD parked over the bar keeps
// a grabbable grip. Dropping the below-the-nav rule also lets a HUD use the FULL viewport height,
// including the band behind the nav — instead of being forced under the readout.
// The LEFT floor honours a RESERVING dock (lib/leftDock) the same way the bottom
// honours the reserved band: that column belongs to the docked panel, so windows
// can be neither dragged into it nor restored/stranded under it. An OVERLAYING
// panel (the expanded chart sidebar) reserves nothing and clamps like before.
function clampPos(x: number, y: number, w: number, h: number): { x: number; y: number } {
  const left = getReservedLeftInset() + 4;
  const cx = Math.min(Math.max(x, left), Math.max(left, window.innerWidth - w - 4));
  const top = TOP_MARGIN;
  const cy = Math.min(
    Math.max(y, top),
    Math.max(top, window.innerHeight - bottomReserve() - h - 4),
  );
  return { x: cx, y: cy };
}

export interface MovableHud {
  /** Custom top-left (px) while floated; null = docked via CSS. */
  pos: { x: number; y: number } | null;
  /** True mid-drag — use it to suspend any CSS position transition. */
  dragging: boolean;
  /** Spread onto the drag handle element (the bar's grip / nub). */
  handleProps: {
    onPointerDown: (e: ReactPointerEvent) => void;
    onPointerMove: (e: ReactPointerEvent) => void;
    onPointerUp: (e: ReactPointerEvent) => void;
    onPointerCancel: (e: ReactPointerEvent) => void;
    onDoubleClick: () => void;
  };
}

export interface MovableHudOptions {
  /** localStorage key for the saved position. Default: the shared bottom-bar key
   *  (timeline + synastry occupy one slot, so they share it). */
  posKey?: string;
  /** A free-floating window (e.g. the Location window) rather than a bottom-docked bar: it
   *  always carries an explicit position (starting from `initial`), never snaps to
   *  a CSS dock, and double-click re-centres it instead of docking. */
  floating?: boolean;
  /** Starting top-left for a floating window when nothing is saved. */
  initial?: () => { x: number; y: number };
  /** Persist the position to localStorage (default true). When false, the position is
   *  in-memory only: every mount starts at `initial()` and dragging never survives a
   *  reopen — so the window appears in a consistent spot each time. */
  persist?: boolean;
  /** For a window that widens by itself and keeps the wider frame on screen with a
   *  shift of its own, derived at render (the Minor bodies window's list column):
   *  the width the hook's OWN re-clamps (mount, resize, a docked panel's column)
   *  keep on screen — never more than the rendered width — so they save the spot
   *  the narrow frame fits, not the shifted one. A drag measures the rendered frame. */
  clampWidth?: number;
}

export function useMovableHud(
  barRef: RefObject<HTMLElement | null>,
  opts: MovableHudOptions = {},
): MovableHud {
  const posKey = opts.posKey ?? POS_KEY;
  const persist = opts.persist ?? true;
  const homePos = () =>
    opts.floating && opts.initial ? opts.initial() : null;
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    if (persist) {
      try {
        const raw = localStorage.getItem(posKey);
        if (raw) {
          const p = JSON.parse(raw);
          if (typeof p?.x === 'number' && typeof p?.y === 'number') return p;
        }
      } catch {
        /* ignore */
      }
    }
    return homePos();
  });
  const dragRef = useRef<{ offX: number; offY: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (persist) {
      if (pos) localStorage.setItem(posKey, JSON.stringify(pos));
      else localStorage.removeItem(posKey);
    }
    // Nudge the map to re-dodge its edge labels off the bar's new rect (it only
    // recomputes them on pan/zoom otherwise, so a drag would leave them stale).
    window.dispatchEvent(new Event('astro:hud-moved'));
  }, [pos, posKey, persist]);

  // Keep a floated bar on-screen — clamped against the CURRENT viewport on mount
  // (a position saved on a larger/other screen may now be off-screen, and the grip
  // is the only way to recover it), on resize, whenever a docked panel's RESERVED
  // column changes (its open/close/resize re-clamps every floated window into the
  // remaining map column, like the anchored chrome shifting with it), whenever the
  // reserved BOTTOM band changes (the sky band growing into its table or a track
  // pushes a window parked just above it up, rather than sliding beneath it and
  // burying the band's own controls), and whenever the frame itself changes size
  // (a window whose content grows downward — or that is expanded from collapsed —
  // stays clear of the band the same way).
  const docked = pos === null;
  const clampWidth = opts.clampWidth;
  useEffect(() => {
    if (docked) return;
    const onResize = () => {
      const el = barRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const w = clampWidth === undefined ? r.width : Math.min(r.width, clampWidth);
      setPos((p) => {
        if (!p) return p;
        const c = clampPos(p.x, p.y, w, r.height);
        return c.x === p.x && c.y === p.y ? p : c; // no-op when already on-screen
      });
    };
    onResize();
    window.addEventListener('resize', onResize);
    const unsubscribeLeft = subscribeReservedLeftInset(onResize);
    const unsubscribeBottom = subscribeBottomDock(onResize);
    const el = barRef.current;
    const ro = el ? new ResizeObserver(onResize) : null;
    if (el) ro?.observe(el);
    return () => {
      window.removeEventListener('resize', onResize);
      unsubscribeLeft();
      unsubscribeBottom();
      ro?.disconnect();
    };
  }, [docked, barRef, clampWidth]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return; // primary button only
    const el = barRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragRef.current = { offX: e.clientX - r.left, offY: e.clientY - r.top };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    const el = barRef.current;
    if (!d || !el) return;
    const r = el.getBoundingClientRect();
    setPos(clampPos(e.clientX - d.offX, e.clientY - d.offY, r.width, r.height));
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!d) return;
    const el = barRef.current;
    if (!el) return;
    if (opts.floating) return; // free-floating windows stay put — no dock/snap
    // Snap home if released near the docked bottom-centre (which sits above any
    // reserved bottom band, matching the bars' CSS `bottom: calc(--edge + var)`).
    const r = el.getBoundingClientRect();
    const nearX = Math.abs(r.left + r.width / 2 - effectiveCenterX()) < SNAP_DIST;
    const nearBottom =
      Math.abs(r.bottom - (window.innerHeight - bottomReserve() - DOCK_BOTTOM)) < SNAP_DIST;
    if (nearX && nearBottom) setPos(null);
  };

  return {
    pos,
    dragging,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      // Bottom bars re-dock (null); a floating window re-centres to its home spot —
      // clamped like any other placement, since a home spot is computed from the
      // screen rather than measured against the frame it has to fit.
      onDoubleClick: () => {
        const home = homePos();
        const el = barRef.current;
        if (!home || !el) {
          setPos(home);
          return;
        }
        const r = el.getBoundingClientRect();
        const w = clampWidth === undefined ? r.width : Math.min(r.width, clampWidth);
        setPos(clampPos(home.x, home.y, w, r.height));
      },
    },
  };
}
