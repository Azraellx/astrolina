// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { getReservedLeftInset, subscribeReservedLeftInset } from './leftDock';
import { subscribeBottomDock } from './bottomDock';
import { safeAreaBottom } from './safeArea';
import { isPhone } from './touch';

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
// How far the pointer has to travel from the press before the window follows it. Below
// this a press is a tap or one half of a double-click — on a finger it always jitters a
// pixel or two — and must neither nudge the window nor be saved as a place someone chose.
const DRAG_SLOP = 3;
// The gap a phone's bottom sheet leaves above the chrome it stands on (placeSheet, in the hook).
const PHONE_GAP = 8;

// Where a FLOATING window's saved spot lives on a PHONE: its own key, the window's key
// with `-phone` before the version (astro:journal-pos:v1 → astro:journal-pos-phone:v1).
// Desktop keys are left exactly as they were.
//
// CLAUDE.md rule 6 — why the phones' old values are abandoned rather than migrated. Until
// 2026-09-30 this hook WROTE the starting spot to storage on mount, so every phone that
// had ever opened a window stored the desktop default (Local Space at 76,144 — the upper
// middle of a phone screen) exactly as if somebody had put it there. On a phone a stored
// spot is therefore indistinguishable from that mount-written default, and reading the
// old key would keep the phone home below unreachable for precisely the phones it was
// made for. Abandoning them loses no choice we can tell apart from noise; the one real
// cost is that a reader who did drag a window on a phone finds it at the new home once.
// Nothing syncs these keys (they live only in this browser's localStorage), so a phone
// key abandons nothing on any other device, and the desktop starting spots did not
// change, so a desktop key — mount-written or chosen — still lands where it always did.
//
// The bottom BARS keep their shared key on a phone: their default is the CSS dock, which
// the mount write stored as an absent key, so a bar spot stored on a phone was always a
// real drag.
function phoneKey(key: string): string {
  return /:v\d+$/.test(key) ? key.replace(/(:v\d+)$/, '-phone$1') : `${key}-phone`;
}

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

