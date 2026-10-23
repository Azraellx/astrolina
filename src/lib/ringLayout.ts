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
// cannot hold the set; a body's centre stays in its own house wherever the house
// can hold it).
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
 *  it — codes keep their full clearance.
 *
 *  Every figure above was measured HOUSE-BLIND, and is still what a ring without
 *  houses gets (the cusp-rim band, the catalog ring). Since 2026-10-23 the natal and
 *  overlay rings of a detailed wheel are laid out against their house cusps as well
 *  (`spokes`, below), which keeps a body's centre in its own house directly rather
 *  than through this tolerance — and spends the tolerance to do it, so the last row
 *  above fills: on the ten-body charts at 440px and up, 0.5% of charts reach the
 *  quarter house-blind and 9.4% on the houses path (HOUSE_INSET_SHARE has the sweep).
 *  The quarter was kept as it was; re-measuring it there is a separate decision. */
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
 *  Since 2026-10-02 the pressure scan (scanPressure) meets this ceiling through a ramp of
 *  CEILING_SOFT_DEG either side rather than at a wall — that seam is what the resize
 *  check was finding — so a push can sit up to that far past it on an arc caught
 *  between two arrangements.
 *
 *  These figures, too, were measured HOUSE-BLIND (see the note closing
 *  BODY_OVERLAP_SHARE). Since 2026-10-23 a detailed wheel's rings run the houses path,
 *  where a house line is a harder limit than this ceiling: an arc whose bodies cannot
 *  stay in their houses at a comfortable pressure is pressed harder, whatever the
 *  push. 16° was kept; re-measuring it there is a separate decision. */
export const MAX_PUSH_DEG = 16;
/** The width of that ramp (see scanPressure). */
const CEILING_SOFT_DEG = 0.25;

/** How far inside its own house a body's CENTRE is kept, as a share of the body's own
 *  half-width: 0 keeps the centre alone inside the cusp, 1 the whole disc.
 *
 *  0 since 2026-10-23, Salvatore's call. Whole-disc (1) and three-quarters (0.75) were
 *  offered beside it and declined the same day. What the stricter figures would cost is
 *  measurable, because an inset is taken out of BOTH ends of every house: it narrows
 *  every house by two of them, and the houses it tips over are the narrow ones — a
 *  polar sliver, a stellium's sign on a phone, the house an angle code shares with a
 *  planet it has to give way to. Over 28,000 realistic charts (Whole Sign, Equal,
 *  Porphyry-like and polar cusps, 340–800px, a third with all nineteen bodies), and the
 *  ten-body charts at 440px and up among them:
 *
 *                     a centre outside its house      a code off its axis
 *      share          all charts   ten, 440px+        all charts   ten, 440px+
 *      0                 6.9%          0.9%              45.9%        30.3%
 *      0.75             10.4%          1.6%              55.5%        38.9%
 *      1                11.9%          1.9%              58.6%        42.0%
 *      house-blind      72.2%         51.4%              25.5%        17.1%
 *
 *  (The house-blind codes are off their axis where they settle among themselves —
 *  a Vertex near an angle — and where the ring is re-laid whole; both happen on the
 *  houses path too.) What 0 costs is visible and was accepted as the price: a planet a
 *  degree inside a cusp is drawn with its centre in its house and up to half its disc
 *  over the line.
 *
 *  It is a SHARE rather than a figure in pixels or degrees because what a reader judges
 *  is how much of the glyph sits over the line, and a share is that question asked the
 *  same way at every size: the disc steps with the wheel (wheelGeometry), so a fixed
 *  pixel inset would be a different fraction of a glyph on a phone than on a desktop,
 *  and a degree inset a different number of pixels on every ring. On top of the share
 *  every body keeps RING_PAD_PX/2, half the hairline, so a centre never lands exactly
 *  ON a cusp, where the eye cannot say which side of the line it is on. */
export const HOUSE_INSET_SHARE = 0;

/** The weights of the houses path's ring-wide solve (layOutRing, S2). Three things are
 *  traded there and they are not the same kind of thing, so the weights are set apart
 *  by orders of magnitude to make the trade LEXICOGRAPHIC rather than a blend:
 *
 *    1. a body's centre outside its house — SPILL_COST per degree;
 *    2. an angle code off its axis — CODE_HOLD per degree;
 *    3. every mark's distance from its own degree — 1 per degree², as everywhere here.
 *
 *  What makes it lexicographic is an inequality, so it is written down. The most the
 *  squared terms can ever pull on one mark is their slope, 2·|x − z| summed over the
 *  marks behind it, which on a ring of N marks is under 2·N·360 (≈ 18,000 at 25 marks).
 *  So:
 *
 *      2·N·360  ≪  CODE_HOLD (1e6)  ≪  SPILL_COST (1e9)
 *
 *  and no amount of comfort can move a code off its axis, and no amount of code
 *  movement is bought with a body out of its house. Both penalties are corners rather
 *  than slopes (|x − z| and a distance), so the solve lands EXACTLY on the line it is
 *  held to rather than a hair past it — an exact penalty, not an approximate one. Kept
 *  integers so that the sums the kernel forms from them are exact in a double. */
