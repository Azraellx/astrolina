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

/** How much of their combined width two BODY marks may share before the layout
 *  calls it a collision — 0 for none (every mark fully clear of its neighbours),
 *  a quarter for the default here.
 *
 *  Separation is not free: every degree a body is pushed off its true longitude is
 *  a degree it is drawn away from where it actually is, and past ~15° of push a
 *  planet in the last degrees of one house is drawn inside the NEXT one. That is a
 *  worse lie than a clipped glyph. Astrological glyphs survive being partly covered
 *  better than most type does — ♃ and ♄ do not become each other — so some of that
 *  room is better spent on staying in the right house.
 *
 *  A THIRD was the first figure, and it was too much to look at. Lowering it is not
 *  free either, and the exchange rate is shallow enough that the choice is genuinely
 *  about the eye rather than about the numbers — over the 5,000-chart realistic
 *  sweep, charts with a body drawn past a whole sign:
 *
 *      1/3  -> 199        0.28 -> 219        0.22 -> 229
 *      0.30 -> 209        1/4  -> 229        0.20 -> 249
 *
 *  so a quarter costs 30 charts in 5,000, 0.6%, against a deepest overlap that goes
 *  from a third of a glyph to a quarter of one. Below about a fifth the cost starts
 *  climbing faster than the picture improves.
 *
 *  What the ceiling actually looks like, at a quarter, over the same sweep — and it
 *  is worth reading the second column, because the first deliberately includes
 *  19-body charts and 340px wheels, which are crowded by construction:
 *
 *                        all charts    ten bodies, 440px+
 *      no contact           89.2%            98.2%
 *      up to  5%             1.7%             0.5%
 *      up to 10%             1.6%             0.4%
 *      up to 15%             1.6%             0.4%
 *      up to 20%             1.6%             0.3%
 *      up to 25%             4.3%             0.2%
 *
 *  The pile-up in the last row is the ceiling doing its job: those are the charts
 *  that wanted to go deeper and were stopped, and they are the ones where the
 *  alternative was a planet drawn in the wrong house.
 *
 *  It applies to BODY↔BODY pairs only. An angle code (As/Ds/Mc/Ic/Vx/Avx) is drawn
 *  with a panel-coloured halo that ERASES what it lands on rather than blending
 *  with it, so a code overlapping anything deletes the thing rather than crowding
 *  it — codes keep their full clearance. */
export const BODY_OVERLAP_SHARE = 1 / 4;

/** How far a body may be pushed off its true longitude before the layout spends
 *  the tolerance above rather than pushing it further.
 *
 *  This — not whether an arc can physically hold its marks — is what "tight" means
 *  here, and the difference decides the whole behaviour. Five bodies in one sign fit
 *  easily inside the 90° arc they live in, so by capacity nothing is tight; seating
 *  them all fully clear still fans them across 69° and puts a planet two houses from
 *  where it belongs. Capacity is about the arc. This is about the reader.
 *
 *  READ IT AS A CEILING, because that is what it is now. The arc solver below is
 *  exact, so on a crowded arc the worst push comes out AT this figure rather than
 *  somewhere under it: it is the furthest from its own notch any body is drawn on a
 *  chart the arc can serve at all. It did not mean that under the directional pass
 *  this replaced — there the search read its target off an intermediate layout that a
 *  later pass then improved, so the threshold bit early and the drawn result landed
 *  well inside it. Which is why the figure was re-measured against the solver rather
 *  than carried across with the number unchanged.
 *
 *  16° is measured, not chosen, and what the measurement says has changed with it.
 *  Over the 5,000-chart realistic sweep the count of charts with a body pushed past a
 *  WHOLE SIGN is 229 at EVERY threshold from 6° to 25° — down from 299 before, and
 *  now completely insensitive to this number. Where a body ends up in the wrong sign,
 *  no threshold was going to rescue it. So the threshold buys accuracy with one
 *  currency only:
 *
 *      6°  -> 2107 charts with a pair sharing ink      16°  ->  350
 *     10°  -> 1129                                     18°  ->  260
 *     12°  ->  711                                     20°  ->  190
 *     14°  ->  470                                     25°  ->  170
 *
 *  How DEEP that sharing goes is BODY_OVERLAP_SHARE’s business, and the histogram is
 *  there; what matters here is that 16° is where the count stops falling usefully.
 *  The four degrees from 16° to 20° save 160 charts in 5,000 and cost every body on
 *  a crowded arc four more degrees of distance from the notch that says where it is.
 *  Half a sign is the other half of the argument: at 20° a body can be drawn
 *  two-thirds of a sign from its own tick.
 *
 *  One more thing the sweep says, and it is a warning rather than an argument. Below
 *  16° the resize check at the foot of verify-wheel-layout starts FAILING — 8.9° of
 *  movement for one pixel at 297→298px, where a ten-body chart cannot be seated at
 *  all and squeezing harder only changes which arrangement it settles into. A
 *  tighter ceiling is not simply a better one.
 *
 *  Since 2026-10-02 the scan in placeOnRing meets this ceiling through a ramp of
 *  CEILING_SOFT_DEG either side rather than at a wall — that seam is what the resize
 *  check was finding — so a push can sit up to that far past it on an arc caught
 *  between two arrangements. */
