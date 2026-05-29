import {
  PLANET_CODES,
  PLANET_COLORS,
  type EclipticPosition,
  type RelocatedAngles,
} from '../../lib/ephemeris';
import { PlanetGlyph } from '../PlanetGlyph/PlanetGlyph';
import { ZodiacGlyph } from '../ZodiacGlyph/ZodiacGlyph';
import './WheelSvg.css';

export const SIGNS = [
  'Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir',
  'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis',
];

export type AspectCategory = 'harmonious' | 'hard' | 'conjunction';

export function fmtLon(lonRad: number): string {
  const lonDeg = ((lonRad * 180) / Math.PI + 360) % 360;
  const sign = SIGNS[Math.floor(lonDeg / 30)];
  const inSign = lonDeg % 30;
  const deg = Math.floor(inSign);
  const min = Math.floor((inSign - deg) * 60);
  return `${deg}°${String(min).padStart(2, '0')}' ${sign}`;
}

interface Aspect {
  a: string;
  b: string;
  type: string;
  category: AspectCategory;
  color: string;
  orb: number;
  lonA: number;
  lonB: number;
}

const ASPECT_TYPES: {
  name: string;
  angle: number;
  orb: number;
  color: string;
  category: AspectCategory;
}[] = [
  { name: 'conjunction', angle: 0,   orb: 8, color: '#f5b83d', category: 'conjunction' },
  { name: 'opposition',  angle: 180, orb: 8, color: '#e85a4f', category: 'hard' },
  { name: 'trine',       angle: 120, orb: 8, color: '#5ec2e0', category: 'harmonious' },
  { name: 'square',      angle: 90,  orb: 7, color: '#e85a4f', category: 'hard' },
  { name: 'sextile',     angle: 60,  orb: 4, color: '#5ec2e0', category: 'harmonious' },
];

export function computeAspects(planets: EclipticPosition[]): Aspect[] {
  const out: Aspect[] = [];
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const a = planets[i];
      const b = planets[j];
      let diff = Math.abs(((a.lon - b.lon) * 180) / Math.PI);
      if (diff > 180) diff = 360 - diff;
      for (const t of ASPECT_TYPES) {
        const orb = Math.abs(diff - t.angle);
        if (orb <= t.orb) {
          out.push({
            a: a.name,
            b: b.name,
            type: t.name,
            category: t.category,
            color: t.color,
            orb,
            lonA: a.lon,
            lonB: b.lon,
          });
          break;
        }
      }
    }
  }
  return out;
}

function svgPos(
  lonRad: number,
  ascRad: number,
  r: number,
  cx: number,
  cy: number,
) {
  const theta = Math.PI - (lonRad - ascRad);
  return { x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) };
}

interface WheelSvgProps {
  size: number;
  angles: RelocatedAngles;
  planets: EclipticPosition[];
  detailed: boolean;
  visibleAspects?: Set<AspectCategory>;
}