const SPILL_COST = 1e9;
const CODE_HOLD = 1e6;

/** Two tolerances, both far under anything a pixel can show: a body within IN_BOX_EPS
 *  of its house is in it (positions are sums of a dozen terms, so the last bits are
 *  noise), and a spill within SPILL_EPS of the least the arc can manage is that least. */
const IN_BOX_EPS = 1e-9;
const SPILL_EPS = 1e-9;
/** A body this close to a cusp from below is ON it, and so in the house that starts
 *  there — the same half-open rule the house of a longitude is read by. */
const CUSP_SNAP = 1e-9;
/** The share of the circle a ring-wide solve may fill. Kept short of the whole circle
 *  so that at least one gap is slack, which is what lets the seam be cut (solveCircle). */
const RING_FILL = 0.999;

/** Marks carry this internally so `need` can tell a code from a body. Callers
 *  supply plain RingMarks; layOutRing tags its two input sets. */
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

/** What one call's marks owe each other, at every pressure — built once per call from
 *  its floor, its radius and its overlap tolerance, and shared by every arc, the
 *  ring-wide solves and the re-lay. */
interface RingRules {
  /** The whole requirement between two neighbours at pressure `t`. */
  reqAt: (a: Tagged, b: Tagged, t: number) => number;
  /** The lowest pressure at which `marks` (walls included) fit in `width` degrees. */
  pressureFor: (marks: Tagged[], width: number) => number;
  /** What two marks need to merely not collide. */
  ink: NeedFn;
  /** The comfortable requirement. */
  need: NeedFn;
}

function ringRules(minSep: number, ringRadius: number, overlap: number): RingRules {
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
  return { reqAt, pressureFor, ink, need };
}

/** One arc, solved at one pressure. Besides the answer it carries the arc's own frame —
 *  the gaps' prefix sums and the two walls, in the substituted coordinates the solve
 *  runs in — which the houses path re-solves against when the answer leaves a body
 *  outside its house. */
interface ArcSolve {
  pos: number[];
  fits: boolean;
  tooTight: boolean;
  /** cum[k]: the least the k-th mark can sit ahead of the first. */
  cum: number[];
  /** The walls in the substituted frame (position less cum). */
  lo: number;
  hi: number;
}

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
function solveArc(rules: RingRules, L: Tagged, R: Tagged, inArc: Tagged[], t: number): ArcSolve {
  const { reqAt, ink } = rules;
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
  return { pos, fits, tooTight, cum, lo, hi };
}

const PRESSURE_STEPS = 64;

/** The pressure an arc is laid out at, from `measure(t)`: the worst push at pressure
 *  `t`, or Infinity where that pressure is not acceptable at all.
 *
 *  It is SCANNED, not bisected. Bisection needs the thing it is bisecting on to be
 *  monotone, and the worst push is not: as an almost-full arc gains room the solver
 *  redistributes it, the total displacement falls the whole way (it must — relaxing
 *  the gaps only ever widens the feasible set, and this is a projection onto it), but
 *  WHICH mark is furthest out changes, and the maximum can rise for a stretch while the
 *  sum falls. Measured on a six-body arc at 348px, against a 16° ceiling:
 *
 *      t     0.100  0.125  0.150  0.175  0.200
 *      push  20.95  15.89  16.80  15.09  13.91
 *
 *  Both 0.125 and 0.175 are acceptable and they are different arrangements. A
 *  bisection lands on whichever side of that bump it happens to sample, and a wheel
 *  one pixel wider samples the other one: 8° of movement, for a pixel, with both
 *  answers inside the ceiling and nothing to choose between them.
 *
 *  So: walk down from full pressure and stop at the first rung that fails. The answer
 *  is the shallowest pressure from which the ceiling holds AND KEEPS HOLDING, which is
 *  monotone by construction. It moves by at most one rung when the wheel moves by a
 *  pixel, and a rung is worth a fraction of a degree. The walk runs all the way down
 *  every time, with no shortcut for the arc that is already under the ceiling at rest.
 *  That shortcut was here and it was the seam: taking t = 0 whenever t = 0 happened to
 *  pass is a SECOND rule, and where the two meet — the ceiling met at rest and missed a
 *  rung above it — the answer jumped between them. Measured at 398→399px on a six-body
 *  arc: 8°. One rule for the whole range costs sixty-odd solves of a ten-element array
 *  per arc and is the difference between a wheel that resizes and a wheel that
 *  flickers.
 *
 *  And the walk counts SOFTLY (2026-10-02). Stopping at the first rung past the ceiling
 *  was still a seam wherever the worst push lies FLAT across a stretch of rungs — a body
 *  held against an angle code's wall is pushed the same however hard the bodies behind
 *  it are squeezed. With that stretch a hair under the ceiling the walk ran through it;
 *  a hair over, it stopped above it; and a pixel of wheel moved the answer the width of
 *  the stretch. Measured on a six-body arc: 8.2° at 283→284px and 9.6° at 284→285px,
 *  both surfaced when the angle codes became the wider capitals AS, MC, DS, IC and moved
 *  the walls; the same seam was already there under the old codes, at 298→299px (7.5°),
 *  on a sample five times the size of the resize check's. So each rung counts toward
 *  the answer by how far the walk's worst push so far (its own or any rung above it)
 *  sits past the ceiling, ramped over ±CEILING_SOFT_DEG rather than switched: well under
 *  counts nothing, well over counts a whole rung, and the pressure is the count. Where
 *  the push crosses the ceiling steeply that is the rung the walk used to stop at; where
 *  it lies flat along the ceiling, the answer slides across the stretch as the stretch
 *  rises, instead of jumping it.
 *
 *  Ends on 1 when even full pressure cannot both seat the arc and keep it inside the
 *  ceiling — a genuinely packed arc, and the best on offer: every rung below it then
 *  counts whole. */