// The map's attribution box where a span [x, x + w] meets it, else null. The attribution
// (bottom-right; a full-width footer on portrait phones) is a LICENCE disclosure — the map
// data's, and the app's own credits link — so a window must not be parked over it. Map.tsx's
// edge labels and the Capture frame already keep off it; this is the windows' half. Read
// live from the DOM so it follows the attribution wherever the map's CSS puts it (the
// corner, the phone footer, inside the Capture frame), and drops out when it is hidden (a
// transparent or chart-only export) — a zero box answers null.
function attributionBox(x: number, w: number): DOMRect | null {
  const el = document.querySelector('.maplibregl-ctrl-attrib');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  if (x + w <= r.left || x >= r.right) return null;
  return r;
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
// A frame that would cover the map attribution (attributionBox) stands just above it
// instead — only where the frame's x-span meets it, so a window beside the corner still
// reaches the bottom edge, and only when standing above actually clears it: a frame too
// tall to fit there would overlap the attribution anyway, and pushing it up as far as it
// goes would only bury the nav as well. (That was the Capture window on a phone while its
// frame sat mid-screen; it now sits under the frame instead — `phoneCeiling`.) A frame wholly
// below the attribution — the room the Capture frame leaves on a phone — isn't covering it.
// A frame that fits across the column but not with 4 px clear on both sides — a phone's
// full-width sheet, `100vw` less the touch gutters either side (CaptureHud.css) — is centred
// in it instead, so its two gutters match; held at the left margin, the 6 px it has to spare
// came out 4 on the left and 2 on the right. One wider than the column keeps its left edge
// at the margin as before: that is where its grip is.
function clampPos(x: number, y: number, w: number, h: number): { x: number; y: number } {
  const reserved = getReservedLeftInset();
  const left = reserved + 4;
  const spare = window.innerWidth - reserved - w;
  const cx =
    spare >= 0 && spare < 8
      ? reserved + Math.round(spare / 2)
      : Math.min(Math.max(x, left), Math.max(left, window.innerWidth - w - 4));
  const top = TOP_MARGIN;
  let cy = Math.min(
    Math.max(y, top),
    Math.max(top, window.innerHeight - bottomReserve() - h - 4),
  );
  const attr = attributionBox(cx, w);
  if (attr && cy < attr.bottom + 4 && cy + h > attr.top - 4) {
    const above = Math.floor(attr.top) - 4 - h;
    if (above >= top) cy = above;
  }
  return { x: cx, y: cy };
}

// What a phone's bottom sheet stands on: the chrome along the bottom of the screen — the
// map attribution (a full-width footer on a portrait phone), the profile strip (bottom-left
// on touch phones), the active-systems chip, and a docked bottom overlay bar. The reserved
// sky band is not listed: it is a layout band (--sky-band-h) that everything here already
// sits above.
const PHONE_FLOOR = [
  '.maplibregl-ctrl-attrib',
  '.profile-window',
  '.info-bar',
  '.timeline-hud.thud-bar',
  '.eclipse-hud',
  '.synastry-hud',
];

// A floating window's home on a PHONE (isPhone: a phone-sized touch device, either way up —
// tablets keep the desktop homes, they have the room): docked along the bottom like a bottom
// sheet, centred on the effective centre, its bottom edge PHONE_GAP above the highest piece
// of bottom chrome its x-span meets. It is set here, once, for every floating window rather
// than per window: a window's own `initial` is a desktop spot — most open 110–170 px down,
// just under the nav, which on a phone is the upper middle of the screen, right under the
// View menu that opened them. The bottom is thumb-reachable, clears the top bar, and keeps
// that menu's panel and the window it just opened out of each other's way.
//
// Only chrome DOCKED to the bottom counts — its bottom edge within PHONE_DOCKED px of the
// screen's (or the reserved band's) bottom: a bar the reader dragged up, the profile strip
// in its top-left place on a wider screen, or the attribution while the Capture frame has
// carried it up the screen, is not something to stand on.
const PHONE_DOCKED = 64;
// The top of the bottom chrome a sheet spanning [x, x + w] stands on — or, when it meets none,
// the screen's bottom less the reserved band or the home-indicator inset, whichever is taller:
// the max() every docked bar's CSS uses (the band's height already includes the inset it pads
// itself by). The inset used to be left out, unseen, because a portrait phone always had the
// attribution footer to stand on, and the footer pads itself by the inset. The Capture frame
// carries that footer up the screen with it, and with nothing else under a full-width sheet
// the sheet would have stood in the home-indicator strip of a phone drawing edge to edge.
function phoneFloor(x: number, w: number): number {
  const bottom = window.innerHeight - Math.max(bottomReserve(), safeAreaBottom());
  let floor = bottom;
  for (const sel of PHONE_FLOOR) {
    document.querySelectorAll(sel).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || r.bottom < bottom - PHONE_DOCKED) return;
      if (x + w <= r.left || x >= r.right) return;
      floor = Math.min(floor, r.top);
    });
  }
  return floor;
}

// The CSS variable a sheet under a `phoneCeiling` finds its room in (px), set on the window's
// own element — see placeSheet in the hook for why it isn't left to a React render.
const ROOM_VAR = '--hud-phone-room';

