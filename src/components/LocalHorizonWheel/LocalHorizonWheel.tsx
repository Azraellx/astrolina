import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import type { PlanetName } from '../../lib/ephemeris';
import './LocalHorizonWheel.css';

// One body's compass bearing from the local-space origin (the same azimuths that
// drive the LS lines/labels), for plotting around the horizon dial.
export interface HorizonPlanet {
  planet: PlanetName;
  azimuth: number; // degrees clockwise from north
  color: string;
}

interface Props {
  // Screen position of the local-space origin (the dial's centre) + full diameter
  // (px). `scale` shrinks/grows the whole dial uniformly (a transform, so the
  // fixed-px rim labels scale with it); `opacity` fades it in.
  cx: number;
  cy: number;
  size: number;
  scale: number;
  opacity: number;
  planets: HorizonPlanet[];
}

const RAD = Math.PI / 180;
const CARDINAL: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
const TICKS = Array.from({ length: 24 }, (_, i) => i); // notches every 15°
// N/E/S/W sit just outside the ring; the degree numbers sit inside the dial.
const CARD_RADIUS = 49;
const DEG_RADIUS = 36;

// Local-horizon compass, centred on the local-space origin so the lines radiate
// straight through it and each one's azimuth reads off the dial. Transparent (just
// the compass — no panel), so the map and lines show through. North is up.
export function LocalHorizonWheel({
  cx,
  cy,
  size,
  scale,
  opacity,
  planets,
}: Props) {
  return (
    <div
      className="local-horizon-wheel"
      style={{
        left: cx,
        top: cy,
        width: size,
        height: size,
        transform: `translate(-50%, -50%) scale(${scale})`,
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

      {/* Degree numbers, one per notch, inside the dial — bigger on the 30° notches,
          smaller/quieter on the 15° notches. The cardinals show N/E/S/W instead. */}
      {TICKS.map((i) => {
        if (i % 6 === 0) return null;
        const deg = i * 15;
        const a = deg * RAD;
        const x = 50 + DEG_RADIUS * Math.sin(a);
        const y = 50 - DEG_RADIUS * Math.cos(a);
        return (
          <span
            key={deg}
            className={`lhw-deg ${i % 2 === 0 ? 'lhw-deg-med' : 'lhw-deg-min'}`}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            {deg}
          </span>
        );
      })}

      {planets.map((p) => {
        const a = p.azimuth * RAD;
        const x = 50 + 38 * Math.sin(a);
        const y = 50 - 38 * Math.cos(a);
        return (
          <span
            key={p.planet}
            className="lhw-planet"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <PlanetGlyph planet={p.planet} size={13} color={p.color} />
          </span>
        );
      })}
    </div>
  );
}