function scanPressure(measure: (t: number) => number): number {
  let worstSoFar = -Infinity;
  let pressure = 0;
  for (let k = PRESSURE_STEPS; k >= 0; k--) {
    worstSoFar = Math.max(worstSoFar, measure(k / PRESSURE_STEPS));
    if (k === PRESSURE_STEPS) continue;
    const over = (worstSoFar - MAX_PUSH_DEG) / CEILING_SOFT_DEG;
    pressure += Math.min(Math.max((over + 1) / 2, 0), 1) / PRESSURE_STEPS;
  }
  return pressure;
}

/** Lay one arc out between two walls, house-blind: the pressure scan over the exact
 *  solve. */
function layArc(rules: RingRules, L: Tagged, R: Tagged, inArc: Tagged[]): ArcSolve {
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
  //
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
  const pressure = scanPressure((t) => seatedPush(solveArc(rules, L, R, inArc, t)));
  return solveArc(rules, L, R, inArc, pressure);
}

// ── The kernel: least squares in order, with corners ──────────────────────────────

/** One term of the separable convex loss pavConvex minimises:
 *
 *      q·(y − t)²  +  w·|y − at|  +  P·dist(y, [lo, hi])
 *
 *  The quadratic is the pull toward the mark's own degree; the corner is an angle
 *  code's hold on its axis; the soft box is a body's house. Exported for
 *  scripts/verify-wheel-layout.ts, which checks the kernel against its own optimality
 *  conditions. */
export interface PavTerm {
  /** Quadratic weight, > 0. */
  q: number;
  t: number;
  /** A corner at `at`, of weight `w`. */
  at?: number;
  w?: number;
  /** A soft box [lo, hi] (lo ≤ hi), of weight `P` per unit outside it. */
  lo?: number;
  hi?: number;
  P?: number;
}

/** The nondecreasing y minimising Σ term_k(y_k), exactly: pool-adjacent-violators for
 *  separable convex losses (Best, Chakravarti & Ubhaya, 2000). solveArc's PAV is the
 *  all-quadratic case of this, where a block's value is its mean; here a block's value
 *  is the argmin of a convex piecewise-quadratic, found by walking its breakpoints.
 *
 *  Why bounds have to be terms rather than a clip afterwards. The walls of an arc are
 *  the SAME bound on every substituted position, and clipping the pooled answer to a
 *  common bound is exact (solveArc says so, and relies on it). A house is a DIFFERENT
 *  bound on each body, and clipping to per-element bounds is not exact: targets (10, 0)
 *  with y₂ ≥ 6 clip from the pooled (5, 5) to (5, 6), cost 25 + 36 = 61, while the
 *  optimum is (6, 6), cost 16 + 36 = 52. The bound has to act inside the pooling, which
 *  is what a soft box with an exact-penalty weight (SPILL_COST) does.
 *
 *  n here is at most a few dozen and a block re-sorts its breakpoints on every merge, so
 *  this is O(n² log n); the fast paths in layOutRing keep it off every ring that does
 *  not need it. */
