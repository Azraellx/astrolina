// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The basemap's own place names leave the space under the placed pin and the home marker.
//
// Both markers are DOM (maplibregl.Marker), and MapLibre's label collision only knows what it
// draws itself — so a pin dropped on a city sat on the very name it marked: on a phone at z6–7 the
// tip and its ring landed on the middle of "Madrid", which read "Ma rid". Each marker now has a
// stand-in that collision CAN see: an invisible symbol at its coordinate, the size of its
// silhouette, in a layer just above the basemap's. Placement runs from the top layer down, so the
// stand-in is in the collision index before any basemap label is tried, and a label that would be
// drawn under the marker is left out — by MapLibre itself, with its own fade, and nothing new is
// drawn on the map. The chart's own symbols sit above this layer and are placed first, so they are
// not affected.
//
// HIDDEN, not moved aside. Moving it needs text-variable-anchor on the place layers, and that is a
// property of the whole layer, not of one label. Measured 2026-10-01 with no pin at all: variable
// anchors whose first entry reproduced each layer's own anchor and offset still changed the labels
// everywhere, because every name the style had dropped for want of room now had four more places
// to try — at Europe z5 Earth, Glass and Dark gained 16, 33 and 22 names and lost 2, 0 and 2; at
// Japan z7 they gained 17, 19 and 11; only Iberia z6.2 on Earth was unchanged. Confining it to the
// name under the pin would mean an expression on the basemap's own layers that changes with the pin,
// and every change re-lays out every basemap tile in view. A name chip under the pin (the arrival
// mark's pattern) was the other way, and it puts a new element on the map that the line labels would
// then have to dodge. Salvatore's call (2026-10-01) was whichever is easier to build and costs less
// on screen; hiding is both. The reader put the pin there, so a missing name costs less than a
// broken one.
//
// What the reader sees, measured on Madrid, Lisbon and Ávila in all three styles: the name under
// the marker fades out as the pin lands and comes back when it leaves; a name clear of the head
// stays. Two consequences of handing the judgement to MapLibre. Where a city is drawn as a dot with
// its name beside it (Dark below z8), the tip covers the dot, and a dot and its name are placed as
// one symbol, so the name goes with it. And the room a hidden name leaves is MapLibre's to reuse: a
// neighbour it had dropped can appear and push out the one beyond — at Lisbon z8, Barreiro and
// Queluz in, Montijo and Amadora out. Every name that came or went in those runs (36 views) lay
// within 84 px of the pin; nothing further away changed.
//
// A style whose place layers set text-allow-overlap would ignore this; none of the three do.
//
// A marker layer the core doesn't draw — a downstream build's DOM markers in the overlay track —
// has the same problem and no map handle to solve it with, so it publishes its markers' points and
// a named silhouette (setExtraLabelColliders) and they join the same source. A cluster in such a
// layer is best published as its members' own points: the cluster's centroid moves with every zoom
// step, and following it would rewrite the source on every frame of a zoom.
import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MlMap,
  SymbolLayerSpecification,
} from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import { isChartSource } from './basemapStyle';

const SOURCE = 'label-colliders';
const LAYER = 'label-colliders';

/** A box in CSS px around a marker's point (y down): its size, and its centre's offset. */
interface Box {
  w: number;
  h: number;
  cx: number;
  cy: number;
}

// Each marker's SOLID silhouette, as two boxes: the head, and the neck tapering to the tip. Not
// the tap boxes Map.tsx's labels step off (PIN_HIT / HOME_HIT): those are the whole icon square,
// and this hides a basemap name, so it is held to what actually covers one. Derived from Map.css:
// the box is anchored on its bottom edge 2 px below the point; the 24-unit teardrop (head circle
// at (12, 10) r 8, tip at (12, 22)) is drawn in an icon square of 38 px, 15 px down a 52 px box,
// for the pin (1.58 px a unit), and 34 px, 13 px down 46, for home (1.42). So the pin's fill spans
// ±12.7 across the head from y −32, has narrowed to ±8 by y −9 and meets the point at the tip;
// home's the same one size down. The boxes stop at the FILL, because every label's own box carries
// the style's text-padding (2 px, the default, in all three styles) — which takes the test out to
// the stroke's outer edge. Boxes drawn to the stroke hid a name that sat clear beside the head:
// "Guadalajara" next to a pin on Madrid at z6.2, its box 2 px off the head's. The pin's resting
// ring (22 px round the tip, half-transparent) is left out: a name beside the tip stays readable
// through it, and covering it would hide every name whose dot sits within 11 px. Change the
// marker CSS and these with it.
const PIN_BOXES: Box[] = [
  { w: 24, h: 23, cx: 0, cy: -20.5 },
  { w: 12, h: 8, cx: 0, cy: -5 },
];
const HOME_BOXES: Box[] = [
  { w: 22, h: 20, cx: 0, cy: -18 },
  { w: 10, h: 7, cx: 0, cy: -4.5 },
];

