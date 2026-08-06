// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Laying marks out around a ring without them landing on top of each other.
//
// Pulled out of WheelSvg once it stopped being a one-line "push the next one
// along" and grew the parts that are easy to get subtly wrong — a circular seam, a
// satisfiability limit, marks of unequal width, and marks that are not allowed to
// move at all. None of it touches React or the DOM, so it is checkable on its own:
// see scripts/verify-wheel-layout.ts, which asserts the invariants that matter
// (nothing overlaps; a fixed mark keeps its exact spot unless the ring genuinely
// cannot hold the set).
//
// Everything here works in DEGREES round the ring, with widths in PIXELS at the
// radius the marks are drawn on — the two are only ever mixed through arcDeg.

// Arc in DEGREES subtended by `px` at `radius` — the one conversion every
// separation figure is expressed through, so a clearance is stated in the pixels
// it actually has to clear rather than in a degree figure whose meaning changes
// with the ring it lands on.
export const arcDeg = (px: number, radius: number) =>
  (px * 360) / (2 * Math.PI * Math.max(radius, 1));

// A hairline of daylight between two marks that are otherwise exactly touching.
export const RING_PAD_PX = 2;

// Relax SORTED ring offsets (degrees, ascending in [0,360)) so neighbours sit at
// least `sep` apart, treating the ring as CIRCULAR: a 1°-wide pair straddling
// the 0°/360° seam (bodies conjunct on either side of the ASC) is 1° apart, not
// 359°. A linear pass can't see that — and worse, it can push a near-360
// cluster past 360 into an untouched body just after 0. So the pass runs in a
// frame rotated to start just after the LARGEST circular gap (whose two ends
// are the only neighbours guaranteed already clear), then maps back mod 360.
export function relaxRing(arr: { off: number }[], sep: number): void {
  if (arr.length < 2) return;
  let gapIdx = arr.length - 1; // gap between the last entry and the first (+360)
  let gapSize = arr[0].off + 360 - arr[arr.length - 1].off;
  for (let i = 1; i < arr.length; i++) {
    const g = arr[i].off - arr[i - 1].off;
    if (g > gapSize) {
      gapSize = g;
      gapIdx = i - 1;
    }
  }
  const start = (gapIdx + 1) % arr.length;
  let prev = -Infinity;
  for (let k = 0; k < arr.length; k++) {
    const idx = (start + k) % arr.length;
    let v = arr[idx].off + (start + k >= arr.length ? 360 : 0);
    if (v - prev < sep && k > 0) v = prev + sep;
    prev = v;
    arr[idx].off = ((v % 360) + 360) % 360;
  }
}


/** One mark competing for room on a ring: where it wants to be (degrees from the
 *  ASC, in [0,360)) and how much room it takes there. */
export interface RingMark {
  name: string;
  off: number;
  /** Half-width in PIXELS at the ring this layout runs on. */
  half: number;
}

/** The gap two neighbouring marks need, in degrees on the ring they share. */
type NeedFn = (a: RingMark, b: RingMark) => number;

/** Relax SORTED ring offsets with a PER-PAIR requirement — relaxRing's shape,
 *  except that what two marks owe each other depends on how wide THEY are rather
 *  than on one figure for the whole ring.
 *
 *  Three things it does that a single forward pass does not:
 *
 *  1. It keeps the requirements SATISFIABLE. A ring cannot hold more than it is;
 *     if the requirements add up past the circle they are all shrunk in
 *     proportion. Without that the pass has nowhere to put the overflow and
 *     stacks it back on the mark it started from — the very failure the pass
 *     exists to prevent.
 *  2. It closes the SEAM. The forward pass anchors at the largest natural gap on
 *     the assumption that gap can absorb the pushing; when a dense cluster
 *     consumes more than it, the last mark wraps round onto the first. A backward
 *     pass from the seam, then a second forward pass, resolves that.
 *  3. It has a floor it can always land on: if the two passes still leave a pair
 *     short, everything is laid out at its exact requirement from the anchor.
 *     Positions drift, but drift is recoverable by eye and an overlap is not. */