export function WheelSvg({
  size,
  angles,
  planets,
  detailed,
  visibleAspects,
}: WheelSvgProps) {
  const cx = size / 2;
  const cy = size / 2;
  // Detailed mode reserves 64px on each side so the angle-degree labels
  // (~55px wide for strings like "29°59' Sco") stay inside the SVG box while
  // keeping the empty margin around the wheel tight.
  const rOuter = size / 2 - (detailed ? 64 : 4);
  const rZodiacInner = rOuter - (detailed ? 34 : 0);
  // Planet glyph ring, then a readout ring (degree · sign · minute) just
  // inside it — mirroring a printed natal chart.
  const rPlanets = (detailed ? rZodiacInner - 20 : rOuter - 26);
  const rReadout = detailed ? rPlanets - 34 : 0;
  const rPlanetRingInner = detailed ? Math.max(10, rReadout - 26) : 0;
  const rAspectRing = detailed ? rPlanetRingInner - 2 : rPlanets - 22;
  const rInner = detailed ? rAspectRing : rPlanets - 22;
  const showReadouts = detailed && rReadout > 30;

  const aspects = detailed ? computeAspects(planets) : [];
  const filteredAspects = visibleAspects
    ? aspects.filter((a) => visibleAspects.has(a.category))
    : aspects;

  // Spread overlapping planets along the ring so their glyphs and readouts
  // don't collide; the true position is still marked by a tick on the zodiac
  // band. Aspect lines keep using the true longitudes.
  const displayLon = new Map<string, number>();
  if (detailed) {
    const arr = planets.map((p) => ({
      name: p.name,
      off: ((((p.lon - angles.asc) * 180) / Math.PI) % 360 + 360) % 360,
    }));
    arr.sort((a, b) => a.off - b.off);
    // Min angular separation that yields ~16px of arc at the readout ring.
    const sep = Math.min(
      20,
      Math.max(4, (16 * 360) / (2 * Math.PI * Math.max(rReadout, 1))),
    );
    for (let i = 1; i < arr.length; i++) {
      if (arr[i].off - arr[i - 1].off < sep) arr[i].off = arr[i - 1].off + sep;
    }
    for (let i = arr.length - 2; i >= 0; i--) {
      if (arr[i + 1].off - arr[i].off < sep) arr[i].off = arr[i + 1].off - sep;
    }
    for (const e of arr) {
      displayLon.set(e.name, angles.asc + (e.off * Math.PI) / 180);
    }
  }
  const lonFor = (p: EclipticPosition) => displayLon.get(p.name) ?? p.lon;

  return (
    <svg
      className="wheel-svg"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      {/* Zodiac band fill — a thick-stroked circle that paints the band
          between rOuter and rZodiacInner with a faint accent tint. */}
      {detailed && (
        <circle
          cx={cx}
          cy={cy}
          r={(rOuter + rZodiacInner) / 2}
          fill="none"
          stroke="rgba(var(--accent-rgb), 0.05)"
          strokeWidth={rOuter - rZodiacInner}
        />
      )}

      {/* Concentric ring boundaries */}
      <circle cx={cx} cy={cy} r={rOuter} className="ring" />
      {detailed && <circle cx={cx} cy={cy} r={rZodiacInner} className="ring" />}
      {detailed && (
        <circle cx={cx} cy={cy} r={rPlanetRingInner} className="ring" />
      )}
      <circle cx={cx} cy={cy} r={rInner} className="ring" />

      {detailed &&
        Array.from({ length: 12 }).map((_, i) => {
          const lon = (i * 30 * Math.PI) / 180;
          const inner = svgPos(lon, angles.asc, rZodiacInner, cx, cy);
          const outer = svgPos(lon, angles.asc, rOuter, cx, cy);
          return (
            <line
              key={`div-${i}`}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              className="sign-divider"
            />
          );
        })}

      {detailed &&
        Array.from({ length: 12 }).map((_, i) => {
          const lon = ((i * 30 + 15) * Math.PI) / 180;
          const rMid = (rZodiacInner + rOuter) / 2;
          const pos = svgPos(lon, angles.asc, rMid, cx, cy);
          return (
            <ZodiacGlyph
              key={`sign-${i}`}
              sign={i}
              x={pos.x}
              y={pos.y}
              size={22}
            />
          );
        })}

      <line
        x1={cx - rOuter}
        y1={cy}
        x2={cx + rOuter}
        y2={cy}
        className="angle asc-dsc"
      />
      <line
        x1={cx}
        y1={cy - rOuter}
        x2={cx}
        y2={cy + rOuter}
        className="angle mc-ic"
      />

      {!detailed && (
        <>
          <text x={6} y={cy - 4} className="angle-label">ASC</text>
          <text x={6} y={cy + 12} className="angle-degree">{fmtLon(angles.asc)}</text>
          <text x={size - 6} y={cy - 4} textAnchor="end" className="angle-label">DSC</text>
          <text x={size - 6} y={cy + 12} textAnchor="end" className="angle-degree">{fmtLon(angles.dsc)}</text>
          <text x={cx} y={12} textAnchor="middle" className="angle-label">MC</text>
          <text x={cx} y={26} textAnchor="middle" className="angle-degree">{fmtLon(angles.mc)}</text>
          <text x={cx} y={size - 16} textAnchor="middle" className="angle-degree">{fmtLon(angles.ic)}</text>
          <text x={cx} y={size - 2} textAnchor="middle" className="angle-label">IC</text>
        </>
      )}

      {detailed && (
        <>
          <text x={cx - rOuter - 4} y={cy - 4} textAnchor="end" className="angle-label-lg">ASC</text>
          <text x={cx - rOuter - 4} y={cy + 14} textAnchor="end" className="angle-degree-lg">{fmtLon(angles.asc)}</text>
          <text x={cx + rOuter + 4} y={cy - 4} className="angle-label-lg">DSC</text>
          <text x={cx + rOuter + 4} y={cy + 14} className="angle-degree-lg">{fmtLon(angles.dsc)}</text>
          <text x={cx} y={cy - rOuter - 14} textAnchor="middle" className="angle-label-lg">MC</text>
          <text x={cx} y={cy - rOuter - 2} textAnchor="middle" className="angle-degree-lg">{fmtLon(angles.mc)}</text>
          <text x={cx} y={cy + rOuter + 14} textAnchor="middle" className="angle-label-lg">IC</text>
          <text x={cx} y={cy + rOuter + 26} textAnchor="middle" className="angle-degree-lg">{fmtLon(angles.ic)}</text>
        </>
      )}

      {detailed &&
        filteredAspects.map((a, i) => {
          const posA = svgPos(a.lonA, angles.asc, rAspectRing, cx, cy);
          const posB = svgPos(a.lonB, angles.asc, rAspectRing, cx, cy);
          const opacity = 0.35 + (1 - a.orb / 8) * 0.45;
          return (
            <line
              key={`asp-${i}`}
              x1={posA.x}
              y1={posA.y}
              x2={posB.x}
              y2={posB.y}
              stroke={a.color}
              strokeWidth={1}
              opacity={opacity}
            />
          );
        })}

      {/* Connector from the true zodiac position to the (possibly spread)
          glyph, plus a tick on the zodiac band marking the exact longitude. */}
      {detailed &&
        planets.map((p) => {
          const truePos = svgPos(p.lon, angles.asc, rZodiacInner, cx, cy);
          const glyphPos = svgPos(lonFor(p), angles.asc, rPlanets, cx, cy);
          const tickPos = svgPos(p.lon, angles.asc, rZodiacInner - 2, cx, cy);
          const tipPos = svgPos(p.lon, angles.asc, rZodiacInner - 8, cx, cy);
          return (
            <g key={`mark-${p.name}`}>
              <line
                x1={truePos.x}
                y1={truePos.y}
                x2={glyphPos.x}
                y2={glyphPos.y}
                stroke={PLANET_COLORS[p.name]}
                strokeWidth={0.6}
                opacity={0.4}
              />
              <line
                x1={tickPos.x}
                y1={tickPos.y}
                x2={tipPos.x}
                y2={tipPos.y}
                stroke={PLANET_COLORS[p.name]}
                strokeWidth={1.5}
              />
            </g>
          );
        })}

      {planets.map((p) => {
        const pos = svgPos(lonFor(p), angles.asc, rPlanets, cx, cy);
        const r = detailed ? 11 : 9;
        return (
          <g key={p.name}>
            <circle
              cx={pos.x}
              cy={pos.y}
              r={r}
              className="planet-disc-fill"
              stroke={PLANET_COLORS[p.name]}
              strokeWidth={1.3}
            />
            {detailed ? (
              <PlanetGlyph
                planet={p.name}
                x={pos.x}
                y={pos.y}
                size={16}
                color={PLANET_COLORS[p.name]}
              />
            ) : (
              <text
                x={pos.x}
                y={pos.y + 3}
                textAnchor="middle"
                className="planet-glyph"
                style={{ fill: PLANET_COLORS[p.name] }}
              >
                {PLANET_CODES[p.name]}
              </text>
            )}
          </g>
        );
      })}

      {/* Degree · sign · minute readout, stacked just inside each glyph. */}
      {showReadouts &&
        planets.map((p) => {
          const pos = svgPos(lonFor(p), angles.asc, rReadout, cx, cy);
          const lonDeg = (((p.lon * 180) / Math.PI) % 360 + 360) % 360;
          const signIdx = Math.floor(lonDeg / 30);
          const inSign = lonDeg % 30;
          const deg = Math.floor(inSign);
          const min = Math.floor((inSign - deg) * 60);
          return (
            <g key={`rdo-${p.name}`} className="planet-readout">
              <text
                x={pos.x}
                y={pos.y - 11}
                textAnchor="middle"
                className="readout-deg"
              >
                {deg}°
              </text>
              <ZodiacGlyph sign={signIdx} x={pos.x} y={pos.y + 2} size={14} />
              <text
                x={pos.x}
                y={pos.y + 21}
                textAnchor="middle"
                className="readout-min"
              >
                {String(min).padStart(2, '0')}&#39;
              </text>
            </g>
          );
        })}
    </svg>
  );
}