/** A silhouette a marker layer drawn outside the core can borrow (setExtraLabelColliders). Named
 *  for its geometry, not for whoever draws it: `teardrop-34` is the same 24-unit teardrop drawn
 *  34 px square with the square's BOTTOM EDGE on the point — no offset, no padding. Add a shape
 *  here when another layer needs one. */
export type LabelColliderShape = 'teardrop-34';

// Home's teardrop at the same scale (34 px for 24 units), standing 3 px higher: home's icon square
// ends 3 px below its point, this one's ends on it. So the head spans ±11.3 from y −31.2, the tip is
// 2.8 px above the point, and the boxes are home's moved up by those 3 px.
const SHAPE_BOXES: Record<LabelColliderShape, Box[]> = {
  'teardrop-34': [
    { w: 22, h: 20, cx: 0, cy: -21 },
    { w: 10, h: 7, cx: 0, cy: -7.5 },
  ],
};

// The offset is part of the id because two shapes can share a box's SIZE at different heights
// (home's and teardrop-34's are the same two sizes), and the offset match below is keyed by id —
// a match with a repeated label is not a valid expression.
const imageId = (b: Box): string => `label-collider-${b.w}x${b.h}${b.cy}`;
const BOXES = [
  ...new Map(
    [...PIN_BOXES, ...HOME_BOXES, ...Object.values(SHAPE_BOXES).flat()].map((b) => [imageId(b), b]),
  ).values(),
];

// Its own image per box: an icon's collision box is its image's box, so the image has to have
// the box's shape. Transparent, so nothing is drawn.
const LAYOUT: SymbolLayerSpecification['layout'] = {
  'icon-image': ['get', 'img'],
  // Per box, by its image (each has its own size): an expression rather than an array property,
  // which a GeoJSON feature's properties don't reliably carry into the tile.
  'icon-offset': [
    'match',
    ['get', 'img'],
    ...BOXES.flatMap((b) => [imageId(b), ['literal', [b.cx, b.cy]]]),
    ['literal', [0, 0]],
  ] as unknown as ExpressionSpecification,
  // Always placed, whatever else is there; and (icon-ignore-placement left false) it enters the
  // collision index, which is the whole point.
  'icon-allow-overlap': true,
  'icon-padding': 0,
  // Upright and unscaled on the globe and under pitch, as the DOM marker is.
  'icon-rotation-alignment': 'viewport',
  'icon-pitch-alignment': 'viewport',
};

export interface LabelColliderMarks {
  pin?: { lat: number; lng: number } | null;
  home?: { lat: number; lng: number } | null;
}

/** One marker a layer outside the core draws: its point and its silhouette. */
export interface ExtraLabelCollider {
  lat: number;
  lng: number;
  shape: LabelColliderShape;
}

interface State {
  marks: LabelColliderMarks;
  data: FeatureCollection<Point>;
  key: string;
}
const states = new WeakMap<MlMap, State>();
// The maps that have a layer, so a downstream publish can reach them without holding a map of its
// own. Dropped on `remove`, so a torn-down map is neither kept alive nor written to.
const maps = new Set<MlMap>();

// Stand-ins published by marker layers the core doesn't draw (the overlay track's), by owner, so
// two layers never clear each other's. Module-level because those layers have no map handle.
const extras = new Map<string, { list: readonly ExtraLabelCollider[]; key: string }>();
let extrasKey = '';
let flushFrame = 0;

const markKey = (m: { lat: number; lng: number } | null | undefined): string =>
  m ? `${m.lng},${m.lat}` : '-';