export const MAX_PUSH_DEG = 16;
/** The width of that ramp (see the pressure scan in placeOnRing). */
const CEILING_SOFT_DEG = 0.25;

/** Marks carry this internally so `need` can tell a code from a body. Callers
 *  supply plain RingMarks; placeOnRing tags its two input sets. */
interface Tagged extends RingMark {
  /** A fixed mark (an angle code): never allowed to overlap, never overlapped. */
  anchor?: boolean;
}

/** The gap two neighbouring marks need, in degrees on the ring they share. */
type NeedFn = (a: Tagged, b: Tagged) => number;

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
  overlap: number = 0,
): Map<string, number> {
  // `overlap` is a CEILING on how far a pair may be squeezed, not a discount every
  // pair takes. Given room, marks clear each other completely; the tolerance is
  // spent only where the arc cannot seat what fell into it, and only as far down as
  // that arc needs. Spending it everywhere was the first cut of this, and it left
  // pairs overlapping that a two-degree nudge would have separated.
  //
  // `t` is the pressure in one arc: 0 = everyone comfortable, 1 = squeezed as far as
  // this ring will go. What it buys is spent IN ORDER, cheapest first, because the
  // two things it can spend are not the same kind of thing:
  //
  //   t ∈ [0, ½)   the readout floor, and the hairline of daylight. COMFORT. The
  //                 coordinate trios fanned inside this ring crowd, and then start
  //                 to touch. Nothing on the ring itself has moved closer than its
  //                 own ink.
  //   t ∈ [½, 1]   the marks’ own ink. CORRECTNESS, and the reason it goes last: a
  //                 glyph with a third of it covered is a glyph the reader has to
  //                 work out.
  //
  // Spending them together — one factor on both, which is how this started — meant
  // the floor could never be given up further than the ink was, and the floor is the
  // larger of the two by a wide margin on a small wheel. At 340px it asks 19.5° a
  // pair where the discs ask 11.3°, so nine bodies in one quadrant demanded 195° of
  // a 111° arc and no tolerance could close that: the arc fell through to the even
  // spacing below and every glyph in it lost its notch. Letting the comfort go first
  // and completely is what makes such an arc solvable at all, and it costs exactly
  // what the reference format already accepts — numbers crowding under a stellium.
  const share = Math.min(Math.max(overlap, 0), 1);
  const bodyPair = (a: Tagged, b: Tagged) => !a.anchor && !b.anchor && share > 0;
  /** How much of the stage running from `from` to `to` pressure `t` has spent. */
  const spent = (t: number, from: number, to: number) =>
    Math.min(Math.max((t - from) / (to - from), 0), 1);
  /** Pixels a pair must keep between centres at pressure `t`. */
  const widthPx = (a: Tagged, b: Tagged, t: number) => {
    const inkPx = a.half + b.half;
    const roomy = inkPx + RING_PAD_PX;
    // A code’s halo ERASES what it lands on, so a pair involving one never gives.
    if (!bodyPair(a, b)) return roomy;
    return (
      inkPx * (1 - share * spent(t, 0.5, 1)) + RING_PAD_PX * (1 - spent(t, 0, 0.5))
    );
  };
  /** The whole requirement at pressure `t` — the wider of the marks' own widths and
   *  the floor carried in from the rings fanned inside this one. */
  // The two halves of a requirement answer to different things, and only one of
  // them is what protects an angle code.
  //
  //   • the WIDTH term is the marks' own ink. A code is drawn with a panel-coloured
  //     halo that ERASES what it lands on, so a pair involving one keeps this at its
  //     full figure however hard the arc is pressed (see widthPx).
  //   • `minSep` is not about the code at all. It is the floor carried in from the
  //     degree·sign·minute trio fanned INSIDE this ring, and a trio beside a code is
  //     no more sacred than a trio beside a planet — so it takes the same squeeze,
  //     whatever kind of mark it sits next to.
  //
  // Keeping minSep full at the walls was measurable and expensive: on the reference
  // chart nine of ten bodies fall in one 110.8° arc, where two full-figure wall
  // clearances came to 29.8° — 27% of the arc spent before a single planet was
  // placed, and the reason a re-centring pass had nothing to work with.
  const reqAt = (a: Tagged, b: Tagged, t: number) =>
    Math.max(minSep * (1 - spent(t, 0, 0.5)), arcDeg(widthPx(a, b, t), ringRadius));
  /** The lowest pressure at which `marks` (walls included) fit in `width` degrees.
   *  Monotonic in t, so a short bisection is exact enough and cannot loop. */
  const pressureFor = (marks: Tagged[], width: number): number => {
    const demand = (t: number) => {
      let sum = 0;
      for (let i = 1; i < marks.length; i++) sum += reqAt(marks[i - 1], marks[i], t);
      return sum;
    };
    if (demand(0) <= width) return 0; // room to spare: nobody gives anything up
    if (demand(1) >= width) return 1; // over-full even at the floor
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (demand(mid) <= width) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  // What two marks need to merely not COLLIDE — the floor, no hairline and no
  // allowance for the rings fanned inside this one. A crowded arc is allowed down to
  // this before the codes are asked to give up their axis, because a tight row that
  // still reads is worth more than a code standing somewhere it isn't.
  const ink: NeedFn = (a, b) =>
    arcDeg(
      bodyPair(a, b) ? (a.half + b.half) * (1 - share) : a.half + b.half,
      ringRadius,
    );
  /** The comfortable requirement — what a pair gets when the ring is not pressed. */
  const need: NeedFn = (a, b) => reqAt(a, b, 0);
  const collect = (marks: RingMark[]) => {
    const m = new Map<string, number>();
    for (const x of marks) m.set(x.name, ((x.off % 360) + 360) % 360);
    return m;
  };
  const anchors: Tagged[] = fixed
    .map((a) => ({ ...a, anchor: true }))
    .sort((a, b) => a.off - b.off);
  const bodies: Tagged[] = movable
    .map((b) => ({ ...b, anchor: false }))
    .sort((a, b) => a.off - b.off);

  // The anchors settle among THEMSELVES first, so two codes are never printed on
  // top of each other. Normally nothing moves — the classical angles sit on two
  // perpendicular axes.
  if (anchors.length > 1) {
    relaxWidthAware(anchors, need);
    anchors.sort((a, b) => a.off - b.off);
  }
  if (bodies.length === 0) return collect(anchors);
  // No codes on this ring: the bodies own the whole circle — one 360° arc, and it
  // gets its pressure worked out the same way an arc between two codes does.
  if (anchors.length === 0) {
    const t = pressureFor([...bodies, { ...bodies[0], off: bodies[0].off + 360 }], 360);
    relaxWidthAware(bodies, (a, b) => reqAt(a, b, t));
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
    const inArc: Tagged[] = [];
    while (bi < B.length && B[bi].off < R.off) {
      inArc.push(B[bi]);
      bi += 1;
    }
    if (inArc.length === 0) continue;

    // How hard THIS arc is pressed. Pressure is per-arc because crowding is: a
    // stellium between the Ascendant and the Midheaven says nothing about the empty
    // quadrant opposite.
    //
    // And it is decided by DISPLACEMENT, not by whether the arc can physically hold
    // the set. That distinction is the whole behaviour. Five bodies inside one sign
    // fit comfortably in the 90° arc they live in — the arc is not "tight" by any
    // capacity measure — yet seating them all fully clear fans them across 69°, and
    // a planet in the last degrees of one house is drawn two houses along. Capacity
    // said there was room; the reader saw a planet in the wrong house.
    //
    // So: lay the arc out comfortably. If nothing had to move far, that is the
    // answer and no two marks touch. Only if a body would be shoved past
    // MAX_PUSH_DEG does the arc start spending its tolerance — hairline first, then
    // shared ink — and only as deep as it takes to get back under the line.
    // The order of the marks in an arc never changes, and each neighbouring pair
    // owes the other a gap. Under those two constraints there is ONE arrangement
    // that puts every mark as close to its own longitude as it can be — the
    // least-squares one — and it is cheap enough to compute exactly rather than
    // approximate. Substituting out the gaps (measure each mark from where it would
    // sit if every pair ahead of it were exactly at its requirement) turns "at least
    // this far apart" into "in ascending order", which is isotonic regression:
    // pool-adjacent-violators, O(n), with no iteration count to tune.
    //
    // What that buys over the forward-then-backward pass it replaces is not
    // tidiness. That pass was DIRECTIONAL — a crowded run came out expanded to the
    // right of where it began — so a second pass slid each run of marks that were
    // pressing on each other back toward its members’ mean. The second pass could
    // not UNPOOL. A mark the first pass had nudged by a single degree joined the run
    // in front of it and then paid that run’s whole re-centring shift: measured on
    // the reference chart at 700px, Venus went from 1.0° off its notch to 7.5° off,
    // on the wrong side, while the stellium it had been swept into improved. Which
    // run a mark fell into turned on a hair, so the answer JUMPED with the wheel’s
    // size — Venus on its notch at 620px and at 900px, 7–8° away at 700px and 800px.
    // A reader dragging the sidebar wider watched it flip back and forth.
    //
    // A projection onto a convex set cannot do that. This one is 1-Lipschitz in both
    // the marks’ own offsets and the gaps they owe, so a wheel a pixel wider moves a
    // body by a fraction of a degree. That is half of what a resize needs; the other
    // half is choosing the PRESSURE continuously, which is the scan further down.
    const solve = (t: number) => {
      const n = inArc.length;
      // Every gap the arc owes, walls included: [L→first, between…, last→R].
      const want: number[] = [reqAt(L, inArc[0], t)];
      for (let k = 1; k < n; k++) want.push(reqAt(inArc[k - 1], inArc[k], t));
      want.push(reqAt(inArc[n - 1], R, t));
      // An arc can be asked for more than it is. When it is, every gap gives up the
      // same PROPORTION rather than the arc changing to a different layout — which
      // is the whole point of doing it here. A hard switch to even spacing sat at
      // this boundary once, and an arc one pixel either side of it came out
      // arranged by two different rules: measured at 347→348px, a body moved 8° for
      // one pixel of window. Shrinking in proportion agrees with the unshrunk
      // answer exactly at the boundary (the factor is 1 there) and departs from it
      // smoothly, so there is no boundary left to sit on. It also keeps what even
      // spacing threw away: an angle code is wider than a planet disc and still
      // gets more room than one.
      const total = want.reduce((x, y) => x + y, 0);
      const room = R.off - L.off;
      const fits = total <= room;
      const gap = fits ? want : want.map((g) => (g * room) / total);
      // cum[k]: the least the k-th mark can sit ahead of the first.
      const cum = [0];
      for (let k = 1; k < n; k++) cum.push(cum[k - 1] + gap[k]);
      // The walls, in the same substituted frame. Because substituted positions are
      // ASCENDING, a bound on one of them binds every one — so clamping each pooled
      // block to [lo, hi] is the exact answer here rather than a repair afterwards.
      const lo = L.off + gap[0];
      const hi = R.off - gap[n] - cum[n - 1];
      const val: number[] = [];
      const cnt: number[] = [];
      for (let k = 0; k < n; k++) {
        let mean = inArc[k].off - cum[k];
        let w = 1;
        while (val.length > 0 && val[val.length - 1] > mean) {
          const c = cnt.pop()!;
          mean = (val.pop()! * c + mean * w) / (c + w);
          w += c;
        }
        val.push(mean);
        cnt.push(w);
      }
      const pos: number[] = [];
      for (let b = 0; b < val.length; b++) {
        const z = Math.min(Math.max(val[b], lo), Math.max(hi, lo));
        for (let k = 0; k < cnt[b]; k++) pos.push(z + cum[pos.length]);
      }
      // Shrinking keeps the arc SEATED, not necessarily legible: past a point the
      // gaps fall below the ink two marks need to stay separate glyphs, and nothing
      // this arc can do fixes that. `tooTight` says so, and the whole ring gives.
      const tooTight =
        !fits &&
        (gap[0] + 1e-9 < ink(L, inArc[0]) ||
          gap[n] + 1e-9 < ink(inArc[n - 1], R) ||
          inArc.some((m, k) => k > 0 && gap[k] + 1e-9 < ink(inArc[k - 1], m)));
      return { pos, fits, tooTight };
    };
    // Offsets inside an arc are already unwrapped, so the push is a plain difference.
    const worstPush = (p: number[]) =>
      p.reduce((w, v, k) => Math.max(w, Math.abs(v - inArc[k].off)), 0);

    // An arc is acceptable when it SEATS its marks and no mark ends up past the
    // ceiling — fitting first, because a pressure that does not seat them drops the
    // arc into the proportional shrink and can take the whole ring into the re-lay
    // that makes the angle codes give up their axis. Measured while this was written:
    // a plain ten-body chart re-laid its ring at 336px and did not at 337px, moving
    // Venus 56° for one pixel of window, because the search stopped at a pressure
    // where one arc was still over-full and the push it measured there looked fine.
    // So a rung that does not seat the arc reads as an infinite push.
    const seatedPush = (r: { pos: number[]; fits: boolean }) =>
      r.fits ? worstPush(r.pos) : Infinity;

    // And it is SCANNED, not bisected. Bisection needs the thing it is bisecting on
    // to be monotone, and the worst push is not: as an almost-full arc gains room the
    // solver redistributes it, the total displacement falls the whole way (it must —
    // relaxing the gaps only ever widens the feasible set, and this is a projection
    // onto it), but WHICH mark is furthest out changes, and the maximum can rise for
    // a stretch while the sum falls. Measured on a six-body arc at 348px, against a
    // 16° ceiling:
    //
    //     t     0.100  0.125  0.150  0.175  0.200
    //     push  20.95  15.89  16.80  15.09  13.91
    //
    // Both 0.125 and 0.175 are acceptable and they are different arrangements. A
    // bisection lands on whichever side of that bump it happens to sample, and a
    // wheel one pixel wider samples the other one: 8° of movement, for a pixel, with
    // both answers inside the ceiling and nothing to choose between them.
    //
    // So: walk down from full pressure and stop at the first rung that fails. The
    // answer is the shallowest pressure from which the ceiling holds AND KEEPS
    // HOLDING, which is monotone by construction. It moves by at most one rung when
    // the wheel moves by a pixel, and a rung is worth a fraction of a degree.
    // The walk runs all the way down every time, with no shortcut for the arc that
    // is already under the ceiling at rest. That shortcut was here and it was the
    // seam: taking t = 0 whenever t = 0 happened to pass is a SECOND rule, and where
    // the two meet — the ceiling met at rest and missed a rung above it — the answer
    // jumped between them. Measured at 398→399px on a six-body arc: 8°. One rule for
    // the whole range costs sixty-odd solves of a ten-element array per arc and is
    // the difference between a wheel that resizes and a wheel that flickers.
    //
    // And the walk counts SOFTLY (2026-10-02). Stopping at the first rung past the
    // ceiling was still a seam wherever the worst push lies FLAT across a stretch of
    // rungs — a body held against an angle code's wall is pushed the same however
    // hard the bodies behind it are squeezed. With that stretch a hair under the
    // ceiling the walk ran through it; a hair over, it stopped above it; and a pixel
    // of wheel moved the answer the width of the stretch. Measured on a six-body arc:
    // 8.2° at 283→284px and 9.6° at 284→285px, both surfaced when the angle codes
    // became the wider capitals AS, MC, DS, IC and moved the walls; the same seam was
    // already there under the old codes, at 298→299px (7.5°), on a sample five times
    // the size of the resize check's. So each rung counts toward the answer by how far
    // the walk's worst push so far (its own or any rung above it) sits past the
    // ceiling, ramped over ±CEILING_SOFT_DEG rather than switched: well under counts
    // nothing, well over counts a whole rung, and the pressure is the count. Where the
    // push crosses the ceiling steeply that is the rung the walk used to stop at;
    // where it lies flat along the ceiling, the answer slides across the stretch as
    // the stretch rises, instead of jumping it.
    const PRESSURE_STEPS = 64;
    let worstSoFar = -Infinity;
    let pressure = 0;
    for (let k = PRESSURE_STEPS; k >= 0; k--) {
      worstSoFar = Math.max(worstSoFar, seatedPush(solve(k / PRESSURE_STEPS)));
      if (k === PRESSURE_STEPS) continue;
      const over = (worstSoFar - MAX_PUSH_DEG) / CEILING_SOFT_DEG;
      pressure += Math.min(Math.max((over + 1) / 2, 0), 1) / PRESSURE_STEPS;
    }
    // Ends on solve(1) when even full pressure cannot both seat the arc and keep it
    // inside the ceiling — a genuinely packed arc, and the best on offer: every rung
    // below it then counts whole.
    const solved = solve(pressure);
    const pos = solved.pos;
    // More fell into this arc than it can hold even at the floor, AND the
    // proportional shrink took a gap below the ink two marks need to read as two
    // marks — a sliver between two codes that are themselves nearly conjunct, or a
    // stellium in one. Nothing local can fix that, so the whole ring gives.
    if (solved.tooTight) crowded = true;
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
  // Same treatment for the whole-ring re-lay: work out how hard the ring as a whole
  // is pressed, rather than charging every pair the comfortable figure and letting
  // relaxWidthAware discover it cannot pay.
  const tAll = pressureFor([...all, { ...all[0], off: all[0].off + 360 }], 360);
  relaxWidthAware(all, (a, b) => reqAt(a, b, tAll));
  return collect(all);
}