export interface MovableHud {
  /** Custom top-left (px) while floated; null = docked via CSS. */
  pos: { x: number; y: number } | null;
  /** True mid-drag — use it to suspend any CSS position transition. */
  dragging: boolean;
  /** The height (px) a phone sheet has between its `phoneCeiling` and the chrome it stands
   *  on, while it sits at its phone home under one — else null: no ceiling, not a phone, or a
   *  window the reader has dragged off its home (it is theirs to place then, and no longer
   *  answers to the room under the ceiling). The same number sits on the window's element as
   *  `--hud-phone-room`, for its CSS to cap the height by and scroll inside; whether to cap,
   *  and what to do when the room is too small to be worth capping to, is the window's call. */
  phoneRoom: number | null;
  /** True from the release of a drag that took a phone sheet off its home until a re-home
   *  brings it back. It tells the two ways `phoneRoom` goes null apart: the reader took the
   *  window (a choice about it), or the ceiling stopped applying — the phone turned on its
   *  side, say — which is a standing condition the window should only follow. Set in the same
   *  update that drops the room, so a render sees both together. */
  draggedOffHome: boolean;
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
  /** Starting top-left for a floating window when nothing is saved — on a desktop or a
   *  tablet. A phone starts every floating window at the shared bottom-sheet home instead
   *  (phoneHome), unless `phoneHome` is false. */
  initial?: () => { x: number; y: number };
  /** Persist the position to localStorage (default true). When false, the position is
   *  in-memory only: every mount starts at `initial()` and dragging never survives a
   *  reopen — so the window appears in a consistent spot each time. Only a real drag or a
   *  double-click re-home is ever written: never the starting spot, never a re-clamp. */
  persist?: boolean;
  /** false: a floating window keeps its own `initial` spot on a phone rather than the
   *  shared bottom-sheet home (default: take the phone home). For a window that already
   *  has a touch placement of its own (the mission guide's) — the point of the shared home
   *  is that windows don't each grow a hand-placed phone spot. */
  phoneHome?: boolean;
  /** For a phone sheet that has to stay clear of something ABOVE it as well as the chrome
   *  below: the viewport y it may not rise above, read live at every re-home, or null when
   *  nothing applies just then. The sheet keeps the shared home — bottom edge on the chrome,
   *  so it stays where the thumb is — and what the ceiling bounds is its HEIGHT, reported back
   *  as `phoneRoom`. The Capture window, under the frame it adjusts on a phone held upright;
   *  the Planetary hours window, under the nav (its CSS caps by the room it is handed).
   *  Whatever moves the ceiling must announce it with `astro:hud-moved` (it is a surface that
   *  moved), which is what re-homes a sheet; the hook can't see it move otherwise. */
  phoneCeiling?: () => number | null;
  /** For a window that widens by itself and keeps the wider frame on screen with a
   *  shift of its own, derived at render (the Minor bodies window's list column):
   *  the width the hook's OWN re-clamps (mount, resize, a docked panel's column)
   *  keep on screen — never more than the rendered width — so they hold the spot
   *  the narrow frame fits, not the shifted one (and a re-clamp is never saved). A
   *  drag measures the rendered frame, and its end is what's saved. */
  clampWidth?: number;
}

