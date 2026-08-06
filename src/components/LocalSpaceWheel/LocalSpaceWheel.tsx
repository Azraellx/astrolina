// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import './LocalSpaceWheel.css';
import {
  WheelTip,
  type Aspect,
  type AspectCategory,
  type HoverTip,
} from '../Wheel/WheelSvg';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import {
  PLANET_COLORS,
  type EclipticPosition,
  type PlanetName,
} from '../../lib/ephemeris';
import { useT } from '../../i18n';
import { fmtDM } from '../../lib/astro/format';

const DEG2RAD = Math.PI / 180;

// Shared camera. Yaw spins the globe about the vertical (zenith) axis; pitch tilts
// it about the screen-horizontal axis. Both dials of the pair read one of these so
// they stay aligned for comparison.
export interface LsView {
  yaw: number;
  pitch: number;
}
// Default vantage: North centred, tilted ~25° so the zenith leans toward the viewer
// (looking down onto the sky dome), most bodies on the near hemisphere.
export const LS_DEFAULT_VIEW: LsView = { yaw: 0, pitch: -25 };

// Shared state lives in tiny external stores rather than sidebar React state:
// updates are imperative and only the subscribed globes re-render, not the whole
// (heavy) sidebar. Both dials of the pair take the same stores, so they stay locked
// to one orientation AND one hovered body.
export interface Store<T> {
  get: () => T;
  subscribe: (listener: () => void) => () => void;
  set: (v: T) => void;
}
function useStore<T>(initial: T): Store<T> {
  const ref = useRef<T>(initial);
  const listeners = useRef<Set<() => void> | null>(null);
  if (listeners.current === null) listeners.current = new Set();
  return useMemo(
    () => ({
      get: () => ref.current,
      subscribe: (l: () => void) => {
        listeners.current!.add(l);
        return () => {
          listeners.current!.delete(l);
        };
      },
      set: (v: T) => {
        ref.current = v;
        listeners.current!.forEach((l) => l());
      },
    }),
    [],
  );
}
// Shared camera (both globes rotate together) and shared hovered body (hovering a
// glyph lights the same body's tip on the sibling globe too).
export const useLocalSpaceView = () => useStore<LsView>(LS_DEFAULT_VIEW);
export const useLocalSpaceHover = () => useStore<PlanetName | null>(null);
const PITCH_LIMIT = 85; // clamp so the globe never flips past its poles
const ROT_PER_PX = 0.5; // drag sensitivity (degrees per pixel)

const CARDINALS: { az: number; letter: string }[] = [
  { az: 0, letter: 'N' },
  { az: 90, letter: 'E' },
  { az: 180, letter: 'S' },
  { az: 270, letter: 'W' },
];
// Graticule: meridians every 30° of azimuth, parallels every 30° of altitude
// (the horizon, alt 0, drawn heavier as the equator). Kept sparse so the small
// paired globes don't read as a ball of wire.
const MERIDIAN_AZ = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const PARALLEL_ALT = [-60, -30, 0, 30, 60];
// Azimuth degree labels on the 30° marks (cardinals show N/E/S/W in their place).
const DEG_MARKS = [30, 60, 120, 150, 210, 240, 300, 330];

type Vec3 = { x: number; y: number; z: number };

// (az, alt) in degrees → unit vector: east (+x), north (+y), up (+z). Same axis
// convention as the old flat dial (x grows with sin az, y with cos az).
function horizToVec(azDeg: number, altDeg: number): Vec3 {
  const az = azDeg * DEG2RAD;
  const alt = altDeg * DEG2RAD;
  const ca = Math.cos(alt);
  return { x: ca * Math.sin(az), y: ca * Math.cos(az), z: Math.sin(alt) };
}

// Rotate a world vector by the camera: yaw about the up axis (z), then pitch about
// the east axis (x). The viewer then looks along −y, so the rotated y is depth.
function rotate(v: Vec3, yawDeg: number, pitchDeg: number): Vec3 {
  const cy = Math.cos(yawDeg * DEG2RAD);
  const sy = Math.sin(yawDeg * DEG2RAD);
  const x1 = v.x * cy - v.y * sy;
  const y1 = v.x * sy + v.y * cy;
  const z1 = v.z;
  const cp = Math.cos(pitchDeg * DEG2RAD);
  const sp = Math.sin(pitchDeg * DEG2RAD);
  return { x: x1, y: y1 * cp - z1 * sp, z: y1 * sp + z1 * cp };
}