function relaxWidthAware(arr: RingMark[], need: NeedFn): void {
  const n = arr.length;
  if (n < 2) return;
  const raw: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const r = need(arr[i], arr[(i + 1) % n]);
    raw.push(r);
    total += r;
  }
  const shrink = total > 360 ? (360 * 0.999) / total : 1;
  const req = raw.map((r) => r * shrink); // req[i] = the gap from arr[i] to arr[i+1]

  let gapIdx = n - 1;
  let gapSize = arr[0].off + 360 - arr[n - 1].off;
  for (let i = 1; i < n; i++) {
    const g = arr[i].off - arr[i - 1].off;
    if (g > gapSize) {
      gapSize = g;
      gapIdx = i - 1;
    }
  }
  const start = (gapIdx + 1) % n;
  const at = (k: number) => (start + k) % n;
  // Unwrapped natural positions, ascending from the anchor, and the requirement
  // sitting in each gap between them.
  const pos: number[] = [];
  for (let k = 0; k < n; k++) {
    pos.push(arr[at(k)].off + (start + k >= n ? 360 : 0));
  }
  const gapAt = (k: number) => req[at(k)]; // between k and k+1
  const forward = () => {
    for (let k = 1; k < n; k++) pos[k] = Math.max(pos[k], pos[k - 1] + gapAt(k - 1));
  };
  const backward = () => {
    pos[n - 1] = Math.min(pos[n - 1], pos[0] + 360 - gapAt(n - 1));
    for (let k = n - 1; k > 0; k--) pos[k - 1] = Math.min(pos[k - 1], pos[k] - gapAt(k - 1));
  };
  forward();
  backward();
  forward();
  const seated = (() => {
    for (let k = 0; k < n - 1; k++) if (pos[k + 1] - pos[k] + 1e-9 < gapAt(k)) return false;
    return pos[0] + 360 - pos[n - 1] + 1e-9 >= gapAt(n - 1);
  })();
  if (!seated) {
    for (let k = 1; k < n; k++) pos[k] = pos[k - 1] + gapAt(k - 1);
  }
  for (let k = 0; k < n; k++) arr[at(k)].off = ((pos[k] % 360) + 360) % 360;
}

/** Lay movable marks out on a ring around FIXED ones.
 *
 *  The angle codes are the fixed set. They mark an axis — the exact spot where a
 *  line crosses the wheel — and a code nudged off that spot is telling the reader
 *  something false about where the axis is, so they hold their ground and the
 *  bodies flow around them. (Bodies have a tick on the zodiac band recording
 *  their true degree; the codes' equivalent is the axis itself, which is drawn.)
 *
 *  Fixed marks split the circle into arcs, and each arc is an independent 1-D
 *  problem with a wall at each end: push forward from the left wall, then pull
 *  back from the right one.
 *
 *  What that decomposition cannot do is move a body OUT of an arc, and at a polar
 *  latitude the Midheaven can close to within a couple of degrees of the
 *  Ascendant — leaving a sliver of an arc with a body trapped in it and nowhere
 *  for it to go. So the result is checked, and if any pair is still short the
 *  whole ring is re-laid with the codes taking their chances alongside the bodies.
 *  The codes lose their exact spot there, which is the lesser loss: in that chart
 *  no arrangement can give it to both of them anyway.
 *
 *  `minSep` is the floor every pair clears whatever their widths say. It carries
 *  the constraint from the OTHER rings these marks drive (the degree·sign·minute
 *  trio fans inward from here, and the same angle buys less arc further in).
 *
 *  Returns display offsets in degrees, keyed by name — fixed marks included, so
 *  one lookup serves both sets. */
