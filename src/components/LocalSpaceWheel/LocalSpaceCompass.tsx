// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useSyncExternalStore } from 'react';
import './LocalSpaceWheel.css';
import {
  WheelTip,
  relaxRing,
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
import { fmtDM, type Store } from './LocalSpaceWheel';

const DEG2RAD = Math.PI / 180;
const CARDINALS: { az: number; letter: string }[] = [
  { az: 0, letter: 'N' },
  { az: 90, letter: 'E' },
  { az: 180, letter: 'S' },
  { az: 270, letter: 'W' },
];
const TICKS = Array.from({ length: 24 }, (_, i) => i); // notches every 15°
// Azimuth degree labels on the 30° marks (cardinals show N/E/S/W in their place).
const DEG_MARKS = [30, 60, 120, 150, 210, 240, 300, 330];

interface LocalSpaceCompassProps {
  size: number;
  /** Bodies to plot (order + names; positions come from `coords`). */
  planets: EclipticPosition[];
  /** Per-body azimuth/altitude in degrees; az clockwise from north. */
  coords: ReadonlyMap<PlanetName, { az: number; alt: number }>;
  /** Azimuth aspects, drawn as chords inside the inner circle. */
  aspects?: Aspect[];
  visibleAspects?: Set<AspectCategory>;
  /** Shared hovered-body store — hovering a glyph lights the same body's tip on the
   *  sibling compass too (same store the 3D globe uses). */
  hoverStore: Store<PlanetName | null>;
}

// The 2D (default) local-space dial: a flat compass. Planets ride an outer donut by
// their compass bearing (azimuth), like the bodies on the main chart wheel; the
// aspect web (trine/sextile/square/opposition/…) is drawn inside a smaller inner
// circle, so the two never overlap. Altitude isn't a radial axis here — it shows in
// the hover tip and as the below-horizon dotted/dimmed mark. The 3D globe
// (LocalSpaceWheel) is the toggle-on alternative; both share the hover store.
export function LocalSpaceCompass({
  size,
  planets,
  coords,
  aspects,
  visibleAspects,
  hoverStore,
}: LocalSpaceCompassProps) {
  const { t, labels } = useT();
  const hovered = useSyncExternalStore(hoverStore.subscribe, hoverStore.get);

  // Fixed-pixel metrics scale with the dial so the paired ~half-width compasses read
  // like a full one (matches the globe's scaling).
  const k = Math.max(0.62, Math.min(1.55, size / 300));
  const c = size / 2;
  const R = size / 2 - 18 * k; // tick ring; cardinals sit outside it
  const rPlanets = R - 15 * k; // glyph ring, pulled in so the discs (r≈11k) clear the rim
  const rAz = rPlanets - 25 * k; // degrees line — clear of the glyph (minutes step further in)
  // Inner aspect circle — fixed off the rim (R), NOT tied to the glyph/readout rings, so
  // pulling those inward doesn't cost the aspect web any circumference (it has room to spare).
  const rInner = (R - 47 * k) * 0.75;
  // az clockwise from north, north up: x grows with sin, y shrinks with cos.
  const azPos = (azDeg: number, r: number) => ({
    x: c + r * Math.sin(azDeg * DEG2RAD),
    y: c - r * Math.cos(azDeg * DEG2RAD),
  });

  const shown = planets.filter((p) => coords.has(p.name));
  // Spread colliding glyphs along the donut (same target as the zodiac wheel); a
  // faint spoke ties each glyph to the rim scale and its inner aspect endpoint.
  const arr = shown.map((p) => ({ name: p.name, off: coords.get(p.name)!.az }));
  arr.sort((a, b) => a.off - b.off);
  const sep = Math.min(
    20,
    Math.max(4, (16 * 360) / (2 * Math.PI * Math.max(rPlanets, 1))),
  );
  relaxRing(arr, sep);
  const displayAz = new Map(arr.map((e) => [e.name, e.off]));

  // Chords attach at each body's display azimuth on the inner circle, so they stay
  // within it while the glyphs sit out in the donut. Skip conjunctions (coincident).
  const chords = (aspects ?? []).filter(
    (a) =>
      a.type !== 'conjunction' &&
      (visibleAspects?.has(a.category) ?? true) &&
      displayAz.has(a.a as PlanetName) &&
      displayAz.has(a.b as PlanetName),
  );

  // Tip follows the SHARED hovered body (lights the same body on the sibling dial).
  const hoveredCd = hovered ? coords.get(hovered) : undefined;
  const tip: HoverTip | null =
    hoveredCd && displayAz.has(hovered!)
      ? (() => {
          const pos = azPos(displayAz.get(hovered!)!, rPlanets);
          return {
            x: pos.x,
            y: pos.y,
            r: 11 * k,
            title: labels.planet(hovered!),
            sub: (
              <>
                {t('expandedSidebar.localSpace.azTip', { az: fmtDM(hoveredCd.az) })}
                <br />
                {t('expandedSidebar.localSpace.altTip', { alt: fmtDM(hoveredCd.alt, true) })}
              </>
            ),
            color: PLANET_COLORS[hovered!],
            marker: <PlanetGlyph planet={hovered!} size={14} color={PLANET_COLORS[hovered!]} />,
          };
        })()
      : null;

  const svg = (
    <svg
      // wheel-svg + interactive borrow the zodiac wheel's planet-mark styling (disc
      // fill, hit target, hover lift) so the marks match exactly.
      className="local-space-compass wheel-svg interactive"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      <circle cx={c} cy={c} r={R} className="lsc-ring" />
      {/* Inner circle: the boundary the aspect web stays within. */}
      <circle cx={c} cy={c} r={rInner} className="lsc-inner" />
      {TICKS.map((i) => {
        const az = i * 15;
        const card = i % 6 === 0;
        const half = i % 2 === 0;
        const r1 = card ? (R * 38) / 45 : half ? (R * 41) / 45 : (R * 43) / 45;
        const p1 = azPos(az, r1);
        const p2 = azPos(az, R);
        return (
          <line
            key={i}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            className={card ? 'lsc-tick-major' : 'lsc-tick'}
          />
        );
      })}

      {CARDINALS.map(({ az, letter }) => {
        const pos = azPos(az, R + 11 * k);
        return (
          <text
            key={letter}
            x={pos.x}
            y={pos.y}
            className="lsc-card"
            style={{ fontSize: 13 * k }}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {letter}
          </text>
        );
      })}
      {DEG_MARKS.map((az) => {
        const pos = azPos(az, R + 10 * k);
        return (
          <text
            key={az}
            x={pos.x}
            y={pos.y}
            className="lsc-deg"
            style={{ fontSize: 8.5 * k }}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {az}
          </text>
        );
      })}

      {/* Aspect web, inside the inner circle. */}
      {chords.map((a, i) => {
        const p1 = azPos(displayAz.get(a.a as PlanetName)!, rInner);
        const p2 = azPos(displayAz.get(a.b as PlanetName)!, rInner);
        return (
          <line
            key={`chord-${i}`}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={a.color}
            strokeWidth={k}
            opacity={0.7}
          />
        );
      })}

      {shown.map((p) => {
        const cd = coords.get(p.name)!;
        const below = cd.alt < 0;
        const da = displayAz.get(p.name)!;
        const pos = azPos(da, rPlanets);
        const azPosTxt = azPos(da, rAz);
        const spokeOut = azPos(da, R);
        const spokeIn = azPos(da, rInner);
        const r = 11 * k;
        // The azimuth readout in two parts stepping RADIALLY inward: degrees nearest
        // the glyph, arcminutes a line further toward the centre (following the
        // spoke), so it stays narrow rather than sprawling across one long line.
        const azDM = fmtDM(cd.az);
        const azCut = azDM.indexOf('°') + 1;
        const azMinPos = azPos(da, rAz - 16 * k - 2);
        return (
          <g
            key={p.name}
            className="planet-mark"
            opacity={below ? 0.72 : 1}
            onMouseEnter={() => hoverStore.set(p.name)}
            onMouseLeave={() => {
              if (hoverStore.get() === p.name) hoverStore.set(null);
            }}
            aria-label={labels.planet(p.name)}
          >
            {/* Faint spoke: rim (azimuth scale) → glyph → inner-circle aspect end. */}
            <line
              x1={spokeIn.x}
              y1={spokeIn.y}
              x2={spokeOut.x}
              y2={spokeOut.y}
              stroke={PLANET_COLORS[p.name]}
              strokeWidth={0.6 * k}
              opacity={0.35}
            />
            <circle cx={pos.x} cy={pos.y} r={r + 6 * k} className="planet-hit" />
            <g className="planet-mark-visual">
              <circle
                cx={pos.x}
                cy={pos.y}
                r={r}
                className="planet-disc-fill"
                stroke={PLANET_COLORS[p.name]}
                strokeWidth={1.3 * k}
                strokeDasharray={below ? '2 1.5' : undefined}
              />
              <PlanetGlyph
                planet={p.name}
                x={pos.x}
                y={pos.y}
                size={16 * k}
                color={PLANET_COLORS[p.name]}
              />
            </g>
            {/* The body's azimuth — degrees nearest the glyph, arcminutes stepped a
                line further toward the centre along the spoke, echoing the degree
                readouts on the main chart wheel. */}
            <text
              x={azPosTxt.x}
              y={azPosTxt.y}
              className="lsc-az"
              style={{ fontSize: 9.75 * k, strokeWidth: 2.8 * k }}
              fill={PLANET_COLORS[p.name]}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {azDM.slice(0, azCut)}
            </text>
            <text
              x={azMinPos.x}
              y={azMinPos.y}
              className="lsc-az"
              style={{ fontSize: 7.5 * k, strokeWidth: 2.2 * k }}
              fill={PLANET_COLORS[p.name]}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {azDM.slice(azCut)}
            </text>
          </g>
        );
      })}
    </svg>
  );

  return (
    <div className="wheel-svg-wrap">
      {svg}
      {tip && <WheelTip tip={tip} size={size} />}
    </div>
  );
}
