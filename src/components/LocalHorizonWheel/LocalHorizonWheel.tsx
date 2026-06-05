// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import './LocalHorizonWheel.css';

interface Props {
  // Screen position of the local-space origin (the dial's centre) + full diameter
  // (px). `scale` shrinks/grows the whole dial uniformly (a transform, so the
  // fixed-px rim labels scale with it); `opacity` fades it in.
  cx: number;
  cy: number;
  size: number;
  scale: number;
  opacity: number;
  /** On-screen rotation (deg) of north at the origin — 0 in 2D, non-zero on a
   *  rotated/tilted globe — so the dial stays aligned with the lines. */
  bearing: number;
}

const RAD = Math.PI / 180;
const CARDINAL: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
const TICKS = Array.from({ length: 24 }, (_, i) => i); // notches every 15°
const CARD_RADIUS = 49;
// The degree scale sits just outside the ring, near the cardinal letters.
const DEG_RADIUS = 48;

// Local-horizon compass, centred on the local-space origin so the lines radiate
// straight through it and each one's azimuth reads off the dial. Transparent (just
// the compass — no panel), so the map and lines show through. North is up.
export function LocalHorizonWheel({
  cx,
  cy,
  size,
  scale,
  opacity,
  bearing,
}: Props) {
  return (
    <div
      className="local-horizon-wheel"
      style={{
        left: cx,
        top: cy,
        width: size,
        height: size,
        transform: `translate(-50%, -50%) rotate(${bearing}deg) scale(${scale})`,
        opacity,
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" className="lhw-svg">
        <circle cx="50" cy="50" r="45" className="lhw-disc" />
        <circle cx="50" cy="50" r="45" className="lhw-ring" />
        <circle cx="50" cy="50" r="30" className="lhw-ring-inner" />
        {TICKS.map((i) => {
          const a = i * 15 * RAD;
          const card = i % 6 === 0;
          const half = i % 2 === 0;
          const r1 = card ? 38 : half ? 41 : 43;
          return (
            <line
              key={i}
              x1={50 + r1 * Math.sin(a)}
              y1={50 - r1 * Math.cos(a)}
              x2={50 + 45 * Math.sin(a)}
              y2={50 - 45 * Math.cos(a)}
              className={card ? 'lhw-tick-major' : 'lhw-tick'}
            />
          );
        })}
        <line x1="50" y1="7" x2="50" y2="93" className="lhw-axis" />
        <line x1="7" y1="50" x2="93" y2="50" className="lhw-axis" />
        <circle cx="50" cy="50" r="1.2" className="lhw-center" />
      </svg>

      {/* Cardinal letters, just outside the ring. */}
      {Object.entries(CARDINAL).map(([degStr, letter]) => {
        const a = Number(degStr) * RAD;
        const x = 50 + CARD_RADIUS * Math.sin(a);
        const y = 50 - CARD_RADIUS * Math.cos(a);
        return (
          <span
            key={letter}
            className="lhw-card"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            {letter}
          </span>
        );
      })}

      {/* Degree numbers on the 30° notches only (the 15° ones were too small to
          read, so they're dropped). The cardinals show N/E/S/W instead. Each notch
          sits at its geographic position (clockwise from north) but is LABELLED in
          the local-space convention: East = 0°, North = 90° (counter-clockwise from
          east), so the numbers run 0 at E up to 90 at N. */}
      {TICKS.map((i) => {
        if (i % 6 === 0 || i % 2 !== 0) return null;
        const azN = i * 15; // geographic position, clockwise from north
        const a = azN * RAD;
        const x = 50 + DEG_RADIUS * Math.sin(a);
        const y = 50 - DEG_RADIUS * Math.cos(a);
        const label = (90 - azN + 360) % 360; // East = 0°, North = 90°
        return (
          <span
            key={azN}
            className="lhw-deg lhw-deg-med"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