export function pavConvex(terms: readonly PavTerm[]): number[] {
  interface Block {
    start: number;
    n: number;
    Q: number;
    S: number;
    /** The loss's slope from its corners and boxes at y = −∞. */
    J0: number;
    /** [position, how much the slope rises there]. */
    bps: [number, number][];
    v: number;
  }
  // The block's loss has slope 2Q·y − 2S + J between breakpoints, J rising by each
  // breakpoint's jump; its argmin is the first piece whose own zero lies inside it, or
  // the breakpoint where the slope steps across zero.
  const argmin = (b: Block): number => {
    b.bps.sort((x, y) => x[0] - y[0]);
    let J = b.J0;
    let left = -Infinity;
    for (const [right, jump] of b.bps) {
      const y = (b.S - J / 2) / b.Q;
      if (y <= left) return left;
      if (y < right) return y;
      J += jump;
      left = right;
    }
    const y = (b.S - J / 2) / b.Q;
    return y <= left ? left : y;
  };
  const stack: Block[] = [];
  for (let k = 0; k < terms.length; k++) {
    const e = terms[k];
    const bps: [number, number][] = [];
    let J0 = 0;
    if (e.at !== undefined && e.w !== undefined && e.w > 0) {
      bps.push([e.at, 2 * e.w]);
      J0 -= e.w;
    }
    if (e.lo !== undefined && e.hi !== undefined && e.P !== undefined && e.P > 0) {
      bps.push([e.lo, e.P], [e.hi, e.P]);
      J0 -= e.P;
    }
    let b: Block = { start: k, n: 1, Q: e.q, S: e.q * e.t, J0, bps, v: 0 };
    b.v = argmin(b);
    while (stack.length > 0 && stack[stack.length - 1].v > b.v) {
      const p = stack.pop()!;
      b = {
        start: p.start,
        n: p.n + b.n,
        Q: p.Q + b.Q,
        S: p.S + b.S,
        J0: p.J0 + b.J0,
        bps: p.bps.concat(b.bps),
        v: 0,
      };
      b.v = argmin(b);
    }
    stack.push(b);
  }
  const y: number[] = new Array(terms.length);
  for (const b of stack) for (let i = 0; i < b.n; i++) y[b.start + i] = b.v;
  return y;
}

// ── Houses ────────────────────────────────────────────────────────────────────────

/** A body's house as the interval its centre may be drawn in, as offsets RELATIVE to
 *  the body's own degree — so it carries unchanged into whatever unwrapped frame the
 *  body is laid out in. */
interface HouseBox {
  lo: number;
  hi: number;
}

const norm360 = (deg: number) => ((deg % 360) + 360) % 360;

/** The spokes a call passed, as a sorted list of finite offsets in [0, 360) — empty
 *  when there are none, which is what sends a call down the house-blind path. */
function cleanSpokes(spokes: readonly number[] | undefined): number[] {
  if (!spokes || spokes.length === 0) return [];
  return spokes.filter(Number.isFinite).map(norm360).sort((a, b) => a - b);
}

/** Each body's box (S0). Sectors are half-open, [s_k, s_k+1): a body exactly on a cusp
 *  — or within CUSP_SNAP below it — is in the house that starts there, which is how a
 *  longitude's house is read everywhere else. Duplicated spokes (a polar chart's cusps
 *  can coincide) leave an empty sector that nothing falls into. A sector narrower than
 *  the two insets collapses to its midpoint: the centre is then drawn exactly between
 *  its cusps, the best a sliver narrower than a glyph allows. */
function houseBoxes(bodies: readonly Tagged[], spokes: readonly number[], ringRadius: number): HouseBox[] {
  const n = spokes.length;
  return bodies.map((b) => {
    const m = arcDeg(b.half * HOUSE_INSET_SHARE + RING_PAD_PX / 2, ringRadius);
    let z = norm360(b.off);
    if (z + CUSP_SNAP >= spokes[0] + 360) z -= 360;
    let k = -1;
    for (let i = 0; i < n; i++) if (spokes[i] <= z + CUSP_SNAP) k = i;
    let d: number;
    if (k < 0) {
      k = n - 1;
      d = z + 360 - spokes[k];
    } else {
      d = z - spokes[k];
    }
    const span = k + 1 < n ? spokes[k + 1] - spokes[k] : spokes[0] + 360 - spokes[k];
    if (span < 2 * m) return { lo: -d + span / 2, hi: -d + span / 2 };
    return { lo: -d + m, hi: -d + span - m };
  });
}

/** How far each position lies outside its box, summed — the houses path's measure of
 *  what it failed to keep. */
function spillOf(pos: readonly number[], boxLo: readonly number[], boxHi: readonly number[]): number {
  let s = 0;
  for (let k = 0; k < pos.length; k++) s += Math.max(0, boxLo[k] - pos[k], pos[k] - boxHi[k]);
  return s;
}

/** One mark of a ring-wide solve: its degree (in one unwrapped frame, ascending round
 *  the ring), and either a house (a body) or an axis to hold (a code). */
interface CircleMark {
  z: number;
  code: boolean;
  box?: HouseBox;
}

/** The ring-wide solve: every mark in its order round the circle, gaps[j] owed between
 *  mark j and mark j + 1 (the last one wrapping to the first), each mark costing its
 *  squared distance from its degree plus its corner or its box. Returns each mark's
 *  position, unwrapped near its own degree.
 *
 *  A circle has no ends, and the kernel needs a line. So the circle is CUT at one gap
 *  and solved as a chain with that gap dropped; if the chain's answer also honours the
 *  dropped gap, it is the circle's answer — a solution of a relaxation that is feasible
 *  for the original problem is optimal for it, and the optimum is unique (every mark's
 *  loss is strictly convex), so it is the same answer whichever gap was cut, and the
 *  cut adds no seam of its own. At least one gap is slack at the optimum whenever the
 *  gaps sum to less than the circle (RING_FILL), and cutting a slack gap always
 *  succeeds. The gaps are tried widest-slack first — slack at the marks' own degrees —
 *  because that is almost always the one, so the usual cost is one chain. */
