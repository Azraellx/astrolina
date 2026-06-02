import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

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

// The effective screen centre the bars dock to: shifted right a quarter of the
// expanded sidebar's width (matching the CSS `left: calc(50% + --es-width/4)`).
function dockCenterX(): number {
  const es =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--es-width'),
    ) || 0;
  return window.innerWidth / 2 + es / 4;
}

// Clamp a top-left so the bar (w×h) stays fully on screen with a margin.
function clampPos(x: number, y: number, w: number, h: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, 4), Math.max(4, window.innerWidth - w - 4)),
    y: Math.min(Math.max(y, TOP_MARGIN), Math.max(TOP_MARGIN, window.innerHeight - h - 4)),
  };
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

export function useMovableHud(barRef: RefObject<HTMLElement | null>): MovableHud {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p?.x === 'number' && typeof p?.y === 'number') return p;
      }
    } catch {
      /* ignore */
    }
    return null;
  });
  const dragRef = useRef<{ offX: number; offY: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (pos) localStorage.setItem(POS_KEY, JSON.stringify(pos));
    else localStorage.removeItem(POS_KEY);
    // Nudge the map to re-dodge its edge labels off the bar's new rect (it only
    // recomputes them on pan/zoom otherwise, so a drag would leave them stale).
    window.dispatchEvent(new Event('astro:hud-moved'));
  }, [pos]);

  // Keep a floated bar on-screen — clamped against the CURRENT viewport on mount
  // (a position saved on a larger/other screen may now be off-screen, and the grip
  // is the only way to recover it) and on resize.
  const docked = pos === null;
  useEffect(() => {
    if (docked) return;
    const onResize = () => {
      const el = barRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos((p) => {
        if (!p) return p;
        const c = clampPos(p.x, p.y, r.width, r.height);
        return c.x === p.x && c.y === p.y ? p : c; // no-op when already on-screen
      });
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [docked, barRef]);

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
    // Snap home if released near the docked bottom-centre.
    const r = el.getBoundingClientRect();
    const nearX = Math.abs(r.left + r.width / 2 - dockCenterX()) < SNAP_DIST;
    const nearBottom = Math.abs(r.bottom - (window.innerHeight - DOCK_BOTTOM)) < SNAP_DIST;
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
      onDoubleClick: () => setPos(null),
    },
  };
}