export function useMovableHud(
  barRef: RefObject<HTMLElement | null>,
  opts: MovableHudOptions = {},
): MovableHud {
  const persist = opts.persist ?? true;
  // A floating window on a phone: its home is the shared bottom sheet, and its saved spot
  // lives under the phone key (see phoneKey). Read per call, not once — the media query
  // only moves under a desktop browser's device emulation, but a key read in one class
  // and written in the other would be exactly the mix-up the phone key exists to prevent.
  const phoneSheet = () => !!opts.floating && opts.phoneHome !== false && isPhone();
  const storageKey = () => {
    const key = opts.posKey ?? POS_KEY;
    return opts.floating && isPhone() ? phoneKey(key) : key;
  };
  const homePos = () =>
    opts.floating && opts.initial ? opts.initial() : null;
  // The starting position, and whether it is the phone's bottom-sheet home (read once).
  const [start] = useState<{ pos: { x: number; y: number } | null; homed: boolean }>(() => {
    if (persist) {
      try {
        const raw = localStorage.getItem(storageKey());
        if (raw) {
          const p = JSON.parse(raw);
          if (typeof p?.x === 'number' && typeof p?.y === 'number') {
            return { pos: p, homed: false };
          }
        }
      } catch {
        /* ignore */
      }
    }
    // Nothing saved. On a phone the real home needs the frame's measured size, which
    // doesn't exist before mount: start from the desktop spot and let the layout effect
    // below re-home it before the first paint.
    return { pos: homePos(), homed: phoneSheet() };
  });
  const [pos, setPos] = useState<{ x: number; y: number } | null>(start.pos);
  // True while a phone window sits at its bottom-sheet home and hasn't been dragged since:
  // it then STAYS docked as its content grows or shrinks and as the chrome under it moves
  // (the sheet's bottom edge is what's anchored, not its top), where a placed window only
  // gets clamped. Set wherever the position is chosen — the start, a drag, a re-home.
  const homedRef = useRef(start.homed);
  const dragRef = useRef<{
    offX: number;
    offY: number;
    /** Where the press landed — the drag slop is measured from here. */
    downX: number;
    downY: number;
    /** The last placed spot once the pointer has left the slop; null for a press that
     *  never did (a tap, half a double-click) — which then places and saves nothing. */
    moved: { x: number; y: number } | null;
    /** Whether the window sat at its phone home when the press began. */
    fromHome: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  // The room under a `phoneCeiling` (see MovableHud.phoneRoom). The ceiling is read through a
  // ref because the layout effect below is bound once per frame-size change, while a caller
  // may hand a fresh closure every render; kept current by a layout effect declared ahead of
  // the one that reads it.
  const ceilingRef = useRef(opts.phoneCeiling);
  const phoneCeiling = opts.phoneCeiling;
  useLayoutEffect(() => {
    ceilingRef.current = phoneCeiling;
  }, [phoneCeiling]);
  const [phoneRoom, setPhoneRoom] = useState<number | null>(null);
  const [draggedOffHome, setDraggedOffHome] = useState(false);
  const putRoom = useCallback((el: HTMLElement, room: number | null) => {
    if (room === null) el.style.removeProperty(ROOM_VAR);
    else el.style.setProperty(ROOM_VAR, `${room}px`);
    setPhoneRoom((prev) => (prev === room ? prev : room));
  }, []);
  // Where a sheet at its phone home goes: centred, its bottom edge PHONE_GAP above the chrome
  // its span meets. Under a ceiling the room is worked out first and handed to the window's
  // CSS through ROOM_VAR on its own element — synchronously, so the height measured next is
  // the capped one and the sheet lands where it will stay. Left to a React render, the cap
  // would arrive a pass late, through the ResizeObserver, which reports after the frame has
  // painted: one frame of the full-height sheet standing over the thing it is meant to sit
  // under, on every open and every change of the ceiling. `phoneRoom` carries the same number
  // to the render, for the decisions that are the window's to make (what to do in too little).
  const placeSheet = useCallback(
    (el: HTMLElement, w: number) => {
      const x = Math.round(effectiveCenterX() - w / 2);
      const floor = phoneFloor(x, w);
      const ceiling = ceilingRef.current?.() ?? null;
      putRoom(
        el,
        ceiling === null
          ? null
          : Math.max(0, Math.floor(floor - PHONE_GAP - (ceiling + PHONE_GAP))),
      );
      const h = el.getBoundingClientRect().height;
      return { x, y: Math.round(floor - PHONE_GAP - h), h };
    },
    [putRoom],
  );

  // Save a CHOSEN position — called only from a drag's end and a re-home, never from an
  // effect on `pos`. Until 2026-09-30 an effect wrote every position the window took,
  // including the starting spot on mount and each re-clamp, so storage could not tell a
  // place somebody picked from a default nobody touched: every window's default was frozen
  // into every browser that ever opened it (CLAUDE.md rule 6's trap, set by this hook), and
  // a window squeezed up by a short screen or the sky band was saved squeezed. Now the
  // stored spot is only ever a choice — a re-clamp is a standing condition, derived on
  // mount and on every resize, and the choice is still there when the condition ends.
  // `null` (a bar re-docked, a window re-homed) clears the key: "home" is the choice, and
  // it follows the home if the home moves.
  //
  // What this does NOT buy yet: a free change of a desktop starting spot. It stops the trap
  // being set again, but every desktop browser that opened a window before 2026-09-30
  // already holds that window's old default under its unbumped desktop key, mount-written
  // and indistinguishable from a choice (phoneKey above says the same of its keys). So
  // changing a desktop `initial` still needs a key bump, argued per CLAUDE.md rule 6 — or a
  // one-time bump of all the desktop keys, after which they hold only choices and the
  // defaults are free from then on. The phone keys started clean on 2026-09-30.
  const save = (p: { x: number; y: number } | null) => {
    if (!persist) return;
    try {
      if (p) localStorage.setItem(storageKey(), JSON.stringify(p));
      else localStorage.removeItem(storageKey());
    } catch {
      /* storage blocked — the spot holds for this session only */
    }
  };

  useEffect(() => {
    // Nudge the map to re-dodge its edge labels off the bar's new rect (it only
    // recomputes them on pan/zoom otherwise, so a drag would leave them stale).
    window.dispatchEvent(new Event('astro:hud-moved'));
  }, [pos]);

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
  //
  // A phone window still at its bottom-sheet home (homedRef) is RE-HOMED by the same
  // triggers rather than clamped — its bottom edge is the anchored one, so content that
  // grows lifts it and a collapse drops it back onto the chrome — and also on
  // `astro:hud-moved`, which every movable surface dispatches when it mounts or moves:
  // that is how a bottom overlay bar docking under the sheet (Transits switched on with a
  // window open) lifts the sheet clear of it. A re-home that lands where the window
  // already is returns the same object, so the sheet's own dispatch can't loop.
  //
  // A LAYOUT effect, so the first measurement lands before the first paint: the phone home
  // needs the frame's real height, and a window saved somewhere a smaller screen can't
  // show is pulled on screen without a visible jump.
  const docked = pos === null;
  const clampWidth = opts.clampWidth;
  useLayoutEffect(() => {
    if (docked) return;
    const onResize = () => {
      const el = barRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const w = clampWidth === undefined ? r.width : Math.min(r.width, clampWidth);
      // A sheet at its home is measured AFTER its room is set (placeSheet), so its height is
      // the one it will have; any other window by the rect it has.
      const home = homedRef.current ? placeSheet(el, w) : null;
      const h = home ? home.h : r.height;
      setPos((p) => {
        if (!p) return p;
        const at = home ?? p;
        const c = clampPos(at.x, at.y, w, h);
        return c.x === p.x && c.y === p.y ? p : c; // no-op when already on-screen
      });
    };
    onResize();
    window.addEventListener('resize', onResize);
    const onHudMoved = () => {
      if (homedRef.current) onResize();
    };
    window.addEventListener('astro:hud-moved', onHudMoved);
    const unsubscribeLeft = subscribeReservedLeftInset(onResize);
    const unsubscribeBottom = subscribeBottomDock(onResize);
    const el = barRef.current;
    const ro = el ? new ResizeObserver(onResize) : null;
    if (el) ro?.observe(el);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('astro:hud-moved', onHudMoved);
      unsubscribeLeft();
      unsubscribeBottom();
      ro?.disconnect();
    };
  }, [docked, barRef, clampWidth, placeSheet]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return; // primary button only
    const el = barRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragRef.current = {
      offX: e.clientX - r.left,
      offY: e.clientY - r.top,
      downX: e.clientX,
      downY: e.clientY,
      moved: null,
      fromHome: homedRef.current,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    const el = barRef.current;
    if (!d || !el) return;
    if (
      !d.moved &&
      Math.abs(e.clientX - d.downX) < DRAG_SLOP &&
      Math.abs(e.clientY - d.downY) < DRAG_SLOP
    ) {
      return; // still inside the slop: a tap so far, not a drag
    }
    const r = el.getBoundingClientRect();
    const next = clampPos(e.clientX - d.offX, e.clientY - d.offY, r.width, r.height);
    d.moved = next;
    // Placed by hand now: the window stops riding its phone home.
    homedRef.current = false;
    setPos(next);
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // A press that never left the slop placed nothing, so there is nothing to save.
    if (!d?.moved) return;
    const el = barRef.current;
    if (!el) return;
    // Dragged off its home, a sheet no longer answers to the room under its ceiling: drop the
    // cap now the finger is off it — never mid-drag, where the window would grow under it.
    putRoom(el, null);
    if (d.fromHome) setDraggedOffHome(true);
    if (opts.floating) {
      save(d.moved); // free-floating windows stay put — no dock/snap
      return;
    }
    // Snap home if released near the docked bottom-centre (which sits above any
    // reserved bottom band, matching the bars' CSS `bottom: calc(--edge + var)`).
    const r = el.getBoundingClientRect();
    const nearX = Math.abs(r.left + r.width / 2 - effectiveCenterX()) < SNAP_DIST;
    const nearBottom =
      Math.abs(r.bottom - (window.innerHeight - bottomReserve() - DOCK_BOTTOM)) < SNAP_DIST;
    if (nearX && nearBottom) {
      setPos(null);
      save(null);
    } else {
      save(d.moved);
    }
  };

  return {
    pos,
    dragging,
    phoneRoom,
    draggedOffHome,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      // Bottom bars re-dock (null); a floating window re-centres to its home spot —
      // clamped like any other placement, since a home spot is computed from the
      // screen rather than measured against the frame it has to fit. On a phone the home
      // is the bottom sheet, which then rides the chrome again like a fresh window's.
      // Either way the saved spot is CLEARED rather than set to the home: "home" is the
      // choice, so the next open lands on the home as it is then.
      onDoubleClick: () => {
        save(null);
        const el = barRef.current;
        if (el && phoneSheet()) {
          const r = el.getBoundingClientRect();
          const w = clampWidth === undefined ? r.width : Math.min(r.width, clampWidth);
          homedRef.current = true;
          setDraggedOffHome(false);
          const home = placeSheet(el, w);
          setPos(clampPos(home.x, home.y, w, home.h));
          return;
        }
        const home = homePos();
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