function solveCircle(marks: readonly CircleMark[], gaps: readonly number[]): number[] {
  const n = marks.length;
  const slack = (j: number) =>
    (j + 1 < n ? marks[j + 1].z - marks[j].z : marks[0].z + 360 - marks[j].z) - gaps[j];
  const order = Array.from({ length: n }, (_, j) => j).sort(
    (a, b) => slack(b) - slack(a) || a - b,
  );
  let best: number[] | null = null;
  let bestShort = Infinity;
  for (const c of order) {
    const terms: PavTerm[] = [];
    const zU: number[] = [];
    const cum: number[] = [];
    for (let i = 0; i < n; i++) {
      const e = (c + 1 + i) % n;
      const z = marks[e].z + (c + 1 + i >= n ? 360 : 0);
      const cu = i === 0 ? 0 : cum[i - 1] + gaps[(c + i) % n];
      zU.push(z);
      cum.push(cu);
      const m = marks[e];
      const term: PavTerm = { q: 1, t: z - cu };
      if (m.code) {
        term.at = z - cu;
        term.w = CODE_HOLD;
      } else if (m.box) {
        term.lo = z + m.box.lo - cu;
        term.hi = z + m.box.hi - cu;
        term.P = SPILL_COST;
      }
      terms.push(term);
    }
    const y = pavConvex(terms);
    const x = y.map((v, i) => v + cum[i]);
    const short = gaps[c] - (x[0] + 360 - x[n - 1]);
    const out: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const e = (c + 1 + i) % n;
      out[e] = marks[e].z + (x[i] - zU[i]);
    }
    if (short <= 1e-9) return out;
    if (short < bestShort) {
      bestShort = short;
      best = out;
    }
  }
  // Unreachable while the gaps leave the circle any slack; kept so a degenerate input
  // degrades to the nearest answer rather than to nothing.
  return best!;
}

/** Where a ring was laid out from, for callers and checks that need to know which
 *  promise it kept:
 *
 *    held     every angle code is exactly on its axis (the usual case);
 *    yielded  houses path only: a code was drawn off its axis so a body could stay in
 *             its house, or so an over-full arc could be seated — by the least it
 *             could be. (A code may also turn out not to need to move here.)
 *    relaid   the ring was too full for either promise and was laid out whole, codes
 *             in the running. */
export type RingRegime = 'held' | 'yielded' | 'relaid';

export interface RingLayout {
  /** Display offsets in degrees, keyed by name — fixed marks included. */
  at: Map<string, number>;
  regime: RingRegime;
  /** Degrees of body centre drawn outside its own house, summed over the bodies — 0
   *  without spokes, and 0 wherever the houses can hold their bodies. */
  spillDeg: number;
}

/** Lay movable marks out on a ring around FIXED ones — and, given `spokes`, inside the
 *  houses those spokes cut the ring into.
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
 *  ── With spokes (2026-10-23) ──
 *
 *  `spokes` are the house cusps, in the marks' own frame (degrees from the ASC — see
 *  ringSpokes in ./wheelRingLayout). Given them, a body's CENTRE is kept inside its own
 *  house (HOUSE_INSET_SHARE) wherever the house can hold it, and that outranks an angle
 *  code's hold on its axis, which outranks everything else. The reported case is a
 *  Whole Sign chart with the Descendant at 27°18' Scorpio and Neptune at 28°42': Neptune
 *  is in the 7th, but the code↔body clearance (≈5.8° at 720px) pushed its glyph to ≈5°
 *  Sagittarius, across the 7/8 cusp — the layout never saw the cusp. Under a quadrant
 *  system four of the cusps ARE the angles, so the codes already acted as house walls
 *  there; Whole Sign, whose codes sit mid-house, is where it bit.
 *
 *    S0  each body gets its house as a box; codes get none, so a Whole Sign AS at 0°30'
 *        is never moved off its axis when nothing is near it.
 *    S1  the codes settle among themselves, exactly as without spokes.
 *    S2  can every code hold? Yes when every arc, at full pressure and with the codes
 *        on their axes, both fits and can seat each of its bodies in its box — regime
 *        `held`, and the codes do not move at all. Otherwise one ring-wide solve at full
 *        pressure (solveCircle) moves the codes by the least that does it (CODE_HOLD,
 *        SPILL_COST) — `yielded`. Where even that cannot be seated, `relaid`.
 *    S3  each arc, between its codes where S2 left them, gets the same pressure scan as
 *        without spokes; a rung that leaves more of a body outside its house than full
 *        pressure would counts as not acceptable, so an arc is pressed exactly as hard
 *        as its houses need and no harder.
 *    S4  with no codes on the ring, the ring is one arc, and every rung of the scan is a
 *        ring-wide solve.
 *
 *  Without spokes (undefined or empty) none of that runs, and the layout is exactly what
 *  it was before houses existed here — every ring that is not a detailed wheel's glyph
 *  ring (the cusp-rim band, the catalog ring) is laid out that way. */
