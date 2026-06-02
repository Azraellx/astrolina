// Screen-space anchors for the ACG line labels: instead of repeating the glyph +
// angle code down each line, we drop a colored badge where the line exits the
// viewport (both ends). MapLibre has no "label at the viewport edge" placement,
// so we project each line and intersect it with the (inset) screen rect on every
// map move. ACG lines only — parans / local space keep their along-line labels.
import type { Map as MlMap } from 'maplibre-gl';
import type { Feature, LineString } from 'geojson';
import type { LineProps, LineType } from '../../lib/astro/lines';
import type { PlanetName } from '../../lib/ephemeris';

export interface LineBadge {
  key: string;
  x: number;
  y: number;
  color: string;
  planet: PlanetName;
  lineType: LineType;
  /** Overlay tag (e.g. "Tr") for overlay lines; empty for natal. */
  prefix: string;
}

interface Pt {
  x: number;
  y: number;
}
interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// A HUD element's screen rect (map-container-relative) that badges should avoid.
export interface AvoidRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const inRect = (p: Pt, r: Rect) =>
  p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;

// Liang–Barsky: the parameter range [t0,t1] (within [0,1]) of segment a→b that
// lies inside the rect, or null if the segment misses it entirely. t0>0 means the
// segment ENTERS the rect mid-way (a is outside); t1<1 means it EXITS mid-way.
// This catches lines that cross the viewport with BOTH endpoints off-screen —
// e.g. the MC/IC meridians, whose ±85° lat endpoints sit far above/below the view.
function clipSeg(a: Pt, b: Pt, r: Rect): { t0: number; t1: number } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - r.minX, r.maxX - a.x, a.y - r.minY, r.maxY - a.y];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null; // parallel to an edge and outside it
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return { t0, t1 };
}

// The two screen points farthest apart in a small set — the visual "ends" of a
// line's on-screen presence once its fragments are pooled together.
function farthestPair(pts: Pt[]): Pt[] {
  if (pts.length <= 2) return pts;
  let best: Pt[] = [pts[0], pts[1]];
  let bestD = -1;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      const d = dx * dx + dy * dy;
      if (d > bestD) {
        bestD = d;
        best = [pts[i], pts[j]];
      }
    }
  }
  return best;
}

interface LineGroup {
  color: string;
  planet: PlanetName;
  lineType: LineType;
  prefix: string;
  ends: Pt[];
}

// Up to two badges per LOGICAL line: the two ends of its on-screen portion. A
// horizon curve that crosses the dateline arrives split into several features
// sharing planet+lineType — we pool their on-screen ends and label the overall
// extremes, so one line reads as one pair of labels rather than a pair per
// fragment (which matters now badges show at every zoom, world view included).
export function computeLineBadges(
  map: MlMap,
  features: Feature<LineString, LineProps>[],
  inset: number,
  isOverlay: boolean,
): LineBadge[] {
  const container = map.getContainer();
  const w = container.clientWidth;
  const h = container.clientHeight;
  const rect: Rect = { minX: inset, minY: inset, maxX: w - inset, maxY: h - inset };
  if (rect.maxX <= rect.minX || rect.maxY <= rect.minY) return [];

  const groups = new Map<string, LineGroup>();

  features.forEach((f) => {
    const coords = f.geometry.coordinates;
    if (coords.length < 2) return;
    // Horizon curves are dense (0.5° steps); every 3rd point is plenty to find
    // edge crossings and keeps the per-move cost low. Meridians are 2 points.
    const step = coords.length > 20 ? 3 : 1;
    const pts: Pt[] = [];
    for (let i = 0; i < coords.length; i += step) {
      const c = coords[i];
      const p = map.project([c[0], c[1]]);
      pts.push({ x: p.x, y: p.y });
    }
    // Ensure the true last coord is included.
    const lastC = coords[coords.length - 1];
    const lastP = map.project([lastC[0], lastC[1]]);
    if (pts.length === 0 || pts[pts.length - 1].x !== lastP.x || pts[pts.length - 1].y !== lastP.y) {
      pts.push({ x: lastP.x, y: lastP.y });
    }

    // Anchors = the on-screen portion's ends, in line order: a leading vertex if
    // it's already inside, then each boundary entry/exit crossing.
    const anchors: Pt[] = [];
    if (inRect(pts[0], rect)) anchors.push(pts[0]);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const c = clipSeg(a, b, rect);
      if (!c) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (c.t0 > 0) anchors.push({ x: a.x + c.t0 * dx, y: a.y + c.t0 * dy });
      if (c.t1 < 1) anchors.push({ x: a.x + c.t1 * dx, y: a.y + c.t1 * dy });
    }
    const last = pts[pts.length - 1];
    if (inRect(last, rect)) anchors.push(last);
    if (anchors.length === 0) return;

    const { planet, lineType, color, label } = f.properties;
    const prefix = isOverlay ? label : '';
    const key = `${planet}|${lineType}|${prefix}`;
    let g = groups.get(key);
    if (!g) {
      g = { color, planet, lineType, prefix, ends: [] };
      groups.set(key, g);
    }
    // This fragment contributes its own on-screen ends to the pool.
    g.ends.push(anchors[0]);
    if (anchors.length > 1) g.ends.push(anchors[anchors.length - 1]);
  });

  const out: LineBadge[] = [];
  let gi = 0;
  groups.forEach((g) => {
    farthestPair(g.ends).forEach((pt, ei) => {
      out.push({
        key: `${isOverlay ? 'ov' : 'n'}-${gi}-${ei}`,
        x: pt.x,
        y: pt.y,
        color: g.color,
        planet: g.planet,
        lineType: g.lineType,
        prefix: g.prefix,
      });
    });
    gi++;
  });

  return out;
}

// Keep each badge clear of the HUD panels by pushing it PERPENDICULAR to the edge
// it's anchored to — past the panel's inner edge — while keeping its along-edge
// (line-crossing) coordinate. So a top-edge label slides DOWN to hug the bottom of
// the top bar and tracks the line across it, instead of snapping to the bar's end.
export function dodgeBadges(
  badges: LineBadge[],
  rects: AvoidRect[],
  w: number,
  h: number,
  inset: number,
): LineBadge[] {
  if (rects.length === 0) return badges;
  const HW = 32; // generous half-width / -height estimate for a badge
  const HH = 11;
  const GAP = 6;
  return badges.map((b) => {
    let { x, y } = b;
    const onTop = y <= inset + 1;
    const onBottom = y >= h - inset - 1;
    const onLeft = x <= inset + 1;
    const onRight = x >= w - inset - 1;
    for (const r of rects) {
      const hit =
        x + HW > r.left && x - HW < r.right && y + HH > r.top && y - HH < r.bottom;
      if (!hit) continue;
      // Push toward the screen interior, off the panel's inner edge. Accumulate
      // across panels via min/max so overlapping panels are all cleared.
      if (onTop) y = Math.max(y, r.bottom + HH + GAP);
      else if (onBottom) y = Math.min(y, r.top - HH - GAP);
      else if (onLeft) x = Math.max(x, r.right + HW + GAP);
      else if (onRight) x = Math.min(x, r.left - HW - GAP);
      else y = Math.max(y, r.bottom + HH + GAP);
    }
    x = Math.min(Math.max(x, inset + HW), w - inset - HW);
    y = Math.min(Math.max(y, inset + HH), h - inset - HH);
    return { ...b, x, y };
  });
}
