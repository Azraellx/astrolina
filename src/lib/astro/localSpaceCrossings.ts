import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { PlanetName } from '../ephemeris';
import type { LineProps, LineType } from './lines';
import type { LocalSpaceProps } from './localSpace';

// A dot dropped where a local-space line crosses a birth-chart (ACG) line. Carries
// both source colors (and a blended one for a single-fill "pie") plus the identities
// for the hover tooltip.
export interface CrossingProps {
  /** Blended fill — reflects both line colors in one dot. */
  color: string;
  lsPlanet: PlanetName;
  lsColor: string;
  acgPlanet: PlanetName;
  acgColor: string;
  acgLineType: LineType;
}

function normLng(lng: number): number {
  let x = (((lng + 180) % 360) + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
      : h.padEnd(6, '0').slice(0, 6);
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

// Average two line colors into one fill — the "one full pie" reading of a crossing.
function blendHex(a: string, b: string): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const mid = (x: number, y: number) =>
    Math.round((x + y) / 2)
      .toString(16)
      .padStart(2, '0');
  return `#${mid(ar, br)}${mid(ag, bg)}${mid(ab, bb)}`;
}

interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface SegSet {
  segs: Seg[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// Normalise a polyline to [-180,180] and split it into planar segments, dropping
// any segment that jumps the antimeridian (so a wrapped/unwrapped line never makes
// a phantom coast-to-coast segment). Also tracks the bounding box for pre-filtering.
function buildSegs(coords: [number, number][]): SegSet {
  const segs: Seg[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < coords.length; i++) {
    const x1 = normLng(coords[i - 1][0]);
    const y1 = coords[i - 1][1];
    const x2 = normLng(coords[i][0]);
    const y2 = coords[i][1];
    if (Math.abs(x1 - x2) > 180) continue; // antimeridian jump — skip
    segs.push({ x1, y1, x2, y2 });
    minX = Math.min(minX, x1, x2);
    maxX = Math.max(maxX, x1, x2);
    minY = Math.min(minY, y1, y2);
    maxY = Math.max(maxY, y1, y2);
  }
  return { segs, minX, minY, maxX, maxY };
}

function boxesOverlap(a: SegSet, b: SegSet): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function segBoxOverlap(a: Seg, b: Seg): boolean {
  return (
    Math.min(a.x1, a.x2) <= Math.max(b.x1, b.x2) &&
    Math.max(a.x1, a.x2) >= Math.min(b.x1, b.x2) &&
    Math.min(a.y1, a.y2) <= Math.max(b.y1, b.y2) &&
    Math.max(a.y1, a.y2) >= Math.min(b.y1, b.y2)
  );
}

// Planar intersection of segment a and segment b, or null if they don't cross.
function segIntersect(a: Seg, b: Seg): [number, number] | null {
  const d1x = a.x2 - a.x1;
  const d1y = a.y2 - a.y1;
  const d2x = b.x2 - b.x1;
  const d2y = b.y2 - b.y1;
  const denom = d1x * d2y - d1y * d2x;
  if (denom === 0) return null; // parallel / collinear
  const t = ((b.x1 - a.x1) * d2y - (b.y1 - a.y1) * d2x) / denom;
  const u = ((b.x1 - a.x1) * d1y - (b.y1 - a.y1) * d1x) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a.x1 + t * d1x, a.y1 + t * d1y];
}

// Every point where a (visible) local-space line crosses a (visible) ACG line — one
// dot per crossing, colored from both lines. O(segments²) with bounding-box
// pre-filters; only recomputed when the natal lines / LS / filters change (the
// birth chart is time-independent, so timeline scrubbing never triggers this).
export function generateLocalSpaceCrossings(
  localSpace: FeatureCollection<LineString, LocalSpaceProps>,
  lines: FeatureCollection<LineString, LineProps>,
): FeatureCollection<Point, CrossingProps> {
  const acg = lines.features.map((f) => ({
    props: f.properties,
    set: buildSegs(f.geometry.coordinates as [number, number][]),
  }));
  const features: Feature<Point, CrossingProps>[] = [];
  const seen = new Set<string>();
  let id = 0;

  for (const lsf of localSpace.features) {
    const lsSet = buildSegs(lsf.geometry.coordinates as [number, number][]);
    const ls = lsf.properties;
    for (const { props: ap, set: aSet } of acg) {
      if (!boxesOverlap(lsSet, aSet)) continue;
      for (const a of lsSet.segs) {
        for (const b of aSet.segs) {
          if (!segBoxOverlap(a, b)) continue;
          const hit = segIntersect(a, b);
          if (!hit) continue;
          // Dedup vertex double-hits (same point, same line pair).
          const key = `${hit[0].toFixed(2)}|${hit[1].toFixed(2)}|${ls.planet}|${ap.planet}|${ap.lineType}`;
          if (seen.has(key)) continue;
          seen.add(key);
          features.push({
            type: 'Feature',
            id: id++,
            properties: {
              color: blendHex(ls.color, ap.color),
              lsPlanet: ls.planet,
              lsColor: ls.color,
              acgPlanet: ap.planet,
              acgColor: ap.color,
              acgLineType: ap.lineType,
            },
            geometry: { type: 'Point', coordinates: hit },
          });
        }
      }
    }
  }
  return { type: 'FeatureCollection', features };
}