function collection(marks: LabelColliderMarks): FeatureCollection<Point> {
  const features: FeatureCollection<Point>['features'] = [];
  const add = (m: { lat: number; lng: number } | null | undefined, boxes: Box[]) => {
    if (!m) return;
    for (const b of boxes) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
        properties: { img: imageId(b) },
      });
    }
  };
  add(marks.pin, PIN_BOXES);
  add(marks.home, HOME_BOXES);
  for (const { list } of extras.values()) for (const m of list) add(m, SHAPE_BOXES[m.shape]);
  return { type: 'FeatureCollection', features };
}

// One source holds everything, so a change to either half rebuilds it — but only when the whole
// key moved: an unchanged pin, or a publish of the same points, writes nothing.
function refresh(map: MlMap): void {
  const st = states.get(map);
  if (!st) return;
  const key = `${markKey(st.marks.pin)}|${markKey(st.marks.home)}#${extrasKey}`;
  if (st.key === key) return;
  st.key = key;
  st.data = collection(st.marks);
  const src = map.getSource(SOURCE) as GeoJSONSource | undefined;
  if (src) src.setData(st.data);
  else install(map);
}

// The layer directly above the basemap's topmost layer — the slot between the basemap's labels and
// the chart — whichever order the style's own build and this install happen to run in. Read through
// the layers rather than getStyle(), which would serialize every chart source's GeoJSON.
function aboveBasemap(map: MlMap): string | undefined {
  const order = map.getLayersOrder().filter((id) => id !== LAYER);
  let top = -1;
  order.forEach((id, i) => {
    const l = map.getLayer(id);
    if (!l) return;
    if (l.type === 'background' || (l.source && !isChartSource(l.source, map.getSource(l.source)?.type)))
      top = i;
  });
  return order[top + 1];
}

// Everything on the current style. A style swap drops sources, layers and images alike, so this
// runs again on every `style.load`; before the first one, adding throws, and that load installs it.
function install(map: MlMap): void {
  const st = states.get(map);
  if (!st) return;
  try {
    for (const b of BOXES) {
      const id = imageId(b);
      if (!map.hasImage(id)) {
        map.addImage(id, { width: b.w, height: b.h, data: new Uint8Array(b.w * b.h * 4) });
      }
    }
    if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: 'geojson', data: st.data });
    if (!map.getLayer(LAYER)) {
      map.addLayer({ id: LAYER, type: 'symbol', source: SOURCE, layout: LAYOUT }, aboveBasemap(map));
    }
  } catch {
    /* no parsed style yet: its style.load installs it */
  }
}

/** Keep the basemap's labels out from under the placed pin and the home marker. Call whenever
 *  either moves; an unchanged position is a no-op, so it is safe on every render. */
export function setLabelColliders(map: MlMap, marks: LabelColliderMarks): void {
  const st = states.get(map);
  if (!st) {
    states.set(map, {
      marks,
      data: collection(marks),
      key: `${markKey(marks.pin)}|${markKey(marks.home)}#${extrasKey}`,
    });
    maps.add(map);
    map.on('style.load', () => install(map));
    map.once('remove', () => maps.delete(map));
    install(map);
    return;
  }
  st.marks = marks;
  refresh(map);
}

/** Keep the basemap's labels out from under a marker layer the core doesn't draw — a downstream
 *  build's DOM markers in the overlay track, which MapLibre's collision can't see any more than it
 *  can the pin. `owner` names the layer, so its call replaces only its own points; publish `[]` on
 *  teardown. Publish what is actually standing (not exit animations, not a marker hidden because a
 *  core marker represents its spot), by coordinate: points that haven't changed are a no-op, so it
 *  is safe on every store change, and changes are coalesced to one write a frame. */
export function setExtraLabelColliders(owner: string, list: readonly ExtraLabelCollider[]): void {
  const key = list.map((m) => `${m.shape}@${m.lng},${m.lat}`).join('|');
  if ((extras.get(owner)?.key ?? '') === key) return;
  if (list.length) extras.set(owner, { list, key });
  else extras.delete(owner);
  extrasKey = [...extras].map(([o, e]) => `${o}:${e.key}`).join(';');
  // A frame, not longer: when the placed pin leaves a saved spot, the core's own write for the pin
  // lands at once and this one should land on its heels, or the name under the saved pin starts
  // fading back in between the two. And if the core's write comes second, it already carries these.
  cancelAnimationFrame(flushFrame);
  flushFrame = requestAnimationFrame(() => maps.forEach(refresh));
}