const clampN = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

// Degrees → "DD°MM'" for the hover tip's azimuth/altitude readout. It moved to
// lib/astro/format (beside lonToZodiac, the other coordinate formatter) once the
// zodiac wheel needed it too: the wheel is what this module imports its own tip
// chrome FROM, so importing back would have closed a cycle. Re-exported here so
// the compass sibling and the readout surfaces keep their existing import.
export { fmtDM };

type SP = { sx: number; sy: number; depth: number };

// Split a projected polyline into contiguous front (depth ≥ 0) / back runs, so the
// near arc draws solid and the far arc faint without a chord jumping across the
// globe. The crossing point is duplicated into both runs so the halves meet.
function splitRuns(pts: SP[]): { front: boolean; pts: SP[] }[] {
  const runs: { front: boolean; pts: SP[] }[] = [];
  let cur: { front: boolean; pts: SP[] } | null = null;
  for (const p of pts) {
    const front = p.depth >= 0;
    if (!cur || cur.front !== front) {
      if (cur) cur.pts.push(p);
      cur = { front, pts: [] };
      runs.push(cur);
    }
    cur.pts.push(p);
  }
  return runs;
}

interface LocalSpaceWheelProps {
  size: number;
  /** Bodies to plot (order + names; positions come from `coords`). */
  planets: EclipticPosition[];
  /** Per-body azimuth/altitude in degrees; az clockwise from north. Bodies
   *  without an entry are skipped. */
  coords: ReadonlyMap<PlanetName, { az: number; alt: number }>;
  /** Azimuth aspects, drawn as chords between the two bodies on the globe. */
  aspects?: Aspect[];
  visibleAspects?: Set<AspectCategory>;
  /** Shared camera store (both dials of the pair pass the same one) — drag on
   *  either globe rotates both, without re-rendering the sidebar. */
  viewStore: Store<LsView>;
  /** Shared hovered-body store — hovering a glyph lights the same body's tip on the
   *  sibling globe too. */
  hoverStore: Store<PlanetName | null>;
}