export function layOutRing(
  fixed: RingMark[],
  movable: RingMark[],
  minSep: number,
  ringRadius: number,
  overlap: number = 0,
  spokes?: readonly number[],
): RingLayout {
  const rules = ringRules(minSep, ringRadius, overlap);
  const { reqAt, pressureFor, need } = rules;
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
  if (bodies.length === 0) return { at: collect(anchors), regime: 'held', spillDeg: 0 };
  const cusps = cleanSpokes(spokes);
  if (cusps.length > 0) return layOutHoused(rules, anchors, bodies, cusps, ringRadius, collect);

  // No codes on this ring: the bodies own the whole circle — one 360° arc, and it
  // gets its pressure worked out the same way an arc between two codes does.
  if (anchors.length === 0) {
    const t = pressureFor([...bodies, { ...bodies[0], off: bodies[0].off + 360 }], 360);
    relaxWidthAware(bodies, (a, b) => reqAt(a, b, t));
    return { at: collect(bodies), regime: 'held', spillDeg: 0 };
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
    const solved = layArc(rules, L, R, inArc);
    const pos = solved.pos;
    // More fell into this arc than it can hold even at the floor, AND the
    // proportional shrink took a gap below the ink two marks need to read as two
    // marks — a sliver between two codes that are themselves nearly conjunct, or a
    // stellium in one. Nothing local can fix that, so the whole ring gives.
    if (solved.tooTight) crowded = true;
    for (let k = 0; k < inArc.length; k++) inArc[k].off = pos[k];
  }

  if (!crowded) {
    return {
      at: collect([
        ...A.map((a) => ({ ...a, off: a.off + base })),
        ...B.map((b) => ({ ...b, off: b.off + base })),
      ]),
      regime: 'held',
      spillDeg: 0,
    };
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
  return { at: collect(all), regime: 'relaid', spillDeg: 0 };
}

/** One arc of the houses path: its walls, its bodies (offsets unwrapped in the arc's
 *  frame) and each body's box in that same frame. */
interface HousedArc {
  /** The code the arc starts from (its index in the rotated list). */
  i: number;
  L: Tagged;
  R: Tagged;
  inArc: Tagged[];
  boxLo: number[];
  boxHi: number[];
}

/** S3: one arc between its codes, against its bodies' houses — layArc's scan, with a
 *  house line the scan may not trade for comfort.
 *
 *  Each rung first runs the house-blind solve. Where that already leaves every body in
 *  its house it is the answer, bit for bit, so an arc whose houses were never in
 *  question is laid out exactly as it would be without them. Where it does not, the
 *  same arc is re-solved with the houses inside the pooling (pavConvex) and clamped to
 *  the walls — a common bound, so the clamp is exact. A rung then counts as acceptable
 *  only if it keeps the bodies in their houses as well as full pressure can
 *  (spill(t) ≤ spill(1)): a body pushed across a cusp for the sake of comfort is the
 *  failure this path exists to stop. Feasibility only grows with pressure (every gap
 *  shrinks), so the rungs that fail are a run at the bottom, and the scan's answer is
 *  the shallowest pressure past them that the ceiling also allows. The pressure still
 *  measures BODIES only: the codes are walls here, already placed. */
function layHousedArc(rules: RingRules, arc: HousedArc): ArcSolve & { spill: number } {
  const { L, R, inArc, boxLo, boxHi } = arc;
  const n = inArc.length;
  const solve = (t: number) => {
    const r = solveArc(rules, L, R, inArc, t);
    let inside = true;
    for (let k = 0; k < n && inside; k++) {
      if (r.pos[k] < boxLo[k] - IN_BOX_EPS || r.pos[k] > boxHi[k] + IN_BOX_EPS) inside = false;
    }
    if (inside) return { ...r, spill: spillOf(r.pos, boxLo, boxHi) };
    const y = pavConvex(
      inArc.map((m, k) => ({
        q: 1,
        t: m.off - r.cum[k],
        lo: boxLo[k] - r.cum[k],
        hi: boxHi[k] - r.cum[k],
        P: SPILL_COST,
      })),
    );
    const top = Math.max(r.hi, r.lo);
    const pos = y.map((v, k) => Math.min(Math.max(v, r.lo), top) + r.cum[k]);
    return { ...r, pos, spill: spillOf(pos, boxLo, boxHi) };
  };
  const full = solve(1);
  const worstPush = (p: number[]) =>
    p.reduce((w, v, k) => Math.max(w, Math.abs(v - inArc[k].off)), 0);
  const pressure = scanPressure((t) => {
    const r = t === 1 ? full : solve(t);
    return r.fits && r.spill <= full.spill + SPILL_EPS ? worstPush(r.pos) : Infinity;
  });
  return pressure === 1 ? full : solve(pressure);
}

/** S2: can every arc, at full pressure and with its codes on their axes, both fit and
 *  seat each body in its box? Box feasibility is O(n) in the substituted frame: each
 *  body's position less cum must lie in [a_k, b_k] (its box and the walls) AND ascend,
 *  which some arrangement satisfies iff the running max of the a's never passes the
 *  running min of the b's taken from the far end. */
function arcHolds(rules: RingRules, arc: HousedArc): boolean {
  const r = solveArc(rules, arc.L, arc.R, arc.inArc, 1);
  if (!r.fits) return false;
  const n = arc.inArc.length;
  const a: number[] = new Array(n);
  let run = -Infinity;
  for (let k = 0; k < n; k++) {
    run = Math.max(run, r.lo, arc.boxLo[k] - r.cum[k]);
    a[k] = run;
  }
  run = Infinity;
  for (let k = n - 1; k >= 0; k--) {
    run = Math.min(run, r.hi, arc.boxHi[k] - r.cum[k]);
    if (a[k] > run + IN_BOX_EPS) return false;
  }
  return true;
}

/** S2–S4 of layOutRing: the ring with its houses. `cusps` sorted, non-empty. */
function layOutHoused(
  rules: RingRules,
  anchors: Tagged[],
  bodies: Tagged[],
  cusps: number[],
  ringRadius: number,
  collect: (marks: RingMark[]) => Map<string, number>,
): RingLayout {
  const { reqAt } = rules;

  // S4 — no codes: the ring is one arc, and every rung is a ring-wide solve. The
  // house-blind path relaxes this ring with a forward-and-back pass that is not least
  // squares; mixing the two at the moment a body first touched its cusp would be a
  // seam on resize, so the houses path solves the whole range one way.
  if (anchors.length === 0) {
    const ring = bodies
      .map((b) => ({ ...b, off: norm360(b.off) }))
      .sort((x, y) => x.off - y.off);
    const n = ring.length;
    const boxes = houseBoxes(ring, cusps, ringRadius);
    const marks: CircleMark[] = ring.map((b, k) => ({ z: b.off, code: false, box: boxes[k] }));
    const boxLo = ring.map((b, k) => b.off + boxes[k].lo);
    const boxHi = ring.map((b, k) => b.off + boxes[k].hi);
    const gapsAt = (t: number) =>
      n === 1 ? [0] : ring.map((b, j) => reqAt(b, ring[(j + 1) % n], t));
    const sum = (g: number[]) => g.reduce((x, y) => x + y, 0);
    const solve = (t: number) => {
      const g = gapsAt(t);
      if (sum(g) > 360 * RING_FILL) return null;
      const pos = solveCircle(marks, g);
      return { pos, spill: spillOf(pos, boxLo, boxHi) };
    };
    const done = (pos: number[], regime: RingRegime) => ({
      at: collect(ring.map((b, k) => ({ ...b, off: pos[k] }))),
      regime,
      spillDeg: spillOf(pos, boxLo, boxHi),
    });
    const full = solve(1);
    if (!full) {
      const g = gapsAt(1);
      const f = (360 * RING_FILL) / sum(g);
      return done(solveCircle(marks, g.map((x) => x * f)), 'relaid');
    }
    const worstPush = (p: number[]) =>
      p.reduce((w, v, k) => Math.max(w, Math.abs(v - ring[k].off)), 0);
    const pressure = scanPressure((t) => {
      const r = t === 1 ? full : solve(t);
      return r && r.spill <= full.spill + SPILL_EPS ? worstPush(r.pos) : Infinity;
    });
    return done((pressure === 1 ? full : solve(pressure) ?? full).pos, 'held');
  }

  // The same rotated frame and the same arcs as the house-blind path, so that a ring
  // whose houses are never in question takes exactly the house-blind steps.
  const base = anchors[0].off;
  const rot = (deg: number) => (((deg - base) % 360) + 360) % 360;
  const A = anchors.map((a) => ({ ...a, off: rot(a.off) }));
  A[0].off = 0; // exact, against float drift in rot()
  const B = bodies.map((b) => ({ ...b, off: rot(b.off) })).sort((x, y) => x.off - y.off);
  const boxes = houseBoxes(
    B.map((b) => ({ ...b, off: b.off + base })),
    cusps,
    ringRadius,
  );
  const boxOf = new Map<Tagged, HouseBox>(B.map((b, k) => [b, boxes[k]]));
  // Arc i runs from code i to code i + 1; members by degree, as the house-blind path
  // assigns them. The membership is the ORDER round the ring, and nothing below changes
  // it — a body never crosses a code.
  const members: Tagged[][] = A.map(() => []);
  {
    let bi = 0;
    for (let i = 0; i < A.length; i++) {
      const Roff = i + 1 < A.length ? A[i + 1].off : 360;
      while (bi < B.length && B[bi].off < Roff) members[i].push(B[bi++]);
    }
  }
  const arcsAt = (wall: (i: number) => number): HousedArc[] => {
    const out: HousedArc[] = [];
    for (let i = 0; i < A.length; i++) {
      const inArc = members[i];
      if (inArc.length === 0) continue;
      out.push({
        i,
        L: { ...A[i], off: wall(i) },
        R: i + 1 < A.length ? { ...A[i + 1], off: wall(i + 1) } : { ...A[0], off: wall(0) + 360 },
        inArc,
        boxLo: inArc.map((b) => b.off + boxOf.get(b)!.lo),
        boxHi: inArc.map((b) => b.off + boxOf.get(b)!.hi),
      });
    }
    return out;
  };
  const finish = (walls: number[], arcs: HousedArc[], placed: number[][], regime: RingRegime, spill: number) => {
    const at = new Map<Tagged, number>();
    arcs.forEach((arc, j) => arc.inArc.forEach((b, k) => at.set(b, placed[j][k])));
    return {
      at: collect([
        ...A.map((a, i) => ({ ...a, off: walls[i] + base })),
        ...B.map((b) => ({ ...b, off: at.get(b)! + base })),
      ]),
      regime,
      spillDeg: spill,
    };
  };
  const layArcs = (walls: number[], regime: RingRegime) => {
    const arcs = arcsAt((i) => walls[i]);
    const placed: number[][] = [];
    let spill = 0;
    for (const arc of arcs) {
      const r = layHousedArc(rules, arc);
      if (r.tooTight) return null;
      placed.push(r.pos);
      spill += r.spill;
    }
    return finish(walls, arcs, placed, regime, spill);
  };

  // S2, the fast path: every arc can keep its codes on their axes.
  const onAxis = A.map((a) => a.off);
  if (arcsAt((i) => onAxis[i]).every((arc) => arcHolds(rules, arc))) {
    // Cannot be tooTight: every arc fits at full pressure, and the scan never settles
    // on a pressure that does not fit.
    const held = layArcs(onAxis, 'held');
    if (held) return held;
  }

  // S2, the ring-wide solve: codes and bodies together, in their order round the ring.
  const ring: { mark: Tagged; cm: CircleMark }[] = [];
  for (let i = 0; i < A.length; i++) {
    ring.push({ mark: A[i], cm: { z: A[i].off, code: true } });
    for (const b of members[i]) ring.push({ mark: b, cm: { z: b.off, code: false, box: boxOf.get(b) } });
  }
  const n = ring.length;
  const gaps = ring.map((e, j) => reqAt(e.mark, ring[(j + 1) % n].mark, 1));
  const total = gaps.reduce((x, y) => x + y, 0);
  const packed = total > 360 * RING_FILL;
  const x = solveCircle(
    ring.map((e) => e.cm),
    packed ? gaps.map((g) => (g * 360 * RING_FILL) / total) : gaps,
  );
  // A code that did not need to move is put back EXACTLY on its axis: the solve lands
  // there to within the last few bits, and "on its axis" is a promise kept to the bit.
  const walls: number[] = [];
  const bodyAt: number[][] = A.map(() => []);
  {
    let i = -1;
    ring.forEach((e, j) => {
      if (e.cm.code) {
        i += 1;
        walls.push(Math.abs(x[j] - e.cm.z) <= 1e-9 ? e.cm.z : x[j]);
      } else {
        bodyAt[i].push(x[j]);
      }
    });
  }
  const relaid = () => {
    const arcs = arcsAt((i) => walls[i]);
    const placed = arcs.map((arc) => bodyAt[arc.i]);
    let spill = 0;
    arcs.forEach((arc, j) => (spill += spillOf(placed[j], arc.boxLo, arc.boxHi)));
    return finish(walls, arcs, placed, 'relaid', spill);
  };
  // Too full to seat at all: the shrunk solve is the answer, and the codes took their
  // chances in it, as they do in the house-blind re-lay.
  if (packed) return relaid();
  // S3 between the codes where S2 left them. Cannot be tooTight either — S2 seated every
  // gap at full pressure — but if it ever were, S2's own answer stands.
  return layArcs(walls, 'yielded') ?? relaid();
}

/** Lay movable marks out on a ring around fixed ones — layOutRing's positions alone,
 *  which is all a renderer needs. With `spokes` the bodies are kept in their houses;
 *  without them (undefined or empty) the layout is exactly what it was before houses
 *  existed here.
 *
 *  Returns display offsets in degrees, keyed by name — fixed marks included, so one
 *  lookup serves both sets. */
export function placeOnRing(
  fixed: RingMark[],
  movable: RingMark[],
  minSep: number,
  ringRadius: number,
  overlap: number = 0,
  spokes?: readonly number[],
): Map<string, number> {
  return layOutRing(fixed, movable, minSep, ringRadius, overlap, spokes).at;
}
