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
  /** Advanced mode reveals the per-planet degree·sign·minute readout ring. */
  advanced?: boolean;
  visibleAspects?: Set<AspectCategory>;
}

export function WheelSvg({
  size,
  angles,
  planets,
  detailed,
  advanced = false,
  visibleAspects,
}: WheelSvgProps) {
  const cx = size / 2;
  const cy = size / 2;
  // The expanded wheel draws everything inside the outer ring (no exterior
  // angle callouts), so it only needs a small breathing margin like the mini.
  const rOuter = size / 2 - (detailed ? 14 : 4);
  const rZodiacInner = rOuter - (detailed ? 34 : 0);
  // Planet glyph ring, then a readout ring (degree · sign · minute) just
  // inside it — mirroring a printed natal chart.
  const rPlanets = (detailed ? rZodiacInner - 20 : rOuter - 26);
  // Gap from the planet glyphs to the readout trio (the 34px base widened by
  // ~15% to give the degree value more breathing room from the planet circle).
  const rReadout = detailed ? rPlanets - 39 : 0;
  // The degree·sign·minute readout ring only appears in Advanced mode.
  const showReadouts = detailed && advanced && rReadout > 30;
  // Dedicated house ring: a band just inside the planet glyphs — or inside the
  // readout ring when Advanced is on — holding the cusp spokes and house
  // numbers so nothing else overlaps them. Its two borders (houseRingOuter and
  // houseRingInner) ARE the band edges, replacing the old thin double border.
  const houseRingOuter = detailed
    ? (showReadouts ? rReadout - 28 : rPlanets - 22)
    : 0;
  const houseBand = detailed ? Math.min(24, Math.max(0, houseRingOuter - 12)) : 0;
  const houseRingInner = houseRingOuter - houseBand;
  const rAspectRing = detailed ? houseRingInner : rPlanets - 22;
  const rInner = detailed ? houseRingInner : rPlanets - 22;

  // The wheel is rotated so the ASC sits at due-left, which makes the ASC–DSC
  // axis a true horizontal diameter. The MC is NOT at due-top, though (that
  // only holds when asc − mc = 90°), so the detailed MC–IC axis is drawn at the
  // MC's real longitude via svgPos — keeping the cusp-10/cusp-4 separators
  // aligned with the house numbers.
  const mcOuter = svgPos(angles.mc, angles.asc, rOuter, cx, cy);
  const icOuter = svgPos(angles.ic, angles.asc, rOuter, cx, cy);

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
    // Min angular separation that yields ~16px of arc. When the Advanced
    // readouts are shown the trio fans inward to rReadout − 16, so we base the
    // separation on that innermost (minutes) ring — the tightest arc — so
    // neighbouring readouts clear there too.
    const sepRadius = showReadouts
      ? Math.max(rReadout - 16, 1)
      : Math.max(rReadout, 1);
    const sep = Math.min(20, Math.max(4, (16 * 360) / (2 * Math.PI * sepRadius)));
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

      {/* Concentric ring boundaries. In detailed mode the inner two circles
          bound the dedicated house ring band. */}
      <circle cx={cx} cy={cy} r={rOuter} className="ring" />
      {detailed && <circle cx={cx} cy={cy} r={rZodiacInner} className="ring" />}
      {detailed && houseBand > 0 && (
        <circle cx={cx} cy={cy} r={houseRingOuter} className="ring" />
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

      {/* Degree scale (Advanced only): 1° graduation ticks on the inner edge
          of the zodiac band, longer at 5° and 10°. Resets each sign (0–30°),
          so any planet or angle can be read to the degree without callouts. */}
      {detailed &&
        advanced &&
        Array.from({ length: 360 }).map((_, d) => {
          const lon = (d * Math.PI) / 180;
          const len = d % 10 === 0 ? 8 : d % 5 === 0 ? 5 : 2.5;
          const o = svgPos(lon, angles.asc, rZodiacInner, cx, cy);
          const i = svgPos(lon, angles.asc, rZodiacInner - len, cx, cy);
          const cls =
            d % 10 === 0
              ? 'deg-tick deg-tick-10'
              : d % 5 === 0
                ? 'deg-tick deg-tick-5'
                : 'deg-tick';
          return (
            <line key={`deg-${d}`} x1={o.x} y1={o.y} x2={i.x} y2={i.y} className={cls} />
          );
        })}

      {/* Placidus house cusps. The four angle cusps (1/4/7/10) are the bold
          ASC–DSC / MC–IC diameters drawn below, so here we draw only the eight
          intermediate cusp spokes plus all twelve house numbers. */}
      {detailed && houseBand > 0 &&
        [1, 2, 4, 5, 7, 8, 10, 11].map((idx) => {
          const lon = angles.cusps[idx];
          if (!Number.isFinite(lon)) return null;
          const inner = svgPos(lon, angles.asc, houseRingInner, cx, cy);
          const outer = svgPos(lon, angles.asc, houseRingOuter, cx, cy);
          return (
            <line
              key={`cusp-${idx}`}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              className="house-cusp"
            />
          );
        })}

      {detailed && houseBand > 0 &&
        angles.cusps.map((lon, idx) => {
          const next = angles.cusps[(idx + 1) % 12];
          if (!Number.isFinite(lon) || !Number.isFinite(next)) return null;
          // Bisector of the house (cusp idx → next cusp), centered in the
          // dedicated house ring band.
          const span = (((next - lon) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          const mid = lon + span / 2;
          const pos = svgPos(mid, angles.asc, (houseRingInner + houseRingOuter) / 2, cx, cy);
          return (
            <text
              key={`house-${idx}`}
              x={pos.x}
              y={pos.y + 3}
              textAnchor="middle"
              className="house-number"
            >
              {idx + 1}
            </text>
          );
        })}

      <line
        x1={cx - rOuter}
        y1={cy}
        x2={cx + rOuter}
        y2={cy}
        className="angle asc-dsc"
      />
      {detailed ? (
        <line
          x1={mcOuter.x}
          y1={mcOuter.y}
          x2={icOuter.x}
          y2={icOuter.y}
          className="angle mc-ic"
        />
      ) : (
        <line
          x1={cx}
          y1={cy - rOuter}
          x2={cx}
          y2={cy + rOuter}
          className="angle mc-ic"
        />
      )}

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

      {/* The expanded wheel intentionally omits the ASC/MC/DSC/IC degree
          callouts — those positions are listed in the sidebar. Advanced mode
          instead shows a degree scale on the rim (drawn with the zodiac band
          above) so any planet/angle position is readable in place. */}

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

      {/* Degree · sign · minute readout. Each value gets its own radial slot
          (degree nearest the glyph, then sign, then minutes), so the trio
          fans out along the spoke — laying out horizontally on the sides and
          vertically at the top/bottom instead of always stacking vertically.
          This mirrors how a natal wheel arranges each planet's position and
          keeps neighbouring readouts from overlapping. */}
      {showReadouts &&
        planets.map((p) => {
          const degPos = svgPos(lonFor(p), angles.asc, rReadout + 16, cx, cy);
          const signPos = svgPos(lonFor(p), angles.asc, rReadout, cx, cy);
          const minPos = svgPos(lonFor(p), angles.asc, rReadout - 16, cx, cy);
          const lonDeg = (((p.lon * 180) / Math.PI) % 360 + 360) % 360;
          const signIdx = Math.floor(lonDeg / 30);
          const inSign = lonDeg % 30;
          const deg = Math.floor(inSign);
          const min = Math.floor((inSign - deg) * 60);
          return (
            <g key={`rdo-${p.name}`} className="planet-readout">
              <text
                x={degPos.x}
                y={degPos.y + 3}
                textAnchor="middle"
                className="readout-deg"
              >
                {deg}°
              </text>
              <ZodiacGlyph sign={signIdx} x={signPos.x} y={signPos.y} size={14} />
              <text
                x={minPos.x}
                y={minPos.y + 3}
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