// Horizon-frame GLOBE for the wheel sidebar: a hand-rolled orthographic sphere (no
// WebGL) centred on the local-space origin. Azimuth runs around it, altitude up it
// — the horizon is the equator, the zenith/nadir the poles — so both coordinates
// read directly as position on the ball. Drag (mouse or touch) spins it; both dials
// of the natal/relocated pair share one camera. The planet marks are the zodiac
// wheel's own (wheel-svg classes + WheelTip), so discs, hover lift, and the az/alt
// hover tag match the other wheels; bodies on the far side dim, below-horizon bodies
// keep the dotted disc.
export function LocalSpaceWheel({
  size,
  planets,
  coords,
  aspects,
  visibleAspects,
  viewStore,
  hoverStore,
}: LocalSpaceWheelProps) {
  const { t, labels } = useT();
  const view = useSyncExternalStore(viewStore.subscribe, viewStore.get);
  const hovered = useSyncExternalStore(hoverStore.subscribe, hoverStore.get);
  const [dragging, setDragging] = useState(false);

  // Drag: record the orientation + pointer at grab, then set absolute angles from
  // the cumulative delta (stable even as `view` updates mid-drag). rAF coalesces to
  // one commit per frame so a fast spin doesn't thrash React (MapOverlayHost idiom).
  const dragRef = useRef<{ x: number; y: number } & LsView>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<LsView | null>(null);
  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch };
    setDragging(true);
    hoverStore.set(null);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    pendingRef.current = {
      yaw: d.yaw + (e.clientX - d.x) * ROT_PER_PX,
      pitch: clampN(d.pitch - (e.clientY - d.y) * ROT_PER_PX, -PITCH_LIMIT, PITCH_LIMIT),
    };
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (pendingRef.current) viewStore.set(pendingRef.current);
      });
    }
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    dragRef.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // Fixed-pixel metrics scale with the dial so the paired ~half-width globes read
  // like a full one; tuned around a ~300px globe, clamped at both ends.
  const k = Math.max(0.62, Math.min(1.55, size / 300));
  const c = size / 2;
  const Rs = size / 2 - 18 * k; // sphere radius; labels float just outside it

  const project = (v: Vec3, r = Rs): SP => ({
    sx: c + r * v.x,
    sy: c - r * v.z,
    depth: v.y,
  });
  const rp = (azDeg: number, altDeg: number, r?: number) =>
    project(rotate(horizToVec(azDeg, altDeg), view.yaw, view.pitch), r);

  // Sample a grid line (a run of world vectors) and emit front/back polylines.
  const gridLine = (
    samples: Vec3[],
    frontCls: string,
    backCls: string,
    key: string,
  ) =>
    splitRuns(samples.map((v) => project(rotate(v, view.yaw, view.pitch)))).map(
      (run, i) => (
        <polyline
          key={`${key}-${i}`}
          className={run.front ? frontCls : backCls}
          points={run.pts.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' ')}
        />
      ),
    );

  const shown = planets.filter((p) => coords.has(p.name));
  const marks = shown.map((p) => {
    const cd = coords.get(p.name)!;
    return { name: p.name, az: cd.az, alt: cd.alt, below: cd.alt < 0, ...rp(cd.az, cd.alt) };
  });
  const markByName = new Map(marks.map((m) => [m.name, m] as const));
  // Painter's order: far bodies first so near ones draw over them.
  const sortedMarks = [...marks].sort((a, b) => a.depth - b.depth);

  const chords = (aspects ?? []).filter(
    (a) =>
      a.type !== 'conjunction' &&
      (visibleAspects?.has(a.category) ?? true) &&
      markByName.has(a.a as PlanetName) &&
      markByName.has(a.b as PlanetName),
  );

  const gradId = `lsw-grad-${useId().replace(/:/g, '')}`;

  // The tip follows the SHARED hovered body: hovering a glyph on either globe lights
  // that body's tip on both. Each globe places it at its own projected spot and
  // quotes its own az/alt, split onto two fixed lines so the tip never reflows.
  const hoveredMark = hovered ? markByName.get(hovered) : undefined;
  const tip: HoverTip | null =
    hoveredMark && !dragging
      ? {
          x: hoveredMark.sx,
          y: hoveredMark.sy,
          r: 11 * k,
          title: labels.planet(hoveredMark.name),
          sub: (
            <>
              {t('expandedSidebar.localSpace.azTip', { az: fmtDM(hoveredMark.az) })}
              <br />
              {t('expandedSidebar.localSpace.altTip', { alt: fmtDM(hoveredMark.alt, true) })}
            </>
          ),
          color: PLANET_COLORS[hoveredMark.name],
          marker: (
            <PlanetGlyph
              planet={hoveredMark.name}
              size={14}
              color={PLANET_COLORS[hoveredMark.name]}
            />
          ),
        }
      : null;

  const svg = (
    <svg
      // wheel-svg + interactive borrow the zodiac wheel's planet-mark styling
      // (disc fill, hit target, hover lift) so the marks match exactly.
      className={`local-space-wheel wheel-svg interactive${dragging ? ' lsw-dragging' : ''}`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={t('expandedSidebar.localSpace.dragHint')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => viewStore.set(LS_DEFAULT_VIEW)}
    >
      <defs>
        <radialGradient id={gradId} cx="38%" cy="32%" r="75%">
          <stop offset="0%" className="lsw-globe-hi" />
          <stop offset="100%" className="lsw-globe-lo" />
        </radialGradient>
      </defs>

      {/* The sphere body: a shaded disc (lit upper-left) so the wireframe reads as a
          ball, plus a rim to sharpen the silhouette. */}
      <circle cx={c} cy={c} r={Rs} fill={`url(#${gradId})`} />

      {/* Graticule: meridians (constant azimuth) + parallels (constant altitude),
          each split into a solid near arc and a faint far arc. */}
      {MERIDIAN_AZ.flatMap((az) => {
        const s: Vec3[] = [];
        for (let a = -90; a <= 90; a += 10) s.push(horizToVec(az, a));
        return gridLine(s, 'lsw-grid', 'lsw-grid-back', `mer-${az}`);
      })}
      {PARALLEL_ALT.flatMap((alt) => {
        const s: Vec3[] = [];
        for (let z = 0; z <= 360; z += 15) s.push(horizToVec(z, alt));
        const horizon = alt === 0;
        return gridLine(
          s,
          horizon ? 'lsw-grid-horizon' : 'lsw-grid',
          horizon ? 'lsw-grid-horizon-back' : 'lsw-grid-back',
          `par-${alt}`,
        );
      })}
      <circle cx={c} cy={c} r={Rs} className="lsw-globe-rim" />

      {/* Cardinals on the horizon + the zenith, floated just off the surface;
          hidden when they swing to the far side. */}
      {CARDINALS.map(({ az, letter }) => {
        const p = rp(az, 0, Rs * 1.07);
        if (p.depth < 0) return null;
        return (
          <text
            key={letter}
            x={p.sx}
            y={p.sy}
            className="lsw-card"
            style={{ fontSize: 13 * k }}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {letter}
          </text>
        );
      })}
      {(() => {
        const p = rp(0, 90, Rs * 1.07);
        if (p.depth < -0.15) return null;
        return (
          <text
            x={p.sx}
            y={p.sy}
            className="lsw-card"
            style={{ fontSize: 10.5 * k }}
            textAnchor="middle"
            dominantBaseline="central"
          >
            Z
          </text>
        );
      })()}

      {/* Azimuth degrees on the 30° marks (geographic: 0° = N, clockwise), front
          face only so they stay legible as the globe turns. */}
      {DEG_MARKS.map((az) => {
        const p = rp(az, 0, Rs * 1.11);
        if (p.depth < 0.05) return null;
        return (
          <text
            key={az}
            x={p.sx}
            y={p.sy}
            className="lsw-deg"
            style={{ fontSize: 8.5 * k }}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {az}
          </text>
        );
      })}

      {chords.map((a, i) => {
        const p1 = markByName.get(a.a as PlanetName)!;
        const p2 = markByName.get(a.b as PlanetName)!;
        const bothFront = p1.depth >= 0 && p2.depth >= 0;
        return (
          <line
            key={`chord-${i}`}
            x1={p1.sx}
            y1={p1.sy}
            x2={p2.sx}
            y2={p2.sy}
            stroke={a.color}
            strokeWidth={k}
            opacity={bothFront ? 0.7 : 0.22}
          />
        );
      })}

      {sortedMarks.map((m) => {
        const r = 11 * k; // the detailed zodiac wheel's disc radius
        // Far side dims (behind the ball); below-horizon dims a touch and goes
        // dotted (its glyph on the "negative track"). Both compound.
        const opacity = (m.depth < 0 ? 0.4 : 1) * (m.below ? 0.72 : 1);
        return (
          <g
            key={m.name}
            className="planet-mark"
            opacity={opacity}
            // Set the SHARED hovered body so both globes light this body's tip. Clear
            // only if we're still the hovered one (guards the leave-then-enter order
            // when sliding between adjacent glyphs).
            onMouseEnter={() => hoverStore.set(m.name)}
            onMouseLeave={() => {
              if (hoverStore.get() === m.name) hoverStore.set(null);
            }}
            aria-label={labels.planet(m.name)}
          >
            <circle cx={m.sx} cy={m.sy} r={r + 6 * k} className="planet-hit" />
            <g className="planet-mark-visual">
              <circle
                cx={m.sx}
                cy={m.sy}
                r={r}
                className="planet-disc-fill"
                stroke={PLANET_COLORS[m.name]}
                strokeWidth={1.3 * k}
                strokeDasharray={m.below ? '2 1.5' : undefined}
              />
              <PlanetGlyph
                planet={m.name}
                x={m.sx}
                y={m.sy}
                size={16 * k}
                color={PLANET_COLORS[m.name]}
              />
            </g>
          </g>
        );
      })}
    </svg>
  );

  // Same wrap as the zodiac wheel: the hint tag is an absolutely-positioned HTML
  // sibling over the SVG (user units map 1:1 to px).
  return (
    <div className="wheel-svg-wrap">
      {svg}
      {tip && <WheelTip tip={tip} size={size} />}
    </div>
  );
}