export function placeOnRing(
  fixed: RingMark[],
  movable: RingMark[],
  minSep: number,
  ringRadius: number,
): Map<string, number> {
  const need: NeedFn = (a, b) =>
    Math.max(minSep, arcDeg(a.half + b.half + RING_PAD_PX, ringRadius));
  // What two marks need to merely not TOUCH — no hairline gap, and no allowance
  // for the rings fanned inside this one. A crowded arc is allowed down to this
  // before the codes are asked to give up their axis, because a tight row that
  // still reads is worth more than a code standing somewhere it isn't.
  const ink: NeedFn = (a, b) => arcDeg(a.half + b.half, ringRadius);
  const collect = (marks: RingMark[]) => {
    const m = new Map<string, number>();
    for (const x of marks) m.set(x.name, ((x.off % 360) + 360) % 360);
    return m;
  };
  const anchors = fixed.map((a) => ({ ...a })).sort((a, b) => a.off - b.off);
  const bodies = movable.map((b) => ({ ...b })).sort((a, b) => a.off - b.off);

  // The anchors settle among THEMSELVES first, so two codes are never printed on
  // top of each other. Normally nothing moves — the classical angles sit on two
  // perpendicular axes.
  if (anchors.length > 1) {
    relaxWidthAware(anchors, need);
    anchors.sort((a, b) => a.off - b.off);
  }
  if (bodies.length === 0) return collect(anchors);
  // No codes on this ring: the bodies own the whole circle.
  if (anchors.length === 0) {
    relaxWidthAware(bodies, need);
    return collect(bodies);
  }

  // Work in a frame rotated to the first anchor, so the anchors read as an
  // ascending list 0 = a0 < a1 < … < 360 and every arc is a plain interval.
  const base = anchors[0].off;
  const rot = (deg: number) => (((deg - base) % 360) + 360) % 360;
  const A = anchors.map((a) => ({ ...a, off: rot(a.off) }));
  A[0].off = 0; // exact, against float drift in rot()
  const B = bodies.map((b) => ({ ...b, off: rot(b.off) })).sort((x, y) => x.off - y.off);

  let bi = 0;
  let crowded = false;
  for (let i = 0; i < A.length; i++) {
    const L = A[i];
    const R = i + 1 < A.length ? A[i + 1] : { ...A[0], off: 360 };
    const inArc: RingMark[] = [];
    while (bi < B.length && B[bi].off < R.off) {
      inArc.push(B[bi]);
      bi += 1;
    }
    if (inArc.length === 0) continue;

    const pos = inArc.map((m) => m.off);
    // Forward from the left wall.
    pos[0] = Math.max(pos[0], L.off + need(L, inArc[0]));
    for (let k = 1; k < pos.length; k++) {
      pos[k] = Math.max(pos[k], pos[k - 1] + need(inArc[k - 1], inArc[k]));
    }
    // Back from the right one.
    pos[pos.length - 1] = Math.min(
      pos[pos.length - 1],
      R.off - need(inArc[inArc.length - 1], R),
    );
    for (let k = pos.length - 1; k > 0; k--) {
      pos[k - 1] = Math.min(pos[k - 1], pos[k] - need(inArc[k - 1], inArc[k]));
    }
    // The two walls met: more fell into this arc than it can hold at the full
    // requirement. Space it evenly across the arc instead — every gap the same,
    // tighter than ideal but ordered, and the codes at both ends keep their axis.
    // (This is where a chart with the minor bodies on usually lands: bodies bunch
    // in one part of the zodiac, the codes do not move to accommodate them.)
    const walled = pos[0] < L.off + need(L, inArc[0]) - 1e-9;
    if (walled) {
      const step = (R.off - L.off) / (inArc.length + 1);
      for (let k = 0; k < pos.length; k++) pos[k] = L.off + step * (k + 1);
      // Unless the arc is so narrow that even a shoulder-to-shoulder row would
      // still overlap — a sliver between two codes that are themselves nearly
      // conjunct. Nothing local can fix that, so the whole ring gives.
      const fits =
        step + 1e-9 >= ink(L, inArc[0]) &&
        step + 1e-9 >= ink(inArc[inArc.length - 1], R) &&
        inArc.every((m, k) => k === 0 || step + 1e-9 >= ink(inArc[k - 1], m));
      if (!fits) crowded = true;
    }
    for (let k = 0; k < inArc.length; k++) inArc[k].off = pos[k];
  }

  if (!crowded) {
    return collect([
      ...A.map((a) => ({ ...a, off: a.off + base })),
      ...B.map((b) => ({ ...b, off: b.off + base })),
    ]);
  }

  // An arc was too narrow to hold what fell into it at any spacing. Re-lay the
  // whole ring with the codes in the running: they give up their exact spot,
  // which in this chart no arrangement could have kept them anyway.
  // (A pass to draw the codes back toward their axes afterwards was tried and
  // dropped: it never moved anything. By the time this path is reached the ring
  // is packed, every neighbouring gap is already at its requirement, and there is
  // no local slack for a code to reclaim — the room would have to come from
  // bodies crossing to the other side of an axis, which would misreport which
  // side of it they fall on. Measured across 5,000 generated charts: no change.)
  const all = [...anchors, ...bodies].sort((a, b) => a.off - b.off);
  relaxWidthAware(all, need);
  return collect(all);
}

